type Props = {
  value: number;
  max: number;
  label: string;
};

export function ProgressBar({ value, max, label }: Props) {
  const pct = max === 0 ? 0 : Math.min(100, (value / max) * 100);
  return (
    <div aria-label={label} className="w-full">
      <div className="h-2 overflow-hidden rounded-full bg-[var(--line)]">
        <div
          className="h-full rounded-full bg-[var(--fg)]"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
