# ADR-0002: Use stdio transport, defer HTTP/SSE

- Status: Accepted
- Date: 2026-05-26

## Context

ADR-0001 picked an MCP server over a Figma plugin. The MCP spec exposes
multiple transports: stdio (process-to-process via stdin/stdout), Streamable
HTTP, and the older SSE transport.

Security context: GHSA-w48q-cv73-mx4w (HIGH, published 2025-12-02) found that
the TypeScript SDK's HTTP/SSE transports did not enable DNS rebinding
protection by default. Patched in `@modelcontextprotocol/sdk` 1.24.0, but the
default-off configuration persists; downstream code must opt in.

We need a transport that:

- Pairs naturally with Claude Code's local-process MCP model
- Holds the Figma personal access token in-process, never over the network
- Avoids the DNS rebinding attack surface for v0.1

## Decision

Use `StdioServerTransport` exclusively. Do not expose an HTTP or SSE listener
in v0.1. Token (`FIGMA_TOKEN`) is read from `.env` by the server process,
loaded once at startup, and never serialized into a tool response.

## Consequences

Positive

- DNS rebinding (GHSA-w48q-cv73-mx4w) is not applicable: no HTTP listener exists
- Token never leaves the host process; no socket-level secret handling
- Claude Code and other MCP clients spawn the server directly, so the trust
  boundary is parent ↔ child OS process
- Local-first matches the project constraint "runs on consumer laptop, no API key"

Negative

- Cannot share one running server across multiple host machines or containers
- No browser-based MCP client can reach the server without an external proxy
- The MCP Inspector's web UI cannot be used directly; verification uses an
  SDK Client harness instead (see `src/verify-server.ts`)

## Tradeoffs considered

HTTP/SSE would let multiple clients share one server and would unlock browser
clients, but it brings DNS rebinding mitigation, CORS, and a network-exposed
token surface — each a v0.1 risk multiplier with no offsetting user value
while the design is still local-only. We accept losing remote/browser reach
in exchange for a smaller attack surface and a simpler verify story.

If HTTP becomes necessary post-M5, the follow-up ADR must specify the
`enableDnsRebindingProtection: true` + `allowedHosts` configuration per the
GHSA-w48q-cv73-mx4w advisory guidance.
