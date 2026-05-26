# ADR-0004: Use EARS, not Gherkin, as the requirements grammar

- Status: Accepted
- Date: 2026-05-26

## Context

M3 turns a Figma node tree into structured requirements that downstream
stages (lint in M4, test generation in M5) can mechanically consume. Two
mature grammars are widely used in industry:

- **Gherkin** (Given/When/Then) — the BDD standard popularised by Cucumber.
  Strong on test scenarios; weak on requirement classification.
- **EARS** (Easy Approach to Requirements Syntax) — five fixed patterns
  introduced by Mavin et al. (Rolls-Royce, 2009). Each pattern starts with
  a dedicated keyword: *The / When / While / Where / If*. Each pattern
  maps to a distinct requirement *type* (ubiquitous, event-driven, state-driven,
  optional, unwanted-behaviour).

Both are LLM-friendly, but the lint stage (M4) needs a deterministic check
that catches "this sentence is not a requirement at all" cases — vague
imperatives, missing acceptance criteria, mixed types. EARS gives that for
free: a sentence either starts with one of five keywords or it doesn't.
Gherkin gives scenario discipline but not requirement-shape discipline.

Primary sources consulted:

- *Easy Approach to Requirements Syntax* — Mavin, Wilkinson, Harwood,
  Novak (RE 2009): https://ieeexplore.ieee.org/document/5328509
- Alistair Mavin's EARS practitioner write-up:
  https://alistairmavin.com/ears/
- Cucumber Gherkin reference:
  https://cucumber.io/docs/gherkin/reference/

## Decision

Emit one of the five EARS patterns per requirement. Every requirement must
start with `The`, `When`, `While`, `Where`, or `If`. The system prompt
enforces this; the lint pass in M4 will reject the rest deterministically
without needing the LLM in the loop.

Gherkin scenarios are still useful at the *test* stage; M5 will convert
each EARS requirement into a Given/When/Then skeleton for vitest, so we
get the best of both: EARS for requirement shape, Gherkin idioms for test
shape, with EARS as the single source of truth.

## Consequences

Positive

- Lint is a regex + keyword table, not an LLM call (deterministic, free, fast)
- Each requirement is self-classifying — no separate type field to maintain
- Five patterns cover ubiquitous, event, state, optional, and unwanted
  behaviour, which collectively span the requirement shapes a UI design
  implies (button click = event, error toast = unwanted, etc.)
- Smaller LLMs (4B Ollama models) can hit the grammar reliably because the
  patterns are short and the keyword anchor is unambiguous

Negative

- EARS is less familiar to web/SaaS engineers than Gherkin; the README and
  ADR-0004 itself must explain the patterns
- Edge cases that mix two patterns ("When X, while Y, ...") have to pick
  one. We pick the *first* matching keyword and let the human reviewer
  catch nuance — explicit limitation, documented in M5

## Tradeoffs considered

Gherkin-only would have skipped one translation step but cost us the
deterministic lint and forced a heavier LLM (or a parser) to validate that
each "Given/When/Then" block actually describes a requirement and not a
test detail. EARS-then-Gherkin keeps both steps small and verifiable.

A custom grammar (e.g., user-stories with INVEST checks) was considered
but rejected: writing a new grammar means writing a new lint rule set with
no published practitioner guidance to anchor it.
