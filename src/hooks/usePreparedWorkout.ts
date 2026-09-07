import { useLiveQuery } from 'dexie-react-hooks';
import { getPreparedWorkout } from '@/database/repository';

export function usePreparedWorkout() {
  return useLiveQuery(() => getPreparedWorkout(), []);
}
