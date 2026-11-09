type Option<T extends string> = { value: T; label: string };

type Props<T extends string> = {
  label: string;
  value: T;
  options: Array<Option<T>>;
  onChange: (value: T) => void;
};

export function Segmented<T extends string>({ label, value, options, onChange }: Props<T>) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-2xl bg-[var(--line)]/60 p-1">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={`flex-1 rounded-xl px-2 py-2.5 text-sm transition-colors ${
              active
                ? 'bg-[var(--panel)] font-medium text-[var(--fg)] shadow-sm'
                : 'text-[var(--muted)]'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
