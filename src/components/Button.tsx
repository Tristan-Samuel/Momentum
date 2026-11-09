import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'accent' | 'ghost' | 'danger' | 'quiet';
  children: ReactNode;
};

export function Button({ variant = 'primary', className = '', children, ...props }: Props) {
  const styles = {
    primary: 'bg-[var(--fg)] text-[var(--bg)]',
    accent: 'bg-[var(--accent)] text-white',
    ghost: 'border border-[var(--line)] bg-transparent text-[var(--fg)]',
    danger: 'bg-[#8f2d2d] text-white',
    quiet: 'bg-[var(--panel)] text-[var(--fg)] border border-[var(--line)]',
  }[variant];
  return (
    <button
      type="button"
      className={`rounded-2xl px-5 py-4 text-lg leading-none transition-[transform,opacity] active:scale-[0.98] disabled:opacity-40 ${styles} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
