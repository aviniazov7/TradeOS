import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import {
  ImagePlus,
  X,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import {
  listTradeImages,
  addTradeImage,
  updateTradeImage,
  deleteTradeImage,
  MAX_CAPTION_LENGTH,
} from '../../services/tradeImageService';
import { compressImageFile, isImageDataUrl } from '../../utils/imageCompress';
import {
  MAX_TRADE_IMAGES,
  TRADE_IMAGE_KINDS,
  TRADE_IMAGE_KIND_LABELS,
  freeTradeImageSlot,
  defaultImageKind,
} from '../../utils/tradeImageSlots';
import Modal from '../shared/Modal';
import ConfirmDialog from '../shared/ConfirmDialog';

// The analyzer (streaming AI + quota UI) is only needed when the trader asks for
// it — keep it out of the journal bundle.
const ChartAnalyzer = lazy(() => import('../market/ChartAnalyzer'));

const KIND_STYLES = {
  before: 'bg-accent-primary/80 text-white',
  after: 'bg-profit/80 text-white',
  other: 'bg-black/60 text-text-secondary',
};

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent || '');
const PASTE_HINT = isMac ? '⌘+V' : 'Ctrl+V';

// Firestore errors carry a `code`; our own compress/validation errors carry a
// Hebrew message meant for the user.
const uploadErrorText = (err) => (err?.code ? 'ההעלאה נכשלה — נסה שוב' : err?.message || 'ההעלאה נכשלה');

// One thumbnail card: image, tag picker and caption. Caption is edited locally
// and saved on blur so typing doesn't fire a write per keystroke.
function ScreenshotTile({ image, index, pair, onOpen, onKind, onCaption, onDelete }) {
  const [caption, setCaption] = useState(image.caption || '');
  const commitCaption = () => {
    if (caption.trim() !== (image.caption || '')) onCaption(image, caption);
  };
  return (
    <div className="rounded-xl border border-border-primary bg-bg-secondary overflow-hidden flex flex-col">
      <div className="relative">
        <button
          type="button"
          onClick={() => onOpen(index)}
          className="block w-full cursor-zoom-in"
          aria-label={`הגדל צילום ${index + 1}`}
        >
          <img
            src={image.dataUrl}
            alt={image.caption || `צילום גרף ${index + 1} — ${pair}`}
            loading="lazy"
            className="w-full aspect-video object-cover bg-black/40"
          />
        </button>
        <span className={`absolute top-1.5 right-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold ${KIND_STYLES[image.kind] || KIND_STYLES.other}`}>
          {TRADE_IMAGE_KIND_LABELS[image.kind] || TRADE_IMAGE_KIND_LABELS.other}
        </span>
        <button
          type="button"
          onClick={() => onDelete(image)}
          aria-label="מחק צילום"
          title="מחק צילום"
          className="absolute top-1.5 left-1.5 w-7 h-7 grid place-items-center rounded-lg bg-black/60 text-text-secondary hover:text-loss transition-colors cursor-pointer"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="p-1.5 space-y-1.5">
        <div className="grid grid-cols-3 gap-1" role="radiogroup" aria-label="סוג הצילום">
          {TRADE_IMAGE_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={image.kind === k}
              onClick={() => image.kind !== k && onKind(image, k)}
              className={`rounded-md py-1 text-[11px] font-medium transition-colors cursor-pointer ${
                image.kind === k
                  ? 'bg-accent-primary/20 text-accent-hover'
                  : 'bg-bg-tertiary text-text-muted hover:text-text-secondary'
              }`}
            >
              {TRADE_IMAGE_KIND_LABELS[k]}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={caption}
          maxLength={MAX_CAPTION_LENGTH}
          onChange={(e) => setCaption(e.target.value)}
          onBlur={commitCaption}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
          placeholder="כיתוב (לא חובה)"
          aria-label="כיתוב לצילום"
          className="w-full rounded-md bg-bg-tertiary border border-border-primary px-2 py-1 text-[11px] text-text-primary placeholder:text-text-muted outline-none focus:border-accent-primary"
        />
      </div>
    </div>
  );
}

// Full-screen viewer above the trade modal. Escape is caught in the capture
// phase on window so it closes only the lightbox, not the modal underneath
// (Modal listens on document, which capture on window reaches first).
function Lightbox({ images, index, pair, onIndex, onClose, onDelete, onAnalyze }) {
  const touchX = useRef(null);
  const count = images.length;
  const image = images[index];
  const next = () => onIndex((index + 1) % count);
  const prev = () => onIndex((index - 1 + count) % count);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      } else if (count > 1 && e.key === 'ArrowLeft') {
        e.stopPropagation();
        onIndex((index + 1) % count); // RTL: left moves forward
      } else if (count > 1 && e.key === 'ArrowRight') {
        e.stopPropagation();
        onIndex((index - 1 + count) % count);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [index, count, onClose, onIndex]);

  if (!image) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[60] bg-black/90 flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label="צילום גרף במסך מלא"
      onClick={onClose}
      onTouchStart={(e) => { touchX.current = e.touches[0]?.clientX ?? null; }}
      onTouchEnd={(e) => {
        const start = touchX.current;
        touchX.current = null;
        const end = e.changedTouches[0]?.clientX;
        if (start == null || end == null || count < 2) return;
        const dx = end - start;
        if (Math.abs(dx) > 50) (dx > 0 ? next : prev)(); // RTL: swipe right → next
      }}
    >
      <div
        className="flex items-center gap-2 px-3 py-2.5 text-white"
        style={{ paddingTop: 'calc(0.625rem + env(safe-area-inset-top, 0px))' }}
        onClick={(e) => e.stopPropagation()}
      >
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${KIND_STYLES[image.kind] || KIND_STYLES.other}`}>
          {TRADE_IMAGE_KIND_LABELS[image.kind] || TRADE_IMAGE_KIND_LABELS.other}
        </span>
        <span className="text-xs text-white/70" dir="ltr">{index + 1} / {count}</span>
        {image.caption && <span className="text-sm truncate min-w-0">{image.caption}</span>}
        <div className="ms-auto flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => onAnalyze(image)}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-accent-muted hover:bg-accent-primary text-white text-xs font-semibold transition-colors cursor-pointer"
          >
            <Sparkles className="w-4 h-4" />
            <span className="hidden sm:inline">נתח צילום עם AI</span>
            <span className="sm:hidden">AI</span>
          </button>
          <button
            type="button"
            onClick={() => onDelete(image)}
            aria-label="מחק צילום"
            title="מחק צילום"
            className="w-9 h-9 grid place-items-center rounded-lg bg-white/10 hover:bg-loss/30 text-white/80 hover:text-white transition-colors cursor-pointer"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="סגור"
            className="w-9 h-9 grid place-items-center rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="relative flex-1 min-h-0 flex items-center justify-center px-2 pb-4">
        <img
          src={image.dataUrl}
          alt={image.caption || `צילום גרף — ${pair}`}
          className="max-w-full max-h-full object-contain select-none"
          onClick={(e) => e.stopPropagation()}
          draggable={false}
        />
        {count > 1 && (
          <>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); prev(); }}
              aria-label="הצילום הקודם"
              className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 grid place-items-center rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors cursor-pointer"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); next(); }}
              aria-label="הצילום הבא"
              className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 grid place-items-center rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

/**
 * Chart screenshots of one trade: drag & drop / file picker (camera roll on
 * phones) / paste from clipboard, up to MAX_TRADE_IMAGES, tagged before/after,
 * captioned, viewable full-screen and deletable. Render with key={trade.id}
 * so switching trades starts from a clean state.
 */
export default function TradeScreenshots({ tradeId, pair = '' }) {
  const { user } = useAuth();
  const uid = user?.uid;
  const [images, setImages] = useState([]);
  // loading | ready | error | unavailable (rules not deployed / no access)
  const [status, setStatus] = useState('loading');
  const [reloadKey, setReloadKey] = useState(0);
  const [uploading, setUploading] = useState(0); // files still in this upload run
  const [error, setError] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [aiImage, setAiImage] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!uid || !tradeId) return undefined;
    let cancelled = false;
    listTradeImages(uid, tradeId)
      .then((list) => {
        if (cancelled) return;
        setImages(list.filter((img) => isImageDataUrl(img.dataUrl)));
        setStatus('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn('Trade screenshots load failed:', err);
        setStatus(err?.code === 'permission-denied' ? 'unavailable' : 'error');
      });
    return () => { cancelled = true; };
  }, [uid, tradeId, reloadKey]);

  const full = images.length >= MAX_TRADE_IMAGES;
  const canAdd = status === 'ready' && !full && uploading === 0;

  // Upload one file at a time so each lands in its own free slot.
  const addFiles = async (fileList) => {
    if (!canAdd) {
      if (full) setError(`ניתן לצרף עד ${MAX_TRADE_IMAGES} צילומים לעסקה`);
      return;
    }
    const files = Array.from(fileList || []).filter((f) => f && f.type?.startsWith('image/'));
    if (!files.length) {
      setError('יש לבחור קובץ תמונה');
      return;
    }
    const room = MAX_TRADE_IMAGES - images.length;
    const batch = files.slice(0, room);
    setError(files.length > room ? `ניתן לצרף עד ${MAX_TRADE_IMAGES} צילומים לעסקה — נוספו ${room} בלבד` : null);
    setUploading(batch.length);
    let working = images;
    for (const file of batch) {
      try {
        const slot = freeTradeImageSlot(working, tradeId);
        if (slot < 0) break;
        const compressed = await compressImageFile(file);
        const saved = await addTradeImage(uid, {
          tradeId,
          slot,
          dataUrl: compressed.dataUrl,
          kind: defaultImageKind(working),
          width: compressed.width,
          height: compressed.height,
        });
        working = [...working, saved];
        setImages(working);
      } catch (err) {
        console.warn('Trade screenshot upload failed:', err);
        setError(uploadErrorText(err));
      } finally {
        setUploading((n) => Math.max(0, n - 1));
      }
    }
    setUploading(0);
  };

  // Paste a screenshot straight from the clipboard while the trade is open.
  // Text pastes (e.g. into the caption field) pass through untouched.
  const addFilesRef = useRef(addFiles);
  useEffect(() => { addFilesRef.current = addFiles; });
  // Paused while a dialog is on top (AI analyzer / delete confirm).
  const pasteActive = status === 'ready' && !aiImage && !pendingDelete;
  useEffect(() => {
    if (!pasteActive) return undefined;
    const onPaste = (e) => {
      const files = Array.from(e.clipboardData?.items || [])
        .filter((it) => it.kind === 'file' && it.type.startsWith('image/'))
        .map((it) => it.getAsFile())
        .filter(Boolean);
      if (!files.length) return;
      e.preventDefault();
      addFilesRef.current(files);
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [pasteActive]);

  const changeKind = async (image, kind) => {
    setImages((list) => list.map((img) => (img.id === image.id ? { ...img, kind } : img)));
    try {
      await updateTradeImage(uid, image.id, { kind });
    } catch (err) {
      console.warn('Trade screenshot update failed:', err);
      setImages((list) => list.map((img) => (img.id === image.id ? { ...img, kind: image.kind } : img)));
      setError('עדכון הצילום נכשל');
    }
  };

  const changeCaption = async (image, caption) => {
    const clean = caption.trim().slice(0, MAX_CAPTION_LENGTH);
    setImages((list) => list.map((img) => (img.id === image.id ? { ...img, caption: clean } : img)));
    try {
      await updateTradeImage(uid, image.id, { caption: clean });
    } catch (err) {
      console.warn('Trade screenshot update failed:', err);
      setError('שמירת הכיתוב נכשלה');
    }
  };

  const confirmDelete = async () => {
    const target = pendingDelete;
    if (!target) return;
    try {
      await deleteTradeImage(uid, target.id);
      setImages((list) => list.filter((img) => img.id !== target.id));
    } catch (err) {
      console.warn('Trade screenshot delete failed:', err);
      setError('מחיקת הצילום נכשלה');
      throw err; // keep the dialog open
    }
  };

  // Delete/analyze from the lightbox: close it first so the dialog that opens
  // next (a regular Modal, z-50) isn't hidden underneath it.
  const requestDelete = (image) => {
    setLightboxIndex(null);
    setPendingDelete(image);
  };
  const requestAnalyze = (image) => {
    setLightboxIndex(null);
    setAiImage({ dataUrl: image.dataUrl, name: image.caption || `${pair || 'trade'}-screenshot` });
  };

  if (!uid || !tradeId || status === 'unavailable') return null;

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    addFiles(e.dataTransfer?.files);
  };

  // The lightbox and dialogs render as SIBLINGS of the section, not children:
  // React events bubble through portals to their React parents, so a file
  // dropped on the AI analyzer would otherwise also land in onDrop here.
  return (
    <>
      <div
        className={`rounded-2xl border bg-bg-tertiary mt-3 transition-colors ${
          dragOver ? 'border-accent-primary bg-accent-primary/5' : 'border-border-primary'
        }`}
        onDragOver={(e) => {
          if (!Array.from(e.dataTransfer?.types || []).includes('Files')) return;
          e.preventDefault();
          if (!dragOver) setDragOver(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(false);
        }}
        onDrop={onDrop}
      >
        <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-border-primary">
          <span className="text-xs font-semibold text-text-secondary">
            צילומי מסך
            {status === 'ready' && images.length > 0 && (
              <span className="text-text-muted font-normal" dir="ltr"> · {images.length}/{MAX_TRADE_IMAGES}</span>
            )}
          </span>
          {status === 'ready' && !full && (
            <span className="hidden sm:inline text-[11px] text-text-muted">
              גרור לכאן או הדבק עם <span dir="ltr">{PASTE_HINT}</span>
            </span>
          )}
        </div>

        <div className="p-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files || []);
              e.target.value = '';
              addFiles(files);
            }}
          />

          {status === 'loading' && (
            <div className="h-24 flex items-center justify-center gap-2 text-text-muted text-xs">
              <Loader2 className="w-4 h-4 animate-spin" />
              טוען צילומים…
            </div>
          )}

          {status === 'error' && (
            <div className="h-24 flex flex-col items-center justify-center gap-2 text-xs">
              <span className="inline-flex items-center gap-1.5 text-loss">
                <AlertTriangle className="w-4 h-4" />
                טעינת הצילומים נכשלה
              </span>
              <button
                type="button"
                onClick={() => { setStatus('loading'); setReloadKey((k) => k + 1); }}
                className="text-accent-primary hover:underline cursor-pointer"
              >
                נסה שוב
              </button>
            </div>
          )}

          {status === 'ready' && (
            <div className={`grid gap-2 ${images.length ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-1'}`}>
              {images.map((img, i) => (
                <ScreenshotTile
                  key={img.id}
                  image={img}
                  index={i}
                  pair={pair}
                  onOpen={setLightboxIndex}
                  onKind={changeKind}
                  onCaption={changeCaption}
                  onDelete={setPendingDelete}
                />
              ))}
              {!full && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading > 0}
                  className={`rounded-xl border-2 border-dashed border-border-hover hover:border-accent-primary/60 bg-bg-secondary/40 flex flex-col items-center justify-center gap-1.5 text-text-muted hover:text-text-secondary transition-colors cursor-pointer disabled:cursor-wait disabled:opacity-70 ${
                    images.length ? 'min-h-[7.5rem]' : 'py-6 px-4'
                  }`}
                >
                  {uploading > 0 ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span className="text-xs">מעלה{uploading > 1 ? ` (${uploading})` : ''}…</span>
                    </>
                  ) : (
                    <>
                      <ImagePlus className="w-5 h-5" />
                      <span className="text-xs font-medium">{images.length ? 'הוסף צילום' : 'הוסף צילומי גרף לעסקה'}</span>
                      {!images.length && (
                        <span className="text-[11px] text-text-muted text-center">
                          לפני ואחרי · עד {MAX_TRADE_IMAGES} צילומים · בחירה מהגלריה, גרירה או הדבקה
                        </span>
                      )}
                    </>
                  )}
                </button>
              )}
            </div>
          )}

          {error && (
            <div className="mt-2 flex items-start gap-1.5 text-[11px] text-loss" role="alert">
              <AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0" />
              <span className="flex-1">{error}</span>
              <button type="button" onClick={() => setError(null)} aria-label="סגור הודעה" className="cursor-pointer text-text-muted hover:text-text-primary">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {lightboxIndex !== null && images[lightboxIndex] && (
        <Lightbox
          images={images}
          index={lightboxIndex}
          pair={pair}
          onIndex={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onDelete={requestDelete}
          onAnalyze={requestAnalyze}
        />
      )}

      <ConfirmDialog
        isOpen={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
        title="למחוק את הצילום?"
        message="הצילום יימחק לצמיתות מהעסקה."
      />

      <Modal
        isOpen={!!aiImage}
        onClose={() => setAiImage(null)}
        title="ניתוח צילום עם AI"
        maxWidth="max-w-4xl"
      >
        {aiImage && (
          <Suspense
            fallback={(
              <div className="h-40 flex items-center justify-center gap-2 text-text-muted text-xs">
                <Loader2 className="w-4 h-4 animate-spin" />
                טוען…
              </div>
            )}
          >
            <ChartAnalyzer initialImage={aiImage} heightClass="h-[65dvh] min-h-[22rem]" />
          </Suspense>
        )}
      </Modal>
    </>
  );
}
