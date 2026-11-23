// Dev helper: run a shell command in a persistent named sandbox (created on first use).
//   node --env-file=.env.local scripts/sb.ts <name> '<command>'
import { Sandbox } from '@vercel/sandbox';
import { lockedPolicy, AGENT_ENV } from '../lib/policy.ts';
const [name, cmd] = process.argv.slice(2);
const sb = await Sandbox.getOrCreate({
  name,
  source: { type: 'git', url: 'https://github.com/jonasingvar/nam-2026-conference.git', revision: 'vercel-port' },
  resources: { vcpus: 4 },
  timeout: 30 * 60_000,
});
// LOCK=1: the network the agents get, with credentials injected by the proxy.
if (process.env.LOCK) await sb.updateNetworkPolicy(lockedPolicy({ githubToken: process.env.GITHUB_TOKEN!, gatewayKey: process.env.AI_GATEWAY_API_KEY! }));
else await sb.updateNetworkPolicy('allow-all');
const r = await sb.runCommand({ cmd: 'bash', args: ['-lc', `cd /vercel/nam-2026-conference && ${cmd}`], env: process.env.LOCK ? AGENT_ENV : {} });
process.stdout.write(await r.stdout());
process.stderr.write(await r.stderr());
process.exitCode = r.exitCode;
