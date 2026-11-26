import { useUserList } from './useUserList';
import { SETUP_PRESETS } from '../utils/setupStats';

// Preset Wyckoff / price-action setups plus whatever the trader adds.
// Stored on settings/userSetups. The trade form no longer shows this list.
// `customSetups` is only the names the trader added, so the entry-trigger
// menu can still offer them without repeating the built-in presets.
export function useUserSetups() {
  const { custom, all, add, remove, loading } = useUserList(SETUP_PRESETS, 'userSetups');
  return { customSetups: custom, allSetups: all, addSetup: add, removeSetup: remove, loading };
}
