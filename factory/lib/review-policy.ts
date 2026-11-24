/**
 * What a review may report, and what may block — shared by review and ship,
 * pure so it is tested (test/review-policy.test.ts, with past false positives).
 *
 * Review defaults to approve-with-comments
 * (context/engineering-context/harness/code-review-playbook.md):
 *   - Precision over recall: a finding below CONFIDENCE is dropped before
 *     anyone checks it, and at most MAX_CHECKED go to skeptics.
 *   - Every finding — blocker or suggestion — faces its own skeptic, which sees
 *     only the claim, the cited line, the diff and the ticket (never the lens's
 *     reasoning), and must demonstrate it by running, querying or quoting. A
 *     finding its skeptic cannot demonstrate is dropped, not demoted.
 *   - A test gap (a test that proves nothing, one weakened, a criterion no test
 *     pins) is never a blocker: it is worth a look, and on a ship run the fixer
 *     tightens it as polish when it is fixing anyway.
 *   - A blocker is serious, present and demonstrated, with extreme confidence:
 *     how a person reaches it in normal use now, what they lose, the lens ran
 *     something that shows it, its skeptic confirmed it by executing it, and
 *     both report confidence ≥ BLOCK_CONFIDENCE (`blocks`). Anything less that
 *     its skeptic verified is a suggestion. Contrived (real, but only from an
 *     input nobody gives) is a suggestion.
 *   - A finding a person dismissed before (a 👎 on the review, or a reply saying finding n is wrong)
 *     is not raised again.
 */
export type Raised = {
  severity: string; category: string; file: string; line?: number; claim: string; evidence: string;
  how?: string; harm?: string; demonstrated?: boolean; confidence?: number; skepticConfidence?: number;
};
export type SkepticVerdict = { verdict: 'confirmed' | 'refuted' | 'contrived' | 'unproven'; why: string; confidence?: number; executed?: boolean } | null;
export type Dismissed = { file: string; line?: number; category: string; claim: string; pr: number };

/** Below this, a finding is not worth a skeptic's time — or the reader's. */
export const CONFIDENCE = 0.8;
/** At most this many findings are checked (and so reported) per review. */
export const MAX_CHECKED = 6;
/** A blocker needs extreme confidence: the lens and its skeptic both at or above this, and the skeptic executed it. */
export const BLOCK_CONFIDENCE = 0.95;

/** Every condition a blocker must meet, mechanically. */
export const blocks = (f: Raised, v: SkepticVerdict) =>
  mayBlock(f) && (f.confidence ?? 0) >= BLOCK_CONFIDENCE && v?.verdict === 'confirmed' && v.executed === true && (v.confidence ?? 0) >= BLOCK_CONFIDENCE;

/** A finding about the tests rather than the app. */
export const isTestGap = (f: { category: string }) => /test/i.test(f.category);

/** Could this be a blocker, if its skeptic confirms it? */
export const mayBlock = (f: Raised) =>
  !isTestGap(f) && !isDoc(f) && f.severity === 'blocker' && !!f.how?.trim() && !!f.harm?.trim() && f.demonstrated === true;

/** A stale doc is fixed on the branch (respond), never a reason to hold back working code. */
export const isDoc = (f: { category: string }) => /^docs/.test(f.category);

const words = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w.length > 3));
/** The same place and much the same claim as something a person already dismissed. */
export function wasDismissed(f: Raised, dismissed: Dismissed[]) {
  const a = words(f.claim);
  return dismissed.some((d) => {
    if (d.file !== f.file) return false;
    if (f.line && d.line && Math.abs(f.line - d.line) > 10) return false;
    const b = words(d.claim);
    const shared = [...a].filter((w) => b.has(w)).length;
    return shared / Math.max(1, Math.min(a.size, b.size)) >= 0.5;
  });
}

/** Which findings go to a skeptic: confident, not dismissed before, the ones that may block first, capped. */
export function toCheck(raised: Raised[], dismissed: Dismissed[] = []) {
  const kept = raised.filter((f) => (f.confidence ?? 0) >= CONFIDENCE && !wasDismissed(f, dismissed));
  kept.sort((x, y) => Number(mayBlock(y)) - Number(mayBlock(x)) || (y.confidence ?? 0) - (x.confidence ?? 0));
  return { checked: kept.slice(0, MAX_CHECKED), dropped: raised.length - Math.min(kept.length, MAX_CHECKED) };
}

/** After one skeptic per finding: blockers, suggestions (worth a look) and test-gap polish. Anything not demonstrated is gone. */
export function settle(checked: Raised[], verdicts: SkepticVerdict[]) {
  const blockers: Raised[] = [];
  const suggestions: Raised[] = [];
  const polish: Raised[] = [];
  checked.forEach((f, i) => {
    const v = verdicts[i]?.verdict;
    if (v !== 'confirmed' && v !== 'contrived') return; // refuted, unproven, or a skeptic that did not finish
    // Anything short of every blocker condition is at most a suggestion — it was verified, so it is still worth a look.
    if (blocks(f, verdicts[i])) blockers.push({ ...f, skepticConfidence: verdicts[i]!.confidence });
    else if (isTestGap(f)) polish.push({ ...f, severity: 'follow-up' });
    else suggestions.push({ ...f, severity: 'follow-up', ...(v === 'contrived' ? { claim: `${f.claim} (only from input nobody gives in normal use)` } : {}) });
  });
  return { blockers, suggestions, polish };
}

/** Lines inside a GitHub callout: every line quoted, so a second blocker does not fall out of the box. */
export const quoted = (text: string) => text.split('\n').map((l) => (l.trim() ? `> ${l}` : '>')).join('\n');

/**
 * The review comment. A pass reads as an approval (green, suggestions below it); only a low-confidence pass
 * warns, and only a blocker is red. Every blocker sits inside the callout; every finding is numbered so
 * `/dismiss n` can name it; the footer is its own paragraph, so its links render after an HTML block.
 */
export function composeReview(o: {
  pass: boolean; confidence: 'high' | 'medium' | 'low'; summary: string;
  blockers: Raised[]; suggestions: Raised[]; extra?: string[]; footer: string; marker: object;
}) {
  const where = (f: Raised) => `\`${f.file}${f.line ? ':' + f.line : ''}\``;
  let n = 0;
  const sure = (b: Raised) => b.confidence !== undefined ? ` (confidence ${b.confidence.toFixed(2)}${b.skepticConfidence !== undefined ? `, skeptic ${b.skepticConfidence.toFixed(2)}` : ''})` : '';
  const blockers = o.blockers.map((b) => `${++n}. **${b.category}** ${where(b)} — ${b.claim}${sure(b)}\n   ${b.how ? `*How:* ${b.how} · ` : ''}${b.harm ? `*Harm:* ${b.harm}` : ''}${b.evidence ? `\n   *Shown by:* ${b.evidence}` : ''}`);
  const suggestions = o.suggestions.map((x) => `${++n}. ${where(x)} ${x.claim}${x.evidence ? ` — *checked:* ${x.evidence}` : ''}`);
  const head = !o.pass
    ? ['[!CAUTION]', `### Code review · blocker`, o.summary, '', ...blockers]
    : o.confidence === 'low'
      ? ['[!WARNING]', `### Code review · low confidence — unproven \`●○○\``, o.summary]
      : ['[!TIP]', `### Code review · approved${o.suggestions.length ? ` with ${o.suggestions.length} suggestion${o.suggestions.length === 1 ? '' : 's'}` : ''} \`${o.confidence === 'high' ? '●●●' : '●●○'}\``, o.summary];
  return [
    quoted(head.join('\n')),
    ...(o.extra ?? []).filter(Boolean),
    suggestions.length ? `<details><summary>Worth a look — suggestions, not blockers (${suggestions.length})</summary>\n\n${suggestions.join('\n')}\n\n</details>` : '',
    `<sub>${o.footer}${n ? ` · reply “finding <n> is wrong” (or 👎 this comment) and the next review will not raise it again` : ''}</sub>`,
    `<!-- factory-verdict:review ${JSON.stringify(o.marker)} -->`,
  ].filter(Boolean).join('\n\n');
}

/** What the marker records of each numbered finding, for `/dismiss n`. */
export const listed = (blockers: Raised[], suggestions: Raised[]) => [
  ...blockers.map((f, i) => ({ n: i + 1, blocker: true, category: f.category, file: f.file, line: f.line, claim: f.claim })),
  ...suggestions.map((f, i) => ({ n: blockers.length + i + 1, blocker: false, category: f.category, file: f.file, line: f.line, claim: f.claim })),
];

/**
 * Which findings a reply calls wrong, said the way a person would say it to a
 * colleague: "finding 2 is wrong", "#1 and #3 are false positives", "dismiss 2"
 * — and still `/dismiss 1, 3`. A number has to be named as a finding (or open
 * the comment), so "line 42 is wrong" dismisses nothing.
 */
export const dismissNumbers = (body: string) => {
  const nums = (s: string) => (s.match(/\d+/g) || []).map(Number).filter((n) => Number.isInteger(n) && n > 0 && n < 100);
  const LIST = String.raw`#?\d+(?:\s*(?:,|and|&)?\s*#?\d+)*`;
  const cmd = new RegExp(String.raw`(?:^|\s)\/?dismiss\s+(?:findings?\s+)?(${LIST})`, 'i').exec(body);
  if (cmd) return nums(cmd[1]);
  const WRONG = String.raw`(?:is|are|was|were)\s+(?:just\s+|simply\s+|both\s+)?(?:wrong|incorrect|(?:a\s+)?false\s+positives?|not\s+(?:real|true|right|a\s+(?:problem|bug|blocker)|an\s+issue))`;
  const said = new RegExp(String.raw`(?:(?:^|\s)(?:findings?|points?|items?|numbers?)\s+|(?:^|\s)#|^\s*)(${LIST})\s+${WRONG}`, 'i').exec(body);
  return said ? nums(said[1]) : [];
};
