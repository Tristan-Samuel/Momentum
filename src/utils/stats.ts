export function parseResistanceWeight(label: string): number | null {
  const match = label.match(/([+-]?\d+(?:\.\d+)?)\s*(lb|lbs|kg)?/i);
  if (!match) return null;
  if (/bodyweight/i.test(label) && !match) return 0;
  const value = Number(match[1]);
  if (Number.isNaN(value)) return null;
  return value;
}

export function isWeightedLabel(label: string): boolean {
  return parseResistanceWeight(label) !== null && !/^bodyweight$/i.test(label.trim());
}

export function linearTrend(values: number[]): number | null {
  if (values.length < 2) return null;
  const n = values.length;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumXX += i * i;
  }
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return 0;
  return (n * sumXY - sumX * sumY) / denom;
}
