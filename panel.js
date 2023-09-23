// console.log('hi!?')



window.onload = function () {
    var div = document.createElement('div');
    div.textContent = "Hello World3";
    document.body.appendChild(div);
    add_message('created!')

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

    // Create a new div element
    let newDiv = document.createElement("div");

    // Set the div's text content to the received message
    newDiv.textContent = `Received message in devtools: ${JSON.stringify(message)}`;

    // Append the created div to the body
    document.body.appendChild(newDiv);

}
