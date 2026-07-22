# Content Script Flow

## Overview

The content script provides the browser extension's interface to web pages. It is injected into supported websites and operates directly on the Document Object Model (DOM), allowing the extension to inspect login forms, detect password requirements, and populate form fields during protocol execution.

Unlike the popup or the Storage Provider, the content script does not execute the UpSPA protocol itself. It instead translates protocol outputs (e.g. generated credentials) into concrete interactions with the webpage.

This separation follows the designed architecture, where the browser-side component communicates with the login page while the cryptographic protocol is executed by the UpSPA client library and Storage Providers.

## Responsibilities

The content script is responsible for:

* locating visible username and password fields;
* extracting password-policy hints from the webpage;
* filling registration forms;
* filling login forms;
* filling password-change forms;
* responding to requests sent by other extension components.

It never derives passwords or communicates directly with Storage Providers.

## General Flow

The content script follows a request-response model.

```text
Popup / Background
        │
chrome.runtime.sendMessage(...)
        │
        V
Content Script
        │
        ├── Inspect DOM
        ├── Detect Inputs
        ├── Fill Forms
        ├── Extract Password Policy
        │
        V
Return Result
```

Rather than initiating operations itself, it waits until another component sends a message requesting a specific action.

## Form Discovery

Before interacting with a webpage, the content script searches for visible and editable HTML input elements.

Invisible fields, hidden inputs, disabled controls, and read-only elements are ignored to avoid modifying unintended form elements.

Password fields are collected in their visual document order so that the extension can distinguish between:

* login forms,
* registration forms,
* password-change forms.

## Username Detection

Instead of relying on a single selector, the content script searches for multiple common username fields, including:

* `autocomplete="username"`
* email fields
* login fields
* user fields
* phone/mobile fields

If multiple candidates exist, the field immediately preceding the password input is preferred. Otherwise, the first suitable visible text input is selected. This heuristic enables the extension to work across websites with different form structures.

## Registration Flow

When another extension component requests a registration operation (`UPSPA_FILL_REGISTER`), the content script:

1. locates visible password fields;
2. identifies an appropriate username field;
3. fills the username with the selected account identifier;
4. fills the password field(s) with the generated password.

If a registration form contains both a password and a confirmation field, both receive the same generated password.

This corresponds to the registration phase of the UpSPA protocol, where a site-specific password has already been derived by the UpSPA client and must now be submitted to the login server. The UpSPA protocol focuses on generating and protecting this credential; the content script performs the final browser-side insertion into the webpage.

## Authentication Flow

For authentication (`UPSPA_FILL_LOGIN`), the content script:

1. locates the username field;
2. locates the password field;
3. fills both inputs with the provided credentials.

No password derivation occurs here; the supplied password has already been reconstructed through the UpSPA protocol. The content script simply transfers those values into the webpage.

## Password Change Flow

For password updates (`UPSPA_FILL_PASSWORD_CHANGE`), the content script expects a password-change form containing at least the current password and a new password.

The first password field receives the old credential, while every remaining password field receives the newly generated credential. This supports common password-change forms that require users to confirm the new password.

From the protocol perspective, this browser interaction supports the UpSPA secret/password update workflow by submitting both the existing and newly generated credentials to the login server after the cryptographic update has been completed.

## Password Policy Extraction

The content script can also analyze the current webpage to infer password requirements.

The information is collected from:

* HTML attributes (`minlength`, `maxlength`, `pattern`);
* associated labels;
* placeholder text;
* ARIA descriptions;
* surrounding form text.

Other natural-language hints are also being used, such as:

* "at least 12 characters",
* "must contain a number",
* "no spaces",

These rules are converted into structured password-policy hints. Evidence describing each detected rule is also returned to aid debugging and manual verification.

This functionality extends the browser implementation beyond the protocol described in the UpSPA paper, improving compatibility with websites that enforce diverse password policies.

## Message Handling

The content script exposes four message handlers:

* `UPSPA_EXTRACT_PASSWORD_POLICY`
* `UPSPA_FILL_REGISTER`
* `UPSPA_FILL_LOGIN`
* `UPSPA_FILL_PASSWORD_CHANGE`

Each handler performs the requested DOM operation and returns a structured response indicating success or failure.
