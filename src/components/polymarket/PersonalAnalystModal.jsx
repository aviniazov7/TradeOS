import { UserRoundSearch } from 'lucide-react';
import Modal from '../shared/Modal';
import PersonalAnalyst from './PersonalAnalyst';

// The personal analyst is a "run it and read it" flow, not a browsing surface —
// so it lives behind a hero icon instead of eating a tab.
export default function PersonalAnalystModal({ isOpen, onClose, smartCountByMarket }) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="max-w-2xl"
      title={(
        <span className="inline-flex items-center gap-2">
          <UserRoundSearch className="w-4 h-4 text-accent-primary" />
          <span className="font-bold text-text-primary">האנליסט הפרטי שלי</span>
        </span>
      )}>
      <PersonalAnalyst smartCountByMarket={smartCountByMarket} embedded />
    </Modal>
  );
}
