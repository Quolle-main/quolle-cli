import type { Ctx } from "../index.js";
import { Client } from "../client.js";
import { configPath, readConfig, resolveAuth, writeConfig, DEFAULT_BASE_URL } from "../config.js";
import { c, fail, info, ok, printJson } from "../output.js";
import { question, secret } from "../prompt.js";

function maskKey(key: string): string {
  if (key.length <= 10) return "•".repeat(key.length);
  return `${key.slice(0, 6)}…${key.slice(-4)}`;
}

/** `quolle login` — paste an API key, validate it, and store it. */
export async function runLogin(ctx: Ctx): Promise<void> {
  let key = typeof ctx.flags["api-key"] === "string" ? (ctx.flags["api-key"] as string) : "";
  if (!key) {
    key = (await secret(`Paste your Quolle API key (${c.dim("qle_…")}): `)).trim();
  }
  if (!key) {
    fail("No API key entered.");
    process.exit(1);
  }
  if (!key.startsWith("qle_")) {
    info(c.yellow(`! That doesn't look like a Quolle key (expected a "qle_" prefix). Trying anyway…`));
  }

  const baseUrl = ctx.baseUrl;
  const client = new Client(key, baseUrl);
  try {
    const usage = await client.request<any>({ path: "/v1/usage" });
    const cfg = readConfig();
    cfg.apiKey = key;
    if (baseUrl !== DEFAULT_BASE_URL) cfg.baseUrl = baseUrl;
    writeConfig(cfg);
    ok(`Logged in. Key ${c.cyan(maskKey(key))} saved to ${c.dim(configPath())}`);
    const plan = usage?.plan?.name ?? "—";
    info(c.dim(`Plan: ${plan}`));
  } catch (err) {
    fail(`Could not validate that key: ${(err as Error).message}`);
    process.exit(1);
  }
}

/** `quolle logout` — remove the stored key. */
export async function runLogout(): Promise<void> {
  const cfg = readConfig();
  if (!cfg.apiKey) {
    info("No stored API key to remove.");
    return;
  }
  delete cfg.apiKey;
  writeConfig(cfg);
  ok("Logged out. Stored API key removed.");
}

/** `quolle whoami` — show the account the current key belongs to. */
export async function runWhoami(ctx: Ctx): Promise<void> {
  const client = ctx.client();
  const usage = await client.request<any>({ path: "/v1/usage" });
  if (ctx.json) {
    printJson(usage);
    return;
  }
  // GET /v1/usage → { current: { sent, limit, month, byBillingPeriod, … }, plan: { name } }.
  // This read usage.usage.sent, which the API has never returned, so it always printed "—".
  const plan = usage?.plan?.name ?? "—";
  const sent = usage?.current?.sent ?? "—";
  const limit = usage?.current?.limit;
  const period = usage?.current?.byBillingPeriod ? "This period" : "This month";
  const resolved = resolveAuth({});
  info(`${c.bold("Account")}`);
  info(`  Base URL    ${ctx.baseUrl}`);
  info(`  Key source  ${resolved.source}`);
  info(`  Plan        ${plan}`);
  info(`  ${period.padEnd(11)} ${sent}${limit != null ? ` / ${limit}` : " (no limit)"} sent`);
}

/** `quolle config get|set|path`. */
export async function runConfig(ctx: Ctx): Promise<void> {
  const sub = ctx.args[0];

  if (sub === "path") {
    info(configPath());
    return;
  }

  if (sub === "get") {
    const cfg = readConfig();
    const view = { ...cfg, apiKey: cfg.apiKey ? maskKey(cfg.apiKey) : undefined };
    if (ctx.json) {
      printJson(view);
      return;
    }
    info(`${c.bold("Stored config")} ${c.dim(`(${configPath()})`)}`);
    info(`  api-key   ${view.apiKey ?? c.dim("(unset)")}`);
    info(`  base-url  ${cfg.baseUrl ?? c.dim(`(default) ${DEFAULT_BASE_URL}`)}`);
    return;
  }

  if (sub === "set") {
    const key = ctx.args[1];
    let value = ctx.args[2];
    if (!key) {
      fail("Usage: quolle config set <api-key|base-url> <value>");
      process.exit(1);
    }
    const cfg = readConfig();
    if (key === "api-key") {
      if (!value) value = await secret(`API key (${c.dim("qle_…")}): `);
      cfg.apiKey = value;
    } else if (key === "base-url") {
      if (!value) value = await question("Base URL: ");
      cfg.baseUrl = value.replace(/\/+$/, "");
    } else {
      fail(`Unknown setting "${key}". Valid keys: api-key, base-url.`);
      process.exit(1);
    }
    writeConfig(cfg);
    ok(`Saved ${c.cyan(key)}.`);
    return;
  }

  fail("Usage: quolle config <get|set|path>");
  process.exit(1);
}
