# Quolle CLI

Official command-line interface for the [Quolle](https://quolle.com) email API.
Send transactional email, manage sending domains, and inspect your logs without
leaving the terminal.

## Install

```bash
npm install -g quolle
```

Or run it without installing:

```bash
npx quolle --help
```

Requires Node.js 20+.

## Authenticate

Save your API key once — it's stored in `~/.quolle/config.json` (mode `600`):

```bash
quolle login          # paste your qle_… key when prompted
quolle whoami         # confirm which account the key belongs to
```

In CI, skip `login` and set the key in the environment instead:

```bash
export QUOLLE_API_KEY=qle_live_...
quolle send --from hi@mail.acme.com --to you@example.com --subject Hi --html "<p>Hi</p>"
```

Resolution order for the key and base URL: `--api-key` / `--base-url` flags →
`QUOLLE_API_KEY` / `QUOLLE_BASE_URL` env vars → stored config → default
(`https://api.quolle.com`).

## Send email

```bash
# Simplest
quolle send \
  --from "Acme <hi@mail.acme.com>" \
  --to customer@example.com \
  --subject "Welcome!" \
  --html "<h1>Thanks for signing up</h1>"

# Body from a file, multiple recipients
quolle send --from hi@mail.acme.com \
  --to a@example.com --to b@example.com \
  --subject "Announcement" --html-file ./newsletter.html

# Template with variables
quolle send --from hi@mail.acme.com --to customer@example.com \
  --template welcome-email --var firstName=Amaka --var planName=Starter

# Schedule for later + safe retries
quolle send --from hi@mail.acme.com --to customer@example.com \
  --subject "Your weekly digest" --html-file ./digest.html \
  --schedule 2026-12-25T09:00:00Z --idempotency-key digest_2026_w52

# Attach files (repeatable; up to 20, 10 MB total)
quolle send --from hi@mail.acme.com --to customer@example.com \
  --subject "Your invoice" --html "<p>Attached.</p>" \
  --attach ./invoice.pdf --attach ./terms.pdf
```

| Option | Description |
|---|---|
| `--from` | Sender address; supports `Name <addr>`. **Required.** |
| `--to` | Recipient; repeat or comma-separate for many. **Required.** |
| `--subject` | Subject line (required with `--html`). |
| `--html` / `--html-file` | HTML body, inline or from a file. |
| `--text` | Plain-text body. |
| `--template` | Saved template slug (instead of `--html`). |
| `--var key=value` | Template variable (repeatable). |
| `--reply-to` | Reply-To address. |
| `--schedule` | ISO 8601 time to send later. |
| `--idempotency-key` | Safe-retry key — never sends twice. |

## Inspect email

```bash
quolle emails list --status delivered --limit 20
quolle emails list --recipient customer@example.com
quolle emails get em_abc123
quolle emails cancel em_abc123        # only while status == scheduled
```

## Manage domains

```bash
quolle domains list
quolle domains add mail.acme.com      # prints the DNS records to add
quolle domains records dm_abc123      # show them again anytime
quolle domains verify dm_abc123       # re-check DNS + verification status
quolle domains rm dm_abc123
```

## Config

```bash
quolle config get                     # show stored settings (key is masked)
quolle config set base-url https://api.quolle.com
quolle config path                    # print the config file location
quolle logout                         # remove the stored key
```

## Global flags

| Flag | Description |
|---|---|
| `--json` | Print raw JSON instead of formatted output (great for scripting with `jq`). |
| `--api-key <key>` | Override the API key for one command. |
| `--base-url <url>` | Override the API base URL. |
| `-h, --help` | Show help. |
| `-v, --version` | Show version. |

Set `NO_COLOR=1` to disable colored output.

## Scripting

Every command supports `--json`, so the CLI composes with `jq`:

```bash
quolle emails list --status bounced --json | jq -r '.data[].to'
quolle domains list --json | jq -r '.domains[] | select(.status!="verified") | .domain'
```

Commands exit non-zero on failure, so they're safe to use in shell scripts and CI.

## License

MIT
