import { Link } from 'react-router-dom';
import { useConference, useFetch } from '../lib/store.jsx';
import * as api from '../lib/api.js';
import { upcomingAgenda } from '../lib/agenda.js';
import { dayLabel, timeRange } from '../lib/format.js';
import { useDocumentTitle } from '../lib/useDocumentTitle.js';
import { Button, Chip, EmptyState, ErrorState, SectionHeader, Skeleton } from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';

function Flag({ testId, children }) {
  return (
    <p
      className="flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/[0.07] px-3 py-2 text-[13px] text-amber-200"
      data-testid={testId}
    >
      <Icon name="alert" className="mt-0.5 size-4 shrink-0" />
      <span className="min-w-0">{children}</span>
    </p>
  );
}

function AgendaItem({ session: s, onRemove }) {
  return (
    <li className="card space-y-3 p-4" data-testid="agenda-item" data-session-id={s.id}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <span className="font-mono text-ink">{timeRange(s.startsAt, s.endsAt)}</span>
            <Chip accent={s.status === 'confirmed' ? 'emerald' : 'amber'} data-testid="agenda-status">
              {s.status === 'confirmed' ? 'Seat' : 'Waitlist'}
            </Chip>
          </div>
          <Link to={`/sessions/${s.id}`} className="mt-1 block font-display text-lg leading-snug hover:text-violet-300">
            {s.title}
          </Link>
          <p className="mt-0.5 text-sm text-muted">{s.room.name} · {s.venue.name}</p>
        </div>
        <Button size="sm" onClick={onRemove} aria-label={`Remove ${s.title} from my agenda`}>Remove</Button>
      </div>
      {s.clashesWith.map((o) => (
        <Flag key={o.id} testId="agenda-clash">Clashes with “{o.title}” ({timeRange(o.startsAt, o.endsAt)})</Flag>
      ))}
      {s.hop && (
        <Flag testId="agenda-hop">
          Won’t fit: {s.hop.mode} + walk takes {s.hop.tripMinutes} min, you have {s.hop.gapMinutes}
        </Flag>
      )}
    </li>
  );
}

export function MyAgendaPage() {
  useDocumentTitle('My Agenda');
  const { currentUserId, reservationFor, toggleSeat, clock, travel } = useConference();
  const { data, loading, error, reload } = useFetch(() => api.getSchedule(currentUserId), [currentUserId]);

  const days = data
    ? upcomingAgenda({ sessions: data.days.flatMap((d) => d.sessions), reservationFor, clock, travel })
    : [];

  return (
    <div className="space-y-8">
      <SectionHeader eyebrow="Your conference" title="My Agenda" />
      {loading ? (
        <div className="space-y-3"><Skeleton className="h-24" /><Skeleton className="h-24" /></div>
      ) : error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : days.length === 0 ? (
        <div data-testid="agenda-empty">
          <EmptyState
            icon="ticket"
            title="Nothing coming up"
            description="Sessions you add will show here until they end."
            action={<Button to="/schedule" size="sm">Browse the schedule</Button>}
          />
        </div>
      ) : (
        days.map((d) => (
          <section key={d.date} className="space-y-3" data-testid="agenda-day" data-date={d.date}>
            <h3 className="font-display text-xl">{dayLabel(d.date)}</h3>
            <ul className="space-y-3">
              {d.sessions.map((s) => <AgendaItem key={s.id} session={s} onRemove={() => toggleSeat(s.id, s)} />)}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
