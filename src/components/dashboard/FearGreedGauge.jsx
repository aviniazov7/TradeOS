import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Gauge } from 'lucide-react';

const CLASSIFICATIONS = {
  'Extreme Fear': { label: 'פחד קיצוני', color: '#ef4444' },
  'Fear': { label: 'פחד', color: '#f97316' },
  'Neutral': { label: 'ניטרלי', color: '#eab308' },
  'Greed': { label: 'חמדנות', color: '#84cc16' },
  'Extreme Greed': { label: 'חמדנות קיצונית', color: '#22c55e' },
};

function getColor(value) {
  if (value <= 20) return '#ef4444';
  if (value <= 40) return '#f97316';
  if (value <= 60) return '#eab308';
  if (value <= 80) return '#84cc16';
  return '#22c55e';
}

function getClassLabel(classification) {
  return CLASSIFICATIONS[classification]?.label || classification;
}

export default function FearGreedGauge({ expanded = false }) {
  const [fgiData, setFgiData] = useState(null);
  const [history, setHistory] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const fetchFGI = async () => {
      try {
        const limit = expanded ? 31 : 1;
        const res = await fetch(`https://api.alternative.me/fng/?limit=${limit}`);
        if (!res.ok) throw new Error(`FGI API responded ${res.status}`);
        const json = await res.json();
        if (cancelled) return;
        if (json.data?.[0]) {
          setFgiData(json.data[0]);
          setError(false);
          if (expanded && json.data.length > 1) {
            setHistory({
              yesterday: json.data[1],
              lastWeek: json.data[7] || null,
              lastMonth: json.data[30] || json.data[json.data.length - 1] || null,
            });
          }
        } else {
          throw new Error('FGI API returned no data');
        }
      } catch (err) {
        if (cancelled) return;
        console.warn('Fear & Greed Index fetch failed:', err);
        setError(true);
      }
    };
    fetchFGI();
    return () => { cancelled = true; };
  }, [expanded]);

  if (error) {
    return (
      <div className="bento-card p-3 flex flex-col items-center justify-center text-center min-h-[88px]">
        <Gauge className="w-4 h-4 text-text-muted mb-1" />
        <span className="text-[11px] text-text-muted">לא ניתן לטעון מד פחד</span>
      </div>
    );
  }
  if (!fgiData) return null;

  const value = parseInt(fgiData.value);
  const classification = CLASSIFICATIONS[fgiData.value_classification] || { label: fgiData.value_classification, color: '#eab308' };
  const needleColor = getColor(value);

  const cx = 100, cy = 85, r = 70;
  const needleAngle = 180 - (value / 100) * 180;
  const needleRad = (needleAngle * Math.PI) / 180;
  const needleX = cx + r * 0.75 * Math.cos(needleRad);
  const needleY = cy - r * 0.75 * Math.sin(needleRad);

  // Compact mode (top row card)
  if (!expanded) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bento-card p-3 flex flex-col items-center"
      >
        <div className="flex items-center gap-1.5 mb-1.5">
          <Gauge className="w-3.5 h-3.5 text-text-muted" />
          <span className="text-[11px] text-text-muted">פחד וחמדנות</span>
        </div>
        <div className="w-28 h-[56px]">
          <svg viewBox="0 0 200 100" className="w-full h-full">
            <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke="#1a1a1a" strokeWidth="14" strokeLinecap="round" />
            {[
              { start: 0, end: 36, color: '#22c55e' },
              { start: 36, end: 72, color: '#84cc16' },
              { start: 72, end: 108, color: '#eab308' },
              { start: 108, end: 144, color: '#f97316' },
              { start: 144, end: 180, color: '#ef4444' },
            ].map((seg, i) => {
              const s = (seg.start * Math.PI) / 180;
              const e = (seg.end * Math.PI) / 180;
              return (
                <path key={i} d={`M ${cx + r * Math.cos(s)} ${cy - r * Math.sin(s)} A ${r} ${r} 0 0 0 ${cx + r * Math.cos(e)} ${cy - r * Math.sin(e)}`} fill="none" stroke={seg.color} strokeWidth="14" strokeLinecap="butt" opacity="0.3" />
              );
            })}
            <motion.line x1={cx} y1={cy} initial={{ x2: cx, y2: cy }} animate={{ x2: needleX, y2: needleY }} transition={{ duration: 1, ease: 'easeOut', delay: 0.3 }} stroke={needleColor} strokeWidth="2.5" strokeLinecap="round" />
            <circle cx={cx} cy={cy} r="4" fill={needleColor} />
          </svg>
        </div>
        <div className="text-center mt-0.5">
          <span className="text-base font-bold num-mono" style={{ color: needleColor }}>{value}</span>
          <span className="text-[11px] font-semibold mr-1.5" style={{ color: needleColor }}>{classification.label}</span>
        </div>
      </motion.div>
    );
  }

  // Expanded mode (dedicated card with history)
  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="bento-card p-5"
    >
      <h2 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2 justify-center">
        <Gauge className="w-4 h-4 text-text-muted" />
        מד פחד וחמדנות
      </h2>

      <div className="flex items-center gap-6 justify-center">
        {/* History */}
        {history && (
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.5, duration: 0.4 }}
            className="space-y-3"
          >
            {[
              { label: 'אתמול', data: history.yesterday },
              { label: 'שבוע', data: history.lastWeek },
              { label: 'חודש', data: history.lastMonth },
            ].map((item) => {
              if (!item.data) return null;
              const v = parseInt(item.data.value);
              const c = getColor(v);
              return (
                <div key={item.label} className="text-right">
                  <p className="text-[11px] text-text-muted mb-0.5">{item.label}</p>
                  <div className="flex items-center gap-2 justify-end">
                    <span className="text-sm font-bold" style={{ color: c }}>
                      {getClassLabel(item.data.value_classification)} {v}
                    </span>
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: c }} />
                  </div>
                </div>
              );
            })}
          </motion.div>
        )}

        {/* Gauge */}
        <div className="flex flex-col items-center">
          <div className="w-40 h-[80px]">
            <svg viewBox="0 0 200 100" className="w-full h-full">
              <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke="#1a1a1a" strokeWidth="16" strokeLinecap="round" />
              {[
                { start: 0, end: 36, color: '#22c55e' },
                { start: 36, end: 72, color: '#84cc16' },
                { start: 72, end: 108, color: '#eab308' },
                { start: 108, end: 144, color: '#f97316' },
                { start: 144, end: 180, color: '#ef4444' },
              ].map((seg, i) => {
                const s = (seg.start * Math.PI) / 180;
                const e = (seg.end * Math.PI) / 180;
                return (
                  <path key={i} d={`M ${cx + r * Math.cos(s)} ${cy - r * Math.sin(s)} A ${r} ${r} 0 0 0 ${cx + r * Math.cos(e)} ${cy - r * Math.sin(e)}`} fill="none" stroke={seg.color} strokeWidth="16" strokeLinecap="round" opacity="0.4" />
                );
              })}
              <motion.line x1={cx} y1={cy} initial={{ x2: cx, y2: cy }} animate={{ x2: needleX, y2: needleY }} transition={{ duration: 1.2, ease: 'easeOut', delay: 0.3 }} stroke={needleColor} strokeWidth="3" strokeLinecap="round" />
              <circle cx={cx} cy={cy} r="5" fill={needleColor} />
              <circle cx={cx} cy={cy} r="2.5" fill="#fff" />
            </svg>
          </div>
          <div className="text-center mt-1">
            <motion.span
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.8, duration: 0.4 }}
              className="text-3xl font-bold num-mono"
              style={{ color: needleColor }}
            >
              {value}
            </motion.span>
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1 }}
              className="text-sm font-semibold mr-2"
              style={{ color: needleColor }}
            >
              {classification.label}
            </motion.span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
