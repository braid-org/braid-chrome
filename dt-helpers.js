// Helpers built on top of dt.js. Kept out of dt.js because that file is
// generated and gets replaced wholesale whenever diamond-types is rebuilt.

// What changed between two versions: the text as it stood at `from`, marked up
// with everything the operations between them inserted and deleted, and who
// did each of those things. Leaving `to` out asks about the present, which is
// what a lone version means.
//
// Returns runs of [what, text, agent], where `what` is 1 for text this span
// added, -1 for text it removed, and 0 for text it left alone. Deleted text is
// attributed to whoever deleted it, not to whoever originally wrote it.
function dt_diff_from(doc, from, to) {
    // The document answers all of this itself; this used to rebuild a second
    // copy to ask it.
    let lv = doc.remoteToLocalVersion(from)

    // Each character is either untouched, or a cell recording that it was
    // inserted and what was deleted immediately after it.
    //   { c, ins, gone: [[text, agent], ...] }
    let a = [...doc.getStringAt(lv)].map(c => ({ c, ins: null, gone: null }))
    let far_left = []

    let ops = to ? doc.xfBetween(lv, doc.remoteToLocalVersion(to)) : doc.xfSince(lv)
    for (let xf of ops) {
        if (xf.kind == "Ins") {
            a.splice(xf.start, 0,
                ...[...xf.content].map(c => ({ c, ins: xf.agent, gone: null })))
        } else if (xf.kind == "Del") {
            // Whatever those cells held, plus anything already deleted after
            // them, is now deleted by this operation's author.
            let removed = a.splice(xf.start, xf.end - xf.start)
            let text = removed.map(x => x.c + (x.gone || []).map(g => g[0]).join('')).join('')
            if (!text) continue
            if (xf.start == 0) far_left.push([text, xf.agent])
            else {
                let prev = a[xf.start - 1]
                if (!prev.gone) prev.gone = []
                prev.gone.push([text, xf.agent])
            }
        }
    }

    // Runs of the same kind by the same author collapse into one entry, so
    // the reader gets whole words rather than a span per character.
    let diff = []
    let push = (what, text, agent) => {
        if (!text) return
        let last = diff[diff.length - 1]
        if (last && last[0] === what && last[2] === agent) last[1] += text
        else diff.push([what, text, agent])
    }
    for (let [text, agent] of far_left) push(-1, text, agent)
    for (let cell of a) {
        push(cell.ins ? 1 : 0, cell.c, cell.ins)
        for (let [text, agent] of cell.gone || []) push(-1, text, agent)
    }
    return diff
}

function encode_version(agent, seq) {
    return agent + "-" + seq
}

function decode_version(v) {
    let m = v.match(/^(.*)-(\d+)$/s)
    if (!m) throw new Error(`invalid actor-seq version: ${v}`)
    return [m[1], parseInt(m[2])]
}
