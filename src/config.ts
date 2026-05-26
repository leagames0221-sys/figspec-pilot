// Centralised env access. Fails fast at startup if required values are missing
// so that the server never hands a malformed request to the Figma API.

export interface Config {
  /** Personal access token for the Figma REST API.
   *  Optional at startup so the LLM-only entry points (`npm run demo`,
   *  `npm run test:unit`, EARS extractor) work without it. Required only
   *  when an actual Figma fetch happens — `requireFigmaToken()` enforces
   *  that at the call site with a clear error. */
  figmaToken: string | undefined;
  backend: "ollama";
  ollamaHost: string;
  ollamaModel: string;
  figmaMaxRetries: number;
  figmaMinIntervalMs: number;
}

class MissingEnvError extends Error {
  constructor(name: string) {
    super(
      `Missing required env var ${name}. Copy .env.example to .env and set it; ` +
        `run the server with \`tsx --env-file=.env src/server.ts\`.`,
    );
    this.name = "MissingEnvError";
  }
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === "") throw new MissingEnvError(name);
  return v.trim();
}

function optionalEnv(name: string, fallback: string): string {
  const v = process.env[name];
  return v && v.trim() !== "" ? v.trim() : fallback;
}

export function loadConfig(): Config {
  const maxRetries = Number(optionalEnv("FIGMA_MAX_RETRIES", "3"));
  const minInterval = Number(optionalEnv("FIGMA_MIN_INTERVAL_MS", "3000"));
  if (!Number.isInteger(maxRetries) || maxRetries < 0) {
    throw new Error(`FIGMA_MAX_RETRIES must be a non-negative integer`);
  }
  if (!Number.isFinite(minInterval) || minInterval < 0) {
    throw new Error(`FIGMA_MIN_INTERVAL_MS must be a non-negative number`);
  }
  const rawToken = process.env.FIGMA_TOKEN;
  const figmaToken = rawToken && rawToken.trim() !== "" ? rawToken.trim() : undefined;
  return {
    figmaToken,
    backend: "ollama",
    ollamaHost: optionalEnv("OLLAMA_HOST", "http://127.0.0.1:11434"),
    ollamaModel: optionalEnv("OLLAMA_MODEL", "gemma3:4b"),
    figmaMaxRetries: maxRetries,
    figmaMinIntervalMs: minInterval,
  };
}

/** Enforce FIGMA_TOKEN at the call site that actually needs it.
 *  Called by `server.ts` before constructing FigmaClient and by
 *  `verify-server.ts` before the single real Figma fetch. */
export function requireFigmaToken(config: Config): string {
  if (!config.figmaToken) {
    throw new MissingEnvError("FIGMA_TOKEN");
  }
  return config.figmaToken;
}
