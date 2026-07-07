# Windows run guide - `upspa-setup-and-run.ps1` (version 2026-05-30o)

This produces the clean Windows run for the report (the full stack + the 7/7 driver),
and now also records this machine's CPU / RAM / GPU.

## 1. Get the script
1. Delete any older `upspa-setup-and-run.ps1` from Downloads.
2. Re-download the one shared with you. Confirm the version: open it and check line 5
   says `Version: 2026-05-30o`, or just run it and watch for the banner in step 3.

## 2. Run it (NON-elevated PowerShell)
PostgreSQL refuses to run under an elevated shell, so use a NORMAL window (not "Run as
administrator"):

```powershell
cd $HOME\Downloads
powershell -ExecutionPolicy Bypass -File .\upspa-setup-and-run.ps1
```

(If you keep the script elsewhere, `cd` there first.)

## 3. What you should see
- A banner: `SCRIPT VERSION: 2026-05-30o (CPU/RAM/GPU capture; PG self-heal ...)`.
- A `[DIAG]` block that now includes `CPU`, `CPU cores`, `RAM`, and `GPU`.
- PostgreSQL starting (it self-heals a stale lock if a previous run was interrupted).
- Three Storage Providers on :8081 / :8082 / :8083 and the login server on :3000.
- The headless driver printing seven `[PASS]` lines and `RESULT: 7 passed, 0 failed`.
- Login-server screenshots saved under the logs folder.

## 4. What to copy-paste back to me
Please send all three so I can fold the real Windows numbers into the report, the notes,
and the email:

1. **The full console output** - especially:
   - the `[DIAG]` block (so I can fill the Windows CPU / RAM / GPU cells), and
   - the seven `[PASS]` lines and the `RESULT:` line.
2. **The logs folder**: `%USERPROFILE%\upspa-demo-logs\may_logs\`
   (`00-environment.log`, `01-postgres.log`, `03-driver.log`, `99-run-report.md`).
3. **The screenshots** the script saved (same logs folder).

That's it. Once you paste those, the two-environment section becomes fully real on the
Windows side too.
