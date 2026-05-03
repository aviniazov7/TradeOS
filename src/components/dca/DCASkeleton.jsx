import Skeleton from '../shared/Skeleton';

export default function DCASkeleton() {
  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <Skeleton variant="title" className="w-28 h-8" />
        <Skeleton variant="text" className="w-28 h-9 rounded-lg" />
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 md:gap-3 mb-5">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-bg-secondary border border-border-primary rounded-xl p-3 md:p-4">
            <Skeleton variant="text" className="w-16 h-3 mb-2" />
            <Skeleton variant="text" className="w-20 h-5" />
          </div>
        ))}
      </div>

      {/* DCA cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="bg-bg-secondary border border-border-primary rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Skeleton variant="text" className="w-12 h-5" />
                <Skeleton variant="text" className="w-16 h-3" />
              </div>
              <Skeleton variant="text" className="w-14 h-5 rounded" />
            </div>
            <div className="grid grid-cols-2 gap-3 mb-4">
              {[...Array(4)].map((_, j) => (
                <div key={j}>
                  <Skeleton variant="text" className="w-16 h-3 mb-1" />
                  <Skeleton variant="text" className="w-20 h-4" />
                </div>
              ))}
            </div>
            <Skeleton variant="text" className="w-full h-3 mb-4" />
            <div className="pt-3 border-t border-border-primary flex justify-between">
              <Skeleton variant="text" className="w-20 h-4" />
              <div className="flex gap-1">
                <Skeleton variant="circle" className="w-7 h-7" />
                <Skeleton variant="circle" className="w-7 h-7" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
