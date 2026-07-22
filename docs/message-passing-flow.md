# Message Passing Flow

## Overview

The UpSPA browser extension is composed of several isolated execution contexts:

* Popup
* Background Service Worker
* Content Script
* Web Page

Because these components execute in different browser contexts, they cannot directly access one another's variables or functions. Instead, they communicate through Chrome's messaging APIs.

The background service worker serves as the central communication hub. Nearly all coordination between extension components passes through it, allowing protocol execution, browser interaction, and webpage manipulation to remain cleanly separated.

## Communication Architecture

The overall communication architecture is illustrated below.

```text
                         User
                           │
                           V
                       Popup UI
                           │
              chrome.runtime.sendMessage()
                           │
                           V
              Background Service Worker
                           │
          ┌────────────────┼────────────────┐
          │                │                │
          │                │                │
          V                V                V
   chrome.storage     UpspaClient    chrome.tabs API
                           │
                           │
                chrome.tabs.sendMessage()
                           │
                           V
                    Content Script
                           │
                           V
                       Web Page
```

The service worker coordinates all extension components in the background and determines which actions should be performed in response to incoming requests.

## Purpose of Message Passing

Chrome extensions isolate each execution context for security reasons. For example:

* the popup cannot manipulate webpage DOM elements;
* the content script cannot directly access popup state;
* webpages cannot call extension APIs;
* the service worker has no direct access to webpage elements.

Instead, each component performs the tasks it is designed for and communicates through structured messages. This separation improves both security and maintainability.

## Popup -> Background

Most user-initiated operations begin in the popup. Examples include:

* Registration
* Authentication
* Secret Update
* Lock Extension
* Password Policy Detection

When the user clicks one of these buttons, the popup gathers the required information (e.g. the selected account or master password) and sends a runtime message to the background service worker.

```text
User clicks "Register"
            │
            V
          Popup
            │
chrome.runtime.sendMessage(...)
            │
            V
        Background
```

The popup does not execute the UpSPA protocol itself, it instead delegates protocol execution to the background service worker.

## Background Processing

After receiving a message, the background service worker determines which operation should be performed. Depending on the request, it may:

* load extension configuration;
* retrieve persistent state from `chrome.storage`;
* create or reuse an `UpspaClient`;
* contact one or more Storage Providers;
* update protocol state;
* communicate with the content script.

Because all protocol coordination occurs in the background, the popup remains lightweight and focused solely on user interaction.

## Background -> Content Script

Certain operations require interacting with the current webpage, such as:

* filling login forms;
* filling registration forms;
* filling password-change forms;
* extracting password policies.

Since the background cannot access the DOM directly, it forwards these requests to the content script running in the active browser tab.

```text
Background
      │
chrome.tabs.sendMessage(...)
      │
      V
Content Script
```

The content script performs the requested DOM operation and returns the result to the background.

---

## Content Script -> Background

After completing the requested action, the content script returns a structured response. Typical responses include:

* success or failure;
* detected password policy;
* webpage information;
* form detection results.

The background uses this information to determine the next step in the protocol before responding to the popup.

## Browser Storage

The background service worker is responsible for managing extension-wide state.

Rather than allowing every component to manipulate storage independently, requests involving persistent data are centralized in the background.

Typical stored information includes:

* configured accounts;
* Storage Provider configuration;
* pending protocol state;
* extension preferences;
* session lock state.

Centralizing storage access reduces duplication and helps maintain a consistent application state.

## Relation to the UpSPA Protocol

The UpSPA protocol defines the browser as the user's protocol participant but does not prescribe how browser extension components communicate internally.

The implementation therefore separates responsibilities as follows:

* Popup –> collects user input.
* Background Service Worker –> coordinates protocol execution.
* Content Script –> interacts with webpage forms.
* UpSPA Client –> executes the cryptographic protocol.
* Storage Providers –> perform protocol-specific server operations.

This layered architecture allows browser-specific functionality to remain independent of the protocol implementation while preserving the protocol defined in the paper.
