// Парсер текстовых съёмок: строки вида "имя X Y Z [описание]".
// При asLine=true распознаёт коды vb/nb/otm из описания и строит контуры.

export const TXT_ID = 'txt';

/** Словарь полей TXT для UI выбора полей. */
export const TXT_FIELDS = {
  1: 'Имя точки',
  2: 'Описание',
};

/** Порог разрыва контура (в метрах, в плане). */
const BREAK_DIST = 50;

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

/**
 * @param {string} text
 * @param {boolean} swap   поменять X/Y
 * @param {boolean} asLine соединять точки линией (учитывает vb/nb/otm)
 * @returns {{pts: Array, groups: Array}}
 */
export function parseTxt(text, swap = false, asLine = false) {
  const pts = [];
  const lines = text.split(/\r?\n/);

  for (const line of lines) {
    const f = line.trim().split(/[\s;,]+/).filter(Boolean);
    if (f.length < 4) continue;              // минимум: имя + 3 числа
    const name = f[0];
    const x = parseFloat(f[1]);
    const y = parseFloat(f[2]);
    const z = parseFloat(f[3]);
    if (![x, y, z].every(Number.isFinite)) continue;
    const desc = f.slice(4).join(' ');
    const code = parseCode(desc);
    const px = swap ? y : x;
    const py = swap ? x : y;
    pts.push({ id: TXT_ID, x: px, y: py, z, d: [name, desc], code });
  }

  if (!pts.length) return { pts, groups: [] };

  const hasAnyCode = pts.some(p => p.code);
  const groups = [];

  if (!asLine) {
    // Просто точки, без линий.
    groups.push({ id: TXT_ID, idx: pts.map((_, i) => i), kind: 'points' });
  } else if (hasAnyCode) {
    // Кодовая раскладка: vb, nb — линии; otm — точки; прочее — точки.
    const byCode = { vb: [], nb: [], otm: [], other: [] };
    pts.forEach((p, i) => {
      if (p.code === 'vb' || p.code === 'nb' || p.code === 'otm') byCode[p.code].push(i);
      else byCode.other.push(i);
    });

    for (const code of ['vb', 'nb']) {
      const idxList = byCode[code];
      if (idxList.length < 2) continue;
      let seg = [idxList[0]];
      for (let k = 1; k < idxList.length; k++) {
        const prev = pts[idxList[k - 1]];
        const cur = pts[idxList[k]];
        const d = Math.hypot(cur.x - prev.x, cur.y - prev.y);
        if (d > BREAK_DIST) {
          if (seg.length >= 2) groups.push({ id: TXT_ID, idx: seg, kind: 'line', code });
          seg = [];
        }
        seg.push(idxList[k]);
      }
      if (seg.length >= 2) groups.push({ id: TXT_ID, idx: seg, kind: 'line', code });
    }

    if (byCode.otm.length) {
      groups.push({ id: TXT_ID, idx: byCode.otm, kind: 'points', code: 'otm' });
    }
    if (byCode.other.length) {
      groups.push({ id: TXT_ID, idx: byCode.other, kind: 'points' });
    }
  } else {
    // Нет кодов, но линии включены → общая полилиния + точки.
    const allIdx = pts.map((_, i) => i);
    if (pts.length > 1) groups.push({ id: TXT_ID, idx: allIdx, kind: 'line' });
    groups.push({ id: TXT_ID, idx: allIdx, kind: 'points' });
  }

  return { pts, groups };
}