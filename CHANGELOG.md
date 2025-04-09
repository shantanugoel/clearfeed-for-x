# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]
### Added
- Placeholders for Phase 3 (Local Storage & Analytics).
- Placeholders for Phase 4 (Semantic Analysis).
- Placeholders for Phase 5 (Data Submission).
- Placeholders for Phase 6 (Refinement).
### Changed
- Nothing yet.
### Fixed
- Nothing yet.

## [0.3.0] - 2025-04-09
### Added
- Setting in Options page ("General Settings") to toggle visibility of the modification indicator badge (`Show Indicator Badge on Modified Posts`). Defaults to `true` (visible).
- Modification indicator badge functionality:
    - Badge appears on posts modified by 'hide' or 'replace' rules if the setting is enabled.
    - Badge allows toggling between the original tweet content/visibility and the ClearFeed modified state.
    - Badge remains visible when viewing the original state, allowing re-application of the modification.
    - Specific badge text for hidden tweets ("Un-Hide Tweet" / "Re-Hide Tweet") and replaced text ("Un-ClearFeed it" / "ClearFeed it").

### Changed
- Refined the post hiding mechanism to only hide the core text element (`[data-testid="tweetText"]`) using `display: none`. This prevents interference with rendering of images, videos, and other tweet components.
- Improved visual clarity of the modification indicator badge text (increased size, padding, contrast).

### Fixed
- General settings ("Enable Extension", "Show Indicator Badge") not saving correctly from the Options page.
- Default state for "Show Indicator Badge" not being reflected correctly on the Options page initially.
- Potential rendering issues on unmodified tweets caused by previous, broader DOM manipulation techniques.

## [0.2.0] - 2025-04-09
### Added
- **Background Script:**
    - Implemented storage initialization with default settings and rules on install (`chrome.runtime.onInstalled`).
    - Added message handlers (`GET_ALL_DATA`, `SAVE_SETTINGS`, `SAVE_RULES`) to manage state in `chrome.storage.local`.
- **Options Page (Vanilla JS/HTML/CSS):**
    - Created UI (`options.html`, `options.css`) for displaying settings (enable extension, enable semantic analysis) and rules.
    - Implemented rule management UI (add, edit, delete, toggle enabled).
    - Added logic (`options.ts`) to fetch data from and save data to the background script.
    - Implemented dynamic form updates based on rule type/action.
    - Added Export/Import functionality for rules (JSON format).
- **Content Script:**
    - Implemented fetching settings and rules from the background script (`GET_ALL_DATA`).
    - Added `MutationObserver` to detect new tweets (`article[role="article"]`).
    - Implemented scanning of tweet text (`[data-testid="tweetText"]`) against enabled rules (literal & simple-regex).
    - Added logic to perform text replacement or hiding based on matched rules.
    - Added marker (`data-clearfeed-processed`) to prevent reprocessing tweets.
    - Added listener to re-fetch config when background signals updates.
- **Rule Types:** Added 'literal' and 'simple-regex' matching, OR operator (`|`), case sensitivity, whole word matching.
- **Rule Actions:** Added 'hide' and 'replace' actions with formatted replacement text support (`**bold**`, `*italic*`).
- Renamed project files and references from "Twitter Content Moderator" or "Agenda Revealer" to "ClearFeed for X".
- Updated styling for the Options page footer.

### Fixed
- Initial setup issues.

## [0.1.0] - 2025-04-09
### Added
- Initial project structure setup using `bun` and Vite.
- Configured Vite (`vite.config.ts`) for Chrome extension build (Manifest V3).
- Set up TypeScript configuration (`tsconfig.json`).
- Created initial `manifest.json` in `public/` directory.
- Created placeholder files: `src/background.ts`, `src/content-script.ts`, `src/options/options.html`, `src/options/options.ts`, `src/options/options.css`, `src/types.ts`.
- Added build scripts (`dev`, `build`) to `package.json`.
- Created initial documentation files (`docs/` directory):
    - `UNDERSTANDING.md`, `REQUIREMENTS.md`, `ARCHITECTURE.md`, `API.md`, `PLAN.md`, `IMPLEMENTATION.md`, `CHANGELOG.md`.
- Created `.cursorrules` with project-specific instructions and guidelines.
- Initialized Git repository.

*(Replace YYYY-MM-DD with the current date)* 