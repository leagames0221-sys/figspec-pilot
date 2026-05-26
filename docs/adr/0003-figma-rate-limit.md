# ADR-0003: Figma API rate-limit and token-handling strategy

- Status: Accepted
- Date: 2026-05-26

## Context

M2 calls `GET /v1/files/:key`. Figma's documented rate limits are not a single
fixed number; they vary by tier, by the file's plan, and by the caller's seat
type. The official guidance ([Figma REST API rate limits][1]) places
`GET /v1/files/:key` in Tier 1, where Dev/Full seats see 10–20 requests per
minute and View/Collab seats can see as little as 6 per month. Limits are
applied per token, per plan. Overflow returns HTTP 429 with a `Retry-After`
header (seconds), plus `X-Figma-Rate-Limit-Type` and `X-Figma-Plan-Tier`.

[1]: https://developers.figma.com/docs/rest-api/rate-limits/

We need a strategy that:

- Stays inside the lowest realistic ceiling (a free Starter seat may have a
  much smaller per-minute budget than a Dev seat)
- Honours `Retry-After` exactly instead of guessing
- Surfaces 401 / 403 / 404 distinctly so the operator knows whether to
  regenerate the token, widen its scope, or fix the URL
- Adds no third-party throttle dependency (supply-chain hygiene per `SECURITY.md`)

## Decision

Implement throttling inside `FigmaClient` (src/figma-client.ts) with three
rules:

1. **Client-side floor**: at most one request every 3 seconds
   (`FIGMA_MIN_INTERVAL_MS`, default 3000). This sits at the conservative end
   of the Tier 1 Dev range (20/min) so a single client respects the limit
   even when the host plan is the cheaper tier.
2. **Server-side respect**: on a 429 response, parse `Retry-After` and sleep
   for that exact number of seconds before retrying. If the header is absent
   or zero, fall back to exponential backoff (5s × 2^attempt) up to
   `FIGMA_MAX_RETRIES` (default 3). After that, raise `FigmaRateLimitError`
   so callers can decide whether to defer or abort.
   **Verify path overrides to `FIGMA_MAX_RETRIES=0`** so the free-tier
   monthly budget (as low as 6 /month on View seats) is never burned by
   retry storms — a single 429 fails fast.
3. **Status-aware errors**: 401 → "regenerate token / check scope", 403 → "scope
   or visibility insufficient", 404 → "file not found", anything else →
   generic `FigmaApiError` with the body attached.

Token lives in `process.env.FIGMA_TOKEN`, loaded via Node's built-in
`--env-file=.env` flag (no `dotenv` dependency). The token is read once at
server startup, kept on the `FigmaClient` instance, and never echoed in tool
responses.

## Consequences

Positive

- Free-tier and paid-tier users see the same client behaviour; no plan
  detection logic needed
- `Retry-After` compliance avoids amplifying rate-limit storms
- Distinct error classes give operators a single-line diagnosis path
- Zero new dependencies — built-in `fetch`, built-in `setTimeout`, built-in
  `--env-file`
- The throttle queue is fully covered by unit tests for the URL parser and
  summariser; integration is exercised by `npm run verify`

Negative

- 3 s/request is slower than necessary on Enterprise Dev seats (which could
  sustain 20/min ≈ one every 3 s, so the ceiling matches but no faster)
- Single-process throttle: running two server processes in parallel doubles
  the effective rate against Figma. M5 demo and CI both use a single process,
  so this is acceptable for now.
- Exponential fallback caps at 3 retries; sustained overload surfaces as
  `FigmaRateLimitError` rather than infinite blocking — explicit failure is
  preferred over silent degradation

## Tradeoffs considered

A token-bucket library (`bottleneck`, `p-throttle`) would let the floor adapt
to observed limits and would express the queue more idiomatically. Both are
healthy packages, but each adds a transitive dependency surface for a feature
the standard library already covers in ~30 lines. We accept the slightly less
elegant in-house queue in exchange for one fewer supply-chain attack vector.

A per-endpoint configurable ceiling (Tier 1 vs Tier 2 endpoints) would let
heavier endpoints back off more aggressively. M2 only uses one Tier 1
endpoint; we revisit this when M3+ adds image rendering or comments.

## Free-tier verification budget

`npm run verify` makes exactly **one** real Figma API call per run, with
`depth=1` for a minimal payload. On success the response is snapshotted to
`docs/private/fixtures/` (gitignored) so all downstream development reads
from disk. M3-M5 must consume fixtures, not the live API, to keep total
month-on-month usage at one call per fixture refresh.
