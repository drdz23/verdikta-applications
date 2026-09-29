jest.mock('../config',()=>({config:{network:'base-sepolia',chainId:84532,bountyEscrowAddress:'0x'+'11'.repeat(20),submissionDefaults:{maxOracleFeeWei:'20000000000000',alpha:500,estimatedBaseCostWei:'10000000000000',maxFeeBasedScaling:3}}}));
jest.mock('../utils/verdiktaService',()=>({isVerdiktaServiceAvailable:()=>false}));
jest.mock('../utils/contractService',()=>({getContractService:()=>({provider:{},contract:{}})}));
jest.mock('../utils/jobStorage',()=>({readStorage:jest.fn(async()=>({jobs:[]})),createJob:jest.fn(async data=>({...data,jobId:0}))}));
jest.mock('../utils/archiveGenerator',()=>({createPrimaryCIDArchive:jest.fn(async()=>({archivePath:'/tmp/verdikta-mocked-archive-does-not-exist.zip'}))}));
jest.mock('@verdikta/common',()=>({...jest.requireActual('@verdikta/common'),classMap:{getClass:()=>({status:'ACTIVE',models:[{provider:'openai',model:'test-model'}]})}}));
const express=require('express'),request=require('supertest');
const storage=require('../utils/jobStorage'),archive=require('../utils/archiveGenerator');
const {applyChainBountyFields}=require('../utils/syncService');
const app=express();app.use(express.json());app.use('/jobs',require('../routes/jobRoutes'));
const cid='Qm'+'a'.repeat(44),upload=jest.fn(async()=>cid);
app.locals.ipfsClient={uploadToIPFS:upload,fetchFromIPFS:async()=>Buffer.from('{}')};
const body={title:'test',description:'test',creator:'0x'+'11'.repeat(20),bountyAmount:0.001,threshold:85,rubricCid:cid,juryNodes:[{provider:'openai',model:'test-model',weight:1,runs:1}]};
beforeEach(()=>jest.clearAllMocks());
test('legacy numeric no-mode creation returns exact decimal amount and encoded tx',async()=>{
 const res=await request(app).post('/jobs/create').send(body);
 expect(res.status).toBe(200);expect(res.body.onChain.transaction.data).toMatch(/^0x/);
 expect(storage.createJob).toHaveBeenCalledWith(expect.objectContaining({bountyAmount:'0.001',targetHunter:null}));
});
test.each(['1e-3','+1','0','-1','NaN','0.0000000000000000001',{},true])('invalid amount %p rejects before pinning/storage',async bountyAmount=>{
 const res=await request(app).post('/jobs/create').send({...body,bountyAmount});
 expect(res.status).toBe(400);expect(storage.createJob).not.toHaveBeenCalled();expect(archive.createPrimaryCIDArchive).not.toHaveBeenCalled();expect(upload).not.toHaveBeenCalled();
});
test('trimmed amounts normalize, including split payments',async()=>{
 const res=await request(app).post('/jobs/create').send({...body,bountyAmount:' 0.01 ',creatorDeterminationPayment:' 0.005 ',arbiterDeterminationPayment:' 0.01',creatorAssessmentWindowHours:1});
 expect(res.status).toBe(200);expect(storage.createJob).toHaveBeenCalledWith(expect.objectContaining({bountyAmount:'0.01',creatorDeterminationPayment:'0.005',arbiterDeterminationPayment:'0.01'}));
});
test.each(['creatorDeterminationPayment','arbiterDeterminationPayment'])('invalid %s rejects before pinning',async field=>{
 const res=await request(app).post('/jobs/create').send({...body,[field]:'5e-05'});
 expect(res.status).toBe(400);expect(storage.createJob).not.toHaveBeenCalled();expect(upload).not.toHaveBeenCalled();
});
test('OPEN zero stores null; TARGETED missing/non-prefixed target is rejected',async()=>{
 const res=await request(app).post('/jobs/create').send({...body,procurementMode:'OPEN',targetHunter:'0x'+'0'.repeat(40)});
 expect(res.status).toBe(200);expect(storage.createJob).toHaveBeenCalledWith(expect.objectContaining({targetHunter:null}));
 jest.clearAllMocks();
 for(const targetHunter of [undefined,'1'.repeat(40),'XE7338O073KYGTWWZN0F2WZ0R8PX5ZPPZS']) {
  const bad=await request(app).post('/jobs/create').send({...body,procurementMode:'TARGETED',targetHunter});
  expect(bad.status).toBe(400);
 }
 expect(storage.createJob).not.toHaveBeenCalled();expect(upload).not.toHaveBeenCalled();
});
test('chain field sync preserves the exact ETH decimal string',()=>{
 const job={};const amount='0.123456789012345678';
 applyChainBountyFields(job,{bountyAmount:amount});expect(job.bountyAmount).toBe(amount);
});
