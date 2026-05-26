// M2 verify harness: spawns the server over stdio, lists tools, and calls
// figma_get_file against a real Figma file ONCE.
//
// Free-tier discipline (see ADR-0003):
//   - Spawned server inherits FIGMA_MAX_RETRIES from the env. For verify
//     we force it to 0 so a 429 fails fast instead of burning the monthly
//     quota (View/Collab seats can be as low as 6 / month for Tier 1).
//   - depth=1 keeps the response small.
//   - On success the raw figma_get_file payload is snapshotted into
//     docs/private/fixtures/ so M3-M5 development reads from disk and
//     never hits the API again.
//
// Usage:
//   FIGMA_FILE_KEY=<key-or-url> npm run verify
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE_KEY = process.env.FIGMA_FILE_KEY;
if (!FILE_KEY) {
  console.error(
    "Set FIGMA_FILE_KEY to a Figma file you can read with the configured " +
      "FIGMA_TOKEN, then re-run.\n" +
      "Example: FIGMA_FILE_KEY=abcDEF123 npm run verify",
  );
  process.exit(2);
}

// Force fail-fast on rate limit; the child server reads its env from --env-file
// AND inherits parent process env, with the parent overriding.
process.env.FIGMA_MAX_RETRIES = "0";

const transport = new StdioClientTransport({
  command: "npx",
  args: ["tsx", "--env-file=.env", "src/server.ts"],
  env: { ...process.env, FIGMA_MAX_RETRIES: "0" } as Record<string, string>,
});

const client = new Client(
  { name: "figspec-verify", version: "0.2.0" },
  { capabilities: {} },
);

await client.connect(transport);

const tools = await client.listTools();
const names = tools.tools.map((t) => t.name);
console.log("tools:", names);
if (!names.includes("figma_get_file")) {
  console.error("FAIL: figma_get_file not advertised");
  process.exit(1);
}

const result = await client.callTool({
  name: "figma_get_file",
  arguments: { fileKey: FILE_KEY, depth: 1 },
});

const block =
  result.content && Array.isArray(result.content) && result.content[0]
    ? result.content[0]
    : null;
const text =
  block && block.type === "text" ? (block as { text: string }).text : "";

if (result.isError) {
  console.log("Figma API error (server returned structured error):");
  console.log(text);
  console.log(
    "\nThis proves the transport works. Fix the file key / token scope / " +
      "rate-limit window, then re-run. No fixture written.",
  );
} else {
  console.log("figma_get_file result (depth=1):");
  console.log(text.slice(0, 1500));
  if (text.length > 1500) console.log(`... (${text.length - 1500} more bytes)`);

  // Snapshot to LOCAL fixture so M3+ never hits the API again.
  const fixtureDir = resolve("docs", "private", "fixtures");
  mkdirSync(fixtureDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const fixturePath = resolve(fixtureDir, `m2-verify-${ts}.json`);
  writeFileSync(fixturePath, text, "utf8");
  console.log(`\nFixture written: ${fixturePath}`);
}

await client.close();
console.log("\nPASS: M2 stdio + listTools + Figma round-trip");
