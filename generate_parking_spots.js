// 生成停车位位置的脚本
// 根据提供的范围计算每个停车位的中心位置

const parkingRanges = [
  {
    range: [1, 7],
    topLeft: { x: -24.90, y: 0.00, z: -31.29 },
    bottomRight: { x: -2.71, y: 0.00, z: -25.29 }
  },
  {
    range: [8, 14],
    topLeft: { x: 0.59, y: 0.00, z: -31.15 },
    bottomRight: { x: 23.28, y: 0.00, z: -25.15 }
  },
  {
    range: [15, 19],
    topLeft: { x: -18.23, y: 0.00, z: -20.21 },
    bottomRight: { x: -2.61, y: 0.00, z: -14.51 }
  },
  {
    range: [20, 24],
    topLeft: { x: 0.57, y: 0.00, z: -20.38 },
    bottomRight: { x: 16.28, y: 0.00, z: -14.51 }
  },
  {
    range: [25, 29],
    topLeft: { x: -18.21, y: 0.00, z: -14.31 },
    bottomRight: { x: -2.76, y: 0.00, z: -8.77 }
  },
  {
    range: [30, 34],
    topLeft: { x: 0.59, y: 0.00, z: -14.56 },
    bottomRight: { x: 16.29, y: 0.00, z: -9.03 }
  },
  {
    range: [35, 39],
    topLeft: { x: -18.35, y: 0.00, z: -3.68 },
    bottomRight: { x: -2.74, y: 0.00, z: 1.94 }
  },
  {
    range: [40, 44],
    topLeft: { x: 0.62, y: 0.00, z: -3.69 },
    bottomRight: { x: 16.40, y: 0.00, z: 1.93 }
  }
];

function generateParkingSpots() {
  const allSpots = [];
  
  parkingRanges.forEach(({ range, topLeft, bottomRight }) => {
    const [start, end] = range;
    const count = end - start + 1;
    
    // 计算区域宽度
    const widthX = Math.abs(bottomRight.x - topLeft.x);
    const widthZ = Math.abs(bottomRight.z - topLeft.z);
    
    // 计算每个停车位的宽度
    const spotWidthX = widthX / count;
    const centerZ = (topLeft.z + bottomRight.z) / 2;
    
    // 确定x方向是从左到右还是从右到左
    const xDirection = bottomRight.x > topLeft.x ? 1 : -1;
    
    // 生成每个停车位的中心位置
    for (let i = 0; i < count; i++) {
      const spotIndex = start + i;
      const centerX = topLeft.x + (i + 0.5) * spotWidthX * xDirection;
      
      allSpots.push({
        index: spotIndex,
        x: centerX,
        y: 0.00,
        z: centerZ,
        range: `${start}-${end}`,
        side: topLeft.x < 0 ? 'left' : 'right'
      });
    }
  });
  
  return allSpots;
}

// 生成所有停车位
const parkingSpots = generateParkingSpots();

// 输出为JavaScript数组格式
console.log('// === Define 44 Parking Spots ===');
console.log('const parkingSpots = [');
parkingSpots.forEach((spot, idx) => {
  const comma = idx < parkingSpots.length - 1 ? ',' : '';
  console.log(`  { x: ${spot.x.toFixed(2)}, z: ${spot.z.toFixed(2)}, y: ${spot.y.toFixed(2)}, side: '${spot.side}', index: ${spot.index} }${comma}  // Spot ${spot.index} (range ${spot.range})`);
});
console.log('];');

// 输出为JSON格式
console.log('\n// === JSON Format ===');
console.log(JSON.stringify(parkingSpots, null, 2));

// 输出统计信息
console.log('\n// === Statistics ===');
console.log(`Total parking spots: ${parkingSpots.length}`);
const leftSpots = parkingSpots.filter(s => s.side === 'left').length;
const rightSpots = parkingSpots.filter(s => s.side === 'right').length;
console.log(`Left side: ${leftSpots} spots`);
console.log(`Right side: ${rightSpots} spots`);
