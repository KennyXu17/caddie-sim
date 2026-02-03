# Model Graph Structures

This document describes the 3D scene graph hierarchy for the charging robot and vehicle models used in the EV Charging Simulator.

---

## Charging Robot (ChargingRobot Class)

The charging robot is composed of a loaded GLB model with a programmatically added charging arm structure.

### Scene Graph Hierarchy

```
ChargingRobot
│
├── model (THREE.Group) ─────────────────── Loaded from GLB file (small_caddie.glb or puppy_robot.glb)
│   │
│   ├── [GLB Model Contents]                Original model meshes and materials
│   │
│   └── armBase (THREE.Group) ──────────── Charging arm base, attached to robot
│       │   position: (0, 0.8, 0.5)
│       │   scale.x: 0 (hidden) → 1 (extended)
│       │
│       └── upperArm (THREE.Mesh) ─────── First arm segment
│           │   geometry: BoxGeometry(1.2, 0.12, 0.12)
│           │   material: MeshStandardMaterial (white metal)
│           │   position.x: -0.4
│           │   rotation.z: animated
│           │
│           └── forearm (THREE.Mesh) ──── Second arm segment
│               │   geometry: BoxGeometry(1.0, 0.12, 0.12)
│               │   material: MeshStandardMaterial (white metal)
│               │   position.x: -0.8
│               │   rotation.z: animated
│               │
│               └── wrist (THREE.Mesh) ── Third arm segment
│                   │   geometry: BoxGeometry(0.8, 0.12, 0.12)
│                   │   material: MeshStandardMaterial (white metal)
│                   │   position.x: -0.6
│                   │   rotation.y: animated
│                   │
│                   └── chargingTip (THREE.Mesh) ── Charging connector
│                           geometry: SphereGeometry(0.1, 16, 16)
│                           material: MeshStandardMaterial (cyan, emissive)
│                           position.x: -0.4
│                           emissiveIntensity: animated (1.2 → 2.5)
```

### Robot Properties

| Property | Type | Description |
|----------|------|-------------|
| `model` | THREE.Group | The loaded 3D model |
| `id` | number | Robot identifier |
| `position` | {x, z} | Current position |
| `homePosition` | {x, z} | Starting/return position |
| `state` | string | Current state: `idle`, `navigating`, `charging`, `returning`, `selfCharging` |
| `batteryLevel` | number | 0-100, depletes by 15 per charge |
| `targetVehicle` | object | Currently assigned vehicle |
| `armBase` | THREE.Group | Root of charging arm hierarchy |
| `armParts` | object | References to `{upperArm, forearm, wrist}` |
| `chargingTip` | THREE.Mesh | The glowing charging connector |

### Arm Material Properties

```javascript
// White metal material for arm segments
{
  color: 0xffffff,
  metalness: 0.3,
  roughness: 0.3
}

// Charging tip material (cyan glow)
{
  color: 0x00ccff,
  emissive: 0x00ccff,
  emissiveIntensity: 1.2,  // Animated to 2.5 during charging
  metalness: 0.9,
  roughness: 0.2
}
```

### Robot Animation States

```
┌─────────────────────────────────────────────────────────────────┐
│                        STATE DIAGRAM                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│     ┌──────┐                                                     │
│     │ idle │◄────────────────────────────────────┐              │
│     └──┬───┘                                     │              │
│        │                                         │              │
│        │ assignRobotToVehicle()                  │              │
│        ▼                                         │              │
│  ┌────────────┐                           ┌──────┴─────┐        │
│  │ navigating │──────────────────────────►│ returning  │        │
│  └─────┬──────┘                           └────────────┘        │
│        │                                         ▲              │
│        │ arrived at vehicle                      │              │
│        ▼                                         │              │
│  ┌──────────┐                                    │              │
│  │ charging │────────────────────────────────────┘              │
│  └──────────┘        charging complete                          │
│        │                                                        │
│        │ batteryLevel < 30%                                     │
│        ▼                                                        │
│  ┌──────────────┐                                               │
│  │ selfCharging │─────────────────────────────►idle             │
│  └──────────────┘      battery = 100%                           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Vehicle (Car)

The vehicle is loaded from a GLB file with additional tracking properties.

### Scene Graph Hierarchy

```
Vehicle
│
└── car (THREE.Group) ────────────────────── Loaded from red_car.glb
    │
    ├── scale: (0.008, 0.008, 0.008)
    │
    ├── position: animated
    │   ├── Entry: (-23, 1, 5)
    │   ├── Parking: (targetParkingSpot.x, 1, -1)
    │   └── Exit: (20.5, -1, 5)
    │
    ├── rotation.y: animated
    │   ├── Initial: Math.PI (facing down)
    │   ├── Turn right: Math.PI / 2
    │   └── Exit: 0
    │
    └── [GLB Model Contents]
        └── Car meshes with materials
            ├── castShadow: true
            └── receiveShadow: true
```

### Vehicle Object Properties

| Property | Type | Description |
|----------|------|-------------|
| `model` | THREE.Group | The loaded 3D car model |
| `position` | {x, y, z} | Target parking spot position |
| `id` | number | Vehicle identifier (incremental) |
| `needsCharging` | boolean | `true` until charging complete |

### Vehicle Animation Sequence

```
ENTRY SEQUENCE
──────────────────────────────────────────────────────────────────────

1. Start Position: (-23, 1, 5)
   │
   │ duration: 4s
   ▼
2. Enter Main Road: (-23, 1, -6)
   │
   │ rotation.y: Math.PI → Math.PI/2 (turn right)
   │ duration: 1.2s
   ▼
3. Drive to Parking Spot: (targetX, 1, -6)
   │
   │ duration: 4s
   ▼
4. Turn into Spot: rotation.y → Math.PI
   │
   │ duration: 1.5s
   ▼
5. Park: (targetX, 1, -1)
   │
   │ duration: 2.2s
   ▼
6. [PARKED - Request Charging]


EXIT SEQUENCE (after 45 seconds or charging complete)
──────────────────────────────────────────────────────────────────────

1. Reverse out: (targetX, 1, -6)
   │
   │ duration: 2.2s
   ▼
2. Turn right: rotation.y → Math.PI/2
   │
   │ duration: 1.2s
   ▼
3. Drive to exit: (20.5, 1, -6)
   │
   │ duration: 5s
   ▼
4. Turn to exit: rotation.y → 0
   │
   │ duration: 0.8s
   ▼
5. Exit scene: (20.5, 1, 5)
   │
   │ duration: 3s
   ▼
6. Disappear: (20.5, -1, 5)
   │
   └── Removed from scene
```

---

## Battery Station

Battery stations are stationary objects where robots recharge.

### Scene Graph Hierarchy

```
BatteryStation
│
└── battery (THREE.Group) ─────────────────── Loaded from mid_caddie.glb
    │
    ├── scale: (2, 2, 2)
    │
    ├── position: (13, 1, -13)  // or other configured positions
    │
    └── [GLB Model Contents]
        └── Station meshes with materials
            ├── emissive: based on material.color
            ├── emissiveIntensity: 0.2
            ├── metalness: 0.1
            ├── roughness: 0.1
            ├── castShadow: true
            └── receiveShadow: true
```

### Battery Station Properties

| Property | Type | Description |
|----------|------|-------------|
| `model` | THREE.Group | The loaded 3D station model |
| `position` | {x, y, z} | Station world position |
| `available` | boolean | `true` if no robot is charging |

---

## Scene Hierarchy Overview

```
Scene (THREE.Scene)
│
├── Lights
│   ├── AmbientLight (intensity: 0.7)
│   ├── HemisphereLight (intensity: 2.0, position: 0, 50, 0)
│   └── DirectionalLight (intensity: 1.2, position: 20, 50, 20)
│
├── Environment
│   └── envMap (PMREM generated for PBR reflections)
│
├── parkingLot (Parking_fixed.glb)
│
├── batteryStations[] 
│   └── Battery station models (mid_caddie.glb)
│
├── chargingRobots[]
│   └── ChargingRobot instances
│       ├── model (small_caddie.glb)
│       └── armBase → upperArm → forearm → wrist → chargingTip
│
├── vehicles[]
│   └── Car models (red_car.glb)
│
└── Click Markers (temporary, removed after 5s)
    └── SphereGeometry markers
```

---

## Coordinate System Reference

```
        +Y (up)
         │
         │
         │
         │
         └──────────── +X (right)
        /
       /
      /
    +Z (toward camera)


Parking Lot Layout (top view, looking down -Y):

    Z
    ▲
    │
    │   ┌─────────────────────────────────────────────┐
    │   │                                             │
 +5 ┤   │  ENTRY ◄────────────────────────────────────┤ EXIT
    │   │                                             │
    │   │                                             │
  0 ┤   │  ═══════════════════════════════════════════│
    │   │         Parking Spots (-1 to -2 z)          │
    │   │                                             │
    │   │                                             │
 -6 ┤   │  ═══════════════════════════════════════════│ Main Road
    │   │                                             │
    │   │                                             │
-10 ┤   │         Robot Home Positions                │
    │   │                                             │
    │   │                                             │
-13 ┤   │         Battery Stations                    │
    │   │                                             │
    │   └─────────────────────────────────────────────┘
    │
    └────┬────┬────┬────┬────┬────┬────┬────┬────┬────►  X
       -23  -15  -10   -5    0    5   10   15   20   25
```

---

## Material Configuration Summary

| Object | Material Type | Key Properties |
|--------|--------------|----------------|
| Robot Body | From GLB | PBR with textures |
| Arm Segments | MeshStandardMaterial | white, metalness: 0.3, roughness: 0.3 |
| Charging Tip | MeshStandardMaterial | cyan, emissive, animated intensity |
| Car | From GLB | Original materials |
| Battery Station | From GLB | Enhanced emissive (0.2) |
| Parking Lot | From GLB | Shadow receive enabled |

---

## Animation Timelines (GSAP)

### Robot Charging Timeline
```
navigateTo() ──► rotate to face ──► move to position
                                          │
                                          ▼
                               chargeVehicle()
                                          │
                    ┌─────────────────────┴─────────────────────┐
                    ▼                                           ▼
              rotate to face                              extend arm
                 vehicle                                  (scale.x: 0→1)
                    │                                           │
                    └─────────────┬─────────────────────────────┘
                                  ▼
                         animate arm joints
                    (upperArm.z, forearm.z, wrist.y)
                                  │
                                  ▼
                      charging effect (tip glow)
                       emissiveIntensity: 1.2→2.5
                         (yoyo, repeat: 8)
                                  │
                                  ▼
                           retract arm
                         (scale.x: 1→0)
```

### Vehicle Parking Timeline
```
spawn at (-23, 1, 5)
        │
        ▼
  drive to (-23, 1, -6) ──► turn right ──► drive to (x, 1, -6)
                                                    │
                                                    ▼
                                          turn into spot ──► park at (x, 1, -1)
                                                                    │
                                                                    ▼
                                                          [request charging]
                                                                    │
                                                          wait 45 seconds
                                                                    │
                                                                    ▼
                                                          reverse ──► turn ──► exit
```
