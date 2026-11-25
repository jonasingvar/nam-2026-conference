import { Link } from 'react-router-dom';
import { accent } from '../lib/accents.js';
import { timeRange } from '../lib/format.js';
import { Avatar, Button, cx } from './ui.jsx';
import { Icon } from './Icon.jsx';

/**
 * One session you hold a seat for today, at My Agenda's scale: big enough for
 * the speakers and the room, not a list row. The rail down its left edge is
 * drawn from the top on load (`rail-draw`, `src/index.css`), `--i` staggering
 * panel after panel down the page.
 *
 * The only action is Release seat — this page never books one (CLAUDE.md §
 * There is exactly one action). `state` is 'upcoming' | 'live' | 'finished'
 * against the conference clock.
 */
export function AgendaSessionPanel({ session, state = 'upcoming', index = 0, onRelease }) {
  const a = accent(session.track.color);
  const speakers = session.speakers ?? [];
  const lead = speakers[0];

  return (
    <article
      data-testid={`agenda-session-${session.id}`}
      data-state={state}
      style={{ '--i': index }}
      className="animate-rise relative flex min-h-44 gap-5 overflow-hidden rounded-xl border border-hairline bg-surface py-5 pl-6 pr-4"
    >
      <span
        data-testid="agenda-rail"
        aria-hidden="true"
        className={cx('rail-draw absolute inset-y-0 left-0 w-[3px]', a.dot)}
      />

      <div className="flex shrink-0 flex-col gap-2">
        {speakers.map((sp) => (
          <Link
            key={sp.id}
            to={`/speakers/${sp.id}`}
            title={`${sp.name} — profile`}
            className="group rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400"
          >
            <Avatar
              name={sp.name}
              initials={sp.initials}
              accent={sp.accent}
              imageUrl={sp.imageUrl}
              size="xl"
              className="transition-transform duration-200 group-hover:scale-105"
            />
            <span className="sr-only">{sp.name}</span>
          </Link>
        ))}
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint">
          {timeRange(session.startsAt, session.endsAt)}
          <span className="mx-1.5">·</span>
          <span className={a.text}>{session.track.name}</span>
          {state === 'live' && (
            <span data-testid="agenda-live" className="text-rose-300">
              <span className="mx-1.5">·</span>Live now
            </span>
          )}
          {state === 'finished' && (
            <span data-testid="agenda-finished">
              <span className="mx-1.5">·</span>Finished
            </span>
          )}
        </p>

        <h3 className="mt-1.5 font-display text-lg leading-snug text-ink">{session.title}</h3>

        <p className="mt-1.5 text-sm text-ink/90">{speakers.map((sp) => sp.name).join(', ')}</p>
        {lead && (
          <p className="text-[12px] text-faint">{[lead.jobTitle, lead.company].filter(Boolean).join(' · ')}</p>
        )}

        <p className="mt-auto pt-6 text-[12px] text-faint">
          {session.room.name} · {session.venue.shortName}
        </p>
      </div>

      <div className="flex shrink-0 items-end">
        <Button
          variant="danger"
          size="sm"
          onClick={() => onRelease(session)}
          data-testid={`agenda-release-${session.id}`}
          aria-label={`Release seat for ${session.title}`}
        >
          <Icon name="close" className="size-3.5" />
          Remove
        </Button>
      </div>
    </article>
  );
}
