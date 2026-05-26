# ADR-0007: Use Ollama as the LLM backend

- Status: Accepted
- Date: 2026-05-26

## Context

EARS extraction (M3), spec lint (M4), and test generation (M5) all call an
LLM. The project's stated constraints are:

- Free to clone and run; no credit card to evaluate
- Runs on a consumer laptop
- Secret surface kept minimal; no third-party API keys for the read-only
  parts of the pipeline

A reviewer should be able to `git clone`, install Node deps, run
`ollama pull gemma3:4b`, and see the pipeline work — without signing up for
any paid service. That excludes "Claude API only" as the default.

Backends considered:

- **Ollama** (https://ollama.com/) — local daemon, MIT-licensed runtime,
  HTTP API on 127.0.0.1:11434. Supports `format: "json"` for structured
  output. Runs gemma3, qwen, llama3 etc. on CPU or GPU.
- **Claude API** (Anthropic) — managed, paid, higher reasoning quality
- **OpenAI / Gemini** — same paid-managed shape, similar trade-offs to Claude

## Decision

The shipped backend is Ollama. The `LLMBackend` interface in
`src/llm/types.ts` keeps backend choice a single-file change
(`src/llm/index.ts`) if a measured quality gap with `gemma3:4b` ever
justifies adding a managed alternative, but no second backend is shipped
today.

Default model: `gemma3:4b` (Q4_K_M quantisation, ~3.3 GB) — small enough to
fit on a consumer laptop with 16 GB RAM, large enough to produce valid
EARS JSON in M3 verify (one-shot, ~27 s on CPU per `npm run verify:ears`).

## Consequences

Positive

- A reviewer can run the full pipeline offline after a one-time `ollama pull`
- No API keys to leak; no monthly bill
- Deterministic-ish behaviour: setting `temperature: 0.1` plus EARS keyword
  validation gives reproducible smoke tests
- The same `LLMBackend` interface lets a future managed backend slot in
  behind the factory without touching `src/ears.ts`

Negative

- Cold first call is slow (model load can add 5-15 s)
- Quality ceiling is whatever the local model can do; gemma3:4b sometimes
  drops requirements when the node list is large
- Adds a process dependency: the Ollama daemon must be running
- We don't get to brag about a frontier model in the README

## Tradeoffs considered

Defaulting to Claude would give a better demo but excludes evaluators who
don't already have an API key, and forces secret handling into the project
from day one. We accept gemma3:4b's lower ceiling in exchange for
zero-friction first-run.

A "no LLM" rule-based extractor was considered for the absolute lowest
friction; rejected because the whole point of figspec-pilot is to show an
AI-driven pipeline. Without an LLM there is no narrative.
