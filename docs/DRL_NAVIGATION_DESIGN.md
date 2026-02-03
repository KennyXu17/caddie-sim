# DRL 自动导航与避障方案

## 一、当前碰撞问题的原因

现有逻辑：
- **小机器人**：使用 A* (`pathfinding.js`) + `collisionAvoidance.occupiedPositions` 做路径规划
- **车辆**：入停车场时用 GSAP 沿固定路径动画，**未参与** `occupiedPositions` 的避障规划
- **occupiedPositions**：在 `requestAnimationFrame` 里按当前位置更新，但车辆入场路径在生成时未考虑机器人

因此会出现：车辆沿预设路径行驶时与机器人发生重叠/碰撞。

---

## 二、两种解决思路

### 方案 A：传统规则强化（无需 DRL，见效快）

1. **车辆入场也参与避障**
   - 车辆入场前，用 A* 规划路径，并传入 `occupiedPositions`（含所有机器人和车辆）
   - 入场动画改为按 A* 路径逐段移动
2. **动态重规划**
   - 机器人在移动中若检测到新障碍（如新入场车辆），暂停并重新规划路径
3. **预留路径冲突检测**
   - 车辆入场前 `checkPathConflict`，若有冲突则等待或改路径

适合先快速减少碰撞，再考虑 DRL。

---

### 方案 B：DRL 自动导航与避障

用深度强化学习训练「感知-决策-控制」闭环，让机器人在复杂、动态场景下自主避障与导航。

---

## 三、DRL 架构设计

### 3.1 环境（Environment）

```
State  →  Policy Network  →  Action  →  Sim Step  →  Reward, Next State
```

| 组件 | 说明 |
|------|------|
| **State** | 机器人位置、目标位置、周围障碍（其他机器人、车辆）的相对位置或栅格 |
| **Action** | 离散：前进/后退/左转/右转/停止；或连续：`(v, ω)` |
| **Reward** | 到达目标 +、碰撞 -、接近障碍 -、时间惩罚 - |
| **Done** | 到达目标、碰撞、超时 |

### 3.2 State 设计示例

**方式 1：LiDAR 式（类似激光雷达）**
```js
// 以机器人为中心，N 个方向的最近障碍距离
state = [
  dist_0deg, dist_45deg, dist_90deg, ... dist_315deg,  // 8 或 16 维
  target_dx, target_dz,                                // 目标相对位置
  self_vx, self_vz                                    // 自身速度（可选）
]
```

**方式 2：局部栅格**
```js
// 以机器人为中心的 9×9 或 15×15 栅格，每格 0/1 表示是否被占
// + 目标所在格子的 one-hot 或相对坐标
```

**方式 3：实体列表**
```js
// 所有其他机器人/车辆的 (dx, dz, vx, vz) 相对位置与速度
// + 目标 (dx, dz)
```

### 3.3 Action 设计

**离散（便于训练）**
```js
actions = ['forward', 'backward', 'turn_left', 'turn_right', 'stop']
// 或 9 个：8 方向 + 停止
```

**连续**
```js
action = [linear_velocity, angular_velocity]  // 归一化到 [-1, 1]
```

### 3.4 Reward 设计

```python
reward = 0
reward += 10.0 if reached_goal else 0
reward -= 50.0 if collision else 0
reward -= 1.0 * min(distance_to_obstacle) if too_close else 0  # 接近惩罚
reward -= 0.01  # 时间惩罚，鼓励尽快到达
reward += 0.1 * (prev_dist - curr_dist)  # 向目标靠近的增量奖励
```

---

## 四、实现路线

### 4.1 训练环境

| 方式 | 优点 | 缺点 |
|------|------|------|
| **Python 自建仿真** | 训练快、易并行、生态成熟 | 需复刻物理与地图 |
| **与 Three.js 桥接** | 直接用现有场景 | 通信开销大、训练慢 |
| **MuJoCo / PyBullet** | 物理真实、标准接口 | 需建模场景 |

推荐：**先用 Python 建简化 2D 栅格环境**，验证算法后再考虑与 Three.js 对接或迁移到 3D 仿真。

### 4.2 算法选型

| 算法 | 适用 | 备注 |
|------|------|------|
| **PPO** | 离散/连续、稳定 | 首选 |
| **SAC** | 连续动作、样本效率好 | 适合精细速度控制 |
| **DQN** | 仅离散动作 | 实现简单 |

建议：**PPO**（Stable-Baselines3 等库已支持）。

### 4.3 训练 → 部署流程

```
[Python] 训练 PPO policy
    ↓
导出 ONNX 或 SavedModel
    ↓
[可选] 转 TensorFlow.js
    ↓
[main_sim.js] 每帧：取 state → policy(state) → 得到 action → 驱动机器人
```

---

## 五、集成到现有项目

### 5.1 新增 DRL 控制器

```js
// src/drl_controller.js
class DRLNavController {
  constructor(robotModel, policy) {
    this.robot = robotModel;
    this.policy = policy;  // TensorFlow.js 或 ONNX 推理
  }
  getState() {
    // 从 scene 收集：机器人位置、目标、其他实体
    return stateVector;
  }
  step() {
    const state = this.getState();
    const action = this.policy.predict(state);
    this.applyAction(action);
  }
}
```

### 5.2 与 ChargingRobot 结合

- 当前：`navigateTo` 用 A* + GSAP 沿路径移动  
- 改造：可选 `useDRL: true` 时，用 `DRLNavController.step()` 替代固定路径，每帧根据当前 state 决定动作。

### 5.3 数据流

```
每一帧 (requestAnimationFrame):
  1. 更新 vehicles / chargingRobots 的 position
  2. 对每个 useDRL 的 robot:
     - state = getState(robot, target, others)
     - action = policy(state)
     - 更新 robot 的 position / rotation
  3. 检测碰撞，更新 reward（训练时）或直接结束（部署时）
```

---

## 六、最小可行实现（MVP）

1. **Python 2D 栅格环境**
   - 使用 `gymnasium` 定义 env：`step`, `reset`, `render`
   - State：8 方向障碍距离 + 目标相对位置
   - Action：5 离散（前进/左/右/停）
   - Reward：到达 +10、碰撞 -50、时间 -0.01

2. **PPO 训练**
   - 使用 Stable-Baselines3
   - 多智能体：2 个机器人 + 若干随机移动障碍

3. **导出并接入 JS**
   - 导出 ONNX
   - 用 `onnxruntime-web` 在浏览器中推理
   - 在 `main_sim.js` 中替换或并联 A* 导航

---

## 七、参考资源

- [Stable-Baselines3 - PPO](https://stable-baselines3.readthedocs.io/en/master/modules/ppo.html)
- [ONNX Runtime Web](https://onnxruntime.ai/docs/tutorials/web/)
- [PyTorch → ONNX → TF.js](https://www.tensorflow.org/js/tutorials/conversion/import_onnx)

---

## 八、建议顺序

1. 先用 **方案 A** 修好车辆入场与 A* 的联动，减少当前碰撞  
2. 并行搭建 **Python DRL 2D 环境**，训练简单避障策略  
3. 验证 2D 策略后，再考虑与 Three.js 场景对接或 3D 扩展  
