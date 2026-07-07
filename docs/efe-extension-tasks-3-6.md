# Efe — Extension Tasks 3 & 6

**Round:** Open issues v0 → v0.1 (deadline June 22)
**Tasks:** 3 (Password Policy Detection) and 6 (Deterministic Password Encoder)
**Package:** `packages/extension/**` (+ uses `packages/upspa-js` types)

---

## Scope / branch note (please read first)

These two tasks are **extension** work, not Go `internal/crypto/` work. The
pre-commit guard hook (`tools/hooks/gaurd.sh`) currently maps `intern/efe` to
`services/storage-provider-go/internal/crypto/` only, so it will reject a commit
that touches `packages/extension/`. Two options:

1. Land this on the `intern/extension` branch — the hook already allows
   `packages/extension/` and `packages/upspa-js/` there; or
2. Extend the `intern/efe` case in the hook to also allow those two paths for
   this round.

Flagging for Reza so the commit is not blocked.

---

## Summary

Both pieces already existed and worked partially, so this round was
"harden + correct", not "build from zero":

- **Task 3** — the detector lived inline in the DOM-bound content script and
  was hard to test. The pure parsing logic is now extracted into
  `packages/extension/src/shared/policyDetection.ts` and substantially
  hardened. The content script gathers page signals and calls it. The wire
  contract (`{ ok, policyHints, evidence }`) is unchanged, so `popup.ts` needs
  no edits.
- **Task 6** — the encoder `encodeSecretAsPassword` conflated the rotation
  *counter* with its internal retry index. It now treats `counter` as a stable
  rotation index, resampling deterministically *within* a fixed counter, and it
  accepts the policy as a JSON string or an object per the spec.

Tests: **34 passing** in the extension package (21 new detection tests + 13
encoder tests), **5 passing** in `upspa-js` (unchanged, no regression).

---

## Task 3 — Password Policy Detection

### What was weak

The old `inferPolicyFromText` / `inferPolicyFromPattern` in `content/index.ts`:

- Only matched a couple of length phrasings — ranges like `8-64 characters`,
  `between 8 and 20`, `8 to 32`, `8+`, and `up to 128` were missed.
- Read the bare word "number" as a digit requirement, so "phone number" or
  "account number" produced a false positive.
- On detecting any symbol requirement it hard-coded `allowedSymbols` to
  `!@#$%^&*`, discarding a site's actual listed set.
- Did not handle "spaces are allowed" (only the "no spaces" direction).
- Parsed only the first `{n,m}` in a `pattern`, and treated characters in the
  trailing body class (which merely lists *allowed* characters) as if they were
  *required*.

### What changed

New module `policyDetection.ts` with a pure entry point
`detectPasswordPolicy(signals)` plus independently testable helpers
(`detectLengthFromText`, `detectClassesFromText`, `detectFromPattern`):

- **Length ranges and phrasings**: `at least N`, `minimum of N`, `min N`,
  `no fewer/less than N`, `N+`, `N or more`, `up to N`, `at most N`,
  `no more than N`, `between N and M`, `N-M`, `N to M`. The most restrictive
  consistent bounds win; contradictory bounds collapse to a fixed length with
  an evidence note.
- **Fewer false positives**: phrases like `phone/account/card/order number`
  are stripped before the digit check, so they no longer imply a digit class.
- **Listed allowed-symbol sets** are captured (e.g. `allowed special
  characters: ! @ # $` → `!@#$`), restricted to a "listable" alphabet so a
  descriptive colon/comma/period in prose is not mistaken for a symbol.
- **"Spaces allowed" vs "no spaces"** are both detected (the former clears
  `forbidWhitespace`).
- **Lookahead-aware `pattern` parsing**: when the pattern uses lookaheads,
  only classes inside `(?=...)` are treated as *required*, and a symbol-only
  lookahead class is captured as the allowed set
  (e.g. `(?=.*[@$!%*?&])` → `@$!%*?&`). All `{n,m}` quantifiers are considered
  for length.

`content/index.ts` now only gathers DOM signals
(`minlength`/`maxlength`/`pattern`/`required`/`autocomplete` + associated label,
aria, placeholder/title, and form/container text) and delegates parsing to the
module.

### Files

| File | Change |
|---|---|
| `packages/extension/src/shared/policyDetection.ts` | **New** — pure, DOM-free detection logic |
| `packages/extension/src/shared/policyDetection.test.ts` | **New** — 21 unit tests |
| `packages/extension/src/content/index.ts` | Rewired to gather signals and call the module; inline parsers removed |

---

## Task 6 — Deterministic Password Encoder

`Password_i = Encode(vinfo, Counter, PasswordPolicy)` — implemented in
`encodeSecretAsPassword` in `passwordPolicy.ts`.

### What changed

- **Clean counter semantics.** Previously the encoder bumped the counter on
  each failed candidate (`candidateCounter = counter + attempt`) and returned
  the bumped value, so the stored counter could drift from the value the user
  picked. Now `counter` is a stable rotation index: the encoder resamples
  deterministically *within* a fixed counter using an internal attempt index,
  and always returns the requested `counter`. Register and login still
  reproduce the same password for the same `(vinfo, policy, accountId,
  counter)`; rotating to a new password means incrementing `counter`.
- **JSON or object policy.** Added `parsePasswordPolicy(input)` and widened the
  encoder to accept `PasswordPolicy | string`, satisfying the spec's note that a
  policy "may be represented as text, JSON, or another structured
  representation." Invalid JSON throws a clear error.
- **Persistence confirmed.** The policy is already stored alongside the site
  record in `siteAccounts.ts`
  (`origin → { accountId, passwordPolicy, encoderCounter, ... }`), which
  realizes the `(WebsiteURL, SUID/UID, PasswordPolicy)` requirement for the
  extension side. No schema change was needed.

### Migration note

The seed domain tag was bumped `upspa-password-encoding-v1` →
`-v2`. This is a deliberate, breaking change to the derived passwords: any
account created against the old encoder must be regenerated. This is safe for
the current pre-v0.1 demo (no real users), but should be called out before any
real deployment.

### Files

| File | Change |
|---|---|
| `packages/extension/src/shared/passwordPolicy.ts` | `encodeSecretAsPassword` reworked (fixed-counter resampling, `v2` seed); new `parsePasswordPolicy` |
| `packages/extension/src/shared/passwordPolicy.test.ts` | +6 tests (counter stability, JSON policy, invalid JSON, fixed length, restricted symbol set) |

---

## How to run the tests

```bash
# from repo root
npm install

# extension suite (detection + encoder): 34 tests
npm -w upspa-extension exec vitest run
# or: cd packages/extension && npx vitest run

# upspa-js suite: 5 tests
npm -w upspa-js run test
```

---

## Type-check note

`npx tsc --noEmit` in `packages/extension` is clean for all changed files.
The only errors reported are pre-existing `Cannot find module 'upspa-js'` in
untouched files (`background/index.ts`, `messages.ts`, `upspaActions.ts`).
They appear because `upspa-js` is not built in a fresh checkout — `tsconfig`
points `upspa-js` at `../upspa-js/dist/index.d.ts`, which only exists after
`npm run build:demo` (WASM → JS). Running the full build removes them; they are
unrelated to these two tasks.

---

## Open items / notes for the team

- **Detection is best-effort.** Sites vary wildly; the module errs toward
  *over*-requiring a class rather than under-requiring, since a password that
  includes an extra allowed class is still accepted, whereas a missing required
  class is rejected. The popup still lets the user review/edit the detected
  policy before registering.
- **Per-class counts** ("at least 2 digits") are detected as a boolean
  requirement, not a count. Worth a follow-up if a target site needs it.
- **Privacy:** `siteAccounts` (origin, accountId, policy, counter) is stored in
  `chrome.storage.local` in the clear. The policy itself is non-secret, but the
  site↔account mapping is privacy-sensitive. Task 4 ("store info protected
  under the master password") is the natural place to encrypt this map; calling
  it out here so the two tasks stay consistent.
