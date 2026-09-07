type Point = { x: number; y: number; label?: string };

type Props = {
  points: Point[];
  ariaLabel: string;
};

export function LineChart({ points, ariaLabel }: Props) {
  if (points.length === 0) {
    return <p className="text-[var(--muted)]">No data yet.</p>;
  }
  const width = 320;
  const height = 160;
  const pad = 16;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys, 0);
  const maxY = Math.max(...ys, 1);
  const sx = (x: number) =>
    pad + ((x - minX) / Math.max(1, maxX - minX)) * (width - pad * 2);
  const sy = (y: number) =>
    height - pad - ((y - minY) / Math.max(1, maxY - minY)) * (height - pad * 2);
  const d = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${sx(p.x)} ${sy(p.y)}`)
    .join(' ');
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label={ariaLabel}>
      <path d={d} fill="none" stroke="var(--fg)" strokeWidth="2.5" />
      {points.map((p) => (
        <circle key={`${p.x}-${p.y}`} cx={sx(p.x)} cy={sy(p.y)} r="3.5" fill="var(--fg)" />
      ))}
    </svg>
  );
}
