console.log('Background service worker loaded.');

// Listener for extension installation or update
chrome.runtime.onInstalled.addListener(details => {
    console.log('Extension installed or updated:', details.reason);
    // TODO: Initialize default settings and rules in chrome.storage
});

// Listener for messages from content scripts or options page
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Message received:', message, 'from', sender);

    // Placeholder: Handle different message types later
    if (message.type === 'PING') {
        sendResponse({ type: 'PONG' });
    }

    // Return true to indicate you wish to send a response asynchronously
    // (Needed if you perform async operations before sending response)
    // return true;
}); 