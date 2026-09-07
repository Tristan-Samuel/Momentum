import { useLiveQuery } from 'dexie-react-hooks';
import { getIncompleteSession } from '@/database/repository';

export function useIncompleteSession() {
  return useLiveQuery(() => getIncompleteSession(), []);
}
