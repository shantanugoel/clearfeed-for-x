import { type Rule, type Settings, type StorageData } from './types';

console.log('Agenda Revealer Content Script Loaded');

// --- State ---
let currentSettings: Settings | null = null;
let currentRules: Rule[] = [];
let observer: MutationObserver | null = null;

// --- Constants ---
const TWEET_SELECTOR = 'article[role="article"]'; // Selector for the main post/tweet container
const TWEET_TEXT_SELECTOR = '[data-testid="tweetText"]'; // Selector for the text content within a post/tweet
const PROCESSED_MARKER = 'data-agenda-revealer-processed'; // Attribute to mark processed posts/tweets

// --- Core Logic ---

/**
 * Finds the main post/tweet container element travelling up from a given element.
 */
function findParentTweetElement(element: Node | null): HTMLElement | null {
    let current: Node | null = element;
    while (current && current instanceof HTMLElement) {
        if (current.matches(TWEET_SELECTOR)) {
            return current;
        }
        current = current.parentElement;
    }
    return null;
}

/**
 * Applies the rules to a given post/tweet element.
 */
function processTweet(tweetElement: HTMLElement) {
    if (!currentSettings || !currentRules || !currentSettings.extensionEnabled || tweetElement.hasAttribute(PROCESSED_MARKER)) {
        return; // Don't process if disabled, no config, or already processed
    }

    const textElement = tweetElement.querySelector(TWEET_TEXT_SELECTOR) as HTMLElement;
    if (!textElement) {
        // Mark as processed even if text not found to avoid re-checking
        tweetElement.setAttribute(PROCESSED_MARKER, 'true');
        return;
    }

    // Use textContent for matching, but manipulation might need finer control later
    const originalText = textElement.textContent || '';
    let textForMatching = originalText;
    let modified = false;
    let hideTweet = false;

    // Iterate through enabled literal rules only for Phase 1
    for (const rule of currentRules) {
        if (!rule.enabled || rule.type !== 'literal') continue;

        const flags = rule.caseSensitive ? 'g' : 'gi'; // Global, case-insensitive (default)
        const regex = new RegExp(escapeRegExp(rule.target), flags);

        if (regex.test(textForMatching)) {
            if (rule.action === 'hide') {
                hideTweet = true;
                console.log(`[Agenda Revealer] Hiding post matching rule: "${rule.target}"`, tweetElement);
                break; // Stop processing rules if we decide to hide
            } else if (rule.action === 'replace') {
                console.log(`[Agenda Revealer] Replacing "${rule.target}" with "${rule.replacement}" in post:`, tweetElement);
                // Perform replacement on the current state of the text
                textForMatching = textForMatching.replace(regex, rule.replacement);
                modified = true;
            }
        }
    }

    // Apply modifications to the DOM
    tweetElement.setAttribute(PROCESSED_MARKER, 'true');

    if (hideTweet) {
        tweetElement.style.display = 'none'; // Simple hiding
        // Optionally add a placeholder? "Post hidden by Agenda Revealer (Rule: ...)"
    } else if (modified) {
        // Basic replacement - might break links/mentions/hashtags within the text
        // A more robust solution would involve walking the text nodes
        textElement.textContent = textForMatching;
    }
}

/**
 * Observes changes in the DOM and processes new posts/tweets.
 */
function observeTimeline() {
    if (observer) observer.disconnect(); // Disconnect previous observer if any

    const targetNode = document.body; // Observe the whole body, might need refinement
    if (!targetNode) {
        console.error('[Agenda Revealer] Could not find target node for MutationObserver.');
        return;
    }

    const config: MutationObserverInit = { childList: true, subtree: true };

    const callback: MutationCallback = (mutationsList) => {
        for (const mutation of mutationsList) {
            if (mutation.type === 'childList') {
                mutation.addedNodes.forEach(node => {
                    // Check if the added node is a post/tweet or contains posts/tweets
                    if (node instanceof HTMLElement) {
                        if (node.matches(TWEET_SELECTOR) && !node.hasAttribute(PROCESSED_MARKER)) {
                            // Direct post/tweet added
                            processTweet(node);
                        } else {
                            // Check if the added node *contains* unprocessed posts/tweets
                            node.querySelectorAll(`${TWEET_SELECTOR}:not([${PROCESSED_MARKER}])`)
                                .forEach(tweet => processTweet(tweet as HTMLElement));
                        }
                    }
                });
            }
            // We might also need to observe attribute changes if tweet text is loaded later
            // else if (mutation.type === 'attributes') { ... }
        }
    };

    observer = new MutationObserver(callback);
    observer.observe(targetNode, config);
    console.log('[Agenda Revealer] MutationObserver started.');

    // Process existing posts/tweets on the page when observation starts
    document.querySelectorAll(`${TWEET_SELECTOR}:not([${PROCESSED_MARKER}])`)
        .forEach(tweet => processTweet(tweet as HTMLElement));
}

/**
 * Fetches the latest settings and rules from the background script.
 */
function fetchConfigAndStart() {
    console.log('[Agenda Revealer] Fetching config...');
    chrome.runtime.sendMessage({ type: 'GET_ALL_DATA' }, (response) => {
        if (chrome.runtime.lastError) {
            console.error('[Agenda Revealer] Error fetching config:', chrome.runtime.lastError);
            return;
        }
        if (response?.status === 'success' && response.data) {
            console.log('[Agenda Revealer] Config received:', response.data);
            currentSettings = response.data.settings;
            currentRules = response.data.rules || [];

            if (currentSettings?.extensionEnabled) {
                observeTimeline(); // Start observing only if extension is enabled
            } else {
                console.log('[Agenda Revealer] Extension is disabled in settings.');
                if (observer) observer.disconnect(); // Stop observing if disabled
            }
        } else {
            console.error('[Agenda Revealer] Failed to fetch config:', response?.message);
            // Maybe retry after a delay?
        }
    });
}

// --- Utility: Escape Regex Special Chars ---
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions#escaping
function escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}

// --- Initialization ---
fetchConfigAndStart();

// --- Listen for updates from background (e.g., settings changed) ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'SETTINGS_UPDATED' || message.type === 'RULES_UPDATED') {
        console.log(`[Agenda Revealer] Received ${message.type}, re-fetching config.`);
        // Re-fetch config and restart observer if necessary
        fetchConfigAndStart();
        // Mark all as unprocessed again? Or try to selectively update?
        // For now, re-fetch re-starts observation which processes existing ones again.
        // A more efficient approach might be needed for very active pages.
    }
}); 