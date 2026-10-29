import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from "node:fs";

export const DEFAULT_BASE_URL = "https://api.quolle.com";

export interface StoredConfig {
  apiKey?: string;
  baseUrl?: string;
}

const CONFIG_DIR = join(homedir(), ".quolle");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");

export function configPath(): string {
  return CONFIG_PATH;
}

export function readConfig(): StoredConfig {
  try {
    if (!existsSync(CONFIG_PATH)) return {};
    const raw = readFileSync(CONFIG_PATH, "utf8");
    return raw ? (JSON.parse(raw) as StoredConfig) : {};
  } catch {
    return {};
  }
}

export function writeConfig(cfg: StoredConfig): void {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2) + "\n", { mode: 0o600 });
  // Tighten perms in case the file already existed with looser ones — it holds an API key.
  try {
    chmodSync(CONFIG_PATH, 0o600);
  } catch {
    /* best effort (e.g. Windows) */
  }
}

/**
 * Resolve the effective API key and base URL. Precedence (highest first):
 *   1. explicit CLI flag (--api-key / --base-url)
 *   2. environment variable (QUOLLE_API_KEY / QUOLLE_BASE_URL)
 *   3. stored config file (~/.quolle/config.json)
 *   4. built-in default (base URL only)
 */
export function resolveAuth(flags: { apiKey?: string; baseUrl?: string }): {
  apiKey?: string;
  baseUrl: string;
  source: "flag" | "env" | "config" | "none";
} {
  const stored = readConfig();

  let apiKey: string | undefined;
  let source: "flag" | "env" | "config" | "none" = "none";
  if (flags.apiKey) {
    apiKey = flags.apiKey;
    source = "flag";
  } else if (process.env.QUOLLE_API_KEY) {
    apiKey = process.env.QUOLLE_API_KEY;
    source = "env";
  } else if (stored.apiKey) {
    apiKey = stored.apiKey;
    source = "config";
  }

  const baseUrl = (
    flags.baseUrl ||
    process.env.QUOLLE_BASE_URL ||
    stored.baseUrl ||
    DEFAULT_BASE_URL
  ).replace(/\/+$/, "");

  return { apiKey, baseUrl, source };
}
