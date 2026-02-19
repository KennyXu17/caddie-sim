/**
 * 冲突诊断调试层：GATE_WAIT 连线、胶囊体边界、资源锁可视化
 */

import * as THREE from 'three';

let enabled = false;
const gateWaits = new Map(); // agentId -> { pos, blockerPos, blockerId }
const capsuleOutlines = []; // { p1, p2, r, mesh }
const resourceOverlays = []; // { resourceId, agentId, mesh, label }
let debugGroup = null;

const EXIT_CORRIDOR_BOUNDS = { minX: 18.75, maxX: 21.75, minZ: -22.5, maxZ: -6.5 };

export function setDebugCollisionEnabled(v) {
  enabled = !!v;
}

export function isDebugCollisionEnabled() {
  return enabled;
}

export function registerGateWait(agentId, agentPos, blockerPos, blockerId) {
  if (!enabled) return;
  gateWaits.set(agentId, { pos: { ...agentPos }, blockerPos: blockerPos ? { ...blockerPos } : null, blockerId: blockerId || '' });
}

export function clearGateWait(agentId) {
  gateWaits.delete(agentId);
}

export function setResourceLocked(resourceId, agentId, bounds) {
  if (!enabled) return;
  const idx = resourceOverlays.findIndex(r => r.resourceId === resourceId);
  if (idx >= 0) {
    resourceOverlays[idx].agentId = agentId;
    resourceOverlays[idx].bounds = bounds;
  } else {
    resourceOverlays.push({ resourceId, agentId, bounds });
  }
}

export function clearResourceLock(resourceId) {
  const idx = resourceOverlays.findIndex(r => r.resourceId === resourceId);
  if (idx >= 0) resourceOverlays.splice(idx, 1);
}

function makeDashedLine(a, b, color = 0xff0000) {
  const points = [new THREE.Vector3(a.x, 1.5, a.z), new THREE.Vector3(b.x, 1.5, b.z)];
  const geo = new THREE.BufferGeometry().setFromPoints(points);
  const mat = new THREE.LineDashedMaterial({ color, dashSize: 0.3, gapSize: 0.2 });
  const line = new THREE.Line(geo, mat);
  line.computeLineDistances();
  return line;
}

function makeCapsuleOutline(p1, p2, r, color = 0x00ff00) {
  const group = new THREE.Group();
  const dx = p2.x - p1.x, dz = p2.z - p1.z;
  const len = Math.hypot(dx, dz) || 0.001;
  const segments = 16;
  const circlePoints = (cx, cz) => {
    const pts = [];
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      pts.push(new THREE.Vector3(cx + r * Math.cos(a), 0.1, cz + r * Math.sin(a)));
    }
    return pts;
  };
  const linePts = [new THREE.Vector3(p1.x, 0.1, p1.z), new THREE.Vector3(p2.x, 0.1, p2.z)];
  const lineGeo = new THREE.BufferGeometry().setFromPoints(linePts);
  const mat = new THREE.LineBasicMaterial({ color });
  group.add(new THREE.Line(lineGeo, mat));
  const c1 = new THREE.BufferGeometry().setFromPoints(circlePoints(p1.x, p1.z));
  const c2 = new THREE.BufferGeometry().setFromPoints(circlePoints(p2.x, p2.z));
  group.add(new THREE.LineLoop(c1, mat));
  group.add(new THREE.LineLoop(c2, mat));
  return group;
}

function makeRectOverlay(minX, maxX, minZ, maxZ, color = 0xff0000, opacity = 0.3) {
  const w = maxX - minX, h = maxZ - minZ;
  const geo = new THREE.PlaneGeometry(w, h);
  const mat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set((minX + maxX) / 2, 0.05, (minZ + maxZ) / 2);
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

export function updateDebugOverlay(scene, getResourceOwner, agents) {
  if (!enabled) return;
  if (!debugGroup) {
    debugGroup = new THREE.Group();
    debugGroup.name = 'debug_collision';
    scene.add(debugGroup);
  }
  while (debugGroup.children.length) debugGroup.remove(debugGroup.children[0]);

  for (const [agentId, data] of gateWaits.entries()) {
    if (data.blockerPos) {
      const line = makeDashedLine(data.pos, data.blockerPos, 0xff0000);
      debugGroup.add(line);
    }
  }

  for (const a of agents) {
    if (a.p1 && a.p2 != null && a.r != null) {
      const line = makeCapsuleOutline(a.p1, a.p2, a.r, 0x00aa00);
      debugGroup.add(line);
    }
  }

  const corridorOwner = getResourceOwner && getResourceOwner('res_exit_lane_corridor');
  if (corridorOwner) {
    const overlay = makeRectOverlay(
      EXIT_CORRIDOR_BOUNDS.minX, EXIT_CORRIDOR_BOUNDS.maxX,
      EXIT_CORRIDOR_BOUNDS.minZ, EXIT_CORRIDOR_BOUNDS.maxZ,
      0xff0000, 0.25
    );
    overlay.userData = { resourceId: 'res_exit_lane_corridor', agentId: corridorOwner };
    debugGroup.add(overlay);
  }

  for (const r of resourceOverlays) {
    if (r.bounds && r.agentId) {
      const { minX, maxX, minZ, maxZ } = r.bounds;
      const overlay = makeRectOverlay(minX, maxX, minZ, maxZ, 0xff0000, 0.2);
      overlay.userData = r;
      debugGroup.add(overlay);
    }
  }
}
