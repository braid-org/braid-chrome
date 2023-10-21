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
    for (var i = 0; i < details.requestHeaders.length; i++)
      if (details.requestHeaders[i].name.toLowerCase() === 'subscribe')
        console.log('%cSubscribe header set!', 'background: #fdd',
          'Subscribe:', details.requestHeaders[i].value)
    // details.requestHeaders.push({name: 'Subscribe', value: 'true'})
    // return {requestHeaders: details.requestHeaders}
  },
  { urls: ["<all_urls>"], types: ["main_frame"] },
  ["requestHeaders"]
)

function tell_tab_to_go_live(tabid, content_type) {
  // Now wait until the tab has loaded, and activate the page replacement
  chrome.tabs.onUpdated.addListener(function callback(curr_tabid, info, tab) {
    // Check if tab update status is 'complete'
    if (info.status === 'complete' && curr_tabid === tabid) {
      // Send the message to go live!
      chrome.tabs.sendMessage(
        tabid,
        { action: "replace_html", content_type: content_type }
      )

      // Remove the listener after we're done
      chrome.tabs.onUpdated.removeListener(callback)
    }
  })
}


chrome.webRequest.onHeadersReceived.addListener(
  details => {
    console.log('%cHeaders received!', 'background: #ff8', details)

    var content_type = details.responseHeaders
      .find(header => header.name.toLowerCase() === 'content-type')?.value

    // If the resource says it accepts subscriptions, let's go live!
    if (details.responseHeaders
      .find(x => x.name.toLowerCase() === 'accept-subscribe')) {

      console.log('Server accepts subscription!')
      tell_tab_to_go_live(details.tabId, content_type)
    }

    // Else, check if the content-type is one of our known goodies, and
    // start a subscription request anyway and see if it works
    console.log('Content type is', content_type)
    if (['application/json', 'text/plain', 'text/markdown'].includes(content_type)) {
      console.log("TODO: let's try executing a fetch subscribe and use it if it works!")
      // We could also do it for any resource, regardless of content-type, and
      // just abort the fetch as soon as we get headers that don't say subscribe.
    }

  },
  { urls: ["<all_urls>"], types: ["main_frame"] },
  ["responseHeaders"]
)

// chrome.webRequest.onResponseStarted.addListener(details => {
//   console.log('%cYo! we see a response starting', 'background: #0f0', details)
// }, { urls: ['<all_urls>'] }, ["extraHeaders", 'responseHeaders'])

// Just for debugging, this function prints out which rules have been matched.
function print_matched_rules() {
  chrome.declarativeNetRequest.getMatchedRules({}, (rules) => {
    console.log(rules)
  })
}

let tab_to_dev = {}

chrome.runtime.onConnect.addListener((port) => {
  console.log(`onConnect: `, port)
  if (port.name === "braid-devtools-panel") {
    let tab_id = null
    port.onMessage.addListener((message) => {
      console.log(`Message from port:`, message);
      if (message.cmd == 'init') {
        tab_id = message.tab_id
        tab_to_dev[tab_id] = port

        chrome.tabs.sendMessage(
          tab_id,
          { action: "dev_panel_openned" })
      } else if (message.cmd == 'reload') {
        chrome.tabs.sendMessage(
          tab_id,
          { action: "replace_html", content_type: message.content_type })
      }
    });
    port.onDisconnect.addListener(() => {
      delete tab_to_dev[tab_id]
    })
  }
})

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (tab_to_dev[sender.tab.id]) {
    console.log(`sending message: ${JSON.stringify(message)}`)
    tab_to_dev[sender.tab.id].postMessage(message)
  }
})

// chrome.commands.onCommand.addListener(command => {
//   if (command === "_execute_browser_action") {
//     chrome.tabs.query({active: true, currentWindow: true}, tabs => {
//       var tab = tabs[0]
//       chrome.tabs.sendMessage(tab.id, {action: "openBraidPanel"})
//     })
//   }
// })

console.log('%cService Worker Loaded', 'background: #ddf')
