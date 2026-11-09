import type { Laterality, Side, Tempo, TempoPhase, UnilateralOrder } from '@/types';
import { activePhases, tempoSeconds } from '@/utils/tempo';

export type RepSlot = {
  side?: Side;
  repOnSide: number;
  sideTarget: number;
  globalIndex: number;
};

export function buildRepPlan(input: {
  laterality: Laterality;
  unilateralOrder: UnilateralOrder;
  target: number;
}): RepSlot[] {
  const target = Math.max(0, input.target);
  if (input.laterality === 'bilateral') {
    return Array.from({ length: target }, (_, i) => ({
      repOnSide: i + 1,
      sideTarget: target,
      globalIndex: i,
    }));
  }

  const first: Side =
    input.unilateralOrder === 'left-then-right' ? 'left' : 'right';
  const second: Side = first === 'right' ? 'left' : 'right';

  if (input.unilateralOrder === 'alternating') {
    const slots: RepSlot[] = [];
    for (let i = 0; i < target; i++) {
      slots.push({
        side: first,
        repOnSide: i + 1,
        sideTarget: target,
        globalIndex: slots.length,
      });
      slots.push({
        side: second,
        repOnSide: i + 1,
        sideTarget: target,
        globalIndex: slots.length,
      });
    }
    return slots;
  }

  return [
    ...Array.from({ length: target }, (_, i) => ({
      side: first,
      repOnSide: i + 1,
      sideTarget: target,
      globalIndex: i,
    })),
    ...Array.from({ length: target }, (_, i) => ({
      side: second,
      repOnSide: i + 1,
      sideTarget: target,
      globalIndex: target + i,
    })),
  ];
}

export type CueKind =
  | 'countdown'
  | 'start'
  | 'tick'
  | 'phase_beep'
  | 'set_complete'
  | 'warning'
  | 'rest_countdown';

export type ScheduledCue = {
  at: number;
  kind: CueKind;
  count?: number;
  rep?: number;
  phase?: TempoPhase;
  side?: Side;
};

export const SET_START_DELAY = 0.2;

export function buildSetCues(
  tempo: Tempo,
  plan: RepSlot[],
  startAt: number,
): { cues: ScheduledCue[]; duration: number } {
  const cues: ScheduledCue[] = [];
  let t = startAt;
  const phases = activePhases(tempo);

  for (const slot of plan) {
    for (const phase of phases) {
      for (let second = 0; second < phase.duration; second++) {
        const at = t + second;
        const isBoundaryOverlap = second === 0 && cues.some(
          (cue) => cue.at === at && cue.kind === 'phase_beep',
        );
        if (!isBoundaryOverlap) {
          cues.push({
            at,
            kind: 'tick',
            rep: slot.repOnSide,
            phase: phase.name,
            side: slot.side,
          });
        }
      }
      t += phase.duration;
      cues.push({
        at: t,
        kind: 'phase_beep',
        rep: slot.repOnSide,
        phase: phase.name,
        side: slot.side,
      });
    }
  }

  cues.push({ at: t, kind: 'set_complete' });
  return { cues, duration: t - startAt };
}

export function buildCountdownCues(startAt: number): {
  cues: ScheduledCue[];
  duration: number;
} {
  return {
    duration: 3,
    cues: [
      { at: startAt, kind: 'countdown', count: 3 },
      { at: startAt + 1, kind: 'countdown', count: 2 },
      { at: startAt + 2, kind: 'countdown', count: 1 },
      { at: startAt + 3, kind: 'start' },
    ],
  };
}

export function buildRestCues(startAt: number, duration: number): ScheduledCue[] {
  const cues: ScheduledCue[] = [];
  const end = startAt + duration;
  if (duration >= 5) {
    cues.push({ at: end - 5, kind: 'warning' });
  }
  if (duration >= 3) cues.push({ at: end - 3, kind: 'rest_countdown', count: 3 });
  if (duration >= 2) cues.push({ at: end - 2, kind: 'rest_countdown', count: 2 });
  if (duration >= 1) cues.push({ at: end - 1, kind: 'rest_countdown', count: 1 });
  cues.push({ at: end, kind: 'start' });
  return cues;
}

export const HOLD_SWITCH_SECONDS = 3;

export function holdSides(laterality: Laterality, order: UnilateralOrder): Array<Side | undefined> {
  if (laterality === 'bilateral') return [undefined];
  const first: Side = order === 'left-then-right' ? 'left' : 'right';
  return [first, first === 'right' ? 'left' : 'right'];
}

export function holdDurationSeconds(target: number, sides: Array<Side | undefined>): number {
  const count = sides.length;
  return count * Math.max(0, target) + Math.max(0, count - 1) * HOLD_SWITCH_SECONDS;
}

export type HoldProgress = {
  sideIndex: number;
  side: Side | undefined;
  secondsIntoSide: number;
  switching: boolean;
  switchRemaining: number;
  complete: boolean;
};

export function holdProgressAt(
  elapsedSeconds: number,
  target: number,
  sides: Array<Side | undefined>,
): HoldProgress {
  const total = holdDurationSeconds(target, sides);
  if (sides.length === 0 || target <= 0 || elapsedSeconds >= total) {
    return {
      sideIndex: Math.max(0, sides.length - 1),
      side: sides[sides.length - 1],
      secondsIntoSide: Math.max(0, target),
      switching: false,
      switchRemaining: 0,
      complete: true,
    };
  }
  const per = target + HOLD_SWITCH_SECONDS;
  const elapsed = Math.max(0, elapsedSeconds);
  const sideIndex = Math.min(sides.length - 1, Math.floor(elapsed / per));
  const within = elapsed - sideIndex * per;
  if (within < target) {
    return {
      sideIndex,
      side: sides[sideIndex],
      secondsIntoSide: within,
      switching: false,
      switchRemaining: 0,
      complete: false,
    };
  }
  return {
    sideIndex: sideIndex + 1,
    side: sides[sideIndex + 1],
    secondsIntoSide: 0,
    switching: true,
    switchRemaining: per - within,
    complete: false,
  };
}

export function buildHoldCues(
  target: number,
  sides: Array<Side | undefined>,
  startAt: number,
): ScheduledCue[] {
  const cues: ScheduledCue[] = [];
  let t = startAt;
  sides.forEach((side, index) => {
    for (let second = 1; second < target; second++) {
      const left = target - second;
      cues.push(
        left <= 3
          ? { at: t + second, kind: 'rest_countdown', count: left, side }
          : { at: t + second, kind: 'tick', side },
      );
    }
    const end = t + target;
    if (index === sides.length - 1) {
      cues.push({ at: end, kind: 'set_complete' });
      return;
    }
    cues.push({ at: end, kind: 'phase_beep', side });
    cues.push({ at: end + 1, kind: 'countdown', count: 2 });
    cues.push({ at: end + 2, kind: 'countdown', count: 1 });
    cues.push({ at: end + HOLD_SWITCH_SECONDS, kind: 'start', side: sides[index + 1] });
    t = end + HOLD_SWITCH_SECONDS;
  });
  return cues;
}

export function setDurationSeconds(tempo: Tempo, plan: RepSlot[]): number {
  return plan.length * tempoSeconds(tempo);
}

export function progressAt(
  elapsedSeconds: number,
  tempo: Tempo,
  plan: RepSlot[],
): {
  slotIndex: number;
  slot: RepSlot | null;
  secondsIntoRep: number;
  complete: boolean;
} {
  const perRep = tempoSeconds(tempo);
  if (plan.length === 0 || perRep <= 0) {
    return { slotIndex: 0, slot: null, secondsIntoRep: 0, complete: true };
  }
  const duration = plan.length * perRep;
  if (elapsedSeconds >= duration) {
    const last = plan[plan.length - 1];
    return {
      slotIndex: plan.length - 1,
      slot: last,
      secondsIntoRep: perRep,
      complete: true,
    };
  }
  const slotIndex = Math.min(plan.length - 1, Math.floor(elapsedSeconds / perRep));
  return {
    slotIndex,
    slot: plan[slotIndex],
    secondsIntoRep: elapsedSeconds - slotIndex * perRep,
    complete: false,
  };
}
