# EV Charging Robot Simulator

A 3D simulation demonstrating an intelligent mobile charging robot system for electric vehicles in a parking lot environment.

## Features

### 🤖 Charging Robots (Small Caddie)
- **Dynamic Navigation**: Robots automatically navigate to target vehicles using pathfinding
- **Charging Arm**: Extendable robotic arm with charging connector
- **Self-Recharging**: Robots automatically return to battery stations when battery level drops below 30%
- **Multi-Robot System**: Multiple robots can operate simultaneously

### 🚗 Vehicle Management
- **Automatic Spawning**: Vehicles enter the parking lot periodically
- **Parking**: Vehicles park in designated spots
- **Charging Requests**: Vehicles automatically request charging when parked
- **Queue Management**: System manages multiple charging requests

### 🔋 Battery Stations
- **Charging Points**: Fixed battery stations where robots recharge
- **Availability Tracking**: System tracks which stations are available
- **Visual Feedback**: Stations have visual indicators

## Technology Stack

- **Three.js**: 3D rendering and scene management
- **GSAP**: Animation and timeline management
- **Vite**: Build tool and development server
- **GLTFLoader**: 3D model loading

## Project Structure

```
caddie-sim/
├── public/
│   ├── small_caddie.glb          # Charging robot model
│   ├── red_car.glb               # Vehicle model
│   ├── Parking_fixed.glb         # Parking lot environment
│   ├── battery_01.glb            # Battery station model
│   └── textures/                 # Texture files
├── src/
│   ├── main_sim.js               # Main simulator (NEW - uses small_caddie)
│   ├── main_2.js                 # Previous version
│   ├── main_1.js                 # Previous version
│   └── main.js                   # Basic version
└── index.html                    # Entry point
```

## Getting Started

### Prerequisites
- Node.js (v14 or higher)
- npm or yarn

### Installation

1. Install dependencies:
```bash
npm install
```

2. Start development server:
```bash
npm run dev
```

3. Open browser to `http://localhost:5173`

### Build for Production

```bash
npm run build
```

## How It Works

### Robot States
- **idle**: Robot is waiting at home position
- **navigating**: Robot is moving to a target
- **charging**: Robot is charging a vehicle
- **returning**: Robot is returning to home position
- **selfCharging**: Robot is recharging at a battery station

### Workflow

1. **Vehicle Arrives**: Vehicle enters parking lot and parks in a spot
2. **Charging Request**: Vehicle requests charging
3. **Robot Assignment**: System assigns available robot to vehicle
4. **Navigation**: Robot navigates to vehicle location
5. **Charging**: Robot extends arm and charges vehicle
6. **Return**: Robot returns to home position
7. **Self-Recharge**: If battery low, robot recharges at station
8. **Vehicle Departs**: Vehicle leaves after charging completes

### Robot Battery Management

- Robots consume 15% battery per charging task
- When battery drops below 30%, robot prioritizes self-recharging
- After self-charging, battery returns to 100%

## Controls

- **Mouse Drag**: Rotate camera
- **Mouse Wheel**: Zoom in/out
- **Right Click + Drag**: Pan camera

## Customization

### Adjusting Robot Count
Edit `robotPositions` array in `main_sim.js`:
```javascript
const robotPositions = [
  { x: 15, z: -10 },
  { x: 12, z: -10 },
  // Add more positions
];
```

### Adjusting Vehicle Spawn Rate
Modify the interval in `createVehicleSequence()`:
```javascript
setInterval(() => {
  if (vehicles.length < 5) {
    spawnVehicle();
  }
}, 35000); // Change interval (milliseconds)
```

### Adjusting Battery Threshold
Modify `needsRecharge()` method in `ChargingRobot` class:
```javascript
needsRecharge() {
  return this.batteryLevel < 30; // Change threshold
}
```

## File Versions

- **main_sim.js**: Latest version with small_caddie model, dynamic navigation, and self-recharging
- **main_2.js**: Previous version with two robots and two vehicles
- **main_1.js**: Version with wind turbines
- **main.js**: Basic single robot version

## Notes

- The simulator uses the `small_caddie.glb` model for charging robots
- Falls back to `puppy_robot.glb` if small_caddie fails to load
- Console UI shows real-time events and robot status
- All animations are synchronized using GSAP timelines

## Future Enhancements

- [ ] Pathfinding algorithm for obstacle avoidance
- [ ] Multiple charging queue management
- [ ] Robot battery level visualization
- [ ] Statistics dashboard
- [ ] Different vehicle types
- [ ] Weather effects
- [ ] Day/night cycle

## License

MIT
