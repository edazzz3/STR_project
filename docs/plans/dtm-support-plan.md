# Поддержка Surpac `.dtm` в STR Viewer

## Problem

STR Viewer — офлайн-PWA на Vanilla JS (ES-модули), Canvas 2D и Three.js, без сборщиков.
Сейчас импортируются `.str`, `.txt`, `.pdf`. Формат Surpac `.dtm` содержит триангуляцию
поверхности, вершины которой ссылаются на записи парного `.str`. Требуется:

- парсить `.dtm` без внешних зависимостей и сборщиков;
- связать `.dtm` с `.str` при любом порядке импорта (в т.ч. одновременном выборе);
- отрисовать поверхность в 2D и 3D, не ломая контракты `state`, точек/групп/слоёв
  и публичные API [`render2d.js`](../js/renderers/render2d.js:516) / [`render3d.js`](../js/renderers/render3d.js:431);
- сохранить офлайн-кеш [`sw.js`](../sw.js:1) и темы light/dark.

## Approach

1. **Аддитивно расширить [`parseStr`](../js/parsers/strParser.js:119)**: добавить в возвращаемый
   объект `records` — таблицу 1-based записей `.str`, где `records[k-1]` = индекс в `pts`
   либо `null` для строки-разделителя. Поля `pts`, `groups`, `header` не меняются.
2. **Новый модуль [`js/parsers/dtmParser.js`](../js/parsers/dtmParser.js:1)**: парсит имя
   парного `.str`, блок контура (координаты, не рисуется) и секцию `TRISOLATION`.
3. **Хранение — отдельный слой `kind: 'dtm'`** в `state.layers` со своими
   `id, name, visible, locked`. `.dtm` и `.str` загружаются, отображаются и удаляются
   независимо.
4. **Материализация вершин**: в момент связывания `.dtm` копирует нужные `{x, y, z}` из
   `strLayer.pts` по `records` в собственный `pts`. После этого слой `.dtm` автономен:
   скрытие/удаление `.str` его не затрагивает.
5. **Ожидание `.str`**: если парного `.str` нет — слой создаётся сразу с `resolved: false`
   и `waitingFor`; при появлении `.str` (basename lower-case) ожидающие слои резолвятся.
   При одновременном выборе сначала обрабатываются `.str`, затем `.dtm`.
6. **Рендер**: 2D — полупрозрачная заливка + тонкие рёбра, поверх PDF и **под** `.str`/`.txt`;
   3D — `MeshStandardMaterial` (`DoubleSide`, `transparent`, `flatShading`, `depthWrite:false`)
   + `WireframeGeometry` поверх + `HemisphereLight`/`DirectionalLight`.
7. **UI**: `accept` в [`index.html`](../index.html:59), бейдж `DTM` и индикация ожидания в
   [`layers.js`](../js/ui/layers.js:4), обновление `summary()`.
8. **PWA**: `dtmParser.js` в `SHELL`, `CACHE` → `v13`.

## Data Structures

### `parseStr` (аддитивно, контракт не ломается)

```
{
  pts, groups, header,          // без изменений
  records: Array<number|null>,  // records[k-1] → индекс в pts | null (разделитель)
  recordCount: number
}
```

Правило нумерации: служебная строка осей (`0, 0.000, ...` с 6 нулями, line index 1)
исключается; записи начинаются со следующей строки. Пустые строки не занимают слот.
`swap` влияет только на координаты, но не на индексы.

### `parseDtm`

```
{
  strName: string,              // имя парного .str до первой запятой
  boundary: Array<{x,y,z}>,     // блок `1, Y, X, Z,` до OBJECT, 1, (не рисуется)
  triangles: Array<{ id, v:[v1,v2,v3], n:[n1,n2,n3] }> // 1-based индексы записей .str
}
```

Блок контура содержит координаты `1, Y, X, Z,` (не индексы). Парсим с тем же `swap`,
что и `.str` (сейчас `parseStr(text, false)`), но на этом этапе не рисуем.

### Слой `kind: 'dtm'` (новый контракт)

```
{
  id, kind: 'dtm', name, visible, locked,
  resolved: boolean,            // false — ждёт парный .str
  waitingFor: string,           // basename lower-case ожидаемого .str
  strLayerId?: string,          // id слоя .str, из которого материализованы вершины
  pts: Array<{x,y,z}>,          // материализованные вершины (после resolve)
  triangles: Array<{ id, v:[i1,i2,i3], n:[n1,n2,n3] }>, // локальные 0-based индексы в pts
  boundary?: Array<{x,y,z}>,    // не рисуется
}
```

### Слой `.str` (аддитивно)

```
{
  ...существующие поля,
  records: Array<number|null>   // снимок таблицы для материализации .dtm
}
```

### Pending

Отдельного `pendingDtm` нет: ожидающие слои уже лежат в `state.layers` с
`resolved: false`. При импорте `.str` проходим по `state.layers` и резолвим совпадения.

## Step-by-Step Implementation

1. [`strParser.js`](../js/parsers/strParser.js:119): определить служебную строку осей
   (line index 1, `id=0`, все числовые поля 0) и начало записей; построить `records`;
   вернуть `records`/`recordCount`.
2. [`strParser.js`](../js/parsers/strParser.js:119): не менять `pts`/`groups`/`header`;
   `swap` не влияет на индексы.
3. Создать [`js/parsers/dtmParser.js`](../js/parsers/dtmParser.js:1): `parseDtm(text, swap)` →
   `{strName, boundary, triangles}`; устойчиво к `\r\n`, пустым строкам, отсутствию
   `TRISOLATION`; блок контура — координаты `1, Y, X, Z,`.
4. [`importFiles.js`](../js/ui/importFiles.js:26): добавить ветку `ext === 'dtm'`;
   читать через `readText`; вызывать `parseDtm`.
5. [`importFiles.js`](../js/ui/importFiles.js:36): сортировать файлы так, чтобы `.str`
   обрабатывались раньше `.dtm` (или двухпроходный цикл).
6. [`importFiles.js`](../js/ui/importFiles.js:36): `materializeDtm(dtmLayer, strLayer)` —
   по `triangles[].v` и `strLayer.records` собрать уникальные вершины в `dtmLayer.pts`,
   переписать `triangles[].v` в локальные 0-based индексы; выставить `resolved: true`,
   `strLayerId`.
7. [`importFiles.js`](../js/ui/importFiles.js:36): при импорте `.dtm` искать `.str` по
   basename lower-case; если найден — материализовать сразу, иначе создать слой с
   `resolved: false`, `waitingFor`.
8. [`importFiles.js`](../js/ui/importFiles.js:36): при импорте `.str` — пройти по
   `state.layers`, резолвить все `kind:'dtm'` с `resolved:false` и совпадающим `waitingFor`.
9. [`importFiles.js`](../js/ui/importFiles.js:18): `summary()` — для `kind:'dtm'` показывать
   `DTM: <name> (N треуг.)` или `DTM: <name> (ожидает .str)`.
10. [`render2d.js`](../js/renderers/render2d.js:391): в `draw()` порядок — PDF → `kind:'dtm'`
    → `.str`/`.txt`; добавить `dtmLayers()` (visible && resolved).
11. [`render2d.js`](../js/renderers/render2d.js:223): `drawDtmLayer` — полупрозрачная заливка
    треугольников + тонкие рёбра; цвета через `getComputedStyle` CSS-переменные + `adaptColor`.
12. [`render2d.js`](../js/renderers/render2d.js:153): `bounds()` учитывать `dtmLayers()`
    (вершины `pts`), чтобы `fit()` работал при скрытом/удалённом `.str`.
13. [`render2d.js`](../js/renderers/render2d.js:407): `pickPoint` не трогать — поверхность
    не pickable.
14. [`render3d.js`](../js/renderers/render3d.js:316): в `build` включить `kind:'dtm'` в
    `allLayers` для расчёта центра; для видимых `resolved` слоёв строить `BufferGeometry`
    (позиции через `v(p)`), `MeshStandardMaterial` (`DoubleSide`, `transparent`, `opacity`,
    `flatShading`, `depthWrite:false`), `computeVertexNormals()`.
15. [`render3d.js`](../js/renderers/render3d.js:316): рёбра — `WireframeGeometry` +
    `LineBasicMaterial` (не `EdgesGeometry`), чтобы грани были видны на плоских `Z=0`.
16. [`render3d.js`](../js/renderers/render3d.js:77): добавить `HemisphereLight` (и сохранить
    `DirectionalLight`), иначе `MeshStandardMaterial` будет чёрным; цвета через `adaptColor`.
17. [`render3d.js`](../js/renderers/render3d.js:316): `hiddenStreams` на `kind:'dtm'` не
    влияет; `locked` — стандартно (видимость не меняет).
18. [`layers.js`](../js/ui/layers.js:13): бейдж `DTM` в строке слоя; для `resolved:false` —
    индикация ожидания `.str`; глазик/замок/удаление работают как обычно.
19. [`index.html`](../index.html:59): `accept=".str,.txt,.pdf,.dtm"` у `#fileInput`.
20. [`css/style.css`](../css/style.css:1): стиль `.layer-badge` / индикатора ожидания через
    CSS-переменные.
21. [`sw.js`](../sw.js:3): добавить `./js/parsers/dtmParser.js` в `SHELL`,
    `CACHE = 'str-viewer-v13'`.
22. [`architecture.md`](../.roo/rules/architecture.md:1): обновить дерево, контракт слоя
    `kind:'dtm'`, 3D-секцию и поток.

## Affected Files

- [`js/parsers/strParser.js`](../js/parsers/strParser.js:119) — аддитивно `records`.
- [`js/parsers/dtmParser.js`](../js/parsers/dtmParser.js:1) — новый.
- [`js/ui/importFiles.js`](../js/ui/importFiles.js:26) — импорт, материализация, резолв, summary.
- [`js/ui/layers.js`](../js/ui/layers.js:4) — бейдж/ожидание.
- [`js/renderers/render2d.js`](../js/renderers/render2d.js:391) — порядок, заливка, bounds.
- [`js/renderers/render3d.js`](../js/renderers/render3d.js:316) — меш, wireframe, свет, центр.
- [`index.html`](../index.html:59) — `accept`.
- [`css/style.css`](../css/style.css:1) — стили.
- [`sw.js`](../sw.js:3) — SHELL + CACHE.
- [`architecture.md`](../.roo/rules/architecture.md:1) — документация.

## Risks & Edge Cases

- Разное число служебных строк / пустые строки → сдвиг индексов. Нужна детекция оси и
  пропуск пустых строк без учёта в `records`.
- Треугольники могут ссылаться на `null` (разделитель) — пропускать треугольник.
- Большие `.dtm` (десятки тысяч треугольников) — один `BufferGeometry`, без per-triangle
  объектов; лимит/предупреждение.
- `swap` должен применяться одинаково к `.str` и контуру `.dtm`; треугольники ссылаются
  на индексы, поэтому координаты наследуются.
- Повторный импорт `.str` с другим содержимым → `records` устаревает; уже
  материализованные `.dtm` не пересобираются (автономны).
- Лимит 10 слоёв: `.dtm` занимает отдельный слот.
- Удаление `.str` не влияет на материализованный `.dtm`.
- Тёмная тема: `adaptColor` для рёбер/заливки, `HemisphereLight` для меша.
- `Z=0` vs `Z=50`: вершины материализованы из `.str`, преобразование `v(p)` корректно.
- `hiddenStreams`/`locked`: поверхность не стринг; `hiddenStreams` игнорируется,
  `locked` — стандартно.
