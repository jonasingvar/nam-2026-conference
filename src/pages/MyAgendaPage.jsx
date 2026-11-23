import { Link } from 'react-router-dom';
import { useDocumentTitle } from '../lib/useDocumentTitle.js';
import { useConference, useFetch } from '../lib/store.jsx';
import * as api from '../lib/api.js';
import { upcomingAgenda } from '../lib/agenda.js';
import { dayLabel, timeRange } from '../lib/format.js';
import { Button, SectionHeader } from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';

/**
 * The attendee's upcoming sessions. The fetched schedule only says which
 * sessions to look at; what is held comes from the store (`reservationFor`),
 * and clashes and hops are recomputed from it, so removing a row updates
 * everything with no refetch.
 */
export function MyAgendaPage() {
  useDocumentTitle('My Agenda');
  const { currentUserId, reservationFor, toggleSeat, clock, travel } = useConference();
  const { data, loading, error } = useFetch(() => api.getSchedule(currentUserId), [currentUserId]);

  const days = data && travel
    ? upcomingAgenda({
      sessions: (data.days ?? []).flatMap((d) => d.sessions),
      reservationFor, clock, travel,
    })
    : [];

  return (
    <div className="space-y-8">
      <SectionHeader eyebrow="Your conference" title="My Agenda" />
      {error && <p className="text-sm text-rose-300">Could not load your agenda: {error.message}</p>}
      {!error && (loading || !data || !travel) && <p className="text-sm text-muted">Loading…</p>}
      {data && travel && days.length === 0 && (
        <section
          className="grid place-items-center rounded-2xl border border-dashed border-hairline bg-surface px-6 py-20 text-center"
          data-testid="agenda-empty"
        >
          <span className="grid size-12 place-items-center rounded-xl bg-violet-500/12 text-violet-300">
            <Icon name="ticket" className="size-5" />
          </span>
          <h2 className="mt-4 font-display text-2xl">Nothing coming up</h2>
          <p className="mt-2 max-w-sm text-sm text-muted">Sessions you add will show up here.</p>
          <Button to="/schedule" size="sm" className="mt-6">Browse the schedule</Button>
        </section>
      )}
      {days.map((day) => (
        <section key={day.date} className="space-y-3" data-testid="agenda-day" data-date={day.date}>
          <h2 className="font-display text-xl">{dayLabel(day.date)}</h2>
          <ul className="space-y-3">
            {day.sessions.map((s) => (
              <li
                key={s.id}
                className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between"
                data-testid="agenda-item"
                data-session-id={s.id}
              >
                <div className="min-w-0 space-y-1.5">
                  <p className="font-mono text-xs text-muted">{timeRange(s.startsAt, s.endsAt)}</p>
                  <Link to={`/sessions/${s.id}`} className="block font-display text-lg hover:underline">{s.title}</Link>
                  <p className="text-sm text-muted">{s.room.name} · {s.venue.name}</p>
                  <span
                    className={`inline-block rounded-full px-2.5 py-0.5 text-xs ${s.status === 'confirmed'
                      ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300'}`}
                    data-testid="agenda-status"
                  >
                    {s.status === 'confirmed' ? 'Seat' : 'Waitlist'}
                  </span>
                  {s.clashesWith.map((o) => (
                    <p key={o.id} className="text-sm text-amber-300" data-testid="agenda-clash">
                      Clashes with {o.title} ({timeRange(o.startsAt, o.endsAt)})
                    </p>
                  ))}
                  {s.hop && (
                    <p className="text-sm text-rose-300" data-testid="agenda-hop">
                      Won&apos;t fit: {s.hop.mode} + walk takes {s.hop.tripMinutes} min, you have {s.hop.gapMinutes}
                    </p>
                  )}
                </div>
                <Button size="sm" onClick={() => toggleSeat(s.id, s)} aria-label={`Remove ${s.title}`}>Remove</Button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
