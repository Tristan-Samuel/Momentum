import { useLiveQuery } from 'dexie-react-hooks';
import { getPreparedWorkout } from '@/database/repository';

export function usePreparedWorkout(programId?: string | null) {
  return useLiveQuery(
    () => (programId === null ? Promise.resolve(null) : getPreparedWorkout(programId ?? undefined)),
    [programId],
  );
}
