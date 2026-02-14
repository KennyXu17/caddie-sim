/**
 * 交通协调：冲突段、车道让行、跟车距离
 * - 冲突段：(20.25,-22.5) 到 (20.25,-6.5)，1-24 与 25-44 出口转向点之间的垂直路段
 * - 该段有车时，其他车应等待
 * - 跟车距离 ≥ 一个车身 (4.2m)
 * - Reverse Safety Zone: 倒车时按图结构检查前方车道节点(V:slot_xx_yy)及边上车辆、同行 R:MP 节点及边上机器人
 */

import { getVehicleLaneGraphData, getReverseSafetyZoneVehicleNodeIds } from './vehicle_lane_graph.js';
import { getMovePointPosition } from './topology.js';

/** 冲突段：垂直路段 x=20.25, z∈[-22.5,-6.5]，严格限于路段内 */
export const CONFLICT_SEGMENT = { x: 20.25, zMin: -22.5, zMax: -6.5, xMargin: 0.5 };
export const CAR_LENGTH = 4.2;

/** 倒车安全区检测半径（节点/边附近） */
const REVERSE_ZONE_RADIUS = 2.5;

/** Row 3 (25-34): turn_3_right -> MP34 -> ... -> MP25. Row 4 (35-44): turn_4_left -> MP35 -> ... -> MP44. */
function getSpotRow(slotIndex) {
  if (slotIndex >= 1 && slotIndex <= 14) return 1;
  if (slotIndex >= 15 && slotIndex <= 24) return 2;
  if (slotIndex >= 25 && slotIndex <= 34) return 3;
  if (slotIndex >= 35 && slotIndex <= 44) return 4;
  return 3;
}

/**
 * Robot reverse safety zone: R:MP nodes to check (same row, direction per row).
 * Row 4: MP35->MP36->...->MP44, zone for slot 37 = [35,36,37] (slot and 2 before).
 * Row 3: MP34->...->MP25, zone for slot 27 = [27,28,29] (segment MP29->MP28->MP27).
 */
export function getReverseSafetyZoneRobotSpotIndices(slotIndex) {
  const row = getSpotRow(slotIndex);
  const out = [];
  if (row === 4) {
    const start = Math.max(35, slotIndex - 2);
    for (let i = start; i <= slotIndex; i++) out.push(i);
  } else if (row === 3) {
    const end = Math.min(34, slotIndex + 2);
    for (let i = slotIndex; i <= end; i++) out.push(i);
  } else if (row === 2) {
    const start = Math.max(15, slotIndex - 2);
    for (let i = start; i <= slotIndex; i++) out.push(i);
  } else if (row === 1) {
    const end = Math.min(14, slotIndex + 2);
    for (let i = slotIndex; i <= end; i++) out.push(i);
  }
  return out;
}

/**
 * Check points for reverse safety zone: vehicle lane nodes + edges, robot MP positions.
 */
export function getReverseSafetyZoneCheckPoints(slotIndex, getVehicleNodePos) {
  const vehicleNodeIds = getReverseSafetyZoneVehicleNodeIds(slotIndex);
  const data = getVehicleLaneGraphData();
  const nodeById = new Map(data.nodes.map((n) => [n.id, n]));
  const vehiclePoints = [];
  for (const id of vehicleNodeIds) {
    const n = nodeById.get(id) || (getVehicleNodePos && getVehicleNodePos(id));
    if (n && typeof n.x === 'number' && typeof n.z === 'number') vehiclePoints.push({ x: n.x, z: n.z });
    // 车道节点对应的车位（如 slot_28_38 -> S28, S38）也加入检测，避免倒车时忽略停在该段车位上的车
    const laneNode = nodeById.get(id);
    const slotIndices = laneNode?.meta?.slotIndices;
    if (Array.isArray(slotIndices)) {
      for (const spotIdx of slotIndices) {
        const spotNode = nodeById.get(`S${spotIdx}`) || (getVehicleNodePos && getVehicleNodePos(`S${spotIdx}`));
        if (spotNode && typeof spotNode.x === 'number' && typeof spotNode.z === 'number')
          vehiclePoints.push({ x: spotNode.x, z: spotNode.z });
      }
    }
  }
  for (let i = 0; i < vehicleNodeIds.length - 1; i++) {
    const a = nodeById.get(vehicleNodeIds[i]) || (getVehicleNodePos && getVehicleNodePos(vehicleNodeIds[i]));
    const b = nodeById.get(vehicleNodeIds[i + 1]) || (getVehicleNodePos && getVehicleNodePos(vehicleNodeIds[i + 1]));
    if (a && b && typeof a.x === 'number' && typeof b.x === 'number') {
      const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
      vehiclePoints.push(mid);
    }
  }
  const robotPoints = [];
  for (const spotIdx of getReverseSafetyZoneRobotSpotIndices(slotIndex)) {
    const p = getMovePointPosition(spotIdx);
    if (p && typeof p.x === 'number' && typeof p.z === 'number') robotPoints.push({ x: p.x, z: p.z });
  }
  return { vehiclePoints, robotPoints };
}

/**
 * True if any vehicle (except excludeId) is within REVERSE_ZONE_RADIUS of the reverse safety zone (vehicle nodes/edges).
 */
export function isVehicleInReverseSafetyZone(vehicles, slotIndex, excludeVehicleId, getVehicleNodePos) {
  const { vehiclePoints } = getReverseSafetyZoneCheckPoints(slotIndex, getVehicleNodePos);
  if (!vehiclePoints.length) return false;
  const r2 = REVERSE_ZONE_RADIUS * REVERSE_ZONE_RADIUS;
  for (const v of vehicles) {
    if (v.id === excludeVehicleId) continue;
    if (!v.model || v.phase === 'gone') continue;
    // 含 parked：该段车道及对应车位（如 S28,S29,S30）上有车则不能倒车
    const p = v.model.position;
    if (p.y < 0) continue;
    for (const q of vehiclePoints) {
      const dx = p.x - q.x;
      const dz = p.z - q.z;
      if (dx * dx + dz * dz <= r2) return true;
    }
  }
  return false;
}

/**
 * True if any robot is within REVERSE_ZONE_RADIUS of the reverse safety zone (R:MP nodes).
 */
export function isRobotInReverseSafetyZone(robots, slotIndex) {
  const { robotPoints } = getReverseSafetyZoneCheckPoints(slotIndex, null);
  if (!robotPoints.length) return false;
  const r2 = REVERSE_ZONE_RADIUS * REVERSE_ZONE_RADIUS;
  for (const r of robots) {
    if (!r.model || !r.model.position) continue;
    const p = r.model.position;
    for (const q of robotPoints) {
      const dx = p.x - q.x;
      const dz = p.z - q.z;
      if (dx * dx + dz * dz <= r2) return true;
    }
  }
  return false;
}

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
