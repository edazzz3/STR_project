// Парсер .str (Surpac). Логика перенесена из исходного index.html без изменений.

// kind: 'line' — линия, 'points' — только точки
// labelZ: true — рядом с точкой подпись отметки Z
// centerD: N — в центре контура подпись из поля DN
export const STYLES = {
  1:   { kind: 'line',   color: '#000000', width: 1 },
  2:   { kind: 'line',   color: '#0000ff', width: 2 },
  3:   { kind: 'line',   color: '#33ffff', width: 1 },
  4:   { kind: 'line',   color: '#cc6600', width: 2 },
  5:   { kind: 'line',   color: '#ff3333', width: 1 },
  6:   { kind: 'line',   color: '#ffff00', width: 1 },
  7:   { kind: 'line',   color: '#ff9933', width: 1 },
  8:   { kind: 'line',   color: '#00ff00', width: 2 },
  103: { kind: 'points', color: '#808080', size: 1 },
  503: { kind: 'points', color: '#000000', size: 1, labelZ: true },
  175: { kind: 'line',   color: '#ff0000', width: 2 },
  202: { kind: 'line',   color: '#000000', width: 2 },
  203: { kind: 'line',   color: '#000000', width: 1 },
  465: { kind: 'line',   color: '#ff0000', width: 2, centerD: 4 },
  467: { kind: 'line',   color: '#0000cc', width: 2, centerD: 4 },
};
// Для остальных номеров — как «стринг 1» по умолчанию в Surpac
export const DEFAULT_STYLE = { kind: 'line', color: '#000000', width: 1 };

export function centroid(P) {
  let A = 0, cx = 0, cy = 0;
  for (let i = 0; i < P.length; i++) {
    const p = P[i], q = P[(i + 1) % P.length];
    const w = p.x * q.y - q.x * p.y;
    A += w; cx += (p.x + q.x) * w; cy += (p.y + q.y) * w;
  }
  if (Math.abs(A) < 1e-9) {   // вырожденный контур — просто среднее
    return { x: P.reduce((s, p) => s + p.x, 0) / P.length,
             y: P.reduce((s, p) => s + p.y, 0) / P.length };
  }
  return { x: cx / (3 * A), y: cy / (3 * A) };
}

/**
 * @param {string} text  содержимое файла
 * @param {boolean} swap поменять X/Y
 * @returns {{pts: Array, groups: Array}}
 *   pts:    {id, x, y, z, d:[D1, D2, ...]}
 *   groups: подряд идущие записи с одним номером стринга {id, idx[], text?, center?}
 */
export function parseStr(text, swap = false) {
  const pts = [], groups = [];
  let cur = null;
  const lines = text.split(/\r?\n/);
  for (let n = 1; n < lines.length; n++) {          // строка 0 — заголовок файла
    const f = lines[n].split(',').map(s => s.trim());
    if (f.length < 4) continue;
    const id = parseInt(f[0], 10);
    if (isNaN(id)) continue;
    if (id === 0) { cur = null; continue; }          // 0 = конец стринга
    const a = parseFloat(f[1]), b = parseFloat(f[2]), z = parseFloat(f[3]);
    if (isNaN(a) || isNaN(b) || isNaN(z)) continue;
    const x = swap ? a : b;                          // в файле: Y, X, Z
    const y = swap ? b : a;
    if (!cur || cur.id !== id) { cur = { id, idx: [] }; groups.push(cur); }
    cur.idx.push(pts.length);
    pts.push({ id, x, y, z, d: f.slice(4) });        // d[0]=D1 ... d[3]=D4
  }
  // подпись в центре контура (D-поле) считаем один раз
  for (const g of groups) {
    const st = STYLES[g.id];
    if (st && st.centerD) {
      const P = g.idx.map(i => pts[i]);
      g.text = P.map(p => p.d[st.centerD - 1]).find(Boolean) || '';
      g.center = centroid(P);
    }
  }
  return { pts, groups };
}
