import { useEffect, useState } from 'react';
import { animate, motion } from 'motion/react';
import { at, Show, Replay, Code, Label, Kicker, Vercel, PrIcon, later, box } from './kit.jsx';
import { Orbits } from './opening.jsx';
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
        <div className="mt-2 font-display text-[23px] leading-tight text-ink">The same ticket, routed by Jev</div>
        <div className="mt-8 flex items-baseline gap-4">
          <span className="relative font-display text-[56px] leading-none text-faint">
            $4.59
            <span className="pz-fill absolute inset-x-0 top-1/2 h-[3px] origin-left bg-rose-400" style={{ animationDuration: '500ms', animationDelay: '1700ms' }} />
          </span>
          <span className="text-[15px] text-faint">Claude models only</span>
        </div>
        <div className="mt-5 font-display text-[108px] leading-none text-ink"><Count to={1.8} prefix="$" decimals={2} delay={1900} /></div>
        <div className="mt-2 text-[17px] text-muted">routed per job, cheapest first</div>
        <motion.div
          className="mt-auto self-start rounded-full border border-emerald-400/50 bg-emerald-500/15 px-6 py-2 font-display text-[32px] text-emerald-200"
          initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 13, delay: 3.2 }}
        >
          61% less
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
const STAGES = ['triage', 'plan', 'build', 'gate', 'audit', 'PR'];

function ScaleScene() {
  return (
    <div style={at(80, 70, 1440, 540)} className={`${box} overflow-hidden`}>
      <div className="grid grid-cols-[110px_250px_1fr_150px] border-b border-hairline bg-raised px-6 py-2.5 font-mono text-[13px] uppercase tracking-wider text-faint">
        <span>ticket</span><span>its own sandbox</span><span>{STAGES.join(' → ')}</span><span className="text-right">result</span>
      </div>
      {TICKETS.map((n, i) => {
        const human = n === 70;
        const dur = 3.2 + ((i * 7) % 5) * 0.55;
        return (
          <div key={n} className="pz-appear grid grid-cols-[110px_250px_1fr_150px] items-center border-b border-hairline/50 px-6 py-[9px]" style={later(i * 90)}>
            <span className="font-mono text-[17px] text-ink">#{n}</span>
            <span className="font-mono text-[14px] text-muted">ship-{n} · forked</span>
            <div className="h-2.5 overflow-hidden rounded-full bg-overlay">
              <motion.div
                className={`h-full rounded-full ${human ? 'bg-gradient-to-r from-violet-500 to-amber-400' : 'bg-gradient-to-r from-violet-500 to-cyan-300'}`}
                initial={{ width: '0%' }}
                animate={{ width: human ? '78%' : '100%' }}
                transition={{ duration: dur, delay: 0.4 + i * 0.12, ease: [0.4, 0, 0.2, 1] }}
              />
            </div>
            <motion.span
              className="text-right"
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.4 + i * 0.12 + dur, type: 'spring', stiffness: 300, damping: 15 }}
            >
              {human ? <Label name="needs-human" className="text-[12px]" /> : <span className="inline-flex items-center gap-1.5 text-[15px] font-semibold text-emerald-300"><PrIcon /> PR + preview</span>}
            </motion.span>
          </div>
        );
      })}
      {/* the tally, once the last run is home */}
      <div className="pz-appear flex items-center gap-6 px-6 py-3 text-[16px] text-muted" style={later(7000)}>
        <span className="flex items-center gap-2"><span className="inline-flex items-center gap-1.5 font-semibold text-emerald-300"><PrIcon /> 9</span> pull requests, each on its own preview</span>
        <span className="flex items-center gap-2"><Label name="needs-human" className="text-[12px]" /> 1 question, back to you</span>
        <span className="ml-auto font-mono text-[14px] text-faint">an illustration · no laptop open for any of them</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Your role — what the factory leaves to you, then the bookend.
 * ------------------------------------------------------------------ */

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

      {/* the bookend: the title's orbits, back behind the last words */}
      <Show on={step === 1} from="none" delay={400} style={at(0, 0, 1600, 900)} className="pointer-events-none">
        <Orbits style={at(380, 10, 840, 840)} className="opacity-[0.08]" />
      </Show>
      <Show on={step === 1} from="scale" style={at(80, 70, 1440, 760)} className="flex flex-col items-center justify-center text-center">
        <div className="font-display text-[88px] leading-[0.98] text-ink">
          Write the ticket.<br />
          Click merge.<br />
          <span className="pz-shine bg-clip-text text-transparent">The factory does the rest.</span>
        </div>
        <div className="mt-9 flex items-center gap-3 text-[19px] text-muted">
          <Vercel className="size-4 text-ink" />
          {['Workflows', 'Sandbox', 'AI Gateway', 'Blob', 'Previews'].map((p) => <span key={p} className="rounded-full border border-hairline bg-ground/60 px-3.5 py-1 font-mono text-[16px]">{p}</span>)}
          <span className="text-faint">+ Jev, Turso and Claude Code</span>
        </div>
        <div className="mt-6 font-mono text-[20px] text-muted">github.com/jonasingvar/nam-2026-conference</div>
        <div className="mt-3 text-[17px] text-faint">The ship loop is Andy Vays’s design · built at Equal Experts by Jonas Claesson and Abraham Marín Pérez · rebuilt on Vercel by Jonas Claesson</div>
      </Show>
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
        body: 'Real receipts from this repository. Routing each job to the cheapest model that could do it cut one ticket by 61%.',
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
