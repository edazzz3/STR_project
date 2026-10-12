// Модал привязки PDF по N парам точек (2..10). Плюс плавающая подсказка при выборе пары.
import { solveAffine, computeRMS } from '../parsers/pdfOverlay.js';

const MAX_PAIRS = 10;
const RMS_WARN = 1;

export function createGeorefModal({ onApply, onRequestPair, onClose }) {
  const modal = document.getElementById('georefModal');
  const listEl = document.getElementById('georefList');
  const rmsEl = document.getElementById('georefRms');
  const btnAdd = document.getElementById('georefAdd');
  const btnApply = document.getElementById('georefApply');
  const btnCancel = document.getElementById('georefCancel');
  const backdrop = modal.querySelector('.modal-backdrop');

  const tip = document.getElementById('georefTip');
  const tipText = document.getElementById('georefTipText');
  const tipCancel = document.getElementById('georefTipCancel');

  let pairs = [];
  let pdfLayer = null;

  function currentRMS() {
    if (pairs.length < 3) return null;
    const T = solveAffine(pairs);
    return T ? computeRMS(T, pairs) : null;
  }

  function render() {
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
        del.addEventListener('click', () => {
          pairs.splice(i, 1);
          render();
        });
        row.append(label, del);
        listEl.appendChild(row);
      });
    }

    btnApply.disabled = pairs.length < 2;
    btnAdd.disabled = pairs.length >= MAX_PAIRS;

    rmsEl.textContent = '';
    if (pairs.length === 2) {
      rmsEl.textContent = 'RMS: — (нужно ≥3 пары для оценки)';
    } else if (pairs.length >= 3) {
      const rms = currentRMS();
      if (rms != null) {
        const warn = rms > RMS_WARN ? ' ⚠ превышает 1 м' : '';
        rmsEl.textContent = `RMS: ${rms.toFixed(3)} м${warn}`;
      } else {
        rmsEl.textContent = 'RMS: ошибка вычисления';
      }
    }
  }

  function open(layer) {
    pdfLayer = layer;
    pairs = [];
    render();
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
    render();
    modal.hidden = false;
  }

  function showTip(text) {
    tipText.textContent = text;
    tip.hidden = false;
    modal.hidden = true;
  }

  btnAdd.addEventListener('click', () => {
    onRequestPair && onRequestPair();
  });

  btnApply.addEventListener('click', () => {
    if (pairs.length < 2) return;
    const T = solveAffine(pairs);
    if (!T) return;
    const rms = computeRMS(T, pairs) || 0;
    onApply && onApply(pdfLayer, T, rms, pairs.length);
    close();
  });

  btnCancel.addEventListener('click', close);
  backdrop.addEventListener('click', close);
  tipCancel.addEventListener('click', close);

  return { open, close, addPair, showTip };
}