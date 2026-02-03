/**
 * Navigation System: Global Planning + Local Collision Avoidance + Control
 *
 * Architecture:
 * - Global: A* on grid/topology (provided by pathfinding.js, topology.js)
 * - Local: ORCA (Optimal Reciprocal Collision Avoidance)
 * - Control: Differential drive (robots), Ackermann (cars)
 *
 * Agents perceive each other via shared AgentRegistry; no deep learning.
 */

// =============================================================================
// DATA STRUCTURES
// =============================================================================

/** Agent type: kinematic model */
export const AgentType = Object.freeze({ Robot: 'robot', Car: 'car' });

/**
 * Full state of a navigation agent (2D ground plane).
 * Used by ORCA and control layer.
 */
export class AgentState {
  constructor(config) {
    this.id = config.id;
    this.type = config.type ?? AgentType.Robot;

    // Pose (world frame)
    this.x = config.x ?? 0;
    this.z = config.z ?? 0;
    this.theta = config.theta ?? 0; // rad, 0 = +Z

    // Velocity (world frame)
    this.vx = config.vx ?? 0;
    this.vz = config.vz ?? 0;
    this.omega = config.omega ?? 0;

    // Kinematic limits
    this.maxSpeed = config.maxSpeed ?? 2.0;
    this.maxAngularSpeed = config.maxAngularSpeed ?? Math.PI; // rad/s, robots
    this.maxSteeringAngle = config.maxSteeringAngle ?? Math.PI / 6; // rad, cars
    this.wheelbase = config.wheelbase ?? 1.0; // cars
    this.trackWidth = config.trackWidth ?? 0.5; // robots (for differential)

    // Collision geometry: circumscribed radius
    this.radius = config.radius ?? 0.6;

    // Goal and path (from global planner)
    this.goal = config.goal ?? null;
    this.currentPath = config.currentPath ?? [];
  }

  /** Preferred velocity toward next waypoint */
  getPreferredVelocity(dt, pathIndex = 0) {
    const path = this.currentPath;
    if (!path || path.length === 0) return { vx: 0, vz: 0 };

    const next = path[Math.min(pathIndex, path.length - 1)];
    const dx = next.x - this.x;
    const dz = next.z - this.z;
    const d = Math.hypot(dx, dz);
    if (d < 1e-4) return { vx: 0, vz: 0 };

    const speed = Math.min(this.maxSpeed, d / Math.max(dt, 0.05));
    return {
      vx: (dx / d) * speed,
      vz: (dz / d) * speed
    };
  }

  /** Copy state for read-only use (avoids mutation during parallel ORCA) */
  snapshot() {
    return new AgentState({
      id: this.id,
      type: this.type,
      x: this.x,
      z: this.z,
      theta: this.theta,
      vx: this.vx,
      vz: this.vz,
      omega: this.omega,
      maxSpeed: this.maxSpeed,
      maxAngularSpeed: this.maxAngularSpeed,
      maxSteeringAngle: this.maxSteeringAngle,
      wheelbase: this.wheelbase,
      trackWidth: this.trackWidth,
      radius: this.radius,
      goal: this.goal ? { ...this.goal } : null,
      currentPath: this.currentPath ? [...this.currentPath] : []
    });
  }
}

/**
 * Registry of all agents + static obstacles. Single source of truth for perception.
 */
export class AgentRegistry {
  constructor() {
    this.agents = new Map();
    this.staticObstacles = [];
  }

  register(agent) {
    this.agents.set(agent.id, agent);
  }

  unregister(id) {
    this.agents.delete(id);
  }

  get(id) {
    return this.agents.get(id);
  }

  /**
   * Add static obstacle as point (treated as stationary agent with v=0).
   * @param {{ x: number, z: number, radius: number, id?: string }} obstacle
   */
  addStaticObstacle(obstacle) {
    this.staticObstacles.push({
      x: obstacle.x,
      z: obstacle.z,
      radius: obstacle.radius ?? 0.5,
      vx: 0,
      vz: 0,
      id: obstacle.id ?? `static_${this.staticObstacles.length}`
    });
  }

  /**
   * Add AABB obstacle (samples boundary points as static obstacles for ORCA).
   * @param {{ minX: number, maxX: number, minZ: number, maxZ: number, id?: string }} aabb
   * @param {number} sampleSpacing - distance between sampled points on edges
   */
  addAABBObstacle(aabb, sampleSpacing = 0.5) {
    const { minX, maxX, minZ, maxZ } = aabb;
    const idBase = aabb.id ?? `aabb_${this.staticObstacles.length}`;
    let k = 0;
    for (let x = minX; x <= maxX; x += sampleSpacing) {
      this.staticObstacles.push({ x, z: minZ, radius: sampleSpacing / 2, vx: 0, vz: 0, id: `${idBase}_${k++}` });
      this.staticObstacles.push({ x, z: maxZ, radius: sampleSpacing / 2, vx: 0, vz: 0, id: `${idBase}_${k++}` });
    }
    for (let z = minZ; z <= maxZ; z += sampleSpacing) {
      this.staticObstacles.push({ x: minX, z, radius: sampleSpacing / 2, vx: 0, vz: 0, id: `${idBase}_${k++}` });
      this.staticObstacles.push({ x: maxX, z, radius: sampleSpacing / 2, vx: 0, vz: 0, id: `${idBase}_${k++}` });
    }
  }

  /** All agents + static obstacles except excludeId, within radius of (x,z) */
  getNeighbors(x, z, radius, excludeId = null) {
    const out = [];
    for (const a of this.agents.values()) {
      if (a.id === excludeId) continue;
      const d = Math.hypot(a.x - x, a.z - z);
      if (d <= radius) out.push(a.snapshot ? a.snapshot() : { ...a });
    }
    for (const o of this.staticObstacles) {
      if (o.id === excludeId) continue;
      const d = Math.hypot(o.x - x, o.z - z);
      if (d <= radius) out.push({ ...o });
    }
    return out;
  }

  all() {
    return Array.from(this.agents.values());
  }
}

// =============================================================================
// ORCA (Optimal Reciprocal Collision Avoidance)
// =============================================================================

const ORCA_TAU = 2.0; // time horizon (s)
const ORCA_PERCEPTION_RADIUS = 12.0;

/**
 * Compute ORCA half-plane for agent A with respect to agent B.
 * Returns { nx, nz, b } such that safe velocities satisfy: nx*vx + nz*vz >= b
 * (i.e. v must lie in the safe half-plane).
 * Ref: van den Berg et al., "Reciprocal n-Body Collision Avoidance"
 */
function orcaHalfPlane(ax, az, avx, avz, ar, bx, bz, bvx, bvz, br, tau) {
  const px = bx - ax;
  const pz = bz - az;
  const pLen = Math.hypot(px, pz);
  const r = ar + br;

  if (pLen < 1e-6) {
    return { nx: 1, nz: 0, b: avx + 1e6 };
  }

  const vRelX = avx - bvx;
  const vRelZ = avz - bvz;
  const wX = vRelX - px / tau;
  const wZ = vRelZ - pz / tau;
  const wLen = Math.hypot(wX, wZ);

  let uX = 0;
  let uZ = 0;

  if (pLen < r) {
    uX = ((r - pLen) / pLen) * px / tau;
    uZ = ((r - pLen) / pLen) * pz / tau;
  } else if (wLen > 1e-6) {
    const dot = px * wX + pz * wZ;
    const cross = px * wZ - pz * wX;
    const rSq = r * r;
    if (dot < 0 && dot * dot > rSq * wLen * wLen) {
      const rad = Math.sqrt(wLen * wLen - rSq);
      const k = (dot - rad) / (wLen * wLen);
      const legX = px - k * wX;
      const legZ = pz - k * wZ;
      const legLen = Math.hypot(legX, legZ);
      if (legLen > 1e-6) {
        uX = (legX / legLen) * (r / tau) - vRelX;
        uZ = (legZ / legLen) * (r / tau) - vRelZ;
      }
    }
  }

  const nx = px / pLen;
  const nz = pz / pLen;
  const b = (avx + 0.5 * uX) * nx + (avz + 0.5 * uZ) * nz;
  return { nx, nz, b };
}

/**
 * Linear program: find v minimizing |v - vPref| subject to half-planes (n·v >= b) and |v| <= maxSpeed.
 * Uses sequential projection: if n·v < b, project v onto boundary n·v = b.
 */
function linearProgram2(halfPlanes, vPrefX, vPrefZ, maxSpeed) {
  let vx = vPrefX;
  let vz = vPrefZ;

  for (const { nx, nz, b } of halfPlanes) {
    const val = nx * vx + nz * vz;
    if (val >= b - 1e-6) continue;
    const violation = b - val;
    vx += violation * nx;
    vz += violation * nz;
  }

  const speed = Math.hypot(vx, vz);
  if (speed > maxSpeed && speed > 1e-6) {
    const scale = maxSpeed / speed;
    vx *= scale;
    vz *= scale;
  }
  return { vx, vz };
}

/**
 * Compute collision-free velocity using ORCA.
 *
 * @param {AgentState} agent - Current agent state (will use snapshot internally)
 * @param {AgentState[]} neighbors - Other agents within perception radius
 * @param {number} dt - Timestep (s)
 * @returns {{ vx: number, vz: number }} Safe velocity in world frame
 */
export function computeORCAVelocity(agent, neighbors, dt) {
  const pref = agent.getPreferredVelocity(dt);
  const halfPlanes = [];

  for (const other of neighbors) {
    const hp = orcaHalfPlane(
      agent.x, agent.z, agent.vx, agent.vz, agent.radius,
      other.x, other.z, other.vx, other.vz, other.radius,
      ORCA_TAU
    );
    halfPlanes.push(hp);
  }

  return linearProgram2(halfPlanes, pref.vx, pref.vz, agent.maxSpeed);
}

// =============================================================================
// KINEMATIC MODELS
// =============================================================================

/**
 * Differential drive: convert (vx, vz) world velocity to (v, omega) and integrate.
 */
export function differentialDriveStep(agent, vx, vz, dt) {
  const cosT = Math.cos(agent.theta);
  const sinT = Math.sin(agent.theta);
  const vForward = vx * sinT + vz * cosT;
  const vLateral = vx * cosT - vz * sinT;
  let omega = -vLateral / (agent.trackWidth / 2);
  omega = Math.max(-agent.maxAngularSpeed, Math.min(agent.maxAngularSpeed, omega));

  agent.x += vx * dt;
  agent.z += vz * dt;
  agent.theta += omega * dt;
  agent.vx = vx;
  agent.vz = vz;
  agent.omega = omega;
}

/**
 * Ackermann: convert (vx, vz) world velocity to (v, delta) and integrate.
 */
export function ackermannStep(agent, vx, vz, dt) {
  const speed = Math.hypot(vx, vz);
  const cosT = Math.cos(agent.theta);
  const sinT = Math.sin(agent.theta);
  const vForward = vx * sinT + vz * cosT;
  const vLateral = vx * cosT - vz * sinT;

  let delta = Math.atan2(-vLateral * agent.wheelbase, Math.max(Math.abs(vForward), 0.1));
  delta = Math.max(-agent.maxSteeringAngle, Math.min(agent.maxSteeringAngle, delta));

  const v = Math.min(agent.maxSpeed, Math.abs(speed)) * Math.sign(vForward);
  const omega = (v * Math.tan(delta)) / agent.wheelbase;

  agent.x += v * Math.sin(agent.theta) * dt;
  agent.z += v * Math.cos(agent.theta) * dt;
  agent.theta += omega * dt;
  agent.vx = v * Math.sin(agent.theta);
  agent.vz = v * Math.cos(agent.theta);
  agent.omega = omega;
}

// =============================================================================
// NAVIGATION CONTROLLER (integrates global path + ORCA + control)
// =============================================================================

/**
 * Single timestep for one agent: preferred vel from path -> ORCA -> kinematic step.
 */
export function navigationStep(agent, registry, dt, perceptionRadius = ORCA_PERCEPTION_RADIUS) {
  const neighbors = registry.getNeighbors(agent.x, agent.z, perceptionRadius, agent.id);
  const { vx, vz } = computeORCAVelocity(agent, neighbors, dt);

  if (agent.type === AgentType.Robot) {
    differentialDriveStep(agent, vx, vz, dt);
  } else {
    ackermannStep(agent, vx, vz, dt);
  }
}

/**
 * Advance path index when agent reaches current waypoint.
 */
export function updatePathIndex(agent, waypointThreshold = 0.8) {
  const path = agent.currentPath;
  if (!path || path.length === 0) return;
  const next = path[0];
  const d = Math.hypot(next.x - agent.x, next.z - agent.z);
  if (d <= waypointThreshold) {
    agent.currentPath.shift();
  }
}

// =============================================================================
// INTEGRATION HELPERS (for use with pathfinding.js, topology.js)
// =============================================================================

/**
 * Create AgentState for a robot from position and config.
 */
export function createRobotAgent(id, x, z, theta, config = {}) {
  return new AgentState({
    id,
    type: AgentType.Robot,
    x, z, theta,
    maxSpeed: config.maxSpeed ?? 3.0,
    maxAngularSpeed: config.maxAngularSpeed ?? Math.PI,
    radius: config.radius ?? 0.5,
    trackWidth: config.trackWidth ?? 0.4,
    ...config
  });
}

/**
 * Create AgentState for a car from position and config.
 */
export function createCarAgent(id, x, z, theta, config = {}) {
  return new AgentState({
    id,
    type: AgentType.Car,
    x, z, theta,
    maxSpeed: config.maxSpeed ?? 4.0,
    maxSteeringAngle: config.maxSteeringAngle ?? Math.PI / 6,
    wheelbase: config.wheelbase ?? 2.5,
    radius: config.radius ?? 1.2,
    ...config
  });
}
