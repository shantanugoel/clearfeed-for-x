# Requirements: Agenda Revealer Chrome Extension

## 1. Functional Requirements

### 1.1. Core Content Modification
- **FR1.1.1:** The extension MUST operate on the `x.com` domain.
- **FR1.1.2:** The extension MUST identify posts (formerly tweets) in the user's feed on `x.com`.
- **FR1.1.3:** Users MUST be able to define rules specifying target content and a corresponding action (replace/hide) in the extension settings.
- **FR1.1.4:** Rules MUST specify a type: 'literal', 'simple-regex', or 'semantic'.
- **FR1.1.5:** For 'literal' and 'simple-regex' types, users MUST define a "target" string.
- **FR1.1.6:** For 'literal' and 'simple-regex' types, the target string MAY contain the `|` character to specify alternative target patterns within the same rule.
- **FR1.1.7:** For 'simple-regex' type, the target string (or parts separated by `|`) MAY contain `*` (match zero or more characters) and `?` (match exactly one character).
- **FR1.1.8:** For rules with a 'replace' action, users MUST define a "replacement" string.
- **FR1.1.9:** The replacement string MAY use markdown-like syntax for basic formatting: `**bold**` for bold text and `*italic*` for italic text.
- **FR1.1.10:** The extension MUST provide a default list of rules upon installation.
- **FR1.1.11:** Users MUST be able to add new rules.
- **FR1.1.12:** Users MUST be able to edit existing rules (both default and user-added).
- **FR1.1.13:** Users MUST be able to delete non-default rules.
- **FR1.1.14:** The extension MUST scan the text content of identified posts for matches based on enabled rules of type 'literal' and 'simple-regex', correctly interpreting the `|` operator for alternatives.
- **FR1.1.15:** Upon finding a match for a rule with action 'replace', the extension MUST replace the matched text with the corresponding "replacement" string, rendering bold/italic formatting as HTML (`<strong>`, `<em>`).
- **FR1.1.16:** Users MUST be able to enable/disable the replacement functionality globally via the settings.

### 1.2. Content Hiding
- **FR1.2.1:** Users MUST have an option in the settings (potentially per-rule or global) to hide posts containing a "target" word/phrase instead of replacing it.
- **FR1.2.2:** When hiding is enabled for a rule, the extension MUST hide the entire post element from view if its text content contains the corresponding "target" word/phrase.

### 1.3. Semantic Analysis (Optional Feature)
- **FR1.3.1:** Users MUST have an option in the settings to enable semantic analysis.
- **FR1.3.2:** When semantic analysis is enabled, users MUST be able to define an "intent" (as a descriptive sentence) instead of or in addition to a literal target phrase for a rule.
- **FR1.3.3:** The extension MUST use a local, client-side model to analyze the text content of posts against the defined "intent".
- **FR1.3.4:** If the analysis determines a post matches the intent, the extension MUST apply the corresponding replacement or hiding action defined for that rule.
- **FR1.3.5:** The extension MUST warn the user about potential performance impacts when enabling semantic analysis.

### 1.4. Data Submission (Optional Feature)
- **FR1.4.1:** Users MUST have an option in the settings to enable submission of data about flagged posts.
- **FR1.4.2:** Users MUST be able to choose between automatic submission and manual submission modes.
- **FR1.4.3:** If automatic submission is enabled, the extension MUST automatically send data (post link/ID, username, matched rule/intent) to a predefined backend endpoint whenever a replacement/hiding action occurs.
- **FR1.4.4:** If manual submission is enabled, the extension MUST provide a user interface element (e.g., a button) on or near modified/hidden posts allowing the user to trigger the submission.
- **FR1.4.5:** The submitted data MUST include at least the post URL/ID, the associated username, and the specific rule (or intent) that was matched.
- **FR1.4.6:** Users MUST be able to disable data submission entirely.

### 1.5. Settings/Options Page
- **FR1.5.1:** The extension MUST provide an options page accessible through the browser's extension management area.
- **FR1.5.2:** The options page MUST allow users to manage rules (target string/intent, type, replacement, action) including add, edit, delete (non-default), and toggling enable status.
- **FR1.5.3:** The options page MUST allow users to toggle semantic analysis on/off.
- **FR1.5.4:** The options page MUST provide buttons/mechanisms for users to export their current rules list to a JSON file.
- **FR1.5.5:** The options page MUST provide a button/mechanism for users to import rules from a JSON file, merging them with existing rules (or replacing, TBD).
- **FR1.5.6:** The options page MUST allow users to configure data submission preferences (enable/disable, automatic/manual).
- **FR1.5.7:** Settings MUST persist across browser sessions.

## 2. Non-Functional Requirements

- **NFR2.1:** **Performance:** The extension should minimize its impact on browser performance and page load times, especially during content scanning and modification. Semantic analysis impact should be clearly communicated.
- **NFR2.2:** **Accuracy:** Literal and simple regex matching (including `|`, `*`, `?`) should function as defined. Formatted replacement should render correctly. Import/export should preserve rule integrity. Semantic analysis accuracy will depend on the chosen model.
- **NFR2.3:** **Reliability:** The extension should function consistently on `x.com`, adapting to minor UI changes where feasible.
- **NFR2.4:** **Security:** User data (settings) should be stored securely using Chrome's storage APIs. Communication with the backend (if data submission is enabled) must use HTTPS.
- **NFR2.5:** **Privacy:** If data submission is enabled, the extension must clearly inform the user what data is being collected and how it will be used. Anonymization options should be considered for the backend aggregation.
- **NFR2.6:** **Usability:** The settings page should be intuitive and easy to use.
- **NFR2.7:** **Maintainability:** Code should follow the specified coding standards (.cursorrules) for ease of updates and debugging.
- **NFR2.8:** **Compatibility:** The extension must use Manifest V3 and be compatible with the latest stable version of Google Chrome.

## 3. Future Considerations (Out of Scope for Initial Version)

- Support for other browsers (Firefox, Edge).
- More sophisticated analysis models (potentially server-side if performance is prohibitive locally).
- User accounts for syncing settings across devices.
- Community-sourced rule lists.
- More granular hiding options (e.g., hide images/videos only).
- Analysis of user profiles/bios. 