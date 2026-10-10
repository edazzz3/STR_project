// Контроллер: состояние слоёв, переключение 2D/3D, обработчики UI, регистрация SW.
import { parseStr } from './parsers/strParser.js';
import { parseTxt } from './parsers/txtParser.js';
import { loadPdf, defaultAffine, solveAffine } from './parsers/pdfOverlay.js';
import { createRender2d } from './renderers/render2d.js';

const $ = id => document.getElementById(id);
const infoEl = $('info');
const swapEl = $('swap');
const setInfo = t => { infoEl.textContent = t; };

// ---------- СОСТОЯНИЕ СЛОЁВ ----------
const layers = { pdf: null, str: null, txt: null };   // str/txt: {pts, groups, name}
const sources = { str: null, txt: null };             // исходный текст для перепарсинга при смене X/Y
let mode3d = false;
let r3 = null;                                        // render3d создаётся лениво

const r2 = createRender2d({
  canvas: $('c'),
  getLayers: () => layers,
  onInfo: setInfo,
  onTap: (x, y) => georef.active && georef.tap(x, y),
});

// Чтение файла: UTF-8, а если не получилось — Windows-1251 (кириллица из Surpac)
async function readText(file) {
  const buf = await file.arrayBuffer();
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); }
  catch { return new TextDecoder('windows-1251').decode(buf); }
}

const parsers = { str: parseStr, txt: parseTxt };

function parseLayer(kind) {
  const s = sources[kind];
  layers[kind] = s ? { ...parsers[kind](s.text, swapEl.checked), name: s.name } : null;
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
    r3 = createRender3d({ canvas: $('c3') });
  }
  return r3;
}

async function redraw(refit) {
  if (refit) r2.fit();
  r2.draw();
  if (mode3d) (await get3d()).build(layers);
}

// ---------- ЗАГРУЗКА ----------
for (const kind of ['str', 'txt']) {
  $(kind === 'str' ? 'fileStr' : 'fileTxt').addEventListener('change', async e => {
    const f = e.target.files[0];
    if (!f) return;
    sources[kind] = { text: await readText(f), name: f.name };
    parseLayer(kind);
    if (layers.pdf && !layers.pdf.affine) layers.pdf.affine = defaultAffine(layers.pdf, r2.bounds());
    setInfo(summary());
    redraw(true);
    e.target.value = '';
  });
}

$('filePdf').addEventListener('change', async e => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    setInfo('Загрузка PDF…');
    const pdf = await loadPdf(f);
    pdf.affine = defaultAffine(pdf, r2.bounds());
    layers.pdf = pdf;
    setInfo(summary());
    redraw(true);
  } catch (err) {
    setInfo('Ошибка PDF: ' + err.message);
  }
  e.target.value = '';
});

swapEl.addEventListener('change', () => {
  if (!sources.str && !sources.txt) return;
  parseLayer('str'); parseLayer('txt');
  redraw(true);
});

$('fit').addEventListener('click', () => redraw(true));

// ---------- 2D / 3D ----------
$('mode3d').addEventListener('change', async e => {
  mode3d = e.target.checked;
  r2.setEnabled(!mode3d);
  if (mode3d) {
    try {
      const r = await get3d();
      r.build(layers);
      r.setEnabled(true);
    } catch (err) {
      setInfo('3D недоступен: ' + err.message);
      mode3d = false; e.target.checked = false; r2.setEnabled(true);
    }
  } else if (r3) {
    r3.setEnabled(false);
  }
});

// ---------- ПРИВЯЗКА PDF (2 пары точек) ----------
// Для каждой пары: тап по месту на PDF, затем тап по точке STR/TXT.
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
    if (T) { layers.pdf.affine = T; this.stop('PDF привязан'); redraw(false); }
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
