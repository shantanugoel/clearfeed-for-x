# Implementation Plan: Agenda Revealer Chrome Extension

This document outlines the phased implementation plan for the extension.

## Phase 0: Project Setup & Boilerplate (Version 0.1.0)

*   **Goal:** Establish the basic project structure, build process, and core documentation.
*   **Tasks:**
    *   Initialize project directory.
    *   Set up `bun` as the package manager.
    *   Configure Vite for building a Chrome extension (Manifest V3) with TypeScript.
    *   Create `manifest.json` (basic structure, permissions for `storage`, `scripting`, `tabs`, host permissions for `*://x.com/*`).
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
        *   Implement robust DOM element selection for posts on X.com.
        *   Use `MutationObserver` to detect dynamically loaded posts.
        *   Request rules from Background SW.
        *   Iterate through detected posts and scan their text content for target phrases based on fetched rules.
        *   Implement DOM manipulation logic to perform text replacement or element hiding based on the matched rule's action.
        *   Handle potential errors during DOM manipulation.
        *   Optimize scanning and manipulation for performance.
*   **Outcome:** Extension can replace specified words/phrases and hide posts based on user-configured rules via the Options page.

## Phase 2: Enhanced Matching & Replacement (Version 0.3.0)

*   **Goal:** Add support for simple regular expressions in targets, basic formatting (bold/italic) in replacements, OR operator for targets, and rule import/export.
*   **Tasks:**
    *   **Types (`src/types.ts`):**
        *   Add `'simple-regex'` to the allowed values for `Rule['type']`.
        *   Add optional `matchWholeWord` boolean flag to `Rule` type.
    *   **Options Page (`options.html`, `options.ts`, `options.css`):**
        *   Add 'Simple Regex' option to the rule type dropdown.
        *   Add 'Match whole word only' checkbox to the rule editor form.
        *   Update help text to explain:
            *   Simple regex syntax (`*` = any chars, `?` = one char).
            *   Replacement formatting (e.g., `**bold**`, `*italic*`).
            *   OR operator (`|`) usage in Literal and Simple Regex targets.
        *   Add 'Import Rules' button (using `<input type="file">`).
        *   Add 'Export Rules' button.
        *   Implement logic in `options.ts` to handle file selection, JSON parsing/validation for import.
        *   Implement logic in `options.ts` to generate JSON and trigger download for export.
        *   (Optional: Send imported rules to background for validation before merging).
        *   Update rule saving/loading logic to handle `matchWholeWord` flag.
    *   **Content Script (`content-script.ts`):**
        *   Refine target processing logic (`buildRegexForRule`):
            *   Correctly handle wildcard conversion (`*`, `?`) vs general regex escaping order.
            *   Wrap the pattern for each part with word boundaries (`\b`) if `matchWholeWord` is true.
            *   Ensure `*` conversion (e.g., to `.*`) is greedy if appropriate, or that the overall regex captures the full intended match.
        *   Implement the more complex HTML replacement logic (handling `<strong>`, `<em>` via DOM manipulation).
    *   **Background Script (`background.ts`):**
        *   (Optional: Add message handler for validating imported rules if doing server-side validation).
*   **Outcome:** Users can create rules using simple wildcards (`*`, `?`), target multiple alternatives using `|`, optionally match whole words only, apply bold/italic formatting to replacements, and import/export their rule configurations.

## Phase 3: Local Storage & Analytics (Version 0.4.0)

*   **Goal:** Store data about flagged posts locally and provide basic analytics on the Options page.
*   **Tasks:**
    *   **Background SW:**
        *   Define a structure for storing flagged post data (e.g., timestamp, postUrl, username, matchedRuleId/identifier, actionTaken) in `chrome.storage.local`.
        *   Implement logic to save this data whenever a replace/hide action occurs (if local storage is enabled via settings).
        *   Manage storage limits (e.g., implement rotation or capping the number of entries).
        *   Add message handler (`GET_LOCAL_ANALYTICS`) to retrieve and aggregate stored data (e.g., count per rule, count per user).
    *   **Options Page:**
        *   Add a section in `options.html` to display local analytics.
        *   Add a setting toggle in `options.html` & logic in `options.ts` to enable/disable local data storage.
        *   Implement logic in `options.ts` to:
            *   Request analytics data (`GET_LOCAL_ANALYTICS`) from the Background SW on load.
            *   Receive `LOCAL_ANALYTICS_DATA` message.
            *   Render the aggregated data (e.g., top 10 rules, top 10 users flagged).
            *   Provide a button/mechanism to clear locally stored data.
*   **Outcome:** Flagged post information is stored locally, and basic statistics are viewable on the Options page.

## Phase 4: Semantic Analysis Integration (Version 0.5.0)

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
        *   Ensure the existing UI to enable/disable semantic analysis globally and define intent rules works correctly.
        *   Ensure warnings about performance impact are present.
    *   **Content Script:**
        *   Modify logic to check if semantic analysis is enabled globally *and* for a specific rule.
        *   If enabled, send `REQUEST_SEMANTIC_ANALYSIS` message to Background SW with post text.
        *   Handle `ANALYSIS_RESULT` message and apply replacement/hiding based on the matched intent.
*   **Outcome:** Users can optionally enable semantic analysis to trigger replacements/hiding based on described intents rather than just exact phrases.

## Phase 5: Data Submission (Version 0.6.0)

*   **Goal:** Implement the optional data submission feature to an external backend.
*   **Tasks:**
    *   **Backend (Conceptual - requires separate implementation):**
        *   Define and implement the `/api/submit` endpoint (e.g., using Loco.rs).
        *   Set up database schema.
        *   Decide on an authentication/authorization mechanism.
    *   **Background SW:**
        *   Modify the logic that saves data locally (from Phase 3) or processes actions to *also* send data to the backend *if* external submission is enabled and configured.
        *   Use the existing setting for submission (enabled/disabled, auto/manual).
        *   Implement `fetch` logic for the external API.
        *   Handle `SUBMIT_DATA_MANUAL` messages (if manual mode selected).
        *   Handle API responses/errors.
    *   **Options Page:**
        *   Add UI elements to configure external submission settings (enable/disable, auto/manual, potentially backend URL if configurable).
        *   Display status/feedback related to *external* submissions.
    *   **Content Script:**
        *   Implement logic to inject a "Submit Data" button near modified/hidden posts if manual submission is enabled.
        *   Ensure button click sends `SUBMIT_DATA_MANUAL` message with necessary details.
*   **Outcome:** Extension can optionally submit data about flagged posts to a central backend service, leveraging the settings.

## Phase 6: Refinement & Polish (Version 0.7.0 / 1.0.0)

*   **Goal:** Improve performance, stability, UX, and prepare for potential release.
*   **Tasks:**
    *   Performance profiling and optimization (content script scanning, DOM manipulation, model inference, local storage access, regex matching, HTML replacement).
    *   Robustness testing against X.com UI changes.
    *   UI/UX improvements on the Options Page.
    *   Add more comprehensive error handling and user feedback.
    *   Code cleanup and refactoring based on `.cursorrules`.
    *   Final testing across different scenarios.
    *   Update documentation.
    *   Prepare for potential publishing to Chrome Web Store (icons, description, privacy policy).
*   **Outcome:** A stable, performant, and user-friendly version of the extension. 