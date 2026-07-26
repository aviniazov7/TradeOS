import { useUserList } from './useUserList';
import { MISTAKES } from '../utils/constants';

// Thin wrapper over the shared list factory — see useUserList (issue #216).
export function useUserMistakes() {
  const { all, add, remove, loading } = useUserList(MISTAKES, 'userMistakes');
  return { allMistakes: all, addMistake: add, removeMistake: remove, loading };
}
