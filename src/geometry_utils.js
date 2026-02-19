/**
 * 几何检测工具：胶囊体碰撞、线段距离等
 * 用于高性能替代半径检测，模拟车辆/机器人碰撞边界
 */

/**
 * 点到线段的最短距离平方（投影法）
 * @param {number} px - 点 x
 * @param {number} pz - 点 z
 * @param {number} ax - 线段起点 x
 * @param {number} az - 线段起点 z
 * @param {number} bx - 线段终点 x
 * @param {number} bz - 线段终点 z
 * @returns {{ distSq: number, t: number }} t 为投影参数 [0,1]，超出则夹紧
 */
function pointToSegmentDistSq(px, pz, ax, az, bx, bz) {
  const abx = bx - ax;
  const abz = bz - az;
  const apx = px - ax;
  const apz = pz - az;
  const abLenSq = abx * abx + abz * abz;
  let t = abLenSq < 1e-12 ? 0 : (apx * abx + apz * abz) / abLenSq;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  const projX = ax + t * abx;
  const projZ = az + t * abz;
  const dx = px - projX;
  const dz = pz - projZ;
  return { distSq: dx * dx + dz * dz, t };
}

function distPointToSegment(px, pz, ax, az, bx, bz) {
  const r = pointToSegmentDistSq(px, pz, ax, az, bx, bz);
  return Math.sqrt(r.distSq);
}

/**
 * 两条线段之间的最短距离（向量投影法，四端点+投影枚举）
 */
function segmentToSegmentDist(p1, p2, p3, p4) {
  const ax = p1.x, az = p1.z, bx = p2.x, bz = p2.z;
  const cx = p3.x, cz = p3.z, dx = p4.x, dz = p4.z;
  let d = Infinity;
  const d1 = distPointToSegment(ax, az, cx, cz, dx, dz);
  if (d1 < d) d = d1;
  const d2 = distPointToSegment(bx, bz, cx, cz, dx, dz);
  if (d2 < d) d = d2;
  const d3 = distPointToSegment(cx, cz, ax, az, bx, bz);
  if (d3 < d) d = d3;
  const d4 = distPointToSegment(dx, dz, ax, az, bx, bz);
  if (d4 < d) d = d4;
  return d;
}

/**
 * 胶囊体碰撞检测
 * 胶囊体1: 线段 p1-p2，半径 r1（模拟车辆）
 * 胶囊体2: 线段 p3-p4，半径 r2（p3==p4 时退化为圆，模拟机器人）
 * @param {{x,z}} p1 - 胶囊体1 端点
 * @param {{x,z}} p2 - 胶囊体1 端点
 * @param {number} r1 - 胶囊体1 半径
 * @param {{x,z}} p3 - 胶囊体2 端点
 * @param {{x,z}} p4 - 胶囊体2 端点
 * @param {number} r2 - 胶囊体2 半径
 * @returns {boolean} 是否碰撞（距离 < r1+r2）
 */
export function checkCapsuleCollision(p1, p2, r1, p3, p4, r2) {
  const minDist = r1 + r2;
  const dist = segmentToSegmentDist(p1, p2, p3, p4);
  return dist < minDist;
}

/**
 * 胶囊体与圆碰撞（ convenience：p3==p4 的简化）
 */
export function checkCapsuleCircleCollision(p1, p2, r1, center, r2) {
  return checkCapsuleCollision(p1, p2, r1, center, center, r2);
}

export { pointToSegmentDistSq, segmentToSegmentDist };
