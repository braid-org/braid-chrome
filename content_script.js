let wasm;

const heap = new Array(128).fill(undefined);

heap.push(undefined, null, true, false);

function getObject(idx) { return heap[idx]; }

let heap_next = heap.length;

function dropObject(idx) {
    if (idx < 132) return;
    heap[idx] = heap_next;
    heap_next = idx;
}

function takeObject(idx) {
    const ret = getObject(idx);
    dropObject(idx);
    return ret;
}

const cachedTextDecoder = (typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8', { ignoreBOM: true, fatal: true }) : { decode: () => { throw Error('TextDecoder not available') } });

if (typeof TextDecoder !== 'undefined') { cachedTextDecoder.decode(); };

let cachedUint8Memory0 = null;

function getUint8Memory0() {
    if (cachedUint8Memory0 === null || cachedUint8Memory0.byteLength === 0) {
        cachedUint8Memory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8Memory0;
}

function getStringFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return cachedTextDecoder.decode(getUint8Memory0().subarray(ptr, ptr + len));
}

function addHeapObject(obj) {
    if (heap_next === heap.length) heap.push(heap.length + 1);
    const idx = heap_next;
    heap_next = heap[idx];

    heap[idx] = obj;
    return idx;
}

function _assertClass(instance, klass) {
    if (!(instance instanceof klass)) {
        throw new Error(`expected instance of ${klass.name}`);
    }
    return instance.ptr;
}

let cachedInt32Memory0 = null;

function getInt32Memory0() {
    if (cachedInt32Memory0 === null || cachedInt32Memory0.byteLength === 0) {
        cachedInt32Memory0 = new Int32Array(wasm.memory.buffer);
    }
    return cachedInt32Memory0;
}

let cachedUint32Memory0 = null;

function getUint32Memory0() {
    if (cachedUint32Memory0 === null || cachedUint32Memory0.byteLength === 0) {
        cachedUint32Memory0 = new Uint32Array(wasm.memory.buffer);
    }
    return cachedUint32Memory0;
}

let WASM_VECTOR_LEN = 0;

function passArray32ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 4) >>> 0;
    getUint32Memory0().set(arg, ptr / 4);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function isLikeNone(x) {
    return x === undefined || x === null;
}

function getArrayU32FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint32Memory0().subarray(ptr / 4, ptr / 4 + len);
}

const cachedTextEncoder = (typeof TextEncoder !== 'undefined' ? new TextEncoder('utf-8') : { encode: () => { throw Error('TextEncoder not available') } });

const encodeString = (typeof cachedTextEncoder.encodeInto === 'function'
    ? function (arg, view) {
        return cachedTextEncoder.encodeInto(arg, view);
    }
    : function (arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return {
            read: arg.length,
            written: buf.length
        };
    });

function passStringToWasm0(arg, malloc, realloc) {

    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length) >>> 0;
        getUint8Memory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len) >>> 0;

    const mem = getUint8Memory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }

    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3) >>> 0;
        const view = getUint8Memory0().subarray(ptr + offset, ptr + len);
        const ret = encodeString(arg, view);

        offset += ret.written;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8Memory0().subarray(ptr / 1, ptr / 1 + len);
}

function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1) >>> 0;
    getUint8Memory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function handleError(f, args) {
    try {
        return f.apply(this, args);
    } catch (e) {
        wasm.__wbindgen_exn_store(addHeapObject(e));
    }
}
/**
*/
class Branch {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(Branch.prototype);
        obj.__wbg_ptr = ptr;

        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;

        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_branch_free(ptr);
    }
    /**
    */
    constructor() {
        const ret = wasm.branch_new();
        return Branch.__wrap(ret);
    }
    /**
    * @param {OpLog} oplog
    * @returns {Branch}
    */
    static all(oplog) {
        _assertClass(oplog, OpLog);
        const ret = wasm.branch_all(oplog.__wbg_ptr);
        return Branch.__wrap(ret);
    }
    /**
    * @returns {string}
    */
    get() {
        let deferred1_0;
        let deferred1_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.branch_get(retptr, this.__wbg_ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            deferred1_0 = r0;
            deferred1_1 = r1;
            return getStringFromWasm0(r0, r1);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            wasm.__wbindgen_free(deferred1_0, deferred1_1);
        }
    }
    /**
    * Merge in from some named point in time
    * @param {OpLog} ops
    * @param {Uint32Array | undefined} branch
    */
    merge(ops, branch) {
        _assertClass(ops, OpLog);
        var ptr0 = isLikeNone(branch) ? 0 : passArray32ToWasm0(branch, wasm.__wbindgen_malloc);
        var len0 = WASM_VECTOR_LEN;
        wasm.branch_merge(this.__wbg_ptr, ops.__wbg_ptr, ptr0, len0);
    }
    /**
    * @returns {Uint32Array}
    */
    getLocalVersion() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.branch_getLocalVersion(retptr, this.__wbg_ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            var v1 = getArrayU32FromWasm0(r0, r1).slice();
            wasm.__wbindgen_free(r0, r1 * 4);
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
    * @param {number} pos_wchars
    * @returns {number}
    */
    wCharsToChars(pos_wchars) {
        const ret = wasm.branch_wCharsToChars(this.__wbg_ptr, pos_wchars);
        return ret >>> 0;
    }
    /**
    * @param {number} pos_chars
    * @returns {number}
    */
    charsToWchars(pos_chars) {
        const ret = wasm.branch_charsToWchars(this.__wbg_ptr, pos_chars);
        return ret >>> 0;
    }
}
/**
*/
class Doc {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(Doc.prototype);
        obj.__wbg_ptr = ptr;

        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;

        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_doc_free(ptr);
    }
    /**
    * @param {string | undefined} agent_name
    */
    constructor(agent_name) {
        var ptr0 = isLikeNone(agent_name) ? 0 : passStringToWasm0(agent_name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len0 = WASM_VECTOR_LEN;
        const ret = wasm.doc_new(ptr0, len0);
        return Doc.__wrap(ret);
    }
    /**
    * @param {number} pos
    * @param {string} content
    */
    ins(pos, content) {
        const ptr0 = passStringToWasm0(content, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.doc_ins(this.__wbg_ptr, pos, ptr0, len0);
    }
    /**
    * @param {number} pos
    * @param {number} del_span
    */
    del(pos, del_span) {
        wasm.doc_del(this.__wbg_ptr, pos, del_span);
    }
    /**
    * @returns {number}
    */
    len() {
        const ret = wasm.doc_len(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
    * @returns {boolean}
    */
    is_empty() {
        const ret = wasm.doc_is_empty(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
    * @returns {string}
    */
    get() {
        let deferred1_0;
        let deferred1_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.branch_get(retptr, this.__wbg_ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            deferred1_0 = r0;
            deferred1_1 = r1;
            return getStringFromWasm0(r0, r1);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            wasm.__wbindgen_free(deferred1_0, deferred1_1);
        }
    }
    /**
    * @param {Uint32Array} branch
    */
    merge(branch) {
        const ptr0 = passArray32ToWasm0(branch, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.doc_merge(this.__wbg_ptr, ptr0, len0);
    }
    /**
    * @returns {Uint8Array}
    */
    toBytes() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.doc_toBytes(retptr, this.__wbg_ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            var v1 = getArrayU8FromWasm0(r0, r1).slice();
            wasm.__wbindgen_free(r0, r1 * 1);
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
    * @param {Uint32Array} from_version
    * @returns {Uint8Array}
    */
    getPatchSince(from_version) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passArray32ToWasm0(from_version, wasm.__wbindgen_malloc);
            const len0 = WASM_VECTOR_LEN;
            wasm.doc_getPatchSince(retptr, this.__wbg_ptr, ptr0, len0);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            var v2 = getArrayU8FromWasm0(r0, r1).slice();
            wasm.__wbindgen_free(r0, r1 * 1);
            return v2;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
    * @param {Uint8Array} bytes
    * @param {string | undefined} agent_name
    * @returns {Doc}
    */
    static fromBytes(bytes, agent_name) {
        const ptr0 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        var ptr1 = isLikeNone(agent_name) ? 0 : passStringToWasm0(agent_name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len1 = WASM_VECTOR_LEN;
        const ret = wasm.doc_fromBytes(ptr0, len0, ptr1, len1);
        return Doc.__wrap(ret);
    }
    /**
    * @param {Uint8Array} bytes
    * @returns {Uint32Array}
    */
    mergeBytes(bytes) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
            const len0 = WASM_VECTOR_LEN;
            wasm.doc_mergeBytes(retptr, this.__wbg_ptr, ptr0, len0);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            var r2 = getInt32Memory0()[retptr / 4 + 2];
            var r3 = getInt32Memory0()[retptr / 4 + 3];
            if (r3) {
                throw takeObject(r2);
            }
            var v2 = getArrayU32FromWasm0(r0, r1).slice();
            wasm.__wbindgen_free(r0, r1 * 4);
            return v2;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
    * @param {Uint32Array} frontier
    * @returns {any}
    */
    getOpsSince(frontier) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passArray32ToWasm0(frontier, wasm.__wbindgen_malloc);
            const len0 = WASM_VECTOR_LEN;
            wasm.doc_getOpsSince(retptr, this.__wbg_ptr, ptr0, len0);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            var r2 = getInt32Memory0()[retptr / 4 + 2];
            if (r2) {
                throw takeObject(r1);
            }
            return takeObject(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
    * @returns {Uint32Array}
    */
    getLocalVersion() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.branch_getLocalVersion(retptr, this.__wbg_ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            var v1 = getArrayU32FromWasm0(r0, r1).slice();
            wasm.__wbindgen_free(r0, r1 * 4);
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
    * @param {Uint32Array} time
    * @returns {any}
    */
    localToRemoteVersion(time) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passArray32ToWasm0(time, wasm.__wbindgen_malloc);
            const len0 = WASM_VECTOR_LEN;
            wasm.doc_localToRemoteVersion(retptr, this.__wbg_ptr, ptr0, len0);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            var r2 = getInt32Memory0()[retptr / 4 + 2];
            if (r2) {
                throw takeObject(r1);
            }
            return takeObject(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
    * @returns {any}
    */
    getRemoteVersion() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.doc_getRemoteVersion(retptr, this.__wbg_ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            var r2 = getInt32Memory0()[retptr / 4 + 2];
            if (r2) {
                throw takeObject(r1);
            }
            return takeObject(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
    * @param {Uint32Array} from_version
    * @returns {any}
    */
    xfSince(from_version) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passArray32ToWasm0(from_version, wasm.__wbindgen_malloc);
            const len0 = WASM_VECTOR_LEN;
            wasm.doc_xfSince(retptr, this.__wbg_ptr, ptr0, len0);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            var r2 = getInt32Memory0()[retptr / 4 + 2];
            if (r2) {
                throw takeObject(r1);
            }
            return takeObject(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
    * @returns {any}
    */
    getHistory() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.doc_getHistory(retptr, this.__wbg_ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            var r2 = getInt32Memory0()[retptr / 4 + 2];
            if (r2) {
                throw takeObject(r1);
            }
            return takeObject(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
    * @param {Uint32Array} a
    * @param {Uint32Array} b
    * @returns {Uint32Array}
    */
    mergeVersions(a, b) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passArray32ToWasm0(a, wasm.__wbindgen_malloc);
            const len0 = WASM_VECTOR_LEN;
            const ptr1 = passArray32ToWasm0(b, wasm.__wbindgen_malloc);
            const len1 = WASM_VECTOR_LEN;
            wasm.doc_mergeVersions(retptr, this.__wbg_ptr, ptr0, len0, ptr1, len1);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            var v3 = getArrayU32FromWasm0(r0, r1).slice();
            wasm.__wbindgen_free(r0, r1 * 4);
            return v3;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
    * @param {number} pos_wchars
    * @returns {number}
    */
    wCharsToChars(pos_wchars) {
        const ret = wasm.branch_wCharsToChars(this.__wbg_ptr, pos_wchars);
        return ret >>> 0;
    }
    /**
    * @param {number} pos_chars
    * @returns {number}
    */
    charsToWchars(pos_chars) {
        const ret = wasm.branch_charsToWchars(this.__wbg_ptr, pos_chars);
        return ret >>> 0;
    }
}
/**
*/
class OpLog {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(OpLog.prototype);
        obj.__wbg_ptr = ptr;

        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;

        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_oplog_free(ptr);
    }
    /**
    * @param {string | undefined} agent_name
    */
    constructor(agent_name) {
        var ptr0 = isLikeNone(agent_name) ? 0 : passStringToWasm0(agent_name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len0 = WASM_VECTOR_LEN;
        const ret = wasm.oplog_new(ptr0, len0);
        return OpLog.__wrap(ret);
    }
    /**
    * @param {string} agent
    */
    setAgent(agent) {
        const ptr0 = passStringToWasm0(agent, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.oplog_setAgent(this.__wbg_ptr, ptr0, len0);
    }
    /**
    * @returns {OpLog}
    */
    clone() {
        const ret = wasm.oplog_clone(this.__wbg_ptr);
        return OpLog.__wrap(ret);
    }
    /**
    * @param {number} pos
    * @param {string} content
    * @param {Uint32Array | undefined} parents_in
    * @returns {number}
    */
    ins(pos, content, parents_in) {
        const ptr0 = passStringToWasm0(content, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        var ptr1 = isLikeNone(parents_in) ? 0 : passArray32ToWasm0(parents_in, wasm.__wbindgen_malloc);
        var len1 = WASM_VECTOR_LEN;
        const ret = wasm.oplog_ins(this.__wbg_ptr, pos, ptr0, len0, ptr1, len1);
        return ret >>> 0;
    }
    /**
    * @param {number} pos
    * @param {number} len
    * @param {Uint32Array | undefined} parents_in
    * @returns {number}
    */
    del(pos, len, parents_in) {
        var ptr0 = isLikeNone(parents_in) ? 0 : passArray32ToWasm0(parents_in, wasm.__wbindgen_malloc);
        var len0 = WASM_VECTOR_LEN;
        const ret = wasm.oplog_del(this.__wbg_ptr, pos, len, ptr0, len0);
        return ret >>> 0;
    }
    /**
    * @returns {Branch}
    */
    checkout() {
        const ret = wasm.branch_all(this.__wbg_ptr);
        return Branch.__wrap(ret);
    }
    /**
    * @returns {any}
    */
    getOps() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.oplog_getOps(retptr, this.__wbg_ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            var r2 = getInt32Memory0()[retptr / 4 + 2];
            if (r2) {
                throw takeObject(r1);
            }
            return takeObject(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
    * @param {Uint32Array} frontier
    * @returns {any}
    */
    getOpsSince(frontier) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passArray32ToWasm0(frontier, wasm.__wbindgen_malloc);
            const len0 = WASM_VECTOR_LEN;
            wasm.oplog_getOpsSince(retptr, this.__wbg_ptr, ptr0, len0);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            var r2 = getInt32Memory0()[retptr / 4 + 2];
            if (r2) {
                throw takeObject(r1);
            }
            return takeObject(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
    * @returns {any}
    */
    getHistory() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.oplog_getHistory(retptr, this.__wbg_ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            var r2 = getInt32Memory0()[retptr / 4 + 2];
            if (r2) {
                throw takeObject(r1);
            }
            return takeObject(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
    * @returns {Uint32Array}
    */
    getLocalVersion() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.oplog_getLocalVersion(retptr, this.__wbg_ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            var v1 = getArrayU32FromWasm0(r0, r1).slice();
            wasm.__wbindgen_free(r0, r1 * 4);
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
    * @param {Uint32Array} version
    * @returns {any}
    */
    localToRemoteVersion(version) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passArray32ToWasm0(version, wasm.__wbindgen_malloc);
            const len0 = WASM_VECTOR_LEN;
            wasm.oplog_localToRemoteVersion(retptr, this.__wbg_ptr, ptr0, len0);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            var r2 = getInt32Memory0()[retptr / 4 + 2];
            if (r2) {
                throw takeObject(r1);
            }
            return takeObject(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
    * @returns {any}
    */
    getRemoteVersion() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.oplog_getRemoteVersion(retptr, this.__wbg_ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            var r2 = getInt32Memory0()[retptr / 4 + 2];
            if (r2) {
                throw takeObject(r1);
            }
            return takeObject(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
    * @returns {Uint8Array}
    */
    toBytes() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.oplog_toBytes(retptr, this.__wbg_ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            var v1 = getArrayU8FromWasm0(r0, r1).slice();
            wasm.__wbindgen_free(r0, r1 * 1);
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
    * @param {Uint32Array} from_version
    * @returns {Uint8Array}
    */
    getPatchSince(from_version) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passArray32ToWasm0(from_version, wasm.__wbindgen_malloc);
            const len0 = WASM_VECTOR_LEN;
            wasm.oplog_getPatchSince(retptr, this.__wbg_ptr, ptr0, len0);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            var v2 = getArrayU8FromWasm0(r0, r1).slice();
            wasm.__wbindgen_free(r0, r1 * 1);
            return v2;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
    * @param {Uint8Array} bytes
    * @param {string | undefined} agent_name
    * @returns {OpLog}
    */
    static fromBytes(bytes, agent_name) {
        const ptr0 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        var ptr1 = isLikeNone(agent_name) ? 0 : passStringToWasm0(agent_name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len1 = WASM_VECTOR_LEN;
        const ret = wasm.oplog_fromBytes(ptr0, len0, ptr1, len1);
        return OpLog.__wrap(ret);
    }
    /**
    * Decode bytes, and add (merge in) any missing operations.
    * @param {Uint8Array} bytes
    * @returns {any}
    */
    addFromBytes(bytes) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
            const len0 = WASM_VECTOR_LEN;
            wasm.oplog_addFromBytes(retptr, this.__wbg_ptr, ptr0, len0);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            var r2 = getInt32Memory0()[retptr / 4 + 2];
            if (r2) {
                throw takeObject(r1);
            }
            return takeObject(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
    * @returns {any}
    */
    getXF() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.oplog_getXF(retptr, this.__wbg_ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            var r2 = getInt32Memory0()[retptr / 4 + 2];
            if (r2) {
                throw takeObject(r1);
            }
            return takeObject(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
    * @param {Uint32Array} from_version
    * @returns {any}
    */
    getXFSince(from_version) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passArray32ToWasm0(from_version, wasm.__wbindgen_malloc);
            const len0 = WASM_VECTOR_LEN;
            wasm.oplog_getXFSince(retptr, this.__wbg_ptr, ptr0, len0);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            var r2 = getInt32Memory0()[retptr / 4 + 2];
            if (r2) {
                throw takeObject(r1);
            }
            return takeObject(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
    * @param {Uint32Array} a
    * @param {Uint32Array} b
    * @returns {Uint32Array}
    */
    mergeVersions(a, b) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passArray32ToWasm0(a, wasm.__wbindgen_malloc);
            const len0 = WASM_VECTOR_LEN;
            const ptr1 = passArray32ToWasm0(b, wasm.__wbindgen_malloc);
            const len1 = WASM_VECTOR_LEN;
            wasm.oplog_mergeVersions(retptr, this.__wbg_ptr, ptr0, len0, ptr1, len1);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            var v3 = getArrayU32FromWasm0(r0, r1).slice();
            wasm.__wbindgen_free(r0, r1 * 4);
            return v3;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);

            } catch (e) {
                if (module.headers.get('Content-Type') != 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else {
                    throw e;
                }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);

    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };

        } else {
            return instance;
        }
    }
}

function __wbg_get_imports() {
    const imports = {};
    imports.wbg = {};
    imports.wbg.__wbindgen_object_drop_ref = function (arg0) {
        takeObject(arg0);
    };
    imports.wbg.__wbindgen_string_new = function (arg0, arg1) {
        const ret = getStringFromWasm0(arg0, arg1);
        return addHeapObject(ret);
    };
    imports.wbg.__wbg_BigInt_1fab4952b6c4a499 = function (arg0) {
        const ret = BigInt(BigInt.asUintN(64, arg0));
        return addHeapObject(ret);
    };
    imports.wbg.__wbindgen_is_object = function (arg0) {
        const val = getObject(arg0);
        const ret = typeof (val) === 'object' && val !== null;
        return ret;
    };
    imports.wbg.__wbindgen_is_undefined = function (arg0) {
        const ret = getObject(arg0) === undefined;
        return ret;
    };
    imports.wbg.__wbindgen_number_new = function (arg0) {
        const ret = arg0;
        return addHeapObject(ret);
    };
    imports.wbg.__wbindgen_object_clone_ref = function (arg0) {
        const ret = getObject(arg0);
        return addHeapObject(ret);
    };
    imports.wbg.__wbg_set_c943d600fa71e4dd = function (arg0, arg1, arg2) {
        getObject(arg0)[takeObject(arg1)] = takeObject(arg2);
    };
    imports.wbg.__wbg_new_abda76e883ba8a5f = function () {
        const ret = new Error();
        return addHeapObject(ret);
    };
    imports.wbg.__wbg_stack_658279fe44541cf6 = function (arg0, arg1) {
        const ret = getObject(arg1).stack;
        const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        getInt32Memory0()[arg0 / 4 + 1] = len1;
        getInt32Memory0()[arg0 / 4 + 0] = ptr1;
    };
    imports.wbg.__wbg_error_f851667af71bcfc6 = function (arg0, arg1) {
        let deferred0_0;
        let deferred0_1;
        try {
            deferred0_0 = arg0;
            deferred0_1 = arg1;
            console.error(getStringFromWasm0(arg0, arg1));
        } finally {
            wasm.__wbindgen_free(deferred0_0, deferred0_1);
        }
    };
    imports.wbg.__wbg_randomFillSync_065afffde01daa66 = function () {
        return handleError(function (arg0, arg1, arg2) {
            getObject(arg0).randomFillSync(getArrayU8FromWasm0(arg1, arg2));
        }, arguments)
    };
    imports.wbg.__wbg_getRandomValues_b99eec4244a475bb = function () {
        return handleError(function (arg0, arg1) {
            getObject(arg0).getRandomValues(getObject(arg1));
        }, arguments)
    };
    imports.wbg.__wbg_process_0cc2ada8524d6f83 = function (arg0) {
        const ret = getObject(arg0).process;
        return addHeapObject(ret);
    };
    imports.wbg.__wbg_versions_c11acceab27a6c87 = function (arg0) {
        const ret = getObject(arg0).versions;
        return addHeapObject(ret);
    };
    imports.wbg.__wbg_node_7ff1ce49caf23815 = function (arg0) {
        const ret = getObject(arg0).node;
        return addHeapObject(ret);
    };
    imports.wbg.__wbindgen_is_string = function (arg0) {
        const ret = typeof (getObject(arg0)) === 'string';
        return ret;
    };
    imports.wbg.__wbg_crypto_2036bed7c44c25e7 = function (arg0) {
        const ret = getObject(arg0).crypto;
        return addHeapObject(ret);
    };
    imports.wbg.__wbg_msCrypto_a21fc88caf1ecdc8 = function (arg0) {
        const ret = getObject(arg0).msCrypto;
        return addHeapObject(ret);
    };
    imports.wbg.__wbg_static_accessor_NODE_MODULE_cf6401cc1091279e = function () {
        const ret = module;
        return addHeapObject(ret);
    };
    imports.wbg.__wbg_require_a746e79b322b9336 = function () {
        return handleError(function (arg0, arg1, arg2) {
            const ret = getObject(arg0).require(getStringFromWasm0(arg1, arg2));
            return addHeapObject(ret);
        }, arguments)
    };
    imports.wbg.__wbg_new_18bc2084e9a3e1ff = function () {
        const ret = new Array();
        return addHeapObject(ret);
    };
    imports.wbg.__wbg_newnoargs_e643855c6572a4a8 = function (arg0, arg1) {
        const ret = new Function(getStringFromWasm0(arg0, arg1));
        return addHeapObject(ret);
    };
    imports.wbg.__wbg_call_f96b398515635514 = function () {
        return handleError(function (arg0, arg1) {
            const ret = getObject(arg0).call(getObject(arg1));
            return addHeapObject(ret);
        }, arguments)
    };
    imports.wbg.__wbg_new_7befa02319b36069 = function () {
        const ret = new Object();
        return addHeapObject(ret);
    };
    imports.wbg.__wbg_set_aee8682c7ee9ac44 = function (arg0, arg1, arg2) {
        getObject(arg0)[arg1 >>> 0] = takeObject(arg2);
    };
    imports.wbg.__wbg_new_6d6ba2e6fc178ce1 = function (arg0, arg1) {
        const ret = new Error(getStringFromWasm0(arg0, arg1));
        return addHeapObject(ret);
    };
    imports.wbg.__wbg_buffer_fcbfb6d88b2732e9 = function (arg0) {
        const ret = getObject(arg0).buffer;
        return addHeapObject(ret);
    };
    imports.wbg.__wbg_self_b9aad7f1c618bfaf = function () {
        return handleError(function () {
            const ret = self.self;
            return addHeapObject(ret);
        }, arguments)
    };
    imports.wbg.__wbg_window_55e469842c98b086 = function () {
        return handleError(function () {
            const ret = window.window;
            return addHeapObject(ret);
        }, arguments)
    };
    imports.wbg.__wbg_globalThis_d0957e302752547e = function () {
        return handleError(function () {
            const ret = globalThis.globalThis;
            return addHeapObject(ret);
        }, arguments)
    };
    imports.wbg.__wbg_global_ae2f87312b8987fb = function () {
        return handleError(function () {
            const ret = global.global;
            return addHeapObject(ret);
        }, arguments)
    };
    imports.wbg.__wbg_new_bc5d9aad3f9ac80e = function (arg0) {
        const ret = new Uint8Array(getObject(arg0));
        return addHeapObject(ret);
    };
    imports.wbg.__wbg_set_4b3aa8445ac1e91c = function (arg0, arg1, arg2) {
        getObject(arg0).set(getObject(arg1), arg2 >>> 0);
    };
    imports.wbg.__wbg_length_d9c4ded7e708c6a1 = function (arg0) {
        const ret = getObject(arg0).length;
        return ret;
    };
    imports.wbg.__wbg_newwithlength_89eca18f2603a999 = function (arg0) {
        const ret = new Uint8Array(arg0 >>> 0);
        return addHeapObject(ret);
    };
    imports.wbg.__wbg_subarray_7649d027b2b141b3 = function (arg0, arg1, arg2) {
        const ret = getObject(arg0).subarray(arg1 >>> 0, arg2 >>> 0);
        return addHeapObject(ret);
    };
    imports.wbg.__wbindgen_throw = function (arg0, arg1) {
        throw new Error(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbindgen_memory = function () {
        const ret = wasm.memory;
        return addHeapObject(ret);
    };

    return imports;
}

function __wbg_init_memory(imports, maybe_memory) {

}

function __wbg_finalize_init(instance, module) {
    wasm = instance.exports;
    __wbg_init.__wbindgen_wasm_module = module;
    cachedInt32Memory0 = null;
    cachedUint32Memory0 = null;
    cachedUint8Memory0 = null;


    return wasm;
}

function initSync(module) {
    if (wasm !== undefined) return wasm;

    const imports = __wbg_get_imports();

    __wbg_init_memory(imports);

    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }

    const instance = new WebAssembly.Instance(module, imports);

    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(input) {
    if (wasm !== undefined) return wasm;

    throw 'did not think this would run'

    if (typeof input === 'undefined') {
        // input = new URL('dt_bg.wasm', import.meta.url);
    }

    const imports = __wbg_get_imports();

    let wasmModuleResponse;

    // Use fetch to get the .wasm module as an ArrayBuffer
    if (typeof input === 'string' || (typeof Request === 'function' && input instanceof Request) || (typeof URL === 'function' && input instanceof URL)) {
        wasmModuleResponse = await fetch(input);
    }

    const wasmModuleBuffer = await wasmModuleResponse.arrayBuffer();

    __wbg_init_memory(imports);

    // Compile and instantiate the WebAssembly module manually
    const module = await WebAssembly.compile(wasmModuleBuffer);
    const instance = await WebAssembly.instantiate(module, imports);

    return __wbg_finalize_init(instance, module);
}

////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////

chrome.runtime.onMessage.addListener(async function (request, sender, sendResponse) {

    console.log(`getting message with action: ${request.action}`)

    if (request.action === "replace_html") {
        document.open();
        document.write(`
        <script src="${chrome.runtime.getURL('braid-http-client.js')}"></script>
        <body
            style="padding: 0px; margin: 0px; width: calc(100vw); height: calc(100vh - 5px); box-sizing: border-box;"
        >
            <textarea
            id="texty"
            style="width: 100%; height:100%; padding: 13px 8px; font-size: 13px; border: 0; box-sizing: border-box;"
            autofocus
            readonly
            placeholder="loading.."
            ></textarea>
        </body>
        `);
        document.close();
        await inject()
    }
});

async function inject() {
    let enter_error_state = (why) => {
        console.log(`enter_error_state because: ${why}`)
        textarea.style.background = 'pink'
        textarea.disabled = true
    }
    window.errorify = (msg) => {
        enter_error_state(msg)
        throw new Error(msg)
    }

    var braid = {fetch: braid_fetch}

    let on_bytes_received = s => {
        console.log(`on_bytes_received[${s.slice(0, 500)}]`)
        chrome.runtime.sendMessage({ action: "braid_in", data: s });
    }

    let on_bytes_going_out = (params, url) => {
        console.log(`on_bytes_going_out[${constructHTTPRequest(params, url)}]`)
        chrome.runtime.sendMessage({ action: "braid_out", data: constructHTTPRequest(params, url) });
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
    let oplog = new OpLog(Math.random().toString(36).substr(2));

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

            sent_count++;
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
                method: "POST",
                mode: "cors",
                version: p.version,
                parents: p.parents,
                patches: [
                    {
                        unit: "json",
                        range: p.range,
                        content: p.content,
                    },
                ],
            };
            fetchWithRetry(window.location.href, ops);
        }
    });

    async function connect() {
        try {
            (
                await braid.fetch(window.location.href, {
                    subscribe: true,
                }, on_bytes_received, on_bytes_going_out)
            ).subscribe(
                ({ version, parents, body, patches }) => {
                    //   console.log(
                    //     `v = ${JSON.stringify(
                    //       { version, parents, body, patches },
                    //       null,
                    //       4
                    //     )}`
                    //   );

                    // chrome.runtime.sendMessage({ action: "braid_in", data: { version, parents, body, patches } });

                    if (textarea.hasAttribute("readonly")) {
                        textarea.removeAttribute("readonly");
                        textarea.placeholder = "type message here..";
                    }

                    if (!patches) return;

                    let v = oplog.getLocalVersion();

                    try {
                        let range = patches[0].range.match(/\d+/g).map((x) => parseInt(x));
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
                                v = JSON.parse(v)
                                v = JSON.stringify([v[0], v[1] + 1])
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
                                v = JSON.parse(v)
                                v = JSON.stringify([v[0], v[1] + 1])
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
                    setTimeout(connect, 1000);
                }
            );
        } catch (e) {
            console.log(`e = ${e}`);
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

    function OpLog_get_patches(bytes, op_runs) {
        console.log(`op_runs = `, op_runs);

        let [agents, versions, parentss] = parseDT([...bytes]);

        // console.log(JSON.stringify({ agents, versions, parentss }, null, 4))

        let i = 0;
        let patches = [];
        op_runs.forEach((op_run) => {
            let version = JSON.stringify(versions[i]);
            let parents = parentss[i].map((x) => JSON.stringify(x));
            let start = op_run.start;
            let end = start + 1;
            let content = op_run.content?.[0];
            let len = op_run.end - op_run.start;
            for (let j = 1; j <= len; j++) {
                let I = i + j;
                if (
                    j == len ||
                    parentss[I].length != 1 ||
                    parentss[I][0][0] != versions[I - 1][0] ||
                    parentss[I][0][1] != versions[I - 1][1] ||
                    versions[I][0] != versions[I - 1][0] ||
                    versions[I][1] != versions[I - 1][1] + 1
                ) {
                    patches.push({
                        version,
                        parents,
                        unit: "json",
                        range: content ? `[${start}:${start}]` : `[${start}:${end}]`,
                        content: content ?? "",
                    });
                    if (j == len) break;
                    version = JSON.stringify(versions[I]);
                    parents = parentss[I].map((x) => JSON.stringify(x));
                    start = op_run.start + j;
                    content = "";
                }
                end++;
                if (op_run.content) content += op_run.content[j];
            }
            i += len;
        });
        return patches;

        function parseDT(byte_array) {
            if (
                new TextDecoder().decode(new Uint8Array(byte_array.splice(0, 8))) !==
                "DMNDTYPS"
            )
                errorify("dt parse error, expected DMNDTYPS");

            if (byte_array.shift() != 0)
                errorify("dt parse error, expected version 0");

            let agents = [];
            let versions = [];
            let parentss = [];

            while (byte_array.length) {
                let id = byte_array.shift();
                let len = read_varint(byte_array);
                if (id == 1) {
                } else if (id == 3) {
                    let goal = byte_array.length - len;
                    while (byte_array.length > goal) {
                        agents.push(read_string(byte_array));
                    }
                } else if (id == 20) {
                } else if (id == 21) {
                    let seqs = {};
                    let goal = byte_array.length - len;
                    while (byte_array.length > goal) {
                        let part0 = read_varint(byte_array);
                        let has_jump = part0 & 1;
                        let agent_i = (part0 >> 1) - 1;
                        let run_length = read_varint(byte_array);
                        let jump = 0;
                        if (has_jump) {
                            let part2 = read_varint(byte_array);
                            jump = part2 >> 1;
                            if (part2 & 1) jump *= -1;
                        }
                        let base = (seqs[agent_i] || 0) + jump;

                        for (let i = 0; i < run_length; i++) {
                            versions.push([agents[agent_i], base + i]);
                        }
                        seqs[agent_i] = base + run_length;
                    }
                } else if (id == 23) {
                    let count = 0;
                    let goal = byte_array.length - len;
                    while (byte_array.length > goal) {
                        let run_len = read_varint(byte_array);

                        let parents = [];
                        let has_more = 1;
                        while (has_more) {
                            let x = read_varint(byte_array);
                            let is_foreign = 0x1 & x;
                            has_more = 0x2 & x;
                            let num = x >> 2;

                            if (x == 1) {
                                parents.push(["root"]);
                            } else if (!is_foreign) {
                                parents.push(versions[count - num]);
                            } else {
                                parents.push([agents[num - 1], read_varint(byte_array)]);
                            }
                        }
                        parentss.push(parents);
                        count++;

                        for (let i = 0; i < run_len - 1; i++) {
                            parentss.push([versions[count - 1]]);
                            count++;
                        }
                    }
                } else {
                    byte_array.splice(0, len);
                }
            }

            function read_string(byte_array) {
                return new TextDecoder().decode(
                    new Uint8Array(byte_array.splice(0, read_varint(byte_array)))
                );
            }

            function read_varint(byte_array) {
                let result = 0;
                let shift = 0;
                while (true) {
                    if (byte_array.length === 0)
                        errorify("byte array does not contain varint");

                    let byte_val = byte_array.shift();
                    result |= (byte_val & 0x7f) << shift;
                    if ((byte_val & 0x80) == 0) return result;
                    shift += 7;
                }
            }

            return [agents, versions, parentss];
        }
    }

    function OpLog_create_bytes(version, parents, pos, ins) {
        //   console.log(
        //     `args = ${JSON.stringify({ version, parents, pos, del, ins }, null, 4)}`
        //   );

        function write_varint(bytes, value) {
            while (value >= 0x80) {
                bytes.push((value & 0x7f) | 0x80);
                value >>= 7;
            }
            bytes.push(value);
        }

        function write_string(byte_array, str) {
            let str_bytes = new TextEncoder().encode(str);
            write_varint(byte_array, str_bytes.length);
            byte_array.push(...str_bytes);
        }

        version = JSON.parse(version);
        parents = parents.map((x) => JSON.parse(x));

        let bytes = [];
        bytes = bytes.concat(Array.from(new TextEncoder().encode("DMNDTYPS")));
        bytes.push(0);

        let file_info = [];
        let agent_names = [];

        let agents = new Set();
        agents.add(version[0]);
        for (let p of parents) if (p.length > 1) agents.add(p[0]);
        agents = [...agents];

        //   console.log(JSON.stringify({ agents, parents }, null, 4));

        let agent_to_i = {};
        for (let [i, agent] of agents.entries()) {
            agent_to_i[agent] = i;
            write_string(agent_names, agent);
        }

        file_info.push(3);
        write_varint(file_info, agent_names.length);
        file_info.push(...agent_names);

        bytes.push(1);
        write_varint(bytes, file_info.length);
        bytes.push(...file_info);

        let branch = [];

        if (parents[0].length > 1) {
            let frontier = [];

            for (let [i, [agent, seq]] of parents.entries()) {
                let has_more = i < parents.length - 1;
                let mapped = agent_to_i[agent];
                let n = ((mapped + 1) << 1) | (has_more ? 1 : 0);
                write_varint(frontier, n);
                write_varint(frontier, seq);
            }

            branch.push(12);
            write_varint(branch, frontier.length);
            branch.push(...frontier);
        }

        bytes.push(10);
        write_varint(bytes, branch.length);
        bytes.push(...branch);

        let patches = [];

        if (ins) {
            let inserted_content_bytes = [];

            inserted_content_bytes.push(0); // ins (not del, which is 1)

            inserted_content_bytes.push(13); // "content" enum (rather than compressed)
            inserted_content_bytes.push(2); // length of content chunk
            inserted_content_bytes.push(4); // "plain text" enum
            inserted_content_bytes.push(ins.charCodeAt(0)); // actual text

            inserted_content_bytes.push(25); // "known" enum
            inserted_content_bytes.push(1); // length of "known" chunk
            inserted_content_bytes.push(3); // content of length 1, and we "know" it

            patches.push(24);
            write_varint(patches, inserted_content_bytes.length);
            patches.push(...inserted_content_bytes);
        }

        if (true) {
            let version_bytes = [];

            let [agent, seq] = version;
            let agent_i = agent_to_i[agent];
            let jump = seq;

            write_varint(version_bytes, ((agent_i + 1) << 1) | (jump != 0 ? 1 : 0));
            write_varint(version_bytes, 1);
            if (jump) write_varint(version_bytes, jump << 1);

            patches.push(21);
            write_varint(patches, version_bytes.length);
            patches.push(...version_bytes);
        }

        if (true) {
            let op_bytes = [];

            write_varint(op_bytes, (pos << 4) | (pos ? 2 : 0) | (ins ? 0 : 4));

            patches.push(22);
            write_varint(patches, op_bytes.length);
            patches.push(...op_bytes);
        }

        if (true) {
            let parents_bytes = [];

            write_varint(parents_bytes, 1);

            if (parents[0].length > 1) {
                for (let [i, [agent, seq]] of parents.entries()) {
                    let has_more = i < parents.length - 1;
                    let agent_i = agent_to_i[agent];
                    write_varint(
                        parents_bytes,
                        ((agent_i + 1) << 2) | (has_more ? 2 : 0) | 1
                    );
                    write_varint(parents_bytes, seq);
                }
            } else write_varint(parents_bytes, 1);

            patches.push(23);
            write_varint(patches, parents_bytes.length);
            patches.push(...parents_bytes);
        }

        bytes.push(20);
        write_varint(bytes, patches.length);
        bytes.push(...patches);

        //   console.log(bytes);

        return bytes;
    }
}
