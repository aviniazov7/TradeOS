import { useRef, useState, useEffect } from 'react';
import { m, AnimatePresence } from 'framer-motion';
import { X, Circle, Shield, LogIn, LogOut, StickyNote, ListChecks, Share2, Target, Loader2, ImageIcon, CloudSun, AlertTriangle, CalendarClock, Settings2 } from 'lucide-react';
import { toPng } from 'html-to-image';
// jsPDF loaded dynamically on share
import toast from 'react-hot-toast';
import CoinIcon from '../shared/CoinIcon';
import { getSessionClasses } from '../../utils/constants';
import { safeHttpUrl } from '../../utils/urls';
import { useTheme } from '../../hooks/useTheme';
import { modalBackdrop, modalContent } from '../../utils/animations';

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r}, ${g}, ${b}`;
}

function toImageUrl(url) {
  if (!url) return null;
  // TradingView snapshot: tradingview.com/x/ID → s3 image
  const tvMatch = url.match(/tradingview\.com\/x\/([a-zA-Z0-9]+)/);
  if (tvMatch) {
    const id = tvMatch[1];
    return `https://s3.tradingview.com/snapshots/${id[0].toLowerCase()}/${id}.png`;
  }
  // Any http URL — try as image
  if (url.startsWith('http')) return url;
  return null;
}

function Section({ number, title, icon: Icon, children, color }) {
  if (!children) return null;
  return (
    <div className="border-t border-white/10 py-6">
      <div className="flex items-start gap-3">
        <span className="text-3xl font-bold leading-none" style={{ color: `rgba(${hexToRgb(color)}, 0.3)` }}>
          {number}
        </span>
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-bold text-white flex items-center gap-2 mb-3">
            <Icon className="w-4 h-4" style={{ color }} />
            {title}
          </h3>
          {children}
        </div>
      </div>
    </div>
  );
}

export default function StrategyView({ isOpen, onClose, journal }) {
  const cardRef = useRef(null);
  const [exporting, setExporting] = useState(false);
  const { isDark } = useTheme();

  // Lock body scroll when modal is open — prevents pull-to-refresh
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [isOpen]);

  if (!journal) return null;
  const color = journal.color || '#007ba7';
  const rgb = hexToRgb(color);

  const handleShare = async () => {
    if (!cardRef.current || exporting) return;
    setExporting(true);
    const el = cardRef.current;
    // Temporarily expand card to full height for complete capture; captured
    // before try so the finally below can always restore (a toPng failure
    // used to leave the modal stuck at maxHeight:none until reopened).
    const prevMaxH = el.style.maxHeight;
    const prevOverflow = el.style.overflow;
    try {
      el.style.maxHeight = 'none';
      el.style.overflow = 'visible';

      const bgColor = isDark ? '#0a0a0a' : '#e8ecf4';
      const dataUrl = await toPng(el, {
        pixelRatio: 2,
        backgroundColor: bgColor,
        cacheBust: true,
        filter: (node) => {
          if (node.dataset?.exportHide) return false;
          if (node.tagName === 'IMG' && node.src && !node.src.startsWith('data:')) return false;
          return true;
        },
      });

      const img = new Image();
      img.src = dataUrl;
      await new Promise((resolve) => { img.onload = resolve; });

      const { jsPDF } = await import('jspdf');
      const pdfWidth = 210;
      const pdfHeight = (img.height / img.width) * pdfWidth;
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [pdfWidth, pdfHeight] });
      pdf.addImage(dataUrl, 'PNG', 0, 0, pdfWidth, pdfHeight);

      const pdfBlob = pdf.output('blob');
      const fileName = `${journal.name}-strategy.pdf`;
      const file = new File([pdfBlob], fileName, { type: 'application/pdf' });

      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: journal.name });
      } else {
        const link = document.createElement('a');
        link.download = fileName;
        link.href = URL.createObjectURL(pdfBlob);
        link.click();
        URL.revokeObjectURL(link.href);
        toast.success('ה-PDF הורד');
      }
    } catch (err) {
      if (err.name !== 'AbortError') toast.error('שגיאה בייצוא');
    } finally {
      el.style.maxHeight = prevMaxH;
      el.style.overflow = prevOverflow;
      setExporting(false);
    }
  };

  // Dark: color → dark bg | Light: color → light bg
  const cardBg = isDark
    ? `linear-gradient(135deg, rgba(${rgb}, 0.25) 0%, #0a0a0a 60%)`
    : `linear-gradient(135deg, rgba(${rgb}, 0.18) 0%, #e8ecf4 60%)`;
  const textMain = isDark ? 'text-white' : 'text-gray-900';
  const textSub = isDark ? 'text-white/60' : 'text-gray-600';
  const textBody = isDark ? 'text-white/70' : 'text-gray-700';
  const textMuted = isDark ? 'text-white/40' : 'text-gray-400';
  const tagBg = isDark ? 'bg-white/10 text-white/70 border-white/10' : 'bg-black/5 text-gray-700 border-gray-300/50';
  const btnBg = isDark ? 'bg-white/10 hover:bg-white/20 text-white/60 hover:text-white' : 'bg-black/10 hover:bg-black/20 text-gray-500 hover:text-gray-800';

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          {/* Backdrop */}
          <m.div
            className="absolute inset-0 bg-black/75 backdrop-blur-sm"
            onClick={onClose}
            variants={modalBackdrop}
            initial="initial"
            animate="animate"
            exit="exit"
          />

          {/* Card */}
          <m.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="strategy-journal-title"
            variants={modalContent}
            initial="initial"
            animate="animate"
            exit="exit"
            ref={cardRef}
            onClick={(e) => e.stopPropagation()}
            onTouchMove={(e) => e.stopPropagation()}
            className="relative w-full max-w-lg md:max-w-2xl max-h-[90vh] overflow-y-auto overscroll-contain rounded-2xl shadow-2xl"
            style={{ background: cardBg, WebkitOverflowScrolling: 'touch' }}
          >
            {/* Top buttons — hidden during export */}
            <div data-export-hide="true" className="absolute top-4 left-4 z-10 flex items-center gap-2">
              <button
                onClick={handleShare}
                disabled={exporting}
                className={`p-1.5 rounded-lg ${btnBg} transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1.5`}
                title="ייצוא PDF"
                aria-label="ייצוא PDF"
              >
                {exporting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-[10px] font-medium">מייצא...</span>
                  </>
                ) : (
                  <Share2 className="w-4 h-4" />
                )}
              </button>
              <button
                onClick={onClose}
                aria-label="סגור"
                className={`p-1.5 rounded-lg ${btnBg} transition-colors cursor-pointer`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Header */}
            <div className="relative px-6 pt-10 pb-8 text-center overflow-hidden">
              {/* Decorative glow */}
              <div
                className="absolute -top-10 -right-10 w-48 h-48 rounded-full blur-3xl opacity-25"
                style={{ background: color }}
              />

              <p className={`text-[10px] tracking-[0.3em] uppercase ${textMuted} mb-3 font-mono`}>
                Strategy Journal
              </p>

              <h2 id="strategy-journal-title" className="text-2xl font-bold mb-2">
                <span style={{ color }}>{journal.name.split(' ').slice(0, -1).join(' ')}</span>
                {journal.name.includes(' ') && (
                  <span className={textSub}> {journal.name.split(' ').slice(-1)}</span>
                )}
                {!journal.name.includes(' ') && <span style={{ color }}>{journal.name}</span>}
              </h2>

              {journal.description && (
                <p className={`text-sm ${textSub} max-w-xs mx-auto`}>{journal.description}</p>
              )}

              {/* Tags */}
              <div className="flex flex-wrap justify-center gap-1.5 mt-4">
                {(journal.pairs || []).slice(0, 4).map((pair) => (
                  <span key={pair} className={`flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium border ${tagBg}`}>
                    <CoinIcon pair={pair} className="w-3 h-3" />
                    {pair}
                  </span>
                ))}
                {(journal.pairs || []).length > 4 && (
                  <span className={`px-2 py-1 rounded-full text-[10px] ${isDark ? 'bg-white/10 text-white/50' : 'bg-black/5 text-gray-500'}`}>
                    +{journal.pairs.length - 4}
                  </span>
                )}
              </div>

              {/* Session + Timeframe tags */}
              <div className="flex flex-wrap justify-center gap-1.5 mt-2">
                {(journal.timeframes || []).map((tf) => (
                  <span key={tf} className={`px-2 py-1 rounded-full text-[10px] font-mono border ${isDark ? 'bg-white/8 text-white/50 border-white/10' : 'bg-black/5 text-gray-500 border-gray-300/50'}`}>
                    {tf}
                  </span>
                ))}
                {(journal.sessions || []).map((s) => (
                  <span key={s} className={`px-2 py-1 rounded-full text-[10px] font-medium ${getSessionClasses(s)}`}>
                    {s}
                  </span>
                ))}
              </div>
            </div>

            {/* Content sections */}
            <div className="px-6 pb-8">
              {(() => {
                let n = 0;
                const num = () => String(++n).padStart(2, '0');
                return (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
                      {journal.entryRules && (
                        <Section number={num()} title="כללי כניסה" icon={LogIn} color={color}>
                          <p className={`text-sm ${textBody} leading-relaxed whitespace-pre-wrap`}>{journal.entryRules}</p>
                        </Section>
                      )}

                      {journal.exitRules && (
                        <Section number={num()} title="כללי יציאה" icon={LogOut} color={color}>
                          <p className={`text-sm ${textBody} leading-relaxed whitespace-pre-wrap`}>{journal.exitRules}</p>
                        </Section>
                      )}

                      {journal.riskManagement && (
                        <Section number={num()} title="ניהול סיכונים" icon={Shield} color={color}>
                          <p className={`text-sm ${textBody} leading-relaxed whitespace-pre-wrap`}>{journal.riskManagement}</p>
                        </Section>
                      )}

                      {journal.tradeManagement && (
                        <Section number={num()} title="ניהול עסקה" icon={Settings2} color={color}>
                          <p className={`text-sm ${textBody} leading-relaxed whitespace-pre-wrap`}>{journal.tradeManagement}</p>
                        </Section>
                      )}

                      {journal.goals && (
                        <Section number={num()} title="יעדים" icon={Target} color={color}>
                          <p className={`text-sm ${textBody} leading-relaxed whitespace-pre-wrap`}>{journal.goals}</p>
                        </Section>
                      )}

                      {journal.marketConditions && (
                        <Section number={num()} title="תנאי שוק" icon={CloudSun} color={color}>
                          <p className={`text-sm ${textBody} leading-relaxed whitespace-pre-wrap`}>{journal.marketConditions}</p>
                        </Section>
                      )}

                      {journal.dailyRoutine && (
                        <Section number={num()} title="שגרה יומית" icon={CalendarClock} color={color}>
                          <p className={`text-sm ${textBody} leading-relaxed whitespace-pre-wrap`}>{journal.dailyRoutine}</p>
                        </Section>
                      )}
                    </div>

                    {(journal.checklist || []).length > 0 && (
                      <Section number={num()} title="צ'קליסט" icon={ListChecks} color={color}>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
                          {journal.checklist.map((item, i) => (
                            <div key={i} className="flex items-start gap-2">
                              <Circle className={`w-3.5 h-3.5 mt-0.5 ${isDark ? 'text-white/30' : 'text-gray-400'} shrink-0`} />
                              <span className={`text-sm ${textBody}`}>{item}</span>
                            </div>
                          ))}
                        </div>
                      </Section>
                    )}

                    {(journal.mistakesToAvoid || []).length > 0 && (
                      <Section number={num()} title="טעויות נפוצות" icon={AlertTriangle} color={color}>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
                          {journal.mistakesToAvoid.map((item, i) => (
                            <div key={i} className="flex items-start gap-2">
                              <Circle className={`w-3.5 h-3.5 mt-0.5 text-loss/50 shrink-0`} />
                              <span className={`text-sm ${textBody}`}>{item}</span>
                            </div>
                          ))}
                        </div>
                      </Section>
                    )}

                    {(journal.tradeExamples || []).length > 0 && (
                      <Section number={num()} title="דוגמאות כניסה" icon={ImageIcon} color={color}>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {journal.tradeExamples.map((ex, i) => (
                            <div key={i} className="space-y-2">
                              {toImageUrl(ex.chartUrl) && (
                                safeHttpUrl(ex.chartUrl) ? (
                                  <a
                                    href={safeHttpUrl(ex.chartUrl)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="block group relative"
                                    title="פתח בטאב חדש"
                                  >
                                    <img
                                      src={toImageUrl(ex.chartUrl)}
                                      alt={ex.title || 'דוגמה'}
                                      className="w-full rounded-xl group-hover:opacity-90 transition-opacity"
                                      onError={(e) => { e.target.style.display = 'none'; }}
                                      crossOrigin="anonymous"
                                    />
                                  </a>
                                ) : (
                                  <img
                                    src={toImageUrl(ex.chartUrl)}
                                    alt={ex.title || 'דוגמה'}
                                    className="w-full rounded-xl"
                                    onError={(e) => { e.target.style.display = 'none'; }}
                                    crossOrigin="anonymous"
                                  />
                                )
                              )}
                              {(ex.title || ex.description) && (
                                <div>
                                  {ex.title && <p className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-gray-900'} mb-1`}>{ex.title}</p>}
                                  {ex.description && <p className={`text-sm ${textBody}`}>{ex.description}</p>}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </Section>
                    )}

                    {journal.notes && (
                      <Section number={num()} title="הערות" icon={StickyNote} color={color}>
                        <p className={`text-sm ${textBody} leading-relaxed whitespace-pre-wrap`}>{journal.notes}</p>
                      </Section>
                    )}
                  </>
                );
              })()}
            </div>
          </m.div>
        </div>
      )}
    </AnimatePresence>
  );
}
