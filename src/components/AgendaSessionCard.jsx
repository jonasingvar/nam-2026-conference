import { useState } from 'react';
import { Link } from 'react-router-dom';
import { accent, accentHex } from '../lib/accents.js';
import { timeRange } from '../lib/format.js';
import { hasEnded } from '../lib/clock.js';
import { useConference } from '../lib/store.jsx';
import { Avatar } from './ui.jsx';
import { Icon } from './Icon.jsx';

/**
 * One held seat, drawn large. The whole card is a link to the session (a
 * stretched <Link>); portraits and the Remove control sit above it so they
 * are their own targets. Remove asks first, inline, because a toast would be
 * gone while the question is still open.
 */
export function AgendaSessionCard({ session, index = 0 }) {
  const { clock, toggleSeat } = useConference();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const color = session.track.color;
  const a = accent(color);
  const ended = hasEnded(session, clock);
  const first = session.speakers[0];

  async function remove() {
    setBusy(true);
    try { await toggleSeat(session.id, session); } finally { setBusy(false); setAsking(false); }
  }

  return (
    <article
      data-testid={`agenda-session-${session.id}`}
      style={{ '--i': index }}
      className="agenda-card group relative flex min-h-[175px] gap-5 overflow-hidden rounded-xl border border-hairline bg-surface py-4 pl-6 pr-4"
    >
      <span
        data-testid="agenda-rail"
        aria-hidden="true"
        className="agenda-rail absolute inset-y-0 left-0 w-1"
        style={{ background: accentHex(color)[0] }}
      />
      <Link
        to={`/sessions/${session.id}`}
        aria-label={session.title}
        className="absolute inset-0 z-0 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400"
      />

      <div className="relative z-10 flex shrink-0 flex-col gap-2">
        {session.speakers.map((sp) => (
          <Link key={sp.id} to={`/speakers/${sp.id}`} data-testid="agenda-speaker" aria-label={sp.name}
            className="agenda-portrait block rounded-full">
            <Avatar name={sp.name} initials={sp.initials} accent={sp.accent} imageUrl={sp.imageUrl} className="size-16 sm:size-24" />
          </Link>
        ))}
      </div>

      <div className="pointer-events-none relative z-10 flex min-w-0 flex-1 flex-col">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint">
          {timeRange(session.startsAt, session.endsAt)}
          <span className="text-faint"> · </span>
          <span className={a.text}>{session.track.name}</span>
          {ended && <><span> · </span><span>Finished</span></>}
        </p>
        <h3 className="mt-2 font-display text-lg font-semibold leading-snug transition-colors group-hover:text-violet-200 sm:text-xl">
          {session.title}
        </h3>
        <p className="mt-2 text-sm text-ink/80">{session.speakers.map((s) => s.name).join(', ')}</p>
        {first && (
          <p className="mt-0.5 text-xs text-muted">
            {[first.jobTitle ?? first.role, first.company].filter(Boolean).join(' · ')}
          </p>
        )}
        <div className="mt-auto flex flex-wrap items-end justify-between gap-3 pt-5">
          <p className="text-xs text-muted">{session.room.name} · {session.venue.shortName}</p>
          <div className="pointer-events-auto flex items-center gap-2">
            {asking ? (
              <>
                <span className="text-xs text-muted">Remove this seat?</span>
                <button type="button" disabled={busy} onClick={() => setAsking(false)}
                  className="rounded-lg border border-hairline px-3 py-1.5 text-xs font-semibold text-muted hover:bg-overlay">
                  Keep seat
                </button>
                <button type="button" disabled={busy} data-testid="agenda-remove-confirm" onClick={remove}
                  className="rounded-lg border border-rose-500/50 bg-rose-500/25 px-3 py-1.5 text-xs font-semibold text-rose-200 hover:bg-rose-500/40">
                  Yes, remove
                </button>
              </>
            ) : (
              <button type="button" data-testid={`agenda-remove-${session.id}`} onClick={() => setAsking(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-300 transition-colors hover:bg-rose-500/20">
                <Icon name="close" className="size-3" /> Remove
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
