import { type Settings, type Rule, type StorageData, type ExtensionMessage } from './types';
import { v4 as uuidv4 } from 'uuid'; // Using UUID for unique rule IDs

// --- Default State ---
const defaultSettings: Settings = {
    extensionEnabled: true,
    semanticAnalysisEnabled: false, // Start disabled
    localStorageEnabled: true, // Enable local data capture by default
    submissionEnabled: false, // Start disabled
    submissionMode: 'disabled',
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
                        const newSettings = message.payload.settings; // Store settings for broadcast
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

            default:
                console.warn('[Background] Unrecognized message type:', message.type);
                // It's often better not to send a response for unrecognized types
                // sendResponse({ status: 'error', message: `Unrecognized message type: ${message.type}` });
                break;
        }
    }

    handleMessage();

    // Return true ONLY for message types that send an async response
    if (message.type === 'GET_ALL_DATA' || message.type === 'SAVE_SETTINGS' || message.type === 'SAVE_RULES' || message.type === 'PING') {
        return true;
    }
    // For other types, return false or nothing (undefined)
}); 