/** True when a headline has no Hebrew letters and should go through the translator. */
export function headlineNeedsTranslation(text) {
  const s = String(text || '').trim();
  if (!s) return false;
  return !/[\u0590-\u05FF]/.test(s);
}
