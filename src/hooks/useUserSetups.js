import { useUserList } from './useUserList';
import { SETUP_PRESETS } from '../utils/setupStats';

// Preset Wyckoff / price-action setups plus whatever the trader adds.
// Stored on settings/userSetups, same shape as the other custom lists.
export function useUserSetups() {
  const { all, add, remove, loading } = useUserList(SETUP_PRESETS, 'userSetups');
  return { allSetups: all, addSetup: add, removeSetup: remove, loading };
}
