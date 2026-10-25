import { lazy, Suspense, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { m } from 'framer-motion';
import { Briefcase, Plus, Download } from 'lucide-react';
import { headerIconBtn, headerPrimaryBtn } from '../shared/headerStyles';
import PageHeader from '../shared/PageHeader';
import LoadingSpinner from '../shared/LoadingSpinner';
import { pageVariants, pageTransition } from '../../utils/animations';
import TabPanel from '../shared/TabPanel';

// Each tab body keeps its own chunk, so opening the DCA tab doesn't pull the
// wallets page (and vice versa).
const DCATracker = lazy(() => import('../dca/DCATracker'));
const WalletsPage = lazy(() => import('../wallets/WalletsPage'));

// The holdings screen's views. The tab lives in the URL (?tab=wallets) so
// links, the old /dca and /wallets paths and the back button land on the
// right view. Tab order is fixed — switching views must not reshuffle it.
const PORTFOLIO_TABS = [
  { id: 'dca', label: 'תוכניות DCA', mobileLabel: 'DCA' },
  { id: 'dca-stats', label: 'ביצועי DCA', mobileLabel: 'ביצועים' },
  { id: 'wallets', label: 'ארנקים' },
];

const SCREEN_TITLE = 'החזקות';

function patchParams(setSearchParams, mutate) {
  setSearchParams((prev) => {
    const next = new URLSearchParams(prev);
    mutate(next);
    return next;
  }, { replace: true });
}

// Both action groups stay mounted in one grid cell. The cell is as wide as
// the wider group, so the tab strip beside it does not slide when the
// Wallets tab swaps "תוכנית DCA חדשה" for "הוסף ארנק".
function HeaderActions({ tab, onExport, onNewDca, onAddWallet }) {
  const wallets = tab === 'wallets';
  const layer = (active) => (
    active
      ? 'relative z-10'
      : 'invisible pointer-events-none'
  );
  return (
    <div data-testid="portfolio-header-actions" className="grid w-full sm:w-max max-w-full">
      <div
        inert={wallets ? true : undefined}
        aria-hidden={wallets || undefined}
        className={`col-start-1 row-start-1 flex items-center gap-2 w-full ${layer(!wallets)}`}
      >
        <button type="button" onClick={onExport} className={headerIconBtn} title="ייצוא CSV" aria-label="ייצוא CSV">
          <Download className="w-[18px] h-[18px]" />
        </button>
        <button type="button" onClick={onNewDca} className={`${headerPrimaryBtn} flex-1 sm:flex-none`}>
          <Plus className="w-4 h-4" /> תוכנית DCA חדשה
        </button>
      </div>
      <div
        inert={!wallets ? true : undefined}
        aria-hidden={!wallets || undefined}
        className={`col-start-1 row-start-1 flex items-center gap-2 w-full ${layer(wallets)}`}
      >
        <button type="button" onClick={onAddWallet} className={`${headerPrimaryBtn} flex-1 sm:flex-none`}>
          <Plus className="w-4 h-4" /> הוסף ארנק
        </button>
      </div>
    </div>
  );
}

export default function PortfolioPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const tab = PORTFOLIO_TABS.some((t) => t.id === tabParam) ? tabParam : 'dca';
  const setTab = (id) => patchParams(setSearchParams, (next) => {
    if (id === 'dca') next.delete('tab'); else next.set('tab', id);
    // Drop the other view's one-shot flags so a hidden form does not reopen
    // when the user comes back to that tab.
    if (id === 'wallets') {
      next.delete('new');
      next.delete('export');
    } else {
      next.delete('add');
    }
  });
  // One-shot flags the DCA view acts on (open the form / download the CSV).
  const flag = (name) => patchParams(setSearchParams, (next) => {
    next.delete('add');
    if (name === 'new') next.delete('tab');
    next.set(name, '1');
  });
  const openAddWallet = () => patchParams(setSearchParams, (next) => {
    next.set('tab', 'wallets');
    next.delete('new');
    next.delete('export');
    next.set('add', '1');
  });

  useEffect(() => {
    const prev = document.title;
    document.title = `${SCREEN_TITLE} · TradeOS`;
    return () => { document.title = prev; };
  }, []);

  return (
    <m.div variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={pageTransition}>
      <PageHeader
        icon={Briefcase}
        title={SCREEN_TITLE}
        subtitle="ההחזקות שלך לטווח ארוך — ארנקים ותוכניות DCA"
        tabs={{ tabs: PORTFOLIO_TABS, value: tab, onChange: setTab, layoutKey: 'portfolio-tab' }}
        actions={(
          <HeaderActions
            tab={tab}
            onExport={() => flag('export')}
            onNewDca={() => flag('new')}
            onAddWallet={openAddWallet}
          />
        )}
      />
      <TabPanel tabKey={tab}>
        <Suspense fallback={<LoadingSpinner />}>
          {tab === 'wallets'
            ? <WalletsPage key="wallets" embedded />
            : <DCATracker key="dca" embedded view={tab === 'dca-stats' ? 'summary' : 'plans'} />}
        </Suspense>
      </TabPanel>
    </m.div>
  );
}
