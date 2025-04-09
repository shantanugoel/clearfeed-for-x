import { type Settings, type Rule, type StorageData, type ExtensionMessage } from './types';
import { v4 as uuidv4 } from 'uuid'; // Using UUID for unique rule IDs

console.log('Background service worker loaded.');

// --- Default State ---
const defaultSettings: Settings = {
    extensionEnabled: true,
    semanticAnalysisEnabled: false, // Start disabled
    localStorageEnabled: true, // Enable local data capture by default
    submissionEnabled: false, // Start disabled
    submissionMode: 'disabled',
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
const STORAGE_KEY_SETTINGS = 'agendaRevealerSettings';
const STORAGE_KEY_RULES = 'agendaRevealerRules';

// --- Initialization ---
chrome.runtime.onInstalled.addListener(async (details) => {
    console.log('Extension installed or updated:', details.reason);

    // Check if settings exist, if not, initialize
    const settingsCheck = await chrome.storage.sync.get(STORAGE_KEY_SETTINGS);
    if (!settingsCheck[STORAGE_KEY_SETTINGS]) {
        await chrome.storage.sync.set({ [STORAGE_KEY_SETTINGS]: defaultSettings });
        console.log('Default settings saved.');
    }

    // Check if rules exist, if not, initialize
    const rulesCheck = await chrome.storage.sync.get(STORAGE_KEY_RULES);
    if (!rulesCheck[STORAGE_KEY_RULES]) {
        await chrome.storage.sync.set({ [STORAGE_KEY_RULES]: defaultRules });
        console.log('Default rules saved.');
    }
});

// --- Message Handling ---
chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
    console.log('[Background] Message received:', message.type, 'from', sender.tab ? `tab ${sender.tab.id}` : 'extension');

    async function handleMessage() {
        switch (message.type) {
            case 'GET_ALL_DATA':
                try {
                    console.log('[Background] Handling GET_ALL_DATA...');
                    const settingsData = await chrome.storage.sync.get(STORAGE_KEY_SETTINGS);
                    const rulesData = await chrome.storage.sync.get(STORAGE_KEY_RULES);
                    console.log('[Background] Storage data retrieved:', { settingsData, rulesData });
                    const response: StorageData = {
                        settings: settingsData[STORAGE_KEY_SETTINGS] || defaultSettings,
                        rules: rulesData[STORAGE_KEY_RULES] || [],
                    };
                    console.log('[Background] Sending response for GET_ALL_DATA:', response);
                    sendResponse({ status: 'success', data: response });
                } catch (error) {
                    console.error('[Background] Error in GET_ALL_DATA handler:', error);
                    sendResponse({ status: 'error', message: 'Failed to retrieve data.' });
                }
                break;

            case 'SAVE_SETTINGS':
                try {
                    console.log('[Background] Handling SAVE_SETTINGS...');
                    if (message.payload?.settings) {
                        await chrome.storage.sync.set({ [STORAGE_KEY_SETTINGS]: message.payload.settings });
                        console.log('Settings saved:', message.payload.settings);
                        sendResponse({ status: 'success', message: 'Settings saved.' });
                        // TODO: Potentially notify content scripts of settings changes if needed immediately
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
                    console.log('[Background] Handling SAVE_RULES...');
                    if (message.payload?.rules && Array.isArray(message.payload.rules)) {
                        await chrome.storage.sync.set({ [STORAGE_KEY_RULES]: message.payload.rules });
                        console.log('Rules saved:', message.payload.rules.length, 'rules');
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
                console.log('[Background] Handling PING...');
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