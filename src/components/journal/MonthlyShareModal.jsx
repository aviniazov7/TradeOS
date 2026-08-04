import { useRef, useState, useLayoutEffect } from 'react';
import { Download, Share2, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from '../shared/Modal';
import MonthlyShareCard from './MonthlyShareCard';

const SHARE_OPTIONS = [
  { key: 'showPnl', label: 'סכומי רווח/הפסד' },
  { key: 'showPercent', label: 'אחוז שינוי חודשי' },
  { key: 'showTrades', label: 'מספר עסקאות' },
];

const defaultOptions = {
  showPnl: true,
  showPercent: false,
  showTrades: true,
};

export default function MonthlyShareModal({ isOpen, onClose, trades, currentMonth, journalName }) {
  const cardRef = useRef(null);
  const previewRef = useRef(null);
  const [generating, setGenerating] = useState(false);
  const [options, setOptions] = useState(defaultOptions);
  // The card is a fixed 480px export artifact. On phones we scale it DOWN to fit
  // the modal width (via CSS zoom, which reflows) so the preview never needs a
  // horizontal scroll. The downloaded image is still captured at full 480px.
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    if (!isOpen) return undefined;
    const measure = () => {
      const w = previewRef.current?.clientWidth;
      if (w) setScale(Math.min(1, w / 480));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [isOpen]);

  const toggle = (key) => setOptions((prev) => ({ ...prev, [key]: !prev[key] }));

  const generateImage = async () => {
    if (!cardRef.current) return null;
    setGenerating(true);
    try {
      const { toPng } = await import('html-to-image');
      const dataUrl = await toPng(cardRef.current, {
        pixelRatio: 2,
        cacheBust: true,
      });
      return dataUrl;
    } catch (err) {
      console.error('Image generation failed:', err);
      toast.error('שגיאה ביצירת התמונה');
      return null;
    } finally {
      setGenerating(false);
    }
  };

  const handleDownload = async () => {
    const dataUrl = await generateImage();
    if (!dataUrl) return;
    const link = document.createElement('a');
    link.download = `monthly_journal_${Date.now()}.png`;
    link.href = dataUrl;
    link.click();
    toast.success('התמונה הורדה');
  };

  const handleShare = async () => {
    const dataUrl = await generateImage();
    if (!dataUrl) return;
    try {
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const file = new File([blob], 'monthly_journal.png', { type: 'image/png' });
      await navigator.share({ files: [file], title: 'יומן חודשי' });
    } catch (err) {
      if (err.name !== 'AbortError') {
        toast.error('השיתוף נכשל');
      }
    }
  };

  const canShare = typeof navigator !== 'undefined' && navigator.share && navigator.canShare;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="שיתוף יומן חודשי" maxWidth="max-w-lg">
      <div className="flex flex-col items-center gap-4">
        {/* Card preview */}
        <div ref={previewRef} className="w-full flex justify-center overflow-hidden">
          <div style={{ zoom: scale }}>
            <MonthlyShareCard
              ref={cardRef}
              trades={trades}
              currentMonth={currentMonth}
              journalName={journalName}
              options={options}
            />
          </div>
        </div>

        {/* Toggle options */}
        <div className="w-full">
          <p className="text-xs text-text-muted mb-2">הגדרות תצוגה</p>
          <div className="flex flex-wrap gap-2">
            {SHARE_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                onClick={() => toggle(opt.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer border ${
                  options[opt.key]
                    ? 'bg-accent-primary/15 text-accent-primary border-accent-primary/30'
                    : 'bg-bg-tertiary text-text-muted border-border-primary hover:text-text-primary'
                }`}
              >
                <div className={`w-3.5 h-3.5 rounded flex items-center justify-center flex-shrink-0 ${
                  options[opt.key] ? 'bg-accent-primary' : 'bg-bg-secondary border border-border-primary'
                }`}>
                  {options[opt.key] && <Check className="w-2.5 h-2.5 text-black" />}
                </div>
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-3 w-full">
          <button
            onClick={handleDownload}
            disabled={generating}
            className="flex-1 flex items-center justify-center gap-2 bg-accent-primary text-bg-primary font-semibold py-2.5 rounded-lg hover:bg-accent-hover transition-colors cursor-pointer disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            {generating ? 'מייצר...' : 'הורדה כתמונה'}
          </button>
          {canShare && (
            <button
              onClick={handleShare}
              disabled={generating}
              className="flex-1 flex items-center justify-center gap-2 bg-bg-tertiary text-text-primary font-semibold py-2.5 rounded-lg border border-border-primary hover:border-border-hover transition-colors cursor-pointer disabled:opacity-50"
            >
              <Share2 className="w-4 h-4" />
              שיתוף
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
