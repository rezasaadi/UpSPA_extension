# Logs - organised by month and environment

```
logs/
  may_2026/
    windows/   full-stack run on the intern's Windows 11 PC (setup script)
    linux/     driver + crypto-test run on the Linux cloud agent
```
Future months (june_2026, etc.) slot in alongside `may_2026/`.

windows/: 00-environment.log, 01-postgres.log, 03-driver.log, pgctl-start.log,
          run-*.log, 99-run-report.md (and screenshots from the run).
linux/:   00-environment-linux.log, 03-driver.log (7/7),
          04-crypto-test-linux.log (63/63), 05-go-sp-build-linux.log.
