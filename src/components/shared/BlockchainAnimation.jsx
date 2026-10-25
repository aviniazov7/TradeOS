import { useRef, useEffect } from 'react';

// "Live ledger" blockchain: freshly-minted blocks glow in on the right and the
// chain scrolls slowly leftward, block numbers counting up — a chain growing in
// real time. Canvas + rAF (one loop), sized to its container, DPR-aware,
// respects reduced-motion. 21st.dev aesthetic: violet→cyan, soft glow.
const SPEED = 16;       // px/sec — deliberately slow
const RIGHT_PAD = 30;
const V = '#007ba7', I = '#6366f1', C = '#007ba7', CY = '#1496c4';

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export default function BlockchainAnimation({ className = '' }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    let raf = 0;
    let rect = { width: 0, height: 0 };
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const fit = () => {
      const r = canvas.getBoundingClientRect();
      const d = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, r.width * d);
      canvas.height = Math.max(1, r.height * d);
      ctx.setTransform(d, 0, 0, d, 0, 0);
      rect = r;
    };
    fit();
    window.addEventListener('resize', fit);

    const railGrad = (x0, x1, cy) => {
      const g = ctx.createLinearGradient(x0, cy, x1, cy);
      g.addColorStop(0, V); g.addColorStop(0.5, I); g.addColorStop(1, C);
      return g;
    };

    const draw = (ms) => {
      const w = rect.width, h = rect.height, cy = h / 2;
      const t = ms / 1000;
      const bw = Math.max(24, Math.min(40, h * 0.58));
      const s = bw / 2;
      const gap = bw * 0.72;
      const step = bw + gap;

      ctx.clearRect(0, 0, w, h);

      // ambient glow
      const amb = ctx.createRadialGradient(w / 2, cy, 0, w / 2, cy, w * 0.55);
      amb.addColorStop(0, 'rgba(99,102,241,0.13)');
      amb.addColorStop(1, 'rgba(99,102,241,0)');
      ctx.fillStyle = amb; ctx.fillRect(0, 0, w, h);

      // rail
      ctx.strokeStyle = railGrad(0, w, cy); ctx.globalAlpha = 0.16; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(w, cy); ctx.stroke(); ctx.globalAlpha = 1;

      const traveled = t * SPEED;
      const scrolled = traveled % step;
      const stepsPassed = Math.floor(traveled / step);
      const count = Math.ceil(w / step) + 2;

      for (let k = -1; k < count; k++) {
        const x = w - RIGHT_PAD - scrolled - k * step;
        if (x < -bw || x > w + bw) continue;
        const idx = 8_420_000 + stepsPassed - k; // block height, counting up
        // "mint" glow — strongest as a block enters on the right
        const mint = Math.max(0, Math.min(1, (x - (w * 0.55)) / (w * 0.4)));

        // connector to the block on its left
        ctx.strokeStyle = railGrad(x - step, x, cy); ctx.globalAlpha = 0.3; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x - s, cy); ctx.lineTo(x - gap - s, cy); ctx.stroke(); ctx.globalAlpha = 1;

        ctx.save();
        if (mint > 0.02) { ctx.shadowColor = CY; ctx.shadowBlur = 20 * mint; }
        const fill = ctx.createLinearGradient(x, cy - s, x, cy + s);
        fill.addColorStop(0, 'rgba(139,92,246,0.20)');
        fill.addColorStop(1, 'rgba(6,182,212,0.06)');
        ctx.fillStyle = fill;
        ctx.strokeStyle = railGrad(x - s, x + s, cy); ctx.lineWidth = 1.8;
        rr(ctx, x - s, cy - s, bw, bw, bw * 0.26); ctx.fill(); ctx.stroke();
        ctx.restore();

        // block number (counts up) + tiny ledger glyph
        ctx.fillStyle = `rgba(236,236,244,${0.5 + 0.5 * mint})`;
        ctx.font = `700 ${Math.max(8, bw * 0.24)}px ui-monospace, Menlo, monospace`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('#' + (idx % 100000), x, cy - bw * 0.1);
        ctx.strokeStyle = railGrad(x - s, x + s, cy); ctx.globalAlpha = 0.5;
        ctx.lineWidth = 1.4; ctx.lineCap = 'round';
        for (let r = 0; r < 2; r++) {
          const yy = cy + bw * 0.16 + r * bw * 0.15;
          ctx.beginPath(); ctx.moveTo(x - bw * 0.24, yy); ctx.lineTo(x + (r ? bw * 0.1 : bw * 0.2), yy); ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }

      if (!reduced) raf = requestAnimationFrame(draw);
    };

    if (reduced) draw(0); else raf = requestAnimationFrame(draw);

    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', fit); };
  }, []);

  return (
    <div className={className} aria-hidden="true">
      <canvas ref={canvasRef} className="w-full h-full block" />
    </div>
  );
}
