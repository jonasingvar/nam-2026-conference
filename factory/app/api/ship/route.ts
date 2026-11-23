import { getRun } from 'workflow/api';
import { startShip, startWarm } from '@/lib/start';

/**
 * Start a run by hand, or ask how one is doing.
 *   POST /api/ship  { "issue": 42, "base"?: "main", "size"?: "fast", "notes"?: "…" }
 *   POST /api/ship  { "warm": "main" }   — rebuild the sandbox every run forks
 *   GET  /api/ship?runId=…
 * Both need `Authorization: Bearer $FACTORY_TRIGGER_SECRET`.
 */
const authorized = (req: Request) => {
  const secret = process.env.FACTORY_TRIGGER_SECRET;
  return Boolean(secret) && req.headers.get('authorization') === `Bearer ${secret}`;
};

export async function POST(req: Request) {
  if (!authorized(req)) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (typeof body.warm === 'string') return Response.json(await startWarm(body.warm, `manual-${Date.now()}`));
  const issue = Number(body.issue);
  if (!Number.isInteger(issue) || issue <= 0) return Response.json({ error: 'issue must be a positive integer' }, { status: 400 });
  const size = ['fast', 'small', 'full', 'sized'].includes(body.size) ? body.size : undefined;
  return Response.json(await startShip({ issue, base: body.base, notes: body.notes, size }));
}

export async function GET(req: Request) {
  if (!authorized(req)) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const runId = new URL(req.url).searchParams.get('runId');
  if (!runId) return Response.json({ error: 'runId is required' }, { status: 400 });
  const run = getRun(runId);
  const status = await run.status;
  return Response.json({ runId, status, ...(status === 'completed' ? { result: await run.returnValue } : {}) });
}
