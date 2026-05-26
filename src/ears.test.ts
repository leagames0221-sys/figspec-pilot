// EARS extractor unit tests using a mock LLM backend (no Ollama required).
//
// Run with: npm run test:unit
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { NodeSummary } from "./figma-client.ts";
import {
  buildUserPrompt,
  extractSpec,
  flattenNodes,
  parseSpec,
} from "./ears.ts";
import { LLMError, type LLMBackend, type SpecInput } from "./llm/index.ts";

function mockBackend(canned: string): LLMBackend {
  return {
    name: "mock",
    model: "mock-1",
    async generate() {
      return canned;
    },
  };
}

describe("flattenNodes", () => {
  it("returns empty array for null root", () => {
    assert.deepEqual(flattenNodes(null), []);
  });

  it("walks children depth-first", () => {
    const tree: NodeSummary = {
      id: "0:0",
      name: "doc",
      type: "DOCUMENT",
      children: [
        {
          id: "1:0",
          name: "page",
          type: "CANVAS",
          children: [{ id: "2:0", name: "btn", type: "INSTANCE" }],
        },
      ],
    };
    const flat = flattenNodes(tree);
    assert.deepEqual(
      flat.map((n) => n.id),
      ["0:0", "1:0", "2:0"],
    );
  });
});

describe("buildUserPrompt", () => {
  it("lists nodes as id/type/name lines", () => {
    const input: SpecInput = {
      fileName: "Login",
      nodes: [
        { id: "1:1", name: "Email", type: "INPUT" },
        { id: "1:2", name: "Submit", type: "INSTANCE" },
      ],
    };
    const p = buildUserPrompt(input);
    assert.match(p, /Figma file: Login/);
    assert.match(p, /id=1:1.*type=INPUT.*"Email"/);
    assert.match(p, /id=1:2.*type=INSTANCE.*"Submit"/);
  });
});

describe("parseSpec", () => {
  it("accepts a well-formed EARS JSON", () => {
    const raw = JSON.stringify({
      requirements: [
        {
          id: "R1",
          pattern: "event",
          text: "When the user clicks the Submit button, the system shall submit the form.",
          source: [{ nodeId: "1:2", nodeName: "Submit" }],
        },
      ],
    });
    const out = parseSpec(raw);
    assert.equal(out.length, 1);
    assert.equal(out[0].id, "R1");
    assert.equal(out[0].pattern, "event");
    assert.equal(out[0].source[0].nodeId, "1:2");
  });

  it("rejects invalid JSON", () => {
    assert.throws(() => parseSpec("not json"), LLMError);
  });

  it("rejects missing requirements array", () => {
    assert.throws(() => parseSpec(JSON.stringify({ foo: 1 })), LLMError);
  });

  it("drops requirements with unknown pattern", () => {
    const raw = JSON.stringify({
      requirements: [
        { id: "R1", pattern: "made-up", text: "x", source: [] },
        {
          id: "R2",
          pattern: "ubiquitous",
          text: "The system shall log requests.",
          source: [],
        },
      ],
    });
    const out = parseSpec(raw);
    assert.equal(out.length, 1);
    assert.equal(out[0].id, "R2");
  });

  it("drops malformed source entries but keeps the requirement", () => {
    const raw = JSON.stringify({
      requirements: [
        {
          id: "R1",
          pattern: "state",
          text: "While loading, the system shall show a spinner.",
          source: [
            { nodeId: "1:1", nodeName: "Spinner" },
            { nodeId: 123 }, // malformed
            "garbage", // malformed
          ],
        },
      ],
    });
    const out = parseSpec(raw);
    assert.equal(out.length, 1);
    assert.equal(out[0].source.length, 1);
    assert.equal(out[0].source[0].nodeId, "1:1");
  });
});

describe("extractSpec", () => {
  it("round-trips through a mock backend", async () => {
    const canned = JSON.stringify({
      requirements: [
        {
          id: "R1",
          pattern: "event",
          text: "When the user clicks Save, the system shall persist the draft.",
          source: [{ nodeId: "9:9", nodeName: "Save" }],
        },
      ],
    });
    const out = await extractSpec(
      { fileName: "X", nodes: [{ id: "9:9", name: "Save", type: "INSTANCE" }] },
      mockBackend(canned),
    );
    assert.equal(out.backend, "mock");
    assert.equal(out.model, "mock-1");
    assert.equal(out.requirements.length, 1);
    assert.equal(out.requirements[0].pattern, "event");
  });

  it("surfaces LLMError when output is unparseable", async () => {
    await assert.rejects(
      extractSpec(
        { fileName: "X", nodes: [] },
        mockBackend("not valid json"),
      ),
      LLMError,
    );
  });
});
