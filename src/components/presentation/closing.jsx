import { useEffect, useState } from 'react';
import { animate, motion } from 'motion/react';
import { at, Show, Replay, Code, Label, Kicker, Model, Vercel, PrIcon, later, box } from './kit.jsx';
import { GH } from './apps.jsx';

/** A number that counts up to `to` as it appears. */
function Count({ to, prefix = '', decimals = 0, delay = 0 }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    const c = animate(0, to, { duration: 1.4, delay: delay / 1000, ease: [0.22, 1, 0.36, 1], onUpdate: setV });
    return () => c.stop();
  }, [to, delay]);
  return <span className="tabular-nums">{prefix}{v.toFixed(decimals)}</span>;
}

/* ------------------------------------------------------------------ *
 * Receipts — every run on the record, and what real tickets cost.
 * The numbers are this repository's own runs: ticket #38 (a fast run,
 * pull request #39) and ticket #16 (a small run, before and after Jev
 * chose the models).
 * ------------------------------------------------------------------ */

const MODEL_ROWS = [
  ['Spec', 'deepseek', 'standard', '63%', '$0.028', '$0.042'],
  ['Implement', 'deepseek', 'standard', '66%', '$0.049', '$0.17'],
  ['Audit', 'deepseek', 'standard', '80%', '$0.028', '$0.058'],
  ['Skeptic', 'glm', 'standard', '70%', '$0.018', '$0.034'],
];

const RUN_ROWS = [
  { n: 38, wf: 'ship', title: 'Update the engineering talk', phase: '⏳ Merge', size: 'fast', spend: '$0.31', all: '$0.93 all', tone: 'text-amber-300' },
  { child: true, wf: 'review', phase: 'approved', spend: '$0.09', tone: 'text-emerald-300' },
  { child: true, wf: 'qa', phase: 'pass', spend: '$0.54', tone: 'text-emerald-300' },
  { child: true, wf: 'screenshots', phase: 'posted · 2 pages', spend: '—', tone: 'text-emerald-300' },
  { n: 16, wf: 'ship', title: 'My Agenda: list my upcoming sessions', phase: '⏳ Merge', size: 'small', spend: '$0.58', all: '$1.80 all', tone: 'text-amber-300' },
];

function OnTheRecord() {
  return (
    <div className="grid h-full grid-cols-[1fr_600px] gap-6">
      {/* the progress comment on the issue, as GitHub shows it */}
      <div className={`overflow-hidden rounded-2xl border border-black/10 bg-white ${GH.ink} shadow-2xl shadow-black/50`}>
        <div className={`flex items-center gap-2 border-b ${GH.line} bg-[#f6f8fa] px-5 py-2 text-[14px]`}>
          <span className="size-5 rounded-full bg-violet-300" aria-hidden="true" /><b>the factory</b><span className={GH.muted}>commented on issue #38 · edited at every phase</span>
        </div>
        <div className="px-5 py-3">
          <div className="text-[20px] font-semibold">🏭 Ship on Vercel · waiting for you to review and merge</div>
          <div className={`mt-1.5 text-[14.5px] ${GH.muted}`}>✅ Triage → ✅ Plan → <s>Plan audit</s> → ✅ Build → ✅ Gate → ✅ Audit → ✅ Pull request → ✅ Preview → ✅ Review &amp; QA → <b className={GH.ink}>⏳ Merge</b> → Production</div>
          <table className="mt-4 w-full text-left text-[18px]">
            <thead>
              <tr className={`border-b ${GH.line} ${GH.muted}`}>
                {['Job', 'Model', 'Jev sure', 'Cost'].map((h, i) => <th key={h} className={`py-2 font-semibold ${i > 1 ? 'text-right' : ''}`}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {MODEL_ROWS.map(([job, m, tier, jev, est, actual], i) => (
                <tr key={job} className={`pz-appear border-b ${GH.line}`} style={later(400 + i * 180)}>
                  <td className="py-[15px]">{job}</td>
                  <td><code className="rounded bg-black/[0.06] px-1.5 py-0.5 font-mono text-[14px]">{{ deepseek: 'deepseek-v4.1-flash', glm: 'glm-5.3-flash', sonnet: 'sonnet-5.5' }[m]}</code></td>
                  <td className="text-right">{jev}</td>
                  <td className="text-right font-semibold">{actual}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="pz-appear mt-4 text-[19px]" style={later(1900)}><b>AI spend so far:</b> $0.93</div>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {/* the factory's own /runs page */}
        <div className="pz-appear flex-1 overflow-hidden rounded-2xl border border-hairline bg-[#0d0f15]" style={later(900)}>
          <div className="flex items-center gap-2 border-b border-hairline bg-surface px-4 py-2 font-mono text-[13px] text-faint"><Vercel className="size-3 text-ink" /> nam-2026-factory.vercel.app/runs <span className="ml-auto text-emerald-300">● refreshing</span></div>
          <div className="px-5 py-3">
            {RUN_ROWS.map((r, i) => (
              <div key={i} className={`pz-appear grid grid-cols-[1fr_170px_70px] items-center border-b border-hairline/50 py-[14px] text-[17px] last:border-b-0 ${r.child ? 'text-muted' : 'text-ink'}`} style={later(1200 + i * 160)}>
                <span className="truncate">
                  {r.child ? <span className="ml-4 text-faint">↳ </span> : <span className="mr-2 font-mono text-violet-300">#{r.n}</span>}
                  <b className="font-mono">{r.wf}</b>{r.title && <span className="ml-2 text-faint">{r.title}</span>}
                </span>
                <span className={r.tone}>{r.phase}</span>
                <span className="text-right font-mono">{r.spend}{r.all && <span className="block text-[12px] text-faint">{r.all}</span>}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const SPLIT = [['Plan', 0.04], ['Build', 0.17], ['Audit', 0.09], ['Review & QA', 0.62]];

function Receipts() {
  return (
    <div className="grid h-full grid-cols-3 gap-6">
      <div className="pz-appear flex flex-col rounded-2xl border border-emerald-400/40 bg-emerald-500/[0.05] p-6" style={later(200)}>
        <Kicker>⚡ A fast ticket · #38</Kicker>
        <div className="mt-2 font-display text-[23px] leading-tight text-ink">Label to reviewed pull request</div>
        <div className="mt-5 font-display text-[108px] leading-none text-ink"><Count to={0.93} prefix="$" decimals={2} delay={500} /></div>
        <div className="mt-7 flex-1 space-y-4">
          {SPLIT.map(([phase, cost], i) => (
            <div key={phase} className="grid grid-cols-[120px_1fr_56px] items-center gap-3 text-[17px] text-muted">
              <span>{phase}</span>
              <span className="h-3.5 overflow-hidden rounded-full bg-overlay"><span className="pz-fill block h-full rounded-full bg-gradient-to-r from-violet-500 to-cyan-300" style={{ width: `${(cost / 0.62) * 100}%`, animationDuration: '900ms', animationDelay: `${900 + i * 160}ms` }} /></span>
              <span className="text-right font-mono">${cost.toFixed(2)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="pz-appear flex flex-col rounded-2xl border border-sky-400/40 bg-sky-500/[0.05] p-6" style={later(600)}>
        <Kicker>🟢 A small ticket · #16, run twice</Kicker>
        <div className="mt-2 font-display text-[23px] leading-tight text-ink">The same ticket, built twice</div>
        <div className="mt-8 flex items-baseline gap-4">
          <span className="relative font-display text-[56px] leading-none text-faint">
            $4.11
            <span className="pz-fill absolute inset-x-0 top-1/2 h-[3px] origin-left bg-rose-400" style={{ animationDuration: '500ms', animationDelay: '1700ms' }} />
          </span>
          <span className="text-[15px] text-faint">Claude models only</span>
        </div>
        <div className="mt-5 font-display text-[108px] leading-none text-ink"><Count to={1.8} prefix="$" decimals={2} delay={1900} /></div>
        <div className="mt-2 text-[17px] text-muted">routed per step, cheapest first</div>
        <motion.div
          className="mt-auto self-start rounded-full border border-emerald-400/50 bg-emerald-500/15 px-6 py-2 font-display text-[32px] text-emerald-200"
          initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 13, delay: 3.2 }}
        >
          56% less
        </motion.div>
      </div>

      <div className="pz-appear flex flex-col rounded-2xl border border-hairline bg-surface p-6" style={later(1000)}>
        <Kicker>And every dial is a file</Kicker>
        <div className="mt-4 flex flex-1 flex-col justify-around text-[18px] text-muted">
          {[
            ['The ladder', 'which models each tier may use', 'lib/models.ts'],
            ['The loop', 'auditors and rounds per size', 'workflows/ship.ts'],
            ['The bar', 'what a review may block on', 'lib/review-policy.ts'],
            ['The fence', 'which hosts a sandbox can reach', 'lib/policy.ts'],
          ].map(([name, what, file], i) => (
            <div key={name} className="pz-appear" style={later(1400 + i * 250)}>
              <div className="flex items-baseline gap-3"><b className="font-display text-[26px] text-ink">{name}</b><span className="font-mono text-[13px] text-violet-300">{file}</span></div>
              <div className="text-[17px]">{what}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ReceiptsScene({ step }) {
  return (
    <>
      <Replay on={step === 0} from="up" style={at(80, 64, 1440, 540)}><OnTheRecord /></Replay>
      <Replay on={step === 1} from="up" style={at(80, 64, 1440, 540)}><Receipts /></Replay>
    </>
  );
}

/* ------------------------------------------------------------------ *
 * Many at once.
 * ------------------------------------------------------------------ */

const TICKETS = [64, 65, 66, 67, 68, 69, 70, 71, 72, 73];
// Ten runs as Vercel's Workflows tab lists them (project → Workflows): one row a
// run, its status turning from Active to Completed. An illustration: the ids
// and durations are made up; the columns are the dashboard's own.
const RUN_IDS = ['C7PAZXT', '94K1EHA', '1Z7S892', 'Q2M8LDV', 'H5T3NRW', 'B8X6KJC', 'W4D9FPG', 'L3V7YSA', 'R6N2ZQE', 'T9J5BMH'];
const VC = { ink: 'text-[#171717]', muted: 'text-[#666666]', line: 'border-[#eaeaea]' };
const COLS = 'grid grid-cols-[150px_110px_1fr_190px_170px_110px] items-center';

function Dot({ tone }) {
  return <span className={`inline-block size-2.5 rounded-full ${tone}`} />;
}

function ScaleScene() {
  return (
    <div style={at(80, 64, 1440, 546)} className={`flex flex-col overflow-hidden rounded-2xl border border-black/10 bg-[#fafafa] ${VC.ink} shadow-2xl shadow-black/50`}>
      <div className={`flex items-center border-b ${VC.line} bg-white px-5 py-2.5 text-[15px]`}>
        <span className="flex items-center gap-2.5 font-medium"><Vercel className="size-3.5" /> nam-2026-factory <span className={VC.muted}>⌄</span></span>
        <span className="mx-auto font-medium">Workflows</span>
        <span className="rounded-md border border-[#0070f3] px-2.5 py-0.5 text-[13px] text-[#0070f3]">◉ Live</span>
      </div>
      <div className={`flex items-center gap-2 border-b ${VC.line} px-5 py-2 text-[13px]`}>
        {[['Completed', 'bg-[#50e3c2]'], ['Failed', 'bg-[#ee0000]'], ['Active', 'bg-[#f5a623]'], ['Pending', 'bg-[#c4c4c4]'], ['Canceled', 'bg-[#c4c4c4]']].map(([name, tone]) => (
          <span key={name} className="flex flex-1 items-center gap-2 rounded-md bg-[#f0f0f0] px-3 py-1"><Dot tone={tone} />{name}</span>
        ))}
      </div>
      <div className={`${COLS} border-b ${VC.line} px-5 py-1.5 text-[13px] ${VC.muted}`}>
        <span>ID</span><span>Workflow</span><span>Attributes</span><span>Status</span><span>Result</span><span className="text-right">Duration</span>
      </div>
      <div className="flex-1">
        {TICKETS.map((n, i) => {
          const human = n === 70;
          const dur = 3.2 + ((i * 7) % 5) * 0.55;
          const done = 0.4 + i * 0.12 + dur;
          return (
            <div key={n} className={`pz-appear ${COLS} border-b ${VC.line} px-5 py-[4px] text-[15px] ${i % 2 ? 'bg-white' : ''}`} style={later(i * 90)}>
              <span className="flex items-center gap-2 font-mono text-[13px]">{RUN_IDS[i]}<span className="rounded bg-[#ebebeb] px-1.5 text-[10px] font-semibold">IAD1</span></span>
              <span className="font-mono text-[14px]">ship</span>
              <span className={`font-mono text-[13px] ${VC.muted}`}>issue={n} · sandbox=ship-{n}</span>
              <span className="relative h-6">
                <motion.span className="absolute inset-0 flex items-center gap-2" initial={{ opacity: 1 }} animate={{ opacity: 0 }} transition={{ delay: done, duration: 0.2 }}><Dot tone="bg-[#f5a623]" />Active</motion.span>
                <motion.span className="absolute inset-0 flex items-center gap-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: done, duration: 0.2 }}><Dot tone="bg-[#50e3c2]" />Completed</motion.span>
              </span>
              <motion.span initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: done, type: 'spring', stiffness: 300, damping: 15 }}>
                {human
                  ? <span className="rounded-full bg-[#fff4d6] px-2.5 py-0.5 text-[13px] font-semibold text-[#8a5a00]">needs-human</span>
                  : <span className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-[#0a7d5a]"><PrIcon /> PR + preview</span>}
              </motion.span>
              <motion.span className={`text-right font-mono text-[13px] ${VC.muted}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: done, duration: 0.2 }}>{6 + ((i * 3) % 7)}m {String((i * 17) % 60).padStart(2, '0')}s</motion.span>
            </div>
          );
        })}
      </div>
      {/* the tally, once the last run is home */}
      <div className={`pz-appear flex items-center gap-6 border-t ${VC.line} bg-white px-5 py-2.5 text-[15px] ${VC.muted}`} style={later(7000)}>
        <span><b className="text-[#0a7d5a]">9</b> pull requests, each on its own preview</span>
        <span><b className="text-[#8a5a00]">1</b> question, back to you</span>
        <span className="ml-auto text-[13px]">an illustration of the Workflows tab · no laptop open for any of them</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Your role — what the factory leaves to you, then the bookend.
 * ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ *
 * The whole factory on one slide: every Vercel piece, and the numbered
 * path a ticket takes through them. Laid out on the bare 1600×900 stage.
 * ------------------------------------------------------------------ */

// [x, y, w, h] of each box — the wires below are drawn between these
const N = {
  issue: [60, 150, 250, 120], fn: [390, 150, 280, 120], wf: [750, 150, 790, 120],
  sandbox: [390, 340, 360, 190], gateway: [830, 340, 400, 190], blob: [1310, 340, 190, 190],
  pr: [60, 600, 250, 120], preview: [390, 600, 360, 120], merge: [830, 600, 230, 120], prod: [1140, 600, 400, 120],
};

// [n, path, label, label x, label y, delay]
const WIRES = [
  [1, 'M310 210 L390 210', 'webhook', 350, 196, 500],
  [2, 'M670 210 L750 210', 'starts', 710, 196, 900],
  [3, 'M860 270 C 860 310, 570 300, 570 340', 'forks one per run', 720, 296, 1400],
  [4, 'M750 435 L830 435', 'models', 790, 421, 1900],
  [5, 'M1405 270 L1405 340', 'screenshots', 1340, 318, 2300],
  [6, 'M390 470 C 250 470, 185 520, 185 600', 'pushes the branch', 232, 540, 2700],
  [7, 'M310 660 L390 660', 'builds', 350, 646, 3100],
  [8, 'M750 660 L830 660', 'try it', 790, 646, 3500],
  [9, 'M1060 660 L1140 660', 'deploys', 1100, 646, 3900],
  [10, 'M1540 660 L1568 660 L1568 210 L1540 210', 'health', 1568, 452, 4300],
];

function Part({ at: [x, y, w, h], name, sub, delay = 0, vercel = true, tone = 'border-hairline bg-surface', children }) {
  return (
    <div className={`pz-appear absolute flex flex-col justify-center rounded-2xl border px-5 ${tone}`} style={{ left: x, top: y, width: w, height: h, ...later(delay) }}>
      <div className="flex items-center gap-2 whitespace-nowrap font-display text-[21px] leading-tight text-ink">{vercel && <Vercel className="size-3.5 shrink-0" />}{name}</div>
      {sub && <div className="mt-1 text-[15px] leading-snug text-muted">{sub}</div>}
      {children}
    </div>
  );
}

function Architecture() {
  return (
    <>
      <div className="pz-appear absolute inset-x-0 top-[62px] text-center font-display text-[38px] text-ink">How it is all wired <span className="text-muted">— one ticket, ten hops, all on</span> <Vercel className="mb-1.5 inline size-7" /> Vercel</div>

      <svg viewBox="0 0 1600 900" className="pointer-events-none absolute inset-0" aria-hidden="true">
        {WIRES.map(([n, d, label, lx, ly, t]) => (
          <g key={n}>
            <path d={d} pathLength="1" className="pz-draw-in" fill="none" stroke="#6d28d9" strokeWidth="2.5" style={later(t)} />
            <g className="pz-appear" style={later(t + 500)}>
              <path d={d} pathLength="1" className="pz-flow" fill="none" stroke="#c4b5fd" strokeWidth="2.5" />
              <circle cx={lx} cy={ly - 26} r="12" fill="#12141c" stroke="#a78bfa" strokeWidth="1.5" />
              <text x={lx} y={ly - 21} textAnchor="middle" fill="#ede9fe" fontSize="13" fontFamily="JetBrains Mono, monospace">{n}</text>
              <text x={lx} y={ly} textAnchor="middle" fill="#9aa2b8" fontSize="12.5" fontFamily="JetBrains Mono, monospace" stroke="#12141c" strokeWidth="5" paintOrder="stroke">{label}</text>
            </g>
          </g>
        ))}
      </svg>

      <Part at={N.issue} vercel={false} name="GitHub issue" delay={200}><div className="mt-2"><Label name="ready-for-ai" className="text-[12px]" /></div></Part>
      <Part at={N.fn} name="Vercel Functions" sub={<Code className="text-[14px]">POST /api/github</Code>} delay={700} />
      <Part at={N.wf} name="Vercel Workflows" sub="ship: one durable run, every step saved · sleeps for free until you merge" delay={1100} tone="pz-glow border-violet-400/60 bg-raised">
        <div className="mt-1.5 whitespace-nowrap font-mono text-[12.5px] text-violet-200">triage → plan → build → gate → audit → pull request → preview → review &amp; QA → merge → production</div>
      </Part>
      <Part at={N.sandbox} name="Vercel Sandbox" sub="a fresh machine per run, forked in seconds. The agent runs here and holds no keys." delay={1600} />
      <Part at={N.gateway} name="AI Gateway" sub="every model behind one endpoint" delay={2100}>
        <div className="mt-2 flex flex-wrap gap-1">{['haiku', 'glm', 'deepseek', 'sonnet', 'opus'].map((m) => <Model key={m} m={m} className="text-[11.5px]" />)}</div>
        <div className="mt-2 text-[14px] text-amber-200">Jev picks one per step, in 300 ms</div>
      </Part>
      <Part at={N.blob} name="Vercel Blob" sub="the screenshots" delay={2500} />
      <Part at={N.pr} vercel={false} name="Pull request" sub="link, screenshots, review, QA" delay={2900} />
      <Part at={N.preview} name="Vercel Preview" sub="its own isolated deployment and URL" delay={3300} tone="border-emerald-400/50 bg-emerald-500/[0.07]" />
      <Part at={N.merge} vercel={false} name="You click merge" sub="the run wakes" delay={3700} tone="border-emerald-400/50 bg-emerald-500/[0.07]" />
      <Part at={N.prod} name="Production" sub="the app on Vercel, data on Turso · checked before the issue is called done" delay={4100} />

      <div className="pz-appear absolute inset-x-0 top-[762px] text-center" style={later(4800)}>
        <div className="font-display text-[34px] leading-tight text-ink">Write the ticket. Click merge. <span className="pz-shine bg-clip-text text-transparent">The factory does the rest.</span></div>
        <div className="mt-2 font-mono text-[17px] text-muted">github.com/jonasingvar/nam-2026-conference</div>
        <div className="mt-1 text-[14px] text-faint">The ship loop is Andy Vays’s design · built at Equal Experts by Jonas Claesson and Abraham Marín Pérez · rebuilt on Vercel by Jonas Claesson</div>
      </div>
    </>
  );
}

function RoleScene({ step }) {
  return (
    <>
      <Show on={step === 0} style={at(80, 130, 1440, 400)} className="grid grid-cols-4 gap-6">
        {[
          ['✍️', 'You write the ticket', 'Done when is the contract.'],
          ['🔧', 'You tune the factory', 'Models, rounds, the review bar: each is a file.'],
          ['🚦', 'You keep the merge', 'Nothing merges itself.'],
          ['🧠', 'You pace the work', 'As many tickets as you can review well.'],
        ].map(([icon, t, d], i) => (
          <motion.div
            key={t}
            className={`${box} flex flex-col justify-center p-7`}
            initial={{ opacity: 0, y: 60, rotateX: -25 }}
            animate={{ opacity: 1, y: 0, rotateX: 0 }}
            transition={{ delay: 0.2 + i * 0.15, type: 'spring', stiffness: 120, damping: 16 }}
          >
            <span className="text-[52px]">{icon}</span>
            <div className="mt-5 font-display text-[30px] leading-tight text-ink">{t}</div>
            <div className="mt-3 text-[18px] text-muted">{d}</div>
          </motion.div>
        ))}
      </Show>

      {/* the last slide: how it is all wired, one numbered path from the label to production */}
      <Replay on={step === 1} from="scale" style={at(0, 0, 1600, 900)}><Architecture /></Replay>
    </>
  );
}

export const CLOSING = [
  {
    id: 'receipts', name: 'On the record', accent: 'text-cyan-300', tone: 'sky',
    beats: [
      {
        kicker: 'On the record',
        title: 'Every run says what it did, on which model, for how much',
        body: 'Real numbers from one ticket in this repository, on the issue and on the factory’s own page.',
      },
      {
        kicker: 'What it costs',
        title: 'One to two dollars a ticket — and every dial is yours',
        body: 'Real receipts from this repository. One ticket, built twice: $4.11 on Claude models only, $1.80 once Jev routed each step.',
      },
    ],
    Scene: ReceiptsScene,
  },
  {
    id: 'scale', name: 'Many at once', accent: 'text-sky-300', tone: 'sky',
    beats: [
      {
        kicker: 'Don’t babysit one ticket — hand it ten',
        title: 'Ten labels, ten sandboxes, ten previews',
        body: 'Nothing runs on your machine. The limit is how many pull requests you can review well.',
      },
    ],
    Scene: ScaleScene,
  },
  {
    id: 'role', name: 'Your role', accent: 'text-violet-300', tone: 'violet',
    beats: [
      {
        kicker: 'Your role',
        title: 'You are the tech lead of a team of agents',
        body: 'None of this replaces engineering judgement. It moves it to where it counts.',
      },
      null,
    ],
    Scene: RoleScene,
  },
];
