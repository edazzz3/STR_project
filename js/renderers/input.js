// Обработка жестов и ввода: pan (1 палец), pinch (2 пальца), зум колесом, тап.
// Модуль не знает про view/render — только дёргает колбэки.
export function createInput({ canvas, getScale, onPan, onPinch, onWheelZoom, onTap }) {
  const ps = new Map();
  let pinch0 = null, moved = 0, downAt = 0;

  canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture(e.pointerId);
    ps.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved = 0; downAt = Date.now();
    if (ps.size === 2) {
      const [a, b] = [...ps.values()];
      pinch0 = { d: Math.hypot(a.x - b.x, a.y - b.y), s: getScale() };
    }
  });

  canvas.addEventListener('pointermove', e => {
    if (!ps.has(e.pointerId)) return;
    const prev = ps.get(e.pointerId);
    const cur = { x: e.clientX, y: e.clientY };
    moved += Math.abs(cur.x - prev.x) + Math.abs(cur.y - prev.y);
    ps.set(e.pointerId, cur);
    if (ps.size === 1) {
      onPan(cur.x - prev.x, cur.y - prev.y);
    } else if (ps.size === 2 && pinch0) {
      const [a, b] = [...ps.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2;
      onPinch(pinch0.s * d / pinch0.d, cx, cy);
    }
  });

  function endPointer(e) {
    const wasTap = ps.size === 1 && moved < 8 && Date.now() - downAt < 400;
    if (wasTap) onTap(e.clientX, e.clientY);
    ps.delete(e.pointerId);
    if (ps.size < 2) pinch0 = null;
  }
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);

  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    onWheelZoom(e.clientX, e.clientY, e.deltaY < 0 ? 1.15 : 1 / 1.15);
  }, { passive: false });
}