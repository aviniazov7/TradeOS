import { Compass } from 'lucide-react';
import Modal from '../shared/Modal';
import StrategyTab from './StrategyTab';

// Strategies are part of the personal workspace — defined once, run on demand —
// so they open from the hero rather than occupying a browsing tab.
export default function StrategyModal({ isOpen, onClose, smartCountByMarket, smartLoading }) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} ariaLabel="האסטרטגיות שלי" maxWidth="max-w-3xl"
      title={(
        <span className="inline-flex items-center gap-2">
          <Compass className="w-4 h-4 text-accent-primary" />
          <span className="font-bold text-text-primary">האסטרטגיות שלי</span>
        </span>
      )}>
      <StrategyTab smartCountByMarket={smartCountByMarket} smartLoading={smartLoading} />
    </Modal>
  );
}
