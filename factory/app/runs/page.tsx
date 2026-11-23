// What the factory is doing and what it has cost: every run in the
// observability window, a ship run with the review/QA/respond runs it started
// beneath it. Signed-in viewers only (lib/session.ts).
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getWorld } from 'workflow/runtime';
import { ALLOWED_REPO, FACTORY_DASHBOARD } from '../../lib/constants';
import { group, totals, type Group, type Row, type Run } from '../../lib/runs';
import { mayView, openSession, SESSION_COOKIE } from '../../lib/session';
import { Refresh } from './refresh';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Runs · ORBIT factory' };

const C = { dim: '#9aa1ae', line: '#232733', link: '#7aa7ff', card: '#12151c', red: '#ff6b6b', amber: '#f5a524', green: '#3ccf91' };
const GH = `https://github.com/${ALLOWED_REPO}`;

async function loadRuns(): Promise<{ runs: Run[]; window: string | null; error?: string }> {
  const world: any = await getWorld();
  if (!world.analytics) return { runs: [], window: null, error: 'This deployment has no run analytics.' };
  const runs: Run[] = [];
  let cursor: string | undefined;
  let window: string | null = null;
  for (let page = 0; page < 5; page += 1) {
    const res = await world.analytics.runs.list({ pagination: { limit: 100, sortOrder: 'desc', cursor } });
    runs.push(...res.data);
    const info = res.pageInfo;
    if (info?.currentLookbackDays) window = `${info.currentLookbackDays} day${info.currentLookbackDays === 1 ? '' : 's'}`;
    if (!res.hasMore || !res.cursor) break;
    cursor = res.cursor;
  }
  return { runs, window };
}

const money = (n: number) => (n ? `$${n.toFixed(2)}` : '—');
const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  return m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`;
};
const dot = (r: Row) =>
  r.status === 'failed' ? C.red : r.status === 'running' || r.status === 'pending' ? C.amber : r.status === 'cancelled' ? C.dim : C.green;

function Status({ r }: { r: Row }) {
  const text = r.status === 'running' ? r.phase || 'running' : r.outcome || r.status;
  return (
    <span style={{ whiteSpace: 'nowrap' }}>
      <span style={{ color: dot(r) }}>●</span> {text}
    </span>
  );
}

function Links({ r }: { r: Row }) {
  const a = { color: C.link, marginRight: 8 };
  return (
    <span style={{ whiteSpace: 'nowrap' }}>
      {r.issue && <a style={a} href={`${GH}/issues/${r.issue}`}>#{r.issue}</a>}
      {r.pr && <a style={a} href={`${GH}/pull/${r.pr}`}>PR {r.pr}</a>}
      <a style={a} href={`${FACTORY_DASHBOARD}/workflows/runs/${r.runId}`}>trace</a>
    </span>
  );
}

const td = { padding: '8px 10px', borderTop: `1px solid ${C.line}`, verticalAlign: 'top' as const };

function RunRow({ r, child, total }: { r: Row; child?: boolean; total?: number }) {
  return (
    <tr style={{ color: child ? C.dim : undefined }}>
      <td style={{ ...td, paddingLeft: child ? 28 : 10 }}>
        {child ? '↳ ' : ''}
        <b style={{ color: child ? C.dim : undefined }}>{r.workflow}</b>
        {!child && r.title && <div style={{ color: C.dim, fontSize: 13 }}>{r.title}</div>}
      </td>
      <td style={td}><Status r={r} /></td>
      <td style={td}>{r.size || ''}</td>
      <td style={{ ...td, textAlign: 'right' }}>
        {money(r.spend)}
        {!child && total !== undefined && total !== r.spend && <div style={{ color: C.dim, fontSize: 12 }}>{money(total)} all</div>}
      </td>
      <td style={{ ...td, whiteSpace: 'nowrap' }}>{ago(r.createdAt)} · {r.minutes}m</td>
      <td style={td}><Links r={r} /></td>
    </tr>
  );
}

export default async function RunsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = openSession((await cookies()).get(SESSION_COOKIE)?.value, process.env.FACTORY_SESSION_SECRET);
  if (!mayView(user)) redirect('/api/auth/authorize');

  const q = await searchParams;
  const { runs, window, error } = await loadRuns();
  let groups: Group[] = group(runs);
  const t = totals(groups);
  if (q.ticket) groups = groups.filter((g) => g.issue === q.ticket);
  if (q.workflow) groups = groups.filter((g) => g.workflow === q.workflow || g.children.some((c) => c.workflow === q.workflow));
  if (q.person) groups = groups.filter((g) => g.needsPerson);
  const live = t.running > 0;

  const chip = (label: string, href: string, on: boolean) => (
    <a href={href} style={{ color: on ? '#0b0d12' : C.link, background: on ? C.link : 'transparent', border: `1px solid ${C.link}`, borderRadius: 99, padding: '2px 10px', marginRight: 6, textDecoration: 'none', fontSize: 13 }}>{label}</a>
  );
  const tickets = [...new Set(group(runs).map((g) => g.issue).filter(Boolean))] as string[];

  return (
    <main style={{ maxWidth: 1100, margin: '32px auto', padding: '0 16px', lineHeight: 1.5 }}>
      <Refresh live={live} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
        <h1 style={{ fontSize: 24, margin: 0 }}>🏭 Factory runs</h1>
        <form action="/api/auth/signout" method="post" style={{ color: C.dim, fontSize: 13 }}>
          {user} · <button style={{ background: 'none', border: 0, color: C.link, cursor: 'pointer', padding: 0 }}>sign out</button>
        </form>
      </div>
      <p style={{ color: C.dim, marginTop: 4 }}>
        Last {window ?? 'day'} · {money(t.spend)} spent · {t.running} running · {t.completed} completed · {t.failed} failed ·{' '}
        <span style={{ color: t.needsPerson ? C.amber : undefined }}>{t.needsPerson} waiting on a person</span>
        {live && ' · refreshing'}
      </p>
      <p style={{ margin: '12px 0' }}>
        {chip('all', '/runs', !q.ticket && !q.workflow && !q.person)}
        {chip('needs a person', '/runs?person=1', Boolean(q.person))}
        {['ship', 'review', 'qa', 'respond', 'verify', 'warm'].map((w) => chip(w, `/runs?workflow=${w}`, q.workflow === w))}
        {tickets.map((n) => chip(`#${n}`, `/runs?ticket=${n}`, q.ticket === n))}
      </p>
      {error && <p style={{ color: C.red }}>{error}</p>}
      <div style={{ overflowX: 'auto', background: C.card, borderRadius: 8 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ color: C.dim, textAlign: 'left' }}>
              {['Run', 'Phase / outcome', 'Size', 'Spend', 'Started · took', 'Links'].map((h) => (
                <th key={h} style={{ padding: '8px 10px', fontWeight: 500, textAlign: h === 'Spend' ? 'right' : 'left' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => [
              <RunRow key={g.runId} r={g} total={g.total} />,
              ...g.children.map((c) => <RunRow key={c.runId} r={c} child />),
            ])}
            {!groups.length && (
              <tr><td style={{ ...td, color: C.dim }} colSpan={6}>No runs in this window.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p style={{ color: C.dim, fontSize: 12 }}>
        Spend is what each run recorded in its <code>spend_usd</code> attribute; runs from before it existed show —.
      </p>
    </main>
  );
}
