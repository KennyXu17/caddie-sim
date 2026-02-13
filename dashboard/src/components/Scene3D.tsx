import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { Box } from '@mui/material';

export function Scene3D() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0d1117);
    scene.fog = new THREE.FogExp2(0x0d1117, 0.02);

    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
    camera.position.set(35, 28, 35);
    camera.lookAt(0, 0, -12);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.85;
    container.appendChild(renderer.domElement);

    const grid = new THREE.GridHelper(60, 24, 0x21262d, 0x30363d);
    grid.position.y = -0.01;
    scene.add(grid);

    const groundGeo = new THREE.PlaneGeometry(55, 45);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x161b22,
      roughness: 0.9,
      metalness: 0.05,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    const ambient = new THREE.AmbientLight(0x404060, 0.5);
    scene.add(ambient);
    const dir = new THREE.DirectionalLight(0xffffff, 0.6);
    dir.position.set(20, 40, 20);
    dir.castShadow = true;
    scene.add(dir);

    const slotColor = new THREE.Color(0x30363d);
    for (let i = 0; i < 24; i++) {
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(2.8, 0.15, 5.2),
        new THREE.MeshStandardMaterial({ color: slotColor, roughness: 0.8 })
      );
      box.position.x = ((i % 6) - 2.5) * 8 + (i % 2) * 0.5;
      box.position.z = -Math.floor(i / 6) * 7 - 5;
      box.position.y = 0.08;
      box.receiveShadow = true;
      scene.add(box);
    }

    const robotColor = new THREE.Color(0x00d4aa);
    [0, 1, 2].forEach((i) => {
      const r = new THREE.Mesh(
        new THREE.CylinderGeometry(0.4, 0.4, 0.3, 16),
        new THREE.MeshStandardMaterial({ color: robotColor, roughness: 0.4, metalness: 0.3 })
      );
      r.position.set(-10 + i * 8, 0.25, -6 - i * 2);
      r.castShadow = true;
      scene.add(r);
    });

    let frameId: number;
    const animate = () => {
      frameId = requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w > 0 && h > 0) {
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      }
    };
    const ro = new ResizeObserver(() => onResize());
    ro.observe(container);
    window.addEventListener('resize', onResize);
    onResize();

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(frameId);
      renderer.dispose();
      container.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <Box
      ref={containerRef}
      sx={{
        width: '100%',
        height: '100%',
        minHeight: 360,
        borderRadius: 1,
        overflow: 'hidden',
        border: '1px solid',
        borderColor: 'divider',
      }}
    />
  );
}
