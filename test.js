// Tests for the parts of this extension that can run outside a browser.
//
//   node test.js
//
// Chrome loads dt.js, dt-helpers.js and panel.js as *classic* scripts sharing
// one scope. Node normally loads files as modules, which hides the mistakes
// that actually break this extension, so everything here is compiled with
// vm.Script against a stub window instead. That is deliberate: `import.meta`
// is legal in a module, so checking dt.js as one would pass a file Chrome
// refuses to run.
//
// Three things are worth guarding: the transformations dt.js needs after every
// diamond-types rebuild, which have broken silently before; the history view's
// layout, which computes row geometry in plain arrays and must give the same
// answer whether it built it all at once or a version at a time; and reading a
// history that did not come from dt, which has to arrive at the same text dt
// itself would.

const fs = require('fs')
const vm = require('vm')
const path = require('path')

const DIR = __dirname
let passed = 0, failed = 0

function check(name, fn) {
    try {
        fn()
        console.log(`  ok    ${name}`)
        passed++
    } catch (e) {
        console.log(`  FAIL  ${name}\n          ${e.message}`)
        failed++
    }
}

function eq(actual, expected, what) {
    const a = JSON.stringify(actual), b = JSON.stringify(expected)
    if (a !== b) throw new Error(`${what}: got ${a}, wanted ${b}`)
}

function ok(cond, what) {
    if (!cond) throw new Error(what)
}

// ---------------------------------------------------------------- the stub

// Enough of a window for these scripts to load and for the history view to
// lay itself out. It records nothing about styling, only structure, so it
// cannot check what the page looks like, only what it builds.
function make_window() {
    const by_id = {}
    const told = []
    const listening = {}
    const said = []
    const tag_count = s => (String(s).match(/<[a-zA-Z]/g) || []).length

    function el(tag) {
        const e = {
            tagName: tag, children: [], dataset: {}, textContent: '', firstChild: null,
            style: new Proxy({}, { get: (t, k) => t[k] ?? '', set: (t, k, v) => (t[k] = v, true) }),
            _html: '',
            get innerHTML() { return this._html },
            set innerHTML(v) {
                this._html = v
                if (tag_count(v)) this.firstChild = el('div')
                for (const m of String(v).matchAll(/id="([^"]+)"/g))
                    by_id[m[1]] = by_id[m[1]] || el('div')
            },
            append(...c) { this.children.push(...c) },
            appendChild(c) { this.children.push(c); return c },
            remove() {},
            closest: () => null,
            getBoundingClientRect: () => ({ x: 0, y: 0, top: 0, left: 0,
                                            bottom: 600, right: 900, width: 900, height: 600 }),
            // Text is measured as a fixed width per character, which is all
            // the column arithmetic needs and is stable across machines.
            get offsetWidth() { return 8 * this.textContent.length },
            scrollTop: 0, scrollHeight: 600, clientHeight: 600, clientWidth: 900,
            addEventListener() {}, checked: false, value: '',
        }
        return e
    }

    const document = {
        createElement: el,
        body: el('body'),
        // Only elements the markup has actually declared, so that code which
        // builds its own containers is exercised rather than handed one.
        getElementById: id => by_id[id] || null,
        addEventListener() {},
    }
    const win = {
        document, console,
        requestAnimationFrame: f => f(),
        // Kept, so a test can raise one the way the browser would
        addEventListener: (type, fn) => (listening[type] ??= []).push(fn),
        onload: null,
        setTimeout, clearTimeout, setInterval, clearInterval, atob, btoa,
        TextEncoder, TextDecoder, performance,
        crypto: require('crypto').webcrypto,
        backgroundConnection: { postMessage() {} },
        navigator: { userAgent: 'test' },
        location: { href: 'about:blank' },
        // Present, and without the Firefox marking that makes content-script.js
        // put its own in place of it.
        ReadableStream: class {},
        chrome: {
            runtime: {
                getURL: f => path.join(DIR, f),
                connect: () => ({ postMessage() {}, onMessage: { addListener() {} } }),
                // Kept, so a test can deliver what the background would say
                onMessage: { addListener: fn => told.push(fn) },
                sendMessage: m => said.push(m),
            },
            devtools: { inspectedWindow: { tabId: 1 } },
        },
    }
    win.getSelection = () => ({ toString: () => '' })
    // Only inline styles exist here, so that is all this can report
    win.getComputedStyle = e => e.style
    win.window = win
    win.self = win
    win.globalThis = win

    // The ids panel.js expects the markup to have provided
    for (const id of ['id_messages', 'id_raw_messages', 'subscribe_response',
        'encoding_response', 'version_response', 'parents_response',
        'merge_type_response', 'content_type_response', 'error_d', 'error_d_label',
        'edit_source_d', 'encoding_request', 'merge_type_select',
        'content_type_select', 'subscribe_request', 'version_request',
        'parents_request', 'edit_source', 'resubmit_button', 'show_resubmit',
        'id_time_travel', 'id_time_travel_label',
        'id_show_deletions', 'id_show_deletions_label'])
        win[id] = by_id[id] = el('div')

    return { win, by_id, told, listening, said, ctx: vm.createContext(win) }
}

function load(ctx, file) {
    const src = fs.readFileSync(path.join(DIR, file), 'utf8')
    new vm.Script(src, { filename: file }).runInContext(ctx)
}

// ------------------------------------------- dt.js, and its transformations

console.log('\ndt.js is a usable classic script')

const dt_src = fs.readFileSync(path.join(DIR, 'dt.js'), 'utf8')

check('compiles as a classic script, not only as a module', () => {
    new vm.Script(dt_src, { filename: 'dt.js' })
})

check('no export statements survive', () => {
    const left = dt_src.split('\n').filter(l => /^\s*export\b/.test(l))
    ok(left.length === 0, `${left.length} export line(s) remain, first: ${left[0]}`)
})

check('no import.meta, which a classic script cannot parse', () => {
    const code = dt_src.split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n')
    ok(!code.includes('import.meta'), 'import.meta is still present')
})

check('the wasm url goes through chrome.runtime.getURL', () => {
    ok(dt_src.includes("chrome.runtime.getURL('dt_bg.wasm')"),
       "expected chrome.runtime.getURL('dt_bg.wasm')")
})

check('dt_bg.wasm is present and is wasm', () => {
    const b = fs.readFileSync(path.join(DIR, 'dt_bg.wasm'))
    eq([...b.subarray(0, 4)], [0x00, 0x61, 0x73, 0x6d], 'wasm magic number')
})

// -------------------------------------------------- the engine, once loaded

console.log('\nthe engine loads and answers')

const engine = make_window()
let engine_ready = false
check('dt.js and dt-helpers.js load together', () => {
    load(engine.ctx, 'dt.js')
    load(engine.ctx, 'dt-helpers.js')
    for (const name of ['initSync', 'Doc', 'dt_diff_from', 'encode_version', 'decode_version'])
        ok(vm.runInContext(`typeof ${name}`, engine.ctx) !== 'undefined',
           `${name} is not defined`)
})

check('the wasm initializes', () => {
    const w = fs.readFileSync(path.join(DIR, 'dt_bg.wasm'))
    engine.ctx.__wasm = w.buffer.slice(w.byteOffset, w.byteOffset + w.byteLength)
    vm.runInContext('initSync({ module: __wasm })', engine.ctx)
    engine_ready = true
})

const run = js => vm.runInContext(js, engine.ctx)

check('a document edits and reads back', () => {
    ok(engine_ready, 'the wasm did not initialize')
    eq(run(`(() => { let d = new Doc('a'); d.ins(0, 'hello'); d.ins(5, ' world');
                     d.del(0, 1); d.ins(0, 'H'); return d.get() })()`),
       'Hello world', 'document text')
})

check('getUpdates returns braid updates', () => {
    const u = run(`(() => { let d = new Doc('alice'); d.ins(0, 'hello');
                            return d.getUpdates(null) })()`)
    eq(u.length, 1, 'one run summarized into one update')
    eq(u[0].version, ['alice-4'], 'version names the run\'s last event')
    eq(u[0].first_event, 'alice-0', 'first_event names the run\'s first')
    eq(u[0].parents, [], 'no parents')
    eq(u[0].patches, [{ unit: 'text', range: '[0:0]', content: 'hello' }], 'one range patch')
})

check('a forward delete emits one update per character', () => {
    // Each event deletes whatever now sits at the same position, so the runs
    // cannot be summarized and every one addresses the same one-character span.
    const u = run(`(() => { let d = new Doc('a'); d.ins(0, 'abcdef'); d.del(1, 3);
                            return d.getUpdates(['a-5']) })()`)
    eq(u.length, 3, 'one update per deleted character')
    eq(u.map(x => x.patches[0].range), ['[1:2]', '[1:2]', '[1:2]'], 'delete ranges')
    eq(u.map(x => x.patches[0].content), ['', '', ''], 'a delete carries no content')
})

check('numLocalVersions counts events, not updates', () => {
    eq(run(`(() => { let d = new Doc('a'); d.ins(0, 'hello');
                     return [d.numLocalVersions(), d.getUpdates(null).length] })()`),
       [5, 1], '[events, updates]')
})

check('getUpdatesInSpan covers a window of history', () => {
    const r = run(`(() => {
        let d = new Doc('a')
        for (let i = 0; i < 10; i++) d.ins(0, 'x')
        let n = d.numLocalVersions()
        let half = Math.floor(n / 2)
        let a = d.getUpdatesInSpan(0, half), b = d.getUpdatesInSpan(half, n)
        let count = us => us.reduce((t, u) => t + [...u.patches[0].content].length, 0)
        return [n, count(a) + count(b), d.getUpdatesInSpan(0, 0).length]
    })()`)
    eq(r[0], r[1], 'adjacent spans cover every event exactly once')
    eq(r[2], 0, 'an empty span is empty')
})

check('a document round-trips through bytes', () => {
    const r = run(`(() => {
        let a = new Doc('a'); a.ins(0, 'hello there')
        let b = new Doc('b'); b.mergeBytes(a.toBytes())
        return [a.get() === b.get(), b.getUpdates(null).length === a.getUpdates(null).length]
    })()`)
    eq(r, [true, true], '[same text, same updates]')
})

check('concurrent edits merge the same way on both sides', () => {
    const r = run(`(() => {
        let a = new Doc('a'); a.ins(0, 'hello')
        let b = new Doc('b'); b.mergeBytes(a.toBytes())
        a.ins(5, ' from a'); b.ins(0, 'B says: ')
        let a2 = a.toBytes(), b2 = b.toBytes()
        a.mergeBytes(b2); b.mergeBytes(a2)
        return [a.get(), b.get()]
    })()`)
    eq(r[0], r[1], 'both peers converge on the same text')
})

check('encode_version and decode_version are inverses', () => {
    eq(run(`decode_version(encode_version('agent', 7))`), ['agent', 7], 'round trip')
    // An agent name may contain a hyphen, so only the last one separates
    eq(run(`decode_version(encode_version('a-weird-name', 12))`),
       ['a-weird-name', 12], 'hyphenated agent name')
})

// -------------------------------------------------- the history view layout

console.log('\nthe history view lays out and virtualizes')

const panel = make_window()
check('panel.js loads', () => {
    load(panel.ctx, 'dt.js')
    load(panel.ctx, 'dt-helpers.js')
    load(panel.ctx, 'panel.js')
    ok(typeof panel.ctx.layout_history === 'function', 'layout_history is not defined')
    ok(typeof panel.ctx.render_history_window === 'function',
       'render_history_window is not defined')
})

// A long single-author run, with one fork partway through, plus one version
// whose content wraps over several lines.
const versions = []
for (let i = 0; i < 4000; i++) {
    let parents = i === 0 ? [] : [`alice-${i - 1}`]
    if (i === 2000) parents = ['alice-1998', 'bob-0']
    versions.push({ method: 'GET', version: [`alice-${i}`], parents,
                    patches: [{ unit: 'text', range: `${i}:${i}`, content: 'x' }] })
}
versions[3].patches = [{ unit: 'text', range: '3:3',
                         content: 'first line\nsecond line\n' + 'z'.repeat(400) }]
versions.splice(1999, 0, { method: 'GET', version: ['bob-0'], parents: ['alice-1997'],
                           patches: [{ unit: 'text', range: '5:9', content: '' }] })

panel.ctx.__vs = versions
const prun = js => vm.runInContext(js, panel.ctx)
prun(`function fill(n) { versions.length = 0; for (let i = 0; i < n; i++) versions.push(__vs[i]) }
      function append(a, b) { for (let i = a; i < b; i++) versions.push(__vs[i]) }
      function snapshot() {
          return JSON.stringify({ rows: layout.rows.length, height: layout.height,
              tops: layout.row_tops, circles: layout.circles, edges: layout.edges })
      }`)

const N = versions.length

check('it renders only the rows in the viewport', () => {
    prun(`fill(${N}); layout = null; layout_history(); render_history_window()`)
    const rows = panel.by_id['history_rows'].innerHTML
    const drawn = (rows.match(/data-vi=/g) || []).length
    ok(drawn > 0, 'nothing was drawn')
    ok(drawn < 150, `${drawn} rows drawn for ${N} versions, so it is not virtualizing`)
})

check('scrolling draws a different set of rows', () => {
    const first = panel.by_id['history_rows'].innerHTML
    panel.win.id_messages.scrollTop = 20000
    prun('render_history_window()')
    const later = panel.by_id['history_rows'].innerHTML
    ok(first !== later, 'the same rows were drawn after scrolling')
    panel.win.id_messages.scrollTop = 0
})

check('appending gives the same layout as building it all at once', () => {
    prun(`fill(${N}); layout = null; layout_history()`)
    const all_at_once = prun('snapshot()')

    prun(`fill(${N - 500}); layout = null; layout_history()`)
    prun(`append(${N - 500}, ${N}); layout_history()`)
    ok(prun('snapshot()') === all_at_once, 'a batch of 500 diverged from a full rebuild')

    prun(`fill(${N - 20}); layout = null; layout_history()`)
    for (let i = N - 20; i < N; i++) prun(`append(${i}, ${i + 1}); layout_history()`)
    ok(prun('snapshot()') === all_at_once, 'one at a time diverged from a full rebuild')
})

check('content wrapping makes a row taller, and moves the rows below it', () => {
    prun(`fill(${N}); layout = null; layout_history(); render_history_window()`)
    const rows = panel.by_id['history_rows'].innerHTML.split('<div data-vi=').slice(1)
    const tall = rows.find(r => r.includes('second line'))
    ok(tall, 'the multi-line version was not drawn')
    const height = +tall.match(/height:(\d+)px/)[1]
    const tops = rows.map(r => +(r.match(/top:(\d+)px/) || [0, 0])[1])
    ok(height > 100, `the wrapping row is only ${height}px tall`)
    ok(tall.includes('pre-wrap') && tall.includes('break-all'),
       'content is not set to wrap at the column edge')
    ok(tall.includes('first line\nsecond line'), 'newlines were not kept')
    for (let i = 1; i < tops.length; i++)
        ok(tops[i] > tops[i - 1], 'rows are not in increasing order down the page')
})

// ------------------------------------------------ selecting a span of time

console.log('\nselecting a span of time')

check('a span of one version is the degenerate case of a drag', () => {
    prun('span = null; select_span(7, 7)')
    eq(prun('[layout.vs[Math.min(span.a, span.b)].version[0], span.a === span.b]'),
       ['alice-7', true], '[version, single]')
})

check('rows carry no click handler, so their text can be selected', () => {
    prun(`fill(${N}); layout = null; layout_history(); render_history_window()`)
    const rows = panel.by_id['history_rows'].innerHTML
    ok(!rows.includes('cursor:pointer'), 'rows still look clickable')
    ok(!rows.includes('onclick'), 'rows still carry a click handler')
})

check('the band covers the version DAG and the identifiers beside it', () => {
    prun(`fill(${N}); layout = null; layout_history(); select_span(2, 6, true)`)
    const g = panel.by_id['history_gutter']
    ok(panel.by_id['history_band'].innerHTML.includes('background:rgba'),
       'no highlighter drawn')
    ok(g.innerHTML.includes('data-grip="body"'), 'no grips drawn')
    ok(g.innerHTML.includes('data-grip="top"') && g.innerHTML.includes('data-grip="bottom"'),
       'the two edge handles are missing')
    // The band fills the gutter, and the gutter reaches past the DAG to cover
    // the identifiers, which is also the region you can drag a span out of.
    const w = parseInt(g.style.width)
    ok(w === prun('layout.band_w'), `gutter is ${w}px, layout says ${prun('layout.band_w')}`)
    ok(w > prun('DAG_W'), `the gutter stops at the DAG (${w}px)`)
    ok(w <= prun('DAG_W + layout.cols.version'),
       'the gutter reaches past the identifiers into blank space')
})

check('the band spans exactly the selected versions', () => {
    prun('select_span(2, 6, true)')
    const band = panel.by_id['history_band'].innerHTML.match(/top:(\d+)px;\s*height:(\d+)px/)
    ok(band, 'could not read the band geometry')
    const [top, height] = [+band[1], +band[2]]
    eq([top, top + height],
       [prun('version_top(2)'), prun('version_bottom(6)')], '[band top, band bottom]')
})

check('a span selected backwards covers the same versions', () => {
    prun('select_span(6, 2)')
    const a = panel.by_id['history_band'].innerHTML.match(/top:(\d+)px;\s*height:(\d+)px/)
    prun('select_span(2, 6)')
    const b = panel.by_id['history_band'].innerHTML.match(/top:(\d+)px;\s*height:(\d+)px/)
    eq([a[1], a[2]], [b[1], b[2]], 'dragging up and dragging down')
})

check('a point on the page maps back to the version drawn there', () => {
    for (const vi of [0, 3, 50, 1999, 2500]) {
        const top = prun(`version_top(${vi})`), bot = prun(`version_bottom(${vi})`)
        eq(prun(`version_at(${(top + bot) / 2})`), vi, `middle of version ${vi}`)
        eq(prun(`version_at(${top})`), vi, `top edge of version ${vi}`)
    }
})

check('the cursor keeps its meaning while a span is being drawn', () => {
    prun('select_span(2, 6)')
    prun(`drag = { mode: 'edge', cursor: 'ns-resize', anchor: 2, y: 0 }`)
    prun('render_history_window()')
    const g = panel.by_id['history_gutter']
    eq(g.style.cursor, 'ns-resize', 'gutter cursor while drawing a span')
    ok(!/cursor:(grab|ns-resize)"/.test(g.innerHTML),
       'a grip talks over the cursor of the drag in progress')
    prun('drag = null; render_history_window()')
})

check('pressing on a span closes the hand before any movement', () => {
    prun('select_span(2, 6)')
    const g = panel.by_id['history_gutter']
    eq(g.style.cursor, 'ns-resize', 'before the press')
    ok(g.innerHTML.includes('cursor:grab'), 'the span should offer a hand to take')
    // press on the body, with no mousemove following
    const top = prun('version_top(2)')
    panel.by_id['history_gutter'].onmousedown({
        clientY: top + 4, preventDefault() {}, target: { dataset: { grip: 'body' } },
    })
    eq(g.style.cursor, 'grabbing', 'the hand did not close on mousedown')
    ok(!g.innerHTML.includes('cursor:grab'), 'a grip still offers the open hand')
    prun('drag = null; document.body.style.cursor = ""; render_history_window()')
})

check('the cursor of a finished drag does not stay on screen', () => {
    prun('select_span(2, 6)')
    // slide the whole span, which is the one gesture that closes the hand
    prun(`drag = { mode: 'move', cursor: 'grabbing', from: 4, y: 0, a: 2, b: 6 }`)
    prun('render_history_window()')
    eq(panel.by_id['history_gutter'].style.cursor, 'grabbing', 'mid-drag')
    prun('drag = null; render_history_window()')
    const g = panel.by_id['history_gutter']
    eq(g.style.cursor, 'ns-resize', 'after the drag ends')
    ok(g.innerHTML.includes('cursor:grab'), 'the span offers no hand once released')
    ok(!g.innerHTML.includes('cursor:inherit'), 'grips still deferring to a dead drag')
})

check('the cursors say what each part of the band does', () => {
    prun('select_span(2, 6, true)')
    const g = panel.by_id['history_gutter']
    // Drawing a span, and moving either edge, is the window-border gesture.
    // The hand is kept for sliding a whole span, which really is picking
    // something up.
    prun('select_span(null, null); render_history_window()')
    eq(panel.by_id['history_gutter'].style.cursor, 'ns-resize', 'empty gutter cursor')
    prun('select_span(2, 6); render_history_window()')
    ok(panel.by_id['history_gutter'].innerHTML.includes('cursor:grab'),
       'a selected span offers no hand to move it')
    ok(g.innerHTML.includes('cursor:grab'), 'the band body is not grabbable')
    ok((g.innerHTML.match(/cursor:ns-resize/g) || []).length === 2,
       'both edges should resize')
})

// --------------------------------------------------------- time travel line

console.log('\ntime travelling with the scroll')

// A stand-in for the panel's own copy of the document, which the real panel
// builds from the history the page sends it.
prun(`dt_doc = { getStringAt: lv => 'text@' + lv, remoteToLocalVersion: v => v[0] }`)
prun('__doc = dt_doc')

check('the line stays hidden until it is switched on', () => {
    prun('select_span(null, null)')
    panel.win.id_time_travel.checked = false
    prun('update_time_travel()')
    eq(panel.by_id['history_line'].style.display, 'none', 'line display')
})

check('switching it on puts the line across the middle of the view', () => {
    panel.win.id_time_travel.checked = true
    prun('update_history_controls()')
    panel.win.id_messages.scrollTop = 4000
    prun('update_time_travel()')
    eq(panel.by_id['history_line'].style.display, 'block', 'line display')
    eq(panel.by_id['history_line'].style.top,
       (4000 + panel.win.id_messages.clientHeight / 2) + 'px', 'line position')
})

check('the version under the line is the one being shown', () => {
    panel.win.id_messages.scrollTop = 4000
    prun('update_time_travel()')
    const mid = 4000 + panel.win.id_messages.clientHeight / 2
    const vi = prun(`version_at(${mid})`)
    eq(prun('travelling_vi'), vi, 'version under the line')
    eq(prun('[Math.min(span.a, span.b), Math.max(span.a, span.b)]'), [vi, vi],
       'the span should be the single version under the line')
})

check('scrolling moves to a different version', () => {
    panel.win.id_messages.scrollTop = 4000
    prun('update_time_travel()')
    const before = prun('travelling_vi')
    panel.win.id_messages.scrollTop = 30000
    prun('update_time_travel()')
    ok(prun('travelling_vi') !== before, 'the same version after scrolling 26,000px')
})

check('raw messages turns time travel off', () => {
    panel.win.id_raw_messages.checked = true
    prun('update_time_travel()')
    eq(panel.by_id['history_line'].style.display, 'none', 'line display')
    eq(prun('travelling_vi'), null, 'the line is still following a version')
    panel.win.id_raw_messages.checked = false
    panel.win.id_time_travel.checked = false
})

check('raw messages lets go of the span and greys what acts on one', () => {
    prun('select_span(10, 20)')
    panel.win.id_raw_messages.checked = true
    prun('update_history_controls()')
    eq(prun('span'), null, 'a span nobody can see or adjust')
    for (const box of ['id_time_travel', 'id_show_deletions'])
        ok(panel.win[box].disabled, `${box} is still live`)
    eq(panel.win.id_show_deletions_label.style.opacity, 0.4, 'the label still reads as live')

    panel.win.id_raw_messages.checked = false
    prun('update_history_controls()')
    for (const box of ['id_time_travel', 'id_show_deletions'])
        ok(!panel.win[box].disabled, `${box} stayed grey`)
})

check('placing a span by hand takes the job off the line', () => {
    panel.win.id_time_travel.checked = true
    prun('travelling_vi = null; update_time_travel()')
    ok(prun('span') !== null, 'the line should have placed a span')
    prun('select_span(10, 20)')
    eq([panel.win.id_time_travel.checked, panel.win.id_time_travel.disabled],
       [false, false], '[checked, disabled]')
    eq(prun('[span.a, span.b]'), [10, 20], 'the hand-placed span')
})

check('switching the line on takes the span back', () => {
    prun('select_span(10, 20)')
    panel.win.id_time_travel.checked = true
    prun('toggle_time_travel()')
    eq(prun('span.a === span.b'), true, 'the line should hold a single version')
    eq(prun('span.a'), prun('travelling_vi'), 'and it should be the one it crosses')
    panel.win.id_time_travel.checked = false
    prun('update_time_travel()')
})

check('switching the line off lets go of the span it held', () => {
    panel.win.id_time_travel.checked = true
    prun('travelling_vi = null; update_time_travel()')
    ok(prun('span') !== null, 'the line should have placed a span')
    panel.win.id_time_travel.checked = false
    prun('toggle_time_travel()')
    eq(prun('span'), null, 'the span outlived the line')
})

check('a span placed by hand outlives the line being redrawn', () => {
    prun('select_span(10, 20)')
    prun('update_time_travel()')
    eq(prun('[span.a, span.b]'), [10, 20], 'the hand-placed span')
})

// A page arriving: the panel is told a history from scratch. These leave it
// holding an empty one, so each puts the long history back first.
const a_page_loads = () => prun(`fill(2000); layout = null; layout_history()
    render_history_window()
    add_message({ action: 'init', fresh: true, versions: [], raw_messages: [], get_failed: '' })`)

// The same page describing itself again, which is what a panel reconnecting
// asks it to do. Same words, no `fresh`.
const the_page_says_it_again = () => prun(`add_message({ action: 'init',
    versions: __vs.slice(0, 2000), raw_messages: [], get_failed: '' })`)

check('a new page is not shown the span selected on the last one', () => {
    // The span names versions by their place in the history, and a reload or
    // a new url replaces that history wholesale
    prun(`fill(2000); layout = null; layout_history(); render_history_window()`)
    prun('select_span(10, 20)')
    a_page_loads()
    eq(prun('span'), null, 'the span survived the page it was chosen on')
})

check('but the panel reconnecting is not a new page, and keeps it', () => {
    // A devtools port comes and goes on its own schedule. Treating each return
    // as a page load dropped the span and drew it again, which the page saw as
    // a flicker every time -- roughly every thirty seconds, for days.
    prun(`fill(2000); layout = null; layout_history(); render_history_window()`)
    prun('select_span(10, 20)')
    the_page_says_it_again()
    eq(prun('[span.a, span.b]'), [10, 20], 'the span was dropped')
})

check('but the time-travel line is a setting, and stays on across one', () => {
    prun(`fill(2000); layout = null; layout_history(); render_history_window()`)
    panel.win.id_time_travel.checked = true
    prun('travelling_vi = null; update_time_travel()')
    ok(prun('span') !== null, 'the line should have placed a span to be cleared')

    a_page_loads()
    ok(panel.win.id_time_travel.checked, 'the line switched itself off')
    panel.win.id_time_travel.checked = false
    prun('update_time_travel()')
})

// Put the long history back for the tests that come after
prun(`fill(2000); layout = null; layout_history(); render_history_window()`)

check('dropping the deleted runs leaves the text at the end of the span', () => {
    const r = run(`(() => {
        let a = new Doc('alice'); a.ins(0, 'hello')
        let at = a.getRemoteVersion().map(x => x.join('-')).sort()
        let b = new Doc('bob'); b.mergeBytes(a.toBytes())
        b.ins(5, ' world'); a.mergeBytes(b.toBytes())
        a.del(0, 5)
        return [dt_diff_from(a, at).filter(x => x[0] !== -1).map(x => x[1]).join(''),
                a.get()]
    })()`)
    eq(r[0], r[1], 'the diff without deletions should equal the document itself')
})

check('a diff says who made each change', () => {
    const d = run(`(() => {
        let a = new Doc('alice'); a.ins(0, 'hello')
        let at = a.getRemoteVersion().map(x => x.join('-')).sort()
        let b = new Doc('bob'); b.mergeBytes(a.toBytes())
        b.ins(5, ' world'); a.mergeBytes(b.toBytes())
        a.del(0, 5)                      // alice removes "hello"
        return dt_diff_from(a, at)
    })()`)
    const added = d.filter(x => x[0] === 1)
    const gone = d.filter(x => x[0] === -1)
    eq(added.map(x => [x[1], x[2]]), [[' world', 'bob']], 'bob added " world"')
    // A deletion is attributed to whoever removed it, not whoever wrote it
    eq(gone.map(x => [x[1], x[2]]), [['hello', 'alice']], 'alice removed "hello"')
})

check('runs by the same author collapse into one entry', () => {
    const d = run(`(() => {
        let d = new Doc('a'); d.ins(0, 'x')
        let at = d.getRemoteVersion().map(v => v.join('-')).sort()
        d.ins(1, 'abcdef')
        return dt_diff_from(d, at)
    })()`)
    eq(d.filter(x => x[0] === 1).length, 1, 'six characters by one author should be one run')
})

check('a diff marks insertions and deletions the right way round', () => {
    // -1 removed, 0 untouched, 1 added
    const d = run(`(() => {
        let doc = new Doc('a')
        doc.ins(0, 'hello world')
        let at = doc.getRemoteVersion().map(x => x.join('-')).sort()
        doc.del(5, 6)              // drop " world"
        doc.ins(5, '!')            // add "!"
        return dt_diff_from(doc, at)
    })()`)
    const by = st => d.filter(x => x[0] === st).map(x => x[1]).join('')
    eq(by(1), '!', 'added text')
    eq(by(-1), ' world', 'removed text')
    eq(by(0), 'hello', 'untouched text')
})

// ------------------------------------ reading a history that is not dt's

console.log('\na straight-line history replays into the same kind of diff')

// content-script.js reads these histories itself, since the merge types that
// send them do not have a document to ask.
const page = make_window()
check('content-script.js loads', () => {
    load(page.ctx, 'content-script.js')
    load(page.ctx, 'dt-helpers.js')
    load(page.ctx, 'myers-diff1.js')
    ok(typeof page.ctx.replay_diff === 'function', 'replay_diff is not defined')
})

const crun = js => vm.runInContext(js, page.ctx)
const body = (v, text) => ({ version: [v], patches: [{ unit: 'body', range: '', content: text }] })
const edit = (v, parents, patches) =>
    ({ version: [v], parents, patches: patches.map(p => ({ unit: 'text', ...p })) })

// What a simpleton client is sent: a snapshot to start on, then patches.
page.ctx.__simpleton = [
    body('server-0', 'hello'),
    edit('alice-3', ['server-0'], [{ range: '[5:5]', content: ' world' }]),
    edit('bob-9', ['alice-3'], [{ range: '[0:1]', content: 'H' }]),
]

check('one update says what that one edit did', () => {
    eq(crun(`replay_diff(__simpleton, ['server-0'], ['alice-3'])`),
       [[0, 'hello', null], [1, ' world', 'alice']], 'alice appended " world"')
})

check('a span says what all of its updates did', () => {
    const d = crun(`replay_diff(__simpleton, ['server-0'], ['bob-9'])`)
    const by = st => d.filter(x => x[0] === st).map(x => [x[1], x[2]])
    eq(by(1), [['H', 'bob'], [' world', 'alice']], 'added text and who added it')
    eq(by(-1), [['h', 'bob']], 'bob lowered the h by replacing it')
    eq(by(0), [['ello', null]], 'untouched text')
})

check('a span starts from the text as it stood before it', () => {
    eq(crun(`replay_diff(__simpleton, ['alice-3'], ['bob-9']).map(x => x[1]).join('')`),
       'hHello world', 'the deleted h, then the text bob left behind')
})

check('several patches in one update shift each other along', () => {
    page.ctx.__multi = [
        body('server-0', 'abcdef'),
        edit('alice-1', ['server-0'], [{ range: '[1:2]', content: '' },
                                       { range: '[4:4]', content: 'XY' }]),
    ]
    eq(crun(`replay_diff(__multi, ['server-0'], ['alice-1'])
                 .filter(x => x[0] !== -1).map(x => x[1]).join('')`),
       'acdXYef', 'both patches read against the text before the update')
})

check('a snapshot feed is diffed against the snapshot before it', () => {
    page.ctx.__snapshots = [body('a-0', 'cat'), body('b-1', 'cart'), body('c-2', 'cars')]
    eq(crun(`replay_diff(__snapshots, ['a-0'], ['b-1'])`),
       [[0, 'ca', null], [1, 'r', 'b'], [0, 't', null]], 'b inserted the r')
    const d = crun(`replay_diff(__snapshots, ['a-0'], ['c-2'])`)
    eq(d.filter(x => x[0] === -1).map(x => [x[1], x[2]]), [['t', 'c']], 'c removed the t')
})

// The patches a simpleton client is sent are dt's own, transformed into that
// client's line of time. Replaying them has to land on the text dt itself
// holds, or this view is reading a history differently from the document that
// wrote it.
check("replaying dt's transformed patches lands on dt's own text", () => {
    ok(engine_ready, 'the wasm did not initialize')
    // A server merging two peers who keep colliding, telling one client about
    // everything it has not seen since the last time it was told.
    const out = run(`(() => {
        let server = new Doc('server'), a = new Doc('alice'), b = new Doc('bob')
        let updates = [], n = 0
        let words = ['the ', 'quick ', 'brown ', 'fox ', 'jumps ', 'over ', 'a ', 'log ']
        for (let i = 0; i < words.length; i++) {
            a.mergeBytes(server.toBytes())
            b.mergeBytes(server.toBytes())
            a.ins(Math.min(i * 3, a.len()), words[i])
            b.ins(0, String(i))
            if (b.len() > 6) b.del(3, 2)
            let seen = server.getLocalVersion()
            server.mergeBytes(a.toBytes())
            server.mergeBytes(b.toBytes())
            let patches = server.getXFPatches(seen)
            if (patches.length) updates.push({ version: ['peer-' + (n++)], patches })
        }
        return { updates, final: server.get() }
    })()`)
    ok(out.updates.length > 4, 'the run should have produced several updates')
    ok(out.updates.some(u => u.patches.length > 1), 'a merge should have sent several patches')

    page.ctx.__xf = JSON.parse(JSON.stringify(out.updates))
    eq(crun(`replay_to(__xf, __xf.length - 1).join('')`), out.final, 'the replayed text')
})

check('a history it cannot read as text says so', () => {
    page.ctx.__structural = [
        body('a-0', '{"x":1}'),
        { version: ['b-1'], parents: ['a-0'],
          patches: [{ unit: 'json', range: '.x', content: '2' }] },
    ]
    eq(crun(`replay_diff(__structural, ['a-0'], ['b-1'])`), null, 'a json path patch')
    eq(crun(`replay_diff(__simpleton, ['nobody-0'], ['bob-9'])`), null, 'an unknown version')
    eq(crun(`replay_diff(__simpleton, ['bob-9'], ['alice-3'])`), null, 'a span running backwards')
})

// Replaying is remembered every REPLAY_STEP updates so that dragging does not
// walk the history from the top on every frame. What it remembers has to give
// the same answers as replaying it cold, whichever order it is asked in.
check('a history longer than one memory gives the same answers', () => {
    // Each update writes a different letter, so a text replayed from the wrong
    // place reads differently rather than only being a different length.
    page.ctx.__long = [body('server-0', '')].concat(
        Array.from({ length: 900 }, (_, i) =>
            edit(`alice-${i}`, [i ? `alice-${i - 1}` : 'server-0'],
                 [{ range: `[${i}:${i}]`, content: 'abcdefg'[i % 7] }])))

    const ask = at => JSON.stringify(
        crun(`replay_diff(__long, ['alice-${at - 1}'], ['alice-${at}'])`))
    const cold = at => { crun('forget_replayed_history()'); return ask(at) }
    const expected = [700, 300, 899].map(cold)

    crun('forget_replayed_history()')
    eq([700, 300, 899].map(ask), expected,
       'asked forwards, then backwards, then forwards again')
    ok(crun('replay_memory.texts.length') > 1, 'nothing was remembered')
})

// A history only ever grows, except when a write is refused and the updates it
// was built on are taken back out. Those places say so, and a history that has
// got shorter is caught anyway.
check('a rolled back history is not answered from memory', () => {
    const ask = () => JSON.stringify(
        crun(`replay_diff(__long, ['alice-897'], ['alice-899'])`))

    crun('forget_replayed_history()')
    const whole = ask()
    ok(crun('replay_memory.texts.length') > 1, 'nothing was remembered to go stale')

    // Taking an update back out of the middle moves every one after it along
    crun(`__long.splice(600, 1)`)
    const warm = ask()
    crun('forget_replayed_history()')
    eq(warm, ask(), 'the shortened history should have been replayed afresh')
    ok(warm !== whole, 'removing an update should have changed what the span shows')

    crun('forget_replayed_history()')
    eq(crun('replay_memory.texts.length'), 1, 'saying so directly should clear them')
})

// ------------------------------------------------------ telling actors apart

console.log('\nactors get colors that stay apart')

// The panel says an actor's identity in hue alone, so these check the hues it
// hands out. Perceived difference is not measured here -- that needs a color
// space these tests have no reason to carry -- but the spacing that produces
// it is, and the failure that prompted this is a spacing failure: colors
// arriving in rainbow order, so anyone who turned up next to you looked
// like you.
const hue_of = css => Number(css.match(/oklch\(50% [\d.]+ (\d+)\)/)[1])
const wheel_len = prun('HUE_WHEEL.length')

// Angles are fractions of a turn, so a difference is measured the short way.
const turn_apart = (a, b) => { const d = Math.abs(a - b) % 1; return Math.min(d, 1 - d) }

function angles_handed_out(n) {
    const out = []
    let last = 0
    for (let i = 0; i < n; i++) {
        const a = prun(`get_new_angle(${JSON.stringify(out)}, ${last})`)
        out.push(a)
        last = a
    }
    return out
}

check('an angle lands in the middle of the widest gap left', () => {
    // Half the wheel is free between 0.4 and 0.9, and nothing else comes close
    eq(prun('get_new_angle([0, 0.1, 0.2, 0.4, 0.9], 0)'), 0.65, 'the wide gap')
})

check('the caller keeps the array it passed, in the order it had it', () => {
    prun('__angles = [0.5, 0.125, 0]')
    prun('get_new_angle(__angles, 0)')
    eq(prun('__angles'), [0.5, 0.125, 0], 'the array handed in')
})

check('consecutive actors never land in the same neighbourhood', () => {
    // Before the fix each round of actors marched across the wheel in order
    // and this fell to a sixteenth of a turn
    const angles = angles_handed_out(20)
    let worst = 1
    for (let i = 1; i < angles.length; i++)
        worst = Math.min(worst, turn_apart(angles[i - 1], angles[i]))
    ok(worst >= 0.2, `closest consecutive pair was ${worst.toFixed(3)} of a turn`)
})

check('no two actors are given the same angle', () => {
    const angles = angles_handed_out(32)
    eq(new Set(angles).size, 32, 'distinct angles')
})

check('however many actors there are, they cover the wheel', () => {
    for (const n of [2, 3, 5, 8, 13]) {
        const sorted = angles_handed_out(n).sort((a, b) => a - b)
        let widest = 1 - sorted[sorted.length - 1] + sorted[0]
        for (let i = 1; i < sorted.length; i++)
            widest = Math.max(widest, sorted[i] - sorted[i - 1])
        // An even spread leaves gaps of 1/n; allow the subdivision twice that
        ok(widest <= 2 / n + 1e-9,
           `${n} actors left a ${widest.toFixed(3)} gap, wanted <= ${(2 / n).toFixed(3)}`)
    }
})

check('the hue wheel is a wheel: it goes around once, never back', () => {
    const wheel = prun('HUE_WHEEL')
    let total = 0
    for (let i = 0; i < wheel.length; i++) {
        let step = wheel[(i + 1) % wheel.length] - wheel[i]
        if (step < 0) step += 360
        ok(step > 0 && step < 180, `step ${i} of ${step} degrees doubles back`)
        total += step
    }
    eq(total, 360, 'degrees travelled')
})

check('an angle names one hue, and the whole turn names them all', () => {
    eq(hue_of(prun('angle_to_color(0)')), prun('HUE_WHEEL[0]'), 'angle 0')
    eq(prun('angle_to_color(1)'), prun('angle_to_color(0)'), 'a full turn comes home')
    eq(prun(`angle_to_color(${1 / wheel_len})`),
       prun('angle_to_color(0)').replace(/ \d+\)/, ` ${prun('HUE_WHEEL[1]')})`),
       'one wheel step')
})

check('chroma is past what sRGB holds, so the browser picks the vivid one', () => {
    // Naming a reachable chroma would make each hue as dull as the dullest
    const css = prun('angle_to_color(0.3)')
    ok(/oklch\(50% 0\.4 \d+\)/.test(css), `unexpected color: ${css}`)
})

// ------------------------------------------- what the page is told, and when

console.log('\nthe page is told things in a usable order')

// panel.js declares these at script scope, so they are not properties of the
// context and have to be assigned from inside it.
const sent = []
panel.ctx.__bc = { postMessage: m => sent.push(m) }
prun('backgroundConnection = __bc')

check('dragging within one version says nothing to the page', () => {
    prun('select_span(40, 50)')
    sent.length = 0
    prun('select_span(40, 50); select_span(40, 50)')
    eq(sent.filter(m => m.cmd === 'show_diff').length, 0, 'redundant diffs sent')
})

check('the panel says what it is asking for when it connects, not only when it changes', () => {
    const said = []
    panel.win.chrome.runtime.connect = () => ({
        postMessage: m => said.push(m),
        onMessage: { addListener() {} },
        onDisconnect: { addListener() {} },
    })
    prun('merge_type_select.value = "simpleton"; version_request.value = "\\"a\\"-3"')
    prun('connect()')

    const init = said.find(m => m.cmd === 'init')
    ok(init, 'no init message was sent')
    eq(init.merge_type, 'simpleton', 'merge-type carried by init')
    eq(init.version, '"a"-3', 'version carried by init')

    // Opening the panel says what it would ask for, without asking for it --
    // connecting a page that never advertised Braid can rotate a csrf token
    // or spend a single-use url, so it takes an actual ask
    eq(init.asked_for, false, 'opening the panel counted as asking')
    said.length = 0
    prun('content_type_select.onchange()')
    eq(said.pop().asked_for, true, 'changing a control did not count as asking')

    prun('merge_type_select.value = ""; version_request.value = ""')
    prun('backgroundConnection = __bc')
})

// --------------------------------------------------- heartbeats on the wire

console.log('\nheartbeats keep out of the raw messages view')

const wire = s => new Uint8Array([...s].map(c => c.charCodeAt(0)))

check('a bare CRLF is a heartbeat, and says nothing worth recording', () => {
    // Every 22.5s forever, so recording them buries the view in blank lines
    crun('raw_messages = []; dt_blob_left = 0')
    page.ctx.__hb = wire('\r\n')
    crun('on_bytes_received(__hb)')
    eq(crun('raw_messages.length'), 0, 'the heartbeat was recorded')
})

check('anything else is still recorded', () => {
    crun('raw_messages = []; dt_blob_left = 0')
    page.ctx.__up = wire('Version: "a-0"\r\nContent-Length: 2\r\n\r\nhi\r\n')
    crun('on_bytes_received(__up)')
    ok(crun('raw_messages.join("")').includes('Version: "a-0"'), 'the update went missing')
})

check('two such bytes inside a dt blob are the blob\'s, not a heartbeat', () => {
    // Mistaking them for one would leave the blob's byte count two short, and
    // every boundary after it wrong
    crun('raw_messages = []; dt_blob_left = 10')
    page.ctx.__mid = wire('\r\n')
    crun('on_bytes_received(__mid)')
    eq(crun('dt_blob_left'), 8, 'the blob lost track of two bytes')
})

// -------------------------------------------- taking the time-travel view down

console.log('\ntaking the diff view down')

check('being told to take down a diff that is not up leaves the page alone', () => {
    // The panel says this whenever it disconnects, which an event page makes
    // it do every 30 seconds. Rewriting the textarea's display flipped it from
    // inline-block to block, and the page flickered and grew a scrollbar over
    // a request to change nothing.
    crun(`__diff_d = document.createElement('pre'); __diff_d.style.display = 'none'
          textarea = document.createElement('textarea')
          show_diff_view(__diff_d, null)`)
    eq(crun('textarea.style.display'), '', 'the textarea display was rewritten')
})

check('a span already showing is recognised from the ask alone', () => {
    // The panel asks again every time its port comes back. Working the answer
    // out before noticing costs ~9ms on a 144k document, and this is on the
    // path a time-travel scroll takes every frame.
    crun('showing_diff = null')
    eq(crun(`already_showing(['a-1'], ['a-5'], {}, false)`), false, 'the first ask')
    eq(crun(`already_showing(['a-1'], ['a-5'], {}, false)`), true, 'the very same ask')
})

check('a different span is not', () => {
    eq(crun(`already_showing(['a-1'], ['a-9'], {}, false)`), false, 'a new span')
})

check('nor the same span with the deletions turned on', () => {
    crun(`showing_diff = null; already_showing(['a-1'], ['a-5'], {}, false)`)
    eq(crun(`already_showing(['a-1'], ['a-5'], {}, true)`), false, 'deletions toggled')
})

check('nor the same span recoloured under it', () => {
    crun(`showing_diff = null; already_showing(['a-1'], ['a-5'], {a: 'red'}, false)`)
    eq(crun(`already_showing(['a-1'], ['a-5'], {a: 'blue'}, false)`), false, 'recoloured')
})

check('a diff it has not seen is still drawn', () => {
    crun(`__diff_d = document.createElement('pre'); __diff_d.style.display = 'none'
          textarea = document.createElement('textarea')
          show_diff_view(__diff_d, [[0, 'kept ', null], [1, 'added', 'alice']], {}, false)`)
    ok(crun('__diff_d.children.length') > 0, 'the diff was never drawn')
})

check('being told to take down one that is up does take it down', () => {
    crun(`__diff_d.style.display = 'block'; show_diff_view(__diff_d, null)`)
    eq(crun('__diff_d.style.display'), 'none', 'the diff stayed up')
    eq(crun('textarea.style.display'), 'block', 'the textarea stayed hidden')
})

check('the textarea is laid out as a block from the start', () => {
    // Which is what keeps the line above from being a layout change. As an
    // inline-block it sat on a baseline, and the space that reserves below it
    // was enough to overflow the container it fills.
    const src = fs.readFileSync(path.join(DIR, 'content-script.js'), 'utf8')
    const tag = src.match(/<textarea\s+class="\$\{uniquePrefix\}_textarea"\s+style="([^"]*)"/)
    ok(tag, 'could not find the editor textarea')
    ok(/(^|;)\s*display:\s*block/.test(tag[1]),
       `the editor textarea does not declare display:block: ${tag[1]}`)
})

// ------------------------------------------ which pages the extension takes

console.log('\nthe extension takes over the pages it should')

// Nothing here should reach the network: connect() is the moment the page
// would be fetched a second time, so standing in for it is exactly the
// question being asked.
crun('connect = p => { globalThis.__connected = p }; setupDragAndDrop = () => {}')

function deliver_load(url, headers, dev_message) {
    page.win.__connected = undefined
    for (const listener of page.told)
        listener({ cmd: 'loaded', url, headers, request_headers: {}, dev_message }, {}, () => { })
    return page.win.__connected
}

const braid_headers = { vary: 'subscribe', 'content-type': 'text/plain' }
const plain_headers = { 'content-type': 'text/html' }
const panel_open = { asked_for: false, merge_type: 'simpleton' }
const panel_asked = { asked_for: true, merge_type: 'simpleton' }

check('a page advertising Braid is taken over', () => {
    ok(deliver_load('https://x.test/1', braid_headers, undefined), 'left alone')
})

check('an ordinary website is left alone', () => {
    eq(deliver_load('https://x.test/2', plain_headers, undefined), undefined, 'taken over')
})

check('having the panel open is not on its own a reason to take one over', () => {
    // The panel says what it is asking for on every page, so this arrives at
    // every ordinary website you visit while it is open
    eq(deliver_load('https://x.test/3', plain_headers, panel_open), undefined, 'taken over')
})

check('asking for something in the panel does take one over', () => {
    ok(deliver_load('https://x.test/4', plain_headers, panel_asked), 'left alone')
})

check('a Braid page loading with the panel open is connected the panel\'s way', () => {
    eq(deliver_load('https://x.test/5', braid_headers, panel_open).merge_type, 'simpleton',
       'the panel\'s merge-type')
})

check('a page handed back by the back button says its history over again', () => {
    // Nothing else can say it: no request goes out, so the background hears
    // nothing, and this script is the one that was already here
    crun('versions = [{ method: "GET", version: ["a-0"] }]; headers = { subscribe: "?1" }')
    page.said.length = 0
    for (const fn of page.listening.pageshow ?? []) fn({ persisted: true })

    const init = page.said.find(m => m.action === 'init')
    ok(init, 'devtools was left showing the page you came from')
    eq(init.versions, [{ method: 'GET', version: ['a-0'] }], 'the history it sent')
})

check('an ordinary reload is left to say it in the usual way', () => {
    // persisted is false for a document that was really built again, and that
    // one announces itself through the background as it always did
    page.said.length = 0
    for (const fn of page.listening.pageshow ?? []) fn({ persisted: false })
    eq(page.said.filter(m => m.action === 'init').length, 0, 'said it twice')
})

// ------------------------------------------------- the background, on its own

console.log('\nthe background hands each page the settings that apply to it')

// Enough of the extension APIs for service-worker.js to register itself, and
// a way to fire each event the way the browser would.
function make_worker() {
    const sent = []
    const hooks = {}
    const hook = name => ({ addListener: fn => (hooks[name] ??= []).push(fn) })
    const win = {
        console: { log() { } },
        chrome: {
            tabs: {
                onUpdated: hook('updated'), onRemoved: hook('removed'),
                sendMessage: (tabid, message, cb) => { sent.push({ tabid, message }); cb?.() },
            },
            webRequest: {
                onSendHeaders: hook('sending'), onHeadersReceived: hook('received'),
            },
            runtime: { onConnect: hook('connect'), onMessage: hook('message'), lastError: null },
        },
    }
    win.window = win, win.self = win, win.globalThis = win
    const w = { win, sent, ctx: vm.createContext(win) }
    w.fire = (name, ...args) => (hooks[name] ?? []).forEach(fn => fn(...args))
    load(w.ctx, 'service-worker.js')
    return w
}

// Opening the panel on a tab, announcing what its controls currently say
function open_panel(w, tabid, settings) {
    let deliver = null, disconnect = null
    const port = {
        name: 'braid-devtools-panel', postMessage() { },
        onMessage: { addListener: fn => (deliver = fn) },
        onDisconnect: { addListener: fn => (disconnect = fn) },
    }
    w.fire('connect', port)
    deliver({ cmd: 'init', tab_id: tabid, ...settings })
    return { say: deliver, close: () => disconnect() }
}

// A navigation, in the order the browser really reports one: the request goes
// out, the content script is parsed and runs and announces itself, and only
// then does webRequest get around to the response headers.
function navigate(w, tabid, url) {
    w.fire('sending', { tabId: tabid, requestHeaders: [{ name: 'Accept', value: 'text/plain' }] })
    w.fire('message', { cmd: 'ready' }, { tab: { id: tabid, url } })
    w.fire('received', { tabId: tabid, statusCode: 200, responseHeaders: [] })
}

const loaded_msgs = w => w.sent.filter(s => s.message.cmd === 'loaded')

check('a page that asks before the headers arrive is answered once, afterwards', () => {
    const w = make_worker()
    navigate(w, 7, 'https://x.test/a')
    const loads = loaded_msgs(w)
    eq(loads.length, 1, 'loaded messages')
    ok(loads[0].message.headers, 'answered without the headers it was waiting for')
})

check('a page loading while the panel is open is given the panel\'s settings', () => {
    const w = make_worker()
    open_panel(w, 7, { merge_type: 'simpleton', subscribe: true })
    navigate(w, 7, 'https://x.test/a')
    eq(loaded_msgs(w).pop().message.dev_message.merge_type, 'simpleton', 'merge-type')
})

check('so is the next url, and the version pinned in the panel goes with it', () => {
    // Resources that move in step name their versions alike, so carrying the
    // pin across is the point; a resource that has never heard of it says so.
    const w = make_worker()
    open_panel(w, 7, { merge_type: 'dt', version: '"a"-3' })
    navigate(w, 7, 'https://x.test/a')
    navigate(w, 7, 'https://x.test/b')
    const last = loaded_msgs(w).pop().message
    eq(last.url, 'https://x.test/b', 'the url answered')
    eq(last.dev_message.version, '"a"-3', 'the pinned version')
})

check('closing the panel stops it steering the loads that come after', () => {
    const w = make_worker()
    const panel_1 = open_panel(w, 7, {})
    panel_1.say({ cmd: 'rerequest', merge_type: 'simpleton' })
    navigate(w, 7, 'https://x.test/a')
    eq(loaded_msgs(w).pop().message.dev_message.merge_type, 'simpleton', 'while it was open')

    panel_1.close()
    navigate(w, 7, 'https://x.test/a')
    eq(loaded_msgs(w).pop().message.dev_message, undefined, 'settings outlived the panel')
})

check('a panel reconnecting after the background slept brings its settings back', () => {
    // The background is an event page: it wakes with nothing, and this is the
    // only way the settings return. Before, you had to toggle a control.
    const w = make_worker()
    open_panel(w, 7, { merge_type: 'simpleton' })
    const woken = make_worker()          // a fresh background, remembering nothing
    open_panel(woken, 7, { merge_type: 'simpleton' })
    navigate(woken, 7, 'https://x.test/a')
    eq(loaded_msgs(woken).pop().message.dev_message.merge_type, 'simpleton', 'merge-type')
})

check('one tab\'s panel does not steer another tab', () => {
    const w = make_worker()
    open_panel(w, 7, { merge_type: 'simpleton' })
    navigate(w, 9, 'https://x.test/a')
    eq(loaded_msgs(w).pop().message.dev_message, undefined, 'leaked across tabs')
})

check('nothing remembered about a tab outlives it', () => {
    const w = make_worker()
    open_panel(w, 7, { merge_type: 'simpleton' })
    navigate(w, 7, 'https://x.test/a')
    w.fire('removed', 7, {})
    for (const map of ['tab_to_dev', 'tab_to_last_dev_message', 'latest_headers_for_tab',
                       'latest_request_headers_for_tab', 'waiting_for_headers'])
        eq(vm.runInContext(`Object.keys(${map})`, w.ctx), [], `${map} still holds the tab`)
})

check('headers from the page being left do not answer for the page arriving', () => {
    // Serving them is what made a second reload look like it had worked
    const w = make_worker()
    navigate(w, 7, 'https://x.test/a')
    w.fire('sending', { tabId: 7, requestHeaders: [] })
    eq(vm.runInContext('latest_headers_for_tab[7]', w.ctx), undefined, 'stale headers kept')
})

// ----------------------------------------------------------------- summary

console.log(`\n${passed} passed, ${failed} failed\n`)
process.exit(failed ? 1 : 0)
