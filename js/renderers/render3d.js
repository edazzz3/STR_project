// 3D-режим на Three.js.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STYLES, DEFAULT_STYLE } from '../parsers/strParser.js';
import { createPivot } from './pivot.js';

function makeCircleTexture() {
  const s = 64;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.arc(s / 2, s / 2, s / 2 - 2, 0, Math.PI * 2);
  g.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createRender3d({ canvas }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf4f6f8);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1e6);
  camera.position.set(0, 100, 100);

  scene.add(new THREE.AmbientLight(0xffffff, 0.8));
  const sun = new THREE.DirectionalLight(0xffffff, 0.6);
  sun.position.set(1, 2, 1);
  scene.add(sun);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.zoomToCursor = true;

  const content = new THREE.Group();
  scene.add(content);
  let active = false;
  const circleTex = makeCircleTexture();

  const pivot = createPivot({
    canvas, camera, controls, content,
    getPlaneY: () => 0,
  });

  // Панорама зажатым колесом
  let panning = false, lastX = 0, lastY = 0;
  canvas.addEventListener('pointerdown', e => {
    if (e.button === 1) { panning = true; lastX = e.clientX; lastY = e.clientY; e.preventDefault(); }
  });
  canvas.addEventListener('pointermove', e => {
    if (!panning) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1);
    const scale = camera.position.distanceTo(controls.target) * 0.0015;
    const offset = right.multiplyScalar(-dx * scale).add(up.multiplyScalar(dy * scale));
    camera.position.add(offset);
    controls.target.add(offset);
    controls.update();
  });
  const endPan = e => { if (e.button === 1) panning = false; };
  canvas.addEventListener('pointerup', endPan);
  canvas.addEventListener('pointerleave', endPan);
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  function resize() {
    renderer.setSize(innerWidth, innerHeight, false);
    canvas.style.width = innerWidth + 'px';
    canvas.style.height = innerHeight + 'px';
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);

  function clear() {
    for (const o of [...content.children]) {
      content.remove(o);
      o.geometry && o.geometry.dispose();
      o.material && o.material.dispose();
    }
  }

  function build(layers) {
    clear();
    pivot.reset();

    const sets = layers.filter(L => (L.kind === 'str' || L.kind === 'txt') && L.visible);
    const all = sets.flatMap(L => L.pts);
    if (!all.length) return;

    let sx = 0, sy = 0, sz = 0;
    for (const p of all) { sx += p.x; sy += p.y; sz += p.z; }
    const cx = sx / all.length, cy = sy / all.length, cz = sz / all.length;
    const v = p => new THREE.Vector3(p.x - cx, p.z - cz, -(p.y - cy));

    for (const { pts, groups } of sets) {
      for (const g of groups) {
        const st = STYLES[g.id] || (g.id === 'txt' ? { kind: 'points', color: '#d02020' } : DEFAULT_STYLE);

        const isDrillGroup = g.idx.some(i => pts[i].drill);
        const drawIdx = (st.kind === 'points' && isDrillGroup)
          ? g.idx.filter(i => pts[i].drill)
          : g.idx;
        if (!drawIdx.length) continue;

        const geom = new THREE.BufferGeometry().setFromPoints(drawIdx.map(i => v(pts[i])));
        content.add(st.kind === 'points'
          ? new THREE.Points(geom, new THREE.PointsMaterial({
              color: st.color, size: 6, sizeAttenuation: false,
              map: circleTex, transparent: true, alphaTest: 0.5,
            }))
          : new THREE.Line(geom, new THREE.LineBasicMaterial({ color: st.color })));

        for (const i of g.idx) {
          const p = pts[i];
          if (!p.drill) continue;
          const stemGeom = new THREE.BufferGeometry().setFromPoints([v(p), v(p.drill.end)]);
          content.add(new THREE.Line(stemGeom, new THREE.LineBasicMaterial({ color: st.color })));
        }
      }
    }

    const box = new THREE.Box3().setFromObject(content);
    const size = box.getSize(new THREE.Vector3()).length() || 100;
    controls.target.set(0, 0, 0);
    camera.position.set(size * 0.6, size * 0.6, size * 0.6);
    camera.near = size / 1000; camera.far = size * 100;
    camera.updateProjectionMatrix();
    controls.update();
  }

  function loop() {
    if (!active) return;
    requestAnimationFrame(loop);
    controls.update();
    renderer.render(scene, camera);
  }

  return {
    build, resize,
    startPivot: pivot.start,
    cancelPivot: pivot.cancel,
    isPivotPicking: pivot.isPicking,
    resetPivot: pivot.reset,
    setEnabled(v) {
      active = v;
      canvas.style.display = v ? 'block' : 'none';
      if (v) {
        resize();
        loop();
        requestAnimationFrame(() => { if (active) resize(); });
      } else {
        pivot.cancel();
      }
    },
  };
}