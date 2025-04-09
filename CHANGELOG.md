# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Placeholders for Phase 2 (Enhanced Matching & Replacement).
- Placeholders for Phase 3 (Local Storage & Analytics).
- Placeholders for Phase 4 (Semantic Analysis).
- Placeholders for Phase 5 (Data Submission).
- Placeholders for Phase 6 (Refinement).

## [0.2.0] - 2024-07-26

### Added
- **Background Script:**
    - Implemented storage initialization with default settings and rules on install (`chrome.runtime.onInstalled`).
    - Added message handlers (`GET_ALL_DATA`, `SAVE_SETTINGS`, `SAVE_RULES`) to manage state in `chrome.storage.sync`.
- **Options Page (Vanilla JS/HTML/CSS):**
    - Created UI (`options.html`, `options.css`) for displaying settings (enable extension, enable semantic analysis) and rules.
    - Implemented rule management UI (add, edit, delete, toggle enabled).
    - Added logic (`options.ts`) to fetch data from and save data to the background script.
    - Implemented dynamic form updates based on rule type/action.
- **Content Script:**
    - Implemented fetching settings and rules from the background script (`GET_ALL_DATA`).
    - Added `MutationObserver` to detect new tweets (`article[role="article"]`).
    - Implemented scanning of tweet text (`[data-testid="tweetText"]`) against enabled literal rules.
    - Added logic to perform text replacement (`textContent`) or hiding (`display: none`) based on matched rules.
    - Added marker (`data-agenda-revealer-processed`) to prevent reprocessing tweets.
    - Added listener to re-fetch config when background signals updates (basic implementation).

## [0.1.0] - 2024-07-26

### Added
- Initial project structure setup using `bun` and Vite.
- Configured Vite (`vite.config.ts`) for Chrome extension build (Manifest V3).
- Set up TypeScript configuration (`tsconfig.json`).
- Created initial `manifest.json` in `public/` directory.
- Created placeholder files: `src/background.ts`, `src/content-script.ts`, `src/options/options.html`, `src/options/options.ts`, `src/options/options.css`, `src/types.ts`.
- Added build scripts (`dev`, `build`) to `package.json`.
- Created initial documentation files (`docs/` directory):
    - `UNDERSTANDING.md`: Project goals and core functionality.
    - `REQUIREMENTS.md`: Functional and non-functional requirements.
    - `ARCHITECTURE.md`: Component overview, data flow, and tech stack (updated for Vanilla JS options page).
    - `API.md`: Internal messaging and external API definitions.
    - `PLAN.md`: Phased implementation plan (updated for Vanilla JS and local analytics phase).
    - `IMPLEMENTATION.md`: Initial high-level implementation details (updated for Vanilla JS and local analytics).
    - `CHANGELOG.md`: This changelog file.
- Created `.cursorrules` with project-specific instructions and guidelines.
- Initialized Git repository.

*(Replace YYYY-MM-DD with the current date)* 