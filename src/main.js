import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// === Scene Setup ===
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xffffff);

// === Camera ===
const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  500
);
camera.position.set(0, 30, 40);

// === Renderer ===
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

// === Lights ===
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1);
dirLight.position.set(20, 50, 20);
dirLight.castShadow = true;
scene.add(dirLight);

// === Controls ===
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 0);
controls.update();

// === Loader ===
const loader = new GLTFLoader();

let parking, car, robot;

// === Load Parking Lot ===
loader.load(
  '/Parking_fixed.glb',
  (gltf) => {
    parking = gltf.scene;
    parking.scale.set(1, 1, 1);
    parking.traverse((obj) => {
      if (obj.isMesh) obj.receiveShadow = true;
    });
    scene.add(parking);
    console.log('✅ Parking loaded');
  },
  undefined,
  (err) => console.error('❌ Parking load error:', err)
);

// === Load Car ===
// loader.load(
//   '/red_car.glb',
//   (gltf) => {
//     car = gltf.scene;
//     car.scale.set(0.7, 0.7, 0.7);
//     car.position.set(0, 0.2, 0);
//     car.traverse((obj) => {
//       if (obj.isMesh) obj.castShadow = true;
//     });
//     scene.add(car);
//     console.log('✅ Car loaded');
//   },
//   undefined,
//   (err) => console.error('❌ Car load error:', err)
// );

loader.load(
  "/battery_01.glb",
  (gltf) => {
    const battery = gltf.scene;

    battery.scale.set(0.1, 0.1, 0.1);
    battery.position.set(14.5, 0, 2.5);
    battery.rotation.y = 0;

    // 🧩 替换材质：亮白 + 发光效果
    battery.traverse((child) => {
      if (child.isMesh) {
        // 保留原材质，只调整亮度属性
        child.material.emissive = new THREE.Color(child.material.color); // 用原色发光
        child.material.emissiveIntensity = 2.5; // 发光强度（0~1，建议0.5~0.8）
        child.material.metalness = 0.5;  // 让表面更亮
        child.material.roughness = 0.5;  // 降低粗糙度，提升光泽感
      }
    });

    scene.add(battery);
    console.log("✅ Bright white battery loaded");
  },
  undefined,
  (err) => console.error("❌ Battery load error:", err)
);

loader.load(
  "/battery_01.glb",
  (gltf) => {
    const battery = gltf.scene;

    battery.scale.set(0.1, 0.1, 0.1);
    battery.position.set(11.4, 0, 2.5);
    battery.rotation.y = 0;

    // 🧩 替换材质：亮白 + 发光效果
    battery.traverse((child) => {
      if (child.isMesh) {
        // 保留原材质，只调整亮度属性
        child.material.emissive = new THREE.Color(child.material.color); // 用原色发光
        child.material.emissiveIntensity = 2.5; // 发光强度（0~1，建议0.5~0.8）
        child.material.metalness = 0.5;  // 让表面更亮
        child.material.roughness = 0.5;  // 降低粗糙度，提升光泽感
      }
    });

    scene.add(battery);
    console.log("✅ Bright white battery loaded");
  },
  undefined,
  (err) => console.error("❌ Battery load error:", err)
);


loader.load(
  "/red_car.glb",
  (gltf) => {
    const car = gltf.scene;
    
    // 🧩 调整车的大小
    car.scale.set(0.008, 0.008, 0.008);  // 比例缩小到原来的 1/4（可改成 0.2 或 0.1）

    // 🧩 调整车在场景中的位置
    car.position.set(2, 1.1, -0.75);      // 稍微抬高一点，避免陷入地面

    // 🧩 调整朝向
    car.rotation.y = Math.PI ;     // 让车头朝向正确（可根据你的停车位方向微调）

    scene.add(car);
    console.log("✅ Car loaded (scaled and positioned)");
  },
  undefined,
  (err) => console.error("❌ Car load error:", err)
);

// === Load Mobile Charging Robot ===
loader.load(
  '/puppy_robot.glb',
  (gltf) => {
    robot = gltf.scene;
    robot.scale.set(0.75, 0.75, 0.75);
    robot.position.set(-10, 10, -10);
    robot.traverse((obj) => {
      if (obj.isMesh) obj.castShadow = true;
    });
    scene.add(robot);
    console.log('✅ Robot loaded');
  },
  undefined,
  (err) => console.error('❌ Robot load error:', err)
);

// === Animation ===
let t = 0;
let robotTarget = 0;

const robotPoints = [
  new THREE.Vector3(-10, 0.2, -10),
  new THREE.Vector3(10, 0.2, -10),
  new THREE.Vector3(10, 0.2, 10),
  new THREE.Vector3(-10, 0.2, 10),
];

function animate() {
  requestAnimationFrame(animate);

  // 🚗 Car circular movement
  if (car) {
    t += 0.01;
    car.position.x = Math.sin(t) * 10;
    car.position.z = Math.cos(t) * 10;
    car.rotation.y = -t + Math.PI / 2;
  }

  // 🤖 Robot patrols four corners
  if (robot) {
    const target = robotPoints[robotTarget];
    robot.position.lerp(target, 0.02);

    if (robot.position.distanceTo(target) < 0.3) {
      robotTarget = (robotTarget + 1) % robotPoints.length;
    }
  }

  renderer.render(scene, camera);
}

animate();

// === Resize Handling ===
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
