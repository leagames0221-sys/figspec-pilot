// EARS (Easy Approach to Requirements Syntax) extractor.
//
// Pipeline: Figma node summary  →  prompt the configured LLM backend  →
// parse the JSON response into EarsRequirement[].
//
// Why EARS (see ADR-0004): five fixed patterns, each starting with a
// dedicated keyword, give the LLM a tight grammar that lint can verify
// deterministically downstream.
import type { NodeSummary } from "./figma-client.ts";
import {
  LLMError,
  type EarsPattern,
  type EarsRequirement,
  type LLMBackend,
  type SpecInput,
  type SpecOutput,
} from "./llm/index.ts";

const EARS_PATTERNS: EarsPattern[] = [
  "ubiquitous",
  "event",
  "state",
  "optional",
  "unwanted",
];

const SYSTEM_PROMPT = `You translate Figma UI node trees into EARS-formatted requirements.

EARS has exactly five patterns:
  - ubiquitous  : "The <system> shall <response>."
  - event       : "When <trigger>, the <system> shall <response>."
  - state       : "While <condition>, the <system> shall <response>."
  - optional    : "Where <feature>, the <system> shall <response>."
  - unwanted    : "If <trigger>, then the <system> shall <response>."

Rules:
  1. Every requirement MUST start with one of the keywords: The | When | While | Where | If.
  2. One requirement per node-driven behaviour; do not invent UI that is not in the input.
  3. Reference the source nodeId(s) verbatim.
  4. Return STRICT JSON only — no prose, no markdown fences.

Output schema:
{
  "requirements": [
    {
      "id": "R1",
      "pattern": "event",
      "text": "When the user clicks the Submit button, the system shall submit the form.",
      "source": [{"nodeId": "1:23", "nodeName": "Submit"}]
    }
  ]
}`;

export function flattenNodes(
  root: NodeSummary | null,
  acc: NodeSummary[] = [],
): NodeSummary[] {
  if (!root) return acc;
  acc.push({ id: root.id, name: root.name, type: root.type });
  for (const child of root.children ?? []) flattenNodes(child, acc);
  return acc;
}

export function buildUserPrompt(input: SpecInput): string {
  const lines = input.nodes.map(
    (n) => `  - id=${n.id}  type=${n.type}  name=${JSON.stringify(n.name)}`,
  );
  return `Figma file: ${input.fileName}

Nodes (flattened):
${lines.join("\n")}

Generate EARS requirements that describe the behaviour the design implies.
Return JSON matching the schema in the system prompt. No prose, no markdown.`;
}

interface ParsedSpec {
  requirements?: Array<{
    id?: unknown;
    pattern?: unknown;
    text?: unknown;
    source?: unknown;
  }>;
}

export function parseSpec(raw: string): EarsRequirement[] {
  let parsed: ParsedSpec;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new LLMError(
      `Failed to parse LLM JSON output (first 200 chars: ${raw.slice(0, 200)})`,
      err,
    );
  }
  if (!parsed || !Array.isArray(parsed.requirements)) {
    throw new LLMError(
      `LLM output missing 'requirements' array (got: ${typeof parsed})`,
    );
  }
  const out: EarsRequirement[] = [];
  for (const r of parsed.requirements) {
    if (typeof r.id !== "string" || typeof r.text !== "string") continue;
    if (typeof r.pattern !== "string") continue;
    if (!EARS_PATTERNS.includes(r.pattern as EarsPattern)) continue;
    const src = Array.isArray(r.source)
      ? (r.source as unknown[])
          .filter(
            (s): s is { nodeId: string; nodeName: string } =>
              typeof s === "object" &&
              s !== null &&
              typeof (s as { nodeId?: unknown }).nodeId === "string" &&
              typeof (s as { nodeName?: unknown }).nodeName === "string",
          )
          .map((s) => ({ nodeId: s.nodeId, nodeName: s.nodeName }))
      : [];
    out.push({
      id: r.id,
      pattern: r.pattern as EarsPattern,
      text: r.text,
      source: src,
    });
  }
  return out;
}

export async function extractSpec(
  input: SpecInput,
  backend: LLMBackend,
): Promise<SpecOutput> {
  const userPrompt = buildUserPrompt(input);
  const raw = await backend.generate(SYSTEM_PROMPT, userPrompt);
  const requirements = parseSpec(raw);
  return {
    backend: backend.name,
    model: backend.model,
    requirements,
  };
}
