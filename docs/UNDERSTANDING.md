# Project Understanding: ClearFeed for X Chrome Extension

The goal is to develop a Chrome browser extension named "ClearFeed for X" specifically designed to work on `x.com` (formerly `twitter.com`).

## Core Functionality:

1.  **Content Modification:**
    *   Identify and replace specific words or phrases within tweets/posts based on user-defined rules.
    *   Provide default replacement rules that users can modify or remove.
    *   Offer an option to hide entire tweets/posts containing flagged words/phrases.

2.  **Semantic Analysis (Optional):**
    *   Allow users to define the *intent* behind replacements (e.g., "reveal ads disguised as collaborations") instead of just literal strings.
    *   Utilize a local, client-side machine learning model (running within the extension/browser) to perform semantic analysis for more accurate detection, acknowledging potential performance impacts.

3.  **Data Submission (Optional):**
    *   Enable users to submit information about flagged tweets (e.g., tweet links, usernames) to a central database.
    *   Offer both automatic and manual submission options.
    *   The central database will be used for aggregation and analysis (details of the backend service TBD).

## Target Platform:

*   Google Chrome (initially, potential for other browsers later).
*   Websites: `x.com`.

## Key User Interactions:

*   **Settings Page:** Configure replacement rules (add, edit, delete), toggle semantic analysis, toggle hiding, configure data submission preferences.
*   **Browsing:** The extension automatically scans and modifies/hides content on X.com pages based on active settings. Manual submission triggers (if enabled). 