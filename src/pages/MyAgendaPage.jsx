import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useDocumentTitle } from '../lib/useDocumentTitle.js';
import { Button, EmptyState, SectionHeader, Chip } from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';
import { useConference, useFetch } from '../lib/store.jsx';
import * as api from '../lib/api.js';
import { planDays } from '../lib/agenda.js';
import { dayLabel, timeRange } from '../lib/format.js';

function Row({ session, onRemove }) {
  const waitlisted = session.reservation === 'waitlisted';
  return (
    <li
      className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between"
      data-testid={`agenda-item-${session.id}`}
    >
      <div className="min-w-0 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <span className="font-semibold text-violet-300">{timeRange(session.startsAt, session.endsAt)}</span>
          <Chip>{waitlisted ? 'Waitlist' : 'Seat'}</Chip>
        </div>
        <Link to={`/sessions/${session.id}`} className="block font-display text-lg leading-snug hover:underline">
          {session.title}
        </Link>
        <div className="text-sm text-muted">{session.room.name} · {session.venue.name}</div>
        {session.clashesWith.map((o) => (
          <p key={o.id} className="flex items-start gap-1.5 text-sm text-amber-300" data-testid="agenda-clash">
            <Icon name="alert" className="mt-0.5 size-4 shrink-0" />
            <span>Clashes with {o.title}</span>
          </p>
        ))}
        {session.hop && (
          <p className="flex items-start gap-1.5 text-sm text-amber-300" data-testid="agenda-hop">
            <Icon name="alert" className="mt-0.5 size-4 shrink-0" />
            <span>
              Cross-town hop won&apos;t fit — {session.hop.minutes} min by {session.hop.mode}, {session.hop.gapMinutes} min gap
            </span>
          </p>
        )}
      </div>
      <Button size="sm" onClick={() => onRemove(session)} className="self-start">
        Remove
      </Button>
    </li>
  );
}

export function MyAgendaPage() {
  useDocumentTitle('My Agenda');
  const { currentUser, reservationFor, toggleSeat, clock, travel } = useConference();
  const userId = currentUser?.id;
  const { data, error } = useFetch(() => (userId ? api.getSchedule(userId) : Promise.resolve(null)), [userId]);

  // The store, not the fetched payload, decides what is still on the agenda.
  const days = useMemo(
    () => (data ? planDays(data.days, { reservationFor, clock, travel: travel ?? [] }) : null),
    [data, reservationFor, clock, travel],
  );

  return (
    <div className="space-y-8">
      <SectionHeader eyebrow="Your conference" title="My Agenda" />
      {error && <p className="text-sm text-red-300">Could not load your agenda.</p>}
      {!error && !days && <p className="text-sm text-muted">Loading…</p>}
      {days && days.length === 0 && (
        <div data-testid="agenda-empty">
          <EmptyState
            icon="ticket"
            title="Nothing upcoming"
            description="Add sessions from the schedule and they will show up here."
            action={<Button to="/schedule" size="sm">Browse the schedule</Button>}
          />
        </div>
      )}
      {days?.map((day) => (
        <section key={day.date} className="space-y-3" data-testid={`agenda-day-${day.date}`}>
          <h3 className="font-display text-xl">{dayLabel(day.date)}</h3>
          <ul className="space-y-3">
            {day.sessions.map((s) => <Row key={s.id} session={s} onRemove={(x) => toggleSeat(x.id, x)} />)}
          </ul>
        </section>
      ))}
    </div>
  );
}
