import { useMemo } from 'react';
import { computeMentalStats } from '../utils/mentalStats';

// Thin memo wrapper. The cross-referencing itself lives in utils/mentalStats so
// the AI coach can reuse it outside React (see utils/coachPsychology).
export function useMentalStats(trades, morningEntries, eveningEntries, routineItems) {
  return useMemo(
    () => computeMentalStats(trades, morningEntries, eveningEntries, routineItems),
    [trades, morningEntries, eveningEntries, routineItems],
  );
}
