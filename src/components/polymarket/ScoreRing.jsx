// Smart-score as a conic progress ring (0–100). Polymarket brand = purple
// (distinct from the scanner's cyan), brighter toward the top of the scale.
// Shared by the leaderboard, the podium and the wallet page.
export default function ScoreRing({ score, size = 'md' }) {
  const box = size === 'xl' ? 'w-14 h-14 text-base' : size === 'lg' ? 'w-11 h-11 text-sm' : 'w-9 h-9 text-[13px]';
  if (score == null) {
    return <span className={`grid place-items-center shrink-0 text-[10px] text-text-muted ${box}`}>—</span>;
  }
  const stroke = score >= 75 ? '#c084fc' : score >= 50 ? '#a855f7' : '#6b7280';
  const toneTx = score >= 75 ? 'text-purple-300' : score >= 50 ? 'text-purple-400' : 'text-text-secondary';
  return (
    <div className={`relative grid place-items-center shrink-0 ${box}`} title={`ציון ${score}/100`}>
      <div className="absolute inset-0 rounded-full" style={{ background: `conic-gradient(${stroke} ${score * 3.6}deg, var(--color-bg-tertiary) 0deg)` }} />
      <div className="absolute inset-[3px] rounded-full bg-bg-primary" />
      <span className={`relative font-extrabold num-mono ${toneTx}`}>{score}</span>
    </div>
  );
}
