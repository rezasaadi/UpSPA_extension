# UpSPA Windows demo — run feedback

**Environment:** Windows 11 Pro Education (build 26200), PowerShell 5.1, Intel Core Ultra 7 258V, 32 GB RAM.
**Script:** `upspa-setup-and-run.ps1` version 2026-05-30o.
**Toolchain:** GNU Rust toolchain (`-UseGnuToolchain`), self-contained conda-forge PostgreSQL 18.4.

## Outcome

The UpSPA protocol works end-to-end on Windows. The headless driver passed all
7 steps (provision, register, login, secret update, login-after-update,
master-password update, and 2-of-3 resilience) on a clean run. WASM build, Go
storage-provider build, all three SP instances, and the login server all came up
healthy.

Three issues surfaced during setup. Two are real bugs worth fixing; one is a
usage note.

## Issue 1 — PostgreSQL start times out on a churned cluster (real)

On repeated runs, the background `pg_ctl start` (launched with `-WindowStyle
Hidden`) failed to produce a server within the 60s readiness window, and no
`postgres.log` was written at all — i.e. the postmaster never reached the point
of opening its log. Running `postgres.exe` in the foreground with the same data
dir showed the server actually starts fine, but has to replay WAL recovery
("database system was not properly shut down; automatic recovery in progress")
because earlier runs were stopped with `-m immediate`. That recovery, combined
with the hidden launch, ate into the 60s budget and the poll timed out — which
left the cluster dirty again, making the next run's recovery longer. A
self-reinforcing loop.

Workaround that fixed it: start the server once in the foreground, let recovery
complete, then re-run the script (it detects the live server on 5432 and reuses
it).

Suggested fix: on a timeout, the script could surface the recovery state, and/or
the cluster should be stopped with `-m fast` (clean shutdown) rather than
`-m immediate` so subsequent starts don't pay the recovery cost.

## Issue 2 — Headless driver is not idempotent (real)

Re-running the demo against non-empty databases fails 5 of 6 protocol steps
(`setup / provision SPs` passes; `register`, `login`, and everything after fail).

Root cause: the driver uses a fixed identity (`account=alice`, master password
`test-password`) and its sequence includes a master-password rotation to
`new-password`, which it leaves persisted. On a second run:
- `register` fails — alice already exists.
- `login` with `test-password` fails — the password was rotated to
  `new-password` by the previous run.

The failure is also hard to read: a rejected login returns **HTTP 200 with the
HTML login form** rather than a 4xx + JSON error, so the driver prints raw HTML
(`<!doctype html> ... <title>Login</title>`) as the failure detail.

Confirmed by dropping and recreating upspa1/upspa2/upspa3, then re-running:
back to 7/7 passed.

Suggested fixes (any one):
- Have the script drop+recreate the three demo databases at the start of Step 2.
- Make the driver tear down / use a unique account per run.
- Have the login server return a non-200 status on failed login so failures are
  legible.

## Issue 3 — Native Windows extension build fails on `options.html` (real)

`npm run build:ext` (vite + `@crxjs` 1.0.14) fails with:

```
[rollup-plugin-dynamic-import-variables] Bad character escape sequence (3:24)
file: ...\packages\extension\src\options\options.html:3:24
```

This is the known `@crxjs` 1.0.14 Windows path bug: the plugin embeds an
absolute Windows path into generated code and the backslashes (`\U`, `\e`, ...)
are parsed as invalid string escapes. The script's Step 4 fixes address the same
class of bug for `background/index.ts` (dynamic→static import) and for the
`upspa-js` alias in `vite.config.ts` (backslash→forward-slash), but those
patches don't cover the HTML entry points, so the extension build still dies and
no `dist/` is produced.

The script handles this gracefully — it warns and falls back to
`-UsePrebuiltDist`, which works (the prebuilt dist loaded fine and the manual
Chrome path is available). But there is currently no way to build a fresh
extension dist natively on Windows.

Suggested fix: bump `@crxjs` past 1.0.14 (the path bug is fixed in later
releases), or force forward-slash module IDs globally in the vite/rollup config
rather than per-alias. This is a repo-side fix, not a script band-aid.

## Note — prebuilt dist path has a doubled folder

`upspa-extension-dist.zip` extracts to a nested
`upspa-extension-dist\upspa-extension-dist\` (manifest.json lives in the inner
folder). `-UsePrebuiltDist` must point at the inner folder. Minor, but a
one-line note in the README would save a step.

## Summary

| Area | Result |
|---|---|
| Protocol (headless, clean DB) | 7/7 PASS |
| WASM build (GNU toolchain) | OK |
| Storage providers + login server | OK |
| PostgreSQL (after foreground recovery) | OK |
| Native extension build | FAILS (`@crxjs` 1.0.14, `options.html`) |
| Prebuilt dist fallback | OK |
