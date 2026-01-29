# 订单系统和路径规划集成指南

## 概述
本指南说明如何将订单系统、路径规划和碰撞避免集成到主模拟文件中。

## 已创建的文件

1. **`src/pathfinding.js`** - 路径规划和碰撞避免系统
2. **`src/orderSystem.js`** - 订单管理系统

## 集成步骤

### 1. 在主文件顶部添加导入

在 `main_sim.js` 文件的开头（在现有导入之后）添加：

```javascript
import { pathfinder, collisionAvoidance, isDrivable } from './pathfinding.js';
import { OrderManager, PARKING_SPOTS } from './orderSystem.js';
```

### 2. 更新停车位定义

替换现有的 `parkingSpots` 定义（约第735-753行）：

```javascript
// === Define 44 Parking Spots ===
const parkingSpots = PARKING_SPOTS; // 使用从 orderSystem.js 导入的44个停车位
```

### 3. 初始化订单管理器

在机器人位置定义之后（约第600行之后）添加：

```javascript
// === Initialize Order Manager ===
const robotInitialPositions = [
  { x: 11.20, y: 0.00, z: -10.31 },
  { x: 14.58, y: 0.00, z: -10.39 }
];
const orderManager = new OrderManager(robotInitialPositions);
```

### 4. 更新车辆生成函数

替换现有的 `createVehicleSequence` 函数，使用订单系统：

```javascript
// === Load Vehicles with Order System ===
function createVehicleSequence() {
  let vehicleCounter = 0;
  
  // 定期生成新订单和车辆
  function spawnVehicleFromOrder() {
    const order = orderManager.createOrder();
    if (!order) {
      // 如果没有可用停车位，稍后重试
      setTimeout(spawnVehicleFromOrder, 5000);
      return;
    }
    
    vehicleCounter++;
    const targetSpot = order.parkingSpot;
    
    loader.load(
      '/red_car.glb',
      (gltf) => {
        const car = gltf.scene.clone();
        car.scale.set(0.008, 0.008, 0.008);
        car.position.set(-30, 1, -15); // 入口位置
        car.rotation.y = Math.PI;
        car.traverse((obj) => {
          if (obj.isMesh) {
            obj.castShadow = true;
            obj.receiveShadow = true;
          }
        });
        scene.add(car);

        const vehicle = {
          model: car,
          position: targetSpot,
          id: vehicleCounter,
          orderId: order.id,
          needsCharging: true,
          status: 'entering'
        };
        vehicles.push(vehicle);
        orderManager.assignVehicle(order.id, vehicleCounter);

        // 使用路径规划生成路径
        const startPos = { x: -30, z: -15, y: 1 };
        const endPos = { x: targetSpot.x, z: targetSpot.z, y: targetSpot.y };
        
        // 获取占用位置（排除当前车辆）
        const occupiedPositions = collisionAvoidance.getOccupiedPositions(`vehicle_${vehicleCounter}`);
        const path = pathfinder.findPath(startPos, endPos, occupiedPositions);
        
        // 预留路径
        collisionAvoidance.reservePath(path, `vehicle_${vehicleCounter}`, 30000);
        
        // 沿路径移动车辆
        animateVehicleAlongPath(vehicle, path, () => {
          vehicle.status = 'parked';
          console.log(`🚗 Vehicle ${vehicleCounter} parked at spot ${targetSpot.index}`);
          assignRobotToVehicle(vehicle);
        });
      },
      undefined,
      (err) => console.error(`❌ Vehicle ${vehicleCounter} load error:`, err)
    );
  }
  
  // 每10-15秒生成一个新订单
  function scheduleNextOrder() {
    const delay = 10000 + Math.random() * 5000; // 10-15秒随机延迟
    setTimeout(() => {
      spawnVehicleFromOrder();
      scheduleNextOrder();
    }, delay);
  }
  
  // 启动订单生成
  scheduleNextOrder();
}
```

### 5. 添加路径动画函数

添加新的函数来沿路径动画车辆：

```javascript
// === Animate Vehicle Along Path ===
function animateVehicleAlongPath(vehicle, path, onComplete) {
  if (path.length < 2) {
    if (onComplete) onComplete();
    return;
  }
  
  const SPEED = 4.0; // 车辆速度
  const tl = gsap.timeline({ onComplete });
  
  for (let i = 1; i < path.length; i++) {
    const prev = path[i - 1];
    const curr = path[i];
    const distance = Math.sqrt(
      Math.pow(curr.x - prev.x, 2) + Math.pow(curr.z - prev.z, 2)
    );
    const duration = distance / SPEED;
    
    // 计算旋转角度
    const angle = Math.atan2(curr.x - prev.x, curr.z - prev.z);
    
    // 旋转
    if (i === 1) {
      tl.to(vehicle.model.rotation, { y: angle, duration: 0.8, ease: "power1.inOut" });
    } else {
      tl.to(vehicle.model.rotation, { y: angle, duration: 0.5, ease: "power1.inOut" }, "-=0.3");
    }
    
    // 移动
    tl.to(vehicle.model.position, {
      x: curr.x,
      z: curr.z,
      y: curr.y || 1,
      duration: duration,
      ease: "none"
    });
  }
  
  return tl;
}
```

### 6. 更新机器人充电函数以使用路径规划

修改 `chargeVehicle` 方法，使用路径规划：

```javascript
// 在 ChargingRobot 类的 chargeVehicle 方法中
chargeVehicle(vehicle, onComplete) {
  this.state = 'charging';
  this.targetVehicle = vehicle;
  const vehiclePos = vehicle.position;
  
  const currentPos = { 
    x: this.model.position.x, 
    z: this.model.position.z, 
    y: this.model.position.y 
  };
  
  // 使用路径规划找到到车辆的路径
  const occupiedPositions = collisionAvoidance.getOccupiedPositions(`robot_${this.id}`);
  const path = pathfinder.findPath(currentPos, vehiclePos, occupiedPositions);
  
  // 预留路径
  collisionAvoidance.reservePath(path, `robot_${this.id}`, 60000);
  
  // 沿路径移动到车辆位置
  // ... 然后执行充电逻辑
}
```

### 7. 更新车辆离开逻辑

在车辆离开时，使用路径规划：

```javascript
// 在车辆离开时
function vehicleLeave(vehicle) {
  const currentPos = { 
    x: vehicle.model.position.x, 
    z: vehicle.model.position.z, 
    y: vehicle.model.position.y 
  };
  const exitPos = { x: 30, z: -15, y: 1 }; // 出口位置
  
  const occupiedPositions = collisionAvoidance.getOccupiedPositions(`vehicle_${vehicle.id}`);
  const path = pathfinder.findPath(currentPos, exitPos, occupiedPositions);
  
  collisionAvoidance.reservePath(path, `vehicle_${vehicle.id}`, 30000);
  
  animateVehicleAlongPath(vehicle, path, () => {
    scene.remove(vehicle.model);
    const index = vehicles.indexOf(vehicle);
    if (index > -1) vehicles.splice(index, 1);
    
    // 完成订单
    if (vehicle.orderId) {
      orderManager.completeOrder(vehicle.orderId);
    }
    
    // 移除占用位置
    collisionAvoidance.removeOccupiedPosition(`vehicle_${vehicle.id}`);
  });
}
```

### 8. 实时碰撞检测

在动画循环中添加实时碰撞检测：

```javascript
// 在动画循环中（animate函数）
function animate() {
  requestAnimationFrame(animate);
  
  // 更新占用位置
  vehicles.forEach(vehicle => {
    collisionAvoidance.addOccupiedPosition(
      { x: vehicle.model.position.x, z: vehicle.model.position.z },
      `vehicle_${vehicle.id}`
    );
  });
  
  chargingRobots.forEach(robot => {
    collisionAvoidance.addOccupiedPosition(
      { x: robot.model.position.x, z: robot.model.position.z },
      `robot_${robot.id}`
    );
  });
  
  controls.update();
  renderer.render(scene, camera);
}
```

## 注意事项

1. **性能优化**: A*算法可能对大型网格较慢，考虑使用更大的网格大小（如1.0而不是0.5）
2. **路径平滑**: 生成的路径可能需要平滑处理，避免急转弯
3. **碰撞检测半径**: 根据实际模型大小调整碰撞检测半径
4. **路径预留时间**: 根据实际移动时间调整路径预留的持续时间

## 测试建议

1. 测试单个车辆和机器人的路径规划
2. 测试多个车辆同时移动时的碰撞避免
3. 测试订单系统的随机生成
4. 测试机器人初始位置的停车位占用
