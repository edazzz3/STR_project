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

    // Нормализуем deltaY: на разных платформах/устройствах — своя шкала.
    let d = e.deltaY;
    if (e.deltaMode === 1) d *= 16;   // строки → пиксели
    else if (e.deltaMode === 2) d *= 100; // страницы → пиксели

    // Адаптивный шаг:
    //   мышь (|d| большое, обычно 100+)   → шаг 0.15 (как было)
    //   тачпад (|d| маленькое, обычно 1–10) → шаг 0.03 (мягко)
    const mag = Math.abs(d);
    let step;
    if (mag >= 50) step = 0.15;
    else if (mag >= 20) step = 0.08;
    else if (mag >= 5) step = 0.06;
    else step = 0.025;

    const factor = d < 0 ? 1 + step : 1 - step;
    onWheelZoom(e.clientX, e.clientY, factor);
  }, { passive: false });
}