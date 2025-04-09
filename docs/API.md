# API Definitions: ClearFeed for X Chrome Extension

This document defines the APIs used internally within the extension and the conceptual external API for data submission.

## 1. Internal Extension Messaging (`chrome.runtime`)

Messages exchanged between the Content Script, Background Service Worker, and Options Page.

**Message Format:**

```typescript
type Message = {
  type: string; // Message identifier
  payload?: any; // Data associated with the message
};
```

### 1.1. Content Script -> Background SW

*   **`GET_RULES_AND_SETTINGS`**: Sent by Content Script on initialization or page load.
    *   `payload`: none
    *   Response: `RULES_AND_SETTINGS` message from Background SW.
*   **`REQUEST_SEMANTIC_ANALYSIS`**: Sent when semantic analysis is needed for a tweet.
    *   `payload`: `{ tweetId: string, text: string }`
    *   Response: `ANALYSIS_RESULT` message from Background SW.
*   **`SUBMIT_DATA_MANUAL`**: Sent when the user manually triggers data submission.
    *   `payload`: `{ tweetId: string, username: string, ruleId: string, text: string }` // `ruleId` could be the literal phrase or intent ID
    *   Response: `SUBMISSION_STATUS` message from Background SW.

### 1.2. Background SW -> Content Script

*   **`RULES_AND_SETTINGS`**: Response to `GET_RULES_AND_SETTINGS`.
    *   `payload`: `{ rules: Rule[], settings: Settings }` (See `types.ts` definition later)
*   **`ANALYSIS_RESULT`**: Response to `REQUEST_SEMANTIC_ANALYSIS`.
    *   `payload`: `{ tweetId: string, matches: { ruleId: string, action: 'replace' | 'hide' }[] }`
*   **`SETTINGS_UPDATED`**: Sent when settings change via the Options Page.
    *   `payload`: `{ rules: Rule[], settings: Settings }`

### 1.3. Options Page -> Background SW

*   **`GET_ALL_DATA`**: Sent by Options Page on load.
    *   `payload`: none
    *   Response: `ALL_DATA` message from Background SW.
*   **`SAVE_SETTINGS`**: Sent when user modifies general settings.
    *   `payload`: `{ settings: Settings }`
    *   Response: `SETTINGS_SAVED` confirmation.
*   **`SAVE_RULES`**: Sent when user modifies rules.
    *   `payload`: `{ rules: Rule[] }`
    *   Response: `RULES_SAVED` confirmation.

### 1.4. Background SW -> Options Page

*   **`ALL_DATA`**: Response to `GET_ALL_DATA`.
    *   `payload`: `{ rules: Rule[], settings: Settings }`
*   **`SETTINGS_SAVED`**: Confirmation.
    *   `payload`: none
*   **`RULES_SAVED`**: Confirmation.
    *   `payload`: none
*   **`SUBMISSION_STATUS`**: Forwarded status from backend interaction.
    *   `payload`: `{ success: boolean, message?: string }`

## 2. External Backend API (Conceptual)

This defines the potential endpoint for submitting flagged tweet data. The backend implementation (e.g., using Loco.rs) would need to match this.

*   **Endpoint:** `POST /api/submit`
*   **Authentication:** TBD (API Key, User Token? Needs consideration based on privacy/security goals).
*   **Request Body:**

    ```json
    {
      "submissionTime": "YYYY-MM-DDTHH:mm:ssZ", // ISO 8601 timestamp
      "source": "clearfeed-for-x-chrome-ext",
      "version": "0.2.0", // Extension version
      "tweetUrl": "https://x.com/username/status/1234567890",
      "username": "@username",
      "matchedRule": {
        "type": "literal" | "semantic", // Type of match
        "identifier": "collaboration" | "intent_id_123", // The matched phrase or intent ID
        "actionTaken": "replaced" | "hidden" // Action performed by the extension
      },
      // Optional: Add anonymized user ID if implementing user accounts later
      // "userId": "anon_user_guid"
    }
    ```

*   **Success Response (200 OK):**

    ```json
    {
      "status": "success",
      "message": "Data received successfully."
    }
    ```

*   **Error Response (e.g., 400 Bad Request, 401 Unauthorized, 500 Internal Server Error):**

    ```json
    {
      "status": "error",
      "message": "Detailed error message here."
    }
    ```

## 3. Chrome Storage API (`chrome.storage.sync`/`local`)

Data structure stored in Chrome storage.

```typescript
interface StorageData {
  rules: Rule[];
  settings: Settings;
}

// See types.ts for Rule and Settings definitions
``` 