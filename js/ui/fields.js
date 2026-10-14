// Модальное окно настройки отображаемых полей у точек.
// Шаг 1: выбор стрингов. Шаг 2: выбор до 2 полей (Z + D1..D26) + округление.
import { state } from '../state.js';
import { STR_FIELDS } from '../parsers/strParser.js';
import { TXT_FIELDS } from '../parsers/txtParser.js';

export function createFieldsModal({ onApply }) {
  const modal = document.getElementById('fieldsModal');
  const step1 = modal.querySelector('.step-1');
  const step2 = modal.querySelector('.step-2');
  const streamListEl = document.getElementById('fieldsStreamList');
  const fieldsListEl = document.getElementById('fieldsList');
  const roundEl = document.getElementById('fieldsRound');
  const btnNext = document.getElementById('fieldsNext');
  const btnBack = document.getElementById('fieldsBack');
  const btnReset = document.getElementById('fieldsReset');
  const btnApply = document.getElementById('fieldsApply');

  let selectedStreams = new Set();
  let selectedFields = [];

  function collectStreams() {
    const ids = new Set();
    for (const L of state.layers) {
      if (!L.visible || (L.kind !== 'str' && L.kind !== 'txt')) continue;
      for (const g of L.groups) ids.add(g.id);
    }
    return [...ids].sort((a, b) => {
      const an = typeof a === 'number' ? a : 9999;
      const bn = typeof b === 'number' ? b : 9999;
      return an - bn || String(a).localeCompare(String(b));
    });
  }

  function collectFieldsFor(ids) {
    const dNums = new Set();
    let hasZ = false;
    for (const L of state.layers) {
      if (!L.visible || (L.kind !== 'str' && L.kind !== 'txt')) continue;
      for (const g of L.groups) {
        if (!ids.has(g.id)) continue;
        for (const i of g.idx) {
          const p = L.pts[i];
          if (p.z != null && Number.isFinite(+p.z)) hasZ = true;
          if (!p.d) continue;
          for (let k = 0; k < p.d.length; k++) {
            const v = p.d[k];
            if (v != null && v !== '') dNums.add(k + 1);
          }
        }
      }
    }
    const out = [];
    if (hasZ) out.push('z');
    for (const n of [...dNums].sort((a, b) => a - b)) out.push('d' + n);
    return out;
  }

  function labelFor(key) {
    if (key === 'z') return 'Z — Отметка';
    const num = +key.slice(1);
    const onlyTxt = selectedStreams.size === 1 && selectedStreams.has('txt');
    const dict = onlyTxt ? TXT_FIELDS : STR_FIELDS;
    return dict[num] ? `D${num} — ${dict[num]}` : `D${num}`;
  }

  function streamLabel(id) {
    if (id === 'txt') return 'TXT';
    return String(id);
  }

  function showStep(n) {
    step1.hidden = n !== 1;
    step2.hidden = n !== 2;
  }

  function renderStep1() {
    streamListEl.innerHTML = '';
    const allIds = collectStreams();

    if (!allIds.length) {
      const empty = document.createElement('div');
      empty.className = 'modal-empty';
      empty.textContent = 'Нет видимых слоёв со стрингами';
      streamListEl.appendChild(empty);
      btnNext.disabled = true;
      return;
    }
    btnNext.disabled = selectedStreams.size === 0;

    const allRow = document.createElement('label');
    allRow.className = 'modal-row modal-row-all';
    const allCb = document.createElement('input');
    allCb.type = 'checkbox';
    allCb.checked = selectedStreams.size === allIds.length && allIds.length > 0;
    allCb.addEventListener('change', () => {
      selectedStreams = allCb.checked ? new Set(allIds) : new Set();
      renderStep1();
    });
    allRow.append(allCb, document.createTextNode(' Выбрать все'));
    streamListEl.appendChild(allRow);

    for (const id of allIds) {
      const row = document.createElement('label');
      row.className = 'modal-row';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = selectedStreams.has(id);
      cb.addEventListener('change', () => {
        if (cb.checked) selectedStreams.add(id);
        else selectedStreams.delete(id);
        renderStep1();
      });
      row.append(cb, document.createTextNode(' ' + streamLabel(id)));
      streamListEl.appendChild(row);
    }
  }

  function renderStep2() {
    fieldsListEl.innerHTML = '';
    const available = collectFieldsFor(selectedStreams);

    if (!available.length) {
      const empty = document.createElement('div');
      empty.className = 'modal-empty';
      empty.textContent = 'В выбранных стрингах нет заполненных полей';
      fieldsListEl.appendChild(empty);
      roundEl.parentElement.style.display = 'none';
      return;
    }
    roundEl.parentElement.style.display = '';

    for (const key of available) {
      const row = document.createElement('label');
      row.className = 'modal-row';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = selectedFields.includes(key);
      cb.disabled = !cb.checked && selectedFields.length >= 2;
      cb.addEventListener('change', () => {
        if (cb.checked) {
          if (selectedFields.length >= 2) return;
          selectedFields.push(key);
        } else {
          selectedFields = selectedFields.filter(f => f !== key);
        }
        renderStep2();
      });
      row.append(cb, document.createTextNode(' ' + labelFor(key)));
      fieldsListEl.appendChild(row);
    }
  }

  function open() {
    const keys = Object.keys(state.labelConfig);
    selectedStreams = new Set(keys.map(k => {
      const n = Number(k);
      return Number.isFinite(n) && String(n) === k ? n : k;
    }));
    selectedFields = [];
    roundEl.checked = false;
    showStep(1);
    renderStep1();
    modal.hidden = false;
  }

  function close() { modal.hidden = true; }

  btnNext.addEventListener('click', () => {
    if (!selectedStreams.size) return;
    const cfgList = [...selectedStreams].map(id => state.labelConfig[id]).filter(Boolean);
    if (cfgList.length && cfgList.every(c => JSON.stringify(c) === JSON.stringify(cfgList[0]))) {
      selectedFields = [...(cfgList[0].fields || [])];
      roundEl.checked = !!cfgList[0].round;
    } else {
      selectedFields = [];
      roundEl.checked = false;
    }
    showStep(2);
    renderStep2();
  });

  btnBack.addEventListener('click', () => {
    showStep(1);
    renderStep1();
  });

  btnReset.addEventListener('click', () => {
    for (const id of selectedStreams) delete state.labelConfig[id];
    close();
    onApply && onApply();
  });

  btnApply.addEventListener('click', () => {
    const round = roundEl.checked;
    for (const id of selectedStreams) {
      state.labelConfig[id] = { fields: [...selectedFields], round };
    }
    close();
    onApply && onApply();
  });

  modal.querySelector('.modal-backdrop').addEventListener('click', close);

  return { open, close };
}