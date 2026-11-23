import type { NetworkPolicy } from '@vercel/sandbox';
import { ALLOWED_REPO } from './constants';

export { ALLOWED_REPO };

/**
 * What a ticket's sandbox may reach once the agents start.
 *
 * No secret ever enters the sandbox: the agents see placeholder tokens, and
 * Vercel's network proxy swaps in the real GitHub token and AI Gateway key on
 * the way out — for these hosts only. An agent can print its environment, a
 * malicious postinstall can read every file, and neither finds a credential.
 *
 * The workshop's original repository is unreachable by rule: anything under
 * EqualExperts/ on github.com or api.github.com is answered 403 by the proxy
 * itself, before the injected token could ever be presented there.
 */
const BLOCK = (what: string) => ({
  response: { statusCode: 403, contentType: 'text/plain', body: `blocked by the factory: ${what}\n` },
});
const UPSTREAM = { path: { regex: '(?i)^/+equalexperts(/|$)' } };
const UPSTREAM_API = { path: { regex: '(?i)^/+repos/+equalexperts(/|$)' } };

export function lockedPolicy(
  secrets: { githubToken: string; gatewayKey: string; previewBypass?: string },
  previewHosts: string[] = [],
): NetworkPolicy {
  const basic = Buffer.from(`x-access-token:${secrets.githubToken}`).toString('base64');
  return {
    allow: {
      'github.com': [
        { match: UPSTREAM, ...BLOCK('the upstream workshop repository') },
        { transform: [{ headers: { authorization: `Basic ${basic}` } }] },
      ],
      'api.github.com': [
        { match: UPSTREAM_API, ...BLOCK('the upstream workshop repository') },
        { transform: [{ headers: { authorization: `Bearer ${secrets.githubToken}` } }] },
      ],
      // Screenshots for the pull request (scripts/pr-media.mjs) upload here.
      'uploads.github.com': [
        { match: UPSTREAM_API, ...BLOCK('the upstream workshop repository') },
        { transform: [{ headers: { authorization: `Bearer ${secrets.githubToken}` } }] },
      ],
      'codeload.github.com': [],
      'objects.githubusercontent.com': [],
      'ai-gateway.vercel.sh': [{ transform: [{ headers: { authorization: `Bearer ${secrets.gatewayKey}` } }] }],
      'registry.npmjs.org': [],
      '*.npmjs.org': [],
      // The app loads its fonts from Google; a test page that cannot reach them
      // logs console errors, and the smoke suite fails on every route.
      'fonts.googleapis.com': [],
      'fonts.gstatic.com': [],
      // QA probes a pull request's Vercel preview. Each host is named exactly —
      // never *.vercel.app — so the bypass header reaches only that deployment.
      ...Object.fromEntries(previewHosts.map((h) => [h, secrets.previewBypass
        ? [{ transform: [{ headers: { 'x-vercel-protection-bypass': secrets.previewBypass, 'x-vercel-set-bypass-cookie': 'true' } }] }]
        : []])),
    },
  };
}


export function assertAllowedRepo(repo: string) {
  if (repo.toLowerCase() !== ALLOWED_REPO) throw new Error(`the factory only builds ${ALLOWED_REPO}, not ${repo}`);
}

/** What every agent's shell gets: placeholders where the proxy puts the real credentials. */
export const AGENT_ENV: Record<string, string> = {
  GH_TOKEN: 'injected-by-the-sandbox-proxy',
  GH_REPO: ALLOWED_REPO,
  GH_PROMPT_DISABLED: '1',
  ANTHROPIC_BASE_URL: 'https://ai-gateway.vercel.sh/claude-code',
  ANTHROPIC_AUTH_TOKEN: 'injected-by-the-sandbox-proxy',
  ANTHROPIC_API_KEY: '',
  DISABLE_AUTOUPDATER: '1',
  CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
  NODE_USE_SYSTEM_CA: '1',
  CI: '1',
};
