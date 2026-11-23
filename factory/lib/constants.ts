/** Plain values the workflow and its steps share. No imports: the workflow VM loads this. */

/** The repository the factory builds. Anything else is refused before a sandbox exists. */
export const ALLOWED_REPO = 'jonasingvar/nam-2026-conference';

/** Where the sandbox clones it. */
export const REPO_DIR = '/vercel/nam-2026-conference';

/** The app's production URL, checked after a merge. */
export const PRODUCTION_URL = 'https://nam-2026-conference.vercel.app';

/** The factory's own Vercel project, for links to a run. */
export const FACTORY_DASHBOARD = 'https://vercel.com/jonasingvar-3626/nam-2026-factory';
