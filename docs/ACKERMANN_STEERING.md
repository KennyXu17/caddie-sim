# 阿克曼转向（Ackermann Steering）实现指南

## 1. 阿克曼转向原理

阿克曼转向是一种车辆转向机构，其特点是：
- **前轮转向**：只有前轮可以转向
- **不同转向角**：内外轮转向角度不同，避免轮胎侧滑
- **转向半径限制**：受轴距（wheelbase）和最大转向角限制

### 基本公式

```
转向半径 R = wheelbase / tan(δ)
角速度 ω = (v * tan(δ)) / wheelbase
```

其中：
- `wheelbase`: 轴距（前后轮中心距离）
- `δ`: 前轮转向角（steering angle）
- `v`: 车辆速度
- `ω`: 角速度

## 2. 当前实现架构

### 2.1 参数定义

在 `src/main_sim.js` 中定义了车辆参数：

```javascript
const VEHICLE_WHEELBASE = 2.5; // 轴距 2.5 米
const VEHICLE_MAX_STEERING_ANGLE = Math.PI / 6; // 最大转向角 30 度
```

### 2.2 核心函数

#### 2.2.1 `generateAckermannWaypoints()`

生成中间路径点，使车辆能够平滑转弯：

```javascript
function generateAckermannWaypoints(a, b, currentHeading, targetHeading, speed) {
  // 1. 计算转向角度差
  const headingDiff = ((targetHeading - currentHeading + Math.PI) % (2 * Math.PI)) - Math.PI;
  
  // 2. 小角度转向（<5度）不需要中间点
  if (Math.abs(headingDiff) < 0.087) {
    return [a, b];
  }
  
  // 3. 计算转向半径
  const segLen = Math.hypot(b.x - a.x, b.z - a.z);
  const turnRadius = Math.abs(segLen / (2 * Math.sin(headingDiff / 2)));
  
  // 4. 计算所需转向角
  let steeringAngle = Math.atan2(VEHICLE_WHEELBASE, turnRadius);
  steeringAngle = Math.max(-VEHICLE_MAX_STEERING_ANGLE, 
                          Math.min(VEHICLE_MAX_STEERING_ANGLE, steeringAngle));
  
  // 5. 如果转向角达到最大值，需要生成更多中间点
  if (Math.abs(steeringAngle) >= VEHICLE_MAX_STEERING_ANGLE * 0.95) {
    // 生成中间路径点
    const numPoints = Math.max(2, Math.ceil(Math.abs(headingDiff) / (VEHICLE_MAX_STEERING_ANGLE * 2)));
    // ... 插值生成中间点
  }
  
  return waypoints;
}
```

#### 2.2.2 `appendVehicleEdgewiseMotion()`

应用阿克曼转向到车辆动画：

```javascript
function appendVehicleEdgewiseMotion(tl, car, path, speed, vehicleY, opts = {}) {
  // 1. 遍历路径段
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    const targetHeading = Math.atan2(b.x - a.x, b.z - a.z);
    
    if (useAckermann) {
      // 2. 生成阿克曼路径点
      const waypoints = generateAckermannWaypoints(a, b, currentHeading, targetHeading, speed);
      
      // 3. 对每个路径段应用转向
      for (let j = 0; j < waypoints.length - 1; j++) {
        // 计算转向角和角速度
        const headingChange = ((wpHeading - currentHeading + Math.PI) % (2 * Math.PI)) - Math.PI;
        const turnRadius = Math.abs(wpLen / (2 * Math.sin(headingChange / 2))) || Infinity;
        let steeringAngle = Math.atan2(VEHICLE_WHEELBASE, turnRadius);
        steeringAngle = Math.max(-VEHICLE_MAX_STEERING_ANGLE, 
                                Math.min(VEHICLE_MAX_STEERING_ANGLE, steeringAngle));
        const angularVel = (speed * Math.tan(steeringAngle)) / VEHICLE_WHEELBASE;
        
        // 4. 应用渐进的旋转动画
        tl.to(car.rotation, { 
          y: normalizedHeading, 
          duration: effectiveTurnDur, 
          ease: 'power1.inOut'
        });
        tl.to(car.position, { 
          x: wpB.x, z: wpB.z, y: vehicleY, 
          duration: wpDur, 
          ease: 'none' 
        }, '<'); // 同时进行
      }
    }
  }
}
```

#### 2.2.3 `appendVehicleReverseMotion()`

倒车时的阿克曼转向：

```javascript
function appendVehicleReverseMotion(tl, car, path, speed, vehicleY, opts = {}) {
  // 倒车时，转向方向相反
  const backDirection = Math.atan2(-dx, -dz);
  
  if (useAckermann && Math.abs(headingChange) > 0.087) {
    // 应用相同的阿克曼转向逻辑，但方向相反
    // ...
  }
}
```

## 3. 改进建议

### 3.1 更精确的路径生成

当前实现使用线性插值生成中间点。可以改进为使用圆弧插值：

```javascript
function generateArcWaypoints(a, b, currentHeading, targetHeading, turnRadius) {
  const waypoints = [a];
  
  // 计算圆弧中心点
  const centerX = a.x - turnRadius * Math.sin(currentHeading);
  const centerZ = a.z - turnRadius * Math.cos(currentHeading);
  
  // 计算起始和结束角度
  const startAngle = Math.atan2(a.z - centerZ, a.x - centerX);
  const endAngle = Math.atan2(b.z - centerZ, b.x - centerX);
  
  // 沿圆弧生成点
  const numPoints = Math.ceil(Math.abs(endAngle - startAngle) / 0.1);
  for (let i = 1; i < numPoints; i++) {
    const t = i / numPoints;
    const angle = startAngle + (endAngle - startAngle) * t;
    waypoints.push({
      x: centerX + turnRadius * Math.cos(angle),
      z: centerZ + turnRadius * Math.sin(angle)
    });
  }
  
  waypoints.push(b);
  return waypoints;
}
```

### 3.2 速度自适应

根据转向角度调整速度，使转向更平滑：

```javascript
function getSpeedForTurn(steeringAngle, maxSpeed) {
  // 转向角度越大，速度越慢
  const speedFactor = 1 - (Math.abs(steeringAngle) / VEHICLE_MAX_STEERING_ANGLE) * 0.5;
  return maxSpeed * Math.max(0.3, speedFactor);
}
```

### 3.3 使用 nav_system.js 中的 ackermannStep

`src/nav_system.js` 中已经有一个更完整的阿克曼转向实现：

```javascript
export function ackermannStep(agent, vx, vz, dt) {
  const speed = Math.hypot(vx, vz);
  const cosT = Math.cos(agent.theta);
  const sinT = Math.sin(agent.theta);
  const vForward = vx * sinT + vz * cosT;
  const vLateral = vx * cosT - vz * sinT;

  // 计算转向角
  let delta = Math.atan2(-vLateral * agent.wheelbase, Math.max(Math.abs(vForward), 0.1));
  delta = Math.max(-agent.maxSteeringAngle, Math.min(agent.maxSteeringAngle, delta));

  // 计算角速度
  const v = Math.min(agent.maxSpeed, Math.abs(speed)) * Math.sign(vForward);
  const omega = (v * Math.tan(delta)) / agent.wheelbase;

  // 更新位置和朝向
  agent.x += v * Math.sin(agent.theta) * dt;
  agent.z += v * Math.cos(agent.theta) * dt;
  agent.theta += omega * dt;
  
  return { v, delta, omega };
}
```

可以考虑在动画系统中使用这个函数来生成更准确的路径。

## 4. 使用示例

### 4.1 启用阿克曼转向（默认已启用）

```javascript
appendVehicleEdgewiseMotion(tl, car, path, VEHICLE_SPEED, VEHICLE_Y, {
  turnDur: 0.15,
  overlapTurn: true,
  useAckermann: true  // 默认已启用
});
```

### 4.2 禁用阿克曼转向（使用简单旋转）

```javascript
appendVehicleEdgewiseMotion(tl, car, path, VEHICLE_SPEED, VEHICLE_Y, {
  useAckermann: false  // 使用简单旋转
});
```

### 4.3 调整参数

```javascript
// 在文件顶部修改
const VEHICLE_WHEELBASE = 3.0; // 增加轴距，转向半径更大
const VEHICLE_MAX_STEERING_ANGLE = Math.PI / 4; // 45度，允许更急的转弯
```

## 5. 调试技巧

### 5.1 可视化转向路径

可以添加调试代码来可视化生成的路径点：

```javascript
function visualizeAckermannPath(waypoints) {
  waypoints.forEach((wp, i) => {
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 8, 8),
      new THREE.MeshBasicMaterial({ color: i === 0 ? 0x00ff00 : 0xff0000 })
    );
    marker.position.set(wp.x, 0.1, wp.z);
    scene.add(marker);
  });
}
```

### 5.2 打印转向信息

```javascript
console.log('Ackermann Steering:', {
  headingDiff: headingDiff * 180 / Math.PI,
  turnRadius,
  steeringAngle: steeringAngle * 180 / Math.PI,
  angularVel,
  numWaypoints: waypoints.length
});
```

## 6. 常见问题

### Q: 车辆转向不够平滑？
A: 增加中间路径点的数量，或减小 `turnDur` 参数。

### Q: 车辆转向半径太大？
A: 减小 `VEHICLE_WHEELBASE` 或增加 `VEHICLE_MAX_STEERING_ANGLE`。

### Q: 倒车时转向不正确？
A: 检查 `appendVehicleReverseMotion` 中的方向计算，确保使用反向方向。

## 7. 参考资料

- [Ackermann Steering Geometry - Wikipedia](https://en.wikipedia.org/wiki/Ackermann_steering_geometry)
- [Vehicle Kinematics - Robotics](https://www.cs.cmu.edu/~16311/current/assignments/proj1/kinematics.pdf)
