// === 路径规划和碰撞避免系统 ===
// Pathfinding and Collision Avoidance System
// 使用 parking_map.js 的网格几何与 A*

import {
  isDrivable as mapIsDrivable,
  parkingPathfinder,
  formatOccupied,
  LOT_BOUNDS,
  CAR_COLLISION_RADIUS
} from './parking_map.js';

// 兼容旧 API
const PARKING_LOT_BOUNDS = {
  topLeft: { x: LOT_BOUNDS.minX, z: LOT_BOUNDS.minZ },
  bottomRight: { x: LOT_BOUNDS.maxX, z: LOT_BOUNDS.maxZ },
  contains(x, z) { return LOT_BOUNDS.contains(x, z); }
};

const NON_DRIVABLE_AREAS = []; // 已由 parking_map 的停车位定义替代

function isDrivable(x, z, excludeSpotIndex = null) {
  return mapIsDrivable(x, z, excludeSpotIndex);
}

// === 统一 A* 路径规划（基于 parking_map 网格）===
class AStarPathfinder {
  constructor() {
    this._impl = parkingPathfinder;
  }

  /**
   * 寻路
   * @param {{ x, z }} start - 起点
   * @param {{ x, z }} end - 终点
   * @param {Array<{x,z,radius?}>} occupiedPositions - 动态障碍
   * @param {Object} options - { agentType: 'car'|'caddie', excludeSpotIndex: number }
   */
  findPath(start, end, occupiedPositions = [], options = {}) {
    const agentType = options.agentType ?? 'caddie';
    const excludeSpotIndex = options.excludeSpotIndex ?? null;
    const occ = formatOccupied(occupiedPositions, agentType);
    return this._impl.findPath(start, end, agentType, excludeSpotIndex, occ);
  }
}

// === 碰撞避免系统 ===
class CollisionAvoidance {
  constructor() {
    this.occupiedPositions = [];
    this.reservedPaths = [];
  }

  addOccupiedPosition(position, id, agentType = 'caddie') {
    const radius = agentType === 'car' ? CAR_COLLISION_RADIUS : (Math.sqrt((1.5 / 2) ** 2 + (0.8 / 2) ** 2) + 0.2);
    this.removeOccupiedPosition(id);
    this.occupiedPositions.push({ ...position, id, agentType, radius, timestamp: Date.now() });
  }

  removeOccupiedPosition(id) {
    this.occupiedPositions = this.occupiedPositions.filter(pos => pos.id !== id);
  }

  reservePath(path, id, duration) {
    this.reservedPaths.push({ path, id, timestamp: Date.now(), duration });
    setTimeout(() => {
      this.reservedPaths = this.reservedPaths.filter(p => p.id !== id);
    }, duration);
  }

  checkPathConflict(path, excludeId = null, pathAgentType = 'car') {
    const carRadius = CAR_COLLISION_RADIUS;
    const caddieRadius = Math.sqrt((1.5 / 2) ** 2 + (0.8 / 2) ** 2) + 0.2;
    const pathRadius = pathAgentType === 'car' ? carRadius : caddieRadius;
    for (const reserved of this.reservedPaths) {
      if (reserved.id === excludeId) continue;
      const reservedRadius = reserved.id.startsWith('vehicle_') ? carRadius : caddieRadius;
      const minSep = pathRadius + reservedRadius;
      for (const pathPoint of path) {
        for (const reservedPoint of reserved.path) {
          if (Math.hypot(pathPoint.x - reservedPoint.x, pathPoint.z - reservedPoint.z) < minSep) {
            return { conflict: true, with: reserved.id };
          }
        }
      }
    }
    return { conflict: false };
  }

  getOccupiedPositions(excludeId = null, alsoExcludeIds = []) {
    const excludeSet = new Set([excludeId, ...alsoExcludeIds].filter(Boolean));
    return this.occupiedPositions
      .filter(pos => !excludeSet.has(pos.id))
      .map(pos => ({ x: pos.x, z: pos.z, radius: pos.radius }));
  }
}

const pathfinder = new AStarPathfinder();
const collisionAvoidance = new CollisionAvoidance();

export { pathfinder, collisionAvoidance, isDrivable, PARKING_LOT_BOUNDS, NON_DRIVABLE_AREAS };
