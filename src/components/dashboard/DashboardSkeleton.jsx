import Skeleton from '../shared/Skeleton';

// Matches the signed-in home: greeting, the glance row, then the chart
// beside the agent card. Shown only while trades are still loading.
export default function DashboardSkeleton() {
  return (
    <div>
      <Skeleton variant="title" className="mb-2 w-40 h-8" />
      <Skeleton variant="text" className="mb-6 w-28 h-3" />

      <div className="h-28 rounded-2xl bg-bg-secondary border border-border-primary mb-4" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <div className="lg:col-span-2 h-52 rounded-2xl bg-bg-secondary border border-border-primary animate-pulse" />
        <div className="h-52 rounded-2xl bg-bg-secondary border border-border-primary animate-pulse" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 h-40 rounded-2xl bg-bg-secondary border border-border-primary animate-pulse" />
        <div className="h-40 rounded-2xl bg-bg-secondary border border-border-primary animate-pulse" />
      </div>
    </div>
  );
}
