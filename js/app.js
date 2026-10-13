// Контроллер: состояние слоёв, переключение 2D/3D, обработчики UI, регистрация SW.
import { parseStr } from './parsers/strParser.js';
import { parseTxt } from './parsers/txtParser.js';
import { loadPdf, defaultAffine } from './parsers/pdfOverlay.js';
import { createRender2d } from './renderers/render2d.js';
import { createLayersPanel } from './ui/layers.js';
import { createFieldsModal } from './ui/fields.js';
import { createGeorefModal } from './ui/georef.js';
import { createPdfPagesModal } from './ui/pdfPages.js';
import { state } from './state.js';

const MAX_LAYERS = 10;
const $ = id => document.getElementById(id);
const infoEl = $('info');
const swapEl = $('swap');
const setInfo = t => { infoEl.textContent = t; };

let r3 = null;
let uid = 0;
const newLayerId = () => 'L' + (++uid) + '_' + Date.now();

function syncSidebarBounds() {
  const sb = $('sidebar');
  if (!sb) return;
  const top = $('top').getBoundingClientRect().bottom;
  const bottom = window.innerHeight - $('info').getBoundingClientRect().top;
  sb.style.top = top + 'px';
  sb.style.bottom = bottom + 'px';
}

const r2 = createRender2d({
  canvas: $('c'),
  getLayers: () => state.layers,
  getLabelConfig: () => state.labelConfig,
  onInfo: setInfo,
  onTap: (x, y) => georef.active && georef.tap(x, y),
});

const layersPanel = createLayersPanel({
  container: $('sidebar'),
  onChange: () => redraw(false),
});

const fieldsModal = createFieldsModal({
  onApply: () => { r2.draw(); },
});

const pdfPagesModal = createPdfPagesModal();

const georefUI = createGeorefModal({
  onApply: (layer, T, rms, count) => {
    const hadData = !!r2.bounds();
    layer.affine = T;
    layer.userAffine = true;
    const warn = rms > 1 ? ' ⚠' : '';
    setInfo(`PDF привязан · ${count} пар · RMS ${rms.toFixed(3)} м${warn}`);
    // Если данных не было — вписываем PDF в экран после привязки
    if (hadData) redraw(false); else redraw(true);
  },
  onRequestPair: () => {
    if (!r2.bounds()) {
      setInfo('Для ручной привязки нужны слои STR или TXT. Используйте вкладку «По углам».');
      return;
    }
    georef.mode = 'manual';
    georef.pendingUV = null;
    georefUI.showTip('Тапните место на PDF');
  },
  onRequestAnglePair: (pair) => {
    georef.mode = 'angle';
    georef.anglePair = pair;
    georef.active = true;
    $('georef').classList.add('active');
    georefUI.showTip(`Тапните на PDF: ${pair.label}`);
  },
  onClose: () => {
    georef.active = false;
    georef.mode = null;
    georef.pendingUV = null;
    georef.anglePair = null;
    $('georef').classList.remove('active');
  },
});

const georef = {
  active: false, mode: null, pendingUV: null, anglePair: null, pdfLayer: null,

  start() {
    const pdfLayer = state.layers.find(L => L.kind === 'pdf' && L.visible && !L.locked);
    if (!pdfLayer) return setInfo('Нет доступного PDF-слоя (видимого и разблокированного)');
    if (state.mode3d) return setInfo('Привязка доступна в режиме 2D');
    this.active = true;
    this.mode = null;
    this.pendingUV = null;
    this.anglePair = null;
    this.pdfLayer = pdfLayer;
    $('georef').classList.add('active');
    georefUI.open(pdfLayer);
  },

  stop(msg) {
    this.active = false;
    this.mode = null;
    this.pendingUV = null;
    this.anglePair = null;
    $('georef').classList.remove('active');
    if (msg) setInfo(msg);
  },

  tap(sx, sy) {
    if (!this.active) return false;

    if (this.mode === 'manual') {
      if (!this.pendingUV) {
        const uv = r2.screenToPdf(sx, sy, this.pdfLayer);
        if (!uv) return true;
        this.pendingUV = uv;
        georefUI.showTip('Тапните соответствующую точку STR/TXT');
        return true;
      }
      const p = r2.pickPoint(sx, sy);
      if (!p) { setInfo('Рядом нет точки данных, повторите'); return true; }
      georefUI.addPair({ ...this.pendingUV, x: p.x, y: p.y });
      this.pendingUV = null;
      this.mode = null;
      return true;
    }

    if (this.mode === 'angle' && this.anglePair) {
      const uv = r2.screenToPdf(sx, sy, this.pdfLayer);
      if (!uv) return true;
      const pair = this.anglePair;
      this.anglePair = null;
      this.mode = null;
      georefUI.completeAnglePair(pair, uv.u, uv.v);
      return true;
    }

    return false;
  },
};
$('georef').addEventListener('click', () => georef.active ? georef.stop('Привязка отменена') : georef.start());

async function readText(file) {
  const buf = await file.arrayBuffer();
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); }
  catch { return new TextDecoder('windows-1251').decode(buf); }
}

function summary() {
  if (!state.layers.length) return 'Нет слоёв. Нажмите «Импорт» для загрузки.';
  const parts = state.layers.map(L => L.kind === 'pdf'
    ? `PDF: ${L.name}${L.pageNum ? ` (лист ${L.pageNum})` : ''}`
    : `${L.name}: точек ${L.pts.length}, линий ${L.groups.length}`);
  return parts.join(' | ') + '. Нажмите на точку, чтобы увидеть данные.';
}

async function get3d() {
  if (!r3) {
    const { createRender3d } = await import('./renderers/render3d.js');
    r3 = createRender3d({ canvas: $('c3') });
  }
  return r3;
}

function recomputePdfAffine() {
  for (const L of state.layers) {
    if (L.kind === 'pdf' && !L.userAffine) {
      L.affine = defaultAffine(L, r2.bounds());
    }
  }
}

async function redraw(refit) {
  if (refit) r2.fit();
  r2.draw();
  if (state.mode3d) {
    try { (await get3d()).build(state.layers); }
    catch (err) { setInfo('3D: ' + err.message); }
  }
}

// ---------- ИМПОРТ ----------
$('fileInput').addEventListener('change', async e => {
  const files = [...e.target.files];
  if (!files.length) return;
  const swap = swapEl.checked;
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
  if (r3) r3.resetPivot();
  layersPanel.render();
  setInfo(lastErr || summary());
  redraw(true);
  e.target.value = '';
});

$('fit').addEventListener('click', () => redraw(true));

$('fieldsBtn').addEventListener('click', () => fieldsModal.open());

// ---------- 2D / 3D ----------
$('mode3d').addEventListener('change', async e => {
  state.mode3d = e.target.checked;
  r2.setEnabled(!state.mode3d);
  if (state.mode3d) {
    const loader = $('loader');
    loader.hidden = false;
    try {
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const r = await get3d();
      if (!state.mode3d) return;
      r.setEnabled(true);
      r.build(state.layers);
    } catch (err) {
      setInfo('3D недоступен: ' + err.message);
      state.mode3d = false; e.target.checked = false; r2.setEnabled(true);
    } finally {
      loader.hidden = true;
    }
  } else if (r3) {
    r3.setEnabled(false);
    r3.cancelPivot();
    $('pickPivot').classList.remove('active');
  }
});

$('pickPivot').addEventListener('click', async () => {
  if (!state.mode3d) return setInfo('Сначала переключитесь в 3D');
  const r = await get3d();
  if (r.isPivotPicking()) { r.cancelPivot(); $('pickPivot').classList.remove('active'); return; }
  r.startPivot((ok, msg) => {
    $('pickPivot').classList.remove('active');
    setInfo(ok ? 'Точка вращения обновлена' : (msg || 'Точка вращения не выбрана'));
  });
  $('pickPivot').classList.add('active');
  setInfo('Тапните место в 3D для точки вращения');
});

// ---------- PWA ----------
if ('serviceWorker' in navigator) {
  addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

// ---------- Инициализация ----------
r2.resize();
syncSidebarBounds();

window.addEventListener('resize', syncSidebarBounds);
if ('ResizeObserver' in window) {
  const ro = new ResizeObserver(syncSidebarBounds);
  ro.observe($('top'));
  ro.observe($('info'));
}