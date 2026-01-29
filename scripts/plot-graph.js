/**
 * 生成 graph.html：将停车场拓扑图（节点 + 边）绘制到 Canvas 上。
 * 运行：node scripts/plot-graph.js
 * 输出：项目根目录 graph.html，用浏览器打开即可查看。
 */

import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { getGraphData } from '../src/topology.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

const data = getGraphData();
const { nodes, edges } = data;

const xs = nodes.map(n => n.x);
const zs = nodes.map(n => n.z);
const xMin = Math.min(...xs);
const xMax = Math.max(...xs);
const zMin = Math.min(...zs);
const zMax = Math.max(...zs);
const pad = 40;
const W = 900;
const H = 700;
const scaleX = (W - 2 * pad) / (xMax - xMin || 1);
const scaleZ = (H - 2 * pad) / (zMax - zMin || 1);
const scale = Math.min(scaleX, scaleZ);

function toScreen(x, z) {
  const xx = pad + (x - xMin) * scale;
  const zz = H - pad - (z - zMin) * scale;
  return [xx, zz];
}

const nodeById = new Map(nodes.map(n => [n.id, n]));

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>停车场拓扑图</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; background: #1a1a2e; color: #eee; min-height: 100vh; padding: 16px; }
    h1 { margin-bottom: 12px; font-size: 1.25rem; }
    p { margin-bottom: 16px; opacity: .85; font-size: 14px; }
    .wrap { display: flex; flex-wrap: wrap; gap: 16px; align-items: flex-start; }
    canvas { background: #16213e; border-radius: 8px; display: block; }
    .leg { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; font-size: 13px; }
    .leg-dot { width: 10px; height: 10px; border-radius: 50%; }
    .leg-dot.turn { background: #e94560; }
    .leg-dot.charge { background: #0f3460; border: 1px solid #e94560; }
  </style>
</head>
<body>
  <h1>停车场拓扑图</h1>
  <p>节点：8 个转向点（红）、44 个充电点（蓝框）。同一行内点两两相连，同侧转向点相连，同行左右转向点相连。边权重为距离。</p>
  <div class="wrap">
    <div>
      <canvas id="c" width="${W}" height="${H}"></canvas>
    </div>
    <div>
      <div class="leg"><span class="leg-dot turn"></span> 转向点 (turn)</div>
      <div class="leg"><span class="leg-dot charge"></span> 充电点 (charge)</div>
    </div>
  </div>
  <script>
    const nodes = ${JSON.stringify(nodes)};
    const edges = ${JSON.stringify(edges)};
    const xMin = ${xMin};
    const xMax = ${xMax};
    const zMin = ${zMin};
    const zMax = ${zMax};
    const pad = ${pad};
    const W = ${W};
    const H = ${H};
    const scale = ${scale};

    function toScreen(x, z) {
      const xx = pad + (x - xMin) * scale;
      const zz = H - pad - (z - zMin) * scale;
      return [xx, zz];
    }

    const nodeById = new Map(nodes.map(n => [n.id, n]));
    const canvas = document.getElementById('c');
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#16213e';
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = 'rgba(100, 120, 180, 0.35)';
    ctx.lineWidth = 0.8;
    for (const e of edges) {
      const a = nodeById.get(e.from);
      const b = nodeById.get(e.to);
      if (!a || !b) continue;
      const [x1, z1] = toScreen(a.x, a.z);
      const [x2, z2] = toScreen(b.x, b.z);
      ctx.beginPath();
      ctx.moveTo(x1, z1);
      ctx.lineTo(x2, z2);
      ctx.stroke();
    }

    for (const n of nodes) {
      const [x, z] = toScreen(n.x, n.z);
      if (n.type === 'turn') {
        ctx.fillStyle = '#e94560';
        ctx.beginPath();
        ctx.arc(x, z, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.stroke();
      } else {
        ctx.fillStyle = '#0f3460';
        ctx.strokeStyle = '#e94560';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x, z, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }

    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      const sx = (e.clientX - rect.left) * (W / rect.width);
      const sz = (e.clientY - rect.top) * (H / rect.height);
      const zw = H - pad - sz;
      const xw = (sx - pad) / scale + xMin;
      const zworld = zw / scale + zMin;
      let near = null;
      let d = 20;
      for (const n of nodes) {
        const [xx, zz] = toScreen(n.x, n.z);
        const dist = Math.hypot(sx - xx, sz - zz);
        if (dist < d) { d = dist; near = n; }
      }
      canvas.title = near ? near.id + (near.spotIndex != null ? ' (spot ' + near.spotIndex + ')' : '') : '';
    });
  </script>
</body>
</html>
`;

const outPath = path.join(projectRoot, 'graph.html');
fs.writeFileSync(outPath, html, 'utf8');
console.log('Written:', outPath);
console.log('Open in browser to view the topology graph.');
