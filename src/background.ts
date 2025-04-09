import { type ExtensionSettings, type Rule, type StorageData, type ExtensionMessage, type FlaggedPostData, type LocalAnalyticsData } from './types';
import { v4 as uuidv4 } from 'uuid'; // Using UUID for unique rule IDs

// --- Default State ---
const defaultSettings: ExtensionSettings = {
    extensionEnabled: true,
    enableSemanticAnalysis: false, // Corrected field name
    enableLocalLogging: true, // Enable local data capture by default
    enableDataSubmission: false, // Corrected field name
    submissionMode: undefined, // Default to undefined (disabled)
    showModificationBadge: true, // Ensure this is present and true
};

const defaultRules: Rule[] = [
    {
        id: uuidv4(),
        type: 'literal',
        target: 'collaboration', // Example target
        replacement: '[ADVERTISEMENT]', // Example replacement
        action: 'replace',
        enabled: true,
        isDefault: true,
        caseSensitive: false,
    },
    {
        id: uuidv4(),
        type: 'literal',
        target: 'sponsored',
        replacement: '[SPONSORED CONTENT]',
        action: 'replace',
        enabled: true,
        isDefault: true,
        caseSensitive: false,
    },
    {
        id: uuidv4(),
        type: 'literal',
        target: '#ad', // Example hashtag
        replacement: '[AD]',
        action: 'replace',
        enabled: true,
        isDefault: true,
        caseSensitive: false,
    },
];

// --- Storage Keys ---
const STORAGE_KEY_SETTINGS = 'clearFeedSettings';
const STORAGE_KEY_RULES = 'clearFeedRules';
const STORAGE_KEY_LOCAL_LOG = 'clearFeedLocalLog';
const MAX_LOG_ENTRIES = 1000;

// --- Initialization ---
chrome.runtime.onInstalled.addListener(async (details) => {
    // Check if settings exist, if not, initialize
    const settingsCheck = await chrome.storage.sync.get(STORAGE_KEY_SETTINGS);
    if (!settingsCheck[STORAGE_KEY_SETTINGS]) {
        await chrome.storage.sync.set({ [STORAGE_KEY_SETTINGS]: defaultSettings });
    }

    // Check if rules exist, if not, initialize
    const rulesCheck = await chrome.storage.sync.get(STORAGE_KEY_RULES);
    if (!rulesCheck[STORAGE_KEY_RULES]) {
        await chrome.storage.sync.set({ [STORAGE_KEY_RULES]: defaultRules });
    }
});

// --- Message Handling ---
chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
    async function handleMessage() {
        switch (message.type) {
            case 'GET_ALL_DATA':
                try {
                    const settingsData = await chrome.storage.sync.get(STORAGE_KEY_SETTINGS);
                    const rulesData = await chrome.storage.sync.get(STORAGE_KEY_RULES);
                    const response: StorageData = {
                        settings: settingsData[STORAGE_KEY_SETTINGS] || defaultSettings,
                        rules: rulesData[STORAGE_KEY_RULES] || [],
                    };
                    sendResponse({ status: 'success', data: response });
                } catch (error) {
                    console.error('[Background] Error in GET_ALL_DATA handler:', error);
                    sendResponse({ status: 'error', message: 'Failed to retrieve data.' });
                }
                break;

            case 'SAVE_SETTINGS':
                try {
                    if (message.payload?.settings) {
                        const newSettings: ExtensionSettings = message.payload.settings; // Add type assertion
                        await chrome.storage.sync.set({ [STORAGE_KEY_SETTINGS]: newSettings });

                        // Notify relevant contexts (e.g., content scripts, potentially other option pages)
                        chrome.tabs.query({ url: "*://x.com/*" }, (tabs) => {
                            tabs.forEach(tab => {
                                if (tab.id) {
                                    // Send settings directly in the payload
                                    chrome.tabs.sendMessage(tab.id, { type: 'SETTINGS_UPDATED', payload: { settings: newSettings } })
                                        .catch(error => console.log(`Could not send SETTINGS_UPDATED to tab ${tab.id}:`, error.message)); // Add catch
                                }
                            });
                        });
                        // Also notify the options page itself in case others are open
                        chrome.runtime.sendMessage({ type: 'SETTINGS_UPDATED', payload: { settings: newSettings } })
                            .catch(error => console.log(`Could not broadcast SETTINGS_UPDATED to runtime:`, error.message)); // Add catch

                        sendResponse({ status: 'success', message: 'Settings saved.' });
                    } else {
                        console.error('[Background] Invalid payload for SAVE_SETTINGS', message.payload);
                        throw new Error('Invalid payload for SAVE_SETTINGS');
                    }
                } catch (error) {
                    console.error('[Background] Error in SAVE_SETTINGS handler:', error);
                    sendResponse({ status: 'error', message: 'Failed to save settings.' });
                }
                break;

            case 'SAVE_RULES':
                try {
                    if (message.payload?.rules && Array.isArray(message.payload.rules)) {
                        await chrome.storage.sync.set({ [STORAGE_KEY_RULES]: message.payload.rules });
                        sendResponse({ status: 'success', message: 'Rules saved.' });
                        // TODO: Potentially notify content scripts of rule changes if needed immediately
                    } else {
                        console.error('[Background] Invalid payload for SAVE_RULES', message.payload);
                        throw new Error('Invalid payload for SAVE_RULES');
                    }
                } catch (error) {
                    console.error('[Background] Error in SAVE_RULES handler:', error);
                    sendResponse({ status: 'error', message: 'Failed to save rules.' });
                }
                break;

            case 'PING':
                sendResponse({ type: 'PONG' });
                break;

            case 'LOG_FLAGGED_POST':
                try {
                    const settingsData = await chrome.storage.sync.get(STORAGE_KEY_SETTINGS);
                    // Ensure correct type when retrieving settings
                    const settings: ExtensionSettings = settingsData[STORAGE_KEY_SETTINGS] || defaultSettings;

                    // Type guard for payload specific to LOG_FLAGGED_POST
                    const postPayload = message.payload as FlaggedPostData | undefined;

                    if (settings.enableLocalLogging && postPayload) {
                        const logData = await chrome.storage.local.get(STORAGE_KEY_LOCAL_LOG);
                        let currentLogs: FlaggedPostData[] = logData[STORAGE_KEY_LOCAL_LOG] || [];

                        // Add the new log entry
                        currentLogs.push(postPayload);

                        // Trim logs if they exceed the limit (keep newest)
                        if (currentLogs.length > MAX_LOG_ENTRIES) {
                            currentLogs = currentLogs.slice(currentLogs.length - MAX_LOG_ENTRIES);
                        }

                        await chrome.storage.local.set({ [STORAGE_KEY_LOCAL_LOG]: currentLogs });
                        // No need to send a response, this is fire-and-forget from content script
                        console.log('[Background] Logged flagged post.'); // Optional logging
                    }
                } catch (error) {
                    console.error('[Background] Error in LOG_FLAGGED_POST handler:', error);
                    // No response needed here either
                }
                break;

            case 'GET_LOCAL_ANALYTICS':
                try {
                    const logData = await chrome.storage.local.get(STORAGE_KEY_LOCAL_LOG);
                    const logs: FlaggedPostData[] = logData[STORAGE_KEY_LOCAL_LOG] || [];

                    if (logs.length === 0) {
                        sendResponse({ status: 'success', data: null }); // Send null if no logs
                        return;
                    }

                    // Aggregate data
                    const analytics: LocalAnalyticsData = {
                        totalActions: logs.length,
                        actionsByType: { replace: 0, hide: 0 },
                        topRules: [],
                        topUsers: [],
                    };

                    const ruleCounts: Record<string, number> = {};
                    const userCounts: Record<string, number> = {};

                    for (const log of logs) {
                        // Count actions by type
                        if (log.actionTaken === 'replace') analytics.actionsByType.replace++;
                        else if (log.actionTaken === 'hide') analytics.actionsByType.hide++;

                        // Count by rule ID
                        ruleCounts[log.matchedRuleId] = (ruleCounts[log.matchedRuleId] || 0) + 1;

                        // Count by username
                        if (log.username !== 'unknown') { // Avoid counting 'unknown' users
                            userCounts[log.username] = (userCounts[log.username] || 0) + 1;
                        }
                    }

                    // Get top 10 rules
                    analytics.topRules = Object.entries(ruleCounts)
                        .sort(([, countA], [, countB]) => countB - countA)
                        .slice(0, 10)
                        .map(([ruleId, count]) => ({ ruleId, count }));

                    // Get top 10 users
                    analytics.topUsers = Object.entries(userCounts)
                        .sort(([, countA], [, countB]) => countB - countA)
                        .slice(0, 10)
                        .map(([username, count]) => ({ username, count }));

                    sendResponse({ status: 'success', data: analytics });
                } catch (error) {
                    console.error('[Background] Error in GET_LOCAL_ANALYTICS handler:', error);
                    sendResponse({ status: 'error', message: 'Failed to retrieve analytics data.' });
                }
                break;

            case 'CLEAR_LOCAL_DATA':
                try {
                    await chrome.storage.local.remove(STORAGE_KEY_LOCAL_LOG);
                    console.log('[Background] Cleared local flagged post data.');
                    sendResponse({ status: 'success', message: 'Local data cleared.' });
                } catch (error) {
                    console.error('[Background] Error in CLEAR_LOCAL_DATA handler:', error);
                    sendResponse({ status: 'error', message: 'Failed to clear local data.' });
                }
                break;

            default:
                console.warn('[Background] Unrecognized message type:', message.type);
                break;
        }
    }

    handleMessage();

    // Return true ONLY for message types that send an async response
    if (
        message.type === 'GET_ALL_DATA' ||
        message.type === 'SAVE_SETTINGS' ||
        message.type === 'SAVE_RULES' ||
        message.type === 'PING' ||
        message.type === 'GET_LOCAL_ANALYTICS' ||
        message.type === 'CLEAR_LOCAL_DATA'
    ) {
        return true;
    }
    // For LOG_FLAGGED_POST and others, return false/undefined
}); 