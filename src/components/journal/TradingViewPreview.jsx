import { useState } from 'react';
import { ExternalLink, ImageOff } from 'lucide-react';
import { safeHttpUrl } from '../../utils/urls';
import { tradingViewEmbedSrc, tradingViewSnapshotImage } from '../../utils/tradingViewLink';

/**
 * Preview for a trade's TradingView link. Snapshot shares and direct images
 * render as a picture. Chart pages embed. Anything else stays a link.
 */
export default function TradingViewPreview({ url, pair = '' }) {
  const safe = safeHttpUrl(url) || '';
  const image = tradingViewSnapshotImage(safe);
  const embed = tradingViewEmbedSrc(safe);
  const [failed, setFailed] = useState(false);
  if (!safe) return null;

  const short = safe.replace(/^https?:\/\//, '');

  return (
    <div className="rounded-xl border border-border-primary bg-bg-tertiary overflow-hidden mt-2">
      <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-b border-border-primary">
        <a
          href={safe}
          target="_blank"
          rel="noopener noreferrer"
          dir="ltr"
          title={safe}
          className="min-h-11 min-w-0 flex-1 inline-flex items-center text-xs text-accent-primary hover:underline truncate text-left"
        >
          {short}
        </a>
        <a
          href={safe}
          target="_blank"
          rel="noopener noreferrer"
          className="min-h-11 shrink-0 inline-flex items-center gap-1 text-accent-primary text-xs hover:underline"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">פתח ב-TradingView</span>
          <span className="sm:hidden">פתח</span>
        </a>
      </div>
      {image && !failed ? (
        <a href={safe} target="_blank" rel="noopener noreferrer" className="block bg-black/30">
          <img
            src={image}
            alt={pair ? `צילום גרף — ${pair}` : 'צילום גרף'}
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setFailed(true)}
            className="w-full max-h-72 object-contain"
          />
        </a>
      ) : embed ? (
        <iframe
          title={pair ? `גרף ${pair}` : 'גרף TradingView'}
          src={embed}
          loading="lazy"
          className="w-full h-72 border-0 bg-black/30"
          allow="fullscreen"
        />
      ) : (
        <a
          href={safe}
          target="_blank"
          rel="noopener noreferrer"
          className="h-24 flex flex-col items-center justify-center gap-1.5 text-text-muted text-xs hover:text-text-secondary transition-colors"
        >
          <ImageOff className="w-5 h-5" />
          אין תצוגה מקדימה — לחץ לפתיחת הקישור
        </a>
      )}
    </div>
  );
}
