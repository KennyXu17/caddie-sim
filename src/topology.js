/**
 * 停车场拓扑图与 A* 路径规划
 * - 节点：8 个转向点（4 行 × 2 端）、44 个充电点
 * - 边：同一行内所有点（charge + turn）两两相连；同侧 turn 点两两相连；同行左右 turn 相连
 * - 权重：距离；路径目标：最小化距离 + 减少途经转向点数量（经 turn 附加惩罚）
 */

import { PARKING_SPOTS } from './orderSystem.js';

const LEFT_X = -22;
const RIGHT_X = 20;
const ROW_Z = { 1: -25, 2: -21, 3: -8.5, 4: -4.5 };
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
