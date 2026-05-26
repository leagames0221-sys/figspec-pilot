# Real Figma file run

> This file is the evidence that `figspec-pilot` round-trips against a
> real Figma REST API endpoint, not just the synthetic Login screen used
> by `npm run demo`. It is independent of the demo video.

## What was run

```
FIGMA_FILE_KEY=gIO4gfdWjMcsup0p4Ntu9i npm run verify
```

`gIO4gfdWjMcsup0p4Ntu9i` is the file key for **[Figma basics](https://www.figma.com/community/file/1118405691122564239/figma-basics)**, an official Figma community file that anyone with a free Figma personal access token can read.

## Why this file

- **Public community file** — no NDA, no customer data, anyone can reproduce
- **Stable file key** — Figma's own tutorial, so the file is unlikely to disappear
- **Minimal payload** — `depth=1` keeps the response small, fits the free-tier rate-limit discipline (see [ADR-0003](../adr/0003-figma-rate-limit.md))

## What was observed

The verify harness ([src/verify-server.ts](../../src/verify-server.ts)) spawns the MCP server, lists tools, calls `figma_get_file` with `depth=1`, and snapshots the response. The expected terminal output is:

```
tools: [ 'figma_get_file', 'extract_spec', 'lint_spec', 'generate_tests' ]
figma_get_file result (depth=1):
{
  "fileName": "Figma basics",
  "lastModified": "2026-05-26T06:37:17Z",
  "root": {
    "id": "0:0",
    "name": "Document",
    "type": "DOCUMENT",
    "children": [
      {
        "id": "0:1",
        "name": "Figma Basics",
        "type": "CANVAS"
      }
    ]
  }
}

Fixture written: docs/private/fixtures/m2-verify-<timestamp>.json

PASS: M2 stdio + listTools + Figma round-trip
```

The snapshotted JSON payload is preserved at [`docs/examples/figma-basics-fixture.json`](./figma-basics-fixture.json) so downstream development can read from disk without burning rate-limit quota.

## Free-tier discipline

`npm run verify` is wired to make **exactly one** real Figma API call per run, with `FIGMA_MAX_RETRIES=0`. View-seat Figma plans can be as low as 6 file reads per *month* on Tier 1 endpoints, so a retry storm would burn the entire budget in a single hung run. The harness fails fast on a 429 and snapshots the success response so M3-M5 development never re-hits the API. See [ADR-0003 § Free-tier verification budget](../adr/0003-figma-rate-limit.md).

## How to reproduce

1. Generate a free Figma personal access token at [https://www.figma.com/settings](https://www.figma.com/settings) (scope: `file_content:read`)
2. `cp .env.example .env` and paste the token into `FIGMA_TOKEN=`
3. Run `FIGMA_FILE_KEY=gIO4gfdWjMcsup0p4Ntu9i npm run verify`
4. The fixture is snapshotted to `docs/private/fixtures/m2-verify-<timestamp>.json` (gitignored locally; the committed copy at `docs/examples/figma-basics-fixture.json` is the same payload, with provenance metadata in `_meta`)
