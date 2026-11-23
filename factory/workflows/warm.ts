import { setAttributes } from 'workflow';
import { refreshWarm } from '../lib/sandbox-steps';

/**
 * warm — keep the sandbox every run forks current: on each push to main, and
 * daily (vercel.json crons). A run that forks it starts with the repository
 * installed and Chromium in place, instead of a minute of npm and apt.
 */
export async function warm(input: { ref?: string } = {}) {
  'use workflow';
  await setAttributes({ ref: input.ref || 'main' });
  return await refreshWarm(input.ref || 'main');
}
