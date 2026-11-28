# Архитектура STR Viewer

## 1. Дерево файлов и зоны ответственности

```
index.html            Разметка: toolbar, sidebar, 2 canvas (#c 2D, #c3 3D), модалы.
                      Подключает pdf.js (CDN) и importmap для three.
manifest.json         PWA-манифест (иконки, standalone, theme).
sw.js                 Service Worker: app shell + runtime-кэш.
css/style.css         Все стили. Только CSS-переменные (--accent-1 и т.п.), темы light/dark.

js/app.js             Точка входа: связывает модули, обработчики UI, 2D/3D, тема, регистрация SW.
js/state.js           Единый глобальный state (см. §4). Никакой логики.
js/surveyStore.js     Промер БВР: localStorage (ключ survey::<file>, TTL 30 дней) + экспорт CSV.
js/strWriter.js       Генерация .str по результатам промера (buildStrContent, downloadStrFile).

js/parsers/
  strParser.js        Парсер .str (Surpac). STYLES/DEFAULT_STYLE/STR_FIELDS, computeDrill, centroid,
                      records (1-based таблица записей для .dtm).
  dtmParser.js        Парсер .dtm (Surpac): имя парного .str, внешний контур, секция TRISOLATION.
  txtParser.js        Парсер текстовых съёмок (vb/nb/otm → id 202/203/103), TXT_FIELDS.
  pdfOverlay.js       pdf.js-загрузка страницы в canvas; аффинная привязка (solveAffine, RMS,
                      pdfToWorld/worldToPdf, defaultAffine).
  gridDetector.js     Детект координатной сетки на растре PDF (проекции яркости, пики).

js/renderers/
  render2d.js         Canvas 2D: PDF-подложка снизу, STR/TXT сверху; камера, pick, измерения.
  render3d.js         Three.js: OrbitControls, fat-lines (Line2), точки, стволы скважин, измерения.
  input.js            Жесты 2D (pan/pinch/wheel/tap) — только колбэки, без знания о view.
  pivot.js            Выбор точки вращения в 3D (raycast по точкам / плоскость Y=0).

js/ui/
  layers.js           Панель слоёв: видимость, блокировка, удаление, activeId.
  fields.js           Модал полей у точек (до 2 полей Z/D1..D26 + округление) → state.labelConfig.
  streams.js          Модал скрытия стрингов → state.hiddenStreams.
  georef.js           Модал привязки PDF (ручная по парам / по углам сетки, пресеты карьеров).
  pdfPages.js         Модал выбора страниц PDF при импорте.
  importFiles.js      Импорт: тип по расширению, парсинг, push в state.layers (лимит 10 слоёв).
  survey.js           Модал промера БВР: таблица скважин, автозапятая, экспорт CSV/.str.
```

## 2. Данные и офлайн PWA

- **Глобальное состояние** — только [`state`](js/state.js:11). Модули получают его через геттеры-колбэки
  (`getLayers`, `getLabelConfig`, `getHiddenStreams`, `getTheme`), а не импортируют напрямую (кроме UI).
- **Персистентность**: `localStorage` только для промера БВР ([`surveyStore.js`](js/surveyStore.js:1)).
  IndexedDB не используется. Слои/файлы в памяти, при перезагрузке теряются.
- **Service Worker** ([`sw.js`](sw.js:1)):
  - `CACHE = 'str-viewer-v13'`; `SHELL` — список всех локальных файлов (поштучный `add`, 404 не ломает install).
  - `install` → кэш shell + `skipWaiting`; `activate` → удаление старых кэшей + `clients.claim`.
  - `fetch` (только GET): cache-first с фоновым обновлением (stale-while-revalidate); офлайн → 503.
  - CDN (three, pdf.js) кэшируются при первом обращении (opaque-ответы).
- **Правило**: новый JS-файл → добавить в `SHELL` и поднять версию `CACHE`.

## 3. Обработка STR / PDF и 3D-рендер

**STR** ([`strParser.js`](js/parsers/strParser.js:119)): строки `id, Y, X, Z, D1..D26`; `id=0` — конец стринга.
`swap` меняет X/Y. Группы — подряд идущие записи с одним `id`. Для `kind:'points'` со стилем скважин
(172–179) считается ствол `drill` по D9 (азимут), D10 (наклон), глубине D23 (факт) → D4 (проект).
Стили и подписи — из `STYLES` по номеру стринга. Дополнительно возвращается `records` — 1-based таблица
записей (включая разделители `0,0,0,0`), нужная для материализации вершин `.dtm`.

**DTM** ([`dtmParser.js`](js/parsers/dtmParser.js:1)): первая строка — имя парного `.str`; блок `1, Y, X, Z,`
до `OBJECT, 1,` — внешний контур (не рисуется); секция `TRISOLATION` — треугольники
`triId, v1, v2, v3, n1, n2, n3`, где `v1..v3` — 1-based номера записей `.str`. При связывании `.dtm`
материализует вершины `{x,y,z}` из `.str` по `records` и становится автономным (скрытие/удаление `.str`
его не затрагивает). 2D: полупрозрачная заливка + тонкие рёбра поверх PDF и под `.str/.txt`.
3D: `MeshStandardMaterial` (`DoubleSide`, `transparent`, `flatShading`, `depthWrite:false`) +
`WireframeGeometry`; `HemisphereLight` + `DirectionalLight`.

**TXT** ([`txtParser.js`](js/parsers/txtParser.js:44)): `имя X Y Z [описание]`; коды `vb/nb/otm` → id 202/203/103,
иначе id = первое слово описания или `'txt'`. `asLine` соединяет бровки в линии.

**PDF** ([`pdfOverlay.js`](js/parsers/pdfOverlay.js:11)): pdf.js рендерит страницу в canvas (scale 4, лимит 40 МП).
Привязка — аффинное `{a,b,c,d,e,f}`: 2 пары → подобие, 3+ → МНК. `userAffine=true` фиксирует ручную привязку,
иначе `defaultAffine` вписывает PDF в bbox данных. `gridDetector` ищет сетку для привязки по углам.

**3D** ([`render3d.js`](js/renderers/render3d.js:68)): Three.js, OrbitControls, `Line2`/`LineMaterial` (fat-lines,
кэш материалов по цвету+толщине), точки через `PointsMaterial` с canvas-текстурой круга. Координаты:
`v(p) = (x−cx, z−cz, −(y−cy))` — Z вверх, Y-север инвертирован. Строятся только видимые слои/стринги;
стволы скважин — отдельные линии. `build(layers, {preserveCamera})` сохраняет камеру при пересборке.
Тёмная тема: `adaptColor` осветляет тёмные цвета.

## 4. Ключевые контракты (НЕ ЛОМАТЬ)

**Точка**: `{ id, x, y, z, d: string[], drill?: {az, dip, depth, actual, end:{x,y,z}} }`
(`d[0]=D1 … d[25]=D26`; для TXT `d=[name, desc]`).

**Группа**: `{ id, idx: number[], kind?: 'line'|'points', text?, center? }`.

**Слой**:
- str/txt: `{ id, kind:'str'|'txt', name, visible, locked, pts, groups, header?, records? }`
- pdf: `{ id, kind:'pdf', name, visible, locked, canvas, width, height, affine, userAffine, pageNum, pageCount }`
- dtm: `{ id, kind:'dtm', name, visible, locked, resolved, waitingFor, strLayerId?, pts, triangles, boundary? }`
  (`pts` — материализованные `{x,y,z}`; `triangles[].v` — локальные 0-based индексы; `resolved:false` — ждёт `.str`)

**state**: `{ layers, activeId, mode3d, labelConfig, hiddenStreams:Set<string>, theme }`.
`labelConfig[streamId] = { fields:['z'|'dN'], round }` — приоритет над `STYLES[id].labelField`.

**Публичные API рендеров**:
- 2D: `draw, fit, resize, bounds, pickPoint, screenToPdf, resetHighlight, setMeasureMode, setTheme, setEnabled`.
- 3D: `build, resize, setView, setMeasureMode, startPivot, cancelPivot, isPivotPicking, resetPivot, setTheme, setEnabled`.

**События/поток**: `importFiles` → `state.layers` → `layersPanel.render()` → `redraw(refit)` →
`r2.draw()` + `r3.build()`. `hiddenStreams` хранит строковые ID; на `locked`-слоях скрытие не действует.
`.dtm` резолвится по basename `.str` (lower-case); при одновременном импорте `.str` обрабатывается раньше.
`hiddenStreams` на `kind:'dtm'` не влияет. Тема — атрибут `data-theme` на `<html>` + `state.theme`;
цвета только через CSS-переменные.
