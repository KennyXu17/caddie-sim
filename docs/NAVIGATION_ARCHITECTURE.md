# Parking Lot Navigation Architecture
## Multi-Agent Planning with Robots and Cars

---

## 1. System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         APPLICATION LAYER                                 │
│  (main_sim.js: spawn vehicles, assign charging tasks, high-level goals)  │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      GLOBAL PLANNER (Path Planning)                       │
│  Input: start, goal, static map, semantic regions (parking slots)        │
│  Output: waypoint path (no dynamics, no other agents)                    │
│  Algorithm: A* on grid OR topology graph (lanes + charge points)         │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│               LOCAL COLLISION AVOIDANCE (Velocity Obstacles)              │
│  Input: preferred velocity (from global path), other agents' state       │
│  Output: collision-free velocity for this timestep                       │
│  Algorithm: ORCA (Optimal Reciprocal Collision Avoidance)                │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    CONTROL (Kinematic Execution)                          │
│  Input: target velocity from ORCA                                        │
│  Output: wheel commands (Ackermann: δ, v) or (differential: v_L, v_R)   │
│  Integrates: x, z, θ over dt                                             │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    SIMULATION STEP (Physics / Rendering)                  │
│  Three.js: update model position, rotation from kinematic state          │
└─────────────────────────────────────────────────────────────────────────┘
```

**Separation of concerns:**
- **Global planner**: sees only static map; runs when goal changes (or path becomes invalid).
- **Local avoidance**: sees only nearby agents; runs every timestep (~10–20 Hz).
- **Control**: maps velocity → kinematic state; runs every timestep.

---

## 2. Data Structures

### 2.1 Map Representation

```typescript
// Static obstacle: polygon or AABB
interface StaticObstacle {
  id: string;
  type: 'polygon' | 'aabb';
  // For AABB (axis-aligned bounding box):
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  // For polygon: vertices in CCW order
  vertices?: { x: number; z: number }[];
}

// Semantic region: parking slot, no obstacle
interface ParkingSlot {
  id: number;
  center: { x: number; z: number };
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  side: 'left' | 'right';
  chargePoint: { x: number; z: number };
}

// World bounds
interface WorldBounds {
  minX: number; maxX: number;
  minZ: number; maxZ: number;
}

// Map: static obstacles + drivable check
interface NavigationMap {
  bounds: WorldBounds;
  staticObstacles: StaticObstacle[];
  parkingSlots: ParkingSlot[];
  isDrivable(x: number, z: number): boolean;
  getNearestDrivable(x: number, z: number): { x: number; z: number };
}
```

### 2.2 Agent Representation

```typescript
enum AgentType {
  Robot = 'robot',   // differential drive
  Car = 'car'       // Ackermann
}

interface AgentState {
  id: string;
  type: AgentType;
  // Pose (2D, y=0)
  x: number;
  z: number;
  theta: number;    // heading (rad), 0 = +Z
  // Velocity (body frame: forward = +localZ)
  vx: number;       // world frame
  vz: number;
  omega: number;    // angular velocity (rad/s)
  // Kinematic limits
  maxSpeed: number;
  maxAngularSpeed?: number;   // robots
  maxSteeringAngle?: number;  // cars (rad)
  wheelbase?: number;         // cars (m)
  // Geometry for collision
  radius: number;   // circumscribed circle for ORCA
  // Current goal (from global planner)
  goal: { x: number; z: number } | null;
  currentPath: { x: number; z: number }[];
}
```

### 2.3 ORCA Half-Plane

```typescript
// ORCA constraint: n · v <= b  (velocity v must lie in half-plane)
interface ORCAHalfPlane {
  nx: number;  // normal (unit)
  nz: number;
  b: number;   // offset
}
```

---

## 3. Algorithm Choices

### 3.1 Global Path Planning

| Scenario | Algorithm | Rationale |
|----------|-----------|-----------|
| Open space, arbitrary start/end | **A\*** on occupancy grid | Handles arbitrary obstacles; grid size ~0.3–0.5 m |
| Lane-structured parking (drivable corridors) | **A\*** on topology graph | Nodes = turn points + charge points; edges = drivable segments; enforces lane discipline |

**Recommendation**: Use topology graph (as in `topology.js`) for lane-following; fall back to grid A* for ad-hoc goals (e.g., parking slot entry).

**Output**: Sequence of waypoints `[w0, w1, ..., wn]`. No timing; local layer handles velocity.

### 3.2 Local Multi-Agent Collision Avoidance: ORCA

**ORCA (Optimal Reciprocal Collision Avoidance)** [van den Berg et al., 2011]:
- **Decentralized**: each agent computes its own velocity using only local neighbor info.
- **Reciprocal**: each agent assumes the other will also avoid; no explicit coordination.
- **Deterministic**: no learning, real-time.
- **Complexity**: O(n) per agent for n neighbors.

**Idea**: For each pair (A, B), compute a "velocity obstacle" (VO) — the set of A's velocities that would cause collision with B. ORCA uses the reciprocal assumption to split the avoidance: each agent chooses a velocity inside a half-plane that guarantees collision-free motion if the other does the same.

**Inputs per agent**:
- Preferred velocity `v_pref` (from global path: direction to next waypoint, clamped to max speed).
- Other agents' positions, velocities, radii.
- Static obstacles (converted to VO or separate constraints).

**Output**: Safe velocity `v_safe` that satisfies all ORCA half-planes and stays within kinematic limits.

### 3.3 Control: Kinematic Models

**Differential drive (robot)**:
```
v = (v_L + v_R) / 2
ω = (v_R - v_L) / L   (L = wheelbase / track width)
x' = v * sin(θ)
z' = v * cos(θ)
θ' = ω
```

**Ackermann (car)**:
```
δ = steering angle (front wheels)
v = speed
x' = v * sin(θ)
z' = v * cos(θ)
θ' = v * tan(δ) / L   (L = wheelbase)
```
Constraints: |δ| ≤ δ_max, |v| ≤ v_max.

**Velocity → Commands**:
- Robot: `v, ω` → `v_L = v - ω*L/2`, `v_R = v + ω*L/2`.
- Car: `v, ω` → `δ = atan2(ω*L, v)` (clamped), same `v`.

---

## 4. Agent Perception and Trajectory Update

### 4.1 Perception Model (Idealized for Simulation)

In simulation, we assume **perfect state knowledge** of nearby agents (no sensor noise):
- Position, velocity, radius of all agents within perception radius (e.g., 15 m).
- Static obstacle polygons from the map.

In a real system, this would be replaced by sensor fusion (LiDAR, cameras, V2X).

### 4.2 Update Loop (Per Timestep)

```
For each agent A:
  1. GLOBAL (async, when needed):
     - If goal changed or path invalid: run A* / topology planner.
     - Set currentPath = new waypoints.

  2. PREFERRED VELOCITY:
     - If currentPath not empty: v_pref = toward(next_waypoint), |v_pref| = min(maxSpeed, dist/dt).
     - Else: v_pref = 0.

  3. ORCA (every step):
     - Neighbors = agents within radius R (e.g., 10 m).
     - For each neighbor B: compute ORCA half-plane for (A, B).
     - For each static obstacle: add half-planes (or use RVO2 for obstacles).
     - Solve: v_safe = argmin |v - v_pref| s.t. v in ∩ half-planes, |v| ≤ maxSpeed.

  4. CONTROL:
     - Apply kinematic model: (x, z, θ) += integrate(v_safe, dt).

  5. PATH TRACKING:
     - If reached next_waypoint (within threshold): advance to next.
     - If path empty and at goal: done.
```

### 4.3 Path Invalidation

Replan when:
- Goal changes.
- Blocked for > T seconds (e.g., 3 s) without progress.
- Static map changes (rare).

Do **not** replan on every dynamic obstacle; ORCA handles those locally.

---

## 5. Pseudocode: ORCA Core

```
function orcaVelocity(agent A, neighbors [], dt, tau):
  V_pref = preferredVelocity(A)
  halfPlanes = []

  for each B in neighbors:
    if B.id == A.id: continue
    dp = (B.x - A.x, B.z - A.z)
    dv = (B.vx - A.vx, B.vz - A.vz)
    r = A.radius + B.radius
    d = |dp|

    if d < 1e-6:  // overlapping, pick arbitrary direction
      n = (1, 0)
      halfPlanes.add(ORCA(dp, dv, r, tau, n))
      continue

    // Time to collision
    w = dv - (dp / tau)
    wLen = |w|

    if wLen < 1e-6:  // no relative motion
      u = (r - d) / tau * (dp / d)
    else:
      if dot(w, dp) < 0 and |w × dp| < r * |w|:
        // Collision course: project onto VO boundary
        theta = atan2(w[1], w[0]) - asin(r / |w|)
        u = (cos(theta), sin(theta)) * |w| - w
      else:
        u = (0, 0)  // already safe

    // ORCA: A takes half, B takes half
    n = normalize(dp / d)
    halfPlanes.add({ n, b: dot(A.v + 0.5*u, n) })

  v_safe = linearProgram2(halfPlanes, V_pref, A.maxSpeed)
  return v_safe
```

`linearProgram2`: find `v` minimizing `|v - V_pref|` subject to `n·v ≤ b` for all half-planes and `|v| ≤ maxSpeed`. Can be done with quadratic programming or sequential linear programs (see RVO2 library).

---

## 6. Static Obstacle Handling

**Option A – Inflate and treat as agents**: Inflate obstacles by agent radius; add "virtual" agents with zero velocity at obstacle boundaries. Use same ORCA.

**Option B – Explicit obstacle half-planes**: For each obstacle edge visible to the agent, add a half-plane constraint (similar to VO for a static point).

**Option C – Obstacle-aware A***: Global planner avoids obstacles; ORCA only handles dynamic agents. Simpler but can fail in narrow passages if a car blocks the lane.

**Recommendation**: Use Option A (inflate + virtual static agents) for convex obstacles; Option C for initial implementation, with path invalidation when blocked.

---

## 7. Integration with Existing Codebase

| Component | Current | Proposed |
|-----------|---------|----------|
| Global planner | `pathfinding.js` (A* grid), `topology.js` (graph) | Keep both; add path invalidation |
| Occupancy | `collisionAvoidance.occupiedPositions` (point positions) | Replace with `AgentState[]` + ORCA |
| Robot motion | GSAP timeline along path | Replace with: preferred vel from path → ORCA → kinematic step |
| Car motion | GSAP timeline | Same: ORCA + Ackermann control |
| Perception | Implicit (all agents known) | Explicit `getNeighbors(agent, radius)` |

---

## 8. Scalability

- **ORCA per agent**: O(k) where k = neighbors within radius. Typical k < 20.
- **Global A***: O(n log n) for n grid cells; run only on goal change.
- **Topology A***: O(E log V); very fast for small graphs.
- **Suggested timestep**: 50–100 ms (10–20 Hz) for local avoidance.
- **Suggested perception radius**: 10–15 m.

---

## 9. Integration Example (with nav_system.js)

The `nav_system.js` module provides:
- `AgentState`, `AgentRegistry` – data structures
- `computeORCAVelocity`, `navigationStep` – local avoidance
- `differentialDriveStep`, `ackermannStep` – kinematic control
- `createRobotAgent`, `createCarAgent` – factory helpers

**Wiring with existing pathfinding:**

```javascript
import { pathfinder } from './pathfinding.js';
import { findPathTopo } from './topology.js';
import {
  AgentRegistry,
  AgentState,
  AgentType,
  createRobotAgent,
  createCarAgent,
  navigationStep,
  updatePathIndex
} from './nav_system.js';

const registry = new AgentRegistry();
const NAV_DT = 0.05;  // 20 Hz

// 1. Create agents (sync with Three.js models)
const robot = createRobotAgent('robot_1', x, z, theta, { radius: 0.5 });
robot.currentPath = pathfinder.findPath(
  { x: robot.x, z: robot.z },
  { x: goal.x, z: goal.z },
  registry.getNeighbors(robot.x, robot.z, 15, robot.id)
);
registry.register(robot);

// 2. Each simulation tick (e.g. in requestAnimationFrame):
function tick(dt) {
  for (const agent of registry.all()) {
    updatePathIndex(agent);
    if (agent.currentPath.length === 0 && agent.goal) {
      agent.currentPath = pathfinder.findPath(...);  // Replan if needed
    }
    navigationStep(agent, registry, dt);
    syncModelToAgent(agent);  // agent.x,z,theta -> Three.js model
  }
}
```

**Key points:**
- Global path comes from `pathfinder.findPath()` or `findPathTopo()`.
- `AgentRegistry` is the single source of truth; both robots and cars must be registered.
- `navigationStep` runs ORCA + kinematic integration; no GSAP needed.
- Sync `AgentState` ↔ Three.js model position/rotation each frame.

---

## 10. References

1. van den Berg, J., Lin, M., Manocha, D. (2011). **Reciprocal n-Body Collision Avoidance**. Robotics Research.
2. Snape, J., van den Berg, J., Guy, S.J., Manocha, D. (2011). **The Hybrid Reciprocal Velocity Obstacle**. IEEE TRO.
3. RVO2 Library: https://github.com/snape/RVO2
