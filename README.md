# figspec-pilot

[![CI](https://github.com/leagames0221-sys/figspec-pilot/actions/workflows/ci.yml/badge.svg)](https://github.com/leagames0221-sys/figspec-pilot/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node](https://img.shields.io/badge/Node-%E2%89%A5%2020-339933.svg)](package.json)

Figma design → EARS spec + vitest test skeleton + spec lint, in one command.
Built on MCP. Runs locally with Ollama — no LLM API key required.

**Plain-language summary** *(for non-engineer reviewers)*

- **Who it's for** — engineering teams using Claude Code, Cursor, or another MCP-capable AI tool, where the UI lives in Figma and the requirements doc + unit tests are expected to track every Figma change.
- **What it does** — reads a UI design from Figma and emits a first draft of (a) requirements in a fixed grammar, (b) a unit-test file scaffolded one-to-one with those requirements, and (c) an automated quality check on the requirements. A human still refines all three; the tool removes the boilerplate that nobody enjoys writing twice.
- **Why it matters** — the same Login screen redrawn next week means re-typing the spec and re-stubbing the tests. That work is repetitive, slow, and decays the moment someone forgets a step. figspec-pilot makes it a one-command pass that can run again on every iteration, including in CI.
- **EARS** — *Easy Approach to Requirements Syntax*, a five-pattern grammar from Rolls-Royce that forces each requirement to start with a fixed keyword (The / When / While / Where / If). Trivially machine-checkable, which is what makes the lint step (M4) cheap and deterministic.
- **MCP** — *Model Context Protocol*, the connector standard that Claude Code, Cursor, and other AI coding tools use to talk to external tools. figspec-pilot ships as one MCP server; the four tools it exposes can be chained or called individually from any MCP-capable client.
- **Local AI** — the tool calls an AI model running on the reviewer's own laptop ([Ollama](https://ollama.com/) with `gemma3:4b`). No API key, no credit card, no data sent to a third-party service.
- **vitest** — the unit-test framework the generated test files target. Swappable in one line if the consumer's project uses Jest or another runner.

## 🎬 Demo walkthrough (100-second narrated video)

End-to-end demo of the four MCP tools — `figma_get_file` → `extract_spec` (Ollama gemma3:4b → 3 EARS requirements) → `lint_spec` (6 deterministic rules, all clean) → `generate_tests` (one vitest `it()` per requirement, TODO-throwing). Japanese narration by [AivisSpeech](https://aivis-project.com/) (まお おちついた, Style-Bert-VITS2), 1920×1080 H.264, narrated in plain Japanese (no letter-spelled jargon) for non-engineer reviewers.

> [▶️ **figspec_pilot_demo.mp4**](out_video/figspec_pilot_demo.mp4) — 99.91 s · 3.0 MB · 14 scenes with burned-in SRT subtitles.

<video src="out_video/figspec_pilot_demo.mp4" controls width="100%"></video>

**Reproducible pipeline** ([scripts/produce_video.py](scripts/produce_video.py), [requirements-video.txt](requirements-video.txt)) — 1-command rebuild given preconditions (static demo viewer on `:8002` via `python -m http.server 8002 -d docs/demo-viewer/` + [AivisSpeech-Engine 1.2.0](https://github.com/Aivis-Project/AivisSpeech-Engine) on `:10101` + [Playwright](https://playwright.dev/) chromium + [ffmpeg](https://ffmpeg.org/)). All synthetic data, zero real Figma API call, zero paid API.

## Why

A Figma → requirements → tests pipeline is normally three separate hand-
written passes: someone reads the design, writes a Notion / Confluence
spec, then writes failing test stubs, then a different person updates all
three when the design changes. Each pass costs time and drifts out of
sync; the design wins, the spec lags, the tests rot.

figspec-pilot collapses those three passes into one tool call. The Figma
file is read once, EARS sentences are generated with a fixed grammar, the
spec is linted by deterministic rules (no second LLM in the loop), and a
vitest file is emitted one-to-one with the requirements. Re-running on
the next Figma iteration is a single command — the unit of work shrinks
from "rewrite three documents" to "diff one auto-generated set against
the previous one".

The end-to-end demo run on a synthetic Login screen finishes in about 30 s
on CPU (3 requirements, 0 lint findings, 39-line vitest file). The unit
suite is 51/51 green. See the video at the top for a narrated walkthrough.

## What it does

- Reads a Figma file via REST API (MCP server, stdio transport)
- Extracts UI nodes (Frame, Input, Button, Error text) into [EARS-formatted](docs/adr/0004-ears-over-gherkin.md) requirements via a local Ollama LLM
- Lints the generated spec for keyword shape, ambiguity, missing traceability, and compound actions ([6 rules](docs/adr/0005-lint-rule-selection.md))
- Emits [vitest](docs/adr/0006-test-framework.md) test skeletons — one `it()` per requirement, failing on TODO until a human fills it in

The MCP server exposes four tools: `figma_get_file`, `extract_spec`, `lint_spec`, `generate_tests`. Chain them for a one-command Figma-to-tests pipeline, or call them individually from any MCP-capable client (Claude Code, Cursor, ...).

See [docs/examples/sample-spec.md](docs/examples/sample-spec.md) for a worked end-to-end run.

## How the pieces fit together

The pipeline is four stages, each pinned to one decision recorded in `docs/adr/`:

1. **Read Figma** — MCP server on stdio ([ADR-0001](docs/adr/0001-mcp-over-plugin.md), [ADR-0002](docs/adr/0002-stdio-transport.md)) holds the token in-process and survives in CI without a Figma session. Rate limit is honoured client-side with no third-party throttle dependency ([ADR-0003](docs/adr/0003-figma-rate-limit.md)).
2. **Extract requirements** — Figma nodes become EARS sentences via a local Ollama call ([ADR-0004](docs/adr/0004-ears-over-gherkin.md) explains why EARS over Gherkin; [ADR-0007](docs/adr/0007-ollama-default-backend.md) explains why local-first over a managed API). Five fixed patterns make the output mechanically classifiable.
3. **Lint deterministically** — six pure-function rules ([ADR-0005](docs/adr/0005-lint-rule-selection.md)) catch keyword shape, ambiguity, traceability, and compound actions. No second LLM in the loop, so the lint output is reproducible CI-side.
4. **Emit test skeletons** — one vitest `it()` per requirement ([ADR-0006](docs/adr/0006-test-framework.md)) that throws on `TODO` until a human fills it in. The skeleton refuses to emit auto-passing tests so the spec ↔ test linkage stays honest.

End-to-end on a synthetic Login screen: 3 EARS requirements extracted, 0 lint findings, 39-line vitest file emitted in ≈ 30 s on CPU. Unit suite: 51/51. Demo video at the top of this README walks through the four stages on a 99-second narrated take. A separate one-call run against a real public Figma community file (`Figma basics`) is recorded at [docs/examples/real-figma-run.md](docs/examples/real-figma-run.md) with the snapshotted payload preserved at [docs/examples/figma-basics-fixture.json](docs/examples/figma-basics-fixture.json).

## Quick start

    # 1. local LLM backend (free, no API key)
    ollama pull gemma3:4b

    # 2. install + run the full pipeline on a synthetic input
    #    No Figma token, no API key, no .env required for this step.
    npm install
    npm run demo

    # 3. optional: run against a real Figma file
    #    Step 3 is the only step that needs a Figma token.
    cp .env.example .env   # set FIGMA_TOKEN (free personal token, scope: file_content:read)
    FIGMA_FILE_KEY=<your-key-or-url> npm run verify

See [docs/examples/sample-spec.md](docs/examples/sample-spec.md) for the worked example.

## Design decisions

- [ADR-0001 Why MCP server over Figma plugin](docs/adr/0001-mcp-over-plugin.md)
- [ADR-0002 Use stdio transport, defer HTTP/SSE](docs/adr/0002-stdio-transport.md)
- [ADR-0003 Figma API rate-limit and token-handling strategy](docs/adr/0003-figma-rate-limit.md)
- [ADR-0004 Use EARS, not Gherkin, as the requirements grammar](docs/adr/0004-ears-over-gherkin.md)
- [ADR-0005 Lint rule selection — six deterministic rules over EARS](docs/adr/0005-lint-rule-selection.md)
- [ADR-0006 Generate vitest skeletons, not Jest / node:test / AVA](docs/adr/0006-test-framework.md)
- [ADR-0007 Use Ollama as the LLM backend](docs/adr/0007-ollama-default-backend.md)

## Limitations

Honest disclosure — what *no LLM-based tool can do today*, with the reason each constraint is external to this codebase:

- **LLM hallucination — industry-wide unsolved problem.** No 2026 LLM (Claude, GPT, Gemini, Ollama) prevents semantic hallucination at generation time; the field's consensus is layered defence — downstream lint + human review. This pipeline implements both. The M4 lint pass catches structural defects (missing keyword, wrong pattern, hedge words) but cannot catch semantic mistakes — that is the current ceiling of the underlying model technology, not a gap in this tool. Treat the output as a human-reviewed draft.
- **Figma API rate-limit — set by Figma, not the client.** Tier 1 (`/v1/files/:key`) is per-minute, plan-dependent: 10-20/min on Dev/Full seats, as low as 6/month on View/Collab. Every Figma client (first-party plugins included) shares this cap; no "more calls" affordance exists for anyone. The pipeline implements the optimal workaround: `npm run verify` makes exactly one call, snapshots the response, and never retries; downstream stages read the cached fixture. See [ADR-0003](docs/adr/0003-figma-rate-limit.md).
- **Local LLM ceiling — CPU + 4B parameters, by design.** `gemma3:4b` is the tested baseline; output quality is bounded by what a 4B-parameter quantised model can do on CPU. This is a deliberate consumer-laptop constraint (free, no API key, no GPU required), not an unfixable limit — swap in a larger local model or GPU and the ceiling lifts. The `LLMBackend` interface accepts the swap with zero pipeline changes.
- **Auto-layout depth ≥ 5 is flattened — LLM context-window economics.** `summariseNodes` caps at the configured depth because deeper trees push past gemma3:4b's effective context window, degrading EARS output quality more than the depth gained. The cap is configurable, not hard-coded — a larger-context model raises it.
- **HTTP/SSE transport not exposed — v0.1 scope.** `StdioServerTransport` only; remote/browser clients cannot reach the server without an external proxy. v0.1 deliberately ships the smallest viable surface; HTTP/SSE lands when a customer pulls demand. See [ADR-0002](docs/adr/0002-stdio-transport.md).

## License

MIT
