/**
 * Keypoint Graph - Global Navigation for Parking Lot
 *
 * Vehicles and robots follow road CENTERLINES. Turning allowed ONLY at keypoints.
 * NOT grid-based A* - uses topological graph search.
 *
 * Coordinate system: 2D (x, z)
 */

// =============================================================================
// KEYPOINT DEFINITIONS (World Coordinates)
// =============================================================================

export const KP = {
  /** Parking lot entrance */
  ENTRANCE: { id: 'entrance', x: -22.25, z: 6.5, type: 'entrance' },

  /** Parking lot exit */
  EXIT: { id: 'exit', x: 20.25, z: 6.5, type: 'exit' },

  /** Slots 25-44 (upper row): lane at z = -6.5 */
  TURN_25_44_ENTRY: { id: 'turn_25_44_entry', x: -22.25, z: -6.5, type: 'turn', slotGroup: '25_44' },
  TURN_25_44_EXIT: { id: 'turn_25_44_exit', x: 20.25, z: -6.5, type: 'turn', slotGroup: '25_44' },

  /** Slots 1-24 (lower row): lane at z = -22.5 */
  TURN_1_24_ENTRY: { id: 'turn_1_24_entry', x: -22.25, z: -22.5, type: 'turn', slotGroup: '1_24' },
  TURN_1_24_EXIT: { id: 'turn_1_24_exit', x: 20.25, z: -22.5, type: 'turn', slotGroup: '1_24' }
};

/** Lane segments: { start, end, slotGroup } - centerline along constant z */
export const LANES = [
  {
    id: 'lane_25_44',
    start: KP.TURN_25_44_ENTRY,
    end: KP.TURN_25_44_EXIT,
    slotGroup: '25_44',
    z: -6.5,
    xMin: -22.25,
    xMax: 20.25
  },
  {
    id: 'lane_1_24',
    start: KP.TURN_1_24_ENTRY,
    end: KP.TURN_1_24_EXIT,
    slotGroup: '1_24',
    z: -22.5,
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

  const dist = (a, b) => Math.hypot((b.x ?? a.x) - (a.x ?? b.x), (b.z ?? a.z) - (a.z ?? b.z));

  addNode(KP.ENTRANCE);
  addNode(KP.EXIT);
  addNode(KP.TURN_25_44_ENTRY);
  addNode(KP.TURN_25_44_EXIT);
  addNode(KP.TURN_1_24_ENTRY);
  addNode(KP.TURN_1_24_EXIT);

  // Entrance → entry turns (vertical segments, z: 6.5 → -6.5 or -22.5)
  addEdge(KP.ENTRANCE.id, KP.TURN_25_44_ENTRY.id, dist(KP.ENTRANCE, KP.TURN_25_44_ENTRY));
  addEdge(KP.ENTRANCE.id, KP.TURN_1_24_ENTRY.id, dist(KP.ENTRANCE, KP.TURN_1_24_ENTRY));

  // Entry turn → exit turn (along lane, +x direction)
  addEdge(KP.TURN_25_44_ENTRY.id, KP.TURN_25_44_EXIT.id, dist(KP.TURN_25_44_ENTRY, KP.TURN_25_44_EXIT));
  addEdge(KP.TURN_1_24_ENTRY.id, KP.TURN_1_24_EXIT.id, dist(KP.TURN_1_24_ENTRY, KP.TURN_1_24_EXIT));

  // Exit turn → exit (vertical segments, z: -6.5 or -22.5 → 6.5)
  addEdge(KP.TURN_25_44_EXIT.id, KP.EXIT.id, dist(KP.TURN_25_44_EXIT, KP.EXIT));
  addEdge(KP.TURN_1_24_EXIT.id, KP.EXIT.id, dist(KP.TURN_1_24_EXIT, KP.EXIT));

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
export function expandToCenterlineWaypoints(keypointPath, stepM = 0.5) {
  const out = [];
  for (let i = 0; i < keypointPath.length - 1; i++) {
    const a = keypointPath[i];
    const b = keypointPath[i + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    const n = Math.max(1, Math.ceil(len / stepM));
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      if (k === n && i < keypointPath.length - 2) continue; // avoid duplicate at junction
      out.push({
        x: a.x + t * dx,
        z: a.z + t * dz,
        segmentType: len < 1 ? 'turn' : 'lane'
      });
    }
  }
  if (keypointPath.length > 0) {
    const last = keypointPath[keypointPath.length - 1];
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
  const laneZ = group === '25_44' ? -6.5 : -22.5;
  const laneEndAtSlot = { x: slotCenter.x, z: laneZ };

  const path = [KP.ENTRANCE, entryTurn, laneEndAtSlot];
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
  const laneZ = group === '25_44' ? -6.5 : -22.5;
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
  const laneZ = group === '25_44' ? -6.5 : -22.5;
  return { x: slotCenter.x, z: laneZ };
}

export { KP_NODES, KP_EDGES };
