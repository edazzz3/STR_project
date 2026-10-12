// Контроллер: состояние слоёв, переключение 2D/3D, обработчики UI, регистрация SW.
import { parseStr } from './parsers/strParser.js';
import { parseTxt } from './parsers/txtParser.js';
import { loadPdf, defaultAffine, solveAffine } from './parsers/pdfOverlay.js';
import { createRender2d } from './renderers/render2d.js';

const $ = id => document.getElementById(id);
const infoEl = $('info');
const swapEl = $('swap');
const setInfo = t => { infoEl.textContent = t; };

const layers = { pdf: null, str: null, txt: null };
let mode3d = false;
let r3 = null;

const r2 = createRender2d({
  canvas: $('c'),
  getLayers: () => layers,
  onInfo: setInfo,
  onTap: (x, y) => georef.active && georef.tap(x, y),
});

async function readText(file) {
  const buf = await file.arrayBuffer();
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); }
  catch { return new TextDecoder('windows-1251').decode(buf); }
}

function summary() {
  const parts = [];
  for (const k of ['str', 'txt']) {
    const L = layers[k];
    if (L) parts.push(`${L.name}: точек ${L.pts.length}, линий ${L.groups.length}`);
  }
  if (layers.pdf) parts.push(`PDF: ${layers.pdf.name}`);
  return parts.join(' | ') + '. Нажмите на точку, чтобы увидеть данные.';
}

async function get3d() {
  if (!r3) {
    const { createRender3d } = await import('./renderers/render3d.js');
    r3 = createRender3d({ canvas: $('c3'), onInfo: setInfo });
  }
  return r3;
}

async function redraw(refit) {
  if (refit) r2.fit();
  r2.draw();
  if (mode3d) {
    try { (await get3d()).build(layers); }
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
    const ext = (f.name.split('.').pop() || '').toLowerCase();
    try {
      if (ext === 'pdf') {
        setInfo('Загрузка PDF…');
        const pdf = await loadPdf(f);
        pdf.affine = defaultAffine(pdf, r2.bounds());
        pdf.userAffine = false;
        layers.pdf = pdf;
      } else if (ext === 'str') {
        const text = await readText(f);
        layers.str = { ...parseStr(text, false), name: f.name };
        if (layers.pdf && !layers.pdf.userAffine) {
          layers.pdf.affine = defaultAffine(layers.pdf, r2.bounds());
        }
      } else if (ext === 'dwg' || ext === 'dxf') {
        lastErr = `«${f.name}»: формат не поддерживается`;
      } else {
        const text = await readText(f);
        layers.txt = { ...parseTxt(text, swap), name: f.name };
        if (layers.pdf && !layers.pdf.userAffine) {
          layers.pdf.affine = defaultAffine(layers.pdf, r2.bounds());
        }
      }
    } catch (err) {
      lastErr = `«${f.name}»: ${err.message}`;
    }
  }

  r2.resetHighlight();
  if (r3) r3.resetPivot();
  setInfo(lastErr || summary());
  redraw(true);
  e.target.value = '';
});

$('fit').addEventListener('click', () => redraw(true));

// ---------- 2D / 3D ----------
$('mode3d').addEventListener('change', async e => {
  mode3d = e.target.checked;
  r2.setEnabled(!mode3d);
  if (mode3d) {
    try {
      const r = await get3d();
      if (!mode3d) return;
      r.build(layers);
      r.setEnabled(true);
    } catch (err) {
      setInfo('3D недоступен: ' + err.message);
      mode3d = false; e.target.checked = false; r2.setEnabled(true);
    }
  } else if (r3) {
    r3.setEnabled(false);
    r3.cancelPivot();
    $('pickPivot').classList.remove('active');
  }
});

// ---------- ВЫБОР ТОЧКИ ВРАЩЕНИЯ (3D) ----------
$('pickPivot').addEventListener('click', async () => {
  if (!mode3d) return setInfo('Сначала переключитесь в 3D');
  const r = await get3d();
  if (r.isPivotPicking()) { r.cancelPivot(); $('pickPivot').classList.remove('active'); return; }
  r.startPivot((ok, msg) => {
    $('pickPivot').classList.remove('active');
    setInfo(ok ? 'Точка вращения обновлена' : (msg || 'Точка вращения не выбрана'));
  });
  $('pickPivot').classList.add('active');
  setInfo('Тапните место в 3D для точки вращения');
});

// ---------- ПРИВЯЗКА PDF ----------
const georef = {
  active: false, pairs: [], pendingUV: null,
  start() {
    if (!layers.pdf) return setInfo('Сначала загрузите PDF');
    if (!r2.bounds()) return setInfo('Сначала загрузите STR или TXT');
    if (mode3d) return setInfo('Привязка доступна в режиме 2D');
    Object.assign(this, { active: true, pairs: [], pendingUV: null });
    $('georef').classList.add('active');
    setInfo('Привязка 1/2: тапните место на PDF');
  },
  stop(msg) {
    this.active = false;
    $('georef').classList.remove('active');
    if (msg) setInfo(msg);
  },
  tap(sx, sy) {
    if (!this.pendingUV) {
      const uv = r2.screenToPdf(sx, sy);
      if (!uv) return true;
      this.pendingUV = uv;
      setInfo(`Привязка ${this.pairs.length + 1}/2: тапните соответствующую точку STR/TXT`);
      return true;
    }
    const p = r2.pickPoint(sx, sy);
    if (!p) { setInfo('Рядом нет точки данных, повторите'); return true; }
    this.pairs.push({ ...this.pendingUV, x: p.x, y: p.y });
    this.pendingUV = null;
    if (this.pairs.length < 2) {
      setInfo('Привязка 2/2: тапните второе место на PDF');
      return true;
    }
    const T = solveAffine(this.pairs);
    if (T) { layers.pdf.affine = T; layers.pdf.userAffine = true; this.stop('PDF привязан'); redraw(false); }
    else this.stop('Не удалось привязать: точки совпадают');
    return true;
  },
};
$('georef').addEventListener('click', () => georef.active ? georef.stop('Привязка отменена') : georef.start());

// ---------- PWA ----------
if ('serviceWorker' in navigator) {
  addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

r2.resize();