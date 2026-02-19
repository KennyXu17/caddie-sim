/**
 * 关键区域资源锁（Mutex）
 * 替代复杂的时空预定表，用于出口走廊、交叉点、车位前节点等互斥资源
 */

const HEARTBEAT_TIMEOUT_MS = 20000;

/** resourceId -> { agentId, lockedAt } */
const locks = new Map();

/** agentId -> Set<resourceId> */
const byAgent = new Map();

/** agentId -> lastHeartbeat timestamp */
const heartbeats = new Map();

let _cleanupInterval = null;

/**
 * 尝试锁定资源
 * @param {string} resourceId - 如 res_exit_lane_corridor, res_cf_25_44_left, res_mp_27
 * @param {string} agentId - 如 robot_1, vehicle_1
 * @returns {boolean} 若资源未被占用则锁定并返回 true，否则返回 false
 */
export function tryLockResource(resourceId, agentId) {
  const existing = locks.get(resourceId);
  if (existing && existing.agentId !== agentId) return false;
  if (existing && existing.agentId === agentId) return true; // 已持有

  locks.set(resourceId, { agentId, lockedAt: Date.now() });
  if (!byAgent.has(agentId)) byAgent.set(agentId, new Set());
  byAgent.get(agentId).add(resourceId);
  heartbeats.set(agentId, Date.now());
  return true;
}

/**
 * 释放该 agent 持有的所有锁
 */
export function releaseResource(agentId) {
  const list = byAgent.get(agentId);
  if (!list) return;
  for (const rid of list) {
    const entry = locks.get(rid);
    if (entry && entry.agentId === agentId) locks.delete(rid);
  }
  byAgent.delete(agentId);
  heartbeats.delete(agentId);
}

/**
 * 更新 agent 心跳，防止被自动清理
 */
export function agentHeartbeat(agentId) {
  heartbeats.set(agentId, Date.now());
}

/**
 * 检查资源是否被占用（被其他 agent 占用）
 */
export function isResourceLocked(resourceId, excludeAgentId = null) {
  const entry = locks.get(resourceId);
  if (!entry) return false;
  if (excludeAgentId && entry.agentId === excludeAgentId) return false;
  return true;
}

/**
 * 获取占用该资源的 agentId
 */
export function getResourceOwner(resourceId) {
  const entry = locks.get(resourceId);
  return entry ? entry.agentId : null;
}

/**
 * 获取 agent 持有的所有资源 ID
 */
export function getAgentLocks(agentId) {
  return byAgent.get(agentId) ? Array.from(byAgent.get(agentId)) : [];
}

function cleanupStaleLocks() {
  const now = Date.now();
  for (const [agentId, last] of heartbeats.entries()) {
    if (now - last > HEARTBEAT_TIMEOUT_MS) {
      releaseResource(agentId);
    }
  }
}

/**
 * 启动自动清理（超过 HEARTBEAT_TIMEOUT_MS 未心跳的 agent 自动释放）
 */
export function startAutoCleanup(intervalMs = 5000) {
  if (_cleanupInterval) clearInterval(_cleanupInterval);
  _cleanupInterval = setInterval(cleanupStaleLocks, intervalMs);
}

/** 关键资源 ID 常量 */
export const RES = {
  EXIT_LANE_CORRIDOR: 'res_exit_lane_corridor',
  cf: (name) => `res_cf_${name}`,
  mp: (n) => `res_mp_${n}`
};
