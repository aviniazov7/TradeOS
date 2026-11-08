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
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(16rem,3fr)_minmax(0,7fr)]">
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((item) => (
            <div key={item} className="rounded-lg border border-border-primary p-3">
              <Skeleton variant="text" className="w-32 h-4" />
              <Skeleton variant="text" className="w-full h-3 mt-2" />
            </div>
          ))}
        </div>
        <div className="hidden lg:block rounded-xl border border-border-primary p-6">
          <Skeleton variant="title" className="w-48 h-8" />
          <Skeleton variant="text" className="w-full h-4 mt-6" />
          <Skeleton variant="text" className="w-4/5 h-4 mt-2" />
        </div>
      </div>
    </div>
  );
}
