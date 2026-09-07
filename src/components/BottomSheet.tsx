import type { ReactNode } from 'react';

type Props = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
};

export function BottomSheet({ open, title, onClose, children }: Props) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center">
      <button
        type="button"
        aria-label="Close controls"
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-label={title}
        className="relative w-full max-w-xl rounded-t-3xl bg-[var(--panel)] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-[var(--fg)]"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm tracking-[0.22em] text-[var(--muted)]">{title}</h2>
          <button type="button" className="text-sm text-[var(--muted)]" onClick={onClose}>
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
