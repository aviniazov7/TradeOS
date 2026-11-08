import { useBacktestContext } from '../../contexts/BacktestContext';
import BacktestSwitcherView from './BacktestSwitcherView';

// Account-scoped journal list. The view is separate so a layout fixture can
// render the control without opening Firebase or touching a signed-in session.
export default function BacktestSwitcher(props) {
  const ctx = useBacktestContext();
  return <BacktestSwitcherView {...ctx} {...props} />;
}
