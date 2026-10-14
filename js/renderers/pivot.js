// Выбор точки вращения в 3D: тап по точке данных или проекция луча на горизонтальную плоскость.
import * as THREE from 'three';

const PICK_RADIUS_PX = 30;

export function createPivot({ canvas, camera, controls, content, getPlaneY }) {
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let picking = false;
  let callback = null;

  function screenToNDC(cx, cy) {
    const r = canvas.getBoundingClientRect();
    ndc.x = ((cx - r.left) / r.width) * 2 - 1;
    ndc.y = -((cy - r.top) / r.height) * 2 + 1;
  }

  /** Ищет ближайшую точку данных по ЭКРАННОМУ расстоянию (в пикселях). */
  function findNearestDataPoint(cx, cy) {
    const rect = canvas.getBoundingClientRect();
    let best = null, bestD = PICK_RADIUS_PX;
    const v = new THREE.Vector3();

    content.traverse(o => {
      if (!o.isPoints || !o.geometry || !o.geometry.attributes.position) return;
      const attr = o.geometry.attributes.position;
      for (let i = 0; i < attr.count; i++) {
        v.fromBufferAttribute(attr, i);
        const ndc2 = v.clone().project(camera);
        if (ndc2.z < -1 || ndc2.z > 1) continue;
        const sx = (ndc2.x * 0.5 + 0.5) * rect.width + rect.left;
        const sy = (-ndc2.y * 0.5 + 0.5) * rect.height + rect.top;
        const d = Math.hypot(sx - cx, sy - cy);
        if (d < bestD) { bestD = d; best = v.clone(); }
      }
    });
    return best;
  }

  function pickAt(cx, cy) {
    let pivot = findNearestDataPoint(cx, cy);

    if (!pivot) {
      // Не попали в точку — проекция луча на плоскость Y = getPlaneY()
      screenToNDC(cx, cy);
      raycaster.setFromCamera(ndc, camera);
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -getPlaneY());
      const hit = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(plane, hit)) pivot = hit;
    }

    if (!pivot) {
      callback && callback(false, 'Точка вращения не выбрана');
      finish();
      return;
    }

    // Сдвигаем и target, и камеру на одну и ту же дельту — дистанция сохраняется,
    // скорость вращения не «прыгает».
    const delta = new THREE.Vector3().subVectors(pivot, controls.target);
    controls.target.copy(pivot);
    camera.position.add(delta);
    controls.update();
    callback && callback(true, '');
    finish();
  }

  function start(cb) {
    picking = true;
    callback = cb;
    controls.enabled = false;
    canvas.style.cursor = 'crosshair';
  }

  function finish() {
    picking = false;
    controls.enabled = true;
    canvas.style.cursor = '';
  }

  function cancel() {
    if (!picking) return;
    finish();
    callback = null;
  }

  function reset() {
    controls.target.set(0, 0, 0);
    controls.update();
  }

  canvas.addEventListener('pointerdown', e => {
    if (!picking || e.button !== 0) return;
    e.preventDefault();
    pickAt(e.clientX, e.clientY);
  });

  return {
    start, cancel, reset,
    isPicking: () => picking,
  };
}