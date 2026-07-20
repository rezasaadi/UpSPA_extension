# Extension Import Process

After the browser extension has been built, the generated `dist/` directory inside `packages` directory can be loaded into Google Chrome (or another Chromium-based browser) as an unpacked extension. This process is intended for development and testing, allowing developers to run the latest version of the extension.

Before loading the extension, ensure that:

* the project has been built successfully;
* the `dist/` directory has been generated;
* Google Chrome (or another Chromium-based browser) is installed.

Throughout the guide, it is assumed that Google Chrome is used to load the extension.

## 1. Open the Extensions Page

Open Google Chrome and navigate to:

```text
chrome://extensions/
```

Alternatively:

1. Click the **⋮** (three-dot menu) in the upper-right corner.
2. Select **Extensions**.
3. Click **Manage Extensions**.

## 2. Enable Developer Mode

In the upper-right corner of the Extensions page, enable the **Developer mode** toggle, which reveals additional options for loading and managing unpacked extensions.

## 3. Load the Extension

Click the **Load unpacked** button, which will reveal a file selection dialog.

Navigate to the generated build directory and select:

```text
dist/
```

**Important:** Select the **`dist` folder itself**, **not** one of its subdirectories such as `assets/` or `src/`.

Chrome will read the `manifest.json` file located in the root of the `dist/` directory to register the extension.

## 4. Verify Installation

If the extension is loaded successfully, it should appear in the Extensions page with:

* the extension name,
* version number,
* extension icon,
* enabled status.

If no errors are present, Chrome has successfully loaded the unpacked extension.

## 5. Pin the Extension (Optional)

For easier access:

1. Click the **Extensions** (puzzle piece) icon in the Chrome toolbar.
2. Locate the UpSPA extension.
3. Click the **Pin** icon.

The extension icon will then appear permanently in the browser toolbar.

## 6. Setup the Extension

After loading the extension to Chrome, a setup is needed to set the master password and the Storage Provider (SP).

1. Open the extension.
2. Select **Continue setup**.
3. Enter a synthetic study email/account ID.
4. Create and confirm a study master password of at least six characters.
5. Complete the personal-information checklist.
6. Confirm **Create account**.

The extension will automatically provision one local SP. During this setup process, no server process is required.

## Updating the Extension After Code Changes

Whenever the source code is modified:

1. Rebuild the project to regenerate the `dist/` directory.
2. Return to `chrome://extensions/`.
3. Click the **Reload** button on the UpSPA extension card.

Chrome will reload the extension using the newly generated files.

## Troubleshooting

### "Manifest file is missing"

This error usually indicates that the wrong directory was selected.

Ensure that the selected directory is the root `dist/` folder containing `manifest.json`.

### Build Changes Do Not Appear

If recent code changes are not reflected:

1. rebuild the extension;
2. reload the extension from the Extensions page;
3. refresh any browser tabs where the extension is active.

### Extension Fails to Load

If Chrome reports an error while loading the extension:

* verify that the build completed successfully;
* confirm that `manifest.json` exists in the `dist/` directory;
* inspect the error message shown on the Extensions page;
* open the extension's service worker console for debugging (if necessary).
