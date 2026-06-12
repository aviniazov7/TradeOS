import DOMPurify from 'dompurify';

// Sanitize-last invariant: ALL HTML construction (markdown→tags) happens here,
// then DOMPurify runs as the final step before dangerouslySetInnerHTML. Never
// pass un-sanitized HTML to the DOM. Tags/attrs are tightly restricted so
// event handlers (onclick, onerror, etc.) and embedded scripts are stripped.
const SANITIZE_CONFIG = {
  ALLOWED_TAGS: ['strong', 'code', 'em'],
  ALLOWED_ATTR: ['class'],
  FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'link'],
  ALLOW_DATA_ATTR: false,
};

function buildLineHtml(line) {
  let formatted = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  formatted = formatted.replace(/`(.+?)`/g, '<code class="bg-bg-tertiary px-1 py-0.5 rounded text-accent-primary text-[11px]">$1</code>');
  return formatted;
}

function safeHtml(raw) {
  return DOMPurify.sanitize(raw, SANITIZE_CONFIG);
}

export function formatAIText(text) {
  const lines = text.split('\n');
  return lines.map((line, i) => {
    const formatted = buildLineHtml(line);

    if (/^[-•*]\s/.test(formatted)) {
      return <li key={i} className="mr-4 mb-0.5" dangerouslySetInnerHTML={{ __html: safeHtml(formatted.replace(/^[-•*]\s/, '')) }} />;
    }
    if (/^#{1,3}\s/.test(formatted)) {
      const content = formatted.replace(/^#{1,3}\s/, '');
      return <p key={i} className="font-bold text-text-primary mt-2 mb-1" dangerouslySetInnerHTML={{ __html: safeHtml(content) }} />;
    }
    if (!formatted.trim()) return <br key={i} />;
    return <p key={i} className="mb-0.5" dangerouslySetInnerHTML={{ __html: safeHtml(formatted) }} />;
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
