import { type Rule, type Settings, type StorageData } from './types';

console.log('ClearFeed for X Content Script Loaded');

// --- State ---
let currentSettings: Settings | null = null;
let currentRules: Rule[] = [];
let observer: MutationObserver | null = null;

// Define structure for storing original state
type OriginalState = {
    originalPostHTML?: string;    // InnerHTML of the entire post element (used for reverting hide)
    originalTextHTML?: string;    // InnerHTML of the text container (used for reverting replace)
    originalDisplay: string;      // Original display style of the post element
    modifiedTextHTML?: string;    // InnerHTML of the text container *after* replacement
    isHiddenAction: boolean;      // Was the effective action 'hide'?
    isCurrentlyModified: boolean; // Is the post currently showing the modified state?
    ruleTarget?: string;          // Target of the rule that caused the modification (for placeholder)
};

// WeakMap to store state associated with post elements
const originalStateMap = new WeakMap<HTMLElement, OriginalState>();

// --- Constants ---
const POST_SELECTOR = 'article[role="article"]';
const POST_TEXT_SELECTOR = '[data-testid="tweetText"]';
const PROCESSED_MARKER = 'data-clearfeed-processed';
const BADGE_CLASS = 'clearfeed-badge';
const BADGE_APPLIED_TEXT = 'Show Original';
const BADGE_REVERTED_TEXT = 'Show Changes';
const HIDDEN_PLACEHOLDER_CLASS = 'clearfeed-hidden-placeholder';
const BADGE_CONTAINER_CLASS = 'clearfeed-badge-container'; // Class for the div holding badge in hidden posts

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
            console.debug(`[ClearFeed for X] HTML Replace Match:`, { regex: regex.source, flags: regex.flags, matchedText, matchIndex });
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
    state.originalPostHTML = postElement.innerHTML;
    if (textElement) {
        state.originalTextHTML = textElement.innerHTML;
    }
    originalStateMap.set(postElement, state);
    return state;
}

/**
 * Creates the placeholder content for a hidden post. Includes badge container.
 */
function createHiddenPlaceholder(ruleTarget: string | undefined): HTMLElement {
    const placeholder = document.createElement('div');
    placeholder.className = HIDDEN_PLACEHOLDER_CLASS;
    placeholder.style.padding = '10px';
    placeholder.style.border = '1px dashed #ccc';
    placeholder.style.fontSize = '12px';
    placeholder.style.color = '#666';
    placeholder.style.display = 'block';
    placeholder.textContent = `Post hidden by ClearFeed${ruleTarget ? ` (Rule: "${ruleTarget}")` : ''}. `;

    const badgeContainer = document.createElement('span');
    badgeContainer.className = BADGE_CONTAINER_CLASS;
    badgeContainer.style.marginLeft = '5px';
    placeholder.appendChild(badgeContainer);

    return placeholder;
}

/**
 * Adds or updates the ClearFeed badge on a post element.
 */
function addOrUpdateClearFeedBadge(postElement: HTMLElement, state: OriginalState) {
    if (!currentSettings?.showModificationBadge) {
        postElement.querySelector(`.${BADGE_CLASS}`)?.remove();
        return;
    }

    let badge = postElement.querySelector(`.${BADGE_CLASS}`) as HTMLButtonElement | null;
    let targetArea: HTMLElement | Element | null = null;

    // --- Find Injection Point ---
    if (state.isHiddenAction && state.isCurrentlyModified) {
        targetArea = postElement.querySelector(`.${BADGE_CONTAINER_CLASS}`);
    } else if (!state.isHiddenAction || !state.isCurrentlyModified) {
        const actionToolbarSelector = 'div[role="group"][id^="id__"]';
        targetArea = postElement.querySelector(actionToolbarSelector);
        if (!targetArea) {
            const textElement = postElement.querySelector(POST_TEXT_SELECTOR);
            targetArea = textElement?.parentElement || postElement;
        }
    } else {
        return; // Should not happen if called correctly
    }

    if (!badge && targetArea) {
        badge = document.createElement('button');
        badge.className = BADGE_CLASS;
        badge.title = 'Click to toggle ClearFeed modification';
        // Styles...
        badge.style.fontSize = '10px';
        badge.style.padding = '1px 4px';
        badge.style.border = '1px solid #ccc';
        badge.style.borderRadius = '3px';
        badge.style.cursor = 'pointer';
        badge.style.backgroundColor = '#f0f0f0';
        badge.style.marginLeft = '5px';
        badge.style.verticalAlign = 'middle';
        badge.style.lineHeight = 'normal';

        badge.onclick = handleToggleRevert;

        console.log('[ClearFeed for X] Injecting badge into:', targetArea);
        if (targetArea.classList.contains(HIDDEN_PLACEHOLDER_CLASS) || targetArea.classList.contains(BADGE_CONTAINER_CLASS)) {
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
        console.warn('[ClearFeed] Could not find injection point:', postElement);
        return;
    }

    if (badge) { // Update text if badge exists/was created
        badge.textContent = state.isCurrentlyModified ? BADGE_APPLIED_TEXT : BADGE_REVERTED_TEXT;
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

    if (state.isCurrentlyModified) {
        // --- Revert TO Original --- (Show Original)
        console.log('[ClearFeed for X] Reverting to original:', postElement);
        if (state.isHiddenAction) {
            if (state.originalPostHTML !== undefined) {
                postElement.innerHTML = state.originalPostHTML;
                postElement.style.display = state.originalDisplay;
            } else { console.warn('[ClearFeed] Missing originalPostHTML'); }
        } else if (textElement && state.originalTextHTML !== undefined) {
            textElement.innerHTML = state.originalTextHTML;
            postElement.style.display = state.originalDisplay;
        } else if (!textElement && state.originalPostHTML !== undefined) {
            postElement.innerHTML = state.originalPostHTML;
            postElement.style.display = state.originalDisplay;
        } else { postElement.style.display = state.originalDisplay; }

        state.isCurrentlyModified = false;
        // Update badge AFTER potential DOM changes if reverting from hidden
        addOrUpdateClearFeedBadge(postElement, state);

    } else {
        // --- Re-apply Modification --- (Show Changes)
        console.log('[ClearFeed for X] Re-applying modification:', postElement);
        if (state.isHiddenAction) {
            const placeholder = createHiddenPlaceholder(state.ruleTarget);
            if (state.originalPostHTML === undefined) state.originalPostHTML = postElement.innerHTML; // Store original NOW if missing
            postElement.innerHTML = '';
            postElement.appendChild(placeholder);
            postElement.style.display = 'block';
        } else if (textElement && state.modifiedTextHTML !== undefined) {
            textElement.innerHTML = state.modifiedTextHTML;
            postElement.style.display = state.originalDisplay || 'block';
        } else {
            console.warn('[ClearFeed] Cannot re-apply modification - state inconsistent', state);
            revertModification(postElement);
            return;
        }
        state.isCurrentlyModified = true;
        // Update badge AFTER DOM changes
        addOrUpdateClearFeedBadge(postElement, state);
    }
}

/**
 * Fully reverts modifications and cleans up state/badge.
 */
function revertModification(postElement: HTMLElement) {
    const state = originalStateMap.get(postElement);
    if (!state) return;
    console.log('[ClearFeed for X] Fully reverting & cleaning up post:', postElement);

    if (state.originalPostHTML !== undefined) {
        postElement.innerHTML = state.originalPostHTML;
    } else if (state.originalTextHTML !== undefined) {
        const textElement = postElement.querySelector(POST_TEXT_SELECTOR) as HTMLElement | null;
        if (textElement) textElement.innerHTML = state.originalTextHTML;
    }
    postElement.style.display = state.originalDisplay;

    postElement.removeAttribute(PROCESSED_MARKER);
    originalStateMap.delete(postElement);
    postElement.querySelector(`.${BADGE_CLASS}`)?.remove();
}

/**
 * Applies the rules to a given post element.
 */
function processPost(postElement: HTMLElement) {
    const existingState = originalStateMap.get(postElement);
    if (!currentSettings || !currentRules || !currentSettings.extensionEnabled ||
        (postElement.hasAttribute(PROCESSED_MARKER) && existingState?.isCurrentlyModified)) {
        return;
    }

    const textElement = postElement.querySelector(POST_TEXT_SELECTOR) as HTMLElement | null;
    const state = ensureOriginalStateStored(postElement, textElement);

    let hideRuleMatched: Rule | null = null;
    const modifications: { regex: RegExp, replacementHtml: string }[] = [];
    let ruleMatchedThisRun = false;

    // --- Rule Processing Loop ---
    for (const rule of currentRules) {
        if (!rule.enabled || (rule.type !== 'literal' && rule.type !== 'simple-regex')) continue;
        const regex = buildRegexForRule(rule);
        if (!regex) continue;
        const testText = textElement ? (textElement.textContent || '') : '';
        if (regex.test(testText)) {
            ruleMatchedThisRun = true;
            if (rule.action === 'hide') { hideRuleMatched = rule; break; }
            else if (rule.action === 'replace' && textElement) {
                const replacementHtml = formatReplacementText(rule.replacement);
                const modificationRegex = buildRegexForRule(rule);
                if (modificationRegex) modifications.push({ regex: modificationRegex, replacementHtml });
            }
        }
    }

    // --- Apply Action or Cleanup ---
    if (ruleMatchedThisRun) {
        postElement.setAttribute(PROCESSED_MARKER, 'true');
        const applyHideAction = hideRuleMatched !== null;
        const applicableRuleTarget = hideRuleMatched?.target;

        // --- Store state about THIS modification action ---
        state.isHiddenAction = applyHideAction;
        state.ruleTarget = applicableRuleTarget;
        state.isCurrentlyModified = true; // Assume modification applied

        if (applyHideAction) {
            const placeholder = createHiddenPlaceholder(applicableRuleTarget);
            if (state.originalPostHTML === undefined) state.originalPostHTML = postElement.innerHTML;
            postElement.innerHTML = '';
            postElement.appendChild(placeholder);
            postElement.style.display = 'block';
            state.modifiedTextHTML = undefined;
        } else if (modifications.length > 0 && textElement) {
            if (state.originalTextHTML !== undefined) {
                textElement.innerHTML = state.originalTextHTML;
            }
            modifications.forEach(({ regex, replacementHtml }) => {
                replaceTextWithHtml(textElement, regex, replacementHtml);
            });
            state.modifiedTextHTML = textElement.innerHTML;
            postElement.style.display = state.originalDisplay || 'block';
        } else {
            state.isCurrentlyModified = false; // No actual modification occurred
        }

        // Add/update badge (respects setting)
        addOrUpdateClearFeedBadge(postElement, state);

    } else if (existingState) { // Use existingState here
        // No rule matched now, but did before? Revert fully.
        revertModification(postElement);
    }
}

/**
 * Adds or removes badges across all processed posts based on the current setting.
 */
function updateAllBadgesVisibility() {
    if (!currentSettings) return;
    const showBadges = currentSettings.showModificationBadge;
    console.log(`[ClearFeed for X] Updating badge visibility: ${showBadges}`);

    document.querySelectorAll(`[${PROCESSED_MARKER}]`).forEach(postElementHTML => {
        const postElement = postElementHTML as HTMLElement;
        const state = originalStateMap.get(postElement);
        if (state) {
            if (showBadges) {
                addOrUpdateClearFeedBadge(postElement, state);
            } else {
                postElement.querySelector(`.${BADGE_CLASS}`)?.remove();
            }
        } else {
            postElement.removeAttribute(PROCESSED_MARKER);
        }
    });
}

// --- Listener for Background Updates ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'SETTINGS_UPDATED') {
        console.log(`[ClearFeed for X] Received SETTINGS_UPDATED`, message.payload);
        if (message.payload?.settings) {
            const settingChanged = JSON.stringify(currentSettings) !== JSON.stringify(message.payload.settings);
            const oldEnabledState = currentSettings?.extensionEnabled;
            currentSettings = message.payload.settings;

            if (settingChanged) {
                updateAllBadgesVisibility();
                // Handle global enable/disable change
                if (currentSettings?.extensionEnabled !== oldEnabledState) {
                    if (currentSettings?.extensionEnabled) {
                        observeTimeline(); // Start observing
                        // Reprocess everything on enable?
                        document.querySelectorAll(POST_SELECTOR).forEach(post => processPost(post as HTMLElement));
                    } else {
                        if (observer) observer.disconnect(); // Stop observing
                        // Revert all on disable
                        document.querySelectorAll(`[${PROCESSED_MARKER}]`).forEach(el => revertModification(el as HTMLElement));
                    }
                }
            }
        }
    } else if (message.type === 'RULES_UPDATED') {
        console.log(`[ClearFeed for X] Received RULES_UPDATED, re-fetching config & reprocessing.`);
        document.querySelectorAll(`[${PROCESSED_MARKER}]`).forEach(el => revertModification(el as HTMLElement));
        fetchConfigAndStart();
    }
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
    console.log('[ClearFeed for X] MutationObserver started.');
    document.querySelectorAll(POST_SELECTOR).forEach(post => processPost(post as HTMLElement));
}

function fetchConfigAndStart() {
    console.log('[ClearFeed for X] Fetching config...');
    chrome.runtime.sendMessage({ type: 'GET_ALL_DATA' }, (response) => {
        if (chrome.runtime.lastError) { console.error('[ClearFeed] Fetch error:', chrome.runtime.lastError); return; }
        if (response?.status === 'success' && response.data) {
            console.log('[ClearFeed for X] Config received.');
            const settingsChanged = JSON.stringify(currentSettings) !== JSON.stringify(response.data.settings);
            const rulesChanged = JSON.stringify(currentRules) !== JSON.stringify(response.data.rules);

            currentSettings = response.data.settings;
            currentRules = response.data.rules || [];

            updateAllBadgesVisibility();

            if (currentSettings?.extensionEnabled) {
                observeTimeline();
                if (rulesChanged && observer) { // Reprocess if rules changed and observing
                    console.log('[ClearFeed] Rules changed, re-processing visible posts.');
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