import { readFileSync } from "node:fs";
import { basename, extname } from "node:path";
import type { Ctx } from "../index.js";
import { c, fail, info, ok, printJson } from "../output.js";

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

// Minimal extension → MIME map (the CLI is dependency-free). Unknown → octet-stream.
const MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".csv": "text/csv",
  ".txt": "text/plain",
  ".html": "text/html",
  ".json": "application/json",
  ".zip": "application/zip",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".ics": "text/calendar",
};

function readAttachment(path: string): { filename: string; content: string; contentType: string } {
  const buf = readFileSync(path);
  const name = basename(path);
  return {
    filename: name,
    content: buf.toString("base64"),
    contentType: MIME[extname(name).toLowerCase()] ?? "application/octet-stream",
  };
}

/** `quolle send` — send one email (transactional by default). */
export async function runSend(ctx: Ctx): Promise<void> {
  const f = ctx.flags;

  const from = str(f.from);
  const toFlag = f.to;
  const to = Array.isArray(toFlag)
    ? toFlag
    : typeof toFlag === "string"
      ? toFlag.split(",").map((s) => s.trim()).filter(Boolean)
      : [];

  if (!from) return usage("--from is required");
  if (to.length === 0) return usage("--to is required (repeat --to or comma-separate)");

  // Body: html string, html from file, or a template slug.
  let html = str(f.html);
  const htmlFile = str(f["html-file"]);
  if (htmlFile) {
    try {
      html = readFileSync(htmlFile, "utf8");
    } catch (err) {
      fail(`Could not read --html-file: ${(err as Error).message}`);
      process.exit(1);
    }
  }
  const template = str(f.template);
  const subject = str(f.subject);
  const text = str(f.text);
  const replyTo = str(f["reply-to"]);
  const scheduledAt = str(f.schedule) ?? str(f["scheduled-at"]);
  const idempotencyKey = str(f["idempotency-key"]);
  const type = str(f.type);
  if (type && type !== "transactional" && type !== "marketing")
    return usage('--type must be "transactional" or "marketing"');

  if (!html && !template) return usage("provide --html, --html-file, or --template");
  if (html && template) return usage("use either --html/--html-file or --template, not both");
  if (html && !subject) return usage("--subject is required when sending html");

  // Template variables: --var key=value (repeatable).
  let variables: Record<string, string> | undefined;
  const varFlag = f.var;
  if (varFlag) {
    const pairs = Array.isArray(varFlag) ? varFlag : [varFlag as string];
    variables = {};
    for (const p of pairs) {
      const eq = p.indexOf("=");
      if (eq === -1) return usage(`--var must be key=value (got "${p}")`);
      variables[p.slice(0, eq)] = p.slice(eq + 1);
    }
  }

  // Attachments: --attach <path> (repeatable). Read + base64-encode each file.
  let attachments: Array<{ filename: string; content: string; contentType: string }> | undefined;
  const attachFlag = f.attach;
  if (attachFlag) {
    const paths = Array.isArray(attachFlag) ? attachFlag : [attachFlag as string];
    try {
      attachments = paths.map(readAttachment);
    } catch (err) {
      fail(`Could not read attachment: ${(err as Error).message}`);
      process.exit(1);
    }
  }

  const payload: Record<string, unknown> = {
    from,
    to: to.length === 1 ? to[0] : to,
  };
  if (subject) payload.subject = subject;
  if (html) payload.html = html;
  if (text) payload.text = text;
  if (template) payload.template = template;
  if (variables) payload.variables = variables;
  if (replyTo) payload.replyTo = replyTo;
  if (scheduledAt) payload.scheduledAt = scheduledAt;
  if (attachments) payload.attachments = attachments;
  if (type) payload.type = type;

  const client = ctx.client();
  const res = await client.request<any>({
    method: "POST",
    path: "/v1/emails/send",
    body: payload,
    headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined,
  });

  if (ctx.json) {
    printJson(res);
    return;
  }
  const id = res?.id ?? res?.email?.id ?? "(unknown id)";
  if (scheduledAt) ok(`Scheduled for ${c.cyan(scheduledAt)} — id ${c.cyan(id)}`);
  else ok(`Queued — id ${c.cyan(id)}`);
  info(c.dim(`Track it:  quolle emails get ${id}`));
}

function usage(msg: string): never {
  fail(msg);
  info("");
  info(`${c.bold("Usage")}: quolle send --from <addr> --to <addr> [--subject <s>] \\`);
  info(`         (--html <h> | --html-file <path> | --template <slug>)`);
  info("");
  info("Options:");
  info("  --from <addr>            Sender, e.g. \"Acme <hi@mail.acme.com>\"  (required)");
  info("  --to <addr>              Recipient; repeat or comma-separate for many  (required)");
  info("  --subject <text>         Subject line (required with --html)");
  info("  --html <markup>          HTML body");
  info("  --html-file <path>       Read the HTML body from a file");
  info("  --text <text>            Plain-text body");
  info("  --template <slug>        Saved template slug (instead of --html)");
  info("  --var key=value          Template variable (repeatable)");
  info("  --reply-to <addr>        Reply-To address");
  info("  --attach <path>          Attach a file (repeatable; up to 20, 10 MB total)");
  info("  --schedule <iso8601>     Send later, e.g. 2026-12-25T09:00:00Z");
  info("  --type <stream>          transactional (default) or marketing (adds unsubscribe headers)");
  info("  --idempotency-key <key>  Safe-retry key (never sends twice)");
  process.exit(1);
}
