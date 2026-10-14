// Модал управления видимостью стрингов.
// Список уникальных ID из всех незаблокированных str/txt-слоёв.
// Галочка СТОИТ = стринг СКРЫТ. Галочка снята = стринг виден.
import { state } from '../state.js';

export function createStreamsModal({ onApply }) {
  const modal = document.getElementById('streamsModal');
  const listEl = document.getElementById('streamsList');
  const btnShowAll = document.getElementById('streamsShowAll');
  const btnClose = document.getElementById('streamsClose');
  const backdrop = modal.querySelector('.modal-backdrop');

  function collectStreams() {
    const ids = new Set();
    for (const L of state.layers) {
      if (L.kind !== 'str' && L.kind !== 'txt') continue;
      if (L.locked) continue;
      for (const g of L.groups) ids.add(g.id);
    }
    return [...ids].sort((a, b) => {
      const an = typeof a === 'number' ? a : 9999;
      const bn = typeof b === 'number' ? b : 9999;
      return an - bn || String(a).localeCompare(String(b));
    });
  }

  function labelFor(id) {
    if (id === 'txt') return 'TXT';
    return String(id);
  }

  function render() {
    listEl.innerHTML = '';
    const allIds = collectStreams();

    if (!allIds.length) {
      const empty = document.createElement('div');
      empty.className = 'modal-empty';
      empty.textContent = 'Нет незаблокированных слоёв со стрингами';
      listEl.appendChild(empty);
      btnShowAll.disabled = true;
      return;
    }
    btnShowAll.disabled = state.hiddenStreams.size === 0;

    for (const id of allIds) {
      const key = String(id);
      const row = document.createElement('label');
      row.className = 'modal-row';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = state.hiddenStreams.has(key);
      cb.addEventListener('change', () => {
        if (cb.checked) state.hiddenStreams.add(key);
        else state.hiddenStreams.delete(key);
        btnShowAll.disabled = state.hiddenStreams.size === 0;
      });
      row.append(cb, document.createTextNode(' ' + labelFor(id)));
      listEl.appendChild(row);
    }
  }

  function open() {
    render();
    modal.hidden = false;
  }

  function close() {
    modal.hidden = true;
  }

  btnShowAll.addEventListener('click', () => {
    state.hiddenStreams.clear();
    render();
    onApply && onApply();
  });

  btnClose.addEventListener('click', () => {
    close();
    onApply && onApply();
  });

  backdrop.addEventListener('click', () => {
    close();
    onApply && onApply();
  });

  return { open, close };
}