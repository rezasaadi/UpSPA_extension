# Folder Structure

## Overview

This project has multiple related components, but is developed under a single repository. The project structure can be viewed as four major parts:

1. Browser-side implementation
2. Core UpSPA libraries
3. Storage Provider service
4. Development and deployment utilities

```text
.
├── crates/
├── demo/
├── docker/
├── docs/
├── packages/
├── scripts/
├── services/
└── tools/
```

## Top-Level Directories

### `crates/`

This directory contains the Rust implementation of the UpSPA core. It represents the cryptographic and protocol foundation of the project.

* `upspa-cli/`

  * Command-line interface for development and testing.
  
* `upspa-core/`

  * Core protocol implementation.
  * Cryptographic primitives.
  * Protocol logic shared by other components.

* `upspa-wasm/`

  * WebAssembly wrapper around the Rust implementation.
  * Allows browser-based TypeScript code to use the Rust protocol implementation.

### `packages/`

This directory contains TypeScript files.

#### `extension/`

The files under this folder implement the browser extension, which is the component users directly interact with.

The files functions include:

* popup UI
* content scripts
* background/service worker
* interaction with websites
* calling the UpSPA library
* communicating with the Storage Provider

#### `upspa-js/`

The folder includes JavaScript SDK which is used by the extension.

Its responsibilities include:

* exposing protocol APIs
* wrapping WebAssembly functionality
* providing a JavaScript-friendly interface
* coordinating protocol execution

Rather than implementing protocol logic directly inside the extension, the extension delegates protocol operations to this package.

### `services/storage-provider-go/`

This directory contains the Storage Provider, which is implemented in Go. The Storage Provider is one of the three primary entities in the UpSPA architecture.

The service is responsible for:

* exposing HTTP APIs
* executing TOPRF-related operations
* storing encrypted user records
* processing registration requests
* handling password updates
* managing protocol state

Unlike a traditional authentication server, the Storage Provider never learns the user's master password and does not authenticate users directly. Instead, it stores encrypted protocol state, participates in threshold cryptographic protocol execution, and assists users in reconstructing the secrets required for authentication.

The service exposes REST APIs that are consumed by the browser extension (through the UpSPA client library) during setup, registration, authentication, secret update, and password update.

#### `internal/`

This directory contains the actual implementation of the Storage Provider.

Following Go conventions, packages inside `internal/` are intended for internal use by this service and are not imported by external projects.

##### `internal/api/`

The files under this directory implements the HTTP API.

This package defines the request handlers corresponding to the protocol operations described in the UpSPA paper.

Typical endpoints include:

* Setup
* Registration support
* TOPRF evaluation
* Password Update
* Record retrieval
* Health checks

The API layer is responsible for:

* decoding HTTP requests
* validating inputs
* invoking business logic
* encoding HTTP responses

It should remain relatively lightweight, delegating most processing to lower layers.

##### `internal/crypto/`

The files under this directory implements the cryptographic implementation used by the Storage Provider.

Its responsibilities include:

* TOPRF-related operations
* cryptographic key handling
* authenticated encryption utilities
* hashing
* digital signature support
* helper cryptographic functions

This package implements the primitives required by the UpSPA protocol while keeping them isolated from the API layer.

##### `internal/db/`

The files under this directory implements the database abstraction layer, which is responsible for communicating with the persistent storage.

Typical responsibilities include:

* opening database connections
* executing queries
* storing encrypted records
* retrieving protocol state
* updating user records
* transaction handling

##### `internal/model/`

The files under this directory defines the application's data structures, such as:

* database entities
* request models
* response models
* protocol records
* shared data types

These structures are used across multiple packages to ensure a consistent representation of protocol data.

### `scripts/`

This folder contains helper script for local development.

These scripts automate common tasks such as:

* starting development services
* initializing databases
* running migrations
* testing
* local deployment

### `demo/`

This folder contains demonstration applications.

It currently includes a lightweight login server used for development and testing.

The demo allows developers to execute the full UpSPA workflow without integrating with an external website.

### `docker/`

This folder contains Docker-related deployment resources, which simplify running the Service Provider (particularly the PostgreSQL) and/or the website test in a reproducible development environment.

### `docs/`

This folder contains project documentation, which complements the research paper by explaining implementation details.

### `tools/`

This folder contains developer tool, which is currently used as one of the starting points for contributors in setting up the project for development.
