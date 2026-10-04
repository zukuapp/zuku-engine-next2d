import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, open, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zipSync } from 'fflate';
import { PACKAGE_LIMITS, validatePackage } from '../src/package-validator.mjs';
test('validates a regular file and rejects an oversized sparse input before read allocation',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'zuku-package-budget-'));
 try {
  const manifest={schema_version:'1',id:'game_file',version:'1.0.0',title:'File',entry_point:'index.html',format:'html5',platform:{pc:true,mobile:true}};
  const path=join(dir,'game.zip');await writeFile(path,zipSync({'jump.manifest.json':new TextEncoder().encode(JSON.stringify(manifest)),'index.html':new Uint8Array([1])}));
  assert.equal((await validatePackage(path,'mobile')).valid,true);
  const file=await open(join(dir,'oversized.zip'),'w');try{await file.truncate(PACKAGE_LIMITS.mobile+1);}finally{await file.close();}
  await assert.rejects(validatePackage(join(dir,'oversized.zip'),'mobile'),/exceeds mobile limit/);
  await assert.rejects(validatePackage(dir),/regular file/);
 } finally {await rm(dir,{recursive:true,force:true});}
});
