#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import { loadConfig, requireFigmaToken } from "./config.ts";
import { extractSpec, flattenNodes } from "./ears.ts";
import {
  FigmaApiError,
  FigmaClient,
  summariseNodes,
} from "./figma-client.ts";
import { ALL_RULES } from "./lint-rules.ts";
import { runLint } from "./lint.ts";
import { makeBackend } from "./llm/index.ts";
import { generateTestFile } from "./test-gen.ts";

const FigmaGetFileInput = z.object({
  fileKey: z
    .string()
    .min(1, "fileKey is required (raw key or Figma URL accepted)"),
  depth: z.number().int().min(1).max(8).optional(),
});

const ExtractSpecInput = z.object({
  fileKey: z.string().min(1, "fileKey is required"),
  depth: z.number().int().min(1).max(8).optional(),
});

const SpecShape = z.object({
  backend: z.string().optional(),
  model: z.string().optional(),
  requirements: z.array(
    z.object({
      id: z.string(),
      pattern: z.enum(["ubiquitous", "event", "state", "optional", "unwanted"]),
      text: z.string(),
      source: z.array(
        z.object({ nodeId: z.string(), nodeName: z.string() }),
      ),
    }),
  ),
});

const LintSpecInput = z.object({
  spec: SpecShape.pick({ requirements: true }),
});

const GenerateTestsInput = z.object({
  spec: SpecShape,
  fileName: z
    .string()
    .min(1)
    .default("figspec-pilot generated tests"),
});

const config = loadConfig();
const llm = makeBackend(config);

// FigmaClient is built lazily so the server (and `npm run demo` / the
// LLM-only entry points) starts without FIGMA_TOKEN. The token is enforced
// the first time a Figma-touching tool actually runs.
let figmaInstance: FigmaClient | undefined;
function getFigma(): FigmaClient {
  if (!figmaInstance) {
    figmaInstance = new FigmaClient(requireFigmaToken(config), {
      maxRetries: config.figmaMaxRetries,
      minIntervalMs: config.figmaMinIntervalMs,
    });
  }
  return figmaInstance;
}

const server = new Server(
  { name: "figspec-pilot", version: "0.3.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "figma_get_file",
      description:
        "Fetch a Figma file's node summary by fileKey or full Figma URL. " +
        "Returns the file name, lastModified, and a depth-limited node tree.",
      inputSchema: {
        type: "object",
        properties: {
          fileKey: {
            type: "string",
            description:
              "Figma file key, or a full https://www.figma.com/file|design|community URL",
          },
          depth: {
            type: "integer",
            minimum: 1,
            maximum: 8,
            description:
              "Optional node tree depth cap (default 4). Smaller = lighter payload.",
          },
        },
        required: ["fileKey"],
      },
    },
    {
      name: "extract_spec",
      description:
        "Fetch a Figma file and turn its node tree into EARS-formatted " +
        "requirements via the configured LLM backend (ollama by default).",
      inputSchema: {
        type: "object",
        properties: {
          fileKey: {
            type: "string",
            description: "Figma file key or full URL",
          },
          depth: {
            type: "integer",
            minimum: 1,
            maximum: 8,
            description: "Node tree depth cap (default 3).",
          },
        },
        required: ["fileKey"],
      },
    },
    {
      name: "lint_spec",
      description:
        "Run the deterministic EARS lint over an extracted spec. " +
        "Returns a report with errorCount, warningCount, passCount, and findings[].",
      inputSchema: {
        type: "object",
        properties: {
          spec: {
            type: "object",
            description:
              "A SpecOutput-shaped object with a requirements[] array.",
            properties: {
              requirements: { type: "array" },
            },
            required: ["requirements"],
          },
        },
        required: ["spec"],
      },
    },
    {
      name: "generate_tests",
      description:
        "Convert an extracted EARS spec into a vitest test file. " +
        "Each requirement becomes one it() block that throws TODO until filled in.",
      inputSchema: {
        type: "object",
        properties: {
          spec: {
            type: "object",
            description: "A SpecOutput-shaped object.",
            properties: { requirements: { type: "array" } },
            required: ["requirements"],
          },
          fileName: {
            type: "string",
            description: "Top-level describe label (usually the Figma file name).",
          },
        },
        required: ["spec"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "figma_get_file") {
    const args = FigmaGetFileInput.parse(request.params.arguments);
    try {
      const raw = await getFigma().getFile(args.fileKey, args.depth);
      const summary = summariseNodes(raw, args.depth ?? 4);
      return {
        content: [{ type: "text", text: JSON.stringify(summary, null, 2) }],
      };
    } catch (err) {
      if (err instanceof FigmaApiError) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Figma API error (${err.status}): ${err.message}`,
            },
          ],
        };
      }
      throw err;
    }
  }

  if (request.params.name === "extract_spec") {
    const args = ExtractSpecInput.parse(request.params.arguments);
    try {
      const depth = args.depth ?? 3;
      const raw = await getFigma().getFile(args.fileKey, depth);
      const summary = summariseNodes(raw, depth);
      const flat = flattenNodes(summary.root);
      const out = await extractSpec(
        { fileName: summary.fileName, nodes: flat },
        llm,
      );
      return {
        content: [{ type: "text", text: JSON.stringify(out, null, 2) }],
      };
    } catch (err) {
      if (err instanceof FigmaApiError) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Figma API error (${err.status}): ${err.message}`,
            },
          ],
        };
      }
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `extract_spec failed: ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
      };
    }
  }

  if (request.params.name === "lint_spec") {
    const args = LintSpecInput.parse(request.params.arguments);
    const report = runLint(args.spec, ALL_RULES);
    return {
      content: [{ type: "text", text: JSON.stringify(report, null, 2) }],
    };
  }

  if (request.params.name === "generate_tests") {
    const args = GenerateTestsInput.parse(request.params.arguments);
    const fullSpec = {
      backend: args.spec.backend ?? "unknown",
      model: args.spec.model ?? "unknown",
      requirements: args.spec.requirements,
    };
    const testFile = generateTestFile(fullSpec, { fileName: args.fileName });
    return {
      content: [{ type: "text", text: testFile }],
    };
  }

  throw new Error(`Unknown tool: ${request.params.name}`);
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(
    `figspec-pilot MCP server listening on stdio (backend=${config.backend}, model=${llm.model})\n`,
  );
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err}\n`);
  process.exit(1);
});
