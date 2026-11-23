// List sandboxes and snapshots: what is using Sandbox snapshot storage.
import { Sandbox, Snapshot } from '@vercel/sandbox';
const sbs = await (await Sandbox.list({} as any) as any).toArray();
console.log('sandboxes:', sbs.length);
for (const s of sbs) console.log('  ', String(s.name ?? s.id).padEnd(42), s.status ?? '', s.persistent ? 'persistent' : '');
const snaps = await (await Snapshot.list({} as any) as any).toArray();
const live = snaps.filter((s: any) => s.status !== 'deleted');
const total = live.reduce((n: number, s: any) => n + (s.sizeBytes || 0), 0);
console.log('snapshots (not deleted):', live.length, '· total', (total / 1e9).toFixed(2), 'GB');
