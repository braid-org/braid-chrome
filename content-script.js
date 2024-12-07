// console.log(`RUNNING content SCRIPT!`)

var httpx = 'HTTP'

var peer = Math.random().toString(36).substr(2)
var version = null
var parents = null
var content_type = null
var merge_type = null
var subscribe = true
var edit_source = false

var online = null
var show_editor = null

var headers = {}
var versions = []
var raw_messages = []
var get_failed = ''

var doc = null
var default_version_count = 1
var on_show_diff = () => { }
var get_parents = () => null

var abort_controller = new AbortController();

window.errorify = (msg) => {
  console.log(`errorify: ${msg?.stack ?? msg}`)
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
  // console.log(`on_bytes_received[${s.slice(0, 500)}]`)
  raw_messages.push(s)
  chrome.runtime.sendMessage({ action: "braid_in", data: s })
}

function on_bytes_going_out(url, params) {
  if (!on_bytes_going_out.chain) on_bytes_going_out.chain = Promise.resolve()
  on_bytes_going_out.chain = on_bytes_going_out.chain.then(async () => {
    let data = await constructHTTPRequest(url, params)
    // console.log(`on_bytes_going_out[${data}]`)
    raw_messages.push(data)
    chrome.runtime.sendMessage({ action: "braid_out", data })
  })
}

window.subscription_online = false
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
    abort_controller.abort()
    location.reload()
  }
  if (request.cmd == 'init') {
    chrome.runtime.sendMessage({ action: "init", headers, versions, raw_messages, get_failed })
  } else if (request.cmd == "show_diff") {
    on_show_diff(request.from_version)
  } else if (request.cmd == "edit_source") {
    edit_source = true
    show_editor()
  } else if (request.cmd == "reload") {
    reload()
  } else if (request.cmd == 'loaded') {
    version = request.dev_message?.version
    parents = request.dev_message?.parents
    let req_content_type = request.headers?.['content-type']?.split(/[;,]/)[0]
    content_type = request.dev_message?.content_type || req_content_type
    merge_type = request.dev_message?.merge_type || request.headers['merge-type']
    subscribe = !(request.dev_message?.subscribe === false)
    edit_source = request.dev_message?.edit_source

    headers = {}
    for (let x of Object.entries(request.headers)) headers[x[0]] = x[1]

    chrome.runtime.sendMessage({ action: "init", headers, versions, raw_messages, get_failed })

    if (version || parents) handle_specific_version()
    else if (subscribe) handle_subscribe()
  }
})

async function handle_specific_version() {
  window.stop()
  document.body.innerHTML = '<textarea disabled style="position: fixed; left: 0px; top: 0px; right: 0px; bottom: 0px; padding: 13px 8px; font-size: 13px; border: 0; box-sizing: border-box; background: transparent;"></textarea>'
  document.body.style.background = 'none'
  let textarea = document.body.firstChild

  try {
    response = await braid_fetch_wrapper(window.location.href, {
      version: version ? JSON.parse(`[${version}]`) : null,
      parents: parents ? JSON.parse(`[${parents}]`) : null,
      peer,
      headers: { Accept: content_type, ...(merge_type ? { ['Merge-Type']: merge_type } : {}) },
      signal: abort_controller.signal,
      retry: true
    })

    headers = {}
    for (let x of response.headers.entries()) headers[x[0].toLowerCase()] = x[1]
    chrome.runtime.sendMessage({ action: "new_headers", headers })

    textarea.textContent = await response.text()
  } catch (e) {
    console.log('braid_fetch_wrapper failed: ' + e)
    get_failed = '' + e
    chrome.runtime.sendMessage({ action: "get_failed", get_failed })
    textarea.value = get_failed

    textarea.style.border = '4px red solid'
    textarea.style.background = '#fee'
    chrome.runtime.sendMessage({ action: "get_failed", get_failed: '' + e })
  }
}

async function handle_subscribe() {
  window.stop()
  let uniquePrefix = '_' + Math.random().toString(36).slice(2)
  let main_div = make_html(`<div
          style="position: fixed; left: 0px; top: 0px; right: 0px; bottom: 0px; box-sizing: border-box;"
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
              style="width: 100%; height:100%; padding: 13px 8px; font-size: 13px; border: 0; box-sizing: border-box; background: transparent;"
              readonly
              disabled
          ></textarea>
      </div>`)
  let diff_d = main_div.querySelector(`.${uniquePrefix}_diff_d`)
  online = main_div.querySelector(`.${uniquePrefix}_online`)
  let textarea = main_div.querySelector(`.${uniquePrefix}_textarea`)
  show_editor = () => {
    document.body.innerHTML = ''
    document.body.style.background = 'none'
    document.body.append(main_div)
  }

  let on_fail = e => {
    console.log(e?.stack || e)
    textarea.style.border = '4px red solid'
    textarea.style.background = '#fee'
    textarea.disabled = true
    chrome.runtime.sendMessage({ action: "get_failed", get_failed: '' + e })
  }

  try {
    response = await braid_fetch_wrapper(window.location.href, {
      version: null,
      parents: () => get_parents(),
      peer,
      headers: { Accept: content_type, ...(merge_type ? { ['Merge-Type']: merge_type } : {}) },
      signal: abort_controller.signal,
      subscribe: true,
      retry: true
    })
  } catch (e) {
    console.log('braid_fetch_wrapper failed: ' + e)
    get_failed = '' + e
    chrome.runtime.sendMessage({ action: "get_failed", get_failed })
    textarea.value = get_failed
    on_fail(e)
    return
  }

  headers = {}
  for (let x of response.headers.entries()) headers[x[0].toLowerCase()] = x[1]
  chrome.runtime.sendMessage({ action: "new_headers", headers })

  if (headers.subscribe !== 'true') return

  if (headers['merge-type']) merge_type = headers['merge-type']

  if (headers['content-type']?.split(/[;,]/)[0] !== 'text/html' || edit_source) show_editor()

  if (merge_type === 'dt') {
    let wasmModuleBuffer = await (await fetch(chrome.runtime.getURL('dt_bg.wasm'))).arrayBuffer();
    const imports = __wbg_get_imports();
    __wbg_init_memory(imports);
    const module = await WebAssembly.compile(wasmModuleBuffer);
    const instance = await WebAssembly.instantiate(module, imports);
    __wbg_finalize_init(instance, module);

    let last_text = "";
    let last_text_code_points = 0;

    let outstandings = make_linklist();

    doc = new Doc(peer);

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

      const diffArray = dt_diff_from(doc, from_version);
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

      let v = doc.getRemoteVersion().map(v => v.join('-'));
      if (numCodePointsToDelete)
        for (let i = 0; i < numCodePointsToDelete; i++)
          doc.del(commonStart_codePoints + numCodePointsToDelete - 1 - i, 1)
      if (stuffToInsert) doc.ins(commonStart_codePoints, stuffToInsert);

      for (let p of dt_get_patches(doc, v)) {
        //   console.log(JSON.stringify(p));

        let start_version_seq = decode_version(p.version)[1] - (p.end - p.start - 1)
        if (p.end - p.start < 1) throw 'unexpected patch with nothing'
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

              let new_doc = dt_get(doc, doc.getRemoteVersion().map(v => {
                if (v[0] === peer) v[1] = start_version_seq - 1
                return v.join('-')
              }))
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

    response.subscribe(update => {
      let { version, parents, patches, body, status } = update
      if (status && parseInt(status) !== 200)
        return console.log(`ignoring update with status ${status}`)
      if (body) body = update.body_text
      if (patches) for (let p of patches) p.content = p.content_text

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

      let v = doc.getLocalVersion();

      try {
        patches = patches.map((p) => ({
          ...p,
          range: p.range.match(/\d+/g).map((x) => parseInt(x)),
          ...(p.content ? { content: p.content, content_codepoints: [...p.content] } : {}),
        }))

        let v = decode_version(version[0])
        v = encode_version(v[0], v[1] + 1 - patches.reduce((a, b) => a + (b.content?.length ? b.content_codepoints.length : 0) + (b.range[1] - b.range[0]), 0))

        let ps = parents

        let offset = 0
        for (let p of patches) {
          // delete
          let del = p.range[1] - p.range[0]
          if (del) {
            doc.mergeBytes(dt_create_bytes(v, ps, p.range[0] + offset, del, null))
            offset -= del
            v = decode_version(v)
            ps = [`${v[0]}-${v[1] + (del - 1)}`]
            v = `${v[0]}-${v[1] + del}`
          }
          // insert
          if (p.content?.length) {
            doc.mergeBytes(dt_create_bytes(v, ps, p.range[1] + offset, 0, p.content))
            offset += p.content_codepoints.length
            v = decode_version(v)
            ps = [`${v[0]}-${v[1] + (p.content_codepoints.length - 1)}`]
            v = `${v[0]}-${v[1] + p.content_codepoints.length}`
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
        doc.xfSince(v)
      );

      textarea.value = last_text = new_text;
      last_text_code_points = count_code_points(last_text);
      textarea.selectionStart = new_sel[0];
      textarea.selectionEnd = new_sel[1];
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
      if (update.status && parseInt(update.status) !== 200) return console.log(`ignoring update with status ${update.status}`)
      if (update.body) update.body = update.body_text
      if (update.patches) for (let p of update.patches) p.content = p.content_text

      if (textarea.hasAttribute("readonly")) {
        textarea.removeAttribute("readonly")
        textarea.removeAttribute('disabled')
        // textarea.focus()
      }

      if (current_version.length === (!update.parents ? 0 : update.parents.length) && current_version.every((v, i) => v === update.parents[i])) {
        current_version = update.version

        if (update.body != null) textarea.value = update.body
        else if (update.patches?.[0]?.unit === 'xpath')
          applyDomDiff(main_div, update.patches)
        else apply_patches_and_update_selection(textarea, update.patches)
        last_seen_state = textarea.value

        let new_version = {
          ...update,
          method: "GET",
        }
        if (!new_version.patches) new_version.patches = [{ unit: 'body', range: '', content: update.body }]

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

    response.subscribe(update => {
      let { version, parents, patches, body, status } = update
      if (status && parseInt(status) !== 200) return console.log(`ignoring update with status ${status}`)
      if (body) body = update.body_text
      if (patches) for (let p of patches) p.content = p.content_text

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

async function constructHTTPRequest(url, params) {
  let httpRequest = `${params.method ?? 'GET'} ${url}\r\n`
  for (var pair of params.headers.entries()) {
    httpRequest += `${pair[0]}: ${pair[1]}\r\n`
  }
  httpRequest += '\r\n';
  if (['POST', 'PATCH', 'PUT'].includes(params.method?.toUpperCase()) && params.body) {
    httpRequest += typeof params.body === 'string' ? params.body : new TextDecoder().decode(params.body instanceof Uint8Array ? params.body : new Uint8Array(params.body instanceof Blob ? new Uint8Array(await params.body.arrayBuffer()) : ArrayBuffer.isView(params.body) ? params.body.buffer : new Uint8Array(binary)))
  }
  httpRequest += '\r\n\r\n'
  return httpRequest
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
