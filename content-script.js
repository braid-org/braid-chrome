
console.log(`RUNNING content SCRIPT!`)

var version = null
var parents = null
var content_type = null

var headers = {}
var versions = []
var raw_messages = []

let oplog = null
let on_show_diff = null
let sub_handler = null
var default_version_count = 1

function enter_error_state(why) {
  console.log(`enter_error_state because: ${why}`)
  textarea.style.background = 'pink'
  textarea.style.color = '#800'
  textarea.disabled = true
}
window.errorify = (msg) => {
  enter_error_state(msg)
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
chrome.runtime.onMessage.addListener(async function (request, sender, sendResponse) {
  console.log(`getting message with cmd: ${request.cmd}`)
  if (request.cmd == 'init') {
    chrome.runtime.sendMessage({ action: "init", headers, versions, raw_messages })
  } else if (request.cmd == "show_diff") {
    on_show_diff?.(request.from_version)
  } else if (request.cmd == "reload") {
    console.log('reloading!')
    location.reload()
  } else if (request.cmd == 'loaded') {
    chrome.runtime.sendMessage({ action: "init", versions, raw_messages, headers })

    version = request.dev_message?.version
    parents = request.dev_message?.parents
    content_type = request.dev_message?.content_type || request.headers['content-type']
    let white_list = { 'text/plain': true, 'application/json': true, 'application/javascript': true, 'text/markdown': true }

    if (version || parents) {
      await create_static_view()
      return
    } 

    if (request.dev_message && !request.dev_message.subscribe) return;

    if (request.headers['accept-subscribe'] || (request.dev_message && request.dev_message.subscribe) || (!request.dev_message && white_list[content_type])) {
      connect()
    }
  }
})

async function create_static_view() {
  await new Promise(done => {
    document.open()
    document.write(`
      <script src="${chrome.runtime.getURL('braid-http-client.js')}"></script>
      <body
          style="padding: 0px; margin: 0px; width: 100vw; height: 100vh; overflow: clip; box-sizing: border-box;"
      >
          <span id="online" style="position: absolute; top: 5px; right: 5px;">•</span>
          <pre
          id="texty"
          style="margin-top: 0px; width: 100%; height:100%; padding: 13px 8px; font-size: 13px; border: 0; box-sizing: border-box; background: transparent;"
          readonly
          disabled
          ></pre>
      </body>
    `);
    document.close()
    window.onload = () => done()
  })

  try {
    var response = await braid_fetch(window.location.href,
      {
        version: version ? JSON.parse(version) : null,
        parents: parents ? JSON.parse(`[${parents}]`) : null,
        headers: { Accept: content_type }
      },
      (x) => {
        on_bytes_received(x)
        set_subscription_online(true)
      },
      on_bytes_going_out)

    headers = {}
    for (let x of response.headers.entries()) headers[x[0].toLowerCase()] = x[1]
    chrome.runtime.sendMessage({ action: "new_headers", headers })

    texty.textContent = await response.text()
  } catch (e) {
    console.log(`e = ${e}`);
    set_subscription_online(false)
    setTimeout(connect, 1000);
  }
}

async function connect() {
  try {
    var response = await braid_fetch(window.location.href,
      {
        subscribe: true,
        version: version ? JSON.parse(version) : null,
        parents: (parents ? JSON.parse(`[${parents}]`) : null) || oplog?.getRemoteVersion().map(x => x.join('-')),
        headers: { Accept: content_type }
      },
      (x) => {
        on_bytes_received(x)
        set_subscription_online(true)
      },
      on_bytes_going_out)

    headers = {}
    for (let x of response.headers.entries()) headers[x[0].toLowerCase()] = x[1]
    chrome.runtime.sendMessage({ action: "new_headers", headers })

    if (!headers.subscribe) return;

    if (!sub_handler) {
      if (content_type == 'text/plain') {
        sub_handler = await create_text_handler(headers.editable == 'true')
      } else if (content_type == 'application/json') {
        sub_handler = await create_json_handler()
      }
    }

    response.subscribe(sub_handler, (e) => {
      console.log(`e = ${e}`);
      set_subscription_online(false)
      setTimeout(connect, 1000);
    })
  } catch (e) {
    console.log(`e = ${e}`);
    set_subscription_online(false)
    setTimeout(connect, 1000);
  }
}

async function create_text_handler(editable) {
  await new Promise(done => {
    document.open()
    document.write(`
      <script src="${chrome.runtime.getURL('braid-http-client.js')}"></script>
      <body
          style="padding: 0px; margin: 0px; width: 100vw; height: 100vh; overflow: clip; box-sizing: border-box;"
      >
          <pre id="diff_d" style="display:none;position: absolute; top: 0px; left: 0px; right: 0px; bottom: 0px;padding: 13px 8px; font-size: 13px;font-family: monospace;overflow:scroll;margin:0px; white-space: pre-wrap; word-wrap: break-word; overflow-wrap: break-word;"></pre>
          <span id="online" style="position: absolute; top: 5px; right: 5px;">•</span>
          ${editable ? `<textarea
          id="texty"
          style="width: 100%; height:100%; padding: 13px 8px; font-size: 13px; border: 0; box-sizing: border-box; background: transparent;"
          readonly
          disabled
          ></textarea>` : `<pre
          id="texty"
          style="margin: 0px; width: 100%; height:100%; padding: 13px 8px; font-size: 13px; border: 0; box-sizing: border-box; background: transparent;"
          readonly
          disabled
          ></pre>`}
      </body>
    `);
    document.close()
    window.onload = () => done()
  })

  let response = await fetch(chrome.runtime.getURL('dt_bg.wasm'))
  let wasmModuleBuffer = await response.arrayBuffer();

  const imports = __wbg_get_imports();
  __wbg_init_memory(imports);

  const module = await WebAssembly.compile(wasmModuleBuffer);
  const instance = await WebAssembly.instantiate(module, imports);

  __wbg_finalize_init(instance, module);

  let last_text = "";

  let sent_count = 0;
  let ack_count = 0;

  let textarea = document.querySelector("#texty");

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

      sent_count++;
      texty.style.caretColor = 'orange'
      console.log(`s counts: ${ack_count}/${sent_count}`);

      let maxWait = 3000; // 3 seconds
      let waitTime = 100;

      const fetchWithRetry = async (url, options) => {
        while (true) {
          try {
            let x = await braid_fetch(url, { ...options }, on_bytes_received, on_bytes_going_out)
            if (x.status !== 200) throw 'status not 200: ' + x.status

            let got = await x.text();
            if (got == "ok!") {
              ack_count++;

              if (ack_count == sent_count) {
                texty.style.caretColor = 'auto'
              }
            } else {
              console.log(`bad 200: ${got}`);
            }

            console.log(`a counts: ${ack_count}/${sent_count}`);
            break;
          } catch (e) {
            console.log(`got BAD!: ${e}`);

            waitTime *= 2;
            if (waitTime > maxWait) {
              waitTime = maxWait;
            }

            console.log(`Retrying in ${waitTime / 1000} seconds...`);

            await new Promise(done => setTimeout(done, waitTime))
          }
        }
      };

      let ops = {
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
      fetchWithRetry(window.location.href, ops);
      versions.push(ops)
      chrome.runtime.sendMessage({ action: "new_version", version: ops })
    }
  });

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

  return ({ version, parents, body, patches }) => {
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
        patches: [{ unit: 'text', range: '[0:0]', content: '' }]
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
      let range = patches[0].range.match(/\d+/g).map((x) => parseInt(x));

      version = decode_version(version)
      version[1] -= (patches[0].content ? patches[0].content.length : range[1] - range[0]) - 1
      version = version.join('-')

      if (patches[0].content) {
        // insert
        let v = version
        let ps = parents
        for (let i = 0; i < patches[0].content.length; i++) {
          let c = patches[0].content[i]
          oplog.addFromBytes(
            OpLog_create_bytes(
              v,
              ps,
              range[0] + i,
              c
            )
          );
          ps = [v]
          v = decode_version(v)
          v = [v[0], v[1] + 1].join('-')
        }
      } else {
        // delete
        let v = version
        let ps = parents
        for (let i = range[0]; i < range[1]; i++) {
          oplog.addFromBytes(
            OpLog_create_bytes(
              v,
              ps,
              range[0],
              null
            )
          );
          ps = [v]
          v = decode_version(v)
          v = [v[0], v[1] + 1].join('-')
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
  }
}

async function create_json_handler() {
  await new Promise(done => {
    document.open()
    document.write(`
      <script src="${chrome.runtime.getURL('braid-http-client.js')}"></script>
      <script src="${chrome.runtime.getURL('apply-patch.js')}"></script>
      <body
          style="width: 100vw; height: 100vh; overflow: clip; box-sizing: border-box;"
      >
        <span id="online" style="position: absolute; top: 5px; right: 5px;">•</span>
        <code
          id="texty"
          style="width: 100%; height:100%; font-size: 13px;"
          readonly
        ></code>
      </body>
    `);
    document.close()
    window.onload = () => done()
  })

  let doc = null;

  let sent_count = 0;
  let ack_count = 0;

  return ({ version, parents, body, patches }) => {
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

      versions.push(new_version)
      chrome.runtime.sendMessage({ action: "new_version", version: new_version })
    } catch (e) {
      console.log(`eeee = ${e}`)
      console.log(`eeee = ${e.stack}`)

      doc = apply_patch(doc, patches[0].range, JSON.parse(patches[0].content))

      // location.reload()
    }
    document.querySelector("#texty").innerText = JSON.stringify(doc)
  }
}

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

// // Open devtools to braid when hotkey is pressedn
// chrome.runtime.onMessage.addListener((message, sender, send_response) => {
//   if (message.action === 'openBraidPanel') 
