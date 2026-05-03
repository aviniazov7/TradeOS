const cardClass = 'bg-bg-secondary border border-border-primary rounded-xl p-4 md:p-5';

function getCorrelationColor(val) {
  if (val === null) return 'bg-bg-tertiary';
  if (val === 1) return 'bg-accent-primary/30';
  if (val >= 0.7) return 'bg-profit/60';
  if (val >= 0.3) return 'bg-profit/30';
  if (val >= -0.3) return 'bg-bg-tertiary';
  if (val >= -0.7) return 'bg-loss/30';
  return 'bg-loss/60';
}

export default function CorrelationHeatmap({ data }) {
  if (!data || !data.pairs || data.pairs.length < 2 || !data.matrix.length) return null;

  const { pairs, matrix } = data;

  return (
    <div className={cardClass}>
      <h3 className="text-sm font-semibold text-text-primary mb-4">מטריצת קורלציה בין זוגות</h3>

      <div className="overflow-x-auto">
        <div className="min-w-fit">
          {/* Header row */}
          <div className="flex items-center gap-0.5 mb-1 mr-20">
            {pairs.map((pair) => (
              <div key={pair} className="w-14 text-[9px] text-text-muted text-center truncate">
                {pair}
              </div>
            ))}
          </div>

          {/* Grid rows */}
          {pairs.map((rowPair, i) => (
            <div key={rowPair} className="flex items-center gap-0.5 mb-0.5">
              <span className="text-[10px] text-text-muted w-18 shrink-0 text-left truncate">{rowPair}</span>
              {matrix[i].map((val, j) => (
                <div
                  key={j}
                  className={`w-14 h-8 rounded-sm ${getCorrelationColor(val)} flex items-center justify-center cursor-default transition-colors`}
                  title={`${rowPair} / ${pairs[j]}: ${val !== null ? val.toFixed(2) : 'N/A'}`}
                >
                  <span className="text-[9px] text-text-primary/70">
                    {val !== null ? val.toFixed(2) : '–'}
                  </span>
                </div>
              ))}
            </div>
          ))}

          {/* Legend */}
          <div className="flex items-center justify-center gap-3 mt-4 text-[10px] text-text-muted">
            <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-sm bg-loss/60" /> קורלציה שלילית</div>
            <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-sm bg-bg-tertiary" /> ניטרלי</div>
            <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-sm bg-profit/60" /> קורלציה חיובית</div>
          </div>
        </div>
      </div>
    </div>
  );
}
