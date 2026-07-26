import { useMemo } from 'react';
import { useUserList } from './useUserList';
import { TIMEFRAMES } from '../utils/constants';

// Minutes for a timeframe token ('15m', '4H', '1D', '1W', '1M') so the list
// sorts chronologically rather than lexically.
function toMinutes(tf) {
  const num = parseFloat(tf);
  if (tf.endsWith('m')) return num;
  if (tf.endsWith('H') || tf.endsWith('h')) return num * 60;
  if (tf.endsWith('D') || tf.endsWith('d')) return num * 1440;
  if (tf.endsWith('W') || tf.endsWith('w')) return num * 10080;
  if (tf.endsWith('M')) return num * 43200;
  return Infinity;
}

// Thin wrapper over the shared list factory — see useUserList (issue #216).
// Unlike the others, the combined list is sorted by duration.
export function useUserTimeframes() {
  const { all, add, remove, loading } = useUserList(TIMEFRAMES, 'userTimeframes');
  const allTimeframes = useMemo(
    () => [...all].sort((a, b) => toMinutes(a) - toMinutes(b)),
    [all]
  );
  return { allTimeframes, addTimeframe: add, removeTimeframe: remove, loading };
}
