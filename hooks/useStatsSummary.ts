import { useMemo } from 'react';

import { useMomentumStore } from '../store/useMomentumStore';
import { buildStatsSummary } from '../utils/stats';

export function useStatsSummary() {
  const entries = useMomentumStore((state) => state.entries);
  const programStartDate = useMomentumStore((state) => state.programStartDate);

  return useMemo(() => buildStatsSummary(entries, programStartDate), [entries, programStartDate]);
}
