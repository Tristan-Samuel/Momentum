import { Button } from '@/components/Button';

type Props = {
  open: boolean;
  eyebrow: string;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  eyebrow,
  title,
  body,
  confirmLabel,
  cancelLabel = 'Cancel',
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: Props) {
  if (!open) return null;

  return (
    <div
      role="alertdialog"
      aria-labelledby="confirm-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-4 sm:items-center"
    >
      <div className="w-full max-w-md rounded-3xl bg-[var(--panel)] p-6 text-[var(--fg)] shadow-2xl">
        <p className="text-xs tracking-[0.2em] text-[var(--muted)]">{eyebrow}</p>
        <h2 id="confirm-title" className="mt-3 text-3xl font-semibold tracking-tight">
          {title}
        </h2>
        <p className="mt-3 text-[var(--muted)]">{body}</p>
        <div className="mt-6 grid gap-3">
          <Button variant={danger ? 'danger' : 'primary'} disabled={busy} onClick={onConfirm}>
            {confirmLabel}
          </Button>
          <Button variant="ghost" disabled={busy} onClick={onCancel}>
            {cancelLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
