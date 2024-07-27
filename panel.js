// Error handling
window.onerror = function (message, source, lineno, colno, error) {
    const errorContainer = document.getElementById('error-container');
    const errorMessageElement = document.getElementById('error-message');
    errorMessageElement.textContent = error.stack;
    errorContainer.style.display = 'block';
};

let versions = []
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

    backgroundConnection.postMessage({ cmd: 'init', tab_id: chrome.devtools.inspectedWindow.tabId })

    function tell_page_to_load_new_content_type() {
        backgroundConnection.postMessage({ cmd: "reload", content_type: content_type_select.value, merge_type: merge_type_select.value, subscribe: subscribe_request.checked, ...(version_request.value ? { version: version_request.value } : {}), ...(parents_request.value ? { parents: parents_request.value } : {}) });

        last_version = version_request.value
        last_parents = parents_request.value
        update_show_resubmit()
    }

    resubmit_button.onclick = tell_page_to_load_new_content_type
    content_type_select.onchange = tell_page_to_load_new_content_type
    merge_type_select.onchange = tell_page_to_load_new_content_type

    backgroundConnection.onDisconnect.addListener(() => setTimeout(connect, 500));

    id_raw_messages.onchange = () => update()

    subscribe_request.onchange = () => {
        if (subscribe_request.checked) {
            version_request.value = ''
            parents_request.value = ''
        }
        tell_page_to_load_new_content_type()
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
}

function add_message(message) {
    // Handle message from content script here
    //   console.log("Received message in devtools:", message);

    if (message.action == 'init') {
        versions = message.versions
        raw_messages = message.raw_messages
        headers = message.headers
        get_failed = message.get_failed
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
        'content-type': 'content_type_response',
        'subscribe': 'subscribe_response',
        'version': 'version_response',
        'parents': 'parents_response',
        'merge-type': 'merge_type_response',
    })) {
        window[v].textContent = headers[k] ?? ''
    }
    window.subscribe_response.textContent = '' + (headers.subscribe != null)

    window.error_d_label.style.display = get_failed ? 'inline' : 'none'
    window.error_d.textContent = get_failed

    let actor_to_color = {}
    let actor_color_angles = []

    id_messages.innerHTML = ''
    if (!id_raw_messages.checked && versions?.length) {
        id_messages.style.display = 'grid'
        id_messages.style['grid-template-columns'] = 'auto auto auto auto auto 1fr'
        id_messages.style['align-content'] = 'start'

        id_messages.append(make_html(`<div style="grid-column: span 2;margin-left:10px;margin-top:10px">Version</div>`))
        id_messages.append(make_html(`<div style="grid-column: span 3;margin-top:10px">Range</div>`))
        id_messages.append(make_html(`<div style="margin-top:10px">Content</div>`))

        let time_dag_width = 64
        let time_dag_radius = 6

        let svg_parent = null
        let version_circles = {}

        // remove duplicate versions
        if (true) {
            let seen = {}
            let good_versions = []
            for (let v of versions) {
                let v_string = '' + v.version

                if (seen[v_string]) continue
                seen[v_string] = true
                good_versions.push(v)
            }
            versions = good_versions
        }

        // find leaves
        let leaves = new Set(versions.map(v => '' + v.version))
        for (let v of versions)
            if (v.parents) {
                for (let p of v.parents) leaves.delete(p)
                leaves.delete('' + v.parents)
            }
        if (leaves.size > 1)
            versions.push({
                version: 'final merge',
                parents: [...leaves],
                patches: []
            })

        for (let i = 0; i < versions.length; i++) {
            let v = versions[i]
            let v_string = '' + v.version
            let last = i == versions.length - 1

            let my_make_html = (s) => {
                let d = make_html(s)
                d.style.cursor = 'pointer'
                d.onclick = () => {
                    backgroundConnection.postMessage({ cmd: "show_diff", from_version: !last ? v.version : null });
                }
                return d
            }

            for (let i = 0; i < 6; i++) {
                id_messages.append(make_html(`<div style="width:10px;height:10px"></div>`))
            }

            let actor = v_string.split('-')[0]
            if (!actor_to_color[actor]) {
                let angle = get_new_angle(actor_color_angles)
                actor_color_angles.push(angle)
                actor_to_color[actor] = angle_to_color(angle)
            }

            let version_circle = my_make_html(`<div style="
                position: relative;
                display: block;
                vertical-align: middle;
                width: ${time_dag_width}px;
                height: ${time_dag_radius * 2}px;
                background-color: transparent;
                padding-right:10px;"></div>`)
            version_circles[v_string] = version_circle
            id_messages.append(version_circle)
            if (!svg_parent) svg_parent = version_circle

            id_messages.append(my_make_html(`<div style="padding-right:10px;color:${actor_to_color[actor]}">${v_string || 'root'}</div>`))

            if (v.patches.length == 0) {
                for (let i = 0; i < 4; i++)
                    id_messages.append(make_html(`<div style="width:10px;height:10px"></div>`))
            }

            for (let ii = 0; ii < v.patches.length; ii++) {
                let patch = v.patches[ii]

                if (ii > 0)
                    for (let i = 0; i < 8; i++)
                        id_messages.append(make_html(`<div style="width:10px;height:10px"></div>`))

                id_messages.append(my_make_html(`<div><div style="color:black;background:rgb(245,245,245);font-family:monospace;padding-right:10px">${patch.unit}</div></div>`))
                id_messages.append(my_make_html(`<div style="font-family:monospace;padding-right:10px">${patch.unit == 'text' ? patch.range.slice(1, -1) : patch.range}</div>`))

                id_messages.append(my_make_html(`<div style="padding-right:10px">=</div>`))

                let container = my_make_html(`<div style="padding-right:10px"></div>`)
                if (patch.content) {
                    let pre = make_html(`<pre style="padding:0px;margin:0px;color:black;background:rgb(245,245,245);font-family:monospace;text-wrap:wrap;"></pre>`)
                    pre.textContent = patch.content
                    container.append(pre)
                } else {
                    let range = patch.range.match(/\d+/g)?.map(x => 1 * x)
                    if (range && range.length == 2 && range[0] != range[1]) container.append(make_html(`<div style="display:inline-block;padding:2px;border-radius:3px;background:rgb(241, 64, 42);color:white;font-size:xx-small;padding-left:3px;padding-right:3px">deleted</div>`))
                }
                id_messages.append(container)
            }
        }
        id_messages.append(make_html(`<div style="width:10px;height:10px"></div>`))

        let v_to_realv = {}
        let version_ys = {}

        let py = svg_parent?.getBoundingClientRect() || 0
        if (py) py = py.y + py.height / 2

        let actor_to_seq = {}
        for (let v of versions) {
            let v_string = '' + v.version

            let rect = version_circles[v_string].getBoundingClientRect()
            let y = (rect.y + rect.height / 2) - py

            version_ys[v_string] = y

            v_to_realv[v_string] = v_string

            if (v_string == '') continue;

            let [actor, seq] = v_string.split('-')
            seq = 1 * seq
            for (let i = actor_to_seq[actor] ?? 0; i < seq; i++) {
                v_to_realv[actor + '-' + i] = v_string
            }
            actor_to_seq[actor] = seq + 1
        }

        let last_x = 0.5
        let last_x_shadow_r = 0.25
        let version_xs = {}
        let last_v = null

        for (let v of versions) {
            let v_string = '' + v.version

            let actor = v_string.split('-')[0]
            let color = actor_to_color[actor]

            let x = null
            if (!v.parents || v.parents.length == 0 || v_to_realv['' + v.parents] == last_v) {
                x = last_x
            } else {
                let r = parseInt(v_string[0], 36) / 35
                x = last_x + last_x_shadow_r + r * (1 - 2 * last_x_shadow_r)
                if (x > 1) x -= 1
            }
            version_xs[v_string] = x

            let y = version_ys[v_string]

            let ps = v.parents ?? []
            if (ps.length == 0) ps = ['']
            if (ps.length > 1 && v_to_realv['' + v.parents]) ps = ['' + v.parents]
            for (let p of ps) {
                let pointing_to_subversion = v_to_realv[p] != p
                p = v_to_realv[p]
                if (p == null) continue
                let h = y - version_ys[p]
                let px = version_xs[p]

                svg_parent.append(make_html(`<svg height="${h}px" width="${time_dag_width}px" style="pointer-events:none; position: absolute; top: ${y - h + time_dag_radius}px; left: 0px;">
                        <line x1="${time_dag_radius + x * (time_dag_width - 2 * time_dag_radius)}px" y1="100%" x2="${time_dag_radius + px * (time_dag_width - 2 * time_dag_radius)}px" y2="0%" stroke="${color}" stroke-width="1px" ${pointing_to_subversion ? 'stroke-dasharray="3,3"' : ''} />
                </svg>`))
            }

            last_v = v_string
        }

        for (let v of versions) {
            let v_string = '' + v.version

            let actor = v_string.split('-')[0]
            let color = actor_to_color[actor]

            let x = null
            if (!v.parents || v.parents.length == 0 || v_to_realv['' + v.parents] == last_v) {
                x = last_x
            } else {
                let r = parseInt(v_string[0], 36) / 35
                x = last_x + last_x_shadow_r + r * (1 - 2 * last_x_shadow_r)
                if (x > 1) x -= 1
            }
            version_xs[v_string] = x

            let y = version_ys[v_string]

            svg_parent.append(make_html(`<svg height="${time_dag_radius * 2}px" width="${time_dag_radius * 2}px" style="position: absolute; top: ${y}px; left: ${x * (time_dag_width - 2 * time_dag_radius)}px;">
                    <circle cx="50%" cy="50%" r="50%" stroke-width="0" fill="${color}" />
            </svg>`))

            last_v = v_string
        }

        if (versions[versions.length - 1].version === 'final merge') versions.pop()

        // let dd = make_html('<pre></pre>')
        // dd.textContent = JSON.stringify(v_to_realv, null, 4)
        // id_messages.append(dd)        
    } else if (id_raw_messages.checked && raw_messages?.length) {
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
        let d = document.createElement('div')
        d.textContent = 'nothing to show'
        d.style.cssText = `margin:10px`
        id_messages.append(d)
    }

    if (was_scrolled_to_bottom) id_messages.scrollTop = id_messages.scrollHeight
}

function isScrolledToBottom(element) {
    return element.scrollHeight - element.scrollTop === element.clientHeight;
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