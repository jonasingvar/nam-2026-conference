import { Link } from 'react-router-dom';
import { accent } from '../lib/accents.js';
import { timeRange } from '../lib/format.js';
import { relativeToNow } from '../lib/clock.js';
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
export function AgendaSessionPanel({ session, state = 'upcoming', index = 0, now, onRelease }) {
  const a = accent(session.track.color);
  const speakers = session.speakers ?? [];
  const finished = state === 'finished';
  const live = state === 'live';

  return (
    <article
      data-testid={`agenda-session-${session.id}`}
      data-state={state}
      style={{ '--i': index }}
      className={cx(
        'card animate-rise relative min-h-44 overflow-hidden py-5 pl-5 pr-4 sm:min-h-52 sm:py-6 sm:pl-8 sm:pr-6',
        finished && 'opacity-70',
      )}
    >
      <span
        data-testid="agenda-rail"
        aria-hidden="true"
        className={cx(
          'rail-draw absolute inset-y-0 left-0 w-[3px] rounded-full',
          live
            ? 'bg-gradient-to-b from-rose-400 to-violet-500'
            : finished
              ? 'bg-hairline'
              : 'bg-gradient-to-b from-violet-400 via-violet-500 to-cyan-400',
        )}
      />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-6">
        <div className="flex shrink-0 items-center gap-3 sm:w-36 sm:flex-col sm:items-start sm:gap-2">
          <span className="inline-flex items-center gap-1.5 font-mono text-[12px] text-muted">
            <Icon name="clock" className="size-3.5 shrink-0" />
            {timeRange(session.startsAt, session.endsAt)}
          </span>
          {live && (
            <span data-testid="agenda-live" className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-rose-300">
              <span className="size-1.5 animate-pulse-dot rounded-full bg-rose-400" />
              Live now
            </span>
          )}
          {finished && (
            <span data-testid="agenda-finished" className="text-[11px] font-semibold text-faint">
              Finished
            </span>
          )}
          {state === 'upcoming' && now && (
            <span className="text-[11px] font-medium text-violet-300">{relativeToNow(session.startsAt, now)}</span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap gap-2">
            {speakers.map((sp) => (
              <Link
                key={sp.id}
                to={`/speakers/${sp.id}`}
                title={`${sp.name} — profile`}
                className="group flex min-w-0 items-center gap-3 rounded-xl py-1 pr-3 transition-colors hover:bg-overlay/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400"
              >
                <Avatar
                  name={sp.name}
                  initials={sp.initials}
                  accent={sp.accent}
                  imageUrl={sp.imageUrl}
                  size="lg"
                  className="transition-transform duration-200 group-hover:scale-105"
                />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-ink group-hover:text-violet-200">
                    {sp.name}
                  </span>
                  <span className="block truncate text-[12px] text-muted">
                    {[sp.jobTitle, sp.company].filter(Boolean).join(' · ')}
                  </span>
                  {sp.role !== 'Speaker' && <span className="block text-[11px] text-faint">{sp.role}</span>}
                </span>
              </Link>
            ))}
          </div>

          <h3 className="mt-3 font-display text-lg leading-snug text-ink sm:text-xl">{session.title}</h3>

          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-muted">
            <span className="inline-flex items-center gap-1.5">
              <Icon name="pin" className="size-3.5 shrink-0 text-faint" />
              <span className="font-medium text-ink">{session.room.name}</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Icon name="building" className="size-3.5 shrink-0 text-faint" />
              {session.venue.name}
              <span className="text-faint">
                {[session.room.building, session.room.floor].filter(Boolean).join(' · ')}
              </span>
            </span>
            <span className={cx('inline-flex items-center gap-1.5 text-[11px] font-semibold', a.text)}>
              <span className={cx('size-1.5 rounded-full', a.dot)} />
              {session.track.name}
            </span>
          </div>
        </div>

        <div className="shrink-0 sm:pt-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onRelease(session)}
            data-testid={`agenda-release-${session.id}`}
            aria-label={`Release seat for ${session.title}`}
          >
            <Icon name="close" className="size-3.5" />
            Release seat
          </Button>
        </div>
      </div>
    </article>
  );
}
