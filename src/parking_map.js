/**
 * Parking Lot Map - Grid-based A* Navigation with Collision Avoidance
 *
 * 停车场边界: x∈[-24.5,22.5], z∈[-31,6.5]
 * 停车位为障碍物（需避开），车辆目标=车位中心，caddie目标=门口中心(chargePoint)
 * 车辆: 4.2×1.5 (长×宽), caddie: 1.5×0.8
 */

// =============================================================================
// PARKING LOT GEOMETRY
// =============================================================================

/** 停车场外边界（含入口区域） */
export const LOT_BOUNDS = {
  minX: -24.5,
  maxX: 22.5,
  minZ: -31,
  maxZ: 7,  // 扩展以包含入口 z=6.69
  contains(x, z) {
    return x >= this.minX && x <= this.maxX && z >= this.minZ && z <= this.maxZ;
  }
};

/** 入口位置（车辆由此进入，须在边界内） */
export const ENTRANCE = { x: -22.25, z: 6.69, y: 0 };

/** 停车位行定义: { indices, minX, maxX, minZ, maxZ, opening } opening: '+z' | '-z' */
const SPOT_ROWS = [
  // Row for spots 1-7:
  // 1: [-24, -20.5], 2: [-20.5, -17.5], 3-7 share [-17.5, -2.5] with width=3 each
  { indices: [1, 7], minX: -24.0, maxX: -2.5, minZ: -31, maxZ: -25, opening: '+z' },

  // Row for spots 8-14:
  // 8-12 share [0.5, 15.5] with width=3 each, 13: [15.5, 18.5], 14: [18.5, 22]
  { indices: [8, 14], minX: 0.5, maxX: 22.0, minZ: -31, maxZ: -25, opening: '+z' },

  // Uniform groups (width=3 each):
  // 15-19,25-29,35-39: x in [-17.5, -2.5]
  // 20-24,30-34,40-44: x in [0.5, 15.5]
  { indices: [15, 19], minX: -17.5, maxX: -2.5, minZ: -20.5, maxZ: -14.5, opening: '-z' },
  { indices: [20, 24], minX: 0.5, maxX: 15.5, minZ: -20.5, maxZ: -14.5, opening: '-z' },
  { indices: [25, 29], minX: -17.5, maxX: -2.5, minZ: -14.5, maxZ: -9, opening: '+z' },
  { indices: [30, 34], minX: 0.5, maxX: 15.5, minZ: -14.5, maxZ: -9, opening: '+z' },
  { indices: [35, 39], minX: -17.5, maxX: -2.5, minZ: -4, maxZ: 1.5, opening: '-z' },
  { indices: [40, 44], minX: 0.5, maxX: 15.5, minZ: -4, maxZ: 1.5, opening: '-z' }
];

/** 生成 44 个停车位：中心、AABB、门口中心(chargePoint) */
function buildParkingSpots() {
  const spots = [];
  for (const row of SPOT_ROWS) {
    const [lo, hi] = row.indices;
    const count = hi - lo + 1;
    const xRange = row.maxX - row.minX;
    const zRange = row.maxZ - row.minZ;
    const spotDepthZ = zRange;

    // 每个车位的宽度：默认 3m，但 1 号、14 号车位为 3.5m
    // 注意：row.minX~row.maxX 的区间可能比宽度总和略大，这里用左右 margin 居中对齐。
    const widths = [];
    for (let k = 0; k < count; k++) {
      const index = lo + k;
      widths.push((index === 1 || index === 14) ? 3.5 : 3.0);
    }
    const sumWidth = widths.reduce((a, b) => a + b, 0);
    const margin = Math.max(0, (xRange - sumWidth) / 2);

    let cursorX = row.minX + margin;
    for (let k = 0; k < count; k++) {
      const index = lo + k;
      const w = widths[k];

      const minX = cursorX;
      const maxX = cursorX + w;
      const cx = minX + w / 2;
      const cz = (row.minZ + row.maxZ) / 2;

      // C_i（充电点）：由 S_i（车位中心）沿开口方向距离 2.7
      const CI_DIST = 2.7;
      const chargeZ = row.opening === '+z' ? cz + CI_DIST : cz - CI_DIST;

      spots.push({
        index,
        center: { x: cx, z: cz, y: 0 },
        chargePoint: { x: cx, z: chargeZ, y: 0 },
        bounds: { minX, maxX, minZ: row.minZ, maxZ: row.maxZ },
        side: row.minX < 0 ? 'left' : 'right',
        opening: row.opening
      });

      cursorX = maxX;
    }
  }
  return spots;
}

export const PARKING_SPOTS = buildParkingSpots();

/** 所有停车位 AABB 列表（用于碰撞检测） */
export const SPOT_AABBS = PARKING_SPOTS.map(s => ({
  ...s.bounds,
  index: s.index
}));

/** 永久障碍物 AABB（小车和机器人均不可通过） */
export const PERMANENT_OBSTACLES = [
  { minX: -20.5, maxX: -17.5, minZ: -1.5, maxZ: 6.5 },
  { minX: -20.5, maxX: -17.5, minZ: -18.5, maxZ: -11 },
  { minX: -2.5, maxX: 0.5, minZ: -20, maxZ: -9 },
  { minX: -2.5, maxX: 0.5, minZ: -4, maxZ: 6.5 },
  { minX: 15.5, maxX: 18.5, minZ: -18, maxZ: -11 },
  { minX: 15.5, maxX: 18.5, minZ: -1.5, maxZ: 6.5 }
];

// =============================================================================
// AGENT DIMENSIONS
// =============================================================================

export const AGENT_DIMS = {
  car: { length: 4.2, width: 1.5 },
  caddie: { length: 1.5, width: 0.8 }
};

/** 碰撞安全距离（额外膨胀） */
const SAFETY_MARGIN = 0.2;

/** 车辆等效半径：走廊约 3m 宽，需能通过，取 min(几何半径, 1.0) 保证可通行 */
const CAR_GEOM_RADIUS = Math.sqrt((4.2 / 2) ** 2 + (1.5 / 2) ** 2) + SAFETY_MARGIN;
const CAR_RADIUS = Math.min(CAR_GEOM_RADIUS, 1.0);  // 1.0 可穿过 3m 走廊
/** 车辆碰撞半径（与其他 agent 避障时使用，4.2×1.5 外接圆） */
export const CAR_COLLISION_RADIUS = CAR_GEOM_RADIUS;
/** caddie 等效半径（路径规划与碰撞） */
const CADDIE_RADIUS = Math.sqrt((1.5 / 2) ** 2 + (0.8 / 2) ** 2) + SAFETY_MARGIN;

// =============================================================================
// DRIVABILITY CHECK
// =============================================================================

/**
 * 检查点 (x,z) 是否在停车场内且不在任何停车位内
 */
export function isInLot(x, z) {
  return LOT_BOUNDS.contains(x, z);
}

/**
 * 检查点是否在某个停车位内部
 */
export function isInsideAnySpot(x, z, excludeSpotIndex = null) {
  for (const spot of PARKING_SPOTS) {
    if (excludeSpotIndex !== null && spot.index === excludeSpotIndex) continue;
    const b = spot.bounds;
    if (x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ) return true;
  }
  return false;
}

/**
 * 检查点是否在永久障碍物内部
 */
function isInsideAnyPermanentObstacle(x, z) {
  for (const o of PERMANENT_OBSTACLES) {
    if (x >= o.minX && x <= o.maxX && z >= o.minZ && z <= o.maxZ) return true;
  }
  return false;
}

/**
 * 检查以 (x,z) 为中心、radius 为半径的圆是否与永久障碍物重叠
 */
function circleOverlapsPermanentObstacle(x, z, radius) {
  for (const o of PERMANENT_OBSTACLES) {
    const closestX = Math.max(o.minX, Math.min(o.maxX, x));
    const closestZ = Math.max(o.minZ, Math.min(o.maxZ, z));
    const d = Math.hypot(x - closestX, z - closestZ);
    if (d < radius) return true;
  }
  return false;
}

/**
 * 检查线段 (ax,az)-(bx,bz) 是否穿过障碍物（采样检测，步长 step）
 */
function segmentIntersectsObstacles(ax, az, bx, bz, radius, excludeSpotIndex = null) {
  const dx = bx - ax;
  const dz = bz - az;
  const len = Math.hypot(dx, dz);
  if (len < 1e-6) return false;
  const step = 0.15;
  const n = Math.ceil(len / step) + 1;
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    const x = ax + t * dx;
    const z = az + t * dz;
    if (circleOverlapsPermanentObstacle(x, z, radius)) return true;
    if (circleOverlapsSpot(x, z, radius, excludeSpotIndex)) return true;
  }
  return false;
}

/**
 * 对路径进行细分，确保相邻点之间的线段不穿过障碍物
 */
function subdividePathForObstacles(path, radius, excludeSpotIndex = null, maxDepth = 5) {
  if (!path || path.length < 2) return path;
  const out = [path[0]];
  for (let i = 1; i < path.length; i++) {
    const prev = path[i - 1];
    const curr = path[i];
    const subdiv = (a, b, depth) => {
      if (depth <= 0) return [b];
      if (!segmentIntersectsObstacles(a.x, a.z, b.x, b.z, radius, excludeSpotIndex)) return [b];
      const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, y: 0 };
      return [...subdiv(a, mid, depth - 1), ...subdiv(mid, b, depth - 1)];
    };
    out.push(...subdiv(prev, curr, maxDepth));
  }
  return out;
}

/**
 * 检查点是否可行驶（在停车场内、不在停车位内、不在永久障碍物内）
 */
export function isDrivable(x, z, excludeSpotIndex = null) {
  if (!isInLot(x, z)) return false;
  if (isInsideAnySpot(x, z, excludeSpotIndex)) return false;
  if (isInsideAnyPermanentObstacle(x, z)) return false;
  return true;
}

/**
 * 检查以 (x,z) 为中心、radius 为半径的圆是否与停车位重叠
 */
function circleOverlapsSpot(x, z, radius, excludeSpotIndex = null) {
  for (const spot of PARKING_SPOTS) {
    if (excludeSpotIndex !== null && spot.index === excludeSpotIndex) continue;
    const b = spot.bounds;
    const closestX = Math.max(b.minX, Math.min(b.maxX, x));
    const closestZ = Math.max(b.minZ, Math.min(b.maxZ, z));
    const d = Math.hypot(x - closestX, z - closestZ);
    if (d < radius) return true;
  }
  return false;
}

/**
 * 检查以 (x,z) 为中心、radius 为半径的圆是否与动态障碍重叠
 */
function circleOverlapsObstacles(x, z, radius, occupiedPositions = []) {
  for (const pos of occupiedPositions) {
    const d = Math.hypot(x - pos.x, z - pos.z);
    const otherRadius = pos.radius ?? CAR_RADIUS;
    if (d < radius + otherRadius) return true;
  }
  return false;
}

// =============================================================================
// A* GRID PATHFINDER
// =============================================================================

export class ParkingAStarPathfinder {
  constructor(gridSize = 0.4) {
    this.gridSize = gridSize;
    this.minX = LOT_BOUNDS.minX;
    this.minZ = LOT_BOUNDS.minZ;
    this.cols = Math.ceil((LOT_BOUNDS.maxX - LOT_BOUNDS.minX) / gridSize);
    this.rows = Math.ceil((LOT_BOUNDS.maxZ - LOT_BOUNDS.minZ) / gridSize);
  }

  worldToGrid(x, z) {
    const i = Math.floor((x - this.minX) / this.gridSize);
    const j = Math.floor((z - this.minZ) / this.gridSize);
    return { i: Math.max(0, Math.min(this.cols - 1, i)), j: Math.max(0, Math.min(this.rows - 1, j)) };
  }

  gridToWorld(i, j) {
    return {
      x: this.minX + (i + 0.5) * this.gridSize,
      z: this.minZ + (j + 0.5) * this.gridSize,
      y: 0
    };
  }

  /**
   * 检查网格 (i,j) 对给定 agent 是否可通行
   * @param {string} agentType - 'car' | 'caddie'
   * @param {number} excludeSpotIndex - 目标车位，可穿入其门口
   */
  isGridPassable(i, j, agentType, excludeSpotIndex = null, occupiedPositions = []) {
    const w = this.gridToWorld(i, j);
    const staticRadius = agentType === 'car' ? CAR_RADIUS : CADDIE_RADIUS;
    const dynamicRadius = agentType === 'car' ? CAR_COLLISION_RADIUS : CADDIE_RADIUS;

    if (!isInLot(w.x, w.z)) return false;
    if (circleOverlapsSpot(w.x, w.z, staticRadius, excludeSpotIndex)) return false;
    if (circleOverlapsPermanentObstacle(w.x, w.z, staticRadius)) return false;
    if (circleOverlapsObstacles(w.x, w.z, dynamicRadius, occupiedPositions)) return false;
    return true;
  }

  getNeighbors(i, j, agentType, excludeSpotIndex, occupiedPositions) {
    const dirs = [
      [0, 1], [1, 0], [0, -1], [-1, 0],
      [1, 1], [1, -1], [-1, 1], [-1, -1]
    ];
    const out = [];
    for (const [di, dj] of dirs) {
      const ni = i + di;
      const nj = j + dj;
      if (ni < 0 || ni >= this.cols || nj < 0 || nj >= this.rows) continue;
      if (!this.isGridPassable(ni, nj, agentType, excludeSpotIndex, occupiedPositions)) continue;
      const cost = Math.abs(di) + Math.abs(dj) === 2 ? 1.414 : 1;
      out.push({ i: ni, j: nj, cost });
    }
    return out;
  }

  heuristic(i1, j1, i2, j2) {
    return Math.hypot(i2 - i1, j2 - j1);
  }

  /**
   * A* 寻路
   * @param {{ x, z }} start - 起点
   * @param {{ x, z }} end - 终点
   * @param {string} agentType - 'car' | 'caddie'
   * @param {number} excludeSpotIndex - 目标车位索引（若终点在该车位内）
   * @param {Array<{x,z,radius?}>} occupiedPositions - 动态障碍（其他车/机器人）
   */
  findPath(start, end, agentType = 'caddie', excludeSpotIndex = null, occupiedPositions = []) {
    const sg = this.worldToGrid(start.x, start.z);
    const eg = this.worldToGrid(end.x, end.z);

    if (!this.isGridPassable(sg.i, sg.j, agentType, null, occupiedPositions)) {
      console.warn(`[A*] 起点 (${start.x.toFixed(1)}, ${start.z.toFixed(1)}) 不可通行`);
    }
    if (!this.isGridPassable(eg.i, eg.j, agentType, excludeSpotIndex, occupiedPositions)) {
      console.warn(`[A*] 终点 (${end.x.toFixed(1)}, ${end.z.toFixed(1)}) 不可通行`);
    }

    const open = [{ i: sg.i, j: sg.j, f: 0, g: 0 }];
    const closed = new Set();
    const cameFrom = new Map();
    const gScore = new Map();
    const key = (i, j) => `${i},${j}`;

    gScore.set(key(sg.i, sg.j), 0);

    while (open.length > 0) {
      open.sort((a, b) => a.f - b.f);
      const cur = open.shift();
      const ck = key(cur.i, cur.j);

      if (cur.i === eg.i && cur.j === eg.j) {
        const path = [];
        let n = cur;
        while (n) {
          path.unshift(this.gridToWorld(n.i, n.j));
          const from = cameFrom.get(key(n.i, n.j));
          n = from ? { i: from.i, j: from.j } : null;
        }
        const radius = agentType === 'car' ? CAR_RADIUS : CADDIE_RADIUS;
        return subdividePathForObstacles(path, radius, excludeSpotIndex);
      }

      closed.add(ck);

      for (const nb of this.getNeighbors(cur.i, cur.j, agentType, excludeSpotIndex, occupiedPositions)) {
        const nk = key(nb.i, nb.j);
        if (closed.has(nk)) continue;

        const tg = (gScore.get(ck) ?? Infinity) + nb.cost;
        if (tg >= (gScore.get(nk) ?? Infinity)) continue;

        cameFrom.set(nk, cur);
        gScore.set(nk, tg);
        const h = this.heuristic(nb.i, nb.j, eg.i, eg.j);
        const existing = open.find(o => o.i === nb.i && o.j === nb.j);
        if (existing) {
          existing.f = tg + h;
          existing.g = tg;
        } else {
          open.push({ i: nb.i, j: nb.j, f: tg + h, g: tg });
        }
      }
    }

    console.warn(`[A*] 未找到路径: (${start.x.toFixed(1)},${start.z.toFixed(1)}) -> (${end.x.toFixed(1)},${end.z.toFixed(1)}), agent=${agentType}`);
    return null;
  }
}

// =============================================================================
// NAVIGATION HELPERS
// =============================================================================

/** 获取车位中心（车辆目标） */
export function getSpotCenter(spotIndex) {
  const s = PARKING_SPOTS.find(sp => sp.index === spotIndex);
  return s ? s.center : null;
}

/** 获取车位门口中心（caddie 目标） */
export function getSpotChargePoint(spotIndex) {
  const s = PARKING_SPOTS.find(sp => sp.index === spotIndex);
  return s ? s.chargePoint : null;
}

/** 格式化 occupied 供 A* 使用：{ x, z, radius } */
export function formatOccupied(positions, agentType) {
  return (positions || []).map(p => ({
    x: p.x,
    z: p.z,
    radius: p.radius ?? (agentType === 'car' ? CAR_RADIUS : CADDIE_RADIUS)
  }));
}

// =============================================================================
// SINGLETON & EXPORTS
// =============================================================================

export const parkingPathfinder = new ParkingAStarPathfinder(0.4);

/** 兼容旧 pathfinding：PARKING_LOT_BOUNDS */
export const PARKING_LOT_BOUNDS = {
  topLeft: { x: LOT_BOUNDS.minX, z: LOT_BOUNDS.minZ },
  bottomRight: { x: LOT_BOUNDS.maxX, z: LOT_BOUNDS.maxZ },
  contains(x, z) { return LOT_BOUNDS.contains(x, z); }
};
