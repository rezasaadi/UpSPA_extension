# Report — UpSPA Documentation Task (Protocol Functions, I/O, Stored Data, Storage Provider)

**Author:** Furkan
**Related file:** `furkan-extension-tasks-1-6.md` (same branch, `docs/` folder)

## What I did

I was assigned six documentation topics: protocol functions, inputs/outputs, stored data, the local prototype storage provider, what is relaxed in the agile version, and what must be restored for the final distributed version. To cover these, I worked through the following sources in order:

1. **`docs/apis.md`** — to understand the wire-level shape of the Storage Provider API (encoding rules, request/response formats for each endpoint).
2. **`docs/protocol-phases.md`** — to understand the end-to-end protocol flow phase by phase (Π0–Π5), and how each phase maps to specific files in `services/storage-provider-go/`.
3. **The UpSPA paper** (İşler, Saadi Dadmarzi, Küpçü) — to understand *why* the protocol is designed this way: the specific attacks it prevents (preemption, forged updates, offline dictionary attacks) and the design decisions behind fields like `R_sp` and `K_0`.
4. **The actual Go source code** — `setup.go`, `toprf.go`, `pwd_update.go`, `ristretto.go`, `ed25519.go`, `pwd_update_sigmsg.go`, and `queries.go` — to verify what the documents and the paper describe against what is actually implemented.

I don't have a Go background, so for the source code step I read each file with AI assistance: going through it slowly, having unfamiliar syntax and control flow explained, and using the protocol documents and the paper as the reference for *what the code was supposed to be doing*, so I could check the two against each other rather than reading the code blind. This let me flag a concrete discrepancy (see below) instead of only paraphrasing the docs.

I also used AI assistance to work through the protocol's underlying logic itself — concepts like blinding/unblinding in the TOPRF step, why an AAD binds a ciphertext to a specific user or record, and why the signature message layout in password update has to match byte-for-byte — rather than only relying on my own read of the paper and docs. I went through this material slowly and checked my understanding against the source documents, but I want to be upfront that this wasn't purely independent reading.

## Key finding

The most useful thing that came out of comparing the code against the spec: **`protocol-phases.md`** and the paper both describe three outcomes for a setup request — created, idempotent (same data resubmitted), and conflict (different data for an existing user). Reading `queries.go`, I found that `PutSetup` uses a plain `INSERT ... ON CONFLICT (uid_b64) DO NOTHING`, which means the conflict case is never actually detected — an existing user is always just treated as "already set up," whether the resubmitted data matches or not. This doesn't corrupt anything (the original record is never silently overwritten), but the three-way distinction the spec calls for is currently collapsed into two.

By contrast, `ApplyPasswordUpdate` handles its replay-protection requirement correctly: the timestamp check and the write happen in a single atomic SQL statement, rather than as separate read-then-write steps, which matches what the protocol spec and the paper require for that phase.

## Overall impression

Within the specific files I reviewed — the setup, TOPRF, and password-update handlers, plus their underlying crypto primitives — nothing looked cryptographically "relaxed": input validation, canonical decoding, and signature/replay checks were all implemented properly there. I want to be careful not to overstate this, though: I did not review the records handler (`records.go`), the database schema/migrations, or any test files, so I can't say whether the same holds across the rest of `services/storage-provider-go/`. The simplifications I *could* identify were architectural rather than cryptographic: everything runs as local processes on one machine rather than genuinely separate hosts, so the threshold trust assumption isn't exercised end-to-end, and the browser/login-server side (automation against unmodified sites) is currently stood in for by a simplified reference API.

## Open items / things I couldn't verify yet

I want to be clear about scope: I read six specific Go files (`setup.go`, `toprf.go`, `pwd_update.go`, `ristretto.go`, `ed25519.go`, `pwd_update_sigmsg.go`, `queries.go`) that map directly to the phases and endpoints described in `protocol-phases.md`, not the entire `services/storage-provider-go/` codebase. I did not review the browser extension code (`packages/extension/`), the Rust core/WASM bindings (`crates/`), or any deployment configuration (Docker Compose, environment files), so I can't confirm specifics like CORS settings, host permissions, or how the extension side integrates with the SP API. I left these out of the documentation rather than guessing. If useful, extending this review to the extension and Rust core would round out both the protocol-functions picture and the "relaxed vs. must-restore" comparison.

## Time spent

Spread across a few days rather than one sitting — reading the protocol documents, the paper, and the Go source, plus writing up the documentation and this report.
