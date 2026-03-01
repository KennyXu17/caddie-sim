/**
 * Keypoint Graph - Global Navigation for Parking Lot
 *
 * Vehicles and robots follow road CENTERLINES. Turning allowed ONLY at keypoints.
 * NOT grid-based A* - uses topological graph search.
 *
 * Coordinate system: 2D (x, z)
 */

import { PARKING_SPOTS } from './orderSystem.js';
import { ENTRANCE as MAP_ENTRANCE } from './parking_map.js';
import { getLaneZFromCxx0 } from './topology.js';

// =============================================================================
// KEYPOINT DEFINITIONS (World Coordinates)
// =============================================================================
// ENTRANCE/EXIT z must match parking_map for consistency; entrance at z=6.69 per LOT_BOUNDS
const ENTRANCE_Z = MAP_ENTRANCE.z;
const EXIT_Z = 6.5; // Exit aligned with lane turn level
// 车道中心线 z 由两侧 Cxx_0 的 z 平均值决定
const LANE_Z_25_44 = getLaneZFromCxx0('25_44');
const LANE_Z_1_24 = getLaneZFromCxx0('1_24');

export const KP = {
  /** Parking lot entrance (matches parking_map.ENTRANCE) */
  ENTRANCE: { id: 'entrance', x: MAP_ENTRANCE.x, z: ENTRANCE_Z, type: 'entrance' },

  /** Parking lot exit */
  EXIT: { id: 'exit', x: 20.25, z: EXIT_Z, type: 'exit' },

  /** Slots 25-44 (upper row): lane z = avg(C25_0.z, C35_0.z) */
  TURN_25_44_ENTRY: { id: 'turn_25_44_entry', x: -22.25, z: LANE_Z_25_44, type: 'turn', slotGroup: '25_44' },
  TURN_25_44_EXIT: { id: 'turn_25_44_exit', x: 20.25, z: LANE_Z_25_44, type: 'turn', slotGroup: '25_44' },

  /** Slots 1-24 (lower row): lane z = avg(C1_0.z, C15_0.z) */
  TURN_1_24_ENTRY: { id: 'turn_1_24_entry', x: -22.25, z: LANE_Z_1_24, type: 'turn', slotGroup: '1_24' },
  TURN_1_24_EXIT: { id: 'turn_1_24_exit', x: 20.25, z: LANE_Z_1_24, type: 'turn', slotGroup: '1_24' }
};

/** Lane segments: { start, end, slotGroup } - centerline along constant z (from Cxx_0 average) */
export const LANES = [
  {
    id: 'lane_25_44',
    start: KP.TURN_25_44_ENTRY,
    end: KP.TURN_25_44_EXIT,
    slotGroup: '25_44',
    z: LANE_Z_25_44,
    xMin: -22.25,
    xMax: 20.25
  },
  {
    id: 'lane_1_24',
    start: KP.TURN_1_24_ENTRY,
    end: KP.TURN_1_24_EXIT,
    slotGroup: '1_24',
    z: LANE_Z_1_24,
    xMin: -22.25,
    xMax: 20.25
  }
];

// =============================================================================
// GRAPH: NODES AND DIRECTED EDGES
// =============================================================================

/**
 * Node = keypoint id. Edges have cost = Euclidean distance.
 * No dynamic agents. Turning only at keypoints.
 */
function buildGraph() {
  const nodes = new Map();
  const edges = [];

  const addNode = (kp) => {
    nodes.set(kp.id, kp);
  };

  const addEdge = (fromId, toId, cost) => {
    edges.push({ from: fromId, to: toId, cost });
  };

  const addBiEdge = (aId, bId, cost) => {
    addEdge(aId, bId, cost);
    addEdge(bId, aId, cost);
  };

  const dist = (a, b) => Math.hypot((b.x ?? a.x) - (a.x ?? b.x), (b.z ?? a.z) - (a.z ?? b.z));

  addNode(KP.ENTRANCE);
  addNode(KP.EXIT);
  addNode(KP.TURN_25_44_ENTRY);
  addNode(KP.TURN_25_44_EXIT);
  addNode(KP.TURN_1_24_ENTRY);
  addNode(KP.TURN_1_24_EXIT);

  // -----------------------------------------------------------------------------
  // Slot-turn nodes: where vehicle turns from the main lane into each parking spot.
  // These live on the lane centerline at (x = spot.center.x, z = laneZ).
  // Note: slot 1 and slot 14 will overlap with TURN_1_24_ENTRY / TURN_1_24_EXIT, by design.
  // -----------------------------------------------------------------------------
  const laneNodeIdsByGroup = new Map([
    ['1_24', new Set([KP.TURN_1_24_ENTRY.id, KP.TURN_1_24_EXIT.id])],
    ['25_44', new Set([KP.TURN_25_44_ENTRY.id, KP.TURN_25_44_EXIT.id])]
  ]);

  const laneZByGroup = { '1_24': LANE_Z_1_24, '25_44': LANE_Z_25_44 };

  for (const spot of PARKING_SPOTS) {
    const slotIndex = spot.index;
    const group = slotIndex >= 25 ? '25_44' : '1_24';
    const laneZ = laneZByGroup[group];
    const id = `slot_turn_${slotIndex}`;
    const kp = { id, x: spot.x, z: laneZ, type: 'slot_turn', slotIndex, slotGroup: group };
    addNode(kp);
    laneNodeIdsByGroup.get(group).add(id);
  }

  // Connect lane nodes in X order (so the graph actually contains these nodes/edges)
  for (const [group, idSet] of laneNodeIdsByGroup.entries()) {
    const ids = Array.from(idSet);
    ids.sort((aId, bId) => (nodes.get(aId)?.x ?? 0) - (nodes.get(bId)?.x ?? 0));
    for (let i = 0; i < ids.length - 1; i++) {
      const a = nodes.get(ids[i]);
      const b = nodes.get(ids[i + 1]);
      if (!a || !b) continue;
      addBiEdge(ids[i], ids[i + 1], dist(a, b));
    }
  }

  // Entrance → entry turns (vertical segments, z: 6.5 → -6.5 or -22.5)
  addBiEdge(KP.ENTRANCE.id, KP.TURN_25_44_ENTRY.id, dist(KP.ENTRANCE, KP.TURN_25_44_ENTRY));
  addBiEdge(KP.ENTRANCE.id, KP.TURN_1_24_ENTRY.id, dist(KP.ENTRANCE, KP.TURN_1_24_ENTRY));

  // Entry turn → exit turn (along lane, +x direction)
  // Keep direct edges as well (graph also has chained lane edges via slot_turn nodes)
  addBiEdge(KP.TURN_25_44_ENTRY.id, KP.TURN_25_44_EXIT.id, dist(KP.TURN_25_44_ENTRY, KP.TURN_25_44_EXIT));
  addBiEdge(KP.TURN_1_24_ENTRY.id, KP.TURN_1_24_EXIT.id, dist(KP.TURN_1_24_ENTRY, KP.TURN_1_24_EXIT));

  // Exit turn → exit (vertical segments, z: -6.5 or -22.5 → 6.5)
  addBiEdge(KP.TURN_25_44_EXIT.id, KP.EXIT.id, dist(KP.TURN_25_44_EXIT, KP.EXIT));
  addBiEdge(KP.TURN_1_24_EXIT.id, KP.EXIT.id, dist(KP.TURN_1_24_EXIT, KP.EXIT));

  return { nodes, edges };
}

const { nodes: KP_NODES, edges: KP_EDGES } = buildGraph();

// =============================================================================
// GRAPH SEARCH: DIJKSTRA / A*
// =============================================================================

function heuristic(a, b) {
  const na = KP_NODES.get(a);
  const nb = KP_NODES.get(b);
  if (!na || !nb) return 0;
  return Math.hypot(nb.x - na.x, nb.z - na.z);
}

/**
 * A* search on keypoint graph (preferred for known goal).
 * @param {string} startId - Start keypoint id
 * @param {string} goalId - Goal keypoint id
 * @param {Object} options - { slotGroup?: '1_24' | '25_44' } to restrict path
 * @returns {Array<{id,x,z,type}>} Ordered keypoint sequence, or []
 */
export function searchKeypointPath(startId, goalId, options = {}) {
  const { slotGroup } = options;
  const adjacency = new Map();

  for (const e of KP_EDGES) {
    if (slotGroup) {
      const fromNode = KP_NODES.get(e.from);
      const toNode = KP_NODES.get(e.to);
      if (fromNode?.slotGroup && fromNode.slotGroup !== slotGroup) continue;
      if (toNode?.slotGroup && toNode.slotGroup !== slotGroup) continue;
    }
    if (!adjacency.has(e.from)) adjacency.set(e.from, []);
    adjacency.get(e.from).push({ to: e.to, cost: e.cost });
  }

  const gScore = new Map();
  const prev = new Map();
  const open = new Set(KP_NODES.keys());
  gScore.set(startId, 0);

  while (open.size) {
    let u = null;
    let bestF = Infinity;
    for (const id of open) {
      const g = gScore.get(id) ?? Infinity;
      const f = g + heuristic(id, goalId);
      if (f < bestF) {
        bestF = f;
        u = id;
      }
    }
    if (u === null || u === goalId) break;
    open.delete(u);

    for (const { to, cost } of adjacency.get(u) || []) {
      if (!open.has(to)) continue;
      const alt = (gScore.get(u) ?? Infinity) + cost;
      if (alt < (gScore.get(to) ?? Infinity)) {
        gScore.set(to, alt);
        prev.set(to, u);
      }
    }
  }

  const path = [];
  let id = goalId;
  while (id) {
    const n = KP_NODES.get(id);
    if (n) path.unshift(n);
    id = prev.get(id);
  }
  return path[0]?.id === startId ? path : [];
}

// =============================================================================
// PATH EXPANSION: Centerline Following
// =============================================================================

/**
 * Expand keypoint sequence into fine-grained centerline waypoints.
 * Interpolates along straight segments (no arbitrary turns).
 *
 * @param {Array<{id,x,z}>} keypointPath - From searchKeypointPath
 * @param {number} stepM - Interpolation step (m), default 0.5
 * @returns {Array<{x,z,segmentType}>} Waypoints for local planner
 */
/** V:turn (entrance/exit) 转弯半径 */
const TURN_RADIUS = 4;
/** V:slot 进入 spot 转弯半径 */
const SLOT_TURN_RADIUS = 2.25;

/**
 * Get turn radius for a keypoint: V:turn = large, V:slot = small.
 * @param {number} i - keypoint index
 * @param {{id?:string}} curr - keypoint (may have id like 'V:turn_25_44_entry' or 'V:slot_30_40')
 */
export function getTurnRadiusForKeypoint(i, curr) {
  const id = (curr && curr.id) ? String(curr.id) : '';
  if (id.includes('slot') || id.startsWith('V:slot')) return SLOT_TURN_RADIUS;
  return TURN_RADIUS;
}

/**
 * Compute arc start/end points for a turn (prev -> curr -> next). Returns null if turn angle < π/4.
 * @param {{x:number,z:number}} prev
 * @param {{x:number,z:number}} curr
 * @param {{x:number,z:number}} next
 * @param {number} turnRadius
 * @returns {{ arcStart: {x:number,z:number}, arcEnd: {x:number,z:number} } | null}
 */
export function computeArcEndpoints(prev, curr, next, turnRadius) {
  const angleDiff = (from, to) => {
    let d = to - from;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return d;
  };
  const headingIn = Math.atan2(curr.x - prev.x, curr.z - prev.z);
  const headingOut = Math.atan2(next.x - curr.x, next.z - curr.z);
  const turnAngle = angleDiff(headingIn, headingOut);
  if (Math.abs(turnAngle) < Math.PI / 6) return null; // ~30°: 更易在 graph 上体现转向起止点

  const dirIn = { x: curr.x - prev.x, z: curr.z - prev.z };
  const lenIn = Math.hypot(dirIn.x, dirIn.z) || 1e-6;
  const dirOut = { x: next.x - curr.x, z: next.z - curr.z };
  const lenOut = Math.hypot(dirOut.x, dirOut.z) || 1e-6;
  let r = Math.min(turnRadius, lenIn, lenOut);
  if (r < 0.2) return null; // 避免 start/end 重合或几乎重合
  const tangentIn = { x: dirIn.x / lenIn, z: dirIn.z / lenIn };
  const tangentOut = { x: dirOut.x / lenOut, z: dirOut.z / lenOut };
  const arcStart = { x: curr.x - tangentIn.x * r, z: curr.z - tangentIn.z * r };
  const arcEnd = { x: curr.x + tangentOut.x * r, z: curr.z + tangentOut.z * r };
  if (Math.hypot(arcEnd.x - arcStart.x, arcEnd.z - arcStart.z) < 0.2) return null;
  return { arcStart, arcEnd };
}

/**
 * Insert arc waypoints at sharp turns. V:turn uses larger radius, V:slot uses smaller.
 * turnRadiusOrGetter: number (same for all) or function(i, curr) => number.
 */
function insertArcAtTurns(keypointPath, turnRadiusOrGetter = TURN_RADIUS) {
  if (!Array.isArray(keypointPath) || keypointPath.length < 3) return keypointPath;
  const getRadius = typeof turnRadiusOrGetter === 'function'
    ? turnRadiusOrGetter
    : () => turnRadiusOrGetter;

  const angleDiff = (from, to) => {
    let d = to - from;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return d;
  };

  const result = [keypointPath[0]];
  for (let i = 1; i < keypointPath.length - 1; i++) {
    const prev = keypointPath[i - 1];
    const curr = keypointPath[i];
    const next = keypointPath[i + 1];

    const headingIn = Math.atan2(curr.x - prev.x, curr.z - prev.z);
    const headingOut = Math.atan2(next.x - curr.x, next.z - curr.z);
    const turnAngle = angleDiff(headingIn, headingOut);

    if (Math.abs(turnAngle) < Math.PI / 4) {
      result.push(curr);
      continue;
    }

    const dirIn = { x: curr.x - prev.x, z: curr.z - prev.z };
    const lenIn = Math.hypot(dirIn.x, dirIn.z) || 1e-6;
    const dirOut = { x: next.x - curr.x, z: next.z - curr.z };
    const lenOut = Math.hypot(dirOut.x, dirOut.z) || 1e-6;
    const turnRadius = getRadius(i, curr);
    // 仅当段长不足时缩小半径，保证所有车转弯半径一致（3.5 / 5）
    const r = Math.min(turnRadius, lenIn, lenOut);
    const tangentIn = { x: dirIn.x / lenIn, z: dirIn.z / lenIn };
    const tangentOut = { x: dirOut.x / lenOut, z: dirOut.z / lenOut };

    const arcStart = {
      x: curr.x - tangentIn.x * r,
      z: curr.z - tangentIn.z * r
    };
    const arcEnd = {
      x: curr.x + tangentOut.x * r,
      z: curr.z + tangentOut.z * r
    };

    const perpIn = { x: -tangentIn.z, z: tangentIn.x };
    const cross = tangentIn.x * tangentOut.z - tangentIn.z * tangentOut.x;
    const arcCenter = {
      x: arcStart.x + perpIn.x * r * Math.sign(cross),
      z: arcStart.z + perpIn.z * r * Math.sign(cross)
    };

    result.push(arcStart);
    const numArcPoints = Math.max(6, Math.ceil((Math.abs(turnAngle) * r) / 0.4));
    const startAngle = Math.atan2(arcStart.z - arcCenter.z, arcStart.x - arcCenter.x);
    const endAngle = Math.atan2(arcEnd.z - arcCenter.z, arcEnd.x - arcCenter.x);
    let sweep = angleDiff(startAngle, endAngle);
    if (Math.abs(sweep) < 0.01) sweep = turnAngle;
    for (let j = 1; j < numArcPoints; j++) {
      const t = j / numArcPoints;
      const a = startAngle + sweep * t;
      result.push({
        x: arcCenter.x + r * Math.cos(a),
        z: arcCenter.z + r * Math.sin(a),
        type: 'arc'
      });
    }
    result.push(arcEnd);
  }
  result.push(keypointPath[keypointPath.length - 1]);
  return result;
}

/**
 * Build a smart path: list of STRAIGHT and ARC instructions (no dense points).
 * @param {Array<{x:number,z:number,id?:string}>} keypointPath
 * @param {number|function(number,object):number} turnRadiusOrGetter
 * @returns {Array<{type:'STRAIGHT',start:{x,z},end:{x,z}}|{type:'ARC',center:{x,z},radius:number,startAngle:number,endAngle:number,clockwise:boolean}>}
 */
export function buildSmartPath(keypointPath, turnRadiusOrGetter = TURN_RADIUS) {
  if (!Array.isArray(keypointPath) || keypointPath.length < 2) return [];
  const getRadius = typeof turnRadiusOrGetter === 'function'
    ? turnRadiusOrGetter
    : () => turnRadiusOrGetter;

  const angleDiff = (from, to) => {
    let d = to - from;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return d;
  };

  const segments = [];
  let lastEnd = { x: keypointPath[0].x, z: keypointPath[0].z };

  for (let i = 1; i < keypointPath.length; i++) {
    const prev = keypointPath[i - 1];
    const curr = keypointPath[i];
    const next = keypointPath[i + 1];

    if (next && Math.hypot(curr.x - prev.x, curr.z - prev.z) > 1e-6 && Math.hypot(next.x - curr.x, next.z - curr.z) > 1e-6) {
      const headingIn = Math.atan2(curr.x - prev.x, curr.z - prev.z);
      const headingOut = Math.atan2(next.x - curr.x, next.z - curr.z);
      const turnAngle = angleDiff(headingIn, headingOut);

      if (Math.abs(turnAngle) >= Math.PI / 4) {
        const dirIn = { x: curr.x - prev.x, z: curr.z - prev.z };
        const lenIn = Math.hypot(dirIn.x, dirIn.z) || 1e-6;
        const dirOut = { x: next.x - curr.x, z: next.z - curr.z };
        const lenOut = Math.hypot(dirOut.x, dirOut.z) || 1e-6;
        const turnRadius = getRadius(i, curr);
        const r = Math.min(turnRadius, lenIn, lenOut);
        const tangentIn = { x: dirIn.x / lenIn, z: dirIn.z / lenIn };
        const tangentOut = { x: dirOut.x / lenOut, z: dirOut.z / lenOut };

        const arcStart = { x: curr.x - tangentIn.x * r, z: curr.z - tangentIn.z * r };
        const arcEnd = { x: curr.x + tangentOut.x * r, z: curr.z + tangentOut.z * r };
        const perpIn = { x: -tangentIn.z, z: tangentIn.x };
        const cross = tangentIn.x * tangentOut.z - tangentIn.z * tangentOut.x;
        const arcCenter = {
          x: arcStart.x + perpIn.x * r * Math.sign(cross),
          z: arcStart.z + perpIn.z * r * Math.sign(cross)
        };
        const startAngle = Math.atan2(arcStart.z - arcCenter.z, arcStart.x - arcCenter.x);
        const endAngle = Math.atan2(arcEnd.z - arcCenter.z, arcEnd.x - arcCenter.x);
        let sweep = angleDiff(startAngle, endAngle);
        if (Math.abs(sweep) < 0.01) sweep = turnAngle;

        const distToArc = Math.hypot(arcStart.x - lastEnd.x, arcStart.z - lastEnd.z);
        if (distToArc > 1e-4) {
          segments.push({ type: 'STRAIGHT', start: { ...lastEnd }, end: { ...arcStart } });
        }
        segments.push({
          type: 'ARC',
          center: { ...arcCenter },
          radius: r,
          startAngle,
          endAngle,
          clockwise: sweep < 0
        });
        lastEnd = { ...arcEnd };
        continue;
      }
    }

    segments.push({
      type: 'STRAIGHT',
      start: { ...lastEnd },
      end: { x: curr.x, z: curr.z }
    });
    lastEnd = { x: curr.x, z: curr.z };
  }

  return segments;
}

/**
 * Get the slot-turn arc used when entering (lane → spot). For egress we reverse this arc (spot → lane).
 * @param {number} slotIndex
 * @param {{x:number,z:number}} slotCenter
 * @returns {{ center:{x,z}, radius:number, startAngle:number, endAngle:number, clockwise:boolean, arcStart:{x,z}, arcEnd:{x,z} } | null}
 */
export function getSlotTurnArcForEgress(slotIndex, slotCenter) {
  const smartPath = planVehicleEnterSmartPath(slotIndex, slotCenter);
  const arcSeg = smartPath.filter((s) => s.type === 'ARC').pop();
  if (!arcSeg) return null;
  const arcStart = {
    x: arcSeg.center.x + arcSeg.radius * Math.cos(arcSeg.startAngle),
    z: arcSeg.center.z + arcSeg.radius * Math.sin(arcSeg.startAngle)
  };
  const arcEnd = {
    x: arcSeg.center.x + arcSeg.radius * Math.cos(arcSeg.endAngle),
    z: arcSeg.center.z + arcSeg.radius * Math.sin(arcSeg.endAngle)
  };
  return { ...arcSeg, arcStart, arcEnd };
}

/**
 * Sample an ARC segment in reverse order (end → start) for reverse motion.
 * @param {{ center:{x,z}, radius:number, startAngle:number, endAngle:number, clockwise:boolean }} arcSeg
 * @param {number} stepM
 * @returns {Array<{x:number,z:number}>}
 */
export function sampleArcReverse(arcSeg, stepM = 0.4) {
  const r = arcSeg.radius;
  const sweep = arcSeg.startAngle - arcSeg.endAngle; // reverse: endAngle → startAngle
  const arcLen = Math.abs(sweep) * r;
  const n = Math.max(4, Math.ceil(arcLen / stepM));
  const points = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    const a = arcSeg.endAngle + sweep * t;
    points.push({
      x: arcSeg.center.x + r * Math.cos(a),
      z: arcSeg.center.z + r * Math.sin(a)
    });
  }
  return points;
}

/**
 * Plan enter trajectory as smart path (STRAIGHT + ARC list).
 */
export function planVehicleEnterSmartPath(slotIndex, slotCenter) {
  const kps = getVehicleTrajectoryKeypoints(slotIndex, slotCenter, 'enter');
  if (kps.length < 2) return [];
  return buildSmartPath(kps.map(k => ({ x: k.x, z: k.z, id: k.id })), getTurnRadiusForKeypoint);
}

/**
 * Plan exit trajectory (lane → exit) as smart path.
 */
export function planVehicleExitSmartPath(slotIndex, slotCenter) {
  const kps = getVehicleTrajectoryKeypoints(slotIndex, slotCenter, 'exit');
  if (kps.length < 3) return [];
  const path = kps.slice(1).map(k => ({ x: k.x, z: k.z, id: k.id }));
  return buildSmartPath(path, getTurnRadiusForKeypoint);
}

/**
 * Build smart path from explicit keypoints (e.g. from UI/graph).
 */
export function buildSmartPathFromKeypoints(keypoints) {
  if (!Array.isArray(keypoints) || keypoints.length < 2) return [];
  const path = keypoints.map(p => ({ x: p.x, z: p.z, id: p.id }));
  return buildSmartPath(path, getTurnRadiusForKeypoint);
}

/**
 * Sample smart path into dense points (for reservation / collision check).
 * @param {Array} smartPath from buildSmartPath
 * @param {number} stepM max step along path
 */
export function smartPathToDensePoints(smartPath, stepM = 0.5) {
  if (!Array.isArray(smartPath) || smartPath.length === 0) return [];
  const out = [];
  for (const seg of smartPath) {
    if (seg.type === 'STRAIGHT') {
      const dx = seg.end.x - seg.start.x;
      const dz = seg.end.z - seg.start.z;
      const len = Math.hypot(dx, dz);
      const n = Math.max(1, Math.ceil(len / stepM));
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        out.push({ x: seg.start.x + dx * t, z: seg.start.z + dz * t });
      }
    } else if (seg.type === 'ARC') {
      const r = seg.radius;
      let sweep = seg.endAngle - seg.startAngle;
      if (seg.clockwise && sweep > 0) sweep -= 2 * Math.PI;
      if (!seg.clockwise && sweep < 0) sweep += 2 * Math.PI;
      const arcLen = Math.abs(sweep) * r;
      const n = Math.max(2, Math.ceil(arcLen / stepM));
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        const a = seg.startAngle + sweep * t;
        out.push({
          x: seg.center.x + r * Math.cos(a),
          z: seg.center.z + r * Math.sin(a)
        });
      }
    }
  }
  return out;
}

/**
 * Insert pre-turn points before major turn keypoints.
 * This allows vehicles to start Ackermann steering earlier.
 */
function insertPreTurnKeypoints(keypointPath, preTurnDistance = 3.0) {
  if (!Array.isArray(keypointPath) || keypointPath.length < 3) return keypointPath;

  const enhanced = [keypointPath[0]];
  let preTurnCount = 0;

  for (let i = 1; i < keypointPath.length - 1; i++) {
    const prev = keypointPath[i - 1];
    const curr = keypointPath[i];
    const next = keypointPath[i + 1];

    const headingIn = Math.atan2(curr.x - prev.x, curr.z - prev.z);
    const headingOut = Math.atan2(next.x - curr.x, next.z - curr.z);
    const headingChange = ((headingOut - headingIn + Math.PI) % (2 * Math.PI)) - Math.PI;

    if (Math.abs(headingChange) > Math.PI / 6) {
      const distToCurr = Math.hypot(curr.x - prev.x, curr.z - prev.z);

      if (distToCurr > preTurnDistance * 1.1) {
        const ratio = 1 - Math.min(preTurnDistance / distToCurr, 0.9);
        const preTurnPt = {
          x: prev.x + (curr.x - prev.x) * ratio,
          z: prev.z + (curr.z - prev.z) * ratio,
          id: `${curr.id}_pre`,
          type: 'pre_turn'
        };
        enhanced.push(preTurnPt);
        preTurnCount++;
      }
    }

    enhanced.push(curr);
  }

  enhanced.push(keypointPath[keypointPath.length - 1]);
  return enhanced;
}

export function expandToCenterlineWaypoints(keypointPath, stepM = 0.5) {
  const withArcs = insertArcAtTurns(keypointPath, getTurnRadiusForKeypoint);
  const enhancedKeypoints = insertPreTurnKeypoints(withArcs, 4.0);

  const out = [];
  for (let i = 0; i < enhancedKeypoints.length - 1; i++) {
    const a = enhancedKeypoints[i];
    const b = enhancedKeypoints[i + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    const n = Math.max(1, Math.ceil(len / stepM));
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      if (k === n && i < enhancedKeypoints.length - 2) continue;
      out.push({
        x: a.x + t * dx,
        z: a.z + t * dz,
        segmentType: len < 1 ? 'turn' : 'lane'
      });
    }
  }
  if (enhancedKeypoints.length > 0) {
    const last = enhancedKeypoints[enhancedKeypoints.length - 1];
    const exists = out.length && Math.hypot(out[out.length - 1].x - last.x, out[out.length - 1].z - last.z) < 0.01;
    if (!exists) out.push({ x: last.x, z: last.z, segmentType: 'turn' });
  }
  return out;
}

// =============================================================================
// HIGH-LEVEL PLANNER API
// =============================================================================

/** Slot index → slot group */
export function getSlotGroup(slotIndex) {
  if (slotIndex >= 1 && slotIndex <= 24) return '1_24';
  if (slotIndex >= 25 && slotIndex <= 44) return '25_44';
  return null;
}

/**
 * Plan global path: entrance → lane → (optional slot access) → exit
 *
 * @param {'enter'|'exit'} mode
 * @param {number} slotIndex - 1-44, used to pick lane (1-24 vs 25-44)
 * @param {{x,z}} slotPosition - For enter: target parking slot center. For exit: current position.
 * @returns {Array<{x,z}>} Centerline waypoint sequence
 */
export function planGlobalPath(mode, slotIndex, slotPosition = null) {
  const group = getSlotGroup(slotIndex);
  if (!group) return [];

  const slotGroupOpt = { slotGroup: group };
  let keypointPath = [];

  if (mode === 'enter') {
    keypointPath = searchKeypointPath(KP.ENTRANCE.id, KP.EXIT.id, slotGroupOpt);
    // Truncate at entry turn + lane; slot access is local (not in global graph)
    const entryTurnId = group === '25_44' ? KP.TURN_25_44_ENTRY.id : KP.TURN_1_24_ENTRY.id;
    const exitTurnId = group === '25_44' ? KP.TURN_25_44_EXIT.id : KP.TURN_1_24_EXIT.id;
    const idx = keypointPath.findIndex((kp) => kp.id === exitTurnId);
    if (idx >= 0) keypointPath = keypointPath.slice(0, idx + 1);
  } else {
    // Exit: from lane (exit turn) to KP_EXIT
    const exitTurnId = group === '25_44' ? KP.TURN_25_44_EXIT.id : KP.TURN_1_24_EXIT.id;
    keypointPath = searchKeypointPath(exitTurnId, KP.EXIT.id, slotGroupOpt);
  }

  const waypoints = expandToCenterlineWaypoints(keypointPath);
  if (slotPosition && mode === 'enter' && waypoints.length) {
    waypoints.push({ x: slotPosition.x, z: slotPosition.z, segmentType: 'slot_access' });
  }
  return waypoints;
}

/**
 * Plan global ENTER path: entrance → entry turn → along lane to slot x.
 * Global plan ends at lane centerline (slot access is local planner).
 *
 * @param {number} slotIndex - 1-44
 * @param {{x,z}} slotCenter - Target slot center (used for x on lane)
 * @param {number} stepM - Waypoint spacing
 */
export function planEnterPath(slotIndex, slotCenter, stepM = 0.5) {
  const group = getSlotGroup(slotIndex);
  if (!group) return [];

  const entryTurn = group === '25_44' ? KP.TURN_25_44_ENTRY : KP.TURN_1_24_ENTRY;
  const laneZ = group === '25_44' ? LANE_Z_25_44 : LANE_Z_1_24;
  const laneEndAtSlot = { x: slotCenter.x, z: laneZ };

  const path = [KP.ENTRANCE, entryTurn, laneEndAtSlot];
  return expandToCenterlineWaypoints(path, stepM);
}

/**
 * Vehicle trajectory waypoints: V:entrance → V:turn_xx_entry → V:slot_xx → Cxx → Sxx (Cxx when spot has chargePoint).
 * R:MP, R:CF are for conflict only, not in path geometry.
 *
 * @param {number} slotIndex - 1-44
 * @param {{x,z}} slotCenter - Target slot center
 * @param {'enter'|'exit'} mode
 * @returns {Array<{x,z,id?}>} Trajectory keypoints only
 */
export function getVehicleTrajectoryKeypoints(slotIndex, slotCenter, mode = 'enter') {
  const group = getSlotGroup(slotIndex);
  if (!group) return [];

  const laneZ = group === '25_44' ? LANE_Z_25_44 : LANE_Z_1_24;
  const laneAtSlot = { x: slotCenter.x, z: laneZ };

  if (mode === 'enter') {
    const entryTurn = group === '25_44' ? KP.TURN_25_44_ENTRY : KP.TURN_1_24_ENTRY;
    const spot = PARKING_SPOTS.find((p) => p.index === slotIndex);
    const cp = spot?.chargePoint;
    const spotCenterPt = { x: slotCenter.x, z: slotCenter.z, id: `S${slotIndex}` };
    const cPt = cp ? { x: cp.x, z: cp.z, id: `C${slotIndex}` } : null;
    return [
      { ...KP.ENTRANCE, id: 'V:entrance' },
      { ...entryTurn, id: group === '25_44' ? 'V:turn_25_44_entry' : 'V:turn_1_24_entry' },
      { ...laneAtSlot, id: getSlotTurnId(slotIndex) },
      ...(cPt ? [cPt] : []),
      spotCenterPt
    ];
  } else {
    const exitTurn = group === '25_44' ? KP.TURN_25_44_EXIT : KP.TURN_1_24_EXIT;
    return [
      { x: slotCenter.x, z: slotCenter.z, id: `S${slotIndex}` },
      { ...laneAtSlot, id: getSlotTurnId(slotIndex) },
      { ...exitTurn, id: group === '25_44' ? 'V:turn_25_44_exit' : 'V:turn_1_24_exit' },
      { ...KP.EXIT, id: 'V:exit' }
    ];
  }
}

/** Return trajectory id for V:slot_xx_yy; graph node id is this with 'V:' removed (e.g. slot_30_40). */
export function getSlotTurnId(slotIndex) {
  if (slotIndex >= 25 && slotIndex <= 34) {
    return `V:slot_${slotIndex}_${slotIndex + 10}`; // 25_35, 26_36, ...
  }
  if (slotIndex >= 35 && slotIndex <= 44) {
    return `V:slot_${slotIndex - 10}_${slotIndex}`; // 25_35, 26_36, ...
  }
  const lowerMap = [
    [1], [2, 15], [3, 16], [4, 17], [5, 18], [6, 19], [7, 20], [8, 21],
    [9, 22], [10, 23], [11, 24], [12], [13], [14]
  ];
  const entry = lowerMap.find(s => s.includes(slotIndex));
  if (entry) return entry.length > 1 ? `V:slot_${entry[0]}_${entry[1]}` : `V:slot_${entry[0]}`;
  return `V:slot_${slotIndex}`;
}

/**
 * Plan enter trajectory from keypoints: entrance → turn → V:slot_xx → [Cxx] → S_xx.
 *
 * @param {Array<{x:number,z:number}>} keypoints - [entrance, turn, slotTurn, (Cxx?), spot] (4 or 5 points)
 * @param {number} stepM - Waypoint spacing
 */
export function planVehicleEnterTrajectoryFromKeypoints(keypoints, stepM = 0.5) {
  if (!Array.isArray(keypoints) || keypoints.length < 2) return [];
  const path = keypoints.map(p => ({ x: p.x, z: p.z, id: p.id }));
  return expandToCenterlineWaypoints(path, stepM);
}

/**
 * Plan FULL enter trajectory: entrance → turn → lane@slot → spot.
 * Uses ONLY trajectory keypoints (no R:CF, no C/MP in path geometry).
 *
 * @param {number} slotIndex - 1-44
 * @param {{x,z}} slotCenter - Target slot center
 * @param {number} stepM - Waypoint spacing
 */
export function planVehicleEnterTrajectory(slotIndex, slotCenter, stepM = 0.5) {
  const kps = getVehicleTrajectoryKeypoints(slotIndex, slotCenter, 'enter');
  if (kps.length < 2) return [];
  const path = kps.map(k => ({ x: k.x, z: k.z, id: k.id }));
  return expandToCenterlineWaypoints(path, stepM);
}

/**
 * Plan lane→exit trajectory: lane@slot → turn → exit.
 * Spot→lane is handled by reverse motion separately.
 *
 * @param {number} slotIndex - 1-44
 * @param {{x,z}} slotCenter - Current slot center
 * @param {number} stepM - Waypoint spacing
 */
export function planVehicleExitTrajectory(slotIndex, slotCenter, stepM = 0.5) {
  const kps = getVehicleTrajectoryKeypoints(slotIndex, slotCenter, 'exit');
  if (kps.length < 3) return [];
  const path = kps.slice(1).map(k => ({ x: k.x, z: k.z, id: k.id })); // lane, turn, exit
  return expandToCenterlineWaypoints(path, stepM);
}

/**
 * Plan global EXIT path: lane at slot x → exit turn → exit.
 * Assumes agent is already on lane (slot egress handled by local planner).
 *
 * @param {number} slotIndex - 1-44
 * @param {{x,z}} slotCenter - Current slot center (used for x on lane)
 * @param {number} stepM - Waypoint spacing
 */
export function planExitPath(slotIndex, slotCenter, stepM = 0.5) {
  const group = getSlotGroup(slotIndex);
  if (!group) return [];

  const exitTurn = group === '25_44' ? KP.TURN_25_44_EXIT : KP.TURN_1_24_EXIT;
  const laneZ = group === '25_44' ? LANE_Z_25_44 : LANE_Z_1_24;
  const laneStartAtSlot = { x: slotCenter.x, z: laneZ };

  const path = [laneStartAtSlot, exitTurn, KP.EXIT];
  return expandToCenterlineWaypoints(path, stepM);
}

/**
 * Get lane centerline point for slot access (local planner uses this as merge point).
 */
export function getLanePointForSlot(slotIndex, slotCenter) {
  const group = getSlotGroup(slotIndex);
  if (!group) return null;
  const laneZ = group === '25_44' ? LANE_Z_25_44 : LANE_Z_1_24;
  return { x: slotCenter.x, z: laneZ };
}

export { KP_NODES, KP_EDGES };
