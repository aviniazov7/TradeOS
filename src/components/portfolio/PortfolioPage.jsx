import { lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Briefcase, Plus, Download } from 'lucide-react';
import { headerIconBtn, headerPrimaryBtn } from '../shared/headerStyles';
import PageHeader from '../shared/PageHeader';
import LoadingSpinner from '../shared/LoadingSpinner';
import { pageVariants, pageTransition } from '../../utils/animations';

// Each tab body keeps its own chunk, so opening the DCA tab doesn't pull the
// wallets page (and vice versa).
const DCATracker = lazy(() => import('../dca/DCATracker'));
const WalletsPage = lazy(() => import('../wallets/WalletsPage'));

// The portfolio's views. The tab lives in the URL (?tab=wallets) so links,
// the old /dca and /wallets paths and the back button land on the right view.
const PORTFOLIO_TABS = [
  { id: 'dca', label: 'תוכניות DCA', mobileLabel: 'DCA' },
  { id: 'dca-stats', label: 'ביצועי DCA', mobileLabel: 'ביצועים' },
  { id: 'wallets', label: 'ארנקים' },
];

export default function PortfolioPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const tab = PORTFOLIO_TABS.some((t) => t.id === tabParam) ? tabParam : 'dca';
  const setTab = (id) => setSearchParams((prev) => {
    const next = new URLSearchParams(prev);
    if (id === 'dca') next.delete('tab'); else next.set('tab', id);
    return next;
  }, { replace: true });
  // One-shot flags the DCA view acts on (open the form / download the CSV).
  const flag = (name) => setSearchParams((prev) => {
    const next = new URLSearchParams(prev);
    next.set(name, '1');
    return next;
  }, { replace: true });

  return (
    <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={pageTransition}>
      <PageHeader
        icon={Briefcase}
        title="תיק"
        subtitle="השקעות לטווח ארוך — קניות DCA וארנקים על השרשרת"
        tabs={{ tabs: PORTFOLIO_TABS, value: tab, onChange: setTab, layoutKey: 'portfolio-tab' }}
        actions={tab === 'wallets' ? null : (
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button onClick={() => flag('export')} className={headerIconBtn} title="ייצוא CSV" aria-label="ייצוא CSV">
              <Download className="w-[18px] h-[18px]" />
            </button>
            <button onClick={() => setSearchParams((prev) => {
              const next = new URLSearchParams(prev);
              next.delete('tab');
              next.set('new', '1');
              return next;
            }, { replace: true })} className={`${headerPrimaryBtn} flex-1 sm:flex-none`}>
              <Plus className="w-4 h-4" /> תוכנית DCA חדשה
            </button>
          </div>
        )}
      />
      <Suspense fallback={<LoadingSpinner />}>
        {tab === 'wallets'
          ? <WalletsPage key="wallets" embedded />
          : <DCATracker key="dca" embedded view={tab === 'dca-stats' ? 'summary' : 'plans'} />}
      </Suspense>
    </motion.div>
  );
}
