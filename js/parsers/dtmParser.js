// Парсер Surpac .dtm (триангуляция поверхности).
// Формат:
//   1) первая строка — имя парного .str до первой запятой;
//   2) блок строк со стрингом `1` до `OBJECT, 1,` — внешний контур (координаты `1, Y, X, Z,`);
//   3) секция OBJECT / TRISOLATION — треугольники `triId, v1, v2, v3, n1, n2, n3`,
//      где v1..v3 — 1-based номера записей парного .str (см. records в strParser.js).

/**
 * @param {string} text  содержимое .dtm
 * @param {boolean} swap поменять X/Y (то же преобразование, что и для .str)
 * @returns {{strName: string, boundary: Array<{x,y,z}>, triangles: Array<{id, v:number[], n:number[]}>}}
 */
export function parseDtm(text, swap = false) {
  const lines = text.split(/\r?\n/);
  const strName = (lines[0] || '').split(',')[0].trim();
  const boundary = [];
  const triangles = [];
  let inObject = false;

  for (let n = 1; n < lines.length; n++) {
    const raw = lines[n];
    if (!raw || !raw.trim()) continue;
    const f = raw.split(',').map(s => s.trim());
    const head = (f[0] || '').toUpperCase();

    // Начало секции объектов / триангуляции.
    if (head === 'OBJECT' || head === 'TRISOLATION') { inObject = true; continue; }

    if (!inObject) {
      // Внешний контур: `1, Y, X, Z,` — координаты, не индексы. На этом этапе не рисуется.
      if (f[0] === '1' && f.length >= 4) {
        const a = parseFloat(f[1]), b = parseFloat(f[2]), z = parseFloat(f[3]);
        if (Number.isFinite(a) && Number.isFinite(b) && Number.isFinite(z)) {
          boundary.push({ x: swap ? a : b, y: swap ? b : a, z });
        }
      }
      continue;
    }

    // Треугольник: triId, v1, v2, v3, n1, n2, n3.
    if (f.length < 4) continue;
    const id = parseInt(f[0], 10);
    const v1 = parseInt(f[1], 10), v2 = parseInt(f[2], 10), v3 = parseInt(f[3], 10);
    if (!Number.isFinite(id) || !Number.isFinite(v1) || !Number.isFinite(v2) || !Number.isFinite(v3)) continue;
    const n1 = parseInt(f[4], 10), n2 = parseInt(f[5], 10), n3 = parseInt(f[6], 10);
    triangles.push({ id, v: [v1, v2, v3], n: [n1, n2, n3] });
  }

  return { strName, boundary, triangles };
}
