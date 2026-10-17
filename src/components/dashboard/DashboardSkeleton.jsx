import Skeleton from '../shared/Skeleton';

// Matches the signed-in home: greeting, portfolio hero beside the agent
// card, then the KPI row. Shown only while trades are still loading.
export default function DashboardSkeleton() {
  return (
    <div>
      <Skeleton variant="title" className="mb-2 w-40 h-8" />
      <Skeleton variant="text" className="mb-6 w-28 h-3" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <div className="lg:col-span-2 h-52 rounded-2xl bg-bg-secondary border border-border-primary animate-pulse" />
        <div className="h-52 rounded-2xl bg-bg-secondary border border-border-primary animate-pulse" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-2xl bg-bg-secondary border border-border-primary p-4">
            <Skeleton variant="text" className="w-16 h-3 mb-3" />
            <Skeleton variant="text" className="w-24 h-6" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 h-40 rounded-2xl bg-bg-secondary border border-border-primary animate-pulse" />
        <div className="h-40 rounded-2xl bg-bg-secondary border border-border-primary animate-pulse" />
      </div>
    </div>
  );
}
