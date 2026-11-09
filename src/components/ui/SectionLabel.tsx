import type { ReactNode } from 'react';

type Props = {
  children: ReactNode;
  className?: string;
  as?: 'p' | 'h2' | 'h3';
  action?: ReactNode;
};

export function SectionLabel({ children, className = '', as = 'p', action }: Props) {
  const Tag = as;
  const label = (
    <Tag className="text-xs font-medium tracking-[0.22em] text-[var(--muted)] uppercase">
      {children}
    </Tag>
  );
  if (!action) return <div className={className}>{label}</div>;
  return (
    <div className={`flex items-center justify-between gap-3 ${className}`}>
      {label}
      {action}
    </div>
  );
}
