import { type Rule, type Settings, type StorageData } from './types';

console.log('ClearFeed for X Content Script Loaded');

// --- State ---
let currentSettings: Settings | null = null;
let currentRules: Rule[] = [];
let observer: MutationObserver | null = null;

// Store original state for revert functionality
// WeakMap keys are post elements, values are { originalHTML?: string, originalDisplay?: string }
const originalStateMap = new WeakMap<HTMLElement, { originalHTML?: string, originalDisplay?: string }>();

// --- Constants ---
const POST_SELECTOR = 'article[role="article"]'; // Selector for the main post/tweet container
const POST_TEXT_SELECTOR = '[data-testid="tweetText"]'; // Selector for the text content within a post/tweet
const PROCESSED_MARKER = 'data-clearfeed-processed'; // Attribute to mark processed posts/tweets
const BADGE_CLASS = 'clearfeed-badge';
const BADGE_REVERT_CLASS = 'clearfeed-revert-button';

// --- Core Logic ---

/**
 * Finds the main post container element travelling up from a given element.
 */
function findParentPostElement(element: Node | null): HTMLElement | null {
    let current: Node | null = element;
    while (current && current instanceof HTMLElement) {
        if (current.matches(POST_SELECTOR)) {
            return current;
        }
        current = current.parentElement;
    }
    return null;
}

/**
 * Builds a RegExp object from a rule, handling literal, simple-regex, and the OR operator.
 */
function buildRegexForRule(rule: Rule): RegExp | null {
    if (!rule.target) return null;

    const parts = rule.target.split('|').map(part => part.trim()).filter(part => part.length > 0);
    if (parts.length === 0) return null;

    const regexParts = parts.map(part => {
        let processedPart = part;

        // 1. Convert simple-regex wildcards *before* escaping other chars
        if (rule.type === 'simple-regex') {
            processedPart = processedPart
                .replace(/[*]/g, '__TEMP_ASTERISK__') // Temp marker for *
                .replace(/[?]/g, '__TEMP_QUESTION__'); // Temp marker for ?
        }

        // 2. Escape general regex characters
        processedPart = escapeRegExp(processedPart);

        // 3. Replace temp markers with actual regex equivalents
        if (rule.type === 'simple-regex') {
            processedPart = processedPart
                .replace(/__TEMP_ASTERISK__/g, '\\w*')  // Convert * to \w* (zero or more word characters, greedy)
                .replace(/__TEMP_QUESTION__/g, '.');   // Convert ? to . (any single character)
        }

        // 4. Add word boundaries if requested
        if (rule.matchWholeWord) {
            const startsWithWildcard = processedPart.startsWith('\w*') || processedPart.startsWith('.');
            const endsWithWildcard = processedPart.endsWith('\w*') || processedPart.endsWith('.');

            // Add leading \b unless the pattern starts with a wildcard
            const finalStart = startsWithWildcard ? '' : '\\b';
            // Add trailing \b unless the pattern ends with a wildcard
            const finalEnd = endsWithWildcard ? '' : '\\b';

            // Avoid adding boundaries if the entire pattern might just be wildcards (e.g., \w* or .)
            // This might still need refinement for complex patterns, but handles common cases.
            const effectivelyJustWildcards = processedPart === '\w*' || processedPart === '.';

            if (!effectivelyJustWildcards) {
                processedPart = `${finalStart}${processedPart}${finalEnd}`;
            } else {
                // If the pattern IS just wildcards, don't add boundaries
                // For example, a rule with target "*" and matchWholeWord=true becomes just "\w*"
                // This prevents it becoming "\b\w*\b" which might be unintended for ClearFeed.
            }
        }

        return processedPart;
    });

    const pattern = regexParts.join('|'); // Join alternatives with Regex OR
    const flags = rule.caseSensitive ? 'g' : 'gi'; // Global, case-insensitive (default)

    try {
        return new RegExp(pattern, flags);
    } catch (error) {
        console.error(`[ClearFeed for X] Invalid RegExp pattern generated for rule ID ${rule.id}:`, pattern, error);
        return null;
    }
}

/**
 * Parses markdown-like formatting (**bold**, *italic*) into HTML.
 */
function formatReplacementText(replacement: string): string {
    // Basic escaping first to avoid injecting unwanted HTML
    let html = escapeHtml(replacement);
    // Apply formatting - order matters if nesting is ever considered
    // Using capture groups to replace markers but keep content
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>'); // **bold** -> <strong>bold</strong>
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');         // *italic* -> <em>italic</em>
    return html;
}

/**
 * Replaces matched text within an element with the provided HTML, preserving structure.
 * This is complex due to potential nested elements within the text container.
 */
function replaceTextWithHtml(textElement: HTMLElement, regex: RegExp, replacementHtml: string) {
    // We need to iterate through text nodes and perform replacements carefully.
    // TreeWalker is ideal for finding all text nodes within the target element.
    const walker = document.createTreeWalker(textElement, NodeFilter.SHOW_TEXT);
    let node;
    const nodesToProcess: Text[] = [];
    // Collect all text nodes first
    while (node = walker.nextNode()) {
        if (node instanceof Text) {
            nodesToProcess.push(node);
        }
    }

    // Reset regex state for global matching across nodes if needed (though usually applied per node)
    regex.lastIndex = 0;

    // Iterate through the collected text nodes
    for (const textNode of nodesToProcess) {
        const textContent = textNode.nodeValue || '';
        let match;
        let lastIndex = 0;
        const fragment = document.createDocumentFragment();

        // Reset the regex index for each node
        regex.lastIndex = 0;

        // Find all matches within this specific text node
        while ((match = regex.exec(textContent)) !== null) {
            const matchIndex = match.index;
            const matchedText = match[0];

            // --- DEBUG LOGGING --- 
            console.debug(`[ClearFeed for X] HTML Replace Match Found:`, {
                regex: regex.source,
                flags: regex.flags,
                textNodeContent: textContent,
                matchedText: matchedText,
                matchIndex: matchIndex,
                replacementHtml: replacementHtml,
            });
            // --- END DEBUG LOGGING ---

            // Append text before the match
            if (matchIndex > lastIndex) {
                fragment.appendChild(document.createTextNode(textContent.substring(lastIndex, matchIndex)));
            }

            // Create a temporary element to parse and insert the replacement HTML
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = replacementHtml; // Use the pre-formatted HTML
            // Append all children of the tempDiv (could be text nodes, strong, em)
            while (tempDiv.firstChild) {
                fragment.appendChild(tempDiv.firstChild);
            }

            lastIndex = matchIndex + matchedText.length;

            // If the regex isn't global, break after the first match in this node
            if (!regex.global) {
                break;
            }
        }

        // If any replacements happened in this node...
        if (lastIndex > 0) {
            // Append any remaining text after the last match
            if (lastIndex < textContent.length) {
                fragment.appendChild(document.createTextNode(textContent.substring(lastIndex)));
            }
            // Replace the original text node with the fragment containing replacements
            textNode.parentNode?.replaceChild(fragment, textNode);
        } else {
            // No match found in this node, reset index just in case (though should be handled by exec)
            regex.lastIndex = 0;
        }
    }
}

/**
 * Reverts modifications made to a post element.
 */
function revertModification(postElement: HTMLElement) {
    const originalState = originalStateMap.get(postElement);
    if (!originalState) return; // No state saved?

    console.log('[ClearFeed for X] Reverting modifications for post:', postElement);

    if (originalState.originalHTML !== undefined) {
        const textElement = postElement.querySelector(POST_TEXT_SELECTOR) as HTMLElement;
        if (textElement) {
            textElement.innerHTML = originalState.originalHTML;
        }
    }
    if (originalState.originalDisplay !== undefined) {
        postElement.style.display = originalState.originalDisplay;
    }

    // Clean up
    postElement.removeAttribute(PROCESSED_MARKER);
    originalStateMap.delete(postElement);
    postElement.querySelector(`.${BADGE_CLASS}`)?.remove();
}

/**
 * Injects the ClearFeed badge into a post element.
 */
function addClearFeedBadge(postElement: HTMLElement, modified: boolean, hidden: boolean) {
    // Avoid adding multiple badges
    if (postElement.querySelector(`.${BADGE_CLASS}`)) return;

    const badge = document.createElement('button'); // Use button for better accessibility
    badge.className = `${BADGE_CLASS} ${BADGE_REVERT_CLASS}`;
    badge.textContent = 'ClearFeed Applied'; // Placeholder text
    badge.title = 'Click to revert ClearFeed modifications for this post';
    badge.style.marginLeft = 'auto'; // Try to push to the right
    badge.style.fontSize = '10px';
    badge.style.padding = '2px 4px';
    badge.style.border = '1px solid #ccc';
    badge.style.borderRadius = '3px';
    badge.style.cursor = 'pointer';
    badge.style.backgroundColor = '#f0f0f0';

    badge.onclick = (e) => {
        e.stopPropagation(); // Prevent event bubbling
        revertModification(postElement);
    };

    // --- Injection Point --- 
    // Finding a stable place to inject is tricky in X.com's UI.
    // Let's try appending it to the container that often holds the action buttons (reply, repost, like, etc.)
    // This selector might need frequent updates.
    const actionToolbarSelector = 'div[role="group"][id^="id__"]';
    let targetArea = postElement.querySelector(actionToolbarSelector);

    if (!targetArea) {
        // Fallback: Append near the text element if toolbar not found
        const textElement = postElement.querySelector(POST_TEXT_SELECTOR);
        targetArea = textElement?.parentElement || null;
        badge.style.display = 'block'; // Make it block if appending here
        badge.style.marginTop = '5px';
    }

    if (targetArea) {
        console.log('[ClearFeed for X] Injecting badge into:', targetArea);
        targetArea.appendChild(badge); // Append to the end of the toolbar/area
    } else {
        console.warn('[ClearFeed for X] Could not find suitable injection point for badge on post:', postElement);
    }
}

/**
 * Applies the rules to a given post/tweet element.
 */
function processPost(postElement: HTMLElement) {
    if (!currentSettings || !currentRules || !currentSettings.extensionEnabled || postElement.hasAttribute(PROCESSED_MARKER)) {
        return;
    }

    const textElement = postElement.querySelector(POST_TEXT_SELECTOR) as HTMLElement;
    // Even if textElement is not found later, we might hide the post, so don't return early.

    let hidePost = false;
    const modifications: { regex: RegExp, replacementHtml: string }[] = [];
    let modificationApplied = false; // Track if any action is taken
    let originalHTML: string | undefined = undefined;
    let originalDisplay: string | undefined = undefined;

    // --- Store Original State FIRST (if needed) --- 
    if (textElement) {
        originalHTML = textElement.innerHTML; // Store potentially complex HTML
    }
    originalDisplay = postElement.style.display;

    // --- Rule Processing Loop --- 
    for (const rule of currentRules) {
        if (!rule.enabled || (rule.type !== 'literal' && rule.type !== 'simple-regex')) continue;

        const regex = buildRegexForRule(rule);
        if (!regex) continue;

        // Only test on textElement content if it exists and action is 'replace'
        const testText = textElement ? (textElement.textContent || '') : ''; // Use textContent for test

        if (rule.action === 'hide') {
            // For hide actions, we might need to check more than just the main text,
            // potentially profile links, quoted tweets etc. This is complex.
            // For now, stick to matching within the main text element if it exists.
            if (textElement && regex.test(testText)) {
                hidePost = true;
                console.log(`[ClearFeed for X] Hiding post matching rule: "${rule.target}" (Rule ID: ${rule.id})`, postElement);
                modificationApplied = true;
                break; // Stop processing rules if we decide to hide
            }
        } else if (rule.action === 'replace' && textElement) {
            // Only test for replacement if textElement exists
            if (regex.test(testText)) {
                console.log(`[ClearFeed for X] Queuing replacement for rule: "${rule.target}" (Rule ID: ${rule.id})`, postElement);
                const replacementHtml = formatReplacementText(rule.replacement);
                const modificationRegex = buildRegexForRule(rule); // Re-build to reset state
                if (modificationRegex) {
                    modifications.push({ regex: modificationRegex, replacementHtml });
                    modificationApplied = true;
                    // Don't break here, allow multiple replacements potentially
                }
            }
        }
    }

    // --- Apply Modifications & Badge --- 
    if (modificationApplied) {
        // Store original state ONLY if a modification actually happened
        originalStateMap.set(postElement, { originalHTML, originalDisplay });

        postElement.setAttribute(PROCESSED_MARKER, 'true');

        if (hidePost) {
            postElement.style.display = 'none';
            addClearFeedBadge(postElement, false, true);
        } else if (modifications.length > 0 && textElement) {
            console.log(`[ClearFeed for X] Applying ${modifications.length} replacements to post...`, postElement);
            modifications.forEach(({ regex, replacementHtml }) => {
                replaceTextWithHtml(textElement, regex, replacementHtml);
            });
            addClearFeedBadge(postElement, true, false);
        }
    } else {
        // If no rules matched, mark as processed anyway to avoid re-checking
        // unless it already has the marker (e.g., from a previous run)
        if (!postElement.hasAttribute(PROCESSED_MARKER)) {
            postElement.setAttribute(PROCESSED_MARKER, 'no-match'); // Use a different marker?
        }
    }
}

/**
 * Observes changes in the DOM and processes new posts/tweets.
 */
function observeTimeline() {
    if (observer) observer.disconnect(); // Disconnect previous observer if any

    const targetNode = document.body; // Observe the whole body
    if (!targetNode) {
        console.error('[ClearFeed for X] Could not find target node for MutationObserver.');
        return;
    }

    const config: MutationObserverInit = { childList: true, subtree: true };

    const callback: MutationCallback = (mutationsList) => {
        for (const mutation of mutationsList) {
            if (mutation.type === 'childList') {
                mutation.addedNodes.forEach(node => {
                    if (node instanceof HTMLElement) {
                        if (node.matches(POST_SELECTOR) && !node.hasAttribute(PROCESSED_MARKER)) {
                            processPost(node);
                        } else {
                            node.querySelectorAll(`${POST_SELECTOR}:not([${PROCESSED_MARKER}])`)
                                .forEach(post => processPost(post as HTMLElement));
                        }
                    }
                });
            }
        }
    };

    observer = new MutationObserver(callback);
    observer.observe(targetNode, config);
    console.log('[ClearFeed for X] MutationObserver started.');

    // Process existing posts/tweets on the page when observation starts
    document.querySelectorAll(`${POST_SELECTOR}:not([${PROCESSED_MARKER}])`)
        .forEach(post => processPost(post as HTMLElement));
}

/**
 * Fetches the latest settings and rules from the background script.
 */
function fetchConfigAndStart() {
    console.log('[ClearFeed for X] Fetching config...');
    chrome.runtime.sendMessage({ type: 'GET_ALL_DATA' }, (response) => {
        if (chrome.runtime.lastError) {
            console.error('[ClearFeed for X] Error fetching config:', chrome.runtime.lastError);
            return;
        }
        if (response?.status === 'success' && response.data) {
            console.log('[ClearFeed for X] Config received:', response.data);
            currentSettings = response.data.settings;
            currentRules = response.data.rules || [];

            if (currentSettings?.extensionEnabled) {
                observeTimeline(); // Start observing only if extension is enabled
            } else {
                console.log('[ClearFeed for X] Extension is disabled in settings.');
                if (observer) observer.disconnect(); // Stop observing if disabled
            }
        } else {
            console.error('[ClearFeed for X] Failed to fetch config:', response?.message);
        }
    });
}

// --- Utility: Escape Regex Special Chars & Basic HTML ---
function escapeRegExp(string: string): string {
    // Escape characters with special meaning in RegExp
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeHtml(unsafe: string): string {
    // Basic HTML entity escaping
    if (!unsafe) return '';
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// --- Initialization ---
fetchConfigAndStart();

// --- Listen for updates from background (e.g., settings changed) ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'SETTINGS_UPDATED' || message.type === 'RULES_UPDATED') {
        console.log(`[ClearFeed for X] Received ${message.type}, re-fetching config.`);
        fetchConfigAndStart();
    }
}); 