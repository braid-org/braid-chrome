
let tab_to_dev = {}
let latest_request_headers_for_tab = {}
let latest_headers_for_tab = {}
let tab_to_last_dev_message = {}

function send_loaded(tabid, url) {
  chrome.tabs.sendMessage(tabid, {
    cmd: 'loaded',
    request_headers: latest_request_headers_for_tab[tabid],
    headers: latest_headers_for_tab[tabid],
    dev_message: tab_to_last_dev_message[tabid],
    url,
    panel_open: !!tab_to_dev[tabid]
  })
}

chrome.tabs.onUpdated.addListener(function callback(tabid, info, tab) {
  // Check if tab update status is 'complete'
  if (info.status === 'complete') send_loaded(tabid, tab.url)
})

chrome.webRequest.onSendHeaders.addListener(
  details => {
    console.log('%cRequest headers being sent!', 'background: #8f8', details)
    latest_request_headers_for_tab[details.tabId] = Object.fromEntries(
      details.requestHeaders.map(x => [x.name.toLowerCase(), x.value])
    )
  },
  { urls: ["<all_urls>"], types: ["main_frame"] },
  ["requestHeaders"]
)

chrome.webRequest.onHeadersReceived.addListener(
  details => {
    console.log('%cHeaders received!', 'background: #ff8', details)
    latest_headers_for_tab[details.tabId] = {
      ...Object.fromEntries(details.responseHeaders.map(x => [x.name.toLowerCase(), x.value])),
      ':status': details.statusCode
    }
  },
  { urls: ["<all_urls>"], types: ["main_frame"] },
  ["responseHeaders"]
)

chrome.runtime.onConnect.addListener((port) => {
  console.log(`onConnect: `, port)
  if (port.name === "braid-devtools-panel") {
    let tab_id = null
    port.onMessage.addListener((message) => {
      console.log(`Message from port:`, message);
      if (message.cmd == 'init') {
        tab_id = message.tab_id
        tab_to_dev[tab_id] = port
        chrome.tabs.sendMessage(tab_id, { cmd: 'panel_opened' })
      }
      if (message.cmd == 'rerequest') tab_to_last_dev_message[tab_id] = message
      if (message.cmd == 'edit_source') {
        if (!tab_to_last_dev_message[tab_id]) tab_to_last_dev_message[tab_id] = {}
        tab_to_last_dev_message[tab_id].edit_source = true
      }

      chrome.tabs.sendMessage(tab_id, message)
    });
    port.onDisconnect.addListener(() => {
      delete tab_to_dev[tab_id]
      chrome.tabs.sendMessage(tab_id, { cmd: 'panel_closed' })
    })
  }
})

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // A content script announcing itself. It cannot have started before the
  // response headers arrived — the browser needs them to begin parsing — so
  // asking at this moment always finds them, where tabs.onUpdated can report
  // 'complete' before onHeadersReceived has even run and find nothing.
  if (message.cmd === 'ready')
    return send_loaded(sender.tab.id, sender.tab.url)

  if (tab_to_dev[sender.tab.id]) {
    console.log(`sending message: ${JSON.stringify(message)}`)
    tab_to_dev[sender.tab.id].postMessage(message)
  }
})

console.log('%cService Worker Loaded', 'background: #ddf')
