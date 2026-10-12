// PDF-подложка: загрузка через pdf.js (глобальный pdfjsLib из CDN) и аффинная привязка.
// Координаты PDF = пиксели отрендеренного canvas (u вправо, v вниз).
// Аффинное преобразование {a,b,c,d,e,f}: x = a·u + b·v + e;  y = c·u + d·v + f  (x,y — мировые).

const RENDER_SCALE = 2;

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

export function defaultAffine(pdf, bbox) {
  if (!bbox) return { a: 1, b: 0, c: 0, d: -1, e: 0, f: 0 };
  const k = ((bbox.maxX - bbox.minX) || 1) / pdf.width;
  const cx = (bbox.minX + bbox.maxX) / 2, cy = (bbox.minY + bbox.maxY) / 2;
  return { a: k, b: 0, c: 0, d: -k, e: cx - k * pdf.width / 2, f: cy + k * pdf.height / 2 };
}

/**
 * Аффинное преобразование по парам точек.
 *  2 пары  → подобие (сдвиг + поворот + общий масштаб)
 *  3+ пар  → полное аффинное через МНК (наименьшие квадраты)
 * @param {Array<{u,v,x,y}>} pairs
 * @returns {object|null}
 */
export function solveAffine(pairs) {
  if (pairs.length === 2) {
    const [p, q] = pairs;
    const du = q.u - p.u, dv = q.v - p.v, dx = q.x - p.x, dy = q.y - p.y;
    const n = du * du + dv * dv;
    if (n < 1e-12) return null;
    const kr = (dx * du + dy * dv) / n, ki = (dy * du - dx * dv) / n;
    return { a: kr, b: -ki, c: ki, d: kr,
             e: p.x - (kr * p.u - ki * p.v), f: p.y - (ki * p.u + kr * p.v) };
  }
  if (pairs.length >= 3) {
    const n = pairs.length;
    let Suu = 0, Svv = 0, Suv = 0, Su = 0, Sv = 0;
    let Sux = 0, Svx = 0, Sx = 0;
    let Suy = 0, Svy = 0, Sy = 0;
    for (const p of pairs) {
      Suu += p.u * p.u; Svv += p.v * p.v; Suv += p.u * p.v;
      Su += p.u; Sv += p.v;
      Sux += p.u * p.x; Svx += p.v * p.x; Sx += p.x;
      Suy += p.u * p.y; Svy += p.v * p.y; Sy += p.y;
    }
    const A = [Suu, Suv, Su, Suv, Svv, Sv, Su, Sv, n];
    const det3 = m =>
      m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6]);
    const D = det3(A);
    if (Math.abs(D) < 1e-12) return null;
    const solve3 = (b) => {
      const col = i => {
        const m = [...A];
        m[i] = b[0]; m[i + 3] = b[1]; m[i + 6] = b[2];
        return det3(m) / D;
      };
      return [col(0), col(1), col(2)];
    };
    const [a, b, e] = solve3([Sux, Svx, Sx]);
    const [c, d, f] = solve3([Suy, Svy, Sy]);
    return { a, b, c, d, e, f };
  }
  return null;
}

/** RMS-ошибка (в единицах мировых координат) для преобразования T и набора пар. */
export function computeRMS(T, pairs) {
  if (!T || !pairs.length) return null;
  let sum = 0;
  for (const p of pairs) {
    const px = T.a * p.u + T.b * p.v + T.e;
    const py = T.c * p.u + T.d * p.v + T.f;
    sum += (px - p.x) ** 2 + (py - p.y) ** 2;
  }
  return Math.sqrt(sum / pairs.length);
}

export const pdfToWorld = (T, u, v) => ({ x: T.a * u + T.b * v + T.e, y: T.c * u + T.d * v + T.f });

export function worldToPdf(T, x, y) {
  const det = T.a * T.d - T.b * T.c;
  if (Math.abs(det) < 1e-18) return null;
  const X = x - T.e, Y = y - T.f;
  return { u: (T.d * X - T.b * Y) / det, v: (-T.c * X + T.a * Y) / det };
}