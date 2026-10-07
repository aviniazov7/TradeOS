import TabStrip from '../shared/TabStrip';

const LABELS = {
  trades: 'עסקאות',
  analytics: 'ניתוחים',
  calendar: 'יומן חודשי',
  exchange: 'חיבור בורסאות',
};
// Narrow screens: shorter label so all four fit without scrolling on most phones.
const MOBILE_LABELS = { ...LABELS, exchange: 'בורסאות' };

// The journal's tabs — the shared TabStrip with the journal's labels.
export default function JournalTabs({ tabs, value, onChange, tradesCount, variant = 'desktop' }) {
  return (
    <TabStrip
      tabs={tabs.map((id) => ({ id, label: LABELS[id], mobileLabel: MOBILE_LABELS[id], count: id === 'trades' ? tradesCount : 0 }))}
      value={value}
      onChange={onChange}
      variant={variant}
      layoutKey="journal-tab"
    />
  );
}
