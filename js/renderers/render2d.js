// 2D-рендер на canvas: слои PDF (снизу), затем STR и TXT (сверху). Камера, pick, измерения.
// Жесты и зум — в ./input.js
import { STYLES, DEFAULT_STYLE } from '../parsers/strParser.js';
import { TXT_FIELDS } from '../parsers/txtParser.js';
import { worldToPdf } from '../parsers/pdfOverlay.js';
import { createInput } from './input.js';

const FONT = '"Times New Roman", Times, serif';
const TXT_STYLE = { kind: 'points', color: '#d02020', size: 3 };
const TXT_LINE_STYLE = { kind: 'line', color: '#d02020', width: 2 };
const TXT_VB_STYLE = { kind: 'line', color: '#000000', width: 2 };
const TXT_NB_STYLE = { kind: 'line', color: '#000000', width: 1 };
const TXT_OTM_STYLE = { kind: 'points', color: '#808080', size: 1 };
const HL_COLOR = 'rgba(0, 120, 255, 0.7)';
const HL_EXTRA = 4;
const MS_COLOR = '#ff8800';
const MS_ARROW_LEN = 10;
const MS_ARROW_HALF = 4;

const fmtZ = z => String(Number((+z).toFixed(3)));
const fmtShort = v => {
  const n = +v;
  if (!Number.isFinite(n)) return String(v);
  return String(Number(n.toFixed(3)));
};
const fmtRound1 = v => {
  const n = +v;
  if (!Number.isFinite(n)) return String(v);
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
};
const fmtDist = d => d.toFixed(3) + ' м';

function styleFor(g) {
  if (g.id === 'txt') {
    if (g.code === 'vb')  return TXT_VB_STYLE;
    if (g.code === 'nb')  return TXT_NB_STYLE;
    if (g.code === 'otm') return TXT_OTM_STYLE;
    return g.kind === 'line' ? TXT_LINE_STYLE : TXT_STYLE;
  }
  if (STYLES[g.id]) return STYLES[g.id];
  return DEFAULT_STYLE;
}

function fieldValue(p, key, round) {
  if (!key) return '';
  if (key === 'z') {
    if (p.z == null || !Number.isFinite(+p.z)) return '';
    return round ? fmtRound1(p.z) : fmtZ(p.z);
  }
  const m = /^d(\d+)$/.exec(key);
  if (m) {
    const v = p.d[+m[1] - 1];
    if (v == null || v === '') return '';
    return round ? fmtRound1(v) : fmtShort(v);
  }
  return '';
}

export function createRender2d({ canvas: cv, getLayers, getLabelConfig, onInfo, onTap }) {
  const ctx = cv.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const view = { s: 1, cx: 0, cy: 0, ox: 0, oy: 0 };
  let enabled = true;
  let highlighted = null;

  let measureActive = false;
  let measureP1 = null;
  let measureP2 = null;

  const allLayers = () => getLayers() || [];
  const pdfLayers = () => allLayers().filter(L => L.kind === 'pdf' && L.visible && L.affine);
  const dataLayers = () => allLayers().filter(L => (L.kind === 'str' || L.kind === 'txt') && L.visible);

  const labelsFor = (p, g, hasLine) => {
    const cfg = (getLabelConfig() || {})[p.id];
    if (cfg) return { fields: cfg.fields || [], round: !!cfg.round };
    const st = STYLES[p.id];
    if (st && st.labelField) return { fields: [st.labelField], round: false };
    if (p.id === 'txt') {
      if (g && g.code) return { fields: [], round: false };
      if (hasLine) return { fields: [], round: false };
      return { fields: ['d1'], round: false };
    }
    return { fields: [], round: false };
  };

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
    const hasLine = groups.some(g => styleFor(g).kind === 'line');

    // Pass 0: линии, стволы скважин
    for (const g of groups) {
      const st = styleFor(g);

      if (st.kind === 'line') {
        ctx.strokeStyle = st.color;
        ctx.lineWidth = st.width || 2;
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

    // Pass 1: точки + подписи полей
    for (const g of groups) {
      const st = styleFor(g);
      if (st.kind !== 'points') continue;

      const isDrillGroup = g.idx.some(i => pts[i].drill);

      ctx.fillStyle = st.color;
      for (const i of g.idx) {
        const p = pts[i];
        if (isDrillGroup && !p.drill) continue;

        const [sx, sy] = toScreen(p);
        ctx.beginPath();
        ctx.arc(sx, sy, st.size, 0, Math.PI * 2);
        ctx.fill();

        const { fields, round } = labelsFor(p, g, hasLine);
        if (fields.length) {
          ctx.font = `12px ${FONT}`;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          const t1 = fieldValue(p, fields[0], round);
          if (t1) ctx.fillText(t1, sx + st.size + 3, sy - 4);
          if (fields.length > 1) {
            const t2 = fieldValue(p, fields[1], round);
            if (t2) ctx.fillText(t2, sx + st.size + 3, sy + 12);
          }
        }
      }
    }

    // Pass 2: подсветка выбранной точки
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

  function drawArrowAt(tipSx, tipSy, dirRad) {
    const bx = tipSx - Math.cos(dirRad) * MS_ARROW_LEN;
    const by = tipSy - Math.sin(dirRad) * MS_ARROW_LEN;
    const px = Math.cos(dirRad + Math.PI / 2) * MS_ARROW_HALF;
    const py = Math.sin(dirRad + Math.PI / 2) * MS_ARROW_HALF;
    ctx.beginPath();
    ctx.moveTo(tipSx, tipSy);
    ctx.lineTo(bx + px, by + py);
    ctx.lineTo(bx - px, by - py);
    ctx.closePath();
    ctx.fill();
  }

  function drawMeasure() {
    if (!measureActive) return;
    if (!measureP1) return;

    const [sx1, sy1] = toScreen(measureP1);
    ctx.strokeStyle = MS_COLOR;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(sx1, sy1, 5, 0, Math.PI * 2);
    ctx.stroke();

    if (!measureP2) return;

    const [sx2, sy2] = toScreen(measureP2);
    const dx = sx2 - sx1;
    const dy = sy2 - sy1;
    const lenPx = Math.hypot(dx, dy);
    if (lenPx < 1) return;

    const dirRad = Math.atan2(dy, dx);

    ctx.save();
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = MS_COLOR;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(sx1, sy1);
    ctx.lineTo(sx2, sy2);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = MS_COLOR;
    drawArrowAt(sx1, sy1, dirRad + Math.PI);
    drawArrowAt(sx2, sy2, dirRad);

    ctx.beginPath();
    ctx.arc(sx2, sy2, 5, 0, Math.PI * 2);
    ctx.stroke();

    const dist = Math.hypot(measureP2.x - measureP1.x, measureP2.y - measureP1.y);
    const midX = (sx1 + sx2) / 2;
    const midY = (sy1 + sy2) / 2 - 10;
    ctx.font = `bold 13px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const label = fmtDist(dist);
    const w = ctx.measureText(label).width + 10;
    ctx.fillStyle = 'rgba(255, 136, 0, 0.95)';
    ctx.fillRect(midX - w / 2, midY - 10, w, 20);
    ctx.fillStyle = '#fff';
    ctx.fillText(label, midX, midY + 1);
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

    drawMeasure();
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
    if (p.id === 'txt') {
      const name = p.d[0] || '';
      const desc = p.d[1] || '';
      const parts = [`Точка ${name || '—'}`];
      if (desc) parts.push(desc);
      parts.push(base);
      onInfo(parts.join(' · '));
      return;
    }
    const desc = p.d.map((v, i) => v ? `D${i + 1}=${v}` : '').filter(Boolean).join(' ');
    onInfo(`Стринг ${p.id} · ${base}` + (desc ? ` · ${desc}` : ''));
  }

  function resetHighlight() { highlighted = null; }

  function setMeasureMode(v) {
    measureActive = !!v;
    measureP1 = null;
    measureP2 = null;
    if (measureActive) onInfo('Режим измерения: тапните точку');
    draw();
  }

  function handleMeasureTap(cx, cy) {
    const p = pickPoint(cx, cy);
    if (!p) {
      onInfo('Рядом нет точки — тапните по точке данных');
      return true;
    }
    if (!measureP1) {
      measureP1 = { x: p.x, y: p.y, z: p.z };
      measureP2 = null;
      onInfo('Тапните вторую точку');
    } else if (!measureP2) {
      measureP2 = { x: p.x, y: p.y, z: p.z };
      const dist = Math.hypot(measureP2.x - measureP1.x, measureP2.y - measureP1.y);
      onInfo(`Расстояние в плане: ${fmtDist(dist)}`);
    } else {
      measureP1 = { x: p.x, y: p.y, z: p.z };
      measureP2 = null;
      onInfo('Тапните вторую точку');
    }
    draw();
    return true;
  }

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
      if (measureActive) return handleMeasureTap(cx, cy);
      if (onTap && onTap(cx, cy)) return;
      pick(cx, cy);
    },
  });

  addEventListener('resize', resize);

  return {
    draw, fit, resize, bounds, pickPoint, screenToPdf, resetHighlight,
    setMeasureMode,
    isMeasureActive: () => measureActive,
    setEnabled(v) { enabled = v; cv.style.display = v ? 'block' : 'none'; if (v) resize(); },
  };
}