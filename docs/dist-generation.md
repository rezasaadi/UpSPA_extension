# `dist/` Folder Generation

## Overview

The `dist/` directory is the final output of the browser extension build process. It contains the compiled, bundled, and production-ready version of the extension that can be loaded directly into Google Chrome or any Chromium-based browser.

Developers do **not** edit files inside `dist/` manually. If there are any changes regarding the extension needed to be made, it should be made in the `packages/extension/` directory. Running the build process regenerates the `dist/` directory from the source files.

## Purpose of the `dist/` Directory

The source code of the browser extension is written using modern development tools such as TypeScript and JavaScript modules. Chrome, however, expects an unpacked extension consisting of compiled JavaScript files, a valid extension manifest, and static assets.

Therefore, the generated `dist/` directory serves as the distributable version of the extension. The build process transforms the development source into this deployable format.

## Generation Process

The `dist/` folder is created automatically during the extension build process.

The build system performs several tasks:

1. Compile TypeScript source files into JavaScript.
2. Bundle application modules and their dependencies.
3. Copy static assets (icons, HTML pages, stylesheets, etc.).
4. Generate or copy the extension manifest (`manifest.json`).
5. Produce optimized files ready for execution in the browser.

The result is a self-contained directory that the browser can load as an unpacked extension.

The overall process can be summarized as follows:

```text
Source Code (TypeScript)

        │
        V

Build Tool

        │
        ├── Compile TypeScript
        ├── Bundle Modules
        ├── Copy Assets
        ├── Generate Manifest
        └── Optimize Output

        │
        V

dist/
```

## Folder Contents

The generated `dist/` directory contains the complete unpacked browser extension that can be loaded directly into the browser.

```text
dist/
├── assets/
├── manifest.json
├── embedded-panel.html
├── service-worker-loader.js
└── src/
    ├── options/
    │   └── options.html
    └── popup/
        └── popup.html
```

### `assets/`

This directory contains the compiled and bundled application code produced during the build process.

Instead of preserving the original source filenames, the build tool generates hashed filenames (e.g. `popup.html.7f01dfa6.js`). The appended hash uniquely identifies the generated build artifact. Whenever the source code changes, a new filename is produced, allowing browsers to distinguish updated files from cached versions.

In addition to JavaScript bundles, this directory also contains:

* CSS files generated from the source stylesheets,
* source map (`.map`) files for debugging,
* the compiled WebAssembly (`.wasm`) module.

### `manifest.json`

The extension manifest describing:

* extension metadata,
* permissions,
* popup page,
* content scripts,
* background service worker,
* web-accessible resources.

The browser reads this file first when loading the extension.

### `service-worker-loader.js`

The Bootstrap script which is responsible for loading the extension's background service worker.

Rather than containing all application logic itself, it initializes the compiled background script generated during the build process.

### `embedded-panel.html`

An HTML page bundled with the extension that can be injected or displayed by extension components when required by the application.

### `src/`

Although the source TypeScript files are compiled into the `assets/` directory, the generated package also contains HTML entry pages under `src/`.

```text
src/
├── popup/
│   └── popup.html
└── options/
    └── options.html
```

These HTML files act as entry points for the popup and options pages and reference the compiled JavaScript and CSS bundles located in the `assets/` directory.

## When Should `dist/` Be Regenerated?

The `dist/` folder is regenerated whenever the extension is rebuilt.

Typical situations include:

* after modifying TypeScript source code,
* after changing HTML or CSS resources,
* after updating extension configuration,
* after modifying static assets.

Depending on the build configuration, the build tool may either recreate the entire directory or update only the files that have changed.

## Notes

* Do not manually edit files inside `dist/`, as they may be overwritten during the next build.
* Always modify the source files in `packages/extension/`.
* Rebuild the extension after making changes so that the generated output reflects the latest source code.
* If the browser is already loading the extension, reload it after rebuilding so the updated files are used.
