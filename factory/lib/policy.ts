import type { NetworkPolicy, NetworkPolicyRule } from '@vercel/sandbox';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { ALLOWED_REPO } from './constants';

/**
 * A sandbox's mode and preview hosts are remembered on its own disk, where everything that runs in
 * it can write. So they are sealed with a key only the factory holds, and bound to the sandbox's
 * name: what comes back unsealed, edited or copied from another sandbox is not believed.
 */
export function sealPolicy(key: string, name: string, mode: string, hosts: string[]): string {
  return createHmac('sha256', key).update(JSON.stringify([name, mode, [...hosts].sort()])).digest('hex');
}
export function policySealed(key: string, name: string, mode: string, hosts: string[], seal: string): boolean {
  const want = Buffer.from(sealPolicy(key, name, mode, hosts));
  const got = Buffer.from(String(seal || '').trim());
  return got.length === want.length && timingSafeEqual(got, want);
}
/** A preview deployment's host, and nothing else: the only kind a sandbox is ever let through to. */
export const isPreviewHost = (h: string) => /^[a-z0-9][a-z0-9-]*\.vercel\.app$/.test(h);

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

/**
 * How much a sandbox may do, by what it runs:
 *   none — verify: tests only. No credential at all, so it is safe on any
 *          pull request, a stranger's fork included.
 *   read — review and QA: Claude Code needs AI Gateway; nothing needs to
 *          write to GitHub (the repository is public, and the factory posts
 *          verdicts itself, from the function), so no GitHub token.
 *   push — ship and respond, on branches of this repository only: the GitHub
 *          token too, so the agents can push and open pull requests.
 */
export type Mode = 'none' | 'read' | 'push';

export function lockedPolicy(
  secrets: { githubToken: string; gatewayKey: string; previewBypass?: string },
  previewHosts: string[] = [],
  mode: Mode = 'push',
): NetworkPolicy {
  const basic = Buffer.from(`x-access-token:${secrets.githubToken}`).toString('base64');
  const github = (inject: NetworkPolicyRule[]): NetworkPolicyRule[] => [{ match: UPSTREAM, ...BLOCK('the upstream workshop repository') }, ...inject];
  const api = (inject: NetworkPolicyRule[]): NetworkPolicyRule[] => [{ match: UPSTREAM_API, ...BLOCK('the upstream workshop repository') }, ...inject];
  const push = mode === 'push';
  return {
    allow: {
      'github.com': github(push ? [{ transform: [{ headers: { authorization: `Basic ${basic}` } }] }] : []),
      'api.github.com': api(push ? [{ transform: [{ headers: { authorization: `Bearer ${secrets.githubToken}` } }] }] : []),
      // Screenshots for the pull request (scripts/pr-media.mjs) upload here.
      'uploads.github.com': api(push ? [{ transform: [{ headers: { authorization: `Bearer ${secrets.githubToken}` } }] }] : []),
      'codeload.github.com': [],
      'objects.githubusercontent.com': [],
      // Images people paste into issues, pull requests and comments: github.com/user-attachments/… redirects
      // here. Read-only, no credential sent. The factory also stages a request's images as files
      // (lib/visuals.ts); this lets an agent open one it finds by itself in a conversation.
      'github-production-user-asset-6210df.s3.amazonaws.com': [],
      'user-images.githubusercontent.com': [],
      'private-user-images.githubusercontent.com': [],
      ...(mode === 'none' ? {} : { 'ai-gateway.vercel.sh': [{ transform: [{ headers: { authorization: `Bearer ${secrets.gatewayKey}` } }] }] }),
      'registry.npmjs.org': [],
      '*.npmjs.org': [],
      // The app loads its fonts from Google; a test page that cannot reach them
      // logs console errors, and the smoke suite fails on every route.
      'fonts.googleapis.com': [],
      'fonts.gstatic.com': [],
      // QA probes a pull request's Vercel preview. Each host is named exactly —
      // never *.vercel.app — so the bypass header reaches only that deployment.
      // Every request to it also asks Vercel not to inject its toolbar: a
      // preview's HTML loads vercel.live/_next-live/feedback/feedback.js for a
      // browser's user agent, vercel.live is not reachable from here, and the
      // "net::ERR_NAME_NOT_RESOLVED" console error that left failed every probe
      // that watches the console (#36). Allowing vercel.live instead would put
      // a floating toolbar over the page that attendees never see.
      ...Object.fromEntries(previewHosts.map((h) => [h, [{ transform: [{ headers: {
        'x-vercel-skip-toolbar': '1',
        ...(secrets.previewBypass && mode !== 'none' ? { 'x-vercel-protection-bypass': secrets.previewBypass, 'x-vercel-set-bypass-cookie': 'true' } : {}),
      } }] }]])),
    },
  };
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
