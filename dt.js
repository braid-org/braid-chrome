// first part: copy of dt.js from https://github.com/josephg/diamond-types, compiling the diamond-types-web module
// second part: copy of section of https://github.com/braid-org/braid-text/blob/master/index.js v0.2.30
// third part: some utility functions

let wasm;

function addToExternrefTable0(obj) {
    const idx = wasm.__externref_table_alloc();
    wasm.__wbindgen_export_2.set(idx, obj);
    return idx;
}

function handleError(f, args) {
    try {
        return f.apply(this, args);
    } catch (e) {
        const idx = addToExternrefTable0(e);
        wasm.__wbindgen_exn_store(idx);
    }
}

const cachedTextDecoder = (typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8', { ignoreBOM: true, fatal: true }) : { decode: () => { throw Error('TextDecoder not available') } } );

if (typeof TextDecoder !== 'undefined') { cachedTextDecoder.decode(); };

let cachedUint8ArrayMemory0 = null;

function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function getStringFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

let WASM_VECTOR_LEN = 0;

const cachedTextEncoder = (typeof TextEncoder !== 'undefined' ? new TextEncoder('utf-8') : { encode: () => { throw Error('TextEncoder not available') } } );

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
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

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
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = encodeString(arg, view);

        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

let cachedDataViewMemory0 = null;

function getDataViewMemory0() {
    if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer.detached === true || (cachedDataViewMemory0.buffer.detached === undefined && cachedDataViewMemory0.buffer !== wasm.memory.buffer)) {
        cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
    }
    return cachedDataViewMemory0;
}

function isLikeNone(x) {
    return x === undefined || x === null;
}

function _assertClass(instance, klass) {
    if (!(instance instanceof klass)) {
        throw new Error(`expected instance of ${klass.name}`);
    }
}

let cachedUint32ArrayMemory0 = null;

function getUint32ArrayMemory0() {
    if (cachedUint32ArrayMemory0 === null || cachedUint32ArrayMemory0.byteLength === 0) {
        cachedUint32ArrayMemory0 = new Uint32Array(wasm.memory.buffer);
    }
    return cachedUint32ArrayMemory0;
}

function passArray32ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 4, 4) >>> 0;
    getUint32ArrayMemory0().set(arg, ptr / 4);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function getArrayU32FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint32ArrayMemory0().subarray(ptr / 4, ptr / 4 + len);
}

function takeFromExternrefTable0(idx) {
    const value = wasm.__wbindgen_export_2.get(idx);
    wasm.__externref_table_dealloc(idx);
    return value;
}

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1, 1) >>> 0;
    getUint8ArrayMemory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

const BranchFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_branch_free(ptr >>> 0, 1));

class Branch {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(Branch.prototype);
        obj.__wbg_ptr = ptr;
        BranchFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        BranchFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_branch_free(ptr, 0);
    }
    constructor() {
        const ret = wasm.branch_new();
        this.__wbg_ptr = ret >>> 0;
        BranchFinalization.register(this, this.__wbg_ptr, this);
        return this;
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
            const ret = wasm.branch_get(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Merge in from some named point in time
     * @param {OpLog} ops
     * @param {Uint32Array | null} [branch]
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
        const ret = wasm.branch_getLocalVersion(this.__wbg_ptr);
        var v1 = getArrayU32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
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

const DocFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_doc_free(ptr >>> 0, 1));

class Doc {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(Doc.prototype);
        obj.__wbg_ptr = ptr;
        DocFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        DocFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_doc_free(ptr, 0);
    }
    /**
     * @param {string | null} [agent_name]
     */
    constructor(agent_name) {
        var ptr0 = isLikeNone(agent_name) ? 0 : passStringToWasm0(agent_name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len0 = WASM_VECTOR_LEN;
        const ret = wasm.doc_new(ptr0, len0);
        this.__wbg_ptr = ret >>> 0;
        DocFinalization.register(this, this.__wbg_ptr, this);
        return this;
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
            const ret = wasm.doc_get(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
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
        const ret = wasm.doc_toBytes(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * @param {Uint32Array} from_version
     * @returns {Uint8Array}
     */
    getPatchSince(from_version) {
        const ptr0 = passArray32ToWasm0(from_version, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.doc_getPatchSince(this.__wbg_ptr, ptr0, len0);
        var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v2;
    }
    /**
     * @param {Uint8Array} bytes
     * @param {string | null} [agent_name]
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
        const ptr0 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.doc_mergeBytes(this.__wbg_ptr, ptr0, len0);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v2 = getArrayU32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v2;
    }
    /**
     * @param {Uint32Array} frontier
     * @returns {any}
     */
    getOpsSince(frontier) {
        const ptr0 = passArray32ToWasm0(frontier, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.doc_getOpsSince(this.__wbg_ptr, ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * @returns {Uint32Array}
     */
    getLocalVersion() {
        const ret = wasm.doc_getLocalVersion(this.__wbg_ptr);
        var v1 = getArrayU32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * @param {Uint32Array} time
     * @returns {any}
     */
    localToRemoteVersion(time) {
        const ptr0 = passArray32ToWasm0(time, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.doc_localToRemoteVersion(this.__wbg_ptr, ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * @returns {any}
     */
    getRemoteVersion() {
        const ret = wasm.doc_getRemoteVersion(this.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * @param {Uint32Array} from_version
     * @returns {any}
     */
    xfSince(from_version) {
        const ptr0 = passArray32ToWasm0(from_version, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.doc_xfSince(this.__wbg_ptr, ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * @returns {any}
     */
    getHistory() {
        const ret = wasm.doc_getHistory(this.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * @param {Uint32Array} a
     * @param {Uint32Array} b
     * @returns {Uint32Array}
     */
    mergeVersions(a, b) {
        const ptr0 = passArray32ToWasm0(a, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArray32ToWasm0(b, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.doc_mergeVersions(this.__wbg_ptr, ptr0, len0, ptr1, len1);
        var v3 = getArrayU32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v3;
    }
    /**
     * @param {number} pos_wchars
     * @returns {number}
     */
    wCharsToChars(pos_wchars) {
        const ret = wasm.doc_wCharsToChars(this.__wbg_ptr, pos_wchars);
        return ret >>> 0;
    }
    /**
     * @param {number} pos_chars
     * @returns {number}
     */
    charsToWchars(pos_chars) {
        const ret = wasm.doc_charsToWchars(this.__wbg_ptr, pos_chars);
        return ret >>> 0;
    }
}

const OpLogFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_oplog_free(ptr >>> 0, 1));

class OpLog {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(OpLog.prototype);
        obj.__wbg_ptr = ptr;
        OpLogFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        OpLogFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_oplog_free(ptr, 0);
    }
    /**
     * @param {string | null} [agent_name]
     */
    constructor(agent_name) {
        var ptr0 = isLikeNone(agent_name) ? 0 : passStringToWasm0(agent_name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len0 = WASM_VECTOR_LEN;
        const ret = wasm.oplog_new(ptr0, len0);
        this.__wbg_ptr = ret >>> 0;
        OpLogFinalization.register(this, this.__wbg_ptr, this);
        return this;
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
     * @param {Uint32Array | null} [parents_in]
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
     * @param {Uint32Array | null} [parents_in]
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
        const ret = wasm.oplog_checkout(this.__wbg_ptr);
        return Branch.__wrap(ret);
    }
    /**
     * @returns {any}
     */
    getOps() {
        const ret = wasm.oplog_getOps(this.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * @param {Uint32Array} frontier
     * @returns {any}
     */
    getOpsSince(frontier) {
        const ptr0 = passArray32ToWasm0(frontier, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.oplog_getOpsSince(this.__wbg_ptr, ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * @returns {any}
     */
    getHistory() {
        const ret = wasm.oplog_getHistory(this.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * @returns {Uint32Array}
     */
    getLocalVersion() {
        const ret = wasm.oplog_getLocalVersion(this.__wbg_ptr);
        var v1 = getArrayU32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * @param {Uint32Array} version
     * @returns {any}
     */
    localToRemoteVersion(version) {
        const ptr0 = passArray32ToWasm0(version, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.oplog_localToRemoteVersion(this.__wbg_ptr, ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * @returns {any}
     */
    getRemoteVersion() {
        const ret = wasm.oplog_getRemoteVersion(this.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * @returns {Uint8Array}
     */
    toBytes() {
        const ret = wasm.oplog_toBytes(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * @param {Uint32Array} from_version
     * @returns {Uint8Array}
     */
    getPatchSince(from_version) {
        const ptr0 = passArray32ToWasm0(from_version, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.oplog_getPatchSince(this.__wbg_ptr, ptr0, len0);
        var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v2;
    }
    /**
     * @param {Uint8Array} bytes
     * @param {string | null} [agent_name]
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
        const ptr0 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.oplog_addFromBytes(this.__wbg_ptr, ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * @returns {any}
     */
    getXF() {
        const ret = wasm.oplog_getXF(this.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * @param {Uint32Array} from_version
     * @returns {any}
     */
    getXFSince(from_version) {
        const ptr0 = passArray32ToWasm0(from_version, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.oplog_getXFSince(this.__wbg_ptr, ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * @param {Uint32Array} a
     * @param {Uint32Array} b
     * @returns {Uint32Array}
     */
    mergeVersions(a, b) {
        const ptr0 = passArray32ToWasm0(a, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArray32ToWasm0(b, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.oplog_mergeVersions(this.__wbg_ptr, ptr0, len0, ptr1, len1);
        var v3 = getArrayU32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v3;
    }
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);

            } catch (e) {
                if (module.headers.get('Content-Type') != 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

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
    imports.wbg.__wbg_buffer_609cc3eee51ed158 = function(arg0) {
        const ret = arg0.buffer;
        return ret;
    };
    imports.wbg.__wbg_call_672a4d21634d4a24 = function() { return handleError(function (arg0, arg1) {
        const ret = arg0.call(arg1);
        return ret;
    }, arguments) };
    imports.wbg.__wbg_call_7cccdd69e0791ae2 = function() { return handleError(function (arg0, arg1, arg2) {
        const ret = arg0.call(arg1, arg2);
        return ret;
    }, arguments) };
    imports.wbg.__wbg_crypto_574e78ad8b13b65f = function(arg0) {
        const ret = arg0.crypto;
        return ret;
    };
    imports.wbg.__wbg_error_7534b8e9a36f1ab4 = function(arg0, arg1) {
        let deferred0_0;
        let deferred0_1;
        try {
            deferred0_0 = arg0;
            deferred0_1 = arg1;
            console.error(getStringFromWasm0(arg0, arg1));
        } finally {
            wasm.__wbindgen_free(deferred0_0, deferred0_1, 1);
        }
    };
    imports.wbg.__wbg_getRandomValues_b8f5dbd5f3995a9e = function() { return handleError(function (arg0, arg1) {
        arg0.getRandomValues(arg1);
    }, arguments) };
    imports.wbg.__wbg_msCrypto_a61aeb35a24c1329 = function(arg0) {
        const ret = arg0.msCrypto;
        return ret;
    };
    imports.wbg.__wbg_new_405e22f390576ce2 = function() {
        const ret = new Object();
        return ret;
    };
    imports.wbg.__wbg_new_78feb108b6472713 = function() {
        const ret = new Array();
        return ret;
    };
    imports.wbg.__wbg_new_8a6f238a6ece86ea = function() {
        const ret = new Error();
        return ret;
    };
    imports.wbg.__wbg_new_a12002a7f91c75be = function(arg0) {
        const ret = new Uint8Array(arg0);
        return ret;
    };
    imports.wbg.__wbg_newnoargs_105ed471475aaf50 = function(arg0, arg1) {
        const ret = new Function(getStringFromWasm0(arg0, arg1));
        return ret;
    };
    imports.wbg.__wbg_newwithbyteoffsetandlength_d97e637ebe145a9a = function(arg0, arg1, arg2) {
        const ret = new Uint8Array(arg0, arg1 >>> 0, arg2 >>> 0);
        return ret;
    };
    imports.wbg.__wbg_newwithlength_a381634e90c276d4 = function(arg0) {
        const ret = new Uint8Array(arg0 >>> 0);
        return ret;
    };
    imports.wbg.__wbg_node_905d3e251edff8a2 = function(arg0) {
        const ret = arg0.node;
        return ret;
    };
    imports.wbg.__wbg_process_dc0fbacc7c1c06f7 = function(arg0) {
        const ret = arg0.process;
        return ret;
    };
    imports.wbg.__wbg_randomFillSync_ac0988aba3254290 = function() { return handleError(function (arg0, arg1) {
        arg0.randomFillSync(arg1);
    }, arguments) };
    imports.wbg.__wbg_require_60cc747a6bc5215a = function() { return handleError(function () {
        const ret = module.require;
        return ret;
    }, arguments) };
    imports.wbg.__wbg_set_37837023f3d740e8 = function(arg0, arg1, arg2) {
        arg0[arg1 >>> 0] = arg2;
    };
    imports.wbg.__wbg_set_3fda3bac07393de4 = function(arg0, arg1, arg2) {
        arg0[arg1] = arg2;
    };
    imports.wbg.__wbg_set_65595bdd868b3009 = function(arg0, arg1, arg2) {
        arg0.set(arg1, arg2 >>> 0);
    };
    imports.wbg.__wbg_stack_0ed75d68575b0f3c = function(arg0, arg1) {
        const ret = arg1.stack;
        const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
        getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
    };
    imports.wbg.__wbg_static_accessor_GLOBAL_88a902d13a557d07 = function() {
        const ret = typeof global === 'undefined' ? null : global;
        return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
    };
    imports.wbg.__wbg_static_accessor_GLOBAL_THIS_56578be7e9f832b0 = function() {
        const ret = typeof globalThis === 'undefined' ? null : globalThis;
        return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
    };
    imports.wbg.__wbg_static_accessor_SELF_37c5d418e4bf5819 = function() {
        const ret = typeof self === 'undefined' ? null : self;
        return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
    };
    imports.wbg.__wbg_static_accessor_WINDOW_5de37043a91a9c40 = function() {
        const ret = typeof window === 'undefined' ? null : window;
        return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
    };
    imports.wbg.__wbg_subarray_aa9065fa9dc5df96 = function(arg0, arg1, arg2) {
        const ret = arg0.subarray(arg1 >>> 0, arg2 >>> 0);
        return ret;
    };
    imports.wbg.__wbg_versions_c01dfd4722a88165 = function(arg0) {
        const ret = arg0.versions;
        return ret;
    };
    imports.wbg.__wbindgen_bigint_from_u64 = function(arg0) {
        const ret = BigInt.asUintN(64, arg0);
        return ret;
    };
    imports.wbg.__wbindgen_error_new = function(arg0, arg1) {
        const ret = new Error(getStringFromWasm0(arg0, arg1));
        return ret;
    };
    imports.wbg.__wbindgen_init_externref_table = function() {
        const table = wasm.__wbindgen_export_2;
        const offset = table.grow(4);
        table.set(0, undefined);
        table.set(offset + 0, undefined);
        table.set(offset + 1, null);
        table.set(offset + 2, true);
        table.set(offset + 3, false);
        ;
    };
    imports.wbg.__wbindgen_is_function = function(arg0) {
        const ret = typeof(arg0) === 'function';
        return ret;
    };
    imports.wbg.__wbindgen_is_object = function(arg0) {
        const val = arg0;
        const ret = typeof(val) === 'object' && val !== null;
        return ret;
    };
    imports.wbg.__wbindgen_is_string = function(arg0) {
        const ret = typeof(arg0) === 'string';
        return ret;
    };
    imports.wbg.__wbindgen_is_undefined = function(arg0) {
        const ret = arg0 === undefined;
        return ret;
    };
    imports.wbg.__wbindgen_memory = function() {
        const ret = wasm.memory;
        return ret;
    };
    imports.wbg.__wbindgen_number_new = function(arg0) {
        const ret = arg0;
        return ret;
    };
    imports.wbg.__wbindgen_string_new = function(arg0, arg1) {
        const ret = getStringFromWasm0(arg0, arg1);
        return ret;
    };
    imports.wbg.__wbindgen_throw = function(arg0, arg1) {
        throw new Error(getStringFromWasm0(arg0, arg1));
    };

    return imports;
}

function __wbg_init_memory(imports, memory) {

}

function __wbg_finalize_init(instance, module) {
    wasm = instance.exports;
    __wbg_init.__wbindgen_wasm_module = module;
    cachedDataViewMemory0 = null;
    cachedUint32ArrayMemory0 = null;
    cachedUint8ArrayMemory0 = null;


    wasm.__wbindgen_start();
    return wasm;
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (typeof module !== 'undefined') {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();

    __wbg_init_memory(imports);

    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }

    const instance = new WebAssembly.Instance(module, imports);

    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;


    if (typeof module_or_path !== 'undefined') {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (typeof module_or_path === 'undefined') {
        // module_or_path = new URL('dt_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    __wbg_init_memory(imports);

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

//////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////

// copy of section of https://github.com/braid-org/braid-text/blob/master/index.js v0.2.30

// note: returns a doc that needs to be freed
function dt_get(doc, version, agent = null, anti_version = null) {
    if (dt_get.last_doc) dt_get.last_doc.free()

    let bytes = doc.toBytes()
    dt_get.last_doc = doc = Doc.fromBytes(bytes, agent)

    let [_agents, versions, parentss] = dt_parse([...bytes])
    if (anti_version) {
        var include_versions = new Set()
        var bad_versions = new Set(anti_version)

        for (let i = 0; i < versions.length; i++) {
            var v = versions[i].join("-")
            var ps = parentss[i].map(x => x.join('-'))
            if (bad_versions.has(v) || ps.some(x => bad_versions.has(x)))
                bad_versions.add(v)
            else
                include_versions.add(v)
        }
    } else {
        var include_versions = new Set(version)
        var looking_for = new Set(version)
        var local_version = []

        for (let i = versions.length - 1; i >= 0; i--) {
            var v = versions[i].join("-")
            var ps = parentss[i].map(x => x.join('-'))
            if (looking_for.has(v)) {
                local_version.push(i)
                looking_for.delete(v)
            }
            if (include_versions.has(v))
                ps.forEach(x => include_versions.add(x))
        }
        local_version.reverse()

        // NOTE: currently used by braid-chrome in dt.js at the bottom
        dt_get.last_local_version = new Uint32Array(local_version)

        if (looking_for.size) throw new Error(`version not found: ${version}`)
    }

    let new_doc = new Doc(agent)
    let op_runs = doc.getOpsSince([])

    let i = 0
    op_runs.forEach((op_run) => {
        if (op_run.content) op_run.content = [...op_run.content]

        let len = op_run.end - op_run.start
        let base_i = i
        for (let j = 1; j <= len; j++) {
            let I = base_i + j
            if (
                j == len ||
                parentss[I].length != 1 ||
                parentss[I][0][0] != versions[I - 1][0] ||
                parentss[I][0][1] != versions[I - 1][1] ||
                versions[I][0] != versions[I - 1][0] ||
                versions[I][1] != versions[I - 1][1] + 1
            ) {
                for (; i < I; i++) {
                    let version = versions[i].join("-")
                    if (!include_versions.has(version)) continue
                    let og_i = i
                    let content = []
                    if (op_run.content?.[i - base_i]) content.push(op_run.content[i - base_i])
                    if (!!op_run.content === op_run.fwd)
                        while (i + 1 < I && include_versions.has(versions[i + 1].join("-"))) {
                            i++
                            if (op_run.content?.[i - base_i]) content.push(op_run.content[i - base_i])
                        }
                    content = content.length ? content.join("") : null

                    new_doc.mergeBytes(
                        dt_create_bytes(
                            version,
                            parentss[og_i].map((x) => x.join("-")),
                            op_run.fwd ?
                                (op_run.content ?
                                    op_run.start + (og_i - base_i) :
                                    op_run.start) :
                                op_run.end - 1 - (i - base_i),
                            op_run.content ? 0 : i - og_i + 1,
                            content
                        )
                    )
                }
            }
        }
    })
    return new_doc
}

function dt_get_patches(doc, version = null) {
    let bytes = doc.toBytes()
    doc = Doc.fromBytes(bytes)

    let [_agents, versions, parentss] = dt_parse([...bytes])

    let op_runs = []
    if (version && v_eq(version,
        doc.getRemoteVersion().map((x) => x.join("-")).sort())) {
        // they want everything past the end, which is nothing
    } else if (version) {
        let frontier = {}
        version.forEach((x) => frontier[x] = true)
        let local_version = []
        for (let i = 0; i < versions.length; i++)
            if (frontier[versions[i].join("-")]) local_version.push(i)
        let after_bytes = doc.getPatchSince(new Uint32Array(local_version))

        ;[_agents, versions, parentss] = dt_parse([...after_bytes])

        let before_doc = dt_get(doc, version)
        let before_doc_frontier = before_doc.getLocalVersion()

        before_doc.mergeBytes(after_bytes)
        op_runs = before_doc.getOpsSince(before_doc_frontier)

        before_doc.free()
    } else op_runs = doc.getOpsSince([])

    doc.free()

    let i = 0
    let patches = []
    op_runs.forEach((op_run) => {
        let version = versions[i]
        let parents = parentss[i].map((x) => x.join("-")).sort()
        let start = op_run.start
        let end = start + 1
        if (op_run.content) op_run.content = [...op_run.content]
        let len = op_run.end - op_run.start
        for (let j = 1; j <= len; j++) {
            let I = i + j
            if (
                (!op_run.content && op_run.fwd) ||
                j == len ||
                parentss[I].length != 1 ||
                parentss[I][0][0] != versions[I - 1][0] ||
                parentss[I][0][1] != versions[I - 1][1] ||
                versions[I][0] != versions[I - 1][0] ||
                versions[I][1] != versions[I - 1][1] + 1
            ) {
                let s = op_run.fwd ?
                    (op_run.content ?
                        start :
                        op_run.start) :
                    (op_run.start + (op_run.end - end))
                let e = op_run.fwd ?
                    (op_run.content ?
                        end :
                        op_run.start + (end - start)) :
                    (op_run.end - (start - op_run.start))
                patches.push({
                    version: `${version[0]}-${version[1] + e - s - 1}`,
                    parents,
                    unit: "text",
                    range: op_run.content ? `[${s}:${s}]` : `[${s}:${e}]`,
                    content: op_run.content?.slice(start - op_run.start, end - op_run.start).join("") ?? "",
                    start: s,
                    end: e,
                })
                if (j == len) break
                version = versions[I]
                parents = parentss[I].map((x) => x.join("-")).sort()
                start = op_run.start + j
            }
            end++
        }
        i += len
    })
    return patches
}

function dt_parse(byte_array) {
    if (new TextDecoder().decode(new Uint8Array(byte_array.splice(0, 8))) !== "DMNDTYPS") throw new Error("dt parse error, expected DMNDTYPS")

    if (byte_array.shift() != 0) throw new Error("dt parse error, expected version 0")

    let agents = []
    let versions = []
    let parentss = []

    while (byte_array.length) {
        let id = byte_array.shift()
        let len = dt_read_varint(byte_array)
        if (id == 1) {
        } else if (id == 3) {
            let goal = byte_array.length - len
            while (byte_array.length > goal) {
                agents.push(dt_read_string(byte_array))
            }
        } else if (id == 20) {
        } else if (id == 21) {
            let seqs = {}
            let goal = byte_array.length - len
            while (byte_array.length > goal) {
                let part0 = dt_read_varint(byte_array)
                let has_jump = part0 & 1
                let agent_i = (part0 >> 1) - 1
                let run_length = dt_read_varint(byte_array)
                let jump = 0
                if (has_jump) {
                    let part2 = dt_read_varint(byte_array)
                    jump = part2 >> 1
                    if (part2 & 1) jump *= -1
                }
                let base = (seqs[agent_i] || 0) + jump

                for (let i = 0; i < run_length; i++) {
                    versions.push([agents[agent_i], base + i])
                }
                seqs[agent_i] = base + run_length
            }
        } else if (id == 23) {
            let count = 0
            let goal = byte_array.length - len
            while (byte_array.length > goal) {
                let run_len = dt_read_varint(byte_array)

                let parents = []
                let has_more = 1
                while (has_more) {
                    let x = dt_read_varint(byte_array)
                    let is_foreign = 0x1 & x
                    has_more = 0x2 & x
                    let num = x >> 2

                    if (x == 1) {
                        // no parents (e.g. parent is "root")
                    } else if (!is_foreign) {
                        parents.push(versions[count - num])
                    } else {
                        parents.push([agents[num - 1], dt_read_varint(byte_array)])
                    }
                }
                parentss.push(parents)
                count++

                for (let i = 0; i < run_len - 1; i++) {
                    parentss.push([versions[count - 1]])
                    count++
                }
            }
        } else {
            byte_array.splice(0, len)
        }
    }

    return [agents, versions, parentss]
}

function dt_read_string(byte_array) {
    return new TextDecoder().decode(new Uint8Array(byte_array.splice(0, dt_read_varint(byte_array))))
}

function dt_read_varint(byte_array) {
    let result = 0
    let shift = 0
    while (true) {
        if (byte_array.length === 0) throw new Error("byte array does not contain varint")

        let byte_val = byte_array.shift()
        result |= (byte_val & 0x7f) << shift
        if ((byte_val & 0x80) == 0) return result
        shift += 7
    }
}

function dt_create_bytes(version, parents, pos, del, ins) {
    if (del) pos += del - 1

    function write_varint(bytes, value) {
        while (value >= 0x80) {
            bytes.push((value & 0x7f) | 0x80)
            value >>= 7
        }
        bytes.push(value)
    }

    function write_string(byte_array, str) {
        let str_bytes = new TextEncoder().encode(str)
        write_varint(byte_array, str_bytes.length)
        for (let x of str_bytes) byte_array.push(x)
    }

    version = decode_version(version)
    parents = parents.map(decode_version)

    let bytes = []
    bytes = bytes.concat(Array.from(new TextEncoder().encode("DMNDTYPS")))
    bytes.push(0)

    let file_info = []
    let agent_names = []

    let agents = new Set()
    agents.add(version[0])
    for (let p of parents) agents.add(p[0])
    agents = [...agents]

    //   console.log(JSON.stringify({ agents, parents }, null, 4));

    let agent_to_i = {}
    for (let [i, agent] of agents.entries()) {
        agent_to_i[agent] = i
        write_string(agent_names, agent)
    }

    file_info.push(3)
    write_varint(file_info, agent_names.length)
    for (let x of agent_names) file_info.push(x)

    bytes.push(1)
    write_varint(bytes, file_info.length)
    for (let x of file_info) bytes.push(x)

    let branch = []

    if (parents.length) {
        let frontier = []

        for (let [i, [agent, seq]] of parents.entries()) {
            let has_more = i < parents.length - 1
            let mapped = agent_to_i[agent]
            let n = ((mapped + 1) << 1) | (has_more ? 1 : 0)
            write_varint(frontier, n)
            write_varint(frontier, seq)
        }

        branch.push(12)
        write_varint(branch, frontier.length)
        for (let x of frontier) branch.push(x)
    }

    bytes.push(10)
    write_varint(bytes, branch.length)
    for (let x of branch) bytes.push(x)

    let patches = []

    let unicode_chars = ins ? [...ins] : []

    if (ins) {
        let inserted_content_bytes = []

        inserted_content_bytes.push(0) // ins (not del, which is 1)

        inserted_content_bytes.push(13) // "content" enum (rather than compressed)

        let encoder = new TextEncoder()
        let utf8Bytes = encoder.encode(ins)

        write_varint(inserted_content_bytes, 1 + utf8Bytes.length)
        // inserted_content_bytes.push(1 + utf8Bytes.length) // length of content chunk
        inserted_content_bytes.push(4) // "plain text" enum

        for (let b of utf8Bytes) inserted_content_bytes.push(b) // actual text

        inserted_content_bytes.push(25) // "known" enum
        let known_chunk = []
        write_varint(known_chunk, unicode_chars.length * 2 + 1)
        write_varint(inserted_content_bytes, known_chunk.length)
        for (let x of known_chunk) inserted_content_bytes.push(x)

        patches.push(24)
        write_varint(patches, inserted_content_bytes.length)
        for (let b of inserted_content_bytes) patches.push(b)
    }

    // write in the version
    let version_bytes = []

    let [agent, seq] = version
    let agent_i = agent_to_i[agent]
    let jump = seq

    write_varint(version_bytes, ((agent_i + 1) << 1) | (jump != 0 ? 1 : 0))
    write_varint(version_bytes, ins ? unicode_chars.length : del)
    if (jump) write_varint(version_bytes, jump << 1)

    patches.push(21)
    write_varint(patches, version_bytes.length)
    for (let b of version_bytes) patches.push(b)

    // write in "op" bytes (some encoding of position)
    let op_bytes = []

    if (del) {
        if (pos == 0) {
            write_varint(op_bytes, 4)
        } else if (del == 1) {
            write_varint(op_bytes, pos * 16 + 6)
        } else {
            write_varint(op_bytes, del * 16 + 7)
            write_varint(op_bytes, pos * 2 + 2)
        }
    } else if (unicode_chars.length == 1) {
        if (pos == 0) write_varint(op_bytes, 0)
        else write_varint(op_bytes, pos * 16 + 2)
    } else if (pos == 0) {
        write_varint(op_bytes, unicode_chars.length * 8 + 1)
    } else {
        write_varint(op_bytes, unicode_chars.length * 8 + 3)
        write_varint(op_bytes, pos * 2)
    }

    patches.push(22)
    write_varint(patches, op_bytes.length)
    for (let b of op_bytes) patches.push(b)

    // write in parents
    let parents_bytes = []

    write_varint(parents_bytes, ins ? unicode_chars.length : del)

    if (parents.length) {
        for (let [i, [agent, seq]] of parents.entries()) {
            let has_more = i < parents.length - 1
            let agent_i = agent_to_i[agent]
            write_varint(parents_bytes, ((agent_i + 1) << 2) | (has_more ? 2 : 0) | 1)
            write_varint(parents_bytes, seq)
        }
    } else write_varint(parents_bytes, 1)

    patches.push(23)
    write_varint(patches, parents_bytes.length)
    for (let x of parents_bytes) patches.push(x)

    // write in patches
    bytes.push(20)
    write_varint(bytes, patches.length)
    for (let b of patches) bytes.push(b)

    //   console.log(bytes);
    return bytes
}

function v_eq(v1, v2) {
    return v1.length == v2.length && v1.every((x, i) => x == v2[i])
}

class RangeSet {
    constructor() {
        this.ranges = []
    }

    add_range(low_inclusive, high_inclusive) {
        if (low_inclusive > high_inclusive) return

        const startIndex = this._bs(mid => this.ranges[mid][1] >= low_inclusive - 1, this.ranges.length, true)
        const endIndex = this._bs(mid => this.ranges[mid][0] <= high_inclusive + 1, -1, false)

        if (startIndex > endIndex) {
            this.ranges.splice(startIndex, 0, [low_inclusive, high_inclusive])
        } else {
            const mergedLow = Math.min(low_inclusive, this.ranges[startIndex][0])
            const mergedHigh = Math.max(high_inclusive, this.ranges[endIndex][1])
            const removeCount = endIndex - startIndex + 1
            this.ranges.splice(startIndex, removeCount, [mergedLow, mergedHigh])
        }
    }

    has(x) {
        var index = this._bs(mid => this.ranges[mid][0] <= x, -1, false)
        return index !== -1 && x <= this.ranges[index][1]
    }

    _bs(condition, defaultR, moveLeft) {
        let low = 0
        let high = this.ranges.length - 1
        let result = defaultR
        
        while (low <= high) {
            const mid = Math.floor((low + high) / 2)
            if (condition(mid)) {
                result = mid
                if (moveLeft) high = mid - 1
                else low = mid + 1
            } else {
                if (moveLeft) low = mid + 1
                else high = mid - 1
            }
        }
        return result
    }
}

//////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////

function dt_diff_from(doc, version) {
    let doc_at_version = dt_get(doc, version)
    let s = doc_at_version.get();
    doc_at_version.free()
    let a = [...s];
    let far_left = '';
    for (let xf of dt_get.last_doc.xfSince(dt_get.last_local_version)) {
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
    let a = v.split('-')
    if (a.length > 1) a[1] = parseInt(a[1])
    return a
}
