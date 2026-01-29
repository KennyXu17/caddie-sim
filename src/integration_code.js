// === 集成代码片段 ===
// 这些代码片段需要添加到 main_sim.js 中

// ============================================
// 1. 在文件顶部添加导入（在其他导入之后）
// ============================================
/*
import { pathfinder, collisionAvoidance, isDrivable } from './pathfinding.js';
import { OrderManager, PARKING_SPOTS } from './orderSystem.js';
*/

// ============================================
// 2. 替换停车位定义（约第735行）
// ============================================
/*
// === Define 44 Parking Spots ===
const parkingSpots = PARKING_SPOTS; // 使用从 orderSystem.js 导入的44个停车位
const occupiedSpots = new Set(); // 保留用于兼容性
*/

// ============================================
// 3. 初始化订单管理器（在机器人位置定义之后）
// ============================================
/*
// === Initialize Order Manager ===
const robotInitialPositions = [
  { x: 11.20, y: 0.00, z: -10.31 },
  { x: 14.58, y: 0.00, z: -10.39 }
];
const orderManager = new OrderManager(robotInitialPositions);
*/

// ============================================
// 4. 路径动画函数（添加到全局函数区域）
// ============================================
/*
// === Animate Vehicle/Robot Along Path ===
function animateAlongPath(object, path, speed, onComplete) {
  if (!path || path.length < 2) {
    if (onComplete) onComplete();
    return gsap.timeline();
  }
  
  const tl = gsap.timeline({ onComplete });
  
  for (let i = 1; i < path.length; i++) {
    const prev = path[i - 1];
    const curr = path[i];
    const distance = Math.sqrt(
      Math.pow(curr.x - prev.x, 2) + Math.pow(curr.z - prev.z, 2)
    );
    const duration = distance / speed;
    
    // 计算旋转角度
    const angle = Math.atan2(curr.x - prev.x, curr.z - prev.z);
    
    // 旋转（只在路径开始时或方向改变时）
    if (i === 1) {
      tl.to(object.rotation, { y: angle, duration: 0.8, ease: "power1.inOut" });
    } else {
      const prevAngle = Math.atan2(prev.x - path[i-2].x, prev.z - path[i-2].z);
      if (Math.abs(angle - prevAngle) > 0.1) {
        tl.to(object.rotation, { y: angle, duration: 0.5, ease: "power1.inOut" }, "-=0.3");
      }
    }
    
    // 移动
    tl.to(object.position, {
      x: curr.x,
      z: curr.z,
      y: curr.y || object.position.y,
      duration: duration,
      ease: "none"
    });
  }
  
  return tl;
}
*/

// ============================================
// 5. 更新后的车辆生成函数
// ============================================
/*
// === Load Vehicles with Order System ===
function createVehicleSequence() {
  let vehicleCounter = 0;
  
  function spawnVehicleFromOrder() {
    const order = orderManager.createOrder();
    if (!order) {
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
        car.position.set(-30, 1, -15);
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

        // 使用路径规划
        const startPos = { x: -30, z: -15, y: 1 };
        const endPos = { x: targetSpot.x, z: targetSpot.z, y: targetSpot.y };
        const occupiedPositions = collisionAvoidance.getOccupiedPositions(`vehicle_${vehicleCounter}`);
        const path = pathfinder.findPath(startPos, endPos, occupiedPositions);
        
        if (path && path.length > 0) {
          collisionAvoidance.reservePath(path, `vehicle_${vehicleCounter}`, 30000);
          animateAlongPath(vehicle.model, path, 4.0, () => {
            vehicle.status = 'parked';
            console.log(`🚗 Vehicle ${vehicleCounter} parked at spot ${targetSpot.index}`);
            assignRobotToVehicle(vehicle);
          });
        }
      },
      undefined,
      (err) => console.error(`❌ Vehicle ${vehicleCounter} load error:`, err)
    );
  }
  
  function scheduleNextOrder() {
    const delay = 10000 + Math.random() * 5000;
    setTimeout(() => {
      spawnVehicleFromOrder();
      scheduleNextOrder();
    }, delay);
  }
  
  scheduleNextOrder();
}
*/

// ============================================
// 6. 车辆离开函数
// ============================================
/*
function vehicleLeave(vehicle) {
  const currentPos = { 
    x: vehicle.model.position.x, 
    z: vehicle.model.position.z, 
    y: vehicle.model.position.y 
  };
  const exitPos = { x: 30, z: -15, y: 1 };
  
  const occupiedPositions = collisionAvoidance.getOccupiedPositions(`vehicle_${vehicle.id}`);
  const path = pathfinder.findPath(currentPos, exitPos, occupiedPositions);
  
  if (path && path.length > 0) {
    collisionAvoidance.reservePath(path, `vehicle_${vehicle.id}`, 30000);
    animateAlongPath(vehicle.model, path, 4.0, () => {
      scene.remove(vehicle.model);
      const index = vehicles.indexOf(vehicle);
      if (index > -1) vehicles.splice(index, 1);
      
      if (vehicle.orderId) {
        orderManager.completeOrder(vehicle.orderId);
      }
      
      collisionAvoidance.removeOccupiedPosition(`vehicle_${vehicle.id}`);
    });
  }
}
*/

// ============================================
// 7. 更新机器人充电函数（在 ChargingRobot 类中）
// ============================================
/*
// 在 chargeVehicle 方法开始处添加：
chargeVehicle(vehicle, onComplete) {
  this.state = 'charging';
  this.targetVehicle = vehicle;
  const vehiclePos = vehicle.position;
  
  const currentPos = { 
    x: this.model.position.x, 
    z: this.model.position.z, 
    y: this.model.position.y 
  };
  
  // 确定转向点
  const isLeftSpot = vehiclePos.z < -8.8;
  const turnPointZ = isLeftSpot ? -8 : -4.6;
  const turnPoint = { x: currentPos.x, z: turnPointZ, y: 0 };
  const chargingPos = { x: vehiclePos.x, z: turnPointZ, y: 0 };
  
  // 使用路径规划（可选，如果当前路径逻辑工作良好可以保留）
  // const occupiedPositions = collisionAvoidance.getOccupiedPositions(`robot_${this.id}`);
  // const path = pathfinder.findPath(currentPos, chargingPos, occupiedPositions);
  // collisionAvoidance.reservePath(path, `robot_${this.id}`, 60000);
  
  // ... 继续现有的充电逻辑
}
*/

// ============================================
// 8. 更新动画循环（在 animate 函数中）
// ============================================
/*
function animate() {
  requestAnimationFrame(animate);
  
  // 更新碰撞避免系统的占用位置
  vehicles.forEach(vehicle => {
    if (vehicle.model && vehicle.model.position) {
      collisionAvoidance.addOccupiedPosition(
        { x: vehicle.model.position.x, z: vehicle.model.position.z },
        `vehicle_${vehicle.id}`
      );
    }
  });
  
  chargingRobots.forEach(robot => {
    if (robot.model && robot.model.position) {
      collisionAvoidance.addOccupiedPosition(
        { x: robot.model.position.x, z: robot.model.position.z },
        `robot_${robot.id}`
      );
    }
  });
  
  controls.update();
  renderer.render(scene, camera);
}
*/

// ============================================
// 9. 更新 visualizeParkingSpots 函数
// ============================================
/*
function visualizeParkingSpots() {
  parkingSpots.forEach((spot, idx) => {
    // ... 现有的可视化代码 ...
    // 使用 spot.index 而不是 idx + 1
    const numberLabel = createNumberLabelWithCircle(spot.index, 130);
    numberLabel.position.set(spot.x, 0.01, spot.z);
    scene.add(numberLabel);
    
    console.log(`📍 Parking spot ${spot.index} (${spot.side}): (${spot.x.toFixed(2)}, ${spot.z.toFixed(2)})`);
  });
  console.log(`✅ Visualized ${parkingSpots.length} parking spots with number labels on ground`);
}
*/
