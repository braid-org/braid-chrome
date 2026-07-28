// Helpers built on top of dt.js. Kept out of dt.js because that file is
// generated and gets replaced wholesale whenever diamond-types is rebuilt.

function dt_diff_from(doc, version) {
    // The document answers both of these itself; this used to rebuild a
    // second copy to ask it.
    let lv = doc.remoteToLocalVersion(version)
    let a = [...doc.getStringAt(lv)];
    let far_left = '';
    for (let xf of doc.xfSince(lv)) {
        console.log(`xf = ${JSON.stringify(xf, null, 4)}`);
        if (xf.kind == "Ins") {
            a = [].concat(a.slice(0, xf.start), [...xf.content].map((c) => ['+', c, '']), a.slice(xf.start))
        } else if (xf.kind == "Del") {
            let removed = a.splice(xf.start, xf.end - xf.start);
            removed = removed
                .map((c) => {
                    if (typeof c === 'string') return c;
                    if (c[0] === "+") return c[2];
                    return c[1] + c[2];
                })
                .join("");

            if (xf.start == 0) {
                far_left += removed
            } else {
                if (typeof a[xf.start - 1] === 'string')
                    a[xf.start - 1] = [' ', a[xf.start - 1], '']
                a[xf.start - 1][2] += removed
            }
        }
    }

    let diff = []
    if (far_left) diff.push([-1, far_left])
    for (let aa of a) {
        if (typeof aa === 'string') {
            if (diff[diff.length - 1]?.[0] == 0) {
                diff[diff.length - 1][1] += aa
            } else {
                diff.push([0, aa])
            }
        } else if (aa[0] == '+') {
            if (diff[diff.length - 1]?.[0] == 1) {
                diff[diff.length - 1][1] += aa[1]
            } else {
                diff.push([1, aa[1]])
            }
        } else {
            if (diff[diff.length - 1]?.[0] == 0) {
                diff[diff.length - 1][1] += aa[1]
            } else {
                diff.push([0, aa[1]])
            }
        }

        if (Array.isArray(aa)) {
            if (diff[diff.length - 1]?.[0] == -1) {
                diff[diff.length - 1][1] += aa[2]
            } else {
                diff.push([-1, aa[2]])
            }
        }
    }

    return diff;
}

function encode_version(agent, seq) {
    return agent + "-" + seq
}

function decode_version(v) {
    let m = v.match(/^(.*)-(\d+)$/s)
    if (!m) throw new Error(`invalid actor-seq version: ${v}`)
    return [m[1], parseInt(m[2])]
}
