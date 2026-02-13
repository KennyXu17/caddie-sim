// === 订单系统 ===
// Order System for Random Vehicle Orders
// 停车位定义来自 parking_map.js

import { PARKING_SPOTS as MAP_SPOTS } from './parking_map.js';

// 兼容旧 API：PARKING_SPOTS 需含 x,z,y,side,index,chargePoint
const PARKING_SPOTS = MAP_SPOTS.map((spot) => ({
  x: spot.center.x,
  z: spot.center.z,
  y: spot.center.y ?? 0,
  side: spot.side,
  index: spot.index,
  chargePoint: spot.chargePoint,
  opening: spot.opening
}));

/** 机器人充电站车位：车辆禁止停入，仅供机器人休息/自充电 */
const ROBOT_CHARGING_STATION_SPOTS = [1, 14];

/** 暂时禁止停车的车位（如施工/维护） */
const DISABLED_PARKING_SPOTS = [2, 13];

// === 订单管理器 ===
class OrderManager {
  constructor(robotInitialPositions = []) {
    this.orders = [];
    this.orderCounter = 0;
    this.occupiedSpots = new Set();

    // 机器人充电站车位（1、14）永久占用，车辆禁止停入
    ROBOT_CHARGING_STATION_SPOTS.forEach(idx => {
      this.occupiedSpots.add(idx);
    });
    // 暂时禁止停车的车位
    DISABLED_PARKING_SPOTS.forEach(idx => {
      this.occupiedSpots.add(idx);
    });
    console.log(`🚫 Robot charging stations: spots ${ROBOT_CHARGING_STATION_SPOTS.join(', ')} reserved (no vehicle parking)`);
    console.log(`🚫 Disabled parking spots (temporary): ${DISABLED_PARKING_SPOTS.join(', ')}`);

    // 机器人初始位置的停车位（若与充电站不同）也标记为占用
    robotInitialPositions.forEach(robotPos => {
      const nearestSpot = this.findNearestParkingSpot(robotPos);
      if (nearestSpot && !ROBOT_CHARGING_STATION_SPOTS.includes(nearestSpot.index)) {
        this.occupiedSpots.add(nearestSpot.index);
        console.log(`🚫 Parking spot ${nearestSpot.index} is occupied by robot at (${robotPos.x}, ${robotPos.z})`);
      }
    });
  }

  // 找到最近的停车位
  findNearestParkingSpot(position, threshold = 2.0) {
    let nearest = null;
    let minDistance = Infinity;

    for (const spot of PARKING_SPOTS) {
      const dx = spot.x - position.x;
      const dz = spot.z - position.z;
      const distance = Math.sqrt(dx * dx + dz * dz);
      
      if (distance < minDistance && distance < threshold) {
        minDistance = distance;
        nearest = spot;
      }
    }

    return nearest;
  }

  // 获取可用的停车位（排除机器人充电站 1、14 及暂时禁止的车位）
  getAvailableSpots() {
    return PARKING_SPOTS.filter(
      spot => !this.occupiedSpots.has(spot.index) && !ROBOT_CHARGING_STATION_SPOTS.includes(spot.index) && !DISABLED_PARKING_SPOTS.includes(spot.index)
    );
  }

  // 创建新订单
  createOrder() {
    const availableSpots = this.getAvailableSpots();
    
    if (availableSpots.length === 0) {
      console.log('⚠️ No available parking spots for new order');
      return null;
    }

    // 随机选择一个可用停车位
    const selectedSpot = availableSpots[Math.floor(Math.random() * availableSpots.length)];
    this.occupiedSpots.add(selectedSpot.index);

    this.orderCounter++;
    const order = {
      id: this.orderCounter,
      parkingSpot: selectedSpot,
      status: 'pending', // pending, in_progress, completed, cancelled
      createdAt: Date.now(),
      vehicleId: null,
      robotId: null
    };

    this.orders.push(order);
    console.log(`📋 Order ${order.id} created: Parking spot ${selectedSpot.index} (${selectedSpot.side} side)`);
    
    return order;
  }

  // 分配车辆到订单
  assignVehicle(orderId, vehicleId) {
    const order = this.orders.find(o => o.id === orderId);
    if (order) {
      order.vehicleId = vehicleId;
      order.status = 'in_progress';
    }
  }

  // 分配机器人到订单
  assignRobot(orderId, robotId) {
    const order = this.orders.find(o => o.id === orderId);
    if (order) {
      order.robotId = robotId;
    }
  }

  // 完成订单
  completeOrder(orderId) {
    const order = this.orders.find(o => o.id === orderId);
    if (order) {
      order.status = 'completed';
      order.completedAt = order.completedAt ?? Date.now();
      this.occupiedSpots.delete(order.parkingSpot.index);
      console.log(`✅ Order ${orderId} completed, parking spot ${order.parkingSpot.index} is now available`);
    }
  }

  // 取消订单
  cancelOrder(orderId) {
    const order = this.orders.find(o => o.id === orderId);
    if (order) {
      order.status = 'cancelled';
      this.occupiedSpots.delete(order.parkingSpot.index);
    }
  }

  // 获取待处理的订单
  getPendingOrders() {
    return this.orders.filter(o => o.status === 'pending');
  }

  // 获取进行中的订单
  getInProgressOrders() {
    return this.orders.filter(o => o.status === 'in_progress');
  }
}

// 导出
export { OrderManager, PARKING_SPOTS };
