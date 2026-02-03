# Keypoint Graph Global Navigation

## Overview

The keypoint graph provides **centerline-following** global paths for vehicles and robots in the parking lot. It is **not** grid-based A*; it uses a topological graph of fixed waypoints with directed edges. Turning is allowed **only** at defined keypoints.

## Coordinate System

- 2D plane: **(x, z)**
- x: horizontal, z: vertical (depth)
- Vehicles move forward along connected road centerlines

## Fixed Keypoints (World Coordinates)

| Keypoint | Coordinates | Description |
|----------|-------------|-------------|
| `KP_ENTRANCE` | (-22.5, 6.5) | Parking lot entrance |
| `KP_25_44_ENTRY_TURN` | (-22.5, -6.5) | Turn from entrance to upper lane |
| `KP_25_44_LANE` | x ∈ [-22.5, 20], z = -6.5 | Upper lane (slots 25–44) |
| `KP_25_44_EXIT_TURN` | (20, -6.5) | Turn from upper lane to exit |
| `KP_1_24_ENTRY_TURN` | (-22.5, -22.5) | Turn from entrance to lower lane |
| `KP_1_24_LANE` | x ∈ [-22.5, 20], z = -22.5 | Lower lane (slots 1–24) |
| `KP_1_24_EXIT_TURN` | (20, -22.5) | Turn from lower lane to exit |
| `KP_EXIT` | (20, 6.5) | Parking lot exit |

### Robot (Caddie) Turn Points (topology.js)

| Slot Group | Left Turn | Right Turn |
|------------|-----------|------------|
| 1-14 | (-20.5, -25) | (18.5, -25) |
| 15-24 | (-20.5, -20.5) | (18.5, -20.5) |
| 25-34 | (-20.5, -9) | (18.5, -9) |
| 35-44 | (-20.5, -4) | (18.5, -4) |

Robots also use each parking spot's charge point. Navigation uses `findPathTopo` on the topology graph (no grid-based A*).

## Graph Structure

```
                    KP_ENTRANCE
                         |
            +------------+------------+
            |                         |
   KP_25_44_ENTRY_TURN        KP_1_24_ENTRY_TURN
            |                         |
      [lane 25_44]              [lane 1_24]
            |                         |
   KP_25_44_EXIT_TURN         KP_1_24_EXIT_TURN
            |                         |
            +------------+------------+
                         |
                    KP_EXIT
```

- **Nodes**: Keypoint IDs
- **Edges**: Directed, cost = Euclidean distance
- **Slot groups**: 1–24 (lower lane), 25–44 (upper lane)
- **Parking slots** are NOT part of the graph; they are accessed via their lane.

## API

### Keypoint Search

```javascript
import { searchKeypointPath, KP } from './keypoint_graph.js';

// Path from entrance to exit, using slot group 25_44
const path = searchKeypointPath(KP.ENTRANCE.id, KP.EXIT.id, { slotGroup: '25_44' });
// => [{id, x, z, type}, ...]
```

### Path Expansion (Centerline Waypoints)

```javascript
import { searchKeypointPath, expandToCenterlineWaypoints } from './keypoint_graph.js';

const keypointPath = searchKeypointPath('entrance', 'exit', { slotGroup: '1_24' });
const waypoints = expandToCenterlineWaypoints(keypointPath, 0.5);
// => [{x, z, segmentType}, ...]  (segmentType: 'lane' | 'turn')
```

### High-Level Planning

```javascript
import { planEnterPath, planExitPath, getSlotGroup } from './keypoint_graph.js';

// Enter: entrance → entry turn → lane to slot x
const enterWaypoints = planEnterPath(25, { x: -10, z: -7.75 }, 0.5);

// Exit: lane at slot x → exit turn → exit
const exitWaypoints = planExitPath(25, { x: -10, z: -7.75 }, 0.5);

// Lane merge point for slot access (local planner)
const lanePoint = getLanePointForSlot(25, { x: -10, z: -7.75 });
// => { x: -10, z: -6.5 }
```

## Local Planner Integration (DWA / MPC)

The global plan outputs an **ordered list of waypoints** along centerlines. The local planner consumes this without replanning globally.

### Data Flow

1. **Global planner** (keypoint graph): outputs `waypoints = [{x, z}, ...]`
2. **Local planner** (DWA/MPC): receives waypoints, generates velocity commands
3. **Control loop**: execute commands, update pose

### How the Local Planner Uses the Global Plan

| Component | Role |
|-----------|------|
| **Reference path** | Global waypoints define the desired centerline |
| **Look-ahead** | Local planner selects a target point (e.g., 2–5 m ahead) |
| **Lateral error** | Cross-track error = distance from current pose to nearest point on path |
| **Longitudinal** | Progress along path, not free-space position |

### No Global Replanning

- The global path is **fixed** once computed
- Dynamic obstacles (other vehicles, robots) are handled by the **local** planner:
  - DWA: modify velocity options to avoid obstacles
  - MPC: add obstacle constraints to the optimization
- Replanning is triggered only when:
  - Lane is blocked and no local solution exists
  - Goal changed (e.g., different slot)
  - Large deviation (e.g., off-road)

### Slot Access (Local Maneuver)

The global plan ends at the **lane centerline** at the slot’s x-coordinate. The local planner:

1. Stops at `getLanePointForSlot(slotIndex, slotCenter)`
2. Performs **slot-in** maneuver: turn + reverse/forward into slot
3. This is a **local** maneuver (short horizon, constrained geometry), not part of the global graph

### Implementation Sketch (DWA)

```python
def dwa_step(pose, global_waypoints, obstacles):
    # 1. Find look-ahead target on global path
    target = get_lookahead_point(pose, global_waypoints, lookahead_dist=3.0)
    
    # 2. Sample velocity space (v, omega)
    best_v, best_omega = None, None
    best_score = -inf
    
    for v, omega in sample_velocities():
        traj = simulate(pose, v, omega, dt=0.5)
        if collides(traj, obstacles):
            continue
        # Score: heading to target, clearance, speed
        score = score_trajectory(traj, target, obstacles)
        if score > best_score:
            best_score, best_v, best_omega = score, v, omega
    
    return best_v, best_omega
```

### Implementation Sketch (MPC)

```python
def mpc_step(pose, global_waypoints, obstacles):
    # Reference: interpolate global waypoints
    ref_path = interpolate(global_waypoints, spacing=0.2)
    
    # Cost: track ref_path + avoid obstacles
    def cost(x, u):
        return (cross_track_error(x, ref_path)**2 + 
                obstacle_repulsion(x, obstacles) +
                control_effort(u))
    
    # Solve
    u_opt = solve_mpc(pose, ref_path, obstacles, cost, horizon=2.0)
    return u_opt
```

## Constraints

- **No dynamic agents** in the graph
- **No arbitrary turning**; turning only at keypoints
- **Centerline following**; no free-space driving in global plan
- **Extensible**: add new lanes/keypoints by extending `KP` and `KP_EDGES`
