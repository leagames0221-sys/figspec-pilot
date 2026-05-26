# ADR-0006: Generate vitest skeletons, not Jest / node:test / AVA

- Status: Accepted
- Date: 2026-05-26

## Context

M5 emits a `.test.ts` file per generated spec. The file targets a specific
test runner, so we must pick one. The candidates:

- **vitest** — Vite-native, ESM-native, watch mode, types out of the box,
  uses esbuild/SWC under the hood. https://vitest.dev/
- **Jest** — the historical default. Heavier setup for ESM/TypeScript;
  Babel or `ts-jest` typically required. https://jestjs.io/
- **node:test** — Node's built-in runner (already used for figspec-pilot's
  own unit tests). Zero dependencies, but no `describe`/`it` browser-style
  ergonomics for downstream user code.
- **AVA** — concurrent, minimal API. Smaller community than vitest.

Decision drivers:

1. The downstream consumer of the generated file is *someone else's*
   project. We should emit code that matches what they already have or
   are most likely to adopt.
2. ESM-only, no transpilation step in the generated file
3. `describe`/`it` are the most recognisable shapes
4. The runner must not pull a huge install for the simplest case

## Decision

Generate `import { describe, it } from "vitest"`. vitest is now the default
test runner for new TypeScript-ESM projects in 2024-2026; emitting against
it gives the lowest-friction integration path for consumers. The generator
itself does *not* depend on vitest — only the *output* references it, so
figspec-pilot's own dev tree stays clean (we keep `node:test` for our
internal unit tests).

If a consumer uses Jest or AVA, the regenerated file changes one import
line; the rest (`describe`, `it`, `throw new Error(...)`) is identical
across runners.

## Consequences

Positive

- ESM-native, no Babel/ts-jest setup required in the downstream project
- `import { describe, it } from "vitest"` is the shortest possible header
- The generator itself adds zero runtime dependencies — vitest only appears
  in the *emitted* code
- Consumers who already use vitest get a working test file by
  `npm install --save-dev vitest && vitest`
- `throw new Error("TODO: implement test for R1")` ensures the test fails
  loudly until a human fills it in, preserving the spec ↔ test linkage
- The arrange / act / assert comments inside each `it()` are tailored to
  the EARS pattern (ubiquitous → invariant; event → trigger + post-
  condition; state → "while" state observation; optional → feature flag;
  unwanted → recovery / rejection). The human filling the stub has a
  concrete shape to follow per pattern, not three empty placeholders.
  See `patternScaffold` in `src/test-gen.ts`.

Negative

- Projects on Jest must change the import line manually (one-line diff)
- node:test would have been zero-dependency but feels alien to most
  application-code authors
- vitest's API surface drifts occasionally between major versions;
  `describe`/`it` are stable, but `beforeEach` / `vi.mock` shapes may
  shift. Generated code uses only the stable subset.

## Tradeoffs considered

Emitting "framework-neutral" output (raw `function test(name, fn)` shape)
would maximise portability but offer no built-in run command. Consumers
would have to write their own harness, defeating the M5 goal of
"clone the repo, run the tests".

Letting the consumer pick the runner via a CLI flag (`--runner=jest`) was
considered. Rejected for v0.1: adds option-handling complexity, and the
one-line import diff is trivial. Revisit if M5+ feedback says otherwise.
