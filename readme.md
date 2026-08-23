# Joplin Published Notes Panel

A Joplin plugin that provides a clean, dedicated sidebar panel to track, search, and manage all your publicly shared notes in one place.

## Features

* **Unified Dashboard:** Quickly view all your shared notes without hunting through your notebook tree.
* **Smart Categorization:** Works around Joplin's internal sharing logic by splitting your notes into two clear sections:
  * **🌐 Direct Shares:** Notes explicitly published via a public link.
  * **📁 In Shared Notebooks:** Notes that inherit their sharing status from a collaborative/shared parent notebook.
* **Instant Unshare:** A built-in "Unshare" button allows you to instantly revoke public access to any note directly from the panel.
* **Search & Sort:** Easily filter your shared notes by title or notebook path, and sort them alphabetically or by modification date.
* **Full Notebook Paths:** Displays the complete notebook hierarchy for context (e.g., `Projects / Active / Web Design`).

## Installation

1. Open Joplin and navigate to **Tools > Options > Plugins**.
2. Search for `Published Notes Panel` and click Install.
3. Restart Joplin.

*(Alternatively, you can download the `.jpl` file from the [Releases](link-to-your-releases) page and install it manually via the gear icon in the Plugins menu).*

## Usage

* Toggle the panel visibility by clicking the **Share icon (fas fa-share-alt)** in the toolbar.
* Alternatively, go to **View > Toggle Published Notes Panel** from the main menu.
* Click on any note title in the panel to instantly open it in your main editor.
* Use the "Refresh" button to sync the panel if you've recently shared or unshared notes outside the panel.

## License

MIT