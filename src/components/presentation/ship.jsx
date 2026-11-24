import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { at, Show, Replay, Code, Label, Model, Kicker, Tick, Token, Flip, Meter, Vercel, IssueIcon, PrIcon, MergeIcon, later, box } from './kit.jsx';
import { Wf, Switchboard, Sizing, Ladder, Fork, Network, Durable, Climb, Asleep } from './platform.jsx';

/* ------------------------------------------------------------------ *
 * One ship run — the spine of the talk. Eleven phases along a rail, the
 * run's own (factory/workflows/ship.ts PHASES) in its order, and the
 * ticket riding it from Triage to Production. The rail stays on screen
 * the whole way, so the room always knows where it is; each Vercel
 * piece (platform.jsx) is explained at the station where it happens.
 * ------------------------------------------------------------------ */

const STATIONS = [
  { id: 'triage', label: 'Triage', icon: '🧭' },
  { id: 'plan', label: 'Plan', icon: '📄' },
  { id: 'plan-audit', label: 'Plan audit', icon: '🔎' },
  { id: 'build', label: 'Build', icon: '🛠️' },
  { id: 'gate', label: 'Gate', icon: '🚦' },
  { id: 'audit', label: 'Audit', icon: '🧐' },
  { id: 'pr', label: 'Pull request', icon: '🔀' },
  { id: 'preview', label: 'Preview', icon: '🔗' },
  { id: 'checks', label: 'Review & QA', icon: '🔍' },
  { id: 'merge', label: 'Merge', icon: '👤' },
  { id: 'production', label: 'Production', icon: '🚀' },
];

const STATION_W = 118;
const STATION_H = 50;
const SX = (i) => 80 + i * 132.2;
const STATION_Y = 58;
const RAIL_Y = 126;
/** Under the rail: the panel every stop draws in. */
const PANEL = at(80, 150, 1440, 460);
const center = (i) => SX(i) + STATION_W / 2;
const TOKEN_W = 82;

/** The rail under the stations, and the ticket riding it. */
function Rail({ active }) {
  const x = active < 0 ? 80 : center(active);
  return (
    <>
      <div style={at(80, RAIL_Y, 1440, 2)} className="rounded-full bg-hairline" />
      <div style={{ ...at(80, RAIL_Y, Math.max(0, x - 80), 2) }} className="rounded-full bg-gradient-to-r from-violet-500 to-cyan-300 transition-[width] duration-1000 ease-out" />
      <Token
        className="absolute"
        initial={{ left: 80 - TOKEN_W / 2, top: RAIL_Y - 14, scale: 0.9 }}
        animate={{ left: x - TOKEN_W / 2, top: RAIL_Y - 14, scale: 1 }}
        transition={{ type: 'spring', stiffness: 80, damping: 14 }}
      />
      {active === STATIONS.length - 1 && (
        <span className="pz-pop absolute z-10 rounded-full border border-emerald-300 bg-emerald-700 px-2.5 font-mono text-[13px] font-semibold leading-6 text-white shadow-[0_0_20px_-2px_rgba(52,211,153,0.9)]" style={{ left: x - TOKEN_W / 2 - 74, top: RAIL_Y - 12, animationDelay: '900ms' }}>✓ live</span>
      )}
    </>
  );
}

function Station({ s, state = 'idle' }) {
  return (
    <div
      className={`flex size-full items-center justify-center gap-1.5 rounded-xl border transition-all duration-500
        ${state === 'active' ? 'pz-glow -translate-y-0.5 border-violet-400/70 bg-raised' : 'border-hairline bg-surface'}
        ${state === 'next' ? 'opacity-45' : ''} ${state === 'skipped' ? 'border-dashed opacity-60' : ''}`}
    >
      <span className="text-[16px] leading-none">{s.icon}</span>
      <span className={`whitespace-nowrap text-[13.5px] font-semibold ${state === 'active' ? 'text-ink' : 'text-muted'} ${state === 'skipped' ? 'line-through decoration-faint' : ''}`}>{s.label}</span>
      {state === 'done' && <span className="pz-pop absolute -right-1.5 -top-2"><Tick className="size-5 text-[10px]" /></span>}
      {state === 'skipped' && <span className="pz-pop absolute -right-1.5 -top-2 rounded-full border border-hairline bg-ground px-1.5 font-mono text-[10px] text-faint">skipped</span>}
    </div>
  );
}

function Stations({ active }) {
  return STATIONS.map((s, i) => {
    // a small ticket has no plan audit: the run strikes that phase, as its progress comment does
    const state = active < 0 ? 'idle' : i < active ? (s.id === 'plan-audit' ? 'skipped' : 'done') : i === active ? 'active' : 'next';
    return (
      <div key={s.id} style={at(SX(i), STATION_Y, STATION_W, STATION_H)} className="relative">
        <Station s={s} state={state} />
        {/* the stamp: a ring leaves the station the moment the ticket arrives */}
        {state === 'active' && <span key={active} className="pz-ping pointer-events-none absolute inset-0 rounded-xl border-2 border-violet-300" aria-hidden="true" />}
      </div>
    );
  });
}

function Row({ icon, title, sub, delay }) {
  return (
    <div className="pz-appear flex items-center gap-4 rounded-xl border border-hairline bg-raised px-4 py-4" style={later(delay)}>
      <span className="w-8 text-center text-[24px]">{icon}</span>
      <div className="min-w-0">
        <div className="text-[18px] font-semibold text-ink">{title}</div>
        <div className="truncate text-[15px] text-muted">{sub}</div>
      </div>
    </div>
  );
}

/* ----------------------------- Triage ----------------------------- */

function TriageDetail() {
  return (
    <div className="grid h-full grid-cols-[1fr_1.45fr_1fr] gap-6">
      <div className={`${box} flex flex-col p-6`}>
        <Kicker>The ticket</Kicker>
        <div className="mt-3 font-display text-[24px] leading-tight text-ink">#140 Keep sessions in view on mobile</div>
        <div className="mt-4 space-y-2 text-[15px] text-muted">
          {['first session in view on a phone', 'every filter still there', 'laptop unchanged'].map((d, i) => (
            <div key={d} className="pz-appear flex gap-2" style={later(200 + i * 150)}><span className="text-violet-300">☐</span>{d}</div>
          ))}
        </div>
        <div className="pz-appear mt-auto flex items-center gap-2 border-t border-hairline pt-4" style={later(900)}>
          <span className="text-[14px] text-faint">labels</span>
          <span className="pz-strike text-violet-300" style={later(1300)}><Label name="ready-for-ai" className="text-[12px]" /></span>
          <Label name="ai-working" className="pz-pop text-[12px]" style={later(1300)} />
        </div>
      </div>
      <div className="flex flex-col justify-between">
        <Row icon="🏷️" title="Claim it" sub={<>label <Label name="ai-working" className="mx-1 text-[12px]" /> and one run token: a second label starts nothing</>} delay={300} />
        <Row icon="💬" title="Say so on the issue" sub="one comment, edited at every phase from here to production" delay={650} />
        <Row icon="🧮" title="Size it" sub="Jev: how big a job is this? — next slide" delay={1000} />
        <Row icon="🪜" title="Choose the models" sub="one more call: a tier for each of the run’s nine jobs" delay={1350} />
      </div>
      <div className="pz-appear flex flex-col justify-center rounded-2xl border border-violet-400/40 bg-raised p-6" style={later(1800)}>
        <Kicker>All of this</Kicker>
        <div className="mt-3 font-display text-[40px] leading-none text-ink">about a second</div>
        <div className="mt-3 text-[17px] text-muted">No machine has started yet. Triage is the workflow itself deciding what this run should be, before it spends anything on it.</div>
      </div>
    </div>
  );
}

/* ------------------------------ Plan ------------------------------ */

const SPEC_LINES = [
  { t: '# Keep sessions in view on mobile', c: 'text-ink font-semibold' },
  { t: '## What this changes', c: 'text-violet-300' },
  { t: 'Below lg the opened filter rail is compact: days in one row, selects in two columns.', c: 'text-muted' },
  { t: '## Where', c: 'text-violet-300' },
  { t: 'src/pages/SchedulePage.jsx — the rail · tests/schedule.spec.js', c: 'text-muted' },
  { t: '## How it will be proved', c: 'text-violet-300' },
  { t: '| first card in view | phone, Filters open | spec |', c: 'text-emerald-300' },
  { t: '## Decisions', c: 'text-violet-300' },
  { t: 'Hide the My Agenda card below lg — OK?', c: 'text-amber-300' },
];

function SpecDetail() {
  return (
    <div className="grid h-full grid-cols-[1.6fr_1fr] gap-6">
      <div className="overflow-hidden rounded-2xl border border-hairline bg-[#0d0f15]">
        <div className="flex border-b border-hairline bg-surface font-mono text-[13px]">
          <span className="border-r border-hairline bg-[#0d0f15] px-4 py-2 text-ink">specs/140-keep-sessions-in-view-on.md</span>
        </div>
        <div className="space-y-1.5 px-6 py-4 font-mono text-[16px]">
          {SPEC_LINES.map((l, i) => <div key={i} className={`pz-appear ${l.c}`} style={later(150 + i * 220)}>{l.t}</div>)}
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <div className={`${box} px-5 py-3 font-mono text-[15px]`}>
          <div className="pz-appear text-amber-300" style={later(2100)}>● docs(spec): plan compact mobile filters</div>
          <div className="pz-appear mt-1 text-faint" style={later(2300)}>the first commit on <span className="text-muted">issue-140-keep-sessions-in-view-on</span></div>
        </div>
        <div className="pz-appear rounded-2xl border border-amber-400/40 bg-raised px-5 py-3" style={later(2500)}>
          <div className="flex items-center gap-2 text-[15px] text-muted"><span className="rounded-full border border-amber-400/60 bg-amber-500/20 px-2.5 font-mono text-[13px] text-amber-100">Jev</span> was only 55% sure, so the plan’s facts decide:</div>
          <div className="mt-1.5 flex items-baseline gap-3"><span className="font-display text-[26px] text-ink">small</span><span className="text-[15px] text-muted">layout at stake → a browser audit too · two rounds</span></div>
        </div>
        <div className={`${box} pz-appear flex flex-1 items-center px-5 py-3 text-[19px] leading-snug text-muted`} style={later(2800)}><div>
          Its <b className="text-ink">Where</b> names the files and the tests, so the builder searches for nothing — and a reviewer reads the <b className="text-ink">intent before the diff</b>.</div>
        </div>
        <div className="pz-appear rounded-2xl border-2 border-dashed border-amber-400/60 bg-amber-500/10 px-5 py-2.5" style={later(3100)}>
          <div className="flex items-center gap-3"><Label name="needs-human" className="shrink-0 whitespace-nowrap text-[12px]" /><span className="text-[15px] text-muted">No outcome a check could be written against? The planner hands it back before a line of code.</span></div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ Build ----------------------------- */

function BuildDetail() {
  return (
    <div className="grid h-full grid-cols-[1fr_auto_1fr] items-stretch gap-5">
      <div className={`${box} flex flex-col p-5`}>
        <Kicker>1 · the check first</Kicker>
        <div className="mt-3 rounded-xl bg-[#0d0f15] p-4 font-mono text-[15px] leading-relaxed">
          <div className="text-violet-300">test(<span className="text-emerald-300">'on a phone the open filter</span></div>
          <div className="pl-4 text-emerald-300">rail leaves the first session in view'</div>
          <div className="pl-4 text-muted">await page.getByRole('button', {'{'} name: 'Filters' {'}'}).click()</div>
          <div className="pl-4 text-muted">await expect(firstCard).toBeInViewport()</div>
        </div>
        <div className="pz-appear mt-4 flex items-center gap-3 text-[18px] text-rose-300" style={later(600)}><Tick ok={false} /> fails — the filters fill the screen</div>
        <div className="pz-appear mt-2 font-mono text-[14px] text-amber-300" style={later(900)}>● test(schedule): first session stays in view</div>
      </div>
      <div className="flex items-center text-[34px] text-violet-300">→</div>
      <div className={`${box} flex flex-col p-5`}>
        <div className="flex items-center justify-between"><Kicker>2 · then the change</Kicker><Model m="deepseek" className="pz-pop" style={later(1300)} /></div>
        <div className="pz-appear mt-3 rounded-xl bg-[#0d0f15] p-4 font-mono text-[15px] leading-relaxed" style={later(1300)}>
          <div className="text-faint">src/pages/SchedulePage.jsx</div>
          <div className="bg-rose-500/10 text-rose-300">- &lt;div className="space-y-6"&gt;</div>
          <div className="bg-emerald-500/10 text-emerald-300">+ &lt;div className="grid grid-cols-2 gap-2</div>
          <div className="bg-emerald-500/10 pl-4 text-emerald-300">+   lg:block lg:space-y-6"&gt;</div>
        </div>
        <div className="pz-appear mt-4 flex items-center gap-3 text-[18px] text-emerald-300" style={later(2100)}><Tick /> passes</div>
        <div className="pz-appear mt-2 text-[16px] text-muted" style={later(2400)}>The docs that describe what changed are updated in the same push.</div>
      </div>
    </div>
  );
}

/* ------------------------------ Gate ------------------------------ */

const GATE = [
  ['Unit and API tests', 'every one, in about a second'],
  ['Browser tests, desktop and mobile', 'the whole suite — or, on a fast run, the specs the change reaches'],
  ['Tests it deleted or skipped', 'listed for the auditor — a test cannot quietly go missing'],
];

function GateDetail() {
  return (
    <div className="grid h-full grid-cols-[1fr_420px] gap-6">
      <div className={`${box} flex flex-col gap-3 p-6`}>
        <Kicker>scripts/gate.mjs — a command, not an agent</Kicker>
        {GATE.map(([what, how], i) => (
          <div key={what} className="pz-appear flex items-center gap-4 rounded-xl bg-raised px-5 py-3" style={later(300 + i * 350)}>
            <Tick />
            <div>
              <div className="text-[21px] text-ink">{what}</div>
              <div className="text-[16px] text-muted">{how}</div>
            </div>
          </div>
        ))}
      </div>
      <div className={`${box} pz-appear flex flex-col justify-center p-6`} style={later(1500)}>
        <div className="font-mono text-[26px] text-emerald-300">{'{"ok":true}'}</div>
        <div className="mt-3 text-[20px] text-muted">
          The workflow reads the result, not the agent’s word. <b className="text-ink">Red goes to a fixer one tier up</b>, however sure the builder sounded.
        </div>
      </div>
    </div>
  );
}

/* The same test run twice: with the change, then with the old code put back. */
function Run({ file, tone, children }) {
  return (
    <div className={`flex h-full flex-col justify-center rounded-xl border px-5 py-4 ${tone}`}>
      <div className="font-mono text-[14px] text-faint">src/pages/</div>
      <div className="font-mono text-[18px] text-ink">{file}</div>
      <div className="mt-1 font-mono text-[14px]">{children}</div>
    </div>
  );
}

function Result({ ok, label }) {
  return (
    <div className={`flex h-full items-center gap-3 rounded-xl px-5 text-[22px] ${ok ? 'bg-emerald-500/10 text-emerald-300' : 'bg-rose-500/10 text-rose-300'}`}>
      <Tick ok={ok} /> {label}
    </div>
  );
}

function RedCheckDetail() {
  const FLIP = 1300;
  return (
    <div className="grid h-full grid-cols-[1fr_1fr] gap-6">
      <div className={`${box} flex flex-col p-6`}>
        <Kicker>1 · With the change</Kicker>
        <div className="mt-3 h-[96px]"><Run file="SchedulePage.jsx" tone="border-emerald-400/40 bg-emerald-500/[0.06]"><span className="text-emerald-300">+ grid grid-cols-2 gap-2 lg:block</span></Run></div>
        <div className="pz-appear mt-4 h-[64px]" style={later(300)}><Result ok label="first session stays in view — passes" /></div>
        <div className="pz-appear mt-3 text-[18px] text-muted" style={later(700)}>Green, across the whole gate. Green alone proves little.</div>
      </div>
      <div className={`${box} flex flex-col p-6`}>
        <Kicker>2 · The old code put back</Kicker>
        <Flip
          className="mt-3 h-[96px]"
          delay={FLIP}
          front={<Run file="SchedulePage.jsx" tone="border-emerald-400/40 bg-emerald-500/[0.06]"><span className="text-emerald-300">+ grid grid-cols-2 gap-2 lg:block</span></Run>}
          back={<Run file="SchedulePage.jsx" tone="border-amber-400/50 bg-amber-500/[0.08]"><span className="text-amber-300">origin/main — the fix reverted, the test kept</span></Run>}
        />
        <Flip
          className="mt-4 h-[64px]"
          delay={FLIP + 350}
          front={<Result ok label="first session stays in view — passes" />}
          back={<Result ok={false} label="first session stays in view — fails" />}
        />
        <div className="pz-appear mt-3 text-[18px] text-emerald-300" style={later(FLIP + 1200)}>… which is the point: the test can tell the two apart.</div>
      </div>
      <div className="pz-appear col-span-2 rounded-xl border border-hairline bg-raised px-6 py-4 text-[19px] text-muted" style={later(FLIP + 1700)}>
        <Code>scripts/red-check.mjs</Code> puts the old code back and runs the new tests: <b className="text-ink">a test that still passes without the fix proves nothing</b>. If one does, the auditor is told and the pull request says so.
      </div>
    </div>
  );
}

/* ------------------------------ Audit ----------------------------- */

// a small ticket's auditors; a full one splits the read in two and audits the plan first
const LENSES = [
  { icon: '🎯', name: 'The auditor', reads: 'the Done when and the repo’s rules, in one read' },
  { icon: '🖥️', name: 'The browser auditor', reads: 'drives the app — here because the layout is at stake' },
  { icon: '➕', name: 'On a full ticket', reads: 'separate criteria and rules auditors', more: true },
];

const FINDINGS = [
  { lens: 'Auditor', text: 'The My agenda count is hidden on phones', verdict: 'refuted — the count is in the mobile nav', ok: false },
  { lens: 'Auditor', text: 'The rail’s gap is not the other panels’ gap', verdict: 'refuted — a nitpick; nobody is hurt', ok: false },
  { lens: 'Browser', text: 'At 360 px the search field is off-screen', verdict: 'shown: the field’s min-width is wider than 360 px — a blocker', ok: true },
];

// [layer, is it an agent, where its holes are] — the gate and red-check are scripts
const SLICES = [
  ['auditor', true, [[8, 15], [70, 55]]],
  ['browser', true, [[30, 60], [85, 10]]],
  ['skeptic', true, [[55, 20], [12, 62]]],
  ['gate', false, [[20, 30]]],
  ['red-check', false, [[88, 40]]],
  ['review & QA', true, [[78, 58], [40, 8]]],
];

function AuditDetail() {
  return (
    <div className="flex h-full flex-col gap-4">
      <div className="grid grid-cols-3 gap-5">
        {LENSES.map((l, i) => (
          <div key={l.name} className={`pz-appear flex items-center gap-4 rounded-2xl border px-5 py-3.5 ${l.more ? 'border-dashed border-hairline' : 'border-hairline bg-surface'}`} style={later(i * 150)}>
            <span className={`text-[30px] ${l.more ? 'opacity-60' : ''}`}>{l.icon}</span>
            <div>
              <div className={`text-[19px] font-semibold ${l.more ? 'text-muted' : 'text-ink'}`}>{l.name}</div>
              <div className="text-[15px] text-muted">{l.reads}</div>
            </div>
          </div>
        ))}
      </div>
      {FINDINGS.map((f, i) => {
        const verdictAt = 2200 + i * 350;
        return (
          <div key={f.text} className="grid grid-cols-[1.4fr_auto_1fr] items-center gap-5">
            <div className="pz-appear relative rounded-xl border border-amber-400/30 bg-amber-500/5 px-5 py-3 text-[17px] text-ink" style={later(700 + i * 300)}>
              <span className="mr-2 font-mono text-[13px] text-amber-300">{f.lens}</span>
              {/* the skeptic's pen: refuted findings are struck through as the verdict lands */}
              <span className={f.ok ? '' : 'pz-strike text-rose-300'} style={f.ok ? undefined : later(verdictAt)}><span className="text-ink">{f.text}</span></span>
              {f.ok && (
                <span className="pz-stamp absolute right-5 -top-3.5 rounded-md border-2 border-rose-400 bg-ground/80 px-2 py-0.5 font-mono text-[12px] font-bold uppercase tracking-[0.2em] text-rose-300" style={later(verdictAt + 100)}>blocker</span>
              )}
            </div>
            <div className="pz-appear rounded-full border border-hairline bg-overlay px-4 py-1.5 text-[15px] text-muted" style={later(1700 + i * 350)}>🧐 a skeptic</div>
            <div className={`pz-appear rounded-xl px-4 py-3 text-[17px] ${f.ok ? 'border border-rose-400/50 bg-rose-500/10 text-rose-200' : 'text-faint'}`} style={later(verdictAt)}>
              {f.verdict}
            </div>
          </div>
        );
      })}
      {/* the Swiss cheese: every layer has holes, but they do not line up */}
      <div className="pz-appear mt-auto flex items-center gap-3 rounded-xl border border-hairline bg-raised px-5 py-3" style={later(3400)}>
        <span className="text-[26px]">🧀</span>
        {SLICES.map(([name, ai, holes]) => (
          <span key={name} className={`relative flex h-11 flex-1 items-center justify-center overflow-hidden rounded-lg text-[14px] font-semibold ${ai ? 'bg-amber-400/20 text-amber-100' : 'bg-emerald-400/20 text-emerald-100'}`}>
            {holes.map(([x, y]) => <span key={`${x}-${y}`} className="absolute size-3 rounded-full bg-ground/70" style={{ left: `${x}%`, top: `${y}%` }} />)}
            <span className="relative">{name}</span>
          </span>
        ))}
        <span className="ml-2 text-[15px] text-muted">no hole goes all the way through</span>
      </div>
    </div>
  );
}

function LoopDetail() {
  const nodes = [
    { label: '🛠️ Fix', x: 190, y: 40 },
    { label: '🚦 Gate', x: 330, y: 250 },
    { label: '🧐 Audit', x: 50, y: 250 },
  ];
  return (
    <div className="grid h-full grid-cols-[520px_1fr] items-center gap-8">
      <div className="relative h-[400px]">
        <svg viewBox="0 0 520 400" className="absolute inset-0 size-full" aria-hidden="true">
          <circle cx="260" cy="200" r="150" fill="none" stroke="#333950" strokeWidth="3" />
          <circle cx="260" cy="200" r="150" pathLength="1" className="pz-flow" fill="none" stroke="#fbbf24" strokeWidth="3" />
        </svg>
        {nodes.map((n, i) => (
          <div key={n.label} className={`${box} pz-appear absolute grid h-[86px] w-[140px] place-items-center text-[20px] font-semibold text-ink`} style={{ left: n.x, top: n.y, ...later(i * 200) }}>
            {n.label}
          </div>
        ))}
        <div className="pz-appear absolute left-[205px] top-[170px] text-center font-mono text-[14px] text-amber-300" style={later(700)}>until a round<br />comes back clean</div>
      </div>
      <div className="flex flex-col justify-center gap-3">
        <div className="pz-appear flex items-center gap-4 rounded-xl border border-rose-400/40 bg-rose-500/10 px-5 py-3 text-[19px] text-rose-200" style={later(400)}>
          <span className="font-mono text-[15px] text-faint">Round 1</span> 1 blocker — the search field at 360 px
        </div>
        <div className="pz-appear flex items-center gap-4 rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-5 py-3 text-[19px] text-emerald-200" style={later(1500)}>
          <span className="font-mono text-[15px] text-faint">Round 2</span> clean <Tick className="ml-auto" />
        </div>
        <div className="pz-appear mt-2 space-y-2 text-[18px] text-muted" style={later(2100)}>
          <div>• The round limit is a number in a file: <b className="text-ink">two</b> for a small ticket like this one, <b className="text-ink">four</b> for a full one.</div>
          <div>• What the audit caught can become a line in the docs the next agent reads.</div>
          <div>• The same finding back a third time means the fixer cannot fix it — <b className="text-amber-300">hand it to a person</b>.</div>
        </div>
      </div>
    </div>
  );
}

/* -------------------------- Pull request -------------------------- */

const FOLDED = ['✅ Done when (3)', '🧪 Try it', '👀 Where to look', 'Every file changed', 'Audit rounds'];

function PrDetail() {
  return (
    <div className="grid h-full grid-cols-[1.5fr_1fr] gap-6">
      <div className={`${box} overflow-hidden`}>
        <div className="border-b border-hairline px-6 py-3.5">
          <div className="font-display text-[24px] leading-tight text-ink">Keep sessions in view on mobile <span className="font-sans font-normal text-faint">#142</span></div>
          <div className="mt-2 flex items-center gap-2 text-[14px]">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-1 font-semibold text-white"><PrIcon /> Open</span>
            <span className="text-muted">Closes #140 · 📄 Spec</span>
            <Label name="ship:small" className="pz-pop ml-auto text-[12px]" />
          </div>
        </div>
        <div className="space-y-4 px-6 py-5 text-[18px]">
          <div className="pz-appear rounded-lg border-l-4 border-emerald-400/70 bg-emerald-500/10 px-4 py-2 text-emerald-100" style={later(1500)}>
            <b>🔎 Try it:</b> <span className="font-mono text-[15px] text-emerald-200/90">nam-2026-conference-9k2m….vercel.app</span> <span className="text-emerald-200/60">— this pull request’s preview</span>
          </div>
          <div className="pz-appear text-muted" style={later(200)}>Below <Code>lg</Code> the opened filter rail is compact, so the first session stays in view on a phone. The desktop grid is untouched.</div>
          <div className="pz-appear text-ink" style={later(500)}><b>🛡️ Checks:</b> <span className="text-muted">tests pass · the new tests fail without the change · independent audit clean after 2 rounds</span></div>
          <div className="pz-appear text-ink" style={later(800)}><b>🤔 Decisions for you</b> <span className="text-muted">— hide the My Agenda card on phones: OK?</span></div>
          <div className="pz-appear flex flex-wrap gap-2 pt-1" style={later(1100)}>
            {FOLDED.map((f) => <span key={f} className="rounded-md border border-hairline bg-raised px-3 py-1.5 text-[15px] text-faint">▸ {f}</span>)}
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-4">
        <div className={`${box} pz-appear p-6`} style={later(1300)}>
          <Kicker>Opens only when</Kicker>
          <div className="mt-2 text-[22px] leading-snug text-ink">the gate is green and no blocker survived its skeptic.</div>
        </div>
        <div className={`${box} pz-appear flex flex-1 flex-col justify-center p-6 text-[20px] leading-snug text-muted`} style={later(1700)}>
          <div>Written to be read in ten seconds: what changed, whether it is proven, what needs <b className="text-ink">you</b>. The rest is folded away.</div>
          <div className="mt-5 text-[17px]">Its size label tells the reviewers how hard to look: a <Label name="ship:full" className="mx-0.5 text-[12px]" /> pull request gets the full set of review lenses.</div>
        </div>
      </div>
    </div>
  );
}

/* ---------------------- Preview and screenshots ------------------- */

/** A wireframe of the schedule on a phone: the filters, then the cards. */
function Phone({ compact, className = '' }) {
  return (
    <div className={`overflow-hidden rounded-[18px] border-2 border-hairline bg-[#0d0f15] ${className}`}>
      <div className="mx-auto mt-1.5 h-1 w-10 rounded-full bg-overlay" />
      <div className="space-y-1.5 p-2">
        {compact ? (
          <>
            <div className="flex gap-1">{[0, 1, 2, 3].map((i) => <div key={i} className="h-3.5 flex-1 rounded bg-violet-500/40" />)}</div>
            <div className="grid grid-cols-2 gap-1">{[0, 1, 2, 3].map((i) => <div key={i} className="h-3.5 rounded bg-raised" />)}</div>
            {[0, 1, 2].map((i) => <div key={i} className={`h-9 rounded-md ${i === 0 ? 'bg-emerald-500/25 ring-1 ring-emerald-400/60' : 'bg-raised'}`} />)}
          </>
        ) : (
          <>
            {[0, 1, 2, 3].map((i) => <div key={i} className="h-3.5 rounded bg-violet-500/40" />)}
            {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="h-3.5 rounded bg-raised" />)}
          </>
        )}
      </div>
    </div>
  );
}

function Desktop({ className = '' }) {
  return (
    <div className={`overflow-hidden rounded-lg border-2 border-hairline bg-[#0d0f15] ${className}`}>
      <div className="flex gap-1 border-b border-hairline px-2 py-1"><span className="size-1.5 rounded-full bg-overlay" /><span className="size-1.5 rounded-full bg-overlay" /><span className="size-1.5 rounded-full bg-overlay" /></div>
      <div className="grid grid-cols-[52px_1fr] gap-1.5 p-2">
        <div className="space-y-1">{[0, 1, 2, 3].map((i) => <div key={i} className="h-3 rounded bg-violet-500/40" />)}</div>
        <div className="grid grid-cols-3 gap-1">{[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="h-7 rounded bg-raised" />)}</div>
      </div>
    </div>
  );
}

/** The schedule on a phone, as the preview serves it: the change, live. */
function LivePhone({ className = '', tap = false }) {
  return (
    <div className={`relative h-[330px] w-[176px] overflow-hidden rounded-[26px] border-2 border-hairline bg-[#0d0f15] shadow-2xl shadow-black/60 ${className}`}>
      <div className="mx-auto mt-2 h-1.5 w-14 rounded-full bg-overlay" />
      <div className="px-3 pt-2 font-display text-[13px] text-ink">Schedule</div>
      <div className="space-y-1.5 p-3 pt-1.5">
        <div className="flex gap-1">{['Mon', 'Tue', 'Wed', 'Thu'].map((d, i) => <div key={d} className={`flex-1 rounded py-0.5 text-center text-[9px] ${i === 0 ? 'bg-violet-500/70 text-white' : 'bg-violet-500/25 text-violet-200'}`}>{d}</div>)}</div>
        <div className="grid grid-cols-2 gap-1">{['Track', 'Venue', 'Level', 'Format'].map((f) => <div key={f} className="rounded bg-raised px-1.5 py-0.5 text-[9px] text-muted">{f} ▾</div>)}</div>
        {[['10:15', 'Agent Harnesses in Production'], ['11:30', 'Feature Stores Is Not Prompt Engineering'], ['13:30', 'Token Budgets: The Bill Came Due']].map(([t, title], i) => (
          <div key={t} className={`rounded-lg px-2 py-1.5 ${i === 0 ? 'bg-emerald-500/20 ring-1 ring-emerald-400/60' : 'bg-raised'}`}>
            <div className="font-mono text-[8px] text-faint">{t}</div>
            <div className="text-[10px] leading-tight text-ink">{title}</div>
          </div>
        ))}
      </div>
      {/* a tap, where a reviewer would try it */}
      {tap && <span className="pz-ping absolute left-[118px] top-[92px] size-8 rounded-full border-2 border-cyan-300" style={{ animationDelay: '2200ms', animationIterationCount: 3, animationDuration: '1.1s' }} aria-hidden="true" />}
    </div>
  );
}

function TryItDetail() {
  return (
    <div className="grid h-full grid-cols-[1fr_auto_1fr] items-center gap-8">
      {/* the pull request, with the link pinned on top */}
      <div className={`${box} self-stretch overflow-hidden`}>
        <div className="border-b border-hairline px-6 py-3">
          <div className="font-display text-[22px] leading-tight text-ink">Keep sessions in view on mobile <span className="font-sans font-normal text-faint">#142</span></div>
        </div>
        <div className="space-y-3 px-6 py-4">
          <div className="pz-glow rounded-xl border border-emerald-400/60 bg-emerald-500/10 px-4 py-3">
            <div className="text-[18px] text-emerald-100"><b>🔎 Try it</b> — this pull request’s Vercel preview</div>
            <div className="mt-1 font-mono text-[15px] text-emerald-300 underline decoration-emerald-400/50 underline-offset-4">nam-2026-conference-9k2m….vercel.app</div>
          </div>
          <div className="pz-appear text-[17px] leading-snug text-muted" style={later(600)}>Pinned at the top by the run, the moment Vercel finishes building the branch. <b className="text-ink">No checkout, no install, no “works on my machine”.</b></div>
          <div className="pz-appear flex items-center gap-3 rounded-xl bg-raised px-4 py-2.5 text-[16px] text-muted" style={later(1100)}>
            <Vercel className="size-4 shrink-0 text-ink" />
            <span>Its own URL, its own freshly seeded database. Break it as much as you like: production never notices.</span>
          </div>
          <div className="pz-appear pt-1" style={later(3400)}>
            <div className="font-mono text-[12px] uppercase tracking-[0.16em] text-faint">To try a change, you used to</div>
            <div className="mt-2 flex items-center gap-x-1.5 whitespace-nowrap font-mono text-[13px] text-faint">
              {['git fetch', 'git checkout', 'npm install', 'npm run dev', 'find the page'].map((c, i) => (
                <span key={c} className="flex items-center gap-1.5">{i > 0 && <span>→</span>}<span className="rounded bg-ground/60 px-1.5 py-0.5 line-through decoration-rose-400/70">{c}</span></span>
              ))}
            </div>
            <div className="mt-2 text-[18px] text-emerald-200">Now: <b>one click</b>.</div>
          </div>
        </div>
      </div>

      <svg viewBox="0 0 120 40" className="h-10 w-[120px]" aria-hidden="true">
        <path d="M4 20 L104 20" pathLength="1" className="pz-draw-in" fill="none" stroke="#34d399" strokeWidth="3" style={later(1400)} />
        <g className="pz-appear" style={later(2200)}><path d="M4 20 L104 20" pathLength="1" className="pz-flow" fill="none" stroke="#a7f3d0" strokeWidth="3" /><path d="M98 12 L110 20 L98 28" fill="none" stroke="#a7f3d0" strokeWidth="3" /></g>
      </svg>

      {/* the change itself, running */}
      <div className="flex items-center gap-12 pl-4">
        <motion.div initial={{ opacity: 0, y: 40, rotate: 4 }} animate={{ opacity: 1, y: 0, rotate: 0 }} transition={{ type: 'spring', stiffness: 120, damping: 15, delay: 1.7 }}>
          <LivePhone tap className="origin-center scale-[1.22]" />
        </motion.div>
        <div className="flex-1 space-y-3">
          <div className="pz-appear font-display text-[34px] leading-[1.05] text-ink" style={later(2300)}>Review the <span className="pz-shine bg-clip-text text-transparent">app</span>,<br />not just the diff</div>
          {['Open it on your own phone', 'Send the link to a designer, or to whoever asked', 'The same URL QA is probing right now'].map((l, i) => (
            <div key={l} className="pz-appear flex items-center gap-3 text-[17px] text-muted" style={later(2700 + i * 250)}><Tick className="size-6 text-[12px]" />{l}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PreviewDetail() {
  return (
    <div className="grid h-full grid-cols-[460px_1fr] gap-6">
      <div className="flex flex-col gap-3">
        <div className="pz-appear rounded-2xl border border-emerald-400/50 bg-emerald-500/10 p-5" style={later(200)}>
          <div className="font-display text-[22px] text-emerald-100">See it without opening it</div>
          <div className="mt-1.5 text-[15px] text-emerald-200/70">The same preview, photographed for you — next to what production looks like today.</div>
        </div>
        <div className={`${box} pz-appear flex-1 p-5`} style={later(700)}>
          <div className="flex items-center gap-2"><Wf name="screenshots" /><span className="text-[14px] text-faint">no model, no credential</span></div>
          <div className="mt-2.5 space-y-1.5 text-[16px] text-muted">
            <div>• Picks the pages the diff touches, from the routes and their imports.</div>
            <div>• Shoots each on the preview and on production, as a seeded attendee with the clock pinned.</div>
            <div>• Images live in <b className="text-ink">Vercel Blob</b>; one comment, replaced on every push.</div>
          </div>
        </div>
      </div>
      <div className={`${box} pz-appear flex flex-col overflow-hidden`} style={later(1100)}>
        <div className="flex items-center gap-2 border-b border-hairline px-5 py-2.5 text-[17px] text-ink">📸 <b>Screenshots</b> <span className="font-mono text-[14px] text-violet-300">/schedule</span><span className="ml-auto text-[13px] text-faint">click an image for the full page</span></div>
        <div className="grid flex-1 grid-cols-[92px_1fr_1fr] grid-rows-[auto_auto_1fr] gap-x-4 gap-y-2.5 px-5 py-3">
          <span />
          <span className="text-center font-mono text-[13px] uppercase tracking-wider text-faint">Before · production</span>
          <span className="text-center font-mono text-[13px] uppercase tracking-wider text-emerald-300">This pull request</span>
          <span className="self-center text-[15px] font-semibold text-muted">Desktop<span className="block font-mono text-[12px] font-normal text-faint">unchanged</span></span>
          <Desktop className="pz-appear h-[104px]" />
          <Desktop className="pz-appear h-[104px]" />
          <span className="self-center text-[15px] font-semibold text-muted">Mobile</span>
          <div className="pz-appear flex justify-center" style={later(1500)}><Phone className="h-[176px] w-[112px]" /></div>
          <div className="pz-appear relative flex justify-center" style={later(1800)}>
            <Phone compact className="h-[176px] w-[112px]" />
            <span className="pz-pop absolute left-[calc(50%+72px)] top-[84px] whitespace-nowrap rounded-full bg-emerald-500/20 px-2.5 py-0.5 font-mono text-[13px] text-emerald-200 ring-1 ring-emerald-400/50" style={later(2400)}>← first session in view</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ Review ---------------------------- */

// a small pull request is read through one combined lens; each row is one finding it reported
const RAISED = [
  ['rules', 'The rail’s gap differs from the other panels', 'dropped — a nitpick', null],
  ['logic', '“Clear filters” leaves the search text in place', 'ran it: true', 'suggestion'],
  ['tests', 'No test pins “every filter still there” at 360 px', 'checked the tests: true', 'suggestion'],
  ['criteria', 'The desktop grid moved by a pixel', 'could not show it — dropped', null],
];

const BLOCKS_WHEN = [
  'It is serious: wrong behaviour, a crash, lost data, a security hole',
  'It happens now, on a route a person takes in normal use',
  'The reviewer showed it by running something',
  'Its own skeptic ran it too, and confirmed it',
  'Both are at least 95% sure',
];

function ReviewDetail() {
  return (
    <div className="grid h-full grid-cols-[1.15fr_1fr] gap-6">
      <div className="flex flex-col gap-3.5">
        <div className="flex items-center gap-3"><Wf name="review" /><Kicker>every finding it reports faces its own skeptic</Kicker></div>
        {RAISED.map(([lens, text, verdict, kept], i) => {
          const verdictAt = 1500 + i * 380;
          return (
            <div key={text} className="pz-appear grid grid-cols-[1fr_250px] items-center gap-3" style={later(250 + i * 220)}>
              <div className="rounded-xl border border-amber-400/30 bg-amber-500/5 px-4 py-4 text-[17px] text-ink">
                <span className="mr-2 font-mono text-[12px] text-amber-300">{lens}</span>
                <span className={kept ? '' : 'pz-strike text-rose-300'} style={kept ? undefined : later(verdictAt)}><span className="text-ink">{text}</span></span>
              </div>
              <div className={`pz-appear rounded-xl px-3 py-2 text-[14.5px] leading-tight ${kept ? 'border border-sky-400/40 bg-sky-500/10 text-sky-100' : 'text-faint'}`} style={later(verdictAt)}>
                {verdict}{kept && <span className="mt-0.5 block font-mono text-[12px] text-sky-300">→ a {kept}</span>}
              </div>
            </div>
          );
        })}
        <div className="pz-appear mt-auto rounded-xl border-l-4 border-emerald-400/60 bg-emerald-500/10 px-5 py-3" style={later(3300)}>
          <div className="flex items-center gap-3 font-display text-[22px] text-emerald-200">Code review · approved with 2 suggestions <Meter level="high" /></div>
          <div className="mt-0.5 font-mono text-[13px] text-emerald-200/70">4 raised · 2 survived their skeptic</div>
        </div>
      </div>
      <div className={`${box} flex flex-col p-6`}>
        <Kicker>It approves by default. To block, all five must hold</Kicker>
        <div className="my-3 flex flex-1 flex-col justify-evenly">
          {BLOCKS_WHEN.map((b, i) => (
            <div key={b} className="pz-appear flex items-center gap-3.5 text-[19px] text-ink" style={later(600 + i * 280)}>
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-violet-500/20 font-mono text-[14px] text-violet-200 ring-1 ring-violet-400/40">{i + 1}</span>{b}
            </div>
          ))}
        </div>
        <div className="pz-appear rounded-xl bg-raised px-4 py-3 text-[16px] leading-snug text-muted" style={later(2300)}>
          A weak test or a stale doc never blocks. Wrong anyway? Reply <Code className="whitespace-nowrap">/dismiss 2</Code> or 👎 — the next review will not raise it again.
        </div>
      </div>
    </div>
  );
}

/* -------------------------------- QA ------------------------------ */

const QA_STEPS = [
  ['🧠', 'Plan', 'sonnet', 'what to probe: the route, the attendee, the pinned clock, the steps, what should happen'],
  ['✍️', 'Write', 'glm', 'turns that exact plan into Playwright tests — mechanical work'],
  ['▶️', 'Run', null, 'the factory runs the file itself: desktop and mobile, at the same time'],
];

const PROBES = [
  'Filters open on a phone: first card in view',
  'every filter reachable at 360 px',
  'search, then clear filters',
  'grid untouched on desktop',
];

function QaDetail() {
  return (
    <div className="grid h-full grid-cols-[1.2fr_1fr] gap-6">
      <div className="flex flex-col gap-3.5">
        <div className="flex items-center gap-3"><Wf name="qa" /><Kicker>not the tests again — the gaps they leave</Kicker></div>
        {QA_STEPS.map(([icon, name, model, what], i) => (
          <div key={name} className={`${box} pz-appear flex items-center gap-4 px-5 py-4`} style={later(250 + i * 350)}>
            <span className="text-[26px]">{icon}</span>
            <span className="w-[62px] font-display text-[22px] text-ink">{name}</span>
            <span className="flex-1 text-[17px] leading-snug text-muted">{what}</span>
            {model ? <Model m={model} /> : <span className="rounded-full border border-hairline px-2.5 py-0.5 font-mono text-[13px] text-muted">no model</span>}
          </div>
        ))}
        <div className="pz-appear mt-auto grid grid-cols-2 gap-3" style={later(1500)}>
          <div className="rounded-xl border border-emerald-400/40 bg-emerald-500/[0.07] px-4 py-3.5">
            <div className="flex items-center gap-2 text-[16px] font-semibold text-emerald-100"><Vercel className="size-3.5" /> On the live preview</div>
            <div className="text-[14px] leading-snug text-muted">everything that only looks: the way an attendee meets it</div>
          </div>
          <div className="rounded-xl border border-sky-400/40 bg-sky-500/[0.07] px-4 py-3.5">
            <div className="text-[16px] font-semibold text-sky-100">📦 On the branch, in the sandbox</div>
            <div className="text-[14px] leading-snug text-muted">probes that book a seat: one app, one database, no surprises</div>
          </div>
        </div>
      </div>
      <div className={`${box} flex flex-col p-5`}>
        <Kicker>Probes, in a real browser</Kicker>
        <div className="mt-4 space-y-3.5">
          {PROBES.map((p, i) => (
            <div key={p} className="pz-appear flex items-center gap-3 text-[19px] text-ink" style={later(1900 + i * 380)}><Tick className="size-7 text-[13px]" /> {p}</div>
          ))}
        </div>
        <div className="pz-appear mt-5 rounded-xl border-l-4 border-emerald-400/60 bg-emerald-500/10 px-4 py-3.5" style={later(3600)}>
          <div className="flex items-center gap-3 font-display text-[21px] text-emerald-200">QA · high confidence <Meter level="high" /></div>
        </div>
        <div className="pz-appear mt-auto space-y-1.5 text-[16px] text-muted" style={later(4000)}>
          <div><span className="mr-2">❌</span>a bug: it reproduces here, and not on main</div>
          <div><span className="mr-2">🟠</span>already broken on main — not this change’s fault</div>
          <div><span className="mr-2">⚪</span>the environment, not the change — never held against it</div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ Merge ----------------------------- */

/* Sparks thrown from the merge button — a fixed pattern, so every run looks the same. */
const SPARKS = Array.from({ length: 34 }, (_, i) => {
  const a = (i / 34) * Math.PI * 2 + (i % 3) * 0.13;
  const r = 240 + ((i * 37) % 180);
  return { x: Math.cos(a) * r, y: Math.sin(a) * r * 0.55, s: 8 + ((i * 5) % 12), c: ['bg-violet-300', 'bg-fuchsia-300', 'bg-cyan-300', 'bg-emerald-300'][i % 4] };
});

function Burst() {
  return SPARKS.map((p, i) => (
    <motion.span
      key={i}
      className={`pointer-events-none absolute rounded-full ${p.c} shadow-[0_0_12px_2px_currentColor]`}
      style={{ left: '50%', top: '74%', width: p.s, height: p.s, marginLeft: -p.s / 2, marginTop: -p.s / 2 }}
      initial={{ x: 0, y: 0, opacity: 1, scale: 0.2 }}
      animate={{ x: p.x, y: p.y, opacity: 0, scale: [0.2, 1.2, 0.6] }}
      transition={{ duration: 1.1 + (i % 4) * 0.14, ease: [0.16, 1, 0.3, 1], opacity: { duration: 1.1 + (i % 4) * 0.14, ease: 'easeIn' } }}
      aria-hidden="true"
    />
  ));
}

const STATUSES = [
  ['the run’s own gate', 'unit 316 · browser 184'],
  ['factory/review', 'approved'],
  ['factory/qa', 'high confidence'],
  ['factory/screenshots', '1 page, desktop and mobile'],
];

function MergeDetail() {
  const [merged, setMerged] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMerged(true), 1700);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="grid h-full grid-cols-[400px_1fr_400px] gap-6">
      <div className={`${box} flex flex-col p-5`}>
        <Kicker>On the pull request</Kicker>
        <div className="mt-2 flex-1 space-y-2">
          {STATUSES.map(([name, what], i) => (
            <div key={name} className="pz-appear flex items-center gap-3" style={later(200 + i * 200)}>
              <Tick className="size-6 text-[12px]" />
              <div className="leading-tight"><div className="font-mono text-[15px] text-ink">{name}</div><div className="text-[13px] text-faint">{what}</div></div>
            </div>
          ))}
        </div>
        <div className="pz-appear text-[15px] leading-snug text-muted" style={later(1100)}>None is a required check. <b className="text-ink">Machines gate, agents advise, people merge.</b></div>
      </div>

      <div className={`${box} relative flex flex-col items-center justify-center p-6 text-center`}>
        {merged && <Burst />}
        <motion.div
          className={`inline-flex items-center gap-2 rounded-full px-5 py-1.5 text-[18px] font-semibold text-white ${merged ? 'bg-violet-600' : 'bg-emerald-600'}`}
          animate={{ scale: merged ? [1, 1.25, 1] : 1 }}
          transition={{ duration: 0.5 }}
        >
          {merged ? <MergeIcon className="size-5" /> : <PrIcon className="size-5" />} {merged ? 'Merged' : 'Open'}
        </motion.div>
        <div className="mt-4 font-display text-[32px] leading-tight text-ink">Keep sessions in view on mobile <span className="font-sans font-normal text-faint">#142</span></div>
        <motion.button
          type="button"
          tabIndex={-1}
          className={`relative mt-6 rounded-xl px-8 py-3.5 font-display text-[23px] text-white ${merged ? 'bg-violet-700/50' : 'bg-emerald-600'}`}
          animate={merged ? { scale: [1, 0.92, 1.06, 1] } : {}}
          transition={{ duration: 0.5 }}
        >
          {merged ? '✓ Pull request merged' : 'Squash and merge'}
          {!merged && <span className="pz-ping absolute inset-0 rounded-xl border-2 border-emerald-300" style={{ animationDelay: '900ms' }} aria-hidden="true" />}
        </motion.button>
        {merged && <motion.div className="pointer-events-none absolute inset-0 rounded-2xl" initial={{ boxShadow: '0 0 0 0 rgba(139,92,246,0.7)', backgroundColor: 'rgba(196,181,253,0.16)' }} animate={{ boxShadow: '0 0 0 90px rgba(139,92,246,0)', backgroundColor: 'rgba(196,181,253,0)' }} transition={{ duration: 1.1 }} />}
      </div>

      <div className="flex flex-col gap-3">
        <div className={`${box} p-5`}>
          <Kicker>Your one job here</Kicker>
          <div className="mt-2 text-[17px] leading-snug text-muted">Read the summary, check the decisions it made for you, <b className="text-ink">try the preview</b>, press the button.</div>
        </div>
        <motion.div
          className="flex flex-1 flex-col justify-center rounded-2xl border border-violet-400/60 bg-raised p-5"
          initial={{ opacity: 0, x: 40 }} animate={merged ? { opacity: 1, x: 0 } : {}} transition={{ type: 'spring', stiffness: 160, damping: 16, delay: 0.5 }}
        >
          <div className="font-display text-[26px] text-ink">⚡ The run wakes up</div>
          <div className="mt-1.5 text-[16px] leading-snug text-muted">The same run that built it, asleep since the pull request opened. It is not finished until production is.</div>
        </motion.div>
      </div>
    </div>
  );
}

/* ---------------------------- Production -------------------------- */

const LIVE = [
  { icon: <MergeIcon className="size-7 text-violet-300" />, title: 'Merged to main', sub: 'the merge commit', at: 200 },
  { icon: <Vercel className="size-6 text-ink" />, title: 'Production deployment', sub: 'of that exact commit · Ready', at: 900 },
  { icon: <span className="text-[26px]">🩺</span>, title: 'GET /api/health', sub: <span className="font-mono text-emerald-300">{'{ "ok": true }'}</span>, at: 1700 },
  { icon: <IssueIcon className="size-7 text-violet-300" />, title: 'Issue #140 closed', sub: 'by “Closes #140” · the run says where it is live', at: 2500 },
];

function ProductionDetail() {
  return (
    <div className="flex h-full flex-col gap-5">
      <div className="relative grid grid-cols-4 gap-5">
        <svg viewBox="0 0 1440 150" className="pointer-events-none absolute inset-0 size-full" aria-hidden="true">
          {[0, 1, 2].map((i) => {
            const d = `M${345 + i * 365} 75 L${375 + i * 365} 75`;
            return <path key={i} d={d} pathLength="1" className="pz-draw-in" fill="none" stroke="#a78bfa" strokeWidth="3" style={later(700 + i * 800)} />;
          })}
        </svg>
        {LIVE.map((s) => (
          <div key={s.title} className={`${box} pz-appear flex h-[150px] flex-col justify-center px-5`} style={later(s.at)}>
            <div className="flex items-center gap-3">{s.icon}<span className="font-display text-[23px] leading-tight text-ink">{s.title}</span></div>
            <div className="mt-2 text-[15px] text-muted">{s.sub}</div>
          </div>
        ))}
      </div>
      <motion.div
        className="relative flex flex-1 items-center gap-10 overflow-hidden rounded-2xl border border-emerald-400/50 bg-emerald-500/[0.07] pl-10"
        initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 140, damping: 15, delay: 3.2 }}
      >
        <div className="flex-1">
          <div className="font-mono text-[13px] uppercase tracking-[0.2em] text-emerald-300">Out · the feature, live</div>
          <div className="mt-2 font-display text-[50px] leading-none text-ink">A ticket went in. <span className="pz-shine bg-clip-text text-transparent">This came out.</span></div>
          <div className="mt-3 text-[19px] text-muted">One run from label to production, and every step between them on the record.</div>
          <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-emerald-400/40 bg-ground/50 px-4 py-1 font-mono text-[15px] text-emerald-200"><Vercel className="size-3.5" /> nam-2026-conference.vercel.app</div>
        </div>
        <div className="mr-16 mt-[70px] self-start"><LivePhone /></div>
      </motion.div>
    </div>
  );
}

/* --------------------- when it will not converge ------------------ */

/** Not #140: a harder ticket, on a full run, so the detour does not contradict the walk. */
function Elsewhere({ children }) {
  return (
    <div className="mb-3 flex items-center gap-3">
      <span className="rounded-full border border-amber-400/50 bg-amber-500/15 px-3 py-0.5 font-mono text-[13px] text-amber-200">a detour · another ticket</span>
      <span className="text-[16px] text-muted">{children}</span>
      <Label name="ship:full" className="text-[12px]" />
    </div>
  );
}

const STUCK = 'A waitlist promotion can still give someone two overlapping seats';

function StuckDetail() {
  return (
    <div className="grid h-full grid-cols-[450px_1fr] gap-8">
      <div className="relative">
        <div className="absolute left-0 top-0 h-[480px] w-[520px] origin-top-left scale-[0.86]">
          <svg viewBox="0 0 520 480" className="absolute inset-0 size-full" aria-hidden="true">
            <circle cx="260" cy="240" r="170" fill="none" stroke="#333950" strokeWidth="3" />
            <circle cx="260" cy="240" r="170" pathLength="1" className="pz-flow" fill="none" stroke="#f59e0b" strokeWidth="3" />
          </svg>
          {[['🛠️ Fix', 190, 30], ['🚦 Gate', 360, 300], ['🧐 Audit', 20, 300]].map(([l, x, y]) => (
            <div key={l} className={`${box} absolute grid h-[86px] w-[140px] place-items-center text-[20px] font-semibold text-ink`} style={{ left: x, top: y }}>{l}</div>
          ))}
          <motion.div
            className="absolute left-[178px] top-[196px] grid h-[88px] w-[164px] place-items-center rounded-2xl border-2 border-rose-400/70 bg-rose-500/15 text-center font-display text-[28px] text-rose-200"
            initial={{ scale: 0, rotate: -12 }}
            animate={{ scale: 1, rotate: -6 }}
            transition={{ type: 'spring', stiffness: 260, damping: 12, delay: 2.4 }}
          >
            STOP
          </motion.div>
        </div>
      </div>
      <div className="flex flex-col justify-center gap-2.5">
        <Elsewhere>#151 Promote the waitlist without double-booking</Elsewhere>
        {[1, 2, 3].map((round, i) => (
          <div key={round} className="pz-appear flex items-center gap-5 rounded-xl border border-amber-400/40 bg-amber-500/10 px-5 py-3" style={later(300 + i * 650)}>
            <span className="font-mono text-[15px] text-faint">Round {round}</span>
            <span className="text-[18px] text-ink">{STUCK}</span>
            {i > 0 && <span className="pz-pop ml-auto shrink-0 rounded-full bg-rose-500/20 px-3 py-0.5 font-mono text-[13px] text-rose-200" style={later(300 + i * 650 + 500)}>same finding</span>}
          </div>
        ))}
        {/* the round that is not run */}
        <div className="pz-appear flex items-center gap-5 rounded-xl border border-dashed border-hairline px-5 py-3" style={later(2500)}>
          <span className="font-mono text-[15px] text-faint">Round 4</span>
          <span className="text-[18px] text-faint line-through decoration-rose-400/70">{STUCK}</span>
          <span className="ml-auto shrink-0 font-mono text-[13px] text-rose-300">not run</span>
        </div>
        <div className="pz-appear text-[18px] text-muted" style={later(2800)}>The same finding, a third time. Another round would only spend money.</div>
      </div>
    </div>
  );
}

/* The reply, then Jev's verdict on it, land a few seconds into the hand-back beat. */
const REPLY_AT = 1700;
const JUDGED_AT = 2900;

function HandBackDetail() {
  return (
    <div className="grid h-full grid-cols-[1.5fr_1fr] gap-6">
      <div className={`${box} flex flex-col overflow-hidden`}>
        <div className="flex items-center gap-3 border-b border-hairline px-6 py-3">
          <IssueIcon className="size-5 text-emerald-400" />
          <span className="font-display text-[21px] text-ink">#151 Promote the waitlist without double-booking</span>
          <span className="ml-auto flex items-center gap-2">
            <span className="pz-strike text-amber-300" style={later(JUDGED_AT + 300)}><Label name="needs-human" className="text-[12px]" /></span>
            <span className="pz-pop" style={later(JUDGED_AT + 300)}><Label name="ai-working" className="text-[12px]" /></span>
          </span>
        </div>
        <div className="mx-6 mt-4 rounded-xl border border-hairline bg-raised px-5 py-3.5">
          <div className="flex items-center gap-2 text-[14px] text-faint"><span className="grid size-6 place-items-center rounded-full bg-violet-500/30 text-[13px]">🏭</span> ship · stopped at Audit</div>
          <div className="mt-2 text-[17px] text-ink">I cannot promote someone into a seat that overlaps one they already hold without breaking a rule either way. <b>Still open:</b></div>
          <ul className="mt-1.5 space-y-0.5 text-[16px] text-muted">
            <li>• skip that person and promote the next, or drop their other seat?</li>
            <li>• draft pull request #153 has everything else, green</li>
          </ul>
        </div>
        <div className="pz-appear mx-6 mt-3 rounded-xl border border-sky-400/40 bg-sky-500/10 px-5 py-3.5" style={later(REPLY_AT)}>
          <div className="flex items-center gap-2 text-[14px] text-faint"><span className="grid size-6 place-items-center rounded-full bg-sky-500/30 text-[13px]">🙋</span> you, in a comment</div>
          <div className="mt-1.5 text-[17px] text-ink">Skip them. We never take away a seat someone holds.</div>
        </div>
      </div>
      <div className="flex flex-col gap-3.5">
        <div className={`${box} pz-appear flex flex-1 flex-col justify-center px-6`} style={later(400)}>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-overlay px-3 py-1 text-[14px] font-semibold text-muted"><PrIcon /> Draft</span>
            <span className="font-display text-[21px] text-ink">#153</span>
          </div>
          <div className="mt-2 text-[16px] text-muted">The branch, the spec, every round so far, and a section called <b className="text-ink">Why this stopped</b>.</div>
        </div>
        <div className="pz-appear flex flex-1 flex-col justify-center rounded-2xl border border-amber-400/50 bg-raised px-6" style={later(JUDGED_AT)}>
          <div className="flex items-center gap-3">
            <span className="rounded-full border border-amber-400/60 bg-amber-500/20 px-3 py-0.5 font-mono text-[16px] text-amber-100">Jev</span>
            <span className="text-[17px] text-ink">Does the reply settle what was asked?</span>
          </div>
          <div className="mt-2 flex items-center gap-3">
            <span className="h-3 flex-1 overflow-hidden rounded-full bg-overlay"><span className="pz-fill block h-full w-[92%] rounded-full bg-gradient-to-r from-amber-400 to-emerald-300" style={{ animationDuration: '800ms', animationDelay: `${JUDGED_AT + 300}ms` }} /></span>
            <span className="font-mono text-[15px] text-emerald-300">yes · 92%</span>
          </div>
        </div>
        <div className="pz-appear flex flex-1 flex-col justify-center rounded-2xl border border-violet-400/50 bg-raised px-6" style={later(JUDGED_AT + 700)}>
          <div className="font-display text-[24px] text-ink">🔁 A new run continues</div>
          <div className="mt-1 text-[16px] leading-snug text-muted">Same branch; the spec is revised with your answer as a decision. The draft becomes the pull request.</div>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------- the line --------------------------- */

// One entry per beat: the station the ticket is at, and the panel shown there.
// Each Vercel piece is told where it happens: the webhook and Jev at Triage
// (that is where the run starts and the models are chosen), the sandbox at
// Plan (where it is forked), the durable trace at Build (the long job), the
// climb at the Gate (a red gate is what triggers it), needs-human at Audit
// (where a run gets stuck), the merge hook at Merge. Plan audit has no stop:
// #140 is a small ticket, so the run skips it.
const STOPS = [
  { at: -1 },
  { at: 0, Detail: Switchboard },
  { at: 0, Detail: TriageDetail },
  { at: 0, Detail: Sizing },
  { at: 0, Detail: Ladder },
  { at: 1, Detail: Fork },
  { at: 1, Detail: Network },
  { at: 1, Detail: SpecDetail },
  { at: 3, Detail: BuildDetail },
  { at: 3, Detail: Durable },
  { at: 4, Detail: GateDetail },
  { at: 4, Detail: RedCheckDetail },
  { at: 4, Detail: Climb },
  { at: 5, Detail: AuditDetail },
  { at: 5, Detail: LoopDetail },
  { at: 5, Detail: StuckDetail },
  { at: 5, Detail: HandBackDetail },
  { at: 6, Detail: PrDetail },
  { at: 7, Detail: TryItDetail },
  { at: 7, Detail: PreviewDetail },
  { at: 8, Detail: ReviewDetail },
  { at: 8, Detail: QaDetail },
  { at: 9, Detail: Asleep },
  { at: 9, Detail: MergeDetail },
  { at: 10, Detail: ProductionDetail },
];
function LineScene({ step }) {
  const active = STOPS[step]?.at ?? -1;
  return (
    <>
      <Stations active={active} />
      <Rail active={active} />

      <Show on={active < 0} delay={600} style={PANEL} className="grid grid-cols-[330px_1fr_330px] items-center gap-8">
        {/* in: the ticket */}
        <div>
          <div className="font-mono text-[13px] uppercase tracking-[0.2em] text-violet-300">In · a ticket</div>
          <div className={`${box} mt-3 p-5`}>
            <div className="flex items-center gap-2 font-display text-[20px] leading-tight text-ink"><IssueIcon className="size-5 shrink-0 text-emerald-400" /> #140 Keep sessions in view on mobile</div>
            <div className="mt-3 space-y-1.5 text-[15px] text-muted">
              {['first session in view on a phone', 'every filter still there', 'laptop unchanged'].map((d) => (
                <div key={d} className="flex gap-2"><span className="text-violet-300">☐</span>{d}</div>
              ))}
            </div>
            <div className="mt-3"><Label name="ready-for-ai" className="text-[12px]" /></div>
          </div>
        </div>

        {/* between them: what makes the line trustworthy */}
        <div className="relative flex flex-col gap-3">
          {[
            ['🧠', 'Every stop a fresh agent', 'It never sees the reasoning of the stop before. That is what makes an audit an audit.'],
            ['📜', 'A script decides the flow', 'Round limits, who judges what, when to stop: TypeScript, not a prompt’s good intentions.'],
            ['🧾', 'Every stop leaves a trail', 'A spec, a failing test, each audit round and what it cost — all on the record.'],
          ].map(([icon, title, body], i) => (
            <div key={title} className={`${box} pz-appear flex items-center gap-5 px-6 py-4`} style={later(900 + i * 250)}>
              <span className="text-[34px]">{icon}</span>
              <div><div className="font-display text-[23px] text-ink">{title}</div><div className="text-[16px] leading-snug text-muted">{body}</div></div>
            </div>
          ))}
          <svg viewBox="0 0 700 20" className="pz-appear mt-1 h-5 w-full" style={later(1800)} aria-hidden="true">
            <path d="M0 10 L688 10" pathLength="1" className="pz-flow" fill="none" stroke="#a78bfa" strokeWidth="2.5" />
            <path d="M682 3 L694 10 L682 17" fill="none" stroke="#a78bfa" strokeWidth="2.5" />
          </svg>
        </div>

        {/* out: the feature, live */}
        <div className="flex flex-col items-center">
          <div className="self-start font-mono text-[13px] uppercase tracking-[0.2em] text-emerald-300">Out · a feature, live</div>
          <motion.div className="mt-3" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 120, damping: 16, delay: 2 }}>
            <LivePhone />
          </motion.div>
        </div>
      </Show>

      {STOPS.map(({ Detail }, i) => Detail && (
        <Replay key={i} on={step === i} from="up" style={PANEL}>
          <Detail />
        </Replay>
      ))}
    </>
  );
}

// One caption per stop, in the order of STOPS. The kicker names the station.
const LINE_BEATS = [
  {
    kicker: 'One run, start to finish',
    title: 'A ticket goes in. A feature comes out',
    body: 'This rail is the whole talk: one durable run, eleven phases. Follow ticket #140 along it — each stop is its own agent with a narrow job, and at each one you will meet the piece of Vercel that makes it work.',
  },
  {
    kicker: 'Triage · the webhook',
    title: 'It starts with a webhook: every GitHub event has one door',
    body: 'The label reaches one route on the factory, which decides what each event starts. A run holds a token while it lives, so a second label or a redelivered webhook is told which run already has the ticket.',
  },
  {
    kicker: 'Triage',
    title: 'Claim it, size it, choose the models',
    body: 'Before any machine starts, the run claims the ticket so no second one can, tells you so on the issue, and makes two quick decisions: how big a job this is, and which model each of its jobs should start on.',
  },
  {
    kicker: 'Triage · Jev',
    title: 'First question: how big is this ticket?',
    body: 'Jev is a small decision model: it answers with odds, in about a third of a second. The size sets how many auditors and rounds a ticket gets — and when Jev is not sure, the run waits for the plan to tell it.',
  },
  {
    kicker: 'Triage · AI Gateway',
    title: 'Then: the cheapest model that will get each job right',
    body: 'Claude Code reaches every model through AI Gateway, so a job can run on any of them. Coding fails loudly — a red gate — so it starts cheap. Judgement fails silently, so a miss is priced in: an auditor starts cheap only when Jev is sure cheap is enough.',
  },
  {
    kicker: 'Plan · Vercel Sandbox',
    title: 'A clean machine for this run, in seconds',
    body: 'Nothing is installed at run time. The run forks a sandbox that already has the repository, its dependencies and a browser, checks out its commit and starts work — then deletes itself when it ends.',
  },
  {
    kicker: 'Plan · Vercel Sandbox',
    title: 'The agent runs code. It never holds a key',
    body: 'The agents work with placeholder tokens. The sandbox’s network proxy adds the real ones on the way out, for the few hosts on the list — so a prompt injection has nothing to steal and nowhere to send it.',
  },
  {
    kicker: 'Plan · the spec',
    title: 'A plan before any code, while a mistake is still cheap',
    body: 'The spec is the branch’s first commit and maps each Done when line to its check. The plan also settles the size Jev was unsure of: small, so the plan audit a full ticket gets is skipped.',
  },
  {
    kicker: 'Build',
    title: 'The failing test first — then the change',
    body: 'The check is committed while it still fails, so the history proves it failed. This is the job that runs on a cheap model: if it gets it wrong, the next station says so.',
  },
  {
    kicker: 'Build · Vercel Workflows',
    title: 'And if the factory is redeployed halfway through the build?',
    body: 'Nothing is lost. Every phase is a named step in a durable workflow: finished steps replay from the log, and the build itself was never running on the function — it is a job in the sandbox.',
  },
  {
    kicker: 'Gate',
    title: 'A gate agents cannot argue with',
    body: 'Not AI at all: a script runs the tests and the workflow reads its result. An agent saying it is done counts for nothing until the gate is green.',
  },
  {
    kicker: 'Gate · the red-check',
    title: 'Proof the test can fail',
    body: 'Green alone proves little. The old code goes back and the new tests run again: if they still pass, they never tested the change.',
  },
  {
    kicker: 'Gate · when it is red',
    title: 'Cheap first, and a way up when cheap is not enough',
    body: 'A red gate sends the fix to a model one tier above whatever wrote the code. The ladder came from measuring, and every climb is written on the run — so you can see which jobs needed which model.',
  },
  {
    kicker: 'Audit',
    title: 'Independent auditors, and a skeptic for every blocker',
    body: 'Auditors that never saw the code written read it against the ticket and the rules, and drive it in a browser. A blocker counts only if a skeptic can show it. No layer is trusted alone: their holes do not line up.',
  },
  {
    kicker: 'Audit · fix and loop',
    title: 'Fix, gate, audit — until a round comes back clean',
    body: 'The loop is bounded by code, so nothing spins all night on your bill. And what the auditors caught can be written into the docs, so the next ticket’s agents start out knowing it.',
  },
  {
    kicker: 'Audit · what if it will not converge?',
    title: 'A detour: the same finding, surviving two fixes',
    body: 'Ticket #140 came back clean. Not every ticket does: some contradict themselves, or need a decision only a person can make. On this harder one, the run notices it is going round in circles and stops.',
  },
  {
    kicker: 'Audit · needs-human, then you',
    title: 'It hands back what it knows. You just reply',
    body: 'A draft pull request with the work so far, and a comment saying exactly what is open. Answer the way you would answer a colleague: Jev judges whether the reply settles it, and a new run continues on the same branch.',
  },
  {
    kicker: 'Pull request',
    title: 'A pull request you can read in ten seconds',
    body: 'It opens only once the gate is green and no blocker survives. What changed, whether it is proven, and the decisions that are yours. Everything else is folded away.',
  },
  {
    kicker: 'Preview · Vercel previews',
    title: 'Every pull request is a running app you can try',
    body: 'Vercel builds the branch into its own deployment and the run pins the link on the pull request. You review by using the change — on your phone, with a colleague — instead of imagining it from a diff.',
  },
  {
    kicker: 'Preview · screenshots',
    title: 'And before you even click: before and after, side by side',
    body: 'A screenshots workflow photographs every page the diff touches, on the preview and on production, desktop and mobile. The images live in Vercel Blob, and the comment is replaced on every push.',
  },
  {
    kicker: 'Review & QA · code review',
    title: 'Review that approves by default, and proves what it flags',
    body: 'Reviewers that cry wolf get ignored. So every finding goes to its own skeptic, which sees only the claim and has to demonstrate it. What it cannot show is dropped; a blocker has to be serious, shown, and certain.',
  },
  {
    kicker: 'Review & QA · QA',
    title: 'QA tries to break it, on the app you would click on',
    body: 'A strong model plans the probes, a cheap one types them, and the factory runs them — on the live preview. What review and QA do find, the same run fixes itself and asks them again, two rounds at most.',
  },
  {
    kicker: 'Merge · Vercel Workflows',
    title: 'Now it waits for you — and waiting is free',
    body: 'The run opened a hook the moment the pull request existed, and now it sleeps. No function, no sandbox, no meter running. Review it in an hour, or after the weekend.',
  },
  {
    kicker: 'Merge',
    title: 'The last click is always yours',
    body: 'Nothing merges itself. The verdicts tell you where to look and the preview lets you check in a minute. Then one button — and the run that has been asleep since the pull request opened wakes up.',
  },
  {
    kicker: 'Production',
    title: 'Done means live, not merged',
    body: 'The run finds the production deployment of the merge commit, waits for it and asks the app whether it is healthy. Only then does the issue say it is live.',
  },
];

/** The same scene, as one chapter per stretch of the rail: the chrome names the station, the rail never leaves. */
const stretch = (id, name, accent, tone, start, end) => ({
  id, name, accent, tone, ...(start ? { enter: 'cut' } : {}),
  beats: LINE_BEATS.slice(start, end),
  Scene: function Stretch({ step }) { return <LineScene step={start + step} />; },
});

export const SHIP = [
  stretch('run', 'One run', 'text-violet-300', 'violet', 0, 1),
  stretch('triage', 'Triage', 'text-violet-300', 'violet', 1, 5),
  stretch('plan', 'Plan', 'text-amber-300', 'amber', 5, 8),
  stretch('build', 'Build', 'text-cyan-300', 'cyan', 8, 10),
  stretch('gate', 'Gate', 'text-emerald-300', 'emerald', 10, 13),
  stretch('audit', 'Audit', 'text-amber-300', 'amber', 13, 17),
  stretch('pr', 'Pull request and preview', 'text-violet-300', 'violet', 17, 20),
  stretch('checks', 'Review and QA', 'text-cyan-300', 'cyan', 20, 22),
  stretch('merge', 'Merge and production', 'text-emerald-300', 'emerald', 22, 25),
];
