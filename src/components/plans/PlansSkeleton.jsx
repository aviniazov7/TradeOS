import Skeleton from '../shared/Skeleton';

export default function PlansSkeleton() {
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

      <Skeleton variant="text" className="w-32 h-4" />

      <div className="mt-2 border-t border-border-primary">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="border-b border-border-primary py-6 md:py-7">
            <Skeleton variant="text" className="w-48 max-w-full h-6" />
            <Skeleton variant="text" className="w-full max-w-xl h-4 mt-3" />
            <Skeleton variant="text" className="w-64 max-w-full h-3 mt-3" />
          </div>
        ))}
      </div>
    </div>
  );
}
