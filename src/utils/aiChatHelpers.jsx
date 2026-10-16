import DOMPurify from 'dompurify';
import { wrapLtrRuns } from './bidiNumbers';

// Sanitize-last invariant: ALL HTML construction (markdown→tags) happens here,
// then DOMPurify runs as the final step before dangerouslySetInnerHTML. Never
// pass un-sanitized HTML to the DOM. Tags/attrs are tightly restricted so
// event handlers (onclick, onerror, etc.) and embedded scripts are stripped.
const SANITIZE_CONFIG = {
  ALLOWED_TAGS: ['strong', 'code', 'em', 'span'],
  ALLOWED_ATTR: ['class', 'dir'],
  FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'link'],
  ALLOW_DATA_ATTR: false,
};

// Sentiment keywords — bullish painted green, bearish red — so a chart read
// scans at a glance instead of reading as a wall of grey text. Hebrew has no
// usable \b word boundary, so we match substrings (minor over-coloring on
// prefixed forms like "להתנגדות" is acceptable and still reads correctly).
const BULLISH = ['תמיכה', 'ביקוש', 'קנייה', 'לונג', 'פריצה', 'עלייה', 'שורי', 'Accumulation', 'Spring', 'SOS'];
const BEARISH = ['התנגדות', 'היצע', 'מכירה', 'שורט', 'שבירה', 'ירידה', 'דובי', 'Distribution', 'UTAD', 'SOW'];

// Price levels / ranges ($0.7400, 0.7500$, $0.74–$0.75) are highlighted as a
// monospace accent chip so the actionable numbers stand out.
const isPriceRun = (run) => run.includes('$') || /\d\s*[-–]\s*\$?\d/.test(run);

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Markdown on already-escaped text, before any tag is inserted, so a model's
// `**bold**` / `__bold__` / `*italic*` / `` `code` `` cannot be left as raw
// markers and cannot smuggle HTML. Bold runs first so `**` isn't eaten as
// two italics.
function applyMarkdown(escaped) {
  return escaped
    .replace(/`([^`\n]+)`/g, '<code class="bg-bg-tertiary px-1 py-0.5 rounded text-accent-primary text-[11px]">$1</code>')
    .replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_\n]+?)__/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, '$1<em>$2</em>');
}

function buildLineHtml(line) {
  // Escape, then markdown, then number/sentiment spans. Number runs are
  // isolated LTR so "+200 USDT" doesn't flip in RTL.
  let s = applyMarkdown(escapeHtml(line));
  s = wrapLtrRuns(s, (m) => (isPriceRun(m)
    ? `<span dir="ltr" class="font-mono text-accent-primary bg-accent-primary/10 px-1 rounded">${m}</span>`
    : `<span dir="ltr">${m}</span>`));
  for (const w of BULLISH) s = s.replace(new RegExp(escapeRe(w), 'g'), (m) => `<span class="text-profit font-medium">${m}</span>`);
  for (const w of BEARISH) s = s.replace(new RegExp(escapeRe(w), 'g'), (m) => `<span class="text-loss font-medium">${m}</span>`);
  return s;
}

function safeHtml(raw) {
  return DOMPurify.sanitize(raw, SANITIZE_CONFIG);
}

// GFM table cells. Leading/trailing pipes are optional; a separator row is
// only dashes (with optional :--- alignment colons), never body content.
function splitCells(line) {
  let s = String(line).trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  return s.split('|').map((c) => c.trim());
}

function isSeparatorRow(line) {
  if (!String(line).includes('|')) return false;
  const cells = splitCells(line);
  return cells.length >= 1 && cells.every((c) => /^:?-+:?$/.test(c));
}

function isTableRow(line) {
  if (!String(line).includes('|')) return false;
  const cells = splitCells(line);
  return cells.length >= 1 && cells.some((c) => c.length > 0) && !isSeparatorRow(line);
}

function columnAlign(sepCell) {
  const left = sepCell.startsWith(':');
  const right = sepCell.endsWith(':');
  if (left && right) return 'text-center';
  if (left) return 'text-left';
  if (right) return 'text-right';
  return 'text-right';
}

function cellHtml(raw) {
  return safeHtml(buildLineHtml(raw));
}

// Header + separator + body rows → one scrollable table. Returns null when
// the next line is not a GFM separator, so a stray pipe stays a paragraph.
function takeTable(lines, start) {
  if (!isTableRow(lines[start]) || !isSeparatorRow(lines[start + 1] || '')) return null;
  const header = splitCells(lines[start]);
  const align = splitCells(lines[start + 1]).map(columnAlign);
  const body = [];
  let i = start + 2;
  while (i < lines.length && isTableRow(lines[i])) {
    const cells = splitCells(lines[i]);
    body.push(header.map((_, col) => cells[col] || ''));
    i += 1;
  }
  const th = 'border border-border-primary px-2.5 py-1.5 font-semibold text-text-primary whitespace-nowrap bg-white/[0.06]';
  const td = 'border border-border-primary px-2.5 py-1.5 text-text-secondary align-top';
  const node = (
    <div key={`table-${start}`} className="my-2 max-w-full overflow-x-auto rounded-lg">
      <table dir="rtl" className="w-max min-w-full border-collapse text-[12px] leading-snug text-right">
        <thead>
          <tr>
            {header.map((cell, col) => (
              <th key={col} className={`${th} ${align[col] || 'text-right'}`} dangerouslySetInnerHTML={{ __html: cellHtml(cell) }} />
            ))}
          </tr>
        </thead>
        {body.length > 0 && (
          <tbody>
            {body.map((row, r) => (
              <tr key={r} className={r % 2 === 1 ? 'bg-white/[0.03]' : undefined}>
                {row.map((cell, col) => (
                  <td key={col} className={`${td} ${align[col] || 'text-right'}`} dangerouslySetInnerHTML={{ __html: cellHtml(cell) }} />
                ))}
              </tr>
            ))}
          </tbody>
        )}
      </table>
    </div>
  );
  return { node, next: i };
}

function renderLine(line, i) {
  if (!line.trim()) return <br key={i} />;

  // Markdown "### Title" — a short standalone header → full accent.
  if (/^#{1,3}\s/.test(line)) {
    const stripped = line.replace(/^#{1,3}\s/, '');
    return (
      <p
        key={i}
        className="font-bold text-accent-primary mt-3 mb-1.5 text-[13px] border-r-2 border-accent-primary/40 pr-2"
        dangerouslySetInnerHTML={{ __html: safeHtml(buildLineHtml(stripped)) }}
      />
    );
  }

  // Numbered section. The model usually writes the whole section on ONE line
  // ("1. מבנה כללי — <content>"), so accent ONLY the title and render the body
  // in normal text — otherwise the entire paragraph turned accent-blue.
  const numMatch = line.match(/^(\s*\*{0,2}\s*\d+\.\s+.+?)\s+[—–]\s+([\s\S]+)$/);
  if (numMatch) {
    const title = numMatch[1].replace(/^\s*\*{2}/, '').replace(/\*{2}\s*$/, '');
    return (
      <p key={i} className="mt-3 mb-1 text-[13px] leading-relaxed border-r-2 border-accent-primary/40 pr-2">
        <span className="font-bold text-accent-primary">{title} — </span>
        <span className="text-text-secondary" dangerouslySetInnerHTML={{ __html: safeHtml(buildLineHtml(numMatch[2])) }} />
      </p>
    );
  }
  // A bare numbered title with no inline body → short header, full accent.
  if (/^\s*\*{0,2}\s*\d+\.\s+\S/.test(line)) {
    const stripped = line.replace(/^\s*\*{2}/, '').replace(/\*{2}\s*$/, '');
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
}

export function formatAIText(text) {
  // Safety net for reasoning models (Qwen vision): strip any <think>…</think>
  // monologue — and a stray unclosed <think> while streaming — so the chart read
  // never shows the model's internal thinking, even if a provider somehow ignores
  // the worker's reasoning_effort:'none'.
  const clean = String(text)
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<think>[\s\S]*$/i, '')
    .replace(/^\s+/, '');
  const lines = clean.split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const table = takeTable(lines, i);
    if (table) {
      out.push(table.node);
      i = table.next - 1;
      continue;
    }
    // Consecutive bullets share one list so the marker actually paints.
    if (/^[-•*]\s/.test(lines[i])) {
      const items = [];
      const start = i;
      while (i < lines.length && /^[-•*]\s/.test(lines[i])) {
        items.push(renderLine(lines[i], i));
        i += 1;
      }
      out.push(<ul key={`ul-${start}`} className="my-1">{items}</ul>);
      i -= 1;
      continue;
    }
    out.push(renderLine(lines[i], i));
  }
  return out;
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
