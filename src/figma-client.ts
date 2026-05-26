// Minimal Figma REST API client.
//
// Scope (M2): GET /v1/files/:key only. Other endpoints land as needed.
//
// Rate limit posture (see ADR-0003):
//   - Figma documents per-minute, tier+plan-dependent limits, with a 429
//     response carrying a Retry-After (seconds) header on overflow.
//     https://developers.figma.com/docs/rest-api/rate-limits/
//   - We enforce a conservative client-side floor of 1 request per 3 seconds
//     (≈ 20/min upper bound for Tier 1 Dev seats). On 429 we honour
//     Retry-After with exponential fallback if the header is missing.
//   - No third-party throttle library (built-in async queue keeps the
//     supply-chain surface minimal).

const FIGMA_API = "https://api.figma.com";
const DEFAULT_MIN_INTERVAL_MS = 3_000;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BACKOFF_MS = 5_000;

export interface FigmaClientOptions {
  /** Minimum milliseconds between requests (default 3000). */
  minIntervalMs?: number;
  /** Max retries on 429 (default 3). Set to 0 for free-tier verify (1 call max). */
  maxRetries?: number;
}

export class FigmaApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: string,
  ) {
    super(message);
    this.name = "FigmaApiError";
  }
}

export class FigmaRateLimitError extends FigmaApiError {
  constructor(body: string, public readonly retryAfterSeconds: number) {
    super(
      `Figma API rate limit hit; retry after ${retryAfterSeconds}s`,
      429,
      body,
    );
    this.name = "FigmaRateLimitError";
  }
}

// Accepts:
//   abcDEF123        (raw fileKey)
//   https://www.figma.com/file/abcDEF123/Some-Name?...
//   https://www.figma.com/design/abcDEF123/Some-Name
//   https://www.figma.com/community/file/abcDEF123/Some-Name
export function parseFileKey(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("fileKey is empty");

  if (!trimmed.includes("/") && !trimmed.includes(":")) {
    // looks like a bare key
    if (!/^[A-Za-z0-9]+$/.test(trimmed)) {
      throw new Error(`fileKey contains invalid characters: ${trimmed}`);
    }
    return trimmed;
  }

  const m = trimmed.match(
    /figma\.com\/(?:community\/)?(?:file|design)\/([A-Za-z0-9]+)/,
  );
  if (!m) throw new Error(`Could not extract fileKey from: ${trimmed}`);
  return m[1];
}

export class FigmaClient {
  private lastRequestAt = 0;
  private inFlight: Promise<void> = Promise.resolve();
  private readonly minIntervalMs: number;
  private readonly maxRetries: number;

  constructor(
    private readonly token: string,
    opts: FigmaClientOptions = {},
  ) {
    if (!token) throw new Error("FigmaClient requires a token");
    this.minIntervalMs = opts.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS;
    this.maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES;
  }

  /** Serialised throttle: every request waits minIntervalMs after the previous start. */
  private async throttle(): Promise<void> {
    const prior = this.inFlight;
    let release: () => void = () => {};
    this.inFlight = new Promise((r) => {
      release = r;
    });
    await prior;
    const wait = this.minIntervalMs - (Date.now() - this.lastRequestAt);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    this.lastRequestAt = Date.now();
    release();
  }

  async getFile(fileKey: string, depth?: number): Promise<unknown> {
    const key = parseFileKey(fileKey);
    const url = new URL(`/v1/files/${encodeURIComponent(key)}`, FIGMA_API);
    if (depth !== undefined) url.searchParams.set("depth", String(depth));

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      await this.throttle();
      const res = await fetch(url, {
        headers: { "X-Figma-Token": this.token },
      });

      if (res.ok) return await res.json();

      const body = await res.text();
      if (res.status === 429) {
        const retryAfter = Number(res.headers.get("Retry-After")) || 0;
        const waitMs =
          retryAfter > 0
            ? retryAfter * 1000
            : DEFAULT_BACKOFF_MS * Math.pow(2, attempt);
        if (attempt === this.maxRetries) {
          throw new FigmaRateLimitError(body, Math.ceil(waitMs / 1000));
        }
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
      if (res.status === 401) {
        throw new FigmaApiError(
          "Figma rejected the token (401). Regenerate FIGMA_TOKEN and check scope `file_content:read`.",
          401,
          body,
        );
      }
      if (res.status === 403) {
        throw new FigmaApiError(
          `Figma returned 403 on ${key}. The token's scope or the file's visibility does not allow read.`,
          403,
          body,
        );
      }
      if (res.status === 404) {
        throw new FigmaApiError(
          `Figma file not found: ${key}. Check the URL or fileKey.`,
          404,
          body,
        );
      }
      throw new FigmaApiError(
        `Unexpected Figma API status ${res.status} for ${key}`,
        res.status,
        body,
      );
    }
    // unreachable
    throw new Error("getFile: retry loop exited unexpectedly");
  }
}

/** Summarise a fetched file into a compact node-tree payload. */
export interface NodeSummary {
  id: string;
  name: string;
  type: string;
  children?: NodeSummary[];
}

interface RawFigmaNode {
  id: string;
  name: string;
  type: string;
  children?: RawFigmaNode[];
}

interface RawFigmaFileResponse {
  name: string;
  lastModified?: string;
  document?: RawFigmaNode;
}

export function summariseNodes(raw: unknown, maxDepth = 4): {
  fileName: string;
  lastModified: string | undefined;
  root: NodeSummary | null;
} {
  if (!raw || typeof raw !== "object") {
    return { fileName: "<unknown>", lastModified: undefined, root: null };
  }
  const file = raw as RawFigmaFileResponse;
  const walk = (node: RawFigmaNode, depth: number): NodeSummary => {
    const summary: NodeSummary = {
      id: node.id,
      name: node.name,
      type: node.type,
    };
    if (node.children && depth < maxDepth) {
      summary.children = node.children.map((c) => walk(c, depth + 1));
    }
    return summary;
  };
  return {
    fileName: file.name ?? "<unknown>",
    lastModified: file.lastModified,
    root: file.document ? walk(file.document, 0) : null,
  };
}
