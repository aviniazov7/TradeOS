import Skeleton from '../shared/Skeleton';

export default function DashboardSkeleton() {
  const cardClass = 'bg-bg-secondary border border-border-primary rounded-xl p-5';

  return (
    <div>
      <Skeleton variant="title" className="mb-6 w-20 h-8" />

      {/* 4 stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[...Array(4)].map((_, i) => (
          <div key={i} className={cardClass}>
            <div className="flex items-center gap-2 mb-2">
              <Skeleton variant="circle" className="w-4 h-4" />
              <Skeleton variant="text" className="w-20 h-3" />
            </div>
            <Skeleton variant="text" className="w-24 h-6" />
          </div>
        ))}
      </div>

      {/* Journals overview */}
      <div className={`${cardClass} mb-6`}>
        <div className="flex items-center justify-between mb-4">
          <Skeleton variant="text" className="w-32 h-4" />
          <Skeleton variant="text" className="w-16 h-3" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="bg-bg-tertiary border border-border-primary rounded-lg p-3">
              <Skeleton variant="text" className="w-20 h-4 mb-2" />
              <Skeleton variant="text" className="w-28 h-5 mb-1" />
              <Skeleton variant="text" className="w-full h-3" />
            </div>
          ))}
        </div>
      </div>

      {/* 3 quick stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {[...Array(3)].map((_, i) => (
          <div key={i} className={cardClass}>
            <div className="flex items-center gap-2 mb-3">
              <Skeleton variant="circle" className="w-4 h-4" />
              <Skeleton variant="text" className="w-16 h-4" />
            </div>
            <Skeleton variant="text" className="w-12 h-7 mb-1" />
            <Skeleton variant="text" className="w-20 h-3" />
          </div>
        ))}
      </div>
    </div>
  );
}
