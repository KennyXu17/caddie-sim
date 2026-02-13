# YUKA 车辆路径跟随集成

使用 YUKA 的 Vehicle、FollowPathBehavior、OnPathBehavior 实现平滑的路径跟随。

## 实现概览

### 模块 `src/yuka_vehicle.js`

- **EntityManager**：统一管理所有 YUKA 车辆
- **createYukaPath(waypoints, vehicleY)**：将 `{x,z}` 航点转为 YUKA Path
- **createYukaVehicle(mesh, position, heading, opts)**：创建 Vehicle 并绑定 Three.js 模型
- **runYukaFollowPath(vehicle, path, onComplete, opts)**：使用 FollowPathBehavior + OnPathBehavior 沿路径行驶
- **updateYukaVehicles(delta)**：在每帧动画循环中调用，更新 YUKA 并同步到模型

### 使用 YUKA 的流程

- **进入路径（globalPath + localPath）**：全程由 YUKA 驱动
- **离开路径的 globalExit 段**：倒车仍用 GSAP，驶出车道段使用 YUKA

### 可配置参数 `YUKA_VEHICLE_CONFIG`

| 参数 | 默认值 | 含义 |
|------|--------|------|
| maxSpeed | 5 | 最大速度 (m/s) |
| maxForce | 150 | 最大转向力（对应 `vehicle.maxForce`） |
| nextWaypointDistance | 3.5 | 航点切换距离（类似 look-ahead） |
| pathRadius | 1.5 | OnPathBehavior 的路径容差 |
| pathTolerance | 0.5 | 路径容差 |

在控制台中可通过 `YUKA_VEHICLE_CONFIG` 调整。
