// Unit tests for the vitest skeleton generator.
// Run with: npm run test:unit
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { EarsRequirement, SpecOutput } from "./llm/index.ts";
import {
  asLiteral,
  generateTestFile,
  groupBySource,
  patternScaffold,
  renderIt,
} from "./test-gen.ts";

function req(o: Partial<EarsRequirement> = {}): EarsRequirement {
  return {
    id: "R1",
    pattern: "event",
    text: "When the user clicks Save, the system shall persist the draft.",
    source: [{ nodeId: "1:1", nodeName: "Save" }],
    ...o,
  };
}

describe("asLiteral", () => {
  it("escapes quotes and backslashes", () => {
    assert.equal(asLiteral('he said "hi"'), '"he said \\"hi\\""');
    assert.equal(asLiteral("a\\b"), '"a\\\\b"');
  });

  it("escapes newlines", () => {
    assert.equal(asLiteral("line1\nline2"), '"line1\\nline2"');
  });
});

describe("groupBySource", () => {
  it("groups by first source nodeName", () => {
    const out = groupBySource([
      req({ id: "R1", source: [{ nodeId: "1:1", nodeName: "Save" }] }),
      req({ id: "R2", source: [{ nodeId: "1:2", nodeName: "Cancel" }] }),
      req({ id: "R3", source: [{ nodeId: "1:1", nodeName: "Save" }] }),
    ]);
    assert.equal(out.size, 2);
    assert.equal(out.get("Save")?.length, 2);
    assert.equal(out.get("Cancel")?.length, 1);
  });

  it("falls back to '(no source)' for empty source", () => {
    const out = groupBySource([req({ source: [] })]);
    assert.equal(out.get("(no source)")?.length, 1);
  });
});

describe("renderIt", () => {
  it("includes id, pattern, source, and TODO throw", () => {
    const block = renderIt(req());
    assert.match(block, /it\("\[R1\]/);
    assert.match(block, /pattern: event/);
    assert.match(block, /source: 1:1\/Save/);
    assert.match(block, /throw new Error\("TODO: implement test for R1"\)/);
  });

  it("handles (no source) gracefully", () => {
    const block = renderIt(req({ source: [] }));
    assert.match(block, /source: \(no source\)/);
  });

  it("emits pattern-specific arrange/act/assert scaffold (event)", () => {
    const block = renderIt(req({ pattern: "event" }));
    assert.match(block, /arrange: set up the state where the trigger can fire/);
    assert.match(block, /act:     trigger the event described before "shall"/);
    assert.match(block, /assert:  verify the post-condition described after "shall"/);
  });

  it("emits pattern-specific scaffold (unwanted) differs from event", () => {
    const block = renderIt(req({ pattern: "unwanted" }));
    assert.match(block, /trigger the condition described after "If"/);
    assert.match(block, /verify the recovery \/ rejection/);
    // and does NOT carry the event-pattern wording
    assert.doesNotMatch(block, /trigger the event described before "shall"/);
  });
});

describe("patternScaffold", () => {
  it("emits a 3-line scaffold for every EARS pattern", () => {
    for (const p of ["ubiquitous", "event", "state", "optional", "unwanted"] as const) {
      const lines = patternScaffold(p);
      assert.equal(lines.length, 3);
      assert.match(lines[0], /arrange:/);
      assert.match(lines[1], /act:/);
      assert.match(lines[2], /assert:/);
    }
  });

  it("each pattern produces a distinct scaffold (no copy-paste fallback)", () => {
    const all = (["ubiquitous", "event", "state", "optional", "unwanted"] as const)
      .map((p) => patternScaffold(p).join("\n"));
    const unique = new Set(all);
    assert.equal(unique.size, 5);
  });
});

describe("generateTestFile", () => {
  it("emits one describe per source group and one it per requirement", () => {
    const spec: SpecOutput = {
      backend: "mock",
      model: "mock-1",
      requirements: [
        req({ id: "R1", source: [{ nodeId: "1:1", nodeName: "Save" }] }),
        req({
          id: "R2",
          pattern: "unwanted",
          text: "If the form is empty, then the system shall disable the Save button.",
          source: [{ nodeId: "1:1", nodeName: "Save" }],
        }),
        req({
          id: "R3",
          pattern: "ubiquitous",
          text: "The system shall log every save attempt.",
          source: [{ nodeId: "1:9", nodeName: "Logger" }],
        }),
      ],
    };
    const out = generateTestFile(spec, { fileName: "Login form" });
    assert.match(out, /import \{ describe, it \} from "vitest"/);
    assert.match(out, /describe\("Login form"/);
    assert.match(out, /describe\("Save"/);
    assert.match(out, /describe\("Logger"/);
    // 3 `it(` blocks
    const itCount = (out.match(/    it\(/g) ?? []).length;
    assert.equal(itCount, 3);
  });

  it("covers all five EARS patterns", () => {
    const spec: SpecOutput = {
      backend: "mock",
      model: "mock-1",
      requirements: (
        [
          ["ubiquitous", "The system shall log requests."],
          ["event", "When user clicks, the system shall save."],
          ["state", "While loading, the system shall show a spinner."],
          ["optional", "Where dark mode is enabled, the system shall invert colours."],
          ["unwanted", "If credentials are invalid, then the system shall reject the login."],
        ] as const
      ).map(([pattern, text], i) => ({
        id: `R${i + 1}`,
        pattern,
        text,
        source: [{ nodeId: `1:${i}`, nodeName: `n${i}` }],
      })),
    };
    const out = generateTestFile(spec, { fileName: "All patterns" });
    for (const id of ["R1", "R2", "R3", "R4", "R5"]) {
      assert.match(out, new RegExp(`\\[${id}\\]`));
    }
  });
});
