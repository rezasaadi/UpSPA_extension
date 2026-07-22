# Popup Flow

## Overview

The popup serves as the primary user interface of the UpSPA browser extension. It allows users to configure account information, manage their master password, inspect and modify password policies, and manually trigger the major protocol operations supported by UpSPA.

Unlike a passive status display, the popup acts as the entry point for user-initiated actions. Each operation is initiated through the popup interface and subsequently handled by the extension's internal components, including the background service worker, content scripts, and the UpSPA client library.

## Responsibilities

The popup is responsible for:

* displaying the origin of the currently active browser tab,
* managing known account identifiers for the current website,
* accepting the user's master password,
* displaying and editing password policy information,
* initiating registration and authentication workflows,
* initiating secret update workflows,
* locking the current extension session,
* opening the extension's Options page.

The popup itself does **not** implement the UpSPA protocol. Instead, it collects user input and initiates protocol execution through the extension's internal architecture.

## User Interface Layout

The popup is organized into several functional sections with different layouts.

```text
Popup
├── Current Website
├── Account Management
├── Master Password
```

Each section corresponds to a specific stage of the user's interaction with the extension.

### Current Website

When the popup is opened, it identifies the currently active browser tab and displays its origin.

This origin determines which website the subsequent operations (registration, login, and secret updates) will target.

If the website is supported, the extension will display its status below the dashboard title.

Example:

```text
Google / Gmail is ready to use with UpSPA.
```

If the website is not supported, it will show this instead:

```text
Website not supported
─────────────────────
UpSPA is not available on [website address] yet.
```

### Account Management

When a supported website is opened, the popup displays a list of known account identifiers associated with the current website.

The user can:

* enter a new account identifier,
* select an existing account (if any),
* update an existing account (if any),
* delete an existing account (if any).

These controls allow the extension to support multiple accounts for the same website.

### Master Password

The master password is required before performing protocol operations such as registration or authentication.

The popup provides a dedicated password field for entering the user's master password when the user do the aforementioned interactions.
