import { useEffect, useState } from 'react';
import { animate, motion } from 'motion/react';
import { at, Show, Replay, Code, Label, Kicker, Vercel, PrIcon, later, box } from './kit.jsx';
import { Orbits } from './opening.jsx';
import { GH, GhOpenIcon, GitHub } from './apps.jsx';

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
  ['Skeptic', 'glm', 'standard', '70%', '$0.018', '$0.034 · 2 runs'],
  ['Review lens', 'sonnet', 'strong', '92%', '$0.24', '$0.086'],
  ['QA probe writer', 'glm', 'standard', '36%', '$0.020', '$0.047'],
];

const RUN_ROWS = [
  { n: 38, wf: 'ship', title: 'Update the engineering talk', phase: '⏳ Merge', size: 'fast', spend: '$0.31', all: '$0.93 all', tone: 'text-amber-300' },
  { child: true, wf: 'review', phase: 'approved', spend: '$0.09', tone: 'text-emerald-300' },
  { child: true, wf: 'qa', phase: 'pass', spend: '$0.54', tone: 'text-emerald-300' },
  { child: true, wf: 'screenshots', phase: 'posted · 2 pages', spend: '—', tone: 'text-emerald-300' },
  { n: 16, wf: 'ship', title: 'My Agenda: list my upcoming sessions', phase: '⏳ Merge', size: 'small', spend: '$0.58', all: '$1.80 all', tone: 'text-amber-300' },
];

const VIEWS = [
  ['🔭', 'The trace', 'every phase a named step, live, in Vercel’s Workflows tab'],
  ['🏷️', 'Attributes', 'issue · phase · size · models · spend_usd — filter runs by any of them'],
  ['💬', 'One comment', 'on the issue, edited at every phase — the table on the left'],
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
          <div className={`mt-1.5 text-[14.5px] ${GH.muted}`}>✅ Triage → ✅ Plan → ✅ Build → ✅ Gate → ✅ Audit → ✅ Pull request → ✅ Preview → ✅ Review &amp; QA → <b className={GH.ink}>⏳ Merge</b> → Production</div>
          <div className="mt-1.5 text-[14px]"><b>Size:</b> fast — Jev, 71% sure</div>
          <table className="mt-3 w-full text-left text-[15.5px]">
            <thead>
              <tr className={`border-b ${GH.line} ${GH.muted}`}>
                {['Job', 'Model', 'Tier', 'Jev', 'Est.', 'Actual'].map((h, i) => <th key={h} className={`py-1.5 font-semibold ${i > 2 ? 'text-right' : ''}`}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {MODEL_ROWS.map(([job, m, tier, jev, est, actual], i) => (
                <tr key={job} className={`pz-appear border-b ${GH.line}`} style={later(400 + i * 180)}>
                  <td className="py-[10px]">{job}</td>
                  <td><code className="rounded bg-black/[0.06] px-1.5 py-0.5 font-mono text-[12.5px]">{{ deepseek: 'deepseek-v4.1-flash', glm: 'glm-5.3-flash', sonnet: 'sonnet-5.5' }[m]}</code></td>
                  <td className={GH.muted}>{tier}</td>
                  <td className="text-right">{jev}</td>
                  <td className={`text-right ${GH.muted}`}>{est}</td>
                  <td className="text-right font-semibold">{actual}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className={`pz-appear mt-3 text-[14px] ${GH.muted}`} style={later(1700)}>Picked per job by Jev from AI Gateway’s live catalog: the cheapest tier likely to be enough. A failure climbs one tier (↑).</div>
          <div className="pz-appear mt-2 text-[15px]" style={later(1900)}><b>AI spend, build to review:</b> $0.93</div>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {/* the factory's own /runs page */}
        <div className="pz-appear overflow-hidden rounded-2xl border border-hairline bg-[#0d0f15]" style={later(900)}>
          <div className="flex items-center gap-2 border-b border-hairline bg-surface px-4 py-2 font-mono text-[13px] text-faint"><Vercel className="size-3 text-ink" /> nam-2026-factory.vercel.app/runs <span className="ml-auto text-emerald-300">● refreshing</span></div>
          <div className="px-4 py-2">
            {RUN_ROWS.map((r, i) => (
              <div key={i} className={`pz-appear grid grid-cols-[1fr_130px_70px] items-center border-b border-hairline/50 py-[5px] text-[14px] last:border-b-0 ${r.child ? 'text-muted' : 'text-ink'}`} style={later(1200 + i * 160)}>
                <span className="truncate">
                  {r.child ? <span className="ml-4 text-faint">↳ </span> : <span className="mr-2 font-mono text-violet-300">#{r.n}</span>}
                  <b className="font-mono">{r.wf}</b>{r.title && <span className="ml-2 text-faint">{r.title}</span>}
                </span>
                <span className={r.tone}>{r.phase}</span>
                <span className="text-right font-mono">{r.spend}{r.all && <span className="block text-[11px] text-faint">{r.all}</span>}</span>
              </div>
            ))}
          </div>
        </div>
        {VIEWS.map(([icon, name, what], i) => (
          <div key={name} className={`${box} pz-appear flex flex-1 items-center gap-4 px-5`} style={later(2000 + i * 250)}>
            <span className="text-[24px]">{icon}</span>
            <div className="leading-tight"><div className="font-display text-[20px] text-ink">{name}</div><div className="text-[14.5px] text-muted">{what}</div></div>
          </div>
        ))}
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
        <div className="mt-auto pt-3 text-[15px] text-faint">Built on DeepSeek V4.1 Flash, judged on Sonnet 5.5: 13 agent runs in all.</div>
      </div>

      <div className="pz-appear flex flex-col rounded-2xl border border-sky-400/40 bg-sky-500/[0.05] p-6" style={later(600)}>
        <Kicker>🟢 A small ticket · #16, run twice</Kicker>
        <div className="mt-2 font-display text-[23px] leading-tight text-ink">The same ticket, before and after Jev chose the models</div>
        <div className="mt-8 flex items-baseline gap-4">
          <span className="relative font-display text-[56px] leading-none text-faint">
            $4.59
            <span className="pz-fill absolute inset-x-0 top-1/2 h-[3px] origin-left bg-rose-400" style={{ animationDuration: '500ms', animationDelay: '1700ms' }} />
          </span>
          <span className="text-[15px] text-faint">Claude models only</span>
        </div>
        <div className="mt-5 font-display text-[108px] leading-none text-ink"><Count to={1.8} prefix="$" decimals={2} delay={1900} /></div>
        <div className="mt-2 text-[17px] text-muted">routed per job, cheapest first</div>
        <div className="mt-3 text-[15px] leading-snug text-faint">The same ticket, built again once Jev was choosing the model for each job.</div>
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
        <div className="text-[15px] leading-snug text-faint">Change one in a pull request — and the factory reviews its own change.</div>
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
        <span className="ml-auto font-mono text-[14px] text-faint">no laptop was open for any of them</span>
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
      <Show on={step === 0} style={at(80, 90, 1440, 500)} className="grid grid-cols-4 gap-6">
        {[
          ['✍️', 'You write the ticket', 'Its Done when is the contract every agent is judged against. The thinking moved up front — it did not go away.'],
          ['🔧', 'You tune the factory', 'Which models, how many rounds, what a review may block on. Each is a file, and shaping it to your codebase is engineering.'],
          ['🚦', 'You keep the merge', 'Nothing merges itself. The verdicts tell you where to look; the preview and the screenshots let you check in a minute.'],
          ['🧠', 'You pace the work', 'You lead a team of agents now. Run as many tickets as you can review well — that is the real limit.'],
        ].map(([icon, t, d], i) => (
          <motion.div
            key={t}
            className={`${box} flex flex-col p-7`}
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
        <Orbits style={at(380, 10, 840, 840)} className="opacity-[0.14]" />
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

/* ------------------------------------------------------------------ *
 * Now you — a ticket of your own, start to finish, without leaving
 * GitHub.
 * ------------------------------------------------------------------ */

const LAB_STEPS = [
  ['🎫', 'Write the ticket', 'a GitHub issue with a Done when list'],
  ['🏷️', 'Label it ready-for-ai', 'then watch its one comment fill in'],
  ['👀', 'Try it, then merge', 'the preview, the screenshots, the verdicts'],
];

/** The turn from talk to demo. */
function YourTurn() {
  return (
    <div className="flex size-full flex-col items-center justify-center text-center">
      <Kicker className="pz-appear">That was the tour</Kicker>
      <div className="pz-appear mt-5 font-display text-[110px] leading-none text-ink" style={later(200)}>
        Now <span className="pz-shine bg-clip-text text-transparent">watch it run</span>
      </div>
      <div className="pz-appear mt-6 max-w-[980px] text-[26px] leading-snug text-muted" style={later(600)}>
        One ticket, all the way to production — and you never leave GitHub.
      </div>
      <div className="mt-12 flex gap-5">
        {LAB_STEPS.map(([icon, title, sub], i) => (
          <div key={title} className="pz-appear w-[370px] rounded-2xl border border-hairline bg-surface px-6 py-5 text-left" style={later(1100 + i * 250)}>
            <div className="font-mono text-[14px] text-emerald-300">step {i + 1}</div>
            <div className="mt-1 text-[22px] font-semibold text-ink">{icon} {title}</div>
            <div className="text-[16px] text-muted">{sub}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LabScene({ step: beat }) {
  // beat 0 is the turn to the room; the three steps follow it
  const step = beat - 1;
  return (
    <>
      <Show on={beat === 0} from="scale" style={at(80, 60, 1440, 780)}><YourTurn /></Show>

      <Show on={beat > 0} from="left" style={at(80, 80, 440, 520)} className="flex flex-col gap-4">
        {LAB_STEPS.map(([icon, title, sub], i) => (
          <div key={title} className={`flex items-center gap-4 rounded-2xl border px-5 py-5 transition-all duration-500
            ${i === step ? 'pz-glow border-emerald-400/60 bg-raised' : 'border-hairline bg-surface'} ${i > step ? 'opacity-45' : ''}`}>
            <span className="grid size-12 shrink-0 place-items-center rounded-full bg-overlay font-display text-[24px] text-ink">{i < step ? '✓' : i + 1}</span>
            <div>
              <div className="text-[22px] font-semibold text-ink">{icon} {title}</div>
              <div className="text-[16px] text-muted">{sub}</div>
            </div>
          </div>
        ))}
      </Show>

      {/* 1 · a new issue, written so a test can check it */}
      <Replay on={step === 0} from="right" style={at(570, 80, 950, 520)} className="flex flex-col gap-4">
        <GitHub tab="Issues" className="min-h-0 flex-1">
          <div className="px-6 py-4">
            <div className="text-[24px] leading-tight">Pick more than one track on the schedule <span className={GH.muted}>#42</span></div>
            <span className={`mt-2 inline-flex items-center gap-1.5 rounded-full ${GH.green} px-3 py-1 text-[14px] font-semibold text-white`}><GhOpenIcon /> Open</span>
            <div className="mt-3 grid grid-cols-[1fr_180px] gap-5">
              <div className="overflow-hidden rounded-md border border-[#54aeff]/60">
                <div className="flex items-center gap-2 border-b border-[#54aeff]/40 bg-[#ddf4ff] px-4 py-2 text-[14px]">
                  <span className="size-5 rounded-full bg-violet-300" aria-hidden="true" />
                  <b>you</b><span className={GH.muted}>opened just now</span>
                </div>
                <div className="px-4 py-3">
                  <div className={`text-[15px] ${GH.muted}`}><b className={GH.ink}>Why:</b> people follow two tracks and have to flip between them.</div>
                  <div className={`mt-2 border-b ${GH.line} pb-1 text-[18px] font-semibold`}>Done when</div>
                  <ul className="mt-2 space-y-1.5 text-[15px]">
                    {['The schedule’s track filter takes more than one track', 'It shows sessions in any of the tracks picked', 'The choice survives a reload'].map((d, i) => (
                      <li key={d} className="pz-appear flex items-center gap-2" style={later(500 + i * 220)}>
                        <span className={`size-4 shrink-0 rounded border ${GH.line}`} />{d}
                      </li>
                    ))}
                  </ul>
                  <div className={`pz-appear mt-3 text-[15px] ${GH.muted}`} style={later(1300)}><b className={GH.ink}>Out of scope:</b> the speakers page</div>
                </div>
              </div>
              <div className="space-y-3 text-[14px]">
                <div className={`border-b ${GH.line} pb-2`}><div className={`font-semibold ${GH.muted}`}>Assignees</div><div className={GH.muted}>No one</div></div>
                <div className={`border-b ${GH.line} pb-2`}><div className={`font-semibold ${GH.muted}`}>Labels</div><div className={GH.muted}>None yet</div></div>
              </div>
            </div>
          </div>
        </GitHub>
        <div className={`${box} pz-appear flex items-center gap-4 px-5 py-3`} style={later(1700)}>
          <span className="text-[24px]">💡</span>
          <span className="text-[17px] text-muted">Or let the product harness write it: <Code>/create-tasks pick more than one track</Code> in Claude Code raises the same shape of ticket.</span>
        </div>
      </Replay>

      {/* 2 · the label, and the one comment that fills in */}
      <Replay on={step === 1} from="right" style={at(570, 80, 950, 520)} className="flex flex-col gap-4">
        <GitHub tab="Issues" className="min-h-0 flex-1">
          <div className="px-6 py-4">
            <div className="flex items-center gap-3 text-[20px]">Pick more than one track on the schedule <span className={GH.muted}>#42</span>
              <span className="pz-pop ml-auto rounded-full bg-[#d8b4fe] px-2.5 py-0.5 text-[13px] font-semibold text-[#3b0764]" style={later(400)}>ready-for-ai</span>
            </div>
            <div className={`pz-appear mt-3 overflow-hidden rounded-md border ${GH.line}`} style={later(1100)}>
              <div className={`flex items-center gap-2 border-b ${GH.line} bg-[#f6f8fa] px-4 py-1.5 text-[14px]`}>
                <span className="size-5 rounded-full bg-violet-300" aria-hidden="true" /><b>the factory</b><span className={GH.muted}>commented · edited a moment ago</span>
              </div>
              <div className="space-y-1.5 px-4 py-3 text-[15px]">
                <div className="text-[18px] font-semibold">🏭 Ship on Vercel · Build</div>
                <div className={GH.muted}>
                  {['Triage', 'Plan'].map((p, i) => <span key={p} className="pz-appear" style={later(1500 + i * 500)}>✅ {p} → </span>)}
                  <b className={`pz-appear ${GH.ink}`} style={later(2500)}>⏳ Build</b>
                  <span> → Gate → Audit → Pull request → Preview → Review &amp; QA → Merge → Production</span>
                </div>
                <div className="pz-appear" style={later(1700)}><b>Size:</b> small — Jev, 78% sure</div>
                <div className="pz-appear" style={later(2100)}><b>Branch:</b> <code className="rounded bg-black/[0.06] px-1.5 font-mono text-[13px]">issue-42-pick-more-than-one-track</code> · 📄 <span className={GH.link}>Spec</span></div>
                <div className="pz-appear" style={later(2700)}><b>AI spend so far:</b> $0.19 over 1 agent run</div>
                <div className={`pz-appear ${GH.muted}`} style={later(2900)}>▸ <b>Models</b> — which job runs on what, and what it costs</div>
              </div>
            </div>
          </div>
        </GitHub>
        <div className="pz-appear grid grid-cols-2 gap-4" style={later(3000)}>
          <div className={`${box} px-5 py-3`}>
            <Kicker>Prefer a comment?</Kicker>
            <div className="mt-1 text-[17px] text-muted"><Code>/ship</Code> on the issue does the same; <Code>/ship --full</Code> picks the size yourself.</div>
          </div>
          <div className={`${box} px-5 py-3`}>
            <Kicker>While it runs</Kicker>
            <div className="mt-1 text-[17px] text-muted">Read the spec. It lands first, and it is the cheapest place to catch a misreading.</div>
          </div>
        </div>
      </Replay>

      {/* 3 · the pull request: try it, read the verdicts, merge */}
      <Replay on={step === 2} from="right" style={at(570, 80, 950, 520)} className="flex flex-col gap-4">
        <GitHub tab="Pull requests" className="min-h-0 flex-1">
          <div className="px-6 py-3.5">
            <div className="text-[21px] leading-tight">Pick more than one track on the schedule <span className={GH.muted}>#44</span></div>
            <div className="mt-1.5 flex items-center gap-2 text-[14px]">
              <span className={`inline-flex items-center gap-1.5 rounded-full ${GH.green} px-3 py-1 font-semibold text-white`}><PrIcon /> Open</span>
              <span className={GH.muted}>wants to merge into <span className="rounded bg-[#ddf4ff] px-1 font-mono text-[13px] text-[#0969da]">main</span> · Closes #42</span>
            </div>
            <div className="pz-appear mt-2.5 rounded-md border-l-4 border-[#1a7f37] bg-[#dafbe1] px-3 py-1.5 text-[14px]" style={later(300)}>
              <b>🔎 Try it:</b> <span className={GH.link}>nam-2026-conference-4f7a….vercel.app</span> — this pull request’s Vercel preview
            </div>
            <div className="mt-2 space-y-1.5">
              {[
                ['📸', 'Screenshots', '/schedule — before and after, desktop and mobile', null],
                ['🔍', 'Code review', 'approved with 1 suggestion', '●●●'],
                ['🧪', 'QA', 'two tracks picked on desktop and phone — both show', '●●●'],
              ].map(([icon, who, what, meter], i) => (
                <div key={who} className={`pz-appear flex items-center gap-2 rounded-md border ${GH.line} px-3 py-1.5 text-[14px]`} style={later(800 + i * 350)}>
                  <span>{icon}</span><b>{who}</b><span className={`truncate ${GH.muted}`}>{what}</span>
                  {meter && <span className="ml-auto rounded-full bg-[#dafbe1] px-2 font-semibold text-[#1a7f37]">{meter}</span>}
                </div>
              ))}
            </div>
            <div className="pz-appear mt-2 flex items-center gap-3" style={later(2000)}>
              <span className={`text-[13px] ${GH.muted}`}>Want it different? Say so:</span>
              <span className="rounded-2xl bg-[#f0eee6] px-3 py-1 text-[14px]">@claude keep the chosen tracks in the URL</span>
            </div>
          </div>
        </GitHub>
        <div className="pz-appear grid grid-cols-[1fr_1fr] gap-4" style={later(2400)}>
          <div className="flex items-center gap-4 rounded-2xl border border-emerald-400/50 bg-emerald-500/10 px-5 py-3">
            <span className="text-[30px]">🟣</span>
            <span className="text-[17px] text-ink">Happy? <b>Squash and merge.</b> The run checks production and closes the ticket.</span>
          </div>
          <div className="rounded-2xl border-2 border-dashed border-amber-400/60 bg-amber-500/10 px-5 py-3">
            <Label name="needs-human" />
            <div className="mt-1 text-[16px] text-muted">A question came back? Answer it in a comment. It resumes by itself.</div>
          </div>
        </div>
      </Replay>
    </>
  );
}

const LAB_BEATS = [
  null,
  {
    kicker: '10 · Now you · step 1',
    title: 'Write a ticket a test could check',
    body: 'Why, what should change, and a Done when list. That list is the contract: the planner maps each line to a check, the auditors judge against it, and QA probes whatever it leaves uncovered.',
  },
  {
    kicker: '10 · Now you · step 2',
    title: 'Add one label — then let it run',
    body: 'ready-for-ai reaches the webhook and a ship run starts at once. One comment on the issue fills in as it goes: the size and why, the branch and the spec, each round, the models and what they cost.',
  },
  {
    kicker: '10 · Now you · step 3',
    title: 'Click the preview, read the verdicts, merge',
    body: 'The pull request arrives with a running app, before-and-after screenshots, a review and a QA pass. Ask for a change with @claude, or merge — and the run that built it confirms it is live.',
  },
];

export const CLOSING = [
  {
    id: 'receipts', name: 'On the record', accent: 'text-cyan-300', tone: 'sky',
    beats: [
      {
        kicker: '8 · On the record',
        title: 'Every run says what it did, on which model, for how much',
        body: 'This is a real run from this repository. Each job shows the model Jev picked, how sure it was, what it expected to pay and what it paid — on the issue, on the run’s attributes, and on a page that lists every ticket.',
      },
      {
        kicker: '8 · What it costs',
        title: 'About a dollar a ticket — and every dial is yours',
        body: 'Real receipts from this repository. Routing each job to the cheapest model that could do it cut the same ticket from $4.59 to $1.80 — and most of what is left pays for judgement, which is where you want it.',
      },
    ],
    Scene: ReceiptsScene,
  },
  {
    id: 'scale', name: 'Many at once', accent: 'text-sky-300', tone: 'sky',
    beats: [
      {
        kicker: '9 · Don’t babysit one ticket — hand it ten',
        title: 'Ten labels, ten sandboxes, ten previews',
        body: 'Nothing about a run needs you watching, and nothing about it runs on your machine. Each ticket gets its own sandbox, its own branch and its own preview. The limit is how many pull requests you can review well.',
      },
    ],
    Scene: ScaleScene,
  },
  {
    id: 'role', name: 'Your role', accent: 'text-violet-300', tone: 'violet',
    beats: [
      {
        kicker: '9 · Your role',
        title: 'You are the tech lead of a team of agents',
        body: 'None of this replaces engineering judgement; it moves it to where it counts. And trust comes from what you can check — a spec, a failing test, a preview, a verdict that had to be proven — not from the model.',
      },
      null,
    ],
    Scene: RoleScene,
  },
  { id: 'lab', name: 'Now you', accent: 'text-emerald-300', tone: 'emerald', beats: LAB_BEATS, Scene: LabScene },
];
