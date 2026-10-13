// 3D-режим на Three.js.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STYLES, DEFAULT_STYLE } from '../parsers/strParser.js';
import { createPivot } from './pivot.js';

const MS_COLOR = 0xff8800;
const PICK_RADIUS_PX = 20;
const TAP_MAX_MOVE_PX = 6;
const TAP_MAX_MS = 400;

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

export function createRender3d({ canvas, onInfo }) {
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
  controls.zoomToCursor = false;

  const content = new THREE.Group();
  scene.add(content);
  const measureGroup = new THREE.Group();
  scene.add(measureGroup);
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

  // Измерение
  let measureActive = false;
  let measureP1 = null;
  let measureP2 = null;

  // Отслеживание тапа в режиме измерения
  let md = { x: 0, y: 0, t: 0, moved: 0, active: false, id: null };

  canvas.addEventListener('pointerdown', e => {
    if (!measureActive || e.button !== 0) return;
    md.x = e.clientX;
    md.y = e.clientY;
    md.t = Date.now();
    md.moved = 0;
    md.active = true;
    md.id = e.pointerId;
  });

  canvas.addEventListener('pointermove', e => {
    if (!md.active || e.pointerId !== md.id) return;
    md.moved += Math.abs(e.clientX - md.x) + Math.abs(e.clientY - md.y);
    md.x = e.clientX;
    md.y = e.clientY;
  });

  canvas.addEventListener('pointerup', e => {
    if (!md.active || e.pointerId !== md.id) return;
    const dt = Date.now() - md.t;
    const isTap = md.moved < TAP_MAX_MOVE_PX && dt < TAP_MAX_MS;
    md.active = false;
    md.id = null;
    if (isTap) handleMeasureTap(e.clientX, e.clientY);
  });

  canvas.addEventListener('pointercancel', () => {
    md.active = false;
    md.id = null;
  });

  function clearMeasureVisual() {
    for (const o of [...measureGroup.children]) {
      measureGroup.remove(o);
      o.geometry && o.geometry.dispose();
      o.material && o.material.dispose();
    }
  }

  function rebuildMeasureVisual() {
    clearMeasureVisual();
    if (!measureActive) return;
    if (!measureP1) return;

    const mGeom = new THREE.BufferGeometry().setFromPoints([measureP1]);
    const mMat = new THREE.PointsMaterial({
      color: MS_COLOR, size: 10, sizeAttenuation: false,
      map: circleTex, transparent: true, alphaTest: 0.5,
      depthTest: false,
    });
    measureGroup.add(new THREE.Points(mGeom, mMat));

    if (!measureP2) return;

    const lineGeom = new THREE.BufferGeometry().setFromPoints([measureP1, measureP2]);
    const lineMat = new THREE.LineBasicMaterial({ color: MS_COLOR, depthTest: false });
    measureGroup.add(new THREE.Line(lineGeom, lineMat));

    const mGeom2 = new THREE.BufferGeometry().setFromPoints([measureP2]);
    measureGroup.add(new THREE.Points(mGeom2, mMat));
  }

  function pickMeasurePoint(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    let best = null, bestD = PICK_RADIUS_PX;

    const v = new THREE.Vector3();
    content.traverse(o => {
      if (!o.geometry || !o.geometry.attributes || !o.geometry.attributes.position) return;
      if (!o.isPoints && !o.isLine) return;
      const attr = o.geometry.attributes.position;
      for (let i = 0; i < attr.count; i++) {
        v.fromBufferAttribute(attr, i);
        const ndc = v.clone().project(camera);
        if (ndc.z < -1 || ndc.z > 1) continue;
        const sx = (ndc.x * 0.5 + 0.5) * rect.width + rect.left;
        const sy = (-ndc.y * 0.5 + 0.5) * rect.height + rect.top;
        const d = Math.hypot(sx - clientX, sy - clientY);
        if (d < bestD) {
          bestD = d;
          best = v.clone();
        }
      }
    });
    return best;
  }

  function handleMeasureTap(clientX, clientY) {
    const p = pickMeasurePoint(clientX, clientY);
    if (!p) {
      onInfo && onInfo('Рядом нет точки — тапните по точке данных');
      return true;
    }

    if (!measureP1) {
      measureP1 = p;
      measureP2 = null;
      onInfo && onInfo('Тапните вторую точку');
    } else if (!measureP2) {
      measureP2 = p;
      const dist = measureP1.distanceTo(measureP2);
      onInfo && onInfo(`Пространственное расстояние: ${dist.toFixed(3)} м`);
    } else {
      measureP1 = p;
      measureP2 = null;
      onInfo && onInfo('Тапните вторую точку');
    }
    rebuildMeasureVisual();
    return true;
  }

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
    clearMeasureVisual();
    camera.up.set(0, 1, 0);

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

  function setView(kind) {
    const target = controls.target.clone();
    const dist = camera.position.distanceTo(target) || 100;
    camera.up.set(0, 1, 0);

    if (kind === 'top') {
      camera.up.set(0, 0, -1);
      camera.position.set(target.x, target.y + dist, target.z);
    } else if (kind === 'east') {
      camera.position.set(target.x + dist, target.y, target.z);
    }

    camera.lookAt(target);
    controls.update();
  }

  function setMeasureMode(v) {
    measureActive = !!v;
    measureP1 = null;
    measureP2 = null;
    md.active = false;
    md.id = null;
    if (measureActive) {
      onInfo && onInfo('Режим измерения: тапните точку');
    }
    rebuildMeasureVisual();
    return measureActive;
  }

  function loop() {
    if (!active) return;
    requestAnimationFrame(loop);
    controls.update();
    renderer.render(scene, camera);
  }

  return {
    build, resize, setView, setMeasureMode,
    isMeasureActive: () => measureActive,
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