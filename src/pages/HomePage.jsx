import { Link } from 'react-router-dom';
import { useConference, useFetch } from '../lib/store.jsx';
import { useDocumentTitle } from '../lib/useDocumentTitle.js';
import * as api from '../lib/api.js';
import { plural, relativeDate, time as fmtTime, timeRange } from '../lib/format.js';
import { SponsorMarquee } from '../components/SponsorMarquee.jsx';
import { Reveal } from '../components/Reveal.jsx';
import { HeroMedia } from '../components/HeroMedia.jsx';
import { Avatar, Button, Chip, TrackPill, cx } from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';

/**
 * A slim bar, not a brochure.
 *
 * The page used to open with a marketing headline, four vanity stats and a
 * "programme at a glance" panel — 592px desktop and over a full screen on a
 * phone, none of it about the person holding the phone, all of it known before
 * they bought a ticket.
 */
function HeroBar({ conference }) {
  const { clock, days } = useConference();
  const today = days.find((d) => d.date === clock.day);

  return (
    <section className="relative overflow-hidden rounded-2xl border border-hairline" data-testid="hero">
      <HeroMedia />
      <div className="absolute inset-0 bg-[radial-gradient(30rem_14rem_at_12%_0%,rgba(139,92,246,0.22),transparent_65%)]" />

      <div className="relative flex flex-wrap items-center gap-x-5 gap-y-3 px-5 py-4 sm:px-7 sm:py-5">
        <div className="min-w-0">
          <h1 className="font-display text-2xl leading-none tracking-tight sm:text-3xl">
            {conference.name} <span className="text-muted">{conference.edition}</span>
          </h1>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.16em] text-faint">
            {conference.dates} · {conference.city}
          </p>
        </div>

        {today && (
          <Chip accent="cyan" className="!py-1.5">
            <span className="size-1.5 animate-pulse-dot rounded-full bg-cyan-400" />
            {today.label} · {fmtTime(clock.time)}
          </Chip>
        )}

        <div className="ml-auto flex flex-wrap gap-2">
          <Button to={`/schedule?day=${clock.day}`} variant="primary" size="sm">
            Browse today <Icon name="arrowRight" className="size-3.5" />
          </Button>
          <Button to="/speakers" size="sm">Speakers</Button>
        </div>
      </div>
    </section>
  );
}

/**
 * The seats held for the day the conference is on, earliest first.
 *
 * The store, not the schedule payload the page was fetched with, decides what
 * is still mine: a seat given back here has to leave immediately, and one
 * dropped on another page must not be resurrected by a stale payload.
 */
function TodaySessions({ booked }) {
  const { releaseSeat, roomById, venueById } = useConference();
  if (booked.length === 0) return null;

  return (
    <section data-testid="home-today" className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="font-display text-xl sm:text-2xl">Your day</h2>
        <p className="text-[12px] text-muted">{plural(booked.length, 'session')} with a seat held</p>
      </div>

      <ul className="space-y-3">
        {booked.map((s) => {
          const room = roomById[s.room.id];
          const venue = venueById[s.venue.id];
          return (
            <li key={s.id}>
              <article
                data-testid={`home-session-${s.id}`}
                className="flex flex-col gap-4 rounded-2xl border border-hairline bg-surface p-4 sm:flex-row sm:items-start sm:gap-5 sm:p-5"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    <TrackPill track={s.track} />
                    <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-muted">
                      <Icon name="clock" className="size-3 shrink-0 text-faint" />
                      {timeRange(s.startsAt, s.endsAt)}
                    </span>
                  </div>

                  <h3 className="mt-2 font-display text-lg leading-snug sm:text-xl">
                    <Link to={`/sessions/${s.id}`} className="transition-colors hover:text-violet-200">
                      {s.title}
                    </Link>
                  </h3>

                  <p className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12.5px] text-muted">
                    <span className="inline-flex items-center gap-1.5">
                      <Icon name="pin" className="size-3.5 shrink-0 text-faint" />
                      {room?.name ?? s.room.name}
                    </span>
                    <span aria-hidden="true" className="text-overlay">·</span>
                    <span className="truncate">{venue?.name ?? s.venue.name}</span>
                  </p>

                  {s.speakers?.length > 0 && (
                    <div className="mt-3.5 flex flex-wrap gap-x-5 gap-y-3 border-t border-hairline pt-3.5">
                      {s.speakers.map((sp) => (
                        <Link
                          key={sp.id}
                          to={`/speakers/${sp.id}`}
                          className="group flex min-w-0 items-center gap-3 rounded-xl"
                        >
                          <Avatar name={sp.name} initials={sp.initials} accent={sp.accent} imageUrl={sp.imageUrl} size="lg" />
                          <span className="min-w-0">
                            <span className="block truncate font-semibold transition-colors group-hover:text-violet-200">
                              {sp.name}
                            </span>
                            <span className="block truncate text-xs text-muted">{sp.company}</span>
                          </span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>

                <Button
                  variant="danger" size="sm" className="shrink-0 self-start"
                  data-testid={`home-unreserve-${s.id}`}
                  onClick={() => releaseSeat(s.id, s)}
                >
                  <Icon name="close" className="size-3.5" /> Remove seat
                </Button>
              </article>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** The main pages, one tap each — a way in, not a feed. */
const LINKS = [
  { to: '/schedule', label: 'Schedule', blurb: 'Every session, by day, room and track', icon: 'calendar' },
  { to: '/speakers', label: 'Speakers', blurb: 'Who is on stage, A to Z', icon: 'users' },
  { to: '/venues', label: 'Venues', blurb: 'Both sites, their rooms and getting between them', icon: 'building' },
  { to: '/food', label: 'Food & drink', blurb: 'What is open, and where', icon: 'food' },
  { to: '/expo', label: 'Expo', blurb: 'Partners and sponsors', icon: 'grid' },
];

function QuickLinks() {
  return (
    <nav aria-label="Explore the conference" data-testid="quick-links">
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {LINKS.map((l) => (
          <li key={l.to}>
            <Link to={l.to}
              className="group flex items-start gap-3 rounded-xl border border-hairline bg-surface p-4 transition-colors hover:border-white/20 hover:bg-raised">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-violet-500/12 text-violet-300">
                <Icon name={l.icon} className="size-4" />
              </span>
              <span className="min-w-0">
                <span className="block font-semibold group-hover:text-violet-200">{l.label}</span>
                <span className="block text-[13px] text-muted">{l.blurb}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * One announcement, and only one that has actually been posted.
 *
 * This used to render the first two pinned rows regardless of `postedAt`, so a
 * warning about day 3 appeared on day 2 — before it was written.
 */
function LatestAnnouncement({ announcements }) {
  const { clock, venueById } = useConference();

  const nowIso = `${clock.day}T${clock.time}:00Z`;
  const live = (announcements ?? [])
    .filter((a) => a.postedAt <= nowIso)
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.postedAt.localeCompare(a.postedAt));

  const item = live[0];
  if (!item) return null;

  const tone = {
    warning: 'border-amber-500/25 bg-amber-500/[0.07] text-amber-200',
    success: 'border-emerald-500/25 bg-emerald-500/[0.07] text-emerald-200',
    info: 'border-sky-500/25 bg-sky-500/[0.07] text-sky-200',
  }[item.kind] ?? 'border-sky-500/25 bg-sky-500/[0.07] text-sky-200';

  return (
    <section className={cx('flex gap-3 rounded-2xl border p-4', tone)} data-testid="announcements">
      <Icon name={item.kind === 'warning' ? 'alert' : 'info'} className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-2">
          <h2 className="text-sm font-semibold">{item.title}</h2>
          <span className="text-[11px] text-faint">
            {relativeDate(item.postedAt, clock)}
            {item.venueId && ` · ${venueById[item.venueId]?.shortName}`}
          </span>
        </div>
        <p className="mt-1 text-[13px] leading-relaxed text-muted">{item.body}</p>
      </div>
    </section>
  );
}

export function HomePage() {
  const { conference, currentUser, clock, reservationFor } = useConference();
  useDocumentTitle("ORBIT '26");

  // The page paints in one go. Its two fetched sections are held here, so the
  // tiles are not drawn first and then shoved down the page when the seats
  // arrive above them — the flicker the tiles-then-speakers order gave off.
  const { data: schedule, loading: loadingDay } = useFetch(
    () => (currentUser ? api.getSchedule(currentUser.id) : Promise.resolve(null)),
    [currentUser?.id],
  );
  const { data: announcements, loading: loadingNews } = useFetch(api.getAnnouncements, []);

  // Only a confirmed seat is a chair held; a waitlist place may never come good.
  const booked = (schedule?.days?.find((d) => d.date === clock.day)?.sessions ?? [])
    .filter((s) => reservationFor(s.id) === 'confirmed');

  return (
    // Sections hide themselves when empty; hide their Reveal wrapper too, or
    // each one leaves a blank gap in the stack.
    <div className="space-y-8 [&>:empty]:hidden">
      <HeroBar conference={conference} />
      {!(loadingDay || loadingNews) && (
        <>
          <Reveal><TodaySessions booked={booked} /></Reveal>
          <QuickLinks />
          <Reveal><LatestAnnouncement announcements={announcements} /></Reveal>
          <SponsorMarquee />
        </>
      )}
    </div>
  );
}
