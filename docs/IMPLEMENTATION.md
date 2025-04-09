# Implementation Details: Agenda Revealer Chrome Extension

This document provides lower-level design details for key components.

## 1. Core Types (`src/types.ts`)

```typescript
// Defines a single replacement/hiding rule
export type Rule = {
  id: string; // Unique identifier (e.g., UUID)
  type: 'literal' | 'semantic' | 'simple-regex';
  target: string; // Literal phrase, semantic intent, or simple regex pattern
  replacement: string; // Text to replace with (if action is 'replace')
  action: 'replace' | 'hide';
  enabled: boolean;
  isDefault?: boolean; // Flag for default rules provided by the extension
  caseSensitive?: boolean; // For literal matches (default: false)
  matchWholeWord?: boolean; // Added: Match whole word only (default: false)
};

// Defines the overall extension settings
export type Settings = {
  extensionEnabled: boolean;
  semanticAnalysisEnabled: boolean;
  submissionEnabled: boolean;
  submissionMode: 'auto' | 'manual' | 'disabled';
  // Potentially add backend URL setting if configurable
  // backendUrl?: string;
};

// Structure for data stored in chrome.storage
export type StorageData = {
  rules: Rule[];
  settings: Settings;
};

// Message format for internal communication
export type ExtensionMessage = {
  type: string;
  payload?: any;
};

// Structure for locally stored flagged tweet data
export type FlaggedTweetData = {
  timestamp: number; // e.g., Date.now()
  tweetUrl: string;
  username: string;
  matchedRuleId: string; // ID of the rule that matched
  matchedIdentifier: string; // The actual literal or intent description
  actionTaken: 'replaced' | 'hidden';
};

// Structure for aggregated local analytics
export type LocalAnalytics = {
  totalFlags: number;
  flagsByRule: Record<string, number>; // ruleId -> count
  flagsByUser: Record<string, number>; // username -> count
  // Add other aggregated stats as needed
};
```

## 2. Content Script (`src/content-script.ts`)

*   **Tweet Identification:**
    *   Will likely need to target elements based on `data-testid="tweetText"` or similar stable attributes within Twitter/X's DOM structure. Attributes like `aria-label` containing "Tweet" might also be useful fallback selectors.
    *   Initial identification on page load, then use `MutationObserver` watching the main timeline container (e.g., `[role="main"]`) for added nodes (specifically `article` elements or similar tweet wrappers) to handle infinite scroll and dynamic updates.
    *   Need a way to mark processed tweets (e.g., adding a custom data attribute `data-agenda-revealer-processed="true"`) to avoid reprocessing.
*   **Text Scanning & Modification:**
    *   For each new/unprocessed tweet element:
        *   Extract text content, perhaps also considering the existing HTML structure within the text element.
        *   Send text to Background SW if semantic analysis is required for any active rule.
        *   Iterate through active literal and simple-regex rules.
        *   For each rule, construct the final RegExp (`buildRegexForRule`):
            *   Split `rule.target` by `|`.
            *   Process each part:
                *   Convert simple wildcards (`*` -> `.*?`, `?` -> `.`) **before** escaping other characters.
                *   Escape general regex special characters.
                *   If `rule.matchWholeWord` is true, wrap the processed part with `\b` (word boundary markers).
            *   Join processed parts with `|`.
            *   Create new RegExp with appropriate flags (`g`, `i` based on `caseSensitive`).
        *   Use efficient string matching (or potentially Regex for more complex literal matches) considering case sensitivity setting.
        *   If a match is found (either literal or via semantic result from Background SW):
            *   If `action` is `hide`, add a class or style to the parent tweet container (e.g., `display: none !important;`).
            *   If `action` is `replace`, determine the replacement HTML (parsing `**bold**` and `*italic*` from the rule's replacement string).
            *   **Crucially:** Instead of just setting `textContent`, the script needs to find the exact text node(s) containing the match and replace the matched portion with the generated replacement HTML (or the plain text replacement if no formatting). This likely requires using `TreeWalker` to find text nodes and careful DOM manipulation (`Range.deleteContents()`, `Range.insertNode()`) to insert HTML without breaking surrounding elements or event listeners. This is significantly more complex than the previous `textContent` approach.
            *   Mark the tweet as processed.
            *   If `submissionMode` is `manual`, inject the submit button.
*   **Performance:**
    *   Debounce the `MutationObserver` callback to avoid excessive processing during rapid DOM changes.
    *   Optimize string matching.
    *   Minimize direct DOM manipulations; batch changes if possible (though likely difficult with dynamic content). Consider modifying CSS classes over inline styles where feasible.

## 3. Background Service Worker (`src/background.ts`)

*   **State Management:**
    *   Load `StorageData` from `chrome.storage.sync` (or local) on startup.
    *   Keep the latest rules and settings in memory for quick access.
    *   Use `chrome.storage.onChanged` listener to update in-memory state if changes occur in another context (e.g., Options page saving).
*   **Initialization (`onInstalled`):**
    *   Check if settings/rules exist in storage.
    *   If not, initialize with default `Settings` and a default list of `Rule` objects.
    *   Store the initial data.
*   **Message Handling (`onMessage`):**
    *   Implement a router/switch based on `message.type`.
    *   Handle `GET_RULES_AND_SETTINGS`, `SAVE_SETTINGS`, `SAVE_RULES`, `REQUEST_SEMANTIC_ANALYSIS`, `SUBMIT_DATA_MANUAL`.
    *   Ensure appropriate responses are sent back using the `sendResponse` callback or `chrome.tabs.sendMessage` / `chrome.runtime.sendMessage` for proactive updates.
*   **Semantic Analysis:**
    *   Load the chosen ML model (TF.js/ONNX) asynchronously on startup or first request.
    *   The analysis function will take text and the list of active semantic `Rule` objects.
    *   It needs to compare the input text against the `target` (intent description) of each semantic rule using the model.
    *   Return a list of rule IDs that match the text's intent.
    *   Consider caching model results for identical text inputs within a short time frame if performance is an issue.
*   **Data Submission:**
    *   Use the `fetch` API to make POST requests to the configured backend endpoint.
    *   Construct the JSON payload according to `API.md`.
    *   Include appropriate headers (e.g., `Content-Type: application/json`).
    *   Handle potential network errors and non-success HTTP status codes.

## 4. Options Page (`src/options/`)

*   **Framework:** Vanilla TypeScript/JavaScript, HTML, CSS.
*   **Structure:**
    *   `options.html`: Defines the layout with sections for:
        *   General Settings (Toggles for extension enabled, semantic analysis, local storage, external submission type).
        *   Rule Management (Table or list to display rules, buttons for add/edit/delete).
        *   Rule Editor Form (Hidden by default, shown for add/edit):
            *   Includes fields for: id (hidden), type (select), target (text), replacement (text), action (select), caseSensitive (checkbox), **matchWholeWord (checkbox)**, enabled (checkbox).
        *   Local Analytics Display (Placeholder for stats, button to clear data).
        *   External Submission Settings (Inputs for URL if configurable, status display).
    *   `options.css`: Basic styling for readability and layout.
    *   `options.ts`: Handles all logic:
        *   DOM Ready: Sends `GET_ALL_DATA` and `GET_LOCAL_ANALYTICS` to background script.
        *   Message Listener: Handles `ALL_DATA`, `LOCAL_ANALYTICS_DATA`, `RULES_SAVED`, `SETTINGS_SAVED`, `SUBMISSION_STATUS` messages from background script and updates the corresponding UI sections.
        *   Rendering Functions: Functions to populate the rule list, settings toggles, and analytics display based on received data.
        *   Event Listeners: Attached to buttons (Add, Edit, Delete, Save Rule, Save Settings, Clear Analytics, **Import Rules, Export Rules**) and inputs/toggles.
        *   Event Handlers: Functions that read data from the form/UI, construct messages (`SAVE_RULES`, `SAVE_SETTINGS`, `CLEAR_LOCAL_ANALYTICS`), handle file input for import, trigger JSON generation/download for export, and send them to the background script.
*   **UI Library:** None (or potentially a minimal CSS framework like Pico.css for basic styling).
*   **State Management:** No dedicated library. State is managed directly in the background script and reflected in the Options page DOM via message passing and rendering functions.
*   **Communication:** Direct use of `chrome.runtime.sendMessage` and `chrome.runtime.onMessage.addListener`.

## 5. Build Process (Vite)

*   Use `vite.config.ts`.
*   Configure multiple entry points:
    *   `background.ts`
    *   `content-script.ts`
    *   `options.html`
*   Ensure output format is suitable for Chrome extensions (e.g., IIFE or ES modules depending on Manifest V3 requirements).
*   Handle static asset copying (manifest.json, icons, ML model files).
*   Use `vite-plugin-vue` for Vue compilation.
*   Use appropriate plugins for Tailwind/PostCSS.

## 6. Rule Import/Export

*   **Export:**
    *   Attach event listener to 'Export' button.
    *   Handler retrieves `currentRules` from memory.
    *   Creates a JSON string (`JSON.stringify(currentRules, null, 2)` for pretty printing).
    *   Creates a `Blob` with `type: 'application/json'`. 
    *   Creates an object URL using `URL.createObjectURL(blob)`.
    *   Creates a temporary anchor (`<a>`) element, sets its `href` to the object URL, sets the `download` attribute (e.g., `agenda-revealer-rules.json`), clicks it, then revokes the object URL.
*   **Import:**
    *   Use an `<input type="file" accept=".json">` element, possibly hidden and triggered by a custom 'Import' button.
    *   Attach event listener to the file input's `change` event.
    *   Handler gets the selected `File` object.
    *   Uses `FileReader` to read the file content as text.
    *   In the `onload` callback, parse the text using `JSON.parse()`.
    *   **Validation:** Crucially, validate the parsed data. Check if it's an array, and if each element looks like a valid `Rule` object (has required properties like `id`, `type`, `target`, `action`, `enabled`, `matchWholeWord`, etc., and correct data types). Could create a helper function `isValidRule(obj: any): obj is Rule`.
    *   **Merging:** Decide on merge strategy (e.g., add imported rules, skipping duplicates based on ID or target/type combo? Replace all existing rules?). Add imported (and validated) rules to the `currentRules` array.
    *   Send the updated `currentRules` array to the background script via `SAVE_RULES`.
    *   Re-render the rules list.
    *   Provide user feedback (success/error message). 