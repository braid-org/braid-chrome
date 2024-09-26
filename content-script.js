// console.log(`RUNNING content SCRIPT!`)

var httpx = 'HTTP'

var peer = Math.random().toString(36).substr(2)
var version = null
var parents = null
var content_type = null
var merge_type = null
var subscribe = true

var headers = {}
var versions = []
var raw_messages = []
var raw_prepend = null
var get_failed = ''

var oplog = null
var default_version_count = 1
var on_show_diff = () => { }
var get_parents = () => null

var abort_controller = new AbortController();

window.errorify = (msg) => {
  console.log(`errorify: ${msg}`)
  let textarea = document.getElementById('textarea')
  if (textarea) {
    textarea.style.background = 'pink'
    textarea.style.color = '#800'
    textarea.disabled = true
  }
  throw new Error(msg)
}

function on_bytes_received(s) {
  s = (new TextDecoder()).decode(s)

  if (raw_prepend) {
    raw_messages.push(raw_prepend)
    chrome.runtime.sendMessage({ action: "braid_in", data: raw_prepend })
    raw_prepend = null
  }

  s = s.replace(/(\r?\n\r?\n)(Version:)/g, (_0, _1, _2) => {
    return _1 + `${httpx} 200 OK\r\n` + _2
  })

  // console.log(`on_bytes_received[${s.slice(0, 500)}]`)
  raw_messages.push(s)
  chrome.runtime.sendMessage({ action: "braid_in", data: s })
}

function on_bytes_going_out(url, params) {
  let data = constructHTTPRequest(url, params)
  // console.log(`on_bytes_going_out[${data}]`)
  raw_messages.push(data)
  chrome.runtime.sendMessage({ action: "braid_out", data })
}

window.subscription_online = false
function set_subscription_online(bool) {
  if (window.subscription_online === bool) return
  window.subscription_online = bool
  console.log(bool ? 'Connected!' : 'Disconnected.')
  var online = document.querySelector("#online")?.style
  if (online) online.color = bool ? 'lime' : 'orange';
}

// This replaces the page with our "live-update" view of TEXT or JSON
chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
  // console.log(`getting message with cmd: ${request.cmd}`)
  let reload = () => {
    console.log('reloading!')
    abort_controller.abort()
    location.reload()
  }
  if (request.cmd == 'init') {
    chrome.runtime.sendMessage({ action: "init", headers, versions, raw_messages, get_failed })
  } else if (request.cmd == "show_diff") {
    on_show_diff(request.from_version)
  } else if (request.cmd == "edit_source") {
    if (request.edit_source) subscribe_with_editor()
    else reload()
  } else if (request.cmd == "reload") {
    reload()
  } else if (request.cmd == 'loaded') {
    version = request.dev_message?.version
    parents = request.dev_message?.parents
    let req_content_type = request.headers['content-type']?.split(/[;,]/)[0]
    content_type = request.dev_message?.content_type || req_content_type
    merge_type = request.dev_message?.merge_type || request.headers['merge-type']
    subscribe = request.dev_message ? request.dev_message?.subscribe : true

    headers = {}
    for (let x of Object.entries(request.headers)) headers[x[0]] = x[1]

    chrome.runtime.sendMessage({ action: "init", headers, versions, raw_messages, get_failed })

    // this next section implements this part of the readme.md
    // - Live-updates any Braid-HTTP page, without the reload button
    //   - Sends `Subscribe: true` for pages with content-type of text, markdown, javascript, or json, as well as html pages that send a `Subscribed: false` header
    //   - If response has `Subscribe: true`, the page live-updates as updates occur to it

    let should_we_handle_this = request.dev_message?.content_type || ({ 'text/plain': true, 'application/json': true, 'application/javascript': true, 'text/markdown': true, 'text/html': headers.subscribed === 'false' })[req_content_type]

    // console.log(`should_we_handle_this = ${should_we_handle_this}`)
    if (!should_we_handle_this) return

    // let's see empirically whether the server is willing to entertain a subscription
    var response = await fetch(window.location.href, {headers: {Accept: content_type, Subscribe: true}})

    if (response.headers.get('subscribe')) subscribe_with_editor()
  }
})

async function subscribe_with_editor() {
  window.stop();

  let main_div = null
  let textarea = null
  let set_new_body = merge_type => {
    document.documentElement.innerHTML = merge_type == 'simpleton-html' ? `
          <body>
              <span id="online" style="position: absolute; top: 5px; right: 5px;">•</span>
              <div id="main_div"></div>
          </body>
      ` : `
          <body
              style="padding: 0px; margin: 0px; width: 100vw; height: 100vh; overflow: clip; box-sizing: border-box;"
          >
              <pre id="diff_d" style="display:none;position: absolute; top: 0px; left: 0px; right: 0px; bottom: 0px;padding: 13px 8px; font-size: 13px;font-family: monospace;overflow:scroll;margin:0px; white-space: pre-wrap; word-wrap: break-word; overflow-wrap: break-word;"></pre>
              <span id="online" style="position: absolute; top: 5px; right: 5px;">•</span>
              <textarea
              id="textarea"
              style="width: 100%; height:100%; padding: 13px 8px; font-size: 13px; border: 0; box-sizing: border-box; background: transparent;"
              readonly
              disabled
              ></textarea>
          </body>
      `
    main_div = document.querySelector("#main_div")
    textarea = document.querySelector("#textarea")
  }
  let on_fail = e => {
    console.log(e?.stack || e)
    document.body.style.border = '4px red solid'
    document.body.style.margin = '0px'
    document.body.style.background = '#fee'
    textarea.style.background = '#fee'
    textarea.disabled = true
    chrome.runtime.sendMessage({ action: "get_failed", get_failed: '' + e })
  }

  let response = null
  try {
    let options = {
      version: !subscribe ? (version ? JSON.parse(`[${version}]`) : null) : null,
      parents: !subscribe ? (parents ? JSON.parse(`[${parents}]`) : null) : () => get_parents(),
      peer,
      headers: { Accept: content_type, ...(merge_type ? { ['Merge-Type']: merge_type } : {}) },
      signal: abort_controller.signal
    }
    if (subscribe) {
      options.subscribe = true
      options.retry = true
    }
    response = await braid_fetch_wrapper(window.location.href, options)
  } catch (e) {
    console.log('braid_fetch_wrapper failed: ' + e)
    get_failed = '' + e
    chrome.runtime.sendMessage({ action: "get_failed", get_failed })
    set_new_body()
    on_fail(e)
    textarea.value = get_failed
    return
  }

  headers = {}
  for (let x of response.headers.entries()) headers[x[0].toLowerCase()] = x[1]
  chrome.runtime.sendMessage({ action: "new_headers", headers })

  if (headers['merge-type']) merge_type = headers['merge-type']

  let is_html = headers['content-type']?.split(';')[0] === 'text/html'

  if (is_html && headers.subscribe == null) return

  set_new_body(merge_type)

  if (headers.subscribe == null) return textarea.textContent = await response.text()

  if (merge_type === 'dt') {
    let wasmModuleBuffer = await(await fetch(chrome.runtime.getURL('dt_bg.wasm'))).arrayBuffer();
    const imports = __wbg_get_imports();
    __wbg_init_memory(imports);
    const module = await WebAssembly.compile(wasmModuleBuffer);
    const instance = await WebAssembly.instantiate(module, imports);
    __wbg_finalize_init(instance, module);

    let last_text = "";
    let last_text_code_points = 0;

    let outstandings = make_linklist();

    oplog = new Doc(peer);

    on_show_diff = (from_version) => {
      var scrollPos = (window.getComputedStyle(diff_d).display === "none") ? {
        vertical: textarea.scrollTop,
        horizontal: textarea.scrollLeft
      } : {
        vertical: diff_d.scrollTop,
        horizontal: diff_d.scrollLeft
      };

      if (!from_version) {
        diff_d.style.display = 'none';
        textarea.style.display = 'block';
        textarea.scrollTop = scrollPos.vertical
        textarea.scrollLeft = scrollPos.horizontal
        return
      }

      diff_d.style.display = 'block';
      textarea.style.display = 'none';

      const diffArray = OpLog_diff_from(oplog, from_version);
      diff_d.innerHTML = '';
      diffArray.forEach(element => {
        let [status, text] = element;
        let spanElem = document.createElement('span');
        switch (status) {
          case -1:
            // Deleted text with a red background
            spanElem.style.backgroundColor = '#ffa8a850';
            break;
          case 1:
            // Inserted text with a green background
            spanElem.style.backgroundColor = '#a8ffaa50';
            break;
        }
        spanElem.textContent = text;
        diff_d.appendChild(spanElem);
      });
      diff_d.scrollTop = scrollPos.vertical
      diff_d.scrollLeft = scrollPos.horizontal
    }

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

      let v = oplog.getRemoteVersion().map(v => v.join('-'));
      if (numCodePointsToDelete) oplog.del(commonStart_codePoints, numCodePointsToDelete);
      if (stuffToInsert) oplog.ins(commonStart_codePoints, stuffToInsert);

      for (let p of dt_get_patches(oplog, v)) {
        //   console.log(JSON.stringify(p));

        p.version = decode_version(p.version)
        let start_version_seq = p.version[1]
        if (p.end - p.start < 1) throw 'unexpected patch with nothing'
        p.version[1] += p.end - p.start - 1
        p.version = p.version.join('-')
        p.version = [p.version]

        let ops = {
          retry: true,
          method: "PUT",
          mode: "cors",
          headers: { "Content-Type": content_type },
          version: p.version,
          parents: p.parents,
          patches: [
            {
              unit: p.unit,
              range: p.range,
              content: p.content,
            },
          ],
          peer
        };
        versions.push(ops)
        chrome.runtime.sendMessage({ action: "new_version", version: ops })

        let outstanding = {
          version: p.version,
          ac: new AbortController(),
        }
        ops.signal = outstanding.ac.signal
        outstandings.push(outstanding)
        textarea.style.caretColor = 'red'

        rest()
        async function rest() {
          try {
            await braid_fetch_wrapper(window.location.href, ops);
            outstandings.remove(ops)
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
                chrome.runtime.sendMessage({ action: "new_version", remove_version: x.version })
                outstandings.remove(x)
                x = x.next
              }

              oplog = dt_get(oplog, oplog.getRemoteVersion().map(v => {
                if (v[0] === peer) v[1] = start_version_seq - 1
                return v.join('-')
              }))

              textarea.value = last_text = oplog.get()
              last_text_code_points = count_code_points(last_text)
            } else on_fail(e)
          }
          if (!outstandings.size) textarea.style.caretColor = ''
        }
      }
    });

    response.subscribe(({ version, parents, body, patches }) => {
      if (textarea.hasAttribute("readonly")) {
        textarea.removeAttribute("readonly")
        textarea.removeAttribute('disabled')
        // textarea.focus()
      }

      if (!patches) {
        let new_version = {
          method: "GET",
          version,
          parents,
          patches: [{ unit: 'text', range: '[0:0]', content: body }]
        }
        versions.push(new_version)
        chrome.runtime.sendMessage({ action: "new_version", version: new_version })
        return;
      }

      let new_version = {
        method: "GET",
        version,
        parents,
        patches
      }
      versions.push(new_version)
      chrome.runtime.sendMessage({ action: "new_version", version: new_version })

      let v = oplog.getLocalVersion();

      try {
        patches = patches.map((p) => ({
          ...p,
          range: p.range.match(/\d+/g).map((x) => parseInt(x)),
          ...(p.content ? { content: [...p.content] } : {}),
        }))

        let v = decode_version(version[0])
        v = encode_version(v[0], v[1] + 1 - patches.reduce((a, b) => a + b.content.length + (b.range[1] - b.range[0]), 0))

        let ps = parents

        let offset = 0
        for (let p of patches) {
          // delete
          for (let i = p.range[0]; i < p.range[1]; i++) {
            oplog.mergeBytes(dt_create_bytes(v, ps, p.range[1] - 1 + offset, null))
            offset--
            ps = [v]
            v = decode_version(v)
            v = encode_version(v[0], v[1] + 1)
          }
          // insert
          for (let i = 0; i < p.content?.length ?? 0; i++) {
            let c = p.content[i]
            oplog.mergeBytes(dt_create_bytes(v, ps, p.range[1] + offset, c))
            offset++
            ps = [v]
            v = decode_version(v)
            v = encode_version(v[0], v[1] + 1)
          }
        }
      } catch (e) {
        errorify(e)
      }
      let sel = [textarea.selectionStart, textarea.selectionEnd];

      if (textarea.value != last_text) {
        errorify("textarea out of sync somehow!")
      }

      let [new_text, new_sel] = applyChanges(
        textarea.value,
        sel,
        oplog.xfSince(v)
      );

      textarea.value = last_text = new_text;
      last_text_code_points = count_code_points(last_text);
      textarea.selectionStart = new_sel[0];
      textarea.selectionEnd = new_sel[1];
    }, on_fail)
  } else if (merge_type === 'simpleton-html') {
    console.log(`doing simpleton-html.. content-type=${headers['content-type']}`)

    response.subscribe(update => {
      let new_version = {
        ...update,
        method: "GET",
      }
      if (!new_version.patches) new_version.patches = [{ unit: 'xpath', range: '/', content: update.body }]

      applyDomDiff(main_div, new_version.patches)

      versions.push(new_version)
      chrome.runtime.sendMessage({ action: "new_version", version: new_version })
    }, on_fail)
  } else if (merge_type == 'simpleton') {

    console.log(`got simpleton..`)

    var char_counter = -1   // Counts the numbers of inserts and deletes generated by this client

    var current_version = []
    var last_seen_state = null
    var outstanding_changes = make_linklist()
    var max_outstanding_changes = 10

    get_parents = () => current_version

    response.subscribe(update => {
      if (textarea.hasAttribute("readonly")) {
        textarea.removeAttribute("readonly")
        textarea.removeAttribute('disabled')
        // textarea.focus()
      }

      if (current_version.length === (!update.parents ? 0 : update.parents.length) && current_version.every((v, i) => v === update.parents[i])) {
        current_version = update.version
        if (update.body != null) textarea.value = update.body
        else apply_patches_and_update_selection(textarea, update.patches)
        last_seen_state = textarea.value

        let new_version = {
          ...update,
          method: "GET",
        }
        if (!new_version.patches) new_version.patches = [{ unit: 'text', range: '[0:0]', content: update.body }]

        versions.push(new_version)
        chrome.runtime.sendMessage({ action: "new_version", version: new_version })
      }
    }, on_fail)

    function produce_local_update(prev_state) {
      var patches = get_patches_for_diff(prev_state, textarea.value)
      // After an edit, the DT version-type requires we increment the current version
      // (aka "char_counter") by the number of characters that have been inserted or deleted
      char_counter += count_chars_in_patches(patches)
      return { patches, version: peer + '-' + char_counter, state: textarea.value }
    }

    // Wire up the Textarea
    textarea.value = ""
    textarea.oninput = async e => {
      if (outstanding_changes.size >= max_outstanding_changes) return
      while (true) {
        var { patches, version, state } = produce_local_update(last_seen_state)
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
          headers: { "Merge-Type": "simpleton", "Content-Type": content_type },
          method: "PUT",
          retry: true,
          version, parents, patches,
          peer,
          signal: outstanding_change.ac.signal,
        }
        versions.push(ops)
        chrome.runtime.sendMessage({ action: "new_version", version: ops })

        textarea.style.caretColor = 'red'
        try {
          await braid_fetch_wrapper(window.location.href, ops)
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
            chrome.runtime.sendMessage({ action: "new_version", remove_count: start_size - outstanding_changes.size })

            textarea.value = last_seen_state = outstanding_change.restore_state
            current_version = outstanding_change.restore_version
          } else on_fail(e)
        }
        if (!outstanding_changes.size) textarea.style.caretColor = ''
      }
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
          headers: { "Content-Type": content_type },
          method: "PUT",
          retry: true,
          version: ['default-' + default_version_count++],
          parents: last_version,
          patches: [{ unit: 'json', range: '', content: JSON.stringify(doc) }],
          peer
        }
        versions.push(new_version)
        chrome.runtime.sendMessage({ action: "new_version", version: new_version })

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
                chrome.runtime.sendMessage({ action: "new_version", override_versions: versions })
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

    response.subscribe(({ version, parents, body, patches }) => {

      if (textarea.hasAttribute("readonly")) {
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
        chrome.runtime.sendMessage({ action: "new_version", version: new_version })
      } catch (e) {
        console.log(`eeee = ${e}`)
        console.log(`eeee = ${e.stack}`)
      }
      textarea.value = JSON.stringify(doc)
      set_style_good(true)
    }, on_fail)
  }
}

function constructHTTPRequest(url, params) {
  let httpRequest = `${params.method ?? 'GET'} ${url}\r\n`;
  for (var pair of params.headers.entries()) {
    httpRequest += `${pair[0]}: ${pair[1]}\r\n`;
  }
  httpRequest += '\r\n';
  if (['POST', 'PATCH', 'PUT'].includes(params.method?.toUpperCase()) && params.body) {
    httpRequest += params.body;
  }
  httpRequest += '\r\n\r\n';
  return httpRequest;
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
  return [original, sel];
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

function apply_patches_and_update_selection(textarea, patches) {
  patches = patches.map(p => ({ ...p, range: p.range.match(/\d+/g).map((x) => 1 * x) })).sort((a, b) => a.range[0] - b.range[0])

  // convert from code-points to js-indicies
  let c = 0;
  let i = 0;
  for (let p of patches) {
    while (c < p.range[0]) {
      const charCode = textarea.value.charCodeAt(i)
      i += (charCode >= 0xd800 && charCode <= 0xdbff) ? 2 : 1
      c++
    }
    p.range[0] = i

    while (c < p.range[1]) {
      const charCode = textarea.value.charCodeAt(i)
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

  let original = textarea.value
  let sel = [textarea.selectionStart, textarea.selectionEnd]  // Current cursor & selection

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
    original = original.substring(0, range[0]) + p.content + original.substring(range[1])
  }

  textarea.value = original
  textarea.selectionStart = sel[0]
  textarea.selectionEnd = sel[1]
}

async function braid_fetch_wrapper(url, params) {
  params.onFetch = (...args) => {
    if (params.subscribe) raw_prepend = `${httpx} 104 Multiresponse

${httpx} 200 OK
`
    on_bytes_going_out(...args)
  }
  params.onBytes = (x) => {
    on_bytes_received(x)
    set_subscription_online(true)
  }
  let res = await braid_fetch(url, params)
  let og_sub = res.subscribe
  res.subscribe = (update, error) => {
    og_sub((x) => {
      raw_prepend = `${httpx} 200 OK\n`
      update(x)
    }, error)
  }
  return res
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
