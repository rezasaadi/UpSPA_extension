# Extension Tasks Progress

Here is what I did for these two extension tasks:

---

**Task 1 — Session Persistence During Registration**

**Problem**

The registration flow in the popup is a two-step process: the user clicks "Register current site" (which fills the website form), then after the website confirms the account was created, they click "Confirm Registration Success" to persist the account mapping. The intermediate state (`pendingRegistration`) was stored only as a module-level JavaScript variable in `popup.ts`. If the user closed the popup — even for a second — that variable was gone. Reopening the popup showed no pending registration, the Confirm button was greyed out, and the user had to restart the entire cryptographic registration from scratch (including new SP network calls).

**Root cause in code**

```typescript
// popup.ts — line 86 before the fix
let pendingRegistration: PendingRegistration | undefined;
// set after register click, but never written to any storage
```

**What already worked as a pattern**

`pendingSecretUpdate` (the two-phase secret update flow) already used `chrome.storage.session` with a `createdAt` TTL — exactly the pattern needed here. The fix replicates that pattern 1:1 for registration.

**New file: `packages/extension/src/shared/pendingRegistration.ts`**

* Defines `PersistedPendingRegistration` — the same shape as the old in-memory type plus a `createdAt: number` timestamp.
* `savePendingRegistration(data)` — writes to `chrome.storage.session` with the current timestamp.
* `loadPendingRegistration()` — reads from session storage; if the record is older than 30 minutes (matching the session TTL) it auto-clears and returns `undefined`.
* `clearPendingRegistration()` — removes the key; called on confirm and on lock.
* Uses `chrome.storage.session` so the data survives popup close/reopen but is automatically wiped when Chrome is fully closed or restarted.

**Changes to `packages/extension/src/popup/popup.ts`** — 5 touch points:

| Touch point | Change |
|---|---|
| `PendingRegistration` type | Now aliases `PersistedPendingRegistration` (adds `createdAt`) |
| Register click | After setting in-memory state, calls `await savePendingRegistration(...)` |
| Confirm registration click | After persisting account, calls `await clearPendingRegistration()` |
| Lock session click | Added `await clearPendingRegistration()` alongside the existing clear calls |
| `main()` on popup open | Calls `loadPendingRegistration()`; if origin matches and TTL is fresh, restores the in-memory variable and shows *"Registration pending — submit the site form then click Confirm Registration Success."* |

**How to verify**

1. Start the demo servers (`bash start_demo.sh`), navigate to `http://<WSL_IP>:3000/register`.
2. Open the popup, enter account ID and master password, click **Register current site**.
3. Close the popup immediately.
4. Reopen the popup — the **Confirm Registration Success** button must be enabled and the status message must show the "Registration pending" text. Before the fix this button would be greyed out.

---

**Task 4 — Sign-In Form Auto-Fill**

**Problem**

Every time the user opened the popup on a site they had already registered, they had to manually select their account ID from the dropdown and re-type their master password. There was no memory of which account was last used when multiple accounts exist for a site, and nothing helped pre-select the right account between browser sessions.

**Design: two-layer storage**

The feature stores a small piece of data: `{ preferredAccountByOrigin: Record<string, string> }` — a mapping from site origin to the last-used account ID.

* **Session layer** (`chrome.storage.session`, key `upspa_autofill_session`): stores the data in plaintext. Reading it requires no master password. Valid for the lifetime of the browser session (cleared on Chrome close). Used to auto-select the account instantly when the popup reopens within the same session.

* **Persistent layer** (`chrome.storage.local`, key `upspa_autofill_cache`): stores an encrypted blob `{ salt, iv, ciphertext }`. The data is only readable with the correct master password. Survives browser restarts.

**New file: `packages/extension/src/shared/autofillCache.ts`**

* `deriveKey(masterPassword, salt)` — PBKDF2 with SHA-256, 100 000 iterations, produces an AES-256-GCM key. Key derivation is intentionally slow to resist offline brute-force attacks.
* `saveAutofillCache(masterPassword, data)` — generates a fresh random 16-byte salt and 12-byte IV each time, encrypts with AES-GCM, base64-encodes the salt/IV/ciphertext, stores the blob in `chrome.storage.local`, and simultaneously writes the plaintext to `chrome.storage.session`.
* `mergeAndSaveAutofillCache(masterPassword, origin, accountId)` — first decrypts the existing cache (to preserve other origins), adds the new entry, then re-encrypts and saves.
* `loadAutofillCacheFromSession()` — reads `chrome.storage.session` with no password needed; used on every popup open.
* `loadAutofillCache(masterPassword)` — decrypts `chrome.storage.local`; returns `null` on wrong password or missing data; also refreshes the session layer on success.
* `clearAutofillCache()` — removes both keys; called on lock.

**Key implementation note — TypeScript 5.6 typed-array generics**

`Uint8Array.from()` returns `Uint8Array<ArrayBufferLike>`, but Web Crypto APIs require `BufferSource = ArrayBuffer | ArrayBufferView<ArrayBuffer>`. `ArrayBufferLike` includes `SharedArrayBuffer`, which is not assignable to `ArrayBuffer`. Fixed by replacing `Uint8Array.from(atob(str), ...)` with a `new Uint8Array(length)` constructor call plus an index loop:

```typescript
// fromBase64 — returns Uint8Array<ArrayBuffer>, compatible with BufferSource
function fromBase64(str: string): Uint8Array<ArrayBuffer> {
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
```

The `new Uint8Array(n)` constructor (length overload) always allocates a plain `ArrayBuffer`, so the result is `Uint8Array<ArrayBuffer>`. The same fix was applied to the `salt` and `iv` parameters of `deriveKey` and `decryptData`.

**Changes to `packages/extension/src/popup/popup.ts`** — 4 touch points:

| Touch point | Change |
|---|---|
| `runPopupAction()` | Snapshots `masterPassword` and `accountId` before the action runs; on success calls `mergeAndSaveAutofillCache(...)` to update both storage layers |
| `main()` on popup open | Calls `loadAutofillCacheFromSession()` (no password needed) and uses the cached `preferredAccountByOrigin[activeOrigin]` as the preferred account passed to `loadAccounts()` |
| Lock session click | Added `await clearAutofillCache()` so both layers are wiped on lock |
| Delete account click | After removing the account, evicts it from the session layer if it was the stored preferred account for that origin |

**How to verify**

1. Register and confirm an account on `http://<WSL_IP>:3000`.
2. Enter master password, click **Login current site** — succeeds.
3. Close and reopen the popup on the same tab: the correct account is already selected (session layer).
4. Fully close Chrome, reopen it, navigate to the same page, open the popup: the account is still pre-selected (persistent layer).
5. Open Chrome DevTools on the popup → Console:
   ```javascript
   chrome.storage.local.get('upspa_autofill_cache', console.log)
   // returns { salt: "...", iv: "...", ciphertext: "..." } — never plaintext
   ```
6. Click **Lock extension** in the popup, then run the same command — returns `{}`.

---

**Files changed**

| File | Status | Purpose |
|---|---|---|
| `packages/extension/src/shared/pendingRegistration.ts` | New | Task 1: session-persisted registration state with TTL |
| `packages/extension/src/shared/autofillCache.ts` | New | Task 4: PBKDF2+AES-256-GCM encrypted autofill preferences, two-layer storage |
| `packages/extension/src/popup/popup.ts` | Modified | Wires both features into existing event handlers and `main()` |
| `packages/extension/src/shared/session.ts` | Unchanged | No changes needed |

---
