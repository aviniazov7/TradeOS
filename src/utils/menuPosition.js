/**
 * Place a menu so its right edge lines up with the trigger's right edge,
 * then slide it back inside the viewport. `right` is physical, so RTL and
 * LTR both keep the menu from leaving the left edge.
 *
 * @param {{ right: number, bottom: number }} rect trigger box
 * @param {number} viewportWidth
 * @param {number} [menuWidth]
 * @param {number} [margin]
 */
export function anchoredMenuBox(rect, viewportWidth, menuWidth = 288, margin = 8) {
  const vw = Math.max(0, Number(viewportWidth) || 0);
  const width = Math.max(0, Math.min(menuWidth, vw - margin * 2));
  let left = Number(rect?.right || 0) - width;
  if (left < margin) left = margin;
  if (left + width > vw - margin) left = Math.max(margin, vw - margin - width);
  return { top: Number(rect?.bottom || 0) + 6, left, width };
}
