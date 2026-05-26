// Ollama HTTP backend: POST /api/generate, stream:false, format:"json"
// Spec: https://github.com/ollama/ollama/blob/main/docs/api.md
import { LLMError, type LLMBackend } from "./types.ts";

interface OllamaGenerateResponse {
  response: string;
  done: boolean;
  model: string;
}

export class OllamaBackend implements LLMBackend {
  readonly name = "ollama";

  constructor(
    readonly model: string,
    private readonly host: string,
    private readonly timeoutMs = 120_000,
  ) {
    if (!host) throw new LLMError("OllamaBackend requires a host");
    if (!model) throw new LLMError("OllamaBackend requires a model");
  }

  async generate(systemPrompt: string, userPrompt: string): Promise<string> {
    const url = new URL("/api/generate", this.host).toString();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          system: systemPrompt,
          prompt: userPrompt,
          stream: false,
          format: "json",
          options: { temperature: 0.1 },
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const body = await res.text();
        throw new LLMError(
          `Ollama returned ${res.status} from ${url}: ${body.slice(0, 200)}`,
        );
      }
      const data = (await res.json()) as OllamaGenerateResponse;
      if (!data.done || !data.response) {
        throw new LLMError(
          `Ollama response incomplete: done=${data.done}, response=${data.response ? "present" : "missing"}`,
        );
      }
      return data.response;
    } catch (err) {
      if (err instanceof LLMError) throw err;
      if (err instanceof Error && err.name === "AbortError") {
        throw new LLMError(
          `Ollama request timed out after ${this.timeoutMs}ms. ` +
            `Is the daemon running at ${this.host}?`,
          err,
        );
      }
      throw new LLMError(`Ollama call failed: ${String(err)}`, err);
    } finally {
      clearTimeout(timer);
    }
  }
}
