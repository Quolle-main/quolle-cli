# Changelog

All notable changes to this package. Versions follow [Semantic Versioning](https://semver.org).

## 1.0.0 — 2026-10-29

First public release, as `@quolle/cli` (the command is still `quolle`).

- `quolle send`, `quolle emails`, `quolle domains`, and `login` / `logout` / `whoami` / `config` for storing a key.
- Rate limits are retried; quota limits (`daily_quota_exceeded`, `warmup_limit_exceeded`) and long `Retry-After`s are reported at once.
- Requires Node.js 20+.
