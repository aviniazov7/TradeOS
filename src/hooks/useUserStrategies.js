import { useUserList } from './useUserList';
import { STRATEGIES } from '../utils/constants';

// Thin wrapper over the shared list factory — see useUserList (issue #216).
// The doc id depends on context so the journal and backtest strategy lists
// stay separate.
/**
 * @param {'journal' | 'backtest'} context
 */
export function useUserStrategies(context = 'journal') {
  const docId = context === 'backtest' ? 'backtestStrategies' : 'journalStrategies';
  const { custom, all, add, remove, loading } = useUserList(STRATEGIES, docId);
  return { customStrategies: custom, allStrategies: all, addStrategy: add, removeStrategy: remove, loading };
}
