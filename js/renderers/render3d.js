// 3D-режим на Three.js.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { STYLES, DEFAULT_STYLE } from '../parsers/strParser.js';
import { createPivot } from './pivot.js';

const MS_COLOR = 0xff8800;
const PICK_RADIUS_PX = 20;
const TAP_MAX_MOVE_PX = 6;
const TAP_MAX_MS = 400;

const TXT_POINTS_STYLE = { kind: 'points', color: '#d02020', size: 3 };
const TXT_LINE_STYLE = { kind: 'line', color: '#d02020', width: 2 };
const TXT_VB_STYLE = { kind: 'line', color: '#000000', width: 2 };
const TXT_NB_STYLE = { kind: 'line', color: '#000000', width: 1 };
const TXT_OTM_STYLE = { kind: 'points', color: '#808080', size: 1 };

/** Адаптирует цвет под тёмную тему: тёмные цвета → светлые. */
function adaptColor(c, theme) {
  if (theme !== 'dark') return c;
  if (!c) return c;
  const hex = c.startsWith('#') ? c : '#' + c;
  if (hex.length === 7) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    if (lum < 0.35) return '#e2e8f0';
  }
  return c;
}

function styleFor(g, theme) {
  let st;
  if (g.id === 'txt') {
    if (g.code === 'vb') st = TXT_VB_STYLE;
    else if (g.code === 'nb') st = TXT_NB_STYLE;
    else if (g.code === 'otm') st = TXT_OTM_STYLE;
    else st = g.kind === 'line' ? TXT_LINE_STYLE : TXT_POINTS_STYLE;
  } else if (STYLES[g.id]) {
    st = STYLES[g.id];
  } else {
    st = DEFAULT_STYLE;
  }
  if (theme === 'dark' && st.color) {
    return { ...st, color: adaptColor(st.color, theme) };
  }
  return st;
}

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

export function createRender3d({ canvas, onInfo, getTheme, getHiddenStreams }) {
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
  controls.rotateSpeed = 0.5;
  controls.zoomSpeed = 0.8;
  controls.panSpeed = 0.6;

  const content = new THREE.Group();
  scene.add(content);
  const measureGroup = new THREE.Group();
  scene.add(measureGroup);
  let active = false;
  const circleTex = makeCircleTexture();

  const themeNow = () => (getTheme ? getTheme() : 'light');
  const hiddenNow = () => (getHiddenStreams ? getHiddenStreams() : null);

  function isStreamHidden(g, L) {
    if (L.locked) return false;
    const hidden = hiddenNow();
    if (!hidden || !hidden.size) return false;
    return hidden.has(String(g.id));
  }

  // Материалы fat-lines (кэш по цвету+толщине)
  const lineMaterials = new Map();
  function getLineMaterial(color, width) {
    const key = color + '|' + width;
    let mat = lineMaterials.get(key);
    if (!mat) {
      mat = new LineMaterial({
        color,
        linewidth: width,
        worldUnits: false,
        resolution: new THREE.Vector2(innerWidth, innerHeight),
      });
      lineMaterials.set(key, mat);
    }
    return mat;
  }

  function createFatLine(points3, color, width) {
    const positions = [];
    for (const p of points3) positions.push(p.x, p.y, p.z);
    const geom = new LineGeometry();
    geom.setPositions(positions);
    const line = new Line2(geom, getLineMaterial(color, width));
    line.computeLineDistances();
    return line;
  }

  const pivot = createPivot({
    canvas, camera, controls, content,
    getPlaneY: () => 0,
  });

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

  let measureActive = false;
  let measureP1 = null;
  let measureP2 = null;
  let md = { x: 0, y: 0, t: 0, moved: 0, active: false, id: null };

  canvas.addEventListener('pointerdown', e => {
    if (!measureActive || e.button !== 0) return;
    md.x = e.clientX; md.y = e.clientY;
    md.t = Date.now(); md.moved = 0;
    md.active = true; md.id = e.pointerId;
  });

  canvas.addEventListener('pointermove', e => {
    if (!md.active || e.pointerId !== md.id) return;
    md.moved += Math.abs(e.clientX - md.x) + Math.abs(e.clientY - md.y);
    md.x = e.clientX; md.y = e.clientY;
  });

  canvas.addEventListener('pointerup', e => {
    if (!md.active || e.pointerId !== md.id) return;
    const dt = Date.now() - md.t;
    const isTap = md.moved < TAP_MAX_MOVE_PX && dt < TAP_MAX_MS;
    md.active = false; md.id = null;
    if (isTap) handleMeasureTap(e.clientX, e.clientY);
  });

  canvas.addEventListener('pointercancel', () => {
    md.active = false; md.id = null;
  });

  function clearMeasureVisual() {
    for (const o of [...measureGroup.children]) {
      measureGroup.remove(o);
      o.geometry && o.geometry.dispose();
      o.material && o.material.dispose && o.material.dispose();
    }
  }

  function rebuildMeasureVisual() {
    clearMeasureVisual();
    if (!measureActive || !measureP1) return;

    const mGeom = new THREE.BufferGeometry().setFromPoints([measureP1]);
    const mMat = new THREE.PointsMaterial({
      color: MS_COLOR, size: 10, sizeAttenuation: false,
      map: circleTex, transparent: true, alphaTest: 0.5,
      depthTest: false,
    });
    measureGroup.add(new THREE.Points(mGeom, mMat));

    if (!measureP2) return;

    const line = createFatLine([measureP1, measureP2], MS_COLOR, 2);
    measureGroup.add(line);

    const mGeom2 = new THREE.BufferGeometry().setFromPoints([measureP2]);
    measureGroup.add(new THREE.Points(mGeom2, mMat));
  }

  function pickMeasurePoint(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    let best = null, bestD = PICK_RADIUS_PX;

    const v = new THREE.Vector3();

    function processWorldPoint(worldPt) {
      const ndc = worldPt.clone().project(camera);
      if (ndc.z < -1 || ndc.z > 1) return;
      const sx = (ndc.x * 0.5 + 0.5) * rect.width + rect.left;
      const sy = (-ndc.y * 0.5 + 0.5) * rect.height + rect.top;
      const d = Math.hypot(sx - clientX, sy - clientY);
      if (d < bestD) { bestD = d; best = worldPt.clone(); }
    }

    content.traverse(o => {
      if (o.isPoints && o.geometry && o.geometry.attributes.position) {
        const attr = o.geometry.attributes.position;
        for (let i = 0; i < attr.count; i++) {
          v.fromBufferAttribute(attr, i);
          processWorldPoint(v);
        }
      } else if (o.isLine2 && o.geometry) {
        const start = o.geometry.getAttribute('instanceStart');
        const end = o.geometry.getAttribute('instanceEnd');
        if (start && end) {
          for (let i = 0; i < start.count; i++) {
            processWorldPoint(new THREE.Vector3(start.getX(i), start.getY(i), start.getZ(i)));
            processWorldPoint(new THREE.Vector3(end.getX(i), end.getY(i), end.getZ(i)));
          }
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
      measureP1 = p; measureP2 = null;
      onInfo && onInfo('Тапните вторую точку');
    } else if (!measureP2) {
      measureP2 = p;
      const dist = measureP1.distanceTo(measureP2);
      onInfo && onInfo(`Пространственное расстояние: ${dist.toFixed(3)} м`);
    } else {
      measureP1 = p; measureP2 = null;
      onInfo && onInfo('Тапните вторую точку');
    }
    rebuildMeasureVisual();
    return true;
  }

  function updateResolutions() {
    for (const m of lineMaterials.values()) {
      m.resolution.set(innerWidth, innerHeight);
    }
  }

  function resize() {
    renderer.setSize(innerWidth, innerHeight, false);
    canvas.style.width = innerWidth + 'px';
    canvas.style.height = innerHeight + 'px';
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    updateResolutions();
  }
  addEventListener('resize', resize);

  function clear() {
    for (const o of [...content.children]) {
      content.remove(o);
      o.geometry && o.geometry.dispose();
      if (o.material) {
        if (Array.isArray(o.material)) o.material.forEach(m => m.dispose && m.dispose());
        else o.material.dispose && o.material.dispose();
      }
    }
  }

  function build(layers, { preserveCamera = false } = {}) {
    // Запоминаем текущее положение камеры и цель вращения — на случай,
    // если пересборка вызвана переключением видимости, а не «показать всё».
    const prevTarget = controls.target.clone();
    const prevPos = camera.position.clone();
    const prevUp = camera.up.clone();

    clear();
    pivot.reset();
    clearMeasureVisual();
    camera.up.set(0, 1, 0);
    scene.background = new THREE.Color(themeNow() === 'dark' ? 0x0f172a : 0xf4f6f8);

    // Центр считаем по ВСЕМ точкам (включая скрытые слои и скрытые стринги),
    // чтобы при переключении видимости мир не смещался.
    const allLayers = layers.filter(L => L.kind === 'str' || L.kind === 'txt');
    const allPts = allLayers.flatMap(L => L.pts);
    if (!allPts.length) return;

    let sx = 0, sy = 0, sz = 0;
    for (const p of allPts) { sx += p.x; sy += p.y; sz += p.z; }
    const cx = sx / allPts.length, cy = sy / allPts.length, cz = sz / allPts.length;
    const v = p => new THREE.Vector3(p.x - cx, p.z - cz, -(p.y - cy));

    const theme = themeNow();

    // Строим ТОЛЬКО видимые слои (скрытые не попадают в сцену).
    for (const L of allLayers) {
      if (!L.visible) continue;
      const { pts, groups } = L;
      for (const g of groups) {
        if (isStreamHidden(g, L)) continue;

        const st = styleFor(g, theme);

        const isDrillGroup = g.idx.some(i => pts[i].drill);
        const drawIdx = (st.kind === 'points' && isDrillGroup)
          ? g.idx.filter(i => pts[i].drill)
          : g.idx;
        if (!drawIdx.length) continue;

        if (st.kind === 'points') {
          const points = drawIdx.map(i => v(pts[i]));
          const geom = new THREE.BufferGeometry().setFromPoints(points);
          const pointSize = Math.max(3, (st.size || 3) * 2);
          content.add(new THREE.Points(geom, new THREE.PointsMaterial({
            color: st.color, size: pointSize, sizeAttenuation: false,
            map: circleTex, transparent: true, alphaTest: 0.5,
          })));
        } else {
          const points = drawIdx.map(i => v(pts[i]));
          if (points.length >= 2) {
            content.add(createFatLine(points, st.color, st.width || 1));
          }
        }

        for (const i of g.idx) {
          const p = pts[i];
          if (!p.drill) continue;
          const stem = [v(p), v(p.drill.end)];
          content.add(createFatLine(stem, st.color, 1));
        }
      }
    }

    if (preserveCamera) {
      // Восстанавливаем камеру как было — пользователь не должен замечать пересборку.
      controls.target.copy(prevTarget);
      camera.position.copy(prevPos);
      camera.up.copy(prevUp);
      controls.update();
    } else {
      // Первая загрузка / явный «показать всё» / включение 3D — ставим обзор по всей сцене.
      const box = new THREE.Box3().setFromObject(content);
      const size = box.getSize(new THREE.Vector3()).length() || 100;
      controls.target.set(0, 0, 0);
      camera.position.set(size * 0.6, size * 0.6, size * 0.6);
      camera.near = size / 1000; camera.far = size * 100;
      camera.updateProjectionMatrix();
      controls.update();
    }
    updateResolutions();
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
    measureP1 = null; measureP2 = null;
    md.active = false; md.id = null;
    if (measureActive) onInfo && onInfo('Режим измерения: тапните точку');
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
    setTheme() {
      scene.background = new THREE.Color(themeNow() === 'dark' ? 0x0f172a : 0xf4f6f8);
      for (const m of lineMaterials.values()) m.dispose();
      lineMaterials.clear();
    },
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