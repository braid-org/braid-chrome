console.log('YOYOYO2', 'background: #f00')

chrome.webRequest.onCompleted.addListener(
  details => {
    console.log('%c Request completeorcycle', 'background: #ff8')

    // Skip responses that don't accept subscriptions
    if (!details.responseHeaders
        .find(x => x.name.toLowerCase() === 'accept-subscribe'))
      return

    console.log('Server accepts subscription!')

    // Remember the content type
    var contentType = details.responseHeaders
        .find(header => header.name.toLowerCase() === 'content-type')
    console.log('Content Type:', contentType)

    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      console.log('gonna try22.2..')

      // Listen for any changes on the active tab
      chrome.tabs.onUpdated.addListener(function callback(tabId, info, tab) {
        // Check if tab update status is 'complete' and the updated tab is the current active tab
        if (info.status === 'complete' && tabId === tabs[0].id) {
          chrome.tabs.sendMessage(tabs[0].id,
                                  {action: "replace_html", content_type: contentType.value})

          // Remove the listener after we're done
          chrome.tabs.onUpdated.removeListener(callback)
        }
      })


      // chrome.tabs.sendMessage(tabs[0].id, { action: "replace_html" });
      // chrome.tabs.executeScript(tabs[0].id, { file: "popup.js" }, function () {
      // setTimeout(() => {
      //     console.log(`tabs[${tabs.length}]`, tabs)
      //     chrome.tabs.sendMessage(tabs[0].id, { action: "replace_html" });
      // }, 1000)
      // });

    })
  },
  { urls: ["<all_urls>"], types: ["main_frame"] },
  ["responseHeaders"]
)

chrome.webRequest.onResponseStarted.addListener(details => {
  console.log('Yo! we see a request', 'background: #0f0')
}, { urls: ['<all_urls>'] }, ["extraHeaders", 'responseHeaders'])

let devToolsConnection

chrome.runtime.onConnect.addListener((port) => {
  console.log(`onConnect: `, port)
  if (port.name === "devtools-panel") {
    devToolsConnection = port
    devToolsConnection.onDisconnect.addListener(() => {
      devToolsConnection = null
    })
  }
})

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.from === 'dev') {
    chrome.tabs.query(
      {active: true, currentWindow: true},
      tabs => {
        chrome.tabs.sendMessage(
          tabs[0].id,
          {action: "replace_html", content_type: message.content_type})
      })
  } else {
    if (devToolsConnection) {
      console.log(`sending message: ${JSON.stringify(message)}`)
      devToolsConnection.postMessage(message)
    }
  }
})
