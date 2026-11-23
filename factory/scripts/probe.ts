// A one-off check that a ticket sandbox can do everything ship needs, and nothing it must not.
import { Sandbox } from '@vercel/sandbox';
import { lockedPolicy, AGENT_ENV, ALLOWED_REPO } from '../lib/policy.ts';

const t0 = Date.now();
const s = (ms: number) => `${((Date.now() - ms) / 1000).toFixed(1)}s`;
const sb = await Sandbox.create({
  persistent: false,
  source: { type: 'git', url: `https://github.com/${ALLOWED_REPO}.git`, revision: 'vercel-port' },
  resources: { vcpus: 4 },
  timeout: 20 * 60_000,
});
console.log(`created ${sb.name} in ${s(t0)}`);
const sh = async (label: string, cmd: string, env: Record<string, string> = {}) => {
  const t = Date.now();
  const r = await sb.runCommand({ cmd: 'bash', args: ['-lc', `cd /vercel/nam-2026-conference && ${cmd}`], env });
  const out = ((await r.stdout()) + (await r.stderr())).trim().split('\n').slice(-6).join('\n   ');
  console.log(`\n[${r.exitCode === 0 ? 'ok' : 'exit ' + r.exitCode}] ${label} (${s(t)})\n   ${out}`);
  return r.exitCode;
};
try {
  await sh('tools', 'ls -d /vercel/*; git -C /vercel/nam-2026-conference log --oneline -1; pwd; cat /etc/os-release | head -1; node -v; npm -v; git --version; claude --version; which gh || echo "no gh"; nproc; free -g | head -2');
  await sh('npm ci', 'pwd; npm ci --no-audit --no-fund 2>&1 | tail -2');
  //await sh('install gh', 'command -v gh || (sudo dnf install -y gh 2>&1 | tail -1 || (curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list >/dev/null && sudo apt-get update -qq && sudo apt-get install -y -qq gh 2>&1 | tail -1)); gh --version | head -1');
  await sh('chromium', 'npx playwright install --with-deps chromium 2>&1 | tail -3');
  await sh('unit tests', 'npm test 2>&1 | grep -E "^# (pass|fail)"');
  await sh('one browser spec, both projects', 'npx playwright test tests/smoke.spec.js 2>&1 | tail -4');

  const env = process.env;
  await sb.updateNetworkPolicy(lockedPolicy({ githubToken: env.GITHUB_TOKEN!, gatewayKey: env.AI_GATEWAY_API_KEY! }));
  console.log('\n--- network locked ---');
  await sh('env has no secret', 'env | grep -ciE "ghp_|gho_|vck_|github_pat" || true', AGENT_ENV);
  await sh('gh reads the fork', 'gh api repos/jonasingvar/nam-2026-conference --jq .full_name', AGENT_ENV);
  await sh('upstream blocked (api)', 'gh api repos/EqualExperts/nam-2026-conference --jq .full_name', AGENT_ENV);
  await sh('upstream blocked (git)', 'git ls-remote https://github.com/EqualExperts/nam-2026-conference.git 2>&1 | head -2', AGENT_ENV);
  await sh('git auth to the fork', 'git ls-remote --heads origin vercel-port && git push --dry-run origin HEAD:refs/heads/factory-probe; git config user.name 2>&1 | tail -2', AGENT_ENV);
  await sh('anything else blocked', 'curl -s -o /dev/null -w "%{http_code}" --max-time 8 https://example.com || echo " (blocked)"', AGENT_ENV);
  await sh('claude via gateway', 'claude -p "Reply with exactly: FACTORY OK" --model haiku 2>&1 | tail -3', AGENT_ENV);
} finally {
  await sb.stop();
  console.log(`\nstopped; total ${s(t0)}`);
}
