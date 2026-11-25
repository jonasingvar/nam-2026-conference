import { Link } from 'react-router-dom';
import { useConference, useFetch } from '../lib/store.jsx';
import { useDocumentTitle } from '../lib/useDocumentTitle.js';
import * as api from '../lib/api.js';
import { accent } from '../lib/accents.js';
import { hasEnded, toMinutes } from '../lib/clock.js';
import { dayLabel, time as fmtTime } from '../lib/format.js';
import { Avatar, EmptyState, Skeleton, cx } from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';

function Hero({ conference }) {
  const { clock, days } = useConference();
  const today = days?.find((d) => d.date === clock.day);
  return (
    <section className="relative overflow-hidden rounded-2xl border border-hairline bg-surface" data-testid="agenda-hero">
      <div className="absolute inset-0 bg-[radial-gradient(30rem_14rem_at_12%_0%,rgba(139,92,246,0.22),transparent_65%)]" />
      <div className="relative flex flex-wrap items-end justify-between gap-x-6 gap-y-4 px-5 py-6 sm:px-8 sm:py-8">
        <div>
          <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-faint">
            <span className="size-1.5 rounded-full bg-cyan-400" /> Today
          </p>
          <h1 className="mt-2 font-display text-4xl leading-none tracking-tight sm:text-5xl">
            {today?.label ?? 'Day'} <span className="text-muted">·</span> {fmtTime(clock.time)}
          </h1>
          <p className="mt-3 text-sm text-muted">{dayLabel(clock.day)}</p>
        </div>
        <div className="sm:text-right">
          <p className="font-display text-base font-semibold">{conference?.dates}</p>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.2em] text-faint">{conference?.city}</p>
        </div>
      </div>
    </section>
  );
}

function statusOf(session, clock) {
  if (hasEnded(session, clock)) return 'Finished';
  const now = toMinutes(clock.time);
  if (toMinutes(session.startsAt) <= now) return 'Live';
  return 'Upcoming';
}

function AgendaCard({ session, index }) {
  const { clock, toggleSeat } = useConference();
  const a = accent(session.track.color);
  const speakers = session.speakers ?? [];
  const lead = speakers[0];
  return (
    <article
      data-testid={`agenda-session-${session.id}`}
      className="agenda-card group relative overflow-hidden rounded-2xl border border-hairline bg-surface"
      style={{ '--i': index }}
    >
      <span
        data-testid={`agenda-line-${session.id}`}
        aria-hidden="true"
        className={cx('animate-line-grow absolute inset-y-0 left-0 w-1', a.dot)}
      />
      <div className="flex gap-5 py-5 pl-6 pr-5 sm:pl-6">
        <div className="flex shrink-0 flex-col gap-2">
          {speakers.map((sp) => (
            <Link key={sp.id} to={`/speakers/${sp.id}`} aria-label={sp.name} data-testid={`agenda-speaker-${sp.id}`}
              className="agenda-portrait block rounded-full">
              <Avatar name={sp.name} initials={sp.initials} accent={sp.accent} imageUrl={sp.imageUrl} size="xl" />
            </Link>
          ))}
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint">
            {fmtTime(session.startsAt)} – {fmtTime(session.endsAt)}
            <span className="mx-1.5">·</span>
            <span className={a.text}>{session.track.name}</span>
            <span className="mx-1.5">·</span>
            {statusOf(session, clock)}
          </p>
          <h3 className="mt-1.5 font-display text-xl font-semibold leading-snug">
            <Link to={`/sessions/${session.id}`} className="hover:text-violet-200 focus-visible:underline">
              {session.title}
            </Link>
          </h3>
          {speakers.length > 0 && (
            <p className="mt-2 text-sm text-white/80">{speakers.map((s) => s.name).join(', ')}</p>
          )}
          {lead && (
            <p className="mt-0.5 text-xs text-muted">{[lead.jobTitle, lead.company].filter(Boolean).join(' · ')}</p>
          )}
          <div className="mt-auto flex items-end justify-between gap-3 pt-6">
            <p className="text-xs text-muted">{session.room.name} · {session.venue.shortName}</p>
            <button
              type="button"
              data-testid={`agenda-remove-${session.id}`}
              onClick={() => toggleSeat(session.id, session)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-300 transition-colors hover:bg-rose-500/20"
            >
              <Icon name="close" className="size-3" /> Remove
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

export function MyAgendaPage() {
  useDocumentTitle('My Agenda');
  const { conference, currentUser, clock, reservationFor } = useConference();
  const { data } = useFetch(() => (currentUser ? api.getSchedule(currentUser.id) : null), [currentUser?.id]);

  const entry = data?.days?.find((d) => d.date === clock.day);
  const sessions = (entry?.sessions ?? [])
    .filter((s) => reservationFor(s.id) === 'confirmed')
    .sort((x, y) => x.startsAt.localeCompare(y.startsAt) || x.id - y.id);

  return (
    <div className="space-y-8">
      <Hero conference={conference} />
      <section data-testid="agenda-day" className="space-y-4">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="font-display text-xl">Your day</h2>
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-faint">{dayLabel(clock.day)}</span>
        </div>
        {!data ? (
          <div className="space-y-3" data-testid="agenda-loading" aria-busy="true">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-[176px] rounded-2xl" />)}
          </div>
        ) : sessions.length === 0 ? (
          <EmptyState icon="ticket" title="Nothing booked for today"
            description="Sessions you take a seat in show up here."
            action={<Link to="/schedule" className="text-sm font-semibold text-violet-300 hover:text-violet-200">Browse the schedule</Link>} />
        ) : (
          <div className="space-y-3">
            {sessions.map((s, i) => <AgendaCard key={s.id} session={s} index={i} />)}
          </div>
        )}
      </section>
    </div>
  );
}
