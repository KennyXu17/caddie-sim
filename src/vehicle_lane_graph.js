import { PARKING_SPOTS } from './orderSystem.js';
import { KP, computeArcEndpoints, getTurnRadiusForKeypoint } from './keypoint_graph.js';

/**
 * Vehicle lane graph (directed, one-way).
 * Vehicles must drive on centerlines and in one direction (+x along lanes).
 *
 * Node ids are plain ids (no "V:" prefix). UI can add prefixes.
 */

function keyFor(x, z) {
  return `${x.toFixed(3)}|${z.toFixed(3)}`;
}

function buildSlotTurnGroupsForLane(slotIndices, laneZ) {
  // group by x at laneZ
  const byX = new Map(); // key -> { x, z, slotIndices: number[] }
  for (const i of slotIndices) {
    const s = PARKING_SPOTS.find((p) => p.index === i);
    if (!s) continue;
    const k = keyFor(s.x, laneZ);
    const e = byX.get(k) ?? { x: s.x, z: laneZ, slotIndices: [] };
    e.slotIndices.push(i);
    byX.set(k, e);
  }
  const groups = Array.from(byX.values());
  for (const g of groups) g.slotIndices = Array.from(new Set(g.slotIndices)).sort((a, b) => a - b);
  groups.sort((a, b) => a.x - b.x);
  return groups;
}

function slotNodeId(slotIndices) {
  return `slot_${slotIndices.join('_')}`;
}

export function getVehicleLaneGraphData() {
  /** @type {{id:string,x:number,z:number,type:string,meta?:any}[]} */
  const nodes = [];
  /** @type {{from:string,to:string,cost:number}[]} */
  const edges = [];
  const nodeById = new Map();

  const addNode = (n) => {
    if (nodeById.has(n.id)) return;
    nodeById.set(n.id, n);
    nodes.push(n);
  };
  const addEdge = (from, to) => {
    const a = nodeById.get(from);
    const b = nodeById.get(to);
    if (!a || !b) return;
    const cost = Math.hypot(b.x - a.x, b.z - a.z);
    edges.push({ from, to, cost });
  };

  // Base vehicle keypoints
  addNode({ id: KP.ENTRANCE.id, x: KP.ENTRANCE.x, z: KP.ENTRANCE.z, type: 'kp' });
  addNode({ id: KP.EXIT.id, x: KP.EXIT.x, z: KP.EXIT.z, type: 'kp' });
  addNode({ id: KP.TURN_25_44_ENTRY.id, x: KP.TURN_25_44_ENTRY.x, z: KP.TURN_25_44_ENTRY.z, type: 'kp' });
  addNode({ id: KP.TURN_25_44_EXIT.id, x: KP.TURN_25_44_EXIT.x, z: KP.TURN_25_44_EXIT.z, type: 'kp' });
  addNode({ id: KP.TURN_1_24_ENTRY.id, x: KP.TURN_1_24_ENTRY.x, z: KP.TURN_1_24_ENTRY.z, type: 'kp' });
  addNode({ id: KP.TURN_1_24_EXIT.id, x: KP.TURN_1_24_EXIT.x, z: KP.TURN_1_24_EXIT.z, type: 'kp' });

  // Conflict points on upper lane (these are conceptually robot conflict points, but used in vehicle lane graph)
  const CF_25_44_LEFT = { id: 'cf_25_44_left', x: -20.5, z: -6.5, type: 'conflict' };
  const CF_25_44_RIGHT = { id: 'cf_25_44_right', x: 18.5, z: -6.5, type: 'conflict' };
  addNode(CF_25_44_LEFT);
  addNode(CF_25_44_RIGHT);

  // Slot turn nodes (grouped by shared lane point)
  // Lower lane moved -0.5 from -22.5 to -23.0
  const lowerLaneGroups = buildSlotTurnGroupsForLane(
    Array.from({ length: 24 }, (_, k) => k + 1),
    -23.0
  );
  const upperLaneGroups = buildSlotTurnGroupsForLane(
    Array.from({ length: 20 }, (_, k) => k + 25),
    -6.5
  );

  for (const g of lowerLaneGroups) {
    addNode({ id: slotNodeId(g.slotIndices), x: g.x, z: g.z, type: 'slot_turn', meta: { slotIndices: g.slotIndices } });
  }
  for (const g of upperLaneGroups) {
    addNode({ id: slotNodeId(g.slotIndices), x: g.x, z: g.z, type: 'slot_turn', meta: { slotIndices: g.slotIndices } });
  }

  // Parking spot nodes (S1..S44) - connected directly to lane graph
  for (const s of PARKING_SPOTS) {
    addNode({ id: `S${s.index}`, x: s.x, z: s.z, type: 'spot', meta: { spotIndex: s.index } });
  }

  const branchPointIds = new Set([KP.TURN_25_44_ENTRY.id, KP.TURN_25_44_EXIT.id]);

  // Helper: expand path with turn _start/_end nodes and add edges along expanded chain
  const pathWithTurnEndpoints = (pathIds) => {
    if (pathIds.length < 2) return;
    const getPos = (id) => {
      const n = nodeById.get(id);
      return n ? { x: n.x, z: n.z } : null;
    };
    const expanded = [pathIds[0]];
    for (let i = 1; i < pathIds.length - 1; i++) {
      const prevId = pathIds[i - 1];
      const currId = pathIds[i];
      const nextId = pathIds[i + 1];
      const prev = getPos(prevId);
      const curr = getPos(currId);
      const next = getPos(nextId);
      const currNode = nodeById.get(currId);
      const radius = currNode ? getTurnRadiusForKeypoint(i, currNode) : 4;
      const arc = prev && curr && next ? computeArcEndpoints(prev, curr, next, radius) : null;
      if (arc) {
        const dist = Math.hypot(arc.arcEnd.x - arc.arcStart.x, arc.arcEnd.z - arc.arcStart.z);
        if (dist < 0.2) { expanded.push(currId); continue; }
        const startId = `${currId}_start`;
        const endId = `${currId}_end`;
        if (!nodeById.has(startId)) {
          addNode({ id: startId, x: arc.arcStart.x, z: arc.arcStart.z, type: 'turn_endpoint', meta: { turnId: currId, kind: 'start' } });
        }
        if (!nodeById.has(endId)) {
          addNode({ id: endId, x: arc.arcEnd.x, z: arc.arcEnd.z, type: 'turn_endpoint', meta: { turnId: currId, kind: 'end' } });
        }
        if (branchPointIds.has(currId)) expanded.push(currId);
        expanded.push(startId, endId);
      } else {
        expanded.push(currId);
      }
    }
    expanded.push(pathIds[pathIds.length - 1]);
    for (let i = 0; i < expanded.length - 1; i++) addEdge(expanded[i], expanded[i + 1]);
  };

  // ----------------------------
  // Directed edges (one-way) with turn _start/_end inserted
  // ----------------------------
  const lowerIds = lowerLaneGroups.map((g) => slotNodeId(g.slotIndices));
  const upperIds = upperLaneGroups.map((g) => slotNodeId(g.slotIndices));

  // Main flow: entrance -> turn_25_44_entry_start/end -> turn_1_24_entry_start/end -> lower chain -> turn_1_24_exit_start/end -> turn_25_44_exit_start/end -> exit
  const mainPath = [KP.ENTRANCE.id, KP.TURN_25_44_ENTRY.id, KP.TURN_1_24_ENTRY.id, ...lowerIds, KP.TURN_1_24_EXIT.id, KP.TURN_25_44_EXIT.id, KP.EXIT.id];
  pathWithTurnEndpoints(mainPath);

  // Upper lane branch: turn_25_44_entry -> cf_left -> slot chain -> cf_right -> turn_25_44_exit
  const upperPath = [KP.TURN_25_44_ENTRY.id, CF_25_44_LEFT.id, ...upperIds, CF_25_44_RIGHT.id, KP.TURN_25_44_EXIT.id];
  pathWithTurnEndpoints(upperPath);

  // S_xx <-> V:slot_xx_yy: bidirectional edge (enter: lane→spot, exit: spot→lane). R:MP only for conflict.
  const addBiEdge = (aId, bId) => {
    addEdge(aId, bId);
    addEdge(bId, aId);
  };
  for (const g of lowerLaneGroups) {
    const slotId = slotNodeId(g.slotIndices); // V:slot_xx_yy in UI; id here is slot_xx_yy
    for (const i of g.slotIndices) {
      addBiEdge(slotId, `S${i}`);
    }
  }
  for (const g of upperLaneGroups) {
    const slotId = slotNodeId(g.slotIndices);
    for (const i of g.slotIndices) {
      addBiEdge(slotId, `S${i}`);
    }
  }

  return { nodes, edges };
}

