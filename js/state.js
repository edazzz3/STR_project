// Единое состояние приложения.
// layers — массив слоёв:
//   { id, kind: 'pdf'|'str'|'txt', name, visible, locked,
//     pts, groups,                                 // str/txt
//     canvas, width, height, affine, userAffine }  // pdf
// labelConfig — карта: { [streamId]: { fields: ['d3','d9'], round: false } }
//   приоритет над STYLES[id].labelField; отсутствие ключа → дефолт из STYLES;
//   { fields: [] } → ничего не показывать.
// hiddenStreams — Set строковых ID стрингов, скрытых пользователем.
//   Не действует на заблокированные слои (у них всё видно всегда).
// dtmOpacity — общая прозрачность поверхностей .dtm в 3D (0..1).
//   Применяется и к заливке, и к рёбрам (wireframe).
export const state = {
  layers: [],
  activeId: null,
  mode3d: false,
  labelConfig: {},
  hiddenStreams: new Set(),
  theme: 'light',
  dtmOpacity: 0.35,
};