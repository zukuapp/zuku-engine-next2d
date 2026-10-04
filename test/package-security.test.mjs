import test from 'node:test';
import assert from 'node:assert/strict';
import { zipSync } from 'fflate';
import { webcrypto } from 'node:crypto';
import { runInNewContext } from 'node:vm';
if (!globalThis.crypto) Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
import { validatePackageBytes as nodeValidate } from '../src/package-validator.mjs';
import { validatePackageBytes as browserValidate } from '../src/package-validator-browser.mjs';
const encoder = new TextEncoder();
const manifest = {schema_version:'1',id:'game_security',version:'1.0.0',title:'Security',entry_point:'index.html',format:'html5',platform:{pc:true,mobile:true}};
const archive = (metadata=manifest,extra={}) => zipSync({'jump.manifest.json':encoder.encode(JSON.stringify(metadata)),'index.html':encoder.encode('<!doctype html>'),...extra});
test('both validators enforce complete canonical manifest schema', async () => {
 for (const change of [{id:undefined},{version:'latest'},{platform:{pc:'yes'}},{unexpected:true},{engine:{name:'arbitrary',version:'1'}}]) {
  const bytes=archive({...manifest,...change});
  assert.throws(()=>nodeValidate(bytes), /manifest.*schema|manifest.*invalid/i);
  await assert.rejects(browserValidate(bytes), /manifest.*schema|manifest.*invalid/i);
 }
});
test('member paths preserve distinct nested asset names in Node and browser',async()=>{
 const bytes=archive(manifest,{'assets/one/icon.png':new Uint8Array([1]),'assets/two/icon.png':new Uint8Array([2])});
 const result=nodeValidate(bytes);const browser=await browserValidate(bytes);
 assert.ok(result.files.includes('assets/one/icon.png'));assert.ok(result.files.includes('assets/two/icon.png'));
 assert.deepEqual(browser,result);
});
test('rejects Unicode alias paths before inflation in both environments',async()=>{
 const bytes=archive(manifest,{'caf\u00e9.txt':encoder.encode('one'),'cafe\u0301.txt':encoder.encode('two')});
 assert.throws(()=>nodeValidate(bytes),/duplicate|collision/i);await assert.rejects(browserValidate(bytes),/duplicate|collision/i);
});
test('rejects nonregular archive member types before inflation',async()=>{
 const bytes=archive();const view=new DataView(bytes.buffer);const central=view.getUint32(bytes.length-6,true);
 view.setUint32(central+38,0x10000000,true);
 assert.throws(()=>nodeValidate(bytes),/special|unsupported ZIP entry/i);await assert.rejects(browserValidate(bytes),/special|unsupported ZIP entry/i);
});

function central(bytes,index=0) {
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 let at=view.getUint32(bytes.length-6,true);
 while(index--) at+=46+view.getUint16(at+28,true)+view.getUint16(at+30,true)+view.getUint16(at+32,true);
 return at;
}
function forgedExpansion() {
 const bytes=archive(manifest,{'large.txt':encoder.encode('x'.repeat(4*1024**2))});
 const view=new DataView(bytes.buffer),at=central(bytes,2),local=view.getUint32(at+42,true);
 view.setUint32(at+24,1,true); view.setUint32(local+22,1,true);
 return bytes;
}
test('enforces actual DEFLATE output budgets when all size metadata lies',async()=>{
 const bytes=forgedExpansion();
 assert.throws(()=>nodeValidate(bytes),/Actual ZIP decompression budget exceeded/);
 await assert.rejects(browserValidate(bytes),/Actual ZIP decompression budget exceeded/);
});
test('rejects file-directory collisions and depth overflow in both environments',async()=>{
 for(const extra of [{'assets.txt':encoder.encode('file'),'assets.txt/icon.png':new Uint8Array([1])},{['a/'.repeat(17)+'asset.txt']:new Uint8Array([1])}]) {
  const bytes=archive(manifest,extra);
  assert.throws(()=>nodeValidate(bytes),/collision|unsafe path/);
  await assert.rejects(browserValidate(bytes),/collision|unsafe path/);
 }
});
test('rejects forged integrity headers without accepting corrupt archive content',async()=>{
 const bytes=archive();const view=new DataView(bytes.buffer);view.setUint32(14,(view.getUint32(14,true)^1)>>>0,true);
 assert.throws(()=>nodeValidate(bytes),/integrity|headers disagree/);await assert.rejects(browserValidate(bytes),/integrity|headers disagree/);
});
test('validates semantic capability restrictions after full schema validation',async()=>{
 for(const metadata of [{...manifest,permissions:{network:'allowlist'}},{...manifest,format:'wasm'},{...manifest,swf_backend:{interface_version:'1',provider:'awayfl',avm:['avm2']}}]) {
  const bytes=archive(metadata);
  assert.throws(()=>nodeValidate(bytes),/allowlist|WASM/);await assert.rejects(browserValidate(bytes),/allowlist|WASM/);
 }
});

test('byte normalization supports ArrayBuffer and typed bytes from another realm',async()=>{
 const bytes=archive();const input=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
 assert.deepEqual(await browserValidate(input),nodeValidate(input));
 const realm=runInNewContext('new Uint8Array(input)',{input});
 assert.deepEqual(await browserValidate(realm),nodeValidate(bytes));
});
test('browser reports unavailable secure hashing explicitly',async()=>{
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'crypto');
 Object.defineProperty(globalThis,'crypto',{value:undefined,configurable:true});
 try{await assert.rejects(browserValidate(archive()),/WebCrypto.*secure context/);}
 finally{Object.defineProperty(globalThis,'crypto',descriptor);}
});
test('requires UTF-8 encoding metadata for non-ASCII member names',async()=>{
 const bytes=archive(manifest,{'caf\u00e9.txt':encoder.encode('asset')});const view=new DataView(bytes.buffer),at=central(bytes,2),local=view.getUint32(at+42,true);
 view.setUint16(at+8,view.getUint16(at+8,true)&~0x800,true);view.setUint16(local+6,view.getUint16(local+6,true)&~0x800,true);
 assert.throws(()=>nodeValidate(bytes),/UTF-8 flag/);await assert.rejects(browserValidate(bytes),/UTF-8 flag/);
});
