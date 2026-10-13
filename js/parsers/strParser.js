// Парсер .str (Surpac). Логика перенесена из исходного index.html без изменений.

// kind: 'line' — линия, 'points' — точка (может быть устьем скважины со стволом).
// labelField: какое значение показывать рядом с точкой: 'z' | 'd1' | 'd3' | ...
//   (labelZ: true — устаревший синоним labelField: 'z', оставлен для совместимости)
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
  503: { kind: 'points', color: '#000000', size: 1, labelField: 'z' },
  202: { kind: 'line',   color: '#000000', width: 2 },
  203: { kind: 'line',   color: '#000000', width: 1 },
  465: { kind: 'line',   color: '#ff0000', width: 2, centerD: 4 },
  467: { kind: 'line',   color: '#0000cc', width: 2, centerD: 4 },

  // ── Скважины БВР (172–179).
  // Ствол строится автоматически, если у точки заполнены D9 (азимут) и D10 (наклон).
  // labelField: 'd3' — рядом с устьем показывается номер скважины (поле D3).
  172: { kind: 'points', color: '#0000ff', size: 3, width: 1, labelField: 'd3' },
  173: { kind: 'points', color: '#000000', size: 3, width: 1, labelField: 'd3' },
  174: { kind: 'points', color: '#ff0000', size: 3, width: 1, labelField: 'd3' },
  175: { kind: 'points', color: '#ff0000', size: 3, width: 2, labelField: 'd3' },
  176: { kind: 'points', color: '#ff0000', size: 3, width: 1, labelField: 'd3' },
  177: { kind: 'points', color: '#000000', size: 3, width: 1, labelField: 'd3' },
  178: { kind: 'points', color: '#0000ff', size: 3, width: 1, labelField: 'd3' },
  179: { kind: 'points', color: '#00ff33', size: 3, width: 1, labelField: 'd3' },
};
// Для остальных номеров — как «стринг 1» по умолчанию в Surpac
export const DEFAULT_STYLE = { kind: 'line', color: '#000000', width: 1 };

// Словарь полей .str (D1..D26). Используется в статус-строке и в будущем UI выбора поля.
export const STR_FIELDS = {
  1:  'БВР / имя точки',
  2:  'БВР-блок',
  3:  '№ скважины',
  4:  'Глубина проект',
  5:  'Диаметр скважины',
  8:  'Перебур',
  9:  'Азимут',
  10: 'Угол наклона',
  21: 'Маркшейдер',
  22: 'Проектировщик',
  23: 'Глубина факт',
  24: 'Карьер',
  25: 'Горизонт',
  26: '№ блока',
};

// ── Хелперы ──
const numField = v => {
  if (v == null || v === '') return null;
  const n = +v;
  return Number.isFinite(n) ? n : null;
};

/** Центроид полигона (для подписи контура). */
export function centroid(P) {
  let A = 0, cx = 0, cy = 0;
  for (let i = 0; i < P.length; i++) {
    const p = P[i], q = P[(i + 1) % P.length];
    const w = p.x * q.y - q.x * p.y;
    A += w; cx += (p.x + q.x) * w; cy += (p.y + q.y) * w;
  }
  if (Math.abs(A) < 1e-9) {
    return { x: P.reduce((s, p) => s + p.x, 0) / P.length,
             y: P.reduce((s, p) => s + p.y, 0) / P.length };
  }
  return { x: cx / (3 * A), y: cy / (3 * A) };
}

/**
 * Ствол скважины по D9 (азимут), D10 (наклон) и глубине:
 *   D23 (факт) имеет приоритет над D4 (проект). Если оба пусты — ствола нет.
 * Соглашения: азимут 0°=север, 90°=восток, по часовой.
 *             наклон отрицательный вниз (−90° = вертикально вниз).
 * Глубина — по стволу (не проекция).
 */
function computeDrill(p) {
  const az  = numField(p.d[8]);    // D9
  const dip = numField(p.d[9]);    // D10
  if (az == null || dip == null) return null;

  const d23 = numField(p.d[22]);   // D23
  const d4  = numField(p.d[3]);    // D4
  const depth = d23 != null ? d23 : d4;
  if (depth == null || depth === 0) return null;

  const arad = az  * Math.PI / 180;
  const drad = dip * Math.PI / 180;
  const cos = Math.cos(drad), sin = Math.sin(drad);

  // x = восток, y = север, z = вверх
  const dx = depth * cos * Math.sin(arad);
  const dy = depth * cos * Math.cos(arad);
  const dz = depth * sin;

  return {
    az, dip, depth,
    actual: d23 != null,
    end: { x: p.x + dx, y: p.y + dy, z: p.z + dz },
  };
}

/**
 * @param {string} text  содержимое файла
 * @param {boolean} swap поменять X/Y
 * @returns {{pts: Array, groups: Array}}
 *   pts:    {id, x, y, z, d:[D1,...], drill?: {az, dip, depth, actual, end}}
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
    pts.push({ id, x, y, z, d: f.slice(4) });        // d[0]=D1 ... d[25]=D26
  }

  // ── Скважины: считаем стволы по D9/D10/D23/D4 ──
  for (const p of pts) {
  const st = STYLES[p.id];
  if (!st || st.kind !== 'points') continue;   // ← только point-стринги
  const drill = computeDrill(p);
  if (drill) p.drill = drill;
}

  // подпись в центре контура (D-поле) — один раз
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