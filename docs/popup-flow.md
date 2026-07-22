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

## High-Level Flow

From the user's perspective, interaction with the popup follows this sequence:

```text
Open Popup
      │
      V
Identify Current Website
      │
      V
Select or Create Account
      │
      V
Enter Master Password
      │
      V
Choose an Operation
      ├───────────── Register
      ├───────────── Login
      ├───────────── Secret Update
      └───────────── Password Policy Detection
      │
      V
Display Status
```

The popup acts as the starting point for user-driven operations while delegating protocol execution to the underlying UpSPA implementation.

## User Interface Layout

The popup is organized into several functional sections with different layouts.

```text
Popup
├── Current Website
├── Account Management
├── Master Password
├── Password Policy
├── Registration
├── Authentication
├── Secret Update
├── Status
└── Extension Controls
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

### Password Policy

The popup includes a password policy editor.

Users may:

* detect a website's password policy,
* manually inspect the detected policy,
* modify policy constraints if necessary.

The editable policy includes:

* minimum password length,
* maximum password length,
* uppercase requirement,
* lowercase requirement,
* digit requirement,
* symbol requirement,
* whitespace restrictions,
* allowed symbols,
* forbidden substrings.

The interface also provides an evidence field that records information used when detecting the website's password policy.

## Registration Flow

The popup allows users to register the current website with UpSPA.

The registration workflow consists of two stages:

1. Register Current Site
2. Confirm Registration Success

The confirmation button is initially disabled and becomes available only after the registration process reaches the appropriate stage. This separation allows the extension to coordinate its local protocol state with the outcome of the website's registration process.

## Authentication Flow

Authentication is initiated by the **Login current site** button.

When selected, the popup provides the account identifier for the confirmation and waits for the master password input from the user. Once the master password is entered, the extension begins the UpSPA authentication workflow for the currently active website using the selected account identifier and the supplied master password.

## Secret Update Flow

The popup supports updating an existing secret without requiring a new registration.

This workflow consists of three separate actions:

1. Prepare secret update
2. Commit secret update after website success
3. Cancel secret update

The commit and cancel operations are initially disabled and become available only after a secret update has been prepared. This staged design helps ensure that local protocol state remains synchronized with the outcome of the corresponding website operation.

## Status Display

A dedicated status panel provides feedback regarding the outcome of extension operations.

Examples include:

* successful registration,
* authentication status,
* validation errors,
* protocol failures,
* operation progress.

The status area provides immediate feedback without requiring users to inspect browser developer tools.

## Extension Controls

The popup also provides other utility actions:

* **Lock extension** — clears or locks the current session, requiring the user to re-enter their master password before performing protected operations.
* **Open Options** — opens the extension's options page, where users can configure global extension settings.
