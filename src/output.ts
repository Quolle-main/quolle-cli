// Tiny, dependency-free output helpers: ANSI colors (auto-disabled when not a
// TTY or NO_COLOR is set) and a simple aligned table.

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;

function wrap(code: number, s: string): string {
  return useColor ? `\x1b[${code}m${s}\x1b[0m` : s;
}

export const c = {
  bold: (s: string) => wrap(1, s),
  dim: (s: string) => wrap(2, s),
  red: (s: string) => wrap(31, s),
  green: (s: string) => wrap(32, s),
  yellow: (s: string) => wrap(33, s),
  blue: (s: string) => wrap(34, s),
  cyan: (s: string) => wrap(36, s),
  gray: (s: string) => wrap(90, s),
};

export function ok(msg: string): void {
  console.log(`${c.green("✓")} ${msg}`);
}

export function info(msg: string): void {
  console.log(msg);
}

export function warn(msg: string): void {
  console.error(`${c.yellow("!")} ${msg}`);
}

export function fail(msg: string): void {
  console.error(`${c.red("✗")} ${msg}`);
}

/** Colorize a delivery/domain status token. */
export function statusColor(status: string): string {
  const s = status.toLowerCase();
  if (["delivered", "sent", "verified", "active"].includes(s)) return c.green(status);
  if (["queued", "sending", "scheduled", "pending", "verifying"].includes(s)) return c.yellow(status);
  if (["bounced", "failed", "complained", "cancelled", "unverified", "error"].includes(s))
    return c.red(status);
  return status;
}

export function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

/** Render an array of objects as an aligned, colored table. */
export function table(rows: Array<Record<string, string>>, columns: string[]): void {
  if (rows.length === 0) {
    console.log(c.dim("(none)"));
    return;
  }
  const widths = columns.map((col) =>
    Math.max(col.length, ...rows.map((r) => stripAnsi(r[col] ?? "").length)),
  );
  const header = columns.map((col, i) => c.dim(col.toUpperCase().padEnd(widths[i]))).join("  ");
  console.log(header);
  for (const r of rows) {
    console.log(
      columns
        .map((col, i) => {
          const cell = r[col] ?? "";
          return cell + " ".repeat(Math.max(0, widths[i] - stripAnsi(cell).length));
        })
        .join("  "),
    );
  }
}

function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}
