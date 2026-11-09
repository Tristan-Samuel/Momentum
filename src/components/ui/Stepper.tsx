type Props = {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
};

export function Stepper({ label, value, onChange, min = 0, max = 999, step = 1, suffix }: Props) {
  const clamp = (next: number) => Math.min(max, Math.max(min, next));
  return (
    <div className="text-sm text-[var(--muted)]">
      <p>{label}</p>
      <div className="mt-1 flex items-stretch overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--panel)]">
        <button
          type="button"
          aria-label={`Decrease ${label}`}
          disabled={value <= min}
          onClick={() => onChange(clamp(value - step))}
          className="w-11 shrink-0 text-xl text-[var(--fg)] disabled:opacity-30"
        >
          −
        </button>
        <label className="flex min-w-0 flex-1 items-baseline justify-center gap-1 py-2.5">
          <span className="sr-only">{label}</span>
          <input
            type="number"
            inputMode="numeric"
            className="w-full min-w-0 bg-transparent text-center text-lg text-[var(--fg)] tabular-nums outline-none"
            value={value}
            min={min}
            max={max}
            onChange={(event) => {
              const next = Number(event.target.value);
              if (Number.isFinite(next)) onChange(clamp(next));
            }}
          />
          {suffix ? <span className="text-xs">{suffix}</span> : null}
        </label>
        <button
          type="button"
          aria-label={`Increase ${label}`}
          disabled={value >= max}
          onClick={() => onChange(clamp(value + step))}
          className="w-11 shrink-0 text-xl text-[var(--fg)] disabled:opacity-30"
        >
          +
        </button>
      </div>
    </div>
  );
}
