/**
 * 时空预定表 (Reservation Table)
 *
 * 将空间轨迹点转化为时间维度的资源预定，供 Space-Time 导航与协同避让使用。
 * Phase 1: 车辆路径预定；后续 Phase: 机器人查询避让
 *
 * 数据结构：
 *   reservationSet  – Set<Record>         全量记录（O(1) 删除）
 *   byAgent         – Map<agentId, []>    按 agent 索引（快速 release）
 *   byCellId        – Map<cellId,  []>    按格子索引（O(1) 查询，替代 O(N) 全量扫描）
 */

const CELL_SIZE = 2; // 空间离散化网格大小 (m)

function makeCellId(x, z) {
  const ix = Math.round(x / CELL_SIZE);
  const iz = Math.round(z / CELL_SIZE);
  return `c_${ix}_${iz}`;
}

/** 预定记录: { cellId, tStart, tEnd, agentId } */
const reservationSet = new Set();         // O(1) has/delete
const byAgent        = new Map();         // agentId  → Record[]
const byCellId       = new Map();         // cellId   → Record[]  ← 核心索引

let _simTimeScale  = 1;
let _simTimeOrigin = 0;
let _realOrigin = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;

export function getSimTime() {
  const real = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
  return _simTimeOrigin + (real - _realOrigin) * _simTimeScale;
}

export function getSimTimeScale() { return _simTimeScale; }

export function setSimTimeScale(scale) {
  const t = getSimTime();
  _simTimeScale  = Math.max(0.1, Math.min(3600, Number(scale) || 1));
  _simTimeOrigin = t;
  _realOrigin    = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function _addToCellIndex(r) {
  let list = byCellId.get(r.cellId);
  if (!list) { list = []; byCellId.set(r.cellId, list); }
  list.push(r);
}

function _removeFromCellIndex(r) {
  const list = byCellId.get(r.cellId);
  if (!list) return;
  const i = list.indexOf(r);
  if (i >= 0) list.splice(i, 1);
  if (list.length === 0) byCellId.delete(r.cellId);
}

function _addToAgentIndex(r) {
  let list = byAgent.get(r.agentId);
  if (!list) { list = []; byAgent.set(r.agentId, list); }
  list.push(r);
}

// ── Public write API ──────────────────────────────────────────────────────────

export function reserve(cellId, tStart, tEnd, agentId) {
  const r = { cellId, tStart, tEnd, agentId };
  reservationSet.add(r);
  _addToAgentIndex(r);
  _addToCellIndex(r);
}

export function reservePoint(x, z, tStart, tEnd, agentId) {
  reserve(makeCellId(x, z), tStart, tEnd, agentId);
}

export function reserveResource(resourceId, tStart, tEnd, agentId) {
  reserve(resourceId, tStart, tEnd, agentId);
}

export function reservePath(waypoints, startTime, speed, agentId, windowSec = 0.5) {
  if (!waypoints || waypoints.length === 0) return;
  let cumDist = 0;
  const pts = [{ ...waypoints[0], t: startTime }];
  for (let i = 1; i < waypoints.length; i++) {
    const a = waypoints[i - 1], b = waypoints[i];
    cumDist += Math.hypot(b.x - a.x, b.z - a.z);
    pts.push({ ...b, t: startTime + cumDist / speed });
  }
  for (const p of pts) {
    reserve(makeCellId(p.x, p.z), Math.max(0, p.t - windowSec), p.t + windowSec, agentId);
  }
}

export function releaseAgent(agentId) {
  const list = byAgent.get(agentId);
  if (!list) return;
  for (const r of list) {
    reservationSet.delete(r);
    _removeFromCellIndex(r);
  }
  byAgent.delete(agentId);
}

// ── Query API (all O(cell_entries) instead of O(total_reservations)) ─────────

export function isAvailableInRange(x, z, tStart, tEnd, excludeAgentId = null) {
  const list = byCellId.get(makeCellId(x, z));
  if (!list) return true;
  for (const r of list) {
    if (excludeAgentId && r.agentId === excludeAgentId) continue;
    if (tStart <= r.tEnd && tEnd >= r.tStart) return false;
  }
  return true;
}

export function isResourceAvailableInRange(resourceId, tStart, tEnd, excludeAgentId = null) {
  const list = byCellId.get(resourceId);
  if (!list) return true;
  for (const r of list) {
    if (excludeAgentId && r.agentId === excludeAgentId) continue;
    if (tStart <= r.tEnd && tEnd >= r.tStart) return false;
  }
  return true;
}

export function getResourceOwner(resourceId) {
  const list = byCellId.get(resourceId);
  if (!list) return null;
  const tNow = getSimTime();
  for (const r of list) {
    if (tNow >= r.tStart && tNow <= r.tEnd) return r.agentId;
  }
  return null;
}

export function isPathBlocked(waypoints, speed, startTime = null, excludeAgentId = null, onlyAgentPrefix = null) {
  if (!waypoints || waypoints.length === 0) return false;
  const t0 = startTime ?? getSimTime();
  let cumDist = 0;
  for (let i = 0; i < waypoints.length; i++) {
    const t      = t0 + cumDist / speed;
    const cellId = makeCellId(waypoints[i].x, waypoints[i].z);
    const tS     = Math.max(0, t - 0.5);
    const tE     = t + 1;
    const list   = byCellId.get(cellId);
    if (list) {
      for (const r of list) {
        if (excludeAgentId && r.agentId === excludeAgentId) continue;
        if (onlyAgentPrefix && !r.agentId.startsWith(onlyAgentPrefix)) continue;
        if (tS <= r.tEnd && tE >= r.tStart) return true;
      }
    }
    if (i < waypoints.length - 1) {
      cumDist += Math.hypot(waypoints[i + 1].x - waypoints[i].x, waypoints[i + 1].z - waypoints[i].z);
    }
  }
  return false;
}

export function isPathBlockedByVehicles(waypoints, speed, startTime = null) {
  return isPathBlocked(waypoints, speed, startTime, null, 'vehicle_');
}

export function willBeOccupiedByVehicle(x, z, horizonSec = 3, excludeAgentId = null) {
  const cellId = makeCellId(x, z);
  const list   = byCellId.get(cellId);
  if (!list) return false;
  const tNow = getSimTime();
  const tEnd = tNow + horizonSec;
  for (const r of list) {
    if (excludeAgentId && r.agentId === excludeAgentId) continue;
    if (!r.agentId.startsWith('vehicle_')) continue;
    if (r.tEnd < tNow || r.tStart > tEnd) continue;
    return true;
  }
  return false;
}

function cellIndex(x, z) {
  return { ix: Math.round(x / CELL_SIZE), iz: Math.round(z / CELL_SIZE) };
}
function cellIdFromIndex(ix, iz) { return `c_${ix}_${iz}`; }

export function willBeOccupiedByVehicleNear(x, z, tStart, tEnd, radiusCells = 1, excludeAgentId = null) {
  const { ix, iz } = cellIndex(x, z);
  for (let dx = -radiusCells; dx <= radiusCells; dx++) {
    for (let dz = -radiusCells; dz <= radiusCells; dz++) {
      const list = byCellId.get(cellIdFromIndex(ix + dx, iz + dz));
      if (!list) continue;
      for (const r of list) {
        if (excludeAgentId && r.agentId === excludeAgentId) continue;
        if (!r.agentId.startsWith('vehicle_')) continue;
        if (r.tEnd < tStart || r.tStart > tEnd) continue;
        return true;
      }
    }
  }
  return false;
}

export function getBlockingAgents(waypoints, speed, startTime, excludeAgentId) {
  const blockers = new Set();
  if (!waypoints || waypoints.length === 0) return [];
  const t0 = startTime ?? getSimTime();
  let cumDist = 0;
  for (let i = 0; i < waypoints.length; i++) {
    const t      = t0 + cumDist / speed;
    const cellId = makeCellId(waypoints[i].x, waypoints[i].z);
    const tS     = Math.max(0, t - 0.5);
    const tE     = t + 1;
    const list   = byCellId.get(cellId);
    if (list) {
      for (const r of list) {
        if (excludeAgentId && r.agentId === excludeAgentId) continue;
        if (tS <= r.tEnd && tE >= r.tStart) blockers.add(r.agentId);
      }
    }
    if (i < waypoints.length - 1) {
      cumDist += Math.hypot(waypoints[i + 1].x - waypoints[i].x, waypoints[i + 1].z - waypoints[i].z);
    }
  }
  return Array.from(blockers);
}

// Kept for legacy compat (always delegates to isPathBlocked)
export function isPathBlockedByHigherPriority(waypoints, speed, startTime, excludeAgentId, _myPriority) {
  return isPathBlocked(waypoints, speed, startTime, excludeAgentId, null);
}

// ── Cleanup ───────────────────────────────────────────────────────────────────

export function cleanupExpiredReservations() {
  const tNow = getSimTime();
  for (const r of reservationSet) {
    if (r.tEnd >= tNow) continue;
    reservationSet.delete(r);
    // Remove from byAgent
    const agentList = byAgent.get(r.agentId);
    if (agentList) {
      const ai = agentList.indexOf(r);
      if (ai >= 0) agentList.splice(ai, 1);
    }
    // Remove from byCellId
    _removeFromCellIndex(r);
  }
}

export function startAutoCleanup(intervalMs = 30000) {
  setInterval(cleanupExpiredReservations, intervalMs);
}

// ── Kept for backward compat / legacy callers ─────────────────────────────────
export function isAvailableAt(x, z, t, excludeAgentId = null) {
  const list = byCellId.get(makeCellId(x, z));
  if (!list) return true;
  for (const r of list) {
    if (excludeAgentId && r.agentId === excludeAgentId) continue;
    if (t >= r.tStart && t <= r.tEnd) return false;
  }
  return true;
}

export { makeCellId, CELL_SIZE };

// === Agent priority ============================================================
export const PRIORITY = {
  ROBOT_CHARGING:   3,
  ROBOT_NAVIGATING: 2,
  ROBOT_RETURNING:  1,
};

const agentPriorities = new Map();
export function setAgentPriority(agentId, priority) { agentPriorities.set(agentId, priority); }
export function getAgentPriority(agentId) { return agentPriorities.get(agentId) ?? 0; }
