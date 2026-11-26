import { Link } from 'react-router-dom';
import { timeRange } from '../lib/format.js';
import { hasEnded, toMinutes } from '../lib/clock.js';
import { accentHex } from '../lib/accents.js';
import { Avatar } from './ui.jsx';
import { Icon } from './Icon.jsx';

function statusOf(session, clock) {
  if (hasEnded(session, clock)) return 'Finished';
  if (session.day === clock.day && toMinutes(session.startsAt) <= toMinutes(clock.time)) return 'Happening now';
  return 'Upcoming';
}

/**
 * One seat you hold, large enough for who is speaking and where. The title's
 * link is stretched over the whole card; portraits and Remove sit above it.
 */
export function AgendaCard({ session, clock, onRemove }) {
  const [rail] = accentHex(session.track.color);
  const [first] = session.speakers;

  return (
    <article
      data-testid={`agenda-card-${session.id}`}
      className="agenda-card group relative flex gap-5 overflow-hidden rounded-2xl border border-hairline bg-ground py-5 pl-6 pr-5 sm:pl-8"
    >
      <span
        aria-hidden="true"
        data-testid="agenda-rail"
        className="animate-rail-draw absolute inset-y-0 left-0 w-1"
        style={{ background: rail }}
      />

      <div className="flex shrink-0 flex-col gap-3">
        {session.speakers.map((sp) => (
          <Link
            key={sp.id}
            to={`/speakers/${sp.id}`}
            aria-label={`${sp.name}, speaker profile`}
            className="relative z-10 block rounded-full transition-transform duration-200 hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400"
          >
            <Avatar name={sp.name} initials={sp.initials} accent={sp.accent} imageUrl={sp.imageUrl} size="xl" className="!size-16 sm:!size-24" />
          </Link>
        ))}
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint">
          {timeRange(session.startsAt, session.endsAt)}
          <span> · </span>
          <span className="font-semibold" style={{ color: rail }}>{session.track.name}</span>
          <span> · {statusOf(session, clock)}</span>
        </p>
        <h3 className="mt-1.5 font-display text-lg leading-snug sm:text-xl">
          <Link
            to={`/sessions/${session.id}`}
            className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-2 focus-visible:outline-violet-400"
          >
            {session.title}
          </Link>
        </h3>
        {first && (
          <>
            <p className="mt-2 text-sm">{session.speakers.map((sp) => sp.name).join(', ')}</p>
            <p className="text-xs text-muted">{[first.jobTitle, first.company].filter(Boolean).join(' · ')}</p>
          </>
        )}

        <div className="mt-auto flex flex-wrap items-end justify-between gap-3 pt-5">
          <p className="text-xs text-muted">
            {session.room.name}{session.venue.shortName && ` · ${session.venue.shortName}`}
          </p>
          <button
            type="button"
            onClick={onRemove}
            data-testid={`agenda-remove-${session.id}`}
            aria-label={`Remove ${session.title} from my agenda`}
            className="relative z-10 inline-flex items-center gap-1.5 rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-300 transition-colors hover:bg-rose-500/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-400"
          >
            <Icon name="close" className="size-3.5" /> Remove
          </button>
        </div>
      </div>
    </article>
  );
}
