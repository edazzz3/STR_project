// Детектор регулярной координатной сетки на растре PDF.
// Проекции яркости по серым пикселям + поиск пиков + проверка регулярности шага.

const DOWNSCALE_MAX = 3000;       // макс. сторона уменьшенной копии
const DARK_THRESHOLD = 160;       // яркость < этого = тёмный пиксель
const COLOR_SAT_THRESHOLD = 60;   // макс-мин каналов > этого = цветной (не сетка)
const PEAK_MIN_RATIO = 0.15;      // пик ≥ 15% от максимума
const PEAK_MERGE_DIST = 12;       // близкие пики схлопываются
const REGULARITY_TOL = 0.3;       // допуск нерегулярности шага (30%)

export function detectGrid(canvas) {
  const { data, w, h, scale } = downscale(canvas);
  const binary = threshold(data, w, h);

  const projX = projection(binary, w, h, 'x');
  const projY = projection(binary, w, h, 'y');

  const cols = findGridLines(projX).map(x => x / scale);
  const rows = findGridLines(projY).map(y => y / scale);

  const stepX = medianStep(cols);
  const stepY = medianStep(rows);
  const ok = cols.length >= 3 && rows.length >= 3 && stepX > 0 && stepY > 0;

  return { cols, rows, stepX, stepY, ok };
}

function downscale(canvas) {
  const maxSide = Math.max(canvas.width, canvas.height);
  const scale = maxSide > DOWNSCALE_MAX ? DOWNSCALE_MAX / maxSide : 1;
  if (scale === 1) {
    const ctx = canvas.getContext('2d');
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return { data: img.data, w: canvas.width, h: canvas.height, scale: 1 };
  }
  const w = Math.round(canvas.width * scale);
  const h = Math.round(canvas.height * scale);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d').drawImage(canvas, 0, 0, w, h);
  const img = c.getContext('2d').getImageData(0, 0, w, h);
  return { data: img.data, w, h, scale };
}

function threshold(data, w, h) {
  const out = new Uint8Array(w * h);
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const lum = (r + g + b) / 3;
    const sat = Math.max(r, g, b) - Math.min(r, g, b);
    out[j] = (sat < COLOR_SAT_THRESHOLD && lum < DARK_THRESHOLD) ? 1 : 0;
  }
  return out;
}

function projection(binary, w, h, axis) {
  const len = axis === 'x' ? w : h;
  const proj = new Float32Array(len);
  if (axis === 'x') {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let y = 0; y < h; y++) s += binary[y * w + x];
      proj[x] = s;
    }
  } else {
    for (let y = 0; y < h; y++) {
      let s = 0;
      const off = y * w;
      for (let x = 0; x < w; x++) s += binary[off + x];
      proj[y] = s;
    }
  }
  return smooth(proj);
}

function smooth(arr) {
  const out = new Float32Array(arr.length);
  const r = 2;
  for (let i = 0; i < arr.length; i++) {
    let s = 0, n = 0;
    for (let k = -r; k <= r; k++) {
      const j = i + k;
      if (j < 0 || j >= arr.length) continue;
      s += arr[j]; n++;
    }
    out[i] = s / n;
  }
  return out;
}

function findGridLines(proj) {
  const max = Math.max(...proj);
  if (max <= 0) return [];
  const cut = max * PEAK_MIN_RATIO;

  const peaks = [];
  for (let i = 1; i < proj.length - 1; i++) {
    if (proj[i] < cut) continue;
    if (proj[i] < proj[i - 1] || proj[i] < proj[i + 1]) continue;
    peaks.push(i);
  }

  // Схлопываем близкие пики
  const merged = [];
  for (const p of peaks) {
    if (merged.length && p - merged[merged.length - 1] < PEAK_MERGE_DIST) {
      merged[merged.length - 1] = Math.round((merged[merged.length - 1] + p) / 2);
    } else {
      merged.push(p);
    }
  }

  if (merged.length < 3) return merged;

  // Фильтр по регулярности: оставляем линии, у которых шаг с соседями ≈ медиане
  const steps = [];
  for (let i = 1; i < merged.length; i++) steps.push(merged[i] - merged[i - 1]);
  const med = median(steps);
  if (med <= 0) return merged;
  return merged.filter((_, i) => {
    if (i === 0 || i === merged.length - 1) return true;
    const s1 = merged[i] - merged[i - 1];
    const s2 = merged[i + 1] - merged[i];
    return Math.abs(s1 - med) / med < REGULARITY_TOL
        && Math.abs(s2 - med) / med < REGULARITY_TOL;
  });
}

function median(arr) {
  if (!arr.length) return 0;
  const a = [...arr].sort((x, y) => x - y);
  return a[Math.floor(a.length / 2)];
}

function medianStep(arr) {
  if (arr.length < 2) return 0;
  const steps = [];
  for (let i = 1; i < arr.length; i++) steps.push(arr[i] - arr[i - 1]);
  return median(steps);
}

/** Строит пары (u, v, x, y) по сетке и введённым координатам.
 *  X0, Y0 — координаты ЛЕВОГО НИЖНЕГО узла; шаги — в метрах.
 */
export function buildPairsFromGrid({ cols, rows, X0, Y0, stepX, stepY }) {
  const pairs = [];
  const M = rows.length;
  for (let i = 0; i < cols.length; i++) {
    for (let j = 0; j < M; j++) {
      pairs.push({
        u: cols[i],
        v: rows[M - 1 - j],  // j=0 — нижний ряд; v растёт вниз
        x: X0 + i * stepX,
        y: Y0 + j * stepY,
      });
    }
  }
  return pairs;
}