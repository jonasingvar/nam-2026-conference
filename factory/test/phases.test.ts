import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../lib/phases.ts';

test('every job a workflow starts runs under the step named for its phase, not the generic one', () => {
  const cases: Record<string, unknown> = {
    'branch': P.makeBranch, 'plan': P.spec, 'plan-audit_criteria_1': P.planAudit, 'revise-spec_1': P.reviseSpec,
    'build': P.implement, 'gate_2': P.gate, 'audit_combined_1': P.codeAudit, 'audit_browser-retry_2': P.codeAudit,
    'skeptic_logic': P.skeptic, 'fix_1': P.fix, 'learn': P.learn, 'push': P.pushBranch,
    'checkout': P.checkout, 'facts': P.measureDiff, 'recheck_logic': P.recheckBlocker, 'lens_criteria': P.reviewLens,
    'triage': P.qaTriage, 'warm': P.warmPreview, 'probeplan': P.planProbes, 'write': P.writeProbes, 'write_up': P.writeProbes, 'build_up': P.implement, 'plan_up': P.spec, 'run_desktop': P.runProbes, 'again_x': P.reproduce, 'base_x': P.reproduceOnBase, 'clean': P.cleanUp,
    'change': P.makeChange,
    'select': P.selectTests, 'select_3': P.selectTests, 'desktop': P.runDesktop, 'desktop_2': P.runDesktop, 'mobile_r1': P.runMobile,
    'factory': P.factoryChecks, 'docs': P.docsCheck, 'testmap': P.buildTestMap,
  };
  for (const [label, step] of Object.entries(cases)) assert.equal(P.phaseFor(label), step, label);
  assert.equal(P.phaseFor('something-new'), P.job);
});
