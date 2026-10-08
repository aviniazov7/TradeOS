import { lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Briefcase } from 'lucide-react';
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
  { id: 'dca', label: 'מעקב DCA', mobileLabel: 'DCA' },
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

  return (
    <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={pageTransition}>
      <PageHeader
        icon={Briefcase}
        title="תיק"
        subtitle="השקעות לטווח ארוך — קניות DCA וארנקים על השרשרת"
        tabs={{ tabs: PORTFOLIO_TABS, value: tab, onChange: setTab, layoutKey: 'portfolio-tab' }}
      />
      <Suspense fallback={<LoadingSpinner />}>
        {tab === 'wallets' ? <WalletsPage key="wallets" embedded /> : <DCATracker key="dca" embedded />}
      </Suspense>
    </motion.div>
  );
}
