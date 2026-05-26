// M3+M4 verify: real Ollama call against a synthetic Figma node tree,
// then runs the lint engine over the LLM output.
// Does NOT touch the Figma REST API, so it's free to re-run.
//
// Usage: npm run verify:ears
import { extractSpec } from "./ears.ts";
import { loadConfig } from "./config.ts";
import { ALL_RULES } from "./lint-rules.ts";
import { runLint } from "./lint.ts";
import { makeBackend, type SpecInput } from "./llm/index.ts";

// Synthetic "Login screen" mock - what a real depth=3 Figma fetch would
// roughly look like for a basic login UI. Kept here so the verify works
// offline-from-Figma.
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

const config = loadConfig();
const backend = makeBackend(config);

console.log(`Backend: ${backend.name} / model: ${backend.model}`);
console.log(`Input: ${SYNTHETIC.fileName} (${SYNTHETIC.nodes.length} nodes)`);
console.log("Calling LLM (this can take 30-90s on CPU for a 4B model)...\n");

const start = Date.now();
const out = await extractSpec(SYNTHETIC, backend);
const ms = Date.now() - start;

console.log(`Generated ${out.requirements.length} requirements in ${ms}ms:`);
for (const r of out.requirements) {
  console.log(`  [${r.id}] (${r.pattern}) ${r.text}`);
  if (r.source.length > 0) {
    console.log(
      `       source: ${r.source.map((s) => `${s.nodeId}/${s.nodeName}`).join(", ")}`,
    );
  }
}

if (out.requirements.length === 0) {
  console.error(
    "\nFAIL: LLM returned no valid EARS requirements. Output may have been " +
      "malformed or the model rejected the prompt.",
  );
  process.exit(1);
}

const hasKeyword = (r: (typeof out.requirements)[number]) =>
  /^(The|When|While|Where|If)\b/.test(r.text);
const violators = out.requirements.filter((r) => !hasKeyword(r));
if (violators.length > 0) {
  console.error(
    `\nFAIL: ${violators.length} requirement(s) do not start with an EARS keyword:`,
  );
  for (const v of violators) console.error(`  [${v.id}] ${v.text}`);
  process.exit(1);
}

// M4 lint pass
const report = runLint(out, ALL_RULES);
console.log(
  `\nLint: ${report.totalChecked} checked, ${report.passCount} clean, ` +
    `${report.errorCount} error(s), ${report.warningCount} warning(s)`,
);
for (const f of report.findings) {
  const tag = f.severity === "error" ? "ERR " : "WARN";
  console.log(`  ${tag} [${f.ruleId} ${f.ruleName}] ${f.requirementId}: ${f.message}`);
}

if (report.errorCount > 0) {
  console.error("\nFAIL: lint reported errors; spec is not acceptance-grade.");
  process.exit(1);
}

console.log("\nPASS: M3+M4 EARS extraction + lint round-trip via Ollama");
