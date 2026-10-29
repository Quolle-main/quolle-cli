import type { Ctx } from "../index.js";
import { c, fail, info, ok, printJson, statusColor, table } from "../output.js";
import { question } from "../prompt.js";

function short(id: string): string {
  return id.length > 10 ? id.slice(0, 8) : id;
}

export async function runDomains(ctx: Ctx): Promise<void> {
  const sub = ctx.args[0];
  switch (sub) {
    case "list":
    case "ls":
      return listDomains(ctx);
    case "add":
      return addDomain(ctx);
    case "records":
    case "dns":
      return showRecords(ctx);
    case "verify":
    case "status":
      return verifyDomain(ctx);
    case "rm":
    case "remove":
    case "delete":
      return removeDomain(ctx);
    default:
      fail("Usage: quolle domains <list|add|records|verify|rm>");
      process.exit(1);
  }
}

async function listDomains(ctx: Ctx): Promise<void> {
  const res = await ctx.client().request<any>({ path: "/v1/domains" });
  if (ctx.json) return printJson(res);
  const domains: any[] = res?.domains ?? [];
  const rows = domains.map((d) => ({
    id: c.dim(short(d.id)),
    domain: d.domain,
    status: statusColor(String(d.status ?? "")),
    dns: d.dnsPublished ? c.green("published") : c.yellow("pending"),
    tracking: d.trackingDomain ? (d.trackingDomainVerified ? c.green(d.trackingDomain) : c.yellow(d.trackingDomain)) : c.dim("—"),
  }));
  table(rows, ["id", "domain", "status", "dns", "tracking"]);
  if (domains.some((d) => d.cloudflareReconnectNeeded))
    info(c.yellow("\n! One or more domains need Cloudflare reconnected for auto-DNS."));
}

async function addDomain(ctx: Ctx): Promise<void> {
  const domain = ctx.args[1];
  if (!domain) {
    fail("Usage: quolle domains add <domain>   e.g. quolle domains add mail.acme.com");
    process.exit(1);
  }
  const res = await ctx.client().request<any>({ method: "POST", path: "/v1/domains", body: { domain } });
  if (ctx.json) return printJson(res);
  ok(`Added ${c.cyan(res?.domain?.domain ?? domain)} — id ${c.cyan(short(res?.domain?.id ?? ""))}`);
  info(c.dim("\nAdd these DNS records at your DNS provider, then run `quolle domains verify <id>`:\n"));
  printRecords(res?.dnsRecords ?? []);
}

async function showRecords(ctx: Ctx): Promise<void> {
  const id = ctx.args[1];
  if (!id) {
    fail("Usage: quolle domains records <id>");
    process.exit(1);
  }
  const res = await ctx.client().request<any>({ path: `/v1/domains/${encodeURIComponent(id)}/records` });
  if (ctx.json) return printJson(res);
  printRecords(res?.dnsRecords ?? []);
}

async function verifyDomain(ctx: Ctx): Promise<void> {
  const id = ctx.args[1];
  if (!id) {
    fail("Usage: quolle domains verify <id>");
    process.exit(1);
  }
  // POST /recheck runs a fresh check (skips the status cache). "verify" used to
  // GET /status, which can return a cached result from before the DNS change.
  const res = await ctx
    .client()
    .request<any>({ method: "POST", path: `/v1/domains/${encodeURIComponent(id)}/recheck` });
  if (ctx.json) return printJson(res);

  info(`${c.bold("Domain")} ${res.domain ?? id}`);
  info(`  Ready       ${res.ready ? c.green("yes — send-ready") : c.yellow("not yet")}`);
  info(`  SES identity ${statusColor(String(res?.sesIdentity?.verificationStatus ?? "—"))}`);
  info(`  DNS records ${res?.dns?.allPublished ? c.green("all published") : c.yellow("some missing")}`);
  const issues: string[] = res?.issues ?? [];
  if (issues.length) {
    info(c.yellow("\n  Outstanding:"));
    for (const i of issues) info(`   • ${i}`);
  }
}

async function removeDomain(ctx: Ctx): Promise<void> {
  const id = ctx.args[1];
  if (!id) {
    fail("Usage: quolle domains rm <id>");
    process.exit(1);
  }
  if (!ctx.flags.yes && ctx.flags.y === undefined) {
    const ans = await question(`Remove domain ${c.cyan(short(id))}? This stops sending from it. [y/N] `);
    if (!/^y(es)?$/i.test(ans)) {
      info("Aborted.");
      return;
    }
  }
  const res = await ctx.client().request<any>({ method: "DELETE", path: `/v1/domains/${encodeURIComponent(id)}` });
  if (ctx.json) return printJson(res);
  ok(res?.message ?? "Domain removed.");
}

function printRecords(records: any[]): void {
  const rows = records.map((r) => ({
    type: r.type,
    name: r.name,
    value: r.priority ? `${r.priority} ${r.value}` : r.value,
    purpose: c.dim(String(r.purpose ?? "")),
  }));
  table(rows, ["type", "name", "value", "purpose"]);
}
