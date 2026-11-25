import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { accent, accentHex } from '../lib/accents.js';
import { timeRange } from '../lib/format.js';
import { hasEnded, toMinutes } from '../lib/clock.js';
import { useConference } from '../lib/store.jsx';
import { Avatar, Button, cx } from './ui.jsx';
import { Icon } from './Icon.jsx';

/** Same pattern as ConflictDialog: a real dialog, because the choice stays open until made. */
function ConfirmRemove({ session, busy, onCancel, onConfirm }) {
  const ref = useRef(null);
  const cancelRef = useRef(onCancel);
  cancelRef.current = busy ? () => {} : onCancel;

  useEffect(() => {
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
  }, []);

  return (
    <div className="fixed inset-0 z-[70] grid place-items-end sm:place-items-center"
      role="dialog" aria-modal="true" aria-labelledby="agenda-confirm-title" data-testid="agenda-confirm">
      <button type="button" aria-label="Close" onClick={onCancel} disabled={busy}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div ref={ref} tabIndex={-1}
        className="glass relative w-full max-w-md animate-rise rounded-t-2xl border border-hairline p-6 shadow-2xl shadow-black/70 focus:outline-none sm:rounded-2xl">
        <h2 id="agenda-confirm-title" className="font-display text-xl leading-tight">Remove this session?</h2>
        <p className="mt-2 text-[13px] text-muted">
          <span className="font-semibold text-ink">{session.title}</span> ({timeRange(session.startsAt, session.endsAt)})
          — your seat goes back to the room.
        </p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onCancel} disabled={busy} data-testid="agenda-confirm-cancel">Keep my seat</Button>
          <Button variant="primary" onClick={onConfirm} disabled={busy} data-testid="agenda-confirm-ok">
            {busy ? 'Removing…' : 'Remove'}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * One booked session. The whole card opens the session (a full-cover link);
 * portraits and Remove sit above it as their own targets, never nested in it.
 */
export function AgendaCard({ session, index = 0 }) {
  const { clock, releaseSeat } = useConference();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const track = session.track;
  const a = accent(track.color);
  const [railColor] = accentHex(track.color);
  const done = hasEnded(session, clock);
  const live = !done && clock.day === session.day
    && toMinutes(clock.time) >= toMinutes(session.startsAt);
  const lead = session.speakers[0];

  const remove = async () => {
    setBusy(true);
    await releaseSeat(session.id, session);
    setBusy(false);
    setConfirming(false);
  };

  return (
    <li className="animate-rise" style={{ animationDelay: `${index * 70}ms` }}>
      <div
        data-testid="agenda-card"
        data-session-id={session.id}
        className={cx(
          'agenda-card group relative flex min-h-[10.5rem] gap-5 overflow-hidden rounded-xl border border-hairline bg-surface py-5 pl-6 pr-5',
          'transition-all duration-300 ease-out hover:border-white/25 hover:bg-raised hover:shadow-2xl hover:shadow-black/50',
        )}
      >
        <Link to={`/sessions/${session.id}`} aria-label={session.title} className="absolute inset-0 z-0 rounded-xl focus-visible:outline-2 focus-visible:outline-violet-400" />

        <span
          data-testid="agenda-rail"
          data-accent={track.color}
          aria-hidden="true"
          className="agenda-rail absolute inset-y-0 left-0 w-1 transition-[width] duration-300 group-hover:w-1.5"
          style={{ background: railColor, animationDelay: `${index * 70 + 150}ms` }}
        />
        <span aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style={{ background: `linear-gradient(90deg, ${railColor}22, transparent 40%)` }} />

        <div className="relative z-10 flex shrink-0 flex-col gap-3">
          {session.speakers.map((sp) => (
            <Link key={sp.id} to={`/speakers/${sp.id}`} data-testid="agenda-speaker" aria-label={sp.name}
              className="rounded-full transition-transform duration-300 hover:scale-105 focus-visible:outline-2 focus-visible:outline-violet-400">
              <Avatar name={sp.name} initials={sp.initials} accent={sp.accent} imageUrl={sp.imageUrl} size="xl" />
            </Link>
          ))}
        </div>

        <div className="pointer-events-none relative z-10 flex min-w-0 flex-1 flex-col">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint">
            {timeRange(session.startsAt, session.endsAt)}
            <span className="mx-1.5">·</span>
            <span className={a.text}>{track.name}</span>
            {(done || live) && <><span className="mx-1.5">·</span>{done ? 'Finished' : 'Live now'}</>}
          </p>
          <h3 className="mt-1.5 font-display text-xl font-medium leading-snug">{session.title}</h3>
          <p className="mt-1.5 text-sm text-muted">{session.speakers.map((s) => s.name).join(', ')}</p>
          {lead && (
            <p className="text-xs text-faint">{[lead.jobTitle, lead.company].filter(Boolean).join(' · ')}</p>
          )}
          <p className="mt-auto pt-4 text-xs text-faint">
            {session.room.name}{session.venue.shortName && ` · ${session.venue.shortName}`}
          </p>
        </div>

        <button
          type="button"
          data-testid="agenda-remove"
          onClick={() => setConfirming(true)}
          className="relative z-10 inline-flex items-center gap-1.5 self-end rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-300 transition-colors hover:bg-rose-500/20 focus-visible:outline-2 focus-visible:outline-rose-400"
        >
          <Icon name="close" className="size-3.5" /> Remove
        </button>
      </div>
      {confirming && (
        <ConfirmRemove session={session} busy={busy} onCancel={() => setConfirming(false)} onConfirm={remove} />
      )}
    </li>
  );
}
