// This replaces the page with our "live-update" view of TEXT or JSON
chrome.runtime.onMessage.addListener(async function (request, sender, sendResponse) {
  console.log(`getting message with action: ${request.action}`)

  // We only listen to ONE action, which is called "replace_html"
  if (request.action !== "replace_html") return

  console.log(`clearing content, to replace with live updating ${request.content_type}`)

  document.body.innerHTML = ''

  // Text version
  if (request.content_type === "text/plain") {
    document.open()
    document.write(`
      <script src="${chrome.runtime.getURL('braid-http-client.js')}"></script>
      <body
          style="padding: 0px; margin: 0px; width: 100vw; height: 100vh; overflow-x: clip; box-sizing: border-box;"
      >
          <span id="online" style="position: absolute; top: 5px; right: 5px;">•</span>
          <textarea
          id="texty"
          style="width: 100%; height:100%; padding: 13px 8px; font-size: 13px; border: 0; box-sizing: border-box;"
          autofocus
          readonly
          disabled
          ></textarea>
      </body>
      `);
    document.close()
    await inject_livetext()

    // JSON version
  } else if (request.content_type === "application/json") {
    document.open()
    document.write(`
      <script src="${chrome.runtime.getURL('braid-http-client.js')}"></script>
      <script src="${chrome.runtime.getURL('apply-patch.js')}"></script>
      <body
          style="width: 100vw; height: 100vh; overflow-x: clip; box-sizing: border-box;"
      >
        <span id="online" style="position: absolute; top: 5px; right: 5px;">•</span>
        <code
          id="texty"
          style="width: 100%; height:100%; font-size: 13px;"
          autofocus
          readonly
        ></code>
      </body>
      `)
    document.close()

    window.onload = () => inject_livejson()
  }
})

async function inject_livetext() {
  let enter_error_state = (why) => {
    console.log(`enter_error_state because: ${why}`)
    textarea.style.background = 'pink'
    textarea.style.color = '#800'
    textarea.disabled = true
  }
  window.errorify = (msg) => {
    enter_error_state(msg)
    throw new Error(msg)
  }

  var braid = {fetch: braid_fetch}

  chrome.runtime.sendMessage({ action: "reload" })

  let on_bytes_received = s => {
    console.log(`on_bytes_received[${s.slice(0, 500)}]`)
    chrome.runtime.sendMessage({ action: "braid_in", data: s })
  }

  let on_bytes_going_out = (params, url) => {
    console.log(`on_bytes_going_out[${constructHTTPRequest(params, url)}]`)
    chrome.runtime.sendMessage({ action: "braid_out", data: constructHTTPRequest(params, url) })
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

  let oplog = new OpLog(peer);

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
    oplog.del(splicePos, numToDelete);
    oplog.ins(splicePos, stuffToInsert);

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
            let x = await braid.fetch(url, { ...options }, on_bytes_received, on_bytes_going_out)
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
    }
  });

  window.subscription_online = false
  function set_subscription_online (bool) {
    if (subscription_online === bool) return
    subscription_online = bool
    console.log(bool ? 'Connected!' : 'Disconnected.')
    var online = document.querySelector("#online").style
    online.color = bool ? 'lime' : 'orange';
  }
  async function connect() {
    try {
      (
        await braid.fetch(window.location.href,
                          {
                            subscribe: true,
                            parents: oplog.getRemoteVersion().map(x => x.join('-')),
                            headers: {Accept: 'text/plain'}
                          },
                          (x) => {
                            on_bytes_received(x)
                            set_subscription_online(true)
                          },
                          on_bytes_going_out
                         )
      ).subscribe(
        ({ version, parents, body, patches }) => {
          // set_subscription_online(true)
          //   console.log(
          //     `v = ${JSON.stringify(
          //       { version, parents, body, patches },
          //       null,
          //       4
          //     )}`
          //   );

          // chrome.runtime.sendMessage({ action: "braid_in", data: { version, parents, body, patches } });

          if (textarea.hasAttribute("readonly")) {
            textarea.removeAttribute("readonly")
            textarea.removeAttribute('disabled')
            textarea.focus()
          }

          if (!patches) return;

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
        },
        (e) => {
          console.log(`e = ${e}`);
          set_subscription_online(false)
          setTimeout(connect, 1000);
        }
      );
    } catch (e) {
      console.log(`e = ${e}`);
      set_subscription_online(false)
      setTimeout(connect, 1000);
    }
  }
  connect();

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
}

async function inject_livejson() {
  let enter_error_state = (why) => {
    console.log(`enter_error_state because: ${why}`)
    textarea.style.background = 'pink'
    textarea.style.color = '#800'
  }
  window.errorify = (msg) => {
    enter_error_state(msg)
    throw new Error(msg)
  }

  var braid = {fetch: braid_fetch}

  chrome.runtime.sendMessage({ action: "reload" })

  let on_bytes_received = s => {
    console.log(`on_bytes_received[${s.slice(0, 500)}]`)
    chrome.runtime.sendMessage({ action: "braid_in", data: s })
  }

  let on_bytes_going_out = (params, url) => {
    console.log(`on_bytes_going_out[${constructHTTPRequest(params, url)}]`)
    chrome.runtime.sendMessage({ action: "braid_out", data: constructHTTPRequest(params, url) })
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

  let doc = null;

  let sent_count = 0;
  let ack_count = 0;

  let textarea = document.querySelector("#texty");

  window.subscription_online = false
  function set_subscription_online (bool) {
    if (subscription_online === bool) return
    subscription_online = bool
    console.log(bool ? 'Connected!' : 'Disconnected.')
    var online = document.querySelector("#online").style
    online.color = bool ? 'lime' : 'orange';
  }
  async function connect() {
    try {
      (
        await braid.fetch(window.location.href, {
          subscribe: true,
          headers: {Accept: 'application/json'}
        }, on_bytes_received, on_bytes_going_out)
      ).subscribe(
        ({ version, parents, body, patches }) => {
          set_subscription_online(true)
          console.log(
            `v = ${JSON.stringify(
                          { version, parents, body, patches },
                          null,
                          4
                        )}`
          );

          try {
            if (body != null) {
              doc = JSON.parse(body)
            } else {
              doc = apply_patch(doc, patches[0].range, JSON.parse(patches[0].content))
            }
          } catch (e) {
            console.log(`eeee = ${e}`)
            console.log(`eeee = ${e.stack}`)

            doc = apply_patch(doc, patches[0].range, JSON.parse(patches[0].content))

            // location.reload()
          }
          textarea.innerText = JSON.stringify(doc)
        },
        (e) => {
          console.log(`e = ${e}`);
          set_subscription_online(false)
          setTimeout(connect, 1000);
        }
      );
    } catch (e) {
      console.log(`e = ${e}`);
      set_subscription_online(false)
      setTimeout(connect, 1000);
    }
  }
  connect();
}


// // Open devtools to braid when hotkey is pressedn
// chrome.runtime.onMessage.addListener((message, sender, send_response) => {
//   if (message.action === 'openBraidPanel') 