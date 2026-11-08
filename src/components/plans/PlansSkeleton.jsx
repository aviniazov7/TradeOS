import Skeleton from '../shared/Skeleton';

export default function PlansSkeleton() {
  const cardClass = 'bg-bg-secondary border border-border-primary rounded-2xl p-4 md:p-5 flex flex-col gap-3';

  return (
    <div>
      <div className="bg-bg-secondary border border-border-primary rounded-xl p-4 md:p-6 mb-4 md:mb-6">
        <div className="flex items-center gap-3">
          <Skeleton variant="text" className="w-11 h-11 rounded-xl shrink-0" />
          <div className="flex-1">
            <Skeleton variant="title" className="w-40 h-7" />
            <Skeleton variant="text" className="w-56 max-w-full h-4 mt-2" />
          </div>
          <Skeleton variant="text" className="w-28 h-11 rounded-xl" />
        </div>
      </div>

      <Skeleton variant="text" className="w-32 h-4 mb-3 md:mb-4" />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 md:gap-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className={cardClass}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5 flex-1">
                <Skeleton variant="circle" className="w-2.5 h-2.5" />
                <Skeleton variant="text" className="w-32 h-5" />
              </div>
              <Skeleton variant="text" className="w-16 h-6 rounded-full" />
            </div>
            <Skeleton variant="text" className="w-full h-3" />
            <Skeleton variant="text" className="w-4/5 h-3" />
            <Skeleton variant="text" className="w-full h-10 rounded-xl" />
            <div className="flex items-center gap-2">
              <Skeleton variant="text" className="w-16 h-4" />
              <Skeleton variant="text" className="w-12 h-5 rounded-md" />
            </div>
            <div className="flex items-center justify-between pt-3 border-t border-border-primary">
              <Skeleton variant="text" className="w-24 h-4" />
              <div className="flex gap-1">
                <Skeleton variant="text" className="w-10 h-10 rounded-lg" />
                <Skeleton variant="text" className="w-10 h-10 rounded-lg" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
