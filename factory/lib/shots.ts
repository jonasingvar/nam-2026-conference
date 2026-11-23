/**
 * Screenshots for a pull request: which pages to shoot, the script that
 * shoots them in the sandbox, and the comment that shows them. Pure — the
 * workflow VM loads it — so no Node imports here; the upload is a step
 * (lib/shots-steps.ts).
 */

export type Shot = { path: string; label: string };

/** A route with `:id` gets a real seeded id; 1 exists for sessions and speakers. */
const concrete = (path: string) => path.replace(/:[A-Za-z]+/g, '1');

/** `<Route path="x" element={<XPage />} />` and `<Route index element={<HomePage />} />` from src/App.jsx. */
export function routesFrom(app: string): Record<string, string> {
  const byComponent: Record<string, string> = {};
  for (const m of app.matchAll(/<Route\s+(index|path="([^"]+)")\s+element=\{<(\w+)/g)) {
    const [, index, path, component] = m;
    if (component === 'Navigate' || path === '*') continue;
    byComponent[component] ??= index === 'index' ? '/' : `/${concrete(path)}`;
  }
  return byComponent;
}

/**
 * The pages a change shows up on. A changed page is shot directly; a changed
 * component, hook or style is shot on the pages that import it; a UI change
 * that maps to no page is shot on the home page. At most four pages.
 *
 * `pageImports` maps a page file (src/pages/X.jsx) to the module paths it imports.
 */
export function choosePages(changed: string[], app: string, pageImports: Record<string, string[]>, max = 4): Shot[] {
  const ui = changed.filter((f) => /^src\/.*\.(jsx?|tsx?|css)$/.test(f) && !/\.test\./.test(f));
  if (!ui.length) return [];
  const routes = routesFrom(app);
  const routeOfPage = (file: string) => routes[(/src\/pages\/(\w+)\.\w+$/.exec(file) || [])[1] ?? ''];
  const picked = new Map<string, Shot>();
  const add = (path: string | undefined, why: string) => {
    if (path && !picked.has(path)) picked.set(path, { path, label: why });
  };
  for (const f of ui) if (f.startsWith('src/pages/')) add(routeOfPage(f), f.replace(/^src\/pages\//, ''));
  for (const f of ui.filter((x) => !x.startsWith('src/pages/'))) {
    const stem = (/([^/]+)\.\w+$/.exec(f) || [])[1];
    for (const [page, imports] of Object.entries(pageImports)) {
      if (imports.some((i) => (/([^/]+?)(\.\w+)?$/.exec(i) || [])[1] === stem)) add(routeOfPage(page), `uses ${f.replace(/^src\//, '')}`);
    }
  }
  if (!picked.size) add('/', 'home (the change maps to no single page)');
  return [...picked.values()].slice(0, max);
}

/** In the sandbox, from the checkout: changed files, src/App.jsx and each page's imports, as result.json. */
export const pagesScript = (base: string) => [
  `CHANGED=$(git diff --name-only origin/${base}...HEAD | paste -sd, -)`,
  `CHANGED="$CHANGED" node -e '`,
  `const fs=require("fs"),p=require("path");`,
  `const pages={};for(const f of fs.readdirSync("src/pages"))pages["src/pages/"+f]=[...fs.readFileSync(p.join("src/pages",f),"utf8").matchAll(/from\\s+["\\x27]([^"\\x27]+)["\\x27]/g)].map(m=>m[1]);`,
  `fs.writeFileSync(process.env.JOB+"/result.json",JSON.stringify({changed:(process.env.CHANGED||"").split(",").filter(Boolean),app:fs.readFileSync("src/App.jsx","utf8"),pageImports:pages}))'`,
].join('\n');

export const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900, scale: 1, mobile: false },
  { name: 'mobile', width: 393, height: 852, scale: 2, mobile: true },
] as const;

/**
 * In the sandbox: shoot each page on each viewport, on the PR's preview
 * ("after") and on the base's deployment ("before"), as Jonas (attendee 1, a
 * full agenda with clashes) with the clock pinned to Day 1, 10:30 — the same
 * way the Playwright specs open a page (tests/helpers.js `visit`).
 */
export function captureScript(pages: Shot[], after: string, before: string | null) {
  const cfg = JSON.stringify({ pages, after, before, viewports: VIEWPORTS });
  return [
    `mkdir -p "$JOB/shots"`,
    `cat > "$JOB/capture.cjs" <<'JS'`,
    `const { createRequire } = require('module');`,
    `const { chromium } = createRequire(process.cwd() + '/package.json')('@playwright/test');`,
    `const fs = require('fs');`,
    `const cfg = ${cfg};`,
    `(async () => {`,
    `  const browser = await chromium.launch();`,
    `  const out = [];`,
    `  for (const [which, base] of [['after', cfg.after], ['before', cfg.before]]) {`,
    `    if (!base) continue;`,
    `    let at = null;`,
    `    try { const b = await (await fetch(base + '/api/bootstrap')).json(); at = b.days[0].date + 'T10:30'; } catch {}`,
    `    for (const pg of cfg.pages) for (const v of cfg.viewports) {`,
    `      const file = pg.path.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'home';`,
    `      const name = file + '-' + v.name + '-' + which + '.png';`,
    `      const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, deviceScaleFactor: v.scale, isMobile: v.mobile, hasTouch: v.mobile, ignoreHTTPSErrors: true });`,
    `      await ctx.addInitScript(({ at }) => { localStorage.setItem('orbit:currentUserId', '1'); if (at) localStorage.setItem('orbit:clockAt', at); }, { at });`,
    `      const page = await ctx.newPage();`,
    `      try {`,
    `        const res = await page.goto(base + pg.path, { waitUntil: 'networkidle', timeout: 45000 });`,
    `        await page.getByRole('banner').waitFor({ timeout: 15000 }).catch(() => {});`,
    `        await page.waitForTimeout(600);`,
    `        await page.screenshot({ path: process.env.JOB + '/shots/' + name, fullPage: true });`,
    `        out.push({ path: pg.path, viewport: v.name, which, file: name, status: res ? res.status() : 0 });`,
    `      } catch (e) { out.push({ path: pg.path, viewport: v.name, which, error: String(e && e.message || e).slice(0, 200) }); }`,
    `      await ctx.close();`,
    `    }`,
    `  }`,
    `  await browser.close();`,
    `  fs.writeFileSync(process.env.JOB + '/result.json', JSON.stringify({ dir: process.env.JOB + '/shots', shots: out }));`,
    `})().catch((e) => { fs.writeFileSync(process.env.JOB + '/result.json', JSON.stringify({ error: String(e && e.message || e).slice(0, 300), shots: [] })); });`,
    `JS`,
    `node "$JOB/capture.cjs"`,
  ].join('\n');
}

export type Uploaded = { path: string; viewport: string; which: string; url?: string; error?: string };

/** The pull request's screenshots comment: one section per page, before → after, desktop and mobile. */
export function shotsComment(pr: number, sha: string, pages: Shot[], shots: Uploaded[], previewUrl: string, beforeLabel: string | null, footer: string) {
  const img = (s: Uploaded | undefined, width: number) =>
    !s ? '—' : s.url ? `<a href="${s.url}"><img src="${s.url}" width="${width}"></a>` : `⚠️ ${s.error ?? 'not captured'}`;
  const find = (path: string, viewport: string, which: string) => shots.find((s) => s.path === path && s.viewport === viewport && s.which === which);
  const sections = pages.map((p) => {
    const rows = [
      `| | Desktop | Mobile |`,
      `|---|---|---|`,
      `| **This PR** | ${img(find(p.path, 'desktop', 'after'), 480)} | ${img(find(p.path, 'mobile', 'after'), 200)} |`,
      ...(beforeLabel ? [`| **${beforeLabel}** | ${img(find(p.path, 'desktop', 'before'), 480)} | ${img(find(p.path, 'mobile', 'before'), 200)} |`] : []),
    ];
    return [`#### [\`${p.path}\`](${previewUrl}${p.path}) <sub>${p.label}</sub>`, '', ...rows].join('\n');
  });
  return [
    `### 📸 Screenshots`,
    `As attendee Jonas (a full agenda), clock pinned to Day 1 10:30, on [this PR's preview](${previewUrl})${beforeLabel ? ` and on ${beforeLabel}` : ''}. Click an image for full size.`,
    '',
    ...sections,
    '',
    `<sub>${footer} · commit ${sha.slice(0, 7)}</sub>`,
    `<!-- factory-shots ${JSON.stringify({ pr, sha })} -->`,
  ].join('\n');
}
