// eslint-disable-next-line no-unused-vars -- motion is used as <motion.*> (JSX-uses-vars false positive)
import { motion } from 'framer-motion';

// Premium "live blockchain" strip: gradient-outlined blocks linked by a rail of
// FLOWING energy (animated dashes), a glowing comet packet that travels the
// chain, and a confirmation pulse that ripples block-to-block in sync — over a
// soft ambient glow. Pure SVG + transform/opacity/dash animations (GPU-cheap),
// self-contained. 21st.dev aesthetic: violet→cyan, neon glow, smooth.
const N = 5;
const X0 = 44;
const GAP = 98;
const CY = 50;
const CYCLE = 3.2; // seconds for one comet pass
const lastX = X0 + (N - 1) * GAP;

export default function BlockchainAnimation({ className = '' }) {
  return (
    <div className={className} aria-hidden="true">
      <svg viewBox="0 0 480 100" className="w-full h-full" fill="none" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="bc-grad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#8b5cf6" />
            <stop offset="0.5" stopColor="#6366f1" />
            <stop offset="1" stopColor="#06b6d4" />
          </linearGradient>
          <linearGradient id="bc-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="rgba(139,92,246,0.14)" />
            <stop offset="1" stopColor="rgba(6,182,212,0.05)" />
          </linearGradient>
          <radialGradient id="bc-amb" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="rgba(99,102,241,0.20)" />
            <stop offset="1" stopColor="rgba(99,102,241,0)" />
          </radialGradient>
          <filter id="bc-glow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="3.2" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* ambient glow, gently breathing */}
        <motion.ellipse
          cx="240" cy={CY} rx="230" ry="42" fill="url(#bc-amb)"
          animate={{ opacity: [0.5, 0.85, 0.5] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
        />

        {/* base rail */}
        <line x1={X0} y1={CY} x2={lastX} y2={CY} stroke="url(#bc-grad)" strokeWidth="2" strokeOpacity="0.18" />
        {/* flowing energy rail */}
        <motion.line
          x1={X0} y1={CY} x2={lastX} y2={CY}
          stroke="url(#bc-grad)" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="2 14"
          animate={{ strokeDashoffset: [0, -160] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: 'linear' }}
        />

        {/* blocks */}
        {Array.from({ length: N }, (_, i) => {
          const x = X0 + i * GAP;
          const delay = (i / N) * CYCLE; // confirmation wave rides with the comet
          return (
            <g key={i}>
              {/* confirmation glow that ripples in sequence */}
              <motion.rect
                x={x - 19} y={CY - 19} width={38} height={38} rx={10}
                fill="none" stroke="#22d3ee" strokeWidth="2" filter="url(#bc-glow)"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: [0, 0.9, 0], scale: [0.85, 1.15, 1.25] }}
                transition={{ duration: 1.1, repeat: Infinity, repeatDelay: CYCLE - 1.1, delay, ease: 'easeOut' }}
                style={{ transformOrigin: `${x}px ${CY}px` }}
              />
              {/* the block */}
              <motion.rect
                x={x - 17} y={CY - 17} width={34} height={34} rx={9}
                fill="url(#bc-fill)" stroke="url(#bc-grad)" strokeWidth="1.75"
                animate={{ strokeOpacity: [0.55, 1, 0.55] }}
                transition={{ duration: 2.4, repeat: Infinity, delay: i * 0.24, ease: 'easeInOut' }}
              />
              {/* ledger "hash" lines */}
              <g stroke="url(#bc-grad)" strokeWidth="1.5" strokeOpacity="0.45" strokeLinecap="round">
                <line x1={x - 8} y1={CY - 5} x2={x + 8} y2={CY - 5} />
                <line x1={x - 8} y1={CY} x2={x + 4} y2={CY} />
                <line x1={x - 8} y1={CY + 5} x2={x + 7} y2={CY + 5} />
              </g>
            </g>
          );
        })}

        {/* trailing comet: a soft tail + a bright head */}
        <motion.circle
          r={9} cy={CY} fill="#22d3ee" opacity={0.25} filter="url(#bc-glow)"
          animate={{ cx: [X0 - 20, lastX + 20] }}
          transition={{ duration: CYCLE, repeat: Infinity, ease: 'linear' }}
        />
        <motion.circle
          r={4.5} cy={CY} fill="#e0faff" filter="url(#bc-glow)"
          animate={{ cx: [X0 - 10, lastX + 10], opacity: [0, 1, 1, 1, 0] }}
          transition={{ duration: CYCLE, repeat: Infinity, ease: 'linear' }}
        />
      </svg>
    </div>
  );
}
