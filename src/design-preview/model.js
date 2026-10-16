import { useMemo, useState } from 'react';
import { account, greeting, kpis, summarize, todayLabel } from './data';

export function useHomeModel() {
  const [period, setPeriod] = useState('all');
  const [hidden, setHidden] = useState(false);
  const acct = useMemo(() => account(), []);
  const kpi = useMemo(() => kpis(), []);
  const model = useMemo(() => summarize(period), [period]);
  const mask = (v) => (hidden ? '••••' : v);
  return {
    period,
    setPeriod,
    hidden,
    toggleHidden: () => setHidden((v) => !v),
    acct,
    kpi,
    model,
    mask,
    hello: greeting(),
    dateLabel: todayLabel(),
  };
}
