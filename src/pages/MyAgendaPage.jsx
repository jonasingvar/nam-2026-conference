import { Link } from 'react-router-dom';
import { useConference, useFetch } from '../lib/store.jsx';
import * as api from '../lib/api.js';
import { clashesFor, hopsFor, upcomingDays } from '../lib/agenda.js';
import { dayLabel, plural, timeRange } from '../lib/format.js';
import { Button, Chip, EmptyState, ErrorState, SectionHeader, Skeleton } from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';
import { useDocumentTitle } from '../lib/useDocumentTitle.js';

/**
 * My Agenda — what this attendee has added, and anything that will not work.
 *
 * The payload comes from `/users/:id/schedule`, but the store is the source of
 * truth for what they still hold, so dropping a session takes the row and its
 * flags with it straight away (CLAUDE.md § There is exactly one action). The
 * rules — what is still ahead, what clashes, what will not fit — live in
 * `src/lib/agenda.js` and are tested without a browser.
 */
export function MyAgendaPage() {
  useDocumentTitle('My Agenda');
  const { currentUser, currentUserId, reservationFor, clock, travel, toggleSeat } = useConference();
  const { data, loading, error, reload } = useFetch(
    () => api.getSchedule(currentUserId),
    [currentUserId],
  );

  const days = data ? upcomingDays(data.days, reservationFor, clock) : [];

  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="Your conference"
        title="My Agenda"
        description="Everything you have added, and anything that will not work."
      />

      {loading && !data ? (
        <Skeleton className="h-40 w-full" />
      ) : error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : days.length === 0 ? (
        <div data-testid="agenda-empty">
          <EmptyState
            icon="ticket"
            title="Nothing on your agenda yet"
            description="Add a session and it will show up here, with any clashes or trips that will not fit."
            action={<Button to="/schedule" variant="primary" size="sm">Browse the schedule</Button>}
          />
        </div>
      ) : (
        <div className="space-y-8">
          {days.map((day) => {
            const clashes = clashesFor(day.sessions);
            const hops = hopsFor(day.sessions, travel);
            return (
              <section key={day.date} className="space-y-3">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <h3 data-testid="agenda-day" className="font-display text-lg sm:text-xl">
                    {dayLabel(day.date)}
                  </h3>
                  <span className="text-xs text-faint">{plural(day.sessions.length, 'session')}</span>
                </div>
                <ul className="space-y-2">
                  {day.sessions.map((session) => (
                    <AgendaRow
                      key={session.id}
                      session={session}
                      clashes={clashes.get(session.id) ?? []}
                      hops={hops.get(session.id) ?? []}
                      onRemove={() => toggleSeat(session.id, session)}
                    />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AgendaRow({ session, clashes, hops, onRemove }) {
  const waitlisted = session.reservation === 'waitlisted';

  return (
    <li
      data-testid={`agenda-row-${session.id}`}
      className="card flex items-start gap-3 p-3.5 sm:p-4"
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-xs font-medium tabular-nums text-muted">
            {timeRange(session.startsAt, session.endsAt)}
          </span>
          <Chip accent={waitlisted ? 'amber' : 'emerald'}>
            {waitlisted ? 'Waitlist' : 'Seat'}
          </Chip>
        </div>

        <Link
          to={`/sessions/${session.id}`}
          className="mt-1.5 block truncate font-medium text-ink hover:text-violet-300"
        >
          {session.title}
        </Link>
        <p className="mt-0.5 truncate text-xs text-faint">
          {session.room.name} · {session.venue.name}
        </p>

        {clashes.map((other) => (
          <p key={`clash-${other.id}`} data-testid="agenda-clash"
            className="mt-2 flex items-start gap-1.5 text-xs text-rose-300">
            <Icon name="alert" className="mt-0.5 size-3.5 shrink-0" />
            <span>Clashes with “{other.title}” — {timeRange(other.startsAt, other.endsAt)}</span>
          </p>
        ))}

        {hops.map((hop) => {
          const other = hop.from.id === session.id ? hop.to : hop.from;
          return (
            <p key={`hop-${other.id}`} data-testid="agenda-hop"
              className="mt-2 flex items-start gap-1.5 text-xs text-amber-300">
              <Icon name="route" className="mt-0.5 size-3.5 shrink-0" />
              <span>
                Cross-town hop that will not fit: the fastest trip to “{other.title}” takes {hop.tripMinutes} min,
                and the gap is {hop.gapMinutes} min
              </span>
            </p>
          );
        })}
      </div>

      <Button
        variant="subtle"
        size="sm"
        className="shrink-0"
        aria-label={`Remove ${session.title} from my agenda`}
        data-testid="agenda-remove"
        onClick={onRemove}
      >
        <Icon name="close" className="size-4" />
      </Button>
    </li>
  );
}
