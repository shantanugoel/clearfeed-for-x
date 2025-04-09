# Implementation Plan: Agenda Revealer Chrome Extension

This document outlines the phased implementation plan for the extension.

## Phase 0: Project Setup & Boilerplate (Version 0.1.0)

*   **Goal:** Establish the basic project structure, build process, and core documentation.
*   **Tasks:**
    *   Initialize project directory.
    *   Set up `bun` as the package manager.
    *   Configure Vite for building a Chrome extension (Manifest V3) with TypeScript.
    *   Create `manifest.json` (basic structure, permissions for `storage`, `scripting`, `tabs`, host permissions for `*://*.twitter.com/*`, `*://*.x.com/*`).
    *   Create basic `background.ts` (service worker) with installation listener to set default settings/rules.
    *   Create basic `content-script.ts` (placeholder, logs message on load).
    *   Create basic `options.html`, `options.ts`, and `options.css` (placeholders).
    *   Set up TypeScript configuration (`tsconfig.json`).
    *   Set up basic CSS structure (e.g., `options.css`).
    *   Create initial documentation files (`UNDERSTANDING.md`, `REQUIREMENTS.md`, `ARCHITECTURE.md`, `API.md`, `PLAN.md`, `IMPLEMENTATION.md`, `CHANGELOG.md`).
    *   Create `.cursorrules` file.
    *   Initialize Git repository.
*   **Outcome:** A loadable (but non-functional) Chrome extension skeleton and foundational documents.

## Phase 1: Core Replacement & Hiding Logic (Version 0.2.0)

*   **Goal:** Implement the primary word/phrase replacement and hiding functionality.
*   **Tasks:**
    *   **Options Page:**
        *   Develop HTML structure (`options.html`) for managing rules (add, edit, delete target/replacement pairs, toggle hide/replace action) and general settings.
        *   Implement CSS (`options.css`) for basic styling.
        *   Write TypeScript/JavaScript (`options.ts`) to handle:
            *   DOM manipulation to render rules and settings.
            *   Event listeners for user interactions (button clicks, input changes).
            *   Sending messages (`GET_ALL_DATA`, `SAVE_RULES`, `SAVE_SETTINGS`) to the Background SW.
            *   Receiving messages (`ALL_DATA`, `RULES_SAVED`, `SETTINGS_SAVED`) from the Background SW and updating the UI.
    *   **Background SW:**
        *   Implement message handlers for loading/saving rules from/to `chrome.storage.sync` (or local).
        *   Store default rules on installation.
        *   Provide rules to Content Script when requested.
    *   **Content Script:**
        *   Implement robust DOM element selection for tweets/posts on Twitter/X.
        *   Use `MutationObserver` to detect dynamically loaded tweets.
        *   Request rules from Background SW.
        *   Iterate through detected tweets and scan their text content for target phrases based on fetched rules.
        *   Implement DOM manipulation logic to perform text replacement or element hiding based on the matched rule's action.
        *   Handle potential errors during DOM manipulation.
        *   Optimize scanning and manipulation for performance.
*   **Outcome:** Extension can replace specified words/phrases and hide tweets based on user-configured rules via the Options page.

## Phase 2: Semantic Analysis Integration (Version 0.3.0)

*   **Goal:** Add the optional semantic analysis feature.
*   **Tasks:**
    *   **Research & Model Selection:**
        *   Choose a suitable lightweight text classification/intent recognition model (e.g., TensorFlow.js model, ONNX model).
        *   Select the appropriate client-side runtime (TensorFlow.js, ONNX Runtime Web).
    *   **Background SW:**
        *   Integrate the chosen model and runtime library.
        *   Implement logic to load the model.
        *   Add message handlers for `REQUEST_SEMANTIC_ANALYSIS` from Content Script.
        *   Implement the analysis function: take text and user-defined intents, run the model, and return matching intents/rules.
        *   Handle model loading errors and analysis errors.
    *   **Options Page:**
        *   Add UI elements to enable/disable semantic analysis globally.
        *   Modify the rule management UI to allow users to define an "intent" (text description) for a rule instead of/alongside a literal phrase.
        *   Add warnings about potential performance impact.
    *   **Content Script:**
        *   Modify logic to check if semantic analysis is enabled for a rule.
        *   If enabled, send `REQUEST_SEMANTIC_ANALYSIS` message to Background SW with tweet text.
        *   Handle `ANALYSIS_RESULT` message and apply replacement/hiding based on the matched intent.
*   **Outcome:** Users can optionally enable semantic analysis to trigger replacements/hiding based on described intents rather than just exact phrases.

## Phase 3: Local Storage & Analytics (Version 0.4.0)

*   **Goal:** Store data about flagged tweets locally and provide basic analytics on the Options page.
*   **Tasks:**
    *   **Background SW:**
        *   Define a structure for storing flagged tweet data (e.g., timestamp, tweetUrl, username, matchedRuleId/identifier, actionTaken) in `chrome.storage.local` (preferred due to potential volume).
        *   Implement logic to save this data whenever a replace/hide action occurs (if local storage is enabled via settings).
        *   Manage storage limits (e.g., implement rotation or capping the number of entries).
        *   Add message handler (`GET_LOCAL_ANALYTICS`) to retrieve and aggregate stored data (e.g., count per rule, count per user).
    *   **Options Page:**
        *   Add a section in `options.html` to display local analytics.
        *   Add a setting toggle to enable/disable local data storage.
        *   Implement logic in `options.ts` to:
            *   Request analytics data (`GET_LOCAL_ANALYTICS`) from the Background SW on load.
            *   Receive `LOCAL_ANALYTICS_DATA` message.
            *   Render the aggregated data (e.g., top 10 rules, top 10 users flagged).
            *   Provide a button/mechanism to clear locally stored data.
*   **Outcome:** Flagged tweet information is stored locally, and basic statistics are viewable on the Options page.

## Phase 4: Data Submission (Version 0.5.0)

*   **Goal:** Implement the optional data submission feature to an external backend.
*   **Tasks:**
    *   **Backend (Conceptual - requires separate implementation):**
        *   Define and implement the `/api/submit` endpoint (e.g., using Loco.rs).
        *   Set up database schema.
        *   Decide on an authentication/authorization mechanism.
    *   **Background SW:**
        *   Modify the logic that saves data locally (from Phase 3) to *also* send data to the backend *if* external submission is enabled and configured.
        *   Use the existing setting for submission (enabled/disabled, auto/manual).
        *   Implement `fetch` logic for the external API.
        *   Handle `SUBMIT_DATA_MANUAL` messages (if manual mode selected).
        *   Handle API responses/errors.
    *   **Options Page:**
        *   Add UI elements to configure external submission settings (enable/disable, auto/manual, potentially backend URL if configurable).
        *   Display status/feedback related to *external* submissions.
    *   **Content Script:**
        *   Modify manual submission button logic (if present) to correctly trigger `SUBMIT_DATA_MANUAL` message, ensuring data is sent externally.
*   **Outcome:** Extension can optionally submit data to a central backend service, leveraging the settings and potentially reusing local storage logic structure.

## Phase 5: Refinement & Polish (Version 0.6.0 / 1.0.0)

*   **Goal:** Improve performance, stability, UX, and prepare for potential release.
*   **Tasks:**
    *   Performance profiling and optimization (content script scanning, DOM manipulation, model inference, local storage access).
    *   Robustness testing against Twitter/X UI changes.
    *   UI/UX improvements on the Options Page.
    *   Add more comprehensive error handling and user feedback.
    *   Code cleanup and refactoring based on `.cursorrules`.
    *   Final testing across different scenarios.
    *   Update documentation.
    *   Prepare for potential publishing to Chrome Web Store (icons, description, privacy policy).
*   **Outcome:** A stable, performant, and user-friendly version of the extension. 