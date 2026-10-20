import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronLeft, ChevronRight, Loader2, AlertTriangle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { listTradeImages } from '../../services/tradeImageService';
import { isImageDataUrl } from '../../utils/imageCompress';
import { TRADE_IMAGE_KIND_LABELS } from '../../utils/tradeImageSlots';

const KIND_STYLES = {
  before: 'bg-accent-primary/80 text-white',
  after: 'bg-profit/80 text-white',
  other: 'bg-black/60 text-text-secondary',
};

// Full-screen viewer above the trade modal. Escape is caught in the capture
// phase on window so it closes only the lightbox, not the modal underneath.
function Lightbox({ images, index, pair, onIndex, onClose }) {
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
        onIndex((index + 1) % count);
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
        <button
          type="button"
          onClick={onClose}
          aria-label="סגור"
          className="ms-auto min-h-11 min-w-11 grid place-items-center rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
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
              className="absolute right-2 top-1/2 -translate-y-1/2 min-h-11 min-w-11 grid place-items-center rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors cursor-pointer"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); next(); }}
              aria-label="הצילום הבא"
              className="absolute left-2 top-1/2 -translate-y-1/2 min-h-11 min-w-11 grid place-items-center rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors cursor-pointer"
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
 * Legacy chart screenshots already stored as data URLs on the trade.
 * Read-only: there is no upload, paste, or edit. Trades with no legacy
 * image render nothing.
 */
export default function TradeScreenshots({ tradeId, pair = '' }) {
  const { user } = useAuth();
  const uid = user?.uid;
  const [images, setImages] = useState([]);
  const [status, setStatus] = useState('loading');
  const [reloadKey, setReloadKey] = useState(0);
  const [lightboxIndex, setLightboxIndex] = useState(null);

  useEffect(() => {
    if (!uid || !tradeId) return undefined;
    let cancelled = false;
    listTradeImages(uid, tradeId)
      .then((list) => {
        if (cancelled) return;
        const ready = (list || [])
          .filter((img) => isImageDataUrl(img?.dataUrl))
          .map((img) => ({ ...img, src: img.dataUrl }));
        setImages(ready);
        setStatus('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn('Trade screenshots load failed:', err);
        setStatus(err?.code === 'permission-denied' ? 'unavailable' : 'error');
      });
    return () => { cancelled = true; };
  }, [uid, tradeId, reloadKey]);

  if (!uid || !tradeId || status === 'unavailable') return null;
  if (status === 'ready' && images.length === 0) return null;

  return (
    <>
      <div className="rounded-2xl border border-border-primary bg-bg-tertiary mt-3">
        <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-border-primary">
          <span className="text-xs font-semibold text-text-secondary">צילומי גרף שמורים</span>
          <span className="text-[10px] text-text-muted">לקריאה בלבד</span>
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
                className="min-h-11 px-3 text-accent-primary hover:underline cursor-pointer"
              >
                נסה שוב
              </button>
            </div>
          )}

          {status === 'ready' && (
            <div className="grid gap-2 grid-cols-2 sm:grid-cols-4">
              {images.map((img, i) => (
                <button
                  key={img.id || i}
                  type="button"
                  onClick={() => setLightboxIndex(i)}
                  className="relative block w-full rounded-xl overflow-hidden border border-border-primary cursor-zoom-in min-h-11"
                  aria-label={`הגדל צילום ${i + 1}`}
                >
                  <img
                    src={img.src}
                    alt={img.caption || `צילום גרף ${i + 1} — ${pair}`}
                    loading="lazy"
                    className="w-full aspect-video object-cover bg-black/40"
                  />
                  <span className={`absolute top-1.5 right-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold ${KIND_STYLES[img.kind] || KIND_STYLES.other}`}>
                    {TRADE_IMAGE_KIND_LABELS[img.kind] || TRADE_IMAGE_KIND_LABELS.other}
                  </span>
                  {img.caption && (
                    <span className="absolute inset-x-0 bottom-0 px-1.5 py-1 text-[10px] text-white bg-black/55 truncate text-right">
                      {img.caption}
                    </span>
                  )}
                </button>
              ))}
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
        />
      )}
    </>
  );
}
