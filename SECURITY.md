# Security policy

## Supply-chain hardening

This repository follows a defense-in-depth posture against npm supply-chain
attacks (Shai-Hulud, s1ngularity, TeamPCP class):

- `.npmrc` enforces a cooldown window before adopting new package versions
- `ignore-scripts=true` blocks postinstall execution by default
- `audit-level=moderate` fails CI on moderate or higher advisories
- Dependabot is configured with a cooldown to avoid bleeding-edge auto-merge
- All Figma API tokens live in `.env` (gitignored) and never in source
- `gitleaks` pre-commit hook scans for secret patterns before commit
- Default LLM backend is local (Ollama); no LLM API key handling required

## Reporting a vulnerability

Open a private security advisory via GitHub's "Report a vulnerability" flow.
Do not file a public issue for security concerns.

## Threat model scope

- In scope: spec-extractor output integrity, lint bypass paths, token leakage
- Out of scope: Figma-side ACL bugs, upstream MCP SDK vulnerabilities
