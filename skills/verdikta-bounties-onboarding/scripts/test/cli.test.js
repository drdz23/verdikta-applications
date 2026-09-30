import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
for (const name of ['create_bounty.js','submit_to_bounty.js','claim_bounty.js','bounty_worker_min.js']) {
  test(`${name} reports missing inputs when launched through a symlink`,async t=>{
    const dir=await mkdtemp(`${tmpdir()}/verdikta-cli-`);t.after(()=>rm(dir,{recursive:true,force:true}));
    const original=fileURLToPath(new URL(`../${name}`,import.meta.url)),linked=`${dir}/${name}`;
    await symlink(original,linked);
    for(const entry of [original,linked]) {
      const r=spawnSync(process.execPath,[entry],{cwd:dir,env:{HOME:dir,PATH:process.env.PATH},encoding:'utf8',timeout:10000});
      assert.notEqual(r.status,0);assert.match(r.stderr,name==='bounty_worker_min.js'?/ENOENT:.*verdikta-bounties-bot.json/:/Usage:/);
    }
  });
}
