import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {intent,normalize,timestamp,id,profileIdentity,chooseTargets,csv,runJob,safeCell,httpCollect} from '../core.mjs';
import {parsePosts,parseComments} from '../browser.mjs';
import {scheduleDefinition} from '../schedule.mjs';
const target={id:'a',label:'圈选A',platform:'douyin',account_id:'OWNER-A',source:'fixture',selected:true,fixture_file:'a.json'};
const row={customer_name:'示例客户',customer_id:'CUSTOMER-1',customer_id_type:'sec_uid',comment_text:'准备买，能试驾吗？',comment_timestamp_raw:Math.floor(Date.now()/1000),content_id:'POST-A',comment_id:'COMMENT-A'};
async function setup(){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'aiva-test-'));
  const config={schema_version:1,data_dir:'data',targets:[{...target},{...target,id:'b',account_id:'OWNER-B',label:'圈选B',selected:false,fixture_file:'b.json'}]};
  await fs.writeFile(path.join(dir,'config.json'),JSON.stringify(config));
  await fs.writeFile(path.join(dir,'a.json'),JSON.stringify({target_account_id:'OWNER-A',comments:[row,row,{...row,comment_id:'noise',comment_text:'真好看'}]}));
  await fs.writeFile(path.join(dir,'b.json'),JSON.stringify({target_account_id:'OWNER-B',comments:[{...row,comment_id:'COMMENT-B',customer_id:'CUSTOMER-B'}]}));
  return {dir,configFile:path.join(dir,'config.json'),config};
}
test('意向规则区分询价试驾、围观、已提车、否定与条件表达',()=>{
  assert.ok(intent(row.comment_text).includes('试驾'));
  for(const text of ['真好看，支持一下','已经提车，优惠挺大','不想买了，落地太贵'])assert.deepEqual(intent(text),[]);
  assert.ok(intent('如果再便宜点就准备买').includes('条件性表达'));
});
test('秒毫秒一致，缺失及相对时间不会变成采集时间',()=>{
  assert.equal(timestamp(1791532800),timestamp(1791532800000));assert.equal(timestamp('3天前'),null);
  const out=normalize({...row,comment_timestamp_raw:null},target,'JOB','2026-10-09T10:00:00Z');
  assert.equal(out.comment_created_at,null);assert.ok(out.quality_flags.includes('评论时间缺失或不可解析'));
});

test('缺少评论ID时同一秒毫秒时间保持相同去重键，原始时间仍保留',()=>{
  const seconds=normalize({...row,comment_id:null,comment_timestamp_raw:1791532800},target,'JOB');
  const millis=normalize({...row,comment_id:null,comment_timestamp_raw:1791532800000},target,'JOB');
  assert.equal(seconds.comment_created_at,millis.comment_created_at);
  assert.equal(seconds.record_key,millis.record_key);
  assert.equal(seconds.comment_timestamp_raw,1791532800);
  assert.equal(millis.comment_timestamp_raw,1791532800000);
  const other=normalize({...row,comment_id:null,comment_timestamp_raw:1791532801},target,'JOB');
  assert.notEqual(seconds.record_key,other.record_key);
});
test('长ID保持字符串，不默默损失数字精度',()=>{
  assert.equal(id('99999999999999999999'),'99999999999999999999');assert.throws(()=>id(99999999999999999999),/UNSAFE_ID/);
});
test('圈选未知ID报错，跨账号评论不进入名单',()=>{
  assert.equal(chooseTargets({targets:[target]},'a')[0].id,'a');assert.throws(()=>chooseTargets({targets:[target]},'unknown'),/不存在/);
  assert.equal(normalize({...row,target_account_id:'OTHER'},target,'job'),null);
  assert.equal(profileIdentity('douyin','https://www.douyin.com/user/OWNER-A'),'OWNER-A');
  assert.throws(()=>profileIdentity('douyin','https://evil.example/user/OWNER-A'));
});
test('主页解析只接受圈选请求与作者，不接受推荐作品',()=>{
  const packet={aweme_list:[{aweme_id:'POST-A',author:{sec_uid:'OWNER-A'}},{aweme_id:'OTHER-POST',author:{sec_uid:'OTHER'}}]};
  const url='https://www.douyin.com/aweme/v1/web/aweme/post/?sec_user_id=OWNER-A';
  assert.deepEqual(parsePosts('douyin',url,packet,'OWNER-A').map(p=>p.content_id),['POST-A']);
  assert.deepEqual(parsePosts('douyin',url.replace('OWNER-A','OTHER'),packet,'OWNER-A'),[]);
});
test('抖音评论及嵌套回复保留ID和父评论，拒绝范围外作品',()=>{
  const url='https://www.douyin.com/aweme/v1/web/comment/list/?aweme_id=POST-A';
  const packet={status_code:0,has_more:1,comments:[{cid:'C1',text:'想试驾',create_time:1791532800,user:{nickname:'甲',sec_uid:'U1'},reply_comment:[{cid:'R1',text:'我也想买',create_time:1791532801,user:{nickname:'乙',sec_uid:'U2'}}]}]};
  const out=parseComments('douyin',url,packet,target,new Map([['POST-A',{url:'https://www.douyin.com/video/POST-A'}]]));
  assert.equal(out.rows.length,2);assert.equal(out.rows[1].parent_comment_id,'C1');assert.equal(out.rows[0].customer_id,'U1');
  assert.equal(parseComments('douyin',url,packet,target,new Map()),null);
});
test('小红书评论毫秒时间、用户名与子评论映射',()=>{
  const t={...target,platform:'xiaohongshu'},post=new Map([['NOTE1',{url:'https://www.xiaohongshu.com/explore/NOTE1'}]]);
  const packet={success:true,data:{has_more:false,comments:[{id:'C1',content:'能预约试驾吗',create_time:1791532800000,user_info:{nickname:'甲',user_id:'X1'},sub_comments:[{id:'R1',content:'优惠多少',user_info:{nickname:'乙',user_id:'X2'}}]}]}};
  const out=parseComments('xiaohongshu','https://edith.xiaohongshu.com/api/sns/web/v2/comment/page?note_id=NOTE1',packet,t,post);
  assert.equal(out.rows[0].customer_name,'甲');assert.equal(out.rows[0].customer_id_type,'user_id');assert.equal(out.rows[1].parent_comment_id,'C1');
  assert.equal(timestamp(out.rows[0].comment_timestamp_raw),'2026-10-09T08:00:00.000Z');
});
test('CSV阻止公式执行且保留引号换行',()=>{
  assert.equal(safeCell('=1+1'),'"\'=1+1"');assert.ok(csv([{...row,customer_name:'@SUM(1,2)'}]).includes("'@SUM"));
  assert.equal(safeCell('含"引号\n换行'),'"含""引号\n换行"');assert.ok(csv([]).startsWith('\uFEFF'));
});
test('增量两次运行不重复，改圈选后的累计导出不含旧范围',async()=>{
  const {dir,configFile,config}=await setup();
  try{
    const first=await runJob(configFile);assert.equal(first.new_candidates,1);assert.equal(first.mode,'fixture');
    const again=await runJob(configFile);assert.equal(again.new_candidates,0);assert.equal(again.cumulative_candidates,1);
    config.targets[0].selected=false;config.targets[1].selected=true;await fs.writeFile(configFile,JSON.stringify(config));
    const second=await runJob(configFile);assert.deepEqual(second.target_ids,['b']);
    const output=await fs.readFile(path.join(second.output_dir,'selected-leads.csv'),'utf8');
    assert.ok(output.includes('CUSTOMER-B'));assert.ok(!output.includes('CUSTOMER-1'));
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('同一圈选任务ID改绑账号或平台后累计导出不含旧账号历史',async()=>{
  const {dir,configFile,config}=await setup();
  try{
    await runJob(configFile);
    config.targets[0].account_id='OWNER-C';
    await fs.writeFile(configFile,JSON.stringify(config));
    await fs.writeFile(path.join(dir,'a.json'),JSON.stringify({target_account_id:'OWNER-C',comments:[]}));
    const changedAccount=await runJob(configFile);
    assert.equal(changedAccount.cumulative_candidates,0);
    assert.ok(!(await fs.readFile(path.join(changedAccount.output_dir,'selected-leads.csv'),'utf8')).includes('CUSTOMER-1'));
    config.targets[0].account_id='OWNER-A';config.targets[0].platform='xiaohongshu';
    await fs.writeFile(configFile,JSON.stringify(config));
    await fs.writeFile(path.join(dir,'a.json'),JSON.stringify({target_account_id:'OWNER-A',comments:[]}));
    const changedPlatform=await runJob(configFile);
    assert.equal(changedPlatform.cumulative_candidates,0);
    const state=JSON.parse(await fs.readFile(path.join(dir,'data/state.json'),'utf8'));
    assert.equal(Object.values(state.records).length,1,'范围变化不删除原始历史');
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('损坏状态及并发锁不覆盖历史，错账号样本报告失败',async()=>{
  const {dir,configFile}=await setup();
  try{
    await fs.mkdir(path.join(dir,'data'));await fs.writeFile(path.join(dir,'data/run.lock'),'occupied');
    await assert.rejects(runJob(configFile),/已有运行任务/);await fs.unlink(path.join(dir,'data/run.lock'));
    await fs.writeFile(path.join(dir,'data/state.json'),'broken');await assert.rejects(runJob(configFile));
    assert.equal(await fs.readFile(path.join(dir,'data/state.json'),'utf8'),'broken');await fs.unlink(path.join(dir,'data/state.json'));
    await fs.writeFile(path.join(dir,'a.json'),JSON.stringify({target_account_id:'OTHER',comments:[row]}));
    const result=await runJob(configFile);assert.equal(result.status,'failed');assert.equal(result.new_candidates,0);
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('HTTP分页携带圈选ID，拒绝跨账号响应及重复游标',async()=>{
  const original=globalThis.fetch;process.env.AIVA_TEST_TOKEN='synthetic-token';
  const t={...target,source:'http',endpoint:'https://provider.invalid/comments',token_env:'AIVA_TEST_TOKEN'};
  try{
    globalThis.fetch=async u=>{assert.equal(new URL(u).searchParams.get('account_id'),'OWNER-A');return new Response(JSON.stringify({platform:'douyin',target_account_id:'OTHER',comments:[]}));};
    await assert.rejects(httpCollect(t,{}),/不匹配/);
    globalThis.fetch=async()=>new Response(JSON.stringify({platform:'douyin',target_account_id:'OWNER-A',comments:[],next_cursor:'repeat'}));
    await assert.rejects(httpCollect(t,{}),/游标重复/);
  }finally{globalThis.fetch=original;delete process.env.AIVA_TEST_TOKEN;}
});

test('HTTP来源声明完整但本地截断时必须报告limited',async()=>{
  const original=globalThis.fetch;process.env.AIVA_TEST_TOKEN='synthetic-token';
  const t={...target,source:'http',endpoint:'https://provider.invalid/comments',token_env:'AIVA_TEST_TOKEN'};
  const config={limits:{max_posts:1,max_comments_per_post:1}};
  try{
    globalThis.fetch=async()=>new Response(JSON.stringify({platform:'douyin',target_account_id:'OWNER-A',comments:[row,{...row,comment_id:'C2'}],coverage:'complete'}));
    const truncated=await httpCollect(t,config);
    assert.equal(truncated.rows.length,1);assert.equal(truncated.coverage,'limited');
    globalThis.fetch=async()=>new Response(JSON.stringify({platform:'douyin',target_account_id:'OWNER-A',comments:[row],coverage:'complete'}));
    assert.equal((await httpCollect(t,config)).coverage,'source_declared_complete');
  }finally{globalThis.fetch=original;delete process.env.AIVA_TEST_TOKEN;}
});
test('日计划时间验证，cron及Windows正确引用含空格路径',()=>{
  const cron=scheduleDefinition('/tmp/aiva folder/config.json','10:30','linux','/usr/bin/node');
  assert.ok(cron.line.startsWith('30 10 * * *'));assert.ok(cron.line.includes("'"+path.resolve('/tmp/aiva folder/config.json')+"'"));
  const win=scheduleDefinition('/tmp/aiva folder/config.json','10:30','win32','C:/Program Files/nodejs/node.exe');
  assert.ok(win.script.includes("'C:/Program Files/nodejs/node.exe'"));assert.throws(()=>scheduleDefinition('/tmp/config.json','25:00'));
});
test('CLI跨工作目录圈选和导出，空圈选失败',async()=>{
  const {dir,configFile}=await setup(),cli=fileURLToPath(new URL('../cli.mjs',import.meta.url));
  try{
    const select=spawnSync(process.execPath,[cli,'select','--config',configFile,'--ids','b'],{cwd:os.tmpdir(),encoding:'utf8'});assert.equal(select.status,0,select.stderr);
    const run=spawnSync(process.execPath,[cli,'run','--config',configFile],{cwd:os.tmpdir(),encoding:'utf8'});assert.equal(run.status,0,run.stderr);assert.deepEqual(JSON.parse(run.stdout).target_ids,['b']);
    spawnSync(process.execPath,[cli,'select','--config',configFile,'--ids','']);
    const empty=spawnSync(process.execPath,[cli,'run','--config',configFile],{encoding:'utf8'});assert.equal(empty.status,1);assert.ok(empty.stderr.includes('未圈选账号'));
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
