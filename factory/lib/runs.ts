/**
 * The /runs page's model: runs from the observability pipeline, grouped into
 * tickets. A ship run is the root; the review, QA and respond runs it starts
 * carry its id as `$rootRunId`, so a ticket's whole cost is one sum. Pure, so
 * it is tested without Vercel.
 */
export type Run = {
  runId: string;
  status: string;
  workflowName: string;
  attributes?: Record<string, string>;
  createdAt: Date | string;
  completedAt?: Date | string | null;
};

export type Row = {
  runId: string;
  workflow: string;
  status: string;
  issue?: string;
  title?: string;
  phase?: string;
  size?: string;
  pr?: string;
  outcome?: string;
  spend: number;
  createdAt: string;
  minutes: number;
};

export type Group = Row & { children: Row[]; total: number; needsPerson: boolean };

/** `workflow//./workflows/ship//ship` → `ship`. */
export const shortName = (name: string) => name.split('//').filter(Boolean).pop() || name;

const iso = (d: Date | string) => new Date(d).toISOString();

export function toRow(r: Run, now = Date.now()): Row {
  const a = r.attributes ?? {};
  const end = r.completedAt ? new Date(r.completedAt).getTime() : now;
  return {
    runId: r.runId,
    workflow: shortName(r.workflowName),
    status: r.status,
    issue: a.issue,
    title: a.title,
    phase: a.phase,
    size: a.size,
    pr: a.pr,
    outcome: a.outcome ?? a.verdict,
    spend: Number(a.spend_usd) || 0,
    createdAt: iso(r.createdAt),
    minutes: Math.max(0, Math.round((end - new Date(r.createdAt).getTime()) / 60_000)),
  };
}

/** Roots newest first, each with the runs it started under it (oldest first). */
export function group(runs: Run[], now = Date.now()): Group[] {
  const byId = new Map(runs.map((r) => [r.runId, r]));
  const kids = new Map<string, Row[]>();
  const roots: Run[] = [];
  for (const r of runs) {
    const root = r.attributes?.$rootRunId;
    if (root && root !== r.runId && byId.has(root)) {
      kids.set(root, [...(kids.get(root) ?? []), toRow(r, now)]);
    } else {
      roots.push(r);
    }
  }
  return roots
    .map((r) => {
      const row = toRow(r, now);
      const children = (kids.get(r.runId) ?? []).sort((x, y) => x.createdAt.localeCompare(y.createdAt));
      return {
        ...row,
        // A child's issue/PR fills the gaps on a root that never set them.
        issue: row.issue ?? children.find((c) => c.issue)?.issue,
        pr: row.pr ?? children.find((c) => c.pr)?.pr,
        children,
        total: row.spend + children.reduce((n, c) => n + c.spend, 0),
        needsPerson: row.status === 'failed' || row.outcome === 'needs-human' || row.outcome === 'crashed',
      };
    })
    .sort((x, y) => y.createdAt.localeCompare(x.createdAt));
}

export function totals(groups: Group[]) {
  const all = groups.flatMap((g) => [g, ...g.children]);
  const count = (s: string) => all.filter((r) => r.status === s).length;
  return {
    spend: groups.reduce((n, g) => n + g.total, 0),
    running: count('running') + count('pending'),
    completed: count('completed'),
    failed: count('failed'),
    needsPerson: groups.filter((g) => g.needsPerson).length,
  };
}
