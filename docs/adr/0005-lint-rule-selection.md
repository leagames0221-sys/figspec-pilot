# ADR-0005: Lint rule selection — six deterministic rules over EARS

- Status: Accepted
- Date: 2026-05-26

## Context

M3 produces EARS-formatted requirements via an LLM. The output is the
single source of truth for M5 (test generation), so anything malformed
must be caught before it propagates. Three design choices were on the
table:

1. **LLM-as-judge**: ask a second LLM "is this requirement well-formed?"
   Reliable but slow, expensive, non-deterministic, and adds a second LLM
   call to every CI run.
2. **Schema-only**: trust that `parseSpec` already rejects malformed JSON
   and call it done. Cheap, but misses semantic problems (wrong keyword
   for pattern, "should" instead of "shall", "適切に" hedge words).
3. **Deterministic rule set**: a fixed list of pure functions that inspect
   each requirement and return findings. Reproducible, free, CI-friendly,
   covers ~80% of common defects with ~6 rules.

We pick option 3. The lint pass becomes the cheap gate; LLM-as-judge stays
available for M4+ as an opt-in "deep review" mode if a release ever needs it.

## Decision

Ship six rules in `src/lint-rules.ts`. Each rule has a stable ID
(`R-001` … `R-006`), a severity (`error` / `warning`), and a one-line
description.

| ID | Name | Severity | Catches |
|----|------|----------|---------|
| R-001 | EARS-KEYWORD | error | Text not starting with `The` / `When` / `While` / `Where` / `If` |
| R-002 | EARS-PATTERN-MATCH | error | `pattern` field mismatched with leading keyword |
| R-003 | EARS-SHALL-PRESENT | error | Missing the modal verb `shall` |
| R-004 | EARS-NO-AMBIGUITY | warning | Hedge / vague terms (English + Japanese list) |
| R-005 | EARS-SOURCE-TRACEABLE | warning | Empty `source[]` — cannot trace back to a Figma node |
| R-006 | EARS-SINGLE-ACTION | warning | More than one `shall` in one requirement |

`error` severity blocks CI; `warning` informs a reviewer. Rule IDs are
stable; new rules append (`R-007` ...) and never renumber.

The ambiguity vocabulary list (R-004) was drawn from Mavin's EARS rationale
(Rolls-Royce 2009), the IEEE 830 antipatterns appendix, and Japanese spec
review heuristics in widespread practitioner use. The list is small on
purpose — false positives are worse than false negatives because a noisy
lint gets disabled.

## Consequences

Positive

- Lint runs in milliseconds; no model load, no rate limit, no API key
- Deterministic output → reproducible CI status badges
- Six rules cover keyword shape, modality, traceability, and the two
  most common defect classes (ambiguity, compound actions)
- Two-tier severity lets the project ship clean on errors while leaving
  warnings as a reviewer todo list

Negative

- Cannot catch semantic defects an LLM-as-judge would catch (e.g. a
  requirement that uses the right keywords but describes the wrong
  behaviour for the design)
- R-004 ambiguity matching uses ASCII word boundaries (`\b`) on the sides
  of each term that carry Latin letters, so "fast" no longer matches
  inside "breakfast". Japanese terms (no Latin word boundary) stay as
  substring checks. Trade-off: a Japanese hedge term embedded inside an
  unrelated kanji compound could still false-positive — documented but
  not yet bitten in practice.
- Adding rules requires a code change; non-developers cannot configure the
  rule set from a YAML file (M5+ may add a `.figspecrc.json` if needed)

## Tradeoffs considered

A YAML-driven rule engine (like `ESLint` config) would let downstream
projects toggle rules without forking. We rejected it for v0.1 because the
six rules are tightly coupled to EARS shape; a config layer would only pay
off once we have ten-plus rules and competing user preferences.

LLM-as-judge as the default lint was rejected because it would force every
CI run to spin Ollama (or burn a managed-API budget) and would make the
lint output non-deterministic. The current rules stay deterministic; a
semantic pass over the same EARS shape is a separate problem worth a
separate decision when concrete pain demands it.
