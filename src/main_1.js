import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { gsap } from "gsap";

// === Scene Setup ===
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xffffff);

// === Camera ===
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 500);
camera.position.set(0, 25, 40);

// === Renderer ===
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

// === Lights ===
const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
dirLight.position.set(20, 50, 20);
dirLight.castShadow = true;
scene.add(dirLight);

// === Controls ===
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 0);
controls.update();

// === Loader ===
const loader = new GLTFLoader();

// === Load Parking Lot ===
loader.load(
  '/Parking_fixed.glb',
  (gltf) => {
    const parking = gltf.scene;
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

// === Load Batteries ===
const batteryPositions = [
  { x: 11.4, z: -13 },
  { x: 14.5, z: -13 },
];
batteryPositions.forEach((pos) => {
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
        }
      });
      scene.add(battery);
    },
    undefined,
    (err) => console.error('❌ Battery load error:', err)
  );
});

// === Load Batteries ===
const windturbinePositions = [
  { x: 17.6, z: -14.5},
  { x: 17.6-3.14*12, z: -14.5}
];
windturbinePositions.forEach((pos) => {
  loader.load(
    '/windturbine_wq.glb',
    (gltf) => {
      const wind_turbine = gltf.scene;
      wind_turbine.scale.set(10, 10, 10);
      wind_turbine.position.set(pos.x, 5, pos.z);
      wind_turbine.traverse((child) => {
        if (child.isMesh) {
          child.material.emissive = new THREE.Color(child.material.color);
          child.material.emissiveIntensity = 0.25;
          child.material.metalness = 0.5;
          child.material.roughness = 0.25;
        }
      });
      scene.add(wind_turbine);
    },
    undefined,
    (err) => console.error('❌ Wind Turbine load error:', err)
  );
});

// === Load Car + 动画路径 ===
let car;
loader.load(
  '/red_car.glb',
  (gltf) => {
    car = gltf.scene;
    car.scale.set(0.008, 0.008, 0.008);
    car.position.set(-23, 1, 5); // 从左侧驶入
    car.rotation.y = Math.PI;    // 面朝下方
    scene.add(car);
    console.log('✅ Car loaded (with animation)');

    // === 🚗 GSAP 动画 ===
    const tl = gsap.timeline({ repeat: -1, repeatDelay: 3 });

    // 1️⃣ 向下驶入停车场主道
    tl.to(car.position, { x: -23, z: -6, duration: 4, ease: "power1.inOut" });

    // 2️⃣ 左转进入中间通道
    tl.to(car.rotation, { y: Math.PI / 2, duration: 1.2, ease: "power1.inOut" });

    tl.to(car.position, { x: 14.6-3.14*4, z: -6, duration: 4, ease: "power1.inOut" });

    // 3️⃣ 转弯进入车位方向
    tl.to(car.rotation, { y: Math.PI, duration: 1.5, ease: "power1.inOut" });

    // 4️⃣ 前进进入车位
    tl.to(car.position, { x: 14.6-3.14*4, z: -1, duration: 2.2, ease: "power1.inOut" });

    // 5️⃣ 停车等待充电
    tl.to({}, { duration: 35 });

    // 6️⃣ 倒车退出车位
    tl.to(car.position, { x: 14.6-3.14*4, z: -6, duration: 2.2, ease: "power1.inOut" });

    // 7️⃣ 右转朝出口方向
    tl.to(car.rotation, { y: Math.PI / 2, duration: 1.2, ease: "power1.inOut" });

    // 8️⃣ 离开停车场
    tl.to(car.position, { x: 20.5, z: -6, duration: 5, ease: "power1.inOut" });

    // 9️⃣ 稍微右转并离开场景
    tl.to(car.rotation, { y: 0, duration: 0.8, ease: "power1.inOut" });
    tl.to(car.position, { x: 20.5, z: 5, duration: 3, ease: "power1.inOut" });
  },
  undefined,
  (err) => console.error('❌ Car load error:', err)
);

// === Load Robot (出发充电动画 + 白色机械臂往左伸出) ===
let robot;
loader.load(
  '/puppy_robot.glb',
  (gltf) => {
    robot = gltf.scene;
    robot.scale.set(0.75, 0.75, 0.75);
    robot.position.set(15, 1, -10); // 初始位置在电池区
    robot.rotation.y = Math.PI;
    robot.traverse((obj) => {
      if (obj.isMesh) obj.castShadow = true;
    });
    scene.add(robot);
    console.log('✅ Robot loaded (white arm extends toward car at x=5.2)');

// === 🦾 白色机械臂结构（沿 -X 方向水平伸出） ===
const armBase = new THREE.Group();
armBase.position.set(0.9, 0.6, 1.1); // 安装在机器人右上方
robot.add(armBase);

// 材质：白色金属
const whiteMetal = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  metalness: 0.25,
  roughness: 0.25
});

// === 第一节（上臂） ===
const upperArm = new THREE.Mesh(
  new THREE.BoxGeometry(1, 0.1, 0.1),
  whiteMetal
);
upperArm.position.x = -0.5; // 延伸半截
armBase.add(upperArm);

// === 第二节（前臂） ===
const foreArm = new THREE.Mesh(
  new THREE.BoxGeometry(0.8, 0.1, 0.1),
  whiteMetal
);
foreArm.position.x = -0.9; // 紧接上臂末端
upperArm.add(foreArm);

// === 第三节（末端 + 枪头） ===
const wrist = new THREE.Mesh(
  new THREE.BoxGeometry(0.6, 0.1, 0.1),
  whiteMetal
);
wrist.position.x = -0.7; // 接在前臂末端
foreArm.add(wrist);

// === 枪头（发光蓝色球体） ===
const tip = new THREE.Mesh(
  new THREE.SphereGeometry(0.08, 16, 16),
  new THREE.MeshStandardMaterial({
    color: 0x00ccff,
    emissive: 0x00ccff,
    emissiveIntensity: 1.2,
    metalness: 1.0,
    roughness: 0.15
  })
);
tip.position.x = -0.4;
wrist.add(tip);

// === 初始状态：收回 ===
armBase.scale.x = 0; // 沿 -X 收缩
upperArm.rotation.z = 0;
foreArm.rotation.z = 0;
wrist.rotation.z = 0;

// === 动画逻辑（伸展、充电、收回）===
const tlArm = gsap.timeline();

tlArm
  // 伸出机械臂（沿 -X）
  .to(armBase.scale, { x: 1, duration: 0.6, ease: "power2.out" })
  // 微调关节角度，制造自然弯曲感
  .to(upperArm.rotation, { z: -Math.PI / 12, duration: 0.5 }, "<")
  .to(foreArm.rotation, { z: -Math.PI / 10, duration: 0.5 }, "<")
  // 枪头闪烁模拟充电
  .to(tip.material, {
    emissiveIntensity: 2.0,
    duration: 0.5,
    yoyo: true,
    repeat: 5
  })
  // 收回机械臂
  .to(foreArm.rotation, { z: 0, duration: 0.4 })
  .to(upperArm.rotation, { z: 0, duration: 0.4 })
  .to(armBase.scale, { x: 0, duration: 0.6, ease: "power1.in" });


    // 初始收起状态
    armBase.scale.x = 0;

    // === 🤖 动画逻辑 ===
    const tlRobot = gsap.timeline({ repeat: -1, repeatDelay: 3 });

    // 等待汽车进入车位
    tlRobot.to({}, { duration: 12 });

    // 从充电区出发
    tlRobot.to(robot.position, {
      x : 15,
      z: -4,
      duration: 5,
      ease: "power2.inOut"
    });

    // 转向汽车
    tlRobot.to(robot.rotation, {
      y: Math.PI / 2,
      duration: 1,
      ease: "power1.inOut"
    });

    // 前往汽车前方
    tlRobot.to(robot.position, {
      x: 14.6-3.14*4,
      z: -4,
      duration: 5,
      ease: "power2.inOut"
    });

    // === ⚡ 充电动作 ===
    tlRobot.to({}, { duration: 0.5, onStart: () => console.log('⚡ 白色机械臂往左(-X)伸出充电') });

    // 🦾 展开机械臂（往左伸）
    tlRobot.to(armBase.scale, { x: 1, duration: 0.6, ease: "power2.out" });
    tlRobot.to(upperArm.rotation, { z: Math.PI / 18, duration: 0.6, ease: "power2.out" });
    tlRobot.to(foreArm.rotation, { z: Math.PI / 24, duration: 0.6, ease: "power2.out" });
    tlRobot.to(wrist.rotation, { y: -Math.PI / 15, duration: 0.5, ease: "power2.out" });

    // 🔋 模拟充电闪烁
    tlRobot.to(tip.material, { emissiveIntensity: 2, duration: 0.5, yoyo: true, repeat: 10 });

    // 🧭 收回机械臂
    tlRobot.to(wrist.rotation, { y: 0, duration: 0.4 });
    tlRobot.to(foreArm.rotation, { z: 0, duration: 0.4 });
    tlRobot.to(upperArm.rotation, { z: 0, duration: 0.4 });
    tlRobot.to(armBase.scale, { x: 0, duration: 0.6, ease: "power1.in" });

    tlRobot.to(robot.position, {
      x: 15,
      z: -4,
      duration: 5,
      ease: "power2.inOut"
    });
    tlRobot.to(robot.rotation, {
      y: Math.PI,
      duration: 1,
      ease: "power1.inOut"
    });
    tlRobot.to(robot.position, {
      x: 15,
      z: -10,
      duration: 5,
      ease: "power2.inOut"
    });
  },
  undefined,
  (err) => console.error('❌ Robot load error:', err)
);

// === Animation Loop ===
function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}
animate();

// === Resize Handling ===
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});