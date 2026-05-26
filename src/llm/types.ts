// Common LLM backend contract. Implementations satisfy this so the EARS
// extractor stays backend-agnostic.

import type { NodeSummary } from "../figma-client.ts";

export interface SpecInput {
  fileName: string;
  nodes: NodeSummary[];
}

export type EarsPattern =
  | "ubiquitous"
  | "event"
  | "state"
  | "optional"
  | "unwanted";

export interface EarsRequirement {
  id: string;
  pattern: EarsPattern;
  text: string;
  source: { nodeId: string; nodeName: string }[];
}

export interface SpecOutput {
  backend: string;
  model: string;
  requirements: EarsRequirement[];
}

export interface LLMBackend {
  readonly name: string;
  readonly model: string;
  generate(systemPrompt: string, userPrompt: string): Promise<string>;
}

export class LLMError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "LLMError";
  }
}
