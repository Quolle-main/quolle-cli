import type { Ctx } from "../index.js";
import { c, fail, info, ok, printJson, statusColor, table } from "../output.js";

function short(id: string): string {
  return id.length > 10 ? id.slice(0, 8) : id;
}

function truncate(s: string, n: number): string {
  if (!s) return "";
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function fmtDate(d?: string): string {
  if (!d) return "—";
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? d : dt.toISOString().replace("T", " ").slice(0, 16);
}

export async function runEmails(ctx: Ctx): Promise<void> {
  const sub = ctx.args[0];
  switch (sub) {
    case "get":
      return getEmail(ctx);
    case "cancel":
      return cancelEmail(ctx);
    case "list":
    case "ls":
      return listEmails(ctx);
    default:
      fail("Usage: quolle emails <get|cancel|list> [id]");
      process.exit(1);
  }
}

async function getEmail(ctx: Ctx): Promise<void> {
  const id = ctx.args[1];
  if (!id) {
    fail("Usage: quolle emails get <id>");
    process.exit(1);
  }
  const res = await ctx.client().request<any>({ path: `/v1/emails/${encodeURIComponent(id)}` });
  const email = res?.email ?? res;
  if (ctx.json) return printJson(email);

  info(`${c.bold("Email")} ${c.dim(email.id)}`);
  row("Status", statusColor(String(email.status ?? "—")));
  row("From", email.from ?? "—");
  row("To", Array.isArray(email.to) ? email.to.join(", ") : email.to ?? "—");
  row("Subject", email.subject ?? "—");
  row("Domain", email.domain?.domain ?? "—");
  if (email.scheduledAt) row("Scheduled", fmtDate(email.scheduledAt));
  row("Created", fmtDate(email.createdAt));
  if (email.opensCount != null) row("Opens", String(email.opensCount));
  if (email.clicksCount != null) row("Clicks", String(email.clicksCount));
  if (email.errorMessage) row("Error", c.red(email.errorMessage));
}

async function cancelEmail(ctx: Ctx): Promise<void> {
  const id = ctx.args[1];
  if (!id) {
    fail("Usage: quolle emails cancel <id>");
    process.exit(1);
  }
  const res = await ctx
    .client()
    .request<any>({ method: "DELETE", path: `/v1/emails/${encodeURIComponent(id)}/cancel` });
  if (ctx.json) return printJson(res);
  ok(`Cancelled scheduled email ${c.cyan(short(id))}.`);
}

async function listEmails(ctx: Ctx): Promise<void> {
  const f = ctx.flags;
  const query: Record<string, string | number | undefined> = {
    status: typeof f.status === "string" ? f.status : undefined,
    recipient: typeof f.recipient === "string" ? f.recipient : undefined,
    domain: typeof f.domain === "string" ? f.domain : undefined,
    limit: typeof f.limit === "string" ? f.limit : "20",
    page: typeof f.page === "string" ? f.page : undefined,
  };
  const res = await ctx.client().request<any>({ path: "/v1/logs", query });
  if (ctx.json) return printJson(res);

  const data: any[] = res?.data ?? [];
  const rows = data.map((e) => ({
    id: c.dim(short(e.id)),
    to: truncate(Array.isArray(e.to) ? e.to.join(",") : String(e.to ?? ""), 28),
    subject: truncate(String(e.subject ?? ""), 32),
    status: statusColor(String(e.status ?? "")),
    created: fmtDate(e.createdAt),
  }));
  table(rows, ["id", "to", "subject", "status", "created"]);
  const p = res?.pagination;
  if (p) info(c.dim(`\nPage ${p.page}/${p.pages} · ${p.total} total`));
}

function row(label: string, value: string): void {
  info(`  ${label.padEnd(10)} ${value}`);
}
