import { setAttributes } from 'workflow';
import { refreshWarm, sweepSandboxes } from '../lib/sandbox-steps';

/**
 * warm — keep the sandbox every run forks current: on each push to main, and
 * daily (vercel.json crons). A run that forks it starts with the repository
 * installed and Chromium in place, instead of a minute of npm and apt. It also
 * sweeps away any run sandbox left idle for hours: a run that died without cleaning up.
 */
export async function warm(input: { ref?: string } = {}) {
  'use workflow';
  await setAttributes({ ref: input.ref || 'main' });
  const swept = await sweepSandboxes(3);
  if (swept.swept.length || swept.orphans) await setAttributes({ swept: `${swept.swept.length} sandboxes, ${swept.orphans} snapshots` });
  return { ...(await refreshWarm(input.ref || 'main')), swept: swept.swept, orphanSnapshots: swept.orphans };
}
