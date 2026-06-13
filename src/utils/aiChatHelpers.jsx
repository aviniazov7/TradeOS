import DOMPurify from 'dompurify';

// Sanitize-last invariant: ALL HTML construction (markdown→tags) happens here,
// then DOMPurify runs as the final step before dangerouslySetInnerHTML. Never
// pass un-sanitized HTML to the DOM. Tags/attrs are tightly restricted so
// event handlers (onclick, onerror, etc.) and embedded scripts are stripped.
const SANITIZE_CONFIG = {
  ALLOWED_TAGS: ['strong', 'code', 'em', 'span'],
  ALLOWED_ATTR: ['class'],
  FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'link'],
  ALLOW_DATA_ATTR: false,
};

// Sentiment keywords — bullish painted green, bearish red — so a chart read
// scans at a glance instead of reading as a wall of grey text. Hebrew has no
// usable \b word boundary, so we match substrings (minor over-coloring on
// prefixed forms like "להתנגדות" is acceptable and still reads correctly).
const BULLISH = ['תמיכה', 'ביקוש', 'קנייה', 'לונג', 'פריצה', 'עלייה', 'שורי', 'Accumulation', 'Spring', 'SOS'];
const BEARISH = ['התנגדות', 'היצע', 'מכירה', 'שורט', 'שבירה', 'ירידה', 'דובי', 'Distribution', 'UTAD', 'SOW'];

// Price levels / ranges ($0.7400, 0.7500$, $0.74–$0.75). Highlighted as a
// monospace accent chip so the actionable numbers stand out.
const PRICE_RE = /(\$?\d[\d,]*(?:\.\d+)?\s*[-–]\s*\$?\d[\d,]*(?:\.\d+)?\$?|\$\s?\d[\d,]*(?:\.\d+)?\$?|\d[\d,]*(?:\.\d+)?\s?\$)/g;

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function buildLineHtml(line) {
  let s = line.replace(PRICE_RE, (m) => `<span class="font-mono text-accent-primary bg-accent-primary/10 px-1 rounded">${m}</span>`);
  for (const w of BULLISH) s = s.replace(new RegExp(escapeRe(w), 'g'), (m) => `<span class="text-profit font-medium">${m}</span>`);
  for (const w of BEARISH) s = s.replace(new RegExp(escapeRe(w), 'g'), (m) => `<span class="text-loss font-medium">${m}</span>`);
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/`(.+?)`/g, '<code class="bg-bg-tertiary px-1 py-0.5 rounded text-accent-primary text-[11px]">$1</code>');
  return s;
}

function safeHtml(raw) {
  return DOMPurify.sanitize(raw, SANITIZE_CONFIG);
}

// A numbered section header ("1. מבנה כללי:") or a markdown "### Title".
const isHeader = (line) => /^\s*\*{0,2}\s*\d+\.\s+\S/.test(line) || /^#{1,3}\s/.test(line);

export function formatAIText(text) {
  const lines = text.split('\n');
  return lines.map((line, i) => {
    if (!line.trim()) return <br key={i} />;

    if (isHeader(line)) {
      const stripped = line.replace(/^#{1,3}\s/, '').replace(/^\s*\*{2}/, '').replace(/\*{2}\s*$/, '');
      return (
        <p
          key={i}
          className="font-bold text-accent-primary mt-3 mb-1.5 text-[13px] border-r-2 border-accent-primary/40 pr-2"
          dangerouslySetInnerHTML={{ __html: safeHtml(buildLineHtml(stripped)) }}
        />
      );
    }

    const formatted = buildLineHtml(line);
    if (/^[-•*]\s/.test(line)) {
      return (
        <li
          key={i}
          className="mr-5 mb-1 list-disc list-outside marker:text-accent-primary"
          dangerouslySetInnerHTML={{ __html: safeHtml(formatted.replace(/^[-•*]\s/, '')) }}
        />
      );
    }
    return <p key={i} className="mb-1 leading-relaxed text-text-secondary" dangerouslySetInnerHTML={{ __html: safeHtml(formatted) }} />;
  });
}

// Charts are uploaded as compressed JPEG so even 4K screenshots stay well
// under the worker's ~3MB base64 cap (Groq rejects images above 4MB base64).
const MAX_IMAGE_DIM = 1280;

export async function fileToCompressedDataUrl(file) {
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('קריאת הקובץ נכשלה'));
    reader.readAsDataURL(file);
  });
  const img = await new Promise((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('קובץ התמונה אינו תקין'));
    el.src = dataUrl;
  });
  const scale = Math.min(1, MAX_IMAGE_DIM / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.85);
}
