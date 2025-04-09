# ClearFeed for X

ClearFeed for X is a browser extension that allows you to filter and modify content on X.com (formerly Twitter) based on your own custom rules.

## Features

*   **Define Rules:** Create rules to target specific words, phrases, or simple patterns.
*   **Actions:** Choose to replace matched text (with optional bold/italic formatting) or hide the entire post.
*   **Matching Options:**
    *   Literal text matching.
    *   Simple Regex: Use `*` for word characters, `?` for single characters.
    *   Alternatives: Use `|` to match multiple targets in one rule.
    *   Case sensitivity toggle.
    *   "Match whole word only" option.
*   **Import/Export:** Backup and share your rules using JSON import/export.
*   **(Planned)** Semantic analysis to match based on intent.
*   **(Planned)** Local analytics to see which rules are triggering.
*   **(Planned)** Optional data submission to a global database.

## Installation

1.  **(Prerequisite)** Have `bun` installed (https://bun.sh/).
2.  Clone this repository (or download the source).
3.  Navigate to the project directory in your terminal.
4.  Run `bun install` to install dependencies.
5.  Run `bun run build` to create the production build in the `dist/` directory.
6.  Open Chrome and go to `chrome://extensions/`.
7.  Enable "Developer mode" (usually a toggle in the top right).
8.  Click "Load unpacked".
9.  Select the `dist` directory from this project.
10. The ClearFeed for X icon should appear in your toolbar.

## Development

*   Run `bun run dev` to start Vite in watch mode. It will rebuild the extension into the `dist` directory automatically when you save changes.
*   After the initial build, you may need to reload the extension in `chrome://extensions/` to see changes apply.

## Author

Created by **Shantanu Goel**
*   X/Twitter: [@shantanugoel](https://x.com/shantanugoel)
*   GitHub: [shantanugoel](https://github.com/shantanugoel)
*   Website: [shantanugoel](https://shantanugoel.com)