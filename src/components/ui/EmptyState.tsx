import type { ReactNode } from 'react';
import { Icon, type IconName } from '@/components/ui/Icon';

type Props = {
  icon: IconName;
  title: string;
  body?: string;
  action?: ReactNode;
};

export function EmptyState({ icon, title, body, action }: Props) {
  return (
    <div className="flex flex-col items-center rounded-3xl border border-dashed border-[var(--line)] px-6 py-10 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--line)]/60 text-[var(--muted)]">
        <Icon name={icon} />
      </span>
      <p className="mt-4 text-lg font-medium">{title}</p>
      {body ? <p className="mt-1 max-w-xs text-sm text-[var(--muted)]">{body}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
