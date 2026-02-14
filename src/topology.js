/**
 * 停车场拓扑图与 A* 路径规划
 * - 节点：8 个转向点（4 行 × 2 端）、44 个移动点
 * - 边：同一行内所有点（move + turn）两两相连；同侧 turn 点两两相连；同行左右 turn 相连
 * - 权重：距离；路径目标：最小化距离 + 减少途经转向点数量（经 turn 附加惩罚）
 * - Phase 3: findPathTopoST 支持时空 A*，规划时避开车辆预定
 */

import { PARKING_SPOTS } from './orderSystem.js';
import { getSimTime, isAvailableAt, isResourceAvailableInRange, CELL_SIZE } from './reservation_table.js';

// 小机器人转向点：1-14/15-24/25-34/35-44 各行左右端点
// left 整体往 x 正方向移 1.5，right 整体往 x 负方向移 1.5
const LEFT_X = -20.5 + 1.5;   // -19
const RIGHT_X = 18.5 - 1.5;   // 17
// R:turn_x_xxxx_0 中间转向点不参与上述平移，保持原位置
const TURN0_LEFT_X = -20.5;
const TURN0_RIGHT_X = 18.5;
// Row 3 (slots 25-34) chargePoint 口线已外移 +0.5（z=-9 → -8.5），转向点需同步对齐
const ROW_Z = { 1: -25, 2: -20.5, 3: -8.5, 4: -4 };
/** 每行 R:MPi、R:turn 整体往 Si->Ci 的 z 轴方向移动量 */
const ROW_Z_OFFSET = { 1: 0.5, 2: -0.5, 3: 0.5, 4: -0.5 };
// 车辆主干道中心线（用于 conflict points：机器人与车辆可能冲突的路口点）
// - row1(1-14) 与 row2(15-24) 之间的主干道：z = -23.0 (moved -0.5 from -22.5)
// - row3(25-34) 与 row4(35-44) 之间的主干道：z = -6.5
const VEHICLE_LANE_Z = { '1_14': -23.0, '25_44': -6.5 };
/** 经过转向点的附加代价，用于减少途经 turn 数量 */
const TURN_PENALTY = 1.5;

function dist(a, b) {
  const dx = (a.x ?? a[0]) - (b.x ?? b[0]);
  const dz = (a.z ?? a[1]) - (b.z ?? b[1]);
  return Math.sqrt(dx * dx + dz * dz);
}

function getSpotRow(index) {
  if (index >= 1 && index <= 14) return 1;
  if (index >= 15 && index <= 24) return 2;
  if (index >= 25 && index <= 34) return 3;
  if (index >= 35 && index <= 44) return 4;
  return 3;
}

function getSpotSide(index) {
  const s = PARKING_SPOTS.find(sp => sp.index === index);
  return s ? s.side : 'right';
}

/** 同行 R:turn_i_left/right 的 z 坐标（R:MPxx 与 turn 对齐用） */
function getRowTurnZ(row) {
  let z = ROW_Z[row] + (ROW_Z_OFFSET[row] ?? 0);
  if (row === 4 || row === 2) z -= 0.5;
  return z;
}

function turnId(row, side) {
  return `turn_${row}_${side}`;
}

function moveId(spotIndex) {
  return `move_${spotIndex}`;
}

function chargeId(spotIndex) {
  return `charge_${spotIndex}`;
}

/** 充电前靠近点 Cxx_0：由 Ci 沿 x 方向 0.4 米（开口 -z 为 +x，开口 +z 为 -x） */
function charge0Id(spotIndex) {
  return `charge_${spotIndex}_0`;
}

function isTurnLikeId(id) {
  return typeof id === 'string' && (id.startsWith('turn_') || id.startsWith('cf_'));
}

function buildGraph() {
  const nodes = new Map();
  const edges = [];

  for (const row of [1, 2, 3, 4]) {
    let z = ROW_Z[row] + (ROW_Z_OFFSET[row] ?? 0);
    // Row 4: turn_4_left/right should move -0.5 in z direction
    if (row === 4) {
      z -= 0.5;
    }
    // Row 2: turn_2_left/right should move -0.5 in z direction
    if (row === 2) {
      z -= 0.5;
    }
    for (const side of ['left', 'right']) {
      const x = side === 'left' ? LEFT_X : RIGHT_X;
      const id = turnId(row, side);
      nodes.set(id, { id, x, z, y: 0, type: 'turn', row, side });
    }
  }

  // ---------------------------------------------------------------------------
  // Conflict points (4):
  // Intersection of robot side columns with vehicle lane centerlines.
  // Example: R:turn_1_right (18.5,-25) and R:turn_2_right (18.5,-20.5) intersects vehicle lane z=-22.5 at (18.5,-22.5).
  // ---------------------------------------------------------------------------
  const conflictDefs = [
    // Between row1 (1-14) & row2 (15-24) main lane
    { id: 'cf_1_14_left', x: LEFT_X, z: VEHICLE_LANE_Z['1_14'], side: 'left', slotGroup: '1_14', connectRows: [1, 2] },
    { id: 'cf_1_14_right', x: RIGHT_X, z: VEHICLE_LANE_Z['1_14'], side: 'right', slotGroup: '1_14', connectRows: [1, 2] },
    // Between row3 & row4 (slots 25-44 main lane)
    { id: 'cf_25_44_left', x: LEFT_X, z: VEHICLE_LANE_Z['25_44'], side: 'left', slotGroup: '25_44', connectRows: [3, 4] },
    { id: 'cf_25_44_right', x: RIGHT_X, z: VEHICLE_LANE_Z['25_44'], side: 'right', slotGroup: '25_44', connectRows: [3, 4] }
  ];
  for (const c of conflictDefs) {
    nodes.set(c.id, { id: c.id, x: c.x, z: c.z, y: 0, type: 'conflict', side: c.side, slotGroup: c.slotGroup });
  }

  // R:turn_1_right、R:turn_2_right、R:CF_1_24（cf_1_14_right）往 x 正方向移 0.1
  const RIGHT_OFFSET_X = 0.1;
  for (const id of ['turn_1_right', 'turn_2_right', 'cf_1_14_right']) {
    const n = nodes.get(id);
    if (n) n.x += RIGHT_OFFSET_X;
  }

  // Intermediate turn nodes between row 2 and row 3 (left/right columns)，不随 LEFT_X/RIGHT_X 平移
  nodes.set('turn_3_left_0', { id: 'turn_3_left_0', x: TURN0_LEFT_X, z: -9.5, y: 0, type: 'turn', row: 3, side: 'left' });
  nodes.set('turn_2_left_0', { id: 'turn_2_left_0', x: TURN0_LEFT_X, z: -20, y: 0, type: 'turn', row: 2, side: 'left' });
  nodes.set('turn_3_right_0', { id: 'turn_3_right_0', x: TURN0_RIGHT_X, z: -9.5, y: 0, type: 'turn', row: 3, side: 'right' });
  nodes.set('turn_2_right_0', { id: 'turn_2_right_0', x: TURN0_RIGHT_X, z: -20, y: 0, type: 'turn', row: 2, side: 'right' });

  for (const spot of PARKING_SPOTS) {
    const cp = spot.chargePoint;
    const center = spot.center || { x: cp.x, z: cp.z, y: 0 };
    const id = moveId(spot.index);
    const row = getSpotRow(spot.index);
    const side = spot.side;
    // R:MPxx 与 Cxx 解耦：x 取车位中心，z 与同行 R:turn 一致
    const mpZ = getRowTurnZ(row);
    nodes.set(id, {
      id,
      x: center.x,
      z: mpZ,
      y: center.y != null ? center.y : 0,
      type: 'move',
      spotIndex: spot.index,
      row,
      side
    });
    // 充电点 Ci：由 S_i 确定，沿开口方向距离 2.7（与 parking_map 一致）
    const cid = chargeId(spot.index);
    nodes.set(cid, {
      id: cid,
      x: cp.x,
      z: cp.z,
      y: cp.y != null ? cp.y : 0,
      type: 'charge',
      spotIndex: spot.index,
      row,
      side
    });
    // Cxx_0：充电动画前靠近点，Ci 沿 x 方向 0.4 米（开口 -z 为 +x，开口 +z 为 -x）
    const APPROACH_DIST = 0.4;
    const approachDx = spot.opening === '-z' ? APPROACH_DIST : -APPROACH_DIST;
    const c0id = charge0Id(spot.index);
    nodes.set(c0id, {
      id: c0id,
      x: cp.x + approachDx,
      z: cp.z,
      y: cp.y != null ? cp.y : 0,
      type: 'charge0',
      spotIndex: spot.index,
      row,
      side
    });
  }

  const edgeSet = new Set();
  
  // Add a directed edge (one-way)
  function addDirectedEdge(fromId, toId) {
    const key = `${fromId}->${toId}`;
    if (edgeSet.has(key)) return;
    edgeSet.add(key);
    const a = nodes.get(fromId);
    const b = nodes.get(toId);
    if (!a || !b) return;
    edges.push({ from: fromId, to: toId, cost: dist(a, b) });
  }
  
  // Add a bidirectional edge (two-way)
  function addBidirectionalEdge(aId, bId) {
    addDirectedEdge(aId, bId);
    addDirectedEdge(bId, aId);
  }

  // -----------------------------------------------------------------------------
  // Robot graph edges (directed, structured as specified)
  // -----------------------------------------------------------------------------

  // Row 1 (spots 1-14):
  // turn_1_left <-> MP1 (bidirectional)
  addBidirectionalEdge(turnId(1, 'left'), moveId(1));
  // turn_1_right <-> MP14 (bidirectional)
  addBidirectionalEdge(turnId(1, 'right'), moveId(14));
  // turn_1_right -> MP13 -> MP12 -> ... -> MP2 -> turn_1_left (one-way, right to left)
  addDirectedEdge(turnId(1, 'right'), moveId(13));
  for (let i = 13; i >= 3; i--) addDirectedEdge(moveId(i), moveId(i - 1));
  addDirectedEdge(moveId(2), turnId(1, 'left'));

  // Row 2 (spots 15-24):
  // turn_2_left -> MP15 -> MP16 -> ... -> MP24 -> turn_2_right (one-way, left to right)
  addDirectedEdge(turnId(2, 'left'), moveId(15));
  for (let i = 15; i <= 23; i++) addDirectedEdge(moveId(i), moveId(i + 1));
  addDirectedEdge(moveId(24), turnId(2, 'right'));

  // Row 3 (spots 25-34):
  // turn_3_right -> MP34 -> MP33 -> ... -> MP25 -> turn_3_left (one-way, right to left)
  addDirectedEdge(turnId(3, 'right'), moveId(34));
  for (let i = 34; i >= 26; i--) addDirectedEdge(moveId(i), moveId(i - 1));
  addDirectedEdge(moveId(25), turnId(3, 'left'));

  // Row 4 (spots 35-44) as part of the upper loop:
  // turn_4_left -> MP35 -> MP36 -> ... -> MP44 -> turn_4_right (one-way, left to right)
  addDirectedEdge(turnId(4, 'left'), moveId(35));
  for (let i = 35; i <= 43; i++) addDirectedEdge(moveId(i), moveId(i + 1));
  addDirectedEdge(moveId(44), turnId(4, 'right'));

  // R:MPi <-> Ci 双向连接（充电点，机器人充放电最终目的地）
  for (let i = 1; i <= 44; i++) {
    addBidirectionalEdge(moveId(i), chargeId(i));
  }
  // Ci <-> Cxx_0 双向连接（充电前靠近点）
  for (let i = 1; i <= 44; i++) {
    addBidirectionalEdge(chargeId(i), charge0Id(i));
  }

  // Cxx_0 与同排两侧 R:MP / R:turn 连接，如 turn_4_left->C35_0->MP36, MP35->C36_0->MP37
  function rowNeighbors(spotIndex) {
    const row = getSpotRow(spotIndex);
    if (row === 1) {
      if (spotIndex === 1) return [turnId(1, 'left'), moveId(2)];
      if (spotIndex === 14) return [turnId(1, 'right'), moveId(13)];
      return [moveId(spotIndex + 1), moveId(spotIndex - 1)]; // left=next in chain (MP13->..->MP2), right=prev
    }
    if (row === 2) {
      if (spotIndex === 15) return [turnId(2, 'left'), moveId(16)];
      if (spotIndex === 24) return [moveId(23), turnId(2, 'right')];
      return [moveId(spotIndex - 1), moveId(spotIndex + 1)];
    }
    if (row === 3) {
      // 行内方向 turn_3_right -> C34_0 -> MP33 -> ... -> MP26 -> C25_0 -> turn_3_left
      if (spotIndex === 25) return [moveId(26), turnId(3, 'left')];   // MP26 -> C25_0 -> turn_3_left
      if (spotIndex === 34) return [turnId(3, 'right'), moveId(33)];  // turn_3_right -> C34_0 -> MP33
      return [moveId(spotIndex + 1), moveId(spotIndex - 1)];
    }
    if (row === 4) {
      if (spotIndex === 35) return [turnId(4, 'left'), moveId(36)];
      if (spotIndex === 44) return [moveId(43), turnId(4, 'right')];
      return [moveId(spotIndex - 1), moveId(spotIndex + 1)];
    }
    return [null, null];
  }
  for (let i = 1; i <= 44; i++) {
    const [leftId, rightId] = rowNeighbors(i);
    if (leftId && rightId) {
      addDirectedEdge(leftId, charge0Id(i));
      addDirectedEdge(charge0Id(i), rightId);
    }
  }

  // Left column connections:
  // turn_1_left -> cf_1_14_left -> turn_2_left (one-way, going down/south)
  addDirectedEdge(turnId(1, 'left'), 'cf_1_14_left');
  addDirectedEdge('cf_1_14_left', turnId(2, 'left'));
  // turn_3_left -> turn_3_left_0 -> turn_2_left_0 -> turn_2_left (one-way, row 3 to row 2)
  addDirectedEdge(turnId(3, 'left'), 'turn_3_left_0');
  addDirectedEdge('turn_3_left_0', 'turn_2_left_0');
  addDirectedEdge('turn_2_left_0', turnId(2, 'left'));
  // turn_3_left -> cf_25_44_left -> turn_4_left (one-way, part of upper loop)
  addDirectedEdge(turnId(3, 'left'), 'cf_25_44_left');
  addDirectedEdge('cf_25_44_left', turnId(4, 'left'));

  // Right column connections:
  // turn_2_right -> cf_1_14_right -> turn_1_right (one-way, going up/north)
  addDirectedEdge(turnId(2, 'right'), 'cf_1_14_right');
  addDirectedEdge('cf_1_14_right', turnId(1, 'right'));
  // turn_2_right -> turn_2_right_0 -> turn_3_right_0 -> turn_3_right (one-way, row 2 to row 3)
  addDirectedEdge(turnId(2, 'right'), 'turn_2_right_0');
  addDirectedEdge('turn_2_right_0', 'turn_3_right_0');
  addDirectedEdge('turn_3_right_0', turnId(3, 'right'));
  // turn_4_right -> cf_25_44_right -> turn_3_right (one-way, part of upper loop)
  addDirectedEdge(turnId(4, 'right'), 'cf_25_44_right');
  addDirectedEdge('cf_25_44_right', turnId(3, 'right'));

  const neighbors = new Map();
  for (const n of nodes.keys()) neighbors.set(n, []);
  for (const e of edges) {
    const list = neighbors.get(e.from);
    if (list.find(x => x.id === e.to)) continue;
    const extra = isTurnLikeId(e.to) ? TURN_PENALTY : 0;
    list.push({ id: e.to, cost: e.cost + extra });
  }

  return { nodes, neighbors, edges };
}

const { nodes: TOPO_NODES, neighbors: TOPO_NEIGHBORS, edges: TOPO_EDGES } = buildGraph();

function heuristic(idA, idB) {
  const a = TOPO_NODES.get(idA);
  const b = TOPO_NODES.get(idB);
  if (!a || !b) return 0;
  return dist(a, b);
}

/** 返回从 Cxx_0 离开时的「右侧」邻居节点 id（同排 R:MPxx+1 或 R:turn） */
function getRightNeighborIdFromCharge0(spotIndex) {
  const row = getSpotRow(spotIndex);
  if (row === 1) {
    if (spotIndex === 1) return moveId(2);
    if (spotIndex === 14) return moveId(13);
    return moveId(spotIndex - 1);
  }
  if (row === 2) {
    if (spotIndex === 15) return moveId(16);
    if (spotIndex === 24) return turnId(2, 'right');
    return moveId(spotIndex + 1);
  }
  if (row === 3) {
    if (spotIndex === 25) return moveId(26);
    if (spotIndex === 34) return moveId(33);
    return moveId(spotIndex - 1);
  }
  if (row === 4) {
    if (spotIndex === 35) return moveId(36);
    if (spotIndex === 44) return turnId(4, 'right');
    return moveId(spotIndex + 1);
  }
  return null;
}

/**
 * 拓扑图 A*：从 startSpotIndex 的移动点到 endSpotIndex 的移动点的最优路径。
 * 最小化距离并减少途经转向点数量。
 * @param {Object} [options] - { endAtCharge0: true } 时终点为 Cxx_0
 */
export function findPathTopo(startSpotIndex, endSpotIndex, options = null) {
  const startId = moveId(startSpotIndex);
  const endId = (options?.endAtCharge0) ? charge0Id(endSpotIndex) : moveId(endSpotIndex);
  if (!TOPO_NODES.has(startId) || !TOPO_NODES.has(endId)) {
    console.warn(`⚠️ findPathTopo: Node not found - start:${startId}(${TOPO_NODES.has(startId)}) end:${endId}(${TOPO_NODES.has(endId)})`);
    return [];
  }

  const open = [{ id: startId, f: heuristic(startId, endId), g: 0 }];
  const closed = new Set();
  const cameFrom = new Map();
  const gScore = new Map();
  gScore.set(startId, 0);

  while (open.length) {
    open.sort((a, b) => a.f - b.f);
    const cur = open.shift();
    if (cur.id === endId) {
      const path = [];
      let id = cur.id;
      while (id) {
        const n = TOPO_NODES.get(id);
        path.unshift({ id, x: n.x, z: n.z, y: n.y != null ? n.y : 0, type: n.type, spotIndex: n.spotIndex, row: n.row, side: n.side });
        id = cameFrom.get(id);
      }
      return path;
    }
    closed.add(cur.id);
    for (const nb of TOPO_NEIGHBORS.get(cur.id) || []) {
      if (closed.has(nb.id)) continue;
      const tg = (gScore.get(cur.id) ?? Infinity) + nb.cost;
      if (tg >= (gScore.get(nb.id) ?? Infinity)) continue;
      cameFrom.set(nb.id, cur.id);
      gScore.set(nb.id, tg);
      const h = heuristic(nb.id, endId);
      const f = tg + h;
      const existing = open.find(o => o.id === nb.id);
      if (existing) {
        existing.f = f;
        existing.g = tg;
      } else {
        open.push({ id: nb.id, f, g: tg });
      }
    }
  }
  console.warn(`⚠️ findPathTopo: No path found from MP${startSpotIndex} to MP${endSpotIndex} in directed graph!`);
  return [];
}

const ST_WAIT_STEP = 0.5;
const ST_MAX_HORIZON = 120;

/**
 * 时空 A*：状态 (nodeId, t)，规划时避开车辆预定
 * @param {number} startSpotIndex
 * @param {number} endSpotIndex
 * @param {number} [t0] - 出发时间（秒），默认 getSimTime()
 * @param {number} [speed=3] - 机器人速度 m/s
 * @param {string} [excludeAgentId] - 排除的 agent
 * @param {Object} [options] - { endAtCharge0: true } 时终点为 Cxx_0（不经 R:MP/Ci）
 * @returns {Array<{x,z,y?,type?,spotIndex?,row?,side?,id?}>} 路径点序列，若无解返回 []
 */
export function findPathTopoST(startSpotIndex, endSpotIndex, t0 = null, speed = 3, excludeAgentId = null, options = null) {
  const startId = moveId(startSpotIndex);
  const endId = (options?.endAtCharge0) ? charge0Id(endSpotIndex) : moveId(endSpotIndex);
  const tStart = t0 ?? getSimTime();

  if (!TOPO_NODES.has(startId) || !TOPO_NODES.has(endId)) {
    const sNode = TOPO_NODES.get(moveId(startSpotIndex)) || PARKING_SPOTS.find(sp => sp.index === startSpotIndex)?.center;
    const ePos = (options?.endAtCharge0) ? (TOPO_NODES.get(charge0Id(endSpotIndex)) || null) : (TOPO_NODES.get(moveId(endSpotIndex)) || null);
    if (!ePos) {
      const spot = PARKING_SPOTS.find(sp => sp.index === endSpotIndex);
      if (spot && options?.endAtCharge0) {
        const ep = getCharge0Position(endSpotIndex);
        if (ep) {
          const sp = sNode && (sNode.x != null) ? { x: sNode.x, z: sNode.z, y: 0 } : (PARKING_SPOTS.find(sp => sp.index === startSpotIndex)?.center || {});
          return sp.x != null ? [{ ...sp, type: 'move', spotIndex: startSpotIndex }, { ...ep, type: 'charge0', spotIndex: endSpotIndex }] : [{ ...ep, type: 'charge0', spotIndex: endSpotIndex }];
        }
      }
      const e = spot?.chargePoint || (spot?.center);
      if (sNode && sNode.x != null && e) {
        return [
          { x: sNode.x, z: sNode.z, y: sNode.y != null ? sNode.y : 0, type: 'move', spotIndex: startSpotIndex },
          { x: e.x, z: e.z, y: e.y != null ? e.y : 0, type: options?.endAtCharge0 ? 'charge0' : 'move', spotIndex: endSpotIndex }
        ];
      }
    } else {
      const sp = TOPO_NODES.get(moveId(startSpotIndex));
      if (sp) return [{ id: startId, x: sp.x, z: sp.z, y: sp.y != null ? sp.y : 0, type: 'move', spotIndex: startSpotIndex }, { id: endId, x: ePos.x, z: ePos.z, y: ePos.y != null ? ePos.y : 0, type: ePos.type || 'move', spotIndex: endSpotIndex }];
    }
    return [];
  }

  const stateKey = (id, t) => `${id}|${t.toFixed(1)}`;

  const open = [{ id: startId, t: tStart, f: heuristic(startId, endId) / speed, g: 0 }];
  const closed = new Set();
  const cameFrom = new Map();
  const gScore = new Map();
  gScore.set(stateKey(startId, tStart), 0);

  // Check that a moving segment is free in space-time by sampling along the edge.
  // This keeps planning consistent with edge-densified reservations in main_sim.js.
  const EDGE_SAMPLE_STEP = Math.max(0.5, CELL_SIZE / 2); // meters
  const isSegmentFree = (aNode, bNode, tA, travelTime) => {
    const dx = bNode.x - aNode.x;
    const dz = bNode.z - aNode.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 1e-6) return true;
    const steps = Math.max(1, Math.ceil(dist / EDGE_SAMPLE_STEP));
    for (let s = 1; s <= steps; s++) {
      const u = s / steps;
      const x = aNode.x + u * dx;
      const z = aNode.z + u * dz;
      const t = tA + u * travelTime;
      if (!isAvailableAt(x, z, t, excludeAgentId)) return false;
    }
    return true;
  };
  const MP_DWELL_SEC = 1.0;
  const mpResId = (spotIndex) => `res_mp_${spotIndex}`;

  while (open.length) {
    open.sort((a, b) => a.f - b.f);
    const cur = open.shift();
    const ck = stateKey(cur.id, cur.t);

    if (cur.id === endId) {
      const path = [];
      let s = cur;
      while (s) {
        const n = TOPO_NODES.get(s.id);
        if (n) path.unshift({ id: s.id, x: n.x, z: n.z, y: n.y != null ? n.y : 0, type: n.type, spotIndex: n.spotIndex, row: n.row, side: n.side });
        s = cameFrom.get(stateKey(s.id, s.t));
      }
      return path;
    }

    if (cur.t > tStart + ST_MAX_HORIZON) continue;
    closed.add(ck);

    const curNode = TOPO_NODES.get(cur.id);
    if (!curNode) continue;

    for (const nb of TOPO_NEIGHBORS.get(cur.id) || []) {
      const nbNode = TOPO_NODES.get(nb.id);
      if (!nbNode) continue;
      const travelTime = nb.cost / speed;
      const arrivalT = cur.t + travelTime;
      const nk = stateKey(nb.id, arrivalT);
      if (closed.has(nk)) continue;
      if (!isAvailableAt(nbNode.x, nbNode.z, arrivalT, excludeAgentId)) continue;
      // MP resource capacity=1: avoid entering an occupied MP.
      if (nbNode.type === 'move' && typeof nbNode.spotIndex === 'number') {
        const rid = mpResId(nbNode.spotIndex);
        if (!isResourceAvailableInRange(rid, arrivalT, arrivalT + MP_DWELL_SEC, excludeAgentId)) continue;
      }
      if (!isSegmentFree(curNode, nbNode, cur.t, travelTime)) continue;
      const tg = (gScore.get(ck) ?? Infinity) + travelTime;
      if (tg >= (gScore.get(nk) ?? Infinity)) continue;
      cameFrom.set(nk, cur);
      gScore.set(nk, tg);
      const h = heuristic(nb.id, endId) / speed;
      const existing = open.find(o => o.id === nb.id && Math.abs(o.t - arrivalT) < 0.01);
      if (existing) {
        if (tg < (gScore.get(stateKey(existing.id, existing.t)) ?? Infinity)) {
          existing.t = arrivalT;
          existing.f = tg + h;
          existing.g = tg;
        }
      } else {
        open.push({ id: nb.id, t: arrivalT, f: tg + h, g: tg });
      }
    }

    const waitT = cur.t + ST_WAIT_STEP;
    if (waitT <= tStart + ST_MAX_HORIZON && isAvailableAt(curNode.x, curNode.z, waitT, excludeAgentId)) {
      // If waiting at MP, the MP resource must also be available during the wait step.
      if (curNode.type === 'move' && typeof curNode.spotIndex === 'number') {
        const rid = mpResId(curNode.spotIndex);
        if (!isResourceAvailableInRange(rid, cur.t, waitT, excludeAgentId)) {
          continue;
        }
      }
      const wk = stateKey(cur.id, waitT);
      if (!closed.has(wk)) {
        const wg = (gScore.get(ck) ?? Infinity) + ST_WAIT_STEP;
        if (wg < (gScore.get(wk) ?? Infinity)) {
          cameFrom.set(wk, cur);
          gScore.set(wk, wg);
          const h = heuristic(cur.id, endId) / speed;
          const existing = open.find(o => o.id === cur.id && Math.abs(o.t - waitT) < 0.01);
          if (existing) {
            existing.f = wg + h;
            existing.g = wg;
          } else {
            open.push({ id: cur.id, t: waitT, f: wg + h, g: wg });
          }
        }
      }
    }
  }
  return [];
}

export function isCrossingSegment(wpA, wpB) {
  if (!wpA || !wpB || wpA.type !== 'turn' || wpB.type !== 'turn') return false;
  return wpA.row === wpB.row && wpA.side !== wpB.side;
}

export function getTurnPoint(row, side) {
  const id = turnId(row, side);
  const n = TOPO_NODES.get(id);
  return n ? { x: n.x, z: n.z, y: n.y != null ? n.y : 0 } : null;
}

/**
 * 返回可序列化的图结构，供 plot 脚本使用。
 * 边权重仅含距离（不含 TURN_PENALTY）。
 * Note: This is now a DIRECTED graph - edges are not deduplicated.
 */
export function getGraphData() {
  const nodeList = Array.from(TOPO_NODES.values());
  const edgeList = [];
  for (const e of TOPO_EDGES) {
    edgeList.push({ from: e.from, to: e.to, cost: Math.round(e.cost * 100) / 100 });
  }
  return { nodes: nodeList, edges: edgeList };
}

/**
 * 获取移动点 R:MPi 的坐标（与 Cxx 解耦，z 与同行 R:turn 一致）
 */
export function getMovePointPosition(spotIndex) {
  const n = TOPO_NODES.get(moveId(spotIndex));
  if (n) return { x: n.x, z: n.z, y: n.y != null ? n.y : 0 };
  const spot = PARKING_SPOTS.find(s => s.index === spotIndex);
  if (!spot) return null;
  const center = spot.center || spot.chargePoint;
  if (!center) return null;
  const row = getSpotRow(spotIndex);
  const mpZ = getRowTurnZ(row);
  return { x: center.x, z: mpZ, y: center.y != null ? center.y : 0 };
}

/**
 * 获取充电点 Ci 的坐标（机器人充放电最终目的地）
 * Ci 由 S_i（车位中心）沿开口方向距离 2.7 确定
 */
export function getChargePointPosition(spotIndex) {
  const n = TOPO_NODES.get(chargeId(spotIndex));
  if (n) return { x: n.x, z: n.z, y: n.y != null ? n.y : 0 };
  const spot = PARKING_SPOTS.find(s => s.index === spotIndex);
  if (!spot || !spot.chargePoint) return null;
  const cp = spot.chargePoint;
  return { x: cp.x, z: cp.z, y: cp.y != null ? cp.y : 0 };
}

/**
 * 获取充电前靠近点 Cxx_0 的坐标（与 main_sim 中 approachPos 一致）
 */
export function getCharge0Position(spotIndex) {
  const n = TOPO_NODES.get(charge0Id(spotIndex));
  if (n) return { x: n.x, z: n.z, y: n.y != null ? n.y : 0 };
  const spot = PARKING_SPOTS.find(s => s.index === spotIndex);
  if (!spot || !spot.chargePoint) return null;
  const cp = spot.chargePoint;
  const APPROACH_DIST = 0.4;
  const approachDx = spot.opening === '-z' ? APPROACH_DIST : -APPROACH_DIST;
  return { x: cp.x + approachDx, z: cp.z, y: cp.y != null ? cp.y : 0 };
}

/**
 * 充完电后从 Cxx_0 离开时的目标：先到 R:MPxx+1（或行末到 R:turn），再视情况到 R:MPxx 以便下次规划一致。
 * @returns {{ positions: Array<{x,z,y}> } 要依次经过的位置, nextSpotIndex: number } 离开后的 lastSpotIndex
 */
export function getLeaveTargetFromCharge0(spotIndex) {
  const rightId = getRightNeighborIdFromCharge0(spotIndex);
  if (!rightId) return { positions: [], nextSpotIndex: spotIndex };
  const rightNode = TOPO_NODES.get(rightId);
  if (!rightNode) return { positions: [], nextSpotIndex: spotIndex };
  const pos = { x: rightNode.x, z: rightNode.z, y: rightNode.y != null ? rightNode.y : 0 };
  const row = getSpotRow(spotIndex);
  const isTurn = rightId.startsWith('turn_');
  if (isTurn) {
    const mpPos = getMovePointPosition(spotIndex);
    if (mpPos) return { positions: [pos, mpPos], nextSpotIndex: spotIndex };
    return { positions: [pos], nextSpotIndex: spotIndex };
  }
  const spotIndexNext = rightNode.spotIndex;
  return { positions: [pos], nextSpotIndex: spotIndexNext != null ? spotIndexNext : spotIndex };
}

export { ROW_Z, LEFT_X, RIGHT_X, getSpotRow, getSpotSide, charge0Id };
