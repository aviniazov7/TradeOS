import { useUserList } from './useUserList';
import { TRADE_TAGS } from '../utils/constants';

// Thin wrapper over the shared list factory — see useUserList (issue #216).
export function useUserTags() {
  const { all, add, remove, loading } = useUserList(TRADE_TAGS, 'userTags');
  return { allTags: all, addTag: add, removeTag: remove, loading };
}
