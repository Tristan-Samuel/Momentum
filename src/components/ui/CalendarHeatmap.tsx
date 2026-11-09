export type HeatmapDay = { date: string; count: number; future?: boolean };

type Props = {
  weeks: HeatmapDay[][];
  ariaLabel: string;
};

const DAY_LABELS = ['M', '', 'W', '', 'F', '', 'S'];

export function CalendarHeatmap({ weeks, ariaLabel }: Props) {
  return (
    <div role="img" aria-label={ariaLabel} className="flex gap-1.5">
      <div className="flex flex-col gap-1.5 pr-1">
        {DAY_LABELS.map((label, index) => (
          <span key={index} className="flex h-4 items-center text-[9px] leading-none text-[var(--muted)]">
            {label}
          </span>
        ))}
      </div>
      {weeks.map((week, weekIndex) => (
        <div key={weekIndex} className="flex flex-1 flex-col gap-1.5">
          {week.map((day) => (
            <span
              key={day.date}
              title={`${day.date}: ${day.count} workout${day.count === 1 ? '' : 's'}`}
              className={`block h-4 rounded-[5px] ${
                day.future
                  ? 'bg-transparent'
                  : day.count === 0
                    ? 'bg-[var(--line)]/70'
                    : day.count === 1
                      ? 'bg-[var(--accent)]/75'
                      : 'bg-[var(--accent)]'
              }`}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
