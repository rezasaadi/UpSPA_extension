# UpSPA Documentation — Protocol, Storage, and Prototype Notes

**Author:** Furkan
**Scope:** Protocol functions · Inputs & Outputs · Stored data · Local prototype storage provider · Agile-version relaxations · Restoration requirements for final distribution

---

## 1. Protocol Functions

UpSPA is a threshold Single Password Authentication (SPA) protocol. A user authenticates to any number of unmodified login servers (LS) using one memorable master password, while a set of untrusted Storage Providers (SPs) hold encrypted per-user state and jointly assist in a threshold Oblivious PRF (TOPRF) evaluation. No single SP ever sees the password or the secrets it protects.

The protocol is organized into five phases. Each phase below is described by *what problem it solves*, *what the client does*, and *what the SP does*.

### Π0/Π1 — Setup
**Goal:** bind the user's master password to long-term secrets, without any SP learning the password.

- The client generates:
  - `R_sp` — a high-entropy identifier secret (used later to derive unguessable per-site identifiers, preventing an attacker from "reserving" a user's account at an SP before the user does — this is called a *preemption attack*)
  - a TOPRF key split into per-SP shares `k_i`
  - an Ed25519 signing keypair (`ssk`/`svk`) — the private half never leaves the client
  - a symmetric key `K_0` — used later to encrypt per-site secrets independently of the password
- The client encrypts `(ssk, R_sp, K_0)` into a single blob `cid`, using a key derived from the TOPRF, and uploads `{uid, svk, cid, k_i}` to each SP.
- Each SP simply stores this tuple, keyed by `uid`. It never sees the plaintext being encrypted, only the resulting ciphertext.

### Π2 — Authentication (Login)
**Goal:** recover the long-term secret from just the password, without ever sending the password to an SP.

- The client "blinds" the password (turns it into a random-looking point via a one-way transform) and sends the blinded value to multiple SPs.
- Each SP multiplies the blinded value by its own secret share `k_i` and returns the result — this is the TOPRF "evaluate" step. The SP cannot learn anything about the original password from a blinded input.
- Once the client collects results from at least `threshold`-many SPs, it "un-blinds" and mathematically combines them to reconstruct the same key it used during setup — then decrypts `cid` to recover `ssk`, `R_sp`, `K_0`.
- This whole flow is why the recovery is called *threshold*: fewer than the threshold number of SPs cannot reconstruct anything, and no single SP ever learns the password.

### Π3 — Record Creation (Registration for a site)
**Goal:** create a per-site secret and store it safely, without the SP ever learning what it's protecting.

- The client derives a unique per-site identifier from `R_sp`, generates a fresh per-site secret, encrypts it under `K_0`, and stores it at each SP under that identifier.
- The SP only ever stores an opaque encrypted blob (`cj`) against an opaque identifier (`suid`) — it cannot interpret either.

### Π4 — Record Fetch/Update
**Goal:** read or refresh the per-site secret during normal use.

- Same identifier scheme as Π3. The client fetches `cj`, decrypts it using `K_0` (recovered in Π2), optionally updates it, and re-uploads.

### Π5 — Password Update
**Goal:** let the user change their master password without having to touch every site they've registered with, and without an SP being able to fake this request.

- The client generates a brand-new TOPRF key/shares, re-encrypts `(ssk, R_sp, K_0)` under the new password-derived key, and sends each SP its new share along with a **signature** over the update — proving the request really comes from the account owner (only someone who reconstructed `ssk` from the *current* password could produce a valid signature).
- Because `K_0` (and therefore every per-site secret) is untouched by a password change, this update only touches one small record per SP — it does **not** scale with the number of sites the user has registered with. This is one of UpSPA's core efficiency arguments over prior schemes (see the paper's Challenge 4).
- Each SP verifies the signature and rejects the request if the accompanying timestamp is not strictly newer than the last accepted update (replay protection).

---

## 2. Inputs & Outputs (Wire Format)

All binary data crossing the JSON API (keys, ciphertexts, signatures) is encoded as **base64url without padding**, and the SP canonicalizes it (decode → re-encode) before using it as a database key or comparing values, so that two different textual encodings of the same bytes are never treated as different records.

Encrypted fields all use the same three-part container (`CtBlob`):

| Field | Meaning | Size |
|---|---|---|
| `nonce` | one-time value, prevents identical plaintexts from producing identical ciphertexts | 24 bytes |
| `ct` | the actual encrypted data | varies (96 bytes for `cid`, 40 bytes for `cj`) |
| `tag` | authentication tag — detects any tampering with the ciphertext | 16 bytes |

Endpoints, grouped by phase:

| Phase | Endpoint | Request → Response (summary) |
|---|---|---|
| Π1 | `POST /v1/setup` | `{uid, sig_pk, cid, k_i}` → `201` (new) / `200` (idempotent) |
| Π1 | `GET /v1/setup/{uid}` | → `{uid, sig_pk, cid}` (note: `k_i` is never returned) |
| Π2 | `POST /v1/toprf/eval` | `{uid, blinded}` → `{sp_id, y}` |
| Π3 | `POST /v1/records` | `{suid, cj}` → `201` / `409` if it already exists |
| Π4 | `GET /v1/records/{suid}` | → `{suid, cj}` |
| Π4 | `PUT /v1/records/{suid}` | `{cj}` → `200` / `404` |
| Π5 | `POST /v1/password-update` | `{uid, sp_id, timestamp, sig, cid_new, k_i_new}` → `200` / `409` (replay) / `401` (bad signature) |

Integers (`sp_id`: 32-bit, `timestamp`: 64-bit) are serialized **little-endian** whenever they're part of a signed message — client and server must build the exact same byte layout, or every signature verification silently fails.

---

## 3. Stored Data

| Party | What it stores | Notes |
|---|---|---|
| **Client (user device)** | Nothing persistent except the memorized password. `uid`, `cid`, and the SP list are kept locally but are not secret-critical on their own — `cid` is only useful together with the password. | |
| **Storage Provider — `setup` record** | `uid` (key), `sig_pk`, encrypted `cid` (nonce/ct/tag), `k_i` (this SP's TOPRF share), `last_pwd_update_time` | `k_i` is never returned to any caller, including the legitimate user — it's write/compute-only from the SP's side. `last_pwd_update_time` exists purely for replay protection on Π5. |
| **Storage Provider — `records` table** | `suid` (key), encrypted `cj` (nonce/ct/tag) | The SP never attempts to interpret or decrypt this — it is a pure opaque blob store. |
| **Login Server** | `uid`, `vInfo` (a site-specific verification value derived from a per-site secret, functioning like a password only the site knows) | Login servers require **no changes at all** to support UpSPA — this is one of the protocol's central design goals. |

---

## 4. Local Prototype Storage Provider

The reference SP is implemented as a Go service (`services/storage-provider-go/`). Based on reading the actual handler code (`setup.go`, `toprf.go`, `pwd_update.go`) and crypto primitives (`ristretto.go`, `ed25519.go`, `pwd_update_sigmsg.go`):

- **Validation is strict, not relaxed.** Every incoming field is length-checked against exact expected sizes (Ed25519 keys: 32 bytes, signatures: 64 bytes, nonce: 24, tag: 16, TOPRF share: 32) before any cryptographic operation runs. Malformed input is rejected with a specific error code rather than silently passed through.
- **TOPRF evaluation (`toprf.go`)** decodes the incoming blinded value and the stored scalar share, checks both are canonical (rejecting invalid curve points/out-of-range scalars — a genuine cryptographic attack surface if skipped), performs the scalar multiplication, and returns only the result — never anything that would let the SP learn the input.
- **Password update (`pwd_update.go`)** enforces, in order: the `sp_id` in the request matches this specific SP's own id, the timestamp doesn't overflow, all fields decode and length-check correctly, the signature verifies against the SP's stored public key using the *exact* byte layout defined in `pwd_update_sigmsg.go`, and the new timestamp is strictly greater than the last one accepted (replay protection) — the store update itself only applies if all of the above hold.
- **Cryptography stack:** ristretto255 (via `github.com/gtank/ristretto255`) for the TOPRF's elliptic-curve operations, and Ed25519 for signatures — both are the same primitives specified in the protocol design, not simplified stand-ins.

In short: at the level of the endpoint logic and cryptographic checks, this prototype already implements the protocol's core security invariants faithfully. It does not appear to take security shortcuts in the parts of the code reviewed so far.

---

## 5. What Is Relaxed in the Agile/Prototype Version

The simplifications in this prototype are architectural/operational rather than cryptographic:

- **Single-machine deployment.** All storage providers run as local processes/containers on one machine (via Docker Compose or multiple terminals), rather than on genuinely separate, independently-administered hosts. This means the *threshold* trust assumption — "an attacker would need to compromise several independent operators" — isn't actually tested end-to-end; there's only one operator (the developer) in practice.
- **No real network-level isolation or TLS between components.** The protocol design assumes secure, server-authenticated channels (e.g., TLS) between client and SPs. Locally this is likely simplified or skipped for development speed, meaning transport-level guarantees are not currently being exercised as they would be in production.
- **No production-grade key/secrets management.** In this prototype, SP secret shares (`k_i`) and signing keys live in a local database with no indication (in the code reviewed) of hardware-backed key storage, secrets rotation infrastructure, or access auditing.
- **Reference/mock Login Server for testing.** The real design goal is compatibility with *unmodified* login servers via browser automation (filling in a derived password on an existing site's login form). For development and testing, a simplified reference LS API is used instead (`/register`, `/login`, `/change-password` with directly-passed verifier values) — this is explicitly a testing convenience, not something intended to ship.

---

## 6. What Must Be Restored for the Final Distributed Version

1. **Genuine multi-operator deployment.** Storage providers must run on physically/administratively separate hosts so the threshold security assumption (fewer than *t* colluding/compromised providers) is a real property of the deployment, not just of the code.
2. **Enforced TLS and server authentication** between client, SPs, and login servers, matching the paper's threat model assumption of "secure and server-authenticated channels."
3. **Production secrets handling** for each SP's TOPRF share and any local key material — proper access control, rotation policy, and audit logging, rather than a local dev database.
4. **Real login-server integration via browser automation**, replacing the reference/mock LS test API — this is the part of the system that lets UpSPA work against sites that were never modified to support it, which is one of its main selling points over SSO-style alternatives.
5. **Missing conflict detection on setup.** The protocol spec (Π1) distinguishes three outcomes for a setup request: created (`201`), idempotent replay of *identical* data (`200`), and conflicting data submitted for an *existing* user (`409`). Reading the actual database layer (`queries.go`) confirms this distinction is **not implemented**: `PutSetup` uses `INSERT ... ON CONFLICT (uid_b64) DO NOTHING`, so if a `uid` already exists, the request is silently accepted as `200 OK` regardless of whether the submitted data matches the stored record or not. No comparison against the existing row happens at all. This doesn't corrupt data (the original record is never overwritten here), but it does mean a caller has no way to detect that they just tried to re-setup an account with different values than what's on file — the three-way distinction from the spec is effectively collapsed into two (created / not created). This should be flagged before final release, since it affects how precisely the system can detect and report anomalous setup attempts.

   On the other hand, `ApplyPasswordUpdate` (Π5) is implemented correctly and robustly: the replay check (`timestamp > last_pwd_update_time`) is enforced as part of the same atomic `UPDATE ... WHERE` statement that writes the new state, rather than as a separate read-then-write step — this avoids race conditions and matches the spec's atomicity requirement.

---

*This document reflects a direct reading of `apis.md`, `protocol-phases.md`, the UpSPA paper (İşler, Saadi Dadmarzi, Küpçü), and the Go source files `setup.go`, `toprf.go`, `pwd_update.go`, `ristretto.go`, `ed25519.go`, `pwd_update_sigmsg.go`, and `queries.go`.*
