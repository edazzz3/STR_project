// Импорт файлов: определение типа по расширению, парсинг, добавление в state.layers.
import { parseStr } from '../parsers/strParser.js';
import { parseTxt } from '../parsers/txtParser.js';
import { loadPdf } from '../parsers/pdfOverlay.js';

const MAX_LAYERS = 10;
let uid = 0;
const newLayerId = () => 'L' + (++uid) + '_' + Date.now();

/** Чтение файла: UTF-8, при ошибке — Windows-1251. */
export async function readText(file) {
  const buf = await file.arrayBuffer();
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); }
  catch { return new TextDecoder('windows-1251').decode(buf); }
}

/** Сводка по текущим слоям для статус-строки. */
export function summary(state) {
  if (!state.layers.length) return 'Нет слоёв. Нажмите «Импорт» для загрузки.';
  const parts = state.layers.map(L => L.kind === 'pdf'
    ? `PDF: ${L.name}${L.pageNum ? ` (лист ${L.pageNum})` : ''}`
    : `${L.name}: точек ${L.pts.length}, линий ${L.groups.length}`);
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
  async function handleFiles(fileList, swap) {
    const files = [...fileList];
    if (!files.length) return;
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
          state.layers.push({
            id: newLayerId(), kind: 'str', name: f.name,
            visible: true, locked: false,
            pts: parsed.pts, groups: parsed.groups,
            header: parsed.header,
          });
        } else if (ext === 'dwg' || ext === 'dxf') {
          lastErr = `«${f.name}»: формат не поддерживается`;
        } else {
          const text = await readText(f);
          const parsed = parseTxt(text, swap);
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