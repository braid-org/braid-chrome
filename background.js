console.log('%c Yo! yo yo', 'background: #faf')

chrome.webRequest.onCompleted.addListener(
    details => {
        console.log('%c Request completeorcycle', 'background: #ff8')
    },
    { urls: ["<all_urls>"], types: ["main_frame"] },
    ["responseHeaders"]
)

chrome.webRequest.onResponseStarted.addListener(details => {
    console.log('%c Yo! we see a request', 'background: #faf')
    console.log({details})

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

