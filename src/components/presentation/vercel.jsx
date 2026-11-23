import { at, Replay, Code, Label, Kicker, later } from './kit.jsx';

/* ------------------------------------------------------------------ *
 * The Vercel factory — what the label on the issue actually starts.
 * The talk showed the two doors in *Two ways in*; this chapter is the
 * door on this repository: a webhook, one durable Workflow, a Sandbox.
 * ------------------------------------------------------------------ */

const box = 'rounded-2xl border border-hairline bg-surface';
const chip = 'inline-flex items-center rounded-full border px-3 py-0.5 font-mono text-[15px]';

/** One card in the run: an icon, a title, and what happens there. */
function Step({ x, icon, title, sub, delay, children }) {
  return (
    <div className={`${box} pz-appear absolute flex flex-col px-6 py-5`} style={{ ...at(x, 110, 300, 300), ...later(delay) }}>
      <span className="text-[36px] leading-none">{icon}</span>
      <div className="mt-3 font-display text-[25px] leading-tight text-ink">{title}</div>
      <div className="mt-2 text-[16px] leading-snug text-muted">{sub}</div>
      {children && <div className="mt-auto">{children}</div>}
    </div>
  );
}

/** The chevron between two steps, drawn in on the beat. */
function Hop({ x, delay }) {
  return (
    <span className="pz-pop absolute text-[30px] text-violet-300/80" style={{ ...at(x, 235, 40, 40), ...later(delay) }} aria-hidden="true">→</span>
  );
}

function StartScene({ step }) {
  return (
    <Replay on={step === 0}>
      <Step x={80} icon="🏷️" delay={150} title="The label" sub="ready-for-ai on the issue — or /ship or @claude in a comment, from someone with write access.">
        <Label name="ready-for-ai" />
      </Step>
      <Hop x={400} delay={450} />
      <Step x={460} icon="🔔" delay={600} title="The webhook" sub="The repository's own webhook, HMAC-verified: any other repository is refused before anything runs.">
        <span className="font-mono text-[14px] text-faint">factory/app/api/github/route.ts</span>
      </Step>
      <Hop x={780} delay={900} />
      <Step x={840} icon="🔁" delay={1050} title="One durable Vercel Workflow" sub="ship — a single resumable run. Every step's result is kept in the run's event log.">
        <span className={`${chip} border-violet-400/40 bg-violet-500/10 text-violet-200`}>resumable</span>
      </Step>
      <Hop x={1160} delay={1350} />
      <Step x={1220} icon="🖥️" delay={1500} title="Claude Code in a Vercel Sandbox" sub="The run forks the warm sandbox — installed, with Chromium. Every agent and the gate run detached in it.">
        <span className={`${chip} border-emerald-400/40 bg-emerald-500/10 text-emerald-200`}>no npm ci</span>
      </Step>

      <div className={`${box} pz-appear absolute flex items-center gap-4 px-6 py-4`} style={{ ...at(80, 450, 1440, 92), ...later(1900) }}>
        <span className="text-[30px]">💤</span>
        <span className="text-[19px] leading-snug text-muted">
          Nothing waits on a function: the run <b className="text-ink">polls between durable sleeps</b> instead. A redeploy, a crashed function or a sandbox that timed out costs only the job that was running — the workflow resumes where it stopped.
        </span>
      </div>
    </Replay>
  );
}

/* Jev's answer, per job: the least tier that does it right first time. */
const JOBS = [
  ['spec', 'standard', 'a plan from a ticket and the code around it'],
  ['implement', 'standard', 'the change the spec already spelled out'],
  ['audit', 'strong', 'a blocker it must not miss'],
  ['review lens', 'strong', 'a diff it never wrote'],
  ['QA plan', 'lite', 'an exact plan, turned into tests'],
];

const TIER_TONE = {
  lite: 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200',
  standard: 'border-sky-400/40 bg-sky-500/10 text-sky-200',
  strong: 'border-amber-400/40 bg-amber-500/10 text-amber-200',
  frontier: 'border-violet-400/40 bg-violet-500/10 text-violet-200',
};

const TIER = ['lite', 'standard', 'strong', 'frontier'];

function Tier({ name }) {
  return <span className={`${chip} ${TIER_TONE[name]}`}>{name}</span>;
}

function JevScene({ step }) {
  return (
    <Replay on={step === 1}>
      <div className={`${box} pz-appear absolute flex flex-col px-6 py-5`} style={{ ...at(80, 100, 470, 400), ...later(150) }}>
        <Kicker>AI Gateway · a decision model</Kicker>
        <div className="mt-2 font-display text-[34px] text-ink">🧠 Jev</div>
        <div className="mt-2 text-[17px] leading-snug text-muted">Reads the ticket before any agent starts — that is all it does.</div>
        <div className="mt-auto space-y-3">
          <div>
            <div className="text-[16px] text-ink">1 · How much loop does this need?</div>
            <div className="mt-1.5 flex gap-2">
              {['fast', 'small', 'full'].map((s) => <span key={s} className={`${chip} border-hairline bg-overlay/60 text-ink`}>{s}</span>)}
            </div>
          </div>
          <div>
            <div className="text-[16px] text-ink">2 · For each job, the least tier</div>
            <div className="mt-1.5 flex gap-2">{TIER.map((t) => <Tier key={t} name={t} />)}</div>
          </div>
        </div>
      </div>

      <div className={`${box} pz-appear absolute overflow-hidden`} style={{ ...at(590, 100, 930, 400), ...later(600) }}>
        <div className="grid grid-cols-[190px_150px_1fr] border-b border-hairline bg-raised px-6 py-2.5 font-mono text-[13px] uppercase tracking-wider text-faint">
          <span>job</span><span>starts at</span><span>what it has to get right</span>
        </div>
        {JOBS.map(([job, tier, why], i) => (
          <div key={job} className="pz-appear grid grid-cols-[190px_150px_1fr] items-center border-b border-hairline/50 px-6 py-[11px]" style={later(800 + i * 130)}>
            <span className="font-mono text-[17px] text-ink">{job}</span>
            <span><Tier name={tier} /></span>
            <span className="text-[16px] text-muted">{why}</span>
          </div>
        ))}
      </div>

      <div className={`${box} pz-appear absolute flex items-center gap-4 px-6 py-4`} style={{ ...at(80, 530, 1440, 92), ...later(2000) }}>
        <span className="text-[30px]">💸</span>
        <span className="text-[19px] leading-snug text-muted">
          The script starts each job on the tier with the <b className="text-ink">least expected cost from AI Gateway’s live prices</b>, and climbs one tier when a cheap model fails. An ambiguous ticket, a rule with many states, or the harness itself starts at the frontier tier.
        </span>
      </div>
    </Replay>
  );
}

/* The whole lifecycle, on Vercel, in one strip. */
const RAIL = ['label', 'spec', 'gate & audit', 'pull request', 'preview', 'review & QA', 'you merge', 'production health check'];

function ProjectsScene({ step }) {
  return (
    <Replay on={step === 2}>
      {[
        { x: 80, icon: '📱', name: 'nam-2026-conference', role: 'The app', body: 'Vite + React, the Express API as one function. main is production on Turso; every branch gets a preview with its own fresh database.', tone: 'border-emerald-400/40' },
        { x: 820, icon: '🏭', name: 'nam-2026-factory', role: 'The factory', body: 'The durable workflows, the sandboxes and AI Gateway. Its Workflows tab has every run, step by step.', tone: 'border-sky-400/40' },
      ].map((p, i) => (
        <div key={p.name} className={`${box} pz-appear absolute px-6 py-5 ${p.tone}`} style={{ ...at(p.x, 100, 700, 260), ...later(150 + i * 300) }}>
          <Kicker>{p.role}</Kicker>
          <div className="mt-2 flex items-baseline gap-3">
            <span className="text-[30px]">{p.icon}</span>
            <span className="font-display text-[30px] text-ink">▲ {p.name}</span>
          </div>
          <div className="mt-4 text-[18px] leading-snug text-muted">{p.body}</div>
        </div>
      ))}

      <div className="pz-appear absolute flex flex-wrap items-center gap-x-2 gap-y-3" style={{ ...at(80, 385, 1440, 120), ...later(900) }}>
        {RAIL.map((r, i) => (
          <span key={r} className="flex items-center gap-2">
            <span className={`${chip} border-hairline bg-raised text-ink`}>{r}</span>
            {i < RAIL.length - 1 && <span className="text-violet-300/70" aria-hidden="true">→</span>}
          </span>
        ))}
      </div>

      <div className={`${box} pz-appear absolute flex items-center gap-4 px-6 py-4`} style={{ ...at(80, 490, 1440, 92), ...later(1500) }}>
        <span className="text-[30px]">🩺</span>
        <span className="text-[19px] leading-snug text-muted">
          After the merge the run wakes, waits for Vercel to build production, then calls <Code>/api/health</Code> on the new deployment — the change is not counted done until production answers.
        </span>
      </div>
    </Replay>
  );
}

function VercelScene({ step }) {
  return (
    <>
      <StartScene step={step} />
      <JevScene step={step} />
      <ProjectsScene step={step} />
    </>
  );
}

const VERCEL_BEATS = [
  {
    kicker: '3 · What the label starts',
    title: 'One durable Vercel Workflow, from the webhook to a sandbox',
    body: 'On this repository the ready-for-ai label reaches the repository’s webhook, and the webhook starts a single durable Vercel Workflow — ship. Every job is Claude Code in a Vercel Sandbox, and every step’s result is kept, so a run resumes where it stopped instead of starting over.',
  },
  {
    kicker: '3 · Jev',
    title: 'Jev sizes the ticket and picks each job’s model',
    body: 'Jev is a decision model on AI Gateway. It reads the ticket and answers two questions: how much loop this change needs, and — for every job — the least model tier that gets it right first time. The script then starts each job on the tier with the least expected cost from AI Gateway’s live prices, and climbs a tier when a cheap model fails.',
  },
  {
    kicker: '3 · Where it all runs',
    title: 'Two Vercel projects, a preview per branch, a health check per merge',
    body: 'The app and the factory are two Vercel projects. Every branch is a preview and main is production, so review and QA probe the pull request on its own preview. When you merge, the run wakes, waits for production, and calls /api/health before the issue is called done.',
  },
];

export const VERCEL = [
  { id: 'vercel', name: 'The Vercel factory', accent: 'text-sky-300', tone: 'sky', beats: VERCEL_BEATS, Scene: VercelScene },
];
