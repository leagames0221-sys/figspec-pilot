// Factory that builds the configured LLM backend.
// One backend ships today (Ollama); the LLMBackend interface keeps the seam open.
import type { Config } from "../config.ts";
import { OllamaBackend } from "./ollama.ts";
import { LLMError, type LLMBackend } from "./types.ts";

export function makeBackend(config: Config): LLMBackend {
  if (config.backend === "ollama") {
    return new OllamaBackend(config.ollamaModel, config.ollamaHost);
  }
  throw new LLMError(`Unknown backend: ${config.backend}`);
}

export type { LLMBackend } from "./types.ts";
export {
  LLMError,
  type EarsPattern,
  type EarsRequirement,
  type SpecInput,
  type SpecOutput,
} from "./types.ts";
