import { useLiveQuery } from 'dexie-react-hooks';
import { getPreparedWorkout } from '@/database/repository';

export function usePreparedWorkout(programId?: string | null) {
  return useLiveQuery(() => getPreparedWorkout(programId ?? undefined), [programId]);
}
