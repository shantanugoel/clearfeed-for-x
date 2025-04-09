import { type Rule, type Settings, type StorageData } from './types';

console.log('Agenda Revealer Content Script Loaded');

// --- State ---
let currentSettings: Settings | null = null;
let currentRules: Rule[] = [];
let observer: MutationObserver | null = null;

// --- Constants ---
const POST_SELECTOR = 'article[role="article"]'; // Selector for the main post/tweet container
const POST_TEXT_SELECTOR = '[data-testid="tweetText"]'; // Selector for the text content within a post/tweet
const PROCESSED_MARKER = 'data-agenda-revealer-processed'; // Attribute to mark processed posts/tweets

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
                // This prevents it becoming "\b\w*\b" which might be unintended.
            }
        }

        return processedPart;
    });

    const pattern = regexParts.join('|'); // Join alternatives with Regex OR
    const flags = rule.caseSensitive ? 'g' : 'gi'; // Global, case-insensitive (default)

    try {
        return new RegExp(pattern, flags);
    } catch (error) {
        console.error(`[Agenda Revealer] Invalid RegExp pattern generated for rule ID ${rule.id}:`, pattern, error);
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
            console.debug(`[Agenda Revealer] HTML Replace Match Found:`, {
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
 * Applies the rules to a given post/tweet element.
 */
function processPost(postElement: HTMLElement) {
    if (!currentSettings || !currentRules || !currentSettings.extensionEnabled || postElement.hasAttribute(PROCESSED_MARKER)) {
        return; // Don't process if disabled, no config, or already processed
    }

    const textElement = postElement.querySelector(POST_TEXT_SELECTOR) as HTMLElement;
    if (!textElement) {
        postElement.setAttribute(PROCESSED_MARKER, 'true');
        return;
    }

    let hidePost = false;
    // Store modifications to apply at the end to avoid conflicting replacements
    const modifications: { regex: RegExp, replacementHtml: string }[] = [];

    // Iterate through enabled rules (literal and simple-regex for Phase 2)
    for (const rule of currentRules) {
        if (!rule.enabled || (rule.type !== 'literal' && rule.type !== 'simple-regex')) continue;

        const regex = buildRegexForRule(rule);
        if (!regex) continue; // Skip if regex is invalid

        // Create a clone of the text element content for testing matches without modifying the live DOM yet
        // NOTE: Cloning might not perfectly capture all event listeners or complex state.
        // For simple text matching, checking textContent should be sufficient and safer.
        const testText = textElement.textContent || '';

        if (regex.test(testText)) {
            if (rule.action === 'hide') {
                hidePost = true;
                console.log(`[Agenda Revealer] Hiding post matching rule: "${rule.target}" (Rule ID: ${rule.id})`, postElement);
                break; // Stop processing rules if we decide to hide
            } else if (rule.action === 'replace') {
                console.log(`[Agenda Revealer] Queuing replacement for rule: "${rule.target}" (Rule ID: ${rule.id})`, postElement);
                const replacementHtml = formatReplacementText(rule.replacement);
                // We need to re-create the regex for each modification to reset its state (e.g., lastIndex)
                const modificationRegex = buildRegexForRule(rule);
                if (modificationRegex) {
                    modifications.push({ regex: modificationRegex, replacementHtml });
                }
            }
        }
    }

    // Apply modifications to the DOM
    postElement.setAttribute(PROCESSED_MARKER, 'true');

    if (hidePost) {
        postElement.style.display = 'none'; // Simple hiding
    } else if (modifications.length > 0) {
        // Apply replacements sequentially. Order might matter!
        // A more robust approach might try to find all matches first and replace carefully.
        console.log(`[Agenda Revealer] Applying ${modifications.length} replacements to post...`, postElement);
        modifications.forEach(({ regex, replacementHtml }) => {
            // Pass the live textElement to modify
            replaceTextWithHtml(textElement, regex, replacementHtml);
        });
    }
}

/**
 * Observes changes in the DOM and processes new posts/tweets.
 */
function observeTimeline() {
    if (observer) observer.disconnect(); // Disconnect previous observer if any

    const targetNode = document.body; // Observe the whole body
    if (!targetNode) {
        console.error('[Agenda Revealer] Could not find target node for MutationObserver.');
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
    console.log('[Agenda Revealer] MutationObserver started.');

    // Process existing posts/tweets on the page when observation starts
    document.querySelectorAll(`${POST_SELECTOR}:not([${PROCESSED_MARKER}])`)
        .forEach(post => processPost(post as HTMLElement));
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
        console.log(`[Agenda Revealer] Received ${message.type}, re-fetching config.`);
        fetchConfigAndStart();
    }
}); 