// UI панели слоёв: список слоёв, видимость, блокировка, удаление.
import { state } from '../state.js';

export function createLayersPanel({ container, onChange }) {
  const sidebar = container;
  const header = sidebar.querySelector('.sidebar-header');
  const body = sidebar.querySelector('.sidebar-body');

  header.addEventListener('click', () => {
    sidebar.classList.toggle('expanded');
  });

  function render() {
    body.innerHTML = '';

    if (!state.layers.length) {
      const empty = document.createElement('div');
      empty.className = 'layer-empty';
      empty.textContent = 'Нет слоёв';
      body.appendChild(empty);
      return;
    }

    for (const layer of state.layers) {
      const row = document.createElement('div');
      row.className = 'layer-row';
      if (layer.id === state.activeId) row.classList.add('active');
      if (layer.locked) row.classList.add('locked');
      if (!layer.visible) row.classList.add('hidden-layer');

      const lock = document.createElement('span');
      lock.className = 'layer-lock';
      lock.textContent = layer.locked ? '🔒' : '🔓';
      lock.title = layer.locked ? 'Разблокировать' : 'Заблокировать';
      lock.addEventListener('click', e => {
        e.stopPropagation();
        layer.locked = !layer.locked;
        render();
        onChange && onChange();
      });

      const name = document.createElement('span');
      name.className = 'layer-name';
      name.textContent = layer.name;
      name.title = layer.name;

      const eye = document.createElement('span');
      eye.className = 'layer-eye';
      eye.textContent = layer.visible ? '👁' : '🚫';
      eye.title = layer.visible ? 'Скрыть' : 'Показать';
      eye.addEventListener('click', e => {
        e.stopPropagation();
        layer.visible = !layer.visible;
        render();
        onChange && onChange();
      });

      const del = document.createElement('span');
      del.className = 'layer-del';
      del.textContent = '✕';
      del.title = 'Удалить слой';
      del.addEventListener('click', e => {
        e.stopPropagation();
        const i = state.layers.indexOf(layer);
        if (i >= 0) state.layers.splice(i, 1);
        if (state.activeId === layer.id) state.activeId = null;
        render();
        onChange && onChange();
      });

      row.addEventListener('click', () => {
        state.activeId = (state.activeId === layer.id) ? null : layer.id;
        render();
        onChange && onChange();
      });

      row.append(lock, name, eye, del);
      body.appendChild(row);
    }
  }

  render();
  return { render };
}