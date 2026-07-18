# Build Process

## Overview

The UpSPA project is organized as a monorepo containing multiple components that are built independently but work together to implement the complete authentication system.

The primary build targets are:

* Browser Extension
* JavaScript/TypeScript SDK
* Rust/WebAssembly libraries
* Storage Provider (Go)

During development, each component can be built separately. However, the browser extension depends on the JavaScript SDK and the WebAssembly package, while the Storage Provider runs as an independent backend service.

## Build Architecture

The overall build dependency can be summarized as follows:

```text
Rust Core (upspa-core)
        │
        V
WebAssembly (upspa-wasm)
        │
        V
JavaScript SDK (packages/upspa-js)
        │
        V
Browser Extension (packages/extension)

--------------------------------------

Storage Provider (Go)
        ▲
        │
Independent Service
```

The browser extension ultimately communicates with the Storage Provider, but they are compiled independently.

## Prerequisites

Before building the project, ensure the required development tools are installed.

The requirements include:

| Tool | Needed for |
|---|---|
| Rust + Cargo | `upspa-core`, `upspa-wasm`, Rust tests |
| `wasm-pack` | Building `packages/upspa-js/wasm-pkg` from Rust/WASM |
| Node.js v20+ | TypeScript, Vite, Vitest, extension build |
| npm or pnpm | Workspaces and package scripts |
| Go | Storage Provider server |
| PostgreSQL (recommended to use v16) | Storage Provider databases |
| Chrome (or another Chromium-based browser) | Loading and using the extension |
| Docker (optional) | Alternative for Postgres and/or test setup |

To install `wasm-pack` (if missing), use:

```bash
cargo install wasm-pack
```

To check versions of the tools:

```bash
rustc --version
cargo --version
node -v
npm -v # or pnpm -v
go version
psql --version
```

## Installing Dependencies

After cloning the repository, install the JavaScript dependencies from the project root.

```bash
npm install
```

Do not run `npm install` inside `packages/upspa-js` or `packages/extension` first. This repository uses `npm` workspaces from the root folder.

If `npm` tries to use a wrong or internal registry, set the public `npm` registry:

```bash
npm config set registry https://registry.npmjs.org/
npm install
```

If another package is accidentally extracted under `packages/`, remove it. One of the common errors is:

```text
EDUPLICATEWORKSPACE: package 'upspa-js' has conflicts
```

Fix it by removing it:

```bash
rm -rf "packages/[new folder]"
```

## Common Build Commands

### Building WASM

```bash
npm run build:wasm
```

This runs:

```bash
bash ./scripts/build_wasm.sh
```

The script generates:

```text
packages/upspa-js/wasm-pkg/
```

Current build script:

```bash
wasm-pack build crates/upspa-wasm \
  --target web \
  --out-dir ../../packages/upspa-js/wasm-pkg \
  --release
```

### Building TypeScript Client

```bash
npm -w upspa-js run build
```

### Buildin Browser Extension

```bash
npm -w upspa-extension run build
```

The unpacked extension output is:

```text
packages/extension/dist
```

The resulting `dist/` directory contains the complete unpacked Chrome extension ready for import into Chromium-based browsers.

### Building the Full Demo

```bash
npm run build:demo
```

This runs:

```text
build WASM -> build JS -> build extension
```

## Running the Development Environment

During development, multiple components run simultaneously.

A typical workflow is:

```text
Browser Extension
        │
        ▼
Storage Provider (Go)
        │
        ▼
Database
```

The browser extension communicates with the Storage Provider through HTTP APIs.

The Storage Provider interacts with the database to retrieve and update encrypted protocol records.
