import { useConference, useFetch } from '../lib/store.jsx';
import * as api from '../lib/api.js';
import { hasEnded, toMinutes } from '../lib/clock.js';
import { dayLabel, time as fmtTime } from '../lib/format.js';
import { useDocumentTitle } from '../lib/useDocumentTitle.js';
import { AgendaSessionPanel } from '../components/AgendaSessionPanel.jsx';
import { Button, EmptyState, ErrorState, Skeleton } from '../components/ui.jsx';

/** The panel's own minimum, so the skeleton reserves exactly the same room. */
const PANEL_HEIGHT = 'min-h-44';
const SKELETONS = 3;

/**
 * The attendee's day: every session they hold a confirmed seat for on the
 * current conference day, in time order, with the speaker and the room they
 * have to find. Adding a seat is not something this page does — the only
 * action is giving one back (CLAUDE.md § There is exactly one action).
 *
 * The whole plan comes from `/users/:id/schedule`, fetched once per attendee:
 * every seat, on every day. Fetched per day it would lose the day's later
 * sessions — `/today` carries only the very next one — and refetched on a clock
 * tick it would reflow the page under the reader. The store has the last word on
 * what is still held, so a seat released here leaves the page at once.
 */
export function MyAgendaPage() {
  useDocumentTitle('My Agenda');

  const { conference, days, currentUserId, clock, userReady, reservationFor, toggleSeat } = useConference();
  const { data, loading, error, reload } = useFetch(
    () => api.getSchedule(currentUserId),
    [currentUserId],
  );
  // The plan and the attendee's own seats arrive separately; the page waits for
  // both before drawing anything, so a panel never appears, vanishes and comes
  // back as two responses land in different orders.
  const settled = !loading && userReady;

  const day = clock.day;
  const stateFor = (session) => {
    if (hasEnded(session, clock)) return 'finished';
    return session.day === clock.day && toMinutes(clock.time) >= toMinutes(session.startsAt) ? 'live' : 'upcoming';
  };

  const today = days.find((d) => d.date === day);

  const held = ((data?.days ?? []).find((d) => d.date === day)?.sessions ?? [])
    .filter((s) => reservationFor(s.id) === 'confirmed')
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.id - b.id);

  return (
    <div className="space-y-6 sm:space-y-8" data-testid="my-agenda">
      <section className="relative overflow-hidden rounded-2xl border border-hairline" data-testid="agenda-hero">
        <div className="absolute inset-0 bg-[radial-gradient(30rem_14rem_at_12%_0%,rgba(139,92,246,0.22),transparent_65%)]" />
        <div className="relative flex flex-wrap items-end justify-between gap-x-6 gap-y-4 px-6 py-6 sm:px-8 sm:py-8">
          <div>
            <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-faint">
              <span className="size-1.5 rounded-full bg-cyan-400" />
              Today
            </p>
            <h1 className="mt-2 font-display text-4xl leading-none tracking-tight sm:text-[2.75rem]">
              {today?.label ?? 'Today'} <span className="text-faint">·</span> {fmtTime(clock.time)}
            </h1>
            <p className="mt-3 text-sm text-muted">{dayLabel(day)}</p>
          </div>
          <div className="sm:text-right">
            <p className="font-display text-base">{conference.dates}</p>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.16em] text-faint">{conference.city}</p>
          </div>
        </div>
      </section>

      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-display text-xl">Your day</h2>
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint">{dayLabel(day)}</span>
      </div>

      {!settled && (
        <div className="space-y-3" data-testid="agenda-skeleton">
          {Array.from({ length: SKELETONS }, (_, i) => (
            <Skeleton key={i} className={`${PANEL_HEIGHT} w-full rounded-2xl`} />
          ))}
        </div>
      )}

      {settled && error && <ErrorState error={error} onRetry={reload} />}

      {settled && !error && held.length === 0 && (
        <div data-testid="agenda-empty">
          <EmptyState
            icon="ticket"
            title="Nothing booked for today"
            description="Sessions you take a seat for show up here, with who is speaking and where to be."
            action={<Button to="/schedule" size="sm">Browse the schedule</Button>}
          />
        </div>
      )}

      {settled && !error && held.length > 0 && (
        <div className="space-y-3">
          {held.map((session, i) => (
            <AgendaSessionPanel
              key={session.id}
              session={session}
              state={stateFor(session)}
              index={i}
              onRelease={(s) => toggleSeat(s.id, s)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
