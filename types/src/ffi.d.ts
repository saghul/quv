/**
 * Foreign Function Interface module.
 *
 * @module tjs:ffi
 */
declare module 'tjs:ffi'{
    export type PointerAddr = bigint;

    export class DlSymbol{
        readonly addr: PointerAddr;
    }

    interface SimpleType<T = any>{
        toBuffer(data: T, ctx?: {}): Uint8Array;
        fromBuffer(buffer: Uint8Array, ctx?: {}): T;
        readonly size: number;
        readonly name: string;
    }

    export class AdvancedType<T, ST extends SimpleType<T>> implements SimpleType<T>{
        constructor(type: ST, conf: {
            toBuffer?: (data: T, ctx?: {}) => Uint8Array,
            fromBuffer?: (buf: Uint8Array, ctx?: {}) => T,
            getFfiTypeStruct?: () => SimpleType<T>
        });
        readonly ffiType: ST;
        readonly ffiTypeStruct: SimpleType<T>
        
        toBuffer(data: T, ctx?: {}): Uint8Array;
        fromBuffer(buffer: Uint8Array, ctx?: {}): T;
        readonly size: number;
        readonly name: string;
    }

    export class Lib{
        constructor(libname: string);
        symbol(name: string): DlSymbol;
        static LIBC_NAME: string;
        static LIBM_NAME: string;
        
        registerType(name: string, type: SimpleType): void;
        getType(name: string): undefined|SimpleType;
        registerFunction(name: string, func: CFunction): void;
        getFunc(name: string): CFunction;
        call(funcname: string, ...args: any[]): any;
        parseCProto(header: string): void;
    }

    export class CFunction<JRT = any, JAT extends Array<any> = any[]>{ //TODO: better typing mechanism for Arg types
        constructor(symbol: DlSymbol, rtype: SimpleType<JRT>, argtypes: SimpleType[], fixed?: number);
        call(...argsJs: JAT): JRT;
    }

    export function CString(str:string):{
        toString():string
    }

    export const types: {
        void: SimpleType<void>,
        uint8: SimpleType<number>,
        sint8: SimpleType<number>,
        uint16: SimpleType<number>,
        sint16: SimpleType<number>,
        uint32: SimpleType<number>,
        sint32: SimpleType<number>,
        uint64: SimpleType<number>,
        sint64: SimpleType<number>,
        float: SimpleType<number>,
        double: SimpleType<number>,
        pointer: SimpleType<PointerAddr>,
        longdouble: SimpleType<number>, 
        uchar: SimpleType<number>,
        schar: SimpleType<number>,
        ushort: SimpleType<number>,
        sshort: SimpleType<number>,
        uint: SimpleType<number>,
        sint: SimpleType<number>,
        ulong: SimpleType<number>,
        slong: SimpleType<number>,
        sllong: SimpleType<number>,
        ullong: SimpleType<number>,

        size: SimpleType<number>,
        ssize: SimpleType<number>,

        cstring: SimpleType<typeof CString>

        buffer: SimpleType<Uint8Array>
        
        jscallback: SimpleType<(...args: any)=>any>
    }

    export function bufferToString(buf: Uint8Array): string;

    export class Pointer<T, N extends number>{
        constructor(addr: PointerAddr, level: N, type: SimpleType<T>);
        readonly addr: PointerAddr;
        readonly level: N;
        readonly type: T;
        readonly isNull: boolean;
        
        deref(): N extends 1 ? T : Pointer<T, any>;
        
        derefAll(): T;
        
        static createRef<T>(type: SimpleType<T>, data: T): Pointer<T, 1>;
        static createRefFromBuf<T>(type: SimpleType<T>, buf: Uint8Array): Pointer<T, 1>;
    }

    export class PointerType<T, ST extends SimpleType<T>, N extends number> extends AdvancedType<Pointer<T, N>, PointerType<T, ST, N>>{
        constructor(type: ST , level: N);
        toBuffer(data: Pointer<T, N>|PointerAddr, ctx?: {}): Uint8Array;
        fromBuffer(buf: Uint8Array, ctx?: {}): Pointer<T, N>;
        get type(): ST;
        get level(): N;
    }

    export class StructType<Obj, FT extends Array<({
        [K in keyof Obj]: [K, SimpleType<Obj[K]>]
    })[keyof Obj]>> extends AdvancedType<Obj, StructType<Obj, FT>>{
        constructor(fields: FT, name: string);
        readonly fields: FT;
    }

    export class ArrayType<T> extends AdvancedType<Array<T>, ArrayType<T>>{
        constructor(type: SimpleType<T>, length: number, name: string);
        readonly ffiTypeStruct: SimpleType<Array<T>>;
        readonly length: number
        readonly size: number;
    }

    export class StaticStringType extends AdvancedType<string, StaticStringType>{
        constructor(length: number, name: string);
        toBuffer(str: string, ctx?: {}): Uint8Array;
        fromBuffer(buf: Uint8Array, ctx?: {}): string;
    }

    export function errno(): number;
    export function strerror(err?: number): string;
    export class JSCallback<RT, AT extends []>{ //TODO: better typing mechanism for Arg types
        constructor(rtype: SimpleType<RT>, argtypes: Array<SimpleType<AT[0]>>, func: (...args: AT)=>RT);
        readonly addr: PointerAddr;
    }
}
