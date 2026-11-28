// Импорт файлов: определение типа по расширению, парсинг, добавление в state.layers.
import { parseStr } from '../parsers/strParser.js';
import { parseTxt } from '../parsers/txtParser.js';
import { parseDtm } from '../parsers/dtmParser.js';
import { loadPdf } from '../parsers/pdfOverlay.js';

const MAX_LAYERS = 10;
let uid = 0;
const newLayerId = () => 'L' + (++uid) + '_' + Date.now();

// Палитра контрастных цветов для поверхностей .dtm.
// Цвета подбираются по кругу, чтобы несколько .dtm сразу отличались.
const DTM_PALETTE = [
  '#2563eb', // синий
  '#16a34a', // зелёный
  '#ea580c', // оранжевый
  '#9333ea', // фиолетовый
  '#0891b2', // бирюзовый
  '#db2777', // розовый
  '#ca8a04', // жёлто-коричневый
  '#dc2626', // красный
];
let dtmColorCursor = 0;
const nextDtmColor = () => DTM_PALETTE[dtmColorCursor++ % DTM_PALETTE.length];
const DEFAULT_DTM_OPACITY = 0.6;

/** basename в lower-case для сопоставления .dtm ↔ .str. */
function baseName(name) {
  return (String(name || '').split(/[\\/]/).pop() || '').toLowerCase();
}

/**
 * Материализует вершины .dtm из парного .str по 1-based таблице records.
 * После этого слой .dtm автономен: копирует {x,y,z} и переводит индексы
 * треугольников в локальные 0-based.
 */
function materializeDtm(dtmLayer, strLayer) {
  const records = strLayer.records || [];
  const pts = [];
  const map = new Map(); // индекс в strLayer.pts → локальный индекс в dtmLayer.pts
  const triangles = [];
  for (const tri of dtmLayer.triangles) {
    const local = [];
    let ok = true;
    for (const v of tri.v) {
      const pi = records[v - 1];
      if (pi == null || !strLayer.pts[pi]) { ok = false; break; }
      let li = map.get(pi);
      if (li == null) {
        const p = strLayer.pts[pi];
        li = pts.length;
        pts.push({ x: p.x, y: p.y, z: p.z });
        map.set(pi, li);
      }
      local.push(li);
    }
    if (!ok) continue;
    triangles.push({ id: tri.id, v: local, n: tri.n });
  }
  dtmLayer.pts = pts;
  dtmLayer.triangles = triangles;
  dtmLayer.resolved = true;
  dtmLayer.strLayerId = strLayer.id;
}

/** Чтение файла: UTF-8, при ошибке — Windows-1251. */
export async function readText(file) {
  const buf = await file.arrayBuffer();
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); }
  catch { return new TextDecoder('windows-1251').decode(buf); }
}

/** Сводка по текущим слоям для статус-строки. */
export function summary(state) {
  if (!state.layers.length) return 'Нет слоёв. Нажмите «Импорт» для загрузки.';
  const parts = state.layers.map(L => {
    if (L.kind === 'pdf') return `PDF: ${L.name}${L.pageNum ? ` (лист ${L.pageNum})` : ''}`;
    if (L.kind === 'dtm') {
      return L.resolved
        ? `DTM: ${L.name} (${L.triangles.length} треуг.)`
        : `DTM: ${L.name} (ожидает ${L.waitingFor})`;
    }
    return `${L.name}: точек ${L.pts.length}, линий ${L.groups.length}`;
  });
  return parts.join(' | ') + '. Нажмите на точку, чтобы увидеть данные.';
}

export function createImportHandler({
  state,
  r2,
  pdfPagesModal,
  layersPanel,
  setInfo,
  redraw,
  recomputePdfAffine,
  reset3dPivot,
}) {
  async function handleFiles(fileList, opts = {}) {
    // .str обрабатываем раньше .dtm, чтобы при одновременном выборе .dtm сразу нашёл пару.
    const rank = e => (e === 'str' ? 0 : e === 'dtm' ? 2 : 1);
    const files = [...fileList].sort((a, b) => {
      const ea = (a.name.split('.').pop() || '').toLowerCase();
      const eb = (b.name.split('.').pop() || '').toLowerCase();
      return rank(ea) - rank(eb);
    });
    if (!files.length) return;
    const swap = !!opts.swap;
    const drawLine = !!opts.drawLine;
    let lastErr = '';

    for (const f of files) {
      if (state.layers.length >= MAX_LAYERS) {
        lastErr = `Достигнут лимит ${MAX_LAYERS} слоёв`;
        break;
      }
      const ext = (f.name.split('.').pop() || '').toLowerCase();
      try {
        if (ext === 'pdf') {
          setInfo('Загрузка PDF…');
          const tmpLib = window.pdfjsLib;
          if (!tmpLib) throw new Error('pdf.js не загружен');
          const doc = await tmpLib.getDocument({ data: await f.arrayBuffer() }).promise;
          const pageCount = doc.numPages;

          let pages = [1];
          if (pageCount > 1) {
            const chosen = await pdfPagesModal.open(pageCount);
            if (!chosen) { continue; }
            pages = chosen;
          }

          for (const pageNum of pages) {
            if (state.layers.length >= MAX_LAYERS) {
              lastErr = `Достигнут лимит ${MAX_LAYERS} слоёв`;
              break;
            }
            const pdf = await loadPdf(f, pageNum);
            state.layers.push({
              id: newLayerId(), kind: 'pdf',
              name: pageCount > 1 ? `${f.name} (лист ${pageNum})` : f.name,
              pageNum, pageCount,
              visible: true, locked: false,
              canvas: pdf.canvas, width: pdf.width, height: pdf.height,
              affine: null, userAffine: false,
            });
          }
        } else if (ext === 'str') {
          const text = await readText(f);
          const parsed = parseStr(text, false);
          const layer = {
            id: newLayerId(), kind: 'str', name: f.name,
            visible: true, locked: false,
            pts: parsed.pts, groups: parsed.groups,
            header: parsed.header,
            records: parsed.records,
          };
          state.layers.push(layer);
          // Резолвим ожидающие .dtm, которые ждали именно этот .str.
          for (const L of state.layers) {
            if (L.kind === 'dtm' && !L.resolved && L.waitingFor === baseName(f.name)) {
              materializeDtm(L, layer);
            }
          }
        } else if (ext === 'dtm') {
          const text = await readText(f);
          const parsed = parseDtm(text, false);
          const layer = {
            id: newLayerId(), kind: 'dtm', name: f.name,
            visible: true, locked: false,
            resolved: false, waitingFor: baseName(parsed.strName),
            pts: [], triangles: parsed.triangles, boundary: parsed.boundary,
            // Индивидуальные цвет и прозрачность поверхности этого .dtm.
            color: nextDtmColor(),
            opacity: DEFAULT_DTM_OPACITY,
          };
          const target = state.layers.find(
            L => L.kind === 'str' && baseName(L.name) === baseName(parsed.strName)
          );
          if (target) materializeDtm(layer, target);
          state.layers.push(layer);
        } else if (ext === 'dwg' || ext === 'dxf') {
          lastErr = `«${f.name}»: формат не поддерживается`;
        } else {
          const text = await readText(f);
          const parsed = parseTxt(text, swap, drawLine);
          state.layers.push({
            id: newLayerId(), kind: 'txt', name: f.name,
            visible: true, locked: false,
            pts: parsed.pts, groups: parsed.groups,
          });
        }
      } catch (err) {
        lastErr = `«${f.name}»: ${err.message}`;
      }
    }

    recomputePdfAffine();
    r2.resetHighlight();
    reset3dPivot && reset3dPivot();
    layersPanel.render();
    setInfo(lastErr || summary(state));
    redraw(true);
  }

  return handleFiles;
}