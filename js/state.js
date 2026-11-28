// Единое состояние приложения.
// layers — массив слоёв:
//   { id, kind: 'pdf'|'str'|'txt', name, visible, locked,
//     pts, groups,                                 // str/txt
//     canvas, width, height, affine, userAffine }  // pdf
//   { id, kind: 'dtm', name, visible, locked, resolved, waitingFor,
//     pts, triangles, boundary, color, opacity }   // dtm
// labelConfig — карта: { [streamId]: { fields: ['d3','d9'], round: false } }
//   приоритет над STYLES[id].labelField; отсутствие ключа → дефолт из STYLES;
//   { fields: [] } → ничего не показывать.
// hiddenStreams — Set строковых ID стрингов, скрытых пользователем.
//   Не действует на заблокированные слои (у них всё видно всегда).
// Цвет и прозрачность поверхностей .dtm задаются индивидуально на каждом слое
// (layer.color, layer.opacity), а не глобально.
export const state = {
  layers: [],
  activeId: null,
  mode3d: false,
  labelConfig: {},
  hiddenStreams: new Set(),
  theme: 'light',
};