// Выбор точки вращения в 3D: тап по точке данных или проекция луча на горизонтальную плоскость.
import * as THREE from 'three';

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

  function pixelRadius(px) {
    const dist = camera.position.distanceTo(controls.target);
    const fovRad = camera.fov * Math.PI / 180;
    return px * 2 * dist * Math.tan(fovRad / 2) / innerHeight;
  }

  function pickAt(cx, cy) {
    screenToNDC(cx, cy);
    raycaster.setFromCamera(ndc, camera);

    const pts = [];
    content.traverse(o => { if (o.isPoints) pts.push(o); });
    const hits = raycaster.intersectObjects(pts, false);
    let pivot = null;

    if (hits.length && hits[0].distance < pixelRadius(30)) {
      pivot = new THREE.Vector3().fromBufferAttribute(
        hits[0].object.geometry.attributes.position, hits[0].index
      );
    } else {
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -getPlaneY());
      const hit = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(plane, hit)) pivot = hit;
    }

    if (!pivot) {
      callback && callback(false, 'Точка вращения не выбрана');
      finish();
      return;
    }

    // Сдвигаем и камеру, и target на одну и ту же дельту — дистанция сохраняется,
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