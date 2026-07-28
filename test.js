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
// The two things worth guarding are the transformations dt.js needs after
// every diamond-types rebuild, which have broken silently before, and the
// history view's layout, which computes row geometry in plain arrays and must
// give the same answer whether it built it all at once or a version at a time.

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
            remove() {},
            closest: () => null,
            getBoundingClientRect: () => ({ x: 0, y: 0, width: 0, height: 12 }),
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
        getElementById: id => (by_id[id] = by_id[id] || el('div')),
        addEventListener() {},
    }
    const win = {
        document, console,
        requestAnimationFrame: f => f(),
        addEventListener() {}, onload: null,
        setTimeout, clearTimeout, atob, btoa,
        TextEncoder, TextDecoder, performance,
        crypto: require('crypto').webcrypto,
        backgroundConnection: { postMessage() {} },
        navigator: { userAgent: 'test' },
        location: { href: 'about:blank' },
        chrome: {
            runtime: {
                getURL: f => path.join(DIR, f),
                connect: () => ({ postMessage() {}, onMessage: { addListener() {} } }),
                onMessage: { addListener() {} },
            },
            devtools: { inspectedWindow: { tabId: 1 } },
        },
    }
    win.window = win
    win.self = win
    win.globalThis = win

    // The ids panel.js expects the markup to have provided
    for (const id of ['id_messages', 'id_raw_messages', 'subscribe_response',
        'encoding_response', 'version_response', 'parents_response',
        'merge_type_response', 'content_type_response', 'error_d', 'error_d_label',
        'edit_source_d', 'encoding_request', 'merge_type_select',
        'content_type_select', 'subscribe_request', 'version_request',
        'parents_request', 'edit_source', 'resubmit_button', 'show_resubmit'])
        win[id] = by_id[id] = el('div')

    return { win, by_id, ctx: vm.createContext(win) }
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

// ----------------------------------------------------------------- summary

console.log(`\n${passed} passed, ${failed} failed\n`)
process.exit(failed ? 1 : 0)
