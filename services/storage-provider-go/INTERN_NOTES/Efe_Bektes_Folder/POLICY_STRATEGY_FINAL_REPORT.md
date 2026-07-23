# Password Policy Strategy for the 200-Site Agile Version

**Author:** Efe Bekteş · **Branch:** `intern/extension` · **July 2026**
*Companion to Implementation Report II (Task 3: policy detection; Task 6: deterministic encoder) and the Operations Runbook.*

---

## 1. Result of testing the 200-site idea

**The 200-site idea is viable, and the smallest reliable solution is data, not code.** Every mechanism the expansion needs already exists on this branch and is tested (34/34 extension tests):

| Need | Exists as |
|---|---|
| Policy model + normalization | `passwordPolicy.ts` — `normalizePasswordPolicy` (clamps min ≥ 8, max ≤ 64) |
| Validation | `passwordSatisfiesPolicy` (length, classes, whitespace, forbidden substrings, account-ID) |
| Policy-compliant deterministic generation | `encodeSecretAsPassword` (Task 6): counter-stable, resamples ≤ 128× within a counter, clear error on impossible policies |
| Best-effort detection with evidence | `policyDetection.ts` (Task 3): pure, 21 tests, user-reviewed in popup |
| Per-site persistence | registry `policy`/`policySource`/`policyNote`; `siteAccounts` stores `(origin, accountId, passwordPolicy, encoderCounter)` |
| Flow-shape flags | `credentialMode`, `registrationSupported`, `studyRisk` (already used for e-Devlet + 6 others) |

Scaling 40 → 200 sites therefore means: registry rows, a handful of policy constants, and wider use of the existing passwordless flag. No schema change, no new policy machinery.

**Which codebase.** These mechanisms are split across two repositories: the site registry and its own policy/encoder implementation are in `UpSPA_Extension_User_Study_Version`; the Task 3 detector and Task 6 encoder are in `UpSPA_extension` on `intern/extension`. The registry expansion described here targets the study repo, since that is where `supportedSites.ts` lives. Section 6.1 documents where the two implementations have diverged and what that means if they are ever unified.

## 2. Manual registry vs. automatic detection: division of labor

We do not choose between them; both exist and get distinct roles.

- **Registry is authoritative** for curated sites: generation always uses the registry policy.
- **Detection (Task 3) is fallback + smoke alarm:** for unregistered sites, its user-reviewed hints beat nothing; for curated sites, when detected hints *contradict* the registry entry, the evidence strings are logged so the entry can be updated after the session — never silently overridden.

This satisfies "avoid complex universal password-policy detection for now": the detector stays best-effort, evidence-emitting, and human-reviewed (its documented design intent), and it is not extended for this version.

## 3. The relaxed default that works for most websites

Keep `relaxed20Policy`: **16–20 chars, upper + lower + digit, no symbols, no whitespace.** Evidence it holds:

- It already backs ~34/40 registry sites.
- In the team's July round (33 sites reported), **zero failures were policy rejections.** All issues were flow-shape (Booking → phone, Notion → email code, Slack → magic link), field/icon detection (Uber, Figma, Canva, Biletinial), or blocking (Airbnb, TikTok).

No-symbols-by-default remains the key trick: symbol allow-lists are the most site-variable rule; a symbol-free 16–20-char password sidesteps them except where a symbol is *required* — which is what overrides are for. Expected default coverage at 200 sites: ~85–90%.

## 4. Custom exceptions (~15–25 of 200)

1. **Symbol-required** (Amazon-style): default + `requireSymbol: true`, conservative allow-list.
2. **Length outliers** (n11 = 15 max, D&R = 16 max already exist; expect a few more, mostly Turkish e-commerce/legacy). Note the normalizer's 8–64 clamp: a site outside that range needs a registry note.
3. **No usable password flow** → `credentialMode: 'passwordless'` / `registrationSupported: false`, extended to Booking, code-first flows, and blockers. **This flag, not policy logic, addresses most observed failures** — the UI can warn before the flow starts.

Existing overrides (`googlePolicy`, `applePolicy`, `githubPolicy`, `drPolicy`, `n11Policy`) stay unchanged.

## 5. Rejection handling and UI reporting — no overengineering

- **Generation failure:** the encoder already throws a clear message; the popup surfaces it with the human-readable `policyNote` and detector evidence. All data exists.
- **Live rejection of a registry-valid password** = stale registry entry. Participant: edit the policy in the popup (existing capability) or increment the counter. Facilitator: update the entry post-session. No retry heuristics, no probing, no policy mutation in code.
- **Passwordless-flagged sites:** up-front notice ("this site usually signs in with a code/phone; a password flow may be unavailable").

## 6. Scaffold delivered with this report

`registryLint.test.ts` — a small, pure data-quality suite (no DOM, no chrome, no new runtime code) that fails CI when a registry entry is unusable *before* a study session:

- every site's policy survives `normalizePasswordPolicy` with min ≤ max;
- required character classes ≤ maxLen and a non-empty pool (the encoder's own impossibility conditions, caught at data level);
- symbol-required entries have a non-empty allow-list;
- `registrationSupported: false` entries carry a `registrationInfoUrl` or policy note;
- a sampled `encodeSecretAsPassword` run per unique policy proves each policy is actually encodable.

An earlier standalone validation/generation scaffold was **withdrawn**: it duplicated `passwordSatisfiesPolicy`/`encodeSecretAsPassword`, and a random generator would violate the determinism contract `Password_i = Encode(vInfo, Counter, Policy)`.

### 6.1 What the lint surfaced: the two codebases have diverged

Running the lint required pairing the registry with an encoder, and that exposed a structural issue worth reporting.

The registry (`supportedSites.ts`, 40 sites, `relaxed20Policy`, `githubPolicy` and the other overrides) lives in **`UpSPA_Extension_User_Study_Version`**. The Task 6 encoder documented in Report II lives in **`UpSPA_extension`** on `intern/extension`. They are not the same file, and they have drifted:

| | Study repo `passwordPolicy.ts` | Main repo `passwordPolicy.ts` (Task 6) |
|---|---|---|
| Seed tag | `upspa-password-encoding-v1` | `upspa-password-encoding-v2` |
| Character pool | `allowedPool()`: always includes lower + upper + digit + allowed specials | built from **required classes only** |
| Policy type | `maxLength`, `requireLowercase`, `allowedSpecials`, `disallowedChars`, `pattern`, `source` | `maxLen`, `requireUpper`, `allowedSymbols`, no `source` |
| Size | 546 lines, legacy-alias support | 233 lines |

**Consequence.** In the study repo as it stands, `githubPolicy` works: all four `require*` flags are `false`, but `allowedPool()` supplies letters and digits regardless, so generation succeeds. There is **no defect in the current build of either repo**.

However, the moment the registry is placed on the Task 6 encoder, which is what a unified 200-site build implies, every policy with all `require*` flags false produces an empty pool and `encodeSecretAsPassword` throws "Password policy is impossible: no allowed character set." `githubPolicy` is the one such entry among the current 40, so the failure would be silent until someone tests GitHub specifically.

**Recommendation, in order of preference:**

1. **Align the encoders before merging registries.** The study repo's `allowedPool()` behaviour is the safer of the two: a password may contain characters from classes it is not required to contain. Porting that one function into the Task 6 encoder removes the hazard for the whole registry, not just GitHub.
2. **If the encoders stay separate,** add `requireLower: true, requireDigit: true` to `githubPolicy` at the time of any port. GitHub accepts any password of 15 or more characters, so over-requiring is safe and matches the conservative direction the Task 3 detector already takes. Note that the policy is bound into the encoder seed, so this changes the derived GitHub password and any existing demo account for that site needs re-registration.

Either way the lint stays useful: it is what makes an assumption like this visible before a participant session rather than during one.

## 7. Remaining work (≈ 3 days, data entry)

1. Similarweb top-200 → drop out-of-scope (adult, SSO-only, pure-content) → ~150 usable candidates.
2. Desk-check each against the default via official help pages; write the ~20 override constants and rows.
3. Apply passwordless flags to known offenders from the July round.
4. `pnpm verify` (registry lint included) + update `docs/SUPPORTED_SITES.md`.

## 8. Bottom line

Smallest reliable solution: **one proven default + ~20 data-only overrides + the existing passwordless flag + a registry lint.** Registry authoritative, Task 3 detection as user-reviewed fallback and staleness alarm, rejection handled by the encoder's existing error path plus human-readable UI text. Zero new policy machinery; everything the July testing surfaced is fixed by registry data.
