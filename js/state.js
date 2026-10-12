// Единое состояние приложения. Один источник правды для всех модулей.
// Позже, при переходе на слои, layers станет массивом:
//   layers: [{ id, kind, name, visible, pts, groups, canvas, affine, userAffine, ... }]
export const state = {
  layers: { pdf: null, str: null, txt: null },
  mode3d: false,
};