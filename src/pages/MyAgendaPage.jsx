import { useEffect, useRef, useState } from 'react';
import { useConference, useFetch } from '../lib/store.jsx';
import { useDocumentTitle } from '../lib/useDocumentTitle.js';
import * as api from '../lib/api.js';
import { dayAgenda } from '../lib/agenda.js';
import { dayLabel, time as fmtTime } from '../lib/format.js';
import { Button } from '../components/ui.jsx';
import { AgendaSessionCard } from '../components/AgendaSessionCard.jsx';

/** The same shape as a card, so nothing jumps when the real ones arrive. */
function Skeleton() {
  return <div aria-hidden="true" className="min-h-[175px] rounded-xl border border-hairline bg-surface" />;
}

export function MyAgendaPage() {
  useDocumentTitle('My Agenda');
  const { clock, days, conference, currentUserId, reservationFor } = useConference();
  const userId = currentUserId;
  const { data } = useFetch(() => (userId ? api.getSchedule(userId) : Promise.resolve(null)), [userId]);

  const today = days.find((d) => d.date === clock.day);
  const rows = dayAgenda(data, clock.day, reservationFor);

  // The store's reservations arrive on their own request. Hold the list back
  // until they agree with the payload (or it has none), then never go back to
  // the skeleton: a removed last seat must show the empty state, not a skeleton.
  const confirmedInPayload = (data?.days.find((d) => d.date === clock.day)?.sessions ?? [])
    .some((s) => s.reservation === 'confirmed');
  const agrees = Boolean(data) && (rows.length > 0 || !confirmedInPayload);
  const latched = useRef(null);
  const [, bump] = useState(0);
  useEffect(() => {
    if (agrees && latched.current !== userId) { latched.current = userId; bump((n) => n + 1); }
  }, [agrees, userId]);
  const ready = latched.current === userId && Boolean(data);

  return (
    <div className="space-y-8">
      <section
        data-testid="agenda-hero"
        className="relative overflow-hidden rounded-2xl border border-hairline bg-surface"
      >
        <div className="absolute inset-0 bg-[radial-gradient(30rem_14rem_at_12%_0%,rgba(139,92,246,0.22),transparent_65%)]" />
        <div className="relative flex flex-wrap items-end justify-between gap-x-6 gap-y-4 px-6 py-5 sm:px-8 sm:py-6">
          <div>
            <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-faint">
              <span className="size-1.5 rounded-full bg-cyan-400" /> Today
            </p>
            <h1 className="mt-3 font-display text-4xl font-semibold leading-none tracking-tight sm:text-5xl">
              {today?.label ?? 'Day 1'} <span className="text-muted">·</span> {fmtTime(clock.time)}
            </h1>
            <p className="mt-3 text-sm text-muted">{dayLabel(clock.day)}</p>
          </div>
          <div className="sm:text-right">
            <p className="font-display text-sm font-semibold">{conference?.dates}</p>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-faint">{conference?.city}</p>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="font-display text-[22px] leading-tight">Your day</h2>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-faint">{dayLabel(clock.day)}</p>
        </div>

        {!ready && <Skeleton />}
        {ready && rows.length > 0 && (
          <div className="agenda-list space-y-3" data-testid="agenda-list">
            {rows.map((s, i) => <AgendaSessionCard key={s.id} session={s} index={i} />)}
          </div>
        )}
        {ready && rows.length === 0 && (
          <div data-testid="agenda-empty"
            className="grid place-items-center rounded-xl border border-dashed border-hairline bg-surface px-6 py-14 text-center">
            <p className="font-display text-lg">Nothing booked for today</p>
            <p className="mt-1 text-sm text-muted">Sessions you hold a seat for show up here.</p>
            <Button to={`/schedule?day=${clock.day}`} size="sm" className="mt-5">Browse today</Button>
          </div>
        )}
      </section>
    </div>
  );
}
