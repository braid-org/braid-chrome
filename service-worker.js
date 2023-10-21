/*
// Blocking webrequest listers are disabled in v3.
// Gotta use the declarative_net_request stuff instead.
chrome.webRequest.onBeforeSendHeaders.addListener(
  details => {
    console.log('Caught BEFORE SENDING HEADERS! details:', details)
    details.requestHeaders.push({name: 'Subscribe', value: 'true'})
    return {requestHeaders: details.requestHeaders}
  },
  {urls: ["<all_urls>"], types: ["main_frame"]},
  ["requestHeaders", "blocking", "extraHeaders"]
)*/

chrome.webRequest.onSendHeaders.addListener(
  details => {
    console.log('Caught SENDING HEADERS!', details)
    for (var i=0; i<details.requestHeaders.length; i++)
      if (details.requestHeaders[i].name.toLowerCase() === 'subscribe')
        console.log('%cSubscribe header set!', 'background: #fdd',
                    'Subscribe:', details.requestHeaders[i].value)
    // details.requestHeaders.push({name: 'Subscribe', value: 'true'})
    // return {requestHeaders: details.requestHeaders}
  },
  {urls: ["<all_urls>"], types: ["main_frame"]},
  ["requestHeaders"]
)

chrome.webRequest.onHeadersReceived.addListener(
  details => {
    console.log('%cHeaders received!', 'background: #ff8', details)

    // Skip responses that don't accept subscriptions
    if (!details.responseHeaders
        .find(x => x.name.toLowerCase() === 'accept-subscribe'))
      return

    console.log('Server accepts subscription!')

    // Remember the content type
    var content_type = details.responseHeaders
        .find(header => header.name.toLowerCase() === 'content-type')

    console.log('Content Type:', content_type)

    // Now wait until the tab has loaded, and activate the page replacement
    if (true)
      // Listen for any changes on the active tab
      chrome.tabs.onUpdated.addListener(function callback(tabId, info, tab) {
        // Check if tab update status is 'complete' and the updated tab is the
        // current active tab
        if (info.status === 'complete' && tabId === details.tabId) {
          chrome.tabs.sendMessage(
            details.tabId,
            {action: "replace_html",content_type: content_type.value}
          )

          // Remove the listener after we're done
          chrome.tabs.onUpdated.removeListener(callback)
        }
      })


    // // These are mike's failed experiments to make loading faster
    // if (false)
    //   chrome.scripting.executeScript({
    //     target: {tabId: details.tabId},
    //     files: ["./content-script.js",
    //             "./dt.js",
    //             "./braid-http-client.js",
    //             "./apply-patch.js"
    //            ]
    //   }, injection_results => {
    //     if (chrome.runtime.lastError) {
    //       console.error(JSON.stringify(chrome.runtime.lastError))
    //     } else {
    //       // Content script has been injected.
    //       // Send a message or perform other actions.
    //       chrome.tabs.sendMessage(
    //         details.tabId,
    //         {action: "replace_html",content_type: content_type.value}
    //       )
    //     }
    //   })

    // if (false)
    //   chrome.tabs.executeScript(
    //     details.tabId, {file: 'content-script.js'},
    //     results => {
    //       chrome.tabs.sendMessage(
    //         details.tabId,
    //         {action: "replace_html",content_type: content_type.value}
    //       )
    //     }
    //   )

  },
  { urls: ["<all_urls>"], types: ["main_frame"] },
  ["responseHeaders"]
)

// chrome.webRequest.onResponseStarted.addListener(details => {
//   console.log('%cYo! we see a response starting', 'background: #0f0', details)
// }, { urls: ['<all_urls>'] }, ["extraHeaders", 'responseHeaders'])

// Just for debugging, this function prints out which rules have been matched.
function print_matched_rules () {
    chrome.declarativeNetRequest.getMatchedRules({}, (rules) => {
        console.log(rules)
    })
}


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

console.log('%cService Worker Loaded', 'background: #ddf')
