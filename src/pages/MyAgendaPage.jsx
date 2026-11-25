import { useEffect, useState } from 'react';
import { useConference, useFetch } from '../lib/store.jsx';
import { useDocumentTitle } from '../lib/useDocumentTitle.js';
import * as api from '../lib/api.js';
import { dayLabel, time as fmtTime } from '../lib/format.js';
import { todaysSeats } from '../lib/agenda.js';
import { AgendaCard } from '../components/AgendaCard.jsx';

function Hero({ conference, today, clock }) {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-hairline" data-testid="agenda-hero">
      <div className="absolute inset-0 bg-[radial-gradient(30rem_14rem_at_12%_0%,rgba(139,92,246,0.22),transparent_65%)]" />
      <div className="relative flex flex-wrap items-end justify-between gap-x-6 gap-y-4 px-6 py-6 sm:px-8 sm:py-8">
        <div>
          <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-faint">
            <span className="size-1.5 animate-pulse-dot rounded-full bg-cyan-400" /> Today
          </p>
          <h1 className="mt-2 font-display text-4xl leading-none tracking-tight sm:text-5xl">
            {today?.label ?? 'Day 1'} <span className="text-muted">·</span> {fmtTime(clock.time)}
          </h1>
          <p className="mt-3 text-sm text-muted">{dayLabel(clock.day)}</p>
        </div>
        <div className="sm:text-right">
          <p className="font-display text-base font-semibold">{conference?.dates}</p>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-faint">{conference?.city}</p>
        </div>
      </div>
    </section>
  );
}

/** Placeholders the height of a real card, so cards arriving move nothing. */
function Skeleton() {
  return (
    <ul className="space-y-3" aria-hidden="true" data-testid="agenda-skeleton">
      {[0, 1].map((i) => (
        <li key={i} className="min-h-[10.5rem] animate-pulse rounded-xl border border-hairline bg-surface" />
      ))}
    </ul>
  );
}

export function MyAgendaPage() {
  useDocumentTitle('My Agenda');
  const { clock, days, conference, currentUserId, reservations, reservationFor } = useConference();
  const { data } = useFetch(() => api.getSchedule(currentUserId), [currentUserId]);
  const today = days?.find((d) => d.date === clock.day);

  // Seat state arrives from a separate request to the schedule. Wait for both
  // before the first paint of the list (once, per attendee), so cards never
  // pop in after the page has already settled. A later removal must not bring
  // the skeleton back, hence the latch.
  const synced = data && (reservations.size > 0 || !data.days.some((d) => d.sessions.some((s) => s.reservation)));
  const [readyFor, setReadyFor] = useState(null);
  useEffect(() => { if (synced) setReadyFor(currentUserId); }, [synced, currentUserId]);
  const ready = readyFor === currentUserId;

  const seats = ready ? todaysSeats(data.days, reservationFor, clock.day) : [];

  return (
    <div className="space-y-8">
      <Hero conference={conference} today={today} clock={clock} />

      <section className="space-y-4" aria-labelledby="your-day">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="your-day" className="font-display text-xl">Your day</h2>
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-faint">{dayLabel(clock.day)}</span>
        </div>

        {!ready ? <Skeleton /> : seats.length === 0 ? (
          <p className="rounded-xl border border-dashed border-hairline bg-surface px-6 py-12 text-center text-sm text-muted" data-testid="agenda-empty">
            You do not hold a seat for anything today.
          </p>
        ) : (
          <ul className="space-y-3" data-testid="agenda-list">
            {seats.map((s, i) => <AgendaCard key={s.id} session={s} index={i} />)}
          </ul>
        )}
      </section>
    </div>
  );
}
