
let versions = []
let raw_messages = []
let headers = {}

let actor_to_color = {}
let actor_color_angles = []

window.onload = function () {
    try {
        const backgroundConnection = chrome.runtime.connect({ name: "braid-devtools-panel" })
        backgroundConnection.onMessage.addListener(add_message)

        backgroundConnection.postMessage({ cmd: 'init', tab_id: chrome.devtools.inspectedWindow.tabId })

        function tell_page_to_load_new_content_type() {
            try {
                backgroundConnection.postMessage({ cmd: "reload", content_type: content_type_select.value });
            } catch (e) {
                alert(`e = ${e.stack}`)
            }
        }

        reload_button.onclick = tell_page_to_load_new_content_type
        content_type_select.onchange = tell_page_to_load_new_content_type

        id_raw_messages.onchange = () => update()
    } catch (e) {
        add_message('eee:' + e.stack)
    }
};

function add_message(message) {
    // Handle message from content script here
    //   console.log("Received message in devtools:", message);

    if (message.action == 'init') {
        versions = message.versions
        raw_messages = message.raw_messages
        headers = message.headers
        update()
    } else if (message.action == 'new_version') {
        versions.push(message.version)
        update()
    } else if (message.action == 'new_headers') {
        headers = message.headers
        update()
    } else if (message.action == 'braid_in' || message.action == 'braid_out') {
        raw_messages.push(message.data)
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
    for (let [k, v] of Object.entries({
        'content-type': 'content_type_response',
        'subscribe': 'subscribe_response',
        'version': 'version_response',
        'parents': 'parents_response',
        'merge-type': 'merge_type_response',
    })) {
        window[v].textContent = headers[k] ?? ''
    }

    id_messages.innerHTML = ''
    if (!id_raw_messages.checked) {
        id_messages.style.display = 'grid'
        id_messages.style['grid-template-columns'] = 'auto auto auto auto 1fr'

        id_messages.append(make_html(`<div style="grid-column: span 2;margin-left:10px;margin-top:10px">Version</div>`))
        id_messages.append(make_html(`<div style="grid-column: span 2;margin-top:10px">Range</div>`))
        id_messages.append(make_html(`<div style="margin-top:10px">Content</div>`))

        for (let v of versions) {
            for (let i = 0; i < 5; i++) {
                id_messages.append(make_html(`<div style="width:10px;height:10px"></div>`))
            }

            let actor = v.version.split('-')[0]
            if (!actor_to_color[actor]) {
                let angle = get_new_angle(actor_color_angles)
                actor_color_angles.push(angle)
                actor_to_color[actor] = angle_to_color(angle)
            }

            id_messages.append(make_html(`<div style="
                display: inline-block;
                vertical-align: middle;
                width: 1em;
                height: 1em;
                border-radius: 50%;
                background-color: ${actor_to_color[actor]};
                margin-right:10px;
                margin-left:10px"></div>`))
            id_messages.append(make_html(`<div style="margin-right:10px;color:${actor_to_color[actor]}">${v.version}</div>`))
            id_messages.append(make_html(`<div><div style="color:black;background:rgb(245,245,245);font-family:monospace;margin-right:10px">text</div></div>`))
            id_messages.append(make_html(`<div style="margin-right:10px">${v.patches[0].range.slice(1, -1)}</div>`))

            let container = make_html(`<div style="margin-right:10px"></div>`)
            if (v.patches[0].content) {
                let pre = make_html(`<pre style="padding:0px;margin:0px;color:black;background:rgb(245,245,245);font-family:monospace;text-wrap:wrap;"></pre>`)
                pre.textContent = v.patches[0].content
                container.append(pre)
            } else {
                container.append(make_html(`<div style="display:inline-block;padding:2px;border-radius:3px;background:rgb(241, 64, 42);color:white;font-size:xx-small;padding-left:3px;padding-right:3px">deleted</div>`))
            }
            id_messages.append(container)
        }
        id_messages.append(make_html(`<div style="width:10px;height:10px"></div>`))

    } else {
        id_messages.style.display = 'block'

        for (let msg of raw_messages) {
            let d = document.createElement('pre')
            d.textContent = msg
            //d.style.background = `rgb(41,42,45)`
            d.style.borderRadius = '3px'
            d.style.margin = '3px'
            d.style.padding = '3px'
            d.style.textWrap = 'wrap'

            id_messages.append(d)
        }
    }

    id_messages.scrollTop = id_messages.scrollHeight
}

function make_html(s) {
    let d = document.createElement('div')
    d.innerHTML = s
    return d.firstChild
}

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
    return `rgb(${angle_to_color_raw(angle).join(",")})`;
  }

  function angle_to_color_raw(angle) {
    var t = angle;
    if (t < 0 || t > 1) t -= Math.floor(t);
    var n = Math.abs(t - 0.5);

    var h = 360 * t - 100;
    var s = 1.5 - 1.5 * n;
    var l = 0.8 - 0.9 * n;

    var kn = 0.017453292519943295;

    t = (h + 120) * kn;
    n = l;
    var e = s * n * (1 - n);
    var r = Math.cos(t);
    var i = Math.sin(t);

    var $n = -0.14861;
    var Wn = 1.78277;
    var Zn = -0.29227;
    var Qn = -0.90649;
    var Kn = 1.97294;

    return [
      255 * (n + e * ($n * r + Wn * i)),
      255 * (n + e * (Zn * r + Qn * i)),
      255 * (n + e * (Kn * r)),
    ];
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