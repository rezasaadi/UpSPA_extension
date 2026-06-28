# Sina — Extension Tasks 2 & 5

**Round:** Open issues v0 → v0.1
**Tasks:** Task 2 and Task 5
**Branch:** `intern/sina`
**Package area:** `packages/extension`, `packages/upspa-js`, and `demo/light-login-server`

---

## Summary

This report documents my implementation of the assigned extension tasks:

* **Task 2:** Improve the pending registration flow so an interrupted registration can be resumed safely.
* **Task 5:** Automatically confirm login-server account creation before committing registration records to the Storage Providers.

The main goal was to make the registration flow safer and less dependent on temporary popup state. Previously, the flow required the user to manually confirm registration after the login server accepted the account. If the popup was closed at the wrong time, the intermediate state could be lost or the user could forget to complete the second step.

The new implementation separates registration into two phases:

1. **Prepare registration:** generate the login-server value and prepare the Storage Provider records, but do not write them yet.
2. **Commit registration:** after the login server confirms that the account was created, commit the prepared records to the Storage Providers.

This prevents inconsistent state where Storage Providers contain records for a login-server account that was never successfully created.

---

## Task 2 — Pending Registration Recovery

### Problem

The registration flow is naturally a two-step process:

1. The extension fills the website registration form.
2. After the website/login server accepts the account creation, the extension commits the prepared registration records to the Storage Providers.

If the popup is closed or reopened during this process, the extension needs enough information to continue safely. A simple in-memory variable is not enough because popup state can disappear when the popup closes.

### Implemented changes

I extended the pending registration state so that the extension can recover the registration flow after the popup is reopened.

The pending registration state now stores:

* website origin
* account ID
* password policy
* encoder counter
* UpSPA UID
* prepared Storage Provider records
* creation timestamp

The state is stored in extension session storage. This means it survives popup close/reopen during the browser session, but it is still temporary and cleared when appropriate.

### New/modified behavior

When the user starts registration:

1. The extension prepares the registration.
2. The registration value is filled into the website form.
3. The pending registration state is saved.
4. If the popup is closed and reopened on the same origin, the extension reloads the pending state.
5. The account ID and password policy are restored in the popup UI.
6. The confirmation/polling flow can continue from the recovered state.

### Modified files

| File                                                   | Purpose                                                      |
| ------------------------------------------------------ | ------------------------------------------------------------ |
| `packages/extension/src/shared/pendingRegistration.ts` | Stores and loads pending registration state with a TTL       |
| `packages/extension/src/popup/popup.ts`                | Saves, restores, clears, and uses pending registration state |

### Relation to existing extension work

This task is compatible with the existing extension-side session and autofill logic.

The important addition in my implementation is that the pending registration state now also carries the prepared Storage Provider records and the UpSPA UID. This makes the state useful not only for restoring the UI, but also for safely completing the registration after login-server confirmation.

In other words, this task does not conflict with existing session persistence work. It extends the registration flow so that the recovered state can be used by Task 5’s automatic confirmation and commit process.

---

## Task 5 — Automatic Registration Confirmation

### Problem

Before this change, the user had to manually click **Confirm Registration Success** after the website accepted registration. This was fragile because:

* the popup could close before confirmation,
* the user could forget to click confirm,
* Storage Provider records could be written at the wrong time,
* the extension did not know whether the login server had actually created the account.

The correct behavior is:

```text
Only commit Storage Provider records after the login server confirms that the account exists.
```

### Implemented design

I split the registration flow into two phases:

```text
prepareRegistration → commitRegistration
```

### Phase 1 — Prepare registration

The prepare phase generates:

* the login-server value to fill into the registration form,
* the per-Storage-Provider records,
* the UID needed to commit later.

However, it does **not** immediately write the records to the Storage Providers.

This avoids creating Storage Provider records before the login server account exists.

### Phase 2 — Commit registration

The commit phase writes the prepared records to the Storage Providers.

This phase now runs only after one of these happens:

1. the login server reports that the account was created, or
2. the user manually clicks the fallback confirmation button.

Both automatic and manual confirmation use the same commit function.

---

## Login Server Confirmation Endpoint

I added a new endpoint to the light login server:

```text
GET /upspa/registration-status?account_id=<account_id>
```

Example response:

```json
{
  "account_id": "alice",
  "registered": true
}
```

If the account does not exist yet, the server returns:

```json
{
  "account_id": "alice",
  "registered": false
}
```

This endpoint allows the browser extension to check whether the login server has successfully created the account.

### Modified file

| File                                 | Purpose                                    |
| ------------------------------------ | ------------------------------------------ |
| `demo/light-login-server/server.mjs` | Adds `/upspa/registration-status` endpoint |

---

## Extension-Side Automatic Confirmation

The popup now polls the login server while a pending registration exists.

The flow is:

1. User clicks **Register current site**.
2. Extension prepares registration and fills the website form.
3. Extension saves pending registration state.
4. User submits the website registration form.
5. Extension polls `/upspa/registration-status`.
6. When the login server returns `registered: true`, the extension commits the prepared records to the Storage Providers.
7. The local account mapping is saved.
8. The pending registration state is cleared.

The polling functions added in `popup.ts` are:

* `checkRegistrationConfirmed(...)`
* `commitPendingRegistration(...)`
* `tryAutoConfirmRegistration(...)`
* `startRegistrationConfirmationPolling()`

The manual **Confirm Registration Success** button still exists as a fallback, but it now uses the same `commitPendingRegistration(...)` flow. This avoids duplicate logic.

---

## UpSPA Client Changes

The `UpspaClient` registration logic was updated so that registration can be prepared without immediately committing to the Storage Providers.

### Added methods

```typescript
prepareRegistration(lsj: string, password: string): Promise<RegistrationOut>
```

This generates the registration output but does not write records to the Storage Providers.

```typescript
applyRegistrationToSPs(records: RegistrationSpOut[]): Promise<void>
```

This writes the prepared records to the Storage Providers and checks that at least the threshold number of writes succeeded.

### Updated existing method

```typescript
register(lsj: string, password: string): Promise<RegistrationOut>
```

The original `register` method is kept for compatibility, but internally it now uses the new two-step flow:

```typescript
const out = await this.prepareRegistration(lsj, password);
await this.applyRegistrationToSPs(out.per_sp);
return out;
```

### Modified file

| File                                   | Purpose                                            |
| -------------------------------------- | -------------------------------------------------- |
| `packages/upspa-js/src/upspaClient.ts` | Splits registration into prepare and commit phases |

---

## Shared Extension Action Changes

I added wrapper functions for the extension layer:

```typescript
prepareRegistrationForSite(...)
```

This prepares registration and returns:

* UID
* login-server password value
* prepared Storage Provider records

```typescript
commitRegistrationForSite(...)
```

This commits the prepared records to the Storage Providers.

### Modified file

| File                                            | Purpose                                   |
| ----------------------------------------------- | ----------------------------------------- |
| `packages/extension/src/shared/upspaActions.ts` | Adds prepare/commit registration wrappers |

---

## Files Changed

| File                                                   | Status       | Purpose                                                                   |
| ------------------------------------------------------ | ------------ | ------------------------------------------------------------------------- |
| `packages/upspa-js/src/upspaClient.ts`                 | Modified     | Split registration into prepare and commit phases                         |
| `packages/extension/src/shared/upspaActions.ts`        | Modified     | Added extension wrappers for prepare/commit registration                  |
| `packages/extension/src/shared/pendingRegistration.ts` | Modified/New | Stores recoverable pending registration state                             |
| `packages/extension/src/popup/popup.ts`                | Modified     | Restores pending registration and performs automatic confirmation polling |
| `demo/light-login-server/server.mjs`                   | Modified     | Added login-server registration status endpoint                           |
| `docs/Sina_UpSPA_extension_tasks_2_5_report.md`        | New          | Documents the implementation                                              |

---

## Manual Verification Scenario

A manual verification scenario for the implemented flow is:

1. Start the demo environment.
2. Open the demo registration page.
3. Open the extension popup.
4. Enter the account ID and master password.
5. Click **Register current site**.
6. The extension fills the registration form and saves pending registration state.
7. Submit the website registration form.
8. The extension polls `/upspa/registration-status`.
9. When the login server reports `registered: true`, the extension commits the prepared records to the Storage Providers.
10. Reopen the popup and verify that the account mapping is saved.
11. Open the login page.
12. Use the same account and master password to verify login.

Fallback behavior:

* If automatic confirmation does not run, the manual **Confirm Registration Success** button still works.
* The manual button uses the same commit flow as automatic confirmation.

---

## Build Verification

The following build commands were executed successfully from the repository root:

```bash
npm run build:wasm
npm -w upspa-js run build
npm -w upspa-extension run build
```

The branch was pushed successfully to GitHub:

```text
intern/sina
```

The pull request was opened from `intern/sina` into `main`.

---

## Correctness Notes

The new flow improves correctness in two ways.

First, Storage Provider records are not committed immediately when the registration value is generated. They are only committed after the login server confirms that the account was created.

Second, the pending registration state is recoverable. If the popup is closed and reopened, the extension can still continue the confirmation and commit flow using the stored pending data.

This is safer than the old manual-only flow because it reduces the risk of incomplete registration and inconsistent state.

---

## Security and Privacy Notes

The implementation does not store the master password.

The pending registration state is temporary and stored in session storage. It is cleared after successful commit, when the user locks the extension, or when the pending state expires.

The login-server confirmation endpoint only reports whether a given demo account ID exists on the light login server. It is used for the demo registration flow and does not expose the master password or Storage Provider secrets.

---

## Limitations

The automatic confirmation depends on the login server exposing a compatible status endpoint. For the current demo this is implemented in:

```text
demo/light-login-server/server.mjs
```

For real-world login servers, an equivalent confirmation mechanism would be needed, or the extension would need a different way to detect successful account creation.

Manual confirmation is therefore kept as a fallback.

---

## Conclusion

Task 2 and Task 5 are implemented together as a safer registration flow.

Task 2 ensures that pending registration state can be recovered after popup close/reopen. Task 5 uses that recovered state to automatically complete registration only after the login server confirms account creation.

The final flow is:

```text
prepare registration
→ fill website form
→ save pending state
→ wait for login-server confirmation
→ commit Storage Provider records
→ save account mapping
→ clear pending state
```

This completes the assigned functionality for pending registration recovery and automatic registration confirmation.
