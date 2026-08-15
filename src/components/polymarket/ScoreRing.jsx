// Smart-score as a conic progress ring (0–100) — reads how far up the scale a
// wallet sits, not just the number. Tier color reuses the app's profit/accent/
// muted tokens (≥75 / ≥50 / else). Shared by the leaderboard row + the modal.
export default function ScoreRing({ score, size = 'md' }) {
  const box = size === 'lg' ? 'w-11 h-11 text-sm' : 'w-9 h-9 text-[13px]';
  if (score == null) {
    return <span className={`grid place-items-center shrink-0 text-[10px] text-text-muted ${box}`}>—</span>;
  }
  const stroke = score >= 75 ? 'var(--color-profit)' : score >= 50 ? 'var(--color-accent-primary)' : 'var(--color-text-muted)';
  const toneTx = score >= 75 ? 'text-profit' : score >= 50 ? 'text-accent-primary' : 'text-text-secondary';
  return (
    <div className={`relative grid place-items-center shrink-0 ${box}`} title={`ציון חכם ${score}/100`}>
      <div className="absolute inset-0 rounded-full" style={{ background: `conic-gradient(${stroke} ${score * 3.6}deg, var(--color-bg-tertiary) 0deg)` }} />
      <div className="absolute inset-[3px] rounded-full bg-bg-primary" />
      <span className={`relative font-extrabold num-mono ${toneTx}`}>{score}</span>
    </div>
  );
}
