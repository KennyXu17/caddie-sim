/**
 * Vehicle steering helpers for path following (Ackermann, curvature slowdown, look-ahead).
 * Used by appendVehicleEdgewiseMotion in main_sim.js.
 * Blends "chase point" with "path tangent" to avoid stutter and post-turn drift.
 */

export const STEERING_CONFIG = {
  pathRadius: 1.2,
  maxForce: 15,
  /** Per-frame steering smoothness (0–1) when using lerp in update loop. */
  steeringLerp: 0.1,
  /** Distance (m) below which we weight toward path tangent (parallel) over chasing point. */
  tangentBlendDist: 3.0
};

/** Angle difference in [-π, π] (shortest path). */
export function angleDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

/** Normalize target angle for shortest rotation from current. */
export function normalizeAngleShortestPath(current, target) {
  return current + angleDiff(current, target);
}

/** Clamp steering angle to ±maxAngle. */
export function clampSteeringAngle(steeringAngle, maxAngle) {
  return Math.max(-maxAngle, Math.min(maxAngle, steeringAngle));
}

/**
 * Look-ahead point and path tangent at that segment (reduces stutter and post-turn drift).
 * Returns tangentAngle so steering can blend "chase point" with "align to path".
 * @param {Array<{x:number,z:number}>} path
 * @param {number} i segment index
 * @param {number} speed
 * @returns {{ point: { x: number, z: number }, tangentAngle: number } | null}
 */
export function getLookAheadTarget(path, i, speed) {
  if (!path || i < 0 || i >= path.length - 1) return null;
  const lookAheadDist = Math.max(1.5, speed * 0.8);
  let d = 0;
  for (let j = i; j < path.length - 1; j++) {
    const p0 = path[j];
    const p1 = path[j + 1];
    const step = Math.hypot(p1.x - p0.x, p1.z - p0.z);
    if (step < 1e-6) continue;
    if (d + step >= lookAheadDist) {
      const t = (lookAheadDist - d) / step;
      const dx = p1.x - p0.x;
      const dz = p1.z - p0.z;
      const tangentAngle = Math.atan2(dx, dz);
      return {
        point: {
          x: p0.x + dx * t,
          z: p0.z + dz * t
        },
        tangentAngle
      };
    }
    d += step;
  }
  const last = path[path.length - 1];
  const prev = path[path.length - 2] || last;
  const dx = last.x - prev.x;
  const dz = last.z - prev.z;
  const tangentAngle = Math.abs(dx) + Math.abs(dz) < 1e-6 ? 0 : Math.atan2(dx, dz);
  return { point: { x: last.x, z: last.z }, tangentAngle };
}

/**
 * Blended desired heading: chase point when far, align to path tangent when near (avoids drift).
 * @param {{ x: number, z: number }} vehicleOrSegmentStart position
 * @param {{ point: { x: number, z: number }, tangentAngle?: number }} target from getLookAheadTarget
 * @returns {number} desired heading in radians (same convention as atan2(dx, dz))
 */
export function getDesiredRotation(vehicleOrSegmentStart, target) {
  if (!target || !target.point) return 0;
  const angleToPoint = Math.atan2(
    target.point.x - vehicleOrSegmentStart.x,
    target.point.z - vehicleOrSegmentStart.z
  );
  const angleOfPath = typeof target.tangentAngle === 'number' ? target.tangentAngle : angleToPoint;
  const dist = Math.hypot(
    target.point.x - vehicleOrSegmentStart.x,
    target.point.z - vehicleOrSegmentStart.z
  );
  const blendDist = STEERING_CONFIG.tangentBlendDist ?? 3.0;
  const weight = Math.min(1, dist / blendDist);
  return angleToPoint * weight + angleOfPath * (1 - weight);
}

/**
 * Minimum turn duration for a given heading change (avoids instant snap).
 * @param {number} headingChange radians
 * @returns {number} duration in seconds
 */
export function getMinTurnDurationForForce(headingChange) {
  const abs = Math.abs(headingChange);
  if (abs < 0.02) return 0;
  return Math.min(0.4, abs * 2);
}

/**
 * Estimate curvature at segment i (inverse of radius).
 * @param {Array<{x:number,z:number}>} path
 * @param {number} i segment index
 * @returns {number} curvature (1/m), 0 if straight
 */
export function estimateCurvature(path, i) {
  if (!path || path.length < 3 || i <= 0 || i >= path.length - 1) return 0;
  const a = path[i - 1];
  const b = path[i];
  const c = path[i + 1];
  const ab = Math.hypot(b.x - a.x, b.z - a.z);
  const bc = Math.hypot(c.x - b.x, c.z - b.z);
  if (ab < 1e-6 || bc < 1e-6) return 0;
  const ux = (b.x - a.x) / ab;
  const uz = (b.z - a.z) / ab;
  const vx = (c.x - b.x) / bc;
  const vz = (c.z - b.z) / bc;
  const cross = ux * vz - uz * vx;
  const dot = ux * vx + uz * vz;
  const angle = Math.atan2(Math.abs(cross), Math.max(0.001, dot));
  const chord = Math.hypot(c.x - a.x, c.z - a.z) || 1;
  const radius = chord / (2 * Math.sin(angle));
  if (!Number.isFinite(radius) || radius > 1e4) return 0;
  return 1 / radius;
}

/**
 * Reduce speed in curves (curvature-based slowdown).
 * @param {number} speed base speed m/s
 * @param {number} curvature 1/m
 * @returns {number} effective speed
 */
export function getSpeedForCurvature(speed, curvature) {
  if (curvature <= 0) return speed;
  const radius = 1 / curvature;
  const minFactor = 0.25;
  const factor = Math.min(1, Math.max(minFactor, radius / 8));
  return speed * factor;
}
