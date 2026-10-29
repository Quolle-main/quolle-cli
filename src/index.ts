#!/usr/bin/env node
import { Client, QuolleCliError, VERSION } from "./client.js";
import { resolveAuth } from "./config.js";
import { c, fail } from "./output.js";
import { runConfig, runLogin, runLogout, runWhoami } from "./commands/config.js";
import { runSend } from "./commands/send.js";
import { runEmails } from "./commands/emails.js";
import { runDomains } from "./commands/domains.js";

export interface Flags {
  [key: string]: string | string[] | boolean | undefined;
}

export interface Ctx {
  args: string[]; // positional args after the command/subcommand
  flags: Flags;
  json: boolean;
  /** Build an authenticated client, or exit with a helpful message if no key. */
  client(): Client;
  baseUrl: string;
}

const HELP = `${c.bold("quolle")} — command-line interface for the Quolle email API

${c.bold("USAGE")}
  quolle <command> [options]

${c.bold("COMMANDS")}
  send                    Send a transactional email
  emails get <id>         Show a single email's status
  emails cancel <id>      Cancel a scheduled email
  emails list             List recent emails
  domains list            List sending domains
  domains add <domain>    Add a sending domain
  domains records <id>    Show the DNS records for a domain
  domains verify <id>     Re-check a domain's DNS/verification status
  domains rm <id>         Remove a domain
  login                   Save your API key (${c.dim("qle_…")})
  logout                  Remove the saved API key
  whoami                  Show the account the current key belongs to
  config <get|set|path>   Manage stored settings

${c.bold("GLOBAL OPTIONS")}
  --api-key <key>   Override the API key for this command
  --base-url <url>  Override the API base URL (default https://api.quolle.com)
  --json            Print raw JSON instead of formatted output
  -h, --help        Show help
  -v, --version     Show version

${c.bold("EXAMPLES")}
  quolle login
  quolle send --from "Acme <hi@mail.acme.com>" --to you@example.com \\
    --subject "Hello" --html "<h1>Hi</h1>"
  quolle send --from hi@mail.acme.com --to you@example.com \\
    --subject "Digest" --html-file ./email.html --schedule 2026-12-25T09:00:00Z
  quolle emails list --status delivered --limit 10
  quolle domains add mail.acme.com

Set ${c.dim("QUOLLE_API_KEY")} in the environment to use the CLI in CI without ${c.dim("login")}.
`;

/** Parse argv into positional args and flags. Repeatable flags become arrays. */
function parseArgs(argv: string[]): { positional: string[]; flags: Flags } {
  const positional: string[] = [];
  const flags: Flags = {};
  // (cc/bcc were listed here but the API has no such fields; they were silently dropped.)
  const repeatable = new Set(["to", "var", "attach"]);
  const booleans = new Set(["json", "help", "h", "version", "v"]);

  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (tok.startsWith("--") || /^-[a-z]$/i.test(tok)) {
      let key = tok.replace(/^--?/, "");
      let value: string | undefined;
      const eq = key.indexOf("=");
      if (eq !== -1) {
        value = key.slice(eq + 1);
        key = key.slice(0, eq);
      }
      if (booleans.has(key)) {
        flags[key] = true;
        continue;
      }
      if (value === undefined) {
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith("--")) {
          value = next;
          i++;
        } else {
          flags[key] = true;
          continue;
        }
      }
      if (repeatable.has(key)) {
        const cur = flags[key];
        flags[key] = Array.isArray(cur) ? [...cur, value] : cur ? [cur as string, value] : [value];
      } else {
        flags[key] = value;
      }
    } else {
      positional.push(tok);
    }
  }
  return { positional, flags };
}

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));

  if (flags.version || flags.v) {
    console.log(VERSION);
    return;
  }

  const command = positional[0];
  const rest = positional.slice(1);

  if (!command || flags.help || flags.h) {
    if (!command) {
      console.log(HELP);
      return;
    }
  }

  const json = flags.json === true;
  const baseUrlFlag = typeof flags["base-url"] === "string" ? (flags["base-url"] as string) : undefined;
  const apiKeyFlag = typeof flags["api-key"] === "string" ? (flags["api-key"] as string) : undefined;
  const resolved = resolveAuth({ apiKey: apiKeyFlag, baseUrl: baseUrlFlag });

  const ctx: Ctx = {
    args: rest,
    flags,
    json,
    baseUrl: resolved.baseUrl,
    client() {
      if (!resolved.apiKey) {
        fail(
          `No API key found. Run ${c.cyan("quolle login")}, set ${c.dim("QUOLLE_API_KEY")}, or pass ${c.dim("--api-key")}.`,
        );
        process.exit(1);
      }
      return new Client(resolved.apiKey, resolved.baseUrl);
    },
  };

  try {
    switch (command) {
      case "send":
        await runSend(ctx);
        break;
      case "emails":
        await runEmails(ctx);
        break;
      case "domains":
        await runDomains(ctx);
        break;
      case "login":
        await runLogin(ctx);
        break;
      case "logout":
        await runLogout();
        break;
      case "whoami":
        await runWhoami(ctx);
        break;
      case "config":
        await runConfig(ctx);
        break;
      case "help":
        console.log(HELP);
        break;
      default:
        fail(`Unknown command: ${command}`);
        console.log(`Run ${c.cyan("quolle --help")} to see available commands.`);
        process.exit(1);
    }
  } catch (err) {
    if (err instanceof QuolleCliError) {
      fail(err.message);
      if (json) console.error(JSON.stringify(err.data, null, 2));
      else if (err.statusCode)
        console.error(c.dim(`(HTTP ${err.statusCode}${err.code ? ` · ${err.code}` : ""})`));
      process.exit(1);
    }
    fail((err as Error).message);
    process.exit(1);
  }
}

main();
