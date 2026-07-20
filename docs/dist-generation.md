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

## Loading into Browser

The browser loads the extension from the generated `dist/` directory rather than from the source directory.

Before loading the extension, ensure that:

* the project has been built successfully;
* the `dist/` directory has been generated;
* Google Chrome (or another Chromium-based browser) is installed.

Throughout the guide, it is assumed that Google Chrome is used to load the extension.

### 1. Open the Extensions Page

Open Google Chrome and navigate to:

```text
chrome://extensions/
```

Alternatively:

1. Click the **⋮** (three-dot menu) in the upper-right corner.
2. Select **Extensions**.
3. Click **Manage Extensions**.

### 2. Enable Developer Mode

In the upper-right corner of the Extensions page, enable the **Developer mode** toggle, which reveals additional options for loading and managing unpacked extensions.

### 3. Load the Extension

Click the **Load unpacked** button, which will reveal a file selection dialog.

Navigate to the generated build directory and select:

```text
dist/
```

**Important:** Select the **`dist` folder itself**, **not** one of its subdirectories such as `assets/` or `src/`.

Chrome will read the `manifest.json` file located in the root of the `dist/` directory to register the extension.

### 4. Verify Installation

If the extension is loaded successfully, it should appear in the Extensions page with:

* the extension name,
* version number,
* extension icon,
* enabled status.

If no errors are present, Chrome has successfully loaded the unpacked extension.

### 5. Pin the Extension (Optional)

For easier access:

1. Click the **Extensions** (puzzle piece) icon in the Chrome toolbar.
2. Locate the UpSPA extension.
3. Click the **Pin** icon.

The extension icon will then appear permanently in the browser toolbar.

### 6. Setup the Extension

After loading the extension to Chrome, a setup is needed to set the master password and the Storage Provider (SP).

1. Open the extension.
2. Select **Continue setup**.
3. Enter a synthetic study email/account ID.
4. Create and confirm a study master password of at least six characters.
5. Complete the personal-information checklist.
6. Confirm **Create account**.

The extension will automatically provision one local SP. During this setup process, no server process is required.

### Updating the Extension After Code Changes

Whenever the source code is modified:

1. Rebuild the project to regenerate the `dist/` directory.
2. Return to `chrome://extensions/`.
3. Click the **Reload** button on the UpSPA extension card.

Chrome will reload the extension using the newly generated files.

## Notes

* Do not manually edit files inside `dist/`, as they may be overwritten during the next build.
* Always modify the source files in `packages/extension/`.
* Rebuild the extension after making changes so that the generated output reflects the latest source code.
* If the browser is already loading the extension, reload it after rebuilding so the updated files are used.
