// === 停车场区域定义 ===
// Parking Lot Area Definitions
// 用于代码中的区域检查和路径规划

// === 整个停车场边界 ===
const PARKING_LOT_BOUNDS = {
  topLeft: { x: -25.08, y: 0.00, z: -31.13 },
  bottomRight: { x: 22.94, y: 0.00, z: 6.78 },
  // 辅助函数
  get center() {
    return {
      x: (this.topLeft.x + this.bottomRight.x) / 2,
      y: (this.topLeft.y + this.bottomRight.y) / 2,
      z: (this.topLeft.z + this.bottomRight.z) / 2
    };
  },
  get width() {
    return Math.abs(this.bottomRight.x - this.topLeft.x);
  },
  get height() {
    return Math.abs(this.bottomRight.z - this.topLeft.z);
  },
  // 检查点是否在边界内
  contains(x, z) {
    return x >= this.topLeft.x && x <= this.bottomRight.x &&
           z >= this.topLeft.z && z <= this.bottomRight.z;
  }
};

// === 非过道区域（不可行驶区域）===
const NON_DRIVABLE_AREAS = [
  {
    id: 1,
    name: '最上面一行停车位',
    description: 'Top row parking spots',
    topLeft: { x: -25.25, y: 0.00, z: -31.13 },
    bottomRight: { x: 23.16, y: 0.00, z: -25.40 },
    // 检查点是否在此区域内
    contains(x, z) {
      return x >= Math.min(this.topLeft.x, this.bottomRight.x) &&
             x <= Math.max(this.topLeft.x, this.bottomRight.x) &&
             z >= Math.min(this.topLeft.z, this.bottomRight.z) &&
             z <= Math.max(this.topLeft.z, this.bottomRight.z);
    }
  },
  {
    id: 2,
    name: '中间两行停车位加绿植区域',
    description: 'Middle two rows parking spots + green area',
    topLeft: { x: -21.28, y: 0.00, z: -20.54 },
    bottomRight: { x: 19.39, y: 0.00, z: -8.77 },
    contains(x, z) {
      return x >= Math.min(this.topLeft.x, this.bottomRight.x) &&
             x <= Math.max(this.topLeft.x, this.bottomRight.x) &&
             z >= Math.min(this.topLeft.z, this.bottomRight.z) &&
             z <= Math.max(this.topLeft.z, this.bottomRight.z);
    }
  },
  {
    id: 3,
    name: '最下面一行停车位加草坪',
    description: 'Bottom row parking spots + lawn',
    topLeft: { x: -21.45, y: 0.00, z: -4.25 },
    bottomRight: { x: 19.37, y: 0.00, z: 6.84 },
    contains(x, z) {
      return x >= Math.min(this.topLeft.x, this.bottomRight.x) &&
             x <= Math.max(this.topLeft.x, this.bottomRight.x) &&
             z >= Math.min(this.topLeft.z, this.bottomRight.z) &&
             z <= Math.max(this.topLeft.z, this.bottomRight.z);
    }
  }
];

// === 可行驶区域检查函数 ===
// 检查给定坐标是否在可行驶区域内
function isDrivable(x, z) {
  // 首先检查是否在停车场边界内
  if (!PARKING_LOT_BOUNDS.contains(x, z)) {
    return false;
  }
  
  // 检查是否在任何非过道区域内
  for (const area of NON_DRIVABLE_AREAS) {
    if (area.contains(x, z)) {
      return false;
    }
  }
  
  // 其他区域都是可行驶区域
  return true;
}

// === 获取可行驶区域 ===
// 返回所有可行驶区域的边界（用于路径规划）
function getDrivableAreas() {
  const drivableAreas = [];
  
  // 区域1: 最上面一行停车位上方
  drivableAreas.push({
    name: '最上面一行停车位上方过道',
    topLeft: { x: PARKING_LOT_BOUNDS.topLeft.x, y: 0, z: PARKING_LOT_BOUNDS.topLeft.z },
    bottomRight: { x: PARKING_LOT_BOUNDS.bottomRight.x, y: 0, z: NON_DRIVABLE_AREAS[0].topLeft.z }
  });
  
  // 区域2: 最上面一行和中间区域之间的过道
  drivableAreas.push({
    name: '第一行和第二行之间的过道',
    topLeft: { x: PARKING_LOT_BOUNDS.topLeft.x, y: 0, z: NON_DRIVABLE_AREAS[0].bottomRight.z },
    bottomRight: { x: PARKING_LOT_BOUNDS.bottomRight.x, y: 0, z: NON_DRIVABLE_AREAS[1].topLeft.z }
  });
  
  // 区域3: 中间区域和最下面一行之间的过道
  drivableAreas.push({
    name: '中间区域和最下面一行之间的过道',
    topLeft: { x: PARKING_LOT_BOUNDS.topLeft.x, y: 0, z: NON_DRIVABLE_AREAS[1].bottomRight.z },
    bottomRight: { x: PARKING_LOT_BOUNDS.bottomRight.x, y: 0, z: NON_DRIVABLE_AREAS[2].topLeft.z }
  });
  
  // 区域4: 最下面一行停车位下方
  drivableAreas.push({
    name: '最下面一行停车位下方过道',
    topLeft: { x: PARKING_LOT_BOUNDS.topLeft.x, y: 0, z: NON_DRIVABLE_AREAS[2].bottomRight.z },
    bottomRight: { x: PARKING_LOT_BOUNDS.bottomRight.x, y: 0, z: PARKING_LOT_BOUNDS.bottomRight.z }
  });
  
  return drivableAreas;
}

// === 导出 ===
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    PARKING_LOT_BOUNDS,
    NON_DRIVABLE_AREAS,
    isDrivable,
    getDrivableAreas
  };
}

// === 使用示例 ===
/*
// 检查点是否可行驶
if (isDrivable(0, -10)) {
  console.log('这个位置可以行驶');
} else {
  console.log('这个位置不可行驶');
}

// 检查点是否在非过道区域内
for (const area of NON_DRIVABLE_AREAS) {
  if (area.contains(0, -10)) {
    console.log(`点在${area.name}内`);
  }
}
*/
