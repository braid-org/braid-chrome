
window.onload = function () {
    try {
        reload_button.style.border = '3px solid yellow'

        function tell_page_to_load_new_content_type() {
            try {
                chrome.runtime.sendMessage({ from: "dev", content_type: content_type_select.value });
            } catch (e) {
                alert(`e = ${e.stack}`)
            }
        }

        reload_button.onclick = tell_page_to_load_new_content_type
        content_type_select.onchange = tell_page_to_load_new_content_type

        const backgroundConnection = chrome.runtime.connect({
            name: "devtools-panel"
        })
        backgroundConnection.onMessage.addListener((message) => {
            add_message(message)
        })
    } catch (e) {
        add_message('eee:' + e.stack)
    }
};

function add_message(message) {
    // Handle message from content script here
    //   console.log("Received message in devtools:", message);

    if (message.action == 'reload') {
        id_messages.innerHTML = ''
        return
    }

    let d = document.createElement('pre')
    d.textContent = message.data
    //d.style.background = `rgb(41,42,45)`
    d.style.borderRadius = '3px'
    d.style.margin = '3px'
    d.style.padding = '3px'

    // if (message.action == 'braid_out') {
        id_messages.append(d)
    // } else if (message.action == 'braid_in') {
    //     id_right.append(d)
    // }
}

// POST undefined HTTP/1.1
// parents: "[\"b4ef158b-2e58-4965-90d3-6ab3ac232fb0\",10]"
// patches: 1
// peer: hqeum4qsu7m
// version: "[\"b4ef158b-2e58-4965-90d3-6ab3ac232fb0\",11]"

// content-length: 1
// content-range: json 523-523

// a

// Hello World3
// Received message in devtools: "created!"
// Received message in devtools: {"action":"braid_out","data":{"method":"POST","mode":"cors","version":"[\"b844a362-39bb-44fa-a3eb-5ef330f5df73\",0]","parents":["[\"701ac3bd-a1c6-4379-a1a6-f92ae060d74c\",18]"],"patches":[{"unit":"json","range":"24-25","content":""}]}}
// Received message in devtools: {"action":"braid_in","data":{"version":"[\"b844a362-39bb-44fa-a3eb-5ef330f5df73\",0]","parents":["[\"701ac3bd-a1c6-4379-a1a6-f92ae060d74c\",18]"],"patches":[{"headers":{"content-length":"0","content-range":"json 24-25"},"unit":"json","range":"24-25","content":""}]}}