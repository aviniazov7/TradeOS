import Skeleton from '../shared/Skeleton';

export default function BacktestSkeleton() {
  const cardClass = 'bg-bg-secondary border border-border-primary rounded-xl p-4';

  return (
    <div>
      {/* Top nav bar */}
      <div className="bg-bg-secondary border border-border-primary rounded-xl mb-4 px-3 md:px-4 py-2.5 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <Skeleton variant="text" className="w-28 h-8 rounded-lg" />
            <div className="hidden md:flex items-center gap-1">
              <Skeleton variant="text" className="w-24 h-7 rounded-lg" />
              <Skeleton variant="text" className="w-16 h-7 rounded-lg" />
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Skeleton variant="text" className="w-8 h-8 rounded-lg" />
            <Skeleton variant="text" className="w-8 h-8 rounded-lg" />
            <Skeleton variant="text" className="w-24 h-8 rounded-lg" />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className={`${cardClass} overflow-hidden`}>
        <div className="flex gap-4 pb-2.5 mb-2 border-b border-border-primary">
          {[...Array(8)].map((_, i) => (
            <Skeleton key={i} variant="text" className="w-14 h-3" />
          ))}
        </div>
        {[...Array(6)].map((_, i) => (
          <div key={i} className="flex gap-4 py-2.5 border-b border-border-primary/50">
            {[...Array(8)].map((_, j) => (
              <Skeleton key={j} variant="text" className="w-14 h-4" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
