// Unit tests for the URL parser and node summariser. Network not touched.
//
// Run with: npm run test:unit
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { FigmaApiError, parseFileKey, summariseNodes } from "./figma-client.ts";

describe("parseFileKey", () => {
  it("accepts a bare alphanumeric key", () => {
    assert.equal(parseFileKey("abcDEF123"), "abcDEF123");
  });

  it("extracts from /file/ URLs", () => {
    assert.equal(
      parseFileKey("https://www.figma.com/file/abcDEF123/Some-Name?node-id=0:1"),
      "abcDEF123",
    );
  });

  it("extracts from /design/ URLs", () => {
    assert.equal(
      parseFileKey("https://www.figma.com/design/xyz999/Project"),
      "xyz999",
    );
  });

  it("extracts from /community/file/ URLs", () => {
    assert.equal(
      parseFileKey("https://www.figma.com/community/file/community123/Kit"),
      "community123",
    );
  });

  it("rejects empty input", () => {
    assert.throws(() => parseFileKey(""), /empty/);
  });

  it("rejects invalid characters in bare key", () => {
    assert.throws(() => parseFileKey("bad key!"), /invalid characters/);
  });

  it("rejects URLs that don't match the pattern", () => {
    assert.throws(
      () => parseFileKey("https://example.com/not-figma"),
      /Could not extract/,
    );
  });
});

describe("summariseNodes", () => {
  it("returns null root when document missing", () => {
    const out = summariseNodes({ name: "Empty" });
    assert.equal(out.fileName, "Empty");
    assert.equal(out.root, null);
  });

  it("respects maxDepth", () => {
    const raw = {
      name: "X",
      lastModified: "2026-05-26T00:00:00Z",
      document: {
        id: "0:0",
        name: "doc",
        type: "DOCUMENT",
        children: [
          {
            id: "1:0",
            name: "frame",
            type: "FRAME",
            children: [
              { id: "2:0", name: "btn", type: "INSTANCE", children: [] },
            ],
          },
        ],
      },
    };
    const out = summariseNodes(raw, 1);
    assert.equal(out.fileName, "X");
    assert.equal(out.lastModified, "2026-05-26T00:00:00Z");
    assert.equal(out.root?.children?.[0].name, "frame");
    // depth=1 means root walks children once; frame's children should be omitted
    assert.equal(out.root?.children?.[0].children, undefined);
  });

  it("handles non-object input gracefully", () => {
    const out = summariseNodes(null);
    assert.equal(out.fileName, "<unknown>");
    assert.equal(out.root, null);
  });
});

describe("FigmaApiError", () => {
  it("preserves status and body", () => {
    const e = new FigmaApiError("boom", 404, "not found");
    assert.equal(e.status, 404);
    assert.equal(e.body, "not found");
    assert.equal(e.name, "FigmaApiError");
  });
});
