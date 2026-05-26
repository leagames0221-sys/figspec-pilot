# ADR-0001: Use an MCP server, not a Figma plugin

- Status: Accepted
- Date: 2026-05-26

## Context

The pipeline needs to read Figma files and feed structured node data into
Claude Code. There are two integration surfaces:

1. A Figma plugin running inside the Figma desktop/web app
2. An MCP (Model Context Protocol) server that calls the Figma REST API and
   exposes tools to any MCP-capable client

Constraints:

- The user-facing client must be Claude Code (project convention)
- The pipeline must be runnable from CI (no human in Figma)
- Spec extraction quality depends on calling an LLM, which a Figma plugin
  cannot do directly without proxying through an external service

## Decision

Implement the integration as an MCP server. Claude Code (and any other MCP
client such as Cursor) connects over stdio; the server holds the Figma token,
calls the REST API, and returns node trees that downstream tools convert
into EARS spec, lint findings, and test skeletons.

## Consequences

Positive

- Runs in CI without a Figma session
- Reusable across Claude Code, Cursor, and future MCP clients
- Token never leaves the local process; no plugin-side secret handling
- LLM calls happen client-side, where API keys already live

Negative

- Loses Figma plugin UI affordances (selection sync, in-canvas overlays)
- Subject to the Figma REST API rate limit (per-minute, tier- and plan-dependent); see ADR-0003 for the throttling strategy

## Tradeoffs considered

A Figma plugin would give better in-design feedback but cannot run unattended
and cannot call an LLM without standing up an extra backend, which contradicts
the "one local pipeline" goal. We accept losing in-canvas UX in exchange for
CI-runnability and a smaller secret surface.
