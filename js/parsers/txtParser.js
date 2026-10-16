// Парсер текстовых съёмок: строки вида "имя X Y Z [описание]".
// ID группы определяется по описанию:
//   vb  → 202 (линия верхней бровки)
//   nb  → 203 (линия нижней бровки)
//   otm → 103 (точки отметок)
//   прочее описание → id = первое слово описания (например, 'zav')
//   без описания   → id = 'txt'

export const TXT_ID = 'txt';

/** Словарь полей TXT для UI выбора полей. */
export const TXT_FIELDS = {
  1: 'Имя точки',
  2: 'Описание',
};

/** Распознаёт код vb/nb/otm в начале описания (регистр не важен). */
function parseCode(desc) {
  if (!desc) return null;
  const s = String(desc).trim().toLowerCase();
  if (!s) return null;
  for (const c of ['otm', 'vb', 'nb']) {
    if (s === c) return c;
    if (s.startsWith(c) && !/[a-z]/.test(s[c.length] || '')) return c;
  }
  return null;
}

/** Определяет ID группы по коду и описанию. */
function idFor(code, desc) {
  if (code === 'vb') return 202;
  if (code === 'nb') return 203;
  if (code === 'otm') return 103;
  const firstWord = String(desc || '').trim().split(/\s+/)[0];
  return firstWord || 'txt';
}

/**
 * @param {string} text
 * @param {boolean} swap   поменять X/Y
 * @param {boolean} asLine соединять точки линией (для vb/nb)
 * @returns {{pts: Array, groups: Array}}
 */
export function parseTxt(text, swap = false, asLine = false) {
  const pts = [];
  const lines = text.split(/\r?\n/);

  for (const line of lines) {
    const f = line.trim().split(/[\s;,]+/).filter(Boolean);
    if (f.length < 4) continue;
    const name = f[0];
    const x = parseFloat(f[1]);
    const y = parseFloat(f[2]);
    const z = parseFloat(f[3]);
    if (![x, y, z].every(Number.isFinite)) continue;

    const desc = f.slice(4).join(' ');
    const code = parseCode(desc);
    const px = swap ? y : x;
    const py = swap ? x : y;
    const id = idFor(code, desc);

    pts.push({ id, x: px, y: py, z, d: [name, desc], code });
  }

  if (!pts.length) return { pts, groups: [] };

  const groups = [];

  // Уникальные ID и их индексы (для модалов и точек)
  const byId = new Map();
  pts.forEach((p, i) => {
    if (!byId.has(p.id)) byId.set(p.id, []);
    byId.get(p.id).push(i);
  });

  // Без линий — просто точки, сгруппированные по id
  if (!asLine) {
    for (const [id, idx] of byId) {
      groups.push({ id, idx, kind: 'points' });
    }
    return { pts, groups };
  }

  // С линиями: сначала — все не-бровочные точки (103, zav, txt, …)
  for (const [id, idx] of byId) {
    if (id === 202 || id === 203) continue;
    groups.push({ id, idx, kind: 'points' });
  }

  // Бровки: обходим точки в порядке файла, разрываем сегмент
  // ТОЛЬКО при смене кода (vb ↔ nb). otm и прочие — игнорируются.
  const segVb = [];
  const segNb = [];
  let currentKind = null;
  for (let i = 0; i < pts.length; i++) {
    const c = pts[i].code;
    if (c !== 'vb' && c !== 'nb') continue;
    if (c !== currentKind) {
      if (c === 'vb') segVb.push([]);
      else segNb.push([]);
      currentKind = c;
    }
    if (c === 'vb') segVb[segVb.length - 1].push(i);
    else segNb[segNb.length - 1].push(i);
  }

  // Сегменты ≥ 2 точек → линии, одиночные → точки того же цвета
  const vbSingle = [];
  const nbSingle = [];
  for (const seg of segVb) {
    if (seg.length >= 2) groups.push({ id: 202, idx: seg, kind: 'line' });
    else vbSingle.push(...seg);
  }
  for (const seg of segNb) {
    if (seg.length >= 2) groups.push({ id: 203, idx: seg, kind: 'line' });
    else nbSingle.push(...seg);
  }
  if (vbSingle.length) groups.push({ id: 202, idx: vbSingle, kind: 'points' });
  if (nbSingle.length) groups.push({ id: 203, idx: nbSingle, kind: 'points' });

  return { pts, groups };
}