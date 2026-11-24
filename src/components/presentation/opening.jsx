import { at, Show, Replay, IssueCard, Kicker, Vercel, later } from './kit.jsx';
import { GH, GhOpenIcon, GitHub } from './apps.jsx';
import { ISSUE_140 } from './issue.js';

/* ------------------------------------------------------------------ *
 * Title — the factory, and the seven workflows in orbit around it.
 * ------------------------------------------------------------------ */

export function Orbits({ style = at(940, 20, 640, 640), className = '' }) {
  const rings = [
    { r: 120, dur: '26s', words: ['ship', 'verify'] },
    { r: 200, dur: '38s', words: ['review', 'qa', 'screenshots'] },
    { r: 280, dur: '54s', words: ['respond', 'warm', 'sandbox', 'Jev'] },
  ];
  return (
    <svg viewBox="0 0 640 640" style={style} className={className} aria-hidden="true">
      <defs>
        <radialGradient id="pz-core" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#c4b5fd" stopOpacity="0.9" />
          <stop offset="60%" stopColor="#8b5cf6" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="320" cy="320" r="78" fill="url(#pz-core)" />
      {/* the Vercel mark at the centre: everything here runs on it */}
      <path d="M320 292 L352 346 L288 346 Z" fill="#f5f3ff" />
      {rings.map((ring, i) => (
        <g key={ring.r}>
          <circle cx="320" cy="320" r={ring.r} fill="none" stroke="#333950" strokeDasharray={i === 1 ? '4 8' : undefined} />
          <g className="pz-spin" style={{ transformOrigin: '320px 320px', animationDuration: ring.dur, animationDirection: i % 2 ? 'reverse' : 'normal' }}>
            {ring.words.map((w, j) => {
              const a = (j / ring.words.length) * Math.PI * 2 + i;
              const x = 320 + Math.cos(a) * ring.r;
              const y = 320 + Math.sin(a) * ring.r;
              return (
                <g key={w}>
                  <circle cx={x} cy={y} r="6" fill={['#a78bfa', '#67e8f9', '#6ee7b7'][i]} />
                  <text x={x + 12} y={y + 5} fill="#9aa2b8" fontSize="15" fontFamily="JetBrains Mono, monospace">{w}</text>
                </g>
              );
            })}
          </g>
        </g>
      ))}
    </svg>
  );
}

const PRIMITIVES = ['Workflows', 'Sandbox', 'AI Gateway', 'Previews'];

function TitleScene() {
  return (
    <>
      <Orbits />
      <div style={at(110, 120, 900, 520)}>
        <Kicker className="pz-appear">ORBIT &rsquo;26 · AI across the software delivery lifecycle</Kicker>
        <h1 className="pz-appear mt-6 font-display text-[112px] leading-[0.92] text-ink" style={later(120)}>
          The software<br />
          <span className="pz-shine bg-clip-text text-transparent">factory</span>
        </h1>
        <p className="pz-appear mt-7 max-w-[780px] text-[27px] leading-snug text-muted" style={later(260)}>
          A GitHub issue goes in. A reviewed, tested, deployed change comes out — and nobody sits at a terminal.
        </p>
        <div className="pz-appear mt-6 flex items-center gap-2.5" style={later(600)}>
          <span className="inline-flex items-center gap-2 rounded-full border border-hairline bg-ground/70 px-3.5 py-1 text-[16px] text-ink"><Vercel className="size-3.5" /> All of it on Vercel</span>
          {PRIMITIVES.map((p, i) => (
            <span key={p} className="pz-pop rounded-full border border-violet-400/40 bg-violet-500/10 px-3.5 py-1 font-mono text-[15px] text-violet-200" style={later(800 + i * 110)}>{p}</span>
          ))}
        </div>
        <div className="pz-appear mt-8 space-y-1.5 whitespace-nowrap text-[19px] text-faint" style={later(1100)}>
          <div>🎙️ Product harness: a conversation → a ticket <span className="ml-2 text-emerald-300">✓</span></div>
          <div className="text-muted"><span className="mr-3 text-violet-300">↳</span>🏭 <b className="text-ink">Engineering harness</b>: the ticket → production</div>
        </div>
        <div className="pz-appear mt-6 flex items-center gap-3 text-[16px] text-faint" style={later(1400)}>
          <img src="/avatars/attendee-001.jpg" alt="Jonas" width={30} height={30} className="size-[30px] shrink-0 rounded-full object-cover ring-2 ring-hairline" />
          <span>Jonas Claesson · Equal Experts</span>
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ *
 * The promise — one label, then everything that happens without you.
 * ------------------------------------------------------------------ */

const TIMELINE_AT = 1700;

const AFTER_THE_LABEL = [
  ['▲', 'Vercel picks the ticket up: a webhook starts a durable workflow', 'no runner to queue for, no laptop to leave open'],
  ['🧮', 'Jev, a small decision model, sizes it and picks a model for every job', 'a third of a second'],
  ['📄', 'A spec lands as the branch’s first commit', 'read the intent before the diff'],
  ['🧪', 'A failing test, then the change that turns it green', 'in a sandbox forked for this run'],
  ['🚦', 'The gate passes; independent auditors find nothing left', 'scripts decide, agents advise'],
  ['🔀', 'A pull request opens on its own preview, with screenshots, a review and QA', 'a link you can click and try'],
];

function PromiseScene() {
  return (
    <>
      {/* the last thing you do for a while */}
      <Replay on from="left" style={at(80, 64, 640, 540)}>
        <GitHub tab="Issues" className="h-full">
          <div className="px-6 py-4">
            <div className="text-[23px] leading-tight">Keep sessions in view on mobile <span className={GH.muted}>#{ISSUE_140.number}</span></div>
            <span className={`mt-2 inline-flex items-center gap-1.5 rounded-full ${GH.green} px-3 py-1 text-[14px] font-semibold text-white`}><GhOpenIcon /> Open</span>
            <div className="mt-4 grid grid-cols-[1fr_170px] gap-5 text-[16px]">
              <div>
                <div className={`border-b ${GH.line} pb-1 text-[18px] font-semibold`}>Done when</div>
                <ul className="mt-2 space-y-1">
                  {ISSUE_140.doneWhen.map((d) => (
                    <li key={d} className="flex gap-2"><span className={`mt-1 size-4 shrink-0 rounded border ${GH.line}`} />{d}</li>
                  ))}
                </ul>
                <div className={`pz-appear mt-4 flex items-center gap-2 ${GH.muted}`} style={later(900)}>
                  <span className="size-5 shrink-0 rounded-full bg-violet-300" aria-hidden="true" />
                  <span><b className={GH.ink}>you</b> added the <span className="rounded-full bg-[#d8b4fe] px-2 text-[13px] font-semibold text-[#3b0764]">ready-for-ai</span> label</span>
                </div>
                {/* seconds later, on the same issue: Vercel has it */}
                <div className={`pz-appear mt-2.5 overflow-hidden rounded-md border ${GH.line}`} style={later(TIMELINE_AT)}>
                  <div className={`flex items-center gap-2 border-b ${GH.line} bg-[#f6f8fa] px-3 py-1.5 text-[14px]`}>
                    <span className="grid size-5 place-items-center rounded-full bg-[#1f2328] text-white" aria-hidden="true"><Vercel className="size-2.5" /></span>
                    <b>ship</b><span className={GH.muted}>· a Vercel Workflow · just now</span>
                  </div>
                  <div className="px-3 py-2.5 text-[15px]">
                    <div className="text-[17px] font-semibold">🏭 Ship on Vercel · Triage</div>
                    <div className={`whitespace-nowrap ${GH.muted}`}><b className={GH.ink}>⏳ Triage</b> → Plan → Build → Gate → Audit → …</div>
                  </div>
                </div>
              </div>
              <div className={`border-l ${GH.line} pl-4`}>
                <div className={`font-semibold ${GH.muted}`}>Labels</div>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  <span className="pz-pop rounded-full bg-[#d8b4fe] px-2.5 py-0.5 text-[13px] font-semibold text-[#3b0764]" style={later(900)}>ready-for-ai</span>
                </div>
                <div className={`pz-appear mt-3 text-[13px] ${GH.muted}`} style={later(1300)}>That is the last thing you do for a while.</div>
                <div className={`pz-appear mt-3 text-[13px] ${GH.muted}`} style={later(TIMELINE_AT + 300)}>The webhook started a Vercel Workflow. It now owns the ticket.</div>
              </div>
            </div>
          </div>
        </GitHub>
      </Replay>

      <Replay on from="right" delay={200} style={at(780, 64, 740, 540)} className="flex flex-col">
        <Kicker>Then, with nobody at a keyboard</Kicker>
        <div className="mt-3 flex flex-1 flex-col justify-center">
          <div className="relative space-y-[9px]">
            <span className="pz-fill absolute bottom-6 left-[21px] top-3 w-0.5 bg-gradient-to-b from-violet-500 to-emerald-400" style={{ animationDuration: '3.2s', animationDelay: `${TIMELINE_AT}ms`, transformOrigin: 'top' }} />
            {AFTER_THE_LABEL.map(([icon, what, how], i) => (
              <div key={what} className="pz-appear relative flex items-center gap-4" style={later(TIMELINE_AT + i * 480)}>
                <span className={`grid size-11 shrink-0 place-items-center rounded-full border text-[20px] ${icon === '▲' ? 'pz-glow border-violet-400/70 bg-raised text-ink' : 'border-hairline bg-raised'}`}>{icon === '▲' ? <Vercel className="size-4" /> : icon}</span>
                <div className="min-w-0 leading-tight">
                  <div className="text-[19px] text-ink">{what}</div>
                  <div className="text-[14px] text-faint">{how}</div>
                </div>
              </div>
            ))}
            <div className="pz-appear relative flex items-center gap-4 rounded-2xl border border-emerald-400/50 bg-emerald-500/10 py-2 pr-4" style={later(TIMELINE_AT + AFTER_THE_LABEL.length * 480 + 200)}>
              <span className="grid size-11 shrink-0 place-items-center rounded-full border border-emerald-400/60 bg-emerald-500/20 text-[20px]">👤</span>
              <div className="leading-tight">
                <div className="text-[20px] font-semibold text-emerald-100">You read it, try the preview and click merge</div>
                <div className="text-[14px] text-emerald-200/70">the run wakes up and checks production</div>
              </div>
            </div>
          </div>
        </div>
        <div className="pz-appear mt-3 flex items-baseline gap-4 rounded-2xl border border-hairline bg-surface px-5 py-2.5" style={later(TIMELINE_AT + 4300)}>
          <span className="font-display text-[40px] leading-none text-ink">$0.93</span>
          <span className="text-[15px] leading-snug text-muted">of AI from label to reviewed pull request — ticket #38 in this repository, a fast run</span>
        </div>
      </Replay>
    </>
  );
}

/* ------------------------------------------------------------------ *
 * The ticket arrives, carrying its context.
 * ------------------------------------------------------------------ */

const CONTEXT = [
  { name: 'CLAUDE.md', what: 'decisions and why', x: 70, y: 110, side: 'left' },
  { name: 'context/engineering-context/schedule.md', what: 'where it lives', x: 70, y: 260, side: 'left' },
  { name: '.claude/rules/ui.md', what: 'UI conventions', x: 70, y: 410, side: 'left' },
  { name: 'context/engineering-context/testing.md', what: 'how to prove it', x: 1240, y: 150, side: 'right' },
  { name: 'specs/', what: 'every past plan', x: 1240, y: 330, side: 'right' },
];

/* One beat: the card lands, the Done when lines draw in, then the context it
 * carries flies in around it. */
const DOCS_AT = 2200;

function IssueScene() {
  return (
    <>
      <svg viewBox="0 0 1600 900" className="absolute inset-0" aria-hidden="true">
        {CONTEXT.map((c, i) => {
          const fromX = c.side === 'left' ? c.x + 290 : c.x;
          const toX = c.side === 'left' ? 390 : 1210;
          const d = `M${fromX} ${c.y + 42} C ${(fromX + toX) / 2} ${c.y + 42}, ${(fromX + toX) / 2} 330, ${toX} 330`;
          return (
            <g key={c.name}>
              <path d={d} pathLength="1" className="pz-draw-in" fill="none" stroke="#4c3d7a" strokeWidth="2" style={later(DOCS_AT + 300 + i * 120)} />
              <g className="pz-appear" style={later(DOCS_AT + 1200 + i * 120)}>
                <path d={d} pathLength="1" className="pz-flow" fill="none" stroke="#a78bfa" strokeWidth="2" opacity="0.8" />
              </g>
            </g>
          );
        })}
      </svg>

      <div className="pz-arrive" style={at(400, 70, 800, 540)}>
        <IssueCard number={ISSUE_140.number} title={ISSUE_140.title} className="h-full">
          <div className="px-7 py-5 text-[17px] leading-relaxed text-muted">
            <p><b className="text-ink">Why:</b> {ISSUE_140.why}</p>
            <div className="mt-4 font-display text-[22px] text-ink">Done when</div>
            <ul className="mt-2 space-y-2.5">
              {ISSUE_140.doneWhen.map((d, i) => (
                <Show key={d} as="li" from="left" delay={900 + i * 300} className="flex gap-3">
                  <span className="mt-1 size-[18px] shrink-0 rounded border-2 border-violet-400/70" />
                  <span className="text-ink/90">{d}</span>
                </Show>
              ))}
            </ul>
            <p className="pz-appear mt-4 text-[15px]" style={later(1900)}><b className="text-ink">Out of scope:</b> {ISSUE_140.outOfScope}</p>
          </div>
        </IssueCard>
      </div>

      {CONTEXT.map((c, i) => (
        <Show key={c.name} from={c.side} delay={DOCS_AT + i * 120} style={at(c.x, c.y, 290, 84)}
          className="flex flex-col justify-center rounded-xl border border-hairline bg-raised px-4 py-2.5">
          {c.name.includes('/') && !c.name.endsWith('/') && (
            <div className="font-mono text-[12px] text-faint">{c.name.slice(0, c.name.lastIndexOf('/') + 1)}</div>
          )}
          <div className="font-mono text-[15px] text-ink">
            {c.name.endsWith('/') ? c.name : c.name.slice(c.name.lastIndexOf('/') + 1)}
          </div>
          <div className="text-[14px] text-faint">{c.what}</div>
        </Show>
      ))}
    </>
  );
}

export const OPENING = [
  {
    id: 'title', name: 'The software factory', accent: 'text-violet-300', tone: 'violet',
    beats: [null],
    Scene: TitleScene,
  },
  {
    id: 'promise', name: 'One label', accent: 'text-emerald-300', tone: 'emerald',
    beats: [
      {
        kicker: 'The promise',
        title: 'Label an issue. Vercel picks it up from there',
        body: 'One label reaches the factory’s webhook, and a durable workflow takes the ticket all the way to a reviewed pull request on its own preview. Your part is the ticket and the merge.',
      },
    ],
    Scene: PromiseScene,
  },
  {
    id: 'issue', name: 'The ticket', accent: 'text-emerald-300', tone: 'emerald',
    beats: [
      {
        kicker: 'The ticket',
        title: 'It starts with a GitHub issue written so a test can check it',
        body: 'The product harness turned a conversation into this: why, what should change, and the Done when list every later agent is judged against. It arrives carrying its context — the docs the agents read instead of the source.',
      },
    ],
    Scene: IssueScene,
  },
];

