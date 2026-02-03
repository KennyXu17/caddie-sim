/**
 * 停车场拓扑图与 A* 路径规划
 * - 节点：8 个转向点（4 行 × 2 端）、44 个充电点
 * - 边：同一行内所有点（charge + turn）两两相连；同侧 turn 点两两相连；同行左右 turn 相连
 * - 权重：距离；路径目标：最小化距离 + 减少途经转向点数量（经 turn 附加惩罚）
 * - Phase 3: findPathTopoST 支持时空 A*，规划时避开车辆预定
 */

import { PARKING_SPOTS } from './orderSystem.js';
import { getSimTime, isAvailableAt } from './reservation_table.js';

// 小机器人转向点：1-14/15-24/25-34/35-44 各行左右端点
const LEFT_X = -20.5;
const RIGHT_X = 18.5;
// Row 3 (slots 25-34) chargePoint 口线已外移 +0.5（z=-9 → -8.5），转向点需同步对齐
const ROW_Z = { 1: -25, 2: -20.5, 3: -8.5, 4: -4 };
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

function turnId(row, side) {
  return `turn_${row}_${side}`;
}

function chargeId(spotIndex) {
  return `charge_${spotIndex}`;
}

function isTurnId(id) {
  return typeof id === 'string' && id.startsWith('turn_');
}

function buildGraph() {
  const nodes = new Map();
  const edges = [];

  for (const row of [1, 2, 3, 4]) {
    const z = ROW_Z[row];
    for (const side of ['left', 'right']) {
      const x = side === 'left' ? LEFT_X : RIGHT_X;
      const id = turnId(row, side);
      nodes.set(id, { id, x, z, y: 0, type: 'turn', row, side });
    }
  }

  const rowNodes = new Map();
  for (const r of [1, 2, 3, 4]) rowNodes.set(r, []);

  for (const spot of PARKING_SPOTS) {
    const cp = spot.chargePoint;
    const id = chargeId(spot.index);
    const row = getSpotRow(spot.index);
    const side = spot.side;
    nodes.set(id, {
      id,
      x: cp.x,
      z: cp.z,
      y: cp.y != null ? cp.y : 0,
      type: 'charge',
      spotIndex: spot.index,
      row,
      side
    });
    rowNodes.get(row).push(id);
  }

  for (const row of [1, 2, 3, 4]) {
    const leftId = turnId(row, 'left');
    const rightId = turnId(row, 'right');
    rowNodes.get(row).push(leftId, rightId);
  }

  const edgeSet = new Set();
  function addEdge(u, v, cost) {
    const key = u < v ? `${u}|${v}` : `${v}|${u}`;
    if (edgeSet.has(key)) return;
    edgeSet.add(key);
    edges.push({ from: u, to: v, cost });
    edges.push({ from: v, to: u, cost });
  }

  for (const row of [1, 2, 3, 4]) {
    const ids = rowNodes.get(row);
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = nodes.get(ids[i]);
        const b = nodes.get(ids[j]);
        addEdge(ids[i], ids[j], dist(a, b));
      }
    }
  }

  for (const side of ['left', 'right']) {
    const turns = [1, 2, 3, 4].map(r => turnId(r, side));
    for (let i = 0; i < turns.length; i++) {
      for (let j = i + 1; j < turns.length; j++) {
        const a = nodes.get(turns[i]);
        const b = nodes.get(turns[j]);
        addEdge(turns[i], turns[j], dist(a, b));
      }
    }
  }

  for (const row of [1, 2, 3, 4]) {
    const leftId = turnId(row, 'left');
    const rightId = turnId(row, 'right');
    const a = nodes.get(leftId);
    const b = nodes.get(rightId);
    addEdge(leftId, rightId, dist(a, b));
  }

  // 相邻行同列 charge point 直连，小机器人可在这些边上行驶
  const chargePointPairs = [
    [3, 15], [4, 16], [5, 17], [6, 18], [7, 19], [8, 20], [9, 21], [10, 22], [11, 23], [12, 24],
    [25, 35], [26, 36], [27, 37], [28, 38], [29, 39], [30, 40], [31, 41], [32, 42], [33, 43], [34, 44]
  ];
  for (const [aIdx, bIdx] of chargePointPairs) {
    const aid = chargeId(aIdx);
    const bid = chargeId(bIdx);
    if (nodes.has(aid) && nodes.has(bid)) {
      const a = nodes.get(aid);
      const b = nodes.get(bid);
      addEdge(aid, bid, dist(a, b));
    }
  }

  const neighbors = new Map();
  for (const n of nodes.keys()) neighbors.set(n, []);
  for (const e of edges) {
    const list = neighbors.get(e.from);
    if (list.find(x => x.id === e.to)) continue;
    const extra = isTurnId(e.to) ? TURN_PENALTY : 0;
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

/**
 * 拓扑图 A*：从 startSpotIndex 的充电点到 endSpotIndex 的充电点的最优路径。
 * 最小化距离并减少途经转向点数量。
 */
export function findPathTopo(startSpotIndex, endSpotIndex) {
  const startId = chargeId(startSpotIndex);
  const endId = chargeId(endSpotIndex);
  if (!TOPO_NODES.has(startId) || !TOPO_NODES.has(endId)) {
    const s = PARKING_SPOTS.find(sp => sp.index === startSpotIndex)?.chargePoint;
    const e = PARKING_SPOTS.find(sp => sp.index === endSpotIndex)?.chargePoint;
    if (s && e) {
      return [
        { x: s.x, z: s.z, y: s.y != null ? s.y : 0, type: 'charge', spotIndex: startSpotIndex },
        { x: e.x, z: e.z, y: e.y != null ? e.y : 0, type: 'charge', spotIndex: endSpotIndex }
      ];
    }
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
        path.unshift({ x: n.x, z: n.z, y: n.y != null ? n.y : 0, type: n.type, spotIndex: n.spotIndex, row: n.row, side: n.side });
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
  return [];
}

const ST_WAIT_STEP = 0.5;
const ST_MAX_HORIZON = 120;

/**
 * 时空 A*：状态 (nodeId, t)，规划时避开车辆预定
 * 可扩展等待动作 (node, t+dt)
 * @param {number} startSpotIndex
 * @param {number} endSpotIndex
 * @param {number} [t0] - 出发时间（秒），默认 getSimTime()
 * @param {number} [speed=3] - 机器人速度 m/s
 * @returns {Array<{x,z,y?,type?,spotIndex?,row?,side?}>} 路径点序列，若无解返回 []
 */
export function findPathTopoST(startSpotIndex, endSpotIndex, t0 = null, speed = 3) {
  const startId = chargeId(startSpotIndex);
  const endId = chargeId(endSpotIndex);
  const tStart = t0 ?? getSimTime();

  if (!TOPO_NODES.has(startId) || !TOPO_NODES.has(endId)) {
    const s = PARKING_SPOTS.find(sp => sp.index === startSpotIndex)?.chargePoint;
    const e = PARKING_SPOTS.find(sp => sp.index === endSpotIndex)?.chargePoint;
    if (s && e) {
      return [
        { x: s.x, z: s.z, y: s.y != null ? s.y : 0, type: 'charge', spotIndex: startSpotIndex },
        { x: e.x, z: e.z, y: e.y != null ? e.y : 0, type: 'charge', spotIndex: endSpotIndex }
      ];
    }
    return [];
  }

  const stateKey = (id, t) => `${id}|${t.toFixed(1)}`;

  const open = [{ id: startId, t: tStart, f: heuristic(startId, endId) / speed, g: 0 }];
  const closed = new Set();
  const cameFrom = new Map();
  const gScore = new Map();
  gScore.set(stateKey(startId, tStart), 0);

  while (open.length) {
    open.sort((a, b) => a.f - b.f);
    const cur = open.shift();
    const ck = stateKey(cur.id, cur.t);

    if (cur.id === endId) {
      const path = [];
      let s = cur;
      while (s) {
        const n = TOPO_NODES.get(s.id);
        if (n) path.unshift({ x: n.x, z: n.z, y: n.y != null ? n.y : 0, type: n.type, spotIndex: n.spotIndex, row: n.row, side: n.side });
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
      if (!isAvailableAt(nbNode.x, nbNode.z, arrivalT)) continue;
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
    if (waitT <= tStart + ST_MAX_HORIZON && isAvailableAt(curNode.x, curNode.z, waitT)) {
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
 */
export function getGraphData() {
  const nodeList = Array.from(TOPO_NODES.values());
  const seen = new Set();
  const edgeList = [];
  for (const e of TOPO_EDGES) {
    const key = e.from < e.to ? `${e.from}|${e.to}` : `${e.to}|${e.from}`;
    if (seen.has(key)) continue;
    seen.add(key);
    edgeList.push({ from: e.from, to: e.to, cost: Math.round(e.cost * 100) / 100 });
  }
  return { nodes: nodeList, edges: edgeList };
}

export { ROW_Z, LEFT_X, RIGHT_X, getSpotRow, getSpotSide };
