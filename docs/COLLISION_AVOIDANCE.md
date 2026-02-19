# 机器人/车辆避让逻辑文档

> 本文档描述 Caddie 仿真中各类 agent（机器人、车辆）的避让机制、协同逻辑及实现位置。

---

## 1. 概述

| Agent 类型 | ID 前缀 | 优先级 | 主要场景 |
|-----------|---------|--------|----------|
| 机器人 | `robot_N` | ROBOT_CHARGING(3) / ROBOT_NAVIGATING(2) / ROBOT_RETURNING(1) | 充电任务、回充电站、回休息点 |
| 车辆 | `vehicle_N` | - | 驶入车位、驶出车位、冲突段通行 |

避让机制分为：
- **时空预定表 (Reservation Table)**：路径/点的时间占用预定，用于路径规划与冲突检测
- **Gate 等待**：运行时在关键点暂停时间线，轮询直到条件满足
- **交通协调**：跟车距离、冲突段、倒车安全区
- **物理检测**：实时位置半径检测（车辆/机器人在指定点附近）

---

## 2. 时空预定表 (`reservation_table.js`)

### 2.1 空间离散化

- **CELL_SIZE = 2m**：空间量化为 2m×2m 网格，`makeCellId(x,z)` 生成单元 ID
- 所有 agent 共享同一预定表，通过 `agentId` 区分

### 2.2 核心 API

| 函数 | 作用 |
|------|------|
| `reservePath(waypoints, startTime, speed, agentId, windowSec)` | 预定整条路径：按速度推算每点到达时间，每点预定 `[t-windowSec, t+windowSec]` |
| `reservePoint(x, z, tStart, tEnd, agentId)` | 预定单点时段 |
| `reserveResource(resourceId, tStart, tEnd, agentId)` | 预定资源（如 `res_mp_27`、`res_lane_*`、`res_exit_lane_corridor`） |
| `releaseAgent(agentId)` | 释放该 agent 的全部预定 |
| `isPathBlocked(waypoints, speed, startTime, excludeAgentId, onlyAgentPrefix)` | 检查路径是否与已有预定冲突 |
| `isAvailableAt(x, z, t, excludeAgentId)` | 某时刻某点是否可用 |
| `isAvailableInRange(x, z, tStart, tEnd, excludeAgentId)` | 某时段某点是否可用 |
| `isResourceAvailableInRange(resourceId, tStart, tEnd, excludeAgentId)` | 资源在时段内是否可用 |
| `willBeOccupiedByVehicleNear(x, z, tStart, tEnd, radiusCells, excludeAgentId)` | 某点邻域未来是否被车辆占用 |

### 2.3 资源 ID 约定

| 资源 | 说明 |
|------|------|
| `c_ix_iz` | 网格单元（2m 离散化） |
| `res_mp_i` | R:MPi 节点容量为 1，同一时刻仅允许一个 agent |
| `res_lane_x_z` | 车道段互斥 |
| `res_exit_lane_corridor` | 出口走廊 (x≈20.25, z∈[-22.5,-6.5]) 互斥 |

---

## 3. 机器人 vs 机器人

### 3.1 出发前：路径预定与阻塞检测

- **流程**：`tryStart()` 中调用 `isPathBlocked(densePath, SPEED, t0, agentId)` 检查整条路径
- **阻塞**：若路径与其它机器人预定冲突 → 每 250ms 重试；超过 `REPLAN_THRESHOLD_MS`(5s) 触发时空 A* 重新规划
- **通过**：`releaseAgent` → `reservePath` 预定自身路径，再启动时间线

### 3.2 运行时：Gate 等待

| Gate | 触发场景 | 检测方式 | 参数 |
|------|----------|----------|------|
| `addGateWaitUntilNextNodeClear` | 进入下一节点（R:MP/turn）前 | `isRobotAtPosition(toP, agentId, radius=1.0)` | pollMs=120 |
| `addGateWaitUntilSegmentClear` | 从 Cxx_0 进入下一节点前 | 整段采样点（步长 ~0.5–1m）检查 `isRobotAtPosition` | pollMs=120 |

- `isRobotAtPosition`：遍历 `chargingRobots`，排除自身，半径内存在其它机器人则返回 true
- 若构建时路径已清空，gate 仍会执行；若运行时清空则立即通过
- 超时 `GATE_TIMEOUT_MS`(15s) 后强制恢复

### 3.3 时空 A* (`findPathTopoST`)

- 规划时查询 `isAvailableAt`、`isResourceAvailableInRange(res_mp_i)`、`isSegmentFree`（边上采样）
- 支持“等待”动作：`(nodeId, t+ST_WAIT_STEP)` 作为扩展
- 规划结果在出发前通过 `isPathBlocked` 再次校验

---

## 4. 机器人 vs 车辆

### 4.1 机器人避让车辆

| 机制 | 说明 |
|------|------|
| **时空 A*** | 规划时 `isAvailableAt` 包含车辆预定，自动避开车辆占用时空 |
| **冲突点 Gate** | 进入 R:CF（车道穿越点）前：`addApproachCFWaitingRule` + `addGateWaitBeforeConflict` |
| `addGateWaitBeforeConflict` | 检查 `willBeOccupiedByVehicleNear`（3s 前瞻）及 `isVehicleNearPhysically`(1.8m) |
| `addApproachCFWaitingRule` | 按 CF 方向检查相关车道段（入口→CF、slot→CF 等）是否有车或车辆预定 |

### 4.2 车辆避让机器人

| 机制 | 说明 |
|------|------|
| **进车位前** | `waitUntilSlotApproachClear(slotIndex)`：检测点包括上游 R:MP、边上采样、C_next_0、C_next 等 |
| **倒车/出车位前** | `isRobotInReverseSafetyZone(chargingRobots, slotIndex)`：同行 R:MP 节点及边上 2.5m 内是否有机器人 |
| **路径阻塞** | 车辆 `isPathBlocked` 检查全量预定（含机器人），若冲突则 250ms 后重试 |

### 4.3 车位相关机器人检测点

- `getVehicleSlotApproachRobotPoints(slotIndex)`：上游 R:MP、本车位 R:MP、邻位 C_next_0、C_next 及边采样
- `getReverseSafetyZoneCheckPoints`：同行 R:MP 节点 + 边上 0.5m 步长采样

---

## 5. 车辆 vs 车辆

### 5.1 跟车距离 (`traffic_coordinator.js`)

| 函数 | 用途 |
|------|------|
| `isVehicleAheadTooClose(vehicles, vehicle, dirX, dirZ)` | 前方是否有车距离 < CAR_LENGTH(4.2m) + 1m |
| `isVehicleNearEntryTurn` | 进入时：目标车道入口附近是否有车 |
| `isVehicleAheadOnExitLane` | 驶出时：前方车道是否有车过近 |
| `isVehicleBehindOnLane` | 车道后方是否有车 |

### 5.2 冲突段 (`CONFLICT_SEGMENT`)

- 垂直路段：x≈20.25, z∈[-22.5,-6.5]
- `isVehicleOnConflictSegment`：该段是否有车
- 入口/出口逻辑中用于让行决策

### 5.3 出口走廊互斥

- `addGateWaitForExitCorridor`：车辆驶出时若路径经过 `res_exit_lane_corridor`，需先预定该资源
- 走廊内同一时刻只允许一辆车

### 5.4 进车位前车辆等待

- `tryStartEnter`：若 `isVehicleNearEntryTurn` 为真，每 300ms 重试
- `isPathBlocked`：若路径与其它车辆预定冲突，250ms 后重试

---

## 6. 倒车安全区 (`traffic_coordinator.js`)

车辆倒车驶入/驶出前需检查：

### 6.1 Reverse Safety Zone

| 检查 | 函数 | 检测范围 |
|------|------|----------|
| 车辆 | `isVehicleInReverseSafetyZone` | 车道节点 + 边上采样，半径 REVERSE_ZONE_RADIUS(2.5m) |
| 机器人 | `isRobotInReverseSafetyZone` | 同行 R:MP 节点 + 边上 0.5m 采样，半径 2.5m |

### 6.2 同行 R:MP 边方向

- Row 1/3：右→左（高→低 index）
- Row 2/4：左→右（低→高 index）
- 每个车位对应上游若干 R:MP 及边，形成安全区检测点

---

## 7. 资源与物理检测

### 7.1 互斥资源

| 资源 | 用途 |
|------|------|
| `res_mp_i` | 车位 i 对应 R:MPi，容量 1 |
| `res_lane_x_z` | 车道段互斥 |
| `res_exit_lane_corridor` | 出口走廊互斥 |

### 7.2 物理检测函数 (`main_sim.js`)

| 函数 | 检测对象 | 说明 |
|------|----------|------|
| `isRobotAtPosition(x, z, excludeAgentId, radius)` | 机器人 | 半径内是否有其它机器人 |
| `isOccupiedPhysically(x, z, excludeAgentId, radius)` | 车辆+机器人 | 点半径内是否有实体 |
| `isVehicleNearPhysically(x, z, radius)` | 车辆 | 点半径内是否有车辆 |

### 7.3 Gate 通用参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| GATE_TIMEOUT_MS | 15000 | Gate 超时后强制恢复 |
| pollMs | 120–200 | 轮询间隔 |
| holdSec | 0.8 | 资源/点可用性检查的前瞻窗口 |

---

## 8. 调用流程概览

### 8.1 机器人充电任务

1. `findPathTopoST` 规划路径（避开车/机器人预定）
2. `tryStart`：`isPathBlocked` → 若阻塞则 250ms 重试
3. 出发前：`reservePath`、`reservePoint`（充电位）、`reserveResource(res_mp_i)`
4. 时间线内：每段前 `addGateWaitUntilNextNodeClear` 或 `addGateWaitUntilSegmentClear`；冲突点前 `addApproachCFWaitingRule` + `addGateWaitBeforeConflict`
5. 到达 Cxx_0：`addGateWaitAtResourceAndPoint` 等待 `res_mp_i` 及物理点空闲
6. 完成后 `releaseAgent`

### 8.2 车辆进车位

1. `tryStartEnter`：`isVehicleNearEntryTurn` 通过后执行
2. `waitUntilSlotApproachClear`：上游机器人 graph 无机器人
3. `waitForResourceAndPoint`：`res_mp_i`、lane 资源可用且物理点空闲
4. `isPathBlocked` 通过后 `reservePath`，执行驶入
5. 到达后 `assignRobotToVehicle`

### 8.3 车辆出车位

1. `checkAndLeave`：`isVehicleInReverseSafetyZone`、`isRobotInReverseSafetyZone` 通过
2. `isPathBlocked` 通过后 `reservePath`，执行驶出
3. `addGateWaitAtResourceAndPoint` 等待 cp、lane 资源
4. 若路径经出口走廊，`addGateWaitForExitCorridor`
5. 驶离后 `releaseAgent`

---

## 9. 新增工具模块

| 文件 | 职责 |
|------|------|
| `geometry_utils.js` | `checkCapsuleCollision` 胶囊体碰撞检测，替代半径检测 |
| `mutex_resource.js` | 关键区域 Mutex 锁：`tryLockResource`、`releaseResource`、20 秒心跳自动清理 |
| `debug_collision.js` | 冲突诊断渲染：`?debug_collision=1` 启用 GATE_WAIT 连线、胶囊体边界、资源锁覆盖层 |

## 10. 相关文件

| 文件 | 职责 |
|------|------|
| `reservation_table.js` | 时空预定、阻塞检测、`getResourceOwner` |
| `main_sim.js` | Gate 函数（含 2s 轨迹预测）、物理检测、机器人/车辆调度 |
| `traffic_coordinator.js` | 跟车、冲突段、倒车扫掠矩形 `getReverseSweptRect`、`isRobotInReverseSafetyZone` |
| `topology.js` | `findPathTopoST` 时空 A*、图结构 |
| `vehicle_lane_graph.js` | 车辆车道图、reverse safety zone 节点 |

---

## 11. 参考

- [SPACE_TIME_NAVIGATION.md](./SPACE_TIME_NAVIGATION.md) - 时空图论导航设计
- [NAVIGATION_ARCHITECTURE.md](./NAVIGATION_ARCHITECTURE.md) - 导航架构
