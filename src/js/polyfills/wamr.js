const core = globalThis[Symbol.for('tjs.internal.core')];
const wasm = core.wamr;

const kWasmModule = Symbol('kWasmModule');
const kWasmModuleRef = Symbol('kWasmModuleRef');
const kWasmExports = Symbol('kWasmExports');
const kWasmInstance = Symbol('kWasmInstance');
const kWasmInstances = Symbol('kWasmInstances');
const kWasiLinked = Symbol('kWasiLinked');
const kWasiStarted = Symbol('kWasiStarted');
const kWasiOptions = Symbol('kWasiOptions');


class CompileError extends Error {
    constructor(...args) {
        super(...args);
        this.name = 'CompileError';
    }
}

class LinkError extends Error {
    constructor(...args) {
        super(...args);
        this.name = 'LinkError';
    }
}

class RuntimeError extends Error {
    constructor(...args) {
        super(...args);
        this.name = 'RuntimeError';
    }
}


function getWasmError(e) {
    switch (e.wasmError) {
        case 'CompileError':
            return new CompileError(e.message);
        case 'LinkError':
            return new LinkError(e.message);
        case 'RuntimeError':
            return new RuntimeError(e.message);
        default:
            return new TypeError(`Invalid WASM error: ${e.wasmError}`);
    }
}

function callWasmFunction(name, ...args) {
    const instance = this;

    try {
        return instance.callFunction(name, ...args);
    } catch (e) {
        if (e.wasmError) {
            throw getWasmError(e);
        } else {
            throw e;
        }
    }
}

function buildInstance(mod) {
    try {
        return wasm.buildInstance(mod);
    } catch (e) {
        if (e.wasmError) {
            throw getWasmError(e);
        } else {
            throw e;
        }
    }
}

function linkWasi(instance) {
    try {
        instance.linkWasi();
    } catch (e) {
        if (e.wasmError) {
            throw getWasmError(e);
        } else {
            throw e;
        }
    }
}

function parseModule(buf) {
    try {
        return wasm.parseModule(buf);
    } catch (e) {
        if (e.wasmError) {
            throw getWasmError(e);
        } else {
            throw e;
        }
    }
}

class Module {
    constructor(buf) {
        this[kWasmModule] =  parseModule(buf);
    }

    static exports(module) {
        return wasm.moduleExports(module[kWasmModule]);
    }

    // eslint-disable-next-line no-unused-vars
    static imports(module) {
        // TODO.
        return {};
    }
}

class Instance {
    constructor(module, importObject = {}) {
        const instance = buildInstance(module[kWasmModule]);

        if (importObject.wasi_unstable) {
            linkWasi(instance);
            this[kWasiLinked] = true;
        }

        const _exports = Module.exports(module);
        const exports = Object.create(null);

        for (const item of _exports) {
            if (item.kind === 'function') {
                exports[item.name] = callWasmFunction.bind(instance, item.name);
            }
        }

        this[kWasmInstance] = instance;
        this[kWasmExports] = Object.freeze(exports);
        this[kWasmModuleRef] = module;
        globalThis.WebAssembly[kWasmInstances].push(this);
    }

    get exports() {
        return this[kWasmExports];
    }
}

class WASI {
    wasiImport = 'w4s1';  // Doesn't matter right now.

    constructor(options = { args: [], env: {}, preopens: {} }) {
        this[kWasiStarted] = false;

        if (options === null || typeof options !== 'object') {
            throw new TypeError('options must be an object');
        }

        this[kWasiOptions] = JSON.parse(JSON.stringify(options));
    }

    start(instance) {
        if (this[kWasiStarted]) {
            throw new Error('WASI instance has already started');
        }

        if (!instance[kWasiLinked]) {
            throw new Error('WASM instance doesn\'t have WASI linked');
        }

        if (!instance.exports._start) {
            throw new TypeError('WASI entrypoint not found');
        }

        this[kWasiStarted] = true;
        instance.exports._start(...(this[kWasiOptions].args ?? []));
    }
}

class WebAssembly {
    Module = Module;
    Instance = Instance;
    CompileError = CompileError;
    LinkError = LinkError;
    RuntimeError = RuntimeError;
    WASI = WASI;

    constructor() {
        this[kWasmInstances] = [];
    }

    async compile(src) {
        return new Module(src);
    }

    async instantiate(src, importObject) {
        const module = await this.compile(src);
        const instance = new Instance(module, importObject);

        return { module, instance };
    }
}


Object.defineProperty(globalThis, 'WebAssemblyWAMR', {
    enumerable: true,
    configurable: true,
    writable: true,
    value: new WebAssembly()
});
