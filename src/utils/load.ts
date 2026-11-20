import type { LoadKind, LoadPer, LoadSpec, LoadUnit } from '@/types';

const LB_PER_KG = 2.2046226218;

export function defaultLoadStep(unit: LoadUnit): number {
  return unit === 'kg' ? 2.5 : 5;
}

export function defaultLoad(unit: LoadUnit = 'lb'): LoadSpec {
  return {
    cueMode: 'tempo',
    loadKind: 'bodyweight',
    load: null,
    loadUnit: unit,
    loadStep: defaultLoadStep(unit),
    loadPer: 'total',
  };
}

export function roundLoad(value: number, unit: LoadUnit): number {
  const step = 2.5;
  const rounded = Math.round(value / step) * step;
  const result = rounded <= 0 && value > 0 ? (unit === 'kg' ? 1.25 : 2.5) : rounded;
  return Number(result.toFixed(2));
}

export function shiftLoad(load: number, delta: number): number {
  return Number((load + delta).toFixed(2));
}

/** Convert a stored pound value into the unit a new exercise should use. */
export function convertLoad(value: number, from: LoadUnit, to: LoadUnit): number {
  if (from === to) return roundLoad(value, to);
  const asLb = from === 'lb' ? value : value * LB_PER_KG;
  const raw = to === 'lb' ? asLb : asLb / LB_PER_KG;
  return roundLoad(raw, to);
}

/** Convert a pound load step. 5 lb becomes 2.5 kg. */
export function convertLoadStep(stepLb: number, unit: LoadUnit): number {
  if (unit === 'lb') return stepLb;
  const kg = stepLb / LB_PER_KG;
  const rounded = Math.round(kg / 1.25) * 1.25;
  return Number(Math.max(1.25, rounded).toFixed(2));
}

export function formatLoad(spec: Pick<LoadSpec, 'loadKind' | 'load' | 'loadUnit' | 'loadPer'>): string {
  if (spec.loadKind === 'bodyweight' || spec.load == null) return 'Bodyweight';
  const amount = Number(spec.load.toFixed(2));
  const text = Number.isInteger(amount) ? String(amount) : String(amount);
  const per = spec.loadPer === 'side' ? ' / side' : '';
  if (spec.loadKind === 'added') return `+${text} ${spec.loadUnit}${per}`;
  return `${text} ${spec.loadUnit}${per}`;
}

type LoadSource = Partial<LoadSpec> & { resistanceLabel?: string };

/** Fill load fields from what is stored, or from an older resistance label. */
export function resolveLoad(source: LoadSource | null | undefined, unit: LoadUnit = 'lb'): LoadSpec {
  const fromLabel = loadFromLabel(source?.resistanceLabel ?? '', unit);
  const loadUnit = source?.loadUnit === 'kg' || source?.loadUnit === 'lb' ? source.loadUnit : fromLabel.loadUnit;
  const loadKind = isLoadKind(source?.loadKind) ? source.loadKind : fromLabel.loadKind;
  const load = source != null && source.load !== undefined ? source.load : fromLabel.load;
  const loadStep = source?.loadStep != null && source.loadStep > 0 ? source.loadStep : defaultLoadStep(loadUnit);
  const loadPer: LoadPer = source?.loadPer === 'side' || source?.loadPer === 'total' ? source.loadPer : fromLabel.loadPer;
  const cueMode = source?.cueMode === 'open' ? 'open' : 'tempo';
  return {
    cueMode,
    loadKind,
    load: loadKind === 'bodyweight' ? null : load,
    loadUnit,
    loadStep,
    loadPer,
  };
}

export function loadFromLabel(label: string, unit: LoadUnit = 'lb'): LoadSpec {
  const base = defaultLoad(unit);
  const trimmed = label.trim();
  const perSide = /\/\s*side/i.test(trimmed);
  const withUnit = trimmed.match(/([+-]?\d+(?:\.\d+)?)\s*(lb|lbs|kg)\b/i);
  const plusOnly = withUnit ? null : trimmed.match(/^\+\s*(\d+(?:\.\d+)?)\b/);
  const matched = withUnit?.[1] ?? plusOnly?.[1];
  if (!matched) {
    return { ...base, loadPer: perSide ? 'side' : 'total' };
  }
  const parsedUnit: LoadUnit = withUnit && /^kg$/i.test(withUnit[2]) ? 'kg' : 'lb';
  const value = Math.abs(Number(matched));
  if (!Number.isFinite(value) || value <= 0) return base;
  const added = matched.startsWith('+') || /^\s*\+/.test(trimmed) || /bodyweight/i.test(trimmed);
  return {
    cueMode: 'tempo',
    loadKind: added ? 'added' : 'external',
    load: value,
    loadUnit: parsedUnit,
    loadStep: defaultLoadStep(parsedUnit),
    loadPer: perSide ? 'side' : 'total',
  };
}

export function hasNumericLoad(source: LoadSource | null | undefined): boolean {
  const spec = resolveLoad(source);
  return (spec.loadKind === 'added' || spec.loadKind === 'external') && spec.load != null && spec.load > 0;
}

export function labelForLoad(spec: LoadSpec, resistanceLabel?: string): string {
  if (spec.loadKind === 'bodyweight') {
    const label = resistanceLabel?.trim();
    if (label && !/\d/.test(label)) return label;
    return 'Bodyweight';
  }
  return formatLoad(spec);
}

function isLoadKind(value: unknown): value is LoadKind {
  return value === 'bodyweight' || value === 'added' || value === 'external';
}
