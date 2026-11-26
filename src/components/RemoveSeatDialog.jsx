import { useEffect, useRef } from 'react';
import { timeRange } from '../lib/format.js';
import { Button } from './ui.jsx';
import { Icon } from './Icon.jsx';

/** Asks before a seat is given back. Copies ConflictDialog: backdrop button, Escape, focus. */
export function RemoveSeatDialog({ session, onConfirm, onCancel, busy }) {
  const ref = useRef(null);
  const cancelRef = useRef(onCancel);
  cancelRef.current = busy ? () => {} : onCancel;

  useEffect(() => {
    if (!session) return;
    const opener = document.activeElement;
    ref.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') cancelRef.current(); };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, [session]);

  if (!session) return null;

  return (
    <div
      className="fixed inset-0 z-[70] grid place-items-end sm:place-items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="remove-seat-title"
      data-testid="agenda-remove-dialog"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onCancel}
        disabled={busy}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
      />
      <div
        ref={ref}
        tabIndex={-1}
        className="glass relative max-h-[85dvh] w-full max-w-md animate-rise overflow-y-auto rounded-t-2xl border border-hairline p-6 shadow-2xl shadow-black/70 focus:outline-none sm:rounded-2xl"
      >
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-rose-500/15 text-rose-300">
            <Icon name="alert" className="size-5" />
          </span>
          <div>
            <h2 id="remove-seat-title" className="font-display text-xl leading-tight">Give up your seat?</h2>
            <p className="mt-1 text-[13px] text-muted">
              “{session.title}” · {timeRange(session.startsAt, session.endsAt)}. Someone on the waitlist may take it.
            </p>
          </div>
        </div>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onCancel} disabled={busy} data-testid="agenda-remove-cancel">
            Keep my seat
          </Button>
          <Button
            onClick={onConfirm}
            disabled={busy}
            data-testid="agenda-remove-confirm"
            className="border border-rose-400/40 bg-rose-500/15 text-rose-200 hover:bg-rose-500/25"
          >
            {busy ? 'Removing…' : 'Remove from my agenda'}
          </Button>
        </div>
      </div>
    </div>
  );
}
