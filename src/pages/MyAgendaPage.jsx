import { useState } from 'react';
import { useConference, useFetch } from '../lib/store.jsx';
import { useDocumentTitle } from '../lib/useDocumentTitle.js';
import * as api from '../lib/api.js';
import { dayLabel, time as fmtTime } from '../lib/format.js';
import { todaysSeats } from '../lib/agenda.js';
import { AgendaCard } from '../components/AgendaCard.jsx';
import { RemoveSeatDialog } from '../components/RemoveSeatDialog.jsx';
import { Button } from '../components/ui.jsx';

function ClockPanel({ conference, label, clock }) {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-hairline bg-ground" data-testid="agenda-clock">
      <div className="absolute inset-0 bg-[radial-gradient(30rem_14rem_at_12%_0%,rgba(139,92,246,0.22),transparent_65%)]" />
      <div className="relative flex flex-wrap items-end justify-between gap-x-6 gap-y-4 px-6 py-7 sm:px-8 sm:py-9">
        <div>
          <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-faint">
            <span className="size-1.5 rounded-full bg-cyan-400" /> Today
          </p>
          <p className="mt-2 font-display text-4xl leading-none tracking-tight sm:text-6xl">
            {label} <span className="text-faint">·</span> {fmtTime(clock.time)}
          </p>
          <p className="mt-3 text-sm text-muted">{dayLabel(clock.day)}</p>
        </div>
        <div className="sm:text-right">
          <p className="font-display text-base font-semibold sm:text-lg">{conference.dates}</p>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.16em] text-faint">{conference.city}</p>
        </div>
      </div>
    </section>
  );
}

/** Same-height placeholders, so the list never pops in piece by piece. */
function ListSkeleton() {
  return (
    <div className="space-y-4" aria-hidden="true" data-testid="agenda-skeleton">
      {[0, 1, 2].map((i) => <div key={i} className="h-44 rounded-2xl border border-hairline bg-ground" />)}
    </div>
  );
}

export function MyAgendaPage() {
  useDocumentTitle('My Agenda');
  const { conference, days, clock, currentUser, reservationFor, toggleSeat, ready } = useConference();
  const { data } = useFetch(() => api.getSchedule(currentUser.id), [currentUser?.id]);
  const [removing, setRemoving] = useState(null);
  const [busy, setBusy] = useState(false);

  const today = days?.find((d) => d.date === clock.day);
  const loaded = ready && data;
  const seats = loaded ? todaysSeats(data.days, clock.day, reservationFor) : [];

  const confirmRemove = async () => {
    setBusy(true);
    try { await toggleSeat(removing.id, removing); } finally { setBusy(false); setRemoving(null); }
  };

  return (
    <div className="space-y-8" data-testid="agenda-day">
      <h1 className="sr-only">My Agenda</h1>
      {ready && <ClockPanel conference={conference} label={today?.label ?? ''} clock={clock} />}

      <section aria-labelledby="your-day">
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <h2 id="your-day" className="font-display text-xl">Your day</h2>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint">{dayLabel(clock.day)}</p>
        </div>

        {!loaded ? <ListSkeleton /> : seats.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-hairline bg-surface px-6 py-14 text-center" data-testid="agenda-empty">
            <p className="font-display text-lg">Nothing booked for today</p>
            <p className="mt-1 text-sm text-muted">Sessions you take a seat in will show up here.</p>
            <Button to={`/schedule?day=${clock.day}`} size="sm" className="mt-5">Browse today</Button>
          </div>
        ) : (
          <div className="space-y-4">
            {seats.map((s) => (
              <AgendaCard key={s.id} session={s} clock={clock} onRemove={() => setRemoving(s)} />
            ))}
          </div>
        )}
      </section>

      <RemoveSeatDialog session={removing} busy={busy} onCancel={() => setRemoving(null)} onConfirm={confirmRemove} />
    </div>
  );
}
