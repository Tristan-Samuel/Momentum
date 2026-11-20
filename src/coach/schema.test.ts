import { describe, expect, it } from 'vitest';
import { parseCoachReply } from '@/coach/schema';

describe('parseCoachReply', () => {
  it('clamps a drafted program and drops junk', () => {
    const reply = parseCoachReply({
      summary: '  A short pull day.  ',
      program: {
        name: 'Pull',
        exercises: [
          {
            name: 'Pull-Up',
            sets: 40,
            minReps: 6,
            maxReps: 3,
            measure: 'reps',
            restAfterSetSeconds: 5000,
            transitionAfterExerciseSeconds: 45,
          },
          { name: '' },
        ],
      },
      edit: { exerciseConfigId: '' },
      recommendations: [{ note: 'Add a rep.', targets: [8, 9] }, { note: '' }],
    });
    expect(reply.summary).toBe('A short pull day.');
    expect(reply.program?.exercises).toHaveLength(1);
    expect(reply.program?.exercises[0]).toMatchObject({
      name: 'Pull-Up',
      sets: 10,
      minReps: 3,
      maxReps: 6,
      startPosition: 'bottom',
      restAfterSetSeconds: 900,
      transitionAfterExerciseSeconds: 45,
    });
    expect(reply.edit).toBeNull();
    expect(reply.recommendations).toHaveLength(1);
    expect(reply.recommendations[0].targets).toEqual([8, 9]);
  });
});