// Minimal authenticated HTTP client for the Quolle API with retry-with-backoff,
// matching the semantics of the language SDKs (retry 429 except quota limits; retry 5xx /
// network only for idempotent methods or when an Idempotency-Key is present).

export const VERSION = "1.0.1";

export class QuolleCliError extends Error {
  statusCode: number;
  data: unknown;
  /** The API's machine-readable error code, e.g. "validation_error". */
  code?: string;
  constructor(message: string, statusCode: number, data: unknown, code?: string) {
    super(message);
    this.name = "QuolleCliError";
    this.statusCode = statusCode;
    this.data = data;
    this.code = code;
  }
}

export interface RequestOptions {
  method?: string;
  path: string;
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  headers?: Record<string, string>;
  maxRetries?: number;
}

export class Client {
  constructor(
    private apiKey: string,
    private baseUrl: string,
  ) {}

  async request<T = any>(opts: RequestOptions): Promise<T> {
    const method = opts.method ?? "GET";
    const maxRetries = opts.maxRetries ?? 3;
    const url = this.buildUrl(opts.path, opts.query);
    const idempotent =
      method === "GET" ||
      method === "DELETE" ||
      Boolean(opts.headers && opts.headers["Idempotency-Key"]);

    let attempt = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      let res: Response;
      try {
        res = await fetch(url, {
          method,
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
            "User-Agent": `quolle-cli/${VERSION}`,
            ...(opts.headers ?? {}),
          },
          body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        });
      } catch (err) {
        // Network error — retry if safe.
        if (idempotent && attempt < maxRetries) {
          await sleep(backoffMs(attempt));
          attempt++;
          continue;
        }
        throw new QuolleCliError(`Network error: ${(err as Error).message}`, 0, null);
      }

      const text = await res.text();
      let data: any = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = { raw: text };
      }

      // Retry a 429 (never processed) unless it is a quota that resets at a
      // fixed time, and a 5xx only when the request is safe to repeat. A
      // Retry-After over a minute means "not soon": report it, don't wait.
      const code = data && typeof data.code === "string" ? data.code : "";
      const retryable =
        (res.status === 429 && !NO_RETRY_CODES.has(code)) || (res.status >= 500 && idempotent);
      const retryAfter = parseRetryAfter(res.headers.get("retry-after"));
      if (retryable && attempt < maxRetries && (retryAfter === null || retryAfter <= MAX_RETRY_WAIT_MS)) {
        await sleep(retryAfter ?? backoffMs(attempt));
        attempt++;
        continue;
      }

      if (res.ok && data && typeof data === "object" && "raw" in data && Object.keys(data).length === 1) {
        throw new QuolleCliError("Unexpected non-JSON response from the Quolle API", res.status, data);
      }
      if (!res.ok) {
        const message =
          (data && (data.error || data.message)) || `Request failed with status ${res.status}`;
        throw new QuolleCliError(
          String(message),
          res.status,
          data,
          data && typeof data.code === "string" ? data.code : undefined,
        );
      }
      return data as T;
    }
  }

  private buildUrl(path: string, query?: Record<string, string | number | undefined>): string {
    const u = new URL(this.baseUrl + path);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== "") u.searchParams.set(k, String(v));
      }
    }
    return u.toString();
  }
}

// 429s that retrying can't fix: they reset at midnight UTC or the next period.
const NO_RETRY_CODES = new Set(["daily_quota_exceeded", "warmup_limit_exceeded", "monthly_quota_exceeded"]);
const MAX_RETRY_WAIT_MS = 60_000;

function backoffMs(attempt: number): number {
  const base = Math.min(500 * 2 ** attempt, 8000); // 0.5s, 1s, 2s, … cap 8s
  return base + Math.floor(Math.random() * 250); // jitter
}

function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const secs = Number(header);
  if (!Number.isNaN(secs)) return Math.max(0, secs * 1000);
  const when = Date.parse(header);
  if (!Number.isNaN(when)) return Math.max(0, when - Date.now());
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
