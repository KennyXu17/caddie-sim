import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { DecalGeometry } from 'three/examples/jsm/geometries/DecalGeometry.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { FXAAPass } from 'three/examples/jsm/postprocessing/FXAAPass.js';
import { gsap } from "gsap";
import { OrderManager, PARKING_SPOTS } from './orderSystem.js';
import { collisionAvoidance } from './pathfinding.js';
import { LOT_BOUNDS } from './parking_map.js';
import { planVehicleEnterTrajectory, planVehicleEnterTrajectoryFromKeypoints, planVehicleExitTrajectory, planVehicleEnterSmartPath, planVehicleExitSmartPath, buildSmartPath, buildSmartPathFromKeypoints, smartPathToDensePoints, getVehicleTrajectoryKeypoints, getSlotTurnId, getSlotTurnArcForEgress, sampleArcReverse, getTurnRadiusForKeypoint, KP, KP_NODES, KP_EDGES } from './keypoint_graph.js';
import { getVehicleLaneGraphData } from './vehicle_lane_graph.js';
import { findPathTopo, findPathTopoST, isCrossingSegment, getSpotRow, getGraphData, getChargePointPosition, getCharge0Position, getMovePointPosition, getLeaveTargetFromCharge0 } from './topology.js';
import {
  getSlotGroup,
  isVehicleBehindOnLane,
  isVehicleNearEntryTurn,
  isVehicleAheadOnExitLane,
  isVehicleInReverseSafetyZone,
  isRobotInReverseSafetyZone
} from './traffic_coordinator.js';
import { 
  reservePath, reservePoint, reserveResource, releaseAgent, getSimTime, setSimTimeScale,
  isPathBlocked, isAvailableInRange, isResourceAvailableInRange, 
  willBeOccupiedByVehicleNear, CELL_SIZE, PRIORITY,
  setAgentPriority, getAgentPriority, startAutoCleanup, cleanupExpiredReservations,
  isPathBlockedByHigherPriority, getBlockingAgents
} from './reservation_table.js';
import {
  initFrameExporter, captureFrame, getExportStatus, setExportConfig
} from './frame_exporter.js';
import {
  STEERING_CONFIG,
  angleDiff,
  normalizeAngleShortestPath,
  clampSteeringAngle,
  getLookAheadTarget,
  getDesiredRotation,
  getMinTurnDurationForForce
} from './vehicle_steering.js';
if (typeof window !== 'undefined') window.STEERING_CONFIG = STEERING_CONFIG;

const PARKING_LOT_BOUNDS = {
  topLeft: { x: LOT_BOUNDS.minX, z: LOT_BOUNDS.minZ },
  bottomRight: { x: LOT_BOUNDS.maxX, z: LOT_BOUNDS.maxZ },
  contains(x, z) { return LOT_BOUNDS.contains(x, z); }
};

// === UI Setup ===
if (!document.getElementById('main-title')) {
  const titleDiv = document.createElement('div');
  titleDiv.id = 'main-title';
  titleDiv.textContent = 'EV Charging Robot Simulator';
  titleDiv.style.position = 'fixed';
  titleDiv.style.top = '16px';
  titleDiv.style.left = '50%';
  titleDiv.style.transform = 'translateX(-50%)';
  titleDiv.style.fontSize = '2.2rem';
  titleDiv.style.fontWeight = 'bold';
  titleDiv.style.color = '#0078ff';
  titleDiv.style.background = 'rgba(255,255,255,0.92)';
  titleDiv.style.padding = '10px 36px';
  titleDiv.style.borderRadius = '12px';
  titleDiv.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)';
  titleDiv.style.zIndex = '10000';
  titleDiv.style.fontFamily = 'sans-serif';
  titleDiv.style.display = 'none';
  document.body.appendChild(titleDiv);
}

// === Console UI === (隐藏)
if (!document.getElementById('comment-container')) {
  const commentDiv = document.createElement('div');
  commentDiv.id = 'comment-container';
  commentDiv.style.position = 'fixed';
  commentDiv.style.top = '60px';
  commentDiv.style.right = '60px';
  commentDiv.style.width = '280px';
  commentDiv.style.maxHeight = '60vh';
  commentDiv.style.overflowY = 'auto';
  commentDiv.style.background = 'rgba(255,255,255,0.95)';
  commentDiv.style.border = '1px solid #e0e0e0';
  commentDiv.style.borderRadius = '8px';
  commentDiv.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)';
  commentDiv.style.padding = '16px';
  commentDiv.style.zIndex = '9999';
  commentDiv.style.fontFamily = 'sans-serif';
  commentDiv.style.display = 'none'; // 隐藏console UI
  commentDiv.innerHTML = '<div style="font-weight:bold;font-size:18px;margin-bottom:10px;color:#0078ff;">Console</div>';
  document.body.appendChild(commentDiv);
}

function addComment(msg) {
  const comment = document.createElement('div');
  comment.textContent = msg;
  comment.style.margin = '6px 0';
  comment.style.fontSize = '14px';
  comment.style.color = '#222';
  comment.style.background = '#f5f7fa';
  comment.style.borderRadius = '4px';
  comment.style.padding = '6px 10px';
  document.getElementById('comment-container').appendChild(comment);
  const container = document.getElementById('comment-container');
  container.scrollTop = container.scrollHeight;
}

// Densify path so reservations cover edges, not just nodes.
function densifyWaypoints(waypoints, stepM = Math.max(0.5, CELL_SIZE / 2)) {
  if (!Array.isArray(waypoints) || waypoints.length < 2) return waypoints ?? [];
  const out = [{ x: waypoints[0].x, z: waypoints[0].z }];
  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i];
    const b = waypoints[i + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-6) continue;
    const steps = Math.max(1, Math.ceil(len / stepM));
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      out.push({ x: a.x + t * dx, z: a.z + t * dz });
    }
  }
  return out;
}

function pathDistance(waypoints) {
  if (!Array.isArray(waypoints) || waypoints.length < 2) return 0;
  let d = 0;
  for (let i = 1; i < waypoints.length; i++) {
    d += Math.hypot(waypoints[i].x - waypoints[i - 1].x, waypoints[i].z - waypoints[i - 1].z);
  }
  return d;
}

/**
 * Format waypoints into a readable path string for logging
 * @param {Array} waypoints - Array of waypoint objects with id/type/spotIndex
 * @param {string} agentType - 'robot' or 'vehicle'
 * @returns {string} Formatted path string like "R:MP27 -> R:turn_3_left -> R:MP26"
 */
function formatPathString(waypoints, agentType = 'robot') {
  if (!Array.isArray(waypoints) || waypoints.length === 0) return '(empty path)';
  
  const prefix = agentType === 'robot' ? 'R:' : 'V:';
  
  return waypoints.map(wp => {
    if (!wp) return '?';
    // Use id if available
    if (wp.id) {
      if (wp.id.startsWith('move_')) {
        const spotIdx = wp.id.replace('move_', '');
        return `${prefix}MP${spotIdx}`;
      }
      if (wp.id.startsWith('turn_')) {
        return `${prefix}${wp.id}`;
      }
      if (wp.id.startsWith('cf_')) {
        return `${prefix}CF_${wp.id.replace('cf_', '')}`;
      }
      return `${prefix}${wp.id}`;
    }
    // Fallback to type-based naming
    if (wp.type === 'move' && wp.spotIndex != null) {
      return `${prefix}MP${wp.spotIndex}`;
    }
    if (wp.type === 'turn') {
      return `${prefix}turn_${wp.row}_${wp.side}`;
    }
    if (wp.type === 'conflict') {
      return `${prefix}CF_${wp.slotGroup}_${wp.side}`;
    }
    // Position-based fallback
    return `(${wp.x?.toFixed(1) ?? '?'},${wp.z?.toFixed(1) ?? '?'})`;
  }).join(' -> ');
}

/**
 * Log the planned path for an agent
 */
function logAgentPath(agentId, waypoints, destination, missionType = 'navigate') {
  const pathStr = formatPathString(waypoints);
  const destStr = destination ? `[dest: ${destination}]` : '';
  console.log(`📍 ${agentId} ${missionType} path: ${pathStr} ${destStr}`);
}

/**
 * Get vehicle trajectory nodes (trajectory waypoints only, no R:CF/R:MP).
 * Format: V:entrance -> V:turn_* -> V:slot_* -> S*
 */
function getVehicleEnterPathNodes(slotIndex, slotCenter = null) {
  const spot = PARKING_SPOTS.find(s => s.index === slotIndex);
  const center = slotCenter || (spot ? { x: spot.x, z: spot.z } : { x: 0, z: 0 });
  const kps = getVehicleTrajectoryKeypoints(slotIndex, center, 'enter');
  if (!kps.length) return ['V:entrance', `S${slotIndex}`];
  return kps.map(kp => kp.id).filter(Boolean);
}

/**
 * Get vehicle exit trajectory nodes: S* -> V:slot_* -> V:turn_* -> V:exit
 */
function getVehicleExitPathNodes(slotIndex, slotCenter = null) {
  const spot = PARKING_SPOTS.find(s => s.index === slotIndex);
  const center = slotCenter || (spot ? { x: spot.x, z: spot.z } : { x: 0, z: 0 });
  const kps = getVehicleTrajectoryKeypoints(slotIndex, center, 'exit');
  if (!kps.length) return [`S${slotIndex}`, 'V:exit'];
  return kps.map(kp => kp.id).filter(Boolean);
}

// Maximum wait time before forcing resume (deadlock prevention)
const GATE_TIMEOUT_MS = 15000;

// Dynamic re-planning threshold: if blocked for this long, attempt to find alternate path
const REPLAN_THRESHOLD_MS = 5000;
const MAX_REPLAN_ATTEMPTS = 3;

function addGateWaitAtPoint(tl, x, z, agentId, holdSec = 0.8, pollMs = 200) {
  if (!tl) return;
  tl.call(() => {
    // If occupied (by others), pause timeline and poll until free.
    const checkFree = () => {
      const t = getSimTime();
      return isAvailableInRange(x, z, t, t + holdSec, agentId);
    };
    if (checkFree()) return;
    tl.pause();
    const waitStart = Date.now();
    const poll = () => {
      if (!tl || !tl.paused()) return;
      // Timeout-based deadlock recovery
      if (Date.now() - waitStart > GATE_TIMEOUT_MS) {
        console.warn(`⚠️ ${agentId} gate timeout at (${x.toFixed(1)}, ${z.toFixed(1)}), forcing resume`);
        tl.resume();
        return;
      }
      if (checkFree()) {
        tl.resume();
        return;
      }
      setTimeout(poll, pollMs);
    };
    setTimeout(poll, pollMs);
  });
}

function mpResId(spotIndex) {
  return `res_mp_${spotIndex}`;
}

/** Callback-based gate wait. Calls onFree when resource/point is available. */
function waitForResourceAndPoint(x, z, resourceId, agentId, holdSec, pollMs, onFree) {
  const checkFree = () => {
    const t = getSimTime();
    const okPoint = isAvailableInRange(x, z, t, t + holdSec, agentId);
    const okRes = resourceId ? isResourceAvailableInRange(resourceId, t, t + holdSec, agentId) : true;
    const okPhysical = !isOccupiedPhysically(x, z, agentId, 1.0);
    return okPoint && okRes && okPhysical;
  };
  if (checkFree()) {
    onFree();
    return;
  }
  const waitStart = Date.now();
  const poll = () => {
    if (Date.now() - waitStart > GATE_TIMEOUT_MS) {
      onFree();
      return;
    }
    if (checkFree()) {
      onFree();
      return;
    }
    setTimeout(poll, pollMs);
  };
  setTimeout(poll, pollMs);
}

/**
 * 车辆进入车位前需判断的“机器人经过车位中心线”检测点：R:MP(slot)、邻位 C(next)_0 与 C(next)，以及 C(next)_0->R:MP、C(next)->R:MP 两段边。
 * 邻位：slotIndex < 44 取 slotIndex+1，否则取 slotIndex-1。
 */
function getVehicleSlotApproachRobotPoints(slotIndex) {
  const mp = getMovePointPosition(slotIndex);
  if (!mp) return [];
  const nextSlot = slotIndex < 44 ? slotIndex + 1 : slotIndex - 1;
  const c0 = getCharge0Position(nextSlot);
  const ci = getChargePointPosition(nextSlot);
  const points = [{ x: mp.x, z: mp.z }];
  if (c0) {
    points.push({ x: c0.x, z: c0.z });
    points.push({ x: (c0.x + mp.x) / 2, z: (c0.z + mp.z) / 2 });
  }
  if (ci) {
    points.push({ x: ci.x, z: ci.z });
    points.push({ x: (ci.x + mp.x) / 2, z: (ci.z + mp.z) / 2 });
  }
  return points;
}

/** 车辆进入车位前：等待车位中心线相关节点与边（R:MP、C_next_0->R:MP、C_next->R:MP）上无机器人后再执行 onFree。 */
function waitUntilSlotApproachClear(slotIndex, pollMs, onFree) {
  const points = getVehicleSlotApproachRobotPoints(slotIndex);
  if (!points.length) {
    onFree();
    return;
  }
  const radius = 1.0;
  const checkClear = () => points.every((p) => !isRobotAtPosition(p.x, p.z, null, radius));
  if (checkClear()) {
    onFree();
    return;
  }
  const waitStart = Date.now();
  const poll = () => {
    if (Date.now() - waitStart > GATE_TIMEOUT_MS) {
      onFree();
      return;
    }
    if (checkClear()) {
      onFree();
      return;
    }
    setTimeout(poll, pollMs);
  };
  setTimeout(poll, pollMs);
}

function laneResId(x, z) {
  return `res_lane_${x.toFixed(3)}_${z.toFixed(3)}`;
}

// Exit lane corridor resource (x=20.25, z from -22.5 to -6.5)
// Only one vehicle can use this corridor segment at a time to prevent conflicts
const EXIT_LANE_RESOURCE = 'res_exit_lane_corridor';
const EXIT_CORRIDOR_X = 20.25;
const EXIT_CORRIDOR_Z_MIN = -22.5;
const EXIT_CORRIDOR_Z_MAX = -6.5;
const EXIT_CORRIDOR_X_MARGIN = 1.5;

function isInExitCorridor(x, z) {
  return Math.abs(x - EXIT_CORRIDOR_X) <= EXIT_CORRIDOR_X_MARGIN &&
         z >= EXIT_CORRIDOR_Z_MIN && z <= EXIT_CORRIDOR_Z_MAX;
}

function pathUsesExitCorridor(waypoints) {
  if (!Array.isArray(waypoints) || waypoints.length < 2) return false;
  for (const wp of waypoints) {
    if (isInExitCorridor(wp.x, wp.z)) return true;
  }
  return false;
}

// Add gate wait for exit corridor - ensures only one vehicle in corridor at a time
function addGateWaitForExitCorridor(tl, agentId, transitTimeSec = 3, pollMs = 200) {
  if (!tl) return;
  tl.call(() => {
    const checkFree = () => {
      const t = getSimTime();
      return isResourceAvailableInRange(EXIT_LANE_RESOURCE, t, t + transitTimeSec, agentId);
    };
    const claimCorridor = () => {
      const t = getSimTime();
      reserveResource(EXIT_LANE_RESOURCE, t, t + transitTimeSec, agentId);
    };
    if (checkFree()) {
      claimCorridor();
      return;
    }
    tl.pause();
    const waitStart = Date.now();
    const poll = () => {
      if (!tl || !tl.paused()) return;
      // Timeout-based deadlock recovery
      if (Date.now() - waitStart > GATE_TIMEOUT_MS) {
        console.warn(`⚠️ ${agentId} exit corridor timeout, forcing resume`);
        claimCorridor();
        tl.resume();
        return;
      }
      if (checkFree()) {
        claimCorridor();
        tl.resume();
        return;
      }
      setTimeout(poll, pollMs);
    };
    setTimeout(poll, pollMs);
  });
}

function addGateWaitAtResourceAndPoint(tl, x, z, resourceId, agentId, holdSec = 0.8, pollMs = 200, shouldClaim = false) {
  if (!tl) return;
  tl.call(() => {
    const checkFree = () => {
      const t = getSimTime();
      const okPoint = isAvailableInRange(x, z, t, t + holdSec, agentId);
      const okRes = resourceId ? isResourceAvailableInRange(resourceId, t, t + holdSec, agentId) : true;
      const okPhysical = !isOccupiedPhysically(x, z, agentId, 1.0);
      return okPoint && okRes && okPhysical;
    };
    const doClaim = () => {
      if (!shouldClaim || !resourceId) return;
      const t = getSimTime();
      reserveResource(resourceId, t, t + holdSec, agentId);
    };
    if (checkFree()) {
      doClaim();
      return;
    }
    tl.pause();
    const waitStart = Date.now();
    const poll = () => {
      if (!tl || !tl.paused()) return;
      // Timeout-based deadlock recovery
      if (Date.now() - waitStart > GATE_TIMEOUT_MS) {
        console.warn(`⚠️ ${agentId} resource gate timeout at (${x.toFixed(1)}, ${z.toFixed(1)}), forcing resume`);
        doClaim(); // Attempt to claim anyway
        tl.resume();
        return;
      }
      if (checkFree()) {
        doClaim();
        tl.resume();
        return;
      }
      setTimeout(poll, pollMs);
    };
    setTimeout(poll, pollMs);
  });
}

function isOccupiedPhysically(x, z, excludeAgentId = null, radius = 1.0) {
  const r2 = radius * radius;
  for (const v of vehicles) {
    if (!v?.model?.position) continue;
    const id = `vehicle_${v.id}`;
    if (excludeAgentId && id === excludeAgentId) continue;
    const dx = v.model.position.x - x;
    const dz = v.model.position.z - z;
    if (dx * dx + dz * dz <= r2) return true;
  }
  for (const rb of chargingRobots) {
    if (!rb?.model?.position) continue;
    const id = `robot_${rb.id}`;
    if (excludeAgentId && id === excludeAgentId) continue;
    const dx = rb.model.position.x - x;
    const dz = rb.model.position.z - z;
    if (dx * dx + dz * dz <= r2) return true;
  }
  return false;
}

function isVehicleNearPhysically(x, z, radius = 1.5) {
  const r2 = radius * radius;
  for (const v of vehicles) {
    if (!v?.model?.position) continue;
    const dx = v.model.position.x - x;
    const dz = v.model.position.z - z;
    if (dx * dx + dz * dz <= r2) return true;
  }
  return false;
}

/** 仅检查是否有其他机器人在 (x,z) 半径内（不含 excludeAgentId） */
function isRobotAtPosition(x, z, excludeAgentId = null, radius = 1.0) {
  const r2 = radius * radius;
  for (const rb of chargingRobots) {
    if (!rb?.model?.position) continue;
    const id = `robot_${rb.id}`;
    if (excludeAgentId && id === excludeAgentId) continue;
    const dx = rb.model.position.x - x;
    const dz = rb.model.position.z - z;
    if (dx * dx + dz * dz <= r2) return true;
  }
  return false;
}

/** 进入下一节点前：等待下一节点 (toP) 无其他机器人 */
function addGateWaitUntilNextNodeClear(tl, toP, agentId, radius = 1.0, pollMs = 200) {
  if (!tl || !toP) return;
  tl.call(() => {
    const checkClear = () => !isRobotAtPosition(toP.x, toP.z, agentId, radius);
    if (checkClear()) return;
    tl.pause();
    const waitStart = Date.now();
    const poll = () => {
      if (!tl || !tl.paused()) return;
      if (Date.now() - waitStart > GATE_TIMEOUT_MS) {
        console.warn(`⚠️ ${agentId} next-node-clear gate timeout at (${toP.x.toFixed(1)}, ${toP.z.toFixed(1)}), forcing resume`);
        tl.resume();
        return;
      }
      if (checkClear()) {
        tl.resume();
        return;
      }
      setTimeout(poll, pollMs);
    };
    setTimeout(poll, pollMs);
  });
}

/** 从 Cxx_0 进入下一节点前：等待整段 (fromP->toP) 节点与边上无其他机器人 */
function addGateWaitUntilSegmentClear(tl, fromP, toP, agentId, radius = 1.0, pollMs = 200) {
  if (!tl || !fromP || !toP) return;
  const points = [
    { x: fromP.x, z: fromP.z },
    { x: (fromP.x + toP.x) / 2, z: (fromP.z + toP.z) / 2 },
    { x: toP.x, z: toP.z }
  ];
  tl.call(() => {
    const checkClear = () => points.every(p => !isRobotAtPosition(p.x, p.z, agentId, radius));
    if (checkClear()) return;
    tl.pause();
    const waitStart = Date.now();
    const poll = () => {
      if (!tl || !tl.paused()) return;
      if (Date.now() - waitStart > GATE_TIMEOUT_MS) {
        console.warn(`⚠️ ${agentId} segment-clear gate timeout, forcing resume`);
        tl.resume();
        return;
      }
      if (checkClear()) {
        tl.resume();
        return;
      }
      setTimeout(poll, pollMs);
    };
    setTimeout(poll, pollMs);
  });
}

function addGateWaitBeforeConflict(tl, x, z, agentId, horizonSec = 3, radiusCells = 1, pollMs = 200) {
  if (!tl) return;
  tl.call(() => {
    const checkSafe = () => {
      const t = getSimTime();
      const willVehicleCome = willBeOccupiedByVehicleNear(x, z, t, t + horizonSec, radiusCells, agentId);
      const nearNow = isVehicleNearPhysically(x, z, 1.8);
      return !willVehicleCome && !nearNow;
    };
    if (checkSafe()) return;
    tl.pause();
    const waitStart = Date.now();
    const poll = () => {
      if (!tl || !tl.paused()) return;
      // Timeout-based deadlock recovery
      if (Date.now() - waitStart > GATE_TIMEOUT_MS) {
        console.warn(`⚠️ ${agentId} conflict gate timeout at (${x.toFixed(1)}, ${z.toFixed(1)}), forcing resume`);
        tl.resume();
        return;
      }
      if (checkSafe()) {
        tl.resume();
        return;
      }
      setTimeout(poll, pollMs);
    };
    setTimeout(poll, pollMs);
  });
}

/** 从 Ci 前往 R:MPi 前：等待 R:MPi 节点及 Ci-R:MPi 边无其他机器人 */
function addGateWaitForCiToMP(tl, fromCi, toMP, SPEED, agentId, pollMs = 200) {
  if (!tl) return;
  tl.call(() => {
    const checkFree = () => {
      const t = getSimTime();
      const pathFree = !isPathBlocked([fromCi, toMP], SPEED, t, agentId);
      const mpFree = !isOccupiedPhysically(toMP.x, toMP.z, agentId, 1.0);
      return pathFree && mpFree;
    };
    if (checkFree()) return;
    tl.pause();
    const waitStart = Date.now();
    const poll = () => {
      if (!tl || !tl.paused()) return;
      if (Date.now() - waitStart > GATE_TIMEOUT_MS) {
        console.warn(`⚠️ ${agentId} Ci->MP gate timeout, forcing resume`);
        tl.resume();
        return;
      }
      if (checkFree()) {
        tl.resume();
        return;
      }
      setTimeout(poll, pollMs);
    };
    setTimeout(poll, pollMs);
  });
}

/** R:MPi -> Ci：右转90°、直行、左转90° */
function addMPtoCiManeuver(tl, model, fromMP, toCi, spot, SPEED, rot, ROBOT_Y) {
  const dist = Math.hypot(toCi.x - fromMP.x, toCi.z - fromMP.z);
  const dur = Math.max(0.05, dist / SPEED);
  const turnDur = 0.25;
  const rawAngleToCi = rot(toCi.x - fromMP.x, toCi.z - fromMP.z);
  const currentRotation = model.rotation?.y ?? 0;
  const angleToCi = normalizeAngleShortestPath(currentRotation, rawAngleToCi);
  tl.to(model.rotation, { 
    y: angleToCi, 
    duration: turnDur, 
    ease: "power1.inOut",
    onComplete: () => {
      // Ensure model rotation is updated
      model.rotation.y = angleToCi;
    }
  });
  tl.to(model.position, { x: toCi.x, z: toCi.z, y: ROBOT_Y, duration: dur, ease: "none" });
  // 到达 Ci 时转 90° 面向车位（方向与之前相反，修正朝向）
  const rawAngleAtCi = angleToCi + Math.PI / 2;
  const angleAtCi = normalizeAngleShortestPath(angleToCi, rawAngleAtCi);
  tl.to(model.rotation, {
    y: angleAtCi,
    duration: turnDur,
    ease: "power1.inOut",
    onComplete: () => {
      model.rotation.y = angleAtCi;
    }
  });
}

/** Ci -> R:MPi：离开充电点时先反向转 90° 再直行回 MP */
function addCiToMPManeuver(tl, model, fromCi, toMP, SPEED, rot, ROBOT_Y) {
  const turnDur = 0.25;
  const dist = Math.hypot(toMP.x - fromCi.x, toMP.z - fromCi.z);
  const dur = Math.max(0.05, dist / SPEED);
  const currentRotation = model.rotation?.y ?? 0;
  const angleToMP = rot(toMP.x - fromCi.x, toMP.z - fromCi.z);
  const angleBack = normalizeAngleShortestPath(currentRotation, angleToMP);
  tl.to(model.rotation, {
    y: angleBack,
    duration: turnDur,
    ease: "power1.inOut",
    onComplete: () => {
      model.rotation.y = angleBack;
    }
  });
  tl.to(model.position, { x: toMP.x, z: toMP.z, y: ROBOT_Y, duration: dur, ease: "none" });
}

let _vehicleLaneNodeById = null;
function getVehicleLaneNodeById() {
  if (_vehicleLaneNodeById) return _vehicleLaneNodeById;
  const g = getVehicleLaneGraphData();
  _vehicleLaneNodeById = new Map(g.nodes.map((n) => [n.id, n]));
  return _vehicleLaneNodeById;
}

function getVehicleNodePos(id) {
  if (!id) return null;
  const alias = {
    // user wording aliases
    'turn_1_14_entry': 'turn_1_24_entry'
  };
  const realId = alias[id] ?? id;
  const n = getVehicleLaneNodeById().get(realId);
  if (!n) return null;
  return { x: n.x, z: n.z };
}

function addGateWaitAtCurrentForVehicleNodes(tl, agentId, vehicleNodeIds, extraPoints = [], horizonSec = 3, pollMs = 200) {
  if (!tl) return;
  const points = [];
  for (const id of vehicleNodeIds || []) {
    const p = getVehicleNodePos(id);
    if (p) points.push(p);
  }
  for (const p of extraPoints || []) points.push(p);
  if (!points.length) return;

  tl.call(() => {
    const checkSafe = () => {
      const t = getSimTime();
      for (const p of points) {
        if (isVehicleNearPhysically(p.x, p.z, 1.8)) return false;
        if (willBeOccupiedByVehicleNear(p.x, p.z, t, t + horizonSec, 1, agentId)) return false;
      }
      return true;
    };
    if (checkSafe()) return;
    tl.pause();
    const waitStart = Date.now();
    const poll = () => {
      if (!tl || !tl.paused()) return;
      // Timeout-based deadlock recovery
      if (Date.now() - waitStart > GATE_TIMEOUT_MS) {
        console.warn(`⚠️ ${agentId} vehicle-node gate timeout, forcing resume`);
        tl.resume();
        return;
      }
      if (checkSafe()) {
        tl.resume();
        return;
      }
      setTimeout(poll, pollMs);
    };
    setTimeout(poll, pollMs);
  });
}

/**
 * Generate interpolated points along a segment for checking vehicle presence
 * @param {Object} p1 - Start point {x, z}
 * @param {Object} p2 - End point {x, z}
 * @param {number} stepM - Step size in meters
 * @returns {Array} Array of {x, z} points along the segment
 */
function interpolateSegmentPoints(p1, p2, stepM = 2.0) {
  const points = [{ x: p1.x, z: p1.z }];
  const dx = p2.x - p1.x;
  const dz = p2.z - p1.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.01) return points;
  const steps = Math.ceil(dist / stepM);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    points.push({ x: p1.x + dx * t, z: p1.z + dz * t });
  }
  return points;
}

/**
 * Get all segment check points for CF approach
 * Returns array of {x, z} points that need to be checked for vehicle presence
 */
function getCFApproachCheckPoints(cfId, cfPos) {
  const checkPoints = [];
  
  // Add the CF point itself
  checkPoints.push({ x: cfPos.x, z: cfPos.z });
  
  if (cfId === 'cf_25_44_left') {
    // Robot crossing upper lane at LEFT side
    // Check: turn_25_44_entry -> cf_25_44_left segment
    // turn_25_44_entry is at x=-22.25, z=-6.5
    const entryPos = { x: -22.25, z: -6.5 };
    // Add interpolated points from entry to CF
    const segPoints = interpolateSegmentPoints(entryPos, cfPos, 2.0);
    checkPoints.push(...segPoints);
    
  } else if (cfId === 'cf_25_44_right') {
    // Robot crossing upper lane at RIGHT side
    // Check: slot_34_44 -> cf_25_44_right segment
    // slot_34_44 is at approximately x=16.5, z=-6.5 (last slot_turn before CF)
    const slot34_44Pos = getVehicleNodePos('slot_34_44');
    if (slot34_44Pos) {
      const segPoints = interpolateSegmentPoints(slot34_44Pos, cfPos, 2.0);
      checkPoints.push(...segPoints);
    }
    // Also add the turn_25_44_exit as vehicles may be heading there
    const exitPos = { x: 20.25, z: -6.5 };
    checkPoints.push(exitPos);
    
  } else if (cfId === 'cf_1_14_left') {
    // Robot crossing lower lane at LEFT side
    // Check: turn_1_24_entry -> slot_1 -> ... segment (vehicles entering lower lane)
    // turn_1_24_entry is at x=-22.25, z=-22.5
    const entryPos = { x: -22.25, z: -22.5 };
    // Add entry point
    checkPoints.push(entryPos);
    // slot_1 is at approximately x=-22.25, z=-22.5 (same as entry, might overlap)
    const slot1Pos = getVehicleNodePos('slot_1');
    if (slot1Pos) checkPoints.push(slot1Pos);
    // Also check nearby slots: slot_2_15
    const slot2_15Pos = getVehicleNodePos('slot_2_15');
    if (slot2_15Pos) checkPoints.push(slot2_15Pos);
    // Interpolate from entry to CF
    const segPoints = interpolateSegmentPoints(entryPos, cfPos, 2.0);
    checkPoints.push(...segPoints);
    
  } else if (cfId === 'cf_1_14_right') {
    // Robot crossing lower lane at RIGHT side
    // Check: slot_11_24 -> slot_12 -> slot_13 -> slot_14 -> turn_1_24_exit segment
    // These are the slots vehicles pass through on their way to exit
    const nodesToCheck = ['slot_11_24', 'slot_12', 'slot_13', 'slot_14'];
    for (const nodeId of nodesToCheck) {
      const pos = getVehicleNodePos(nodeId);
      if (pos) checkPoints.push(pos);
    }
    // turn_1_24_exit is at x=20.25, z=-22.5
    const exitPos = { x: 20.25, z: -22.5 };
    checkPoints.push(exitPos);
    // Get the last slot position and interpolate to CF
    const slot14Pos = getVehicleNodePos('slot_14');
    if (slot14Pos) {
      const segPoints = interpolateSegmentPoints(slot14Pos, cfPos, 2.0);
      checkPoints.push(...segPoints);
    }
  }
  
  return checkPoints;
}

function addApproachCFWaitingRule(tl, fromWp, toWp, agentId) {
  if (!tl || !fromWp || !toWp) return;
  if (toWp.type !== 'conflict') return;

  const fromId = fromWp.id;
  const toId = toWp.id;
  const cfPos = { x: toWp.x, z: toWp.z };

  // Determine which CF and from which direction
  let shouldWait = false;
  let checkPoints = [];

  if (toId === 'cf_25_44_left' && (fromId === 'turn_3_left' || fromId === 'turn_4_left')) {
    // Robot crossing upper lane at LEFT from row 3 or 4
    shouldWait = true;
    checkPoints = getCFApproachCheckPoints('cf_25_44_left', cfPos);
  } else if (toId === 'cf_1_14_left' && (fromId === 'turn_1_left' || fromId === 'turn_2_left')) {
    // Robot crossing lower lane at LEFT from row 1 or 2
    shouldWait = true;
    checkPoints = getCFApproachCheckPoints('cf_1_14_left', cfPos);
  } else if (toId === 'cf_1_14_right' && (fromId === 'turn_1_right' || fromId === 'turn_2_right')) {
    // Robot crossing lower lane at RIGHT from row 1 or 2
    shouldWait = true;
    checkPoints = getCFApproachCheckPoints('cf_1_14_right', cfPos);
  } else if (toId === 'cf_25_44_right' && (fromId === 'turn_3_right' || fromId === 'turn_4_right')) {
    // Robot crossing upper lane at RIGHT from row 3 or 4
    shouldWait = true;
    checkPoints = getCFApproachCheckPoints('cf_25_44_right', cfPos);
  }

  if (!shouldWait || checkPoints.length === 0) return;

  // Add gate wait that checks all points on the segment
  tl.call(() => {
    const horizonSec = 4; // Look ahead 4 seconds
    const pollMs = 200;
    
    const checkSafe = () => {
      const t = getSimTime();
      for (const p of checkPoints) {
        // Check for physical vehicle presence (radius 2.0m for safety)
        if (isVehicleNearPhysically(p.x, p.z, 2.0)) {
          return false;
        }
        // Check for future vehicle reservations (radius 1 cell)
        if (willBeOccupiedByVehicleNear(p.x, p.z, t, t + horizonSec, 1, agentId)) {
          return false;
        }
      }
      return true;
    };
    
    if (checkSafe()) {
      console.log(`✅ ${agentId} CF check passed at ${toId}, proceeding`);
      return;
    }
    
    console.log(`⏸️ ${agentId} waiting at ${fromId} before ${toId} (vehicle on segment)`);
    tl.pause();
    const waitStart = Date.now();
    
    const poll = () => {
      if (!tl || !tl.paused()) return;
      // Timeout-based deadlock recovery
      if (Date.now() - waitStart > GATE_TIMEOUT_MS) {
        console.warn(`⚠️ ${agentId} CF approach timeout at ${toId}, forcing resume`);
        tl.resume();
        return;
      }
      if (checkSafe()) {
        console.log(`✅ ${agentId} CF segment now clear at ${toId}, resuming`);
        tl.resume();
        return;
      }
      setTimeout(poll, pollMs);
    };
    setTimeout(poll, pollMs);
  });
}

function addReReserveAtPoint(tl, agentId, remainingPath, speed, windowSec = 1.2) {
  if (!tl) return;
  tl.call(() => {
    const t0 = getSimTime();
    const dense = densifyWaypoints(remainingPath);
    releaseAgent(agentId);
    reservePath(dense, t0, speed, agentId, windowSec);
  });
}

// 禁用console.log输出到UI（保留浏览器控制台输出）
const oldLog = console.log;
console.log = function (...args) {
  oldLog.apply(console, args);
  // 不再添加到UI，只输出到浏览器控制台
  // addComment(args.join(' '));
};

// === Scene Setup ===
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xc8d0e0); // 淡蓝灰，略暗

// Vehicle trajectory visualization: record positions and draw trails
const vehicleTrajectories = new Map(); // vehicleId -> { points: [], line: THREE.Line, lastRecorded }
const TRAJECTORY_Y = 0.02; // Slightly above ground to avoid z-fighting flicker
const TRAJECTORY_MIN_STEP = 0.12; // Record point when moved this far
const TRAJECTORY_MAX_POINTS = 800;
const trajectoryGroup = new THREE.Group();
trajectoryGroup.name = 'vehicleTrajectories';
scene.add(trajectoryGroup);

// === Camera ===
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 500);
camera.position.set(-0.56, 20.38, 21.26);

// === Renderer (physically correct: ACES, sRGB, soft shadows) ===
const scale = 2;
const renderer = new THREE.WebGLRenderer({ antialias: false }); // FXAA in post
const simContainer = window.__simulatorContainer || document.body;
const initW = simContainer === document.body ? window.innerWidth * scale : Math.max(1, simContainer.clientWidth) * scale;
const initH = simContainer === document.body ? window.innerHeight * scale : Math.max(1, simContainer.clientHeight) * scale;
renderer.setSize(initW, initH, false);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.85;
simContainer.appendChild(renderer.domElement);
renderer.domElement.style.width = (simContainer === document.body ? window.innerWidth : simContainer.clientWidth) + 'px';
renderer.domElement.style.height = (simContainer === document.body ? window.innerHeight : simContainer.clientHeight) + 'px';
renderer.domElement.style.display = 'block';

// === Lights ===
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

// 半球光 - 为 PBR 材质提供更自然的环境光照
const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1.2);
hemiLight.position.set(0, 50, 0);
scene.add(hemiLight);

// Sunlight: angled, high-quality soft shadows
const dirLight = new THREE.DirectionalLight(0xfff5e6, 1.15);
dirLight.position.set(28, 42, 24);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 4096;
dirLight.shadow.mapSize.height = 4096;
dirLight.shadow.camera.near = 0.5;
dirLight.shadow.camera.far = 500;
dirLight.shadow.camera.left = -55;
dirLight.shadow.camera.right = 55;
dirLight.shadow.camera.top = 55;
dirLight.shadow.camera.bottom = -55;
dirLight.shadow.bias = -0.0001;
dirLight.shadow.normalBias = 0.02;
scene.add(dirLight);

// === HDR environment lighting (IBL + PMREM for reflections) ===
const envScene = new THREE.Scene();
envScene.background = new THREE.Color(0xffffff);
const envLight1 = new THREE.DirectionalLight(0xffffff, 0.5);
envLight1.position.set(1, 1, 1);
envScene.add(envLight1);
const envLight2 = new THREE.DirectionalLight(0xaaccff, 0.35);
envLight2.position.set(-1, 1, -1);
envScene.add(envLight2);
envScene.add(new THREE.AmbientLight(0xffffff, 0.7));
const pmremGenerator = new THREE.PMREMGenerator(renderer);
pmremGenerator.compileEquirectangularShader();
let envMapFallback = pmremGenerator.fromScene(envScene).texture;
scene.environment = envMapFallback;
pmremGenerator.dispose();

const rgbeLoader = new RGBELoader();
rgbeLoader.load(
  'https://threejs.org/examples/textures/equirectangular/venice_sunset_1k.hdr',
  (tex) => {
    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    scene.environment = pmrem.fromEquirectangular(tex).texture;
    tex.dispose();
    pmrem.dispose();
  },
  undefined,
  () => { scene.environment = envMapFallback; }
);

// Light gray atmospheric fog for distance realism
scene.fog = new THREE.FogExp2(0xc0c4cc, 0.012);

// === Postprocessing (Bloom low intensity + FXAA) ===
const composer = new EffectComposer(renderer);
composer.setSize(initW, initH);
composer.setPixelRatio(renderer.getPixelRatio());
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(initW, initH),
  0.18,
  0.4,
  0.88
);
composer.addPass(bloomPass);
composer.addPass(new FXAAPass());
composer.addPass(new OutputPass());

// === Asphalt ground (PBR: color, normal, roughness, AO + slight wet reflection) ===
const decalGroundW = PARKING_LOT_BOUNDS.bottomRight.x - PARKING_LOT_BOUNDS.topLeft.x;
const decalGroundD = PARKING_LOT_BOUNDS.bottomRight.z - PARKING_LOT_BOUNDS.topLeft.z;
const decalGroundCx = (PARKING_LOT_BOUNDS.topLeft.x + PARKING_LOT_BOUNDS.bottomRight.x) / 2;
const decalGroundCz = (PARKING_LOT_BOUNDS.topLeft.z + PARKING_LOT_BOUNDS.bottomRight.z) / 2;
const decalGroundGeo = new THREE.PlaneGeometry(decalGroundW, decalGroundD);
const decalGroundMat = new THREE.MeshStandardMaterial({
  color: 0x383836,
  roughness: 0.72,
  metalness: 0.02,
  envMapIntensity: 0.45
});
const decalGround = new THREE.Mesh(decalGroundGeo, decalGroundMat);
decalGround.rotation.x = -Math.PI / 2;
decalGround.position.set(decalGroundCx, 0, decalGroundCz);
decalGround.receiveShadow = true;
scene.add(decalGround);

const groundTexLoader = new THREE.TextureLoader();
const asphaltRepeat = { x: 5, y: 5 };
function setRepeatWrap(t) {
  if (!t) return;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(asphaltRepeat.x, asphaltRepeat.y);
}
groundTexLoader.load('/textures/Asphalt_New.jpg', (map) => {
  map.colorSpace = THREE.SRGBColorSpace;
  setRepeatWrap(map);
  decalGroundMat.map = map;
  decalGroundMat.needsUpdate = true;
}, undefined, () => {});
groundTexLoader.load('/textures/Asphalt_New_normal.jpg', (nMap) => {
  setRepeatWrap(nMap);
  decalGroundMat.normalMap = nMap;
  decalGroundMat.normalScale.set(0.6, 0.6);
  decalGroundMat.needsUpdate = true;
}, undefined, () => {});
groundTexLoader.load('/textures/Asphalt_New_roughness.jpg', (rMap) => {
  setRepeatWrap(rMap);
  decalGroundMat.roughnessMap = rMap;
  decalGroundMat.needsUpdate = true;
}, undefined, () => {});
groundTexLoader.load('/textures/Asphalt_New_ao.jpg', (aoMap) => {
  setRepeatWrap(aoMap);
  decalGroundMat.aoMap = aoMap;
  decalGroundMat.aoMapIntensity = 1;
  decalGroundMat.needsUpdate = true;
}, undefined, () => {});

// Decal texture: simple dark stain (canvas)
const decalCanvas = document.createElement('canvas');
decalCanvas.width = 128;
decalCanvas.height = 128;
const dctx = decalCanvas.getContext('2d');
const grad = dctx.createRadialGradient(64, 64, 0, 64, 64, 64);
grad.addColorStop(0, 'rgba(20,18,16,0.85)');
grad.addColorStop(0.5, 'rgba(30,28,26,0.4)');
grad.addColorStop(1, 'rgba(0,0,0,0)');
dctx.fillStyle = grad;
dctx.fillRect(0, 0, 128, 128);
const decalTex = new THREE.CanvasTexture(decalCanvas);
decalTex.needsUpdate = true;

function addDecal(mesh, position, size, euler) {
  const decalGeo = new DecalGeometry(mesh, position, euler, size);
  const decalMat = new THREE.MeshBasicMaterial({
    map: decalTex,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4
  });
  const decal = new THREE.Mesh(decalGeo, decalMat);
  scene.add(decal);
}
// Decal projectors: project from above onto floor (euler: tilt so projector faces down)
const decalEuler1 = new THREE.Euler(Math.PI / 2, 0, Math.random() * 0.2);
const decalEuler2 = new THREE.Euler(Math.PI / 2, 0, -0.15);
addDecal(decalGround, new THREE.Vector3(-10, 0.01, -12), new THREE.Vector3(2.5, 2.5, 0.3), decalEuler1);
addDecal(decalGround, new THREE.Vector3(8, 0.01, -5), new THREE.Vector3(1.8, 1.8, 0.25), decalEuler2);

// === Weather: rain particles ===
const RAIN_COUNT = 2500;
const rainGeo = new THREE.BufferGeometry();
const rainPos = new Float32Array(RAIN_COUNT * 3);
const rainBounds = { x: 60, z: 50, yMin: -5, yMax: 25 };
for (let i = 0; i < RAIN_COUNT; i++) {
  rainPos[i * 3] = (Math.random() - 0.5) * rainBounds.x;
  rainPos[i * 3 + 1] = rainBounds.yMin + Math.random() * (rainBounds.yMax - rainBounds.yMin);
  rainPos[i * 3 + 2] = (Math.random() - 0.5) * rainBounds.z;
}
rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
rainGeo.computeBoundingSphere();
const rainMat = new THREE.PointsMaterial({
  color: 0xaaaaaa,
  size: 0.08,
  transparent: true,
  opacity: 0.6,
  sizeAttenuation: true
});
const rainPoints = new THREE.Points(rainGeo, rainMat);
scene.add(rainPoints);
const RAIN_SPEED = 18;

/** 降低模型反光：遍历 mesh 及其子节点，对 PBR 材质设置 envMapIntensity、适度提高 roughness */
function reduceReflections(obj, envMapIntensity = 0.3) {
  obj.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    mats.forEach((m) => {
      if (m.envMapIntensity !== undefined) m.envMapIntensity = envMapIntensity;
      if (m.roughness !== undefined) m.roughness = Math.min(1, (m.roughness ?? 0.5) + 0.15);
    });
  });
}

// === Controls ===
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(-0.36, 6.91, -7.69);
controls.update();

// Dashboard 请求跟随机器人时，相机近距离跟随该机器人（?dashboard=1 时有效）
let followRobotId = null;
if (typeof window !== 'undefined') {
  window.__requestFollowRobot = (id) => { followRobotId = id != null ? id : null; };
  window.__requestSimSpeed = (scale) => { setSimTimeScale(scale); };
}
const FOLLOW_OFFSET_UP = 10;
const FOLLOW_OFFSET_BACK = 14;

// Camera position display (updates when using left/right mouse to orbit/pan)
const cameraInfoEl = document.createElement('div');
cameraInfoEl.id = 'camera-info';
cameraInfoEl.style.cssText = 'position:fixed;bottom:12px;left:12px;background:rgba(0,0,0,0.85);color:#7dd3fc;padding:8px 12px;border-radius:6px;font-family:monospace;font-size:12px;pointer-events:none;z-index:10000;border:1px solid rgba(125,211,252,0.4);white-space:pre;';
cameraInfoEl.style.display = 'none';
document.body.appendChild(cameraInfoEl);

let cameraInfoVisible = false;
let cameraInfoHideTimer = null;

function updateCameraInfoDisplay() {
  const p = camera.position;
  const t = controls.target;
  cameraInfoEl.textContent = `Camera: (${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)})\nTarget:  (${t.x.toFixed(2)}, ${t.y.toFixed(2)}, ${t.z.toFixed(2)})`;
}

controls.addEventListener('change', () => {
  updateCameraInfoDisplay();
  cameraInfoEl.style.display = 'block';
  cameraInfoVisible = true;
  if (cameraInfoHideTimer) clearTimeout(cameraInfoHideTimer);
  cameraInfoHideTimer = setTimeout(() => {
    cameraInfoEl.style.display = 'none';
    cameraInfoVisible = false;
    cameraInfoHideTimer = null;
  }, 3000);
});

// Show camera info on mouse down (left/right) so it appears as soon as user starts controlling
renderer.domElement.addEventListener('mousedown', (e) => {
  if (e.button === 0 || e.button === 2) {
    updateCameraInfoDisplay();
    cameraInfoEl.style.display = 'block';
    if (cameraInfoHideTimer) clearTimeout(cameraInfoHideTimer);
    cameraInfoHideTimer = setTimeout(() => {
      cameraInfoEl.style.display = 'none';
      cameraInfoHideTimer = null;
    }, 3000);
  }
}, false);

// === Mouse Click to Show Coordinates ===
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

// 创建坐标显示元素
const coordDisplay = document.createElement('div');
coordDisplay.id = 'coordinate-display';
coordDisplay.style.position = 'fixed';
coordDisplay.style.background = 'rgba(0, 0, 0, 0.8)';
coordDisplay.style.color = '#00ff00';
coordDisplay.style.padding = '8px 12px';
coordDisplay.style.borderRadius = '4px';
coordDisplay.style.fontFamily = 'monospace';
coordDisplay.style.fontSize = '14px';
coordDisplay.style.pointerEvents = 'none';
coordDisplay.style.zIndex = '10001';
coordDisplay.style.display = 'none';
coordDisplay.style.border = '1px solid #00ff00';
document.body.appendChild(coordDisplay);

// 鼠标移动时更新坐标显示位置
let mouseX = 0;
let mouseY = 0;
renderer.domElement.addEventListener('mousemove', (event) => {
  mouseX = event.clientX;
  mouseY = event.clientY;
  if (coordDisplay.style.display !== 'none') {
    coordDisplay.style.left = (mouseX + 15) + 'px';
    coordDisplay.style.top = (mouseY + 15) + 'px';
  }
});

// 鼠标点击事件
renderer.domElement.addEventListener('click', (event) => {
  // 计算鼠标在归一化设备坐标中的位置
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
  
  // 更新raycaster
  raycaster.setFromCamera(mouse, camera);
  
  // 创建地面平面用于检测点击位置
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const intersectPoint = new THREE.Vector3();
  raycaster.ray.intersectPlane(plane, intersectPoint);
  
  // 显示坐标
  coordDisplay.textContent = `📍 Clicked Position: x: ${intersectPoint.x.toFixed(2)}, y: ${intersectPoint.y.toFixed(2)}, z: ${intersectPoint.z.toFixed(2)}`;
  coordDisplay.style.display = 'block';
  coordDisplay.style.left = (event.clientX + 15) + 'px';
  coordDisplay.style.top = (event.clientY + 15) + 'px';
  
  // 3秒后自动隐藏
  setTimeout(() => {
    coordDisplay.style.display = 'none';
  }, 3000);
  
  // 也在控制台输出（可选）
  console.log(`📍 Clicked Position: x: ${intersectPoint.x.toFixed(2)}, y: ${intersectPoint.y.toFixed(2)}, z: ${intersectPoint.z.toFixed(2)}`);
});

// === Entity labels (battery / demand) ===
const labelsContainer = document.createElement('div');
labelsContainer.id = 'entity-labels';
labelsContainer.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:9999;';
document.body.appendChild(labelsContainer);

const _proj = new THREE.Vector3();
function worldToScreen(x, y, z) {
  _proj.set(x, y, z);
  _proj.project(camera);
  const w = window.innerWidth, h = window.innerHeight;
  return {
    x: (_proj.x * 0.5 + 0.5) * w,
    y: (1 - (_proj.y * 0.5 + 0.5)) * h,
    behind: _proj.z > 1
  };
}

function createEntityLabel(kind) {
  const el = document.createElement('div');
  el.style.cssText = 'position:absolute;transform:translate(-50%,-100%);font-size:12px;font-weight:bold;white-space:nowrap;text-shadow:0 1px 2px #000;';
  el.dataset.kind = kind;
  return el;
}

// === Graph node labels (robot/vehicle/turn/spot) ===
const graphLabelEntries = [];

function clearGraphLabels() {
  for (const e of graphLabelEntries) {
    if (e.el && e.el.parentNode) e.el.remove();
  }
  graphLabelEntries.length = 0;
}

function createGraphLabel(text, kind) {
  const el = document.createElement('div');
  el.textContent = text;
  el.dataset.kind = kind;

  // Visual distinction by kind
  const stylesByKind = {
    // Robot topology graph (cyan)
    robot_turn: 'background:rgba(0,188,212,0.18);border:1px solid rgba(0,188,212,0.55);color:#00e5ff;',
    robot_charge: 'background:rgba(0,188,212,0.12);border:1px dashed rgba(0,188,212,0.45);color:#67e8f9;',
    robot_conflict: 'background:rgba(236,72,153,0.16);border:1px solid rgba(236,72,153,0.55);color:#f472b6;',

    // Vehicle keypoint graph (orange)
    vehicle_kp: 'background:rgba(255,152,0,0.16);border:1px solid rgba(255,152,0,0.55);color:#ffb74d;',

    // Parking spot center (amber)
    parking_spot: 'background:rgba(255,193,7,0.14);border:1px solid rgba(255,193,7,0.55);color:#ffd54f;',
    // V:slot <-> S 双向边标注 (amber)
    slot_spot_edge: 'background:rgba(255,193,7,0.2);border:1px solid rgba(255,193,7,0.6);color:#ffd54f;',
    // 转向起止点 (green, 在 graph 上明显区分)
    turn_endpoint: 'background:rgba(76,175,80,0.25);border:1px solid rgba(76,175,80,0.7);color:#81c784;'
  };

  el.style.cssText =
    'position:absolute;transform:translate(-50%,-100%);' +
    'font-size:10px;font-weight:700;white-space:nowrap;' +
    'padding:2px 6px;border-radius:6px;' +
    'text-shadow:0 1px 2px rgba(0,0,0,0.65);' +
    (stylesByKind[kind] ?? 'background:rgba(0,0,0,0.25);border:1px solid rgba(255,255,255,0.18);color:#fff;');
  return el;
}

function addGraphLabel(text, x, y, z, kind) {
  const el = createGraphLabel(text, kind);
  labelsContainer.appendChild(el);
  graphLabelEntries.push({ el, x, y, z, kind });
}

function updateGraphLabels() {
  for (const e of graphLabelEntries) {
    const s = worldToScreen(e.x, e.y, e.z);
    e.el.style.display = s.behind ? 'none' : 'block';
    e.el.style.left = s.x + 'px';
    e.el.style.top = s.y + 'px';
  }
}

// === Loader ===
const loader = new GLTFLoader();

// === Global State ===
const vehicles = [];
const chargingRobots = [];
let totalKwhDelivered = 0;
const batteryStations = [];
let parkingLot = null;

const ROBOT_BATTERY_KWH = 100;
const VEHICLE_BATTERY_KWH = 80;
const LOW_BATTERY_KWH = ROBOT_BATTERY_KWH * 0.25; // 25%
const ROBOT_Y_OFFSET = 0;      // 小 caddie 高度偏移（降低 1）
const ROBOT_ROT_EXTRA = Math.PI / 2 + Math.PI;  // 小 caddie 朝向修正：90° + 180°（前后互换）

// Toggle graph debug visualization (nodes/edges/labels)
const show_graph = (() => {
  try {
    const v = new URLSearchParams(window.location.search).get('show_graph');
    if (v == null) return false;
    return ['1', 'true', 'yes', 'y', 'on'].includes(String(v).toLowerCase());
  } catch {
    return false;
  }
})();

// Recording parameters from URL: ?record=true&start_time=20&end_time=40
const recordConfig = (() => {
  try {
    const params = new URLSearchParams(window.location.search);
    const recordParam = params.get('record');
    const enabled = recordParam != null && ['1', 'true', 'yes', 'y', 'on'].includes(String(recordParam).toLowerCase());
    
    if (!enabled) return { enabled: false };
    
    const startTime = parseFloat(params.get('start_time')) || 20;
    const endTime = parseFloat(params.get('end_time')) || 40;
    
    // Validate: end must be after start
    if (endTime <= startTime) {
      console.warn('⚠️ Invalid record parameters: end_time must be greater than start_time');
      return { enabled: false };
    }
    
    return {
      enabled: true,
      startTime,
      endTime,
      duration: endTime - startTime,
    };
  } catch {
    return { enabled: false };
  }
})();

if (recordConfig.enabled) {
  console.log('');
  console.log('📹 ═══════════════════════════════════════════════════════════');
  console.log('📹 Recording mode enabled via URL parameters');
  console.log(`📹   Start time: ${recordConfig.startTime}s`);
  console.log(`📹   End time: ${recordConfig.endTime}s`);
  console.log(`📹   Duration: ${recordConfig.duration}s`);
  console.log('📹 ═══════════════════════════════════════════════════════════');
  console.log('');
}

// === Mouse Click Coordinate Detection === (已合并到上面的鼠标点击事件中，无需重复代码)

// === Charging Robot Class ===
class ChargingRobot {
  constructor(model, position, id, homeSpot = null) {
    this.model = model;
    this.id = id;
    this.position = position;
    this.targetVehicle = null;
    this.state = 'idle';
    this.batteryLevel = ROBOT_BATTERY_KWH;
    /** @type {import('gsap').core.Timeline | null} */
    this.timeline = null;
    /** 'rest' | 'charge' | null */
    this.returnReason = null;
    this.homePosition = { ...position };
    this.homeSpot = homeSpot;
    this.lastRow = homeSpot ? getSpotRow(homeSpot.index) : 1;
    this.lastSide = homeSpot?.side ?? 'left';
    this.atHome = true;
    this.lastSpotIndex = homeSpot ? homeSpot.index : 1;
    /** @type {any|null} vehicle waiting to preempt return-to-rest */
    this.pendingVehicle = null;
  }

  stopCurrentMotion(reason = 'interrupt') {
    // Release any space-time reservations held by this robot
    releaseAgent(`robot_${this.id}`);
    if (this.timeline) {
      try {
        this.timeline.kill();
      } catch {
        // ignore
      }
      this.timeline = null;
    }
    if (this.model?.userData?.mixer) this.model.userData.mixer.stopAllAction();
    // NOTE: do NOT clear battery/spot state here; just stop motion and allow reassignment.
    if (this.state !== 'charging') {
      this.state = 'idle';
      this.returnReason = null;
    }
    console.log(`🛑 Robot${this.id} motion stopped (${reason})`);
  }

  navigateTo(targetPosition, onComplete) {
    this.state = 'navigating';
    const currentPos = this.model.position;
    const distance = Math.sqrt(
      Math.pow(targetPosition.x - currentPos.x, 2) +
      Math.pow(targetPosition.z - currentPos.z, 2)
    );
    
    // 恒定速度：每秒移动3个单位
    const SPEED = 3.0; // units per second
    const duration = distance / SPEED;

    const rawAngle = Math.atan2(
      targetPosition.x - currentPos.x,
      targetPosition.z - currentPos.z
    ) + Math.PI / 2 + ROBOT_ROT_EXTRA;
    
    // Normalize to shortest rotation path
    const currentRotation = this.model.rotation?.y ?? 0;
    const angle = normalizeAngleShortestPath(currentRotation, rawAngle);

    const tl = gsap.timeline({
      onComplete: () => {
        if (onComplete) onComplete();
      }
    });

    tl.to(this.model.rotation, {
      y: angle,
      duration: 0.8,
      ease: "power1.inOut"
    });

    tl.to(this.model.position, {
      x: targetPosition.x,
      y: targetPosition.y != null ? targetPosition.y : ROBOT_Y_OFFSET,
      z: targetPosition.z,
      duration: duration,
      ease: "none"
    });

    return tl;
  }

  chargeVehicle(vehicle, onComplete) {
    // If robot is returning to rest, allow preemption by new order.
    this.stopCurrentMotion('start charge mission');
    this.state = 'charging';
    this.targetVehicle = vehicle;
    this.returnReason = null;
    const spot = vehicle.parkingSpot;
    if (!spot || !spot.chargePoint) {
      if (onComplete) onComplete();
      return gsap.timeline();
    }
    const chargingPos = getChargePointPosition(spot.index) ?? { x: spot.chargePoint.x, z: spot.chargePoint.z, y: spot.chargePoint.y ?? 0 };
    const ownCP = this.homeSpot ? getChargePointPosition(this.homeSpot.index) : null;
    const currentPos = { x: this.model.position.x, z: this.model.position.z, y: this.model.position.y };
    const SPEED = 3.0;
    const CROSSING_YIELD_DURATION = 1.0;
    const agentId = `robot_${this.id}`;
    // Set high priority for charging mission (robot actively servicing a vehicle)
    setAgentPriority(agentId, PRIORITY.ROBOT_CHARGING);
    const RESERVE_WINDOW_SEC = 1.2;
    const CHARGE_DURATION_SEC = 4;
    const startSpot = this.atHome ? (this.homeSpot?.index ?? 1) : this.lastSpotIndex;
    const endSpot = spot.index;
    let wps = [];
    let fullPath = [];
    const computePathAndFull = () => {
      wps = findPathTopoST(startSpot, endSpot, getSimTime(), SPEED, agentId, { endAtCharge0: true });
      if (!wps || wps.length === 0) wps = findPathTopo(startSpot, endSpot, { endAtCharge0: true });
      if (!wps || wps.length < 2) {
        console.warn(`⚠️ Robot${this.id} chargeVehicle: No valid path to C${endSpot}_0! wps.length=${wps?.length ?? 0}`);
        console.warn(`  currentPos: (${currentPos.x.toFixed(1)}, ${currentPos.z.toFixed(1)}), atHome=${this.atHome}`);
      }
      if (wps && wps.length > 0) {
        const pathIds = wps.map(w => w.id || (w.type === 'charge0' ? `C${w.spotIndex}_0` : `MP${w.spotIndex}`)).join(' -> ');
        console.log(`🛤️ Robot${this.id} path: ${pathIds}`);
      }
      const toPos = (w) => ({ x: w.x, z: w.z });
      fullPath = [currentPos];
      for (let i = 0; i < wps.length; i++) fullPath.push(toPos(wps[i]));
      return { wps, fullPath };
    };

    const runChargeMission = () => {
    const mainTl = gsap.timeline();
    this.timeline = mainTl;

    const rot = (dx, dz) => Math.atan2(dx, dz) + Math.PI / 2 + ROBOT_ROT_EXTRA;

    // NOTE: We overlap rotate + translate to avoid "stop at every node".
    // Track current heading in [-π,π] to avoid 360° spin at Cxx_0 etc.
    let trackedHeading = normalizeAngleToMinusPiPi(this.model.rotation?.y ?? 0);
    const MIN_SEG_LEN_FOR_ROTATE = 0.1; // 极短/零长段不转向，避免原地转一圈
    const addPathSegment = (from, to, doRotate = true) => {
      const dx = to.x - from.x;
      const dz = to.z - from.z;
      const len = Math.hypot(dx, dz);
      const minDur = 0.05;
      const dur = Math.max(minDur, len / SPEED);
      const rawAngle = len >= MIN_SEG_LEN_FOR_ROTATE ? rot(dx, dz) : trackedHeading;
      const angle = normalizeAngleShortestPath(trackedHeading, rawAngle);
      const angleNorm = normalizeAngleToMinusPiPi(angle);
      const turnDur = 0.25;
      const needRotate = doRotate && len >= MIN_SEG_LEN_FOR_ROTATE && Math.abs(angleDiff(trackedHeading, angleNorm)) > 0.02;
      if (needRotate) {
        mainTl.to(this.model.rotation, {
          y: angleNorm,
          duration: turnDur,
          ease: "power1.inOut",
          onComplete: () => { trackedHeading = angleNorm; }
        });
        mainTl.to(this.model.position, { x: to.x, z: to.z, y: ROBOT_Y_OFFSET, duration: dur, ease: "none" }, '<');
      } else {
        mainTl.to(this.model.position, { x: to.x, z: to.z, y: ROBOT_Y_OFFSET, duration: dur, ease: "none" });
        if (len >= MIN_SEG_LEN_FOR_ROTATE) trackedHeading = angleNorm;
      }
      return true;
    };

    const addCrossing = (from, to) => {
      mainTl.to({}, { duration: CROSSING_YIELD_DURATION, onStart: () => console.log(`🔄 Robot${this.id} yielding before lane crossing`) });
      return addPathSegment(from, to);
    };

    const toPos = (w) => ({ x: w.x, z: w.z, y: w.y != null ? w.y : 0 });
    let prev = currentPos;
    if (wps.length >= 1) {
      // From current pos (Ci when atHome, or last mission pos) to starting move point (wps[0])
      const startMP = toPos(wps[0]);
      const distToStart = Math.hypot(prev.x - startMP.x, prev.z - startMP.z);
      if (distToStart > 0.5) {
        if (addPathSegment(prev, startMP)) prev = startMP;
      } else {
        prev = startMP;
      }
    }
    if (wps.length >= 2) {
      for (let i = 1; i < wps.length; i++) {
        const from = wps[i - 1];
        const to = wps[i];
        const fromP = toPos(from);
        const toP = toPos(to);
        // Before entering conflict point (CF), apply approach-specific waiting rules first (wait at current R:turn).
        if (to?.type === 'conflict') {
          addApproachCFWaitingRule(mainTl, from, to, agentId);
          addGateWaitBeforeConflict(mainTl, toP.x, toP.z, agentId, 3, 1, 200);
        } else {
          // 进入下一节点前：若当前在 Cxx_0 则等整段 (R:MPx->下一节点) 无其他机器人；否则仅当下一节点为 R:MP 时等该 MP 无机器人（进入 R:MP9 只判 R:MP9，不判 C9_0）
          if (from?.type === 'charge0') {
            const fromMP = getMovePointPosition(from.spotIndex);
            if (fromMP) addGateWaitUntilSegmentClear(mainTl, fromMP, toP, agentId);
          } else if (to?.type !== 'charge0') {
            addGateWaitUntilNextNodeClear(mainTl, toP, agentId);
          }
        }
        if (isCrossingSegment(from, to)) {
          if (addCrossing(fromP, toP)) prev = toP;
        } else {
          if (addPathSegment(prev, toP)) prev = toP;
        }
      }
    }
    const charge0Pos = getCharge0Position(spot.index) || { x: chargingPos.x + (spot.opening === '-z' ? 0.4 : -0.4), z: chargingPos.z, y: ROBOT_Y_OFFSET };
    addGateWaitAtResourceAndPoint(mainTl, charge0Pos.x, charge0Pos.z, mpResId(spot.index), agentId, 0.8, 200, false);

    // 充电位姿：车位开口朝+z 时车头朝 x 负方向，否则朝 x 正方向
    const chargeHeading = (spot.opening === '+z') ? ROBOT_ROT_EXTRA : (Math.PI + ROBOT_ROT_EXTRA);
    const chargeTargetY = normalizeAngleShortestPath(this.model.rotation.y, chargeHeading);
    mainTl.to(this.model.rotation, { y: chargeTargetY, duration: 0.25, ease: "power1.inOut" });

    // Tesla chargeport: find Open_Cover and Close_Cover (or first/second clip as fallback)
    const carMixer = vehicle.chargeportMixer;
    const carClips = vehicle.chargeportAnimations || [];
    const carClipByName = (name) => carClips.find((c) => c.name === name);
    const openCoverClip = carClipByName('Open_Cover') || carClips[0];
    const closeCoverClip = carClipByName('Open_Cover_Reverse') || carClips[1] || carClips[0];
    const openCoverDur = Math.max(openCoverClip?.duration ?? 0.5, 0.2);
    const closeCoverDur = Math.max(closeCoverClip?.duration ?? 0.5, 0.2);

    const playVehicleClip = (clip) => {
      if (!carMixer || !clip) return;
      carMixer.stopAllAction();
      const action = carMixer.clipAction(clip);
      action.enabled = true;
      action.reset();
      action.setLoop(THREE.LoopOnce);
      action.clampWhenFinished = true;
      action.setEffectiveWeight(1);
      action.play();
    };

    // 0) Car: play Open_Cover first (chargeport opens), then robot can approach
    mainTl.to({}, {
      duration: openCoverDur,
      ease: "none",
      onStart: () => {
        console.log(`🚗 Vehicle chargeport — Open_Cover`);
        playVehicleClip(openCoverClip);
      }
    });

    const mixer = this.model?.userData?.mixer;
    const clips = this.model?.userData?.animations || [];
    const clipByName = (name) => clips.find((c) => c.name === name);
    const armExtClip = clipByName('Arm_extension') || clips[0];
    const armRevClip = clipByName('Arm_extension_Reverse') || clipByName('Arm_extension_Revserse') || clips[1] || clips[0];
    const armExtDur = Math.max(armExtClip?.duration ?? 1, 0.3);
    const armRevDur = Math.max(armRevClip?.duration ?? 1, 0.3);

    const playClip = (clip, tag) => {
      if (!mixer || !clip) return;
      mixer.stopAllAction();
      const action = mixer.clipAction(clip);
      action.enabled = true;
      action.reset();
      action.setLoop(THREE.LoopOnce);
      action.clampWhenFinished = true;
      action.setEffectiveWeight(1);
      action.play();
    };

    // 1) Robot: play Arm_extension (once), then wait for its duration
    mainTl.to({}, {
      duration: armExtDur,
      ease: "none",
      onStart: () => {
        console.log(`🤖 Robot${this.id} at charge point (service) — Arm_extension`);
        playClip(armExtClip, 'Arm_extension');
      }
    });

    const startDemand = Math.max(0, vehicle.chargeDemandKwh ?? 0);
    const startBattery = this.batteryLevel;
    const chargeDuration = CHARGE_DURATION_SEC;
    const maxTransfer = Math.min(startDemand, startBattery);
    const prog = { p: 0 };
    // 2) Charging: battery transfer
    mainTl.to(prog, {
      p: 1,
      duration: chargeDuration,
      ease: "none",
      onStart: () => {
        if (vehicle.chargingStartedAt == null) vehicle.chargingStartedAt = getSimTime();
      },
      onUpdate: () => {
        const transferred = maxTransfer * prog.p;
        vehicle.chargeDemandKwh = Math.max(0, startDemand - transferred);
        this.batteryLevel = Math.max(0, startBattery - transferred);
      },
      onComplete: () => {
        totalKwhDelivered += maxTransfer;
      }
    });

    // 3) Robot: play Arm_extension_Reverse (retract arm), then wait for its duration
    mainTl.to({}, {
      duration: armRevDur,
      ease: "none",
      onStart: () => {
        console.log(`🤖 Robot${this.id} — Arm_extension_Reverse`);
        playClip(armRevClip, 'Arm_extension_Reverse');
      }
    });

    // 4) Car: play Open_Cover_Reverse (chargeport closes), then robot leaves
    mainTl.to({}, {
      duration: closeCoverDur,
      ease: "none",
      onStart: () => {
        console.log(`🚗 Vehicle chargeport — Open_Cover_Reverse`);
        playVehicleClip(closeCoverClip);
      }
    });

    // 5) 充完电从 Cxx_0 前往 R:MPxx+1 离开（不经过 Ci）
    const leaveTarget = getLeaveTargetFromCharge0(spot.index);
    let leavePrev = { x: charge0Pos.x, z: charge0Pos.z, y: ROBOT_Y_OFFSET };
    for (const p of leaveTarget.positions) {
      const to = { x: p.x, z: p.z, y: ROBOT_Y_OFFSET };
      addPathSegment(leavePrev, to);
      leavePrev = to;
    }

    mainTl.to({}, { duration: 0 });
    mainTl.eventCallback('onComplete', () => {
      if (this.model?.userData?.mixer) this.model.userData.mixer.stopAllAction();
      releaseAgent(agentId);
      this.state = 'idle';
      this.targetVehicle = null;
      this.lastRow = getSpotRow(spot.index);
      this.lastSide = spot.side;
      this.lastSpotIndex = leaveTarget.nextSpotIndex;
      this.atHome = false;
      if (onComplete) onComplete();
    });
    return mainTl;
    };

    let blockStartTime = null;
    let replanAttempts = 0;
    const tryStart = () => {
      const t0 = getSimTime();
      computePathAndFull();
      const densePath = densifyWaypoints(fullPath);
      if (isPathBlocked(densePath, SPEED, t0, agentId)) {
        if (!blockStartTime) blockStartTime = Date.now();
        const blockedDuration = Date.now() - blockStartTime;
        // Dynamic re-planning: if blocked too long, force re-compute path via ST A*
        if (blockedDuration > REPLAN_THRESHOLD_MS && replanAttempts < MAX_REPLAN_ATTEMPTS) {
          replanAttempts++;
          console.log(`🔄 Robot${this.id} re-planning (attempt ${replanAttempts}) after ${(blockedDuration/1000).toFixed(1)}s blocked`);
          // Force re-compute will happen on next tryStart call since computePathAndFull uses current time
          blockStartTime = Date.now(); // Reset timer for new path attempt
        }
        setTimeout(tryStart, 500);
        return;
      }
      // Path is clear, reset tracking
      blockStartTime = null;
      replanAttempts = 0;
      // Log the planned path
      logAgentPath(`Robot${this.id}`, wps, `CP${spot.index} (charge vehicle ${vehicle.id})`, 'charge');
      // Reserve robot path to avoid robot-robot collisions
      releaseAgent(agentId);
      reservePath(densePath, t0, SPEED, agentId, RESERVE_WINDOW_SEC);
      // Hold destination cell during charging to prevent stacking.
      const travelT = pathDistance(densePath) / SPEED;
      reservePoint(
        chargingPos.x,
        chargingPos.z,
        Math.max(0, t0 + travelT - RESERVE_WINDOW_SEC),
        t0 + travelT + CHARGE_DURATION_SEC + RESERVE_WINDOW_SEC,
        agentId
      );
      // MP resource capacity=1: reserve res_mp_i during charging window.
      reserveResource(
        mpResId(spot.index),
        Math.max(0, t0 + travelT - RESERVE_WINDOW_SEC),
        t0 + travelT + CHARGE_DURATION_SEC + RESERVE_WINDOW_SEC,
        agentId
      );
      runChargeMission();
    };
    tryStart();
    return gsap.timeline();
  }

  selfCharge(batteryStation, onComplete) {
    this.state = 'selfCharging';
    const stationPos = batteryStation.position;

    // Navigate to charging station
    const chargingPos = {
      x: stationPos.x,
      z: stationPos.z + 0.5,
      y: stationPos.y
    };

    const navTl = this.navigateTo(chargingPos, () => {
      const chargeTl = gsap.timeline({
        onComplete: () => {
          this.state = 'idle';
          this.batteryLevel = ROBOT_BATTERY_KWH;
          if (onComplete) onComplete();
        }
      });
      const rot = (dx, dz) => Math.atan2(dx, dz) + Math.PI / 2 + ROBOT_ROT_EXTRA;
      const dx = stationPos.x - chargingPos.x;
      const dz = stationPos.z - chargingPos.z;
      const rawAngle = rot(dx, dz);
      const currentRotation = this.model.rotation?.y ?? 0;
      const angle = normalizeAngleShortestPath(currentRotation, rawAngle);
      chargeTl.to(this.model.rotation, { y: angle, duration: 0.8, ease: "power1.inOut" });
      chargeTl.to({}, { duration: 2, onStart: () => console.log(`🔌 Robot${this.id} self-charging at station...`) });
      chargeTl.to({}, { duration: 0, onComplete: () => console.log(`✅ Robot${this.id} self-charging complete`) });
    });

    return navTl;
  }

  returnHome(onComplete) {
    this.state = 'returning';
    const tl = gsap.timeline({
      onComplete: () => {
        this.state = 'idle';
        if (onComplete) onComplete();
      }
    });

    tl.call(() => {
      this.navigateTo(this.homePosition, null);
    });

    tl.to({}, { duration: 3 }); // Wait for navigation

    // Rotate to home orientation
    tl.to(this.model.rotation, {
      y: Math.PI,
      duration: 0.8,
      ease: "power1.inOut"
    });

    return tl;
  }

  needsRecharge() {
    return this.batteryLevel < LOW_BATTERY_KWH;
  }

  returnHomeAndCharge(onComplete) {
    this.stopCurrentMotion('return home');
    this.state = 'returning';
    this.returnReason = 'charge';
    const homeSpot = this.homeSpot;
    const homeRow = homeSpot ? getSpotRow(homeSpot.index) : 1;
    const homeSide = homeSpot?.side ?? 'left';
    const SPEED = 3.0;
    const CROSSING_YIELD = 1.0;
    const agentId = `robot_${this.id}`;
    // Set medium priority for returning home to charge (needs to recharge but not actively servicing)
    setAgentPriority(agentId, PRIORITY.ROBOT_NAVIGATING);
    const RESERVE_WINDOW_SEC = 1.2;
    const DEST_HOLD_SEC = 2.0;
    const rot = (dx, dz) => Math.atan2(dx, dz) + Math.PI / 2 + ROBOT_ROT_EXTRA;
    const currentPos = { x: this.model.position.x, z: this.model.position.z, y: this.model.position.y };
    const startSpot = this.lastSpotIndex;
    const endSpot = homeSpot?.index ?? 1;
    let wps = [];
    let fullPath = [];
    const computePathAndFull = () => {
      wps = findPathTopoST(startSpot, endSpot, getSimTime(), SPEED, agentId);
      if (!wps || wps.length === 0) wps = findPathTopo(startSpot, endSpot);
      // Warn if path is too short (indicates pathfinding failure in directed graph)
      if (!wps || wps.length < 2) {
        console.warn(`⚠️ Robot${this.id} returnHomeAndCharge: No valid path from MP${startSpot} to MP${endSpot}! wps.length=${wps?.length ?? 0}`);
      }
      const toPosR = (w) => ({ x: w.x, z: w.z });
      fullPath = [currentPos];
      for (let i = 0; i < wps.length; i++) fullPath.push(toPosR(wps[i]));
      fullPath.push({ x: this.homePosition.x, z: this.homePosition.z });
      return { wps, fullPath };
    };

    const runReturnHome = () => {
    let trackedHeading = normalizeAngleToMinusPiPi(this.model.rotation?.y ?? 0);
    const MIN_SEG_LEN_FOR_ROTATE = 0.1;
    const addPathSegment = (from, to) => {
      const dx = to.x - from.x;
      const dz = to.z - from.z;
      const len = Math.hypot(dx, dz);
      const minDur = 0.05;
      const dur = Math.max(minDur, len / SPEED);
      const rawAngle = len >= MIN_SEG_LEN_FOR_ROTATE ? rot(dx, dz) : trackedHeading;
      const angle = normalizeAngleShortestPath(trackedHeading, rawAngle);
      const angleNorm = normalizeAngleToMinusPiPi(angle);
      const turnDur = 0.25;
      const needRotate = len >= MIN_SEG_LEN_FOR_ROTATE && Math.abs(angleDiff(trackedHeading, angleNorm)) > 0.02;
      if (needRotate) {
        tl.to(this.model.rotation, { y: angleNorm, duration: turnDur, ease: "power1.inOut", onComplete: () => { trackedHeading = angleNorm; } });
        tl.to(this.model.position, { x: to.x, z: to.z, y: ROBOT_Y_OFFSET, duration: dur, ease: "none" }, '<');
      } else {
        tl.to(this.model.position, { x: to.x, z: to.z, y: ROBOT_Y_OFFSET, duration: dur, ease: "none" });
        if (len >= MIN_SEG_LEN_FOR_ROTATE) trackedHeading = angleNorm;
      }
      return true;
    };
    const addCrossing = (from, to) => {
      tl.to({}, { duration: CROSSING_YIELD });
      return addPathSegment(from, to);
    };

    const tl = gsap.timeline({
      onComplete: () => {
        this.state = 'idle';
        this.returnReason = null;
        this.lastRow = homeRow;
        this.lastSide = homeSide;
        this.atHome = true;
        this.lastSpotIndex = endSpot;
        if (onComplete) onComplete();
      }
    });
    this.timeline = tl;

    const toPos = (w) => ({ x: w.x, z: w.z, y: w.y != null ? w.y : 0 });
    let prev = currentPos;
    if (wps.length >= 1) {
      const startMP = toPos(wps[0]);
      const distToStart = Math.hypot(prev.x - startMP.x, prev.z - startMP.z);
      const sameColumn = Math.abs(prev.x - startMP.x) < 2;
      const likelyCiToMP = distToStart > 0.5 && distToStart < 3 && sameColumn;
      if (likelyCiToMP) {
        addGateWaitForCiToMP(tl, prev, startMP, SPEED, agentId, 200);
        addCiToMPManeuver(tl, this.model, prev, startMP, SPEED, rot, ROBOT_Y_OFFSET);
        tl.call(() => { trackedHeading = normalizeAngleToMinusPiPi(this.model.rotation.y); });
        prev = startMP;
      } else if (distToStart > 0.5) {
        if (addPathSegment(prev, startMP)) prev = startMP;
      } else {
        prev = startMP;
      }
    }
    for (let i = 1; i < wps.length; i++) {
      const from = wps[i - 1];
      const to = wps[i];
      const fromP = toPos(from);
      const toP = toPos(to);
      if (to?.type === 'conflict') {
        addApproachCFWaitingRule(tl, from, to, agentId);
        addGateWaitBeforeConflict(tl, toP.x, toP.z, agentId, 3, 1, 200);
        } else {
          if (from?.type === 'charge0') {
            const fromMP = getMovePointPosition(from.spotIndex);
            if (fromMP) addGateWaitUntilSegmentClear(tl, fromMP, toP, agentId);
          } else if (to?.type !== 'charge0') {
            addGateWaitUntilNextNodeClear(tl, toP, agentId);
          }
        }
      if (isCrossingSegment(from, to)) {
        if (addCrossing(fromP, toP)) prev = toP;
      } else {
        if (addPathSegment(prev, toP)) prev = toP;
      }
    }
    // R:MPi -> Ci (home): 右转90°、直行、左转90°
    if (homeSpot) {
      addMPtoCiManeuver(tl, this.model, prev, this.homePosition, homeSpot, SPEED, rot, ROBOT_Y_OFFSET);
    } else {
      addPathSegment(prev, this.homePosition);
    }
    return tl;
    };

    let blockStartTime = null;
    let replanAttempts = 0;
    const tryStart = () => {
      const t0 = getSimTime();
      computePathAndFull();
      const densePath = densifyWaypoints(fullPath);
      if (isPathBlocked(densePath, SPEED, t0, agentId)) {
        if (!blockStartTime) blockStartTime = Date.now();
        const blockedDuration = Date.now() - blockStartTime;
        if (blockedDuration > 1500) {
          console.warn(`⚠️ Robot${this.id} force leaving after ${(blockedDuration / 1000).toFixed(1)}s blocked`);
          blockStartTime = null;
          replanAttempts = 0;
          logAgentPath(`Robot${this.id}`, wps, `Home (MP${endSpot}, recharge)`, 'return-home');
          releaseAgent(agentId);
          reservePath(densePath, t0, SPEED, agentId, RESERVE_WINDOW_SEC);
          const travelT = pathDistance(densePath) / SPEED;
          reservePoint(this.homePosition.x, this.homePosition.z, Math.max(0, t0 + travelT - RESERVE_WINDOW_SEC), t0 + travelT + DEST_HOLD_SEC + RESERVE_WINDOW_SEC, agentId);
          runReturnHome();
          return;
        }
        if (blockedDuration > REPLAN_THRESHOLD_MS && replanAttempts < MAX_REPLAN_ATTEMPTS) {
          replanAttempts++;
          console.log(`🔄 Robot${this.id} re-planning return home (attempt ${replanAttempts}) after ${(blockedDuration/1000).toFixed(1)}s blocked`);
          blockStartTime = Date.now();
        }
        setTimeout(tryStart, 500);
        return;
      }
      blockStartTime = null;
      replanAttempts = 0;
      logAgentPath(`Robot${this.id}`, wps, `Home (MP${endSpot}, recharge)`, 'return-home');
      releaseAgent(agentId);
      reservePath(densePath, t0, SPEED, agentId, RESERVE_WINDOW_SEC);
      const travelT = pathDistance(densePath) / SPEED;
      reservePoint(
        this.homePosition.x,
        this.homePosition.z,
        Math.max(0, t0 + travelT - RESERVE_WINDOW_SEC),
        t0 + travelT + DEST_HOLD_SEC + RESERVE_WINDOW_SEC,
        agentId
      );
      runReturnHome();
    };
    tryStart();
    return gsap.timeline();
  }

  // Return to rest point (home) when there is no new order.
  // If a new order arrives during this motion, assignRobotToVehicle can preempt it (stopCurrentMotion + chargeVehicle).
  returnToRest(onComplete) {
    this.stopCurrentMotion('return to rest');
    this.state = 'returning';
    this.returnReason = 'rest';

    const homeSpot = this.homeSpot;
    const homeRow = homeSpot ? getSpotRow(homeSpot.index) : 1;
    const homeSide = homeSpot?.side ?? 'left';
    const SPEED = 3.0;
    const CROSSING_YIELD = 1.0;
    const agentId = `robot_${this.id}`;
    // Set lowest priority for returning to rest (can be preempted by new orders)
    setAgentPriority(agentId, PRIORITY.ROBOT_RETURNING);
    const RESERVE_WINDOW_SEC = 1.2;
    const DEST_HOLD_SEC = 2.0;
    const rot = (dx, dz) => Math.atan2(dx, dz) + Math.PI / 2 + ROBOT_ROT_EXTRA;
    const currentPos = { x: this.model.position.x, z: this.model.position.z, y: this.model.position.y };
    const startSpot = this.lastSpotIndex;
    const endSpot = homeSpot?.index ?? 1;
    let wps = [];
    let fullPath = [];

    const computePathAndFull = () => {
      wps = findPathTopoST(startSpot, endSpot, getSimTime(), SPEED, agentId);
      if (!wps || wps.length === 0) wps = findPathTopo(startSpot, endSpot);
      // Warn if path is too short (indicates pathfinding failure in directed graph)
      if (!wps || wps.length < 2) {
        console.warn(`⚠️ Robot${this.id} returnToRest: No valid path from MP${startSpot} to MP${endSpot}! wps.length=${wps?.length ?? 0}`);
      }
      const toPosR = (w) => ({ x: w.x, z: w.z });
      fullPath = [currentPos];
      for (let i = 0; i < wps.length; i++) fullPath.push(toPosR(wps[i]));
      fullPath.push({ x: this.homePosition.x, z: this.homePosition.z });
      return { wps, fullPath };
    };

    const runReturn = () => {
      let trackedHeading = normalizeAngleToMinusPiPi(this.model.rotation?.y ?? 0);
      const MIN_SEG_LEN_FOR_ROTATE = 0.1;
      const addPathSegment = (from, to) => {
        const dx = to.x - from.x;
        const dz = to.z - from.z;
        const len = Math.hypot(dx, dz);
        const dur = Math.max(0.05, len / SPEED);
        const rawAngle = len >= MIN_SEG_LEN_FOR_ROTATE ? rot(dx, dz) : trackedHeading;
        const angle = normalizeAngleShortestPath(trackedHeading, rawAngle);
        const angleNorm = normalizeAngleToMinusPiPi(angle);
        const turnDur = 0.25;
        const needRotate = len >= MIN_SEG_LEN_FOR_ROTATE && Math.abs(angleDiff(trackedHeading, angleNorm)) > 0.02;
        if (needRotate) {
          tl.to(this.model.rotation, { y: angleNorm, duration: turnDur, ease: "power1.inOut", onComplete: () => { trackedHeading = angleNorm; } });
          tl.to(this.model.position, { x: to.x, z: to.z, y: ROBOT_Y_OFFSET, duration: dur, ease: "none" }, '<');
        } else {
          tl.to(this.model.position, { x: to.x, z: to.z, y: ROBOT_Y_OFFSET, duration: dur, ease: "none" });
          if (len >= MIN_SEG_LEN_FOR_ROTATE) trackedHeading = angleNorm;
        }
        // If a new order arrives while returning to rest, reroute at the next node.
        tl.call(() => {
          if (this.returnReason !== 'rest') return;
          const v = this.pendingVehicle;
          if (!v || !v.needsCharging) return;
          this.pendingVehicle = null;
          // Defer: avoid killing timeline while it's executing its own callback stack.
          setTimeout(() => {
            this.stopCurrentMotion('reroute to new order at node');
            startRobotChargeMission(this, v);
          }, 0);
        });
        return true;
      };
      const addCrossing = (from, to) => {
        tl.to({}, { duration: CROSSING_YIELD });
        return addPathSegment(from, to);
      };

      const tl = gsap.timeline({
        onComplete: () => {
          this.state = 'idle';
          this.returnReason = null;
          this.lastRow = homeRow;
          this.lastSide = homeSide;
          this.atHome = true;
          this.lastSpotIndex = endSpot;
          if (onComplete) onComplete();
        }
      });
      this.timeline = tl;

      const toPos = (w) => ({ x: w.x, z: w.z, y: w.y != null ? w.y : 0 });
      let prev = currentPos;
      if (wps.length >= 1) {
        const startMP = toPos(wps[0]);
        const distToStart = Math.hypot(prev.x - startMP.x, prev.z - startMP.z);
        const sameColumn = Math.abs(prev.x - startMP.x) < 2;
        const likelyCiToMP = distToStart > 0.5 && distToStart < 3 && sameColumn;
        if (likelyCiToMP) {
          addGateWaitForCiToMP(tl, prev, startMP, SPEED, agentId, 200);
          addCiToMPManeuver(tl, this.model, prev, startMP, SPEED, rot, ROBOT_Y_OFFSET);
          tl.call(() => { trackedHeading = normalizeAngleToMinusPiPi(this.model.rotation.y); });
          prev = startMP;
        } else if (distToStart > 0.5) {
          if (addPathSegment(prev, startMP)) prev = startMP;
        } else {
          prev = startMP;
        }
      }
      for (let i = 1; i < wps.length; i++) {
        const from = wps[i - 1];
        const to = wps[i];
        const fromP = toPos(from);
        const toP = toPos(to);
        if (to?.type === 'conflict') {
          addApproachCFWaitingRule(tl, from, to, agentId);
          addGateWaitBeforeConflict(tl, toP.x, toP.z, agentId, 3, 1, 200);
        } else {
          if (from?.type === 'charge0') {
            const fromMP = getMovePointPosition(from.spotIndex);
            if (fromMP) addGateWaitUntilSegmentClear(tl, fromMP, toP, agentId);
          } else if (to?.type !== 'charge0') {
            addGateWaitUntilNextNodeClear(tl, toP, agentId);
          }
        }
        if (isCrossingSegment(from, to)) {
          if (addCrossing(fromP, toP)) prev = toP;
        } else {
          if (addPathSegment(prev, toP)) prev = toP;
        }
      }
      if (homeSpot) {
        addMPtoCiManeuver(tl, this.model, prev, this.homePosition, homeSpot, SPEED, rot, ROBOT_Y_OFFSET);
      } else {
        addPathSegment(prev, this.homePosition);
      }
      return tl;
    };

    let blockStartTime = null;
    let replanAttempts = 0;
    const tryStart = () => {
      // If a new order arrives before we even start moving, go directly.
      if (this.returnReason === 'rest' && this.pendingVehicle && this.pendingVehicle.needsCharging) {
        const v = this.pendingVehicle;
        this.pendingVehicle = null;
        startRobotChargeMission(this, v);
        return;
      }
      const t0 = getSimTime();
      computePathAndFull();
      const densePath = densifyWaypoints(fullPath);
      if (isPathBlocked(densePath, SPEED, t0, agentId)) {
        if (!blockStartTime) blockStartTime = Date.now();
        const blockedDuration = Date.now() - blockStartTime;
        if (blockedDuration > 1500) {
          console.warn(`⚠️ Robot${this.id} force leaving to rest after ${(blockedDuration / 1000).toFixed(1)}s blocked`);
          blockStartTime = null;
          replanAttempts = 0;
          logAgentPath(`Robot${this.id}`, wps, `Home (MP${endSpot}, rest)`, 'return-rest');
          releaseAgent(agentId);
          reservePath(densePath, t0, SPEED, agentId, RESERVE_WINDOW_SEC);
          const travelT = pathDistance(densePath) / SPEED;
          reservePoint(this.homePosition.x, this.homePosition.z, Math.max(0, t0 + travelT - RESERVE_WINDOW_SEC), t0 + travelT + DEST_HOLD_SEC + RESERVE_WINDOW_SEC, agentId);
          runReturn();
          return;
        }
        if (blockedDuration > REPLAN_THRESHOLD_MS && replanAttempts < MAX_REPLAN_ATTEMPTS) {
          replanAttempts++;
          console.log(`🔄 Robot${this.id} re-planning return to rest (attempt ${replanAttempts}) after ${(blockedDuration/1000).toFixed(1)}s blocked`);
          blockStartTime = Date.now();
        }
        setTimeout(tryStart, 500);
        return;
      }
      blockStartTime = null;
      replanAttempts = 0;
      logAgentPath(`Robot${this.id}`, wps, `Home (MP${endSpot}, rest)`, 'return-rest');
      releaseAgent(agentId);
      reservePath(densePath, t0, SPEED, agentId, RESERVE_WINDOW_SEC);
      const travelT = pathDistance(densePath) / SPEED;
      reservePoint(
        this.homePosition.x,
        this.homePosition.z,
        Math.max(0, t0 + travelT - RESERVE_WINDOW_SEC),
        t0 + travelT + DEST_HOLD_SEC + RESERVE_WINDOW_SEC,
        agentId
      );
      runReturn();
    };
    tryStart();
    return gsap.timeline();
  }
}

// === Load Parking Lot === (暂时不显示)
// loader.load(
//   '/Parking_fixed.glb',
//   (gltf) => {
//     parkingLot = gltf.scene;
//     parkingLot.scale.set(1, 1, 1);
//     parkingLot.traverse((obj) => {
//       if (obj.isMesh) {
//         obj.receiveShadow = true;
//         obj.castShadow = true;
//       }
//     });
//     scene.add(parkingLot);
//     console.log('✅ Parking lot loaded');
//   },
//   undefined,
//   (err) => console.error('❌ Parking lot load error:', err)
// );

// === Gray background + Parking lines overlay（同位置，先灰底再白线）===
const texLoader = new THREE.TextureLoader();
const _pw = PARKING_LOT_BOUNDS.bottomRight.x - PARKING_LOT_BOUNDS.topLeft.x;
const _pd = PARKING_LOT_BOUNDS.bottomRight.z - PARKING_LOT_BOUNDS.topLeft.z;
const _pcx = (PARKING_LOT_BOUNDS.topLeft.x + PARKING_LOT_BOUNDS.bottomRight.x) / 2;
const _pcz = (PARKING_LOT_BOUNDS.topLeft.z + PARKING_LOT_BOUNDS.bottomRight.z) / 2;
const _pgeo = () => new THREE.PlaneGeometry(_pw, _pd);
const _ppos = () => ({ x: _pcx, y: 0, z: _pcz - 1.7 });
const _pscale = 1.118;
const _prot = -Math.PI / 2;

// Gray background (temporarily commented out)
// texLoader.load(
//   '/textures/gray_background_matched.png',
//   (mapGray) => {
//     mapGray.colorSpace = THREE.SRGBColorSpace;
//     const geo = _pgeo();
//     const mat = new THREE.MeshBasicMaterial({
//       map: mapGray,
//       side: THREE.DoubleSide
//     });
//     const plane = new THREE.Mesh(geo, mat);
//     plane.rotation.x = _prot;
//     plane.position.set(_ppos().x, _ppos().y - 0.005, _ppos().z+1.1);
//     plane.scale.set(_pscale+0.08, _pscale-0.08, _pscale);
//     scene.add(plane);
//     console.log('✅ Gray background overlay applied');
//   },
//   undefined,
//   (err) => console.error('❌ gray_background_matched.png load error:', err)
// );

// 停车线贴图（透明底白线）做旧效果
texLoader.load(
  '/textures/parking_lines_white.png',
  (map) => {
    map.colorSpace = THREE.SRGBColorSpace;
    const geo2 = _pgeo();
    const mat2 = new THREE.MeshStandardMaterial({
      map,
      color: 0xc8c4b0,              // 做旧：偏灰黄，不刺眼
      roughness: 0.65,
      metalness: 0.0,
      emissive: new THREE.Color(0xb8b4a0),
      emissiveIntensity: 0.08,       // 很弱，避免崭新感
      transparent: true,
      opacity: 0.88,                 // 略褪色
      alphaTest: 0.08,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
      side: THREE.DoubleSide
    });
    const plane2 = new THREE.Mesh(geo2, mat2);
    plane2.rotation.x = _prot;
    plane2.position.set(_ppos().x, _ppos().y, _ppos().z);
    plane2.scale.set(_pscale, _pscale, _pscale);
    scene.add(plane2);
    console.log('✅ Parking lines overlay applied (aged look)');
  },
  undefined,
  (err) => console.error('❌ parking_lines_white.png load error:', err)
);

// === Load Background Building (Treasure Island) ===
loader.load(
  '/Treasure_Island_3.glb',
  (gltf) => {
    const bg = gltf.scene;
    bg.scale.set(50, 50, 50);
    bg.position.set(-1, 8.05, -42);
    bg.rotation.x = -Math.PI / 60;
    bg.traverse((obj) => {
      if (obj.isMesh) {
        obj.receiveShadow = true;
        obj.castShadow = true;
        if (obj.material && (obj.material.isMeshStandardMaterial || obj.material.isMeshPhysicalMaterial)) {
          obj.material.color.setHex(0xe2e0dc);
          obj.material.roughness = Math.min(1, (obj.material.roughness ?? 0.5) + 0.2);
          if (obj.material.roughnessMap) obj.material.roughnessMap = null;
        }
      }
    });
    scene.add(bg);
    console.log('✅ Treasure Island background loaded');
  },
  undefined,
  (err) => console.error('❌ Treasure Island load error:', err)
);

// === Load Battery Station Models at Robot Home Spots (1 and 14) ===
const spot1 = PARKING_SPOTS.find((s) => s.index === 1);
const spot14 = PARKING_SPOTS.find((s) => s.index === 14);
const batteryStationSpots = [spot1, spot14];

// Load battery station models
batteryStationSpots.forEach((spot, idx) => {
  if (!spot) return;
  loader.load(
    '/battery_01.glb',
    (gltf) => {
      const batteryModel = gltf.scene.clone();
      batteryModel.scale.set(0.1, 0.1, 0.1);
      // Position at parking spot center
      batteryModel.position.set(spot.x, 0, spot.z);
      // Rotate to face the lane (90 degrees for spots on left side)
      batteryModel.rotation.y = spot.side === 'left' ? 0 : 0;
      batteryModel.traverse((obj) => {
        if (obj.isMesh) {
          obj.castShadow = true;
          obj.receiveShadow = true;
        }
      });
      scene.add(batteryModel);
      console.log(`🔋 Battery station ${idx + 1} loaded at spot ${spot.index} (${spot.x.toFixed(2)}, ${spot.z.toFixed(2)})`);
    },
    undefined,
    (err) => console.error(`❌ Battery station ${idx + 1} load error:`, err)
  );
});

// === Load Charging Robots (Small Caddie) ===
// 小机器人初始位置：1、14 车位中心（与充电站位置相同）
const robotHomeSpots = [spot1, spot14];
const robotPositions = robotHomeSpots.map((s) => {
  const ci = getChargePointPosition(s.index);
  return {
    x: ci.x,
    y: (ci.y != null ? ci.y : 0) + ROBOT_Y_OFFSET,
    z: ci.z
  };
});

robotPositions.forEach((pos, idx) => {
  console.log(`📦 Attempting to load robot ${idx + 1} from X-Caddie_textured.glb`);
  console.log(`   Position: (${pos.x}, ${pos.y}, ${pos.z})`);
  
  loader.load(
      '/Caddie_with_Arm_animation_nopipe.glb',
      (gltf) => {
        console.log(`✅ Robot ${idx + 1} model loaded successfully`);
        console.log(`   Scene has ${gltf.scene.children.length} children`);
        // Use gltf.scene directly (do not clone): AnimationClip tracks reference objects by UUID,
        // so they only work with the original scene. Each loader.load() gets its own gltf/scene.
      const robotModel = gltf.scene;
      robotModel.scale.set(.9, .9, .9);
      robotModel.position.set(pos.x, pos.y, pos.z);
      robotModel.rotation.y = Math.PI / 2 + ROBOT_ROT_EXTRA;
      const mixer = new THREE.AnimationMixer(robotModel);
      robotModel.userData.mixer = mixer;
      robotModel.userData.animations = gltf.animations || [];
      if (gltf.animations?.length) console.log(`   Animations: ${gltf.animations.length} clip(s): ${gltf.animations.map(c => c.name).join(', ')}`);
      robotModel.traverse((obj) => {
        if (obj.isMesh) {
          obj.castShadow = true;
          obj.receiveShadow = true;
          
          // Optimize PBR material configuration - preserve original PBR properties
          if (obj.material) {
            const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
            
            materials.forEach((material) => {
              // Ensure textures are properly configured
              if (material.map) {
                material.map.colorSpace = THREE.SRGBColorSpace;
                material.map.needsUpdate = true;
              }
              
              if (material.normalMap) {
                material.normalMap.needsUpdate = true;
              }
              
              if (material.metalnessMap) {
                material.metalnessMap.needsUpdate = true;
              }
              
              if (material.roughnessMap) {
                material.roughnessMap.needsUpdate = true;
              }
              
              if (material.aoMap) {
                material.aoMap.needsUpdate = true;
                material.aoMapIntensity = 0.4;  // 降低 AO 暗部，整体更亮
              }
              
              // Only set fallback if material has no color/texture data
              if (!material.map && (!material.color || (material.color.r === 0 && material.color.g === 0 && material.color.b === 0))) {
                material.color = new THREE.Color(0xcccccc);
                console.log(`⚠️ Small caddie material has no color data, using light gray fallback`);
              }
              
              // Ensure PBR materials respond to lighting, brighten X-Caddie
              if (material.isMeshStandardMaterial || material.isMeshPhysicalMaterial) {
                if (material.envMapIntensity !== undefined) material.envMapIntensity = 0.3;
                if (material.roughness !== undefined) material.roughness = Math.min(1, (material.roughness ?? 0.5) + 0.1);
                if (material.color) material.color.multiplyScalar(1.05);  // 提亮基础色
                material.emissive = material.emissive || new THREE.Color(0x888888);
                material.emissiveIntensity = (material.emissiveIntensity ?? 0) + 0.0;
              }
              material.needsUpdate = true;
            });
          } else {
            // Create default material only if completely missing
            obj.material = new THREE.MeshStandardMaterial({
              color: 0xcccccc,
              metalness: 0.5,
              roughness: 0.1,
              envMapIntensity: 0.3
            });
            console.log(`⚠️ Small caddie mesh has no material, created PBR default`);
          }
        }
      });
      scene.add(robotModel);

      const robot = new ChargingRobot(robotModel, pos, idx + 1, robotHomeSpots[idx]);
      const bl = createEntityLabel('battery');
      labelsContainer.appendChild(bl);
      robot.batteryLabel = bl;
      chargingRobots.push(robot);
      console.log(`🤖 Charging Robot ${idx + 1} loaded at (${pos.x}, ${pos.y}, ${pos.z})`);
      console.log(`   Initial rotation: y = ${robotModel.rotation.y} (${(robotModel.rotation.y * 180 / Math.PI).toFixed(1)}°)`);
      console.log(`   State: ${robot.state}, Battery: ${robot.batteryLevel}%`);
      console.log(`   Total robots in system: ${chargingRobots.length}`);
      
      // Verify robot is properly initialized
      if (robot.state !== 'idle') {
        console.warn(`⚠️ Robot ${idx + 1} not in idle state! Current state: ${robot.state}`);
      }
      if (robot.batteryLevel <= LOW_BATTERY_KWH) {
        console.warn(`⚠️ Robot ${idx + 1} battery low: ${robot.batteryLevel.toFixed(1)} kWh`);
      }
    },
    (xhr) => {
      // Progress callback
      if (xhr.lengthComputable) {
        const percentComplete = (xhr.loaded / xhr.total) * 100;
        if (percentComplete % 25 < 1) { // Log every 25%
          console.log(`📥 Robot ${idx + 1} loading: ${percentComplete.toFixed(0)}%`);
        }
      }
    },
    (err) => {
      console.error(`❌ Robot ${idx + 1} load error:`, err);
      console.error(`   Error details:`, err.message || err);
      console.error(`   This means robot ${idx + 1} will NOT be available for charging!`);
      console.log(`🔄 Attempting fallback to puppy_robot.glb...`);
      // Fallback to puppy_robot if small_caddie fails
      loader.load(
        '/puppy_robot.glb',
        (gltf) => {
          const robotModel = gltf.scene;
          robotModel.scale.set(0.75, 0.75, 0.75);
          robotModel.position.set(pos.x, pos.y, pos.z);
          robotModel.rotation.y = Math.PI / 2 + ROBOT_ROT_EXTRA;
          robotModel.traverse((obj) => {
            if (obj.isMesh) obj.castShadow = true;
          });
          reduceReflections(robotModel, 0.3);
          scene.add(robotModel);

          const robot = new ChargingRobot(robotModel, pos, idx + 1, robotHomeSpots[idx]);
          const bl = createEntityLabel('battery');
          labelsContainer.appendChild(bl);
          robot.batteryLabel = bl;
          chargingRobots.push(robot);
          console.log(`🤖 Charging Robot ${idx + 1} loaded (fallback) at (${pos.x}, ${pos.y}, ${pos.z})`);
          console.log(`   Initial rotation: y = ${robotModel.rotation.y} (${(robotModel.rotation.y * 180 / Math.PI).toFixed(1)}°)`);
          console.log(`   State: ${robot.state}, Battery: ${robot.batteryLevel}%`);
          console.log(`   Total robots in system: ${chargingRobots.length}`);
        },
        undefined,
        (fallbackErr) => {
          console.error(`❌ Fallback robot ${idx + 1} also failed to load:`, fallbackErr);
        }
      );
    }
  );
});

// === Define 44 Parking Spots ===
// 使用从 orderSystem.js 导入的44个停车位
const parkingSpots = PARKING_SPOTS.map(spot => ({
  ...spot,
  y: spot.y || 1 // 确保y坐标为1
}));

// Track which parking spots are occupied (保持兼容性)
const occupiedSpots = new Set();

// === Initialize Order Manager ===
const robotInitialPositions = robotPositions.map((p) => ({ x: p.x, y: p.y, z: p.z }));
const orderManager = new OrderManager(robotInitialPositions);

// === Visualize Parking Spots (for debugging) ===
function visualizeParkingSpots() {
  parkingSpots.forEach((spot) => {
    // Create a function to create text sprite with circle
    function createNumberLabelWithCircle(number, fontSize = 120) {
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      const size = 384; // Medium canvas size for good quality
      canvas.width = size;
      canvas.height = size;
      
      // Clear canvas with transparent background
      context.clearRect(0, 0, canvas.width, canvas.height);
      
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const circleRadius = 140; // Medium circle radius
      
      // Draw white circle background
      context.beginPath();
      context.arc(centerX, centerY, circleRadius, 0, Math.PI * 2);
      context.fillStyle = 'rgba(255, 255, 255, 0.95)';
      context.fill();
      
      // Draw circle border
      context.beginPath();
      context.arc(centerX, centerY, circleRadius, 0, Math.PI * 2);
      context.strokeStyle = '#000000';
      context.lineWidth = 8; // Medium border
      context.stroke();
      
      // Set text style
      context.font = `Bold ${fontSize}px Arial`;
      context.fillStyle = '#000000';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      
      // Draw number text with outline for better visibility
      context.strokeStyle = '#FFFFFF';
      context.lineWidth = 4;
      context.strokeText(number.toString(), centerX, centerY);
      context.fillText(number.toString(), centerX, centerY);
      
      // Create texture from canvas
      const texture = new THREE.CanvasTexture(canvas);
      texture.needsUpdate = true;
      
      // Create plane geometry for the label (lying flat on ground)
      const planeGeometry = new THREE.PlaneGeometry(3, 3); // Medium size
      const planeMaterial = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        alphaTest: 0.1,
        side: THREE.DoubleSide
      });
      
      const plane = new THREE.Mesh(planeGeometry, planeMaterial);
      // Rotate to lie flat on the ground
      plane.rotation.x = -Math.PI / 2;
      plane.position.y = 0.01; // Slightly above ground to avoid z-fighting
      
      return plane;
    }
    
    // Create number label on the ground
    const numberLabel = createNumberLabelWithCircle(spot.index, 130);
    numberLabel.position.set(spot.x, 0.01, spot.z);
    scene.add(numberLabel);
    
    console.log(`📍 Parking spot ${spot.index} (${spot.side}): (${spot.x.toFixed(2)}, ${spot.z.toFixed(2)})`);
  });
  console.log(`✅ Visualized ${parkingSpots.length} parking spots with number labels on ground`);
}

// === Visualize Graph Structures (Robot & Vehicle) on Ground ===
const GRAPH_Y = 0.025;
let graphGroup = null;

function visualizeGraphStructures() {
  _vehicleLaneNodeById = null; // 强制用完整图数据（含 turn_start/end、slot<->S）
  if (!graphGroup) {
    graphGroup = new THREE.Group();
    graphGroup.name = 'graphStructures';
    graphGroup.renderOrder = 1000;
    scene.add(graphGroup);
  }
  while (graphGroup.children.length) graphGroup.remove(graphGroup.children[0]);

  const nodeById = (nodes) => {
    const m = new Map();
    for (const n of nodes) m.set(n.id, n);
    return m;
  };

  const arrowHeadGeom = new THREE.ConeGeometry(0.15, 0.4, 6);
  arrowHeadGeom.rotateX(Math.PI / 2);

  function addArrowHead(fromX, fromZ, toX, toZ, material) {
    const dx = toX - fromX;
    const dz = toZ - fromZ;
    const len = Math.hypot(dx, dz);
    if (len < 0.5) return;
    const t = 0.7;
    const ax = fromX + dx * t;
    const az = fromZ + dz * t;
    const arrow = new THREE.Mesh(arrowHeadGeom, material);
    arrow.position.set(ax, GRAPH_Y + 0.02, az);
    arrow.rotation.y = Math.atan2(dx, dz);
    arrow.frustumCulled = false;
    graphGroup.add(arrow);
  }

  // Robot graph (topology): cyan/teal
  const robotData = getGraphData();
  const robotNodes = nodeById(robotData.nodes);
  const robotPositions = [];
  const robotArrowMat = new THREE.MeshBasicMaterial({ color: 0x00bcd4, side: THREE.DoubleSide });

  for (const e of robotData.edges) {
    const a = robotNodes.get(e.from);
    const b = robotNodes.get(e.to);
    if (a && b) {
      robotPositions.push(a.x, GRAPH_Y, a.z, b.x, GRAPH_Y, b.z);
      addArrowHead(a.x, a.z, b.x, b.z, robotArrowMat);
    }
  }
  if (robotPositions.length > 0) {
    const robotGeo = new THREE.BufferGeometry();
    robotGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(robotPositions), 3));
    const robotLines = new THREE.LineSegments(robotGeo, new THREE.LineBasicMaterial({ color: 0x00bcd4, linewidth: 1 }));
    robotLines.frustumCulled = false;
    graphGroup.add(robotLines);
  }

  // Vehicle lane graph: 先取数据再统一画（保证含 turn_endpoint 与 slot<->S）
  const vehicleLane = getVehicleLaneGraphData();
  const laneNodeById = new Map(vehicleLane.nodes.map((n) => [n.id, n]));
  const vehiclePositions = [];
  const vehicleArrowMat = new THREE.MeshBasicMaterial({ color: 0xff9800, side: THREE.DoubleSide });
  const drawn = new Set();
  const slotSpotPositions = [];
  const slotSpotArrows = []; // { fromX, fromZ, toX, toZ } 箭头从 slot 指向 spot

  for (const e of vehicleLane.edges) {
    const a = laneNodeById.get(e.from);
    const b = laneNodeById.get(e.to);
    if (!a || !b) continue;
    const key = [e.from, e.to].sort().join('|');
    if (drawn.has(key)) continue;
    drawn.add(key);
    const isSlotSpot = (a.type === 'slot_turn' && b.type === 'spot') || (a.type === 'spot' && b.type === 'slot_turn');
    if (isSlotSpot) {
      slotSpotPositions.push(a.x, GRAPH_Y + 0.02, a.z, b.x, GRAPH_Y + 0.02, b.z);
      const slot = a.type === 'slot_turn' ? a : b;
      const spot = a.type === 'spot' ? a : b;
      slotSpotArrows.push({ fromX: slot.x, fromZ: slot.z, toX: spot.x, toZ: spot.z });
    } else {
      vehiclePositions.push(a.x, GRAPH_Y, a.z, b.x, GRAPH_Y, b.z);
    }
    const aIsSpot = a.type === 'spot';
    const bIsSpot = b.type === 'spot';
    if (!(aIsSpot || bIsSpot)) addArrowHead(a.x, a.z, b.x, b.z, vehicleArrowMat);
  }

  if (vehiclePositions.length > 0) {
    const vehicleGeo = new THREE.BufferGeometry();
    vehicleGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vehiclePositions), 3));
    const vehicleLines = new THREE.LineSegments(vehicleGeo, new THREE.LineBasicMaterial({ color: 0xff9800, linewidth: 1 }));
    vehicleLines.frustumCulled = false;
    graphGroup.add(vehicleLines);
  }

  if (slotSpotPositions.length > 0) {
    const slotSpotGeo = new THREE.BufferGeometry();
    slotSpotGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(slotSpotPositions), 3));
    const slotSpotLines = new THREE.LineSegments(slotSpotGeo, new THREE.LineBasicMaterial({ color: 0xffc107, linewidth: 1 }));
    slotSpotLines.frustumCulled = false;
    graphGroup.add(slotSpotLines);
    const slotSpotArrowMat = new THREE.MeshBasicMaterial({ color: 0xffc107, side: THREE.DoubleSide });
    for (const arr of slotSpotArrows) {
      addArrowHead(arr.fromX, arr.fromZ, arr.toX, arr.toZ, slotSpotArrowMat);
    }
  }

  const dotGeom = new THREE.CircleGeometry(0.2, 12);
  const turnEndpointDotGeom = new THREE.CircleGeometry(0.28, 12);
  const robotDotMat = new THREE.MeshBasicMaterial({ color: 0x00bcd4, side: THREE.DoubleSide });
  const vehicleDotMat = new THREE.MeshBasicMaterial({ color: 0xff9800, side: THREE.DoubleSide });
  const spotDotMat = new THREE.MeshBasicMaterial({ color: 0xffc107, side: THREE.DoubleSide });
  const turnEndpointDotMat = new THREE.MeshBasicMaterial({ color: 0x4caf50, side: THREE.DoubleSide });

  for (const n of robotData.nodes) {
    const dot = new THREE.Mesh(dotGeom, robotDotMat);
    dot.rotation.x = -Math.PI / 2;
    dot.position.set(n.x, GRAPH_Y, n.z);
    graphGroup.add(dot);
  }
  for (const n of vehicleLane.nodes) {
    const isTurnEndpoint = n.type === 'turn_endpoint';
    const dot = new THREE.Mesh(
      isTurnEndpoint ? turnEndpointDotGeom : dotGeom,
      isTurnEndpoint ? turnEndpointDotMat : (n.type === 'spot' ? spotDotMat : vehicleDotMat)
    );
    dot.rotation.x = -Math.PI / 2;
    dot.position.set(n.x, GRAPH_Y + (isTurnEndpoint ? 0.03 : 0), n.z);
    graphGroup.add(dot);
  }

  // === Graph node labels (names) ===
  clearGraphLabels();

  // Robot topology nodes: turn_* / move_* (MP)
  for (const n of robotData.nodes) {
    const y = GRAPH_Y + 0.05;
    if (n.type === 'turn') {
      addGraphLabel(`R:${n.id}`, n.x, y, n.z, 'robot_turn');
    } else if (n.type === 'move') {
      const spotIdx = n.spotIndex ?? '';
      const name = spotIdx ? `R:MP${spotIdx}` : `R:${n.id}`;
      addGraphLabel(name, n.x, y, n.z, 'robot_charge');
    } else if (n.type === 'charge') {
      const spotIdx = n.spotIndex ?? '';
      const name = spotIdx ? `C${spotIdx}` : `C:${n.id}`;
      addGraphLabel(name, n.x, y, n.z, 'robot_charge');
    } else if (n.type === 'charge0') {
      const spotIdx = n.spotIndex ?? '';
      const name = spotIdx ? `C${spotIdx}_0` : `C:${n.id}`;
      addGraphLabel(name, n.x, y, n.z, 'robot_charge');
    } else if (n.type === 'conflict') {
      // conflict points: R:CF_1_24_right etc
      const name = `R:CF_${n.slotGroup}_${n.side}`;
      addGraphLabel(name, n.x, y, n.z, 'robot_conflict');
    }
  }

  // Vehicle lane graph labels (V:slot, S, V:entrance, turn_start/end, etc.)
  for (const n of vehicleLane.nodes) {
    if (n.type === 'turn_endpoint') {
      addGraphLabel(`V:${n.id}`, n.x, GRAPH_Y + 0.08, n.z, 'turn_endpoint');
    } else if (n.type === 'slot_turn') {
      const slotIndices = n.meta?.slotIndices ?? [];
      const suffix = slotIndices.length ? `_${slotIndices.join('_')}` : '';
      addGraphLabel(`V:slot${suffix}`, n.x, GRAPH_Y + 0.05, n.z, 'vehicle_kp');
    } else if (n.type === 'spot') {
      addGraphLabel(n.id, n.x, GRAPH_Y + 0.05, n.z, 'parking_spot');
    } else if (n.type === 'conflict') {
      const name = n.id === 'cf_25_44_left'
        ? 'R:CF_25_44_left'
        : (n.id === 'cf_25_44_right' ? 'R:CF_25_44_right' : `R:${n.id}`);
      addGraphLabel(name, n.x, GRAPH_Y + 0.05, n.z, 'robot_conflict');
    } else {
      addGraphLabel(`V:${n.id}`, n.x, GRAPH_Y + 0.05, n.z, 'vehicle_kp');
    }
  }

  const turnEndpointCount = vehicleLane.nodes.filter((n) => n.type === 'turn_endpoint').length;
  const slotSpotSegmentCount = slotSpotPositions.length / 6;
  console.log(
    `✅ Graph: ${vehicleLane.nodes.length} nodes (${turnEndpointCount} turn start/end), ${vehicleLane.edges.length} edges, ` +
    `V:slot↔S: ${slotSpotSegmentCount} segments (amber)`
  );
}

// === Visualize Charge Points (Ci) ===
function visualizeChargePoints() {
  const markerGeom = new THREE.CylinderGeometry(0.35, 0.35, 0.04, 24);
  const markerMat = new THREE.MeshBasicMaterial({ color: 0xff9800 });
  parkingSpots.forEach((spot) => {
    const ci = getChargePointPosition(spot.index);
    if (!ci) return;
    const marker = new THREE.Mesh(markerGeom, markerMat);
    marker.position.set(ci.x, 0.02, ci.z);
    marker.rotation.x = 0;
    marker.rotation.z = 0;
    scene.add(marker);
  });
  console.log(`✅ Visualized ${parkingSpots.length} charge points on map`);
}

// === Load Vehicles with Order System ===
function createVehicleSequence() {
  let vehicleCounter = 0;

  function spawnVehicleFromOrder() {
    // 使用订单系统创建新订单
    const order = orderManager.createOrder();
    if (!order) {
      console.log('⚠️ No available parking spots, waiting...');
      setTimeout(() => spawnVehicleFromOrder(), 5000);
      return;
    }
    
    vehicleCounter++;
    const selectedSpot = order.parkingSpot;
    const parkingSpotIndex = selectedSpot.index - 1; // 转换为0-based索引（用于兼容性）
    
    // 更新occupiedSpots以保持兼容性
    occupiedSpots.add(parkingSpotIndex);
    console.log(`🅿️ Vehicle ${vehicleCounter} assigned to spot ${selectedSpot.index} (${selectedSpot.side} side) via Order ${order.id}`);

    const VEHICLE_MODEL_PATHS = [
      '/Tesla_with_chargeport_animation_BLUE.glb',
      '/Tesla_with_chargeport_animation_GREEN.glb',
      '/Tesla_with_chargeport_animation_RED.glb'
    ];
    const vehicleModelPath = VEHICLE_MODEL_PATHS[Math.floor(Math.random() * VEHICLE_MODEL_PATHS.length)];

    loader.load(
      vehicleModelPath,
      (gltf) => {
        // Use vehicle lane graph node coordinates as single source of truth
        const graphEntrance = getVehicleNodePos('entrance') || { x: KP.ENTRANCE.x, z: KP.ENTRANCE.z };

        // Use gltf.scene directly (do not clone) so AnimationClips work (they reference object UUIDs)
        const carMesh = gltf.scene;
        const car = new THREE.Group();
        car.add(carMesh);
        carMesh.position.set(3, -1., 0.5);
        car.scale.set(0.9, 0.9, 0.9);
        car.position.set(graphEntrance.x, 0.825, graphEntrance.z);
        // 往 -y(-Z) 方向看，再逆时针旋转 90°
        car.rotation.y = Math.PI + Math.PI / 2;
        carMesh.traverse((obj) => {
          if (obj.isMesh) {
            obj.castShadow = true;
            obj.receiveShadow = true;
          }
        });
        reduceReflections(carMesh, 0.3);
        scene.add(car);

        const targetParkingSpot = {
          x: selectedSpot.x,
          z: selectedSpot.z,
          y: selectedSpot.y
        };

        const vehicleMixer = new THREE.AnimationMixer(carMesh);
        const vehicleClips = gltf.animations || [];
        if (vehicleClips.length) console.log(`   Tesla animations: ${vehicleClips.map(c => c.name).join(', ')}`);

        const vehicle = {
          model: car,
          position: targetParkingSpot,
          parkingSpot: selectedSpot,
          id: vehicleCounter,
          orderId: order.id,
          needsCharging: true,
          chargeDemandKwh: 10 + Math.random() * 10,
          slotGroup: getSlotGroup(selectedSpot.index),
          phase: 'entering',
          chargeportMixer: vehicleMixer,
          chargeportAnimations: vehicleClips
        };
        const dl = createEntityLabel('demand');
        labelsContainer.appendChild(dl);
        vehicle.demandLabel = dl;
        vehicles.push(vehicle);
        orderManager.assignVehicle(order.id, vehicleCounter);
        collisionAvoidance.addOccupiedPosition(
          { x: graphEntrance.x, z: graphEntrance.z },
          `vehicle_${vehicleCounter}`,
          'car'
        );

        console.log(`🚗 Vehicle ${vehicleCounter} entering parking lot`);
        console.log(`   Target spot: ${selectedSpot.side} side, index ${selectedSpot.index} at (${targetParkingSpot.x.toFixed(2)}, ${targetParkingSpot.z.toFixed(2)})`);

        const startEnterAnimation = () => {
        const VEHICLE_SPEED = 4.0;
        const VEHICLE_Y = 0.825;
        const agentId = `vehicle_${vehicleCounter}`;
        const RESERVE_WINDOW_SEC = 1.0;
        const cp = selectedSpot.chargePoint ? { x: selectedSpot.chargePoint.x, z: selectedSpot.chargePoint.z } : null;
        let smartPath, denseFull, spotCenter;
        const precomputedEnter = PRECOMPUTED_TRAJECTORIES.get(selectedSpot.index);
        if (precomputedEnter) {
          smartPath = precomputedEnter.enterSmartPath;
          denseFull = precomputedEnter.enterDensePoints;
          spotCenter = { x: targetParkingSpot.x, z: targetParkingSpot.z };
        } else {
          // Fallback for excluded slots (1, 2, 13, 14): build from graph/keypoints
          const graphTurn = getVehicleNodePos(selectedSpot.index >= 25 ? 'turn_25_44_entry' : 'turn_1_24_entry');
          const slotNodeId = getSlotTurnId(selectedSpot.index).replace('V:', '');
          const graphSlotTurn = getVehicleNodePos(slotNodeId);
          const graphC = getChargePointPosition(selectedSpot.index);
          const graphSpot = getVehicleNodePos(`S${selectedSpot.index}`) || { x: targetParkingSpot.x, z: targetParkingSpot.z };
          const fallbackKps = getVehicleTrajectoryKeypoints(selectedSpot.index, targetParkingSpot, 'enter');
          const turnId = selectedSpot.index >= 25 ? 'V:turn_25_44_entry' : 'V:turn_1_24_entry';
          const slotId = getSlotTurnId(selectedSpot.index);
          const keypoints = [
            { ...(graphEntrance || (fallbackKps[0] && { x: fallbackKps[0].x, z: fallbackKps[0].z })), id: 'V:entrance' },
            { ...(graphTurn || (fallbackKps[1] && { x: fallbackKps[1].x, z: fallbackKps[1].z })), id: turnId },
            { ...(graphSlotTurn || (fallbackKps[2] && { x: fallbackKps[2].x, z: fallbackKps[2].z })), id: slotId },
            ...(graphC ? [{ ...graphC, id: `C${selectedSpot.index}` }] : []),
            { ...(graphSpot || (fallbackKps[fallbackKps.length - 1] && { x: fallbackKps[fallbackKps.length - 1].x, z: fallbackKps[fallbackKps.length - 1].z })), id: `S${selectedSpot.index}` }
          ].filter(Boolean);
          spotCenter = { x: graphSpot.x, z: graphSpot.z };
          smartPath = keypoints.every(p => p && p.x != null && p.z != null)
            ? buildSmartPathFromKeypoints(keypoints)
            : planVehicleEnterSmartPath(selectedSpot.index, targetParkingSpot);
          denseFull = smartPath.length > 0 ? smartPathToDensePoints(smartPath, 0.5) : densifyWaypoints(planVehicleEnterTrajectory(selectedSpot.index, targetParkingSpot, 1.2));
        }

        // Log trajectory nodes
        const pathNodes = getVehicleEnterPathNodes(selectedSpot.index, targetParkingSpot);
        console.log(`📍 Vehicle${vehicleCounter} trajectory: ${pathNodes.join(' -> ')} [dest: Spot ${selectedSpot.index}]`);

        // If path is blocked, retry later
        if (isPathBlocked(denseFull, VEHICLE_SPEED, getSimTime(), agentId)) {
          setTimeout(startEnterAnimation, 250);
          return;
        }

        const runFullPathToSpot = () => {
          releaseAgent(agentId);
          reservePath(denseFull, getSimTime(), VEHICLE_SPEED, agentId, RESERVE_WINDOW_SEC);
          const enterTl = gsap.timeline({
            onComplete: () => {
              car.position.set(spotCenter.x, VEHICLE_Y, spotCenter.z);
              const parkAngle = (selectedSpot.opening === '+z' ? Math.PI : 0) + VEHICLE_MODEL_Y_OFFSET;
              const currentY = car.rotation.y;
              const diff = Math.abs(angleDiff(currentY, parkAngle));
              const onParked = () => {
                vehicle.phase = 'parked';
                vehicle.parkedAt = vehicle.parkedAt ?? getSimTime();
                console.log(`🚗 Vehicle ${vehicleCounter} parked at ${selectedSpot.side} side spot ${selectedSpot.index}`);
                assignRobotToVehicle(vehicle);
              };
              if (diff < 0.08) {
                onParked();
              } else {
                const targetY = normalizeAngleShortestPath(currentY, parkAngle);
                gsap.to(car.rotation, { y: targetY, duration: 0.35, ease: 'power1.inOut', onComplete: onParked });
              }
            }
          });
          appendSmartPathMotion(enterTl, car, smartPath, VEHICLE_SPEED, VEHICLE_Y);
        };

        // 车辆转弯进入车位前：先等 R:MP(slot)、C_next_0->R:MP、C_next->R:MP 段无机器人，再等 cp/lane 资源后驶入
        const proceedToResourceAndPath = () => {
          if (cp) {
            waitForResourceAndPoint(cp.x, cp.z, mpResId(selectedSpot.index), agentId, 0.8, 200, () => {
              waitForResourceAndPoint(targetParkingSpot.x, selectedSpot.index >= 25 ? -6.5 : -23.0, laneResId(targetParkingSpot.x, selectedSpot.index >= 25 ? -6.5 : -23.0), agentId, 0.8, 200, runFullPathToSpot);
            });
          } else {
            waitForResourceAndPoint(targetParkingSpot.x, selectedSpot.index >= 25 ? -6.5 : -23.0, laneResId(targetParkingSpot.x, selectedSpot.index >= 25 ? -6.5 : -23.0), agentId, 0.8, 200, runFullPathToSpot);
          }
        };
        waitUntilSlotApproachClear(selectedSpot.index, 200, proceedToResourceAndPath);
        };

        const tryStartEnter = () => {
          if (isVehicleNearEntryTurn(vehicles, vehicle.slotGroup, vehicle.id)) {
            setTimeout(tryStartEnter, 300);
            return;
          }
          startEnterAnimation();
        };
        tryStartEnter();

        // After charging, vehicle leaves
        const checkAndLeave = () => {
          if (vehicle.phase === 'leaving') return; // already in leave timeline, avoid starting a second one (would jump car back to spot)
          if (!vehicle.needsCharging) {
            if (isVehicleInReverseSafetyZone(vehicles, selectedSpot.index, vehicle.id, getVehicleNodePos) ||
                isRobotInReverseSafetyZone(chargingRobots, selectedSpot.index)) {
              setTimeout(checkAndLeave, 300);
              return;
            }
            const VEHICLE_SPEED = 4.0;
            const VEHICLE_Y = 0.85;
            const agentId = `vehicle_${vehicleCounter}`;
            const RESERVE_WINDOW_SEC = 1.0;
            const cp = selectedSpot.chargePoint ? { x: selectedSpot.chargePoint.x, z: selectedSpot.chargePoint.z } : null;
            const spotCenter = { x: targetParkingSpot.x, z: targetParkingSpot.z };

            let lanePoint, exitSmartPath, fullReversePath, pathForMotion, denseExitForward, denseExit;
            const precomputedExit = PRECOMPUTED_TRAJECTORIES.get(selectedSpot.index);
            if (precomputedExit) {
              lanePoint = precomputedExit.lanePoint;
              exitSmartPath = precomputedExit.exitSmartPath;
              fullReversePath = precomputedExit.fullReversePath;
              pathForMotion = precomputedExit.reversePathForMotion;
              denseExitForward = precomputedExit.denseExitForward;
              denseExit = precomputedExit.denseExit;
            } else {
              const slotArc = getSlotTurnArcForEgress(selectedSpot.index, targetParkingSpot);
              const exitKps = getVehicleTrajectoryKeypoints(selectedSpot.index, targetParkingSpot, 'exit');
              lanePoint = slotArc
                ? slotArc.arcStart
                : (exitKps.length >= 2 ? { x: exitKps[1].x, z: exitKps[1].z } : { x: targetParkingSpot.x, z: selectedSpot.index >= 25 ? -6.5 : -23.0 });
              exitSmartPath = slotArc && exitKps.length >= 4
                ? buildSmartPath([{ ...lanePoint, id: getSlotTurnId(selectedSpot.index) }, exitKps[2], exitKps[3]], getTurnRadiusForKeypoint)
                : planVehicleExitSmartPath(selectedSpot.index, targetParkingSpot);
              const reverseArcPoints = slotArc ? sampleArcReverse(slotArc, 0.85) : [];
              const straightToArcEnd = cp ? [spotCenter, cp, slotArc?.arcEnd].filter(Boolean) : (slotArc ? [spotCenter, slotArc.arcEnd] : null);
              fullReversePath = slotArc && straightToArcEnd?.length
                ? [...straightToArcEnd, ...reverseArcPoints.slice(1)]
                : (cp ? [spotCenter, cp, lanePoint] : [spotCenter, lanePoint]);
              pathForMotion = simplifyPathByRadius(fullReversePath);
              pathForMotion = pathForMotion.length >= 2 ? pathForMotion : fullReversePath;
              denseExitForward = smartPathToDensePoints(exitSmartPath, 0.7);
              denseExit = slotArc && straightToArcEnd?.length
                ? [...densifyWaypoints(straightToArcEnd, 0.8), ...reverseArcPoints.slice(1), ...denseExitForward]
                : [...densifyWaypoints(cp ? [spotCenter, cp, lanePoint] : [spotCenter, lanePoint], 0.8), ...denseExitForward];
            }

            const t0 = getSimTime() + 0.8;
            if (isPathBlocked(denseExit, VEHICLE_SPEED, t0, agentId)) {
              setTimeout(checkAndLeave, 300);
              return;
            }

            // Only start leaving after we know the path is feasible.
            vehicle.phase = 'leaving';

            // Log vehicle exit path with proper slot_turn nodes
            const exitPathNodes = getVehicleExitPathNodes(selectedSpot.index);
            console.log(`📍 Vehicle${vehicleCounter} exit path: ${exitPathNodes.join(' -> ')} [leaving spot ${selectedSpot.index}]`);

            const leaveTl = gsap.timeline({
              onComplete: () => {
                if (vehicle.demandLabel && vehicle.demandLabel.parentNode) vehicle.demandLabel.remove();
                scene.remove(car);
                const index = vehicles.indexOf(vehicle);
                if (index > -1) vehicles.splice(index, 1);
                occupiedSpots.delete(parkingSpotIndex);
                if (vehicle.orderId) {
                  orderManager.completeOrder(vehicle.orderId);
                }
                collisionAvoidance.removeOccupiedPosition(`vehicle_${vehicleCounter}`);
                releaseAgent(`vehicle_${vehicleCounter}`);
                console.log(`🚗 Vehicle ${vehicleCounter} left, spot ${selectedSpot.index} is now available`);
              }
            });
            releaseAgent(agentId);
            reservePath(denseExit, t0, VEHICLE_SPEED, agentId, RESERVE_WINDOW_SEC);
            // Reverse out of the spot: straight to arc end, then reverse along the same arc as enter (spot → lane).
            if (cp) {
              addGateWaitAtResourceAndPoint(leaveTl, cp.x, cp.z, mpResId(selectedSpot.index), agentId, 0.8, 200, false);
            }
            addGateWaitAtResourceAndPoint(leaveTl, lanePoint.x, lanePoint.z, laneResId(lanePoint.x, lanePoint.z), agentId, 0.8, 200, false);
            addReReserveAtPoint(leaveTl, agentId, fullReversePath, VEHICLE_SPEED, RESERVE_WINDOW_SEC);
            appendVehicleReverseMotion(leaveTl, car, pathForMotion, VEHICLE_SPEED, VEHICLE_Y, { minSegDur: 0.08 });
            // Normalize rotation to [-PI, PI] so forward segment tween takes shortest path (avoids 360° spin)
            leaveTl.call(() => { car.rotation.y = normalizeAngleToMinusPiPi(car.rotation.y); });

            if (exitSmartPath.length > 0) {
              if (pathUsesExitCorridor(denseExitForward)) {
                const corridorTransitTime = Math.abs(EXIT_CORRIDOR_Z_MAX - EXIT_CORRIDOR_Z_MIN) / VEHICLE_SPEED + 1;
                addGateWaitForExitCorridor(leaveTl, agentId, corridorTransitTime, 200);
              }
              addReReserveAtPoint(leaveTl, agentId, denseExitForward, VEHICLE_SPEED, RESERVE_WINDOW_SEC);
              const reverseEndHeading = precomputedExit?.reverseEndHeading ?? (pathForMotion.length >= 2
                ? (() => {
                    const prev = pathForMotion[pathForMotion.length - 2];
                    const last = pathForMotion[pathForMotion.length - 1];
                    const backDir = Math.atan2(prev.x - last.x, prev.z - last.z) + VEHICLE_MODEL_Y_OFFSET;
                    return normalizeAngleShortestPath(0, backDir);
                  })()
                : undefined);
              appendSmartPathMotion(leaveTl, car, exitSmartPath, VEHICLE_SPEED, VEHICLE_Y, reverseEndHeading !== undefined ? { initialHeading: reverseEndHeading } : {});
            }
            leaveTl.to(car.position, { y: -1, duration: 0.5, ease: "power1.inOut" });
          } else {
            setTimeout(checkAndLeave, 2000);
          }
        };
        
        vehicle.requestLeaveCheck = checkAndLeave;
        setTimeout(checkAndLeave, 10000);
      },
      undefined,
      (err) => console.error(`❌ Vehicle ${vehicleCounter} load error:`, err)
    );
  }

  // Spawn vehicles periodically using order system
  function scheduleNextOrder() {
    const delay = 10000 + Math.random() * 5000; // 10-15秒随机延迟
    setTimeout(() => {
      if (vehicles.length < 10) { // Limit concurrent vehicles
        spawnVehicleFromOrder();
      }
      scheduleNextOrder();
    }, delay);
  }
  
  // 启动订单生成
  setTimeout(() => scheduleNextOrder(), 5000); // 5秒后开始
}

function totalDemandKwh() {
  return vehicles
    .filter(v => v.needsCharging)
    .reduce((s, v) => s + (v.chargeDemandKwh ?? 0), 0);
}

/**
 * Vehicle kinematic parameters for Ackermann steering
 */
const VEHICLE_WHEELBASE = 2.5; // meters
const VEHICLE_MAX_STEERING_ANGLE = Math.PI / 4.5; // ~40 degrees (smaller turn radius)
/** 车辆模型绕 y 轴偏移：逆时针（从 -y 方向看）90° */
const VEHICLE_MODEL_Y_OFFSET = Math.PI / 2;

const minSegDur = 0.05;

/** Normalize angle to [-PI, PI] so GSAP rotation tween takes shortest path (avoids 360° spin after reverse). */
function normalizeAngleToMinusPiPi(angle) {
  let a = angle;
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

/**
 * Execute a smart path (STRAIGHT + ARC instructions) on a GSAP timeline at constant speed.
 * @param {gsap.core.Timeline} tl
 * @param {THREE.Object3D} car
 * @param {Array<{type:'STRAIGHT',start:{x,z},end:{x,z}}|{type:'ARC',center:{x,z},radius:number,startAngle:number,endAngle:number,clockwise:boolean}>} smartPath
 * @param {number} speed m/s
 * @param {number} vehicleY
 * @param {{ initialHeading?: number }} opts optional; initialHeading = heading at path start (e.g. after reverse) to avoid wrong rotation when timeline is built before run
 */
function appendSmartPathMotion(tl, car, smartPath, speed, vehicleY, opts = {}) {
  if (!tl || !car || !Array.isArray(smartPath) || smartPath.length === 0) return;
  let currentHeading = typeof opts.initialHeading === 'number' ? opts.initialHeading : (car.rotation?.y ?? 0);

  // When continuing from reverse (exit path), snap to first segment start to avoid 1-frame jump
  if (typeof opts.initialHeading === 'number' && smartPath.length > 0) {
    const seg0 = smartPath[0];
    if (seg0 && seg0.start && typeof seg0.start.x === 'number' && typeof seg0.start.z === 'number') {
      tl.set(car.position, { x: seg0.start.x, z: seg0.start.z, y: vehicleY });
    }
  }

  const MAX_ROTATION_DURATION = 0.4; // cap turn animation so car doesn't "spin" for whole segment
  const MIN_ANGLE_TO_ANIMATE = 0.07;  // ~4°: below this use set(), not to()

  for (const seg of smartPath) {
    if (seg.type === 'STRAIGHT') {
      const dx = seg.end.x - seg.start.x;
      const dz = seg.end.z - seg.start.z;
      const len = Math.hypot(dx, dz);
      if (len < 1e-6) continue;
      const duration = Math.max(minSegDur, len / Math.max(0.001, speed));
      const targetHeading = Math.atan2(dx, dz) + VEHICLE_MODEL_Y_OFFSET;
      const normalizedHeading = normalizeAngleShortestPath(currentHeading, targetHeading);
      const headingChange = Math.abs(angleDiff(currentHeading, normalizedHeading));
      if (headingChange < MIN_ANGLE_TO_ANIMATE) {
        tl.set(car.rotation, { y: normalizedHeading });
      } else {
        const rotDur = Math.min(duration, MAX_ROTATION_DURATION);
        tl.to(car.rotation, { y: normalizedHeading, duration: rotDur, ease: 'power1.inOut' });
      }
      tl.to(car.position, { x: seg.end.x, z: seg.end.z, y: vehicleY, duration, ease: 'none' }, '<');
      currentHeading = normalizedHeading;
    } else if (seg.type === 'ARC') {
      const r = seg.radius;
      let sweep = seg.endAngle - seg.startAngle;
      if (seg.clockwise && sweep > 0) sweep -= 2 * Math.PI;
      if (!seg.clockwise && sweep < 0) sweep += 2 * Math.PI;
      const arcLen = Math.abs(sweep) * r;
      const totalDuration = Math.max(minSegDur, arcLen / Math.max(0.001, speed));
      const n = Math.max(4, Math.ceil(arcLen / 1.0));
      const points = [];
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        const a = seg.startAngle + sweep * t;
        points.push({
          x: seg.center.x + r * Math.cos(a),
          z: seg.center.z + r * Math.sin(a)
        });
      }
      for (let j = 0; j < points.length - 1; j++) {
        const a = points[j];
        const b = points[j + 1];
        const segLen = Math.hypot(b.x - a.x, b.z - a.z);
        const duration = totalDuration * (segLen / arcLen);
        const targetHeading = Math.atan2(b.x - a.x, b.z - a.z) + VEHICLE_MODEL_Y_OFFSET;
        const normalizedHeading = normalizeAngleShortestPath(currentHeading, targetHeading);
        const headingChange = Math.abs(angleDiff(currentHeading, normalizedHeading));
        if (headingChange < MIN_ANGLE_TO_ANIMATE) {
          tl.set(car.rotation, { y: normalizedHeading });
        } else {
          const rotDur = Math.min(duration, MAX_ROTATION_DURATION);
          tl.to(car.rotation, { y: normalizedHeading, duration: rotDur, ease: 'power1.inOut' });
        }
        tl.to(car.position, { x: b.x, z: b.z, y: vehicleY, duration, ease: 'none' }, '<');
        currentHeading = normalizedHeading;
      }
    }
  }
}

/**
 * Simplify path: merge only collinear points within pathRadius (preserves turn points).
 */
function simplifyPathByRadius(path) {
  if (!path || path.length < 4) return path;
  const r = STEERING_CONFIG.pathRadius;
  const out = [path[0]];
  for (let i = 1; i < path.length - 1; i++) {
    const prev = out[out.length - 1];
    const curr = path[i];
    const next = path[i + 1];
    const toCurr = Math.hypot(curr.x - prev.x, curr.z - prev.z);
    const hPrev = Math.atan2(curr.x - prev.x, curr.z - prev.z);
    const hNext = Math.atan2(next.x - curr.x, next.z - curr.z);
    const angleChange = Math.abs(angleDiff(hPrev, hNext));
    if (toCurr >= r || angleChange > 0.15) out.push(curr);
  }
  if (path.length > 0 && out[out.length - 1] !== path[path.length - 1]) out.push(path[path.length - 1]);
  return out.length >= 2 ? out : path;
}

/** Slots 1, 2, 13, 14 excluded from precomputed trajectories (robot charging / disabled). */
const EXCLUDED_SLOTS_FOR_TRAJECTORY = [1, 2, 13, 14];
/** Precomputed enter/exit paths per slot index. Built once at load. */
const PRECOMPUTED_TRAJECTORIES = new Map();

function buildPrecomputedTrajectories() {
  PRECOMPUTED_TRAJECTORIES.clear();
  for (const spot of PARKING_SPOTS) {
    if (EXCLUDED_SLOTS_FOR_TRAJECTORY.includes(spot.index)) continue;
    const spotCenter = { x: spot.x, z: spot.z };
    const cp = spot.chargePoint ? { x: spot.chargePoint.x, z: spot.chargePoint.z } : null;

    const enterSmartPath = planVehicleEnterSmartPath(spot.index, spotCenter);
    const enterDensePoints = enterSmartPath.length > 0
      ? smartPathToDensePoints(enterSmartPath, 0.5)
      : densifyWaypoints(planVehicleEnterTrajectory(spot.index, spotCenter, 1.2));

    // Exit "spot → lane" = exact reverse of enter "lane → spot": same arc (from enter smart path), same straight (reversed).
    const slotArc = getSlotTurnArcForEgress(spot.index, spotCenter); // same arc as enter's last ARC, arcStart=lane, arcEnd=spot side
    const exitKps = getVehicleTrajectoryKeypoints(spot.index, spotCenter, 'exit');
    const lanePoint = slotArc
      ? slotArc.arcStart
      : (exitKps.length >= 2 ? { x: exitKps[1].x, z: exitKps[1].z } : { x: spotCenter.x, z: spot.index >= 25 ? -6.5 : -23.0 });

    const exitSmartPath = slotArc && exitKps.length >= 4
      ? buildSmartPath([{ ...lanePoint, id: getSlotTurnId(spot.index) }, exitKps[2], exitKps[3]], getTurnRadiusForKeypoint)
      : planVehicleExitSmartPath(spot.index, spotCenter);

    const reverseArcPoints = slotArc ? sampleArcReverse(slotArc, 0.85) : []; // arcEnd → arcStart (same arc as enter, reversed)
    const straightToArcEnd = cp ? [spotCenter, cp, slotArc?.arcEnd].filter(Boolean) : (slotArc ? [spotCenter, slotArc.arcEnd] : null); // reverse of enter's arcEnd→(cp?)→spot
    const fullReversePath = slotArc && straightToArcEnd?.length
      ? [...straightToArcEnd, ...reverseArcPoints.slice(1)]
      : (cp ? [spotCenter, cp, lanePoint] : [spotCenter, lanePoint]);
    const reversePathForMotion = simplifyPathByRadius(fullReversePath);
    const pathForMotion = reversePathForMotion.length >= 2 ? reversePathForMotion : fullReversePath;

    const denseExitForward = smartPathToDensePoints(exitSmartPath, 0.7);
    const denseExit = slotArc && straightToArcEnd?.length
      ? [...densifyWaypoints(straightToArcEnd, 0.8), ...reverseArcPoints.slice(1), ...denseExitForward]
      : [...densifyWaypoints(cp ? [spotCenter, cp, lanePoint] : [spotCenter, lanePoint], 0.8), ...denseExitForward];

    let reverseEndHeading;
    if (pathForMotion.length >= 2) {
      const prev = pathForMotion[pathForMotion.length - 2];
      const last = pathForMotion[pathForMotion.length - 1];
      const backDir = Math.atan2(prev.x - last.x, prev.z - last.z) + (Math.PI / 2);
      reverseEndHeading = normalizeAngleShortestPath(0, backDir);
    }

    PRECOMPUTED_TRAJECTORIES.set(spot.index, {
      enterSmartPath,
      enterDensePoints,
      slotArc,
      reverseArcPoints,
      straightToArcEnd,
      fullReversePath,
      reversePathForMotion: pathForMotion,
      lanePoint,
      exitSmartPath,
      denseExitForward,
      denseExit,
      reverseEndHeading
    });
  }
  console.log(`📐 Precomputed vehicle trajectories for ${PRECOMPUTED_TRAJECTORIES.size} slots (excluded: ${EXCLUDED_SLOTS_FOR_TRAJECTORY.join(', ')})`);
}

buildPrecomputedTrajectories();

/**
 * Generate intermediate waypoints for Ackermann steering turn
 * @param {Object} a - Start point {x, z}
 * @param {Object} b - End point {x, z}
 * @param {number} currentHeading - Current vehicle heading in radians
 * @param {number} targetHeading - Target heading in radians
 * @param {number} speed - Vehicle speed m/s
 * @returns {Array} Array of waypoints including intermediate points for smooth arc
 */
function generateAckermannWaypoints(a, b, currentHeading, targetHeading, speed) {
  const waypoints = [a];
  const headingDiff = angleDiff(currentHeading, targetHeading);
  
  // If the turn is small (< 5 degrees), no intermediate points needed
  if (Math.abs(headingDiff) < 0.087) { // ~5 degrees
    waypoints.push(b);
    return waypoints;
  }

  // Calculate required steering angle for the turn
  const segLen = Math.hypot(b.x - a.x, b.z - a.z);
  const avgHeading = currentHeading + headingDiff / 2;
  
  // Estimate turning radius from the arc
  // For a circular arc: R = segLen / (2 * sin(headingDiff / 2))
  const turnRadius = Math.abs(segLen / (2 * Math.sin(headingDiff / 2)));
  
  // Calculate steering angle: δ = atan(wheelbase / R)
  let steeringAngle = Math.atan2(VEHICLE_WHEELBASE, turnRadius);
  steeringAngle = Math.max(-VEHICLE_MAX_STEERING_ANGLE, Math.min(VEHICLE_MAX_STEERING_ANGLE, steeringAngle));
  
  // If steering angle is at max, we need a tighter turn with intermediate points
  if (Math.abs(steeringAngle) >= VEHICLE_MAX_STEERING_ANGLE * 0.95) {
    // Generate intermediate waypoints along the arc
    const numPoints = Math.max(2, Math.ceil(Math.abs(headingDiff) / (VEHICLE_MAX_STEERING_ANGLE * 2)));
    for (let i = 1; i < numPoints; i++) {
      const t = i / numPoints;
      const interpHeading = currentHeading + headingDiff * t;
      const interpX = a.x + (b.x - a.x) * t;
      const interpZ = a.z + (b.z - a.z) * t;
      waypoints.push({ x: interpX, z: interpZ });
    }
  }
  
  waypoints.push(b);
  return waypoints;
}

function appendVehicleEdgewiseMotion(tl, car, path, speed, vehicleY, opts = {}) {
  const turnDur = opts.turnDur ?? 0.2;
  const overlapTurn = opts.overlapTurn ?? true;
  const minSegDur = opts.minSegDur ?? 0.05;
  const useAckermann = opts.useAckermann !== false;
  const useLookAhead = opts.useLookAhead !== false;

  if (!tl || !car || !Array.isArray(path) || path.length < 2) return;

  const workingPath = simplifyPathByRadius(path);
  let currentHeading = car.rotation?.y ?? 0;
  const maxForce = STEERING_CONFIG.maxForce;

  for (let i = 0; i < workingPath.length - 1; i++) {
    const a = workingPath[i];
    const b = workingPath[i + 1];
    const segLen = Math.hypot(b.x - a.x, b.z - a.z);

    const lookAhead = useLookAhead ? getLookAheadTarget(workingPath, i, speed) : null;
    const targetPoint = lookAhead?.point ?? b;
    const targetHeading = (lookAhead && typeof lookAhead.tangentAngle === 'number'
      ? getDesiredRotation({ x: a.x, z: a.z }, lookAhead)
      : Math.atan2(targetPoint.x - a.x, targetPoint.z - a.z)) + VEHICLE_MODEL_Y_OFFSET;

    // Constant speed for both straight and curved segments (匀速)
    const segDur = Math.max(minSegDur, segLen / Math.max(0.001, speed));

    if (useAckermann) {
      const waypoints = generateAckermannWaypoints(a, b, currentHeading, targetHeading, speed);

      for (let j = 0; j < waypoints.length - 1; j++) {
        const wpA = waypoints[j];
        const wpB = waypoints[j + 1];
        const wpDx = wpB.x - wpA.x;
        const wpDz = wpB.z - wpA.z;
        const wpHeading = Math.atan2(wpDx, wpDz) + VEHICLE_MODEL_Y_OFFSET;
        const wpLen = Math.hypot(wpDx, wpDz);
        const wpDur = Math.max(minSegDur, wpLen / Math.max(0.001, speed));

        const headingChange = angleDiff(currentHeading, wpHeading);
        const turnRadius = Math.abs(wpLen / (2 * Math.sin(headingChange / 2))) || Infinity;
        let steeringAngle = Math.atan2(VEHICLE_WHEELBASE, turnRadius);
        steeringAngle = clampSteeringAngle(steeringAngle, VEHICLE_MAX_STEERING_ANGLE);
        const angularVel = (speed * Math.tan(steeringAngle)) / VEHICLE_WHEELBASE;
        const turnTime = Math.abs(headingChange / Math.max(0.001, Math.abs(angularVel)));
        const minTurnForForce = getMinTurnDurationForForce(headingChange);
        const effectiveTurnDur = Math.max(0.08, Math.max(Math.min(turnDur, turnTime), minTurnForForce));
        // Normalize to shortest rotation path
        const normalizedHeading = normalizeAngleShortestPath(currentHeading, wpHeading);
        tl.to(car.rotation, { 
          y: normalizedHeading, 
          duration: effectiveTurnDur, 
          ease: 'power1.inOut',
          onComplete: () => {
            // Update tracked heading after rotation completes
            currentHeading = normalizedHeading;
          }
        });
        tl.to(
          car.position,
          { x: wpB.x, z: wpB.z, y: vehicleY, duration: wpDur, ease: 'none' },
          overlapTurn ? '<' : undefined
        );
        
        // Update immediately for next waypoint calculation
        currentHeading = normalizedHeading;
      }
    } else {
      const normalizedTarget = normalizeAngleShortestPath(currentHeading, targetHeading);
      const headingChange = angleDiff(currentHeading, targetHeading);
      const minTurnForForce = getMinTurnDurationForForce(headingChange);
      const effectiveTurnDur = Math.max(0.08, Math.max(turnDur, minTurnForForce));
      if (effectiveTurnDur > 0) {
        tl.to(car.rotation, {
          y: normalizedTarget,
          duration: effectiveTurnDur,
          ease: 'power2.inOut',
          onComplete: () => { currentHeading = normalizedTarget; }
        });
        tl.to(
          car.position,
          { x: b.x, z: b.z, y: vehicleY, duration: segDur, ease: 'none' },
          overlapTurn ? '<' : undefined
        );
      } else {
        tl.set(car.rotation, { y: normalizedTarget });
        tl.to(car.position, { x: b.x, z: b.z, y: vehicleY, duration: segDur, ease: 'none' });
      }
      currentHeading = normalizedTarget; // Update immediately for next segment
    }
  }
}

// Reverse motion: apply Ackermann steering when backing left (or right)
function appendVehicleReverseMotion(tl, car, path, speed, vehicleY, opts = {}) {
  const minSegDur = opts.minSegDur ?? 0.05;
  const useAckermann = opts.useAckermann !== false; // default to true
  if (!tl || !car || !Array.isArray(path) || path.length < 2) return;

  // Snap to path start so reverse begins exactly on trajectory (avoids 1-frame jump)
  const start = path[0];
  if (start && typeof start.x === 'number' && typeof start.z === 'number') {
    tl.set(car.position, { x: start.x, z: start.z, y: vehicleY });
  }

  // Track current heading to ensure proper angle normalization
  let currentHeading = car.rotation?.y ?? 0;

  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const segLen = Math.hypot(dx, dz);
    const segDur = Math.max(minSegDur, segLen / Math.max(0.001, speed));
    
    // Calculate the direction we're backing toward (model space)
    const backDirection = Math.atan2(-dx, -dz) + VEHICLE_MODEL_Y_OFFSET;
    const headingChange = angleDiff(currentHeading, backDirection);
    
    if (useAckermann && Math.abs(headingChange) > 0.087) { // More than ~5 degrees
      // Turn and move in parallel for full segment (smoother: no stop-and-go)
      const normalizedBackDirection = normalizeAngleShortestPath(currentHeading, backDirection);
      tl.to(car.rotation, {
        y: normalizedBackDirection,
        duration: segDur,
        ease: 'linear'
      });
      tl.to(
        car.position,
        { x: b.x, z: b.z, y: vehicleY, duration: segDur, ease: 'none' },
        '<'
      );
      currentHeading = normalizedBackDirection;
    } else {
      // Small or no turn - just move backward; still update heading so next segment doesn't flash
      const normalizedBackDirection = normalizeAngleShortestPath(currentHeading, backDirection);
      tl.to(car.position, { x: b.x, z: b.z, y: vehicleY, duration: segDur, ease: 'none' });
      currentHeading = normalizedBackDirection;
    }
  }
}

function isVehicleWaitingForCharge(vehicle) {
  return (
    vehicle &&
    vehicle.needsCharging === true &&
    vehicle.phase === 'parked' &&
    vehicle.model &&
    vehicle.parkingSpot
  );
}

function findNextWaitingVehicle(excludeVehicleId = null) {
  return vehicles.find(
    (v) =>
      isVehicleWaitingForCharge(v) &&
      v.id !== excludeVehicleId &&
      !v.assignedRobotId
  );
}

function startRobotChargeMission(robot, vehicle) {
  if (!robot || !vehicle) return;
  if (!isVehicleWaitingForCharge(vehicle)) return;

  // Lock assignment to prevent duplicate dispatch
  vehicle.assignedRobotId = robot.id;
  robot.pendingVehicle = null;

  robot.chargeVehicle(vehicle, () => {
    // mission finished: mark vehicle done
    vehicle.needsCharging = false;
    vehicle.assignedRobotId = null;
    if (typeof vehicle.requestLeaveCheck === 'function') vehicle.requestLeaveCheck();

    // Immediately dispatch next order if any; otherwise go rest/home
    const next = findNextWaitingVehicle(vehicle.id);
    const remainingDemand = totalDemandKwh();
    if (
      next &&
      robot.batteryLevel > LOW_BATTERY_KWH &&
      robot.batteryLevel >= Math.max(0, next.chargeDemandKwh ?? 0)
    ) {
      startRobotChargeMission(robot, next);
      return;
    }

    if (robot.batteryLevel < LOW_BATTERY_KWH || robot.batteryLevel < remainingDemand) {
      robot.returnHomeAndCharge(() => {});
    } else {
      robot.returnToRest(() => {});
    }
  });
}

function assignRobotToVehicle(vehicle) {
  console.log(`🔍 Looking for available robot. Total robots: ${chargingRobots.length}`);
  const vehicleDemand = vehicle.chargeDemandKwh ?? 0;
  chargingRobots.forEach((robot, idx) => {
    console.log(`  Robot ${idx + 1}: state=${robot.state}, battery=${robot.batteryLevel.toFixed(1)} kWh, atHome=${robot.atHome}`);
  });
  console.log(`  Vehicle ${vehicle.id} demand: ${vehicleDemand.toFixed(1)} kWh`);

  if (!isVehicleWaitingForCharge(vehicle)) {
    console.log(`  ⚠️ Vehicle ${vehicle.id} not waiting for charge (phase=${vehicle.phase}, needsCharging=${vehicle.needsCharging})`);
    return;
  }
  if (vehicle.assignedRobotId) {
    console.log(`  ⚠️ Vehicle ${vehicle.id} already assigned to Robot ${vehicle.assignedRobotId}`);
    return;
  }

  let availableRobot = chargingRobots.find(robot => {
    // Prefer idle robots
    if (robot.state !== 'idle') return false;
    if (robot.batteryLevel <= LOW_BATTERY_KWH) return false;
    // At home but not fully charged - let it charge first
    if (robot.atHome && robot.batteryLevel < ROBOT_BATTERY_KWH * 0.5) return false;
    // Must have enough battery for THIS vehicle's demand (not total demand)
    if (robot.batteryLevel < vehicleDemand) return false;
    return true;
  });

  // If no idle robot, allow preemption: robots returning to REST can be redirected to a new order.
  if (!availableRobot) {
    availableRobot = chargingRobots.find(robot => {
      if (robot.state !== 'returning') return false;
      if (robot.returnReason !== 'rest') return false;
      if (robot.batteryLevel <= LOW_BATTERY_KWH) return false;
      // Must have enough battery for THIS vehicle's demand
      if (robot.batteryLevel < vehicleDemand) return false;
      return true;
    });
  }

  if (!availableRobot) {
    console.log('⚠️ No available robots, vehicle will wait... Retrying in 2 seconds...');
    setTimeout(() => assignRobotToVehicle(vehicle), 2000);
    return;
  }

  if (availableRobot.state === 'returning' && availableRobot.returnReason === 'rest') {
    // Soft preemption: reroute at next waypoint node (no abrupt mid-edge teleport).
    console.log(`↪️ Robot${availableRobot.id} will reroute at next node to serve Vehicle ${vehicle.id}`);
    vehicle.assignedRobotId = availableRobot.id;
    availableRobot.pendingVehicle = vehicle;
    return;
  }

  startRobotChargeMission(availableRobot, vehicle);
}

// === Test if small_caddie.glb is accessible ===
fetch('/X-Caddie_textured.glb', { method: 'HEAD' })
  .then(response => {
    if (response.ok) {
      console.log('✅ X-Caddie_textured.glb is accessible via HTTP');
      console.log(`   File size: ${response.headers.get('content-length')} bytes`);
    } else {
      console.error(`❌ X-Caddie_textured.glb HTTP error: ${response.status} ${response.statusText}`);
    }
  })
  .catch(err => {
    console.error('❌ Cannot access X-Caddie_textured.glb:', err);
    console.error('   Make sure the dev server is running and the file is in the public folder');
  });

// === Start Simulation ===
setTimeout(() => {
  console.log('🚀 Starting EV charging simulation...');
  console.log(`📊 System status: ${chargingRobots.length} robots, ${batteryStations.length} battery stations`);
  console.log(`🅿️ Total parking spots: ${parkingSpots.length}`);

  // Start auto-cleanup of expired reservations (every 30 seconds)
  startAutoCleanup(30000);
  console.log('🧹 Reservation table auto-cleanup started (30s interval)');

  // Initialize recording only if enabled via URL params (?record=true&start_time=20&end_time=40)
  if (recordConfig.enabled) {
    setExportConfig({
      startTimeSeconds: recordConfig.startTime,
      endTimeSeconds: recordConfig.endTime,
      durationSeconds: recordConfig.duration,
      totalFrames: Math.ceil(recordConfig.duration * 24), // 24 fps
    });
    initFrameExporter(scene, camera, renderer, getSimTime);
  }

  if (show_graph) {
    visualizeGraphStructures();
  }

  if (chargingRobots.length === 0) {
    console.warn('⚠️ WARNING: No robots loaded yet! Vehicles may wait...');
    console.warn('   Check the console above for loading errors');
    console.warn('   Robots may still be loading - they will be available when ready');
  }
  createVehicleSequence();
}, 5000); // Wait 5 seconds for models to load

// === Animation Loop ===
let lastTime = performance.now();
let dashboardTick = 0;
function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const delta = (now - lastTime) / 1000;
  lastTime = now;

  const LABEL_Y_OFFSET = 5 ;

  // Clean up trajectories for vehicles that have left the lot (removed from vehicles)
  const activeIds = new Set(vehicles.map(v => v.id));
  for (const [vid, rec] of vehicleTrajectories.entries()) {
    if (!activeIds.has(vid)) {
      if (rec.line) trajectoryGroup.remove(rec.line);
      vehicleTrajectories.delete(vid);
    }
  }
  // Record and draw vehicle trajectories when entering or leaving
  vehicles.forEach(vehicle => {
    if (vehicle.model && vehicle.model.position && (vehicle.phase === 'entering' || vehicle.phase === 'leaving')) {
      const id = vehicle.id;
      const p = vehicle.model.position;
      let rec = vehicleTrajectories.get(id);
      if (!rec) {
        rec = { points: [], line: null, lastRecorded: null };
        vehicleTrajectories.set(id, rec);
        // Seed trail with current position so trajectory line starts at entrance/spot
        rec.points.push(p.x, TRAJECTORY_Y, p.z);
        rec.lastRecorded = { x: p.x, z: p.z };
      }
      const last = rec.lastRecorded;
      const shouldRecord = !last || Math.hypot(p.x - last.x, p.z - last.z) >= TRAJECTORY_MIN_STEP;
      if (shouldRecord) {
        rec.points.push(p.x, TRAJECTORY_Y, p.z);
        if (rec.points.length / 3 > TRAJECTORY_MAX_POINTS) rec.points.splice(0, 3);
        rec.lastRecorded = { x: p.x, z: p.z };
        if (rec.points.length >= 6) {
          if (!rec.line) {
            const geo = new THREE.BufferGeometry();
            const posArray = new Float32Array(TRAJECTORY_MAX_POINTS * 3);
            geo.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
            geo.setDrawRange(0, 0);
            const mat = new THREE.LineDashedMaterial({ color: 0xff0000, dashSize: 0.4, gapSize: 0.2 });
            rec.line = new THREE.Line(geo, mat);
            rec.line.frustumCulled = false;
            trajectoryGroup.add(rec.line);
          }
          const posAttr = rec.line.geometry.attributes.position;
          const n = Math.min(rec.points.length / 3, TRAJECTORY_MAX_POINTS);
          const arr = posAttr.array;
          for (let i = 0; i < n * 3; i++) arr[i] = rec.points[i];
          rec.line.geometry.setDrawRange(0, n);
          posAttr.needsUpdate = true;
          rec.line.computeLineDistances();
        }
      }
    }
    if (vehicle.model && vehicle.model.position) {
      collisionAvoidance.addOccupiedPosition(
        { x: vehicle.model.position.x, z: vehicle.model.position.z },
        `vehicle_${vehicle.id}`,
        'car'
      );
    }
    if (vehicle.demandLabel && vehicle.model && vehicle.model.position) {
      const p = vehicle.model.position;
      const s = worldToScreen(p.x, p.y + LABEL_Y_OFFSET, p.z);
      vehicle.demandLabel.style.display = s.behind ? 'none' : 'block';
      vehicle.demandLabel.style.left = s.x + 'px';
      vehicle.demandLabel.style.top = s.y + 'px';
      const d = (vehicle.chargeDemandKwh ?? 0);
      const pct = Math.min(100, Math.round((d / VEHICLE_BATTERY_KWH) * 100));
      vehicle.demandLabel.textContent = `${pct}%`;
      vehicle.demandLabel.style.color = pct <= 20 ? '#22c55e' : '#ef4444';
    }
  });
  
  vehicles.forEach(vehicle => {
    if (vehicle.chargeportMixer) vehicle.chargeportMixer.update(delta);
  });
  chargingRobots.forEach(robot => {
    if (robot.model?.userData?.mixer) robot.model.userData.mixer.update(delta);
    if (robot.model && robot.model.position) {
      collisionAvoidance.addOccupiedPosition(
        { x: robot.model.position.x, z: robot.model.position.z },
        `robot_${robot.id}`,
        'caddie'
      );
    }
    if (robot.batteryLabel && robot.model && robot.model.position) {
      const p = robot.model.position;
      const s = worldToScreen(p.x, p.y + LABEL_Y_OFFSET, p.z);
      robot.batteryLabel.style.display = s.behind ? 'none' : 'block';
      robot.batteryLabel.style.left = s.x + 'px';
      robot.batteryLabel.style.top = s.y + 'px';
      const bpct = Math.min(100, Math.round((robot.batteryLevel / ROBOT_BATTERY_KWH) * 100));
      robot.batteryLabel.textContent = `${bpct}%`;
      robot.batteryLabel.style.color = bpct > 40 ? '#22c55e' : '#ef4444';
    }
    if (robot.state === 'idle' && robot.atHome && robot.homePosition) {
      const dx = robot.model.position.x - robot.homePosition.x;
      const dz = robot.model.position.z - robot.homePosition.z;
      if (dx * dx + dz * dz < 2.5 * 2.5) {
        robot.batteryLevel = Math.min(ROBOT_BATTERY_KWH, robot.batteryLevel + 0.15);
      }
    }
    // Check if robot should return home to charge
    // Only return home if: low battery, or no vehicles waiting, or all waiting vehicles have demand > robot's battery
    const waitingVehicles = vehicles.filter(v => isVehicleWaitingForCharge(v) && !v.assignedRobotId);
    const canServeAny = waitingVehicles.some(v => robot.batteryLevel >= (v.chargeDemandKwh ?? 0));
    if (
      robot.state === 'idle' &&
      !robot.atHome &&
      (robot.batteryLevel < LOW_BATTERY_KWH || waitingVehicles.length === 0 || !canServeAny)
    ) {
      robot.returnHomeAndCharge(() => {});
    }
  });
  
  // Graph node labels (robot/vehicle/turn/spot)
  if (show_graph) updateGraphLabels();

  if (followRobotId != null) {
    const robot = chargingRobots.find((r) => r.id === followRobotId);
    if (robot?.model?.position) {
      const p = robot.model.position;
      controls.target.set(p.x, p.y + 0.5, p.z);
      camera.position.set(p.x, p.y + FOLLOW_OFFSET_UP, p.z + FOLLOW_OFFSET_BACK);
    }
  }
  controls.update();

  // Weather: animate rain
  const posAttr = rainPoints.geometry.attributes.position;
  for (let i = 0; i < RAIN_COUNT; i++) {
    let y = posAttr.getY(i);
    y -= RAIN_SPEED * delta;
    if (y < rainBounds.yMin) y = rainBounds.yMax;
    posAttr.setY(i, y);
  }
  posAttr.needsUpdate = true;

  // Push state to dashboard when embedded (?dashboard=1)
  if (typeof window.__dashboardSetState === 'function') {
    dashboardTick++;
    if (dashboardTick % 30 === 0) {
      const orders = orderManager.orders;
      const completed = orders.filter(o => o.status === 'completed').length;
      const vehiclesBeingCharged = new Set(chargingRobots.filter(r => r.state === 'charging' && r.targetVehicle).map(r => r.targetVehicle.id));
      const waiting = vehicles.filter(v => v.phase === 'parked' && v.needsCharging && !vehiclesBeingCharged.has(v.id)).length;
      const charging = vehiclesBeingCharged.size;
      const withWaitTime = vehicles.filter(v => v.parkedAt != null && v.chargingStartedAt != null);
      const avgWaitSec = withWaitTime.length
        ? withWaitTime.reduce((s, v) => s + (v.chargingStartedAt - v.parkedAt), 0) / withWaitTime.length
        : 0;
      window.__dashboardSetState({
        fleetSummary: {
          total: chargingRobots.length,
          active: chargingRobots.filter(r => r.state === 'navigating' || r.state === 'charging').length,
          idle: chargingRobots.filter(r => r.state === 'idle').length,
          charging: chargingRobots.filter(r => r.state === 'selfCharging' || r.state === 'returning').length,
        },
        robots: chargingRobots.map(r => ({
          id: `R${r.id}`,
          soc: Math.min(100, Math.round((r.batteryLevel / ROBOT_BATTERY_KWH) * 100)),
          state: r.state,
          position: { x: r.model.position.x, z: r.model.position.z },
        })),
        orderStats: {
          waiting,
          charging,
          completed,
          avgWaitTimeSec: Math.round(avgWaitSec),
        },
        totalKwhDelivered: totalKwhDelivered,
      });
    }
  }

  composer.render();

  captureFrame();
}
animate();

// === Resize Handling ===
function getSimContainerSize() {
  const c = window.__simulatorContainer || document.body;
  if (c === document.body) return { w: window.innerWidth, h: window.innerHeight };
  return { w: c.clientWidth || window.innerWidth, h: c.clientHeight || window.innerHeight };
}
function applySimulatorResize() {
  const { w, h } = getSimContainerSize();
  const wScale = w * scale;
  const hScale = h * scale;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(wScale, hScale, false);
  composer.setSize(wScale, hScale);
  composer.setPixelRatio(renderer.getPixelRatio());
  bloomPass.resolution.set(wScale, hScale);
  const fxaaPass = composer.passes[2];
  if (fxaaPass && fxaaPass.setSize) fxaaPass.setSize(wScale, hScale);
  renderer.domElement.style.width = w + 'px';
  renderer.domElement.style.height = h + 'px';
}
window.addEventListener('resize', applySimulatorResize);
if (window.__simulatorContainer) {
  const ro = new ResizeObserver(applySimulatorResize);
  ro.observe(window.__simulatorContainer);
}
