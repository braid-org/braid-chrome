// copy of https://github.com/braid-org/braid-http/blob/master/braid-http-client.js v1.3.4

// var peer = Math.random().toString(36).substr(2)

// ***************************
// http
// ***************************

function braidify_http (http) {
    http.normal_get = http.get
    http.get = function braid_req (arg1, arg2, arg3) {
        var url, options, cb

        // http.get() supports two forms:
        //
        //  - http.get(url[, options][, callback])
        //  - http.get(options[, callback])
        //
        // We need to know which arguments are which, so let's detect which
        // form we are looking at.

        // Detect form #1: http.get(url[, options][, callback])
        if (typeof arg1 === 'string' || arg1 instanceof URL) {
            url = arg1
            if (typeof arg2 === 'function')
                cb = arg2
            else {
                options = arg2
                cb = arg3
            }
        }

        // Otherwise it's form #2: http.get(options[, callback])
        else {
            options = arg2
            cb = arg3
        }

        options = options || {}

        // Now we know where the `options` are specified, let's set headers.
        if (!options.headers)
            options.headers = {}

        // Add the subscribe header if this is a subscription
        if (options.subscribe)
            options.headers.subscribe = 'true'

        // // Always add the `peer` header
        // options.headers.peer = options.headers.peer || peer

        // Wrap the callback to provide our new .on('update', ...) feature
        // on nodejs servers
        var on_update,
            on_error,
            orig_cb = cb
        cb = (res) => {
            res.orig_on = res.on
            res.on = (key, f) => {

                // Define .on('update', cb)
                if (key === 'update'
                    || key === 'version' /* Deprecated API calls it 'version' */ ) {

                    // If we have an 'update' handler, let's remember it
                    on_update = f

                    // And set up a subscription parser
                    var parser = subscription_parser((update, error) => {
                        if (!error)
                            on_update && on_update(update)
                        else
                            on_error && on_error(error)
                    })

                    // That will run each time we get new data
                    res.orig_on('data', (chunk) => {
                        parser.read(chunk)
                    })
                }

                // Forward .on('error', cb) and remember the error function
                else if (key === 'error') {
                    on_error = f
                    res.orig_on(key, f)
                }

                // Forward all other .on(*, cb) calls
                else res.orig_on(key, f)
            }
            orig_cb && orig_cb(res)
        }
            
        // Now put the parameters back in their prior order and call the
        // underlying .get() function
        if (url) {
            arg1 = url
            if (options) {
                arg2 = options
                arg3 = cb
            } else {
                arg2 = cb
            }
        } else {
            arg1 = options
            arg2 = cb
        }

        return http.normal_get(arg1, arg2, arg3)
    }
    return http
}



// ***************************
// Fetch
// ***************************

var normal_fetch,
    AbortController,
    Headers,
    is_nodejs = typeof window === 'undefined'

if (is_nodejs) {
    // Nodejs

    // Note that reconnect logic doesn't work in node-fetch, because it
    // doesn't call the .catch() handler when the stream fails.
    //
    // See https://github.com/node-fetch/node-fetch/issues/753

    normal_fetch = require('node-fetch')
    AbortController = require('abort-controller')
    Headers = normal_fetch.Headers
    var to_whatwg_stream = require('web-streams-node').toWebReadableStream
} else {
    // Web Browser
    normal_fetch = window.fetch
    AbortController = window.AbortController
    Headers = window.Headers
    // window.fetch = braid_fetch
}

async function braid_fetch (url, params = {}) {
    params = {...params}  // Copy params, because we'll mutate it

    // Initialize the headers object
    if (!params.headers)
        params.headers = new Headers()
    else
        params.headers = new Headers(params.headers)

    // Sanity check inputs
    if (params.version)
        console.assert(Array.isArray(params.version),
                       'fetch(): `version` must be an array')
    if (params.parents)
        console.assert(Array.isArray(params.parents) || (typeof params.parents === 'function'),
                       'fetch(): `parents` must be an array or function')

    // // Always set the peer
    // params.headers.set('peer', peer)

    // We provide some shortcuts for Braid params
    if (params.version)
        params.headers.set('version', params.version.map(JSON.stringify).join(', '))
    if (Array.isArray(params.parents))
        params.headers.set('parents', params.parents.map(JSON.stringify).join(', '))
    if (params.subscribe)
        params.headers.set('subscribe', 'true')
    if (params.peer)
        params.headers.set('peer', params.peer)
    
    if (params.heartbeats)
        params.headers.set('heartbeats', typeof params.heartbeats === 'number' ? `${params.heartbeats}s` : params.heartbeats)

    // Prevent browsers from going to disk cache
    params.cache = 'no-cache'

    // Prepare patches
    if (params.patches) {
        console.assert(!params.body, 'Cannot send both patches and body')
        console.assert(typeof params.patches === 'object', 'Patches must be object or array')

        // We accept a single patch as an array of one patch
        if (!Array.isArray(params.patches))
            params.patches = [params.patches]

        // If just one patch, send it directly!
        if (params.patches.length === 1) {
            let patch = params.patches[0]
            params.headers.set('Content-Range', `${patch.unit} ${patch.range}`)

            if (typeof patch.content === 'string')
                patch.content = new TextEncoder().encode(patch.content)

            params.body = patch.content
        }

        // Multiple patches get sent within a Patches: N block
        else {
            params.headers.set('Patches', params.patches.length)
            let bufs = []
            let te = new TextEncoder()
            for (let patch of params.patches) {
                if (bufs.length) bufs.push(te.encode(`\r\n`))

                if (typeof patch.content === 'string')
                    patch.content = te.encode(patch.content)

                var length = `content-length: ${get_binary_length(patch.content)}`
                var range = `content-range: ${patch.unit} ${patch.range}`
                bufs.push(te.encode(`${length}\r\n${range}\r\n\r\n`))
                bufs.push(patch.content)
                bufs.push(te.encode(`\r\n`))
            }
            params.body = new Blob(bufs)
        }
    }

    // Wrap the AbortController with a new one that we control.
    //
    // This is because we want to be able to abort the fetch that the user
    // passes in.  However, the fetch() command uses a silly "AbortController"
    // abstraction to abort fetches, which has both a `signal` and a
    // `controller`, and only passes the signal to fetch(), but we need the
    // `controller` to abort the fetch itself.

    var original_signal = params.signal
    var underlying_aborter = null
    if (original_signal)
        original_signal.addEventListener(
            'abort',
            () => underlying_aborter.abort()
        )

    var waitTime = 10
    var res = null
    var subscription_cb = null
    var subscription_error = null

    return await new Promise((done, fail) => {
        connect()
        async function connect() {
            let on_error = e => {
                on_error = () => {}

                if (!params.retry || e.name === "AbortError" || e.startsWith?.('Parse error in headers')) {
                    subscription_error?.(e)
                    return fail(e)
                }

                underlying_aborter.abort()

                console.log(`retrying in ${waitTime}ms: ${url} after error: ${e}`)
                setTimeout(connect, waitTime)
                waitTime = Math.min(waitTime * 2, 3000)
            }

            try {
                if (original_signal?.aborted) throw new DOMException('already aborted', 'AbortError')

                // We need a fresh underlying abort controller each time we connect
                underlying_aborter = new AbortController()
                params.signal = underlying_aborter.signal

                // If parents is a function,
                // call it now to get the latest parents
                if (typeof params.parents === 'function') {
                    let parents = await params.parents()
                    if (parents) params.headers.set('parents', parents.map(JSON.stringify).join(', '))
                }

                // undocumented feature used by braid-chrome
                // to see the fetch args as they are right before it is actually called,
                // to display them for the user in the dev panel
                params.onFetch?.(url, params)

                // Now we run the original fetch....
                res = await normal_fetch(url, params)

                // And customize the response with a couple methods for getting
                // the braid subscription data:
                res.subscribe    = start_subscription
                res.subscription = {[Symbol.asyncIterator]: iterator}

                // Now we define the subscription function we just used:
                function start_subscription (cb, error) {
                    subscription_cb = cb
                    subscription_error = error

                    // heartbeat
                    let on_heartbeat = () => {}
                    if (res.headers.get('heartbeats')) {
                        let heartbeats = parseFloat(res.headers.get('heartbeats'))
                        if (isFinite(heartbeats)) {
                            let timeout = null
                            on_heartbeat = () => {
                                clearTimeout(timeout)
                                let wait_seconds = 1.2 * heartbeats + 3
                                timeout = setTimeout(() => {
                                    on_error(new Error(`heartbeat not seen in ${wait_seconds.toFixed(2)}s`))
                                }, wait_seconds * 1000)
                            }
                            on_heartbeat()
                        }
                    }

                    if (!res.ok)
                        throw new Error('Request returned not ok status:', res.status)

                    if (res.bodyUsed)
                        // TODO: check if this needs a return
                        throw new Error('This response\'s body has already been read', res)

                    // Parse the streamed response
                    handle_fetch_stream(
                        res.body,

                        // Each time something happens, we'll either get a new
                        // version back, or an error.
                        (result, err) => {
                            if (!err) {
                                // check whether we aborted
                                if (original_signal?.aborted) throw new DOMException('already aborted', 'AbortError')

                                // Yay!  We got a new version!  Tell the callback!
                                cb(result)
                            } else
                                // This error handling code runs if the connection
                                // closes, or if there is unparseable stuff in the
                                // streamed response.
                                on_error(err)
                        },
                        (...args) => {
                            on_heartbeat()
                            params.onBytes?.(...args)
                        }
                    )
                }

                // And the iterator for use with "for async (...)"
                function iterator () {
                    // We'll keep this state while our iterator runs
                    var initialized = false,
                        inbox = [],
                        resolve = null,
                        reject = null,
                        last_error = null

                    return {
                        async next() {
                            // If we got an error, throw it
                            if (last_error) throw last_error

                            // If we've already received a version, return it
                            if (inbox.length > 0)
                                return {done: false, value: inbox.shift()}

                            // Otherwise, let's set up a promise to resolve when we get the next item
                            var promise = new Promise((_resolve, _reject) => {
                                resolve = _resolve
                                reject  = _reject
                            })

                            // Start the subscription, if we haven't already
                            if (!initialized) {
                                initialized = true

                                // The subscription will call whichever resolve and
                                // reject functions the current promise is waiting for
                                start_subscription(x => {
                                    inbox.push(x)
                                    resolve()
                                }, x => reject(x) )
                            }

                            // Now wait for the subscription to resolve or reject the promise.
                            await promise

                            // From here on out, we'll redirect the reject,
                            // since that promise is already done
                            reject = (err) => {last_error = err}

                            return {done: false, value: inbox.shift()}
                        }
                    }
                }

                if (params.retry) {
                    let give_up = res.status >= 400 && res.status < 600
                    switch (res.status) {
                        case 408: // Request Timeout
                        case 425: // Too Early
                        case 429: // Too Many Requests

                        case 502: // Bad Gateway
                        case 504: // Gateway Timeout
                            give_up = false;
                    }
                    if (give_up) {
                        let e = new Error(`giving up because of http status: ${res.status}${(res.status === 401 || res.status === 403) ? ` (access denied)` : ''}`)
                        subscription_error?.(e)
                        return fail(e)
                    }
                    if (!res.ok) throw new Error(`status not ok: ${res.status}`)
                }

                if (subscription_cb) start_subscription(subscription_cb, subscription_error)

                done(res)

                params?.retry?.onRes?.(res)
                waitTime = 10
            } catch (e) { on_error(e) }
        }
    })
}

// Parse a stream of versions from the incoming bytes
async function handle_fetch_stream (stream, cb, on_bytes) {
    if (is_nodejs)
        stream = to_whatwg_stream(stream)

    // Set up a reader
    var reader = stream.getReader(),
        parser = subscription_parser(cb)
    
    while (true) {
        var versions = []

        // Read the next chunk of stream!
        try {
            var {done, value} = await reader.read()
        }
        catch (e) {
            cb(null, e)
            return
        }

        // Check if this connection has been closed!
        if (done) {
            console.debug("Connection closed.")
            cb(null, 'Connection closed')
            return
        }

        on_bytes?.(value)

        // Tell the parser to process some more stream
        parser.read(value)
    }
}



// ****************************
// Braid-HTTP Subscription Parser
// ****************************

var subscription_parser = (cb) => ({
    // A parser keeps some parse state
    state: {input: []},

    // And reports back new versions as soon as they are ready
    cb: cb,

    // You give it new input information as soon as you get it, and it will
    // report back with new versions as soon as it finds them.
    read (input) {

        // Store the new input!
        for (let x of input) this.state.input.push(x)

        // Now loop through the input and parse until we hit a dead end
        while (this.state.input.length) {

            // Try to parse an update
            try {
                this.state = parse_update (this.state)
            } catch (e) {
                this.cb(null, e)
                return
            }

            // Maybe we parsed an update!  That's cool!
            if (this.state.result === 'success') {
                var update = {
                    version: this.state.version,
                    parents: this.state.parents,
                    body:    this.state.body,
                    patches: this.state.patches,

                    // Output extra_headers if there are some
                    extra_headers: extra_headers(this.state.headers)
                }
                for (var k in update)
                    if (update[k] === undefined) delete update[k]

                Object.defineProperty(update, 'body_text', {
                    get: function () {
                        if (this.body != null) return new TextDecoder('utf-8').decode(this.body.buffer)
                    }
                })

                for (let p of update.patches ?? []) {
                    Object.defineProperty(p, 'content_text', {
                        get: () => new TextDecoder('utf-8').decode(p.content)
                    })
                }

                try {
                    this.cb(update)
                } catch (e) {
                    this.cb(null, e)
                    return
                }

                // Reset the parser for the next version!
                this.state = {input: this.state.input}
            }

            // Or maybe there's an error to report upstream
            else if (this.state.result === 'error') {
                this.cb(null, this.state.message)
                return
            }

            // We stop once we've run out of parseable input.
            if (this.state.result == 'waiting') break
        }
    }
})


// ****************************
// General parsing functions
// ****************************
//
// Each of these functions takes parsing state as input, mutates the state,
// and returns the new state.
//
// Depending on the parse result, each parse function returns:
//
//  parse_<thing> (state)
//  => {result: 'waiting', ...}  If it parsed part of an item, but neeeds more input
//  => {result: 'success', ...}  If it parses an entire item
//  => {result: 'error', ...}    If there is a syntax error in the input


function parse_update (state) {
    // If we don't have headers yet, let's try to parse some
    if (!state.headers) {
        var parsed = parse_headers(state.input)

        // If header-parsing fails, send the error upstream
        if (parsed.result === 'error')
            return parsed
        if (parsed.result === 'waiting') {
            state.result = 'waiting'
            return state
        }

        state.headers = parsed.headers
        state.version = state.headers.version
        state.parents = state.headers.parents

        // Take the parsed headers out of the buffer
        state.input = parsed.input
    }

    // We have headers now!  Try parsing more body.
    return parse_body(state)
}

// Parsing helpers
function parse_headers (input) {

    // Find the start of the headers
    let s = 0;
    while (input[s] === 13 || input[s] === 10) s++
    if (s === input.length) return {result: 'waiting'}

    // Look for the double-newline at the end of the headers.
    let e = s;
    while (++e) {
        if (e > input.length) return {result: 'waiting'}
        if (input[e - 1] === 10 && (input[e - 2] === 10 || (input[e - 2] === 13 && input[e - 3] === 10))) break
    }

    // Extract the header string
    var headers_source = new TextDecoder('utf-8').decode(new Uint8Array(input.slice(s, e)))

    // Skip "HTTP 200 OK"
    headers_source = headers_source.replace(/^HTTP 200.*\r?\n/, '')

    var headers_length = headers_source.length
    
    // Let's parse them!  First define some variables:
    var headers = {},
        header_regex = /(:?[\w-_]+):\s?(.*)[\r\n]*/gy,  // Parses one line a time
        match,
        found_last_match = false

    // And now loop through the block, matching one line at a time
    while (match = header_regex.exec(headers_source)) {
        // console.log('Header match:', match && [match[1], match[2]])
        headers[match[1].toLowerCase()] = match[2]

        // This might be the last line of the headers block!
        if (header_regex.lastIndex === headers_length)
            found_last_match = true
    }

    // If the regex failed before we got to the end of the block, throw error:
    if (!found_last_match)
        return {
            result: 'error',
            message: 'Parse error in headers: "'
                + JSON.stringify(headers_source.substr(header_regex.lastIndex)) + '"',
            headers_so_far: headers,
            last_index: header_regex.lastIndex, headers_length
        }

    // Success!  Let's parse special headers
    if ('version' in headers)
        headers.version = JSON.parse('['+headers.version+']')
    if ('parents' in headers)
        headers.parents = JSON.parse('['+headers.parents+']')
    if ('patches' in headers)
        headers.patches = JSON.parse(headers.patches)

    // Update the input
    input = input.slice(e)

    // And return the parsed result
    return { result: 'success', headers, input }
}

// Content-range is of the form '<unit> <range>' e.g. 'json .index'
function parse_content_range (range_string) {
    var match = range_string.match(/(\S+)( (.*))?/)
    return match && {unit: match[1], range: match[3] || ''}
}
function parse_body (state) {

    // Parse Body Snapshot

    var content_length = parseInt(state.headers['content-length'])
    if (!isNaN(content_length)) {

        // We've read a Content-Length, so we have a block to parse
        if (content_length > state.input.length) {
            // But we haven't received the whole block yet
            state.result = 'waiting'
            return state
        }

        // We have the whole block!
        state.result = 'success'

        // If we have a content-range, then this is a patch
        if (state.headers['content-range']) {
            var match = parse_content_range(state.headers['content-range'])
            if (!match)
                return {
                    result: 'error',
                    message: 'cannot parse content-range',
                    range: state.headers['content-range']
                }
            state.patches = [{
                unit: match.unit,
                range: match.range,
                content: new Uint8Array(state.input.slice(0, content_length)),

                // Question: Perhaps we should include headers here, like we do for
                // the Patches: N headers below?

                // headers: state.headers
            }]
        }

        // Otherwise, this is a snapshot body
        else state.body = new Uint8Array(state.input.slice(0, content_length))

        state.input = state.input.slice(content_length)
        return state
    }

    // Parse Patches

    else if (state.headers.patches != null) {
        state.patches = state.patches || []

        var last_patch = state.patches[state.patches.length-1]

        // Parse patches until the final patch has its content filled
        while (!(state.patches.length === state.headers.patches
                 && (state.patches.length === 0 || 'content' in last_patch))) {

            // Are we starting a new patch?
            if (!last_patch || 'content' in last_patch) {
                last_patch = {}
                state.patches.push(last_patch)
            }

            // Parse patch headers
            if (!('headers' in last_patch)) {
                var parsed = parse_headers(state.input)

                // If header-parsing fails, send the error upstream
                if (parsed.result === 'error')
                    return parsed
                if (parsed.result === 'waiting') {
                    state.result = 'waiting'
                    return state
                }

                // We parsed patch headers!  Update state.
                last_patch.headers = parsed.headers
                state.input = parsed.input
            }

            // Todo: support custom patches, not just range-patch

            // Parse Range Patch format
            {
                if (!('content-length' in last_patch.headers))
                    return {
                        result: 'error',
                        message: 'no content-length in patch',
                        patch: last_patch, input: (new TextDecoder('utf-8')).decode(new Uint8Array(state.input))
                    }

                if (!('content-range' in last_patch.headers))
                    return {
                        result: 'error',
                        message: 'no content-range in patch',
                        patch: last_patch, input: (new TextDecoder('utf-8')).decode(new Uint8Array(state.input))
                    }

                var content_length = parseInt(last_patch.headers['content-length'])

                // Does input have the entire patch contents yet?
                if (state.input.length < content_length) {
                    state.result = 'waiting'
                    return state
                }

                var match = parse_content_range(last_patch.headers['content-range'])
                if (!match)
                    return {
                        result: 'error',
                        message: 'cannot parse content-range in patch',
                        patch: last_patch, input: (new TextDecoder('utf-8')).decode(new Uint8Array(state.input))
                    }

                last_patch.unit = match.unit
                last_patch.range = match.range
                last_patch.content = new Uint8Array(state.input.slice(0, content_length))
                last_patch.extra_headers = extra_headers(last_patch.headers)
                delete last_patch.headers  // We only keep the extra headers ^^

                // Consume the parsed input
                state.input = state.input.slice(content_length)
            }
        }

        state.result = 'success'
        return state
    }

    return {
        result: 'error',
        message: 'cannot parse body without content-length or patches header'
    }
}

// The "extra_headers" field is returned to the client on any *update* or
// *patch* to include any headers that we've received, but don't have braid
// semantics for.
//
// This function creates that hash from a headers object, by filtering out all
// known headers.
function extra_headers (headers) {
    // Clone headers
    var result = Object.assign({}, headers)

    // Remove the non-extra parts
    var known_headers = ['version', 'parents', 'patches',
                         'content-length', 'content-range']
    for (var i = 0; i < known_headers.length; i++)
        delete result[known_headers[i]]

    // Return undefined if we deleted them all
    if (Object.keys(result).length === 0)
        return undefined

    return result
}

function get_binary_length(x) {
    return  x instanceof ArrayBuffer ? x.byteLength :
            x instanceof Uint8Array ? x.length :
            x instanceof Blob ? x.size : undefined
}

// ****************************
// Exports
// ****************************

if (typeof module !== 'undefined' && module.exports)
    module.exports = {
        fetch: braid_fetch,
        http: braidify_http,
        subscription_parser,
        parse_update,
        parse_headers,
        parse_body
    }
