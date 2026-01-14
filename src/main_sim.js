import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { gsap } from "gsap";

// === UI Setup ===
if (!document.getElementById('main-title')) {
  const titleDiv = document.createElement('div');
  titleDiv.id = 'main-title';
  titleDiv.textContent = 'EV Charging Robot Simulator';
  titleDiv.style.position = 'fixed';
  titleDiv.style.top = '16px';
  titleDiv.style.left = '50%';
  titleDiv.style.transform = 'translateX(-50%)';
  titleDiv.style.fontSize = '2.2rem';
  titleDiv.style.fontWeight = 'bold';
  titleDiv.style.color = '#0078ff';
  titleDiv.style.background = 'rgba(255,255,255,0.92)';
  titleDiv.style.padding = '10px 36px';
  titleDiv.style.borderRadius = '12px';
  titleDiv.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)';
  titleDiv.style.zIndex = '10000';
  titleDiv.style.fontFamily = 'sans-serif';
  document.body.appendChild(titleDiv);
}

// === Console UI ===
if (!document.getElementById('comment-container')) {
  const commentDiv = document.createElement('div');
  commentDiv.id = 'comment-container';
  commentDiv.style.position = 'fixed';
  commentDiv.style.top = '60px';
  commentDiv.style.right = '60px';
  commentDiv.style.width = '280px';
  commentDiv.style.maxHeight = '60vh';
  commentDiv.style.overflowY = 'auto';
  commentDiv.style.background = 'rgba(255,255,255,0.95)';
  commentDiv.style.border = '1px solid #e0e0e0';
  commentDiv.style.borderRadius = '8px';
  commentDiv.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)';
  commentDiv.style.padding = '16px';
  commentDiv.style.zIndex = '9999';
  commentDiv.style.fontFamily = 'sans-serif';
  commentDiv.innerHTML = '<div style="font-weight:bold;font-size:18px;margin-bottom:10px;color:#0078ff;">Console</div>';
  document.body.appendChild(commentDiv);
}

function addComment(msg) {
  const comment = document.createElement('div');
  comment.textContent = msg;
  comment.style.margin = '6px 0';
  comment.style.fontSize = '14px';
  comment.style.color = '#222';
  comment.style.background = '#f5f7fa';
  comment.style.borderRadius = '4px';
  comment.style.padding = '6px 10px';
  document.getElementById('comment-container').appendChild(comment);
  const container = document.getElementById('comment-container');
  container.scrollTop = container.scrollHeight;
}

const oldLog = console.log;
console.log = function (...args) {
  oldLog.apply(console, args);
  addComment(args.join(' '));
};

// === Scene Setup ===
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf0f0f0);

// === Camera ===
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 500);
camera.position.set(0, 25, 45);

// === Renderer ===
const renderer = new THREE.WebGLRenderer({ antialias: true });
const scale = 2;
renderer.setSize(window.innerWidth * scale, window.innerHeight * scale, false);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);
renderer.domElement.style.width = window.innerWidth + 'px';
renderer.domElement.style.height = window.innerHeight + 'px';

// === Lights ===
const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
dirLight.position.set(20, 50, 20);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 2048;
dirLight.shadow.mapSize.height = 2048;
dirLight.shadow.camera.near = 0.5;
dirLight.shadow.camera.far = 500;
dirLight.shadow.camera.left = -50;
dirLight.shadow.camera.right = 50;
dirLight.shadow.camera.top = 50;
dirLight.shadow.camera.bottom = -50;
scene.add(dirLight);

// === Controls ===
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 0);
controls.update();

// === Loader ===
const loader = new GLTFLoader();

// === Global State ===
const vehicles = [];
const chargingRobots = [];
const batteryStations = [];
let parkingLot = null;

// === Charging Robot Class ===
class ChargingRobot {
  constructor(model, position, id) {
    this.model = model;
    this.id = id;
    this.position = position;
    this.targetVehicle = null;
    this.state = 'idle'; // idle, navigating, charging, returning, selfCharging
    this.batteryLevel = 100; // 0-100
    this.timeline = null;
    this.armBase = null;
    this.armParts = null;
    this.chargingTip = null;
    this.homePosition = { ...position };
    this.setupArm();
  }

  setupArm() {
    // Create charging arm structure
    this.armBase = new THREE.Group();
    this.armBase.position.set(0, 0.8, 0.5);
    this.model.add(this.armBase);

    const whiteMetal = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0.3,
      roughness: 0.3
    });

    // Upper arm
    const upperArm = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 0.12, 0.12),
      whiteMetal
    );
    upperArm.position.x = -0.4;
    upperArm.castShadow = true;
    this.armBase.add(upperArm);

    // Forearm
    const forearm = new THREE.Mesh(
      new THREE.BoxGeometry(1.0, 0.12, 0.12),
      whiteMetal
    );
    forearm.position.x = -0.8;
    forearm.castShadow = true;
    upperArm.add(forearm);

    // Wrist
    const wrist = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 0.12, 0.12),
      whiteMetal
    );
    wrist.position.x = -0.6;
    wrist.castShadow = true;
    forearm.add(wrist);

    // Charging tip
    this.chargingTip = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 16, 16),
      new THREE.MeshStandardMaterial({
        color: 0x00ccff,
        emissive: 0x00ccff,
        emissiveIntensity: 1.2,
        metalness: 0.9,
        roughness: 0.2
      })
    );
    this.chargingTip.position.x = -0.4;
    this.chargingTip.castShadow = true;
    wrist.add(this.chargingTip);

    this.armParts = { upperArm, forearm, wrist };

    // Initially hidden
    this.armBase.scale.x = 0;
  }

  navigateTo(targetPosition, onComplete) {
    this.state = 'navigating';
    const currentPos = this.model.position;
    const distance = Math.sqrt(
      Math.pow(targetPosition.x - currentPos.x, 2) +
      Math.pow(targetPosition.z - currentPos.z, 2)
    );
    const duration = Math.max(2, distance * 0.3);

    // Calculate rotation to face target
    const angle = Math.atan2(
      targetPosition.x - currentPos.x,
      targetPosition.z - currentPos.z
    );

    const tl = gsap.timeline({
      onComplete: () => {
        if (onComplete) onComplete();
      }
    });

    // Rotate to face target
    tl.to(this.model.rotation, {
      y: angle,
      duration: 0.8,
      ease: "power1.inOut"
    });

    // Move to target
    tl.to(this.model.position, {
      x: targetPosition.x,
      z: targetPosition.z,
      duration: duration,
      ease: "power2.inOut"
    });

    return tl;
  }

  chargeVehicle(vehicle, onComplete) {
    this.state = 'charging';
    this.targetVehicle = vehicle;
    const vehiclePos = vehicle.position;

    // Navigate to charging position (beside vehicle)
    const chargingPos = {
      x: vehiclePos.x + 1.5,
      z: vehiclePos.z,
      y: vehiclePos.y
    };

    const navTl = this.navigateTo(chargingPos, () => {
      // After navigation, start charging sequence
      const chargeTl = gsap.timeline({
        onComplete: () => {
          this.state = 'idle';
          this.targetVehicle = null;
          if (onComplete) onComplete();
        }
      });

      // Rotate to face vehicle
      chargeTl.to(this.model.rotation, {
        y: Math.PI / 2,
        duration: 0.8,
        ease: "power1.inOut"
      });

      // Extend arm
      chargeTl.to({}, { duration: 0.5, onStart: () => console.log(`🤖 Robot${this.id} extending charging arm`) });

      chargeTl.to(this.armBase.scale, { x: 1, duration: 0.6, ease: "power2.out" });
      chargeTl.to(this.armParts.upperArm.rotation, { z: Math.PI / 18, duration: 0.6, ease: "power2.out" }, "<");
      chargeTl.to(this.armParts.forearm.rotation, { z: Math.PI / 24, duration: 0.6, ease: "power2.out" }, "<");
      chargeTl.to(this.armParts.wrist.rotation, { y: -Math.PI / 15, duration: 0.5, ease: "power2.out" }, "<");

      // Charging effect
      chargeTl.to({}, { duration: 0.5, onStart: () => console.log(`🔋 Robot${this.id} charging vehicle...`) });
      chargeTl.to(this.chargingTip.material, {
        emissiveIntensity: 2.5,
        duration: 0.5,
        yoyo: true,
        repeat: 8
      });

      // Retract arm
      chargeTl.to({}, { duration: 0.5, onStart: () => console.log(`✅ Robot${this.id} charging complete`) });
      chargeTl.to(this.armParts.wrist.rotation, { y: 0, duration: 0.4 });
      chargeTl.to(this.armParts.forearm.rotation, { z: 0, duration: 0.4 });
      chargeTl.to(this.armParts.upperArm.rotation, { z: 0, duration: 0.4 });
      chargeTl.to(this.armBase.scale, { x: 0, duration: 0.6, ease: "power1.in" });

      // Consume battery
      this.batteryLevel = Math.max(0, this.batteryLevel - 15);
    });

    return navTl;
  }

  selfCharge(batteryStation, onComplete) {
    this.state = 'selfCharging';
    const stationPos = batteryStation.position;

    // Navigate to charging station
    const chargingPos = {
      x: stationPos.x,
      z: stationPos.z + 0.5,
      y: stationPos.y
    };

    const navTl = this.navigateTo(chargingPos, () => {
      // After navigation, start self-charging sequence
      const chargeTl = gsap.timeline({
        onComplete: () => {
          this.state = 'idle';
          this.batteryLevel = 100;
          if (onComplete) onComplete();
        }
      });

      // Rotate to face station
      chargeTl.to(this.model.rotation, {
        y: Math.PI,
        duration: 0.8,
        ease: "power1.inOut"
      });

      // Self-charging animation
      chargeTl.to({}, { duration: 0.5, onStart: () => console.log(`🔌 Robot${this.id} self-charging at station...`) });

      // Visual effect - arm extends backward to connect
      chargeTl.to(this.armBase.scale, { x: 1, duration: 0.6, ease: "power2.out" });
      chargeTl.to(this.armParts.upperArm.rotation, { z: -Math.PI / 12, duration: 0.6, ease: "power2.out" }, "<");

      // Charging effect
      chargeTl.to(this.chargingTip.material, {
        emissiveIntensity: 2.0,
        duration: 0.3,
        yoyo: true,
        repeat: 15
      });

      // Retract
      chargeTl.to({}, { duration: 0.5, onStart: () => console.log(`✅ Robot${this.id} self-charging complete`) });
      chargeTl.to(this.armParts.upperArm.rotation, { z: 0, duration: 0.4 });
      chargeTl.to(this.armBase.scale, { x: 0, duration: 0.6, ease: "power1.in" });
    });

    return navTl;
  }

  returnHome(onComplete) {
    this.state = 'returning';
    const tl = gsap.timeline({
      onComplete: () => {
        this.state = 'idle';
        if (onComplete) onComplete();
      }
    });

    tl.call(() => {
      this.navigateTo(this.homePosition, null);
    });

    tl.to({}, { duration: 3 }); // Wait for navigation

    // Rotate to home orientation
    tl.to(this.model.rotation, {
      y: Math.PI,
      duration: 0.8,
      ease: "power1.inOut"
    });

    return tl;
  }

  needsRecharge() {
    return this.batteryLevel < 30;
  }
}

// === Load Parking Lot ===
loader.load(
  '/Parking_fixed.glb',
  (gltf) => {
    parkingLot = gltf.scene;
    parkingLot.scale.set(1, 1, 1);
    parkingLot.traverse((obj) => {
      if (obj.isMesh) {
        obj.receiveShadow = true;
        obj.castShadow = true;
      }
    });
    scene.add(parkingLot);
    console.log('✅ Parking lot loaded');
  },
  undefined,
  (err) => console.error('❌ Parking lot load error:', err)
);

// === Load Battery Stations ===
const batteryPositions = [
  { x: 11.4, z: -13 },
  { x: 14.5, z: -13 },
];

batteryPositions.forEach((pos, idx) => {
  loader.load(
    '/battery_01.glb',
    (gltf) => {
      const battery = gltf.scene;
      battery.scale.set(0.1, 0.1, 0.1);
      battery.position.set(pos.x, 0, pos.z);
      battery.traverse((child) => {
        if (child.isMesh) {
          child.material.emissive = new THREE.Color(child.material.color);
          child.material.emissiveIntensity = 0.6;
          child.material.metalness = 0.1;
          child.material.roughness = 0.1;
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      scene.add(battery);
      batteryStations.push({ model: battery, position: pos, available: true });
      console.log(`🔋 Battery station ${idx + 1} loaded at (${pos.x}, ${pos.z})`);
    },
    undefined,
    (err) => console.error(`❌ Battery station ${idx + 1} load error:`, err)
  );
});

// === Load Charging Robots (Small Caddie) ===
const robotPositions = [
  { x: 15, z: -10 },
  { x: 12, z: -10 },
];

robotPositions.forEach((pos, idx) => {
  loader.load(
    '/small_caddie.glb',
    (gltf) => {
      const robotModel = gltf.scene;
      robotModel.scale.set(1, 1, 1);
      robotModel.position.set(pos.x, 1, pos.z);
      robotModel.rotation.y = Math.PI;
      robotModel.traverse((obj) => {
        if (obj.isMesh) {
          obj.castShadow = true;
          obj.receiveShadow = true;
          
          // Ensure materials are properly configured
          if (obj.material) {
            const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
            
            materials.forEach((material) => {
              // Force texture updates
              if (material.map) {
                material.map.needsUpdate = true;
                material.needsUpdate = true;
              }
              if (material.normalMap) material.normalMap.needsUpdate = true;
              
              // If material has no texture and appears black, give it a base color
              // This helps if textures are missing from the GLB file
              if (!material.map && material.color) {
                // Use the material's color if it exists
                material.color = material.color;
              } else if (!material.map && (!material.color || material.color.r === 0 && material.color.g === 0 && material.color.b === 0)) {
                // Fallback: apply a light gray color if no texture and color is black
                material.color = new THREE.Color(0x888888);
                console.log(`⚠️ Small caddie material has no texture, using fallback color`);
              }
              
              material.needsUpdate = true;
            });
          } else {
            // If no material at all, create a basic one
            obj.material = new THREE.MeshStandardMaterial({ color: 0x888888 });
            console.log(`⚠️ Small caddie mesh has no material, created default`);
          }
        }
      });
      scene.add(robotModel);

      const robot = new ChargingRobot(robotModel, pos, idx + 1);
      chargingRobots.push(robot);
      console.log(`🤖 Charging Robot ${idx + 1} loaded at (${pos.x}, ${pos.z})`);
    },
    undefined,
    (err) => {
      console.error(`❌ Robot ${idx + 1} load error:`, err);
      // Fallback to puppy_robot if small_caddie fails
      loader.load(
        '/puppy_robot.glb',
        (gltf) => {
          const robotModel = gltf.scene;
          robotModel.scale.set(0.75, 0.75, 0.75);
          robotModel.position.set(pos.x, 1, pos.z);
          robotModel.rotation.y = Math.PI;
          robotModel.traverse((obj) => {
            if (obj.isMesh) obj.castShadow = true;
          });
          scene.add(robotModel);

          const robot = new ChargingRobot(robotModel, pos, idx + 1);
          chargingRobots.push(robot);
          console.log(`🤖 Charging Robot ${idx + 1} loaded (fallback) at (${pos.x}, ${pos.z})`);
        }
      );
    }
  );
});

// === Load Vehicles ===
function createVehicleSequence() {
  let vehicleCounter = 0;

  function spawnVehicle() {
    vehicleCounter++;
    loader.load(
      '/red_car.glb',
      (gltf) => {
        const car = gltf.scene.clone();
        car.scale.set(0.008, 0.008, 0.008);
        car.position.set(-23, 1, 5);
        car.rotation.y = Math.PI;
        car.traverse((obj) => {
          if (obj.isMesh) {
            obj.castShadow = true;
            obj.receiveShadow = true;
          }
        });
        scene.add(car);

        const targetParkingSpot = {
          x: 5.2 + (vehicleCounter % 3) * 3.14,
          z: -1,
          y: 1
        };

        const vehicle = {
          model: car,
          position: targetParkingSpot,
          id: vehicleCounter,
          needsCharging: true
        };
        vehicles.push(vehicle);

        console.log(`🚗 Vehicle ${vehicleCounter} entering parking lot`);

        // Animate vehicle entering and parking
        const tl = gsap.timeline({
          onComplete: () => {
            console.log(`🚗 Vehicle ${vehicleCounter} parked, requesting charge`);
            assignRobotToVehicle(vehicle);
          }
        });

        // Enter parking lot
        tl.to(car.position, { x: -23, z: -6, duration: 4, ease: "power1.inOut" });
        tl.to(car.rotation, { y: Math.PI / 2, duration: 1.2, ease: "power1.inOut" });
        tl.to(car.position, { x: targetParkingSpot.x, z: -6, duration: 4, ease: "power1.inOut" });
        tl.to(car.rotation, { y: Math.PI, duration: 1.5, ease: "power1.inOut" });
        tl.to(car.position, { x: targetParkingSpot.x, z: targetParkingSpot.z, duration: 2.2, ease: "power1.inOut" });

        // After charging, vehicle leaves
        setTimeout(() => {
          const leaveTl = gsap.timeline({
            onComplete: () => {
              scene.remove(car);
              const index = vehicles.indexOf(vehicle);
              if (index > -1) vehicles.splice(index, 1);
            }
          });

          leaveTl.to(car.position, { x: targetParkingSpot.x, z: -6, duration: 2.2, ease: "power1.inOut" });
          leaveTl.to(car.rotation, { y: Math.PI / 2, duration: 1.2, ease: "power1.inOut" });
          leaveTl.to(car.position, { x: 20.5, z: -6, duration: 5, ease: "power1.inOut" });
          leaveTl.to(car.rotation, { y: 0, duration: 0.8, ease: "power1.inOut" });
          leaveTl.to(car.position, { x: 20.5, z: 5, duration: 3, ease: "power1.inOut" });
          leaveTl.to(car.position, { y: -1, duration: 0.5, ease: "power1.inOut" });
        }, 45000); // Vehicle stays for 45 seconds
      },
      undefined,
      (err) => console.error(`❌ Vehicle ${vehicleCounter} load error:`, err)
    );
  }

  // Spawn vehicles periodically
  setTimeout(() => spawnVehicle(), 5000); // First vehicle after 5 seconds
  setInterval(() => {
    if (vehicles.length < 5) { // Limit concurrent vehicles
      spawnVehicle();
    }
  }, 35000); // New vehicle every 35 seconds
}

// === Robot Assignment Logic ===
function assignRobotToVehicle(vehicle) {
  // Find available robot (not charging, not self-charging, has battery)
  let availableRobot = chargingRobots.find(
    robot => robot.state === 'idle' && robot.batteryLevel > 30
  );

  if (!availableRobot) {
    console.log('⚠️ No available robots, vehicle will wait...');
    return;
  }

  // Check if robot needs recharge first
  if (availableRobot.needsRecharge()) {
    const station = batteryStations.find(s => s.available);
    if (station) {
      station.available = false;
      availableRobot.selfCharge(station, () => {
        station.available = true;
        assignRobotToVehicle(vehicle);
      });
      return;
    }
  }

  // Charge the vehicle
  availableRobot.chargeVehicle(vehicle, () => {
    vehicle.needsCharging = false;

    // Return robot home
    availableRobot.returnHome(() => {
      // Check if robot needs recharge
      if (availableRobot.needsRecharge()) {
        const station = batteryStations.find(s => s.available);
        if (station) {
          station.available = false;
          availableRobot.selfCharge(station, () => {
            station.available = true;
          });
        }
      }
    });
  });
}

// === Start Simulation ===
setTimeout(() => {
  console.log('🚀 Starting EV charging simulation...');
  createVehicleSequence();
}, 3000); // Wait 3 seconds for models to load

// === Animation Loop ===
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
animate();

// === Resize Handling ===
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth * scale, window.innerHeight * scale, false);
  renderer.domElement.style.width = window.innerWidth + 'px';
  renderer.domElement.style.height = window.innerHeight + 'px';
});
