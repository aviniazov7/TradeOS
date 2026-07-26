import { useUserList } from './useUserList';
import { TRIGGERS } from '../utils/constants';

// Thin wrapper over the shared list factory — see useUserList (issue #216).
// Manages the user's entry-trigger list for the backtest tracker.
export function useUserTriggers() {
  const { custom, all, add, remove, loading } = useUserList(TRIGGERS, 'backtestTriggers');
  return { customTriggers: custom, allTriggers: all, addTrigger: add, removeTrigger: remove, loading };
}
