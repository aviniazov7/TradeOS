import { hasForeignScript } from './newsScript';

/** True when a headline should go through the translator.
 *  English (no Hebrew letters) and any copy that picked up a foreign script. */
export function headlineNeedsTranslation(text) {
  const s = String(text || '').trim();
  if (!s) return false;
  if (hasForeignScript(s)) return true;
  return !/[\u0590-\u05FF]/.test(s);
}
