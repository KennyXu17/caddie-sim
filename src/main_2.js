import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { gsap } from "gsap";


// === 页面标题 ===
if (!document.getElementById('main-title')) {
  const titleDiv = document.createElement('div');
  titleDiv.id = 'main-title';
  titleDiv.textContent = '智能移动充电机器人仿真演示';
  titleDiv.style.position = 'fixed';
  titleDiv.style.top = '16px';
  titleDiv.style.left = '50%';
  titleDiv.style.transform = 'translateX(-50%)';
  titleDiv.style.fontSize = '2.2rem';
  titleDiv.style.fontWeight = 'bold';
  titleDiv.style.color = '#0078ff';
  titleDiv.style.background = 'rgba(255,255,255,0.92)';
  titleDiv.style.padding = '10px 36px 10px 36px';
  titleDiv.style.borderRadius = '12px';
  titleDiv.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)';
  titleDiv.style.zIndex = '10000';
  titleDiv.style.letterSpacing = '2px';
  titleDiv.style.fontFamily = 'sans-serif';
  document.body.appendChild(titleDiv);
}

// === 评论容器 ===
if (!document.getElementById('comment-container')) {
  const commentDiv = document.createElement('div');
  commentDiv.id = 'comment-container';
  commentDiv.style.position = 'fixed';
  commentDiv.style.top = '60px';
  commentDiv.style.right = '60px';
  commentDiv.style.width = '250px';
  commentDiv.style.maxHeight = '60vh';
  commentDiv.style.overflowY = 'auto';
  commentDiv.style.background = 'rgba(255,255,255,0.95)';
  commentDiv.style.border = '1px solid #e0e0e0';
  commentDiv.style.borderRadius = '8px 0 0 8px';
  commentDiv.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)';
  commentDiv.style.padding = '16px 12px 16px 18px';
  commentDiv.style.zIndex = '9999';
  commentDiv.style.fontFamily = 'sans-serif';
  commentDiv.innerHTML = '<div style="font-weight:bold;font-size:18px;margin-bottom:10px;color:#0078ff;">控制台</div>';
  document.body.appendChild(commentDiv);
}

function addComment(msg) {
  const comment = document.createElement('div');
  comment.textContent = msg;
  comment.style.margin = '6px 0';
  comment.style.fontSize = '15px';
  comment.style.color = '#222';
  comment.style.background = '#f5f7fa';
  comment.style.borderRadius = '4px';
  comment.style.padding = '6px 10px';
  comment.style.boxShadow = '0 1px 2px rgba(0,0,0,0.03)';
  document.getElementById('comment-container').appendChild(comment);
  // 滚动到底部
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
scene.background = new THREE.Color(0xffffff);

// === Camera ===
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 500);
camera.position.set(0, 25, 45); // 让相机更靠近停车场

// === Renderer ===
const renderer = new THREE.WebGLRenderer({ antialias: true });
const scale = 2; // 放大倍数，可根据需要调整
renderer.setSize(window.innerWidth * scale, window.innerHeight * scale, false);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);
renderer.domElement.style.width = window.innerWidth + 'px';
renderer.domElement.style.height = window.innerHeight + 'px';

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
    // console.log('✅ Parking Lot Environment loaded');
  },
  (xhr) => {
    if (xhr.loaded === xhr.total) {
      // console.log('📦 Parking_fixed.glb 加载完成');
    }
  },
  (err) => console.error('❌ Parking load error:', err)
);

// === Load Batteries ===
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
        }
      });
      scene.add(battery);
      // console.log(`🔋 Battery${idx+1} loaded at (${pos.x}, ${pos.z})`);
    },
    (xhr) => {
      if (xhr.loaded === xhr.total) {
        // console.log(`📦 battery_01.glb[${idx+1}] 加载完成`);
      }
    },
    (err) => console.error(`❌ Battery${idx+1} load error:`, err)
  );
});

// === Load Wind Turbines ===
const windturbinePositions = [
  { x: 17.6, z: -14.5},
  { x: 17.6-3.14*12, z: -14.5}
];
windturbinePositions.forEach((pos, idx) => {
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
      // console.log(`🌬️ WindTurbine${idx+1} loaded at (${pos.x}, ${pos.z})`);
    },
    (xhr) => {
      if (xhr.loaded === xhr.total) {
        // console.log(`📦 windturbine_wq.glb[${idx+1}] 加载完成`);
      }
    },
    (err) => console.error(`❌ WindTurbine${idx+1} load error:`, err)
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
    // console.log('✅ Car loaded (with animation)');

    // === 🚗 GSAP 动画 ===
    const tl = gsap.timeline({ repeat: 0, repeatDelay: 3 });

    // 1️⃣ 车辆1进入停车场
    tl.to(car.position, { x: -23, z: -6, duration: 4, ease: "power1.inOut", onStart: () => console.log('🚗 Car1 进入停车场') });

    // 2️⃣ 车辆1进入中间通道
    tl.to(car.rotation, { y: Math.PI / 2, duration: 1.2, ease: "power1.inOut", onStart: () => console.log('🚗 Car1 右转进入通道') });

    tl.to(car.position, { x: 14.6-3.14*4, z: -6, duration: 4, ease: "power1.inOut", onStart: () => console.log('🚗 Car1 沿通道前进') });

    // 3️⃣ 转弯进入车位方向
    tl.to(car.rotation, { y: Math.PI, duration: 1.5, ease: "power1.inOut"});

    // 4️⃣ 前进进入车位
    tl.to(car.position, { x: 14.6-3.14*4, z: -0.7, duration: 2.2, ease: "power1.inOut", onStart: () => console.log('🚗 Car1 停进6号车位') });

    // 5️⃣ 停车等待充电
    tl.to({}, { duration: 30, onStart: () => console.log('⏳ Car1 下单即时充电') });

    // 6️⃣ 倒车退出车位
    tl.to(car.position, { x: 14.6-3.14*4, z: -6, duration: 2.2, ease: "power1.inOut", onStart: () => console.log('🚗 Car1 离开车位') });

    // 7️⃣ 右转朝出口方向
    tl.to(car.rotation, { y: Math.PI / 2, duration: 1.2, ease: "power1.inOut" });

    // 8️⃣ 离开停车场
    tl.to(car.position, { x: 20.5, z: -6, duration: 5, ease: "power1.inOut", onStart: () => console.log('🚗 Car1 驶出停车场') });

    // 9️⃣ 稍微右转并离开场景
    tl.to(car.rotation, { y: 0, duration: 0.8, ease: "power1.inOut" });
    tl.to(car.position, { x: 20.5, z: 5, duration: 3, ease: "power1.inOut"});
    tl.to(car.position, { y:-1, z: -10, duration: 0.001, ease: "power1.inOut" });
  },
  (xhr) => {
    // if (xhr.loaded === xhr.total) {
    //   console.log('📦 red_car.glb[Car1] 加载完成');
    // }
  },
  (err) => console.error('❌ Car1 load error:', err)
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
    // console.log('✅ Robot loaded (white arm extends toward car at x=5.2)');

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
  // // 伸出机械臂（沿 -X）
  // .to(armBase.scale, { x: 1, duration: 0.6, ease: "power2.out" })
  // // 微调关节角度，制造自然弯曲感
  // .to(upperArm.rotation, { z: -Math.PI / 12, duration: 0.5 }, "<")
  // .to(foreArm.rotation, { z: -Math.PI / 10, duration: 0.5 }, "<")
  // // 枪头闪烁模拟充电
  // .to(tip.material, {
  //   emissiveIntensity: 2.0,
  //   duration: 0.5,
  //   yoyo: true,
  //   repeat: 5
  // })
  // // 收回机械臂
  // .to(foreArm.rotation, { z: 0, duration: 0.4 })
  // .to(upperArm.rotation, { z: 0, duration: 0.4 })
  // .to(armBase.scale, { x: 0, duration: 0.6, ease: "power1.in" });


    // 初始收起状态
    armBase.scale.x = 0;

    // === 🤖 动画逻辑 ===
    const tlRobot = gsap.timeline({ repeat: 0, repeatDelay: 3 });

    // 等待汽车进入车位
    tlRobot.to({}, { duration: 13});
    // 
    tlRobot.to({}, { duration: 0.1, onStart: () => console.log('🤖 Robot1 执行 Car1 即时单请求') });

    // 从充电区出发
    tlRobot.to(robot.position, {
      x : 15,
      z: -4,
      duration: 5,
      ease: "power2.inOut",
      onStart: () => console.log('🤖 Robot1 从补电区出发')
    });

    // 转向汽车
    tlRobot.to(robot.rotation, {
      y: Math.PI / 2,
      duration: 1,
      ease: "power1.inOut",
      // onStart: () => console.log('🤖 Robot 转向汽车')
    });

    // 前往汽车前方
    tlRobot.to(robot.position, {
      x: 14.6-3.14*4,
      z: -4,
      duration: 5,
      ease: "power2.inOut",
      // onStart: () => console.log('🤖 Robot 到达6号车位充电区')
    });

    // === ⚡ 充电动作 ===
    tlRobot.to({}, { duration: 0.5,       onStart: () => console.log('🤖 Robot1 到达6号车位充电区') });

    // 🦾 展开机械臂（往左伸）
    tlRobot.to(armBase.scale, { x: 1, duration: 0.6, ease: "power2.out", onStart: () => console.log('🦾 机械臂伸出') });
    tlRobot.to(upperArm.rotation, { z: Math.PI / 18, duration: 0.6, ease: "power2.out" });
    tlRobot.to(foreArm.rotation, { z: Math.PI / 24, duration: 0.6, ease: "power2.out" });
    tlRobot.to(wrist.rotation, { y: -Math.PI / 15, duration: 0.5, ease: "power2.out" });

    // 🔋 模拟充电闪烁
    tlRobot.to(tip.material, { emissiveIntensity: 2, duration: 0.5, yoyo: true, repeat: 10, onStart: () => console.log('🔋 充电中...') });

    // 🧭 收回机械臂
    tlRobot.to(wrist.rotation, { y: 0, duration: 0.4 });
    tlRobot.to(foreArm.rotation, { z: 0, duration: 0.4 });
    tlRobot.to(upperArm.rotation, { z: 0, duration: 0.4 , onStart: () => console.log('🔋 充电完成') });
    tlRobot.to(armBase.scale, { x: 0, duration: 0.6, ease: "power1.in", onStart: () => console.log('🧭 机械臂收回') });

    // 返回充电区待命
    tlRobot.to(robot.position, {
      x: 15,
      z: -4,
      duration: 5,
      ease: "power2.inOut",
      onStart: () => console.log('🤖 Robot1 返回补电区')
    });

    tlRobot.to(robot.rotation, {
      y: Math.PI,
      duration: 1,
      ease: "power1.inOut",
      // onStart: () => console.log('🤖 Robot 转回初始朝向')
    });

    tlRobot.to(robot.position, {
      x: 15,
      z: -10,
      duration: 5,
      ease: "power2.inOut",
      // onStart: () => console.log('🤖 Robot 回到初始点')
    });
  },
  (xhr) => {
    if (xhr.loaded === xhr.total) {
      // console.log('📦 puppy_robot.glb[Robot1] 加载完成');
    }
  },
  (err) => console.error('❌ Robot1 load error:', err)
);

// === Load Second Robot (预约机器人逻辑 + 白色机械臂向右伸出) ===
let robot2;
loader.load(
  '/puppy_robot.glb',
  (gltf) => {
    robot2 = gltf.scene;
    robot2.scale.set(0.75, 0.75, 0.75);
    robot2.position.set(14.6 - 2.7, 1, -10); // 初始点
    robot2.rotation.y = Math.PI; // 朝向车位
    robot2.traverse((obj) => {
      if (obj.isMesh) obj.castShadow = true;
    });
    scene.add(robot2);
    // console.log('✅ Robot2 loaded (右臂放电逻辑)');

    // === 🦾 白色机械臂结构（沿 +X 方向伸出）===
    const armBase2 = new THREE.Group();
    armBase2.position.set(0.9, 0.6, 1.1); // 安装在机器人右上角
    robot2.add(armBase2);

    // 材质
    const whiteMetal = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0.3,
      roughness: 0.3
    });

    // 上臂
    const upperArm2 = new THREE.Mesh(
      new THREE.BoxGeometry(1, 0.1, 0.1),
      whiteMetal
    );
    upperArm2.position.x = 0.5;
    armBase2.add(upperArm2);

    // 前臂
    const foreArm2 = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 0.1, 0.1),
      whiteMetal
    );
    foreArm2.position.x = 0.9;
    upperArm2.add(foreArm2);

    // 末端
    const wrist2 = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.1, 0.1),
      whiteMetal
    );
    wrist2.position.x = 0.7;
    foreArm2.add(wrist2);

    // 枪头
    const tip2 = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 16, 16),
      new THREE.MeshStandardMaterial({
        color: 0x00ccff,
        emissive: 0x00ccff,
        emissiveIntensity: 1.2,
        metalness: 1,
        roughness: 0.15
      })
    );
    tip2.position.x = 0.4;
    wrist2.add(tip2);

    // 初始收回
    armBase2.scale.x = 0;

    // === 🤖 Robot2 移动与放电逻辑 ===
    const tlRobot2 = gsap.timeline({ repeat: 0, repeatDelay: 3 });

    // 等待汽车进入车位
    tlRobot2.to({}, { duration: 50,      onComplete: () => console.log("🤖 Robot2 执行 Car2 预约单请求")});

    // 1️⃣ 出发占位
    tlRobot2.to(robot2.position, {
      x: 14.6 - 2.7,
      z: -7,
      duration: 2,
      ease: "power2.inOut",
      onStart: () => console.log("🤖 Robot2 从补电区出发")
    });

    // 5️⃣ 调整朝向面对车辆
    tlRobot2.to(robot2.rotation, {
      y: Math.PI / 2,
      duration: 1,
      ease: "power1.inOut",
      // onStart: () => console.log('🤖 Robot2 转向车位')
    });

    // 1️⃣ 出发占位
    tlRobot2.to(robot2.position, {
      x: 14.6 - 2.7 - 6*3.14,
      z: -7,
      duration: 5,
      ease: "power2.inOut",
      onStart: () => console.log("🤖 Robot2 前往14号充电车位")
    });
    // 5️⃣ 调整朝向面对车辆
    tlRobot2.to(robot2.rotation, {
      y: Math.PI ,
      duration: 1.2,
      ease: "power1.inOut",
      // onStart: () => console.log('🤖 Robot2 调整朝向车位')
    });
    // 1️⃣ 出发占位
    tlRobot2.to(robot2.position, {
      x: 14.6 - 2.7 - 6*3.14,
      z: -10,
      duration: 2,
      ease: "power2.inOut",
      onStart: () => console.log("🤖 Robot2 进入车位占位")
    });

    // 等待汽车进入车位
    tlRobot2.to({}, { duration: 4, onStart: () => console.log('🤖 Robot2 等待车辆进入车位...') });

    // 3️⃣ 离开车位（让车进入）
    tlRobot2.to(robot2.position, {
      z: -7,
      duration: 2,
      ease: "power2.inOut",
      onStart: () => console.log("🤖 Robot2 让出车位让车进入")
    });

    // 5️⃣ 调整朝向面对车辆
    tlRobot2.to(robot2.rotation, {
      y: Math.PI / 2  ,
      duration: 1.2,
      ease: "power1.inOut",
      // onStart: () => console.log('🤖 Robot2 转向主通道')
    });

    // 4️⃣ 前往车位前方
    tlRobot2.to(robot2.position, {
      x: 14.6 - 3.14 * 6,
      z: -7,
      duration: 2,
      ease: "power2.inOut",
      // onStart: () => console.log('🤖 Robot2 前往车位前方')
    });

    tlRobot2.to({}, { duration: 4});

    // 6️⃣ 移动到车位前方中心
    tlRobot2.to(robot2.position, {
      x: 14.6 -  7*3.14,
      z: -7,
      duration: 1,
      ease: "power1.inOut",
      onStart: () => console.log('🤖 Robot2 移动到14号车位充电区')
    });

    // 7️⃣ ⚡ 开始放电动作（右侧伸出机械臂）
    tlRobot2.to({}, { duration: 0.5, onStart: () => console.log('🦾 机械臂伸出') });

    tlRobot2.to(armBase2.scale, { x: 1, duration: 0.6, ease: "power2.out" });
    tlRobot2.to(upperArm2.rotation, { z: -Math.PI / 18, duration: 0.6, ease: "power2.out" });
    tlRobot2.to(foreArm2.rotation, { z: -Math.PI / 24, duration: 0.6, ease: "power2.out" });
    tlRobot2.to(wrist2.rotation, { y: Math.PI / 15, duration: 0.5, ease: "power2.out" });

    // 🔋 闪烁充电效果
    tlRobot2.to(tip2.material, {
      emissiveIntensity: 2,
      duration: 0.5,
      yoyo: true,
      repeat: 10,
      onStart: () => console.log('🔋 充电中...')
    });

    // 🧭 收回机械臂
    tlRobot2.to(foreArm2.rotation, { z: 0, duration: 0.4, onStart: () => console.log('🔋 充电完成')});
    tlRobot2.to(upperArm2.rotation, { z: 0, duration: 0.4 });
    tlRobot2.to(armBase2.scale, { x: 0, duration: 0.6, ease: "power1.in", onEnd: () => console.log('🧭 机械臂收回') });

    // 8️⃣ 返回初始点
    tlRobot2.to(robot2.rotation, { y: Math.PI / 2, duration: 1, ease: "power1.inOut" });
    tlRobot2.to(robot2.position, {
      x: 14.6 - 2.7,
      z: -7,
      duration: 5,  
      ease: "power2.inOut",
      onStart: () => console.log("🤖 Robot2 返回补电区")
    });

    // 5️⃣ 调整朝向面对车辆
    tlRobot2.to(robot2.rotation, {
      y: Math.PI ,
      duration: 1.2,
      ease: "power1.inOut",
      // onStart: () => console.log('🤖 Robot2 转回初始朝向')
    });

    tlRobot2.to(robot2.position, {
      x: 14.6 - 2.7,
      z: -10,
      duration: 2,
      ease: "power2.inOut",
      // onStart: () => console.log("🔋 Robot2 到达补电区")
    });
  },
  (xhr) => {
    if (xhr.loaded === xhr.total) {
      // console.log('📦 puppy_robot.glb[Robot2] 加载完成');
    }
  },
  (err) => console.error("❌ Robot2 load error:", err)
);

// === Load Second Car (car2) ===
let car2;
loader.load(
  '/red_car.glb',
  (gltf) => {
    car2 = gltf.scene;
    car2.scale.set(0.008, 0.008, 0.008);
    car2.position.set(-23, -1, 0); // 从左侧外部进入
    car2.rotation.y = Math.PI; // 初始朝向停车场方向
    scene.add(car2);
    // console.log('✅ Car2 loaded');

    const tlCar2 = gsap.timeline({ repeat: 0, repeatDelay: 3 });

    // 等待 robot2 完成占位（63s）
    tlCar2.to({}, { duration: 63});

    // 1️⃣ 进入停车场主道
    tlCar2.to(car2.position, {
      x: -23,
      y: 1,
      z: 5 ,
      duration: 0.001,
      ease: "power1.inOut",
      onStart: () => console.log('🚗 Car2 进入停车场')
    });

    // 1️⃣ 进入停车场主道
    tlCar2.to(car2.position, {
      x: -23,
      z: -6,
      duration: 5,
      ease: "power1.inOut",
      // onStart: () => console.log('🚗 Car2 进入中间车道')
    });

    // 2️⃣ 左转进入通道
    tlCar2.to(car2.rotation, {
      y: Math.PI / 2,
      duration: 1,
      ease: "power1.inOut",
      onStart: () => console.log('🚗 Car2 右转进入中间通道')
    });

    // 3️⃣ 沿通道前进到目标车位（与 Robot2 占位位置匹配）
    tlCar2.to(car2.position, {
      x: 14.6 - 3.14 * 7,
      z: -6,
      duration: 3,
      ease: "power1.inOut",
      onStart: () => console.log('🚗 Car2 前往14号车位')
    });

    // 4️⃣ 调整朝向车位方向
    tlCar2.to(car2.rotation, {
      y: Math.PI,
      duration: 1,
      ease: "power1.inOut",
      // onStart: () => console.log('🚗 Car2 调整朝向车位')
    });

    // 5️⃣ 前进进入车位 (Robot2 已离开)
    tlCar2.to(car2.position, {
      x: 14.6 - 3.14 * 7,
      z: -11,
      duration: 1,
      ease: "power1.inOut",
      onStart: () => console.log('🚗 Car2 进入14号车位')

    });

    // 6️⃣ 停稳等待 Robot2 放电（持续 20 秒）
    tlCar2.to({}, {
      duration: 20,
      // onStart: () => console.log('🔋 Car2 等待充电...')
    });

    // 7️⃣ 倒车退出车位
    tlCar2.to(car2.position, {
      x: 14.6 - 3.14 * 7,
      z: -6,
      duration: 2.2,
      ease: "power1.inOut",
      // onStart: () => console.log('🚗 Car2 充电完成，倒车退出车位')
    });

    // 8️⃣ 右转准备离开
    tlCar2.to(car2.rotation, {
      y: Math.PI / 2,
      duration: 1.2,
      ease: "power1.inOut",
      onStart: () => console.log('🚗 Car2 离开车位')
    });

    // 9️⃣ 沿通道驶出停车场
    tlCar2.to(car2.position, {
      x: 21,
      z: -6,
      duration: 4,
      ease: "power2.inOut",
      onStart: () => console.log('🚗 Car2 驶出停车场')
    });

    // 🔚 离开场景
    tlCar2.to(car2.rotation, {
      y: 0,
      duration: 0.8,
      ease: "power1.inOut",
      // onStart: () => console.log('🚗 Car2 右转离开场景')
    });
    tlCar2.to(car2.position, {
      x: 21,
      z: 5,
      duration: 3,
      ease: "power1.inOut",
      // onStart: () => console.log('🚗 Car2 离开场景')
    });
    tlCar2.to(car2.position, {
      y: -1,
      z: -10,
      duration: 3,
      ease: "power1.inOut",
      // onStart: () => console.log('🚗 Car2 离开场景')
    });
  },
  (xhr) => {
    if (xhr.loaded === xhr.total) {
      // console.log('📦 red_car.glb[Car2] 加载完成');
    }
  },
  (err) => console.error('❌ Car2 load error:', err)
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
  renderer.setSize(window.innerWidth * scale, window.innerHeight * scale, false);
  renderer.domElement.style.width = window.innerWidth + 'px';
  renderer.domElement.style.height = window.innerHeight + 'px';
});