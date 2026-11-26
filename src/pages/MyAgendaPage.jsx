import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDocumentTitle } from '../lib/useDocumentTitle.js';
import { useConference, useFetch } from '../lib/store.jsx';
import * as api from '../lib/api.js';
import { accentHex } from '../lib/accents.js';
import { hasEnded, toMinutes } from '../lib/clock.js';
import { dayLabel, timeRange } from '../lib/format.js';
import { Avatar, Button, EmptyState, ErrorState, Skeleton } from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';

/** Finished / Live now / Upcoming, measured on the conference clock. */
function statusOf(session, clock) {
  if (hasEnded(session, clock)) return 'Finished';
  if (session.day === clock.day && toMinutes(session.startsAt) <= toMinutes(clock.time)) return 'Live now';
  return 'Upcoming';
}

/** "Remove?" — a choice, so a dialog rather than a toast. */
function RemoveDialog({ session, onKeep, onRemove, busy }) {
  const ref = useRef(null);
  const keepRef = useRef(onKeep);
  keepRef.current = busy ? () => {} : onKeep;

  useEffect(() => {
    const opener = document.activeElement;
    ref.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') keepRef.current(); };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[70] grid place-items-end sm:place-items-center" role="dialog" aria-modal="true" aria-labelledby="agenda-remove-title" data-testid="agenda-remove-dialog">
      <button type="button" aria-label="Close" onClick={onKeep} disabled={busy} className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div ref={ref} tabIndex={-1} className="glass relative w-full max-w-md animate-rise rounded-t-2xl border border-hairline p-6 shadow-2xl shadow-black/70 focus:outline-none sm:rounded-2xl">
        <h2 id="agenda-remove-title" className="font-display text-xl leading-tight">Remove this session?</h2>
        <p className="mt-2 text-[13px] text-muted">
          “{session.title}” leaves your agenda and your seat goes back to the room — whoever has waited longest gets it.
        </p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onKeep} disabled={busy} data-testid="agenda-remove-keep">Keep</Button>
          <button
            type="button" onClick={onRemove} disabled={busy} data-testid="agenda-remove-confirm"
            className="inline-flex h-10 items-center justify-center rounded-lg border border-rose-500/40 bg-rose-500/15 px-4 text-sm font-semibold text-rose-300 transition hover:bg-rose-500/25 disabled:opacity-50"
          >
            {busy ? 'Removing…' : 'Remove'}
          </button>
        </div>
      </div>
    </div>
  );
}

function AgendaCard({ session, index, clock, onRemove }) {
  const [hex] = accentHex(session.track.color);
  const [first] = session.speakers;
  return (
    <li
      className="agenda-card group relative overflow-hidden rounded-xl border border-hairline bg-surface"
      style={{ '--accent': hex }}
      data-testid="agenda-card"
      data-session-id={session.id}
    >
      <span
        aria-hidden
        data-testid="agenda-rail"
        className="agenda-rail absolute inset-y-0 left-0 w-1"
        style={{ backgroundColor: hex, animationDelay: `${index * 120}ms` }}
      />
      {/* the whole card is this link; everything above it lets clicks fall through, except portraits and Remove */}
      <Link to={`/sessions/${session.id}`} aria-label={session.title} className="absolute inset-0 z-0" data-testid="agenda-card-link" />
      <div className="pointer-events-none relative z-10 flex min-h-[175px] flex-col gap-4 p-5 pl-6 sm:flex-row sm:gap-6">
        <div className="flex shrink-0 flex-row gap-3 sm:flex-col">
          {session.speakers.map((sp) => (
            <Link
              key={sp.id}
              to={`/speakers/${sp.id}`}
              title={sp.name}
              aria-label={`${sp.name} — speaker profile`}
              data-testid={`agenda-speaker-${sp.id}`}
              className="agenda-portrait pointer-events-auto block rounded-full"
            >
              <Avatar name={sp.name} initials={sp.initials} accent={sp.accent} imageUrl={sp.imageUrl} size="xl" className="!size-24" />
            </Link>
          ))}
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-faint">
            {timeRange(session.startsAt, session.endsAt)}
            <span className="mx-1.5">·</span>
            <span style={{ color: hex }}>{session.track.name}</span>
            <span className="mx-1.5">·</span>
            {statusOf(session, clock)}
          </p>
          <h2 className="mt-2 font-display text-xl font-medium leading-snug">{session.title}</h2>
          {first && (
            <>
              <p className="mt-2 text-sm text-muted">{session.speakers.map((s) => s.name).join(', ')}</p>
              <p className="text-xs text-faint">{[first.jobTitle, first.company].filter(Boolean).join(' · ')}</p>
            </>
          )}
          <div className="mt-auto flex items-end justify-between gap-3 pt-5">
            <p className="text-xs text-faint">{session.room.name} · {session.venue.shortName ?? session.venue.name}</p>
            <button
              type="button"
              data-testid="agenda-remove"
              onClick={() => onRemove(session)}
              className="pointer-events-auto inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-rose-500/40 bg-rose-500/10 px-3 text-xs font-semibold text-rose-300 transition hover:bg-rose-500/20"
            >
              <Icon name="close" className="size-3.5" />
              Remove
            </button>
          </div>
        </div>
      </div>
    </li>
  );
}

export function MyAgendaPage() {
  useDocumentTitle('My Agenda');
  const { currentUserId, clock, ready, reservationFor, releaseSeat } = useConference();
  const { data, loading, error, reload } = useFetch(() => api.getSchedule(currentUserId), [currentUserId]);
  const [pending, setPending] = useState(null);
  const [busy, setBusy] = useState(false);

  // Only confirmed seats, judged by the store so a removal drops the card at once.
  const sessions = useMemo(() => {
    const onDay = data?.days?.find((d) => d.date === clock.day)?.sessions ?? [];
    return onDay.filter((s) => reservationFor(s.id) === 'confirmed')
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.id - b.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, clock.day, reservationFor]);

  const confirm = async () => {
    setBusy(true);
    await releaseSeat(pending.id, pending);
    setBusy(false);
    setPending(null);
  };

  const showing = ready && !loading && data;

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="font-display text-xl">Your day</h1>
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-faint">{dayLabel(clock.day)}</span>
      </div>

      {error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : !showing ? (
        <ul className="space-y-3" data-testid="agenda-skeleton" aria-busy="true" aria-label="Loading your day">
          {[0, 1, 2].map((i) => <li key={i}><Skeleton className="h-[200px] rounded-xl" /></li>)}
        </ul>
      ) : sessions.length === 0 ? (
        <div data-testid="agenda-empty">
          <EmptyState
            icon="ticket"
            title="Nothing booked for this day"
            description="Seats you take on today's sessions show up here."
            action={<Button to="/schedule" size="sm">Browse the schedule</Button>}
          />
        </div>
      ) : (
        <ul className="space-y-3" data-testid="agenda-list">
          {sessions.map((s, i) => <AgendaCard key={s.id} session={s} index={i} clock={clock} onRemove={setPending} />)}
        </ul>
      )}

      {pending && <RemoveDialog session={pending} busy={busy} onKeep={() => setPending(null)} onRemove={confirm} />}
    </div>
  );
}
