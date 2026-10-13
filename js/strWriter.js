// Формирование .str-файла по результатам промера БВР.

/** Знак угла из оригинала: -1 если D10 < 0, иначе +1. По умолчанию -1 (вниз). */
function originalAngleSign(p) {
  const v = p.d[9];
  if (v == null || v === '') return -1;
  const n = parseFloat(String(v).replace(',', '.'));
  if (!Number.isFinite(n)) return -1;
  return n < 0 ? -1 : 1;
}

function fmtCoord(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '0.000';
  return n.toFixed(3);
}

/** Глубина: 1 знак. Пустое → пусто. */
function fmtDepth(v) {
  const s = String(v ?? '').trim();
  if (s === '') return '';
  const n = parseFloat(s.replace(',', '.'));
  if (!Number.isFinite(n)) return s;
  return n.toFixed(1);
}

/** Угол: целое — без .0, иначе 1 знак. Знак — из sign (-1 → минус). */
function fmtAngle(v, sign) {
  const s = String(v ?? '').trim();
  if (s === '') return '';
  const n = parseFloat(s.replace(',', '.'));
  if (!Number.isFinite(n)) return s;
  const abs = Math.abs(n);
  const absStr = Number.isInteger(abs) ? String(abs) : abs.toFixed(1);
  return (sign < 0 ? '-' : '') + absStr;
}

/** Пересчёт координат забоя. */
function computeStemEnd({ x0, y0, z0, az, dip, depth }) {
  const arad = az * Math.PI / 180;
  const drad = dip * Math.PI / 180;
  const cos = Math.cos(drad), sin = Math.sin(drad);
  return {
    x: x0 + depth * cos * Math.sin(arad),
    y: y0 + depth * cos * Math.cos(arad),
    z: z0 + depth * sin,
  };
}

function wellKey(p, idx) {
  const num = p.d[2];
  return num != null && num !== '' ? `n${num}` : `i${idx}`;
}

function hasAnyValues(values) {
  if (!values) return false;
  for (const k in values) {
    const v = values[k];
    if (v && (v.depth || v.angle)) return true;
  }
  return false;
}

/**
 * Собирает содержимое .str по данным промера.
 * @param {object} opts
 *   layer  — слой (.kind === 'str'), у которого есть .header, .pts, .groups
 *   data   — { [stringId]: { [wellKey]: { depth, angle } } }
 * @returns {string}
 */
export function buildStrContent({ layer, data }) {
  const out = [];
  out.push(layer.header || '');

  const surveyedIds = new Set();
  for (const [key, values] of Object.entries(data || {})) {
    if (hasAnyValues(values)) surveyedIds.add(String(key));
  }

  // Группируем группы по ID в порядке файла
  const byId = new Map();
  for (const g of layer.groups) {
    const sid = String(g.id);
    if (!surveyedIds.has(sid)) continue;
    if (!byId.has(sid)) byId.set(sid, { id: g.id, groups: [] });
    byId.get(sid).groups.push(g);
  }

  for (const { id, groups } of byId.values()) {
    const values = data[String(id)] || data[id] || {};
    let wellIdx = 0;

    for (const g of groups) {
      // Устье и забой
      let head = null, tail = null;
      for (const i of g.idx) {
        const p = layer.pts[i];
        if (p.drill && !head) head = p;
        else if (!p.drill && head && !tail) tail = p;
      }
      if (!head) continue;

      const key = wellKey(head, wellIdx);
      wellIdx++;

      const cfg = values[key] || {};
      if (cfg.depth === 'завал' || cfg.depth === 'не отбур') continue;

      const d = [...head.d];

      // D4 — глубина
      d[3] = cfg.depth ? fmtDepth(cfg.depth) : fmtDepth(d[3]);

      // D10 — угол (знак как в оригинале)
      const sign = originalAngleSign(head);
      d[9] = cfg.angle ? fmtAngle(cfg.angle, sign) : fmtAngle(d[9], sign);

      out.push(`${id}, ${fmtCoord(head.y)}, ${fmtCoord(head.x)}, ${fmtCoord(head.z)}, ${d.join(',')}`);

      // Забой — пересчёт
      const az = parseFloat(String(d[8]).replace(',', '.'));
      const dipNum = parseFloat(String(d[9]).replace(',', '.'));
      const depthNum = parseFloat(String(d[3]).replace(',', '.'));
      let stemEnd = null;

      if (Number.isFinite(az) && Number.isFinite(dipNum) && Number.isFinite(depthNum)) {
        stemEnd = computeStemEnd({
          x0: head.x, y0: head.y, z0: head.z,
          az, dip: dipNum, depth: depthNum,
        });
      } else if (tail) {
        stemEnd = { x: tail.x, y: tail.y, z: tail.z };
      }

      if (stemEnd) {
        out.push(`${id}, ${fmtCoord(stemEnd.y)}, ${fmtCoord(stemEnd.x)}, ${fmtCoord(stemEnd.z)}, `);
      }

      out.push('0, 0.000, 0.000, 0.000,');
    }
  }

  return out.join('\r\n');
}

/** Скачивает .str-файл. */
export function downloadStrFile({ layer, data }) {
  const content = buildStrContent({ layer, data });
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });

  const base = (layer.name || 'str').replace(/\.[^.]+$/, '');
  const outName = `${base}_промер.str`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = outName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}