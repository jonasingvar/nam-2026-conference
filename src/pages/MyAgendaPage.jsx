import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useConference, useFetch } from '../lib/store.jsx';
import * as api from '../lib/api.js';
import { upcomingDays } from '../lib/agenda.js';
import { accent } from '../lib/accents.js';
import { dayLabel } from '../lib/format.js';
import { Button, EmptyState, ErrorState, SectionHeader, SeatButton, Skeleton, cx } from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';
import { useDocumentTitle } from '../lib/useDocumentTitle.js';

/**
 * My Agenda — the attendee's own conference.
 *
 * The list is the whole point: what you have a seat on, and the two ways that
 * plan can fall apart — two sessions at once, and two that are too far apart to
 * walk to in the gap. It is built on `getSchedule`, re-filtered through the
 * store every render, so removing a seat updates the rows *and* their flags at
 * once (see `lib/agenda.js`). Hours and suggestions are deliberately not here.
 */
export function MyAgendaPage() {
  useDocumentTitle('My Agenda');
  const { currentUserId, clock, reservationFor, travel, toggleSeat } = useConference();
  const { data, loading, error, reload } = useFetch(() => api.getSchedule(currentUserId), [currentUserId]);

  const days = useMemo(
    () => upcomingDays({ days: data?.days ?? [], reservationFor, clock, travel }),
    [data, reservationFor, clock, travel],
  );

  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="Your conference"
        title="My Agenda"
        description="Every seat you hold, and the ones that will not work."
      />

      {error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : loading ? (
        <div className="space-y-3">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      ) : days.length === 0 ? (
        <div data-testid="agenda-empty">
          <EmptyState
            icon="ticket"
            title="Nothing on your agenda yet"
            description="Add a session from the schedule and it will show up here, along with anything that will not fit."
            action={<Button to="/schedule" variant="primary" size="sm">Browse the schedule</Button>}
          />
        </div>
      ) : (
        days.map((day) => (
          <Day key={day.date} date={day.date} sessions={day.sessions} onRemove={toggleSeat} />
        ))
      )}
    </div>
  );
}

function Day({ date, sessions, onRemove }) {
  // Flags name other sessions of the same day, so one lookup serves them all.
  const byId = new Map(sessions.map((session) => [session.id, session]));

  return (
    <section className="space-y-2.5" data-testid={`agenda-day-${date}`}>
      <h3 className="font-display text-lg">{dayLabel(date)}</h3>
      <ul className="space-y-2">
        {sessions.map((session) => (
          <AgendaRow
            key={session.id}
            session={session}
            clashes={session.clashesWith.map((id) => byId.get(id)?.title).filter(Boolean)}
            hopFrom={session.hop ? byId.get(session.hop.fromId)?.venue.shortName : null}
            onRemove={() => onRemove(session.id, session)}
          />
        ))}
      </ul>
    </section>
  );
}

function AgendaRow({ session, clashes, hopFrom, onRemove }) {
  const waiting = session.reservation === 'waitlisted';
  const a = accent(session.track.color);
  const offsite = !session.venue.isPrimary;

  return (
    <li
      className="relative flex items-start gap-3 overflow-hidden rounded-xl border border-hairline bg-raised p-3 pr-2.5"
      data-testid={`agenda-row-${session.id}`}
    >
      <span className={cx('absolute inset-y-0 left-0 w-1 bg-gradient-to-b', a.grad)} aria-hidden="true" />

      <div className="w-12 shrink-0 pl-1 pt-0.5 font-mono text-xs">
        <div className="font-semibold text-ink">{session.startsAt}</div>
        <div className="text-[10px] text-faint">{session.endsAt}</div>
      </div>

      <div className="min-w-0 flex-1">
        <Link to={`/sessions/${session.id}`}
          className="text-sm font-semibold leading-snug hover:text-violet-200 focus-visible:outline-none">
          {session.title}
        </Link>

        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
          <span
            data-testid="agenda-status"
            className={cx(
              'rounded-full px-2 py-0.5 font-semibold',
              waiting ? 'bg-amber-400/15 text-amber-300' : 'bg-emerald-400/15 text-emerald-300',
            )}
          >
            {waiting ? 'Waitlist' : 'Seat'}
          </span>
          <span className="inline-flex items-center gap-1">
            <Icon name="pin" className="size-3 shrink-0 text-faint" />
            {session.room.name}
          </span>
          <span className={cx('inline-flex items-center gap-1', offsite && `font-semibold ${accent(session.venue.accent).text}`)}>
            <Icon name={offsite ? 'car' : 'building'} className="size-3 shrink-0 text-faint" />
            {session.venue.shortName}
          </span>
        </div>

        {clashes.length > 0 && (
          <p
            data-testid={`agenda-clash-${session.id}`}
            className="mt-2 flex items-start gap-1.5 rounded-lg bg-rose-500/10 px-2 py-1.5 text-[11px] leading-snug text-rose-200"
          >
            <Icon name="alert" className="mt-px size-3 shrink-0" />
            <span>Clashes with {clashes.join(' and ')} — you cannot be in both.</span>
          </p>
        )}

        {session.hop && (
          <p
            data-testid={`agenda-hop-${session.id}`}
            className="mt-2 flex items-start gap-1.5 rounded-lg bg-amber-500/10 px-2 py-1.5 text-[11px] leading-snug text-amber-200"
          >
            <Icon name="route" className="mt-px size-3 shrink-0" />
            <span>
              Cross-town hop: {session.hop.travelMinutes} min from {hopFrom ?? 'the other venue'} to here,
              and {session.hop.gapMinutes} min between sessions.
            </span>
          </p>
        )}
      </div>

      <SeatButton
        size="sm"
        status={session.reservation}
        onClick={onRemove}
        className="mt-0.5"
      />
    </li>
  );
}
