// Единое состояние приложения.
// layers — массив слоёв:
//   { id, kind: 'pdf'|'str'|'txt', name, visible, locked,
//     pts, groups,                                 // str/txt
//     canvas, width, height, affine, userAffine }  // pdf
export const state = {
  layers: [],
  activeId: null,
  mode3d: false,
};