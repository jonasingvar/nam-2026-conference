import { start } from 'workflow/api';
import { warm } from '@/workflows/warm';

/** Vercel Cron (vercel.json): refresh the warm sandbox daily, so a quiet week still forks a current one. */
export async function GET(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const run = await start(warm, [{ ref: 'main' }]);
  return Response.json({ runId: run.runId });
}
