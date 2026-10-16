import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { money, shortDate, toneOf } from './data';

const W = 640;
const H = 168;
const PAD = 14;

function geometry(points) {
  if (!points || points.length < 2) return null;
  const vals = points.map((p) => p.value);
  const min = Math.min(...vals, 0);
  const max = Math.max(...vals, 0);
  const span = max - min || 1;
  const x = (i) => (i / (points.length - 1)) * W;
  const y = (v) => PAD + (H - PAD * 2) * (1 - (v - min) / span);
  const pts = points.map((p, i) => ({ ...p, x: x(i), y: y(p.value) }));
  let d = `M${pts[0].x.toFixed(2)},${pts[0].y.toFixed(2)}`;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const a = pts[i];
    const b = pts[i + 1];
    const mx = ((a.x + b.x) / 2).toFixed(2);
    d += ` C${mx},${a.y.toFixed(2)} ${mx},${b.y.toFixed(2)} ${b.x.toFixed(2)},${b.y.toFixed(2)}`;
  }
  return { pts, d, area: `${d} L${W},${H} L0,${H} Z`, zeroY: y(0) };
}

const STROKE = { graphite: '#f4f4f5', aurora: '#34d399', solar: '#3ddc97' };
const FILL = { graphite: '#ffffff', aurora: '#34d399', solar: '#3ddc97' };

export default function EquityChart({ points, variant, mask }) {
  const geo = useMemo(() => geometry(points), [points]);
  const uid = useId().replace(/:/g, '');
  const wrap = useRef(null);
  const path = useRef(null);
  const glow = useRef(null);
  const [hi, setHi] = useState(null);

  useLayoutEffect(() => {
    const el = path.current;
    if (!el) return undefined;
    const n = el.getTotalLength();
    const arms = [el, glow.current].filter(Boolean);
    arms.forEach((node) => {
      node.style.transition = 'none';
      node.style.strokeDasharray = `${n}`;
      node.style.strokeDashoffset = `${n}`;
    });
    const id = requestAnimationFrame(() => {
      arms.forEach((node) => {
        node.style.transition = 'stroke-dashoffset 1.05s cubic-bezier(.22,.8,.3,1)';
        node.style.strokeDashoffset = '0';
      });
    });
    return () => cancelAnimationFrame(id);
  }, [geo]);

  if (!geo) return null;

  const move = (clientX) => {
    const r = wrap.current?.getBoundingClientRect();
    if (!r?.width) return;
    const rel = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    setHi(Math.round(rel * (geo.pts.length - 1)));
  };

  const hp = hi != null ? geo.pts[hi] : null;
  const stroke = STROKE[variant] || STROKE.graphite;
  const last = geo.pts[geo.pts.length - 1];

  return (
    <div
      ref={wrap}
      className={`dp-chart dp-chart-${variant}`}
      dir="ltr"
      onMouseMove={(e) => move(e.clientX)}
      onMouseLeave={() => setHi(null)}
      onTouchStart={(e) => { if (e.touches[0]) move(e.touches[0].clientX); }}
      onTouchMove={(e) => { if (e.touches[0]) move(e.touches[0].clientX); }}
      onTouchEnd={() => setHi(null)}
    >
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="עקומת רווח מצטבר">
        <defs>
          <linearGradient id={`fill-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={FILL[variant]} stopOpacity={variant === 'graphite' ? 0.16 : 0.38} />
            <stop offset="100%" stopColor={FILL[variant]} stopOpacity="0" />
          </linearGradient>
        </defs>
        {variant === 'graphite' && [0.25, 0.5, 0.75].map((g) => (
          <line key={g} x1="0" x2={W} y1={PAD + (H - PAD * 2) * g} y2={PAD + (H - PAD * 2) * g} stroke="rgba(255,255,255,0.06)" vectorEffect="non-scaling-stroke" />
        ))}
        {variant === 'solar' && [0.33, 0.66].map((g) => (
          <line key={g} x1="0" x2={W} y1={PAD + (H - PAD * 2) * g} y2={PAD + (H - PAD * 2) * g} stroke="rgba(228,196,138,0.18)" strokeDasharray="1.5 7" vectorEffect="non-scaling-stroke" />
        ))}
        <line
          x1="0" x2={W} y1={geo.zeroY} y2={geo.zeroY}
          stroke={variant === 'solar' ? 'rgba(228,196,138,0.4)' : 'rgba(255,255,255,0.18)'}
          strokeDasharray="3 7"
          vectorEffect="non-scaling-stroke"
        />
        <path className="dp-area" d={geo.area} fill={`url(#fill-${uid})`} />
        {variant === 'aurora' && (
          <path ref={glow} d={geo.d} fill="none" stroke="#34d399" strokeWidth="7" strokeOpacity="0.28" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        )}
        <path
          ref={path}
          d={geo.d}
          fill="none"
          stroke={stroke}
          strokeWidth={variant === 'graphite' ? 1.7 : 2.2}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        {variant === 'aurora' && !hp && (
          <circle className="dp-end-dot" cx={last.x} cy={last.y} r="3.4" fill="#34d399" />
        )}
        {hp && (
          <>
            <line x1={hp.x} x2={hp.x} y1="0" y2={H} stroke="rgba(255,255,255,0.35)" vectorEffect="non-scaling-stroke" />
            <circle cx={hp.x} cy={hp.y} r="3.6" fill={stroke} />
          </>
        )}
      </svg>
      {hp && (
        <div className="dp-tip" style={{ left: `${Math.max(10, Math.min(90, (hi / (geo.pts.length - 1)) * 100))}%` }}>
          <b dir="ltr" className={`dp-num is-${toneOf(hp.value)}`}>{mask(money(hp.value, { sign: true }))}</b>
          {hp.t ? <span>{shortDate(hp.t)}</span> : null}
        </div>
      )}
    </div>
  );
}
