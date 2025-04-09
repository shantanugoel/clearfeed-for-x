console.log('Content script loaded for:', window.location.href);

// Function to send a message to the background script
function sendMessageToBackground(message: any) {
    chrome.runtime.sendMessage(message, response => {
        if (chrome.runtime.lastError) {
            console.error('Error sending message:', chrome.runtime.lastError);
        } else {
            console.log('Background response:', response);
        }
    });
}

// Example: Send a PING message on load
sendMessageToBackground({ type: 'PING' });

// TODO: Implement DOM observation (MutationObserver)
// TODO: Implement tweet detection logic
// TODO: Implement text scanning and replacement/hiding logic 