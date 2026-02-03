/**
 * 交通协调：冲突段、车道让行、跟车距离
 * - 冲突段：(20.25,-22.5) 到 (20.25,-6.5)，1-24 与 25-44 出口转向点之间的垂直路段
 * - 该段有车时，其他车应等待
 * - 跟车距离 ≥ 一个车身 (4.2m)
 */

/** 冲突段：垂直路段 x=20.25, z∈[-22.5,-6.5]，严格限于路段内 */
export const CONFLICT_SEGMENT = { x: 20.25, zMin: -22.5, zMax: -6.5, xMargin: 0.5 };
export const CAR_LENGTH = 4.2;

export function getSlotGroup(slotIndex) {
  if (slotIndex >= 1 && slotIndex <= 24) return '1_24';
  if (slotIndex >= 25 && slotIndex <= 44) return '25_44';
  return null;
}

/**
 * 冲突段上是否有车（严格判断：须在垂直路段 x≈20、z 在 (-22.5,-6.5) 内）
 * 不含车道上的车、已驶离(y<0)的忽略
 */
export function isVehicleOnConflictSegment(vehicles, excludeVehicleId) {
  const { x, zMin, zMax, xMargin } = CONFLICT_SEGMENT;
  for (const v of vehicles) {
    if (v.id === excludeVehicleId) continue;
    if (!v.model || v.phase === 'parked' || v.phase === 'gone') continue;
    const p = v.model.position;
    if (p.y < 0) continue;
    if (Math.abs(p.x - x) > xMargin) continue;
    if (p.z < zMin || p.z > zMax) continue;
    return true;
  }
  return false;
}

/**
 * 车道后方（靠近入口方向）是否有车
 * 25-44 lane: z=-6.5, 后方 = x 更小
 * 1-24 lane: z=-22.5, 后方 = x 更小
 */
export function isVehicleBehindOnLane(vehicles, slotIndex, slotX, excludeVehicleId) {
  const g = getSlotGroup(slotIndex);
  const laneZ = g === '25_44' ? -6.5 : -22.5;
  for (const v of vehicles) {
    if (v.id === excludeVehicleId) continue;
    if (!v.model || v.phase === 'parked' || v.phase === 'gone') continue;
    const p = v.model.position;
    if (Math.abs(p.z - laneZ) > 2) continue;
    if (p.x < slotX - 1 && p.x > -24) return true;
  }
  return false;
}

/**
 * 前方是否有车过近（小于一个车身）
 * 根据当前行驶方向判断「前方」
 */
export function isVehicleAheadTooClose(vehicles, vehicle, dirX, dirZ) {
  const p = vehicle.model?.position;
  if (!p) return false;
  const len = Math.hypot(dirX, dirZ) || 1;
  const ux = dirX / len;
  const uz = dirZ / len;
  for (const v of vehicles) {
    if (v.id === vehicle.id) continue;
    if (!v.model || v.phase === 'parked' || v.phase === 'gone') continue;
    const op = v.model.position;
    const dx = op.x - p.x;
    const dz = op.z - p.z;
    const proj = dx * ux + dz * uz;
    if (proj <= 0) continue;
    const perp = Math.abs(dx * (-uz) + dz * ux);
    if (perp < 3 && proj < CAR_LENGTH + 1) return true;
  }
  return false;
}

/**
 * 进入时：目标车道入口附近是否有车（保持跟车距离）
 */
export function isVehicleNearEntryTurn(vehicles, slotGroup, excludeId) {
  const entryZ = slotGroup === '25_44' ? -6.5 : -22.5;
  const entryX = -22.25;
  for (const v of vehicles) {
    if (v.id === excludeId || !v.model) continue;
    if (v.phase === 'parked' || v.phase === 'gone') continue;
    const p = v.model.position;
    if (Math.abs(p.z - entryZ) > 3) continue;
    if (Math.abs(p.x - entryX) < CAR_LENGTH + 5) return true;
  }
  return false;
}

/**
 * 驶出时：车道上我们前方是否有车（保持跟车距离）
 */
export function isVehicleAheadOnExitLane(vehicles, slotIndex, slotX, excludeId) {
  const g = getSlotGroup(slotIndex);
  const laneZ = g === '25_44' ? -6.5 : -22.5;
  for (const v of vehicles) {
    if (v.id === excludeId || !v.model) continue;
    if (v.phase === 'parked' || v.phase === 'gone') continue;
    const p = v.model.position;
    if (Math.abs(p.z - laneZ) > 3) continue;
    if (p.x > slotX + 0.5 && p.x - slotX < CAR_LENGTH + 3) return true;
  }
  return false;
}
