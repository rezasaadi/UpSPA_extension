# Browser Compatibility Report for UpSPA Extension

## Scope

This report evaluates browser compatibility risks for the agile/user-study version of the UpSPA browser extension.

The goal is not to make the extension perfect on every browser. The goal is to identify the minimum browser support plan and the compatibility issues that may block the user study.

Focus areas:

- Chrome as the main target
- Edge as a secondary target if easy
- Whether Firefox should be postponed
- Manifest V3 compatibility
- Service worker / background behavior
- Content-script injection reliability
- Permissions and host permissions
- Browser-specific problems that may block the user study

---

## Current Extension Architecture

The current UpSPA extension is Chrome-oriented and uses the following extension architecture:

- Manifest V3 (`manifest_version: 3`)
- Popup UI through the extension action
- Options page for configuration and SP provisioning
- Background service worker (`src/background/index.ts`)
- Content scripts for detecting and filling login/register forms
- Permissions:
  - `storage`
  - `activeTab`
  - `scripting`
- Host permissions:
  - `<all_urls>`
- Web-accessible resources for built assets
- Message passing between popup, background, and content scripts
- Rust/WASM package used by the TypeScript extension build
- Local demo login servers and Go-based storage provider services

Initial build result:

- `npm -w upspa-js run build`: passed
- `npm -w upspa-extension run build`: passed
- `GO_BIN=/usr/bin/go bash start_demo.sh`: passed
- `curl http://localhost:3000`: returned login server HTML
- `curl http://localhost:8081/v1/health`: returned `{"ok":true}`
- `curl http://localhost:8082/v1/health`: returned `{"ok":true}`
- `curl http://localhost:8083/v1/health`: returned `{"ok":true}`

---

## Tested Browser Matrix

| Browser | Version | Load unpacked | Options / Setup | Register flow | Login flow | Notes |
|---|---:|---|---|---|---|---|
| Chrome | Google Chrome 150.0.7871.46 | Passed | Passed | Partial | Partial / blocked by field-fill issue | Main target; extension loads and core flow works, but content-script username-field selection is a study blocker |
| Edge | TBD | TBD | TBD | TBD | TBD | Secondary target if easy |
| Firefox | TBD | TBD | TBD | TBD | TBD | Likely postponed |

---

## Compatibility Risk Matrix

| Area | Chrome risk | Edge risk | Firefox risk | User-study blocker? | Notes / Recommendation |
|---|---|---|---|---|---|
| Manifest V3 loading | Low | Low/Medium | Medium/High | Yes | Current extension is MV3. Chrome is the safest target. Edge should be similar because it is Chromium-based. Firefox needs separate feasibility check. |
| Background/service worker behavior | Medium | Medium | High | Yes | MV3 service workers are event-driven and can be unloaded when idle, so long-lived in-memory state should not be trusted. |
| Content-script injection / form filling | Medium/High | Medium/High | Medium/High | Yes | Chrome loads and runs the content script, but the demo register/login forms showed incorrect username-field selection. Manual correction makes login succeed, so the issue is field detection rather than crypto/SP failure. This should be fixed or documented before the agile study. |
| Permissions / host permissions | Medium | Medium | Medium | Yes | Current `<all_urls>` is broad but useful for agile testing. For study, host permissions should be narrowed if target sites are known. |
| Popup behavior | Low/Medium | Low/Medium | Medium | Yes | Popup close/reopen behavior is important because registration flow depends on pending state. |
| Options / provisioning flow | Medium | Medium | Unknown | Yes | Setup / Provision must work before the popup can be used. |
| Storage/session behavior | Medium | Medium | Medium/High | Yes | `chrome.storage.session` and local storage behavior must be tested because pending registration depends on it. |
| WASM loading | Medium | Medium | Unknown | Yes | WASM build works in Chrome; must verify Edge. |
| Localhost/demo server compatibility | Medium | Medium | Medium | Yes | User study can be blocked if demo servers, localhost, or firewall/proxy setup fails. |

---

## Chrome Test Checklist

- [x] Chrome version recorded: Google Chrome 150.0.7871.46
- [x] Extension TypeScript/WASM packages build successfully
- [x] Demo login server starts on `http://localhost:3000`
- [x] Storage Providers start on `http://localhost:8081`, `8082`, and `8083`
- [x] Extension loads from `packages/extension/dist`
- [x] Popup opens correctly
- [x] Options page opens correctly
- [x] Setup / Provision SPs works
- [x] Current tab origin is detected
- [x] Register current site starts correctly
- [x] Pending registration does not get stuck after username change while popup remains open
- [x] Delete selected account clears pending registration
- [x] Confirm Registration Success works / automatic confirmation committed registration to Storage Providers
- [ ] Login current site works — automatic fill is blocked by wrong username-field selection; manual correction succeeds
- [x] Lock extension clears session state
- [x] Reloading the extension does not break the basic flow

---

## Edge Test Checklist

- [ ] Extension loads unpacked
- [ ] Popup opens correctly
- [ ] Options page opens correctly
- [ ] Setup / Provision SPs works
- [ ] Register flow starts correctly
- [ ] Content script fills the form
- [ ] Delete/change username flow does not get stuck

---

## Firefox Feasibility Checklist

- [ ] Current dist can be loaded or attempted
- [ ] Manifest compatibility issues identified
- [ ] Background/service worker issues identified
- [ ] Required browser-specific changes estimated
- [ ] Decision: support now or postpone

---

## Recommended Browser Support Plan

TBD after testing.

---

## User Study Blocking Issues

### 1. Register and login form field detection can fill the wrong username field

During Chrome testing on the local demo server, the extension loaded correctly, the popup opened correctly, setup/provisioning worked, and the register/login flows started. However, the content script filled the username-related fields incorrectly.

Observed result during register flow:

- `Main UpSPA UID` was filled with the login-server account ID (`bob`)
- `Login-server UID` stayed as the default value (`alice`)
- Password fields were filled

Observed result during login flow:

- `Main UpSPA UID` was filled with the login-server account ID (`bob`)
- `Login-server UID` stayed as the default value (`alice`)
- Password field was filled

Expected result:

- `Main UpSPA UID` should match the configured global UpSPA UID, for example `test-user`
- `Login-server UID` should match the selected login-server account ID, for example `bob`

Manual correction test:

After manually correcting the login form to:

- `Main UpSPA UID = test-user`
- `Login-server UID = bob`

and keeping the generated password filled by the extension, the login server returned:

- `Login success`
- `Account bob authenticated`

Conclusion:

This suggests that the cryptographic flow, WASM execution, Storage Provider records, and registration commit are working. The blocking issue is the content-script form-field selection logic. This is a user-study blocker because users cannot reliably complete the basic register/login flow unless the form fields are manually corrected or the content-script logic is fixed.

### 2. Pending registration state is cleared when account ID changes while the popup remains open

Chrome testing confirmed that when a registration is pending and the user changes the account ID before confirmation, the extension clears the pending registration state.

Test condition:

- The popup was kept open during the test.
- The user started registration with one account ID.
- Before clicking the website's Register button or confirming the registration, the user changed the account ID in the popup.

Observed message:

- `Pending registration cleared because the account ID was changed.`

This addresses the specific scenario where a user needs to try another username before confirming registration.

Scope note:

This test verifies the account-change behavior while the popup is open. Popup close/reopen behavior is a separate state-recovery scenario and should be tested separately because it depends on session storage restoration.

### 3. Delete selected account clears pending registration state

Chrome testing confirmed that deleting the selected account while a registration is pending clears the pending registration state.

Test condition:

- A registration was started with a temporary account ID.
- The website Register button was not clicked.
- The selected account was deleted from the extension popup before confirmation.

Observed result:

- The pending registration state was cleared after deleting the account.
- The popup did not remain stuck in `Registration pending — waiting for login server confirmation`.

This addresses the scenario where the user tries one username, deletes it, and then chooses another username before confirmation.

### 4. Lock extension clears session state

Chrome testing confirmed that clicking **Lock extension** clears the active extension session state.

Observed result:

- The popup showed: `Extension locked. Enter master password to register, login, or prepare a secret update.`
- The popup did not remain stuck in `Registration pending — waiting for login server confirmation.`

This is important for the agile study because users can recover from a pending or inconsistent state by locking the extension.

---

## Non-blocking Issues to Postpone

TBD after testing.

---

## Final Recommendation

TBD after testing.