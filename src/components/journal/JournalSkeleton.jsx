import Skeleton from '../shared/Skeleton';

export default function JournalSkeleton() {
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
              <Skeleton variant="text" className="w-20 h-7 rounded-lg" />
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
      <div className="bg-bg-secondary border border-border-primary rounded-xl overflow-hidden">
        {/* Table header */}
        <div className="px-4 py-3 border-b border-border-primary flex gap-6">
          {[...Array(7)].map((_, i) => (
            <Skeleton key={i} variant="text" className="w-14 h-3 flex-shrink-0" />
          ))}
        </div>
        {/* Table rows */}
        {[...Array(6)].map((_, i) => (
          <div key={i} className="px-4 py-3 border-b border-border-primary/50 flex gap-6 items-center">
            <Skeleton variant="text" className="w-16 h-4" />
            <Skeleton variant="text" className="w-20 h-4" />
            <Skeleton variant="text" className="w-12 h-5 rounded" />
            <Skeleton variant="text" className="w-16 h-4" />
            <Skeleton variant="text" className="w-16 h-4" />
            <Skeleton variant="text" className="w-14 h-4" />
            <Skeleton variant="text" className="w-12 h-5 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
