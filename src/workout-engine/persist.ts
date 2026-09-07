import { applyCompletedSessionProgression } from '@/progression/apply';
import * as repo from '@/database/repository';
import type { EngineEvent } from '@/workout-engine/events';

export async function persistEngineEvents(events: EngineEvent[]): Promise<void> {
  for (const event of events) {
    switch (event.type) {
      case 'snapshot': {
        const snapshot = JSON.parse(event.json) as { sessionId: string };
        await repo.saveEngineSnapshot(snapshot.sessionId, event.json);
        break;
      }
      case 'exercise_session':
        await repo.db.exerciseSessions.put(event.record);
        break;
      case 'set_session':
        await repo.saveSetSession(event.record);
        break;
      case 'exercise_rated':
        await repo.rateExerciseSession(event.exerciseSessionId, {
          difficultyRating: event.difficultyRating,
          rir: event.rir,
          formQuality: event.formQuality,
        });
        break;
      case 'exercise_complete':
        await repo.completeExerciseSession(event.exerciseSessionId);
        break;
      case 'workout_finished':
        await repo.finalizeWorkoutSession({
          sessionId: event.sessionId,
          status: event.status,
          durationMs: event.durationMs,
        });
        await applyCompletedSessionProgression(event.sessionId);
        break;
      default:
        break;
    }
  }
}
