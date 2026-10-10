// Заглушка парсера текстовых съемок: строки вида "[имя] X Y Z" (разделители: пробел, табуляция, ; ,).
// TODO: поддержать реальные форматы тахеометров (заголовки, коды, десятичная запятая).

/**
 * @param {string} text
 * @param {boolean} swap поменять X/Y
 * @returns {{pts: Array, groups: Array}} та же форма, что у parseStr:
 *   одна группа kind:'points' (id = TXT_ID) со всеми точками.
 */
export const TXT_ID = 'txt';

export function parseTxt(text, swap = false) {
  const pts = [];
  for (const line of text.split(/\r?\n/)) {
    const f = line.trim().split(/[\s;,]+/).filter(Boolean);
    if (f.length < 3) continue;
    const nums = f.map(Number);
    // три последних числовых поля — X, Y, Z; всё, что левее — имя/код точки
    const k = f.length - 3;
    const [a, b, z] = nums.slice(k);
    if ([a, b, z].some(isNaN)) continue;
    const name = f.slice(0, k).join(' ');
    pts.push({ id: TXT_ID, x: swap ? b : a, y: swap ? a : b, z, d: name ? [name] : [] });
  }
  const groups = pts.length ? [{ id: TXT_ID, idx: pts.map((_, i) => i) }] : [];
  return { pts, groups };
}
