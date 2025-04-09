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
const MAX_URLS_PER_ANALYTIC_ITEM = 10;

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
                    const settings: ExtensionSettings = settingsData[STORAGE_KEY_SETTINGS] || defaultSettings;

                    const postPayload = message.payload as FlaggedPostData | undefined;

                    if (settings.enableLocalLogging && postPayload && postPayload.postUrl !== 'unknown') {
                        const logData = await chrome.storage.local.get(STORAGE_KEY_LOCAL_LOG);
                        let currentLogs: FlaggedPostData[] = logData[STORAGE_KEY_LOCAL_LOG] || [];

                        // --- Deduplication Check --- 
                        const existingLogIndex = currentLogs.findIndex(log => log.postUrl === postPayload.postUrl);

                        if (existingLogIndex === -1) { // Only add if URL not already logged
                            // Add the new log entry
                            currentLogs.push(postPayload);

                            // Trim logs if they exceed the limit (keep newest)
                            if (currentLogs.length > MAX_LOG_ENTRIES) {
                                currentLogs = currentLogs.slice(currentLogs.length - MAX_LOG_ENTRIES);
                            }

                            await chrome.storage.local.set({ [STORAGE_KEY_LOCAL_LOG]: currentLogs });
                            console.log(`[Background] Logged flagged post: ${postPayload.postUrl}`);
                        } else {
                            console.log(`[Background] Post already logged, skipping: ${postPayload.postUrl}`);
                        }
                    } else if (settings.enableLocalLogging && postPayload && postPayload.postUrl === 'unknown') {
                        console.warn('[Background] Skipping log for post with unknown URL.');
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

                    // Use Maps to store URLs along with counts
                    const ruleData: Map<string, { count: number; urls: Set<string> }> = new Map();
                    const userData: Map<string, { count: number; urls: Set<string> }> = new Map();

                    for (const log of logs) {
                        // Count actions by type
                        if (log.actionTaken === 'replace') analytics.actionsByType.replace++;
                        else if (log.actionTaken === 'hide') analytics.actionsByType.hide++;

                        // --- Aggregate Rule Data ---
                        let currentRuleData = ruleData.get(log.matchedRuleId);
                        if (!currentRuleData) {
                            currentRuleData = { count: 0, urls: new Set() };
                            ruleData.set(log.matchedRuleId, currentRuleData);
                        }
                        currentRuleData.count++;
                        // Add URL, keeping the set size limited (newest URLs)
                        if (log.postUrl && log.postUrl !== 'unknown') {
                            // Explicit check to ensure log.postUrl is a string here
                            const urlToAdd = log.postUrl;
                            if (typeof urlToAdd === 'string') {
                                if (currentRuleData.urls.size >= MAX_URLS_PER_ANALYTIC_ITEM) {
                                    // Remove the oldest URL (first item in iteration order for Set)
                                    const oldestUrl = currentRuleData.urls.values().next().value;
                                    // Ensure oldestUrl is not undefined before deleting
                                    if (oldestUrl !== undefined) {
                                        currentRuleData.urls.delete(oldestUrl);
                                    }
                                }
                                currentRuleData.urls.add(urlToAdd); // Use the guaranteed string
                            }
                        }

                        // --- Aggregate User Data ---
                        if (log.username && log.username !== 'unknown') {
                            let currentUserData = userData.get(log.username);
                            if (!currentUserData) {
                                currentUserData = { count: 0, urls: new Set() };
                                userData.set(log.username, currentUserData);
                            }
                            currentUserData.count++;
                            // Add URL, limiting size
                            if (log.postUrl && log.postUrl !== 'unknown') {
                                const urlToAdd = log.postUrl;
                                if (typeof urlToAdd === 'string') {
                                    if (currentUserData.urls.size >= MAX_URLS_PER_ANALYTIC_ITEM) {
                                        const oldestUrl = currentUserData.urls.values().next().value;
                                        // Ensure oldestUrl is not undefined before deleting
                                        if (oldestUrl !== undefined) {
                                            currentUserData.urls.delete(oldestUrl);
                                        }
                                    }
                                    currentUserData.urls.add(urlToAdd); // Use the guaranteed string
                                }
                            }
                        }
                    }

                    // Get ALL rules, sorted
                    analytics.topRules = Array.from(ruleData.entries())
                        .sort(([, dataA], [, dataB]) => dataB.count - dataA.count)
                        .map(([ruleId, data]) => ({ ruleId, count: data.count, postUrls: Array.from(data.urls) }));

                    // Get ALL users, sorted
                    analytics.topUsers = Array.from(userData.entries())
                        .sort(([, dataA], [, dataB]) => dataB.count - dataA.count)
                        .map(([username, data]) => ({ username, count: data.count, postUrls: Array.from(data.urls) }));

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