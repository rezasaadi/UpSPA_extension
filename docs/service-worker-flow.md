# Service Worker Flow

## Overview

The background service worker is the central coordinator of the UpSPA browser extension. It manages the extension's lifecycle, maintains shared application state, coordinates communication between the popup and content scripts, and invokes the UpSPA client library to execute protocol operations.

Unlike the popup (collects user input) or the content script (interacts with webpage elements), the service worker contains the majority of the extension's application logic.

## Responsibilities

The service worker acts as the control plane for the entire browser extension. Its responsibilities include:

* initializing the extension during installation and startup;
* maintaining global extension state;
* creating and managing `UpspaClient` instances;
* coordinating registration, authentication, and secret update workflows;
* handling extension-wide locking and unlocking;
* opening browser tabs required during protocol execution;
* receiving and responding to runtime messages;
* forwarding requests to content scripts when webpage interaction is required;
* managing alarms and persistent storage.

## High-Level Execution Flow

```text
User
 │
 V
Popup
 │
 V
Background Service Worker
 │
 ├── Load extension state
 ├── Create UpspaClient
 ├── Execute protocol
 ├── Contact Storage Providers
 ├── Coordinate browser actions
 └── Send messages to content script
 │
 V
Content Script
 │
 V
Web Page
```

## Position in the Extension Architecture

The background service worker is the only component that has knowledge of both the extension state and the protocol execution state.

```text
                    Popup
                      │
                      │ runtime messages
                      V
            Background Service Worker
          ┌───────────┼────────────┐
          │           │            │
          V           V            V
     Extension    UpspaClient   Browser APIs
      Storage         │
                      V
               Storage Providers
                      │
                      V
          Login Server (via webpage)

                      Λ
                      │ tab messages
                      V
               Content Script
                      │
                      V
                   Web Page
```

## Initialization

When the browser loads the extension, the background service worker registers its event listeners.

Initialization includes:

* loading extension configuration;
* restoring persisted state;
* registering runtime message handlers;
* registering alarm listeners;
* preparing protocol-related services.

No UpSPA protocol is executed during startup. Instead, the service worker waits until a user initiates an operation from the popup.

## Runtime Message Handling

The primary responsibility of the background service worker is processing runtime messages originating from other extension components.

Typical message sources include:

* popup
* content scripts
* options page

Each incoming message is dispatched to the appropriate handler.

Depending on the request, the handler may:

* access extension storage;
* create or reuse an `UpspaClient`;
* contact one or more Storage Providers;
* request DOM interaction through a content script;
* update extension state;
* return a response to the caller.

This message-driven design keeps the browser extension modular while avoiding duplicated protocol logic.

## Protocol Coordination

The UpSPA protocol is not executed by the popup or the content script. Instead, the service worker coordinates the protocol by:

1. receiving a user request;
2. validating the current extension state;
3. constructing or retrieving an `UpspaClient`;
4. invoking the required protocol operation;
5. forwarding results to the appropriate browser component.

The protocol implementation itself resides within the shared UpSPA client library, while the service worker manages when and how those operations are invoked.

This separation closely follows the architecture described in the UpSPA paper, where browser-side software coordinates protocol execution while existing login servers remain unchanged.

## Browser Coordination

Certain protocol stages require interaction with browser features beyond the webpage itself.

The service worker coordinates operations such as:

* creating new tabs;
* redirecting current tab;
* tracking pending protocol state;
* receiving completion callbacks;
* handling browser alarms;
* locking extension state after inactivity.

Centralizing these responsibilities allows the popup and content scripts to remain focused on user interaction and webpage manipulation.

## Communication with the Content Script

Whenever webpage interaction is required, the service worker sends messages to the content script running in the active tab.

Typical requests include:

* extract password policy;
* populate registration forms;
* populate login forms;
* populate password-change forms.

The content script performs the requested DOM operation and returns the result to the service worker.
