// 2D-рендер на canvas: слои PDF (снизу), затем STR и TXT (сверху). Камера, pick.
// Жесты и зум — в ./input.js
import { STYLES, DEFAULT_STYLE } from '../parsers/strParser.js';
import { worldToPdf } from '../parsers/pdfOverlay.js';
import { createInput } from './input.js';

const FONT = '"Times New Roman", Times, serif';
const fmtZ = z => String(Number(z.toFixed(3)));
const TXT_STYLE = { kind: 'points', color: '#d02020', size: 3, labelField: 'z' };
const HL_COLOR = 'rgba(0, 120, 255, 0.7)';
const HL_EXTRA = 4;

function fieldValue(p, field) {
  if (!field) return '';
  if (field === 'z') return fmtZ(p.z);
  const m = /^d(\d+)$/.exec(field);
  if (m) {
    const v = p.d[+m[1] - 1];
    return v == null || v === '' ? '' : String(v);
  }
  return '';
}

export function createRender2d({ canvas: cv, getLayers, onInfo, onTap }) {
  const ctx = cv.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const view = { s: 1, cx: 0, cy: 0, ox: 0, oy: 0 };
  let enabled = true;
  let highlighted = null;

  const allLayers = () => getLayers() || [];
  const pdfLayers = () => allLayers().filter(L => L.kind === 'pdf' && L.visible && L.affine);
  const dataLayers = () => allLayers().filter(L => (L.kind === 'str' || L.kind === 'txt') && L.visible);

  function resize() {
    cv.width = innerWidth * dpr;
    cv.height = innerHeight * dpr;
    cv.style.width = innerWidth + 'px';
    cv.style.height = innerHeight + 'px';
    draw();
  }

  function bounds() {
    let mnx = Infinity, mxx = -Infinity, mny = Infinity, mxy = -Infinity;
    for (const L of dataLayers()) for (const p of L.pts) {
      mnx = Math.min(mnx, p.x); mxx = Math.max(mxx, p.x);
      mny = Math.min(mny, p.y); mxy = Math.max(mxy, p.y);
    }
    if (mnx === Infinity) return null;
    return { minX: mnx, maxX: mxx, minY: mny, maxY: mxy };
  }

  function fit() {
    let b = bounds();
    const pdfs = pdfLayers();
    if (!b && pdfs.length) {
      let mnx = Infinity, mxx = -Infinity, mny = Infinity, mxy = -Infinity;
      for (const pdf of pdfs) {
        const T = pdf.affine, xs = [], ys = [];
        for (const [u, v] of [[0, 0], [pdf.width, 0], [0, pdf.height], [pdf.width, pdf.height]]) {
          xs.push(T.a * u + T.b * v + T.e); ys.push(T.c * u + T.d * v + T.f);
        }
        mnx = Math.min(mnx, ...xs); mxx = Math.max(mxx, ...xs);
        mny = Math.min(mny, ...ys); mxy = Math.max(mxy, ...ys);
      }
      if (mnx !== Infinity) b = { minX: mnx, maxX: mxx, minY: mny, maxY: mxy };
    }
    if (!b) return;
    view.cx = (b.minX + b.maxX) / 2;
    view.cy = (b.minY + b.maxY) / 2;
    view.ox = 0; view.oy = 0;
    const rx = (b.maxX - b.minX) || 1, ry = (b.maxY - b.minY) || 1;
    view.s = Math.min(innerWidth * 0.9 / rx, innerHeight * 0.7 / ry);
  }

  function toScreen(p) {
    return [
      (p.x - view.cx) * view.s + innerWidth / 2 + view.ox,
      innerHeight / 2 - (p.y - view.cy) * view.s + view.oy
    ];
  }

  function toWorld(sx, sy) {
    return {
      x: (sx - innerWidth / 2 - view.ox) / view.s + view.cx,
      y: (innerHeight / 2 + view.oy - sy) / view.s + view.cy
    };
  }

  function screenToPdf(sx, sy, pdfLayer) {
    if (!pdfLayer || !pdfLayer.affine) return null;
    const w = toWorld(sx, sy);
    return worldToPdf(pdfLayer.affine, w.x, w.y);
  }

  function drawPdfLayer(L) {
    if (!L.affine) return;
    const T = L.affine, s = view.s;
    const tx = s * (T.e - view.cx) + innerWidth / 2 + view.ox;
    const ty = innerHeight / 2 + view.oy - s * (T.f - view.cy);
    ctx.save();
    ctx.setTransform(dpr * s * T.a, -dpr * s * T.c, dpr * s * T.b, -dpr * s * T.d, dpr * tx, dpr * ty);
    ctx.globalAlpha = 0.85;
    ctx.drawImage(L.canvas, 0, 0);
    ctx.restore();
  }

  function drawLayer({ pts, groups }) {
    // Pass 0: линии, стволы скважин
    for (const g of groups) {
      const st = STYLES[g.id] || (g.id === 'txt' ? TXT_STYLE : DEFAULT_STYLE);

      if (st.kind === 'line') {
        ctx.strokeStyle = st.color;
        ctx.lineWidth = st.width;
        ctx.beginPath();
        g.idx.forEach((i, k) => {
          const [sx, sy] = toScreen(pts[i]);
          if (k === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
        });
        ctx.stroke();
        if (g.text) {
          const [sx, sy] = toScreen(g.center);
          ctx.fillStyle = st.color;
          ctx.font = `15px ${FONT}`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(g.text, sx, sy);
        }
      }

      for (const i of g.idx) {
        const p = pts[i];
        if (!p.drill) continue;
        const [sx, sy] = toScreen(p);
        const [ex, ey] = toScreen(p.drill.end);
        ctx.strokeStyle = st.color;
        ctx.lineWidth = st.width || 2;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(ex, ey);
        ctx.stroke();
      }
    }

    // Pass 1: точки
    for (const g of groups) {
      const st = STYLES[g.id] || (g.id === 'txt' ? TXT_STYLE : DEFAULT_STYLE);
      if (st.kind !== 'points') continue;

      const labelField = st.labelField || (st.labelZ ? 'z' : null);
      const isDrillGroup = g.idx.some(i => pts[i].drill);

      ctx.fillStyle = st.color;
      for (const i of g.idx) {
        const p = pts[i];
        if (isDrillGroup && !p.drill) continue;

        const [sx, sy] = toScreen(p);
        ctx.beginPath();
        ctx.arc(sx, sy, st.size, 0, Math.PI * 2);
        ctx.fill();

        if (labelField) {
          const text = fieldValue(p, labelField);
          if (text) {
            ctx.font = `12px ${FONT}`;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(text, sx + st.size + 3, sy - 4);
          }
        }
      }
    }

    // Pass 2: подсветка выбранной точки (любого типа)
    if (highlighted && pts.includes(highlighted)) {
      const hi = pts.indexOf(highlighted);
      let hidden = false;
      for (const g of groups) {
        if (!g.idx.includes(hi)) continue;
        const isDrillGroup = g.idx.some(idx => pts[idx].drill);
        if (isDrillGroup && !highlighted.drill) hidden = true;
        break;
      }

      if (!hidden) {
        const st = STYLES[highlighted.id] || (highlighted.id === 'txt' ? TXT_STYLE : DEFAULT_STYLE);
        const baseR = st.kind === 'points' ? st.size : 3;
        const [sx, sy] = toScreen(highlighted);
        ctx.strokeStyle = HL_COLOR;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(sx, sy, baseR + HL_EXTRA, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  function draw() {
    if (!enabled) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#f4f6f8';
    ctx.fillRect(0, 0, innerWidth, innerHeight);
    ctx.lineJoin = 'round';

    for (const L of pdfLayers()) {
      drawPdfLayer(L);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    for (const L of dataLayers()) drawLayer(L);
  }

  function pickPoint(cx, cy) {
    let best = null, bd = 18;
    for (const L of dataLayers()) {
      if (L.locked) continue;
      for (const p of L.pts) {
        const [sx, sy] = toScreen(p);
        const d = Math.hypot(sx - cx, sy - cy);
        if (d < bd) { bd = d; best = p; }
      }
    }
    return best;
  }

  function pick(cx, cy) {
    const p = pickPoint(cx, cy);
    if (!p) return;
    highlighted = (highlighted === p) ? null : p;
    draw();

    const base = `X ${p.x.toFixed(3)} · Y ${p.y.toFixed(3)} · Z ${p.z.toFixed(3)}`;
    if (p.drill) {
      const d = p.drill;
      const kind = d.actual ? 'факт' : 'проект';
      const num = p.d[2] || '—';
      onInfo(`Стринг ${p.id} · № ${num} · Азм ${d.az}° · Накл ${d.dip}° · Глуб ${d.depth} м (${kind}) · ${base}`);
      return;
    }
    const desc = p.d.map((v, i) => v ? `D${i + 1}=${v}` : '').filter(Boolean).join(' ');
    onInfo(`Стринг ${p.id} · ${base}` + (desc ? ` · ${desc}` : ''));
  }

  function resetHighlight() { highlighted = null; }

  createInput({
    canvas: cv,
    getScale: () => view.s,
    onPan: (dx, dy) => { view.ox += dx; view.oy += dy; draw(); },
    onPinch: (s) => { view.s = s; draw(); },
    onWheelZoom: (cx, cy, factor) => {
      const before = toWorld(cx, cy);
      view.s *= factor;
      const after = toWorld(cx, cy);
      view.cx += before.x - after.x;
      view.cy += before.y - after.y;
      draw();
    },
    onTap: (cx, cy) => {
      if (onTap && onTap(cx, cy)) return;
      pick(cx, cy);
    },
  });

  addEventListener('resize', resize);

  return {
    draw, fit, resize, bounds, pickPoint, screenToPdf, resetHighlight,
    setEnabled(v) { enabled = v; cv.style.display = v ? 'block' : 'none'; if (v) resize(); },
  };
}