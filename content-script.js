// console.log(`RUNNING content SCRIPT!`)

var httpx = 'HTTP'

var peer = Math.random().toString(36).substr(2)
var version = null
var parents = null
var content_type = null
var merge_type = null
var subscribe = true
var encoding_dt = true
var edit_source = false

var textarea = null
var online = null
var show_editor = null
let deleteIcon = null

var headers = {}
var versions = []
var raw_messages = []
var get_failed = ''

var doc = null
var default_version_count = 1
var on_show_diff = () => { }

// Firefox never gives a content script's sandbox its own ReadableStream, so
// the name resolves up the prototype chain to the page's, and that constructor
// runs in the page's realm — where our underlying source object is off limits.
// braid-http's multiplexer dies building its fake response, with "Permission
// denied to access property autoAllocateChunkSize" (bugzilla 1757836, open
// since Firefox 99). Both primings the bug suggests are MV2-only.
//
// So hand the sandbox a ReadableStream of its own, and the lookup stops here
// instead of reaching the page. A TransformStream built with no arguments
// gives the page's realm nothing to read, and its readable end is a real
// stream that our sandbox-local Response accepts. Only the sliver of the API
// braid-http asks for is covered: a start callback fed enqueue/close/error.
// Chrome has no sandbox, no xray, and takes none of this.
//
// Two things that look like they should work, and don't: priming the sandbox
// the way bug 1757836 suggests (MV2 only — MV3 dropped the sandbox's own
// fetch), and borrowing the constructor off `new Response('').body`, whose
// stream turns out to be the page's too.
try {
  if ('wrappedJSObject' in ReadableStream) {
    globalThis.ReadableStream = function (source) {
      // The page's own TransformStream, reached without xray vision. An xrayed
      // one hands back xrayed promises, and reading `.then` off one of those
      // from in here is denied (bugzilla 1750290) — which is what awaiting a
      // read from this stream ends up doing.
      var TS = window.wrappedJSObject?.TransformStream ?? TransformStream
      var ts = new TS()
      var writer = ts.writable.getWriter()
      source?.start?.({
        // The chunk has to belong to the page before it is allowed through
        // the page's stream: written as it is, a sandbox Uint8Array reads back
        // out as undefined, while a cloned one arrives whole and still
        // iterable, which is what braid-http walks it as.
        enqueue: chunk => {
          var theirs = (chunk !== null && typeof chunk === 'object')
                       ? cloneInto(chunk, window) : chunk
          writer.write(theirs).catch(() => {})
        },
        close: () => { writer.close().catch(() => {}) },
        error: e  => { writer.abort(e).catch(() => {}) },
      })
      return ts.readable
    }
  }
} catch (e) {
  console.log('ReadableStream shim failed: ' + (e?.stack ?? e))
}

// Bring a character offset into view, if it is not already. The browser is
// asked where that character lands by laying the same text out in a hidden
// copy of the box, which is the only way to account for soft wrapping.
function reveal_offset(el, at) {
  let content = el.value ?? el.textContent
  if (at == null || at > content.length) return
  let cs = getComputedStyle(el)
  let mirror = document.createElement('div')
  mirror.style.cssText = 'position:absolute;visibility:hidden;top:0;left:-9999px;'
    + 'white-space:pre-wrap;overflow-wrap:break-word'
  for (let k of ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing',
                 'padding', 'border', 'boxSizing', 'width', 'textIndent'])
    mirror.style[k] = cs[k]
  mirror.textContent = content.slice(0, at)
  let marker = document.createElement('span')
  marker.textContent = '\u200b'
  mirror.appendChild(marker)
  document.body.appendChild(mirror)
  let y = marker.offsetTop
  let line = parseFloat(cs.lineHeight) || 16
  mirror.remove()

  // Only move if the change is somewhere the reader cannot see. Scrolling a
  // document that already shows the edit would be the view chasing itself.
  if (y >= el.scrollTop && y + line <= el.scrollTop + el.clientHeight) return
  el.scrollTop = Math.max(0, y - el.clientHeight / 2 + line / 2)
}

// The author's colour, softened into something text stays readable on. The
// panel sends the colours the history graph is using, in whatever form it
// draws them; mixing towards transparent works for any of them. An author the
// graph has never drawn falls back to a neutral highlight.
function author_tint(colors, agent) {
  let c = colors?.[agent]
  return c ? `color-mix(in oklab, ${c} 22%, transparent)`
           : 'rgba(140, 140, 140, 0.25)'
}

// What the diff view is currently showing, so being told again is cheap
var showing_diff = null

// Show what a span of history did, in place of the editor, or put the editor
// back when there is nothing to show. Edits are highlighted in their author's
// colour, the same one that author has in the history graph, so the text reads
// as who wrote what, and removed text is struck through and faded.
//
// Leaving the deletions out gives the text exactly as it stood at the far end
// of the span, so it can be read and copied like ordinary text and still says
// who wrote each part. `at` is a position worth looking at, brought into view
// if it is off screen.
function show_diff_view(diff_d, diff, colors, show_deletions, at) {
  let showing = window.getComputedStyle(diff_d).display !== 'none'
  let from = showing ? diff_d : textarea
  let scroll = { vertical: from.scrollTop, horizontal: from.scrollLeft }

  if (!diff) {
    // Nothing is up, so there is nothing to take down. Saying so anyway used
    // to rewrite the textarea's display and scroll, and the page flickered
    // and grew a scrollbar for a moment over a request to change nothing.
    if (!showing) return

    diff_d.style.display = 'none'
    textarea.style.display = 'block'
    textarea.scrollTop = scroll.vertical
    textarea.scrollLeft = scroll.horizontal
    showing_diff = null
    return
  }

  // The same diff can arrive over and over -- the panel says it again every
  // time it reconnects, and a span that has not moved still describes itself.
  // Rebuilding all of this to show what is already on screen is what the
  // flicker was.
  var same = JSON.stringify([diff, colors, show_deletions])
  if (showing && same === showing_diff) return reveal_offset(diff_d, at)
  showing_diff = same

  diff_d.style.display = 'block'
  textarea.style.display = 'none'

  diff_d.innerHTML = ''
  for (let [what, text, agent] of diff) {
    if (!text || (what === -1 && !show_deletions)) continue
    let span = document.createElement('span')
    if (what) {
      span.style.backgroundColor = author_tint(colors, agent)
      if (what === -1) {
        span.style.textDecoration = 'line-through'
        span.style.opacity = 0.55
      }
    }
    span.textContent = text
    diff_d.appendChild(span)
  }
  diff_d.scrollTop = scroll.vertical
  diff_d.scrollLeft = scroll.horizontal
  reveal_offset(diff_d, at)
}

var get_parents = () => null

var current_sync = null

// The navigation's defaults, for rerequests that don't specify these
var nav_content_type = null
var nav_merge_type = null

// The url we have already set ourselves up for, so the second of the two
// 'loaded' messages does not tear that down and build it again
var last_loaded_url = null

var is_chrome_showing_media = false

window.errorify = (msg) => {
  console.log(`errorify: ${msg?.stack ?? msg}`)
  if (textarea) {
    textarea.style.background = 'pink'
    textarea.style.color = '#800'
    textarea.disabled = true
  }
  throw new Error(msg)
}

function send_dev_message(m) {
  try {
    chrome.runtime.sendMessage(m)
  } catch (e) {
    console.log(`send_dev_message could not send action=${m?.action}`
                + ` keys=[${Object.keys(m ?? {})}]: ${e}`)
    window.errorify(e)
  }
}

function on_bytes_received(s) {
  // A heartbeat is a bare CRLF of its own, proving the pipe is alive rather
  // than saying anything. Mid-blob those two bytes are the blob's.
  if (dt_blob_left === 0 && s.length === 2 && s[0] === 13 && s[1] === 10) return

  var text = decode_binary_as_markers(s)
  if (text) record_raw(text)
}

// dt-encoded blobs put binary on the wire now. Show each blob as one
// <binary> marker by following the framing: an update whose body starts
// with dt's DMNDTYPS magic, sized by its Content-Length header
var dt_blob_left = 0
function decode_binary_as_markers(bytes) {
  var td = new TextDecoder()
  var out = ''
  var i = 0

  // A blob can span network chunks. Its full size was reported when it
  // began, so swallow continuation bytes silently
  if (dt_blob_left > 0) {
    var n = Math.min(dt_blob_left, bytes.length)
    dt_blob_left -= n
    i = n
  }

  while (i < bytes.length) {
    var body_start = find_crlfcrlf(bytes, i)
    if (body_start < 0) {
      out += unframed_binary_as_markers(bytes.subarray(i))
      break
    }
    var headers = td.decode(bytes.subarray(i, body_start))
    var len = parseInt(headers.match(/^content-length:\s*(\d+)\s*$/im)?.[1])
    if (len >= 8 && starts_with_ascii(bytes, body_start, 'DMNDTYPS')) {
      out += headers + `<binary: ${len} bytes>`
      var have = Math.min(len, bytes.length - body_start)
      dt_blob_left = len - have
      i = body_start + have
    } else {
      // Not a dt blob; pass the segment through, sweeping it for any
      // binary the framing didn't catch
      out += unframed_binary_as_markers(bytes.subarray(i, body_start))
      i = body_start
    }
  }
  return out
}

// Returns the index just past the next \r\n\r\n, or -1
function find_crlfcrlf(b, from) {
  for (var i = from; i + 3 < b.length; i++)
    if (b[i] == 13 && b[i+1] == 10 && b[i+2] == 13 && b[i+3] == 10)
      return i + 4
  return -1
}

function starts_with_ascii(b, at, s) {
  if (at + s.length > b.length) return false
  for (var i = 0; i < s.length; i++)
    if (b[at + i] != s.charCodeAt(i)) return false
  return true
}

// Wire text is \t \r \n, printable ascii, or a valid UTF-8 sequence.
// Everything else (dt varints, stray high bytes) counts as binary.
// Returns the sequence's byte length, or 0 for binary
function text_seq_len(b, i) {
  var b0 = b[i]
  if (b0 == 9 || b0 == 10 || b0 == 13 || (b0 >= 32 && b0 < 127)) return 1
  var n = b0 >= 0xf0 ? 4 : b0 >= 0xe0 ? 3 : b0 >= 0xc2 ? 2 : 0
  if (!n || i + n > b.length) return 0
  for (var j = 1; j < n; j++)
    if ((b[i + j] & 0xc0) != 0x80) return 0
  return n
}

// Fallback for binary that isn't dt-framed: mark each binary span,
// growing it while more binary bytes appear nearby
function unframed_binary_as_markers(bytes) {
  var td = new TextDecoder()
  var out = ''
  var text_start = 0
  var i = 0
  while (i < bytes.length) {
    var n = text_seq_len(bytes, i)
    if (n) { i += n; continue }

    var start = i, end = i + 1
    for (var j = end; j < bytes.length && j < end + 16; ) {
      var m = text_seq_len(bytes, j)
      if (m) j += m
      else end = ++j
    }
    out += td.decode(bytes.subarray(text_start, start))
    out += `<binary: ${end - start} bytes>`
    text_start = i = end
  }
  return out + td.decode(bytes.subarray(text_start))
}

// An outgoing body is all one thing: text, or a single blob
function body_as_text_or_marker(bytes) {
  for (var i = 0; i < bytes.length; ) {
    var n = text_seq_len(bytes, i)
    if (!n) return `<binary: ${bytes.length} bytes>`
    i += n
  }
  return new TextDecoder().decode(bytes)
}

function record_raw(s) {
  raw_messages.push(s)
  send_dev_message({ action: "braid_in", data: s })
}

// Mirror a response's headers to the devtools, and reconstruct its status
// line and headers for the raw view, since braid_fetch doesn't deliver
// those as bytes
function record_response(response) {
  headers = {}
  // forEach rather than for-of over .entries(): Firefox content scripts don't
  // expose Symbol.iterator on the iterator Headers hands back, so for-of dies
  // with "not iterable" there while working fine in Chrome.
  response.headers.forEach((value, name) => headers[name.toLowerCase()] = value)

  var status_text = {200: 'OK', 209: 'Multiresponse'}[response.status] ?? ''
  record_raw(`HTTP/1.1 ${response.status} ${status_text}\r\n`
             + Object.entries(headers).map(([k, v]) => `${k}: ${v}\r\n`).join('')
             + '\r\n')

  // The status travels under a name no real header can take -- the same one
  // the navigation's headers arrive under -- so the panel can tell a version
  // this resource refused from one it served. Added after the status line
  // above is built, which shows only what was really on the wire.
  headers[':status'] = response.status
  send_dev_message({ action: "new_headers", headers })
}

function on_bytes_going_out(url, params) {
  if (!on_bytes_going_out.chain) on_bytes_going_out.chain = Promise.resolve()
  on_bytes_going_out.chain = on_bytes_going_out.chain.then(async () => {
    let data = await constructHTTPRequest(url, params)
    // console.log(`on_bytes_going_out[${data}]`)
    raw_messages.push(data)
    send_dev_message({ action: "braid_out", data })
  })
}

window.subscription_online = false
var on_subscription_status = null  // set by merge-type handlers that need it
function set_subscription_online(bool) {
  if (window.subscription_online === bool) return
  window.subscription_online = bool
  console.log(bool ? 'Connected!' : 'Disconnected.')
  if (online) online.style.color = bool ? 'lime' : 'orange';
}

// This replaces the page with our "live-update" view of TEXT or JSON
chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
  // console.log(`getting message with cmd: ${request.cmd}`)
  let reload = () => {
    console.log('reloading!')
    disconnect()
    location.reload()
  }
  if (request.cmd == 'init') {
    send_dev_message({ action: "init", headers, versions, raw_messages, get_failed })
  } else if (request.cmd == 'panel_opened') {
    if (deleteIcon) deleteIcon.style.display = 'flex'
  } else if (request.cmd == 'panel_closed') {
    if (deleteIcon) deleteIcon.style.display = 'none'
    // Time-travel was the panel driving this page, and the panel has gone.
    // Leaving the diff up would strand the page showing an old version of
    // itself with nothing left that could take it off the screen.
    on_show_diff(null)
  } else if (request.cmd == "show_diff") {
    on_show_diff(request.from_version, request.to_version, request.colors,
                 request.show_deletions, request.at)
  } else if (request.cmd == "edit_source") {
    edit_source = true
    show_editor()
  } else if (request.cmd == "rerequest") {
    // Going back to Chrome's native rendering needs a real page reload
    if (request.subscribe === false && !request.version && !request.parents)
      reload()
    else
      connect(request)
  } else if (request.cmd == 'loaded') {
    // Our 'ready' and the background's tabs.onUpdated both ask for this, and
    // either can arrive first. Once one has come bearing headers the page is
    // set up, and a second would only take it apart and build it again. One
    // that arrives without headers settles nothing, so it claims nothing.
    if (request.headers && last_loaded_url === request.url) return
    if (request.headers) last_loaded_url = request.url

    // Standing down without headers is the right answer; throwing on the
    // missing object is not, and that is what used to happen here.
    if (!request.headers)
      console.log(`braid: no response headers for this navigation`)
    var res_headers = request.headers ?? {}

    nav_content_type =
      res_headers['repr-type']?.split(/[;,]/)[0] ||
      res_headers['content-type']?.split(/[;,]/)[0] ||
      request.request_headers?.accept?.split(/[;,]/)[0]
    nav_merge_type = res_headers['merge-type']

    headers = {}
    for (let x of Object.entries(res_headers)) headers[x[0]] = x[1]

    // Only take over pages whose response headers advertise Braid.
    // Braidify always Varies on Subscribe; braid-text adds the rest.
    // On normal websites, our extra GET can break logins (csrf rotation,
    // single-use urls) and trip rate limiters into endless retries.
    var braidly = /\bsubscribe\b/i.test(headers.vary ?? '')
      || headers['accept-subscribe'] != null
      || headers['current-version'] != null
      || headers['merge-type'] != null
      // Older braid servers (like mail.braid.org) predate braidify's
      // Vary headers, but advertise Subscribe in their CORS allow-list
      || /\bsubscribe\b/i.test(headers['access-control-allow-headers'] ?? '')

    // Devtools can overrule the sniff, but only by asking: an open panel
    // sends its settings for every page, and having it open is not a request
    // to connect one that never advertised Braid.
    if (!braidly && !request.dev_message?.asked_for) return

    // Everything past here reads and replaces document.body, and we may have
    // been told about this page before the parser has made one — we ask for
    // the headers the moment the content script runs, which is earlier than
    // the tab reporting itself complete used to be.
    if (!document.body) await new Promise(done => {
      var o = new MutationObserver(() => {
        if (document.body) { o.disconnect(); done() }
      })
      o.observe(document.documentElement, { childList: true })
    })

    is_chrome_showing_media =
      // showing an image..
      (document.body?.firstElementChild?.tagName === 'IMG' && 
      document.body.firstElementChild.src === location.href) ||
      // showing a video or audio..
      (document.body?.firstElementChild?.tagName === 'VIDEO' && 
      document.body.firstElementChild.firstElementChild?.src === location.href)

    // if chrome is displaying the resource as an image, video or audio,
    // show a delete icon
    if (is_chrome_showing_media)
      addDeleteIcon(request.panel_open)

    connect(request.dev_message ?? {})

    // if it is displaying the resource as non-html, or it is a 404,
    // make it a drop target
    if (!content_type?.includes('html') || headers[':status'] === 404)
      setupDragAndDrop()
  }
})

// A sync is one live connection to this page's resource, under one set of
// request params. Rerequesting stops the current sync and starts a new one;
// the old editor stays visible until the new sync's first update swaps it in.
function connect(params) {
  disconnect()
  current_sync = { aborter: new AbortController(), cleanups: [] }

  version = params.version
  parents = params.parents
  content_type = params.content_type || nav_content_type
  merge_type = params.merge_type || nav_merge_type
  subscribe = !(params.subscribe === false)
  encoding_dt = !(params.encoding_dt === false)
  edit_source = params.edit_source

  window.subscription_online = false
  on_subscription_status = null
  get_parents = () => null
  on_show_diff = () => { }

  // The old sync's history is replaced along with it. Its headers stay
  // shown until the new response arrives, like the editor's content does
  versions = []
  raw_messages = []
  dt_blob_left = 0
  get_failed = ''
  // fresh: a new sync, not this one describing itself to a panel that asked
  send_dev_message({ action: "init", fresh: true, versions, raw_messages, get_failed })

  if (version || parents) handle_specific_version()
  else if (subscribe) handle_subscribe()
}

function disconnect() {
  if (!current_sync) return
  current_sync.dead = true
  current_sync.aborter.abort()
  for (var f of current_sync.cleanups) try { f() } catch (e) { }
  current_sync = null
}

async function handle_specific_version() {
  var abort_controller = current_sync.aborter
  window.stop()
  // Canvas/CanvasText are CSS system colors that follow the OS
  // light/dark theme (given color-scheme), so dark-mode users get
  // light text on a dark editor instead of white-on-white
  document.body.innerHTML = '<textarea disabled style="position: fixed; left: 0px; top: 0px; right: 0px; bottom: 0px; padding: 13px 8px; font-size: 13px; border: 0; box-sizing: border-box; color-scheme: light dark; background: Canvas; color: CanvasText;"></textarea>'
  document.body.style.background = 'none'
  textarea = document.body.firstChild

  try {
    response = await braid_fetch_wrapper(window.location.href, {
      version: version ? JSON.parse(`[${version}]`) : null,
      parents: parents ? JSON.parse(`[${parents}]`) : null,
      peer,
      headers: { Accept: content_type, ...(merge_type ? { ['Merge-Type']: merge_type } : {}) },
      signal: abort_controller.signal,
      retry: true
    })

    record_response(response)

    textarea.textContent = await response.text()
  } catch (e) {
    if (abort_controller.signal.aborted) return
    console.log('braid_fetch_wrapper failed: ' + e)
    get_failed = '' + e
    send_dev_message({ action: "get_failed", get_failed })
    textarea.value = get_failed

    textarea.style.border = '4px red solid'
    textarea.style.background = '#fee'
    textarea.style.color = '#800'  // else dark mode puts white text on the pink
    send_dev_message({ action: "get_failed", get_failed: '' + e })
  }
}

async function handle_subscribe() {
  var sync = current_sync
  var abort_controller = sync.aborter
  let uniquePrefix = '_' + Math.random().toString(36).slice(2)
  let main_div = make_html(`<div
          style="position: fixed; left: 0px; top: 0px; right: 0px; bottom: 0px; box-sizing: border-box; color-scheme: light dark; background: Canvas; color: CanvasText;"
      >
          <pre 
              class="${uniquePrefix}_diff_d" 
              style="display:none; position: absolute; top: 0px; left: 0px; right: 0px; bottom: 0px; padding: 13px 8px; font-size: 13px; font-family: monospace; overflow:scroll; margin:0px; white-space: pre-wrap; word-wrap: break-word; overflow-wrap: break-word;"
          ></pre>
          <span 
              class="${uniquePrefix}_online" 
              style="position: absolute; top: 5px; right: 5px;"
          >•</span>
          <textarea
              class="${uniquePrefix}_textarea"
              style="display: block; width: 100%; height:100%; padding: 13px 8px; font-size: 13px; border: 0; box-sizing: border-box; background: transparent; color: inherit;"
              readonly
              disabled
          ></textarea>
      </div>`)
  let diff_d = main_div.querySelector(`.${uniquePrefix}_diff_d`)
  online = main_div.querySelector(`.${uniquePrefix}_online`)
  textarea = main_div.querySelector(`.${uniquePrefix}_textarea`)

  // The panel asks what a span of history did whenever one is selected there.
  // Replaying the updates answers it for any history that arrives in a
  // straight line, which is all of them but dt's; dt replaces this below with
  // something that asks the document itself.
  on_show_diff = (from_version, to_version, colors, show_deletions, at) =>
    show_diff_view(diff_d,
      from_version && replay_diff(versions, from_version, to_version),
      colors, show_deletions, at)
  // show_editor() replaces the original page with our editor.  We defer
  // calling it until the first subscription update arrives, so that the
  // original page stays visible rather than flashing blank while we wait.
  show_editor = () => {
    document.body.innerHTML = ''
    document.body.style.background = 'none'
    document.body.append(main_div)
    show_editor = () => {}
  }

  let on_fail = e => {
    // We abort on purpose when devtools asks for a reload — that's not a
    // failure, so don't paint the error UI
    if (abort_controller.signal.aborted) return
    console.log(e?.stack || e)
    textarea.style.border = '4px red solid'
    textarea.style.background = '#fee'
    textarea.style.color = '#800'  // else dark mode puts white text on the pink
    textarea.disabled = true
    send_dev_message({ action: "get_failed", get_failed: '' + e })
  }

  // We defer show_editor() until the first update arrives, so a subscription
  // that dies before then needs to show the editor for its error to be seen
  var on_subscribe_fail = e => {
    if (abort_controller.signal.aborted) return
    show_editor()
    on_fail(e)
  }

  var og_headers = headers

  // for blobs, let's not load the blob twice unnecessarily
  if (merge_type === 'aww')
    get_parents = () => og_headers.version && JSON.parse(`[${og_headers.version}]`)

  try {
    response = await braid_fetch_wrapper(window.location.href, {
      version: null,
      parents: () => get_parents(),
      peer,
      headers: { Accept: content_type, ...(merge_type ? { ['Merge-Type']: merge_type } : {}),
                 // dt history is much faster shipped as binary chunks
                 ...(merge_type === 'dt' && encoding_dt ? { 'Accept-Multiresponse-Encoding': 'dt' } : {}) },
      signal: abort_controller.signal,
      cache: 'no-store',
      subscribe: true,
      retry: true,
      heartbeats: 22.5,
      onSubscriptionStatus: (status) => {
        set_subscription_online(status.online)
        if (on_subscription_status) on_subscription_status(status)
      }
    })
  } catch (e) {
    if (abort_controller.signal.aborted) return
    console.log('braid_fetch_wrapper failed: ' + e)
    get_failed = '' + e
    send_dev_message({ action: "get_failed", get_failed })
    textarea.value = get_failed
    on_fail(e)
    return
  }

  record_response(response)

  if (headers.subscribe !== '?1' && headers.subscribe !== 'true') {
    abort_controller.abort()
    return
  }

  // Which merge-type we got is the response's to say. Asking for one is a
  // request, and a server is free to answer with a different one, or with
  // none, and still be serving Braid -- merge-types are a feature to
  // negotiate, not a thing every server has. Reading our own request back as
  // if it were the answer ran dt's machinery over versions that had never
  // been dt's, and threw on the first update that arrived.
  merge_type = headers['merge-type'] ?? null

  // application/http-history frames the subscription; it is not the repr.
  // When the response doesn't name a repr, fall back to the type we asked for
  var repr_type = headers['repr-type'] ??
      (headers['content-type']?.startsWith('application/http-history')
          ? content_type : headers['content-type'])

  if (repr_type?.split(/[;,]/)[0] === 'text/html' && !edit_source) {
    // skip first show_editor attempt
    var og_show_editor = show_editor
    show_editor = () => show_editor = og_show_editor
  }

  if (merge_type === 'dt') {
    // initSync caches, so rerequests re-enter here for free
    let wasmModuleBuffer = await (await fetch(chrome.runtime.getURL('dt_bg.wasm'))).arrayBuffer();
    initSync({ module: wasmModuleBuffer })

    let last_text = "";
    let last_text_code_points = 0;

    let outstandings = make_linklist();

    doc = new Doc(peer);
    sync.cleanups.push(() => { doc?.free(); doc = null })

    get_parents = () => doc.getRemoteVersion().map((x) => x.join("-")).sort()

    // The document holds the whole history and can be asked about any two
    // points in it directly, which beats replaying anything. It goes away
    // while a subscription is being replaced, and there is nothing to show
    // until its replacement has some history in it.
    on_show_diff = (from_version, to_version, colors, show_deletions, at) =>
      show_diff_view(diff_d,
        from_version && doc && dt_diff_from(doc, from_version, to_version),
        colors, show_deletions, at)

    textarea.addEventListener("input", async () => {
      let commonStart = 0;
      let commonStart_codePoints = 0;
      while (
        commonStart < Math.min(last_text.length, textarea.value.length) &&
        last_text.codePointAt(commonStart) == textarea.value.codePointAt(commonStart)
      ) {
        commonStart += textarea.value.codePointAt(commonStart) > 0xffff ? 2 : 1
        commonStart_codePoints++
      }

      let commonEnd = 0;
      let commonEnd_codePoints = 0;
      let left_over = Math.min(
        last_text.length - commonStart,
        textarea.value.length - commonStart
      )
      while (commonEnd < left_over) {
        let a = last_text.codePointAt(last_text.length - commonEnd - 1)
        let b = textarea.value.codePointAt(textarea.value.length - commonEnd - 1)
        if (a != b) break
        if (a >= 0xD800 && a <= 0xDFFF) {
          if (commonEnd + 1 >= left_over) break
          a = last_text.codePointAt(last_text.length - commonEnd - 2)
          b = textarea.value.codePointAt(textarea.value.length - commonEnd - 2)
          if (a != b) break
          commonEnd += 2
        } else {
          commonEnd++
        }
        commonEnd_codePoints++
      }

      let numCodePointsToDelete = last_text_code_points - commonStart_codePoints - commonEnd_codePoints;
      let stuffToInsert = textarea.value.slice(
        commonStart,
        textarea.value.length - commonEnd
      );

      last_text = textarea.value;
      last_text_code_points = commonStart_codePoints + commonEnd_codePoints + count_code_points(stuffToInsert)

      let v = doc.getRemoteVersion().map(v => v.join('-'));
      if (numCodePointsToDelete)
        for (let i = 0; i < numCodePointsToDelete; i++)
          doc.del(commonStart_codePoints + numCodePointsToDelete - 1 - i, 1)
      if (stuffToInsert) doc.ins(commonStart_codePoints, stuffToInsert);

      for (let u of doc.getUpdates(v)) {
        // An update covers a run of events; its first is named outright
        let start_version_seq = decode_version(u.first_event)[1]

        let ops = {
          retry: true,
          method: "PUT",
          mode: "cors",
          headers: { "Merge-Type": merge_type },
          repr_type: content_type,
          version: u.version,
          parents: u.parents,
          patches: u.patches,
          peer
        };
        versions.push(ops)
        send_dev_message({ action: "new_version", version: ops })

        let outstanding = {
          version: u.version,
          ac: new AbortController(),
        }
        outstandings.push(outstanding)
        textarea.style.caretColor = 'red'

        rest()
        async function rest() {
          try {
            // The request gets a copy. braid_fetch adds an AbortSignal and
            // swaps the headers for a Headers object, and neither of those
            // survives the structured clone that carries `versions` over to
            // the devtools panel — so the record we keep stays plain data.
            await braid_fetch_wrapper(window.location.href,
                                      {...ops, signal: outstanding.ac.signal});
            outstandings.remove(outstanding)
          } catch (e) {
            if (is_access_denied(e)) {
              let x = outstanding
              while (x) {
                if (x != outstanding) x.ac.abort()
                for (let i = versions.length - 1; i >= 0; i--) {
                  if (versions[i].version.length === x.version.length && versions[i].version.every((v, i) => v === x.version[i])) {
                    versions.splice(i, 1)
                    break
                  }
                }
                send_dev_message({ action: "new_version", remove_version: x.version })
                outstandings.remove(x)
                x = x.next
              }

              let rollback_to = doc.getRemoteVersion().map(v => {
                if (v[0] === peer) v[1] = start_version_seq - 1
                return v.join('-')
              })
              let new_doc = Doc.fromBytes(
                doc.toBytesAt(doc.remoteToLocalVersion(rollback_to)))
              doc.free()
              doc = new_doc

              textarea.value = last_text = doc.get()
              last_text_code_points = count_code_points(last_text)
            } else on_fail(e)
          }
          if (!outstandings.size) textarea.style.caretColor = ''
        }
      }
    });

    // Set the textarea straight from the doc, holding the cursor's
    // index steady
    function seed_textarea_from_doc() {
      var s0 = textarea.selectionStart, s1 = textarea.selectionEnd
      textarea.value = last_text = doc.get()
      last_text_code_points = count_code_points(last_text)
      textarea.selectionStart = Math.min(s0, textarea.value.length)
      textarea.selectionEnd = Math.min(s1, textarea.value.length)
    }

    // Show the doc's changes since before_v in the textarea
    function flush_textarea(before_v) {
      // The textarea normalizes \r\n to \n and \r to \n, but last_text preserves \r's.
      // Compare and map selection positions from textarea space to last_text space.
      let { in_sync, sel } = compareNormalizedAndMapSel(
        textarea.value,
        last_text,
        [textarea.selectionStart, textarea.selectionEnd]
      )
      if (!in_sync) errorify("textarea out of sync somehow!")

      let new_text = applyChanges(
        last_text,
        sel,
        doc.xfSince(before_v)
      )

      // Convert sel back from last_text space to textarea space
      mapSelToNormalized(new_text, sel)

      // Assigning .value scrolls a textarea back to where it thinks it should
      // be and repaints it, even when the string handed to it is the one it
      // already holds -- so a flush that changed nothing must not assign. A
      // reconnect re-sends history we already have and lands here.
      if (new_text === last_text && textarea.value === new_text
          && textarea.selectionStart === sel[0] && textarea.selectionEnd === sel[1])
        return

      textarea.value = last_text = new_text
      last_text_code_points = count_code_points(last_text)
      textarea.selectionStart = sel[0]
      textarea.selectionEnd = sel[1]
    }

    response.subscribe(update => {
      let { version, parents, patches, body, status } = update
      if (status && parseInt(status) !== 200)
        return console.log(`ignoring update with status ${status}`)

      if (textarea.hasAttribute("readonly")) {
        show_editor()
        textarea.removeAttribute("readonly")
        textarea.removeAttribute('disabled')
        // textarea.focus()
      }

      if (update.extra_headers?.['content-encoding'] === 'dt') {
        // The server only marks the encoding per-update, so surface it in
        // the devtools response column when the first binary update lands
        if (headers.encoding !== 'dt') {
          headers.encoding = 'dt'
          send_dev_message({ action: "new_headers", headers })
        }

        // Remember the frontier, so we can tell what this chunk adds
        let before_remote = doc.getRemoteVersion().map(x => x.join('-')).sort()
        let before_v = doc.getLocalVersion()

        // The body is a chunk of history in raw dt bytes; merge it directly
        doc.mergeBytes(update.body)

        // And expand it into viz rows, just like a server expands its
        // dt file into updates for the wire
        // Hand the devtools the chunk exactly as it arrived, in dt bytes.
        // It keeps its own copy of the document and expands the chunk
        // itself, which for a large history is a few hundred kilobytes here
        // rather than megabytes of expanded versions in tens of thousands of
        // messages.
        let bin = ''
        for (let i = 0; i < update.body.length; i++)
          bin += String.fromCharCode(update.body[i])
        send_dev_message({ action: "dt_history", bytes: btoa(bin) })

        // The page's own list still needs them, for the diff view
        for (let u of doc.getUpdates(before_remote))
          versions.push({ method: "GET", version: u.version,
                          parents: u.parents, patches: u.patches })

        if (before_v.length) {
          flush_textarea(before_v)
          // Wide concurrent spans can defeat xfSince's replay, so check
          // the result against the doc, and reseed if it drifted
          if (last_text !== doc.get()) seed_textarea_from_doc()
        } else
          // xfSince can't replay a whole history from scratch, so seed
          // the textarea straight from the merged doc
          seed_textarea_from_doc()
        return
      }

      if (body) body = update.body_text
      if (patches) for (let p of patches) p.content = p.content_text

      if (!patches) {
        let new_version = {
          method: "GET",
          version,
          parents,
          patches: [{ unit: 'text', range: '[0:0]', content: body }]
        }
        versions.push(new_version)
        send_dev_message({ action: "new_version", version: new_version })
        return;
      }

      let v = decode_version(version[0])
      if (doc.knownSeqSpan(v[0], v[1], v[1])) return

      let new_version = {
        method: "GET",
        version,
        parents,
        patches
      }
      versions.push(new_version)
      send_dev_message({ action: "new_version", version: new_version })

      let before_v = doc.getLocalVersion();

      try {
        patches = patches.map((p) => ({
          ...p,
          range: p.range.match(/\d+/g).map((x) => parseInt(x)),
          ...(p.content ? { content: p.content, content_codepoints: [...p.content] } : {}),
        }))

        var high_seq = v[1]
        var low_seq = v[1] + 1 - patches.reduce((a, b) => a + (b.content?.length ? b.content_codepoints.length : 0) + (b.range[1] - b.range[0]), 0)

        v = encode_version(v[0], low_seq)

        let ps = parents

        // Each edit is positioned against the document as it stood at its own
        // parents, so they can all go in together and be merged once.
        let ops = []
        let offset = 0
        for (let p of patches) {
          // delete
          let del = p.range[1] - p.range[0]
          if (del) {
            let [va, vs] = decode_version(v)
            ops.push({ agent: va, seq: vs, parents: ps,
                       pos: p.range[0] + offset, del })
            offset -= del
            ps = [`${va}-${vs + (del - 1)}`]
            v = `${va}-${vs + del}`
          }
          // insert
          if (p.content?.length) {
            let [va, vs] = decode_version(v)
            ops.push({ agent: va, seq: vs, parents: ps,
                       pos: p.range[1] + offset, ins: p.content })
            offset += p.content_codepoints.length
            ps = [`${va}-${vs + (p.content_codepoints.length - 1)}`]
            v = `${va}-${vs + p.content_codepoints.length}`
          }
        }
        doc.applyRemoteOps(ops)
      } catch (e) {
        errorify(e)
      }

      flush_textarea(before_v)
    }, on_subscribe_fail)
  } else if (merge_type === 'simpleton') {
    console.log(`got simpleton..`)

    var hl = textarea_highlights(textarea)
    var applying_remote = false
    var cursor_sync = await cursor_client(window.location.href, {
        peer: Math.random().toString(36).slice(2),
        get_text: () => textarea.value,
        on_change: (sels) => {
            for (var [id, ranges] of Object.entries(sels)) {
                if (!ranges.length) { hl.remove(id); continue }
                hl.set(id, ranges.map(r => ({
                    from: r.from, to: r.to,
                    color: r.from === r.to ? peer_color(id) : peer_bg_color(id)
                })))
            }
            hl.render()
        }
    })
    // If we got disconnected while the cursors were connecting, take them down
    if (cursor_sync && sync.dead) { cursor_sync.destroy(); cursor_sync = null }
    if (cursor_sync) {
        sync.cleanups.push(() => cursor_sync.destroy())
        on_subscription_status = ({online}) => {
            online ? cursor_sync.online() : cursor_sync.offline()
        }
        if (window.subscription_online) cursor_sync.online()
        var on_selectionchange = function() {
            if (applying_remote) return
            if (document.activeElement !== textarea) return
            cursor_sync.set(textarea.selectionStart, textarea.selectionEnd)
        }
        document.addEventListener('selectionchange', on_selectionchange)
        sync.cleanups.push(() =>
            document.removeEventListener('selectionchange', on_selectionchange))
    }

    var char_counter = -1   // Counts the numbers of inserts and deletes generated by this client

    var current_version = []
    var last_seen_state = null
    var outstanding_changes = make_linklist()
    var max_outstanding_changes = 10

    get_parents = () => current_version

    response.subscribe(update => {
      if (update.status && parseInt(update.status) !== 200) return console.log(`ignoring update with status ${update.status}`)
      if (update.body) update.body = update.body_text
      if (update.patches) for (let p of update.patches) p.content = p.content_text

      if (textarea.hasAttribute("readonly")) {
        show_editor()
        textarea.removeAttribute("readonly")
        textarea.removeAttribute('disabled')
        // textarea.focus()
      }

      if (current_version.length === (!update.parents ? 0 : update.parents.length) && current_version.every((v, i) => v === update.parents[i])) {
        current_version = update.version

        var old_val = textarea.value
        applying_remote = true

        if (update.body != null) textarea.value = last_seen_state = update.body
        else if (update.patches?.[0]?.unit === 'xpath')
          applyDomDiff(main_div, update.patches)
        else last_seen_state = apply_patches_and_update_selection(last_seen_state, update.patches, textarea)

        var new_val = textarea.value
        if (old_val !== new_val && cursor_sync) {
            var pfx = 0
            while (pfx < old_val.length && pfx < new_val.length && old_val[pfx] === new_val[pfx]) pfx++
            var os = old_val.length, ns = new_val.length
            while (os > pfx && ns > pfx && old_val[os-1] === new_val[ns-1]) { os--; ns-- }
            cursor_sync.changed([{range: [pfx, os], content: new_val.slice(pfx, ns)}])
        }
        hl.render()
        setTimeout(() => { applying_remote = false }, 0)

        let new_version = {
          ...update,
          method: "GET",
        }
        if (!new_version.patches) new_version.patches = [{ unit: 'body', range: '', content: update.body }]

        versions.push(new_version)
        send_dev_message({ action: "new_version", version: new_version })
      }
    }, on_subscribe_fail)

    function produce_local_update() {
      var patches = get_patches_for_diff(last_seen_state, textarea.value)
      // After an edit, the DT version-type requires we increment the current version
      // (aka "char_counter") by the number of characters that have been inserted or deleted
      char_counter += count_chars_in_patches(patches)
      return { patches, version: peer + '-' + char_counter, state: textarea.value }
    }

    // Wire up the Textarea
    textarea.value = ""
    textarea.oninput = async e => {
      // Cursor update (sync, before async PUT loop)
      var _old = last_seen_state, _new = textarea.value
      var _p = 0
      while (_p < _old.length && _p < _new.length && _old[_p] === _new[_p]) _p++
      var _os = _old.length, _ns = _new.length
      while (_os > _p && _ns > _p && _old[_os-1] === _new[_ns-1]) { _os--; _ns-- }
      if (cursor_sync) {
          if (_p !== _os || _p !== _ns)
              cursor_sync.changed([{range: [_p, _os], content: _new.slice(_p, _ns)}])
          cursor_sync.set(textarea.selectionStart, textarea.selectionEnd)
      }

      if (outstanding_changes.size >= max_outstanding_changes) return
      while (true) {
        var { patches, version, state } = produce_local_update()
        if (!patches.length) return
        version = [version]

        var outstanding_change = {
          restore_state: last_seen_state,
          restore_version: current_version,
          ac: new AbortController(),
        }
        outstanding_changes.push(outstanding_change)

        var parents = current_version
        current_version = version
        last_seen_state = state

        var ops = {
          headers: { "Merge-Type": merge_type },
          repr_type: content_type,
          method: "PUT",
          retry: true,
          version, parents, patches,
          peer,
        }
        versions.push(ops)
        send_dev_message({ action: "new_version", version: ops })

        textarea.style.caretColor = 'red'
        try {
          // A copy for the request, for the reason given in the dt path above
          await braid_fetch_wrapper(window.location.href,
                                    {...ops, signal: outstanding_change.ac.signal})
          outstanding_changes.remove(outstanding_change)
        } catch (e) {
          if (is_access_denied(e)) {
            var start_size = outstanding_changes.size
            let x = outstanding_change.next
            while (x) {
              x.ac.abort()
              versions.pop()
              outstanding_changes.remove(x)
              x = x.next
            }
            versions.pop()
            outstanding_changes.remove(outstanding_change)
            forget_replayed_history()
            send_dev_message({ action: "new_version", remove_count: start_size - outstanding_changes.size })

            textarea.value = last_seen_state = outstanding_change.restore_state
            current_version = outstanding_change.restore_version
          } else on_fail(e)
        }
        if (!outstanding_changes.size) textarea.style.caretColor = ''
      }
    }
  } else if (merge_type === 'aww') {
    var current_event = ''
    try {
      current_event = JSON.parse(`[${og_headers['version']}]`)[0]
    } catch (e) {}

    response.subscribe(update => {
      if (compare_events(update.version[0], current_event) > 0) {
        current_event = update.version[0]
        location.reload()
      }
    })

    // from braid-blob index.js or client.js
    function compare_events(a, b) {
        if (!a) a = ''
        if (!b) b = ''

        // Check if values match wallclockish format
        var re = compare_events.re || (compare_events.re = /^-?[0-9]*\.[0-9]*$/)
        var a_match = re.test(a)
        var b_match = re.test(b)

        // If only one matches, it wins
        if (a_match && !b_match) return 1
        if (b_match && !a_match) return -1

        // If neither matches, compare lexicographically
        if (!a_match && !b_match) {
            if (a < b) return -1
            if (a > b) return 1
            return 0
        }

        // Both match - compare as decimals using BigInt
        // Add decimal point if missing
        if (a.indexOf('.') === -1) a += '.'
        if (b.indexOf('.') === -1) b += '.'

        // Pad the shorter fractional part with zeros
        var diff = (a.length - a.indexOf('.')) - (b.length - b.indexOf('.'))
        if (diff < 0) a += '0'.repeat(-diff)
        else if (diff > 0) b += '0'.repeat(diff)

        // Remove decimal and parse as BigInt
        var a_big = BigInt(a.replace('.', ''))
        var b_big = BigInt(b.replace('.', ''))

        if (a_big < b_big) return -1
        if (a_big > b_big) return 1
        return 0
    }
  } else if (merge_type) {
    throw 'unsupported merge-type: ' + merge_type
  } else if (content_type == 'application/json') {
    console.log(`got application/json..`)

    var doc = null
    var last_version = []
    var outstanding_changes = 0
    var change_stack = make_linklist()

    function set_style_good(good) {
      textarea.style.background = good ? '' : 'pink'
      textarea.style.caretColor = good ? '' : 'red'
    }

    textarea.oninput = async e => {
      try {
        doc = JSON.parse(textarea.value)

        set_style_good(true)

        let new_version = {
          repr_type: content_type,
          method: "PUT",
          retry: true,
          version: ['default-' + default_version_count++],
          parents: last_version,
          patches: [{ unit: 'json', range: '', content: JSON.stringify(doc) }],
          peer
        }
        versions.push(new_version)
        send_dev_message({ action: "new_version", version: new_version })

        last_version = new_version.version
        let change = { ...new_version }
        change_stack.push(change)

        outstanding_changes++
        textarea.style.caretColor = 'red'
        try {
          await braid_fetch_wrapper(window.location.href, new_version)
          change_stack.remove_before(change)
        } catch (e) {
          if (is_access_denied(e)) {
            for (let i = versions.length - 1; i >= 0; i--) {
              if (versions[i].version.length === change.version.length && versions[i].version.every((v, i) => v === change.version[i])) {
                versions.splice(i, 1)
                if (versions[i] && versions[i].parents[0] == change.version[0]) {
                  versions[i].parents = change.parents
                }
                forget_replayed_history()
                send_dev_message({ action: "new_version", override_versions: versions })
                break
              }
            }

            change_stack.remove(change)
            doc = null
            let cur = change_stack.next
            while (cur) {
              for (let p of cur.patches)
                doc = apply_patch(doc, p.range, JSON.parse(p.content))
              cur = cur.next
            }
            textarea.value = JSON.stringify(doc)
          } else on_fail(e)
        }
        outstanding_changes--
        if (!outstanding_changes) textarea.style.caretColor = ''
      } catch (e) {
        set_style_good(false)
      }
    }

    response.subscribe(update => {
      let { version, parents, patches, body, status } = update
      if (status && parseInt(status) !== 200) return console.log(`ignoring update with status ${status}`)
      if (body) body = update.body_text
      if (patches) for (let p of patches) p.content = p.content_text

      if (textarea.hasAttribute("readonly")) {
        show_editor()
        textarea.removeAttribute("readonly")
        textarea.removeAttribute('disabled')
      }

      // console.log(
      //   `v = ${JSON.stringify(
      //     { version, parents, body, patches },
      //     null,
      //     4
      //   )}`
      // );

      if (!version) version = ['default-' + default_version_count++]
      if (!parents) parents = last_version

      try {
        let new_version = {
          method: "GET",
          version,
          parents,
          patches
        }

        if (body != null) {
          doc = JSON.parse(body)

          new_version.patches = [{
            unit: 'json',
            range: '',
            content: body
          }]
        } else {
          for (let p of patches)
            doc = apply_patch(doc, p.range, JSON.parse(p.content))
        }

        last_version = new_version.version
        let change = { ...new_version }
        change_stack.push(change)
        if (change.patches[0].range === '') change_stack.remove_before(change)

        versions.push(new_version)
        send_dev_message({ action: "new_version", version: new_version })
      } catch (e) {
        console.log(`eeee = ${e}`)
        console.log(`eeee = ${e.stack}`)
      }
      textarea.value = JSON.stringify(doc)
      set_style_good(true)
    }, on_subscribe_fail)
  }
}

function addDeleteIcon(panel_open) {
  var d = document.createElement('div')
  d.style.cssText = `position: fixed; top: 0; right: 0; background: rgba(255, 255, 255, 0.0); z-index: 9999; align-items: center; justify-content: center; display: ${panel_open ? 'flex' : 'none'}; width: 25px; height: 25px; padding: 5px;`

  // https://www.reshot.com/free-svg-icons/item/trash-ZP5J3CWHL6/
  d.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" style="width: 100%; height: 100%; fill: rgb(255,255,255,0.5); cursor: pointer"><path d="M22 5a1 1 0 0 1-1 1H3a1 1 0 0 1 0-2h5V3a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v1h5a1 1 0 0 1 1 1zM4.934 21.071 4 8h16l-.934 13.071a1 1 0 0 1-1 .929H5.931a1 1 0 0 1-.997-.929zM15 18a1 1 0 0 0 2 0v-6a1 1 0 0 0-2 0zm-4 0a1 1 0 0 0 2 0v-6a1 1 0 0 0-2 0zm-4 0a1 1 0 0 0 2 0v-6a1 1 0 0 0-2 0z"/></svg>'

  deleteIcon = d

  d.onclick = async () => {
    if (!confirm(`Are you sure you want to DELETE this resource from the server?`)) return
    try {
      var r = await braid_fetch(location.href, {
        method: 'DELETE',
        retry: true
      })
      if (!r.ok) {
        alert(`There was an error deleting (${r.status}): ` + await r.text())
      } else {
        location.reload()
      }
    } catch (e) {
      alert('There was an error deleting: ' + e)
    }
  }

  document.body.appendChild(d)
}

function setupDragAndDrop() {
  // Create visual overlay for drag feedback
  let dragOverlay = document.createElement('div')
  dragOverlay.id = 'braid-drag-overlay'
  dragOverlay.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0, 123, 255, 0.1); border: 3px dashed #007bff; display: none; z-index: 9998; pointer-events: none; align-items: center; justify-content: center; font-family: monospace; font-size: 16px; color: #007bff;'
  dragOverlay.textContent = 'Drop image here to upload'

  document.body.appendChild(dragOverlay)

  function preventDefaults(e) {
    e.preventDefault()
    e.stopPropagation()
  }

  function highlight(e) {
    // show_editor() wipes document.body, which destroys our overlay,
    // so re-add it if that happened
    if (!dragOverlay.isConnected) document.body.appendChild(dragOverlay)
    dragOverlay.style.display = 'flex'
  }

  function unhighlight(e) {
    dragOverlay.style.display = 'none'
  }

  function handleDrop(e) {
    var files = e.dataTransfer.files
    if (files.length > 0) uploadImage(files[0])
  }

  // Prevent default drag behaviors
  document.addEventListener('dragenter', preventDefaults, false)
  document.addEventListener('dragover', preventDefaults, false)
  document.addEventListener('dragleave', preventDefaults, false)
  document.addEventListener('drop', preventDefaults, false)

  // Highlight drop area when item is dragged over it
  document.addEventListener('dragenter', highlight, false)
  document.addEventListener('dragover', highlight, false)

  // Unhighlight when drag leaves or drops
  document.addEventListener('dragleave', unhighlight, false)
  document.addEventListener('drop', unhighlight, false)

  // Handle dropped files
  document.addEventListener('drop', handleDrop, false)

  async function uploadImage(file) {
    try {
      console.log('Uploading image:', file.name, 'Size:', file.size, 'Type:', file.type)

      // Create a small indicator to show subscription is active
      let indicator = make_html(`<div
        style="position: fixed; top: 5px; right: 5px; z-index: 9999; background: rgba(0,255,0,0.8); color: white; padding: 4px 8px; border-radius: 3px; font-size: 12px; font-family: monospace;"
      ></div>`)

      document.body.appendChild(indicator)

      // Show uploading indicator
      indicator.style.background = 'rgba(255, 165, 0, 0.8)' // Orange color for uploading
      indicator.textContent = '• Uploading...'

      // Convert file to ArrayBuffer for upload
      const arrayBuffer = await file.arrayBuffer()


      // Prepare the PUT request with Braid-HTTP headers
      const uploadParams = {
        method: 'PUT',
        headers: {
          'Content-Type': file.type,
        },
        body: arrayBuffer,
        retry: true
      }

      // Send the upload request
      const uploadResponse = await braid_fetch_wrapper(window.location.href, uploadParams)

      indicator.remove()

      if (uploadResponse.ok) {


        location.reload()
      } else {
        alert(`Upload failed with status: ${uploadResponse.status}`)
      }

    } catch (error) {
      alert(`Upload failed with error: ${error}`)
    }
  }
}


async function constructHTTPRequest(url, params) {
  let httpRequest = `${params.method ?? 'GET'} ${url}\r\n`
  // forEach, not for-of over .entries() — see record_response above for why
  params.headers.forEach((value, name) => {
    httpRequest += `${name}: ${value}\r\n`
  })
  httpRequest += '\r\n';
  if (['POST', 'PATCH', 'PUT'].includes(params.method?.toUpperCase()) && params.body) {
    httpRequest += typeof params.body === 'string' ? params.body : body_as_text_or_marker(params.body instanceof Uint8Array ? params.body : new Uint8Array(params.body instanceof Blob ? new Uint8Array(await params.body.arrayBuffer()) : ArrayBuffer.isView(params.body) ? params.body.buffer : new Uint8Array(binary)))
  }
  httpRequest += '\r\n\r\n'
  return httpRequest
}

// Compares a normalized string (like textarea.value where \r\n and \r become \n)
// against an original string (which may contain \r's), and converts selection
// positions from normalized space to original space.
// Returns { in_sync: boolean, sel: number[] }
function compareNormalizedAndMapSel(normalized, original, sel) {
  sel = sel.slice(); // don't mutate input
  let mapped = new Array(sel.length).fill(false); // track which positions have been mapped
  let ni = 0; // normalized index
  let oi = 0; // original index

  // Helper to map any sel positions at the current ni to oi
  function mapSelAtCurrentPos() {
    for (let s = 0; s < sel.length; s++) {
      if (!mapped[s] && sel[s] === ni) {
        sel[s] = oi;
        mapped[s] = true;
      }
    }
  }

  while (ni < normalized.length || oi < original.length) {
    mapSelAtCurrentPos();

    let nc = normalized[ni];
    let oc = original[oi];

    if (nc === oc) {
      ni++;
      oi++;
    } else if (oc === '\r') {
      // original has \r that was normalized away
      if (original[oi + 1] === '\n') {
        // \r\n in original became \n in normalized
        // skip the \r in original, the \n will match on next iteration
        oi++;
      } else {
        // standalone \r in original became \n in normalized
        if (nc === '\n') {
          ni++;
          oi++;
        } else {
          return { in_sync: false, sel };
        }
      }
    } else {
      return { in_sync: false, sel };
    }
  }

  // Handle sel positions at the very end
  mapSelAtCurrentPos();

  if (ni !== normalized.length || oi !== original.length) {
    return { in_sync: false, sel };
  }

  return { in_sync: true, sel };
}

// Converts selection positions from original space (with \r's) to normalized space
// (where \r\n becomes \n and standalone \r becomes \n).
function mapSelToNormalized(text, sel) {
  for (let s = 0; s < sel.length; s++) {
    let removed_count = 0;
    for (let i = 0; i < sel[s] && i < text.length; i++) {
      if (text[i] === '\r' && text[i + 1] === '\n') {
        // \r\n becomes \n, so \r is removed
        removed_count++;
      }
      // standalone \r becomes \n, no position change
    }
    sel[s] -= removed_count;
  }
}

function applyChanges(original, sel, changes) {
  for (var change of changes) {
    let start = codePoints_to_index(original, change.start)
    let end = codePoints_to_index(original, change.end)
    switch (change.kind) {
      case "Del":
        for (let i = 0; i < sel.length; i++) {
          if (sel[i] > start) {
            if (sel[i] > end) {
              sel[i] -= end - start;
            } else sel[i] = start;
          }
        }

        original =
          original.substring(0, start) +
          original.substring(end);
        break;
      case "Ins":
        for (let i = 0; i < sel.length; i++) {
          if (sel[i] > start) {
            sel[i] += change.content.length;
          }
        }

        original =
          original.substring(0, start) +
          change.content +
          original.substring(start);
        break;
      default:
        errorify(`Unsupported change kind: ${change.kind}`)
    }
  }
  return original
}

// Diffing and Patching Utilities

function count_chars_in_patches(patches) {
  return patches.reduce((a, b) => {
    var [start, end] = b.range.match(/\d+/g).map((x) => 1 * x)
    return a + count_code_points(b.content) + end - start
  }, 0)
}

function get_patches_for_diff(before, after) {
  let diff = diff_main(before, after)
  let patches = []
  let offset = 0
  for (let d of diff) {
    let p = null
    if (d[0] == 1) {
      p = { range: `[${offset}:${offset}]`, content: d[1] }
    } else if (d[0] == -1) {
      p = { range: `[${offset}:${offset + count_code_points(d[1])}]`, content: "" }
      offset += count_code_points(d[1])
    } else offset += count_code_points(d[1])
    if (p) {
      p.unit = "text"
      patches.push(p)
    }
  }
  return patches
}

function apply_patches_and_update_selection(text, patches, textarea) {
  patches = patches.map(p => ({ ...p, range: p.range.match(/\d+/g).map((x) => 1 * x) })).sort((a, b) => a.range[0] - b.range[0])

  // convert from code-points to js-indicies
  let c = 0;
  let i = 0;
  for (let p of patches) {
    while (c < p.range[0]) {
      const charCode = text.charCodeAt(i)
      i += (charCode >= 0xd800 && charCode <= 0xdbff) ? 2 : 1
      c++
    }
    p.range[0] = i

    while (c < p.range[1]) {
      const charCode = text.charCodeAt(i)
      i += (charCode >= 0xd800 && charCode <= 0xdbff) ? 2 : 1
      c++
    }
    p.range[1] = i
  }

  // convert from absolute to relative coordinates
  let offset = 0
  for (let p of patches) {
    p.range[0] += offset
    p.range[1] += offset
    offset -= p.range[1] - p.range[0]
    offset += p.content.length
  }

  // The textarea normalizes \r\n to \n and \r to \n, but last_text preserves \r's.
  // Compare and map selection positions from textarea space to last_text space.
  let { in_sync, sel } = compareNormalizedAndMapSel(
    textarea.value,
    text,
    [textarea.selectionStart, textarea.selectionEnd]
  )
  if (!in_sync) throw new Error("textarea out of sync somehow!")

  for (var p of patches) {
    let range = p.range

    // Update the cursor locations
    for (let i = 0; i < sel.length; i++) {
      if (sel[i] > range[0]) {
        if (sel[i] > range[1]) {
          sel[i] -= range[1] - range[0]
        } else sel[i] = range[0]
      }
    }

    for (let i = 0; i < sel.length; i++) {
      if (sel[i] > range[0]) {
        sel[i] += p.content.length
      }
    }

    // Update the text with the new value
    text = text.substring(0, range[0]) + p.content + text.substring(range[1])
  }

  // Convert sel back from text space to textarea space
  mapSelToNormalized(text, sel)

  textarea.value = text
  textarea.selectionStart = sel[0]
  textarea.selectionEnd = sel[1]

  return text
}

// Every merge type but dt hands the client a history already laid out in a
// straight line: each update is written against the one before it, either as a
// whole new document or as patches over ranges of the last one. Replaying it
// answers both questions a diff view asks -- what the text was at some point,
// and what a span of updates did to it -- without needing a CRDT to merge
// anything, which is the point of those merge types in the first place.
//
// `from` and `to` name updates by version. The span runs from just after
// `from` through the end of `to`, and the answer is the runs dt_diff_from
// returns. A history this cannot read as text gives null.
function replay_diff(versions, from, to) {
  let i = index_of_version(versions, from)
  let j = index_of_version(versions, to)
  if (i < 0 || j < 0 || j < i) return null

  let chars = replay_to(versions, i)
  if (!chars) return null
  let text = chars.join('')

  let ops = []
  for (let k = i + 1; k <= j; k++) {
    let step = update_ops(versions[k], chars)
    if (!step) return null
    // The history graph names an update by its version and colours it by the
    // first name in there, so its edits are attributed the same way and the
    // highlight matches the dot the update was selected by.
    let agent = ('' + versions[k].version).split('-')[0]
    for (let op of step) {
      ops.push({ ...op, agent })
      apply_op(chars, op)
    }
  }
  return diff_from_ops(text, ops)
}

// Where an update sits in the history. Searched from the end, because the
// spans people ask about are usually recent ones.
function index_of_version(versions, version) {
  let key = '' + version
  for (let i = versions.length - 1; i >= 0; i--)
    if ('' + versions[i].version === key) return i
  return -1
}

// How many updates apart the remembered texts below are.
var REPLAY_STEP = 256

// Replaying from the top for every question would walk the whole history each
// time the mouse moves, so the text is remembered every so often, and a
// question about a point in the history starts from the nearest memory at or
// before it. texts[k] is the text after the first k * REPLAY_STEP updates.
var replay_memory = { versions: null, n: 0, texts: [''] }

// Say that a history has stopped being the one that was replayed, so that
// nothing remembered about it gets used to answer a question about the new
// one. Updates are normally only ever added, which the memories survive; this
// is for the times something already in one is taken back out.
function forget_replayed_history() {
  replay_memory = { versions: null, n: 0, texts: [''] }
}

// The text as it stood after update `i`, as an array of code points, which is
// what patch positions count. The caller is free to walk it forwards.
function replay_to(versions, i) {
  let m = replay_memory
  // A history that has got shorter has had something taken out of it, and
  // whoever did that may not have said so.
  if (m.versions !== versions || versions.length < m.n) {
    forget_replayed_history()
    m = replay_memory
    m.versions = versions
  }
  m.n = versions.length

  let c = Math.min(m.texts.length - 1, Math.floor((i + 1) / REPLAY_STEP))
  let chars = [...m.texts[c]]
  for (let k = c * REPLAY_STEP; k <= i; k++) {
    let ops = update_ops(versions[k], chars)
    if (!ops) return null
    for (let op of ops) apply_op(chars, op)
    if ((k + 1) % REPLAY_STEP === 0) m.texts[(k + 1) / REPLAY_STEP] = chars.join('')
  }
  return chars
}

// What one update does to the text before it, as operations in code point
// positions. An update this cannot read as text gives null.
function update_ops(update, chars) {
  let patches = update.patches || []
  if (!patches.length) return []

  // A patch over the whole document says what the text becomes rather than
  // what moved, so what it changed is whatever a diff against the text finds.
  // Snapshot feeds are made entirely of these, and they are also how the first
  // update of a subscription arrives.
  if (patches.length === 1 && patches[0].range === '')
    return diff_ops(chars.join(''), '' + patches[0].content)

  if (!patches.every(p => p.unit === 'text' && /^\[\d+:\d+\]$/.test(p.range)))
    return null

  // Patch ranges are written against the text as it stood before the update,
  // so each patch shifts the ones after it along by what it changed.
  let ops = []
  let offset = 0
  let sorted = [...patches].sort((a, b) => parseInt(a.range.slice(1)) - parseInt(b.range.slice(1)))
  for (let p of sorted) {
    let [lo, hi] = p.range.match(/\d+/g).map(Number)
    let content = '' + (p.content ?? '')
    if (hi > lo) ops.push({ kind: 'Del', start: lo + offset, end: hi + offset })
    if (content) ops.push({ kind: 'Ins', start: lo + offset, content })
    offset += count_code_points(content) - (hi - lo)
  }
  return ops
}

// The operations that turn one text into another, at the positions they apply
// at. A deletion leaves the position where it was, since the text closes up
// behind it, and an insertion moves past what it wrote.
function diff_ops(before, after) {
  let ops = []
  let pos = 0
  for (let [what, run] of diff_main(before, after)) {
    let n = count_code_points(run)
    if (what === 0) pos += n
    else if (what === 1) { ops.push({ kind: 'Ins', start: pos, content: run }); pos += n }
    else ops.push({ kind: 'Del', start: pos, end: pos + n })
  }
  return ops
}

function apply_op(chars, op) {
  if (op.kind === 'Del') return void chars.splice(op.start, op.end - op.start)
  // Moved a piece at a time rather than spliced in, for the reason given over
  // the same thing in diff_from_ops.
  let tail = chars.splice(op.start, chars.length - op.start)
  for (let c of op.content) chars.push(c)
  for (let c of tail) chars.push(c)
}

async function braid_fetch_wrapper(url, params) {
  params.onFetch = (...args) => on_bytes_going_out(...args)
  params.onBytes = (x) => {
    on_bytes_received(x)
    set_subscription_online(true)
  }
  return await braid_fetch(url, params)
}

function count_code_points(str) {
  let code_points = 0;
  for (let i = 0; i < str.length; i++) {
    if (str.charCodeAt(i) >= 0xD800 && str.charCodeAt(i) <= 0xDBFF) i++;
    code_points++;
  }
  return code_points;
}

function index_to_codePoints(str, index) {
  let i = 0
  let c = 0
  while (i < index && i < str.length) {
    const charCode = str.charCodeAt(i)
    i += (charCode >= 0xd800 && charCode <= 0xdbff) ? 2 : 1
    c++
  }
  return c
}

function codePoints_to_index(str, codePoints) {
  let i = 0
  let c = 0
  while (c < codePoints && i < str.length) {
    const charCode = str.charCodeAt(i)
    i += (charCode >= 0xd800 && charCode <= 0xdbff) ? 2 : 1
    c++
  }
  return i
}


// // Open devtools to braid when hotkey is pressedn
// chrome.runtime.onMessage.addListener((message, sender, send_response) => {
//   if (message.action === 'openBraidPanel') 

function applyDomDiff(dest, diff) {
  let offsets = new Map()

  diff.forEach((change) => {
    let node = dest
    const [path, newValue] = [change.range, change.content]
    const indexes = []
    let insert_position = null
    path.replace(/\[(\d+)(?::(\d+))?\]/g, (_0, _1, _2) => {
      if (_2 != null) {
        insert_position = 1 * _2
      } else indexes.push(1 * _1)
    })

    if (indexes.length === 0) {
      // If there are no indicies, we assume we're deleting everything
      while (node.firstChild) node.removeChild(node.firstChild)
      offsets.set(node, 0)
      node.innerHTML = newValue
      return
    }

    if (insert_position == null) insert_position = indexes.pop()

    for (let i = 0; i < indexes.length; i++) {
      node = Array.from(node.childNodes)[indexes[i]]
    }

    const i = insert_position + (offsets.get(node) ?? 0)

    if (newValue) {
      let newElement = document.createElement("div")
      newElement.innerHTML = newValue
      newElement = newElement.firstChild

      if (i === node.childNodes.length) {
        // If the insertion index is equal to the number of child nodes,
        // append the new element as the last child
        node.appendChild(newElement)
      } else {
        // Otherwise, insert the new element at the specified index
        node.insertBefore(newElement, node.childNodes[i])
      }

      offsets.set(node, (offsets.get(node) ?? 0) + 1)
    } else {
      // If newValue is falsy, remove the child node at the specified index
      if (i >= node.childNodes.length) throw "bad"
      node.removeChild(node.childNodes[i])
      offsets.set(node, (offsets.get(node) ?? 0) - 1)
    }
  })
}

function make_linklist() {
  let self = {
    next: null,
    last: null,
    size: 0,
  }

  self.push = x => {
    if (self.last) self.last.next = x
    else self.next = x
    x.prev = self.last
    x.next = null
    self.last = x

    self.size++
  }

  self.remove = x => {
    if (x.removed) return
    x.removed = true

    if (x.prev) x.prev.next = x.next
    else self.next = x.next

    if (x.next) x.next.prev = x.prev
    else self.last = x.prev

    self.size--
  }

  self.remove_before = x => {
    let current = self.next
    let itemsRemoved = 0

    while (current !== x && current !== null) {
      current.removed = true
      itemsRemoved++
      current = current.next
    }

    if (current === x) {
      x.prev = null
      self.next = x
      self.size -= itemsRemoved
    } else throw 'not found'
  }

  return self
}

function is_access_denied(e) {
  return e?.message?.match(/access denied/)
}

function make_html(html) {
  let x = document.createElement('div')
  x.innerHTML = html
  return x.firstChild
}

// Ask the background for this navigation's headers. It also volunteers them on
// tabs.onUpdated, but Firefox can report 'complete' before onHeadersReceived
// has run, and then it has nothing to send. We are only running at all because
// the headers already arrived, so asking now always finds them.
chrome.runtime.sendMessage({ cmd: 'ready' })

// Going back to a page can hand the same document back rather than making a
// new one: no request goes out, no headers come in, and this script -- still
// here from last time -- never runs again. So none of the above happens, and
// devtools would go on showing the history of the page you just left. The
// document still has its own, and says it again.
window.addEventListener('pageshow', e => {
  if (e.persisted)
    send_dev_message({ action: "init", headers, versions, raw_messages, get_failed })
})
