
console.log(`RUNNING content SCRIPT!`)

var version = null
var parents = null
var content_type = null
var merge_type = null

var headers = {}
var versions = []
var raw_messages = []

var oplog = null
var default_version_count = 1
var on_show_diff = () => { }
var get_parents = () => []

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
  console.log(`on_bytes_received[${s.slice(0, 500)}]`)
  raw_messages.push(s)
  chrome.runtime.sendMessage({ action: "braid_in", data: s })
}

function on_bytes_going_out(params, url) {
  let data = constructHTTPRequest(params, url)
  console.log(`on_bytes_going_out[${data}]`)
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
  console.log(`getting message with cmd: ${request.cmd}`)
  if (request.cmd == 'init') {
    chrome.runtime.sendMessage({ action: "init", headers, versions, raw_messages })
  } else if (request.cmd == "show_diff") {
    on_show_diff(request.from_version)
  } else if (request.cmd == "reload") {
    console.log('reloading!')
    location.reload()
  } else if (request.cmd == 'loaded') {
    chrome.runtime.sendMessage({ action: "init", versions, raw_messages, headers })

    version = request.dev_message?.version
    parents = request.dev_message?.parents
    content_type = request.dev_message?.content_type
    merge_type = request.dev_message?.merge_type
    let subscribe = request.dev_message?.subscribe

    let white_list = { 'text/plain': true, 'application/json': true, 'application/javascript': true, 'text/markdown': true }

    let should_we_handle_this = version || parents || content_type || merge_type || subscribe || white_list[request.headers['content-type']] || request.headers['accept-subscribe']

    if (!should_we_handle_this) return

    content_type = content_type || request.headers['content-type']
    merge_type = merge_type || request.headers['merge-type']
    subscribe = subscribe || (!request.dev_message && request.headers['accept-subscribe'])

    await new Promise(done => {
      document.open()
      document.write(`
          <script src="${chrome.runtime.getURL('braid-http-client.js')}"></script>
          <script src="${chrome.runtime.getURL('myers-diff1.js')}"></script>
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
        `);
      document.close()
      window.onload = () => done()
    })
    let textarea = document.querySelector("#textarea");

    var response = await braid_fetch_wrapper(window.location.href,
      {
        retry: true,
        subscribe,
        version: !subscribe ? (version ? JSON.parse(`[${version}]`) : null) : null,
        parents: !subscribe ? (parents ? JSON.parse(`[${parents}]`) : null) : () => get_parents(),
        headers: { Accept: content_type, ...(merge_type ? { ['Merge-Type']: merge_type } : {}) }
      })

    headers = {}
    for (let x of response.headers.entries()) headers[x[0].toLowerCase()] = x[1]
    chrome.runtime.sendMessage({ action: "new_headers", headers })

    if (headers['merge-type']) merge_type = headers['merge-type']

    if (!subscribe) return textarea.textContent = await response.text()

    if (merge_type == 'dt') {
      let wasmModuleBuffer = await (await fetch(chrome.runtime.getURL('dt_bg.wasm'))).arrayBuffer();
      const imports = __wbg_get_imports();
      __wbg_init_memory(imports);
      const module = await WebAssembly.compile(wasmModuleBuffer);
      const instance = await WebAssembly.instantiate(module, imports);
      __wbg_finalize_init(instance, module);

      let last_text = "";

      let sent_count = 0;
      let ack_count = 0;

      oplog = new OpLog(peer);

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

        const diffArray = OpLog_diff_from(oplog, [from_version]);
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
        while (
          commonStart < Math.min(last_text.length, textarea.value.length) &&
          last_text[commonStart] == textarea.value[commonStart]
        ) {
          commonStart++;
        }

        let commonEnd = 0;
        while (
          commonEnd <
          Math.min(
            last_text.length - commonStart,
            textarea.value.length - commonStart
          ) &&
          last_text[last_text.length - commonEnd - 1] ==
          textarea.value[textarea.value.length - commonEnd - 1]
        ) {
          commonEnd++;
        }

        let splicePos = commonStart;
        let numToDelete = last_text.length - commonStart - commonEnd;
        let stuffToInsert = textarea.value.slice(
          commonStart,
          textarea.value.length - commonEnd
        );

        last_text = textarea.value;

        let v = oplog.getLocalVersion();
        if (numToDelete) oplog.del(splicePos, numToDelete);
        if (stuffToInsert) oplog.ins(splicePos, stuffToInsert);

        for (let p of OpLog_get_patches(
          oplog.getPatchSince(v),
          oplog.getOpsSince(v)
        )) {
          //   console.log(JSON.stringify(p));

          p.version = decode_version(p.version)
          if (p.end - p.start < 1) throw 'unexpected patch with nothing'
          p.version[1] += p.end - p.start - 1
          p.version = p.version.join('-')
          p.version = [p.version]

          textarea.style.caretColor = 'orange'
          console.log(`s counts: ${ack_count}/${sent_count}`);

          let ops = {
            retry: true,
            method: "PUT",
            mode: "cors",
            version: p.version,
            parents: p.parents,
            patches: [
              {
                unit: p.unit,
                range: p.range,
                content: p.content,
              },
            ],
          };
          versions.push(ops)
          chrome.runtime.sendMessage({ action: "new_version", version: ops })
          sent_count++
          await braid_fetch_wrapper(window.location.href, ops);
          ack_count++
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
          }))

          let v = decode_version(version[0])
          v = encode_version(v[0], v[1] + 1 - patches.reduce((a, b) => a + b.content.length + (b.range[1] - b.range[0]), 0))

          let ps = parents
          if (!ps.length) ps = ["root"]

          let offset = 0
          for (let p of patches) {
            // delete
            for (let i = p.range[0]; i < p.range[1]; i++) {
              oplog.addFromBytes(OpLog_create_bytes(v, ps, p.range[1] - 1 + offset, null))
              offset--
              ps = [v]
              v = decode_version(v)
              v = encode_version(v[0], v[1] + 1)
            }
            // insert
            for (let i = 0; i < p.content?.length ?? 0; i++) {
              let c = p.content[i]
              oplog.addFromBytes(OpLog_create_bytes(v, ps, p.range[1] + offset, c))
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

        // work here
        // console.log(`op log = ${JSON.stringify(oplog.getXFSince(v), null, 4)}`)

        let [new_text, new_sel] = applyChanges(
          textarea.value,
          sel,
          oplog.getXFSince(v)
        );

        textarea.value = last_text = new_text;
        textarea.selectionStart = new_sel[0];
        textarea.selectionEnd = new_sel[1];
      })
    } else if (merge_type == 'simpleton') {

      console.log(`got simpleton..`)

      var char_counter = -1   // Counts the numbers of inserts and deletes generated by this client

      var current_version = []
      var last_seen_state = null
      var outstanding_changes = 0
      var max_outstanding_changes = 10

      get_parents = () => current_version

      response.subscribe(update => {

        console.log(`got update: ${JSON.stringify(update)}`)

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
      })

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
        if (outstanding_changes >= max_outstanding_changes) return
        while (true) {
          var { patches, version, state } = produce_local_update(last_seen_state)
          if (!patches.length) return
          version = [version]

          var parents = current_version
          current_version = version
          last_seen_state = state

          var ops = {
            headers: { "Merge-Type": "simpleton" },
            method: "PUT",
            retry: true,
            version, parents, patches,
          }
          versions.push(ops)
          chrome.runtime.sendMessage({ action: "new_version", version: ops })

          outstanding_changes++
          await braid_fetch_wrapper(window.location.href, ops)
          outstanding_changes--
        }
      }
    } else if (merge_type) {
      throw 'unsupported merge-type: ' + merge_type
    } else if (content_type == 'application/json') {
      let doc = null;

      let sent_count = 0;
      let ack_count = 0;

      response.subscribe(({ version, parents, body, patches }) => {

        alert(`got stuff: ${JSON.stringify({ version, parents, body, patches })}`)

        console.log(
          `v = ${JSON.stringify(
            { version, parents, body, patches },
            null,
            4
          )}`
        );

        if (!version) version = 'default-' + default_version_count++
        if (!parents) parents = []

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
            doc = apply_patch(doc, patches[0].range, JSON.parse(patches[0].content))
          }

          alert('got here??? new_version: ' + JSON.stringify(new_version, null, 4))

          versions.push(new_version)
          chrome.runtime.sendMessage({ action: "new_version", version: new_version })
        } catch (e) {
          console.log(`eeee = ${e}`)
          console.log(`eeee = ${e.stack}`)

          doc = apply_patch(doc, patches[0].range, JSON.parse(patches[0].content))

          // location.reload()
        }
        document.querySelector("#textarea").value = JSON.stringify(doc)
      })
    }
  }
})

function constructHTTPRequest(params, url) {
  let httpRequest = `${params.method ?? 'GET'} ${url}\r\n`;
  for (var pair of params.headers.entries()) {
    httpRequest += `${pair[0]}: ${pair[1]}\r\n`;
  }
  httpRequest += '\r\n';
  if (['POST', 'PATCH', 'PUT'].includes(params.method?.toUpperCase()) && params.body) {
    httpRequest += params.body;
  }
  return httpRequest;
}

function applyChanges(original, sel, changes) {
  for (var change of changes) {
    switch (change.kind) {
      case "Del":
        for (let i = 0; i < sel.length; i++) {
          if (sel[i] > change.start) {
            if (sel[i] > change.end) {
              sel[i] -= change.end - change.start;
            } else sel[i] = change.start;
          }
        }

        original =
          original.substring(0, change.start) +
          original.substring(change.end);
        break;
      case "Ins":
        for (let i = 0; i < sel.length; i++) {
          if (sel[i] > change.start) {
            sel[i] += change.content.length;
          }
        }

        original =
          original.substring(0, change.start) +
          change.content +
          original.substring(change.start);
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
    return a + b.content.length + end - start
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
      p = { range: `[${offset}:${offset + d[1].length}]`, content: "" }
      offset += d[1].length
    } else offset += d[1].length
    if (p) {
      p.unit = "text"
      patches.push(p)
    }
  }
  return patches
}

function apply_patches_and_update_selection(textarea, patches) {
  patches = patches.map(p => ({ ...p, range: p.range.match(/\d+/g).map((x) => 1 * x) })).sort((a, b) => a.range[0] - b.range[0])

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
  if (!params.retry) return braid_fetch(url, params)

  var waitTime = 10
  if (params.subscribe) {
    var most_recent_response = null
    var subscribe_handler = null
    return new Promise(done => {
      connect()
      async function connect() {
        try {
          most_recent_response = await braid_fetch(url, { ...params, parents: params.parents?.() }, (x) => {
            on_bytes_received(x)
            set_subscription_online(true)
          }, on_bytes_going_out)
          most_recent_response.og_subscribe = most_recent_response.subscribe

          function sub() {
            most_recent_response.og_subscribe((...args) => {
              subscribe_handler?.(...args)
            }, on_error)
          }

          if (subscribe_handler) sub()
          most_recent_response.subscribe = handler => {
            subscribe_handler = handler
            sub()
          }
          done(most_recent_response)
          waitTime = 10
        } catch (e) {
          on_error(e)
        }
      }
      function on_error(e) {
        console.log('eee = ' + e.stack)
        setTimeout(connect, waitTime)
        waitTime = Math.min(waitTime * 2, 3000)
      }
    })
  } else {
    return new Promise((done) => {
      send()
      async function send() {
        try {
          var res = await braid_fetch(url, params, (x) => {
            on_bytes_received(x)
            set_subscription_online(true)
          }, on_bytes_going_out)
          if (res.status !== 200) throw "status not 200: " + res.status
          done(res)
        } catch (e) {
          setTimeout(send, waitTime)
          waitTime = Math.min(waitTime * 2, 3000)
        }
      }
    })
  }
}

// // Open devtools to braid when hotkey is pressedn
// chrome.runtime.onMessage.addListener((message, sender, send_response) => {
//   if (message.action === 'openBraidPanel') 
