import './options.css';
import { type Rule, type Settings, type StorageData, type ExtensionMessage } from '../types';
import { v4 as uuidv4 } from 'uuid';

console.log('Options script loaded.');

// --- Global State (in-memory copy) ---
let currentSettings: Settings | null = null;
let currentRules: Rule[] = [];

// --- DOM Elements ---
let settingsForm: HTMLDivElement | null = null;
let rulesContainer: HTMLDivElement | null = null;
let ruleEditor: HTMLDivElement | null = null;
let ruleForm: {
    id: HTMLInputElement | null;
    type: HTMLSelectElement | null;
    target: HTMLInputElement | null;
    replacement: HTMLInputElement | null;
    action: HTMLSelectElement | null;
    caseSensitive: HTMLInputElement | null;
    enabled: HTMLInputElement | null;
    targetLabel: HTMLLabelElement | null;
    targetHelp: HTMLElement | null;
    replacementGroup: HTMLDivElement | null;
    caseSensitiveGroup: HTMLDivElement | null;
    matchWholeWord: HTMLInputElement | null;
    matchWholeWordGroup: HTMLDivElement | null;
} | null = null;
let ruleEditorTitle: HTMLElement | null = null;
let addRuleBtn: HTMLButtonElement | null = null;
let saveSettingsBtn: HTMLButtonElement | null = null;
let saveRuleBtn: HTMLButtonElement | null = null;
let cancelRuleBtn: HTMLButtonElement | null = null;
let statusDisplay: HTMLElement | null = null; // Optional element to show status messages
let exportBtn: HTMLButtonElement | null = null;
let importBtn: HTMLButtonElement | null = null;
let importFileInput: HTMLInputElement | null = null;

// --- Utility Functions ---
function showStatus(message: string, isError = false) {
    console.log(`Status (${isError ? 'Error' : 'Success'}): ${message}`);
    // Optional: Update a status element in the DOM
    // if (statusDisplay) {
    //     statusDisplay.textContent = message;
    //     statusDisplay.className = isError ? 'status-error' : 'status-success';
    // }
}

// --- Rendering Functions ---
function renderSettings() {
    if (!currentSettings || !settingsForm) return;

    (settingsForm.querySelector('#extensionEnabled') as HTMLInputElement).checked = currentSettings.extensionEnabled;
    (settingsForm.querySelector('#semanticAnalysisEnabled') as HTMLInputElement).checked = currentSettings.semanticAnalysisEnabled;
    // Add rendering for other settings (localStorageEnabled, submissionMode etc.) in later phases
}

function renderRules() {
    if (!rulesContainer) return;

    rulesContainer.innerHTML = ''; // Clear previous content

    if (currentRules.length === 0) {
        rulesContainer.innerHTML = '<p>No rules configured yet.</p>';
        return;
    }

    const table = document.createElement('table');
    table.className = 'rules-table';
    table.innerHTML = `
        <thead>
            <tr>
                <th>Enabled</th>
                <th>Type</th>
                <th>Target / Intent</th>
                <th>Replacement</th>
                <th>Action</th>
                <th>Case Sensitive</th>
                <th>Whole Word</th>
                <th>Actions</th>
            </tr>
        </thead>
        <tbody>
        </tbody>
    `;
    const tbody = table.querySelector('tbody')!;

    currentRules.forEach(rule => {
        const tr = document.createElement('tr');
        tr.dataset.ruleId = rule.id;
        tr.innerHTML = `
            <td><input type="checkbox" class="rule-enabled-toggle" ${rule.enabled ? 'checked' : ''}></td>
            <td>${rule.type}</td>
            <td class="rule-target-cell">${escapeHtml(rule.target)}</td>
            <td>${rule.action === 'replace' ? escapeHtml(rule.replacement) : '-'}</td>
            <td>${rule.action}</td>
            <td>${rule.type === 'literal' || rule.type === 'simple-regex' ? (rule.caseSensitive ? 'Yes' : 'No') : 'N/A'}</td>
            <td>${rule.type === 'literal' || rule.type === 'simple-regex' ? (rule.matchWholeWord ? 'Yes' : 'No') : 'N/A'}</td>
            <td>
                <button class="edit-rule-btn" data-rule-id="${rule.id}">Edit</button>
                <button class="delete-rule-btn" data-rule-id="${rule.id}" ${rule.isDefault ? 'disabled' : ''} title="${rule.isDefault ? 'Default rules cannot be deleted' : 'Delete rule'}">Delete</button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    rulesContainer.appendChild(table);
}

// Basic HTML escaping
function escapeHtml(unsafe: string): string {
    if (!unsafe) return '';
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// --- Rule Editor Functions ---
function showRuleEditor(rule?: Rule) {
    if (!ruleEditor || !ruleForm || !ruleEditorTitle) return;

    // Reset form
    ruleForm.id!.value = rule?.id || '';
    ruleForm.type!.value = rule?.type || 'literal';
    ruleForm.target!.value = rule?.target || '';
    ruleForm.replacement!.value = rule?.replacement || '';
    ruleForm.action!.value = rule?.action || 'replace';
    ruleForm.caseSensitive!.checked = rule?.caseSensitive || false;
    ruleForm.matchWholeWord!.checked = rule?.matchWholeWord || false;
    ruleForm.enabled!.checked = rule?.enabled ?? true; // Default to enabled for new rules

    ruleEditorTitle.textContent = rule ? 'Edit Rule' : 'Add Rule';
    updateRuleFormVisibility(); // Adjust visibility based on type/action
    ruleEditor.style.display = 'block';
}

function hideRuleEditor() {
    if (!ruleEditor) return;
    ruleEditor.style.display = 'none';
}

function updateRuleFormVisibility() {
    if (!ruleForm) return;
    const selectedType = ruleForm.type!.value as Rule['type'];
    const selectedAction = ruleForm.action!.value as Rule['action'];

    const isRegexOrLiteral = selectedType === 'literal' || selectedType === 'simple-regex';

    // Show/hide case sensitive based on type (only for literal/simple-regex)
    ruleForm.caseSensitiveGroup!.style.display = isRegexOrLiteral ? 'block' : 'none';
    // Show/hide match whole word based on type (only for literal/simple-regex)
    ruleForm.matchWholeWordGroup!.style.display = isRegexOrLiteral ? 'block' : 'none';
    // Show/hide replacement based on action
    ruleForm.replacementGroup!.style.display = selectedAction === 'replace' ? 'block' : 'none';

    // Update target label/help text
    if (selectedType === 'semantic') {
        ruleForm.targetLabel!.textContent = 'Intent Description:';
        ruleForm.targetHelp!.innerHTML = 'Describe the semantic intent (e.g., "post promoting crypto scam").'; // Use innerHTML for potential formatting
    } else if (selectedType === 'simple-regex') {
        ruleForm.targetLabel!.textContent = 'Simple Regex Pattern:';
        ruleForm.targetHelp!.innerHTML = 'Use * for zero or more letters/numbers/underscores (within a word), ? for one character. Use | for alternatives.';
    } else { // Literal
        ruleForm.targetLabel!.textContent = 'Phrase(s) to Find:';
        ruleForm.targetHelp!.innerHTML = 'The exact word/phrase. Use | for alternatives.';
    }
}

// --- Event Handlers ---
function handleSaveSettings() {
    if (!currentSettings || !settingsForm) return;

    const newSettings: Settings = {
        ...currentSettings,
        extensionEnabled: (settingsForm.querySelector('#extensionEnabled') as HTMLInputElement).checked,
        semanticAnalysisEnabled: (settingsForm.querySelector('#semanticAnalysisEnabled') as HTMLInputElement).checked,
        // Update other settings in later phases
    };

    chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', payload: { settings: newSettings } }, (response) => {
        if (response?.status === 'success') {
            currentSettings = newSettings; // Update local state
            showStatus('General settings saved.');
        } else {
            showStatus(`Error saving settings: ${response?.message || 'Unknown error'}`, true);
        }
    });
}

function handleSaveRule() {
    if (!ruleForm) return;

    const ruleId = ruleForm.id!.value;
    const isEditing = !!ruleId;

    const ruleData: Rule = {
        id: ruleId || uuidv4(),
        type: ruleForm.type!.value as 'literal' | 'semantic' | 'simple-regex',
        target: ruleForm.target!.value.trim(),
        replacement: ruleForm.replacement!.value.trim(),
        action: ruleForm.action!.value as 'replace' | 'hide',
        caseSensitive: ruleForm.caseSensitive!.checked,
        matchWholeWord: ruleForm.matchWholeWord!.checked,
        enabled: ruleForm.enabled!.checked,
        isDefault: false, // New or edited rules are not default
    };

    // Basic validation
    if (!ruleData.target) {
        showStatus('Target/Intent cannot be empty.', true);
        return;
    }
    if (ruleData.action === 'replace' && !ruleData.replacement) {
        // Allow empty replacement for replace action, maybe user wants to effectively delete text?
        // Consider adding a warning or clarification if this is unintended.
    }

    let updatedRules: Rule[];
    if (isEditing) {
        updatedRules = currentRules.map(r => r.id === ruleId ? ruleData : r);
    } else {
        updatedRules = [...currentRules, ruleData];
    }

    chrome.runtime.sendMessage({ type: 'SAVE_RULES', payload: { rules: updatedRules } }, (response) => {
        if (response?.status === 'success') {
            currentRules = updatedRules; // Update local state
            renderRules();
            hideRuleEditor();
            showStatus(`Rule ${isEditing ? 'updated' : 'added'} successfully.`);
        } else {
            showStatus(`Error saving rule: ${response?.message || 'Unknown error'}`, true);
        }
    });
}

function handleRuleListClick(event: MouseEvent) {
    const target = event.target as HTMLElement;

    // --- Edit Button --- 
    if (target.classList.contains('edit-rule-btn')) {
        const ruleId = target.dataset.ruleId;
        const ruleToEdit = currentRules.find(r => r.id === ruleId);
        if (ruleToEdit) {
            showRuleEditor(ruleToEdit);
        }
    }
    // --- Delete Button --- 
    else if (target.classList.contains('delete-rule-btn')) {
        const ruleId = target.dataset.ruleId;
        const ruleToDelete = currentRules.find(r => r.id === ruleId);
        if (ruleToDelete && !ruleToDelete.isDefault) { // Double check it's not a default rule
            if (confirm(`Are you sure you want to delete the rule for "${ruleToDelete.target}"?`)) {
                const updatedRules = currentRules.filter(r => r.id !== ruleId);
                chrome.runtime.sendMessage({ type: 'SAVE_RULES', payload: { rules: updatedRules } }, (response) => {
                    if (response?.status === 'success') {
                        currentRules = updatedRules; // Update local state
                        renderRules();
                        showStatus('Rule deleted.');
                    } else {
                        showStatus(`Error deleting rule: ${response?.message || 'Unknown error'}`, true);
                    }
                });
            }
        }
    }
    // --- Enable/Disable Checkbox --- 
    else if (target.classList.contains('rule-enabled-toggle')) {
        const checkbox = target as HTMLInputElement;
        const tr = checkbox.closest('tr');
        const ruleId = tr?.dataset.ruleId;
        if (ruleId) {
            const updatedRules = currentRules.map(r =>
                r.id === ruleId ? { ...r, enabled: checkbox.checked } : r
            );
            // Save immediately on toggle
            chrome.runtime.sendMessage({ type: 'SAVE_RULES', payload: { rules: updatedRules } }, (response) => {
                if (response?.status === 'success') {
                    currentRules = updatedRules; // Update local state
                    // No re-render needed, checkbox is already visually updated
                    showStatus(`Rule ${checkbox.checked ? 'enabled' : 'disabled'}.`);
                } else {
                    showStatus(`Error toggling rule: ${response?.message || 'Unknown error'}`, true);
                    // Revert checkbox if save failed
                    checkbox.checked = !checkbox.checked;
                }
            });
        }
    }
}

function handleExportRules() {
    if (currentRules.length === 0) {
        showStatus('No rules to export.', true);
        return;
    }

    try {
        // We typically don't export the isDefault flag
        const rulesToExport = currentRules.map(({ isDefault, ...rest }) => rest);
        const jsonString = JSON.stringify(rulesToExport, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'agenda-revealer-rules.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showStatus('Rules exported successfully.');
    } catch (error) {
        console.error('Error exporting rules:', error);
        showStatus('Failed to export rules.', true);
    }
}

function handleImportRules() {
    importFileInput?.click(); // Trigger hidden file input
}

function handleFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) {
        return;
    }

    const file = input.files[0];
    if (!file) {
        showStatus('No file selected.', true);
        input.value = ''; // Reset input
        return;
    }

    const reader = new FileReader();

    reader.onload = (e) => {
        const text = e.target?.result as string;
        if (!text) {
            showStatus('Failed to read file.', true);
            return;
        }

        try {
            const importedData = JSON.parse(text);

            // --- Validation --- 
            if (!Array.isArray(importedData)) {
                throw new Error('Imported data is not an array.');
            }

            const validatedRules: Rule[] = [];
            const existingRuleIds = new Set(currentRules.map(r => r.id));

            for (const item of importedData) {
                // Basic structure check
                if (!item || typeof item !== 'object' ||
                    !item.type || typeof item.type !== 'string' ||
                    !item.target || typeof item.target !== 'string' ||
                    !item.action || typeof item.action !== 'string' ||
                    typeof item.enabled !== 'boolean') {
                    console.warn('Skipping invalid rule during import (missing core fields):', item);
                    continue; // Skip invalid items
                }

                // Check allowed types/actions
                if (!['literal', 'simple-regex', 'semantic'].includes(item.type)) {
                    console.warn('Skipping invalid rule during import (invalid type):', item);
                    continue;
                }
                if (!['replace', 'hide'].includes(item.action)) {
                    console.warn('Skipping invalid rule during import (invalid action):', item);
                    continue;
                }

                // Generate new ID if missing or duplicate, ensure all properties exist
                const newRule: Rule = {
                    id: (!item.id || typeof item.id !== 'string' || existingRuleIds.has(item.id)) ? uuidv4() : item.id,
                    type: item.type,
                    target: item.target.trim(),
                    replacement: (item.replacement || '').trim(),
                    action: item.action,
                    enabled: item.enabled,
                    caseSensitive: typeof item.caseSensitive === 'boolean' ? item.caseSensitive : false,
                    matchWholeWord: typeof item.matchWholeWord === 'boolean' ? item.matchWholeWord : false,
                    isDefault: false, // Imported rules are never default
                };
                validatedRules.push(newRule);
                existingRuleIds.add(newRule.id); // Add new ID to set for future checks
            }

            if (validatedRules.length === 0 && importedData.length > 0) {
                showStatus('Import failed: No valid rules found in the file.', true);
                return;
            }
            if (validatedRules.length < importedData.length) {
                showStatus(`Imported ${validatedRules.length} rules. Some invalid entries were skipped.`, false);
            } else {
                showStatus(`Successfully parsed ${validatedRules.length} rules from file.`, false);
            }

            // --- Merging Strategy: Add new, ignore duplicates by ID (handled above) --- 
            // We could add options later (e.g., replace all, merge keeping existing)
            // For now, just append validated new rules (duplicate IDs were skipped/regenerated)
            const mergedRules = [...currentRules, ...validatedRules.filter(vr => !currentRules.some(cr => cr.id === vr.id))];
            // If we wanted to replace existing rules based on imported IDs:
            // const importedIds = new Set(validatedRules.map(r => r.id));
            // const mergedRules = [
            //     ...currentRules.filter(r => !importedIds.has(r.id)),
            //     ...validatedRules
            // ];

            // --- Save --- 
            chrome.runtime.sendMessage({ type: 'SAVE_RULES', payload: { rules: mergedRules } }, (response) => {
                if (response?.status === 'success') {
                    currentRules = mergedRules; // Update local state
                    renderRules();
                    showStatus('Rules imported and saved successfully.');
                } else {
                    showStatus(`Error saving imported rules: ${response?.message || 'Unknown error'}`, true);
                }
            });

        } catch (error) {
            console.error('Error importing rules:', error);
            showStatus(`Failed to import rules: ${error instanceof Error ? error.message : 'Invalid JSON format'}`, true);
        }

        // Reset file input value so the same file can be selected again if needed
        input.value = '';
    };

    reader.onerror = () => {
        showStatus('Error reading file.', true);
        input.value = '';
    };

    reader.readAsText(file);
}

// --- Initialization --- 
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM fully loaded and parsed');

    // Get element references
    settingsForm = document.getElementById('general-settings') as HTMLDivElement;
    rulesContainer = document.getElementById('rule-list-container') as HTMLDivElement;
    ruleEditor = document.getElementById('rule-editor') as HTMLDivElement;
    ruleEditorTitle = document.getElementById('rule-editor-title');
    addRuleBtn = document.getElementById('add-rule-btn') as HTMLButtonElement;
    saveSettingsBtn = document.getElementById('save-settings-btn') as HTMLButtonElement;
    saveRuleBtn = document.getElementById('save-rule-btn') as HTMLButtonElement;
    cancelRuleBtn = document.getElementById('cancel-rule-btn') as HTMLButtonElement;
    exportBtn = document.getElementById('export-rules-btn') as HTMLButtonElement;
    importBtn = document.getElementById('import-rules-btn') as HTMLButtonElement;
    importFileInput = document.getElementById('import-file-input') as HTMLInputElement;
    // statusDisplay = document.getElementById('status-display'); // Uncomment if you add a status element

    // Cache form elements
    if (ruleEditor) {
        ruleForm = {
            id: ruleEditor.querySelector('#rule-id'),
            type: ruleEditor.querySelector('#rule-type'),
            target: ruleEditor.querySelector('#rule-target'),
            replacement: ruleEditor.querySelector('#rule-replacement'),
            action: ruleEditor.querySelector('#rule-action'),
            caseSensitive: ruleEditor.querySelector('#rule-caseSensitive'),
            enabled: ruleEditor.querySelector('#rule-enabled'),
            targetLabel: ruleEditor.querySelector('#rule-target-label'),
            targetHelp: ruleEditor.querySelector('#rule-target-help'),
            replacementGroup: ruleEditor.querySelector('#replacement-group'),
            caseSensitiveGroup: ruleEditor.querySelector('#case-sensitive-group'),
            matchWholeWord: ruleEditor.querySelector('#rule-matchWholeWord'),
            matchWholeWordGroup: ruleEditor.querySelector('#match-whole-word-group'),
        };
    }

    // Request initial data
    chrome.runtime.sendMessage({ type: 'GET_ALL_DATA' }, (response) => {
        console.log('Initial data response:', response);
        if (response?.status === 'success' && response.data) {
            currentSettings = response.data.settings;
            currentRules = response.data.rules || [];
            renderSettings();
            renderRules();
        } else {
            showStatus(`Error loading initial data: ${response?.message || 'Unknown error'}`, true);
            if (rulesContainer) rulesContainer.innerHTML = '<p>Error loading rules.</p>';
        }
    });

    // Add event listeners
    saveSettingsBtn?.addEventListener('click', handleSaveSettings);
    addRuleBtn?.addEventListener('click', () => showRuleEditor()); // Show editor for adding
    saveRuleBtn?.addEventListener('click', handleSaveRule);
    cancelRuleBtn?.addEventListener('click', hideRuleEditor);
    rulesContainer?.addEventListener('click', handleRuleListClick); // Event delegation for rule buttons/toggles
    exportBtn?.addEventListener('click', handleExportRules);
    importBtn?.addEventListener('click', handleImportRules);
    importFileInput?.addEventListener('change', handleFileSelected);

    // Listeners for rule editor form changes to update visibility
    ruleForm?.type?.addEventListener('change', updateRuleFormVisibility);
    ruleForm?.action?.addEventListener('change', updateRuleFormVisibility);

    // TODO: Request initial analytics data in Phase 3
});

// Listener for messages from the background script (e.g., maybe if storage changes elsewhere)
// chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
//   console.log('Message received in options:', message);
//   // Optional: Handle updates pushed from background if needed,
//   // e.g., if settings were changed via sync from another device.
//   // Might require re-fetching and re-rendering.
// }); 