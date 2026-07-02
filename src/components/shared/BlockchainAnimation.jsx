// eslint-disable-next-line no-unused-vars -- motion is used as <motion.*> (JSX-uses-vars false positive)
import { motion } from 'framer-motion';

// Decorative "blockchain" strip: gradient-outlined blocks linked in a chain,
// with a glowing packet that travels block-to-block (a confirmed tx flowing
// down the chain). Pure SVG + transform/opacity animations — GPU-friendly and
// self-contained. 21st.dev-style: violet→cyan, soft glow, subtle pulse.
export default function BlockchainAnimation({ className = '' }) {
  const blocks = [0, 1, 2, 3, 4];
  const x0 = 34;
  const gap = 88;
  const cy = 40;
  const lastX = x0 + (blocks.length - 1) * gap;

  return (
    <div className={className} aria-hidden="true">
      <svg viewBox="0 0 420 80" className="w-full h-full" fill="none" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="bc-grad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#8b5cf6" />
            <stop offset="1" stopColor="#06b6d4" />
          </linearGradient>
        </defs>

        {/* connecting rail */}
        <line x1={x0} y1={cy} x2={lastX} y2={cy} stroke="url(#bc-grad)" strokeWidth="2" strokeOpacity="0.28" />

        {/* blocks */}
        {blocks.map((i) => {
          const x = x0 + i * gap;
          return (
            <g key={i}>
              <motion.rect
                x={x - 15} y={cy - 15} width={30} height={30} rx={8}
                fill="rgba(139,92,246,0.06)" stroke="url(#bc-grad)" strokeWidth="1.75"
                animate={{ opacity: [0.45, 1, 0.45] }}
                transition={{ duration: 2.4, repeat: Infinity, delay: i * 0.28, ease: 'easeInOut' }}
              />
              {/* tiny "hash" ticks inside each block */}
              <line x1={x - 7} y1={cy - 4} x2={x + 7} y2={cy - 4} stroke="url(#bc-grad)" strokeWidth="1.5" strokeOpacity="0.5" strokeLinecap="round" />
              <line x1={x - 7} y1={cy + 1} x2={x + 4} y2={cy + 1} stroke="url(#bc-grad)" strokeWidth="1.5" strokeOpacity="0.5" strokeLinecap="round" />
              <line x1={x - 7} y1={cy + 6} x2={x + 6} y2={cy + 6} stroke="url(#bc-grad)" strokeWidth="1.5" strokeOpacity="0.5" strokeLinecap="round" />
            </g>
          );
        })}

        {/* travelling packet */}
        <motion.circle
          r={4.5} cy={cy} fill="#22d3ee"
          style={{ filter: 'drop-shadow(0 0 6px #22d3ee)' }}
          animate={{ cx: [x0, lastX], opacity: [0, 1, 1, 1, 0] }}
          transition={{ duration: 2.8, repeat: Infinity, ease: 'linear' }}
        />
      </svg>
    </div>
  );
}
