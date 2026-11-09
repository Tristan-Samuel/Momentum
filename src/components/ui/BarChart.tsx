type Bar = { label: string; value: number; highlight?: boolean };

type Props = {
  bars: Bar[];
  ariaLabel: string;
  height?: number;
};

export function BarChart({ bars, ariaLabel, height = 140 }: Props) {
  if (bars.length === 0) {
    return <p className="text-[var(--muted)]">No data yet.</p>;
  }
  const width = 320;
  const labelSpace = 18;
  const max = Math.max(1, ...bars.map((bar) => bar.value));
  const slot = width / bars.length;
  const barWidth = Math.max(4, slot * 0.62);
  const plot = height - labelSpace;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label={ariaLabel}>
      {bars.map((bar, index) => {
        const h = bar.value === 0 ? 2 : Math.max(3, (bar.value / max) * (plot - 14));
        const x = index * slot + (slot - barWidth) / 2;
        return (
          <g key={`${bar.label}-${index}`}>
            <rect
              x={x}
              y={plot - h}
              width={barWidth}
              height={h}
              rx={Math.min(5, barWidth / 2)}
              fill={bar.highlight ? 'var(--accent)' : bar.value === 0 ? 'var(--line)' : 'var(--fg)'}
              opacity={bar.highlight || bar.value === 0 ? 1 : 0.78}
            >
              <title>{`${bar.label}: ${bar.value}`}</title>
            </rect>
            {index % Math.ceil(bars.length / 6) === 0 || index === bars.length - 1 ? (
              <text
                x={index * slot + slot / 2}
                y={height - 4}
                textAnchor="middle"
                fontSize="9"
                fill="var(--muted)"
              >
                {bar.label}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}
