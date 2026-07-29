
let tab_to_dev = {}
let latest_request_headers_for_tab = {}
let latest_headers_for_tab = {}
let tab_to_last_dev_message = {}

// Asks that arrived before this navigation's headers did, per tab
let waiting_for_headers = {}

// webRequest reaches us on its own schedule, and the page it describes does
// not wait for it: a content script can be parsed, run, and come asking a
// good 80ms before onHeadersReceived tells us anything. Answering then would
// mean answering with nothing, so hold the question until the headers land.
// Only a content script that just announced itself is worth making wait: it
// will still be there when the headers turn up. A tab reporting itself
// complete is often the page we are navigating away from, and holding that
// question only answers it into a document that has since gone.
function send_loaded(tabid, url, asker_will_wait) {
  if (!latest_headers_for_tab[tabid]) {
    if (asker_will_wait) (waiting_for_headers[tabid] ??= []).push(url)
    return
  }
  really_send_loaded(tabid, url)
}

function really_send_loaded(tabid, url) {
  chrome.tabs.sendMessage(tabid, {
    cmd: 'loaded',
    request_headers: latest_request_headers_for_tab[tabid],
    headers: latest_headers_for_tab[tabid],
    dev_message: tab_to_last_dev_message[tabid],
    url,
    panel_open: !!tab_to_dev[tabid]
  }, () => chrome.runtime.lastError)  // a tab with no content script is fine
}

function answer_those_waiting(tabid) {
  var waiting = waiting_for_headers[tabid]
  if (!waiting) return
  delete waiting_for_headers[tabid]
  for (var url of waiting) really_send_loaded(tabid, url)
}

chrome.tabs.onUpdated.addListener(function callback(tabid, info, tab) {
  // Check if tab update status is 'complete'
  if (info.status === 'complete') send_loaded(tabid, tab.url)
})

// Nothing we remember about a tab outlives it
chrome.tabs.onRemoved.addListener(tabid => {
  delete tab_to_dev[tabid]
  delete tab_to_last_dev_message[tabid]
  delete latest_headers_for_tab[tabid]
  delete latest_request_headers_for_tab[tabid]
  delete waiting_for_headers[tabid]
})

chrome.webRequest.onSendHeaders.addListener(
  details => {
    console.log('%cRequest headers being sent!', 'background: #8f8', details)
    latest_request_headers_for_tab[details.tabId] = Object.fromEntries(
      details.requestHeaders.map(x => [x.name.toLowerCase(), x.value])
    )
    // A new page is on its way, so the headers we are holding describe the
    // last one. Letting them stand is how a reload used to answer with the
    // previous navigation's headers and look like it had worked.
    delete latest_headers_for_tab[details.tabId]
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
    answer_those_waiting(details.tabId)
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
      // Every message that carries the panel's settings replaces what we hold
      // for the tab -- 'init' as much as the ones that change something -- so
      // opening the panel, or reconnecting to a background that slept and lost
      // them, puts them back for the next page to pick up. They say for
      // themselves whether the user asked for anything; the page needs to know,
      // because an open panel alone must not connect a non-Braid page.
      if (message.cmd == 'init' || message.cmd == 'rerequest'
          || message.cmd == 'edit_source')
        tab_to_last_dev_message[tab_id] = message

      chrome.tabs.sendMessage(tab_id, message)
    });
    port.onDisconnect.addListener(() => {
      delete tab_to_dev[tab_id]
      // Settings last as long as the panel that chose them. The page showing
      // right now keeps whatever it was given -- we say nothing to it -- but
      // the next load in this tab starts from the page's own headers again,
      // rather than being steered by a panel that is no longer there.
      delete tab_to_last_dev_message[tab_id]
      chrome.tabs.sendMessage(tab_id, { cmd: 'panel_closed' },
                              () => chrome.runtime.lastError)
    })
  }
})

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // A content script announcing itself, which it may well do before
  // onHeadersReceived has run — send_loaded holds the question until then.
  if (message.cmd === 'ready')
    return send_loaded(sender.tab.id, sender.tab.url, true)

  if (tab_to_dev[sender.tab.id]) {
    console.log(`sending message: ${JSON.stringify(message)}`)
    tab_to_dev[sender.tab.id].postMessage(message)
  }
})

console.log('%cService Worker Loaded', 'background: #ddf')
