import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import PlanSummary from './PlanSummary';
import PlanDetail from './PlanDetail';
import { filterPlans, resolveSelection } from './planFields';

const FOCUS = 'outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary';
const FILTERS = [
  { id: 'all', label: 'הכל' },
  { id: 'active', label: 'פעילות' },
  { id: 'inactive', label: 'לא פעילות' },
];

function useDesktop() {
  const query = '(min-width: 1024px)';
  const [desktop, setDesktop] = useState(() => (
    typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : true
  ));
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const media = window.matchMedia(query);
    const onChange = () => setDesktop(media.matches);
    onChange();
    media.addEventListener?.('change', onChange);
    return () => media.removeEventListener?.('change', onChange);
  }, []);
  return desktop;
}

export default function PlanWorkspace({ plans, onEdit, onDelete }) {
  const desktop = useDesktop();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [selectedId, setSelectedId] = useState(null);
  const [section, setSection] = useState({ planId: null, id: 'overview' });
  const [mobileDetail, setMobileDetail] = useState(false);
  const filtered = filterPlans(plans, query, status);
  const current = resolveSelection(filtered, selectedId);
  const sectionId = section.planId === current?.id ? section.id : 'overview';
  const showList = desktop || !mobileDetail;
  const showDetail = desktop || mobileDetail;

  useEffect(() => {
    if (!mobileDetail || desktop) return undefined;
    const onKey = (event) => {
      if (event.key !== 'Escape') return;
      if (document.querySelector('[role="dialog"]')) return;
      event.preventDefault();
      setMobileDetail(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [desktop, mobileDetail]);

  const selectPlan = (plan, openDetail) => {
    setSelectedId(plan.id);
    if (openDetail) setMobileDetail(true);
  };

  const onListKey = (event) => {
    const buttons = [...event.currentTarget.querySelectorAll('[data-plan-id]')];
    const index = buttons.indexOf(document.activeElement);
    if (index < 0) return;
    let next = index;
    if (event.key === 'ArrowDown') next = Math.min(buttons.length - 1, index + 1);
    else if (event.key === 'ArrowUp') next = Math.max(0, index - 1);
    else return;
    event.preventDefault();
    const plan = filtered.find((item) => item.id === buttons[next].dataset.planId);
    if (!plan) return;
    selectPlan(plan, false);
    buttons[next].focus();
  };

  return (
    <div data-testid="plans-workspace" dir="rtl">
      {showList && (
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <label className="relative min-w-0 sm:w-64">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" aria-hidden />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="חיפוש תוכנית"
              aria-label="חיפוש תוכנית"
              autoComplete="off"
              className={`h-10 w-full rounded-lg border border-border-primary bg-bg-secondary ps-9 pe-3 text-sm text-text-primary ${FOCUS}`}
            />
          </label>
          <div role="radiogroup" aria-label="סינון לפי סטטוס" className="flex flex-wrap gap-1">
            {FILTERS.map((filter) => {
              const pressed = status === filter.id;
              return (
                <button
                  key={filter.id}
                  type="button"
                  role="radio"
                  aria-checked={pressed}
                  data-filter={filter.id}
                  onClick={() => setStatus(filter.id)}
                  className={`h-10 cursor-pointer rounded-lg border px-3 text-sm font-medium ${pressed ? 'border-border-hover bg-bg-tertiary text-text-primary' : 'border-transparent text-text-secondary hover:bg-bg-tertiary'} ${FOCUS}`}
                >
                  {filter.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 items-start gap-3 lg:h-[calc(100dvh-16.5rem)] lg:min-h-[32rem] lg:grid-cols-[minmax(16rem,3fr)_minmax(0,7fr)] lg:items-stretch">
        <aside
          data-testid="plans-list"
          aria-label="תוכניות"
          onKeyDown={onListKey}
          className={`lg:overflow-y-auto ${showList ? '' : 'hidden'}`}
        >
          {filtered.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-text-secondary">אין תוכניות תואמות</p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {filtered.map((plan) => (
                <PlanSummary
                  key={plan.id}
                  plan={plan}
                  selected={current?.id === plan.id}
                  onSelect={(item) => selectPlan(item, true)}
                />
              ))}
            </ul>
          )}
        </aside>

        <section
          data-testid="plan-detail"
          data-open={showDetail ? 'true' : 'false'}
          aria-labelledby={current ? 'plan-detail-title' : undefined}
          className={`rounded-xl border border-border-primary bg-bg-secondary p-4 md:p-6 lg:overflow-y-auto ${showDetail ? '' : 'hidden'}`}
        >
          {current ? (
            <PlanDetail
              plan={current}
              sectionId={sectionId}
              onSection={(id) => setSection({ planId: current.id, id })}
              onEdit={onEdit}
              onDelete={onDelete}
              showBack={!desktop}
              onBack={() => setMobileDetail(false)}
            />
          ) : (
            <p className="py-16 text-center text-sm text-text-secondary">אין תוכניות תואמות</p>
          )}
        </section>
      </div>
    </div>
  );
}
