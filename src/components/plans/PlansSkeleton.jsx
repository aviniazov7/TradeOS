import Skeleton from '../shared/Skeleton';

export default function PlansSkeleton() {
  const cardClass = 'bg-bg-secondary border border-border-primary rounded-xl p-5';

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <Skeleton variant="title" className="w-32 h-8" />
        <Skeleton variant="text" className="w-28 h-10 rounded-lg" />
      </div>

      {/* Plan cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className={cardClass}>
            <div className="flex items-center justify-between mb-3">
              <Skeleton variant="text" className="w-24 h-5" />
              <Skeleton variant="text" className="w-16 h-5 rounded-full" />
            </div>
            <Skeleton variant="text" className="w-full h-3 mb-2" />
            <Skeleton variant="text" className="w-3/4 h-3 mb-4" />
            <div className="flex items-center gap-2">
              <Skeleton variant="text" className="w-16 h-6 rounded-md" />
              <Skeleton variant="text" className="w-16 h-6 rounded-md" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
