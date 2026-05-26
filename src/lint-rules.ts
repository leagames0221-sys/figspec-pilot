// Six deterministic lint rules over EARS requirements.
//
// Rule IDs are stable; new rules append, never renumber. See ADR-0005 for
// the selection rationale and trade-offs.
import type { EarsPattern, EarsRequirement } from "./llm/index.ts";
import type { LintRule } from "./lint.ts";
import { makeFinding } from "./lint.ts";

// The five EARS keywords, in the canonical pattern order.
const PATTERN_KEYWORDS: Record<EarsPattern, RegExp> = {
  ubiquitous: /^The\b/,
  event: /^When\b/,
  state: /^While\b/,
  optional: /^Where\b/,
  unwanted: /^If\b/,
};

const ANY_KEYWORD_RE = /^(The|When|While|Where|If)\b/;

// Ambiguity vocabulary - hedge words that disguise missing acceptance
// criteria. Source: Mavin's EARS rationale + IEEE 830 antipatterns +
// Japanese spec review heuristics commonly cited in 仕様駆動 practice notes.
const AMBIGUOUS_TERMS = [
  // English hedge / vague
  "appropriately",
  "as needed",
  "etc.",
  "etc ",
  "and so on",
  "maybe",
  "probably",
  "somehow",
  "somewhat",
  "more or less",
  "user-friendly",
  "robust",
  "fast",
  "easy to use",
  // Japanese hedge / vague
  "適切に",
  "いい感じに",
  "良い感じに",
  "うまく",
  "なるべく",
  "できれば",
  "等々",
  "など",
  "たぶん",
  "おそらく",
  "ユーザーフレンドリー",
];

/** R-001: every requirement must start with one of the five EARS keywords. */
const ruleKeyword: LintRule = {
  id: "R-001",
  name: "EARS-KEYWORD",
  severity: "error",
  description:
    "Requirement text must start with one of: The | When | While | Where | If.",
  check(req: EarsRequirement) {
    if (!ANY_KEYWORD_RE.test(req.text)) {
      return makeFinding(
        this,
        req.id,
        `Text does not start with an EARS keyword (got: ${snippet(req.text)}).`,
      );
    }
    return null;
  },
};

/** R-002: pattern field must match the leading keyword. */
const rulePatternMatch: LintRule = {
  id: "R-002",
  name: "EARS-PATTERN-MATCH",
  severity: "error",
  description:
    "The pattern field must match the leading keyword (ubiquitous→The, event→When, state→While, optional→Where, unwanted→If).",
  check(req: EarsRequirement) {
    const expected = PATTERN_KEYWORDS[req.pattern];
    if (!expected) {
      return makeFinding(
        this,
        req.id,
        `Unknown EARS pattern: ${req.pattern}`,
      );
    }
    if (!expected.test(req.text)) {
      return makeFinding(
        this,
        req.id,
        `Pattern '${req.pattern}' implies keyword '${keywordFor(req.pattern)}' but text starts with: ${snippet(req.text)}`,
      );
    }
    return null;
  },
};

/** R-003: must contain "shall" — EARS mandates the modal verb. */
const ruleShall: LintRule = {
  id: "R-003",
  name: "EARS-SHALL-PRESENT",
  severity: "error",
  description:
    "EARS requirements must use the modal verb 'shall'. 'should', 'could', 'might' are not acceptance-grade.",
  check(req: EarsRequirement) {
    if (!/\bshall\b/.test(req.text)) {
      return makeFinding(
        this,
        req.id,
        `Missing 'shall' (found: ${snippet(req.text)}).`,
      );
    }
    return null;
  },
};

// Build a per-term regex with word boundaries on the sides that carry ASCII
// letters. This avoids the classic substring false positive ("fast" matching
// inside "breakfast") while leaving Japanese terms — which have no Latin
// word boundary — as straight substring checks.
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
const AMBIGUOUS_PATTERNS: Array<{ term: string; re: RegExp }> = AMBIGUOUS_TERMS
  .map((term) => {
    const left = /^[A-Za-z]/.test(term) ? "\\b" : "";
    const right = /[A-Za-z]$/.test(term) ? "\\b" : "";
    return { term, re: new RegExp(left + escapeRegex(term) + right, "i") };
  });

/** R-004: ambiguity — flag hedge / vague vocabulary. */
const ruleAmbiguity: LintRule = {
  id: "R-004",
  name: "EARS-NO-AMBIGUITY",
  severity: "warning",
  description:
    "Hedge / vague terms (e.g. 'appropriately', '適切に', 'somewhat') indicate missing acceptance criteria.",
  check(req: EarsRequirement) {
    const hits = AMBIGUOUS_PATTERNS
      .filter(({ re }) => re.test(req.text))
      .map(({ term }) => term);
    if (hits.length > 0) {
      return makeFinding(
        this,
        req.id,
        `Ambiguous term(s): ${hits.map((h) => `"${h}"`).join(", ")}. Replace with a measurable condition.`,
      );
    }
    return null;
  },
};

/** R-005: source must point back to at least one Figma node. */
const ruleSource: LintRule = {
  id: "R-005",
  name: "EARS-SOURCE-TRACEABLE",
  severity: "warning",
  description:
    "Each requirement should reference at least one source Figma node for traceability.",
  check(req: EarsRequirement) {
    if (!Array.isArray(req.source) || req.source.length === 0) {
      return makeFinding(
        this,
        req.id,
        "No source nodes referenced; requirement cannot be traced back to the design.",
      );
    }
    return null;
  },
};

/** R-006: single action — one "shall" per requirement, no compound chains. */
const ruleSingleAction: LintRule = {
  id: "R-006",
  name: "EARS-SINGLE-ACTION",
  severity: "warning",
  description:
    "Each requirement should contain exactly one 'shall' statement. Compound 'shall ... and shall ...' chains split readability and lint reliability.",
  check(req: EarsRequirement) {
    const count = (req.text.match(/\bshall\b/g) ?? []).length;
    if (count > 1) {
      return makeFinding(
        this,
        req.id,
        `Found ${count} 'shall' statements; split into ${count} separate requirements.`,
      );
    }
    return null;
  },
};

export const ALL_RULES: LintRule[] = [
  ruleKeyword,
  rulePatternMatch,
  ruleShall,
  ruleAmbiguity,
  ruleSource,
  ruleSingleAction,
];

function snippet(s: string): string {
  return s.length > 60 ? `${s.slice(0, 60)}…` : s;
}

function keywordFor(pattern: EarsPattern): string {
  switch (pattern) {
    case "ubiquitous":
      return "The";
    case "event":
      return "When";
    case "state":
      return "While";
    case "optional":
      return "Where";
    case "unwanted":
      return "If";
  }
}
