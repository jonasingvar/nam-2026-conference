import { Link } from 'react-router-dom';
import { useConference, useFetch } from '../lib/store.jsx';
import { useDocumentTitle } from '../lib/useDocumentTitle.js';
import * as api from '../lib/api.js';
import { todaysSeats } from '../lib/agenda.js';
import { hasEnded } from '../lib/clock.js';
import { dayLabel, relativeDate, time as fmtTime, timeRange } from '../lib/format.js';
import { SponsorMarquee } from '../components/SponsorMarquee.jsx';
import { Reveal } from '../components/Reveal.jsx';
import { HeroMedia } from '../components/HeroMedia.jsx';
import { Avatar, Button, Chip, Skeleton, cx } from '../components/ui.jsx';
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
 * Your day — the one section on Home that is about the person reading it.
 *
 * Every session they hold a confirmed seat for on the current conference day,
 * earliest first. Giving a seat back is the only thing possible here: there is
 * no bookmark (CLAUDE.md § There is exactly one action), and nothing is booked
 * from Home.
 *
 * The schedule and the attendee's own reservations arrive after the shell, and
 * at different times. So the section is the height of one card from the first
 * paint and swaps the cards in where the skeleton was; a section that is absent
 * until its data lands — or that says "nothing booked" and then grows cards —
 * shoves the page around, which is the flicker this avoids. For the same reason
 * it is not wrapped in `<Reveal>`, which would animate the swap, and the cards
 * sit in one fixed-height row rather than stacking: the count cannot change the
 * section's height, so the tiles below never move. The cards themselves rise
 * in, one behind the next.
 */
function TodaySeats() {
  const { clock, days, ready, reservationsReady, currentUser, reservationFor,
    releaseSeat, roomById, venueById } = useConference();
  const { data, loading } = useFetch(
    () => (currentUser ? api.getSchedule(currentUser.id) : null),
    [currentUser?.id],
  );

  // Not until the store has both: an empty store means "nothing held" *and*
  // "not loaded yet", and the section must not claim the day is empty while the
  // attendee's own seats are still in flight.
  const waiting = !ready || !reservationsReady || loading;
  const seats = waiting ? [] : todaysSeats(data?.days, clock.day, reservationFor);
  const today = days.find((d) => d.date === clock.day);

  return (
    <section data-testid="today-seats" aria-labelledby="today-seats-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="today-seats-heading" className="font-display text-xl">Your day</h2>
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint">
          {today ? dayLabel(today.date) : ''}
        </span>
      </div>

      {waiting ? (
        <Skeleton className="mt-4 h-[14rem] w-[min(100%,26rem)]" data-testid="today-seat-skeleton" />
      ) : seats.length === 0 ? (
        <p className="mt-4 text-sm text-muted" data-testid="today-seats-empty">
          Nothing booked for today.
        </p>
      ) : (
        <ul className="stagger mt-4 flex h-[14rem] snap-x gap-3 overflow-x-auto overflow-y-hidden">
          {seats.map((s, i) => (
            <TodaySeat key={s.id} index={i} session={s} clock={clock} onRemove={() => releaseSeat(s.id, s)}
              room={roomById[s.room.id]} venue={venueById[s.venue.id]} />
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * One booked session, large enough to carry who is speaking and where it is.
 * The portrait is the way to the speaker, as the ticket asks; the title opens
 * the session itself.
 */
function TodaySeat({ session: s, index, clock, room, venue, onRemove }) {
  const speakers = s.speakers ?? [];

  return (
    <li data-testid="today-seat" data-session-id={s.id} style={{ '--i': Math.min(index, 12) }}
      className="flex h-[14rem] w-[min(100%,26rem)] shrink-0 snap-start gap-4 overflow-hidden rounded-2xl border border-hairline bg-surface p-4">
      <div className="flex shrink-0 flex-col gap-2">
        {speakers.map((sp) => (
          <Link key={sp.id} to={`/speakers/${sp.id}`} aria-label={`About ${sp.name}`}
            className="rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400">
            <Avatar name={sp.name} initials={sp.initials} accent={sp.accent} imageUrl={sp.imageUrl} size="lg" />
          </Link>
        ))}
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint">
          {timeRange(s.startsAt, s.endsAt)}{hasEnded(s, clock) && ' · Finished'}
        </p>
        <h3 className="mt-1 line-clamp-2 font-semibold leading-snug">
          <Link to={`/sessions/${s.id}`} className="hover:text-violet-200">{s.title}</Link>
        </h3>
        {speakers.length > 0 && (
          <>
            <p className="mt-1 truncate text-[13px] text-muted">
              {speakers.map((sp) => sp.name).join(', ')}
            </p>
            <p className="truncate text-xs text-faint">
              {[speakers[0].jobTitle, speakers[0].company].filter(Boolean).join(' · ')}
            </p>
          </>
        )}
        <p className="mt-0.5 truncate text-xs text-faint">{room?.name} · {venue?.shortName}</p>
        <div className="mt-auto pt-3">
          <Button variant="danger" size="sm" data-testid="remove-today-seat" onClick={onRemove}>
            <Icon name="close" className="size-3.5" /> Remove
          </Button>
        </div>
      </div>
    </li>
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
      <ul className="stagger grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {LINKS.map((l, i) => (
          <li key={l.to} style={{ '--i': i }}>
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
function LatestAnnouncement() {
  const { clock, venueById } = useConference();
  const { data } = useFetch(api.getAnnouncements, []);

  const nowIso = `${clock.day}T${clock.time}:00Z`;
  const live = (data ?? [])
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
  const { conference } = useConference();
  useDocumentTitle("ORBIT '26");

  return (
    // Sections hide themselves when empty; hide their Reveal wrapper too, or
    // each one leaves a blank gap in the stack.
    <div className="space-y-8 [&>:empty]:hidden">
      <HeroBar conference={conference} />
      <TodaySeats />
      {/* Each way out enters a beat behind the last, rather than all at once. */}
      <QuickLinks />
      <Reveal><LatestAnnouncement /></Reveal>
      <SponsorMarquee />
    </div>
  );
}
