// End-to-end demo runner: synthetic Figma input → extract → lint → tests.
// Writes a transcript to docs/private/fixtures/demo-<timestamp>.log and
// the generated test file to docs/private/fixtures/generated.test.ts.
//
// Usage: npm run demo
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { loadConfig } from "./config.ts";
import { extractSpec } from "./ears.ts";
import { ALL_RULES } from "./lint-rules.ts";
import { runLint } from "./lint.ts";
import { makeBackend, type SpecInput } from "./llm/index.ts";
import { generateTestFile } from "./test-gen.ts";

const SYNTHETIC: SpecInput = {
  fileName: "Synthetic Login Screen",
  nodes: [
    { id: "0:0", name: "Document", type: "DOCUMENT" },
    { id: "0:1", name: "Login Page", type: "CANVAS" },
    { id: "1:1", name: "Login Form", type: "FRAME" },
    { id: "2:1", name: "Email", type: "INPUT" },
    { id: "2:2", name: "Password", type: "INPUT" },
    { id: "2:3", name: "Remember me", type: "INSTANCE" },
    { id: "2:4", name: "Sign in", type: "INSTANCE" },
    { id: "2:5", name: "Forgot password?", type: "TEXT" },
    { id: "2:6", name: "Error: invalid credentials", type: "TEXT" },
  ],
};

const lines: string[] = [];
function log(s: string) {
  console.log(s);
  lines.push(s);
}

const config = loadConfig();
const backend = makeBackend(config);

log("=== figspec-pilot end-to-end demo ===");
log(`Backend: ${backend.name} / model: ${backend.model}`);
log(`Input: ${SYNTHETIC.fileName} (${SYNTHETIC.nodes.length} nodes)\n`);

log("[1/3] extract_spec — calling LLM ...");
const startE = Date.now();
const spec = await extractSpec(SYNTHETIC, backend);
log(`  generated ${spec.requirements.length} requirements in ${Date.now() - startE}ms`);
for (const r of spec.requirements) {
  log(`  [${r.id}] (${r.pattern}) ${r.text}`);
}

log("\n[2/3] lint_spec — running 6 deterministic rules ...");
const report = runLint(spec, ALL_RULES);
log(
  `  ${report.totalChecked} checked, ${report.passCount} clean, ` +
    `${report.errorCount} error(s), ${report.warningCount} warning(s)`,
);
for (const f of report.findings) {
  const tag = f.severity === "error" ? "ERR " : "WARN";
  log(`  ${tag} [${f.ruleId}] ${f.requirementId}: ${f.message}`);
}

log("\n[3/3] generate_tests — vitest skeleton ...");
const testFile = generateTestFile(spec, { fileName: SYNTHETIC.fileName });
log(`  generated ${testFile.split("\n").length} lines of TypeScript`);
log("\n--- generated test file (first 40 lines) ---");
for (const l of testFile.split("\n").slice(0, 40)) log(l);

const outDir = resolve("docs", "private", "fixtures");
mkdirSync(outDir, { recursive: true });
const ts = new Date().toISOString().replace(/[:.]/g, "-");
writeFileSync(resolve(outDir, `demo-${ts}.log`), lines.join("\n"), "utf8");
writeFileSync(resolve(outDir, "generated.test.ts"), testFile, "utf8");
log(`\nTranscript: docs/private/fixtures/demo-${ts}.log`);
log("Test file: docs/private/fixtures/generated.test.ts");

if (report.errorCount > 0) {
  console.error("\nFAIL: lint reported errors.");
  process.exit(1);
}
log("\nPASS: M5 end-to-end pipeline (Figma synthetic → EARS → lint → vitest)");
