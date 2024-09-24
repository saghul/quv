import assert from 'tjs:assert';
import FFI from 'tjs:ffi';
import initCParser from '../src/js/stdlib/ffi/ffiutils.js';

let sopath = './build/libffi-test.so';
switch(tjs.system.platform){
	case 'linux':
		sopath = './build/libffi-test.so';
		break;
	case 'darwin':
		sopath = './build/libffi-test.dylib';
		break;
	case 'windows':
		sopath = './build/libffi-test.dll';
	break;
}
const testlib = new FFI.Lib(sopath);

function testSimpleCalls(){
	const simple_func1 = new FFI.CFunction(testlib.symbol('simple_func1'), FFI.types.sint, [FFI.types.sint]);
	assert.eq(simple_func1.call(-9), -8);

	const simple_func2 = new FFI.CFunction(testlib.symbol('simple_func2'), FFI.types.float, [FFI.types.float]);
	assert.ok(Math.abs(simple_func2.call(98.9) - 99.9) < 0.00001);

	const simple_func3 = new FFI.CFunction(testlib.symbol('simple_func3'), FFI.types.double, [FFI.types.double]);
	assert.ok(Math.abs(simple_func3.call(98.9) - 99.9) < 0.00001);

	const atoiF = new FFI.CFunction(testlib.symbol('parse_int'), FFI.types.sint, [FFI.types.cstring]);
	assert.eq(atoiF.call(FFI.CString`1234`), 1234);

	const strerrorF = new FFI.CFunction(testlib.symbol('int_to_string'), FFI.types.cstring, [FFI.types.sint]);
	assert.eq(strerrorF.call(345).toString(), "345");

	const sprintfF3 = new FFI.CFunction(testlib.symbol('test_sprintf'), FFI.types.sint, [FFI.types.buffer, FFI.types.cstring, FFI.types.sint], 2);
	const strbuf = new Uint8Array(15); // 14 byte string + null byte
	assert.eq(sprintfF3.call(strbuf, FFI.CString`printf test %d\n`, 5), 14);
	assert.eq(FFI.bufferToString(strbuf), 'printf test 5\n');

	const strcatF = new FFI.CFunction(testlib.symbol('test_strcat'), FFI.types.cstring, [FFI.types.buffer, FFI.types.cstring]);
	const strbuf2 = new Uint8Array(12);
	strbuf2.set((new TextEncoder()).encode('part1:'));
	assert.eq(strcatF.call(strbuf2, FFI.CString`part2`).toString(), "part1:part2");
	assert.eq(FFI.bufferToString(strbuf2), "part1:part2");
}

function testSimpleVariables() {
	const testIntSymbol = testlib.symbol('test_int');
	const testIntPointer = new FFI.Pointer(testIntSymbol.addr, 1, FFI.types.sint);
	assert.eq(testIntPointer.deref(), 123);
	assert.eq(testIntPointer.derefAll(), 123);

	const testIntPtrSymbol = testlib.symbol('test_int_ptr');
	const testIntPtrPointer = new FFI.Pointer(testIntPtrSymbol.addr, 2, FFI.types.sint);
	assert.eq(testIntPtrPointer.deref().deref(), 123);
	assert.eq(testIntPtrPointer.derefAll(), 123);
}

function testStructs(){
	const test_t = new FFI.StructType([['a', FFI.types.sint], ['b', FFI.types.uchar], ['c', FFI.types.uint64]], 'test_struct');
	const return_struct_test = new FFI.CFunction(testlib.symbol('return_struct_test'), test_t, [FFI.types.sint]);
	assert.equal(return_struct_test.call(10), {a:10, b: "b".charCodeAt(0), c: 123});
}

function testPointersAndStructsOpendir(){
	const open_test_handle = new FFI.CFunction(testlib.symbol('open_test_handle'), FFI.types.pointer, [FFI.types.sint]);
	const entry_t = new FFI.StructType([['a', FFI.types.sint]]);
	const entry_ptr_t = new FFI.PointerType(entry_t, 1);
	const get_next_entry = new FFI.CFunction(testlib.symbol('get_next_entry'), entry_ptr_t, [FFI.types.pointer]);
	const close_test_handle = new FFI.CFunction(testlib.symbol('close_test_handle'), FFI.types.void, [FFI.types.pointer]);

	const handle = open_test_handle.call(5);
	let i = 0;
	let entry;
	do{
		entry = get_next_entry.call(handle);
		if(!entry.isNull){
			i++;
			const obj = entry.deref();
			assert.eq(typeof obj, 'object');
			assert.eq(obj.a, i);
		}
	}while(!entry.isNull);
	close_test_handle.call(handle);
	assert.eq(i, 5);
}

function testPointersAndStructsTime(){
	const libc = new FFI.Lib(FFI.Lib.LIBC_NAME);
	const tmT = new FFI.StructType([
		['sec', FFI.types.sint],
		['min', FFI.types.sint],
		['hour', FFI.types.sint],
		['mday', FFI.types.sint],
		['mon', FFI.types.sint],
		['year', FFI.types.sint],
		['wday', FFI.types.sint],
		['yday', FFI.types.sint],
		['isdst', FFI.types.sint],
	], 'tm');
	const timeF = new FFI.CFunction(libc.symbol('time'), FFI.types.sint64, [FFI.types.pointer]);
	const timestamp = timeF.call(BigInt('0'));
	assert.ok(Date.now()/1000 - timestamp < 2);
	
	const testTimestamp = 1658319387; // test with 2022-07-20T14:16:27+02:00
	const localtimeF = new FFI.CFunction(libc.symbol('localtime'), new FFI.PointerType(tmT, 1), [new FFI.PointerType(FFI.types.sint64, 1)]);
	const tmPtr = localtimeF.call(FFI.Pointer.createRef(FFI.types.sint64, testTimestamp)); // test with 2022-07-20T14:16:27+02:00
	const tm = tmPtr.deref();
	assert.eq(tm.year, 122); // years since 1900
	assert.eq(tm.mon, 6); // month since January, 0-11
	const cmpDate = new Date(testTimestamp*1000);
	assert.eq(tm.mday, cmpDate.getDate()); // day of the month, 1-31
	assert.eq(tm.hour, cmpDate.getHours()); // hours since midnight, 0-23
	assert.eq(tm.min, cmpDate.getMinutes()); // minutes after the hour, 0-59
	assert.eq(tm.sec, cmpDate.getSeconds()); // seconds after the minute, 0-59
	assert.eq(tm.wday, cmpDate.getDay()); // day of the week, Sunday is 0, 0-6
	const startOf2022 = new Date(2022, 0, 1, 0, 0, 0, 0);
	assert.eq(tm.yday, Math.floor((cmpDate-startOf2022)/86e6)-1); // day of the year, 0-365
	assert.eq(tm.isdst, cmpDate.getTimezoneOffset() != (new Date(2022,1,1,1,1,1)).getTimezoneOffset() ? 1 : 0); // daylight saving time, 0 or 1
}

function testJsCallback(){
	const testlib = new FFI.Lib(sopath);
	const callCallbackF = new FFI.CFunction(testlib.symbol('call_callback'), FFI.types.sint, [FFI.types.jscallback, FFI.types.sint]);
	let recv = null;
	const callback = new FFI.JSCallback(FFI.types.sint, [FFI.types.sint], (a)=>{
		recv = a;
		return 2;
	});
	const ret = callCallbackF.call(callback, 4);
	assert.eq(ret, 2);
	assert.eq(recv, 4);
}

function testCorrectSizeofTypes(){
	const testlib = new FFI.Lib(sopath);
	testlib.parseCProto(`
		size_t sizeof_sllong();
		size_t sizeof_slong();
		size_t sizeof_sint();
		size_t sizeof_sshort();
		size_t sizeof_schar();
		size_t sizeof_float();
		size_t sizeof_double();
		size_t sizeof_pointer();
		size_t sizeof_size_t();
		size_t sizeof_ulong();
		size_t sizeof_ullong();
	`);
	for(const [fname] of testlib._funcs.entries()){
		const tname = fname.replace('sizeof_', '').replace(/_t$/, '');
		assert.eq(testlib.call(fname), FFI.types[tname].size);
	}
	testlib.parseCProto(`
		typedef long long int test_lli;
		typedef long long test_ll;
		typedef long int test_li;
		typedef unsigned long long int test_ulli;
		typedef unsigned long long test_ull;
		typedef unsigned long test_ul;
		typedef unsigned int test_uli;
	`);

	const test_lli = testlib.getType('test_lli');
	const test_ll = testlib.getType('test_ll');
	const test_li = testlib.getType('test_li');
	const test_ulli = testlib.getType('test_ulli');
	const test_ull = testlib.getType('test_ull');
	const test_ul = testlib.getType('test_ul');
	const test_uli = testlib.getType('test_uli');
	assert.eq(test_lli, FFI.types.sllong);
	assert.eq(test_ll, FFI.types.sllong);
	assert.eq(test_li, FFI.types.slong);
	assert.eq(test_ulli, FFI.types.ullong);
	assert.eq(test_ull, FFI.types.ullong);
	assert.eq(test_ul, FFI.types.ulong);
	assert.eq(test_uli, FFI.types.uint);
}

function testCProtoParser(){
	const {parseCProto} = initCParser(FFI);
	const ast1 = parseCProto(`
		static inline JSValue JS_DupValue(JSContext *ctx, JSValue v);
		static unsigned long long int* bla(JSContext *ctx, const int32_t **pres, JSValue val);
		struct JSCFunctionListEntry {
			const char *name;
			uint8_t prop_flags;
			uint8_t def_type;
			int16_t magic; // line comment
			char bla[23];
			char abc[];
		};
		#preprocessor directive
		typedef int JSModuleInitFunc(JSContext *ctx, JSModuleDef *m);
		/* block comment */
		typedef struct JSRuntime JSRuntime;
		typedef int my_int;
		/* multiline block comment 
			another line
		*/
		typedef unsigned long long int my_int2;
		// multiline line comment \
		another line \
		and another line
		struct struct_in_struct{
			int a;
			struct asd{
				int asd_b;
			} b;
		};
		typedef void * (*myfunc)(int* asd);
	`);
	const expected = [
		{
			"kind": "function",
			"name": "JS_DupValue",
			"args": [
				{
					"kind": "vardef",
					"type": {
						"kind": "type",
						"typeModifiers": [],
						"name": "JSContext",
						"ptr": 1
					},
					"name": "ctx"
				},
				{
					"kind": "vardef",
					"type": {
						"kind": "type",
						"typeModifiers": [],
						"name": "JSValue",
						"ptr": 0
					},
					"name": "v"
				}
			],
			"modifiers": [
				"static",
				"inline"
			],
			"ptr": 0,
			"return": {
				"kind": "type",
				"typeModifiers": [],
				"name": "JSValue",
				"ptr": 0
			}
		},
		{
			"kind": "function",
			"name": "bla",
			"args": [
				{
					"kind": "vardef",
					"type": {
						"kind": "type",
						"typeModifiers": [],
						"name": "JSContext",
						"ptr": 1
					},
					"name": "ctx"
				},
				{
					"kind": "vardef",
					"type": {
						"kind": "type",
						"typeModifiers": [],
						"name": "int32_t",
						"ptr": 2,
						"const": true
					},
					"name": "pres"
				},
				{
					"kind": "vardef",
					"type": {
						"kind": "type",
						"typeModifiers": [],
						"name": "JSValue",
						"ptr": 0
					},
					"name": "val"
				}
			],
			"modifiers": [
				"static"
			],
			"ptr": 0,
			"return": {
				"kind": "type",
				"typeModifiers": [],
				"name": "unsigned long long int",
				"ptr": 1
			}
		},
		{
			"kind": "struct",
			"name": "JSCFunctionListEntry",
			"members": [
				{
					"kind": "vardef",
					"type": {
						"kind": "type",
						"typeModifiers": [],
						"name": "char",
						"ptr": 1,
						"const": true
					},
					"name": "name"
				},
				{
					"kind": "vardef",
					"type": {
						"kind": "type",
						"typeModifiers": [],
						"name": "uint8_t",
						"ptr": 0
					},
					"name": "prop_flags"
				},
				{
					"kind": "vardef",
					"type": {
						"kind": "type",
						"typeModifiers": [],
						"name": "uint8_t",
						"ptr": 0
					},
					"name": "def_type"
				},
				{
					"kind": "vardef",
					"type": {
						"kind": "type",
						"typeModifiers": [],
						"name": "int16_t",
						"ptr": 0
					},
					"name": "magic"
				},
				{
					"kind": "vardef",
					"type": {
						"kind": "type",
						"typeModifiers": [],
						"name": "char",
						"ptr": 0
					},
					"name": "bla",
					"arr": 23
				},
				{
					"kind": "vardef",
					"type": {
						"kind": "type",
						"typeModifiers": [],
						"name": "char",
						"ptr": 0
					},
					"name": "abc",
					"arr": true
				}
			]
		},
		{
			"kind": "typedef",
			"name": "JSModuleInitFunc",
			"child": {
				"kind": "function",
				"name": "JSModuleInitFunc",
				"args": [
					{
						"kind": "vardef",
						"type": {
							"kind": "type",
							"typeModifiers": [],
							"name": "JSContext",
							"ptr": 1
						},
						"name": "ctx"
					},
					{
						"kind": "vardef",
						"type": {
							"kind": "type",
							"typeModifiers": [],
							"name": "JSModuleDef",
							"ptr": 1
						},
						"name": "m"
					}
				],
				"modifiers": [],
				"ptr": 0,
				"return": {
					"kind": "type",
					"typeModifiers": [],
					"name": "int",
					"ptr": 0
				}
			}
		},
		{
			"kind": "typedef",
			"name": "JSRuntime",
			"child": {
				"kind": "type",
				"typeModifiers": [],
				"name": "struct JSRuntime",
				"ptr": 0
			}
		},
		{
			"kind": "typedef",
			"name": "my_int",
			"child": {
				"kind": "type",
				"typeModifiers": [],
				"name": "int",
				"ptr": 0
			}
		},
		{
			"kind": "typedef",
			"name": "my_int2",
			"child": {
				"kind": "type",
				"typeModifiers": [],
				"name": "unsigned long long int",
				"ptr": 0
			}
		},
		{
			"kind": "struct",
			"name": "struct_in_struct",
			"members": [
				{
					"kind": "vardef",
					"type": {
						"kind": "type",
						"typeModifiers": [],
						"name": "int",
						"ptr": 0
					},
					"name": "a"
				},
				{
					"kind": "vardef",
					"type": {
						"kind": "type",
						"typeModifiers": [],
						"name": "",
						"ptr": 0,
						"struct": {
							"kind": "struct",
							"name": "asd",
							"members": [
								{
									"kind": "vardef",
									"type": {
										"kind": "type",
										"typeModifiers": [],
										"name": "int",
										"ptr": 0
									},
									"name": "asd_b"
								}
							]
						}
					},
					"name": "b"
				}
			]
		},
		{
			"kind": "typedef",
			"name": "myfunc",
			"child": {
				"kind": "function",
				"name": "myfunc",
				"args": [
					{
						"kind": "vardef",
						"type": {
							"kind": "type",
							"typeModifiers": [],
							"name": "int",
							"ptr": 1
						},
						"name": "asd"
					}
				],
				"modifiers": [],
				"ptr": 1,
				"return": {
					"kind": "type",
					"typeModifiers": [],
					"name": "void",
					"ptr": 1
				}
			}
		}
	];
	
	assert.eq(ast1, expected)

	const ast2 = parseCProto(`
		typedef struct bla{
			int a;
		} bla_t;
		typedef struct{
			int a;
		}* bla2_t;
		typedef int[32] asd_t;
		typedef int[] abc_t;
		typedef struct{
			int asd[32];
			int abc[];
		} bla2_t;
	`);

	assert.eq(ast2, [
		{
			"kind": "typedef",
			"name": "bla_t",
			"child": {
			"kind": "type",
			"typeModifiers": [],
			"name": "",
			"ptr": 0,
			"struct": {
				"kind": "struct",
				"name": "bla",
				"members": [
				{
					"kind": "vardef",
					"type": {
					"kind": "type",
					"typeModifiers": [],
					"name": "int",
					"ptr": 0
					},
					"name": "a"
				}
				]
			}
			}
		},
		{
			"kind": "typedef",
			"name": "bla2_t",
			"child": {
			"kind": "type",
			"typeModifiers": [],
			"name": "",
			"ptr": 1,
			"struct": {
				"kind": "struct",
				"members": [
				{
					"kind": "vardef",
					"type": {
					"kind": "type",
					"typeModifiers": [],
					"name": "int",
					"ptr": 0
					},
					"name": "a"
				}
				]
			}
			}
		},
		{
			"kind": "typedef",
			"name": "asd_t",
			"child": {
			"kind": "type",
			"typeModifiers": [],
			"name": "int",
			"ptr": 0,
			"arr": 32
			}
		},
		{
			"kind": "typedef",
			"name": "abc_t",
			"child": {
			"kind": "type",
			"typeModifiers": [],
			"name": "int",
			"ptr": 0,
			"arr": true
			}
		},
		{
			"kind": "typedef",
			"name": "bla2_t",
			"child": {
			"kind": "type",
			"typeModifiers": [],
			"name": "",
			"ptr": 0,
			"struct": {
				"kind": "struct",
				"members": [
				{
					"kind": "vardef",
					"type": {
					"kind": "type",
					"typeModifiers": [],
					"name": "int",
					"ptr": 0
					},
					"name": "asd",
					"arr": 32
				},
				{
					"kind": "vardef",
					"type": {
					"kind": "type",
					"typeModifiers": [],
					"name": "int",
					"ptr": 0
					},
					"name": "abc",
					"arr": true
				}
				]
			}
			}
		}
	]);
}

function testLibFromCProto() {
	const testlib = new FFI.Lib(sopath);
	testlib.parseCProto(`
		char* test_strcat(char* a, char* b);
		struct test{
			int a;
			char b;
			uint64_t c;
		};
		typedef struct test s_test;
		s_test return_struct_test(int a);
		char* sprint_struct_test(s_test* t);
	`);

	const strcatF = new FFI.CFunction(testlib.symbol('test_strcat'), FFI.types.cstring, [FFI.types.buffer, FFI.types.cstring]);
	const strbuf2 = new Uint8Array(12);
	strbuf2.set((new TextEncoder()).encode('part1:'));
	assert.eq(strcatF.call(strbuf2, FFI.CString`part2`).toString(), "part1:part2");
	assert.eq(FFI.bufferToString(strbuf2), "part1:part2");
	
	const structTest = testlib.getType('struct test');
	assert.eq(structTest, testlib.getType('s_test'));
	const structData = {
		a: 1, b: 2, c: 3
	};
	const tmBuf = structTest.toBuffer(structData);
	const expect = 'a: 1, b: 2, c: 3';
	assert.eq(testlib.call('sprint_struct_test', FFI.Pointer.createRefFromBuf(structTest, tmBuf)).toString(), expect);
	assert.eq(testlib.call('sprint_struct_test', FFI.Pointer.createRef(structTest, structData)).toString(), expect);
}

function testCProtoPtrInStruct(){
	const testlib = new FFI.Lib(sopath);
	testlib.parseCProto(`
	struct a{
		int a;
		int b;
	};
	typedef struct {
		struct a* filter;
		struct a* filter2;
	} asdasd;
	typedef struct {
		int c;
		int d;
		int e;
		int f;
	}* asdasd2;
	`);
	assert.eq(testlib.getType('asdasd').size, 2*FFI.types.pointer.size);
	assert.eq(testlib.getType('asdasd2').size, FFI.types.pointer.size);
}

testSimpleCalls();
testSimpleVariables();
testStructs();
testPointersAndStructsOpendir();
testPointersAndStructsTime();
testJsCallback();
testCProtoParser();
testLibFromCProto();
testCProtoPtrInStruct();
testCorrectSizeofTypes();