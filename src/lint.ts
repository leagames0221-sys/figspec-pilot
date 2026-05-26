// Deterministic lint engine for EARS specs.
//
// Each LintRule inspects a single EarsRequirement and returns either null
// (PASS) or one LintFinding (FAIL). The engine has no LLM dependency; every
// rule is pure code so the report is reproducible and CI-friendly.
//
// See ADR-0005 for the rule selection rationale.
import type { EarsRequirement, SpecOutput } from "./llm/index.ts";

export type LintSeverity = "error" | "warning";

export interface LintFinding {
  ruleId: string;
  ruleName: string;
  severity: LintSeverity;
  requirementId: string;
  message: string;
}

export interface LintRule {
  readonly id: string;
  readonly name: string;
  readonly severity: LintSeverity;
  readonly description: string;
  check(req: EarsRequirement): LintFinding | null;
}

export interface LintReport {
  findings: LintFinding[];
  totalChecked: number;
  errorCount: number;
  warningCount: number;
  passCount: number;
}

/** Helper for rules: build a finding tagged with the rule's metadata. */
export function makeFinding(
  rule: Pick<LintRule, "id" | "name" | "severity">,
  requirementId: string,
  message: string,
): LintFinding {
  return {
    ruleId: rule.id,
    ruleName: rule.name,
    severity: rule.severity,
    requirementId,
    message,
  };
}

/** Run every rule against every requirement and aggregate the report. */
export function runLint(
  spec: Pick<SpecOutput, "requirements">,
  rules: LintRule[],
): LintReport {
  const findings: LintFinding[] = [];
  for (const req of spec.requirements) {
    for (const rule of rules) {
      const f = rule.check(req);
      if (f) findings.push(f);
    }
  }
  const errorCount = findings.filter((f) => f.severity === "error").length;
  const warningCount = findings.filter((f) => f.severity === "warning").length;
  // A requirement passes if no rule flagged it.
  const flaggedIds = new Set(findings.map((f) => f.requirementId));
  const passCount = spec.requirements.filter(
    (r) => !flaggedIds.has(r.id),
  ).length;
  return {
    findings,
    totalChecked: spec.requirements.length,
    errorCount,
    warningCount,
    passCount,
  };
}
