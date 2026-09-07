type Props = {
  progress: number;
  label: string;
  remainingLabel: string;
  approaching?: boolean;
};

export function RingCountdown({ progress, label, remainingLabel, approaching }: Props) {
  const clamped = Math.min(1, Math.max(0, progress));
  const radius = 88;
  const circ = 2 * Math.PI * radius;
  const offset = circ * (1 - clamped);
  const color = approaching ? 'var(--warn)' : 'var(--rest)';
  return (
    <div className="relative mx-auto h-56 w-56" role="timer" aria-label={`${label} ${remainingLabel}`}>
      <svg viewBox="0 0 200 200" className="h-full w-full -rotate-90">
        <circle cx="100" cy="100" r={radius} fill="none" stroke="var(--line)" strokeWidth="10" />
        <circle
          cx="100"
          cy="100"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <p className="text-xs tracking-[0.25em] text-[var(--muted)]">{label}</p>
        <p className="mt-1 text-5xl font-semibold tabular-nums">{remainingLabel}</p>
      </div>
    </div>
  );
}
