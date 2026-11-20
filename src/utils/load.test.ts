import { describe, expect, it } from 'vitest';
import { convertLoad, convertLoadStep, formatLoad, loadFromLabel, resolveLoad, shiftLoad } from '@/utils/load';

describe('load formatting', () => {
  it('formats bodyweight, added load, external load, and per-side load', () => {
    expect(formatLoad({ loadKind: 'bodyweight', load: null, loadUnit: 'lb', loadPer: 'total' })).toBe('Bodyweight');
    expect(formatLoad({ loadKind: 'added', load: 25, loadUnit: 'lb', loadPer: 'total' })).toBe('+25 lb');
    expect(formatLoad({ loadKind: 'external', load: 135, loadUnit: 'lb', loadPer: 'total' })).toBe('135 lb');
    expect(formatLoad({ loadKind: 'external', load: 30, loadUnit: 'lb', loadPer: 'side' })).toBe('30 lb / side');
  });

  it('reads an older +5 lb label as added load', () => {
    expect(loadFromLabel('+5 lb')).toMatchObject({
      loadKind: 'added',
      load: 5,
      loadUnit: 'lb',
      loadStep: 5,
      cueMode: 'tempo',
    });
  });

  it('reads a bar weight and a per-side label', () => {
    expect(loadFromLabel('135 lb')).toMatchObject({ loadKind: 'external', load: 135, loadUnit: 'lb' });
    expect(loadFromLabel('20 kg / side')).toMatchObject({
      loadKind: 'external',
      load: 20,
      loadUnit: 'kg',
      loadStep: 2.5,
      loadPer: 'side',
    });
  });

  it('leaves a bodyweight label without a number', () => {
    expect(loadFromLabel('Bodyweight')).toMatchObject({ loadKind: 'bodyweight', load: null });
  });

  it('keeps stored fields ahead of the label', () => {
    const resolved = resolveLoad({
      resistanceLabel: 'Bodyweight',
      loadKind: 'external',
      load: 60,
      loadUnit: 'kg',
      loadStep: 2.5,
      cueMode: 'open',
    });
    expect(resolved).toMatchObject({ loadKind: 'external', load: 60, cueMode: 'open', loadUnit: 'kg' });
  });

  it('converts library pounds into kilograms', () => {
    expect(convertLoad(45, 'lb', 'kg')).toBe(20);
    expect(convertLoad(10, 'lb', 'kg')).toBe(5);
    expect(convertLoad(20, 'kg', 'lb')).toBe(45);
    expect(convertLoadStep(5, 'kg')).toBe(2.5);
    expect(convertLoadStep(2.5, 'kg')).toBe(1.25);
  });

  it('adds a step without floating-point drift', () => {
    expect(shiftLoad(20, 2.5)).toBe(22.5);
    expect(shiftLoad(22.5, -2.5)).toBe(20);
  });
});
