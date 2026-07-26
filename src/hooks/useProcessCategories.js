import { useUserList } from './useUserList';

const PROCESS_CATEGORY_PRESETS = ['דוגמת כניסה', 'ניהול עסקה', 'ניתוח שוק', 'Setup', 'יציאה', 'אסטרטגיה'];

// Thin wrapper over the shared list factory — see useUserList (issue #216).
export function useProcessCategories() {
  const { all, add, remove, loading } = useUserList(PROCESS_CATEGORY_PRESETS, 'processCategories');
  return { allCategories: all, addCategory: add, removeCategory: remove, loading };
}
