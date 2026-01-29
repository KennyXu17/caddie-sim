// === 订单系统 ===
// Order System for Random Vehicle Orders

/** 每个车位的 charge point 距车位中心沿 z 轴的距离（米） */
const CHARGE_POINT_OFFSET_Z = 3.5;

// === 44个停车位定义（含 charge point）===
// chargePoint: 以车位中心为参考；1–14、25–34 为 +z 方向，15–24、35–44 为 -z 方向
const PARKING_SPOTS_RAW = [
  // Range 1-7 (Left side)
  { x: -23.31, z: -28.29, y: 0.00, side: 'left', index: 1 },
  { x: -20.14, z: -28.29, y: 0.00, side: 'left', index: 2 },
  { x: -16.98, z: -28.29, y: 0.00, side: 'left', index: 3 },
  { x: -13.80, z: -28.29, y: 0.00, side: 'left', index: 4 },
  { x: -10.64, z: -28.29, y: 0.00, side: 'left', index: 5 },
  { x: -7.46, z: -28.29, y: 0.00, side: 'left', index: 6 },
  { x: -4.30, z: -28.29, y: 0.00, side: 'left', index: 7 },
  
  // Range 8-14 (Right side)
  { x: 2.21, z: -28.15, y: 0.00, side: 'right', index: 8 },
  { x: 5.45, z: -28.15, y: 0.00, side: 'right', index: 9 },
  { x: 8.69, z: -28.15, y: 0.00, side: 'right', index: 10 },
  { x: 11.94, z: -28.15, y: 0.00, side: 'right', index: 11 },
  { x: 15.18, z: -28.15, y: 0.00, side: 'right', index: 12 },
  { x: 18.42, z: -28.15, y: 0.00, side: 'right', index: 13 },
  { x: 21.66, z: -28.15, y: 0.00, side: 'right', index: 14 },
  
  // Range 15-19 (Left side)
  { x: -16.67, z: -17.36, y: 0.00, side: 'left', index: 15 },
  { x: -13.54, z: -17.36, y: 0.00, side: 'left', index: 16 },
  { x: -10.42, z: -17.36, y: 0.00, side: 'left', index: 17 },
  { x: -7.30, z: -17.36, y: 0.00, side: 'left', index: 18 },
  { x: -4.17, z: -17.36, y: 0.00, side: 'left', index: 19 },
  
  // Range 20-24 (Right side)
  { x: 2.14, z: -17.45, y: 0.00, side: 'right', index: 20 },
  { x: 5.28, z: -17.45, y: 0.00, side: 'right', index: 21 },
  { x: 8.43, z: -17.45, y: 0.00, side: 'right', index: 22 },
  { x: 11.57, z: -17.45, y: 0.00, side: 'right', index: 23 },
  { x: 14.71, z: -17.45, y: 0.00, side: 'right', index: 24 },
  
  // Range 25-29 (Left side)
  { x: -16.66, z: -11.54, y: 0.00, side: 'left', index: 25 },
  { x: -13.57, z: -11.54, y: 0.00, side: 'left', index: 26 },
  { x: -10.48, z: -11.54, y: 0.00, side: 'left', index: 27 },
  { x: -7.39, z: -11.54, y: 0.00, side: 'left', index: 28 },
  { x: -4.30, z: -11.54, y: 0.00, side: 'left', index: 29 },
  
  // Range 30-34 (Right side)
  { x: 2.16, z: -11.79, y: 0.00, side: 'right', index: 30 },
  { x: 5.30, z: -11.79, y: 0.00, side: 'right', index: 31 },
  { x: 8.44, z: -11.79, y: 0.00, side: 'right', index: 32 },
  { x: 11.58, z: -11.79, y: 0.00, side: 'right', index: 33 },
  { x: 14.72, z: -11.79, y: 0.00, side: 'right', index: 34 },
  
  // Range 35-39 (Left side)
  { x: -16.79, z: -0.87, y: 0.00, side: 'left', index: 35 },
  { x: -13.67, z: -0.87, y: 0.00, side: 'left', index: 36 },
  { x: -10.55, z: -0.87, y: 0.00, side: 'left', index: 37 },
  { x: -7.42, z: -0.87, y: 0.00, side: 'left', index: 38 },
  { x: -4.30, z: -0.87, y: 0.00, side: 'left', index: 39 },
  
  // Range 40-44 (Right side)
  { x: 2.20, z: -0.88, y: 0.00, side: 'right', index: 40 },
  { x: 5.35, z: -0.88, y: 0.00, side: 'right', index: 41 },
  { x: 8.51, z: -0.88, y: 0.00, side: 'right', index: 42 },
  { x: 11.67, z: -0.88, y: 0.00, side: 'right', index: 43 },
  { x: 14.82, z: -0.88, y: 0.00, side: 'right', index: 44 }
];

const PARKING_SPOTS = PARKING_SPOTS_RAW.map((spot) => {
  const positiveZ = (spot.index >= 1 && spot.index <= 14) || (spot.index >= 25 && spot.index <= 34);
  const dz = positiveZ ? CHARGE_POINT_OFFSET_Z : -CHARGE_POINT_OFFSET_Z;
  return {
    ...spot,
    chargePoint: {
      x: spot.x,
      z: spot.z + dz,
      y: spot.y != null ? spot.y : 0
    }
  };
});

// === 订单管理器 ===
class OrderManager {
  constructor(robotInitialPositions = []) {
    this.orders = [];
    this.orderCounter = 0;
    this.occupiedSpots = new Set();
    
    // 机器人初始位置的停车位始终为占用状态
    robotInitialPositions.forEach(robotPos => {
      // 找到最近的停车位
      const nearestSpot = this.findNearestParkingSpot(robotPos);
      if (nearestSpot) {
        this.occupiedSpots.add(nearestSpot.index);
        console.log(`🚫 Parking spot ${nearestSpot.index} is permanently occupied by robot at (${robotPos.x}, ${robotPos.z})`);
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

  // 获取可用的停车位
  getAvailableSpots() {
    return PARKING_SPOTS.filter(spot => !this.occupiedSpots.has(spot.index));
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
