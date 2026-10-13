// Модал промера БВР: выбор слоя и стринга, таблица ввода факт. глубины и угла.
import { loadSurvey, saveSurvey, exportSurveyCsv } from '../surveyStore.js';
import { downloadStrFile } from '../strWriter.js';

/** Автозапятая для глубины. */
function autoDepth(raw) {
  if (raw == null) return '';
  const s = String(raw).trim();
  if (s === '') return '';
  if (s === '0') return 'не отбур';
  if (s === '1') return 'завал';
  if (s.includes('.') || s.includes(',')) return s.replace(',', '.');
  const n = +s;
  if (!Number.isFinite(n)) return s;
  let x = n;
  while (x > 19.9) x /= 10;
  return x.toFixed(1);
}

/** Автозапятая для угла. */
function autoAngle(raw) {
  if (raw == null) return '';
  const s = String(raw).trim();
  if (s === '') return '';
  if (s.includes('.') || s.includes(',')) return s.replace(',', '.');
  const n = +s;
  if (!Number.isFinite(n)) return s;
  let x = n;
  while (x > 90) x /= 10;
  return x.toFixed(1);
}

function formatProject(v) {
  if (v == null || v === '' || v === '—') return '—';
  const n = +String(v).replace(',', '.');
  return Number.isFinite(n) ? n.toFixed(1) : '—';
}

function projectForCsv(v) {
  const n = +String(v).replace(',', '.');
  return Number.isFinite(n) ? n.toFixed(1) : '';
}

function getStrLayers(state) {
  return state.layers.filter(L => L.kind === 'str');
}

function getDrillStrings(layer) {
  const ids = new Set();
  for (const g of layer.groups) {
    if (g.idx.some(i => layer.pts[i].drill)) ids.add(g.id);
  }
  return [...ids].sort((a, b) => {
    const an = typeof a === 'number' ? a : 9999;
    const bn = typeof b === 'number' ? b : 9999;
    return an - bn || String(a).localeCompare(String(b));
  });
}

function getWells(layer, stringId) {
  const wells = [];
  for (const g of layer.groups) {
    if (g.id !== stringId) continue;
    for (const i of g.idx) {
      const p = layer.pts[i];
      if (p.drill) wells.push(p);
    }
  }
  return wells;
}

function wellKey(p, idx) {
  const num = p.d[2];
  return num != null && num !== '' ? `n${num}` : `i${idx}`;
}

/** Прогоняет все сохранённые значения через автозапятую. */
function formatAllData(data) {
  for (const sid in data) {
    const values = data[sid] || {};
    for (const key in values) {
      const v = values[key];
      if (!v) continue;
      if (v.depth) v.depth = autoDepth(v.depth);
      if (v.angle) v.angle = autoAngle(v.angle);
    }
  }
}

export function createSurveyModal({ state }) {
  const modal = document.getElementById('surveyModal');
  const selLayer = document.getElementById('surveyLayer');
  const selString = document.getElementById('surveyString');
  const header = document.getElementById('surveyHeader');
  const tbody = document.getElementById('surveyTbody');
  const btnExport = document.getElementById('surveyExport');
  const btnExportStr = document.getElementById('surveyExportStr');
  const btnClose = document.getElementById('surveyClose');
  const backdrop = modal.querySelector('.modal-backdrop');

  let currentFileName = null;
  let currentLayer = null;
  let currentStringId = null;
  let currentWells = [];
  let data = {};

  function renderLayerOptions() {
    const layers = getStrLayers(state);
    selLayer.innerHTML = '';
    if (!layers.length) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = '— нет .str слоёв —';
      selLayer.appendChild(opt);
      selLayer.disabled = true;
      return;
    }
    selLayer.disabled = false;
    for (const L of layers) {
      const opt = document.createElement('option');
      opt.value = L.id;
      opt.textContent = L.name;
      selLayer.appendChild(opt);
    }
  }

  function renderStringOptions(layerId) {
    currentLayer = state.layers.find(L => L.id === layerId) || null;
    selString.innerHTML = '';
    if (!currentLayer) {
      selString.disabled = true;
      return;
    }
    const strings = getDrillStrings(currentLayer);
    if (!strings.length) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = '— нет стрингов с устьями —';
      selString.appendChild(opt);
      selString.disabled = true;
      return;
    }
    selString.disabled = false;
    for (const id of strings) {
      const opt = document.createElement('option');
      opt.value = String(id);
      opt.textContent = `Стринг ${id}`;
      selString.appendChild(opt);
    }
  }

  function rebuildWells() {
    currentWells = [];
    if (!currentLayer || currentStringId == null) return;
    const sid = isNaN(+currentStringId) ? currentStringId : +currentStringId;
    const wells = getWells(currentLayer, sid);
    wells.forEach((p, idx) => {
      currentWells.push({
        num: p.d[2] ?? '',
        projectDepth: (p.d[3] != null && p.d[3] !== '') ? String(p.d[3]) : '',
        key: wellKey(p, idx),
      });
    });
  }

  function currentBlockName() {
    if (!currentLayer || currentStringId == null) return '';
    const sid = isNaN(+currentStringId) ? currentStringId : +currentStringId;
    for (const g of currentLayer.groups) {
      if (g.id !== sid) continue;
      for (const i of g.idx) {
        const p = currentLayer.pts[i];
        if (p.drill) return p.d[1] || '';
      }
    }
    return '';
  }

  function getValues() {
    if (!currentStringId) return {};
    return data[currentStringId] || (data[currentStringId] = {});
  }

  function persist() {
    if (currentFileName) saveSurvey(currentFileName, data);
  }

  function formatCell(inp) {
    const col = inp.dataset.col;
    const rowIdx = +inp.dataset.row;
    const w = currentWells[rowIdx];
    if (!w) return;
    const raw = inp.value;
    const formatted = col === 'depth' ? autoDepth(raw) : autoAngle(raw);
    inp.value = formatted;
    const values = getValues();
    if (!values[w.key]) values[w.key] = {};
    values[w.key][col] = formatted;
    persist();
  }

  function onInput(inp) {
    const rowIdx = +inp.dataset.row;
    const w = currentWells[rowIdx];
    if (!w) return;
    const values = getValues();
    if (!values[w.key]) values[w.key] = {};
    values[w.key][inp.dataset.col] = inp.value;
    persist();
  }

  function onKeydown(e) {
    if (e.key !== 'Enter' && e.keyCode !== 13) return;
    e.preventDefault();
    const inp = e.currentTarget;
    formatCell(inp);
    const rowIdx = +inp.dataset.row;
    const col = inp.dataset.col;
    const next = tbody.querySelector(`input[data-row="${rowIdx + 1}"][data-col="${col}"]`);
    if (next) {
      next.focus();
      next.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  function createInput(col, rowIdx, value) {
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.inputMode = 'decimal';
    inp.autocomplete = 'off';
    inp.spellcheck = false;
    inp.setAttribute('enterkeyhint', 'next');
    inp.setAttribute('autocorrect', 'off');
    inp.setAttribute('autocapitalize', 'off');
    inp.dataset.row = String(rowIdx);
    inp.dataset.col = col;
    inp.value = value || '';
    inp.addEventListener('keydown', onKeydown);
    inp.addEventListener('blur', () => formatCell(inp));
    inp.addEventListener('input', () => onInput(inp));
    return inp;
  }

  function renderTable() {
    tbody.innerHTML = '';
    if (!currentWells.length) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 4;
      td.className = 'survey-empty';
      td.textContent = 'Выберите слой и стринг';
      tr.appendChild(td);
      tbody.appendChild(tr);
      header.textContent = '';
      return;
    }

    const block = currentBlockName();
    header.textContent = `Промер блока: ${block || '—'} · Слой: ${currentLayer.name} · Стринг ${currentStringId}`;

    const values = getValues();

    currentWells.forEach((w, rowIdx) => {
      const tr = document.createElement('tr');

      const tdNum = document.createElement('td');
      tdNum.className = 'survey-num';
      tdNum.textContent = w.num;
      tr.appendChild(tdNum);

      const tdDepth = document.createElement('td');
      tdDepth.appendChild(createInput('depth', rowIdx, values[w.key]?.depth));
      tr.appendChild(tdDepth);

      const tdProj = document.createElement('td');
      tdProj.className = 'survey-project';
      tdProj.textContent = formatProject(w.projectDepth);
      tr.appendChild(tdProj);

      const tdAngle = document.createElement('td');
      tdAngle.appendChild(createInput('angle', rowIdx, values[w.key]?.angle));
      tr.appendChild(tdAngle);

      tbody.appendChild(tr);
    });
  }

  function rebuild() {
    currentFileName = currentLayer ? currentLayer.name : null;
    currentStringId = selString.value || null;
    rebuildWells();
    data = currentFileName ? loadSurvey(currentFileName) : {};
    renderTable();
  }

  selLayer.addEventListener('change', () => {
    renderStringOptions(selLayer.value);
    rebuild();
  });

  selString.addEventListener('change', () => {
    rebuild();
  });

  btnExport.addEventListener('click', () => {
    if (!currentLayer || !currentStringId) return;
    tbody.querySelectorAll('input').forEach(inp => formatCell(inp));
    formatAllData(data);
    persist();
    const values = getValues();
    const wells = currentWells.map(w => ({
      num: w.num,
      depth: values[w.key]?.depth || '',
      projectDepth: projectForCsv(w.projectDepth),
      angle: values[w.key]?.angle || '',
    }));
    exportSurveyCsv({
      fileName: currentLayer.name,
      stringId: currentStringId,
      blockName: currentBlockName(),
      wells,
    });
  });

  btnExportStr.addEventListener('click', () => {
    if (!currentLayer || !currentStringId) return;
    tbody.querySelectorAll('input').forEach(inp => formatCell(inp));
    formatAllData(data);
    persist();
    downloadStrFile({ layer: currentLayer, data });
  });

  function open() {
    renderLayerOptions();
    const firstLayerId = selLayer.value || (getStrLayers(state)[0]?.id);
    if (firstLayerId) selLayer.value = firstLayerId;
    renderStringOptions(firstLayerId);
    if (!selString.disabled && selString.options.length) selString.selectedIndex = 0;
    rebuild();
    modal.hidden = false;
  }

  function close() {
    modal.hidden = true;
  }

  btnClose.addEventListener('click', close);
  backdrop.addEventListener('click', close);

  return { open, close };
}