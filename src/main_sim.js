import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { gsap } from "gsap";
import { OrderManager, PARKING_SPOTS } from './orderSystem.js';
import { collisionAvoidance } from './pathfinding.js';
import { LOT_BOUNDS } from './parking_map.js';
import { planEnterPath, planExitPath, KP, KP_NODES, KP_EDGES } from './keypoint_graph.js';
import { findPathTopo, findPathTopoST, isCrossingSegment, getSpotRow, getGraphData } from './topology.js';
import {
  getSlotGroup,
  isVehicleBehindOnLane,
  isVehicleNearEntryTurn,
  isVehicleAheadOnExitLane
} from './traffic_coordinator.js';
import { reservePath, releaseAgent, getSimTime, isPathBlockedByVehicles } from './reservation_table.js';

const PARKING_LOT_BOUNDS = {
  topLeft: { x: LOT_BOUNDS.minX, z: LOT_BOUNDS.minZ },
  bottomRight: { x: LOT_BOUNDS.maxX, z: LOT_BOUNDS.maxZ },
  contains(x, z) { return LOT_BOUNDS.contains(x, z); }
};

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
  titleDiv.style.display = 'none';
  document.body.appendChild(titleDiv);
}

// === Console UI === (隐藏)
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
  commentDiv.style.display = 'none'; // 隐藏console UI
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

// 禁用console.log输出到UI（保留浏览器控制台输出）
const oldLog = console.log;
console.log = function (...args) {
  oldLog.apply(console, args);
  // 不再添加到UI，只输出到浏览器控制台
  // addComment(args.join(' '));
};

// === Scene Setup ===
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xc8d0e0); // 淡蓝灰，略暗

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
renderer.toneMappingExposure = 0.8; // 降低整体亮度

document.body.appendChild(renderer.domElement);
renderer.domElement.style.width = window.innerWidth + 'px';
renderer.domElement.style.height = window.innerHeight + 'px';

// === Lights ===
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

// 半球光 - 为 PBR 材质提供更自然的环境光照
const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1.2);
hemiLight.position.set(0, 50, 0);
scene.add(hemiLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
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
const envLight1 = new THREE.DirectionalLight(0xffffff, 0.5);
envLight1.position.set(1, 1, 1);
envScene.add(envLight1);

const envLight2 = new THREE.DirectionalLight(0xaaccff, 0.35);
envLight2.position.set(-1, 1, -1);
envScene.add(envLight2);

const envLight3 = new THREE.AmbientLight(0xffffff, 0.7);
envScene.add(envLight3);

// 生成环境贴图并应用到场景
const envMap = pmremGenerator.fromScene(envScene).texture;
scene.environment = envMap;
pmremGenerator.dispose();

/** 降低模型反光：遍历 mesh 及其子节点，对 PBR 材质设置 envMapIntensity、适度提高 roughness */
function reduceReflections(obj, envMapIntensity = 0.3) {
  obj.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    mats.forEach((m) => {
      if (m.envMapIntensity !== undefined) m.envMapIntensity = envMapIntensity;
      if (m.roughness !== undefined) m.roughness = Math.min(1, (m.roughness ?? 0.5) + 0.15);
    });
  });
}

// === Controls ===
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 0);
controls.update();

// === Mouse Click to Show Coordinates ===
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

// 创建坐标显示元素
const coordDisplay = document.createElement('div');
coordDisplay.id = 'coordinate-display';
coordDisplay.style.position = 'fixed';
coordDisplay.style.background = 'rgba(0, 0, 0, 0.8)';
coordDisplay.style.color = '#00ff00';
coordDisplay.style.padding = '8px 12px';
coordDisplay.style.borderRadius = '4px';
coordDisplay.style.fontFamily = 'monospace';
coordDisplay.style.fontSize = '14px';
coordDisplay.style.pointerEvents = 'none';
coordDisplay.style.zIndex = '10001';
coordDisplay.style.display = 'none';
coordDisplay.style.border = '1px solid #00ff00';
document.body.appendChild(coordDisplay);

// 鼠标移动时更新坐标显示位置
let mouseX = 0;
let mouseY = 0;
renderer.domElement.addEventListener('mousemove', (event) => {
  mouseX = event.clientX;
  mouseY = event.clientY;
  if (coordDisplay.style.display !== 'none') {
    coordDisplay.style.left = (mouseX + 15) + 'px';
    coordDisplay.style.top = (mouseY + 15) + 'px';
  }
});

// 鼠标点击事件
renderer.domElement.addEventListener('click', (event) => {
  // 计算鼠标在归一化设备坐标中的位置
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
  
  // 更新raycaster
  raycaster.setFromCamera(mouse, camera);
  
  // 创建地面平面用于检测点击位置
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const intersectPoint = new THREE.Vector3();
  raycaster.ray.intersectPlane(plane, intersectPoint);
  
  // 显示坐标
  coordDisplay.textContent = `📍 Clicked Position: x: ${intersectPoint.x.toFixed(2)}, y: ${intersectPoint.y.toFixed(2)}, z: ${intersectPoint.z.toFixed(2)}`;
  coordDisplay.style.display = 'block';
  coordDisplay.style.left = (event.clientX + 15) + 'px';
  coordDisplay.style.top = (event.clientY + 15) + 'px';
  
  // 3秒后自动隐藏
  setTimeout(() => {
    coordDisplay.style.display = 'none';
  }, 3000);
  
  // 也在控制台输出（可选）
  console.log(`📍 Clicked Position: x: ${intersectPoint.x.toFixed(2)}, y: ${intersectPoint.y.toFixed(2)}, z: ${intersectPoint.z.toFixed(2)}`);
});

// === Entity labels (battery / demand) ===
const labelsContainer = document.createElement('div');
labelsContainer.id = 'entity-labels';
labelsContainer.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:9999;';
document.body.appendChild(labelsContainer);

const _proj = new THREE.Vector3();
function worldToScreen(x, y, z) {
  _proj.set(x, y, z);
  _proj.project(camera);
  const w = window.innerWidth, h = window.innerHeight;
  return {
    x: (_proj.x * 0.5 + 0.5) * w,
    y: (1 - (_proj.y * 0.5 + 0.5)) * h,
    behind: _proj.z > 1
  };
}

function createEntityLabel(kind) {
  const el = document.createElement('div');
  el.style.cssText = 'position:absolute;transform:translate(-50%,-100%);font-size:12px;font-weight:bold;white-space:nowrap;text-shadow:0 1px 2px #000;';
  el.dataset.kind = kind;
  return el;
}

// === Loader ===
const loader = new GLTFLoader();

// === Global State ===
const vehicles = [];
const chargingRobots = [];
const batteryStations = [];
let parkingLot = null;

const ROBOT_BATTERY_KWH = 100;
const VEHICLE_BATTERY_KWH = 80;
const LOW_BATTERY_KWH = ROBOT_BATTERY_KWH * 0.25; // 25%
const ROBOT_Y_OFFSET = 0;      // 小 caddie 高度偏移（降低 1）
const ROBOT_ROT_EXTRA = Math.PI / 2;  // 小 caddie 朝向修正：再旋转 90°

// === Mouse Click Coordinate Detection === (已合并到上面的鼠标点击事件中，无需重复代码)

// === Charging Robot Class ===
class ChargingRobot {
  constructor(model, position, id, homeSpot = null) {
    this.model = model;
    this.id = id;
    this.position = position;
    this.targetVehicle = null;
    this.state = 'idle';
    this.batteryLevel = ROBOT_BATTERY_KWH;
    /** @type {import('gsap').core.Timeline | null} */
    this.timeline = null;
    /** 'rest' | 'charge' | null */
    this.returnReason = null;
    this.homePosition = { ...position };
    this.homeSpot = homeSpot;
    this.lastRow = 3;
    this.lastSide = 'right';
    this.atHome = true;
    this.lastSpotIndex = homeSpot ? homeSpot.index : 33;
  }

  stopCurrentMotion(reason = 'interrupt') {
    if (this.timeline) {
      try {
        this.timeline.kill();
      } catch {
        // ignore
      }
      this.timeline = null;
    }
    // NOTE: do NOT clear battery/spot state here; just stop motion and allow reassignment.
    if (this.state !== 'charging') {
      this.state = 'idle';
      this.returnReason = null;
    }
    console.log(`🛑 Robot${this.id} motion stopped (${reason})`);
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

    const angle = Math.atan2(
      targetPosition.x - currentPos.x,
      targetPosition.z - currentPos.z
    ) + Math.PI / 2 + ROBOT_ROT_EXTRA;

    const tl = gsap.timeline({
      onComplete: () => {
        if (onComplete) onComplete();
      }
    });

    tl.to(this.model.rotation, {
      y: angle,
      duration: 0.8,
      ease: "power1.inOut"
    });

    tl.to(this.model.position, {
      x: targetPosition.x,
      y: targetPosition.y != null ? targetPosition.y : ROBOT_Y_OFFSET,
      z: targetPosition.z,
      duration: duration,
      ease: "none"
    });

    return tl;
  }

  chargeVehicle(vehicle, onComplete) {
    // If robot is returning to rest, allow preemption by new order.
    this.stopCurrentMotion('start charge mission');
    this.state = 'charging';
    this.targetVehicle = vehicle;
    this.returnReason = null;
    const spot = vehicle.parkingSpot;
    if (!spot || !spot.chargePoint) {
      if (onComplete) onComplete();
      return gsap.timeline();
    }
    const cp = spot.chargePoint;
    const chargingPos = { x: cp.x, z: cp.z, y: cp.y != null ? cp.y : 0 };
    const ownCP = this.homeSpot && this.homeSpot.chargePoint
      ? { x: this.homeSpot.chargePoint.x, z: this.homeSpot.chargePoint.z, y: this.homeSpot.chargePoint.y != null ? this.homeSpot.chargePoint.y : 0 }
      : null;
    const currentPos = { x: this.model.position.x, z: this.model.position.z, y: this.model.position.y };
    const SPEED = 3.0;
    const CROSSING_YIELD_DURATION = 1.0;
    const startSpot = this.atHome ? (this.homeSpot?.index ?? 33) : this.lastSpotIndex;
    const endSpot = spot.index;
    let wps = findPathTopoST(startSpot, endSpot, getSimTime(), SPEED);
    if (!wps || wps.length === 0) wps = findPathTopo(startSpot, endSpot);

    const toPos = (w) => ({ x: w.x, z: w.z });
    const fullPath = [currentPos];
    if (this.atHome && ownCP) fullPath.push(ownCP);
    for (let i = 1; i < wps.length; i++) fullPath.push(toPos(wps[i]));
    fullPath.push(chargingPos);

    const runChargeMission = () => {
    let chargeFinishedNormally = false;
    const mainTl = gsap.timeline({
      onComplete: () => {
        if (chargeFinishedNormally) {
          this.state = 'idle';
          this.targetVehicle = null;
          if (onComplete) onComplete();
        }
      }
    });
    this.timeline = mainTl;

    const rot = (dx, dz) => Math.atan2(dx, dz) + Math.PI / 2 + ROBOT_ROT_EXTRA;

    const addPathSegment = (from, to) => {
      const dx = to.x - from.x;
      const dz = to.z - from.z;
      const len = Math.hypot(dx, dz);
      const minDur = 0.05;
      const dur = Math.max(minDur, len / SPEED);
      const angle = rot(dx, dz);
      mainTl.to(this.model.rotation, { y: angle, duration: 0.3, ease: "power1.inOut" });
      mainTl.to(this.model.position, { x: to.x, z: to.z, y: ROBOT_Y_OFFSET, duration: dur, ease: "none" });
      return true;
    };

    const addCrossing = (from, to) => {
      mainTl.to({}, { duration: CROSSING_YIELD_DURATION, onStart: () => console.log(`🔄 Robot${this.id} yielding before lane crossing`) });
      return addPathSegment(from, to);
    };

    const toPos = (w) => ({ x: w.x, z: w.z, y: w.y != null ? w.y : 0 });
    let prev = currentPos;
    if (this.atHome && ownCP) {
      if (addPathSegment(prev, ownCP)) prev = ownCP;
    }
    if (wps.length >= 2) {
      for (let i = 1; i < wps.length; i++) {
        const from = wps[i - 1];
        const to = wps[i];
        const fromP = toPos(from);
        const toP = toPos(to);
        if (isCrossingSegment(from, to)) {
          if (addCrossing(fromP, toP)) prev = toP;
        } else {
          if (addPathSegment(prev, toP)) prev = toP;
        }
      }
    }
    addPathSegment(prev, chargingPos);

    const startDemand = Math.max(0, vehicle.chargeDemandKwh ?? 0);
    const startBattery = this.batteryLevel;
    const chargeDuration = 4;
    const maxTransfer = Math.min(startDemand, startBattery);
    const prog = { p: 0 };
    mainTl.to(prog, {
      p: 1,
      duration: chargeDuration,
      ease: "none",
      onStart: () => console.log(`🤖 Robot${this.id} at charge point (service)`),
      onUpdate: () => {
        const transferred = maxTransfer * prog.p;
        vehicle.chargeDemandKwh = Math.max(0, startDemand - transferred);
        this.batteryLevel = Math.max(0, startBattery - transferred);
      }
    });
    mainTl.to({}, {
      duration: 0,
      onComplete: () => {
        chargeFinishedNormally = true;
        this.lastRow = getSpotRow(spot.index);
        this.lastSide = spot.side;
        this.lastSpotIndex = spot.index;
        this.atHome = false;
      }
    });
    return mainTl;
    };

    const tryStart = () => {
      if (isPathBlockedByVehicles(fullPath, SPEED)) {
        setTimeout(tryStart, 500);
        return;
      }
      runChargeMission();
    };
    tryStart();
    return gsap.timeline();
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
      const chargeTl = gsap.timeline({
        onComplete: () => {
          this.state = 'idle';
          this.batteryLevel = ROBOT_BATTERY_KWH;
          if (onComplete) onComplete();
        }
      });
      const rot = (dx, dz) => Math.atan2(dx, dz) + Math.PI / 2 + ROBOT_ROT_EXTRA;
      const dx = stationPos.x - chargingPos.x;
      const dz = stationPos.z - chargingPos.z;
      chargeTl.to(this.model.rotation, { y: rot(dx, dz), duration: 0.8, ease: "power1.inOut" });
      chargeTl.to({}, { duration: 2, onStart: () => console.log(`🔌 Robot${this.id} self-charging at station...`) });
      chargeTl.to({}, { duration: 0, onComplete: () => console.log(`✅ Robot${this.id} self-charging complete`) });
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
    return this.batteryLevel < LOW_BATTERY_KWH;
  }

  returnHomeAndCharge(onComplete) {
    this.stopCurrentMotion('return home');
    this.state = 'returning';
    this.returnReason = 'charge';
    const homeSpot = this.homeSpot;
    const homeRow = homeSpot ? getSpotRow(homeSpot.index) : 3;
    const homeSide = homeSpot?.side ?? 'right';
    const SPEED = 3.0;
    const CROSSING_YIELD = 1.0;
    const rot = (dx, dz) => Math.atan2(dx, dz) + Math.PI / 2 + ROBOT_ROT_EXTRA;
    const currentPos = { x: this.model.position.x, z: this.model.position.z, y: this.model.position.y };
    const startSpot = this.lastSpotIndex;
    const endSpot = homeSpot?.index ?? 33;
    let wps = findPathTopoST(startSpot, endSpot, getSimTime(), SPEED);
    if (!wps || wps.length === 0) wps = findPathTopo(startSpot, endSpot);

    const toPosR = (w) => ({ x: w.x, z: w.z });
    const fullPath = [currentPos];
    for (let i = 1; i < wps.length; i++) fullPath.push(toPosR(wps[i]));
    fullPath.push({ x: this.homePosition.x, z: this.homePosition.z });

    const runReturnHome = () => {
    const addPathSegment = (from, to) => {
      const dx = to.x - from.x;
      const dz = to.z - from.z;
      const len = Math.hypot(dx, dz);
      const minDur = 0.05;
      const dur = Math.max(minDur, len / SPEED);
      const angle = rot(dx, dz);
      tl.to(this.model.rotation, { y: angle, duration: 0.3, ease: "power1.inOut" });
      tl.to(this.model.position, { x: to.x, z: to.z, y: ROBOT_Y_OFFSET, duration: dur, ease: "none" });
      return true;
    };
    const addCrossing = (from, to) => {
      tl.to({}, { duration: CROSSING_YIELD });
      return addPathSegment(from, to);
    };

    const tl = gsap.timeline({
      onComplete: () => {
        this.state = 'idle';
        this.returnReason = null;
        this.lastRow = homeRow;
        this.lastSide = homeSide;
        this.atHome = true;
        this.lastSpotIndex = endSpot;
        if (onComplete) onComplete();
      }
    });
    this.timeline = tl;

    const toPos = (w) => ({ x: w.x, z: w.z, y: w.y != null ? w.y : 0 });
    let prev = currentPos;
    for (let i = 1; i < wps.length; i++) {
      const from = wps[i - 1];
      const to = wps[i];
      const fromP = toPos(from);
      const toP = toPos(to);
      if (isCrossingSegment(from, to)) {
        if (addCrossing(fromP, toP)) prev = toP;
      } else {
        if (addPathSegment(prev, toP)) prev = toP;
      }
    }
    addPathSegment(prev, this.homePosition);
    return tl;
    };

    const tryStart = () => {
      if (isPathBlockedByVehicles(fullPath, SPEED)) {
        setTimeout(tryStart, 500);
        return;
      }
      runReturnHome();
    };
    tryStart();
    return gsap.timeline();
  }

  // Return to rest point (home) when there is no new order.
  // If a new order arrives during this motion, assignRobotToVehicle can preempt it (stopCurrentMotion + chargeVehicle).
  returnToRest(onComplete) {
    this.stopCurrentMotion('return to rest');
    this.state = 'returning';
    this.returnReason = 'rest';

    const homeSpot = this.homeSpot;
    const homeRow = homeSpot ? getSpotRow(homeSpot.index) : 3;
    const homeSide = homeSpot?.side ?? 'right';
    const SPEED = 3.0;
    const CROSSING_YIELD = 1.0;
    const rot = (dx, dz) => Math.atan2(dx, dz) + Math.PI / 2 + ROBOT_ROT_EXTRA;
    const currentPos = { x: this.model.position.x, z: this.model.position.z, y: this.model.position.y };
    const startSpot = this.lastSpotIndex;
    const endSpot = homeSpot?.index ?? 33;

    let wps = findPathTopoST(startSpot, endSpot, getSimTime(), SPEED);
    if (!wps || wps.length === 0) wps = findPathTopo(startSpot, endSpot);

    const toPosR = (w) => ({ x: w.x, z: w.z });
    const fullPath = [currentPos];
    for (let i = 1; i < wps.length; i++) fullPath.push(toPosR(wps[i]));
    fullPath.push({ x: this.homePosition.x, z: this.homePosition.z });

    const runReturn = () => {
      const addPathSegment = (from, to) => {
        const dx = to.x - from.x;
        const dz = to.z - from.z;
        const len = Math.hypot(dx, dz);
        const dur = Math.max(0.05, len / SPEED);
        const angle = rot(dx, dz);
        tl.to(this.model.rotation, { y: angle, duration: 0.3, ease: "power1.inOut" });
        tl.to(this.model.position, { x: to.x, z: to.z, y: ROBOT_Y_OFFSET, duration: dur, ease: "none" });
        return true;
      };
      const addCrossing = (from, to) => {
        tl.to({}, { duration: CROSSING_YIELD });
        return addPathSegment(from, to);
      };

      const tl = gsap.timeline({
        onComplete: () => {
          this.state = 'idle';
          this.returnReason = null;
          this.lastRow = homeRow;
          this.lastSide = homeSide;
          this.atHome = true;
          this.lastSpotIndex = endSpot;
          if (onComplete) onComplete();
        }
      });
      this.timeline = tl;

      const toPos = (w) => ({ x: w.x, z: w.z, y: w.y != null ? w.y : 0 });
      let prev = currentPos;
      for (let i = 1; i < wps.length; i++) {
        const from = wps[i - 1];
        const to = wps[i];
        const fromP = toPos(from);
        const toP = toPos(to);
        if (isCrossingSegment(from, to)) {
          if (addCrossing(fromP, toP)) prev = toP;
        } else {
          if (addPathSegment(prev, toP)) prev = toP;
        }
      }
      addPathSegment(prev, this.homePosition);
      return tl;
    };

    const tryStart = () => {
      if (isPathBlockedByVehicles(fullPath, SPEED)) {
        setTimeout(tryStart, 500);
        return;
      }
      runReturn();
    };
    tryStart();
    return gsap.timeline();
  }
}

// === Load Parking Lot === (暂时不显示)
// loader.load(
//   '/Parking_fixed.glb',
//   (gltf) => {
//     parkingLot = gltf.scene;
//     parkingLot.scale.set(1, 1, 1);
//     parkingLot.traverse((obj) => {
//       if (obj.isMesh) {
//         obj.receiveShadow = true;
//         obj.castShadow = true;
//       }
//     });
//     scene.add(parkingLot);
//     console.log('✅ Parking lot loaded');
//   },
//   undefined,
//   (err) => console.error('❌ Parking lot load error:', err)
// );

// === Gray background + Parking lines overlay（同位置，先灰底再白线）===
const texLoader = new THREE.TextureLoader();
const _pw = PARKING_LOT_BOUNDS.bottomRight.x - PARKING_LOT_BOUNDS.topLeft.x;
const _pd = PARKING_LOT_BOUNDS.bottomRight.z - PARKING_LOT_BOUNDS.topLeft.z;
const _pcx = (PARKING_LOT_BOUNDS.topLeft.x + PARKING_LOT_BOUNDS.bottomRight.x) / 2;
const _pcz = (PARKING_LOT_BOUNDS.topLeft.z + PARKING_LOT_BOUNDS.bottomRight.z) / 2;
const _pgeo = () => new THREE.PlaneGeometry(_pw, _pd);
const _ppos = () => ({ x: _pcx, y: 0, z: _pcz - 1.7 });
const _pscale = 1.118;
const _prot = -Math.PI / 2;

// Gray background (temporarily commented out)
// texLoader.load(
//   '/textures/gray_background_matched.png',
//   (mapGray) => {
//     mapGray.colorSpace = THREE.SRGBColorSpace;
//     const geo = _pgeo();
//     const mat = new THREE.MeshBasicMaterial({
//       map: mapGray,
//       side: THREE.DoubleSide
//     });
//     const plane = new THREE.Mesh(geo, mat);
//     plane.rotation.x = _prot;
//     plane.position.set(_ppos().x, _ppos().y - 0.005, _ppos().z+1.1);
//     plane.scale.set(_pscale+0.08, _pscale-0.08, _pscale);
//     scene.add(plane);
//     console.log('✅ Gray background overlay applied');
//   },
//   undefined,
//   (err) => console.error('❌ gray_background_matched.png load error:', err)
// );

// Parking lines overlay (decoupled, loads independently)
texLoader.load(
  '/textures/parking_lines_white.png',
  (map) => {
    map.colorSpace = THREE.SRGBColorSpace;
    const geo2 = _pgeo();
    const mat2 = new THREE.MeshStandardMaterial({
      map,
      color: 0xffffff,              // 纯白
      roughness: 0.3,
      metalness: 0.0,
    
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 0.35,      // 更亮、更白
    
      transparent: true,
      alphaTest: 0.1,
    
      polygonOffset: true,          // ⭐防止Z-fighting
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    
      side: THREE.DoubleSide
    });
    
    const plane2 = new THREE.Mesh(geo2, mat2);
    plane2.rotation.x = _prot;
    plane2.position.set(_ppos().x, _ppos().y, _ppos().z);
    plane2.scale.set(_pscale, _pscale, _pscale);
    scene.add(plane2);
    console.log('✅ Parking lines overlay applied');
  },
  undefined,
  (err) => console.error('❌ parking_lines_white.png load error:', err)
);

// === Load Background Building (Treasure Island) ===
loader.load(
  '/Treasure_Island_3.glb',
  (gltf) => {
    const bg = gltf.scene;
    bg.scale.set(50, 50, 50);
    bg.position.set(-1, 8.05, -42);
    bg.rotation.x = -Math.PI / 60;
    bg.traverse((obj) => {
      if (obj.isMesh) {
        obj.receiveShadow = true;
        obj.castShadow = true;
      }
    });
    scene.add(bg);
    console.log('✅ Treasure Island background loaded');
  },
  undefined,
  (err) => console.error('❌ Treasure Island load error:', err)
);

// 已移除充电站蓝色立方体；小 caddie 在 33、34 车位上自动充电

// === Load Charging Robots (Small Caddie) ===
// 小机器人初始位置：33、34 车位中心；出发/返回必须经过所属车位的 charge point
const spot33 = PARKING_SPOTS.find((s) => s.index === 33);
const spot34 = PARKING_SPOTS.find((s) => s.index === 34);
const robotHomeSpots = [spot33, spot34];
const robotPositions = robotHomeSpots.map((s) => ({
  x: s.x,
  y: (s.y != null ? s.y : 0) + ROBOT_Y_OFFSET,
  z: s.z
}));

robotPositions.forEach((pos, idx) => {
  console.log(`📦 Attempting to load robot ${idx + 1} from X-Caddie_textured.glb`);
  console.log(`   Position: (${pos.x}, ${pos.y}, ${pos.z})`);
  
  loader.load(
      '/X-Caddie_textured.glb',
      (gltf) => {
        console.log(`✅ Robot ${idx + 1} model loaded successfully`);
        console.log(`   Scene has ${gltf.scene.children.length} children`);
      const robotModel = gltf.scene.clone();
      robotModel.scale.set(1, 1, 1);
      robotModel.position.set(pos.x, pos.y, pos.z);
      robotModel.rotation.y = Math.PI / 2 + ROBOT_ROT_EXTRA;
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
                material.aoMapIntensity = 0.4;  // 降低 AO 暗部，整体更亮
              }
              
              // Only set fallback if material has no color/texture data
              if (!material.map && (!material.color || (material.color.r === 0 && material.color.g === 0 && material.color.b === 0))) {
                material.color = new THREE.Color(0xcccccc);
                console.log(`⚠️ Small caddie material has no color data, using light gray fallback`);
              }
              
              // Ensure PBR materials respond to lighting, brighten X-Caddie
              if (material.isMeshStandardMaterial || material.isMeshPhysicalMaterial) {
                if (material.envMapIntensity !== undefined) material.envMapIntensity = 0.3;
                if (material.roughness !== undefined) material.roughness = Math.min(1, (material.roughness ?? 0.5) + 0.1);
                if (material.color) material.color.multiplyScalar(1.05);  // 提亮基础色
                material.emissive = material.emissive || new THREE.Color(0x888888);
                material.emissiveIntensity = (material.emissiveIntensity ?? 0) + 0.0;
              }
              material.needsUpdate = true;
            });
          } else {
            // Create default material only if completely missing
            obj.material = new THREE.MeshStandardMaterial({
              color: 0xcccccc,
              metalness: 0.5,
              roughness: 0.1,
              envMapIntensity: 0.3
            });
            console.log(`⚠️ Small caddie mesh has no material, created PBR default`);
          }
        }
      });
      scene.add(robotModel);

      const robot = new ChargingRobot(robotModel, pos, idx + 1, robotHomeSpots[idx]);
      const bl = createEntityLabel('battery');
      labelsContainer.appendChild(bl);
      robot.batteryLabel = bl;
      chargingRobots.push(robot);
      console.log(`🤖 Charging Robot ${idx + 1} loaded at (${pos.x}, ${pos.y}, ${pos.z})`);
      console.log(`   Initial rotation: y = ${robotModel.rotation.y} (${(robotModel.rotation.y * 180 / Math.PI).toFixed(1)}°)`);
      console.log(`   State: ${robot.state}, Battery: ${robot.batteryLevel}%`);
      console.log(`   Total robots in system: ${chargingRobots.length}`);
      
      // Verify robot is properly initialized
      if (robot.state !== 'idle') {
        console.warn(`⚠️ Robot ${idx + 1} not in idle state! Current state: ${robot.state}`);
      }
      if (robot.batteryLevel <= LOW_BATTERY_KWH) {
        console.warn(`⚠️ Robot ${idx + 1} battery low: ${robot.batteryLevel.toFixed(1)} kWh`);
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
          robotModel.rotation.y = Math.PI / 2 + ROBOT_ROT_EXTRA;
          robotModel.traverse((obj) => {
            if (obj.isMesh) obj.castShadow = true;
          });
          reduceReflections(robotModel, 0.3);
          scene.add(robotModel);

          const robot = new ChargingRobot(robotModel, pos, idx + 1, robotHomeSpots[idx]);
          const bl = createEntityLabel('battery');
          labelsContainer.appendChild(bl);
          robot.batteryLabel = bl;
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

// === Define 44 Parking Spots ===
// 使用从 orderSystem.js 导入的44个停车位
const parkingSpots = PARKING_SPOTS.map(spot => ({
  ...spot,
  y: spot.y || 1 // 确保y坐标为1
}));

// Track which parking spots are occupied (保持兼容性)
const occupiedSpots = new Set();

// === Initialize Order Manager ===
const robotInitialPositions = robotPositions.map((p) => ({ x: p.x, y: p.y, z: p.z }));
const orderManager = new OrderManager(robotInitialPositions);

// === Visualize Parking Spots (for debugging) ===
function visualizeParkingSpots() {
  parkingSpots.forEach((spot) => {
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
    const numberLabel = createNumberLabelWithCircle(spot.index, 130);
    numberLabel.position.set(spot.x, 0.01, spot.z);
    scene.add(numberLabel);
    
    console.log(`📍 Parking spot ${spot.index} (${spot.side}): (${spot.x.toFixed(2)}, ${spot.z.toFixed(2)})`);
  });
  console.log(`✅ Visualized ${parkingSpots.length} parking spots with number labels on ground`);
}

// === Visualize Graph Structures (Robot & Vehicle) on Ground ===
const GRAPH_Y = 0.025;

function visualizeGraphStructures() {
  const nodeById = (nodes) => {
    const m = new Map();
    for (const n of nodes) m.set(n.id, n);
    return m;
  };

  // Robot graph (topology): cyan/teal
  const robotData = getGraphData();
  const robotNodes = nodeById(robotData.nodes);
  const robotPositions = [];
  for (const e of robotData.edges) {
    const a = robotNodes.get(e.from);
    const b = robotNodes.get(e.to);
    if (a && b) {
      robotPositions.push(a.x, GRAPH_Y, a.z, b.x, GRAPH_Y, b.z);
    }
  }
  if (robotPositions.length > 0) {
    const robotGeom = new THREE.BufferAttribute(new Float32Array(robotPositions), 3);
    const robotGeo = new THREE.BufferGeometry();
    robotGeo.setAttribute('position', robotGeom);
    const robotLines = new THREE.LineSegments(
      robotGeo,
      new THREE.LineBasicMaterial({ color: 0x00bcd4, linewidth: 1 })
    );
    robotLines.frustumCulled = false;
    scene.add(robotLines);
  }

  // Vehicle graph (keypoint): orange
  const vehiclePositions = [];
  for (const e of KP_EDGES) {
    const a = KP_NODES.get(e.from);
    const b = KP_NODES.get(e.to);
    if (a && b) {
      vehiclePositions.push(a.x, GRAPH_Y, a.z, b.x, GRAPH_Y, b.z);
    }
  }
  if (vehiclePositions.length > 0) {
    const vehicleGeom = new THREE.BufferAttribute(new Float32Array(vehiclePositions), 3);
    const vehicleGeo = new THREE.BufferGeometry();
    vehicleGeo.setAttribute('position', vehicleGeom);
    const vehicleLines = new THREE.LineSegments(
      vehicleGeo,
      new THREE.LineBasicMaterial({ color: 0xff9800, linewidth: 1 })
    );
    vehicleLines.frustumCulled = false;
    scene.add(vehicleLines);
  }

  // Parking spot centroids (vehicle final targets): draw as part of "vehicle graph"
  // Show:
  // - spot nodes (amber)
  // - connectors from lane centerline (z=-22.5/-6.5) to spot center (x=spot.center.x, z=spot.center.z)
  if (Array.isArray(parkingSpots) && parkingSpots.length) {
    const spotConnectorPositions = [];
    for (const s of parkingSpots) {
      // Match keypoint_graph lane z definitions:
      // slots 25-44 -> lane z = -6.5, slots 1-24 -> lane z = -22.5
      const laneZ = (s.index >= 25) ? -6.5 : -22.5;
      // lane merge point at same x (example: slot1 -> (-22.25,-22.5), slot2 -> (-19,-22.5))
      spotConnectorPositions.push(s.x, GRAPH_Y, laneZ, s.x, GRAPH_Y, s.z);
    }
    const spotConnGeo = new THREE.BufferGeometry();
    spotConnGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(spotConnectorPositions), 3)
    );
    const spotConnLines = new THREE.LineSegments(
      spotConnGeo,
      // Use same orange as vehicle keypoint graph for clarity
      new THREE.LineBasicMaterial({ color: 0xff9800, transparent: true, opacity: 0.9 })
    );
    spotConnLines.frustumCulled = false;
    scene.add(spotConnLines);
  }

  // Node markers: small circles
  const dotGeom = new THREE.CircleGeometry(0.2, 12);
  const robotDotMat = new THREE.MeshBasicMaterial({ color: 0x00bcd4, side: THREE.DoubleSide });
  const vehicleDotMat = new THREE.MeshBasicMaterial({ color: 0xff9800, side: THREE.DoubleSide });
  const spotDotMat = new THREE.MeshBasicMaterial({ color: 0xffc107, side: THREE.DoubleSide });
  for (const n of robotData.nodes) {
    const dot = new THREE.Mesh(dotGeom, robotDotMat);
    dot.rotation.x = -Math.PI / 2;
    dot.position.set(n.x, GRAPH_Y, n.z);
    scene.add(dot);
  }
  for (const [, n] of KP_NODES) {
    const dot = new THREE.Mesh(dotGeom, vehicleDotMat);
    dot.rotation.x = -Math.PI / 2;
    dot.position.set(n.x, GRAPH_Y, n.z);
    scene.add(dot);
  }

  // Lane-centerline connector nodes for each parking spot (draw in orange)
  // This makes the "lane points" explicit (e.g. x=-22.25,z=-22.5; x=-19,z=-22.5).
  if (Array.isArray(parkingSpots) && parkingSpots.length) {
    for (const s of parkingSpots) {
      const laneZ = (s.index >= 25) ? -6.5 : -22.5;
      const dot = new THREE.Mesh(dotGeom, vehicleDotMat);
      dot.rotation.x = -Math.PI / 2;
      dot.position.set(s.x, GRAPH_Y, laneZ);
      scene.add(dot);
    }
  }

  // Parking spot centroid nodes (vehicle final parking targets)
  if (Array.isArray(parkingSpots) && parkingSpots.length) {
    for (const s of parkingSpots) {
      const dot = new THREE.Mesh(dotGeom, spotDotMat);
      dot.rotation.x = -Math.PI / 2;
      dot.position.set(s.x, GRAPH_Y, s.z);
      scene.add(dot);
    }
  }

  console.log('✅ Graph structures visualized: robot (cyan), vehicle keypoints (orange), parking spots (amber)');
}

// === Visualize Charge Points ===
function visualizeChargePoints() {
  const markerGeom = new THREE.CylinderGeometry(0.35, 0.35, 0.04, 24);
  const markerMat = new THREE.MeshBasicMaterial({ color: 0xff9800 });
  parkingSpots.forEach((spot) => {
    if (!spot.chargePoint) return;
    const cp = spot.chargePoint;
    const marker = new THREE.Mesh(markerGeom, markerMat);
    marker.position.set(cp.x, 0.02, cp.z);
    marker.rotation.x = 0;
    marker.rotation.z = 0;
    scene.add(marker);
  });
  console.log(`✅ Visualized ${parkingSpots.length} charge points on map`);
}

// === Load Vehicles with Order System ===
function createVehicleSequence() {
  let vehicleCounter = 0;

  function spawnVehicleFromOrder() {
    // 使用订单系统创建新订单
    const order = orderManager.createOrder();
    if (!order) {
      console.log('⚠️ No available parking spots, waiting...');
      setTimeout(() => spawnVehicleFromOrder(), 5000);
      return;
    }
    
    vehicleCounter++;
    const selectedSpot = order.parkingSpot;
    const parkingSpotIndex = selectedSpot.index - 1; // 转换为0-based索引（用于兼容性）
    
    // 更新occupiedSpots以保持兼容性
    occupiedSpots.add(parkingSpotIndex);
    console.log(`🅿️ Vehicle ${vehicleCounter} assigned to spot ${selectedSpot.index} (${selectedSpot.side} side) via Order ${order.id}`);
    
    loader.load(
      '/red_car.glb',
      (gltf) => {
        const car = gltf.scene.clone();
        car.scale.set(0.007, 0.007, 0.007);
        car.position.set(KP.ENTRANCE.x, 0.9, KP.ENTRANCE.z);
        car.rotation.y = Math.PI;
        car.traverse((obj) => {
          if (obj.isMesh) {
            obj.castShadow = true;
            obj.receiveShadow = true;
          }
        });
        reduceReflections(car, 0.3);
        scene.add(car);

        const targetParkingSpot = {
          x: selectedSpot.x,
          z: selectedSpot.z,
          y: selectedSpot.y
        };

        const vehicle = {
          model: car,
          position: targetParkingSpot,
          parkingSpot: selectedSpot,
          id: vehicleCounter,
          orderId: order.id,
          needsCharging: true,
          chargeDemandKwh: 10 + Math.random() * 10,
          slotGroup: getSlotGroup(selectedSpot.index),
          phase: 'entering'
        };
        const dl = createEntityLabel('demand');
        labelsContainer.appendChild(dl);
        vehicle.demandLabel = dl;
        vehicles.push(vehicle);
        orderManager.assignVehicle(order.id, vehicleCounter);
        collisionAvoidance.addOccupiedPosition(
          { x: KP.ENTRANCE.x, z: KP.ENTRANCE.z },
          `vehicle_${vehicleCounter}`,
          'car'
        );

        console.log(`🚗 Vehicle ${vehicleCounter} entering parking lot`);
        console.log(`   Target spot: ${selectedSpot.side} side, index ${selectedSpot.index} at (${targetParkingSpot.x.toFixed(2)}, ${targetParkingSpot.z.toFixed(2)})`);

        const startEnterAnimation = () => {
        const VEHICLE_SPEED = 4.0;
        const VEHICLE_Y = 0.9;
        const vehiclePath = planEnterPath(selectedSpot.index, targetParkingSpot, 2);
        vehiclePath.push({ x: targetParkingSpot.x, z: targetParkingSpot.z });

        reservePath(vehiclePath, getSimTime(), VEHICLE_SPEED, `vehicle_${vehicleCounter}`);

        const tl = gsap.timeline({
          onComplete: () => {
            vehicle.phase = 'parked';
            console.log(`🚗 Vehicle ${vehicleCounter} parked at ${selectedSpot.side} side spot ${selectedSpot.index}`);
            assignRobotToVehicle(vehicle);
          }
        });

        const segLengths = [];
        let totalLen = 0;
        for (let i = 1; i < vehiclePath.length; i++) {
          const d = Math.hypot(vehiclePath[i].x - vehiclePath[i - 1].x, vehiclePath[i].z - vehiclePath[i - 1].z);
          segLengths.push(d);
          totalLen += d;
        }
        const totalDur = totalLen / VEHICLE_SPEED;
        const prog = { t: 0 };
        tl.to(prog, {
          t: 1,
          duration: totalDur,
          ease: 'none',
          onUpdate: () => {
            let rem = prog.t * totalLen;
            for (let i = 0; i < segLengths.length; i++) {
              if (rem <= segLengths[i]) {
                const t = segLengths[i] > 0 ? rem / segLengths[i] : 1;
                const a = vehiclePath[i];
                const b = vehiclePath[i + 1];
                car.position.x = a.x + t * (b.x - a.x);
                car.position.z = a.z + t * (b.z - a.z);
                car.position.y = VEHICLE_Y;
                car.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
                return;
              }
              rem -= segLengths[i];
            }
            const last = vehiclePath[vehiclePath.length - 1];
            car.position.set(last.x, VEHICLE_Y, last.z);
          }
        });
        const parkAngle = selectedSpot.opening === '+z' ? Math.PI : 0;
        tl.to(car.rotation, { y: parkAngle, duration: 0.5, ease: 'power1.inOut' });
        };

        const tryStartEnter = () => {
          if (isVehicleNearEntryTurn(vehicles, vehicle.slotGroup, vehicle.id)) {
            setTimeout(tryStartEnter, 300);
            return;
          }
          startEnterAnimation();
        };
        tryStartEnter();

        // After charging, vehicle leaves
        const checkAndLeave = () => {
          if (!vehicle.needsCharging) {
            if (isVehicleBehindOnLane(vehicles, selectedSpot.index, targetParkingSpot.x, vehicle.id) ||
                isVehicleAheadOnExitLane(vehicles, selectedSpot.index, targetParkingSpot.x, vehicle.id)) {
              setTimeout(checkAndLeave, 300);
              return;
            }
            vehicle.phase = 'leaving';
            const VEHICLE_SPEED = 4.0;
            const VEHICLE_Y = 0.9;
            const leaveTl = gsap.timeline({
              onComplete: () => {
                if (vehicle.demandLabel && vehicle.demandLabel.parentNode) vehicle.demandLabel.remove();
                scene.remove(car);
                const index = vehicles.indexOf(vehicle);
                if (index > -1) vehicles.splice(index, 1);
                occupiedSpots.delete(parkingSpotIndex);
                if (vehicle.orderId) {
                  orderManager.completeOrder(vehicle.orderId);
                }
                collisionAvoidance.removeOccupiedPosition(`vehicle_${vehicleCounter}`);
                releaseAgent(`vehicle_${vehicleCounter}`);
                console.log(`🚗 Vehicle ${vehicleCounter} left, spot ${selectedSpot.index} is now available`);
              }
            });
            
            let exitPath = [
              targetParkingSpot,
              ...planExitPath(selectedSpot.index, targetParkingSpot, 2)
            ];
            const exitStartTime = getSimTime() + 0.8;
            reservePath(exitPath, exitStartTime, VEHICLE_SPEED, `vehicle_${vehicleCounter}`);
            const exitBackRotation = selectedSpot.opening === '+z' ? 0 : Math.PI;
            if (Math.abs(car.rotation.y - exitBackRotation) > 0.1) {
              leaveTl.to(car.rotation, { y: exitBackRotation, duration: 0.8, ease: "power1.inOut" });
            }
            const runPathSegment = (path) => {
              if (path.length < 2) return;
              const exSegLen = [];
              let exTotal = 0;
              for (let i = 1; i < path.length; i++) {
                const d = Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z);
                exSegLen.push(d);
                exTotal += d;
              }
              const duration = Math.max(0.1, exTotal / VEHICLE_SPEED);
              const exProg = { t: 0 };
              leaveTl.to(exProg, {
                t: 1,
                duration,
                ease: 'none',
                onUpdate: () => {
                  let rem = exProg.t * exTotal;
                  for (let i = 0; i < exSegLen.length; i++) {
                    if (rem <= exSegLen[i]) {
                      const t = exSegLen[i] > 0 ? rem / exSegLen[i] : 1;
                      const a = path[i], b = path[i + 1];
                      car.position.set(a.x + t * (b.x - a.x), VEHICLE_Y, a.z + t * (b.z - a.z));
                      car.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
                      return;
                    }
                    rem -= exSegLen[i];
                  }
                  const last = path[path.length - 1];
                  car.position.set(last.x, VEHICLE_Y, last.z);
                }
              });
            };
            runPathSegment(exitPath);
            leaveTl.to(car.position, { y: -1, duration: 0.5, ease: "power1.inOut" });
          } else {
            setTimeout(checkAndLeave, 2000);
          }
        };
        
        vehicle.requestLeaveCheck = checkAndLeave;
        setTimeout(checkAndLeave, 10000);
      },
      undefined,
      (err) => console.error(`❌ Vehicle ${vehicleCounter} load error:`, err)
    );
  }

  // Spawn vehicles periodically using order system
  function scheduleNextOrder() {
    const delay = 10000 + Math.random() * 5000; // 10-15秒随机延迟
    setTimeout(() => {
      if (vehicles.length < 10) { // Limit concurrent vehicles
        spawnVehicleFromOrder();
      }
      scheduleNextOrder();
    }, delay);
  }
  
  // 启动订单生成
  setTimeout(() => scheduleNextOrder(), 5000); // 5秒后开始
}

function totalDemandKwh() {
  return vehicles
    .filter(v => v.needsCharging)
    .reduce((s, v) => s + (v.chargeDemandKwh ?? 0), 0);
}

function assignRobotToVehicle(vehicle) {
  console.log(`🔍 Looking for available robot. Total robots: ${chargingRobots.length}`);
  const total = totalDemandKwh();
  chargingRobots.forEach((robot, idx) => {
    console.log(`  Robot ${idx + 1}: state=${robot.state}, battery=${robot.batteryLevel.toFixed(1)} kWh`);
  });

  let availableRobot = chargingRobots.find(robot => {
    // Prefer idle robots
    if (robot.state !== 'idle') return false;
    if (robot.batteryLevel <= LOW_BATTERY_KWH) return false;
    if (robot.atHome && robot.batteryLevel < ROBOT_BATTERY_KWH) return false;
    if (robot.batteryLevel < total) return false;
    return true;
  });

  // If no idle robot, allow preemption: robots returning to REST can be redirected to a new order.
  if (!availableRobot) {
    availableRobot = chargingRobots.find(robot => {
      if (robot.state !== 'returning') return false;
      if (robot.returnReason !== 'rest') return false;
      if (robot.batteryLevel <= LOW_BATTERY_KWH) return false;
      if (robot.batteryLevel < total) return false;
      return true;
    });
  }

  if (!availableRobot) {
    console.log('⚠️ No available robots, vehicle will wait... Retrying in 2 seconds...');
    setTimeout(() => assignRobotToVehicle(vehicle), 2000);
    return;
  }

  availableRobot.chargeVehicle(vehicle, () => {
    vehicle.needsCharging = false;
    if (typeof vehicle.requestLeaveCheck === 'function') vehicle.requestLeaveCheck();
    const t = totalDemandKwh();
    if (
      availableRobot.batteryLevel < LOW_BATTERY_KWH ||
      availableRobot.batteryLevel < t ||
      t === 0
    ) {
      // Low battery: go home and recharge
      if (availableRobot.batteryLevel < LOW_BATTERY_KWH) {
        availableRobot.returnHomeAndCharge(() => {});
      } else if (t === 0) {
        // No new orders: return to rest point
        availableRobot.returnToRest(() => {});
      } else {
        // Battery insufficient for remaining demand: recharge first
        availableRobot.returnHomeAndCharge(() => {});
      }
    }
  });
}

// === Test if small_caddie.glb is accessible ===
fetch('/X-Caddie_textured.glb', { method: 'HEAD' })
  .then(response => {
    if (response.ok) {
      console.log('✅ X-Caddie_textured.glb is accessible via HTTP');
      console.log(`   File size: ${response.headers.get('content-length')} bytes`);
    } else {
      console.error(`❌ X-Caddie_textured.glb HTTP error: ${response.status} ${response.statusText}`);
    }
  })
  .catch(err => {
    console.error('❌ Cannot access X-Caddie_textured.glb:', err);
    console.error('   Make sure the dev server is running and the file is in the public folder');
  });

// === Start Simulation ===
setTimeout(() => {
  console.log('🚀 Starting EV charging simulation...');
  console.log(`📊 System status: ${chargingRobots.length} robots, ${batteryStations.length} battery stations`);
  console.log(`🅿️ Total parking spots: ${parkingSpots.length}`);

  visualizeGraphStructures();

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
  
  const LABEL_Y_OFFSET = 2.2;

  vehicles.forEach(vehicle => {
    if (vehicle.model && vehicle.model.position) {
      collisionAvoidance.addOccupiedPosition(
        { x: vehicle.model.position.x, z: vehicle.model.position.z },
        `vehicle_${vehicle.id}`,
        'car'
      );
    }
    if (vehicle.demandLabel && vehicle.model && vehicle.model.position) {
      const p = vehicle.model.position;
      const s = worldToScreen(p.x, p.y + LABEL_Y_OFFSET, p.z);
      vehicle.demandLabel.style.display = s.behind ? 'none' : 'block';
      vehicle.demandLabel.style.left = s.x + 'px';
      vehicle.demandLabel.style.top = s.y + 'px';
      const d = (vehicle.chargeDemandKwh ?? 0);
      const pct = Math.min(100, Math.round((d / VEHICLE_BATTERY_KWH) * 100));
      vehicle.demandLabel.textContent = `${pct}%`;
      vehicle.demandLabel.style.color = pct <= 20 ? '#22c55e' : '#ef4444';
    }
  });
  
  chargingRobots.forEach(robot => {
    if (robot.model && robot.model.position) {
      collisionAvoidance.addOccupiedPosition(
        { x: robot.model.position.x, z: robot.model.position.z },
        `robot_${robot.id}`,
        'caddie'
      );
    }
    if (robot.batteryLabel && robot.model && robot.model.position) {
      const p = robot.model.position;
      const s = worldToScreen(p.x, p.y + LABEL_Y_OFFSET, p.z);
      robot.batteryLabel.style.display = s.behind ? 'none' : 'block';
      robot.batteryLabel.style.left = s.x + 'px';
      robot.batteryLabel.style.top = s.y + 'px';
      const bpct = Math.min(100, Math.round((robot.batteryLevel / ROBOT_BATTERY_KWH) * 100));
      robot.batteryLabel.textContent = `${bpct}%`;
      robot.batteryLabel.style.color = bpct > 40 ? '#22c55e' : '#ef4444';
    }
    if (robot.state === 'idle' && robot.atHome && robot.homePosition) {
      const dx = robot.model.position.x - robot.homePosition.x;
      const dz = robot.model.position.z - robot.homePosition.z;
      if (dx * dx + dz * dz < 2.5 * 2.5) {
        robot.batteryLevel = Math.min(ROBOT_BATTERY_KWH, robot.batteryLevel + 0.15);
      }
    }
    const t = totalDemandKwh();
    if (
      robot.state === 'idle' &&
      !robot.atHome &&
      (robot.batteryLevel < LOW_BATTERY_KWH || t === 0 || robot.batteryLevel < t)
    ) {
      robot.returnHomeAndCharge(() => {});
    }
  });
  
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
