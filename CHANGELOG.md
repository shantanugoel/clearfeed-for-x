# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.4.3] - 2025-04-11

### Added

### Changed

### Fixed

### Added
- Placeholders for Phase 3 (Local Storage & Analytics).
- Placeholders for Phase 4 (Semantic Analysis).
- Placeholders for Phase 5 (Data Submission).
- Placeholders for Phase 6 (Refinement).
### Changed
- Nothing yet.
### Fixed
- Nothing yet.

## [0.4.2] - 2025-04-10
### Addred
- Versioning for rules to ease migration when/if there's a format change

## [0.4.1] - 2025-04-10
### Fixed
- Issue where re-applying a modification via the badge ("ClearFeed it") failed for hidden posts (placeholder not recreated) and replaced posts (incorrect state stored).
- Improved error handling for "Extension context invalidated" errors in content script during page navigation/unload.
- Strict URL validation in content script and background script to ensure only standard tweet URLs (`https://x.com/username/status/postId`) are logged for analytics, preventing data from photo pages, notifications, etc.

## [0.4.0] - 2025-04-10
### Added
- **Local Storage:** Implemented storage of flagged post data (`FlaggedPostData`) in `chrome.storage.local` via the background script.
- **Options Page Analytics:**
    - Added setting to enable/disable local logging (defaults to enabled).
    - Added section to display aggregated analytics (Total Actions, Actions by Type, Top Rules, Top Users).
    - Included clickable links to source posts for Top Rules and specific posts for Top Users.
    - Added "Top User" information for each triggered rule.
    - Implemented "Show More" / "Show Less" toggles for Top Rules and Top Users lists (defaults to Top 10).
    - Limited inline display of flagged posts per user to 10, with an indicator if more exist.
    - Added a button to clear all locally stored analytics data.
- **Background Script:**
    - Added message handler (`LOG_FLAGGED_POST`) to receive and store flagged post data, with deduplication based on post URL.
    - Added message handler (`GET_LOCAL_ANALYTICS`) to aggregate stored logs (counts, URLs, top users per rule, timestamps) and return analytics data.
    - Added message handler (`CLEAR_LOCAL_DATA`) to remove data from `chrome.storage.local`.
- **Content Script:**
    - Sends `LOG_FLAGGED_POST` message to background script when a rule is applied (if logging enabled).
    - Collects relevant data (`postId`, `postUrl`, `username`, `matchedRuleId`, etc.) for logging.

### Changed
- Refined post URL extraction in content script to remove extra path segments (e.g., `/analytics`).
- Moved log deduplication logic from content script to background script (checking `postUrl` before storage).

### Fixed
- Prevented artificial inflation of analytics counts by ensuring the same post URL isn't logged multiple times.

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