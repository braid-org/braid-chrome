
let tab_to_dev = {}
let latest_headers_for_tab = {}
let tab_to_last_dev_message = {}

chrome.tabs.onUpdated.addListener(function callback(tabid, info, tab) {
  // Check if tab update status is 'complete'
  if (info.status === 'complete') {
    chrome.tabs.sendMessage(tabid, {cmd: 'loaded', headers: latest_headers_for_tab[tabid], dev_message: tab_to_last_dev_message[tabid], url: tab.url })
  }
})

chrome.webRequest.onHeadersReceived.addListener(
  details => {
    console.log('%cHeaders received!', 'background: #ff8', details)
    latest_headers_for_tab[details.tabId] = Object.fromEntries(details.responseHeaders.map(x => [x.name.toLowerCase(), x.value]))
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
      }
      if (message.cmd == 'reload') tab_to_last_dev_message[tab_id] = message

      chrome.tabs.sendMessage(tab_id, message)
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

console.log('%cService Worker Loaded', 'background: #ddf')
