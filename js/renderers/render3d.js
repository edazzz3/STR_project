// 3D-режим на Three.js (импорт через importmap из index.html, CDN).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STYLES, DEFAULT_STYLE } from '../parsers/strParser.js';

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

  const content = new THREE.Group();
  scene.add(content);
  let active = false;

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

  /**
   * Заглушка построения: линии стрингов и точки STR/TXT по Z.
   * Система Three.js: X = восток, Y(вверх) = Z съёмки, Z = -север.
   * TODO: подписи, объёмные трубы для линий, подложка PDF как текстура на плоскости.
   */
  function build(layers) {
    clear();
    const sets = [layers.str, layers.txt].filter(Boolean);
    const all = sets.flatMap(L => L.pts);
    if (!all.length) return;
    const c = { x: 0, y: 0, z: 0 };
    for (const p of all) { c.x += p.x; c.y += p.y; c.z += p.z; }
    c.x /= all.length; c.y /= all.length; c.z /= all.length;
    const v = p => new THREE.Vector3(p.x - c.x, p.z - c.z, -(p.y - c.y));

    for (const { pts, groups } of sets) {
      for (const g of groups) {
        const st = STYLES[g.id] || (g.id === 'txt' ? { kind: 'points', color: '#d02020' } : DEFAULT_STYLE);
        const geom = new THREE.BufferGeometry().setFromPoints(g.idx.map(i => v(pts[i])));
        content.add(st.kind === 'points'
          ? new THREE.Points(geom, new THREE.PointsMaterial({ color: st.color, size: 4, sizeAttenuation: false }))
          : new THREE.Line(geom, new THREE.LineBasicMaterial({ color: st.color })));

        // ── Стволы скважин ──
        for (const i of g.idx) {
          const p = pts[i];
          if (!p.drill) continue;
          const stemGeom = new THREE.BufferGeometry().setFromPoints([v(p), v(p.drill.end)]);
          content.add(new THREE.Line(stemGeom, new THREE.LineBasicMaterial({ color: st.color })));
        }
      }
    }
    // камера: по размеру облака точек
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
    setEnabled(v) {
      active = v; canvas.style.display = v ? 'block' : 'none';
      if (v) { resize(); loop(); }
    },
  };
}
