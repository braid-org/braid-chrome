console.log('%c Yo! yo yo', 'background: #faf')

chrome.webRequest.onCompleted.addListener(
    details => {
        console.log('%c Request completeorcycle', 'background: #ff8')
    },
    { urls: ["<all_urls>"], types: ["main_frame"] },
    ["responseHeaders"]
)

chrome.webRequest.onResponseStarted.addListener(details => {
    console.log('Yo! we see a request', 'background: #ff0')
    console.log(JSON.stringify(details, null, 4))

    if (!details.responseHeaders.find(x => x.name.toLowerCase() === 'subscribe')) {
        return
    }

    var url = details.url
    if (url[url.length - 1] === '/') {
        url = url.slice(0, -1)
    }

    var theTab
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        theTab = tabs[0]
    })

}, { urls: ['<all_urls>'] }, ["extraHeaders", 'responseHeaders'])

// chrome.webRequest.onBeforeSendHeaders.addListener(
//     function (details) {
//         console.log('onBeforeSendHeaders', 'background: #f0f')
//         console.log(JSON.stringify(details, null, 4))

//         // for (var i = 0; i < details.requestHeaders.length; ++i) {
//         //     if (details.requestHeaders[i].name === 'User-Agent') {
//         //         details.requestHeaders.splice(i, 1);
//         //         break;
//         //     }
//         // }
//         return { requestHeaders: details.requestHeaders };
//     },
//     { urls: ['<all_urls>'] },
//     ['blocking', 'requestHeaders']
// );
