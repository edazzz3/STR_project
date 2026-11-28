// UI панели слоёв: список слоёв, видимость, блокировка, удаление.
// Для слоёв .dtm — индивидуальные цвет и прозрачность поверхности.
import { state } from '../state.js';

export function createLayersPanel({ container, onChange, onDtmStyle }) {
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
      const item = document.createElement('div');
      item.className = 'layer-item';

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

      // Бейдж DTM: для зарезолвленной поверхности — «DTM», для ожидающей — «DTM · ждёт .str».
      let badge = null;
      if (layer.kind === 'dtm') {
        badge = document.createElement('span');
        badge.className = 'layer-badge';
        badge.textContent = layer.resolved ? 'DTM' : 'DTM · ждёт .str';
        badge.title = layer.resolved
          ? `Поверхность: ${layer.triangles.length} треуг.`
          : `Ожидает ${layer.waitingFor}`;
      }

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

      row.append(lock, name);
      if (badge) row.append(badge);
      row.append(eye, del);
      item.appendChild(row);

      // Вторая строка для .dtm: цвет поверхности + прозрачность.
      if (layer.kind === 'dtm') {
        item.appendChild(buildDtmControls(layer));
      }

      body.appendChild(item);
    }
  }

  /** Компактная строка настроек поверхности .dtm: цвет + прозрачность. */
  function buildDtmControls(layer) {
    const row = document.createElement('div');
    row.className = 'layer-dtm-controls';
    // Клики по контролам не должны переключать активность слоя.
    row.addEventListener('click', e => e.stopPropagation());

    const color = document.createElement('input');
    color.type = 'color';
    color.className = 'layer-dtm-color';
    color.value = layer.color || '#2563eb';
    color.title = 'Цвет поверхности DTM';
    color.addEventListener('input', () => {
      layer.color = color.value;
      // Обновляем материал напрямую, без пересборки 3D и сброса камеры.
      onDtmStyle && onDtmStyle(layer);
    });

    const range = document.createElement('input');
    range.type = 'range';
    range.min = '0';
    range.max = '1';
    range.step = '0.05';
    range.value = String(layer.opacity != null ? layer.opacity : 0.6);
    range.className = 'layer-dtm-range';
    range.title = 'Прозрачность поверхности DTM';

    const pct = document.createElement('span');
    pct.className = 'layer-dtm-pct';
    pct.textContent = Math.round((layer.opacity != null ? layer.opacity : 0.6) * 100) + '%';

    range.addEventListener('input', () => {
      const v = Math.min(1, Math.max(0, +range.value));
      layer.opacity = v;
      pct.textContent = Math.round(v * 100) + '%';
      onDtmStyle && onDtmStyle(layer);
    });

    row.append(color, range, pct);
    return row;
  }

  render();
  return { render };
}