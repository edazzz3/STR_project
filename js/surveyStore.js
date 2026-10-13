// Хранилище промера БВР: localStorage + экспорт в CSV.

const KEY_PREFIX = 'survey::';
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 дней

function keyFor(fileName) {
  return KEY_PREFIX + fileName;
}

/** Загружает данные промера для файла. Чистит устаревшие (>30 дней). */
export function loadSurvey(fileName) {
  try {
    const raw = localStorage.getItem(keyFor(fileName));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    if (parsed.updatedAt && Date.now() - parsed.updatedAt > MAX_AGE_MS) {
      localStorage.removeItem(keyFor(fileName));
      return {};
    }
    return parsed.strings || {};
  } catch {
    return {};
  }
}

/** Сохраняет данные промера для файла. data = { [stringId]: { [wellKey]: {depth, angle} } } */
export function saveSurvey(fileName, data) {
  try {
    localStorage.setItem(keyFor(fileName), JSON.stringify({
      updatedAt: Date.now(),
      strings: data,
    }));
  } catch (err) {
    // localStorage может быть переполнен — молча игнорируем
    console.warn('surveyStore: не удалось сохранить', err);
  }
}

/**
 * Экспорт текущего стринга в CSV.
 * @param {object} opts
 *   fileName   — имя исходного .str (без пути)
 *   stringId   — ID стринга (число или 'txt')
 *   blockName  — название блока (D2)
 *   wells      — массив { num, projectDepth, depth, angle }
 */
export function exportSurveyCsv({ fileName, stringId, blockName, wells }) {
  const lines = [];
  lines.push('# Промер БВР');
  lines.push(`# Файл: ${fileName}`);
  lines.push(`# Стринг: ${stringId}`);
  lines.push(`# Блок: ${blockName || '—'}`);
  lines.push('№ скв,Факт глубина,Проект глубина,Факт угол');
  for (const w of wells) {
    lines.push([
      w.num ?? '',
      w.depth ?? '',
      w.projectDepth ?? '',
      w.angle ?? '',
    ].join(','));
  }
  // UTF-8 с BOM — чтобы Excel/телефоны корректно открыли кириллицу
  const csv = '\uFEFF' + lines.join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });

  const baseName = fileName.replace(/\.[^.]+$/, '');
  const outName = `${baseName}_промер_стринг-${stringId}.csv`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = outName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}