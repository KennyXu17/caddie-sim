/**
 * 时空预定表 (Reservation Table)
 *
 * 将空间轨迹点转化为时间维度的资源预定，供 Space-Time 导航与协同避让使用。
 * Phase 1: 车辆路径预定；后续 Phase: 机器人查询避让
 *
 * @see docs/SPACE_TIME_NAVIGATION.md
 */

const CELL_SIZE = 2; // 空间离散化网格大小 (m)

/**
 * 将 (x,z) 量化为网格单元 ID
 */
function makeCellId(x, z) {
  const ix = Math.round(x / CELL_SIZE);
  const iz = Math.round(z / CELL_SIZE);
  return `c_${ix}_${iz}`;
}

/** 预定记录: { cellId, tStart, tEnd, agentId } */
const reservations = [];

/** 按 agentId 索引，便于 release */
const byAgent = new Map();

let _simTimeScale = 1;
let _simTimeOrigin = 0;
let _realOrigin = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;

/**
 * 获取当前仿真时间 (秒)，用于预定与查询（支持倍速）
 */
export function getSimTime() {
  const real = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
  return _simTimeOrigin + (real - _realOrigin) * _simTimeScale;
}

/** 获取当前仿真时间倍速（1 = 实时，60 = 1min/s，3600 = 1h/s） */
export function getSimTimeScale() {
  return _simTimeScale;
}

/**
 * 设置仿真时间倍速（dashboard 调用）
 * @param {number} scale - 1 = 实时(1s/s), 60 = 1min/s, 3600 = 1hour/s
 */
export function setSimTimeScale(scale) {
  const t = getSimTime();
  // 允许从 0.1x 慢速到 3600x 快速（1 小时 / 秒）
  _simTimeScale = Math.max(0.1, Math.min(3600, Number(scale) || 1));
  _simTimeOrigin = t;
  _realOrigin = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
}

/**
 * 预定空间单元在 [tStart, tEnd] 时段
 * @param {string} cellId - 网格单元 ID (可用 makeCellId(x,z) 生成)
 * @param {number} tStart - 开始时间 (秒)
 * @param {number} tEnd - 结束时间 (秒)
 * @param {string} agentId - 预定者 ID，如 "vehicle_1"
 */
export function reserve(cellId, tStart, tEnd, agentId) {
  const r = { cellId, tStart, tEnd, agentId };
  reservations.push(r);
  if (!byAgent.has(agentId)) byAgent.set(agentId, []);
  byAgent.get(agentId).push(r);
}

/**
 * 预定单点 (x,z) 在 [tStart, tEnd] 时段
 */
export function reservePoint(x, z, tStart, tEnd, agentId) {
  reserve(makeCellId(x, z), tStart, tEnd, agentId);
}

/**
 * 预定“资源”在 [tStart, tEnd]（例如 res_mp_27）。
 * 资源与网格单元共享同一套预定表，区别仅在于 cellId 字段取不同命名空间。
 */
export function reserveResource(resourceId, tStart, tEnd, agentId) {
  reserve(resourceId, tStart, tEnd, agentId);
}

/**
 * 预定整条路径
 * @param {Array<{x,z}>} waypoints - 路径点序列
 * @param {number} startTime - 起点到达时间 (秒)
 * @param {number} speed - 移动速度 (m/s)
 * @param {string} agentId - 预定者 ID
 * @param {number} windowSec - 每点占用时间窗口的一半 (秒)，默认 0.5
 */
export function reservePath(waypoints, startTime, speed, agentId, windowSec = 0.5) {
  if (!waypoints || waypoints.length === 0) return;

  let cumDist = 0;
  const pointsWithT = [{ ...waypoints[0], t: startTime }];

  for (let i = 1; i < waypoints.length; i++) {
    const a = waypoints[i - 1];
    const b = waypoints[i];
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    cumDist += d;
    const t = startTime + cumDist / speed;
    pointsWithT.push({ ...b, t });
  }

  for (const p of pointsWithT) {
    const cellId = makeCellId(p.x, p.z);
    const tStart = Math.max(0, p.t - windowSec);
    const tEnd = p.t + windowSec;
    reserve(cellId, tStart, tEnd, agentId);
  }
}

/**
 * 检查单元在时刻 t 是否可用（无其他 agent 预定）
 * @param {string} cellId - 网格单元 ID
 * @param {number} t - 时刻 (秒)
 * @param {string} [excludeAgentId] - 排除的 agent（自身不阻挡自身）
 */
export function isAvailable(cellId, t, excludeAgentId = null) {
  for (const r of reservations) {
    if (r.cellId !== cellId) continue;
    if (excludeAgentId && r.agentId === excludeAgentId) continue;
    if (t >= r.tStart && t <= r.tEnd) return false;
  }
  return true;
}

/**
 * 检查 (x,z) 在时刻 t 是否可用
 */
export function isAvailableAt(x, z, t, excludeAgentId = null) {
  return isAvailable(makeCellId(x, z), t, excludeAgentId);
}

/**
 * 检查 (x,z) 在 [tStart, tEnd] 时段内是否与任何预定重叠
 */
export function isAvailableInRange(x, z, tStart, tEnd, excludeAgentId = null) {
  const cellId = makeCellId(x, z);
  for (const r of reservations) {
    if (r.cellId !== cellId) continue;
    if (excludeAgentId && r.agentId === excludeAgentId) continue;
    if (tStart <= r.tEnd && tEnd >= r.tStart) return false;
  }
  return true;
}

/**
 * 检查资源在 [tStart, tEnd] 是否可用（无其他 agent 预定）
 */
export function isResourceAvailableInRange(resourceId, tStart, tEnd, excludeAgentId = null) {
  for (const r of reservations) {
    if (r.cellId !== resourceId) continue;
    if (excludeAgentId && r.agentId === excludeAgentId) continue;
    if (tStart <= r.tEnd && tEnd >= r.tStart) return false;
  }
  return true;
}

/**
 * 获取当前占用某资源的 agentId（用于调试可视化）
 */
export function getResourceOwner(resourceId) {
  const tNow = getSimTime();
  for (const r of reservations) {
    if (r.cellId !== resourceId) continue;
    if (tNow >= r.tStart && tNow <= r.tEnd) return r.agentId;
  }
  return null;
}

/**
 * 释放某 agent 的所有预定
 */
export function releaseAgent(agentId) {
  const list = byAgent.get(agentId);
  if (!list) return;
  for (const r of list) {
    const idx = reservations.indexOf(r);
    if (idx >= 0) reservations.splice(idx, 1);
  }
  byAgent.delete(agentId);
}

/**
 * 检查路径是否与预定冲突（可用于车辆/机器人互相避让）
 * @param {Array<{x,z}>} waypoints - 路径点序列
 * @param {number} speed - 移动速度 (m/s)
 * @param {number} [startTime] - 出发时间，默认当前
 * @param {string} [excludeAgentId] - 排除的 agent（自身不阻挡自身）
 * @param {string|null} [onlyAgentPrefix] - 仅考虑指定前缀的预定（如 "vehicle_"）
 */
export function isPathBlocked(waypoints, speed, startTime = null, excludeAgentId = null, onlyAgentPrefix = null) {
  if (!waypoints || waypoints.length === 0) return false;
  const t0 = startTime ?? getSimTime();
  let cumDist = 0;
  for (let i = 0; i < waypoints.length; i++) {
    const t = t0 + cumDist / speed;
    const w = waypoints[i];
    const cellId = makeCellId(w.x, w.z);
    const tStart = Math.max(0, t - 0.5);
    const tEnd = t + 1;
    for (const r of reservations) {
      if (r.cellId !== cellId) continue;
      if (excludeAgentId && r.agentId === excludeAgentId) continue;
      if (onlyAgentPrefix && !r.agentId.startsWith(onlyAgentPrefix)) continue;
      if (tStart <= r.tEnd && tEnd >= r.tStart) return true;
    }
    if (i < waypoints.length - 1) {
      cumDist += Math.hypot(
        waypoints[i + 1].x - waypoints[i].x,
        waypoints[i + 1].z - waypoints[i].z
      );
    }
  }
  return false;
}

/**
 * 检查机器人路径是否与车辆预定冲突（保持旧 API 兼容）
 * @param {Array<{x,z}>} waypoints
 * @param {number} speed
 * @param {number} [startTime]
 */
export function isPathBlockedByVehicles(waypoints, speed, startTime = null) {
  return isPathBlocked(waypoints, speed, startTime, null, 'vehicle_');
}

/**
 * 供机器人查询：未来 horizonSec 秒内，(x,z) 是否会被车辆占用
 * @param {number} x - 查询点 x
 * @param {number} z - 查询点 z
 * @param {number} [horizonSec=3] - 前瞻时间 (秒)
 * @param {string} [excludeAgentId] - 排除的 agent
 */
export function willBeOccupiedByVehicle(x, z, horizonSec = 3, excludeAgentId = null) {
  const cellId = makeCellId(x, z);
  const tNow = getSimTime();
  const tEnd = tNow + horizonSec;
  for (const r of reservations) {
    if (excludeAgentId && r.agentId === excludeAgentId) continue;
    if (!r.agentId.startsWith('vehicle_')) continue; // 仅考虑车辆
    if (r.tEnd < tNow) continue; // 已过期
    if (r.tStart > tEnd) continue; // 超出前瞻
    if (r.cellId !== cellId) continue;
    return true;
  }
  return false;
}

function cellIndex(x, z) {
  return { ix: Math.round(x / CELL_SIZE), iz: Math.round(z / CELL_SIZE) };
}

function cellIdFromIndex(ix, iz) {
  return `c_${ix}_${iz}`;
}

/**
 * 查询未来一段时间内，“附近”网格是否会被车辆占用（用于机器人进入 conflict point 前预判车流）。
 * @param {number} x
 * @param {number} z
 * @param {number} tStart
 * @param {number} tEnd
 * @param {number} [radiusCells=1] - 邻域半径（网格单位），1 表示 3x3
 * @param {string} [excludeAgentId]
 */
export function willBeOccupiedByVehicleNear(x, z, tStart, tEnd, radiusCells = 1, excludeAgentId = null) {
  const { ix, iz } = cellIndex(x, z);
  const neighbor = new Set();
  for (let dx = -radiusCells; dx <= radiusCells; dx++) {
    for (let dz = -radiusCells; dz <= radiusCells; dz++) {
      neighbor.add(cellIdFromIndex(ix + dx, iz + dz));
    }
  }
  for (const r of reservations) {
    if (excludeAgentId && r.agentId === excludeAgentId) continue;
    if (!r.agentId.startsWith('vehicle_')) continue;
    if (r.tEnd < tStart) continue;
    if (r.tStart > tEnd) continue;
    if (!neighbor.has(r.cellId)) continue;
    return true;
  }
  return false;
}

export { makeCellId, CELL_SIZE };

// === Agent priority (for collision avoidance / preemption) ===
export const PRIORITY = {
  ROBOT_CHARGING: 3,
  ROBOT_NAVIGATING: 2,
  ROBOT_RETURNING: 1
};

const agentPriorities = new Map();

export function setAgentPriority(agentId, priority) {
  agentPriorities.set(agentId, priority);
}

export function getAgentPriority(agentId) {
  return agentPriorities.get(agentId) ?? 0;
}

export function cleanupExpiredReservations() {
  const tNow = getSimTime();
  for (let i = reservations.length - 1; i >= 0; i--) {
    if (reservations[i].tEnd < tNow) {
      const r = reservations[i];
      const list = byAgent.get(r.agentId);
      if (list) {
        const idx = list.indexOf(r);
        if (idx >= 0) list.splice(idx, 1);
      }
      reservations.splice(i, 1);
    }
  }
}

export function startAutoCleanup(intervalMs = 30000) {
  setInterval(cleanupExpiredReservations, intervalMs);
}

export function isPathBlockedByHigherPriority(waypoints, speed, startTime, excludeAgentId, myPriority) {
  return isPathBlocked(waypoints, speed, startTime, excludeAgentId, null);
}

export function getBlockingAgents(waypoints, speed, startTime, excludeAgentId) {
  const blockers = new Set();
  if (!waypoints || waypoints.length === 0) return [];
  const t0 = startTime ?? getSimTime();
  let cumDist = 0;
  for (let i = 0; i < waypoints.length; i++) {
    const t = t0 + cumDist / speed;
    const w = waypoints[i];
    const cellId = makeCellId(w.x, w.z);
    const tStart = Math.max(0, t - 0.5);
    const tEnd = t + 1;
    for (const r of reservations) {
      if (r.cellId !== cellId) continue;
      if (excludeAgentId && r.agentId === excludeAgentId) continue;
      if (tStart <= r.tEnd && tEnd >= r.tStart) blockers.add(r.agentId);
    }
    if (i < waypoints.length - 1) {
      cumDist += Math.hypot(waypoints[i + 1].x - waypoints[i].x, waypoints[i + 1].z - waypoints[i].z);
    }
  }
  return Array.from(blockers);
}
