import {
    type Rule,
    type ExtensionSettings,
    type StorageData,
    type FlaggedPostData,
    type LogFlaggedPostMessage
} from './types';

// --- State ---
let currentSettings: ExtensionSettings | null = null;
let currentRules: Rule[] = [];
let observer: MutationObserver | null = null;

// Define structure for storing original state
type OriginalState = {
    // originalPostHTML?: string;    // DEPRECATED: Avoid using where possible
    originalTextHTML?: string;    // InnerHTML of the text container (used for reverting replace)
    originalDisplay: string;      // Original display style of the post element
    modifiedTextHTML?: string;    // InnerHTML of the text container *after* replacement
    isHiddenAction: boolean;      // Was the effective action 'hide'?
    isCurrentlyModified: boolean; // Is the post currently showing the modified state?
    ruleTarget?: string;          // Target of the rule that caused the modification (for placeholder)
    // hiddenContentSelector?: string; // REMOVED: No longer hiding a generic wrapper
    // originalContentDisplay?: string; // REMOVED: No longer hiding a generic wrapper
    originalTextDisplay?: string; // Store original display style of the text element itself when hiding
    logged?: boolean; // <-- Add flag to track if logging message has been sent
};

// WeakMap to store state associated with post elements
const originalStateMap = new WeakMap<HTMLElement, OriginalState>();

// --- Constants ---
const POST_SELECTOR = 'article[role="article"]';
const POST_TEXT_SELECTOR = '[data-testid="tweetText"]';
// const POST_INNER_WRAPPER_SELECTOR = ':scope > div:nth-child(2)'; // REMOVED: No longer using this strategy
const PROCESSED_MARKER = 'data-clearfeed-processed';
const BADGE_CLASS = 'clearfeed-badge';
const BADGE_APPLIED_TEXT = 'Show Original';
const BADGE_REVERTED_TEXT = 'Show Changes';
const HIDDEN_PLACEHOLDER_CLASS = 'clearfeed-hidden-placeholder';
const BADGE_CONTAINER_CLASS = 'clearfeed-badge-container';

// --- Core Logic (Helpers first) ---

function findParentPostElement(element: Node | null): HTMLElement | null {
    let current: Node | null = element;
    while (current && current instanceof HTMLElement) {
        if (current.matches(POST_SELECTOR)) { return current; }
        current = current.parentElement;
    }
    return null;
}

function escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeHtml(unsafe: string): string {
    if (!unsafe) return '';
    return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function buildRegexForRule(rule: Rule): RegExp | null {
    if (!rule.target) return null;
    const parts = rule.target.split('|').map(part => part.trim()).filter(part => part.length > 0);
    if (parts.length === 0) return null;
    const regexParts = parts.map(part => {
        let processedPart = part;
        if (rule.type === 'simple-regex') {
            processedPart = processedPart.replace(/[*]/g, '__TEMP_ASTERISK__').replace(/[?]/g, '__TEMP_QUESTION__');
        }
        processedPart = escapeRegExp(processedPart);
        if (rule.type === 'simple-regex') {
            processedPart = processedPart.replace(/__TEMP_ASTERISK__/g, '\\w*').replace(/__TEMP_QUESTION__/g, '.');
        }
        if (rule.matchWholeWord) {
            const startsWithWildcard = processedPart.startsWith('\\w*') || processedPart.startsWith('.');
            const endsWithWildcard = processedPart.endsWith('\\w*') || processedPart.endsWith('.');
            const finalStart = startsWithWildcard ? '' : '\\b';
            const finalEnd = endsWithWildcard ? '' : '\\b';
            const effectivelyJustWildcards = processedPart === '\\w*' || processedPart === '.';
            if (!effectivelyJustWildcards) {
                processedPart = `${finalStart}${processedPart}${finalEnd}`;
            }
        }
        return processedPart;
    });
    const pattern = regexParts.join('|');
    const flags = rule.caseSensitive ? 'g' : 'gi';
    try { return new RegExp(pattern, flags); }
    catch (error) { console.error(`[ClearFeed for X] Invalid RegExp:`, pattern, error); return null; }
}

function formatReplacementText(replacement: string): string {
    let html = escapeHtml(replacement);
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    return html;
}

function replaceTextWithHtml(textElement: HTMLElement, regex: RegExp, replacementHtml: string) {
    const walker = document.createTreeWalker(textElement, NodeFilter.SHOW_TEXT);
    let node;
    const nodesToProcess: Text[] = [];
    while (node = walker.nextNode()) { if (node instanceof Text) nodesToProcess.push(node); }
    regex.lastIndex = 0;
    for (const textNode of nodesToProcess) {
        const textContent = textNode.nodeValue || '';
        let match;
        let lastIndex = 0;
        const fragment = document.createDocumentFragment();
        regex.lastIndex = 0;
        while ((match = regex.exec(textContent)) !== null) {
            const matchIndex = match.index;
            const matchedText = match[0];
            if (matchIndex > lastIndex) fragment.appendChild(document.createTextNode(textContent.substring(lastIndex, matchIndex)));
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = replacementHtml;
            while (tempDiv.firstChild) fragment.appendChild(tempDiv.firstChild);
            lastIndex = matchIndex + matchedText.length;
            if (!regex.global) break;
        }
        if (lastIndex > 0) {
            if (lastIndex < textContent.length) fragment.appendChild(document.createTextNode(textContent.substring(lastIndex)));
            textNode.parentNode?.replaceChild(fragment, textNode);
        } else {
            regex.lastIndex = 0;
        }
    }
}

/**
 * Ensures the original state of a post is stored before modification.
 */
function ensureOriginalStateStored(postElement: HTMLElement, textElement: HTMLElement | null): OriginalState {
    if (originalStateMap.has(postElement)) {
        // Return existing state if available
        return originalStateMap.get(postElement)!;
    }
    // Create and store new state
    const state: OriginalState = {
        originalDisplay: postElement.style.display || '',
        isHiddenAction: false,
        isCurrentlyModified: false,
    };
    // Store original innerHTML only if it hasn't been stored before.
    // state.originalPostHTML = postElement.innerHTML;
    if (textElement) {
        state.originalTextHTML = textElement.innerHTML;
    }
    originalStateMap.set(postElement, state);
    return state;
}

/**
 * Creates the placeholder content for a hidden post. Includes badge container.
 * Now returns only the placeholder div, not the badge container within it directly.
 */
function createHiddenPlaceholder(ruleTarget: string | undefined): HTMLElement {
    const placeholder = document.createElement('div');
    placeholder.className = HIDDEN_PLACEHOLDER_CLASS;
    placeholder.style.padding = '10px';
    placeholder.style.border = '1px dashed #ccc';
    placeholder.style.fontSize = '12px';
    placeholder.style.color = '#666';
    placeholder.style.display = 'block'; // Ensure it's visible
    placeholder.textContent = `Post hidden by ClearFeed${ruleTarget ? ` (Rule: "${ruleTarget}")` : ''}. `;

    // Badge container will be added *by* addOrUpdateClearFeedBadge
    const badgeSpan = document.createElement('span'); // Span to hold the badge
    badgeSpan.className = BADGE_CONTAINER_CLASS;
    badgeSpan.style.marginLeft = '5px'; // Keep margin for spacing
    placeholder.appendChild(badgeSpan);

    return placeholder;
}

/**
 * Adds or updates the ClearFeed badge on a post element.
 */
function addOrUpdateClearFeedBadge(postElement: HTMLElement, state: OriginalState) {
    if (!currentSettings?.showModificationBadge) {
        postElement.querySelector(`.${BADGE_CLASS}`)?.remove();
        // Also remove placeholder if it exists and badge is off?
        // For now, leave placeholder if hiding, just remove badge.
        return;
    }

    let badge = postElement.querySelector(`.${BADGE_CLASS}`) as HTMLButtonElement | null;
    let targetArea: HTMLElement | Element | null = null;

    // --- Find Injection Point ---
    if (state.isHiddenAction && state.isCurrentlyModified) {
        // Badge for a currently hidden post: Target the container INSIDE the placeholder
        const placeholder = postElement.querySelector(`.${HIDDEN_PLACEHOLDER_CLASS}`);
        targetArea = placeholder?.querySelector(`.${BADGE_CONTAINER_CLASS}`) ?? placeholder; // Target span or placeholder itself
    } else {
        // Badge for a modified-but-visible post OR an originally hidden post reverted to visible
        const actionToolbarSelector = 'div[role="group"][id^="id__"]';
        targetArea = postElement.querySelector(actionToolbarSelector);
        if (!targetArea) {
            const textElement = postElement.querySelector(POST_TEXT_SELECTOR);
            targetArea = textElement?.parentElement || postElement;
        }
    }

    // --- Create Badge if needed ---
    if (!badge && targetArea) {
        badge = document.createElement('button');
        badge.className = BADGE_CLASS;
        badge.title = 'Click to toggle ClearFeed modification';
        // Styles...
        badge.style.fontSize = '11px';
        badge.style.padding = '2px 5px';
        badge.style.border = '1px solid #ccc';
        badge.style.borderRadius = '3px';
        badge.style.cursor = 'pointer';
        badge.style.backgroundColor = '#f0f0f0';
        badge.style.color = '#333';
        badge.style.marginLeft = '5px';
        badge.style.verticalAlign = 'middle';
        badge.style.lineHeight = 'normal';
        badge.style.whiteSpace = 'nowrap';

        badge.onclick = handleToggleRevert;

        console.log('[ClearFeed for X] Injecting badge into:', targetArea);

        // Append based on target type
        if (targetArea.classList.contains(BADGE_CONTAINER_CLASS)) {
            targetArea.appendChild(badge);
        } else if (targetArea.classList.contains(HIDDEN_PLACEHOLDER_CLASS)) {
            // If targeting placeholder directly, still append (should have container ideally)
            targetArea.appendChild(badge);
        } else if (targetArea.matches(POST_SELECTOR)) {
            targetArea.appendChild(badge);
        } else {
            targetArea.parentNode?.insertBefore(badge, targetArea.nextSibling);
        }

    } else if (!targetArea && badge) {
        badge.remove();
        badge = null;
        console.warn('[ClearFeed] Removed badge because target area not found.');
    } else if (!targetArea && !badge) {
        console.warn('[ClearFeed] Could not find injection point for post:', postElement);
        return;
    }

    // --- Update Badge Text (if badge exists/was created) ---
    if (badge) {
        if (state.isHiddenAction) {
            // Text for hidden tweets
            badge.textContent = state.isCurrentlyModified ? 'Un-ClearFeed it' : 'ClearFeed it';
        } else {
            // Text for tweets with replaced text
            badge.textContent = state.isCurrentlyModified ? 'Un-ClearFeed it' : 'ClearFeed it';
        }
    }
}

/**
 * Toggles the visibility/content between original and modified state.
 */
function handleToggleRevert(event: MouseEvent) {
    const badge = event.currentTarget as HTMLElement;
    const postElement = findParentPostElement(badge);
    if (!postElement) return;

    const state = originalStateMap.get(postElement);
    if (!state) return;

    const textElement = postElement.querySelector(POST_TEXT_SELECTOR) as HTMLElement | null;
    // const contentWrapper = state.hiddenContentSelector ? postElement.querySelector(state.hiddenContentSelector) as HTMLElement | null : null; // REMOVED
    const placeholderElement = postElement.querySelector(`.${HIDDEN_PLACEHOLDER_CLASS}`) as HTMLElement | null;

    if (state.isCurrentlyModified) {
        // --- Revert TO Original --- (Button clicked: Show Original Tweet/Text)
        if (state.isHiddenAction) {
            // Hide placeholder, show original text element
            if (placeholderElement) placeholderElement.style.display = 'none';
            if (textElement) textElement.style.display = state.originalTextDisplay || ''; // Restore original display
            else console.warn('[ClearFeed] Text element not found on revert.');
        } else if (textElement && state.originalTextHTML !== undefined) {
            // Revert text replacement (still uses innerHTML - potential issue)
            textElement.innerHTML = state.originalTextHTML;
        }
        // Restore original display for the main post element (likely unchanged, but for safety)
        postElement.style.display = state.originalDisplay;

        state.isCurrentlyModified = false;
        addOrUpdateClearFeedBadge(postElement, state); // Update badge text

    } else {
        // --- Re-apply Modification --- (Button clicked: Hide Tweet Again / Show Modified Text)
        if (state.isHiddenAction) {
            // Hide text element, show placeholder
            if (textElement) textElement.style.display = 'none';
            else console.warn('[ClearFeed] Text element not found on re-apply hide.');
            if (placeholderElement) placeholderElement.style.display = 'block'; // Make sure placeholder is visible
            else console.warn('[ClearFeed] Placeholder element not found on re-apply hide.');
        } else if (textElement && state.modifiedTextHTML !== undefined) {
            // Re-apply text modification (still uses innerHTML)
            textElement.innerHTML = state.modifiedTextHTML;
        } else {
            console.warn('[ClearFeed] Cannot re-apply modification - state inconsistent', state);
            // Attempt to revert fully if re-apply fails
            if (state.isHiddenAction) {
                if (placeholderElement) placeholderElement.style.display = 'none';
                if (textElement) textElement.style.display = state.originalTextDisplay || '';
            } else if (textElement && state.originalTextHTML) {
                textElement.innerHTML = state.originalTextHTML;
            }
            state.isCurrentlyModified = false; // Mark as not modified
            addOrUpdateClearFeedBadge(postElement, state);
            return;
        }
        state.isCurrentlyModified = true;
        addOrUpdateClearFeedBadge(postElement, state); // Update badge text
    }
}

/**
 * Fully reverts modifications and cleans up state/badge.
 */
function revertModification(postElement: HTMLElement) {
    const state = originalStateMap.get(postElement);
    if (!state || !state.isCurrentlyModified) return; // Already in original state

    console.log('[ClearFeed] Reverting modifications for:', postElement);

    // Find potentially hidden text element and placeholder
    const textElement = postElement.querySelector(POST_TEXT_SELECTOR) as HTMLElement | null;
    const placeholderElement = postElement.querySelector(`.${HIDDEN_PLACEHOLDER_CLASS}`) as HTMLElement | null;

    // Restore original display styles
    if (state.isHiddenAction) {
        if (textElement) textElement.style.display = state.originalTextDisplay || ''; // Restore text display
        if (placeholderElement) placeholderElement.remove(); // Remove placeholder completely on full revert
    } else if (state.originalTextHTML !== undefined) {
        // Still using innerHTML for text revert
        if (textElement) textElement.innerHTML = state.originalTextHTML;
    }
    postElement.style.display = state.originalDisplay;

    // Clean up
    postElement.removeAttribute(PROCESSED_MARKER);
    originalStateMap.delete(postElement);
    postElement.querySelector(`.${BADGE_CLASS}`)?.remove();

    state.isCurrentlyModified = false;
    // state.logged = false; // <-- Decide if reverting should allow re-logging

    // Update badge after reverting
    addOrUpdateClearFeedBadge(postElement, state);
}

/**
 * Applies the rules to a given post element.
 */
function processPost(postElement: HTMLElement) {
    if (!currentSettings || !currentSettings.extensionEnabled || postElement.hasAttribute(PROCESSED_MARKER)) {
        return; // Exit if disabled, no settings, or already processed
    }

    const textElement = postElement.querySelector<HTMLElement>(POST_TEXT_SELECTOR);
    if (!textElement) {
        // console.warn('[ClearFeed for X] Post text element not found in:', postElement);
        postElement.setAttribute(PROCESSED_MARKER, 'no-text');
        return; // Cannot process without text element
    }

    const originalState = ensureOriginalStateStored(postElement, textElement);

    // Reset or check logged status based on whether the post is currently modified?
    // If the post is *not* currently modified (e.g. first time processing, or after revert), 
    // we potentially allow logging *again* if a *different* rule matches later.
    // For simplicity now, let's log only once per element encounter, unless explicitly reverted.
    // We'll add the check within the logging block.

    let actionTaken: 'replace' | 'hide' | null = null;
    let matchedRule: Rule | null = null;
    let matchedText: string | null = null;
    let finalReplacementHtml: string | null = null;

    for (const rule of currentRules) {
        if (!rule.enabled || !rule.target) continue;

        const regex = buildRegexForRule(rule);
        if (!regex) continue;

        const textContent = textElement.innerText || ''; // Use innerText for matching against visible text
        regex.lastIndex = 0; // Reset regex state
        const match = regex.exec(textContent);

        if (match) {
            matchedRule = rule;
            matchedText = match[0]; // Capture the specific text that matched
            actionTaken = rule.action;

            if (actionTaken === 'replace' && rule.replacement !== undefined) {
                originalState.modifiedTextHTML = textElement.innerHTML; // Store state just before modification
                finalReplacementHtml = formatReplacementText(rule.replacement);
                replaceTextWithHtml(textElement, regex, finalReplacementHtml);
                originalState.isCurrentlyModified = true;
                originalState.isHiddenAction = false;
            } else if (actionTaken === 'hide') {
                originalState.isHiddenAction = true;
                originalState.isCurrentlyModified = true;
                originalState.ruleTarget = rule.target; // Store target for placeholder
                // Store original display style of the text element if we hide it specifically
                originalState.originalTextDisplay = textElement.style.display || '';

                // Instead of hiding postElement directly, hide the textElement
                // and maybe other key content parts if necessary.
                // For simplicity now, let's just hide the textElement.
                textElement.style.display = 'none';

                // Add a placeholder *if* not already there or if badge is off
                if (!postElement.querySelector(`.${HIDDEN_PLACEHOLDER_CLASS}`)) {
                    const placeholder = createHiddenPlaceholder(rule.target);
                    // Try to insert placeholder before the text element's container, or append to post
                    textElement.parentNode?.insertBefore(placeholder, textElement);
                }
            }

            // Important: Break after the first matching rule is applied
            break;
        }
    }

    postElement.setAttribute(PROCESSED_MARKER, actionTaken || 'no-match');

    if (actionTaken && matchedRule) {
        // If an action was taken, update the badge
        addOrUpdateClearFeedBadge(postElement, originalState);

        // --- LOGGING --- 
        // Check settings AND if this post action has already been logged
        if (currentSettings.enableLocalLogging && !originalState.logged) {
            try {
                let postId = 'unknown';
                let postUrl = window.location.href; // Fallback
                let username = 'unknown';

                // Attempt to find the permalink anchor tag (often contains timestamp)
                const permalinkAnchor = postElement.querySelector<HTMLAnchorElement>('a[href*="/status/"]');
                if (permalinkAnchor?.href) {
                    postUrl = permalinkAnchor.href;
                    const urlParts = postUrl.split('/');
                    const statusIndex = urlParts.indexOf('status');
                    if (statusIndex > 0 && statusIndex < urlParts.length - 1) {
                        // Assert type as string since the bounds check ensures it exists
                        postId = urlParts[statusIndex + 1] as string;
                        if (statusIndex > 1) {
                            // Assert type as string
                            username = `@${urlParts[statusIndex - 1]}` as string;
                        }
                    }
                }

                // Explicitly handle potentially undefined replacement phrase
                let finalReplacementPhrase: string | undefined = undefined;
                if (actionTaken === 'replace') {
                    finalReplacementPhrase = matchedRule.replacement; // Assign string | undefined
                }

                const logEntry: FlaggedPostData = {
                    timestamp: Date.now(),
                    postId: postId,
                    postUrl: postUrl,
                    username: username,
                    matchedRuleId: matchedRule.id,
                    actionTaken: actionTaken,
                    targetPhrase: matchedText ? matchedText : matchedRule.target,
                    replacementPhrase: finalReplacementPhrase, // Use the explicitly handled value
                };

                chrome.runtime.sendMessage<LogFlaggedPostMessage>({ type: 'LOG_FLAGGED_POST', payload: logEntry })
                    .then(response => {
                        // Set logged flag *after* successful message send
                        originalState.logged = true;
                        console.log('[ClearFeed] Log message sent.');
                    })
                    .catch(error => console.warn('[ClearFeed] Could not send log message:', error.message));

            } catch (error) {
                console.error('[ClearFeed] Error preparing or sending log data:', error);
            }
        } else if (currentSettings.enableLocalLogging && originalState.logged) {
            console.log('[ClearFeed] Action already logged for this post.'); // Optional debug log
        }
        // --- END LOGGING ---

    } else if (!actionTaken && originalStateMap.has(postElement)) {
        // If no rule matched THIS TIME, but the post WAS previously modified, maybe revert?
        // Or just ensure badge is removed if setting is off.
        if (!currentSettings.showModificationBadge) {
            postElement.querySelector(`.${BADGE_CLASS}`)?.remove();
        }
        // Consider if placeholder should be removed if no rule matches anymore?
    }
}

/**
 * Adds or removes badges across all processed posts based on the current setting.
 */
function updateAllBadgesVisibility() {
    if (!currentSettings) return;
    const allPosts = document.querySelectorAll<HTMLElement>(POST_SELECTOR);
    allPosts.forEach(postElement => {
        if (originalStateMap.has(postElement)) {
            const state = originalStateMap.get(postElement)!;
            addOrUpdateClearFeedBadge(postElement, state); // This function now checks the setting internally
        }
    });
}

// --- Listener for Background Updates ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[ClearFeed Content] Received message:', message.type, message.payload);
    if (message.type === 'SETTINGS_UPDATED') {
        if (message.payload?.settings) {
            const oldSettings = { ...currentSettings }; // Shallow copy for comparison
            currentSettings = message.payload.settings as ExtensionSettings; // Update settings
            console.log('[ClearFeed Content] Settings updated:', currentSettings);

            // Check if badge visibility changed
            if (oldSettings?.showModificationBadge !== currentSettings.showModificationBadge) {
                updateAllBadgesVisibility(); // Function to add/remove all badges based on new setting
            }
            // Potentially re-process posts if extension enabled status changed?
            // For now, assume major changes require refresh or new posts.
        }
    } else if (message.type === 'RULES_UPDATED') {
        // TODO: Handle rule updates more gracefully if needed
        // Potentially fetch new rules and re-process visible posts
        // For now, require page refresh for rule updates to take effect
        console.log('[ClearFeed Content] Rules updated, page refresh might be needed.');
        // Optionally fetch new rules immediately:
        // fetchConfigAndStart();
    }
    // Note: Content scripts usually don't send responses unless specifically asked
});

// --- Initial Fetch and Start ---

function observeTimeline() {
    if (observer) observer.disconnect();
    const targetNode = document.body;
    if (!targetNode) { console.error('[ClearFeed for X] No target node.'); return; }
    const config: MutationObserverInit = { childList: true, subtree: true };
    const callback: MutationCallback = (mutationsList) => {
        for (const mutation of mutationsList) {
            if (mutation.type === 'childList') {
                mutation.addedNodes.forEach(node => {
                    if (node instanceof HTMLElement) {
                        if (node.matches(POST_SELECTOR)) { processPost(node); }
                        else { node.querySelectorAll(POST_SELECTOR).forEach(post => processPost(post as HTMLElement)); }
                    }
                });
            }
        }
    };
    observer = new MutationObserver(callback);
    observer.observe(targetNode, config);
    document.querySelectorAll(POST_SELECTOR).forEach(post => processPost(post as HTMLElement));
}

function fetchConfigAndStart() {
    chrome.runtime.sendMessage({ type: 'GET_ALL_DATA' }, (response) => {
        if (chrome.runtime.lastError) { console.error('[ClearFeed] Fetch error:', chrome.runtime.lastError); return; }
        if (response?.status === 'success' && response.data) {
            const settingsChanged = JSON.stringify(currentSettings) !== JSON.stringify(response.data.settings);
            const rulesChanged = JSON.stringify(currentRules) !== JSON.stringify(response.data.rules);

            currentSettings = response.data.settings;
            currentRules = response.data.rules || [];

            updateAllBadgesVisibility();

            if (currentSettings?.extensionEnabled) {
                observeTimeline();
                if (rulesChanged && observer) { // Reprocess if rules changed and observing
                    document.querySelectorAll(POST_SELECTOR).forEach(post => {
                        const htmlPost = post as HTMLElement;
                        revertModification(htmlPost); // Revert first
                        processPost(htmlPost);      // Then reprocess
                    });
                }
            } else {
                console.log('[ClearFeed for X] Extension disabled.');
                if (observer) observer.disconnect();
                document.querySelectorAll(`[${PROCESSED_MARKER}]`).forEach(el => revertModification(el as HTMLElement));
            }
        } else { console.error('[ClearFeed] Failed to fetch config:', response?.message); }
    });
}

// --- Start ---
fetchConfigAndStart(); 