import { Link } from 'react-router-dom';
import { useConference, useFetch } from '../lib/store.jsx';
import { useDocumentTitle } from '../lib/useDocumentTitle.js';
import * as api from '../lib/api.js';
import { upcomingAgenda } from '../lib/agenda.js';
import { dayLabel, timeRange } from '../lib/format.js';
import { Button, Chip, EmptyState, ErrorState, SectionHeader, Skeleton } from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';

/**
 * The signed-in attendee's upcoming sessions, by day, with problems flagged.
 * The fetch only supplies the sessions; which ones are held comes from the
 * store, so removing one re-renders the list and its flags without a refetch.
 */
export function MyAgendaPage() {
  useDocumentTitle('My Agenda');
  const { currentUserId, reservationFor, toggleSeat, clock, travel } = useConference();
  const { data, loading, error, reload } = useFetch(() => api.getSchedule(currentUserId), [currentUserId]);

  const days = data
    ? upcomingAgenda({
        sessions: (data.days ?? []).flatMap((d) => d.sessions),
        reservationFor, clock, travel,
      })
    : [];

  return (
    <div className="space-y-8">
      <SectionHeader eyebrow="Your conference" title="My Agenda" />
      {error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : loading && !data ? (
        <Skeleton className="h-40" />
      ) : days.length === 0 ? (
        <div data-testid="agenda-empty">
          <EmptyState
            icon="ticket"
            title="Nothing coming up"
            description="Sessions you add will be listed here, with any clashes flagged."
            action={<Button to="/schedule" size="sm">Browse the schedule</Button>}
          />
        </div>
      ) : (
        days.map((day) => (
          <section key={day.date} className="space-y-3" data-testid="agenda-day" data-date={day.date}>
            <h2 className="font-display text-xl">{dayLabel(day.date)}</h2>
            <ul className="space-y-3">
              {day.sessions.map((s) => (
                <li key={s.id} className="card space-y-2 p-4" data-testid="agenda-item" data-session-id={s.id}>
                  <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
                    <div className="min-w-0">
                      <p className="text-xs text-muted">{timeRange(s.startsAt, s.endsAt)}</p>
                      <Link to={`/sessions/${s.id}`} className="font-medium hover:underline">{s.title}</Link>
                      <p className="text-xs text-muted">{s.room.name} · {s.venue.name}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Chip accent={s.status === 'confirmed' ? 'emerald' : 'amber'} data-testid="agenda-status">
                        {s.status === 'confirmed' ? 'Seat' : 'Waitlist'}
                      </Chip>
                      <button
                        type="button"
                        className="grid size-8 place-items-center rounded-lg text-muted hover:bg-raised"
                        aria-label={`Remove ${s.title} from my agenda`}
                        data-testid="agenda-remove"
                        onClick={() => toggleSeat(s.id, s)}
                      >
                        <Icon name="close" className="size-4" />
                      </button>
                    </div>
                  </div>
                  {s.clashesWith.map((o) => (
                    <p key={o.id} className="text-sm text-amber-300" data-testid="agenda-clash">
                      Clashes with {o.title} ({timeRange(o.startsAt, o.endsAt)})
                    </p>
                  ))}
                  {s.hop && (
                    <p className="text-sm text-amber-300" data-testid="agenda-hop">
                      Won't fit: {s.hop.mode} + walk takes {s.hop.tripMinutes} min, you have {s.hop.gapMinutes} min
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
