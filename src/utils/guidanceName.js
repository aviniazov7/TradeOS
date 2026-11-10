// The only user-facing name for this feature. Change it here.
// Routes, Firestore collections and data keys are not derived from it.
export const GUIDANCE_FEATURE_NAME = 'ליווי מקצועי';

export const GUIDANCE_OG_DESCRIPTION =
  `סנכרון אוטומטי מהבורסה • ${GUIDANCE_FEATURE_NAME} בעברית • מעקב ארנקים על הבלוקצ'יין • התראות חכמות`;

export const GUIDANCE_TWITTER_DESCRIPTION =
  `סנכרון אוטומטי מהבורסה • ${GUIDANCE_FEATURE_NAME} בעברית • מעקב ארנקים על הבלוקצ'יין`;

export const GUIDANCE_COUPON_DESCRIPTION =
  `מימשו את הקוד וקבלו גישה מלאה: ${GUIDANCE_FEATURE_NAME} בעברית, סנכרון בורסות, מעקב ארנקים והתראות חכמות.`;

export const GUIDANCE_CHAT_WELCOME =
  `שלום! אני TradeAI — ${GUIDANCE_FEATURE_NAME} לשיטת ויקוף. אפשר לשאול אותי על שלבי איסוף ופיזור, LPSY, LPS, Spring, ניתוח Volume ועוד. רוצה ניתוח של צילום גרף? עבור לטאב "ניתוח גרפים". במה אוכל לעזור?`;

// Identity line shared by the chat prompts, so the model uses the same name.
export const GUIDANCE_WYCKOFF_IDENTITY =
  `אתה TradeAI — ${GUIDANCE_FEATURE_NAME} למסחר, ומומחה לשיטת ויקוף (Wyckoff).`;

export const GUIDANCE_COACH_IDENTITY =
  `אתה נותן ${GUIDANCE_FEATURE_NAME} ומנתח את היומן של הסוחר וכותב לו דו"ח קצר וחד בעברית.`;

const META_TOKENS = {
  __GUIDANCE_OG_DESCRIPTION__: GUIDANCE_OG_DESCRIPTION,
  __GUIDANCE_TWITTER_DESCRIPTION__: GUIDANCE_TWITTER_DESCRIPTION,
};

function escapeAttr(value) {
  return String(value).replace(/[&<>"]/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
  }[ch]));
}

// index.html keeps tokens. Vite replaces them at serve and build time so
// crawlers still see the name in the static document.
export function applyGuidanceMeta(html) {
  return Object.entries(META_TOKENS).reduce(
    (out, [token, value]) => out.replaceAll(token, escapeAttr(value)),
    String(html),
  );
}
