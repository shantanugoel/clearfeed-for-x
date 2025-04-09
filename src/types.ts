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
    localStorageEnabled: boolean; // Added for Phase 3
    submissionEnabled: boolean;
    submissionMode: 'auto' | 'manual' | 'disabled';
    showModificationBadge: boolean; // Added: Show badge on modified/hidden posts
    // backendUrl?: string; // Optional backend URL setting
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

/**
 * Represents the data stored locally for a post that triggered a rule.
 */
export type FlaggedPostData = {
    timestamp: number; // Unix timestamp (ms) when the action occurred
    postId: string; // Unique ID of the post (e.g., status ID from URL)
    postUrl: string; // Full URL of the post
    username: string; // Author's username (e.g., @username)
    matchedRuleId: string; // The 'id' of the Rule that was matched
    actionTaken: 'replace' | 'hide'; // The action performed
    targetPhrase: string; // The specific text that matched the rule's target
    replacementPhrase?: string; // The text used for replacement, if action was 'replace'
};

/**
 * Represents the aggregated analytics data retrieved from local storage.
 */
export type LocalAnalyticsData = {
    totalActions: number;
    actionsByType: {
        replace: number;
        hide: number;
    };
    // Store associated post URLs (limit stored URLs per item for performance/storage)
    topRules: Array<{ ruleId: string; count: number; postUrls: string[] }>;
    topUsers: Array<{ username: string; count: number; postUrls: string[] }>;
    // Potentially add more stats like counts over time later
};

/**
 * Represents the overall extension settings.
 * Make sure this aligns with settings saved/loaded in background/options scripts.
 */
export type ExtensionSettings = {
    extensionEnabled: boolean; // Master on/off switch for the extension
    showModificationBadge: boolean; // Whether to show the indicator badge on modified posts
    enableLocalLogging: boolean; // Controls whether flagged post data is stored locally
    enableSemanticAnalysis?: boolean; // Optional semantic analysis feature
    enableDataSubmission?: boolean; // Optional data submission feature
    submissionMode?: 'auto' | 'manual'; // Mode for data submission
    backendUrl?: string; // Optional backend URL for data submission
};

// Add new Message types for Phase 3
export type LogFlaggedPostMessage = {
    type: 'LOG_FLAGGED_POST';
    payload: FlaggedPostData;
};

export type GetLocalAnalyticsMessage = {
    type: 'GET_LOCAL_ANALYTICS';
};

export type LocalAnalyticsDataMessage = {
    type: 'LOCAL_ANALYTICS_DATA';
    payload: LocalAnalyticsData | null; // Null if no data or logging disabled
};

export type ClearLocalDataMessage = {
    type: 'CLEAR_LOCAL_DATA';
};

// Update the union type for messages if you have one
// export type BackgroundMessage = ... | LogFlaggedPostMessage | GetLocalAnalyticsMessage | ClearLocalDataMessage;
// export type OptionsMessage = ... | LocalAnalyticsDataMessage; 