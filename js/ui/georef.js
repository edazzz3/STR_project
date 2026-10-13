// Модал привязки PDF. Две вкладки: «Ручная» (N пар по точкам STR) и «По углам» (3+ угла сетки).
import { solveAffine, computeRMS } from '../parsers/pdfOverlay.js';

const MAX_PAIRS = 10;
const RMS_WARN = 1;

// Пресеты углов сетки по карьерам. Порядок точек: правый нижний → левый нижний → левый верхний.
const PIT_PRESETS = {
  VI: [
    { label: 'Правый нижний',  x: 7800, y: 5800 },
    { label: 'Левый нижний',   x: 6600, y: 5800 },
    { label: 'Левый верхний',  x: 6600, y: 7200 },
  ],
  B2: [
    { label: 'Правый нижний',  x: 10800, y: 8800 },
    { label: 'Левый нижний',   x: 9800,  y: 8800 },
    { label: 'Левый верхний',  x: 9800,  y: 10000 },
  ],
};

export function createGeorefModal({ onApply, onRequestPair, onRequestAnglePair, onClose }) {
  const modal = document.getElementById('georefModal');
  const tabs = modal.querySelectorAll('.modal-tab');
  const manualEl = document.getElementById('georefManual');
  const angleEl = document.getElementById('georefAngle');

  // Ручная
  const listEl = document.getElementById('georefList');
  const rmsEl = document.getElementById('georefRms');
  const btnAdd = document.getElementById('georefAdd');
  const btnApply = document.getElementById('georefApply');
  const btnCancel = document.getElementById('georefCancel');

  // По углам
  const angleListEl = document.getElementById('angleList');
  const angleRms = document.getElementById('angleRms');
  const anglePit = document.getElementById('anglePit');
  const btnAngleAdd = document.getElementById('angleAdd');
  const btnAngleChain = document.getElementById('angleChain');
  const btnAngleApply = document.getElementById('angleApply');

  const tip = document.getElementById('georefTip');
  const tipText = document.getElementById('georefTipText');
  const tipCancel = document.getElementById('georefTipCancel');

  let pairs = [];
  let anglePairs = [];
  let pdfLayer = null;

  function switchTab(name) {
    tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === name));
    manualEl.hidden = name !== 'manual';
    angleEl.hidden = name !== 'angle';
  }
  tabs.forEach(t => t.addEventListener('click', () => switchTab(t.dataset.tab)));

  // ── Ручная вкладка ──
  function currentRMS() {
    if (pairs.length < 3) return null;
    const T = solveAffine(pairs);
    return T ? computeRMS(T, pairs) : null;
  }

  function renderManual() {
    listEl.innerHTML = '';
    if (!pairs.length) {
      const empty = document.createElement('div');
      empty.className = 'modal-empty';
      empty.textContent = 'Пар пока нет. Нажмите «Добавить пару».';
      listEl.appendChild(empty);
    } else {
      pairs.forEach((p, i) => {
        const row = document.createElement('div');
        row.className = 'modal-row';
        const label = document.createElement('span');
        label.className = 'georef-pair-label';
        label.textContent = `#${i + 1} · PDF(${Math.round(p.u)}, ${Math.round(p.v)}) → X ${p.x.toFixed(3)}, Y ${p.y.toFixed(3)}`;
        const del = document.createElement('span');
        del.className = 'layer-del';
        del.textContent = '✕';
        del.addEventListener('click', () => { pairs.splice(i, 1); renderManual(); });
        row.append(label, del);
        listEl.appendChild(row);
      });
    }
    btnApply.disabled = pairs.length < 2;
    btnAdd.disabled = pairs.length >= MAX_PAIRS;
    rmsEl.textContent = '';
    if (pairs.length === 2) rmsEl.textContent = 'RMS: — (нужно ≥3 пары для оценки)';
    else if (pairs.length >= 3) {
      const rms = currentRMS();
      if (rms != null) {
        const warn = rms > RMS_WARN ? ' ⚠ превышает 1 м' : '';
        rmsEl.textContent = `RMS: ${rms.toFixed(3)} м${warn}`;
      } else rmsEl.textContent = 'RMS: ошибка вычисления';
    }
  }

  btnAdd.addEventListener('click', () => onRequestPair && onRequestPair());
  btnApply.addEventListener('click', () => {
    if (pairs.length < 2) return;
    const T = solveAffine(pairs);
    if (!T) return;
    const rms = computeRMS(T, pairs) || 0;
    onApply && onApply(pdfLayer, T, rms, pairs.length);
    close();
  });

  // ── Вкладка «По углам» ──
  function applyPitPreset(pit) {
    const preset = PIT_PRESETS[pit] || PIT_PRESETS.VI;
    anglePairs = preset.map(p => ({ ...p, u: null, v: null }));
  }

  function angleReady() {
    return anglePairs.filter(p => p.u != null && p.v != null
      && Number.isFinite(p.x) && Number.isFinite(p.y));
  }

  function renderAngles() {
    angleListEl.innerHTML = '';
    anglePairs.forEach((p, i) => {
      const row = document.createElement('div');
      row.className = 'angle-row';
      if (p.u != null) row.classList.add('picked');

      const label = document.createElement('span');
      label.className = 'angle-label';
      label.textContent = p.label || `Точка ${i + 1}`;

      const xIn = document.createElement('input');
      xIn.type = 'number'; xIn.step = 'any'; xIn.placeholder = 'X';
      xIn.value = Number.isFinite(p.x) ? p.x : '';
      xIn.addEventListener('input', () => { p.x = xIn.value === '' ? NaN : +xIn.value; updateAngleApply(); });

      const yIn = document.createElement('input');
      yIn.type = 'number'; yIn.step = 'any'; yIn.placeholder = 'Y';
      yIn.value = Number.isFinite(p.y) ? p.y : '';
      yIn.addEventListener('input', () => { p.y = yIn.value === '' ? NaN : +yIn.value; updateAngleApply(); });

      const status = document.createElement('span');
      status.className = 'angle-status';
      status.textContent = p.u != null ? '✓' : '—';
      status.title = p.u != null ? `PDF(${Math.round(p.u)}, ${Math.round(p.v)})` : 'Точка не указана';

      const pick = document.createElement('button');
      pick.className = 'angle-pick';
      pick.textContent = '📍';
      pick.title = 'Указать точку на PDF';
      pick.addEventListener('click', () => startChain(p));

      const del = document.createElement('span');
      del.className = 'layer-del';
      del.textContent = '✕';
      del.addEventListener('click', () => {
        anglePairs.splice(i, 1);
        renderAngles();
      });

      row.append(label, xIn, yIn, status, pick, del);
      angleListEl.appendChild(row);
    });

    btnAngleAdd.disabled = anglePairs.length >= MAX_PAIRS;
    updateAngleApply();
  }

  function updateAngleApply() {
    const ready = angleReady();
    btnAngleApply.disabled = ready.length < 3;
    if (ready.length < 3) {
      angleRms.textContent = `Указано точек: ${ready.length} из минимум 3.`;
      return;
    }
    const T = solveAffine(ready);
    if (!T) { angleRms.textContent = 'Не удалось решить преобразование.'; return; }
    const rms = computeRMS(T, ready) || 0;
    const warn = rms > RMS_WARN ? ' ⚠' : '';
    angleRms.textContent = `RMS: ${rms.toFixed(3)} м${warn} · точек ${ready.length}`;
  }

  function startChain(fromPair) {
    let next = fromPair;
    if (!next) next = anglePairs.find(p => p.u == null);
    if (!next) return;
    modal.hidden = true;
    onRequestAnglePair && onRequestAnglePair(next);
  }

  function completeAnglePair(pair, u, v) {
    pair.u = u;
    pair.v = v;
    renderAngles();

    const next = anglePairs.find(p => p.u == null);
    if (next) {
      onRequestAnglePair && onRequestAnglePair(next);
    } else {
      tip.hidden = true;
      modal.hidden = false;
    }
  }

  anglePit.addEventListener('change', () => {
    applyPitPreset(anglePit.value);
    renderAngles();
  });

  btnAngleAdd.addEventListener('click', () => {
    if (anglePairs.length >= MAX_PAIRS) return;
    anglePairs.push({ label: `Точка ${anglePairs.length + 1}`, x: NaN, y: NaN, u: null, v: null });
    renderAngles();
  });

  btnAngleChain.addEventListener('click', () => startChain(null));

  btnAngleApply.addEventListener('click', () => {
    const ready = angleReady();
    if (ready.length < 3) return;
    const T = solveAffine(ready);
    if (!T) { angleRms.textContent = 'Не удалось решить преобразование.'; return; }
    const rms = computeRMS(T, ready) || 0;
    const warn = rms > RMS_WARN ? ' ⚠' : '';
    angleRms.textContent = `RMS: ${rms.toFixed(3)} м${warn}`;
    onApply && onApply(pdfLayer, T, rms, ready.length);
    close();
  });

  // ── Общее ──
  function open(layer) {
    pdfLayer = layer;
    pairs = [];
    anglePit.value = 'VI';
    applyPitPreset('VI');
    angleRms.textContent = '';
    renderManual();
    renderAngles();
    switchTab('manual');
    modal.hidden = false;
  }

  function close() {
    if (modal.hidden && tip.hidden) return;
    modal.hidden = true;
    tip.hidden = true;
    onClose && onClose();
  }

  function addPair(pair) {
    if (pairs.length >= MAX_PAIRS) return;
    pairs.push(pair);
    tip.hidden = true;
    renderManual();
    modal.hidden = false;
  }

  function showTip(text) {
    tipText.textContent = text;
    tip.hidden = false;
    modal.hidden = true;
  }

  btnCancel.addEventListener('click', close);
  modal.querySelector('.modal-backdrop').addEventListener('click', close);
  tipCancel.addEventListener('click', close);

  return { open, close, addPair, showTip, switchTab, completeAnglePair };
}