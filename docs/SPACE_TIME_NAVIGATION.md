# 时空图论导航与协同避让设计

> 在不考虑物理传感器、仅基于图论（Graph-based）和预设轨迹点的游戏化模拟中，实现车辆与机器人的协同导航与避让。

**核心思路**：将空间轨迹点转化为**时间维度的资源预定**。

---

## 1. 统一路网图建模 (Unified Graph Modeling)

将停车场所有关键点抽象为一个带权图。

### 1.1 节点 (Nodes)

| 类型 | 标签 | 说明 | 当前实现 |
|------|------|------|----------|
| 入口 | `Type: Entrance` | 停车场入口 | `keypoint_graph.js` KP.ENTRANCE |
| 出口 | `Type: Exit` | 停车场出口 | KP.EXIT |
| 道路转向点 | `Type: Road` | 车道中心线转向点 | KP.TURN_*_ENTRY/EXIT |
| 车位中心 | `Type: Parking` | 车辆停放目标 | `parking_map.js` center |
| 充电点 | `Type: Charging` | 机器人充电/服务点 | `topology.js` charge_1..44 |

### 1.2 边 (Edges)

| 边类型 | 可用主体 | 说明 | 当前实现 |
|--------|----------|------|----------|
| **道路中心边** | 车辆 | 车道，单行 | |
| **道路两侧边** | 机器人 | 车道两侧，双行 |  |

### 1.3 权重 (Weight)

- 通常为两点间欧氏距离
- 可附加：转向惩罚 (TURN_PENALTY)、等待惩罚 (时间成本)

---

## 2. 时空 A* (Space-Time A*)

在普通 A* 基础上增加**时间轴 T**。

### 2.1 状态表示

```
状态: (node_id, t) 或 (x, z, t)
```

- 位置不再只是 (x, z)，而是 (x, z, t)
- 同一空间点在不同时刻视为不同状态

### 2.2 预定表 (Reservation Table)

```
ReservationTable: Map<node_id | edge_id, Set<[t_start, t_end]>>
```

- 车辆/机器人规划路径时，向系统**预定**途经节点和边的时段
- 若 t 时刻某节点已被预定，则 A* 可扩展：
  - **等待**：在该点停留，t+1 再尝试
  - **绕行**：选择其他邻居节点

### 2.3 冲突定义

- **顶点冲突**：两物体在相同时刻 t 占据同一节点
- **边冲突**：两物体在 t→t+1 期间交换位置（对向穿过同一条边）

---

## 3. 互相避让机制

### 3.1 方案 A：冲突搜索 (CBS) —— 最优解

| 步骤 | 说明 |
|------|------|
| 独立规划 | 每辆车/机器人各自用 A* 算出最短路径 |
| 冲突检测 | 检查同一 t 是否有多物体占同节点，或对向穿过同边 |
| 添加约束 | 优先级低的一方在该 (node, t) 或 (edge, t) 上添加禁止约束 |
| 重新规划 | 受约束方重新 A*，直到无冲突 |

- **优点**：解最优、可证明完备
- **缺点**：计算量大，agent 数量多时扩展困难

### 3.2 方案 B：优先级 + 路径锁定 —— 推荐（性能优先）

| 规则 | 说明 |
|------|------|
| **优先级** | 车辆（大、惯性大）> 机器人（小、灵活） |
| **路径锁定** | 车辆启动时，将轨迹途经的关键点及预计到达时间写入全局预定表 |
| **机器人适配** | 机器人规划/移动时轮询车辆预定路径，若未来 3 秒内有重叠 → 原地等待或寻找临时避让点 |

**与当前实现的映射**：
- `traffic_coordinator.js` 车辆间跟车距离、入口/出口让行
- `reservation_table.js` 车辆路径写入预定表 (`reservePath`)，机器人查询 `isPathBlockedByVehicles`、`isAvailableAt`
- `topology.js` 提供 `findPathTopoST` 时空 A*，规划时避开车辆预定；无解时回退 `findPathTopo`

---

## 4. 关键点逻辑实现建议

| 场景 | 处理方法 |
|------|----------|
| **车位转向点** | 设为互斥区域，同一时间只允许一个物体占用 |
| **机器人充电** | 机器人在充电点时，该 charge 节点状态变为 `Blocked`，车辆路径规划绕开该车位 |
| **动态窄路** | 道路宽度不足以并行时，该边按「单行道」逻辑，先进入者获得通行权 |
| **冲突段 (x=20, z∈[-22.5,-6.5])** | 已移除：25-44 不再在冲突点停下，车辆直行 |

---

## 5. 状态机控制

为每个单位（车辆/机器人）维护状态机：

```
Planning (规划中)
    │ 计算路径并向系统申请时间片
    ▼
Moving (移动中)
    │ 按 t 序列平滑移动坐标
    ▼
Waiting (等待中) ◄──────┐
    │ 发现前方节点被高优先级单位占用，原地暂停   │
    ▼                                           │
Re-routing (重新规划) ──────────────────────────┘
    目标点被永久占用（如车辆停入机器人充电位），重新寻找目标
```

**与当前实现**：
- 车辆：`phase: 'entering' | 'parked' | 'leaving' | 'gone'`
- 机器人：`state: 'idle' | 'moving' | 'charging'` 等
- 可扩展 `Waiting`、`Re-routing` 状态

---

## 6. 实现路线图

### 阶段 1：预定表基础 (低风险) ✅
- [x] 新增 `reservation_table.js`：`reserve`、`reservePath`、`isAvailable`、`isAvailableAt`、`releaseAgent`、`willBeOccupiedByVehicle`
- [x] 车辆进入/离开时，将路径与预估时间写入预定表 (`reservePath`)

### 阶段 2：机器人避让 (中风险) ✅
- [x] 机器人路径规划时查询预定表 (`isPathBlockedByVehicles`)
- [x] 若路径与车辆预定重叠，机器人原地等待 500ms 后重试

### 阶段 3：时空 A* (高风险) ✅
- [x] `topology.js` 新增 `findPathTopoST(startSpotIndex, endSpotIndex, t0, speed)`，查询预定表避开车辆
- [x] 状态 `(nodeId, t)`，扩展时可选择移动至邻居或等待 `(nodeId, t+0.5)`
- [x] 机器人 `chargeVehicle` / `returnHomeAndCharge` 优先使用 `findPathTopoST`，无解时回退 `findPathTopo`

### 阶段 4：CBS（可选）
- [ ] 仅在 agent 数量少（≤4）且需要最优解时考虑

---

## 7. 与现有模块的关系

```
main_sim.js (调度、动画)
    │
    ├── keypoint_graph.js     [车辆] 中心线路径
    ├── traffic_coordinator.js [车辆] 跟车、入口/出口让行
    ├── topology.js           [机器人] findPathTopo / findPathTopoST (时空 A*)
    ├── pathfinding.js        [机器人] 碰撞避让 (CollisionAvoidance)
    └── reservation_table.js   [共享] 时空预定、车辆 reservePath、机器人 isPathBlockedByVehicles / isAvailableAt
```

---

## 8. 参考

- Silver, D. "Cooperative Pathfinding" (2005)
- Sharon et al. "Conflict-Based Search For Optimal Multi-Agent Pathfinding" (2012)
- 现有：`NAVIGATION_ARCHITECTURE.md`、`KEYPOINT_GRAPH_NAVIGATION.md`
