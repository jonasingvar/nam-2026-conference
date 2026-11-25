import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useDocumentTitle } from '../lib/useDocumentTitle.js';
import { useConference, useFetch } from '../lib/store.jsx';
import * as api from '../lib/api.js';
import { accent } from '../lib/accents.js';
import { time } from '../lib/format.js';
import { upcomingAgenda } from '../lib/agenda.js';
import { Button, EmptyState, ErrorState, SeatButton, SectionHeader, Skeleton, cx } from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';

/**
 * One session of your own agenda: when, what, where, how you hold it — and what
 * is wrong with it. Its own row rather than a `SessionCard`: the agenda has to
 * name the venue even for the home site, and to hang a clash or a hop on it.
 */
function AgendaRow({ session }) {
  const { toggleSeat } = useConference();
  const venue = accent(session.venue.accent);
  const waiting = session.reservation === 'waitlisted';

  return (
    <li
      data-testid="agenda-session"
      data-session-id={session.id}
      data-status={session.reservation}
      className={cx('rounded-xl border bg-raised p-3', waiting ? 'border-amber-400/25' : 'border-hairline')}
    >
      <div className="flex items-start gap-3">
        <div className="shrink-0 pt-0.5 font-mono text-xs leading-relaxed">
          <span className="font-semibold text-ink">{time(session.startsAt)}</span>
          <span className="text-faint"> – {time(session.endsAt)}</span>
        </div>
        <div className="min-w-0 flex-1">
          <Link
            to={`/sessions/${session.id}`}
            className="text-sm font-semibold leading-snug hover:text-violet-200"
          >
            {session.title}
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
            <span className="inline-flex items-center gap-1">
              <Icon name="pin" className="size-3" />
              {session.room.name}
            </span>
            <span className={cx('inline-flex items-center gap-1 font-semibold', venue.text)}>
              <Icon name="car" className="size-3" />
              {session.venue.shortName}
            </span>
            <span className={cx('inline-flex items-center gap-1 font-semibold', waiting ? 'text-amber-300' : 'text-emerald-300')}>
              <Icon name={waiting ? 'clock' : 'ticket'} className="size-3" />
              {waiting ? 'Waitlisted' : 'Seat booked'}
            </span>
          </div>
        </div>
        <SeatButton size="sm" status={session.reservation} onClick={() => toggleSeat(session.id, session)} />
      </div>

      {session.clash && (
        <p
          data-testid="agenda-clash"
          className="mt-3 flex items-start gap-2 rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200"
        >
          <Icon name="alert" className="mt-0.5 size-3.5 shrink-0" />
          <span>Clashes with “{session.clash.title}” — you cannot be in both.</span>
        </p>
      )}

      {session.hop && (
        <p
          data-testid="agenda-hop"
          className="mt-3 flex items-start gap-2 rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200"
        >
          <Icon name="car" className="mt-0.5 size-3.5 shrink-0" />
          <span>
            Cross-town hop that will not fit after “{session.hop.fromTitle}”: the{' '}
            {session.hop.mode.toLowerCase()} takes {session.hop.minutes} min, and you have{' '}
            {session.hop.gapMinutes} min between the two.
          </span>
        </p>
      )}
    </li>
  );
}

/** One conference day's worth of the agenda, in time order. */
function AgendaDay({ day, meta }) {
  return (
    <section data-testid="agenda-day" data-day={day.date} className="space-y-2">
      <h3 className="flex items-baseline gap-2 px-1 font-display text-lg">
        {meta?.label ?? day.date}
        {meta?.weekday && <span className="text-sm font-normal text-faint">{meta.weekday}</span>}
      </h3>
      <ul className="space-y-2">
        {day.sessions.map((session) => <AgendaRow key={session.id} session={session} />)}
      </ul>
    </section>
  );
}

export function MyAgendaPage() {
  useDocumentTitle('My Agenda');
  const { currentUser, days: conferenceDays, reservationFor, clock, travel } = useConference();
  // One fetch, then the store re-filters it on every reservation change: a
  // session you just gave up leaves the list without a reload.
  const { data, error, reload } = useFetch(
    () => (currentUser ? api.getSchedule(currentUser.id) : Promise.resolve(null)),
    [currentUser?.id],
  );

  const agenda = useMemo(
    () => upcomingAgenda({ days: data?.days ?? [], reservationFor, clock, travel }),
    [data, reservationFor, clock, travel],
  );

  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="Your conference"
        title="My Agenda"
        description="Everything you have added, and the days it falls on."
      />

      {/* No payload yet is still loading: an attendee with a full plan must
          never be shown an empty agenda while it is on its way. */}
      {!data ? (
        error ? <ErrorState error={error} onRetry={reload} /> : (
          <div data-testid="agenda-loading" aria-busy="true" className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        )
      ) : agenda.length === 0 ? (
        <div data-testid="agenda-empty">
          <EmptyState
            icon="ticket"
            title="Nothing on your agenda yet"
            description="Add a session from the schedule and it will show up here, with its day and its room."
            action={<Button to="/schedule" size="sm">Browse the schedule</Button>}
          />
        </div>
      ) : (
        <div className="space-y-6">
          {agenda.map((day) => (
            <AgendaDay key={day.date} day={day} meta={conferenceDays.find((d) => d.date === day.date)} />
          ))}
        </div>
      )}
    </div>
  );
}
