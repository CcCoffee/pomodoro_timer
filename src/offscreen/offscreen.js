chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'playSound') {
        const audio = new Audio(message.soundUrl);
        audio.play()
            .then(() => sendResponse({ success: true }))
            .catch((error) => sendResponse({ success: false, error: error.message }));
        return true;
    }
}); 