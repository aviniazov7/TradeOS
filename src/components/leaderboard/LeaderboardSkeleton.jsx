import Skeleton from '../shared/Skeleton';

export default function LeaderboardSkeleton() {
  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Skeleton variant="circle" className="w-6 h-6" />
          <Skeleton variant="title" className="w-28 h-6" />
        </div>
        <Skeleton variant="text" className="w-24 h-7 rounded-lg" />
      </div>

      {/* Sort buttons */}
      <div className="flex items-center gap-2 mb-5">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} variant="text" className="w-20 h-8 rounded-lg" />
        ))}
      </div>

      {/* Podium */}
      <div className="grid grid-cols-3 gap-2 md:gap-3 mb-6">
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className={`bg-bg-secondary border border-border-primary rounded-xl p-3 text-center ${
              i === 1 ? 'md:-mt-4' : 'mt-2 md:mt-4'
            }`}
          >
            <Skeleton variant="circle" className="w-10 h-10 md:w-12 md:h-12 mx-auto mb-1.5" />
            <Skeleton variant="text" className="w-8 h-5 mx-auto mb-1" />
            <Skeleton variant="text" className="w-16 h-3 mx-auto mb-1" />
            <Skeleton variant="text" className="w-10 h-6 mx-auto" />
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-bg-secondary border border-border-primary rounded-xl overflow-hidden">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-border-primary last:border-0">
            <Skeleton variant="text" className="w-6 h-4" />
            <Skeleton variant="circle" className="w-6 h-6" />
            <Skeleton variant="text" className="w-24 h-4" />
            <div className="flex-1" />
            <Skeleton variant="text" className="w-12 h-4" />
            <Skeleton variant="text" className="w-12 h-4" />
          </div>
        ))}
      </div>
    </div>
  );
}
