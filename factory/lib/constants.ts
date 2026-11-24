/** Plain values the workflow and its steps share. No imports: the workflow VM loads this. */

/** The repository the factory builds. Anything else is refused before a sandbox exists. */
export const ALLOWED_REPO = 'jonasingvar/nam-2026-conference';

/** Where the sandbox clones it. */
export const REPO_DIR = '/vercel/nam-2026-conference';

/** The app's production URL, checked after a merge. */
export const PRODUCTION_URL = 'https://nam-2026-conference.vercel.app';

/** The factory's own Vercel project, for links to a run. */
export const FACTORY_DASHBOARD = 'https://vercel.com/jonasingvar-3626/nam-2026-factory';

/** The app's Vercel project: its commit status is "Vercel – <project>". */
export const APP_PROJECT = 'nam-2026-conference';

/** Where verify and ship put the test map inside a sandbox (it cannot reach Blob; a step writes it there). */
export const TEST_MAP_IN_SANDBOX = '/vercel/.factory/test-map.json';

/**
 * The factory's own dependencies, installed in the warm sandbox so verify's
 * factory check (typecheck and tests) does not `npm ci` on every push — and
 * reinstalled only when a commit changes their lock file. Run from the repository root.
 */
export const FACTORY_DEPS = `{ [ "$(sha256sum factory/package-lock.json | cut -c1-16)" = "$(cat /vercel/.factory/prepared-factory 2>/dev/null)" ] || ` +
  `{ (cd factory && npm ci --no-audit --no-fund >/dev/null 2>&1) && sha256sum factory/package-lock.json | cut -c1-16 > /vercel/.factory/prepared-factory; }; }`;

/** The label that makes verify, and ship's gate on that pull request, run the whole suite. */
export const FULL_SUITE_LABEL = 'full-suite';
