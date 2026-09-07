export function createId(): string {
  return crypto.randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function midpointTarget(minReps: number, maxReps: number): number {
  return Math.floor((minReps + maxReps) / 2);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
