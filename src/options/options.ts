import './options.css';

console.log('Options script loaded.');

document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM fully loaded and parsed');

    // TODO: Request initial data (settings, rules, analytics) from background script
    // chrome.runtime.sendMessage({ type: 'GET_ALL_DATA' }, (response) => {
    //   console.log('Initial data:', response);
    //   // TODO: Render settings and rules
    // });
    // chrome.runtime.sendMessage({ type: 'GET_LOCAL_ANALYTICS' }, (response) => {
    //   console.log('Local analytics:', response);
    //   // TODO: Render analytics
    // });

    // TODO: Add event listeners for buttons (Add Rule, Save Rule, Cancel, Clear Analytics, etc.)
    // TODO: Implement functions to render settings, rules, and analytics into the DOM
    // TODO: Implement functions to handle saving settings and rules (sending messages to background)
});

// Listener for messages from the background script (e.g., updates)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Message received in options:', message);
    // TODO: Handle updates pushed from background if needed
}); 