import Skeleton from '../shared/Skeleton';

export default function MentalStatsSkeleton() {
  const sectionClass = 'bg-bg-secondary border border-border-primary rounded-xl overflow-hidden';

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <Skeleton variant="circle" className="w-5 h-5" />
        <Skeleton variant="title" className="w-36 h-6" />
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-bg-secondary border border-border-primary rounded-xl p-3 text-center">
            <Skeleton variant="text" className="w-20 h-3 mx-auto mb-2" />
            <Skeleton variant="text" className="w-12 h-6 mx-auto mb-1" />
            <Skeleton variant="text" className="w-24 h-2.5 mx-auto" />
          </div>
        ))}
      </div>

      {/* Sections */}
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className={sectionClass}>
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border-primary">
              <Skeleton variant="circle" className="w-4 h-4" />
              <Skeleton variant="text" className="w-32 h-4" />
            </div>
            <div className="p-4 space-y-2">
              {[...Array(3)].map((_, j) => (
                <Skeleton key={j} variant="text" className="w-full h-8" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
