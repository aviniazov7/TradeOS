import { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Loader2,
  AlertTriangle,
  ImagePlus,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import {
  listTradeImages,
  loadTradeImageUrl,
  addTradeImage,
  updateTradeImage,
  deleteTradeImage,
  MAX_CAPTION_LENGTH,
} from '../../services/tradeImageService';
import { compressImageFile, isImageDataUrl } from '../../utils/imageCompress';
import { dataUrlToBlob, imageFileFromClipboard, imageRejectReason } from '../../utils/chartImages';
import {
  TRADE_IMAGE_KINDS,
  TRADE_IMAGE_KIND_LABELS,
  MAX_TRADE_IMAGES,
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

function uploadErrorMessage(err) {
  // Firebase and browser errors are English. Our own checks throw Hebrew.
  if (typeof err?.message === 'string' && /[\u0590-\u05FF]/.test(err.message) && err.message.length < 140) {
    return err.message;
  }
  return 'העלאת הצילום נכשלה';
}

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
            src={image.src}
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
          src={image.src}
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

async function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('קריאת התמונה נכשלה'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Chart screenshots for one trade: upload or paste, thumbnails, full-size
 * viewer. New files go to Storage; screenshots saved earlier as data URLs
 * still show.
 */
export default function TradeScreenshots({ tradeId, pair = '' }) {
  const { user } = useAuth();
  const uid = user?.uid;
  const [images, setImages] = useState([]);
  const [status, setStatus] = useState('loading');
  const [reloadKey, setReloadKey] = useState(0);
  const [error, setError] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [aiImage, setAiImage] = useState(null);
  const fileRef = useRef(null);
  const imagesRef = useRef([]);
  imagesRef.current = images;
  const ownedUrls = useRef([]);

  useEffect(() => {
    if (!uid || !tradeId) return undefined;
    let cancelled = false;
    ownedUrls.current.forEach((url) => URL.revokeObjectURL(url));
    ownedUrls.current = [];
    listTradeImages(uid, tradeId)
      .then(async (list) => {
        const ready = [];
        for (const img of list) {
          if (cancelled) return;
          if (isImageDataUrl(img.dataUrl)) {
            ready.push({ ...img, src: img.dataUrl });
            continue;
          }
          if (!img.storagePath) continue;
          try {
            const src = await loadTradeImageUrl(img.storagePath);
            if (cancelled) {
              URL.revokeObjectURL(src);
              return;
            }
            ownedUrls.current.push(src);
            ready.push({ ...img, src });
          } catch (err) {
            console.warn('Trade screenshot file load failed:', err);
          }
        }
        if (cancelled) return;
        setImages(ready);
        setStatus('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn('Trade screenshots load failed:', err);
        setStatus(err?.code === 'permission-denied' ? 'unavailable' : 'error');
      });
    return () => {
      cancelled = true;
      ownedUrls.current.forEach((url) => URL.revokeObjectURL(url));
      ownedUrls.current = [];
    };
  }, [uid, tradeId, reloadKey]);

  const addFiles = useCallback(async (fileList) => {
    const files = [...(fileList || [])].filter(Boolean);
    if (!files.length || !uid || !tradeId) return;
    setError(null);
    setUploading(true);
    let current = imagesRef.current;
    try {
      for (const file of files) {
        const reason = imageRejectReason(file);
        if (reason) {
          setError(reason);
          break;
        }
        const slot = freeTradeImageSlot(current, tradeId);
        if (slot < 0) {
          setError(`ניתן לצרף עד ${MAX_TRADE_IMAGES} צילומים לעסקה`);
          break;
        }
        const compressed = await compressImageFile(file);
        const blob = dataUrlToBlob(compressed.dataUrl);
        const saved = await addTradeImage(uid, {
          tradeId,
          slot,
          blob,
          contentType: blob.type,
          kind: defaultImageKind(current),
          width: compressed.width,
          height: compressed.height,
        });
        const next = { ...saved, src: compressed.dataUrl, dataUrl: compressed.dataUrl };
        current = [...current, next];
        setImages(current);
      }
    } catch (err) {
      console.warn('Trade screenshot upload failed:', err);
      setError(uploadErrorMessage(err));
    } finally {
      setUploading(false);
    }
  }, [uid, tradeId]);

  useEffect(() => {
    if (!uid || !tradeId || status !== 'ready') return undefined;
    const onPaste = (e) => {
      const target = e.target;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return;
      const file = imageFileFromClipboard(e.clipboardData);
      if (!file) return;
      e.preventDefault();
      addFiles([file]);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [uid, tradeId, status, addFiles]);

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
      await deleteTradeImage(uid, target.id, target.storagePath);
      setImages((list) => list.filter((img) => img.id !== target.id));
    } catch (err) {
      console.warn('Trade screenshot delete failed:', err);
      setError('מחיקת הצילום נכשלה');
      throw err;
    }
  };

  const requestDelete = (image) => {
    setLightboxIndex(null);
    setPendingDelete(image);
  };

  const requestAnalyze = async (image) => {
    setLightboxIndex(null);
    try {
      let dataUrl = isImageDataUrl(image.dataUrl) ? image.dataUrl : null;
      if (!dataUrl && image.src) {
        const blob = await (await fetch(image.src)).blob();
        if (blob.type && !blob.type.startsWith('image/')) throw new Error('סוג הקובץ אינו תמונה');
        dataUrl = await blobToDataUrl(blob);
      }
      if (!isImageDataUrl(dataUrl)) throw new Error('אין תמונה');
      setAiImage({ dataUrl, name: image.caption || `${pair || 'trade'}-screenshot` });
    } catch (err) {
      console.warn('Trade screenshot analyze failed:', err);
      setError('לא ניתן לפתוח את הצילום לניתוח');
    }
  };

  if (!uid || !tradeId || status === 'unavailable') return null;

  const full = images.length >= MAX_TRADE_IMAGES;

  return (
    <>
      <div className="rounded-2xl border border-border-primary bg-bg-tertiary mt-3">
        <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-border-primary">
          <span className="text-xs font-semibold text-text-secondary">צילומי גרף</span>
          <span className="text-[10px] text-text-muted">{images.length}/{MAX_TRADE_IMAGES}</span>
        </div>
        <div className="p-3">
          {status === 'loading' && (
            <div className="h-16 flex items-center justify-center gap-2 text-xs text-text-muted">
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
            <>
              {images.length > 0 && (
                <div className="grid gap-2 grid-cols-2 sm:grid-cols-4 mb-2">
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
                </div>
              )}

              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                multiple
                className="hidden"
                onChange={(e) => {
                  const list = e.target.files;
                  e.target.value = '';
                  addFiles(list);
                }}
              />
              <button
                type="button"
                disabled={uploading || full}
                onClick={() => fileRef.current?.click()}
                className="w-full min-h-11 rounded-xl border border-dashed border-border-primary bg-bg-secondary/60 px-3 py-2.5 text-xs text-text-secondary hover:border-accent-primary/40 hover:text-text-primary transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
              >
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
                <span>{full ? `עד ${MAX_TRADE_IMAGES} צילומים לעסקה` : 'הוסף צילום או הדבק'}</span>
              </button>
              {!full && (
                <p className="mt-1.5 text-[10px] text-text-muted text-center">
                  PNG, JPEG, WebP או GIF · אפשר להדביק צילום מסך
                </p>
              )}
            </>
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
