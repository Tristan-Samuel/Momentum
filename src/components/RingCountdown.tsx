import { useEffect, useRef } from 'react';
import { formatClock } from '@/utils/time';

type Props = {
  remaining: number;
  total: number;
  running?: boolean;
  label: string;
  format?: 'clock' | 'seconds';
  color?: string;
  approaching?: boolean;
  caption?: string;
};

const RADIUS = 88;
const CIRC = 2 * Math.PI * RADIUS;

function liveRemaining(remaining: number, total: number, running: boolean, at: number): number {
  const elapsed = running ? (performance.now() - at) / 1000 : 0;
  return Math.max(0, Math.min(total > 0 ? total : remaining, remaining - elapsed));
}

function formatRemaining(left: number, format: 'clock' | 'seconds'): string {
  if (format === 'seconds') return String(Math.max(0, Math.ceil(left)));
  return formatClock(left);
}

/**
 * The arc is painted on a timer. A CSS transition on stroke-dashoffset stays
 * frozen on iOS while the value keeps changing, and only jumps after a refocus.
 */
export function RingCountdown({
  remaining,
  total,
  running = true,
  label,
  format = 'clock',
  color,
  approaching,
  caption,
}: Props) {
  const circleRef = useRef<SVGCircleElement>(null);
  const numberRef = useRef<HTMLParagraphElement>(null);
  const live = useRef({ remaining, total, running, format, at: performance.now() });
  if (
    live.current.remaining !== remaining ||
    live.current.total !== total ||
    live.current.running !== running ||
    live.current.format !== format
  ) {
    live.current = { remaining, total, running, format, at: performance.now() };
  }

  useEffect(() => {
    const paint = () => {
      const snap = live.current;
      const left = liveRemaining(snap.remaining, snap.total, snap.running, snap.at);
      const span = snap.total > 0 ? snap.total : 1;
      const progress = Math.min(1, Math.max(0, 1 - left / span));
      circleRef.current?.setAttribute('stroke-dashoffset', String(CIRC * (1 - progress)));
      if (numberRef.current) numberRef.current.textContent = formatRemaining(left, snap.format);
    };
    paint();
    const timer = window.setInterval(paint, 50);
    return () => window.clearInterval(timer);
  }, []);

  const initialLeft = Math.max(0, remaining);
  const initialProgress = Math.min(1, Math.max(0, 1 - initialLeft / (total > 0 ? total : 1)));
  const stroke = approaching ? 'var(--warn)' : color ?? 'var(--rest)';

  return (
    <div className="flex flex-col items-center">
      <div
        className={`relative h-64 w-64 ${approaching ? 'animate-pulse-soft' : ''}`}
        role="timer"
        aria-label={`${label} ${formatRemaining(initialLeft, format)}`}
      >
        <svg viewBox="0 0 200 200" className="h-full w-full -rotate-90">
          <circle cx="100" cy="100" r={RADIUS} fill="none" stroke="var(--line)" strokeWidth="10" />
          <circle
            ref={circleRef}
            cx="100"
            cy="100"
            r={RADIUS}
            fill="none"
            stroke={stroke}
            strokeWidth="10"
            strokeDasharray={CIRC}
            strokeDashoffset={CIRC * (1 - initialProgress)}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center px-8 text-center">
          <p className="text-xs tracking-[0.25em] text-[var(--muted)]">{label}</p>
          <p ref={numberRef} className="mt-1 text-6xl font-semibold tabular-nums">
            {formatRemaining(initialLeft, format)}
          </p>
          {caption ? <p className="mt-1 text-sm text-[var(--muted)]">{caption}</p> : null}
        </div>
      </div>
    </div>
  );
}
