import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, ArrowRight, ArrowLeft, Lightbulb, AlertTriangle } from 'lucide-react';
import PageHeader from '../shared/PageHeader';
import { headerIconBtn } from '../shared/headerStyles';
import { JOURNEY_STAGES } from '../../utils/constants';

// ─── Loading Screen ───────────────────────────────────────
function CandlestickLoader() {
  const candles = [
    { color: 'green', bodyTop: 28, bodyH: 32, wickTop: 18, wickH: 52 },
    { color: 'red',   bodyTop: 22, bodyH: 28, wickTop: 12, wickH: 48 },
    { color: 'green', bodyTop: 18, bodyH: 36, wickTop: 8,  wickH: 56 },
    { color: 'red',   bodyTop: 30, bodyH: 24, wickTop: 20, wickH: 44 },
    { color: 'green', bodyTop: 14, bodyH: 40, wickTop: 6,  wickH: 58 },
    { color: 'green', bodyTop: 24, bodyH: 30, wickTop: 14, wickH: 50 },
    { color: 'red',   bodyTop: 20, bodyH: 34, wickTop: 10, wickH: 54 },
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-bg-primary/80"
    >
      <div className="flex items-end gap-1.5 mb-6 h-20">
        {candles.map((c, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1, duration: 0.4, ease: 'easeOut' }}
            className="relative w-4"
            style={{ height: 70 }}
          >
            {/* Wick */}
            <div
              className="absolute left-1/2 -translate-x-1/2 w-[2px]"
              style={{
                top: c.wickTop,
                height: c.wickH,
                backgroundColor: c.color === 'green' ? '#22c55e' : '#ef4444',
              }}
            />
            {/* Body */}
            <motion.div
              initial={{ scaleY: 0 }}
              animate={{ scaleY: 1 }}
              transition={{ delay: i * 0.1 + 0.2, duration: 0.3, ease: 'easeOut' }}
              className="absolute left-0 right-0 rounded-sm"
              style={{
                top: c.bodyTop,
                height: c.bodyH,
                backgroundColor: c.color === 'green' ? '#22c55e' : '#ef4444',
                transformOrigin: 'bottom',
              }}
            />
          </motion.div>
        ))}
      </div>

      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6, duration: 0.5 }}
        className="text-text-secondary text-sm font-medium"
      >
        מכין את מסע המסחר שלך...
      </motion.p>

      {/* Pulsing dots */}
      <div className="flex gap-1 mt-3">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-accent-primary"
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ repeat: Infinity, duration: 1.2, delay: i * 0.2 }}
          />
        ))}
      </div>
    </motion.div>
  );
}

// ─── Chart Data ───────────────────────────────────────────
const chartPoints = [
  { x: 50,  y: 195 },   // 0 - התחלה
  { x: 120, y: 150 },   // -- rising (אסטרטגיות)
  { x: 220, y: 45 },    // 1 - מזל המתחילים (peak)
  { x: 320, y: 225 },   // 2 - הפסדים (valley)
  { x: 385, y: 185 },   // -- small recovery
  { x: 440, y: 210 },   // -- dip
  { x: 490, y: 180 },   // -- recover
  { x: 535, y: 200 },   // -- small dip
  { x: 600, y: 235 },   // 3 - ניהול סיכונים
  { x: 680, y: 175 },   // 4 - תכנית מסחר
  { x: 760, y: 135 },   // 5 - עקביות
  { x: 830, y: 105 },   // -- continuing
  { x: 920, y: 50 },    // 6 - פסיכולוגיית מסחר
];

const stagePointMap = [0, 2, 3, 8, 9, 10, 12];

const chartLabels = [
  { pointIdx: 0,  text: 'התחלה',           above: false },
  { pointIdx: 1,  text: 'אסטרטגיות',       above: true },
  { pointIdx: 2,  text: 'מזל המתחילים',     above: true },
  { pointIdx: 3,  text: 'הפסדים',          above: false, color: '#ef4444' },
  { pointIdx: 6,  text: 'לומדים ומנתחים',   above: false, dashed: true },
  { pointIdx: 8,  text: 'ניהול סיכונים',    above: false },
  { pointIdx: 9,  text: 'תכנית מסחר',      above: false },
  { pointIdx: 10, text: 'עקביות',          above: true },
  { pointIdx: 12, text: 'פסיכולוגיית מסחר', above: true },
];

function calcLengths(points) {
  const lengths = [0];
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    lengths.push(lengths[i - 1] + Math.sqrt(dx * dx + dy * dy));
  }
  return lengths;
}

const cumulativeLengths = calcLengths(chartPoints);
const totalLength = cumulativeLengths[cumulativeLengths.length - 1];

function buildPolyline(points) {
  return points.map((p) => `${p.x},${p.y}`).join(' ');
}

const fullPolyline = buildPolyline(chartPoints);

// ─── Main Component ──────────────────────────────────────
export default function PsychologicalJourney() {
  const navigate = useNavigate();
  const [showLoader, setShowLoader] = useState(true);
  const [activeStage, setActiveStage] = useState(0);
  const [direction, setDirection] = useState(1);

  useEffect(() => {
    const timer = setTimeout(() => setShowLoader(false), 2200);
    return () => clearTimeout(timer);
  }, []);

  const stage = JOURNEY_STAGES[activeStage];
  const totalStages = JOURNEY_STAGES.length;

  const goTo = (idx) => {
    if (idx < 0 || idx >= totalStages) return;
    setDirection(idx > activeStage ? 1 : -1);
    setActiveStage(idx);
  };

  const activeChartIdx = stagePointMap[activeStage];
  const activeLength = cumulativeLengths[activeChartIdx];
  const dashOffset = totalLength - activeLength;

  return (
    <>
      <AnimatePresence>
        {showLoader && <CandlestickLoader />}
      </AnimatePresence>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: showLoader ? 0 : 1, y: showLoader ? 10 : 0 }}
        transition={{ duration: 0.5 }}
        className="flex flex-col overflow-hidden"
        style={{ height: 'calc(100dvh - 7rem)' }}
      >
        <PageHeader
          icon={Brain}
          title="המסע הפסיכולוגי"
          subtitle="המסלול הקלאסי שרוב הסוחרים עוברים"
          className="!mb-3"
          actions={(
            <div className="flex items-center gap-2">
              <div className="h-11 px-3 rounded-xl bg-accent-primary/12 border border-accent-primary/30 flex flex-col justify-center text-center">
                <div className="text-xs font-bold text-accent-hover leading-tight">{stage.title}</div>
                <div className="text-[10px] text-text-secondary leading-tight">שלב {activeStage + 1} מתוך {totalStages}</div>
              </div>
              <button onClick={() => navigate('/mentality')} className={headerIconBtn} title="חזרה לאזור המנטלי" aria-label="חזרה לאזור המנטלי">
                <ArrowRight className="w-[18px] h-[18px]" />
              </button>
            </div>
          )}
        />

        {/* Chart */}
        <div className="mt-5 mb-2 md:my-3">
          <svg viewBox="0 0 980 280" className="w-full" preserveAspectRatio="xMidYMid meet">
            <defs>
              <filter id="gGlow">
                <feGaussianBlur stdDeviation="3" result="b" />
                <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>

            {/* Full white line (background) */}
            <polyline
              points={fullPolyline}
              fill="none"
              stroke="var(--color-text-muted)"
              strokeWidth="2.5"
              strokeLinejoin="round"
              strokeLinecap="round"
            />

            {/* Animated green line */}
            <polyline
              points={fullPolyline}
              fill="none"
              stroke="#22c55e"
              strokeWidth="3"
              strokeLinejoin="round"
              strokeLinecap="round"
              strokeDasharray={totalLength}
              strokeDashoffset={dashOffset}
              filter="url(#gGlow)"
              style={{ transition: 'stroke-dashoffset 0.7s cubic-bezier(0.4, 0, 0.2, 1)' }}
            />
            {/* Green glow */}
            <polyline
              points={fullPolyline}
              fill="none"
              stroke="#22c55e"
              strokeWidth="10"
              strokeLinejoin="round"
              strokeLinecap="round"
              strokeDasharray={totalLength}
              strokeDashoffset={dashOffset}
              opacity="0.1"
              style={{ transition: 'stroke-dashoffset 0.7s cubic-bezier(0.4, 0, 0.2, 1)' }}
            />

            {/* Labels */}
            {chartLabels.map((lbl, i) => {
              const pt = chartPoints[lbl.pointIdx];
              const labelY = lbl.above ? pt.y - 18 : pt.y + 24;
              const stageIdx = stagePointMap.indexOf(lbl.pointIdx);
              const isActive = stageIdx === activeStage;

              return (
                <g key={i}>
                  {lbl.dashed && (
                    <line x1={pt.x} y1={pt.y + 5} x2={pt.x} y2={labelY - 6}
                      stroke="var(--color-border-primary)" strokeWidth="1" strokeDasharray="3 3" />
                  )}
                  <text
                    x={pt.x} y={labelY}
                    textAnchor="middle"
                    fill={lbl.color || (isActive ? '#22c55e' : 'var(--color-text-secondary)')}
                    fontSize={isActive ? '13' : '11'}
                    fontWeight={isActive ? '700' : '400'}
                    fontFamily="Heebo, sans-serif"
                    style={{ transition: 'fill 0.4s, font-size 0.4s' }}
                  >
                    {lbl.text}
                  </text>
                </g>
              );
            })}

            {/* Stage circles */}
            {stagePointMap.map((chartIdx, stageIdx) => {
              const pt = chartPoints[chartIdx];
              const isActive = stageIdx === activeStage;
              const isPast = stageIdx <= activeStage;

              return (
                <g key={stageIdx} onClick={() => goTo(stageIdx)} className="cursor-pointer">
                  <circle cx={pt.x} cy={pt.y} r="20" fill="transparent" />

                  {isActive && (
                    <circle cx={pt.x} cy={pt.y} r="14" fill="#22c55e" opacity="0.1">
                      <animate attributeName="r" values="12;18;12" dur="2s" repeatCount="indefinite" />
                      <animate attributeName="opacity" values="0.15;0.03;0.15" dur="2s" repeatCount="indefinite" />
                    </circle>
                  )}

                  <circle
                    cx={pt.x} cy={pt.y}
                    r={isActive ? 9 : 6}
                    fill={isPast ? '#22c55e' : 'var(--color-bg-tertiary)'}
                    stroke={isPast ? '#22c55e' : 'var(--color-text-muted)'}
                    strokeWidth={isActive ? 2.5 : 1.5}
                    style={{ transition: 'r 0.4s, fill 0.4s, stroke 0.4s' }}
                  />
                  {isPast && <circle cx={pt.x} cy={pt.y} r="2.5" fill="white" style={{ transition: 'fill 0.4s' }} />}
                </g>
              );
            })}
          </svg>
        </div>

        {/* Detail card */}
        <div className="bg-bg-secondary border border-border-primary rounded-xl overflow-hidden">
            <AnimatePresence mode="wait" custom={direction}>
              <motion.div
                key={activeStage}
                custom={direction}
                initial={{ x: direction > 0 ? 120 : -120, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: direction > 0 ? -120 : 120, opacity: 0 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
                className="p-4"
              >
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-base font-bold text-accent-primary">{stage.title}</h2>
                  <span className="text-[11px] text-text-muted bg-bg-tertiary px-2.5 py-0.5 rounded-full">{stage.duration}</span>
                </div>

                <p className="text-sm text-text-secondary leading-relaxed mb-3">{stage.description}</p>

                <div className="grid grid-cols-2 gap-2.5">
                  <div className="bg-loss/5 border border-loss/10 rounded-lg p-3">
                    <div className="flex items-center gap-1.5 mb-2">
                      <AlertTriangle className="w-3.5 h-3.5 text-loss" />
                      <span className="text-xs font-semibold text-loss">אתגרים</span>
                    </div>
                    <ul className="space-y-1.5">
                      {stage.challenges.map((ch) => (
                        <li key={ch} className="text-xs text-text-secondary flex items-start gap-1.5">
                          <span className="text-loss mt-0.5">&#x2022;</span>{ch}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="bg-profit/5 border border-profit/10 rounded-lg p-3">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Lightbulb className="w-3.5 h-3.5 text-profit" />
                      <span className="text-xs font-semibold text-profit">טיפים</span>
                    </div>
                    <ul className="space-y-1.5">
                      {stage.tips.map((tip) => (
                        <li key={tip} className="text-xs text-text-secondary flex items-start gap-1.5">
                          <span className="text-profit mt-0.5">&#x2022;</span>{tip}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>

          {/* Nav */}
          <div className="flex items-center justify-between px-3 py-2 md:px-4 md:py-3 border-t border-border-primary">
            <button
              onClick={() => goTo(activeStage + 1)}
              disabled={activeStage >= totalStages - 1}
              className="flex items-center gap-1 text-sm bg-accent-primary/10 text-accent-primary px-3.5 py-1.5 rounded-lg hover:bg-accent-primary/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ArrowRight className="w-4 h-4" />
              שלב הבא
            </button>

            <div className="flex items-center gap-1.5">
              {JOURNEY_STAGES.map((_, i) => (
                <button
                  key={i}
                  onClick={() => goTo(i)}
                  className={`h-2 rounded-full transition-all duration-300 ${
                    i === activeStage
                      ? 'bg-accent-primary w-5'
                      : i <= activeStage
                      ? 'bg-accent-primary/50 w-2'
                      : 'bg-text-muted/30 w-2'
                  }`}
                />
              ))}
            </div>

            <button
              onClick={() => goTo(activeStage - 1)}
              disabled={activeStage <= 0}
              className="flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              שלב קודם
              <ArrowLeft className="w-4 h-4" />
            </button>
          </div>
        </div>
      </motion.div>
    </>
  );
}
