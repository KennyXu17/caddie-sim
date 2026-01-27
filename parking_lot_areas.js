// === 停车场区域定义 ===
// Parking Lot Area Definitions

// === 整个停车场边界 ===
const parkingLotBounds = {
  name: '整个停车场',
  description: 'Parking Lot Bounds',
  topLeft: { x: -25.08, y: 0.00, z: -31.13 },
  bottomRight: { x: 22.94, y: 0.00, z: 6.78 },
  // 计算中心点和尺寸
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
  isDrivable: true // 可行驶区域
};

// === 非过道区域（不可行驶区域）===
const nonDrivableAreas = [
  {
    id: 1,
    name: '最上面一行停车位',
    description: 'Top row parking spots',
    topLeft: { x: -25.25, y: 0.00, z: -31.13 },
    bottomRight: { x: 23.16, y: 0.00, z: -25.40 },
    isDrivable: false, // 不可行驶
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
    isDrivable: false, // 不可行驶
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
    isDrivable: false, // 不可行驶
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
    contains(x, z) {
      return x >= Math.min(this.topLeft.x, this.bottomRight.x) &&
             x <= Math.max(this.topLeft.x, this.bottomRight.x) &&
             z >= Math.min(this.topLeft.z, this.bottomRight.z) &&
             z <= Math.max(this.topLeft.z, this.bottomRight.z);
    }
  }
];

// === 可行驶区域检查函数 ===
function isDrivable(x, z) {
  // 首先检查是否在停车场边界内
  if (x < parkingLotBounds.topLeft.x || x > parkingLotBounds.bottomRight.x ||
      z < parkingLotBounds.topLeft.z || z > parkingLotBounds.bottomRight.z) {
    return false;
  }
  
  // 检查是否在任何非过道区域内
  for (const area of nonDrivableAreas) {
    if (area.contains(x, z)) {
      return false;
    }
  }
  
  // 其他区域都是可行驶区域
  return true;
}

// === 导出数据（用于代码中使用）===
const parkingLotAreas = {
  bounds: parkingLotBounds,
  nonDrivableAreas: nonDrivableAreas,
  isDrivable: isDrivable
};

// === 打印信息 ===
console.log('=== 停车场区域信息 ===\n');

console.log('📐 整个停车场边界:');
console.log(`  左上角: (${parkingLotBounds.topLeft.x}, ${parkingLotBounds.topLeft.y}, ${parkingLotBounds.topLeft.z})`);
console.log(`  右下角: (${parkingLotBounds.bottomRight.x}, ${parkingLotBounds.bottomRight.y}, ${parkingLotBounds.bottomRight.z})`);
console.log(`  中心点: (${parkingLotBounds.center.x.toFixed(2)}, ${parkingLotBounds.center.y.toFixed(2)}, ${parkingLotBounds.center.z.toFixed(2)})`);
console.log(`  宽度: ${parkingLotBounds.width.toFixed(2)}`);
console.log(`  高度: ${parkingLotBounds.height.toFixed(2)}`);

console.log('\n🚫 非过道区域（不可行驶）:');
nonDrivableAreas.forEach((area, idx) => {
  console.log(`\n  ${idx + 1}. ${area.name}:`);
  console.log(`     左上角: (${area.topLeft.x}, ${area.topLeft.y}, ${area.topLeft.z})`);
  console.log(`     右下角: (${area.bottomRight.x}, ${area.bottomRight.y}, ${area.bottomRight.z})`);
  console.log(`     中心点: (${area.center.x.toFixed(2)}, ${area.center.y.toFixed(2)}, ${area.center.z.toFixed(2)})`);
  console.log(`     宽度: ${area.width.toFixed(2)}`);
  console.log(`     高度: ${area.height.toFixed(2)}`);
});

console.log('\n✅ 其他区域都是可行驶区域');

// === 生成用于代码的常量定义 ===
console.log('\n=== 代码中使用的常量定义 ===\n');
console.log('// 停车场边界');
console.log(`const PARKING_LOT_BOUNDS = {`);
console.log(`  topLeft: { x: ${parkingLotBounds.topLeft.x}, y: ${parkingLotBounds.topLeft.y}, z: ${parkingLotBounds.topLeft.z} },`);
console.log(`  bottomRight: { x: ${parkingLotBounds.bottomRight.x}, y: ${parkingLotBounds.bottomRight.y}, z: ${parkingLotBounds.bottomRight.z} }`);
console.log(`};`);

console.log('\n// 非过道区域（不可行驶）');
console.log('const NON_DRIVABLE_AREAS = [');
nonDrivableAreas.forEach((area, idx) => {
  const comma = idx < nonDrivableAreas.length - 1 ? ',' : '';
  console.log(`  {`);
  console.log(`    id: ${area.id},`);
  console.log(`    name: '${area.name}',`);
  console.log(`    topLeft: { x: ${area.topLeft.x}, y: ${area.topLeft.y}, z: ${area.topLeft.z} },`);
  console.log(`    bottomRight: { x: ${area.bottomRight.x}, y: ${area.bottomRight.y}, z: ${area.bottomRight.z} }`);
  console.log(`  }${comma}`);
});
console.log('];');

// 如果在Node.js环境中运行，导出模块
if (typeof module !== 'undefined' && module.exports) {
  module.exports = parkingLotAreas;
}
