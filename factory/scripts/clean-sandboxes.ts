// Delete every sandbox except the warm one, then every snapshot no remaining
// sandbox resumes from; report snapshot storage before and after.
//   cd factory && npx tsx --env-file=.env.local scripts/clean-sandboxes.ts
import { Sandbox, Snapshot } from '@vercel/sandbox';

const KEEP = new Set(['orbit-warm']);

const storage = async () => {
  const s = await (await Snapshot.list({} as any) as any).toArray();
  const live = s.filter((x: any) => x.status !== 'deleted');
  return `${live.length} snapshots, ${(live.reduce((n: number, x: any) => n + (x.sizeBytes || 0), 0) / 1e9).toFixed(2)} GB`;
};

console.log('before:', await storage());
const sandboxes = await (await Sandbox.list({} as any) as any).toArray();
for (const s of sandboxes) {
  const name = String(s.name ?? '');
  if (KEEP.has(name)) { console.log('  keep  ', name); continue; }
  try {
    const sb = await Sandbox.get({ name } as any);
    await sb.delete();
    console.log('  delete', name);
  } catch (e: any) {
    console.log('  FAIL  ', name, String(e?.message || e).slice(0, 120));
  }
}
const live = new Set((await (await Sandbox.list({} as any) as any).toArray()).map((s: any) => s.currentSnapshotId).filter(Boolean));
for (const x of await (await Snapshot.list({} as any) as any).toArray()) {
  if (x.status === 'deleted' || live.has(x.id)) continue;
  try { await (await Snapshot.get({ snapshotId: x.id } as any)).delete(); console.log('  delete', x.id); }
  catch (e: any) { console.log('  FAIL  ', x.id, String(e?.message || e).slice(0, 120)); }
}
console.log('after: ', await storage());
