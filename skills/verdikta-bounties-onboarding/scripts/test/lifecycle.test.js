import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { runCreate } from '../create_bounty.js';
import { runSubmit } from '../submit_to_bounty.js';
import { runClaim } from '../claim_bounty.js';
import { iface, deployments, bindCreation, verifyTransaction } from '../_transaction-guards.js';
const creator='0x1111111111111111111111111111111111111111',target='0x2222222222222222222222222222222222222222';
const cid='Qm'+'a'.repeat(44),hunterCid='Qm'+'b'.repeat(44),hash='0x'+'1'.repeat(64),d=deployments.base;
const policy={maxValueWei:'2000000000000000',maxTotalWei:'5000000000000000'};
const config={title:'test',description:'test only',procurementMode:'OPEN',classId:128,threshold:85,bountyAmount:'0.001',submissionWindowHours:24,oracle:{maxOracleFee:'100',alpha:500,estimatedBaseCost:'0',maxFeeBasedScaling:1},rubricJson:{criteria:[{id:'x',description:'x',weight:1,must:false}]},juryNodes:[{provider:'test',model:'test',weight:1,runs:1}]};
const json=x=>new Response(JSON.stringify(x),{headers:{'content-type':'application/json'}});
function log(name,args) {return {address:d.address,...iface.encodeEventLog(iface.getEvent(name),args)};}
function harness(args) {
 const sent=[],reviews=[];
 const provider={destroy(){},getTransaction:async()=>null,getTransactionReceipt:async()=>null};
 const wallet={address:creator,connect(){return {...this,provider};}};
 const lib={arg:n=>args[n]??null,argAll:n=>args[n]||[],getNetwork:()=> 'base',providerFor:()=>provider,loadWallet:async()=>wallet,loadApiKey:async()=> 'mock',preflightDeployment:async()=>d.address,loadSpendPolicy:async()=>policy,isDryRun:()=>false,confirmSpendOrExit:async r=>reviews.push(r),getSupportedModelsForClass:async()=>[],validateAndNormalizeJuryNodes:({juryNodes})=>juryNodes,
 sendTx:async(signer,method,tx,opts)=> {verifyTransaction(tx,{network:'base',method,args:opts.args,value:opts.exactValueWei??0n,maxValueWei:policy.maxValueWei});reviews.push(opts.review);await opts.onBeforeBroadcast?.();sent.push(method);await opts.onBroadcast?.(hash);return {status:1,hash,blockNumber:1,logs:[]};}};
 return {lib,provider,wallet,sent,reviews};
}
async function creationFixture(t,changes={}) {
 const dir=await mkdtemp(`${tmpdir()}/verdikta-create-test-`);t.after(()=>rm(dir,{recursive:true,force:true}));
 const cfg={...config,...changes},file=`${dir}/config.json`;await writeFile(file,JSON.stringify(cfg));
 const args={config:file},h=harness(args),now=Math.floor(Date.now()/1000);
 const response={success:true,job:{jobId:7,evaluationCid:cid,threshold:85,submissionOpenTime:now,submissionCloseTime:now+86400},onChain:{transaction:{}}};
 const bound=bindCreation(cfg,response);
 response.onChain.transaction={to:d.address,chainId:d.chainId,value:bound.value.toString(),data:iface.encodeFunctionData('createBounty',[bound.params])};
 const bounty={creator,...bound.params};let creates=0,links=0;
 const env={baseUrl:'https://mock.invalid',contract:()=>({verdikta:async()=>target,maxOracleFee:async()=>1000n,getBounty:async()=>bounty}),fetchApi:async(url)=>{if(url.endsWith('/jobs/create')){creates++;return json(response);}links++;return json({success:true,job:{jobId:7}});}};
 const send=h.lib.sendTx;
 h.lib.sendTx=async(...params)=>{const r=await send(...params);r.logs=[log('BountyCreated',[7,creator,cid,128,85,1000000000000000n,now+86400])];return r;};
 return {...h,cfg,args,file,response,bounty,env,counts:()=>({creates,links})};
}
for(const mode of ['OPEN','TARGETED']) test(`create ${mode} checks exact tx and reads back bounty before link`,async t=>{
 const f=await creationFixture(t,{procurementMode:mode,...(mode==='TARGETED'?{targetHunter:target}:{})});
 await runCreate(f.lib,f.env);assert.deepEqual(f.sent,['createBounty']);assert.deepEqual(f.counts(),{creates:1,links:1});
 assert.ok(f.reviews.flat().some(x=>x?.includes('Submission deadline:')));
 f.args.resume=`${f.file}.state.json`;
 f.provider.getTransaction=async()=>({...f.response.onChain.transaction,from:creator});
 f.provider.getTransactionReceipt=async()=>({status:1,hash,blockNumber:1,logs:[log('BountyCreated',[7,creator,cid,128,85,1000000000000000n,f.response.job.submissionCloseTime])]});
 await runCreate(f.lib,f.env);assert.equal(f.sent.length,1);assert.deepEqual(f.counts(),{creates:1,links:2});
 f.provider.getTransaction=async()=>({...f.response.onChain.transaction,from:target});
 await assert.rejects(runCreate(f.lib,f.env),/wrong creator/);
});
test('API_CREATED resumes once, but ambiguous broadcast and changed config stop',async t=>{
 const f=await creationFixture(t),send=f.lib.sendTx;
 f.lib.sendTx=async()=>{throw Error('review rejected before broadcast');};
 await assert.rejects(runCreate(f.lib,f.env),/review rejected/);
 f.args.resume=`${f.file}.state.json`;const state=JSON.parse(await readFile(f.args.resume));assert.equal(state.status,'API_CREATED');
 f.lib.sendTx=send;await runCreate(f.lib,f.env);assert.deepEqual(f.counts(),{creates:1,links:1});
 await writeFile(f.args.resume,JSON.stringify({...state,status:'BROADCAST_PENDING'}));
 await assert.rejects(runCreate(f.lib,f.env),/No safe pre-broadcast/);
 await writeFile(f.args.resume,JSON.stringify({...state,network:'base-sepolia'}));
 await assert.rejects(runCreate(f.lib,f.env),/matching config/);
});
test('read-back mismatch blocks linking and fractional windows fail before API',async t=>{
 const f=await creationFixture(t);f.bounty.targetHunter=target;
 await assert.rejects(runCreate(f.lib,f.env),/target mismatch/);assert.equal(f.counts().links,0);
 const g=await creationFixture(t);await writeFile(g.file,JSON.stringify({...g.cfg,creatorAssessmentWindowSeconds:3900}));
 await assert.rejects(runCreate(g.lib,g.env),/whole hours/);assert.equal(g.counts().creates,0);
});
test('submit retries lagging confirmation; resume confirms without preparing again',async t=>{
 const dir=await mkdtemp(`${tmpdir()}/verdikta-submit-test-`);t.after(()=>rm(dir,{recursive:true,force:true}));
 const file=`${dir}/result.txt`;await writeFile(file,'test');
 const args={jobId:'7',file:[file],state:`${dir}/state.json`},f=harness(args);let confirms=0,uploads=0,prepares=0;const pauses=[];let action='AWAIT_CREATOR';
 const bounty={evaluationCid:cid,targetHunter:creator};
 const transaction={to:d.address,chainId:d.chainId,value:'0',data:iface.encodeFunctionData('prepareSubmission',[7,cid,hunterCid])};
 const env={baseUrl:'https://mock.invalid',pause:async ms=>pauses.push(ms),contract:()=>({getBounty:async()=>bounty,isAcceptingSubmissions:async()=>true,getSubmission:async()=>({hunter:creator,hunterCid}),nextAction:async()=> action,requiredPrepay:async()=>123n}),fetchApi:async(url)=>{
   if(url.endsWith('/7'))return json({job:{jobId:7,onChain:true,evaluationCid:cid}});
   if(url.endsWith('/validate'))return json({valid:true});
   if(url.endsWith('/submit')){uploads++;return json({submission:{hunterCid}});}
   if(url.endsWith('/prepare')){prepares++;return json({transaction});}
   if(url.endsWith('/start'))return json({transaction:{to:d.address,chainId:d.chainId,value:'123',data:iface.encodeFunctionData('startPreparedSubmission',[7,0])}});
   if(url.endsWith('/confirm')){confirms++;return confirms<3?new Response(JSON.stringify({code:'SUBMISSION_BAD_ID'}),{status:400}):json({success:true});}
   throw Error(url);
 }};
 const send=f.lib.sendTx;f.lib.sendTx=async(...p)=>{const r=await send(...p);r.logs=[log('SubmissionPrepared',[7,0,creator,target,100n,cid])];return r;};
 await runSubmit(f.lib,env);assert.deepEqual(pauses,[1000,2000]);assert.equal(confirms,3);
 const state=JSON.parse(await readFile(args.state));assert.equal(state.confirmed,true);state.confirmed=false;await writeFile(args.state,JSON.stringify(state));
 args.resume='0';await runSubmit(f.lib,env);assert.equal(confirms,4);assert.equal(uploads,1);assert.equal(prepares,1);assert.deepEqual(f.sent,['prepareSubmission']);
 action='START';await runSubmit(f.lib,env);assert.equal(f.sent.at(-1),'startPreparedSubmission');assert.equal(prepares,1);
 state.hunter=target;await writeFile(args.state,JSON.stringify(state));await assert.rejects(runSubmit(f.lib,env),/recovery state/);
});
test('claim shows creator payout, hunter and work CID and handles nextAction',async()=>{
 const args={jobId:'7',submissionId:'0'},f=harness(args);
 const env={baseUrl:'https://mock.invalid',contract:()=>({nextAction:async()=> 'AWAIT_CREATOR',getBounty:async()=>({creator,creatorDeterminationPayment:123n}),getSubmission:async()=>({hunter:target,hunterCid})})};
 process.argv.push('--approve-as-creator');
 try {await runClaim(f.lib,env);} finally {process.argv.pop();}
 assert.deepEqual(f.sent,['creatorApproveSubmission']);assert.ok(f.reviews.flat().some(x=>x.includes('123 wei')));assert.ok(f.reviews.flat().some(x=>x.includes(target)));assert.ok(f.reviews.flat().some(x=>x.includes(hunterCid)));
 await runClaim(f.lib,{...env,contract:()=>({nextAction:async()=> 'FINALIZE'})});assert.equal(f.sent.at(-1),'finalizeSubmission');
});

test('onboarding worker performs only a read-only open-job listing',async()=>{
 const {listOpenJobs}=await import('../bounty_worker_min.js');
 const calls=[];
 const jobs=await listOpenJobs({baseUrl:'https://mock.invalid',apiKey:'mock',fetchApi:async(url,options)=>{calls.push({url:String(url),options});return json({jobs:[{jobId:7,title:'Example'}]});}});
 assert.equal(jobs.length,1);assert.equal(calls.length,1);assert.equal(calls[0].options.method,'GET');assert.ok(calls[0].url.endsWith('/api/jobs?status=OPEN&minHoursLeft=2'));
});
