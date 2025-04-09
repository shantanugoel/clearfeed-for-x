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