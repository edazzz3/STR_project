// PDF-подложка: загрузка через pdf.js (глобальный pdfjsLib из CDN) и аффинная привязка.
// Координаты PDF = пиксели отрендеренного canvas (u вправо, v вниз).
// Аффинное преобразование {a,b,c,d,e,f}: x = a·u + b·v + e;  y = c·u + d·v + f  (x,y — мировые).

const RENDER_SCALE = 2;

/** Загружает первую страницу PDF и рендерит её в canvas. */
export async function loadPdf(file) {
  const lib = window.pdfjsLib;
  if (!lib) throw new Error('pdf.js не загружен');
  const doc = await lib.getDocument({ data: await file.arrayBuffer() }).promise;
  const page = await doc.getPage(1);
  const vp = page.getViewport({ scale: RENDER_SCALE });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(vp.width);
  canvas.height = Math.ceil(vp.height);
  await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
  return { canvas, width: canvas.width, height: canvas.height, name: file.name, affine: null };
}

/** Преобразование по умолчанию: растянуть PDF по ширине bbox данных (или 1:1, если данных нет). */
export function defaultAffine(pdf, bbox) {
  if (!bbox) return { a: 1, b: 0, c: 0, d: -1, e: 0, f: 0 };
  const k = ((bbox.maxX - bbox.minX) || 1) / pdf.width;
  const cx = (bbox.minX + bbox.maxX) / 2, cy = (bbox.minY + bbox.maxY) / 2;
  return { a: k, b: 0, c: 0, d: -k, e: cx - k * pdf.width / 2, f: cy + k * pdf.height / 2 };
}

/**
 * Аффинное преобразование по парам точек.
 * @param {Array<{u,v,x,y}>} pairs 2 пары → подобие (сдвиг+поворот+масштаб), 3 пары → полное аффинное
 * @returns {object|null}
 */
export function solveAffine(pairs) {
  if (pairs.length === 2) {
    const [p, q] = pairs;
    const du = q.u - p.u, dv = q.v - p.v, dx = q.x - p.x, dy = q.y - p.y;
    const n = du * du + dv * dv;
    if (n < 1e-12) return null;
    // комплексное k = (dx + i·dy) / (du + i·dv)
    const kr = (dx * du + dy * dv) / n, ki = (dy * du - dx * dv) / n;
    return { a: kr, b: -ki, c: ki, d: kr,
             e: p.x - (kr * p.u - ki * p.v), f: p.y - (ki * p.u + kr * p.v) };
  }
  if (pairs.length >= 3) {
    const [p, q, r] = pairs;
    const det = (m) => m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6]);
    const M = [p.u, p.v, 1, q.u, q.v, 1, r.u, r.v, 1];
    const D = det(M);
    if (Math.abs(D) < 1e-12) return null;
    const solve = (t) => {   // правая часть t = [t1,t2,t3], правило Крамера
      const col = i => { const m = M.slice(); for (let j = 0; j < 3; j++) m[j * 3 + i] = t[j]; return det(m) / D; };
      return [col(0), col(1), col(2)];
    };
    const [a, b, e] = solve([p.x, q.x, r.x]);
    const [c, d, f] = solve([p.y, q.y, r.y]);
    return { a, b, c, d, e, f };
  }
  return null;
}

export const pdfToWorld = (T, u, v) => ({ x: T.a * u + T.b * v + T.e, y: T.c * u + T.d * v + T.f });

export function worldToPdf(T, x, y) {
  const det = T.a * T.d - T.b * T.c;
  if (Math.abs(det) < 1e-18) return null;
  const X = x - T.e, Y = y - T.f;
  return { u: (T.d * X - T.b * Y) / det, v: (-T.c * X + T.a * Y) / det };
}
