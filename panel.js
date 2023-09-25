
window.onload = function () {
    try {
        const backgroundConnection = chrome.runtime.connect({
            name: "devtools-panel"
        });
        backgroundConnection.onMessage.addListener((message) => {
            add_message(message)
        });
    } catch (e) {
        add_message('eee:' + e.stack)
    }
};

function add_message(message) {
    // Handle message from content script here
    //   console.log("Received message in devtools:", message);

    if (message.action == 'braid_out') {
        id_left.textContent += message.data
    } else if (message.action == 'braid_in') {
        id_right.textContent += message.data
    }
}

// Hello World3
// Received message in devtools: "created!"
// Received message in devtools: {"action":"braid_out","data":{"method":"POST","mode":"cors","version":"[\"b844a362-39bb-44fa-a3eb-5ef330f5df73\",0]","parents":["[\"701ac3bd-a1c6-4379-a1a6-f92ae060d74c\",18]"],"patches":[{"unit":"json","range":"24-25","content":""}]}}
// Received message in devtools: {"action":"braid_in","data":{"version":"[\"b844a362-39bb-44fa-a3eb-5ef330f5df73\",0]","parents":["[\"701ac3bd-a1c6-4379-a1a6-f92ae060d74c\",18]"],"patches":[{"headers":{"content-length":"0","content-range":"json 24-25"},"unit":"json","range":"24-25","content":""}]}}