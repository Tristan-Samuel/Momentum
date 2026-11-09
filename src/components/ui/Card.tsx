import type { HTMLAttributes, ReactNode } from 'react';

type Props = HTMLAttributes<HTMLElement> & {
  as?: 'section' | 'div' | 'article';
  tone?: 'panel' | 'plain' | 'accent';
  children: ReactNode;
};

export function Card({ as = 'section', tone = 'panel', className = '', children, ...props }: Props) {
  const Tag = as;
  const tones = {
    panel: 'border border-[var(--line)] bg-[var(--panel)]',
    plain: 'border border-[var(--line)]',
    accent: 'border border-[var(--accent)]/40 bg-[var(--accent-soft)]',
  }[tone];
  return (
    <Tag className={`rounded-3xl p-5 ${tones} ${className}`} {...props}>
      {children}
    </Tag>
  );
}
