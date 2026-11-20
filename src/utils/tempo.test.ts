import { describe, expect, it } from 'vitest';
import { activePhases, formatTempo, inferStartPosition, phaseAt, tempoSeconds } from '@/utils/tempo';
import { midpointTarget } from '@/utils/id';

describe('tempo', () => {
  const tempo = { eccentric: 3, bottomPause: 0, concentric: 1, topPause: 0 };

  it('sums all four phases', () => {
    expect(tempoSeconds(tempo)).toBe(4);
    expect(tempoSeconds({ eccentric: 3, bottomPause: 1, concentric: 1, topPause: 0 })).toBe(5);
  });

  it('skips zero-length phases', () => {
    expect(activePhases(tempo).map((phase) => phase.name)).toEqual(['eccentric', 'concentric']);
  });

  it('formats compact tempo', () => {
    expect(formatTempo(tempo)).toBe('3-0-1-0');
  });

  it('locates the current phase', () => {
    expect(phaseAt(tempo, 0).phase).toBe('eccentric');
    expect(phaseAt(tempo, 2.9).phase).toBe('eccentric');
    expect(phaseAt(tempo, 3).phase).toBe('concentric');
  });

  it('starts at the bottom with the lift', () => {
    expect(activePhases(tempo, 'bottom').map((phase) => phase.name)).toEqual([
      'concentric',
      'eccentric',
    ]);
    expect(phaseAt(tempo, 0, 'bottom').phase).toBe('concentric');
    expect(phaseAt(tempo, 1, 'bottom').phase).toBe('eccentric');
    expect(inferStartPosition('Pull-Up')).toBe('bottom');
    expect(inferStartPosition('L-Sit Chin-Up')).toBe('bottom');
    expect(inferStartPosition('Weighted / Difficult Push-Up')).toBe('top');
  });

  it('seeds midpoint targets', () => {
    expect(midpointTarget(6, 10)).toBe(8);
    expect(midpointTarget(6, 12)).toBe(9);
    expect(midpointTarget(5, 8)).toBe(6);
  });
});
