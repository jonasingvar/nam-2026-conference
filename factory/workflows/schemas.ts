/**
 * What each agent must return. Claude Code enforces these (`--json-schema`);
 * the workflow reads `structured_output` and nothing else an agent writes.
 */
const str = { type: 'string' };
const bool = { type: 'boolean' };
const int = { type: 'integer' };

export const PLAN = {
  type: 'object',
  required: ['shippable', 'reason'],
  properties: {
    shippable: bool,
    reason: { type: 'string', description: 'why not, if not shippable; else one line on the ticket' },
    doneWhen: { type: 'array', items: str, description: 'each Done-when criterion, verbatim' },
    spec: {
      type: 'object',
      required: ['path', 'summary'],
      properties: {
        path: str,
        summary: { type: 'string', description: 'two sentences: the approach and how it will be proved' },
        decisions: { type: 'array', items: str, description: 'choices the ticket left open, each as a yes/no question for the reviewer' },
      },
    },
    facts: {
      type: 'object',
      required: ['areas', 'files', 'changesApi', 'changesRule', 'changesData', 'openQuestions', 'uiInteraction', 'layoutFit', 'why'],
      properties: {
        areas: { type: 'array', items: { enum: ['ui', 'server-routes', 'server-rules', 'schema-seed', 'harness', 'tests', 'docs'] } },
        files: { type: 'integer', description: 'roughly how many app files (src/, server/) the change edits or adds' },
        changesApi: bool, changesRule: bool, changesData: bool,
        openQuestions: int, uiInteraction: bool, layoutFit: bool,
        why: { type: 'string', description: 'one line: what the change touches' },
      },
    },
  },
};

export const SPEC_REVISED = { type: 'object', required: ['path', 'summary'], properties: { path: str, summary: str } };

export const FINDINGS = {
  type: 'object',
  required: ['findings', 'covered', 'ran'],
  properties: {
    ran: { enum: ['nothing', 'unit', 'browser', 'unit+browser'], description: 'which suites or probes YOU executed — reading is not running' },
    covered: { type: 'string', description: 'what you were able to judge — under 12 words' },
    findings: {
      type: 'array',
      maxItems: 5,
      items: {
        type: 'object',
        required: ['severity', 'category', 'file', 'claim', 'evidence', 'fix'],
        properties: {
          severity: { enum: ['blocker', 'minor'] },
          category: { enum: ['criterion-unmet', 'unasked', 'claude-md', 'logic', 'test-proves-nothing', 'test-weakened', 'browser', 'spec-gap', 'scope', 'gate', 'docs-stale'], description: 'unasked: a change the ticket did not ask for; scope: the ticket itself is contradictory or unbuildable' },
          file: str, line: int,
          claim: { type: 'string', description: 'what is wrong, in one sentence' },
          evidence: { type: 'string', description: 'the quoted line, the input and wrong output, or the repro' },
          fix: { type: 'string', description: 'what would resolve it, in one sentence' },
        },
      },
    },
  },
};

export const REFUTATION = { type: 'object', required: ['refuted', 'why'], properties: { refuted: bool, why: str } };

export const BUILT = {
  type: 'object',
  required: ['ok', 'summary'],
  properties: {
    ok: bool,
    summary: { type: 'string', description: 'two or three sentences for the pull request: why it was needed, then what an attendee or developer sees now' },
    ui: { type: 'boolean', description: 'did anything an attendee sees in a browser change' },
    browserTest: { type: 'boolean', description: 'did you add or change a Playwright test that drives the changed behaviour' },
    tryIt: { type: 'string', description: 'how a reviewer sees it in a step or two: a path with ?at=YYYY-MM-DDTHH:MM and which attendee to pick, or a command' },
    keyFiles: {
      type: 'array', maxItems: 3,
      items: { type: 'object', required: ['file', 'why'], properties: { file: str, why: str } },
    },
  },
};

export const LESSON = {
  type: 'object',
  required: ['lessons'],
  properties: { lessons: { type: 'array', items: { type: 'object', required: ['pattern', 'proposal'], properties: { pattern: str, proposal: str } } } },
};

export const REVIEW = {
  type: 'object',
  required: ['verdict', 'confidence', 'summary', 'findings'],
  properties: {
    verdict: { enum: ['pass', 'fail'] },
    confidence: { enum: ['high', 'medium', 'low'], description: 'how much of the change you could judge' },
    summary: { type: 'string', description: 'one or two sentences: what you checked and what you found' },
    findings: {
      type: 'array', maxItems: 3,
      items: {
        type: 'object', required: ['severity', 'file', 'claim'],
        properties: { severity: { enum: ['blocker', 'follow-up'] }, file: str, line: int, claim: str, how: { type: 'string', description: 'who reaches it, and what they lose' } },
      },
    },
  },
};

export const RECHECK = {
  type: 'object', required: ['resolved', 'evidence'],
  properties: { resolved: bool, evidence: { type: 'string', description: 'the lines at HEAD that settle it' } },
};

export const REVIEW_LENS = {
  type: 'object',
  required: ['findings', 'covered', 'confidence'],
  properties: {
    confidence: { enum: ['high', 'medium', 'low'], description: 'how much of the change you could actually judge — coverage, not feeling' },
    covered: { type: 'string', description: 'what you judged — under 15 words' },
    findings: {
      type: 'array', maxItems: 3,
      items: {
        type: 'object', required: ['severity', 'category', 'file', 'claim', 'evidence', 'confidence', 'demonstrated'],
        properties: {
          severity: { enum: ['blocker', 'follow-up'] },
          category: { enum: ['criterion-unmet', 'unasked', 'claude-md', 'logic', 'test-proves-nothing', 'test-weakened', 'test-gap', 'actions', 'docs', 'orchestration'] },
          file: str, line: int, claim: str,
          evidence: { type: 'string', description: 'what you checked and what it showed: the command or test you ran and its output, the API or preview response, or the exact line quoted and what it does' },
          confidence: { type: 'number', minimum: 0, maximum: 1, description: 'how sure you are this is real and matters; under 0.8 it is dropped' },
          demonstrated: { type: 'boolean', description: 'true only if you ran code, a test or a command that shows it happening — reading is not demonstrating' },
          how: { type: 'string', description: 'the route through normal use, with this code now, that reaches it — who does what, where' },
          harm: { type: 'string', description: 'what that person loses or sees go wrong' },
        },
      },
    },
  },
};

export const SKEPTIC = {
  type: 'object', required: ['verdict', 'why', 'confidence', 'executed'],
  properties: {
    confidence: { type: 'number', minimum: 0, maximum: 1, description: 'how sure you are of your verdict' },
    executed: { type: 'boolean', description: 'true only if you ran code, a test or a command that shows it — reading and quoting is not executing' },
    verdict: { enum: ['confirmed', 'refuted', 'contrived', 'unproven'], description: 'confirmed: you demonstrated it; contrived: real but only from input nobody gives in normal use; refuted: wrong, deliberate, already on the base, or a nitpick that hurts nobody; unproven: you could not show it' }, why: str },
};

export const QA_TRIAGE = {
  type: 'object', required: ['mode', 'criteria', 'gaps'],
  properties: {
    mode: { enum: ['enough', 'focused', 'explore'], description: 'enough: the tests the PR adds pin every criterion; focused: specific gaps; explore: open exploration needed' },
    criteria: {
      type: 'array',
      items: { type: 'object', required: ['criterion', 'testFile'], properties: { criterion: str, testFile: { type: 'string', description: 'the test file in this diff that pins it, or "" if none' } } },
    },
    gaps: { type: 'array', items: str, description: 'what the tests leave unproven, one probe each' },
  },
};

/** QA's planner: what to probe, exactly enough that a cheap model can write it without exploring. */
export const QA_PLAN = {
  type: 'object', required: ['probes', 'covered'],
  properties: {
    covered: { type: 'string', description: 'what the probes will exercise — under 15 words' },
    probes: {
      type: 'array', maxItems: 5,
      items: {
        type: 'object', required: ['title', 'aim', 'route', 'as', 'steps', 'expect'],
        properties: {
          title: { type: 'string', description: 'the test title, starting "qa: "' },
          aim: { type: 'string', description: 'what it checks, and the criterion or gap it serves' },
          route: { type: 'string', description: 'the path to open, e.g. /my-agenda or /schedule?view=list' },
          as: { enum: ['jonas', 'andy', 'kenji', 'sofia', 'marcus', 'abraham'], description: 'the seeded attendee (tests/helpers.js ATTENDEES)' },
          at: { type: 'string', description: 'the pinned clock as "<dayIndex> HH:MM" (0 is Day 1), or "" for unpinned' },
          steps: { type: 'array', items: str, description: 'what to do, in order, naming the test id or role and accessible name of each control (read from src/)' },
          expect: { type: 'array', items: str, description: 'each observable result to assert, naming its test id or role' },
          stateful: { type: 'boolean', description: 'true if the probe writes state (books or releases a seat, joins a waitlist, checks in, rates, follows) and then reads it back — it runs on the branch\'s own app, since a preview\'s instances each keep their own database' },
        },
      },
    },
  },
};

/** QA's writer: the probe file, compiled and run once. */
export const QA_WRITTEN = {
  type: 'object', required: ['written', 'titles'],
  properties: {
    written: { type: 'boolean', description: 'tests/qa-probe.spec.js holds one test per plan item and lists without errors' },
    titles: { type: 'array', items: str, description: 'the exact test titles written' },
    notes: { type: 'string', description: 'anything the plan could not be written as — under 40 words' },
  },
};

export const RESPONSE = {
  type: 'object', required: ['changed', 'reply'],
  properties: {
    changed: { type: 'boolean', description: 'did you commit a change' },
    reply: { type: 'string', description: 'the reply to post: what you changed and why, or the answer — short, in plain words' },
  },
};

/** Where it ran, not what it ran: preview instances with their own databases, the sandbox's network, a cold start. */
const ENVIRONMENT = { type: 'boolean', description: 'true if the failure comes from where the probe ran — a preview function instance without state another instance wrote, a host the sandbox cannot reach, a cold start or timeout — rather than from the code' };

export const BASE_SAME = {
  type: 'object', required: ['preExisting', 'environment', 'why'],
  properties: { preExisting: { type: 'boolean', description: 'true only if the base fails it for the same reason' }, environment: ENVIRONMENT, why: str },
};

/** QA's skeptic: the review skeptic's verdict, plus whether the environment explains the failure. */
export const QA_SKEPTIC = {
  ...SKEPTIC,
  required: [...SKEPTIC.required, 'environment'],
  properties: { ...SKEPTIC.properties, environment: ENVIRONMENT },
};
