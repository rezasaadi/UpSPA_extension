# Efe — May patch (follow-up to the April patch)

**Branch:** `intern/efe/...`
**Package:** `services/storage-provider-go/internal/crypto/**`
**Scope:** comments + build correctness of `internal/crypto/`, a security pass, and a local end-to-end demo run.

This note is the full recap of my May work. It includes a plain-language "what's done" summary so anyone on the team — not only the crypto people — can see the state of this track and check it for themselves. AI assistance is noted honestly at the end.

---

## What I did this month

- Added plain-language comments to every file in `internal/crypto/` that had none, so the code reads clearly to someone new.
- Fixed the two remaining issues that stopped the package from building and testing cleanly.
- Re-ran the whole crypto test suite from a clean checkout to confirm it passes (63/63 + fuzz).
- Did a security pass over my package and over how the API layer now uses it.
- Wrote one PowerShell script that runs the full browser demo end-to-end (Reza's Step 2).
- Closed out the `K0` question I had raised with Prof. Küpçü.

---

## What's done (plain-language)

**The project, in one line:** UpSPA lets a user log into many sites with a single master password, while no server ever sees that password — several "Storage Provider" servers each hold one piece, and you need enough of them together to log in.

**My part:** the server-side crypto the Storage Provider runs — encoding, signature checking, the core point-multiplication that makes login possible without revealing the password, and the exact bytes a user signs when changing their master password.

| # | Deliverable | Status | Where to look |
|---|-------------|--------|---------------|
| 1 | Encoding helpers + tests | Done | `b64.go`, `b64_test.go` |
| 2 | Signature check + tests | Done | `ed25519.go`, `ed25519_test.go` |
| 3 | Core point math + tests | Done | `ristretto.go`, `ristretto_test.go` |
| 4 | Key generation + tests | Done | `scalar_keygen.go`, `scalar_keygen_test.go` |
| 5 | Update-signature bytes + tests | Done | `pwd_update_sigmsg.go`, `pwd_update_sigmsg_test.go` |
| 6 | Shared size constants | Done | `constants.go` |
| 7 | Negative + fuzz tests + security note | Done | `negative_test.go`, `fuzz_test.go`, `efe-week4.md` |
| 8 | Plain-language comments on the code | Done (May) | the 5 files above + cleaned `b64.go` header |
| 9 | Build fixes so everything compiles | 1 done by me, 1 for Reza | see "Build fixes" |

**Proof it works:** the full suite is **63 passing / 0 failing**, with two fuzz targets running clean (130,000+ random inputs), re-run from a clean checkout — not from the old cached results file.

---

## Comments added (May)

Per Reza's "leave comments on your assigned files", I added doc comments — in plain words a non-specialist can follow — to the five files that had none: `ed25519.go`, `ristretto.go`, `scalar_keygen.go`, `pwd_update_sigmsg.go`, `constants.go`. No logic changed; the suite still passes and `gofmt` is clean. I also removed the stale `TODO: Implement this file` header from `b64.go` (the file has long been implemented) and replaced it with a one-line description.

---

## Build fixes

Re-testing from a clean checkout surfaced two issues that stop the package building/testing. Neither is a logic bug.

**Fix 1 — wrong generator call in a test (done).** `ristretto_test.go` called `ristretto255.NewGeneratorElement()`, which does not exist in the pinned `gtank/ristretto255 v0.1.2`; the correct call is `ristretto255.NewElement().Base()`. One line — with it, the suite goes from "build failed" to 63/63. I applied this.

**Fix 2 — stray nested `go.mod` (needs Reza on `main`).** `internal/crypto/go.mod` declares a *different* module name, which turns `internal/crypto` into its own module and stops the rest of the server importing it. I re-checked whether this might be intentional, and it is not:
- there is no `go.work` anywhere that would deliberately bridge two modules;
- the file was added by a bulk "Add files via upload" commit, not configured on purpose;
- with it present, building an API package that imports `upspa/internal/crypto` fails with `package upspa/internal/crypto is not in std`, and removing it builds fine.

So it should be deleted and `go mod tidy` run at the SP root. Because removing a file is a *deletion*, the intern-branch guard blocks me from committing it, so this one needs Reza on `main`.

**Note:** the saved `crypto_test_results.txt` in this folder is out of date (it predates the current library pin and module layout) — please don't rely on it; the 63/63 above is from a fresh run.

---

## Security pass

**My package — solid.** Strict length checks before anything reaches the crypto core; canonical base64url decoding; constant-time signature verification (`ed25519.Verify`); the password-update signature binds every replay-relevant field (`nonce | ct | tag | kINew | timestamp | spID`), pinned by a golden-vector test; and no secrets are logged.

Two small hardening notes (not bugs):
- `VerifyEd25519` panics on a wrong-length key/signature. Safe today because callers length-check first and there is a recover middleware, but a library that panics on bad input is a footgun — returning `false` would be safer.
- `GenerateScalarKi` uses rejection sampling, which retries ~16 times on average; the 64-byte wide-reduction approach (from my Week-2 notes) would be a one-shot, unbiased alternative.

**API layer — the earlier mocks are now wired up.** The handlers that used to short-circuit (an unconditional `VerifyEd25519`, a hardcoded TOPRF result, a literal signature-message string) now call the real crypto: `toprf.go` uses `RistrettoScalarMult`, and `pwd_update.go` builds the real message, verifies the signature (401 on failure), and enforces `sp_id` + monotonic-timestamp replay protection. There is a recover middleware. So the auth-bypass risk I'd flagged earlier is closed.

---

## Raised and resolved: the `K0` carry-forward

On May 1 I emailed Prof. Küpçü about the Rust client (`client_password_update` in `crates/upspa-core/src/protocol/password_update.rs`): the old `cid` plaintext is re-encrypted under the new password-derived key without changing `K0`, so `c_j` blobs encrypted under the old `K0` stay decryptable after a password rotation. On May 4 he confirmed this is **intentional** — password update is kept efficient on purpose, to avoid re-encrypting everything. So it is by design, not a bug; recorded here so the team knows it was checked.

---

## End-of-May addendum: demo automation, illustrated report, and logs

Three things were added at the end of the month to make Reza's Step 2 reproducible and easy to review:

- **Headless protocol driver (7/7 PASS).** Beyond the setup script, I wrote a Node driver that runs the extension's own `upspa-js` client (compiled for Node, only the WASM loader swapped to read bytes) directly against the live Storage Providers and login server. It exercises the entire flow - setup/provision, register, login, secret-update, master-password-update, and 2-of-3 resilience - and prints PASS/FAIL per step (exit 0 iff all pass). End-to-end it reports **7 passed, 0 failed**; a deliberately wrong TOPRF instead yields an AEAD error, which confirms the encrypted `cid` genuinely has to decrypt for the chain to close. It ships in `upspa-extension-dist.zip` under `demo-driver/`, and the setup script runs it automatically.

- **Setup script hardened to version 2026-05-30n.** PostgreSQL now self-heals a stale `postmaster.pid` left by an unclean shutdown (the cause of one failed run), polls readiness on `127.0.0.1`, tolerates a missing `git` when the repo is already present, writes a structured set of logs under `logs/may_logs/` (environment snapshot, per-server output, driver transcript, a `99-run-report.md`), and captures the login-server pages as screenshots with headless Chrome.

- **Illustrated report (`upspa-report.pdf`).** A self-contained walkthrough: plain-language intro + a nomenclature glossary, the system architecture, the five protocols as sequence diagrams, my crypto work with code, the whole build experience as a state machine, the headless driver with its real transcript, the login-server screenshot journey, and a defensive security review.

These are tooling and evidence around the same assigned crypto work; the crypto itself is unchanged from the fixes above.

---

## What this does NOT fix / for the team

- **The nested `go.mod`** must be removed on `main` by Reza (deletions are blocked on intern branches) — see Fix 2.
- **Pre-production hardening** the repo itself flags: permissive local CORS and broad extension host permissions should be tightened before any real deployment.
- **Other layers** (the DB layer, the Rust client beyond the `K0` point, and deployment config) are outside my package; a full security review would still need to cover them.

---

## Environments and reproduction

The work was exercised on two independent machines, as a clear marker that the code runs on more than one environment.

**Windows (intern workstation)** - the full stack via `upspa-setup-and-run.ps1`:
- OS: Windows 11 Pro Education, build 26200; PowerShell 5.1.
- Toolchain: Go 1.26.2, Node v24.16, Rust/wasm-pack 0.15.
- CPU / RAM / GPU: Intel Core Ultra 7 258V (8 logical cores) / 31.5 GB / Intel Arc 140V GPU (16 GB), recorded by the version-`o` diagnostics.
- What ran: the WASM core, three Go Storage Providers, PostgreSQL, the headless driver, and browser screenshots of the login server. End-to-end success; the clean run with the PostgreSQL self-heal is captured on the intern host.

**Linux (cloud agent)** - the protocol and the assigned package:
- OS: Ubuntu 24.04.4 LTS, kernel 6.18.5, x86-64.
- CPU: Intel Xeon, 1 vCPU @ ~2.1-2.8 GHz; RAM: 3.9 GiB; GPU: none (the cryptography is CPU-only).
- Toolchain: Go 1.22.2, Node v22.22, Python 3.12.
- What ran: the end-to-end protocol via the headless driver against the real login server, with SPs performing the real ristretto255 op (`y = k_i * blinded`) -> **7/7**; and the assigned `internal/crypto` package built and tested -> **63/63**.
- Note: a full `go build ./...` also links the PostgreSQL driver's `golang.org/x` dependencies, which the agent's network does not reach (and the GitHub mirror's versions need Go >= 1.24 vs the agent's 1.22.2), so the full-service link is exercised on the Windows host instead. This is an environment limitation, not a code issue.

Logs for both runs: `logs/may_2026/windows/` and `logs/may_2026/linux/`.

---

## AI assistance (honest note)

As in Week 1, I used AI assistance (Claude) this round and double-checked the output, as Reza asked. Specifically: the plain-language comments, the sandbox re-build/re-test, the proof about the nested `go.mod`, and the structure of this note were done with Claude's help and reviewed by me. The crypto implementation itself, the four bugs found in March–April (scalar clamping, the identity-point test, the Edwards-vs-Ristretto encoding mismatch, and the Go 1.22 whitespace behaviour), and the `K0` question to Prof. Küpçü were my own earlier work. The two build issues fixed this month were surfaced by re-testing in the sandbox.
