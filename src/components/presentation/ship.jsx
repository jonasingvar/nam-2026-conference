import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { at, Show, Replay, Code, Label, Model, Kicker, Tick, Token, Flip, Meter, Vercel, IssueIcon, PrIcon, MergeIcon, later, box } from './kit.jsx';
import { Wf, Switchboard, Sizing, Ladder, Sandbox, Durable, Climb, Asleep } from './platform.jsx';

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

/* ------------------------------ Plan ------------------------------ */

const SPEC_LINES = [
  { t: '# Keep sessions in view on mobile', c: 'text-ink font-semibold' },
  { t: '## What this changes', c: 'text-violet-300' },
  { t: 'Below lg the opened filter rail is compact.', c: 'text-muted' },
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
        <div className="space-y-2.5 px-6 py-5 font-mono text-[17px]">
          {SPEC_LINES.map((l, i) => <div key={i} className={`pz-appear ${l.c}`} style={later(150 + i * 220)}>{l.t}</div>)}
        </div>
      </div>
      <div className="flex flex-col gap-4">
        <div className={`${box} flex flex-1 flex-col justify-center px-6`}>
          <Kicker>The first commit on the branch</Kicker>
          <div className="pz-appear mt-2 font-mono text-[17px] text-amber-300" style={later(2100)}>● docs(spec): plan compact mobile filters</div>
        </div>
        <div className="pz-appear flex flex-1 flex-col justify-center rounded-2xl border border-amber-400/40 bg-raised px-6" style={later(2500)}>
          <Kicker>The plan settles the size</Kicker>
          <div className="mt-2 flex items-baseline gap-3"><span className="font-display text-[40px] leading-none text-ink">small</span><span className="text-[18px] text-muted">two rounds, and a browser audit</span></div>
        </div>
        <div className="pz-appear rounded-2xl border-2 border-dashed border-amber-400/60 bg-amber-500/10 px-5 py-2.5" style={later(3100)}>
          <div className="flex items-center gap-3"><Label name="needs-human" className="shrink-0 whitespace-nowrap text-[12px]" /><span className="text-[17px] text-muted">Cannot be checked? Handed back here.</span></div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ Build ----------------------------- */

function BuildDetail() {
  return (
    <div className="grid h-full grid-cols-[1fr_auto_1fr] items-stretch gap-5">
      <div className={`${box} flex flex-col justify-center p-7`}>
        <Kicker>1 · the check first</Kicker>
        <div className="mt-3 rounded-xl bg-[#0d0f15] p-5 font-mono text-[16.5px] leading-relaxed">
          <div className="text-violet-300">test(<span className="text-emerald-300">'on a phone the open filter</span></div>
          <div className="pl-4 text-emerald-300">rail leaves the first session in view'</div>
          <div className="pl-4 text-muted">await page.getByRole('button', {'{'} name: 'Filters' {'}'}).click()</div>
          <div className="pl-4 text-muted">await expect(firstCard).toBeInViewport()</div>
        </div>
        <div className="pz-appear mt-5 flex items-center gap-3 text-[22px] text-rose-300" style={later(600)}><Tick ok={false} /> fails — the filters fill the screen</div>
        <div className="pz-appear mt-2 text-[17px] text-muted" style={later(900)}>committed while it still fails</div>
      </div>
      <div className="flex items-center text-[34px] text-violet-300">→</div>
      <div className={`${box} flex flex-col justify-center p-7`}>
        <div className="flex items-center justify-between"><Kicker>2 · then the change</Kicker><Model m="deepseek" className="pz-pop" style={later(1300)} /></div>
        <div className="pz-appear mt-3 rounded-xl bg-[#0d0f15] p-5 font-mono text-[16.5px] leading-relaxed" style={later(1300)}>
          <div className="text-faint">src/pages/SchedulePage.jsx</div>
          <div className="bg-rose-500/10 text-rose-300">- &lt;div className="space-y-6"&gt;</div>
          <div className="bg-emerald-500/10 text-emerald-300">+ &lt;div className="grid grid-cols-2 gap-2</div>
          <div className="bg-emerald-500/10 pl-4 text-emerald-300">+   lg:block lg:space-y-6"&gt;</div>
        </div>
        <div className="pz-appear mt-5 flex items-center gap-3 text-[22px] text-emerald-300" style={later(2100)}><Tick /> passes</div>
      </div>
    </div>
  );
}

/* ------------------------------ Gate ------------------------------ */

const GATE = [
  ['Unit and API tests', 'about a second'],
  ['Browser tests', 'the whole suite, desktop and mobile'],
  ['Deleted or skipped tests', 'listed for the auditor'],
];

function GateDetail() {
  return (
    <div className="grid h-full grid-cols-[1fr_420px] gap-6">
      <div className={`${box} flex flex-col justify-between gap-3 p-6`}>
        <Kicker>scripts/gate.mjs — a command, not an agent</Kicker>
        {GATE.map(([what, how], i) => (
          <div key={what} className="pz-appear flex flex-1 items-center gap-5 rounded-xl bg-raised px-6" style={later(300 + i * 350)}>
            <Tick />
            <div>
              <div className="text-[25px] text-ink">{what}</div>
              <div className="text-[18px] text-muted">{how}</div>
            </div>
          </div>
        ))}
      </div>
      <div className={`${box} pz-appear flex flex-col justify-center p-6`} style={later(1500)}>
        <div className="font-mono text-[34px] text-emerald-300">{'{"ok":true}'}</div>
        <div className="mt-4 text-[23px] leading-snug text-muted">The workflow reads <b className="text-ink">the result</b>, not the agent’s word.</div>
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
        <div className="pz-appear mt-4 h-[64px]" style={later(300)}><Result ok label="the new test passes" /></div>
      </div>
      <div className={`${box} flex flex-col p-6`}>
        <Kicker>2 · The old code put back</Kicker>
        <Flip
          className="mt-3 h-[96px]"
          delay={FLIP}
          front={<Run file="SchedulePage.jsx" tone="border-emerald-400/40 bg-emerald-500/[0.06]"><span className="text-emerald-300">+ grid grid-cols-2 gap-2 lg:block</span></Run>}
          back={<Run file="SchedulePage.jsx" tone="border-amber-400/50 bg-amber-500/[0.08]"><span className="text-amber-300">the fix reverted, the test kept</span></Run>}
        />
        <Flip
          className="mt-4 h-[64px]"
          delay={FLIP + 350}
          front={<Result ok label="the new test passes" />}
          back={<Result ok={false} label="the new test fails" />}
        />
        <div className="pz-appear mt-4 text-[20px] text-emerald-300" style={later(FLIP + 1200)}>… which is the point.</div>
      </div>
      <div className="pz-appear col-span-2 rounded-xl border border-hairline bg-raised px-6 py-5 text-center text-[24px] text-ink" style={later(FLIP + 1700)}>
        <Code>scripts/red-check.mjs</Code> — a test that still passes without the fix <b>proves nothing</b>.
      </div>
    </div>
  );
}

/* ------------------------------ Audit ----------------------------- */

// a small ticket's auditors; a full one splits the read in two and audits the plan first
const LENSES = [
  { icon: '🎯', name: 'The auditor', reads: 'reads the diff against the ticket' },
  { icon: '🖥️', name: 'The browser auditor', reads: 'drives the app' },
];

const FINDINGS = [
  { lens: 'Auditor', text: 'The My agenda count is hidden on phones', verdict: 'refuted — the count is in the mobile nav', ok: false },
  { lens: 'Auditor', text: 'The rail’s gap is not the other panels’ gap', verdict: 'refuted — a nitpick', ok: false },
  { lens: 'Browser', text: 'At 360 px the search field is off-screen', verdict: 'shown by running it — a blocker', ok: true },
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
      <div className="grid grid-cols-2 gap-5">
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
        <span className="ml-2 text-[16px] text-muted">the holes do not line up</span>
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
        <div className="pz-appear flex items-center gap-4 rounded-xl border border-rose-400/40 bg-rose-500/10 px-6 py-5 text-[23px] text-rose-200" style={later(400)}>
          <span className="font-mono text-[15px] text-faint">Round 1</span> 1 blocker
        </div>
        <div className="pz-appear flex items-center gap-4 rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-6 py-5 text-[23px] text-emerald-200" style={later(1500)}>
          <span className="font-mono text-[15px] text-faint">Round 2</span> clean <Tick className="ml-auto" />
        </div>
        <div className="pz-appear mt-3 text-[21px] text-muted" style={later(2100)}>At most <b className="text-ink">two</b> rounds for a small ticket, <b className="text-ink">four</b> for a full one.</div>
        <div className="pz-appear mt-2 flex items-center gap-4 rounded-xl border-2 border-dashed border-amber-400/60 bg-amber-500/10 px-6 py-4" style={later(2700)}>
          <Label name="needs-human" className="shrink-0 whitespace-nowrap text-[13px]" />
          <span className="text-[19px] leading-snug text-muted">The same finding a third time? It stops and asks you. <b className="text-ink">Reply like you would to a colleague</b> and a new run continues.</span>
        </div>
      </div>
    </div>
  );
}

/* -------------------------- Pull request -------------------------- */

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
          <div className="mt-2 flex items-center gap-2 text-[14px]">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-1 font-semibold text-white"><PrIcon /> Open</span>
            <span className="text-muted">the pull request · Closes #140</span>
          </div>
        </div>
        <div className="space-y-5 px-6 py-5">
          <div className="pz-glow rounded-xl border border-emerald-400/60 bg-emerald-500/10 px-4 py-3">
            <div className="text-[20px] text-emerald-100"><b>🔎 Try it</b> — a Vercel preview</div>
            <div className="mt-1 font-mono text-[15px] text-emerald-300 underline decoration-emerald-400/50 underline-offset-4">nam-2026-conference-9k2m….vercel.app</div>
          </div>
          <div className="pz-appear text-[22px] leading-snug text-ink" style={later(600)}>No checkout. No install.<br />No “works on my machine”.</div>
          <div className="pz-appear pt-4" style={later(3400)}>
            <div className="mt-2 flex items-center gap-x-1.5 whitespace-nowrap font-mono text-[13px] text-faint">
              {['git fetch', 'git checkout', 'npm install', 'npm run dev', 'find the page'].map((c, i) => (
                <span key={c} className="flex items-center gap-1.5">{i > 0 && <span>→</span>}<span className="rounded bg-ground/60 px-1.5 py-0.5 line-through decoration-rose-400/70">{c}</span></span>
              ))}
            </div>
            <div className="mt-3 text-[24px] text-emerald-200">Now: <b>one click</b>.</div>
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
          {['On your own phone', 'Send it to whoever asked'].map((l, i) => (
            <div key={l} className="pz-appear flex items-center gap-3 text-[20px] text-muted" style={later(2700 + i * 250)}><Tick className="size-6 text-[12px]" />{l}</div>
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
          <div className="font-display text-[26px] text-emerald-100">See it without opening it</div>
        </div>
        <div className={`${box} pz-appear flex flex-1 flex-col justify-center gap-4 p-6 text-[20px] text-muted`} style={later(700)}>
          <Wf name="screenshots" className="self-start" />
          <div>Every page the diff touches.</div>
          <div>Desktop and mobile.</div>
          <div>No model involved.</div>
          <div>Images live in <b className="text-ink">Vercel Blob</b>.</div>
        </div>
      </div>
      <div className={`${box} pz-appear flex flex-col overflow-hidden`} style={later(1100)}>
        <div className="flex items-center gap-2 border-b border-hairline px-5 py-2.5 text-[17px] text-ink">📸 <b>Screenshots</b> <span className="font-mono text-[14px] text-violet-300">/schedule</span></div>
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
  'Serious: wrong behaviour, a crash, lost data',
  'It happens in normal use',
  'The reviewer showed it by running something',
  'Its own skeptic confirmed it',
  'Both are at least 95% sure',
];

function ReviewDetail() {
  return (
    <div className="grid h-full grid-cols-[1.15fr_1fr] gap-6">
      <div className="flex flex-col gap-3.5">
        <div className="flex items-center gap-3"><Wf name="review" /><Kicker>every finding faces a skeptic</Kicker></div>
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
        </div>
      </div>
      <div className={`${box} flex flex-col p-6`}>
        <Kicker>It approves by default. To block, all five must hold</Kicker>
        <div className="my-3 flex flex-1 flex-col justify-evenly">
          {BLOCKS_WHEN.map((b, i) => (
            <div key={b} className="pz-appear flex items-center gap-4 text-[20px] text-ink" style={later(600 + i * 280)}>
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-violet-500/20 font-mono text-[14px] text-violet-200 ring-1 ring-violet-400/40">{i + 1}</span>{b}
            </div>
          ))}
        </div>
        <div className="pz-appear rounded-xl bg-raised px-4 py-3 text-[18px] leading-snug text-muted" style={later(2300)}>
          Wrong anyway? Reply <b className="text-ink">“finding 2 is wrong”</b>, or 👎, and it is not raised again.
        </div>
      </div>
    </div>
  );
}

/* -------------------------------- QA ------------------------------ */

const QA_STEPS = [
  ['🧠', 'Plan', 'sonnet', 'what to probe: route, attendee, clock, steps'],
  ['✍️', 'Write', 'glm', 'the plan, as Playwright tests'],
  ['▶️', 'Run', null, 'desktop and mobile, at the same time'],
];

const PROBES = [
  'first card in view on a phone',
  'every filter reachable',
  'search, then clear filters',
  'desktop untouched',
];

function QaDetail() {
  return (
    <div className="grid h-full grid-cols-[1.2fr_1fr] gap-6">
      <div className="flex flex-col gap-3.5">
        <div className="flex items-center gap-3"><Wf name="qa" /><Kicker>not the tests again — the gaps they leave</Kicker></div>
        {QA_STEPS.map(([icon, name, model, what], i) => (
          <div key={name} className={`${box} pz-appear flex items-center gap-4 px-5 py-4`} style={later(250 + i * 350)}>
            <span className="text-[26px]">{icon}</span>
            <span className="w-[80px] font-display text-[26px] text-ink">{name}</span>
            <span className="flex-1 text-[20px] leading-snug text-muted">{what}</span>
            {model ? <Model m={model} /> : <span className="rounded-full border border-hairline px-2.5 py-0.5 font-mono text-[13px] text-muted">no model</span>}
          </div>
        ))}
        <div className="pz-appear mt-auto grid grid-cols-2 gap-3" style={later(1500)}>
          <div className="rounded-xl border border-emerald-400/40 bg-emerald-500/[0.07] px-4 py-3.5">
            <div className="flex items-center gap-2 text-[18px] font-semibold text-emerald-100"><Vercel className="size-3.5" /> On the live preview</div>
            <div className="text-[16px] leading-snug text-muted">probes that only look</div>
          </div>
          <div className="rounded-xl border border-sky-400/40 bg-sky-500/[0.07] px-4 py-3.5">
            <div className="text-[18px] font-semibold text-sky-100">📦 In the sandbox</div>
            <div className="text-[16px] leading-snug text-muted">probes that change data</div>
          </div>
        </div>
      </div>
      <div className={`${box} flex flex-col p-5`}>
        <Kicker>Probes, in a real browser</Kicker>
        <div className="mt-5 space-y-5">
          {PROBES.map((p, i) => (
            <div key={p} className="pz-appear flex items-center gap-3 text-[19px] text-ink" style={later(1900 + i * 380)}><Tick className="size-7 text-[13px]" /> {p}</div>
          ))}
        </div>
        <div className="pz-appear mt-auto rounded-xl border-l-4 border-emerald-400/60 bg-emerald-500/10 px-4 py-3.5" style={later(3600)}>
          <div className="flex items-center gap-3 font-display text-[21px] text-emerald-200">QA · high confidence <Meter level="high" /></div>
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
  ['tests', 'green'],
  ['review', 'approved'],
  ['QA', 'high confidence'],
  ['screenshots', 'posted'],
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
        <div className="mt-4 flex-1 space-y-4">
          {STATUSES.map(([name, what], i) => (
            <div key={name} className="pz-appear flex items-center gap-3" style={later(200 + i * 200)}>
              <Tick className="size-6 text-[12px]" />
              <div className="flex flex-1 items-baseline justify-between"><span className="text-[20px] text-ink">{name}</span><span className="text-[16px] text-faint">{what}</span></div>
            </div>
          ))}
        </div>
        <div className="pz-appear text-[19px] leading-snug text-ink" style={later(1100)}><b>Machines gate, agents advise, people merge.</b></div>
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
          <div className="mt-2 text-[21px] leading-snug text-muted">Read it. <b className="text-ink">Try the preview.</b> Merge.</div>
        </div>
        <motion.div
          className="flex flex-1 flex-col justify-center rounded-2xl border border-violet-400/60 bg-raised p-5"
          initial={{ opacity: 0, x: 40 }} animate={merged ? { opacity: 1, x: 0 } : {}} transition={{ type: 'spring', stiffness: 160, damping: 16, delay: 0.5 }}
        >
          <div className="font-display text-[26px] text-ink">⚡ The run wakes up</div>
          <div className="mt-1.5 text-[19px] leading-snug text-muted">It is not finished until production is.</div>
        </motion.div>
      </div>
    </div>
  );
}

/* ---------------------------- Production -------------------------- */

const LIVE = [
  { icon: <MergeIcon className="size-7 text-violet-300" />, title: 'Merged to main', sub: '', at: 200 },
  { icon: <Vercel className="size-6 text-ink" />, title: 'Production deployment', sub: 'Ready', at: 900 },
  { icon: <span className="text-[26px]">🩺</span>, title: 'GET /api/health', sub: <span className="font-mono text-emerald-300">{'{ "ok": true }'}</span>, at: 1700 },
  { icon: <IssueIcon className="size-7 text-violet-300" />, title: 'Issue #140 closed', sub: 'it says where it is live', at: 2500 },
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
  { at: 0, Detail: Sizing },
  { at: 0, Detail: Ladder },
  { at: 1, Detail: Sandbox },
  { at: 1, Detail: SpecDetail },
  { at: 3, Detail: BuildDetail },
  { at: 3, Detail: Durable },
  { at: 4, Detail: GateDetail },
  { at: 4, Detail: RedCheckDetail },
  { at: 4, Detail: Climb },
  { at: 5, Detail: AuditDetail },
  { at: 5, Detail: LoopDetail },
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
  const [left, setLeft] = useState(null);
  const was = useRef(step);
  useEffect(() => {
    if (was.current === step) return;
    setLeft(was.current);
    was.current = step;
  }, [step]);
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
            ['Vercel Workflows', 'The run is one durable workflow', 'Every stop is a saved step. TypeScript decides the flow, not a prompt.'],
            ['Vercel Sandbox', 'Every agent gets a fresh machine', 'Forked in seconds, and it never saw the stop before.'],
            ['AI Gateway', 'Every model call goes through one door', 'So each stop records what it did and what it cost.'],
          ].map(([product, title, body], i) => (
            <div key={title} className={`${box} pz-appear flex items-center gap-5 px-6 py-3.5`} style={later(900 + i * 250)}>
              <span className="grid size-12 shrink-0 place-items-center rounded-xl border border-violet-400/50 bg-raised"><Vercel className="size-5 text-ink" /></span>
              <div><div className="font-mono text-[13px] uppercase tracking-[0.14em] text-violet-300">{product}</div><div className="font-display text-[25px] leading-tight text-ink">{title}</div><div className="text-[17px] leading-snug text-muted">{body}</div></div>
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

      {/* Only the panel on screen is mounted, with the one it replaced kept just long
          enough to fade out: twenty panels of running animations at once made the
          deck slow enough to time out its own test under load. */}
      {STOPS.map(({ Detail }, i) => Detail && (i === step || i === left) && (
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
    body: 'Follow ticket #140 along this rail. At each stop you meet the piece of Vercel that makes it work.',
  },
  {
    kicker: 'Triage',
    title: 'One webhook in, two decisions by Jev, about a second',
    body: 'Ship starts, and Jev sizes the ticket and picks the models before any machine exists.',
  },
  {
    kicker: 'Triage · size',
    title: 'First question: how big is this ticket?',
    body: 'The size decides how many auditors and rounds the ticket gets. Not sure? The plan will tell.',
  },
  {
    kicker: 'Triage · models',
    title: 'Second question: which model for each step?',
    body: 'Four tiers of model behind AI Gateway. Each agent step of the workflow starts on the cheapest tier that can do it.',
  },
  {
    kicker: 'Plan · Vercel Sandbox',
    title: 'A clean machine in seconds — and it never holds a key',
    body: 'The run forks a sandbox that is already set up. The real tokens are added on the way out, for a few hosts only.',
  },
  {
    kicker: 'Plan · the spec',
    title: 'A plan before any code, while a mistake is still cheap',
    body: 'The spec is the branch’s first commit: what will change, where, and how it will be proved.',
  },
  {
    kicker: 'Build',
    title: 'The failing test first — then the change',
    body: 'The check is committed while it still fails, so the history proves it failed.',
  },
  {
    kicker: 'Build · Vercel Workflows',
    title: 'And if the factory is redeployed halfway through the build?',
    body: 'Nothing is lost. Finished steps replay from the log, and the build was running in the sandbox all along.',
  },
  {
    kicker: 'Gate',
    title: 'A gate agents cannot argue with',
    body: 'Not AI at all: a script runs the tests, and the workflow reads its result.',
  },
  {
    kicker: 'Gate · the red-check',
    title: 'Proof the test can fail',
    body: 'The old code goes back and the new tests run again. If they still pass, they never tested the change.',
  },
  {
    kicker: 'Gate · when it is red',
    title: 'Cheap first, and a way up when cheap is not enough',
    body: 'A red gate sends the fix one tier up. The cheap model was measured first, right here.',
  },
  {
    kicker: 'Audit',
    title: 'Independent auditors, and a skeptic for every blocker',
    body: 'Auditors that never saw the code written. A finding counts only if a skeptic can show it.',
  },
  {
    kicker: 'Audit · fix and loop',
    title: 'Fix, gate, audit — until clean, or until it asks you',
    body: 'The loop is bounded by code, so nothing spins all night on your bill.',
  },
  {
    kicker: 'Preview · Vercel Previews',
    title: 'Every pull request is a running app you can try',
    body: 'The pull request opens once the gate is green. Vercel deploys it, and the run pins the link on top.',
  },
  {
    kicker: 'Preview · screenshots on the pull request',
    title: 'And before you even click: before and after, side by side',
    body: 'The same preview, photographed next to production. Replaced on every push.',
  },
  {
    kicker: 'Review & QA · code review',
    title: 'Review that approves by default, and proves what it flags',
    body: 'Reviewers that cry wolf get ignored. A blocker has to be serious, shown, and certain.',
  },
  {
    kicker: 'Review & QA · QA',
    title: 'QA tries to break it, on the app you would click on',
    body: 'A strong model plans the probes, a cheap one writes them, and they run on the live preview.',
  },
  {
    kicker: 'Merge · Vercel Workflows',
    title: 'Now it waits for you — and waiting is free',
    body: 'The run sleeps until you merge. Review it in an hour, or after the weekend.',
  },
  {
    kicker: 'Merge',
    title: 'The last click is always yours',
    body: 'Nothing merges itself. The verdicts tell you where to look; the click is yours.',
  },
  {
    kicker: 'Production',
    title: 'Done means live, not merged',
    body: 'The run waits for the production deployment and asks the app whether it is healthy.',
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
  stretch('triage', 'Triage', 'text-violet-300', 'violet', 1, 4),
  stretch('plan', 'Plan', 'text-amber-300', 'amber', 4, 6),
  stretch('build', 'Build', 'text-cyan-300', 'cyan', 6, 8),
  stretch('gate', 'Gate', 'text-emerald-300', 'emerald', 8, 11),
  stretch('audit', 'Audit', 'text-amber-300', 'amber', 11, 13),
  stretch('pr', 'Pull request and preview', 'text-violet-300', 'violet', 13, 15),
  stretch('checks', 'Review and QA', 'text-cyan-300', 'cyan', 15, 17),
  stretch('merge', 'Merge and production', 'text-emerald-300', 'emerald', 17, 20),
];
