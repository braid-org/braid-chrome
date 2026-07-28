// Error handling
window.onerror = function (message, source, lineno, colno, error) {
    const errorContainer = document.getElementById('error-container');
    const errorMessageElement = document.getElementById('error-message');
    errorMessageElement.textContent = error.stack;
    errorContainer.style.display = 'block';
};

let versions = []

// The panel keeps its own copy of the document. History arrives as dt bytes
// -- a few hundred kilobytes for a document whose expanded patches would be
// megabytes -- and every question about it is then answered locally, with no
// messaging between the panel and the page.
let dt_doc = null
let dt_ready = null
function ensure_dt() {
    if (!dt_ready) dt_ready = fetch('dt_bg.wasm')
        .then(r => r.arrayBuffer())
        .then(buf => { initSync({ module: buf }) })
    return dt_ready
}
function reset_dt_doc() {
    if (dt_doc) try { dt_doc.free() } catch (e) {}
    dt_doc = null
}
let raw_messages = []
let headers = {}
let get_failed = ''

let last_version = ''
let last_parents = ''

let backgroundConnection = null

window.onload = function () {
    connect()
};

window.onresize = () => update()

function connect() {
    backgroundConnection = chrome.runtime.connect({ name: "braid-devtools-panel" })
    backgroundConnection.onMessage.addListener(add_message)

    backgroundConnection?.postMessage({ cmd: 'init', tab_id: chrome.devtools.inspectedWindow.tabId })

    function rerequest() {
        backgroundConnection?.postMessage({ cmd: "rerequest", content_type: content_type_select.value, merge_type: merge_type_select.value, subscribe: subscribe_request.checked, encoding_dt: encoding_request.checked, ...(version_request.value ? { version: version_request.value } : {}), ...(parents_request.value ? { parents: parents_request.value } : {}), edit_source: edit_source.checked });

        last_version = version_request.value
        last_parents = parents_request.value
        get_failed = ''
        update()
        update_show_resubmit()
    }

    resubmit_button.onclick = rerequest
    content_type_select.onchange = rerequest
    merge_type_select.onchange = () => { update_encoding_enabled(); rerequest() }
    encoding_request.onchange = rerequest
    update_encoding_enabled()

    backgroundConnection.onDisconnect.addListener(() => setTimeout(connect, 500));

    id_raw_messages.onchange = () => { update_time_travel_enabled(); update() }
    id_time_travel.onchange = toggle_time_travel
    id_show_deletions.onchange = () => show_span_diff()
    update_time_travel_enabled()

    subscribe_request.onchange = () => {
        if (subscribe_request.checked) {
            version_request.value = ''
            parents_request.value = ''
        }
        rerequest()
    }

    version_request.oninput = update_show_resubmit
    parents_request.oninput = update_show_resubmit
    update_show_resubmit()

    function update_show_resubmit() {
        if (version_request.value || parents_request.value) {
            subscribe_request.checked = false
            subscribe_request.disabled = true
        } else {
            subscribe_request.disabled = false
        }

        resubmit_button.style.display = (last_version != version_request.value || last_parents != parents_request.value) ? 'block' : 'none'
    }

    edit_source.oninput = () => {
        if (edit_source.checked) backgroundConnection?.postMessage({ cmd: "edit_source" })
        else rerequest()
    }

}

function add_message(message) {
    // Handle message from content script here
    //   console.log("Received message in devtools:", message);

    if (message.action == 'init') {
        // A new sync replaces the history rather than adding to it. The old
        // document has to go with it: keeping it would merge two unrelated
        // histories into one graph, and would leave the incoming history with
        // nothing new to report.
        reset_dt_doc()
        versions = message.versions
        raw_messages = message.raw_messages
        if (message.headers) headers = message.headers
        get_failed = message.get_failed
        update()

    } else if (message.action == 'new_version') {
        if (message.remove_count) versions.splice(versions.length - message.remove_count, message.remove_count)
        if (message.remove_version) {
            for (let i = versions.length - 1; i >= 0; i--) {
                if (versions[i].version.length === message.remove_version.length && versions[i].version.every((v, i) => v === message.remove_version[i])) {
                    versions.splice(i, 1)
                    break
                }
            }
        }
        if (message.version) versions.push(message.version)
        // A history dump arrives as one message holding many versions, rather
        // than a message each, so the view is built once instead of per row
        if (message.batch) for (let v of message.batch) versions.push(v)
        if (message.override_versions) versions = message.override_versions
        // Only rebuild the view that shows versions. The raw view catches
        // up when its checkbox toggles, which calls update() itself
        if (!id_raw_messages.checked) update()
    } else if (message.action == 'dt_history') {
        // A chunk of history in raw dt bytes. Merging it here and expanding it
        // here costs one message, instead of one per version it contains.
        ensure_dt().then(() => {
            if (!dt_doc) dt_doc = new Doc('panel')
            let bytes = Uint8Array.from(atob(message.bytes), c => c.charCodeAt(0))
            let before = dt_doc.getRemoteVersion().map(x => x.join('-')).sort()
            dt_doc.mergeBytes(bytes)
            for (let u of dt_doc.getUpdates(before.length ? before : null))
                versions.push({ method: "GET", version: u.version,
                                parents: u.parents, patches: u.patches })
            if (!id_raw_messages.checked) update()
        }).catch(e => console.error('dt_history failed:', e))
    } else if (message.action == 'new_headers') {
        headers = message.headers
        update()
    } else if (message.action == 'braid_in' || message.action == 'braid_out') {
        raw_messages.push(message.data)
        if (id_raw_messages.checked) update()
    } else if (message.action == 'get_failed') {
        get_failed = message.get_failed
        update()
    }
}

let update_requested = false
function update() {
    if (!update_requested) {
        update_requested = true
        requestAnimationFrame(() => {
            update_requested = false
            raw_update()
        })
    }
}

function raw_update() {
    let was_scrolled_to_bottom = isScrolledToBottom(id_messages)

    for (let [k, v] of Object.entries({
        'subscribe': 'subscribe_response',
        'encoding': 'encoding_response',
        'version': 'version_response',
        'parents': 'parents_response',
        'merge-type': 'merge_type_response',
    })) {
        // Version ids are quoted on the wire; display them bare
        window[v].textContent = (headers[k] ?? '').replace(/"/g, '')
    }
    var full_content_type = headers['repr-type'] ?? headers['content-type'] ?? ''
    // application/http-history frames the subscription; it is not the repr
    if (full_content_type.startsWith('application/http-history')) full_content_type = ''
    window.content_type_response.textContent = full_content_type.split(';')[0].trim()
    window.content_type_response.title = full_content_type
    window.subscribe_response.textContent = '' + (headers.subscribe != null)
    update_encoding_enabled()

    window.error_d_label.style.display = get_failed ? 'inline' : 'none'
    window.error_d.textContent = get_failed

    edit_source_d.style.display = (headers['repr-type'] ?? headers['content-type'])?.startsWith('text/html') ? 'flex' : 'none'

    if (!id_raw_messages.checked && versions?.length) {
        layout_history()
        render_history_window()
    } else if (id_raw_messages.checked && raw_messages?.length) {
        // Whatever was there is replaced, so the geometry describing it goes
        layout = null
        id_messages.innerHTML = ''
        id_messages.style.display = 'block'

        let d = document.createElement('pre')
        d.textContent = raw_messages.join('')
        //d.style.background = `rgb(41,42,45)`
        d.style.borderRadius = '3px'
        d.style.margin = '3px'
        d.style.padding = '3px'
        d.style.textWrap = 'wrap'

        id_messages.append(d)
    } else {
        layout = null
        id_messages.innerHTML = ''
        let d = document.createElement('div')
        d.textContent = 'nothing to show'
        d.style.cssText = `margin:10px`
        id_messages.append(d)
    }

    if (was_scrolled_to_bottom) {
        id_messages.scrollTop = id_messages.scrollHeight
        if (layout) render_history_window()
    }
    if (!layout) update_time_travel()
}

// dt binary encoding only applies to the dt merge-type, whether chosen
// in the menu or served as the page's default
function update_encoding_enabled() {
    encoding_request.disabled = !(merge_type_select.value === 'dt' ||
                                  headers['merge-type'] === 'dt')
}

function isScrolledToBottom(element) {
    // An unscrollable view counts as at-the-top, not at-the-bottom
    return element.scrollHeight > element.clientHeight
        // Fractional scroll positions (from display scaling) never compare
        // exactly equal, so allow a couple pixels of slop
        && element.scrollHeight - element.scrollTop - element.clientHeight < 3;
}

// The history view can run to tens of thousands of versions, which is far more
// than a browser will lay out at any comfortable speed. So the geometry of the
// whole history is worked out in plain arrays, and only the rows that fall
// inside the scroll viewport are ever put into the DOM.
//
// Rows are not all the same height, because a patch's content wraps over as
// many lines as it needs. Nothing is measured off the page to find out how
// many: the content column is monospace and breaks at exactly the column
// edge, so the line count follows from the string and the column width. Row
// tops are then a running total, and the rows crossing the viewport are found
// by binary search.
// Leading within a row, at about 1.4x the monospace size the browser picks.
// Lines of one patch should read as one block.
const LINE_H = 18
// The gutter between rows. Separation between versions comes from this rather
// than from stretching the leading, so a multi-line patch stays a paragraph.
const ROW_PAD = 10
const HEADER_H = 34
// The proportional face the version identifiers are drawn in
const LABEL_FONT = 'font-family:Arial,sans-serif;font-size:medium;'
const LANE_W = 64
// Room either side of the version DAG. The DAG column doubles as the region a
// span of time is dragged out of, so it gets a little space to grab hold of.
const LANE_PAD = 10
const DAG_W = LANE_PAD + LANE_W + LANE_PAD
const DOT_R = 6
// Rows kept rendered past each edge of the viewport, so that a small scroll
// reveals rows that are already there.
const OVERSCAN_PX = 250
// One string for the monospace cells, shared by the measuring and the drawing
const MONO = 'font-family:monospace'

// The selected span of time, as a pair of indices into layout.vs, inclusive
// and in either order until it is normalized. A click selects the span across
// a single version, which is the degenerate case of the same gesture.
let span = null
// A drag in progress: which end of the span is following the mouse
let drag = null
// The version the time-travel line is crossing, when the line is on. The span
// follows it, so this only records what the line last landed on.
let travelling_vi = null

// What the last layout pass worked out. Everything the renderer needs to draw
// any row, without consulting the DOM or the version list again.
let layout = null

function esc(s) {
    return ('' + s).replace(/[&<>"]/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
}

// The width a string takes in a given style. Used a handful of times per
// layout, on the longest string in each column, to fix the column widths.
// Widths have to be fixed: a table that sizes its columns to their contents
// would need every row in the DOM, which is the thing we are avoiding.
function measure_text(text, style) {
    let d = document.createElement('div')
    d.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;' + style
    d.textContent = text
    document.body.append(d)
    let w = d.offsetWidth
    d.remove()
    return w
}

function longest(strings) {
    let best = ''
    for (let s of strings) if (s && s.length > best.length) best = s
    return best
}

// A pass over the history builds the geometry of every row. That pass is
// linear, and on a large document it is long enough to be felt, so it is not
// redone when all that has happened is that versions were appended: the state
// it works from lives in the layout object, and a later pass picks it up where
// the previous one stopped. Anything else -- a new sync, a resize, a version
// too wide for the columns it was laid out against -- starts over.
function new_layout() {
    return {
        src: versions, n_consumed: 0,
        vs: [], seen: Object.create(null), leaves: new Set(),
        rows: [], row_tops: [HEADER_H], row_of: [], circles: [], edges: [],
        version_xs: {}, version_ys: {}, v_to_multiv: {}, actor_to_seqs: {},
        actor_to_color: {}, actor_color_angles: [],
        last_x: 0.5, last_v: '',
        cols: null, char_w: 0, per_line: 1, widest: { version: '', unit: '', range: '' },
        // What the imaginary tip added, so it can be taken off again
        merge: null,
    }
}

function layout_history() {
    let L = layout
    // Appending to the same array is the case worth continuing from. A new
    // array means a new sync, and nothing carries over.
    if (!(L && L.src === versions && versions.length >= L.n_consumed)) L = null

    if (L) {
        remove_final_merge(L)
        // A version wider than the columns it would be laid out against
        // shifts every row that came before it, so that pass is abandoned.
        if (!extend_layout(L)) L = null
    }
    if (!L) {
        L = new_layout()
        measure_columns(L)
        extend_layout(L)
    }
    add_final_merge(L)
    L.height = L.row_tops[L.rows.length]
    layout = L
}

// Column widths are fixed. A table that sized its columns to their contents
// would need every row in the DOM, which is the thing being avoided here.
function measure_columns(L) {
    let label_style = LABEL_FONT
    L.widest = {
        version: longest(versions.map(v => '' + v.version || 'root')),
        unit: longest(versions.flatMap(v => v.patches.map(p => p.unit))) || 'text',
        range: longest(versions.flatMap(v => v.patches.map(p => range_text(p)))) || '000:000',
    }
    L.cols = {
        version: measure_text(L.widest.version, label_style) + 10,
        unit: measure_text(L.widest.unit, MONO) + 18,
        range: measure_text(L.widest.range, MONO) + 18,
    }

    // The column has to fit the longest identifier in the document, but the
    // band should hug what is typically on screen, so that one unusually long
    // peer name does not stretch it out across empty space. Sample identifiers
    // across the history, measure what they actually render as, and take a
    // high percentile of that. Ranking by string length would not do: seq
    // numbers gain digits as a document grows, so most identifiers end up at
    // the longest length and the percentile lands on the maximum anyway.
    let step = Math.max(1, Math.floor(versions.length / 100))
    let widths = []
    for (let i = 0; i < versions.length; i += step)
        widths.push(measure_text('' + versions[i].version || 'root', LABEL_FONT))
    widths.sort((a, b) => a - b)
    L.band_w = DAG_W + Math.min(L.cols.version,
                                (widths[Math.floor(widths.length * 0.9)] || 0) + 8)

    // How many characters fit across the content column, and so how many
    // lines a given string of content will take.
    L.char_w = measure_text('0'.repeat(100), MONO) / 100
    let content_w = Math.max(60, (id_messages.clientWidth || 800)
        - LANE_W - L.cols.version - L.cols.unit - L.cols.range - 14 - 24)
    L.per_line = Math.max(1, Math.floor(content_w / L.char_w))
}

function range_text(p) {
    return p.unit == 'text' ? p.range.slice(1, -1) : p.range
}

// Whether a version still fits the columns. Only a string longer than the
// longest one seen so far can fail, so measuring is rare.
function fits_columns(L, v) {
    let check = (col, str, style, slack) => {
        if (!str || str.length <= L.widest[col].length) return true
        if (measure_text(str, style) + slack > L.cols[col]) return false
        L.widest[col] = str
        return true
    }
    if (!check('version', '' + v.version || 'root',
               'font-family:Arial,sans-serif;font-size:medium;', 10)) return false
    for (let p of v.patches) {
        if (!check('unit', p.unit, MONO, 18)) return false
        if (!check('range', range_text(p), MONO, 18)) return false
    }
    return true
}

function line_count(L, content) {
    if (!content) return 1
    let n = 0
    for (let line of content.split('\n'))
        n += Math.max(1, Math.ceil(line.length / L.per_line))
    return n
}

// Parents name individual events, but a row can cover a run of them, so a
// named parent has to be resolved to the row that actually contains it.
function get_real_event(L, e) {
    try {
        let [actor, seq] = decode_version(e)
        let seqs = L.actor_to_seqs[actor]
        if (!seqs?.length) return
        let lo = 0, hi = seqs.length
        while (lo < hi) {
            let mid = (lo + hi) >> 1
            if (seqs[mid] < seq) lo = mid + 1
            else hi = mid
        }
        if (lo < seqs.length) return actor + '-' + seqs[lo]
    } catch (e) {}
}

function get_real_parents(L, parents) {
    if (!parents?.length) return { '': true }
    let real_parents = {}
    for (let p of parents) {
        let real_p = get_real_event(L, p)
        if (!real_p) continue
        let unchanged = real_p === p
        real_p = L.v_to_multiv[real_p]
        if (!real_p) continue
        real_parents[real_p] = unchanged
    }
    return real_parents
}

function extend_layout(L) {
    for (let i = L.n_consumed; i < versions.length; i++) {
        let v = versions[i]
        let v_string = '' + v.version
        // The same version can arrive more than once; show it once.
        if (L.seen[v_string]) continue
        if (!fits_columns(L, v)) return false
        L.seen[v_string] = true

        L.leaves.add(v_string)
        if (v.parents) {
            for (let p of v.parents) L.leaves.delete(p)
            L.leaves.delete('' + v.parents)
        }
        place(L, v, v_string)
    }
    L.n_consumed = versions.length
    return true
}

// Give a version its rows, its column in the lanes, and the edges up to its
// parents.
function place(L, v, v_string) {
    let i = L.vs.length
    L.vs.push(v)

    let actor = v_string.split('-')[0]
    if (!L.actor_to_color[actor]) {
        let angle = get_new_angle(L.actor_color_angles)
        L.actor_color_angles.push(angle)
        L.actor_to_color[actor] = angle_to_color(angle)
    }
    let color = L.actor_to_color[actor]

    // A version takes one row per patch, and at least one row even when it has
    // no patches at all. row_tops[r] is the top of row r, and one past the end
    // is the bottom of the last row.
    L.row_of[i] = L.rows.length
    let ps = v.patches
    let add_row = (pi, lines) => {
        L.rows.push({ vi: i, pi })
        L.row_tops.push(L.row_tops[L.rows.length - 1] + LINE_H * lines + ROW_PAD)
    }
    if (!ps.length) add_row(0, 1)
    else for (let k = 0; k < ps.length; k++) add_row(k, line_count(L, ps[k].content))

    // A version whose only parent is the version just above it stays in the
    // same column; anything else steps sideways by an amount derived from its
    // own name, so a branch keeps its column for as long as it runs.
    let real_parents = get_real_parents(L, v.parents)
    let rpa = Object.keys(real_parents)
    let x
    if (rpa.length === 1 && rpa[0] === L.last_v) {
        x = L.last_x
    } else {
        x = L.last_x + 0.25 + fastHashToUnit(v_string) * 0.5
        if (x > 1) x -= 1
    }
    L.last_v = v_string
    L.version_xs[v_string] = L.last_x = x

    let y = L.row_tops[L.row_of[i]] + ROW_PAD / 2 + (LINE_H - 2 * DOT_R) / 2
    L.version_ys[v_string] = y
    L.circles.push({ x, y, color })

    if (i) for (let [pv, unchanged] of Object.entries(real_parents)) {
        let py = L.version_ys[pv]
        if (py == null) continue
        L.edges.push({
            x, px: L.version_xs[pv], color, dashed: !unchanged,
            top: py + DOT_R, h: Math.max(1, y - py),
        })
    }

    if (v.version !== 'final merge')
        for (let e of v.version) {
            L.v_to_multiv[e] = v_string
            try {
                let [a, seq] = decode_version(e)
                if (!L.actor_to_seqs[a]) L.actor_to_seqs[a] = []
                sorted_insert(L.actor_to_seqs[a], seq)
            } catch (err) {}
        }
}

// A history with more than one leaf has no single tip to draw the lanes into,
// so it gets an imaginary one that merges them. It depends on the whole leaf
// set, so each pass takes off the one the pass before it added.
function add_final_merge(L) {
    if (L.leaves.size <= 1) return
    L.merge = { vs: L.vs.length, rows: L.rows.length, edges: L.edges.length,
                last_x: L.last_x, last_v: L.last_v }
    place(L, { version: 'final merge', parents: [...L.leaves], patches: [] }, 'final merge')
}

function remove_final_merge(L) {
    let m = L.merge
    if (!m) return
    L.vs.length = L.row_of.length = L.circles.length = m.vs
    L.rows.length = m.rows
    L.row_tops.length = m.rows + 1
    L.edges.length = m.edges
    L.last_x = m.last_x
    L.last_v = m.last_v
    delete L.version_xs['final merge']
    delete L.version_ys['final merge']
    L.merge = null
}

// Dragging out a span of time in the gutter. A fresh drag on empty gutter
// starts a new span; grabbing an edge moves that edge; grabbing the body
// slides the whole span while keeping its length.
function install_gutter(body) {
    let gutter = document.getElementById('history_gutter')
    let autoscroll = null, autoscroll_timer = null

    let y_of = (e) => e.clientY - body.getBoundingClientRect().top

    gutter.onmousedown = (e) => {
        if (!layout) return
        e.preventDefault()
        let vi = version_at(y_of(e))
        let handle = e.target.dataset?.grip
        if (handle === 'top') drag = { mode: 'edge', cursor: 'ns-resize',
                                      anchor: Math.max(span.a, span.b), y: e.clientY }
        else if (handle === 'bottom') drag = { mode: 'edge', cursor: 'ns-resize',
                                              anchor: Math.min(span.a, span.b), y: e.clientY }
        else if (handle === 'body') drag = { mode: 'move', cursor: 'grabbing', from: vi,
                                            y: e.clientY, a: span.a, b: span.b }
        else {
            // Drawing a new span is dragging its far edge outwards
            drag = { mode: 'edge', cursor: 'ns-resize', anchor: vi, y: e.clientY }
            select_span(vi, vi)
        }
        document.body.style.cursor = drag.cursor
        autoscroll_timer = setInterval(autoscroll, 16)
        // The grips carry their own cursors, which outrank anything set on an
        // ancestor, so pressing the button has to draw again for the hand to
        // close. Waiting for the first movement would leave it open on a press
        // that never turns into a drag.
        render_history_window()
    }

    document.addEventListener('mousemove', (e) => {
        if (!drag || !layout) return
        drag.y = e.clientY
        let vi = version_at(y_of(e))
        if (drag.mode === 'edge') select_span(drag.anchor, vi)
        else {
            // Slide both ends by the same amount, stopping at the ends of
            // history rather than letting the span shorten against them
            let lo = Math.min(drag.a, drag.b), hi = Math.max(drag.a, drag.b)
            let shift = Math.max(-lo, Math.min(vi - drag.from, layout.vs.length - 1 - hi))
            select_span(lo + shift, hi + shift)
        }
    })

    document.addEventListener('mouseup', () => {
        if (!drag) return
        drag = null
        document.body.style.cursor = ''
        clearInterval(autoscroll_timer)
        // The gutter and its grips take their cursors from whether a drag is
        // running, and that is decided at render time, so ending one has to
        // draw again or the cursor of the finished drag stays on screen.
        render_history_window()
    })

    // Dragging above or below the view scrolls it, so a span can reach further
    // than one screenful. The speed grows with how far past the edge the mouse
    // has gone, the way selecting text does.
    autoscroll = () => {
        if (!drag || !layout) return
        let r = id_messages.getBoundingClientRect()
        let over = drag.y < r.top ? drag.y - r.top
                 : drag.y > r.bottom ? drag.y - r.bottom : 0
        if (!over) return
        id_messages.scrollTop += Math.sign(over) * Math.min(40, 4 + Math.abs(over) / 4)
        let vi = version_at(drag.y - body.getBoundingClientRect().top)
        if (drag.mode === 'edge') select_span(drag.anchor, vi)
        else render_history_window()
    }
}

// The span, normalized, or null. Selecting is separated from acting on the
// selection so that dragging can update the highlight on every mouse move
// without asking the page to redraw a diff each time.
// `from_line` marks a span the scroll line placed. Anything else is the user
// placing one by hand, which takes the line's job away from it.
function select_span(a, b, from_line) {
    span = a == null ? null : { a, b }
    if (!from_line && id_time_travel.checked) {
        id_time_travel.checked = false
        travelling_vi = null
    }
    show_span_diff()
    render_history_window()
}

// What the span changed: the text as it stood before its first version,
// marked up with everything its versions inserted and deleted. A span of one
// version therefore answers "what did this edit do?".
let last_diff = '', diff_queued = false
function show_span_diff() {
    // Dropping the span is a one-off, and has to reach the page before the
    // time-travel text that follows it, so it does not wait for a frame.
    // Dragging is the opposite: it fires faster than the display refreshes,
    // so those are coalesced.
    if (!span) return send_span_diff()
    if (diff_queued) return
    diff_queued = true
    requestAnimationFrame(() => { diff_queued = false; send_span_diff() })
}

function send_span_diff() {
    if (!span) {
        if (last_diff === '') return
        last_diff = ''
        return backgroundConnection?.postMessage({ cmd: 'show_diff', from_version: null })
    }
    let lo = Math.min(span.a, span.b), hi = Math.max(span.a, span.b)
    let before = layout.vs[lo].parents?.length ? layout.vs[lo].parents
                                               : layout.vs[lo].version
    let key = lo + ':' + hi + ':' + id_show_deletions.checked
    if (key === last_diff) return
    last_diff = key
    let digits = layout.vs[hi].patches?.[0]?.range?.match(/\d+/)
    backgroundConnection?.postMessage({
        cmd: "show_diff",
        from_version: before,
        to_version: layout.vs[hi].version,
        colors: layout.actor_to_color,
        show_deletions: id_show_deletions.checked,
        at: digits ? 1 * digits[0] : null,
    })
}

function toggle_time_travel() {
    // Forget where the line last was, so switching it on takes hold of the
    // span again rather than deciding nothing has moved.
    travelling_vi = null
    update_time_travel()
}

function update_time_travel_enabled() {
    // Raw messages replace the history view altogether, so there is nothing
    // to scroll through and the checkbox has no meaning.
    let off = id_raw_messages.checked
    id_time_travel.disabled = off
    id_time_travel_label.style.opacity = off ? 0.4 : 1
    if (off && id_time_travel.checked) id_time_travel.checked = false
}

// The dashed line sits across the middle of the view, and the span follows it:
// whichever version crosses the line is the one selected, so scrolling the
// history plays the document back one edit at a time. What you see of it is
// then the same thing a hand-placed span shows.
function update_time_travel() {
    let line = document.getElementById('history_line')
    if (!line) return
    update_time_travel_enabled()
    if (!id_time_travel.checked || id_time_travel.disabled || !layout) {
        line.style.display = 'none'
        travelling_vi = null
        return
    }

    let mid = id_messages.scrollTop + id_messages.clientHeight / 2
    line.style.display = 'block'
    line.style.top = mid + 'px'

    let vi = version_at(mid)
    if (vi === travelling_vi) return
    travelling_vi = vi
    select_span(vi, vi, true)
}

function version_top(vi) { return layout.row_tops[layout.row_of[vi]] }
function version_bottom(vi) {
    return layout.row_tops[vi + 1 < layout.vs.length
        ? layout.row_of[vi + 1] : layout.rows.length]
}

// The version covering a point on the page, clamped to the ends.
function version_at(y) {
    let tops = layout.row_tops
    let lo = 0, hi = layout.rows.length - 1
    while (lo < hi) {
        let mid = (lo + hi) >> 1
        if (tops[mid + 1] <= y) lo = mid + 1
        else hi = mid
    }
    return layout.rows[lo].vi
}

// The rows and lane segments that fall inside the viewport, and nothing else.
// Everything is written as one string of HTML per container: setting innerHTML
// once is far cheaper than appending a few hundred nodes one at a time.
function render_history_window() {
    if (!layout) return

    let { vs, rows, row_of, row_tops, circles, edges, cols, actor_to_color } = layout

    let body = document.getElementById('history_body')
    if (!body) {
        id_messages.style.display = 'block'
        id_messages.style.position = 'relative'
        id_messages.innerHTML =
            `<div id="history_body" style="position:relative">` +
            `<div id="history_band" style="position:absolute;left:0;top:0;` +
            `height:100%;pointer-events:none"></div>` +
            `<div id="history_lanes" style="position:absolute;left:${LANE_PAD}px;top:0;` +
            `width:${LANE_W}px;height:100%;pointer-events:none"></div>` +
            `<div id="history_rows"></div>` +
            `<div id="history_gutter" style="position:absolute;left:0;top:0;` +
            `height:100%;cursor:ns-resize;z-index:1"></div>` +
            `<div id="history_line" style="position:absolute;left:0;right:0;height:0;` +
            `border-top:1px dashed #e08b00;display:none;pointer-events:none;z-index:2"></div>` +
            `</div>`

        body = document.getElementById('history_body')

        // The rows themselves are ordinary selectable text, so that a range or
        // a piece of content can be copied out. Clicking among them, without
        // having selected any of that text, drops the span.
        body.onclick = (e) => {
            if (e.target.closest?.('#history_gutter')) return
            if (window.getSelection?.().toString()) return
            select_span(null, null)
        }
        install_gutter(body)
        id_messages.onscroll = () => {
            if (scroll_render_queued) return
            scroll_render_queued = true
            requestAnimationFrame(() => {
                scroll_render_queued = false
                render_history_window()
            })
        }
    }
    body.style.height = layout.height + 'px'

    let y_top = id_messages.scrollTop - OVERSCAN_PX
    let y_bot = id_messages.scrollTop + id_messages.clientHeight + OVERSCAN_PX

    let lo = 0, hi = rows.length - 1
    while (lo < hi) {
        let mid = (lo + hi) >> 1
        if (row_tops[mid + 1] <= y_top) lo = mid + 1
        else hi = mid
    }
    let first = lo
    let last = first
    while (last < rows.length && row_tops[last] < y_bot) last++

    let x0 = DAG_W
    let h = [`<div style="position:absolute;top:12px;left:${x0}px;color:#555">Version</div>`,
             `<div style="position:absolute;top:12px;left:${x0 + cols.version}px;color:#555">Range</div>`,
             `<div style="position:absolute;top:12px;left:${x0 + cols.version + cols.unit + cols.range + 14}px;color:#555">Content</div>`]

    for (let r = first; r < last; r++) {
        let { vi, pi } = rows[r]
        let v = vs[vi]
        let v_string = '' + v.version
        let color = actor_to_color[v_string.split('-')[0]]
        h.push(`<div data-vi="${vi}" style="position:absolute;left:0;right:0;` +
               `top:${row_tops[r] + ROW_PAD / 2}px;` +
               `height:${row_tops[r + 1] - row_tops[r] - ROW_PAD}px;display:flex;align-items:flex-start;` +
               `line-height:${LINE_H}px;white-space:pre">`)
        h.push(`<div style="width:${DAG_W}px;flex:none"></div>`)
        // Only the first row of a version is labelled; the rest of its patches
        // line up underneath it.
        let label = pi === 0 ? esc(v_string || 'root') : ''
        if (label && vi === travelling_vi)
            label = `<span style="background:${color};color:white;padding:0 3px;` +
                    `border-radius:2px">${label}</span>`
        h.push(`<div style="width:${cols.version}px;flex:none;color:${color};` +
               `overflow:hidden;text-overflow:ellipsis">${label}</div>`)

        let patch = v.patches[pi]
        if (!patch) {
            h.push(`</div>`)
            continue
        }
        let range = patch.unit == 'text' ? patch.range.slice(1, -1) : patch.range
        h.push(`<div style="width:${cols.unit}px;flex:none"><span style="color:black;background:rgb(245,245,245);` +
               `${MONO};padding:2px 4px;border-radius:3px">${esc(patch.unit)}</span></div>`)
        h.push(`<div style="width:${cols.range}px;flex:none;${MONO}">${esc(range)}</div>`)
        h.push(`<div style="width:14px;flex:none">=</div>`)
        if (patch.content != null && patch.content !== '') {
            // break-all rather than wrapping at spaces, so that where the text
            // breaks matches the line count the layout worked out
            h.push(`<div style="flex:0 1 auto;min-width:0;color:black;background:rgb(245,245,245);` +
                   `${MONO};padding:0 4px;border-radius:3px;` +
                   `white-space:pre-wrap;word-break:break-all">` + esc(patch.content) + `</div>`)
        } else {
            let nums = patch.range.match(/\d+/g)?.map(x => 1 * x)
            if (nums && nums.length == 2 && nums[0] != nums[1])
                h.push(`<div style="flex:none;height:${LINE_H}px;display:flex;align-items:center">` +
                       `<span style="background:rgb(241,64,42);color:white;font-size:xx-small;` +
                       `padding:2px 3px;border-radius:3px;line-height:normal">deleted</span></div>`)
        }
        h.push(`</div>`)
    }
    document.getElementById('history_rows').innerHTML = h.join('')

    // Lanes. A circle is drawn when its row is on screen; an edge is drawn
    // whenever its span crosses the viewport, which for a merge reaching far
    // back means it is drawn long after its own row has scrolled away.
    let g = []
    for (let e of edges) {
        if (e.top > y_bot || e.top + e.h < y_top) continue
        g.push(`<svg height="${e.h}px" width="${LANE_W}px" style="position:absolute;top:${e.top}px;left:0">` +
               `<line x1="${DOT_R + e.x * (LANE_W - 2 * DOT_R)}" y1="100%" ` +
               `x2="${DOT_R + e.px * (LANE_W - 2 * DOT_R)}" y2="0%" stroke="${e.color}" ` +
               `stroke-width="1" ${e.dashed ? 'stroke-dasharray="3,3"' : ''} /></svg>`)
    }
    for (let i = first; i < last; i++) {
        let vi = rows[i].vi
        if (rows[i].pi !== 0) continue
        let c = circles[vi]
        g.push(`<svg height="${DOT_R * 2}" width="${DOT_R * 2}" style="position:absolute;` +
               `top:${c.y}px;left:${c.x * (LANE_W - 2 * DOT_R)}px">` +
               `<circle cx="50%" cy="50%" r="50%" stroke-width="0" fill="${c.color}" /></svg>`)
    }
    document.getElementById('history_lanes').innerHTML = g.join('')

    // The gutter's selection, drawn once rather than per row. It reaches
    // across the DAG and the version identifiers next to it, which are the
    // two columns that say *when* rather than *what*.
    let gutter = document.getElementById('history_gutter')
    let band = document.getElementById('history_band')
    gutter.style.width = band.style.width = layout.band_w + 'px'
    gutter.style.cursor = drag ? drag.cursor : 'ns-resize'
    // Mid-drag the grips take the cursor of the drag, so that the band
    // arriving under the mouse does not change what it says.
    let grip = c => drag ? 'inherit' : c
    let sel = '', swash = ''
    if (span) {
        let lo = Math.min(span.a, span.b), hi = Math.max(span.a, span.b)
        let top = version_top(lo), bot = version_bottom(hi)
        let height = Math.max(2, bot - top)
        swash = `<div style="position:absolute;left:0;right:0;top:${top}px;` +
                `height:${height}px;background:rgba(255,249,105,0.42);` +
                `border-top:2px solid rgba(240,226,95,0.85);` +
                `border-bottom:2px solid rgba(240,226,95,0.85)"></div>`
        sel = `<div data-grip="body" style="position:absolute;left:0;right:0;` +
              `top:${top}px;height:${height}px;cursor:${grip('grab')}"></div>` +
              `<div data-grip="top" style="position:absolute;left:0;right:0;` +
              `top:${top - 4}px;height:10px;cursor:${grip('ns-resize')}"></div>` +
              `<div data-grip="bottom" style="position:absolute;left:0;right:0;` +
              `top:${bot - 6}px;height:10px;cursor:${grip('ns-resize')}"></div>`
    }
    band.innerHTML = swash
    gutter.innerHTML = sel

    update_time_travel()
}
let scroll_render_queued = false

// How wide the content column is decides how many lines each patch wraps to,
// so resizing the panel changes every row's height.
let resize_timer = null
window.addEventListener('resize', () => {
    if (!layout) return
    clearTimeout(resize_timer)
    resize_timer = setTimeout(() => {
        if (!layout) return
        layout = null
        layout_history()
        render_history_window()
    }, 150)
})

function get_new_angle(angles) {
    let positions = angles.sort().concat([1]);
    let best = 0;
    let biggest = positions[0];
    for (let i = 0; i < positions.length - 1; i++) {
        let smaller = positions[i];
        let bigger = positions[i + 1];
        if (bigger - smaller > biggest) {
            best = (bigger + smaller) / 2;
            biggest = bigger - smaller;
        }
    }
    return best;
}

function angle_to_color(angle) {
    // Hue alone carries identity. Lightness and chroma stay fixed, dark
    // and vivid enough to read as text on the white background.
    // The offset starts the first actors at blue, then orange...
    return `oklch(50% 0.30 ${Math.round(angle * 360 + 250)})`
}

function decode_version(v) {
    let m = v.match(/^(.*)-(\d+)$/s)
    if (!m) throw new Error(`invalid actor-seq version: ${v}`)
    return [m[1], parseInt(m[2])]
}

function sorted_insert(arr, val) {
    let lo = 0, hi = arr.length
    while (lo < hi) {
        let mid = Math.floor((lo + hi) / 2)
        if (arr[mid] < val) lo = mid + 1
        else hi = mid
    }
    arr.splice(lo, 0, val)
}

function fastHashToUnit(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
    }
    return (hash >>> 0) / 4294967296; // divide by 2^32 → [0, 1)
}

// POST undefined HTTP/1.1
// parents: "[\"b4ef158b-2e58-4965-90d3-6ab3ac232fb0\",10]"
// patches: 1
// peer: hqeum4qsu7m
// version: "[\"b4ef158b-2e58-4965-90d3-6ab3ac232fb0\",11]"

// content-length: 1
// content-range: json 523-523

// a

// Hello World3
// Received message in devtools: "created!"
// Received message in devtools: {"action":"braid_out","data":{"method":"POST","mode":"cors","version":"[\"b844a362-39bb-44fa-a3eb-5ef330f5df73\",0]","parents":["[\"701ac3bd-a1c6-4379-a1a6-f92ae060d74c\",18]"],"patches":[{"unit":"json","range":"24-25","content":""}]}}
// Received message in devtools: {"action":"braid_in","data":{"version":"[\"b844a362-39bb-44fa-a3eb-5ef330f5df73\",0]","parents":["[\"701ac3bd-a1c6-4379-a1a6-f92ae060d74c\",18]"],"patches":[{"headers":{"content-length":"0","content-range":"json 24-25"},"unit":"json","range":"24-25","content":""}]}}