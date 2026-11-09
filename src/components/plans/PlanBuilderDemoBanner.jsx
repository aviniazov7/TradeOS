import { PLAN_BUILDER_DEMO_BANNER } from '../../utils/planBuilderDemo';

export default function PlanBuilderDemoBanner() {
  return (
    <div
      data-testid="plan-builder-demo-banner"
      className="fixed inset-x-0 top-0 z-[70] border-b border-amber-500/40 bg-amber-500/15 px-3 py-2 text-center text-sm font-bold text-amber-200"
    >
      {PLAN_BUILDER_DEMO_BANNER}
    </div>
  );
}
