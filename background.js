chrome.webRequest.onResponseStarted.addListener(details => {
    if (!details.responseHeaders.find(x => x.name.toLowerCase() === 'subscribe')) {
        return
    }

    var url = details.url
    if (url[url.length-1] === '/') {
        url = url.slice(0, -1)
    }

    var theTab
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        theTab = tabs[0]
    })

}, {urls:['<all_urls>']}, ["extraHeaders", 'responseHeaders'])

