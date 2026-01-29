// === 路径规划和碰撞避免系统 ===
// Pathfinding and Collision Avoidance System

// === 停车场区域定义 ===
const PARKING_LOT_BOUNDS = {
  topLeft: { x: -25.08, y: 0.00, z: -31.13 },
  bottomRight: { x: 22.94, y: 0.00, z: 6.78 },
  contains(x, z) {
    return x >= this.topLeft.x && x <= this.bottomRight.x &&
           z >= this.topLeft.z && z <= this.bottomRight.z;
  }
};

const NON_DRIVABLE_AREAS = [
  {
    id: 1,
    name: '最上面一行停车位',
    topLeft: { x: -25.25, y: 0.00, z: -31.13 },
    bottomRight: { x: 23.16, y: 0.00, z: -25.40 },
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

// 检查点是否可行驶
function isDrivable(x, z) {
  if (!PARKING_LOT_BOUNDS.contains(x, z)) {
    return false;
  }
  for (const area of NON_DRIVABLE_AREAS) {
    if (area.contains(x, z)) {
      return false;
    }
  }
  return true;
}

// === A* 路径规划算法 ===
class AStarPathfinder {
  constructor(gridSize = 0.5) {
    this.gridSize = gridSize; // 网格大小
  }

  // 将坐标转换为网格坐标
  worldToGrid(x, z) {
    return {
      i: Math.floor((x - PARKING_LOT_BOUNDS.topLeft.x) / this.gridSize),
      j: Math.floor((z - PARKING_LOT_BOUNDS.topLeft.z) / this.gridSize)
    };
  }

  // 将网格坐标转换为世界坐标
  gridToWorld(i, j) {
    return {
      x: PARKING_LOT_BOUNDS.topLeft.x + i * this.gridSize + this.gridSize / 2,
      z: PARKING_LOT_BOUNDS.topLeft.z + j * this.gridSize + this.gridSize / 2
    };
  }

  // 检查网格点是否可行驶
  isGridDrivable(i, j) {
    const world = this.gridToWorld(i, j);
    return isDrivable(world.x, world.z);
  }

  // 获取邻居节点
  getNeighbors(i, j) {
    const neighbors = [];
    const directions = [
      [0, 1], [1, 0], [0, -1], [-1, 0], // 上下左右
      [1, 1], [1, -1], [-1, 1], [-1, -1] // 对角线
    ];

    for (const [di, dj] of directions) {
      const ni = i + di;
      const nj = j + dj;
      if (this.isGridDrivable(ni, nj)) {
        neighbors.push({ i: ni, j: nj, cost: Math.abs(di) + Math.abs(dj) === 2 ? 1.414 : 1 });
      }
    }
    return neighbors;
  }

  // 计算启发式距离（欧几里得距离）
  heuristic(i1, j1, i2, j2) {
    const dx = i2 - i1;
    const dz = j2 - j1;
    return Math.sqrt(dx * dx + dz * dz);
  }

  // A* 路径查找
  findPath(start, end, occupiedPositions = []) {
    const startGrid = this.worldToGrid(start.x, start.z);
    const endGrid = this.worldToGrid(end.x, end.z);

    const openSet = [{ i: startGrid.i, j: startGrid.j, f: 0, g: 0, h: 0 }];
    const closedSet = new Set();
    const cameFrom = new Map();
    const gScore = new Map();
    const fScore = new Map();

    const startKey = `${startGrid.i},${startGrid.j}`;
    gScore.set(startKey, 0);
    fScore.set(startKey, this.heuristic(startGrid.i, startGrid.j, endGrid.i, endGrid.j));

    // 检查位置是否被占用
    const isOccupied = (i, j) => {
      const world = this.gridToWorld(i, j);
      return occupiedPositions.some(pos => {
        const dx = world.x - pos.x;
        const dz = world.z - pos.z;
        return Math.sqrt(dx * dx + dz * dz) < 1.5; // 1.5单位内的碰撞检测
      });
    };

    while (openSet.length > 0) {
      // 找到f值最小的节点
      openSet.sort((a, b) => a.f - b.f);
      const current = openSet.shift();
      const currentKey = `${current.i},${current.j}`;

      if (current.i === endGrid.i && current.j === endGrid.j) {
        // 重建路径
        const path = [];
        let node = current;
        while (node) {
          const world = this.gridToWorld(node.i, node.j);
          path.unshift({ x: world.x, z: world.z, y: 0 });
          const fromKey = `${node.i},${node.j}`;
          const from = cameFrom.get(fromKey);
          node = from ? { i: from.i, j: from.j } : null;
        }
        return path;
      }

      closedSet.add(currentKey);

      for (const neighbor of this.getNeighbors(current.i, current.j)) {
        const neighborKey = `${neighbor.i},${neighbor.j}`;
        
        if (closedSet.has(neighborKey) || isOccupied(neighbor.i, neighbor.j)) {
          continue;
        }

        const tentativeG = (gScore.get(currentKey) || Infinity) + neighbor.cost;

        if (!gScore.has(neighborKey) || tentativeG < gScore.get(neighborKey)) {
          cameFrom.set(neighborKey, current);
          gScore.set(neighborKey, tentativeG);
          const h = this.heuristic(neighbor.i, neighbor.j, endGrid.i, endGrid.j);
          fScore.set(neighborKey, tentativeG + h);

          if (!openSet.find(n => n.i === neighbor.i && n.j === neighbor.j)) {
            openSet.push({ i: neighbor.i, j: neighbor.j, f: tentativeG + h, g: tentativeG, h });
          }
        }
      }
    }

    // 如果找不到路径，返回直线路径（简化处理）
    return [{ x: start.x, z: start.z, y: 0 }, { x: end.x, z: end.z, y: 0 }];
  }
}

// === 碰撞避免系统 ===
class CollisionAvoidance {
  constructor() {
    this.occupiedPositions = []; // 当前被占用的位置
    this.reservedPaths = []; // 已预留的路径
  }

  // 添加占用位置
  addOccupiedPosition(position, id) {
    this.occupiedPositions.push({ ...position, id, timestamp: Date.now() });
  }

  // 移除占用位置
  removeOccupiedPosition(id) {
    this.occupiedPositions = this.occupiedPositions.filter(pos => pos.id !== id);
  }

  // 预留路径
  reservePath(path, id, duration) {
    this.reservedPaths.push({ path, id, timestamp: Date.now(), duration });
    // 自动清理过期的路径预留
    setTimeout(() => {
      this.reservedPaths = this.reservedPaths.filter(p => p.id !== id);
    }, duration);
  }

  // 检查路径是否与其他对象冲突
  checkPathConflict(path, excludeId = null) {
    for (const reserved of this.reservedPaths) {
      if (reserved.id === excludeId) continue;
      for (const pathPoint of path) {
        for (const reservedPoint of reserved.path) {
          const dx = pathPoint.x - reservedPoint.x;
          const dz = pathPoint.z - reservedPoint.z;
          if (Math.sqrt(dx * dx + dz * dz) < 2.0) { // 2单位内的冲突检测
            return { conflict: true, with: reserved.id };
          }
        }
      }
    }
    return { conflict: false };
  }

  // 获取所有占用位置（用于路径规划）
  getOccupiedPositions(excludeId = null) {
    return this.occupiedPositions
      .filter(pos => pos.id !== excludeId)
      .map(pos => ({ x: pos.x, z: pos.z }));
  }
}

// 创建全局实例
const pathfinder = new AStarPathfinder(0.5);
const collisionAvoidance = new CollisionAvoidance();

// 导出
export { pathfinder, collisionAvoidance, isDrivable, PARKING_LOT_BOUNDS, NON_DRIVABLE_AREAS };
