// Unit tests for the lint engine + all six rules.
// Run with: npm run test:unit
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { EarsRequirement } from "./llm/index.ts";
import { runLint, type LintRule } from "./lint.ts";
import { ALL_RULES } from "./lint-rules.ts";

function req(overrides: Partial<EarsRequirement> = {}): EarsRequirement {
  return {
    id: "R1",
    pattern: "event",
    text: "When the user clicks Save, the system shall persist the draft.",
    source: [{ nodeId: "1:1", nodeName: "Save" }],
    ...overrides,
  };
}

function ruleById(id: string): LintRule {
  const r = ALL_RULES.find((rule) => rule.id === id);
  if (!r) throw new Error(`Test setup error: rule ${id} not found`);
  return r;
}

describe("R-001 EARS-KEYWORD", () => {
  const rule = ruleById("R-001");
  it("PASS: text starts with When", () => {
    assert.equal(rule.check(req()), null);
  });
  it("FAIL: text starts with something else", () => {
    const f = rule.check(req({ text: "The user clicks save and stuff." }));
    // 'The' is actually a keyword — change to genuinely invalid
    assert.equal(f, null); // sanity: 'The' is valid
    const f2 = rule.check(req({ text: "Should submit when clicked." }));
    assert.ok(f2);
    assert.equal(f2!.ruleId, "R-001");
    assert.equal(f2!.severity, "error");
  });
});

describe("R-002 EARS-PATTERN-MATCH", () => {
  const rule = ruleById("R-002");
  it("PASS: pattern=event + text starts with When", () => {
    assert.equal(rule.check(req()), null);
  });
  it("FAIL: pattern=event but text starts with If", () => {
    const f = rule.check(
      req({
        pattern: "event",
        text: "If the user clicks Save, the system shall persist the draft.",
      }),
    );
    assert.ok(f);
    assert.match(f!.message, /Pattern 'event' implies keyword 'When'/);
  });
});

describe("R-003 EARS-SHALL-PRESENT", () => {
  const rule = ruleById("R-003");
  it("PASS: 'shall' present", () => {
    assert.equal(rule.check(req()), null);
  });
  it("FAIL: 'should' instead of 'shall'", () => {
    const f = rule.check(
      req({ text: "When the user clicks Save, the system should persist." }),
    );
    assert.ok(f);
    assert.equal(f!.severity, "error");
  });
});

describe("R-004 EARS-NO-AMBIGUITY", () => {
  const rule = ruleById("R-004");
  it("PASS: concrete text", () => {
    assert.equal(rule.check(req()), null);
  });
  it("FAIL: English 'appropriately'", () => {
    const f = rule.check(
      req({
        text: "When clicked, the system shall handle the request appropriately.",
      }),
    );
    assert.ok(f);
    assert.match(f!.message, /appropriately/);
    assert.equal(f!.severity, "warning");
  });
  it("FAIL: Japanese '適切に'", () => {
    const f = rule.check(
      req({
        text: "When clicked, the system shall handle the request 適切に.",
      }),
    );
    assert.ok(f);
    assert.match(f!.message, /適切に/);
  });
  it("PASS: 'fast' inside 'breakfast' must NOT trigger (word boundary)", () => {
    // R-004 uses word-boundary regex per ASCII term, so "fast" embedded in
    // "breakfast" does not match. Standalone "fast" still does (next test).
    const f = rule.check(
      req({ text: "When user clicks, the system shall finish breakfast." }),
    );
    assert.equal(f, null);
  });
  it("FAIL: standalone 'fast' still triggers", () => {
    const f = rule.check(
      req({ text: "When clicked, the system shall respond fast." }),
    );
    assert.ok(f);
    assert.match(f!.message, /fast/);
  });
  it("PASS: 'robust' inside 'robustness' must NOT trigger (word boundary)", () => {
    const f = rule.check(
      req({
        text: "When measured, the system shall report robustness metrics.",
      }),
    );
    assert.equal(f, null);
  });
});

describe("R-005 EARS-SOURCE-TRACEABLE", () => {
  const rule = ruleById("R-005");
  it("PASS: source has 1 node", () => {
    assert.equal(rule.check(req()), null);
  });
  it("FAIL: empty source array", () => {
    const f = rule.check(req({ source: [] }));
    assert.ok(f);
    assert.equal(f!.severity, "warning");
  });
});

describe("R-006 EARS-SINGLE-ACTION", () => {
  const rule = ruleById("R-006");
  it("PASS: one 'shall'", () => {
    assert.equal(rule.check(req()), null);
  });
  it("FAIL: two 'shall' statements", () => {
    const f = rule.check(
      req({
        text: "When clicked, the system shall save and shall notify the user.",
      }),
    );
    assert.ok(f);
    assert.match(f!.message, /Found 2 'shall' statements/);
  });
});

describe("runLint aggregation", () => {
  it("counts errors and warnings, passCount excludes flagged requirements", () => {
    const spec = {
      requirements: [
        req({ id: "R1" }), // PASS all
        req({
          id: "R2",
          text: "Should submit when clicked.", // FAILs R-001, R-002, R-003
        }),
        req({
          id: "R3",
          source: [], // FAILs R-005 only
        }),
      ],
    };
    const report = runLint(spec, ALL_RULES);
    assert.equal(report.totalChecked, 3);
    assert.ok(report.errorCount >= 3, "R2 triggers at least 3 errors");
    assert.equal(report.warningCount, 1, "R3 has 1 source warning");
    assert.equal(report.passCount, 1, "only R1 fully passes");
    // R2 should be flagged by both R-001 and R-003
    const r2Findings = report.findings.filter((f) => f.requirementId === "R2");
    const ruleIds = new Set(r2Findings.map((f) => f.ruleId));
    assert.ok(ruleIds.has("R-001"));
    assert.ok(ruleIds.has("R-003"));
  });

  it("returns empty findings on clean spec", () => {
    const spec = {
      requirements: [
        req({
          id: "R1",
          pattern: "ubiquitous",
          text: "The system shall log every authentication attempt.",
        }),
        req({
          id: "R2",
          pattern: "unwanted",
          text: "If the password is wrong, then the system shall increment the lockout counter.",
        }),
      ],
    };
    const report = runLint(spec, ALL_RULES);
    assert.equal(report.findings.length, 0);
    assert.equal(report.passCount, 2);
  });
});
