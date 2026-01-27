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

// PBR 渲染设置 - 关键配置
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; // 使用电影级色调映射
renderer.toneMappingExposure = 1.2; // 提高曝光度使 PBR 模型更亮

document.body.appendChild(renderer.domElement);
renderer.domElement.style.width = window.innerWidth + 'px';
renderer.domElement.style.height = window.innerHeight + 'px';

// === Lights ===
const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
scene.add(ambientLight);

// 半球光 - 为 PBR 材质提供更自然的环境光照
const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 2.0);
hemiLight.position.set(0, 50, 0);
scene.add(hemiLight);

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

// === 环境贴图 for PBR ===
// 使用 PMREMGenerator 创建环境贴图，这是 PBR 材质正确渲染的关键
const pmremGenerator = new THREE.PMREMGenerator(renderer);
pmremGenerator.compileEquirectangularShader();

// 创建简单的环境场景
const envScene = new THREE.Scene();
envScene.background = new THREE.Color(0xffffff);

// 添加多个方向的光源到环境场景，模拟真实环境光
const envLight1 = new THREE.DirectionalLight(0xffffff, 1.0);
envLight1.position.set(1, 1, 1);
envScene.add(envLight1);

const envLight2 = new THREE.DirectionalLight(0xaaccff, 0.5);
envLight2.position.set(-1, 1, -1);
envScene.add(envLight2);

const envLight3 = new THREE.AmbientLight(0xffffff, 1.0);
envScene.add(envLight3);

// 生成环境贴图并应用到场景
const envMap = pmremGenerator.fromScene(envScene).texture;
scene.environment = envMap; // 关键：为所有 PBR 材质提供环境反射
pmremGenerator.dispose();

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

// === Mouse Click Coordinate Detection ===
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

function onMouseClick(event) {
  // 将鼠标位置标准化为设备坐标 (-1 到 +1)
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  // 通过摄像机和鼠标位置更新射线
  raycaster.setFromCamera(mouse, camera);

  // 创建一个地平面来检测交点
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const intersectPoint = new THREE.Vector3();
  
  if (raycaster.ray.intersectPlane(groundPlane, intersectPoint)) {
    console.log(`📍 Clicked Position: x: ${intersectPoint.x.toFixed(2)}, y: ${intersectPoint.y.toFixed(2)}, z: ${intersectPoint.z.toFixed(2)}`);
    
    // 可选：添加一个可视化标记
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 16, 16),
      new THREE.MeshStandardMaterial({ 
        color: 0xff0000, 
        emissive: 0xff0000, 
        emissiveIntensity: 0.5 
      })
    );
    marker.position.copy(intersectPoint);
    marker.position.y = 0.2;
    scene.add(marker);
    
    // 5秒后移除标记
    setTimeout(() => scene.remove(marker), 5000);
  }
}

// 添加鼠标点击事件监听器
window.addEventListener('click', onMouseClick, false);

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
    this.armBase.rotation.y = Math.PI / 2; // 顺时针旋转90度
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
    
    // 恒定速度：每秒移动3个单位
    const SPEED = 3.0; // units per second
    const duration = distance / SPEED;

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

    // Move to target with constant speed
    tl.to(this.model.position, {
      x: targetPosition.x,
      z: targetPosition.z,
      duration: duration,
      ease: "none" // 恒定速度
    });

    return tl;
  }

  chargeVehicle(vehicle, onComplete) {
    this.state = 'charging';
    this.targetVehicle = vehicle;
    const vehiclePos = vehicle.position;
    
    // Determine if left or right parking spot
    const isLeftSpot = vehiclePos.z < -8.8;
    const turnPointZ = isLeftSpot ? -8 : -4.6; // 转向点z坐标：左侧z=-8，右侧z=-4.6
    
    const currentPos = { x: this.model.position.x, z: this.model.position.z, y: this.model.position.y };
    
    // 转向点：休息位置的x坐标，转向点的z坐标（必须经过）
    const turnPoint = { 
      x: currentPos.x, 
      z: turnPointZ,
      y: 0 
    };
    
    // 充电位置：车辆的x坐标，转向点的z坐标
    const chargingPos = { 
      x: vehiclePos.x, 
      z: turnPointZ,
      y: 0 
    };

    // 恒定速度：每秒移动3个单位
    const SPEED = 3.0; // units per second

    // Create main timeline
    const mainTl = gsap.timeline({
      onComplete: () => {
        this.state = 'idle';
        this.targetVehicle = null;
        if (onComplete) onComplete();
      }
    });

    // Step 1: 从休息位置移动到转向点（必须经过）
    console.log(`🤖 Robot${this.id} Step 1: Moving from rest to turn point at z=${turnPointZ}`);
    const distanceToTurn = Math.sqrt(
      Math.pow(turnPoint.x - currentPos.x, 2) + Math.pow(turnPoint.z - currentPos.z, 2)
    );
    const durationToTurn = distanceToTurn / SPEED;
    mainTl.to(this.model.position, {
      x: turnPoint.x,
      z: turnPoint.z,
      duration: durationToTurn,
      ease: "none" // 恒定速度
    });

    // Step 2: 在转向点旋转90度（pi/2 -> pi），然后移动到充电位置
    console.log(`🤖 Robot${this.id} Step 2: Rotating at turn point and moving to charging position`);
    mainTl.to(this.model.rotation, {
      y: Math.PI, // 顺时针旋转90度：pi/2 -> pi
      duration: 0.8,
      ease: "power1.inOut"
    });
    
    const distanceToCharge = Math.sqrt(
      Math.pow(chargingPos.x - turnPoint.x, 2) + Math.pow(chargingPos.z - turnPoint.z, 2)
    );
    const durationToCharge = distanceToCharge / SPEED;
    mainTl.to(this.model.position, {
      x: chargingPos.x,
      z: chargingPos.z,
      duration: durationToCharge,
      ease: "none" // 恒定速度
    });

    // Step 3: 旋转面向车辆（不移动位置，只在原地旋转）
    mainTl.to(this.model.rotation, {
      y: isLeftSpot ? Math.PI : 0, // 左侧面向-Z(180°)，右侧面向+Z(0°)
      duration: 0.8,
      ease: "power1.inOut",
      onStart: () => console.log(`🤖 Robot${this.id} Step 3: Rotating to face vehicle (no movement)`)
    });

    // Step 4: Extend arm and charge (不靠近车辆，只伸出机械臂)
    mainTl.to({}, { duration: 0.5, onStart: () => console.log(`🤖 Robot${this.id} extending charging arm`) });

    mainTl.to(this.armBase.scale, { x: 1, duration: 0.6, ease: "power2.out" });
    mainTl.to(this.armParts.upperArm.rotation, { z: Math.PI / 18, duration: 0.6, ease: "power2.out" }, "<");
    mainTl.to(this.armParts.forearm.rotation, { z: Math.PI / 24, duration: 0.6, ease: "power2.out" }, "<");
    mainTl.to(this.armParts.wrist.rotation, { y: -Math.PI / 15, duration: 0.5, ease: "power2.out" }, "<");

    // Charging effect
    mainTl.to({}, { duration: 0.5, onStart: () => console.log(`🔋 Robot${this.id} charging vehicle...`) });
    mainTl.to(this.chargingTip.material, {
      emissiveIntensity: 2.5,
      duration: 0.5,
      yoyo: true,
      repeat: 8
    });

    // Step 5: Retract arm
    mainTl.to({}, { duration: 0.5, onStart: () => console.log(`✅ Robot${this.id} charging complete`) });
    mainTl.to(this.armParts.wrist.rotation, { y: 0, duration: 0.4 });
    mainTl.to(this.armParts.forearm.rotation, { z: 0, duration: 0.4 });
    mainTl.to(this.armParts.upperArm.rotation, { z: 0, duration: 0.4 });
    mainTl.to(this.armBase.scale, { x: 0, duration: 0.6, ease: "power1.in" });

    // Step 6: 返程 - 从充电位置移动到转向点（必须经过）
    console.log(`🤖 Robot${this.id} Step 6: Moving from charging position to turn point`);
    
    // 先旋转回pi方向（面向-Z方向）
    mainTl.to(this.model.rotation, {
      y: Math.PI, // 面向-Z方向（沿行车主干道返回）
      duration: 0.8,
      ease: "power1.inOut"
    });
    
    // 移动到转向点
    const returnDistanceToTurn = Math.sqrt(
      Math.pow(turnPoint.x - chargingPos.x, 2) + Math.pow(turnPoint.z - chargingPos.z, 2)
    );
    const returnDurationToTurn = returnDistanceToTurn / SPEED;
    mainTl.to(this.model.position, {
      x: turnPoint.x,
      z: turnPoint.z,
      duration: returnDurationToTurn,
      ease: "none" // 恒定速度
    });

    // Step 7: 在转向点旋转90度（pi -> pi/2），然后返回休息位置
    console.log(`🤖 Robot${this.id} Step 7: Rotating at turn point and returning to rest position`);
    mainTl.to(this.model.rotation, {
      y: Math.PI / 2, // 逆时针旋转90度：pi -> pi/2
      duration: 0.8,
      ease: "power1.inOut"
    });
    
    const returnDistanceToHome = Math.sqrt(
      Math.pow(this.homePosition.x - turnPoint.x, 2) + Math.pow(this.homePosition.z - turnPoint.z, 2)
    );
    const returnDurationToHome = returnDistanceToHome / SPEED;
    mainTl.to(this.model.position, {
      x: this.homePosition.x,
      z: this.homePosition.z,
      duration: returnDurationToHome,
      ease: "none", // 恒定速度
      onComplete: () => {
        console.log(`🤖 Robot${this.id} returned to rest position`);
      }
    });

    // Consume battery
    this.batteryLevel = Math.max(0, this.batteryLevel - 15);

    return mainTl;
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
  { x: 13, y: 1,z: -13 },
  // { x: 14.5, z: -13 },
];

batteryPositions.forEach((pos, idx) => {
  loader.load(
    '/mid_caddie.glb',
    (gltf) => {
      const battery = gltf.scene;
      battery.scale.set(2, 2, 2);
      battery.position.set(pos.x, pos.y, pos.z);
      battery.traverse((child) => {
        if (child.isMesh) {
          child.material.emissive = new THREE.Color(child.material.color);
          child.material.emissiveIntensity = 0.2;
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
  { x: 11.20, y: 0.00, z: -10.31 },  // Robot 1 initial/rest position
  { x: 14.58, y: 0.00, z: -10.39 },  // Robot 2 initial/rest position
];

robotPositions.forEach((pos, idx) => {
  console.log(`📦 Attempting to load robot ${idx + 1} from /small_caddie.glb`);
  console.log(`   Position: (${pos.x}, ${pos.y}, ${pos.z})`);
  
  loader.load(
      '/small_caddie.glb',
      (gltf) => {
        console.log(`✅ Robot ${idx + 1} model loaded successfully`);
        console.log(`   Scene has ${gltf.scene.children.length} children`);
      const robotModel = gltf.scene.clone();
      robotModel.scale.set(1, 1, 1);
      robotModel.position.set(pos.x, pos.y, pos.z);
      // Set initial rotation to pi/2 (90 degrees, facing +X direction)
      robotModel.rotation.y = Math.PI / 2;
      robotModel.traverse((obj) => {
        if (obj.isMesh) {
          obj.castShadow = true;
          obj.receiveShadow = true;
          
          // Optimize PBR material configuration - preserve original PBR properties
          if (obj.material) {
            const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
            
            materials.forEach((material) => {
              // Ensure textures are properly configured
              if (material.map) {
                material.map.colorSpace = THREE.SRGBColorSpace;
                material.map.needsUpdate = true;
              }
              
              if (material.normalMap) {
                material.normalMap.needsUpdate = true;
              }
              
              if (material.metalnessMap) {
                material.metalnessMap.needsUpdate = true;
              }
              
              if (material.roughnessMap) {
                material.roughnessMap.needsUpdate = true;
              }
              
              if (material.aoMap) {
                material.aoMap.needsUpdate = true;
              }
              
              // Only set fallback if material has no color/texture data
              if (!material.map && (!material.color || (material.color.r === 0 && material.color.g === 0 && material.color.b === 0))) {
                material.color = new THREE.Color(0xcccccc);
                console.log(`⚠️ Small caddie material has no color data, using light gray fallback`);
              }
              
              // Ensure PBR materials respond to lighting
              if (material.isMeshStandardMaterial || material.isMeshPhysicalMaterial) {
                // Keep original metalness and roughness values
              }
              
              material.needsUpdate = true;
            });
          } else {
            // Create default material only if completely missing
            obj.material = new THREE.MeshStandardMaterial({
              color: 0xcccccc,
              metalness: 0.3,
              roughness: 0.7
            });
            console.log(`⚠️ Small caddie mesh has no material, created PBR default`);
          }
        }
      });
      scene.add(robotModel);

      const robot = new ChargingRobot(robotModel, pos, idx + 1);
      chargingRobots.push(robot);
      console.log(`🤖 Charging Robot ${idx + 1} loaded at (${pos.x}, ${pos.y}, ${pos.z})`);
      console.log(`   Initial rotation: y = ${robotModel.rotation.y} (${(robotModel.rotation.y * 180 / Math.PI).toFixed(1)}°)`);
      console.log(`   State: ${robot.state}, Battery: ${robot.batteryLevel}%`);
      console.log(`   Total robots in system: ${chargingRobots.length}`);
      
      // Verify robot is properly initialized
      if (robot.state !== 'idle') {
        console.warn(`⚠️ Robot ${idx + 1} not in idle state! Current state: ${robot.state}`);
      }
      if (robot.batteryLevel <= 30) {
        console.warn(`⚠️ Robot ${idx + 1} battery too low! Current: ${robot.batteryLevel}%`);
      }
    },
    (xhr) => {
      // Progress callback
      if (xhr.lengthComputable) {
        const percentComplete = (xhr.loaded / xhr.total) * 100;
        if (percentComplete % 25 < 1) { // Log every 25%
          console.log(`📥 Robot ${idx + 1} loading: ${percentComplete.toFixed(0)}%`);
        }
      }
    },
    (err) => {
      console.error(`❌ Robot ${idx + 1} load error:`, err);
      console.error(`   Error details:`, err.message || err);
      console.error(`   This means robot ${idx + 1} will NOT be available for charging!`);
      console.log(`🔄 Attempting fallback to puppy_robot.glb...`);
      // Fallback to puppy_robot if small_caddie fails
      loader.load(
        '/puppy_robot.glb',
        (gltf) => {
          const robotModel = gltf.scene;
          robotModel.scale.set(0.75, 0.75, 0.75);
          robotModel.position.set(pos.x, pos.y, pos.z);
          robotModel.rotation.y = Math.PI;
          robotModel.traverse((obj) => {
            if (obj.isMesh) obj.castShadow = true;
          });
          scene.add(robotModel);

          const robot = new ChargingRobot(robotModel, pos, idx + 1);
          chargingRobots.push(robot);
          console.log(`🤖 Charging Robot ${idx + 1} loaded (fallback) at (${pos.x}, ${pos.y}, ${pos.z})`);
          console.log(`   Initial rotation: y = ${robotModel.rotation.y} (${(robotModel.rotation.y * 180 / Math.PI).toFixed(1)}°)`);
          console.log(`   State: ${robot.state}, Battery: ${robot.batteryLevel}%`);
          console.log(`   Total robots in system: ${chargingRobots.length}`);
        },
        undefined,
        (fallbackErr) => {
          console.error(`❌ Fallback robot ${idx + 1} also failed to load:`, fallbackErr);
        }
      );
    }
  );
});

// === Define 10 Parking Spots ===
// 左侧5个停车位区域：左上(-18.34, -14.59) 右下(-2.59, -8.81)
// 右侧5个停车位区域：左上(-18.25, -3.82) 右下(-2.69, 1.79)
// 计算：左侧宽度=15.75，每个车位宽度=3.15，中心z=-11.7
//      右侧宽度=15.56，每个车位宽度=3.112，中心z=-1.015
const parkingSpots = [
  // 左侧5个停车位（从左到右，z坐标在-14.59到-8.81之间，取中心-11.7）
  { x: -18.34 + 3.15 * 0.5, z: -11.7, y: 1, side: 'left', index: 0 },   // 左侧第1个: x=-16.765
  { x: -18.34 + 3.15 * 1.5, z: -11.7, y: 1, side: 'left', index: 1 },   // 左侧第2个: x=-13.615
  { x: -18.34 + 3.15 * 2.5, z: -11.7, y: 1, side: 'left', index: 2 },   // 左侧第3个: x=-10.465
  { x: -18.34 + 3.15 * 3.5, z: -11.7, y: 1, side: 'left', index: 3 },   // 左侧第4个: x=-7.315
  { x: -18.34 + 3.15 * 4.5, z: -11.7, y: 1, side: 'left', index: 4 },   // 左侧第5个: x=-4.165
  // 右侧5个停车位（从左到右，z坐标在-3.82到1.79之间，取中心-1.015）
  { x: -18.25 + 3.112 * 0.5, z: -1.015, y: 1, side: 'right', index: 5 }, // 右侧第1个: x=-16.694
  { x: -18.25 + 3.112 * 1.5, z: -1.015, y: 1, side: 'right', index: 6 }, // 右侧第2个: x=-13.582
  { x: -18.25 + 3.112 * 2.5, z: -1.015, y: 1, side: 'right', index: 7 }, // 右侧第3个: x=-10.47
  { x: -18.25 + 3.112 * 3.5, z: -1.015, y: 1, side: 'right', index: 8 }, // 右侧第4个: x=-7.358
  { x: -18.25 + 3.112 * 4.5, z: -1.015, y: 1, side: 'right', index: 9 }, // 右侧第5个: x=-4.246
];

// Track which parking spots are occupied
const occupiedSpots = new Set();

// === Visualize Parking Spots (for debugging) ===
function visualizeParkingSpots() {
  parkingSpots.forEach((spot, idx) => {
    // Create a function to create text sprite with circle
    function createNumberLabelWithCircle(number, fontSize = 120) {
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      const size = 384; // Medium canvas size for good quality
      canvas.width = size;
      canvas.height = size;
      
      // Clear canvas with transparent background
      context.clearRect(0, 0, canvas.width, canvas.height);
      
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const circleRadius = 140; // Medium circle radius
      
      // Draw white circle background
      context.beginPath();
      context.arc(centerX, centerY, circleRadius, 0, Math.PI * 2);
      context.fillStyle = 'rgba(255, 255, 255, 0.95)';
      context.fill();
      
      // Draw circle border
      context.beginPath();
      context.arc(centerX, centerY, circleRadius, 0, Math.PI * 2);
      context.strokeStyle = '#000000';
      context.lineWidth = 8; // Medium border
      context.stroke();
      
      // Set text style
      context.font = `Bold ${fontSize}px Arial`;
      context.fillStyle = '#000000';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      
      // Draw number text with outline for better visibility
      context.strokeStyle = '#FFFFFF';
      context.lineWidth = 4;
      context.strokeText(number.toString(), centerX, centerY);
      context.fillText(number.toString(), centerX, centerY);
      
      // Create texture from canvas
      const texture = new THREE.CanvasTexture(canvas);
      texture.needsUpdate = true;
      
      // Create plane geometry for the label (lying flat on ground)
      const planeGeometry = new THREE.PlaneGeometry(3, 3); // Medium size
      const planeMaterial = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        alphaTest: 0.1,
        side: THREE.DoubleSide
      });
      
      const plane = new THREE.Mesh(planeGeometry, planeMaterial);
      // Rotate to lie flat on the ground
      plane.rotation.x = -Math.PI / 2;
      plane.position.y = 0.01; // Slightly above ground to avoid z-fighting
      
      return plane;
    }
    
    // Create number label on the ground
    const numberLabel = createNumberLabelWithCircle(idx + 1, 130);
    numberLabel.position.set(spot.x, 0.01, spot.z);
    scene.add(numberLabel);
    
    console.log(`📍 Parking spot ${idx + 1} (${spot.side}): (${spot.x.toFixed(2)}, ${spot.z.toFixed(2)})`);
  });
  console.log(`✅ Visualized ${parkingSpots.length} parking spots with number labels on ground`);
}

// === Load Vehicles ===
function createVehicleSequence() {
  let vehicleCounter = 0;

  function spawnVehicle() {
    vehicleCounter++;
    
    // Find an available parking spot
    const availableSpots = parkingSpots.filter((_, idx) => !occupiedSpots.has(idx));
    if (availableSpots.length === 0) {
      console.log('⚠️ All parking spots are occupied, waiting...');
      setTimeout(() => spawnVehicle(), 5000); // Retry in 5 seconds
      return;
    }
    
    // Randomly select an available spot
    const spotIndex = Math.floor(Math.random() * availableSpots.length);
    const selectedSpot = availableSpots[spotIndex];
    const parkingSpotIndex = parkingSpots.findIndex(spot => 
      spot.x === selectedSpot.x && spot.z === selectedSpot.z && spot.side === selectedSpot.side
    );
    
    if (parkingSpotIndex === -1) {
      console.error(`❌ ERROR: Could not find parking spot index for spot at (${selectedSpot.x}, ${selectedSpot.z})`);
      setTimeout(() => spawnVehicle(), 2000);
      return;
    }
    
    occupiedSpots.add(parkingSpotIndex);
    console.log(`🅿️ Vehicle ${vehicleCounter} assigned to spot ${parkingSpotIndex + 1} (${selectedSpot.side} side, index ${selectedSpot.index + 1})`);
    
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
          x: selectedSpot.x,
          z: selectedSpot.z,
          y: selectedSpot.y
        };

        const vehicle = {
          model: car,
          position: targetParkingSpot,
          id: vehicleCounter,
          needsCharging: true
        };
        vehicles.push(vehicle);

        console.log(`🚗 Vehicle ${vehicleCounter} entering parking lot`);
        console.log(`   Target spot: ${selectedSpot.side} side, index ${selectedSpot.index + 1} at (${targetParkingSpot.x.toFixed(2)}, ${targetParkingSpot.z.toFixed(2)})`);

        // Calculate lane position - middle lane is between z = -4 and z = -8.8
        const middleLaneZCenter = (-4 + -8.8) / 2; // -6.4
        const laneZ = middleLaneZCenter; // 使用中间过道中心

        // 恒定速度：每秒移动4个单位（车辆比机器人稍快）
        const VEHICLE_SPEED = 4.0; // units per second

        // Animate vehicle entering and parking
        const tl = gsap.timeline({
          onComplete: () => {
            // Verify vehicle is at the correct parking spot
            const actualX = car.position.x;
            const actualZ = car.position.z;
            const expectedX = targetParkingSpot.x;
            const expectedZ = targetParkingSpot.z;
            const distance = Math.sqrt(
              Math.pow(actualX - expectedX, 2) + Math.pow(actualZ - expectedZ, 2)
            );
            
            console.log(`🚗 Vehicle ${vehicleCounter} parked at ${selectedSpot.side} side spot ${selectedSpot.index + 1}`);
            console.log(`   Expected: (${expectedX.toFixed(2)}, ${expectedZ.toFixed(2)})`);
            console.log(`   Actual: (${actualX.toFixed(2)}, ${actualZ.toFixed(2)})`);
            console.log(`   Distance error: ${distance.toFixed(2)}`);
            
            if (distance > 1.0) {
              console.warn(`⚠️ Vehicle ${vehicleCounter} is not at the expected parking spot!`);
            }
            
            assignRobotToVehicle(vehicle);
          }
        });

        // Enter parking lot - move to middle lane center (z = -6.4)
        const startX = car.position.x;
        const startZ = car.position.z;
        const distance1 = Math.sqrt(Math.pow(-23 - startX, 2) + Math.pow(laneZ - startZ, 2));
        tl.to(car.position, { 
          x: -23, 
          z: laneZ, 
          duration: distance1 / VEHICLE_SPEED, 
          ease: "none" // 恒定速度
        });
        tl.to(car.rotation, { y: Math.PI / 2, duration: 1.2, ease: "power1.inOut" });
        
        // Move along main lane to the x position of the parking spot
        const distance2 = Math.abs(targetParkingSpot.x - (-23));
        tl.to(car.position, { 
          x: targetParkingSpot.x, 
          z: laneZ, 
          duration: distance2 / VEHICLE_SPEED, 
          ease: "none" // 恒定速度
        });
        
        // Turn towards parking spot (左侧朝下180度，右侧朝上0度)
        tl.to(car.rotation, { y: selectedSpot.side === 'left' ? Math.PI : 0, duration: 1.5, ease: "power1.inOut" });
        
        // Move into parking spot
        const distance3 = Math.abs(targetParkingSpot.z - laneZ);
        tl.to(car.position, { 
          x: targetParkingSpot.x, 
          z: targetParkingSpot.z, 
          duration: distance3 / VEHICLE_SPEED, 
          ease: "none" // 恒定速度
        });

        // After charging, vehicle leaves
        const checkAndLeave = () => {
          if (!vehicle.needsCharging) {
            const leaveTl = gsap.timeline({
              onComplete: () => {
                scene.remove(car);
                const index = vehicles.indexOf(vehicle);
                if (index > -1) vehicles.splice(index, 1);
                // Free up the parking spot
                occupiedSpots.delete(parkingSpotIndex);
                console.log(`🚗 Vehicle ${vehicleCounter} left, spot ${selectedSpot.side} side ${selectedSpot.index + 1} is now available`);
              }
            });

            // Back out of parking spot to middle lane
            const middleLaneZCenter = (-4 + -8.8) / 2; // -6.4
            const exitLaneZ = middleLaneZCenter;
            const VEHICLE_SPEED = 4.0; // units per second
            
            const exitDistance1 = Math.abs(targetParkingSpot.z - exitLaneZ);
            leaveTl.to(car.position, { 
              x: targetParkingSpot.x, 
              z: exitLaneZ, 
              duration: exitDistance1 / VEHICLE_SPEED, 
              ease: "none" // 恒定速度
            });
            leaveTl.to(car.rotation, { y: Math.PI / 2, duration: 1.2, ease: "power1.inOut" });
            
            const exitDistance2 = Math.abs(20.5 - targetParkingSpot.x);
            leaveTl.to(car.position, { 
              x: 20.5, 
              z: exitLaneZ, 
              duration: exitDistance2 / VEHICLE_SPEED, 
              ease: "none" // 恒定速度
            });
            leaveTl.to(car.rotation, { y: 0, duration: 0.8, ease: "power1.inOut" });
            
            const exitDistance3 = Math.abs(5 - exitLaneZ);
            leaveTl.to(car.position, { 
              x: 20.5, 
              z: 5, 
              duration: exitDistance3 / VEHICLE_SPEED, 
              ease: "none" // 恒定速度
            });
            leaveTl.to(car.position, { y: -1, duration: 0.5, ease: "power1.inOut" });
          } else {
            // Check again in 2 seconds if still charging
            setTimeout(checkAndLeave, 2000);
          }
        };
        
        // Start checking after initial parking time
        setTimeout(checkAndLeave, 10000); // Start checking after 10 seconds
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
  // Debug: Log robot states
  console.log(`🔍 Looking for available robot. Total robots: ${chargingRobots.length}`);
  chargingRobots.forEach((robot, idx) => {
    console.log(`  Robot ${idx + 1}: state=${robot.state}, battery=${robot.batteryLevel}`);
  });
  
  // Find available robot (not charging, not self-charging, has battery)
  let availableRobot = chargingRobots.find(
    robot => robot.state === 'idle' && robot.batteryLevel > 30
  );

  if (!availableRobot) {
    console.log('⚠️ No available robots, vehicle will wait... Retrying in 2 seconds...');
    // Retry after a short delay in case robots are still loading
    setTimeout(() => {
      assignRobotToVehicle(vehicle);
    }, 2000);
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

  // Charge the vehicle (return path is handled inside chargeVehicle)
  availableRobot.chargeVehicle(vehicle, () => {
    vehicle.needsCharging = false;

    // Check if robot needs recharge after returning to rest position
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
}

// === Test if small_caddie.glb is accessible ===
fetch('/small_caddie.glb', { method: 'HEAD' })
  .then(response => {
    if (response.ok) {
      console.log('✅ small_caddie.glb is accessible via HTTP');
      console.log(`   File size: ${response.headers.get('content-length')} bytes`);
    } else {
      console.error(`❌ small_caddie.glb HTTP error: ${response.status} ${response.statusText}`);
    }
  })
  .catch(err => {
    console.error('❌ Cannot access small_caddie.glb:', err);
    console.error('   Make sure the dev server is running and the file is in the public folder');
  });

// === Start Simulation ===
setTimeout(() => {
  console.log('🚀 Starting EV charging simulation...');
  console.log(`📊 System status: ${chargingRobots.length} robots, ${batteryStations.length} battery stations`);
  console.log(`🅿️ Total parking spots: ${parkingSpots.length}`);
  
  // Visualize parking spots
  visualizeParkingSpots();
  
  if (chargingRobots.length === 0) {
    console.warn('⚠️ WARNING: No robots loaded yet! Vehicles may wait...');
    console.warn('   Check the console above for loading errors');
    console.warn('   Robots may still be loading - they will be available when ready');
  }
  createVehicleSequence();
}, 5000); // Wait 5 seconds for models to load

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
