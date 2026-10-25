import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

export const VERSION = '0.1.1';
export const PLATFORMS = ['douyin', 'xiaohongshu'];
export const COLUMNS = [
  ['customer_name','客户账号名称'], ['customer_id','客户账号ID'],
  ['comment_text','意向表达评论'], ['comment_created_at','评论时间戳'],
  ['comment_timestamp_raw','原始时间戳'], ['customer_id_type','ID类型'],
  ['platform','平台'], ['target_label','圈选竞品账号'], ['target_id','圈选任务ID'],
  ['content_id','作品ID'], ['comment_id','评论ID'], ['parent_comment_id','父评论ID'],
  ['source_url','作品链接'], ['intent_tags','意向标签'], ['captured_at','采集时间'],
  ['quality_flags','待核验项'], ['job_id','任务ID']
];

export function id(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number' && !Number.isSafeInteger(value))
    throw new Error('UNSAFE_ID: 平台ID超出安全整数范围；数据源必须返回字符串');
  return String(value);
}
export function timestamp(value) {
  if (value === undefined || value === null || value === '') return null;
  let d;
  if (typeof value === 'number' || /^\d+(\.\d+)?$/.test(String(value))) {
    const n = Number(value); d = new Date(n >= 1e11 ? n : n * 1000);
  } else if (/^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:?\d{2})$/.test(String(value))) {
    d = new Date(value);
  } else return null;
  return Number.isFinite(d.getTime()) && d.getTime() >= 0 ? d.toISOString() : null;
}
export function profileIdentity(platform, url) {
  const u = new URL(url);
  if (u.protocol !== 'https:') throw new Error('账号主页必须使用HTTPS');
  if (platform === 'douyin' && ['www.douyin.com','douyin.com'].includes(u.hostname)) {
    const match=u.pathname.match(/^\/user\/([^/]+)\/?$/);
    if(match) return decodeURIComponent(match[1]);
  }
  if (platform === 'xiaohongshu' && ['www.xiaohongshu.com','xiaohongshu.com'].includes(u.hostname)) {
    const match=u.pathname.match(/^\/user\/profile\/([a-zA-Z0-9_-]+)\/?$/);
    if(match) return match[1];
  }
  throw new Error('需要完整账号主页链接：抖音 /user/<sec_uid>；小红书 /user/profile/<user_id>');
}
export function intent(text, extra=[]) {
  const s=String(text||'').trim();
  if(!s) return [];
  if(/(加我|加微|加微信|联系我).{0,12}(优惠|报价|卖车)|代办贷款|有需要私我/.test(s)) return [];
  if(/(已经|已|刚刚|刚)(买了|订了|提了|提车|买车)|不(想|打算|准备)?买|不会买|不考虑|不换车|没打算买/.test(s)) return [];
  const rules=[
    ['询价',/多少钱|落地(价|多少)?|报价|优惠|最低价|首付|月供|分期|购置税/],
    ['试驾',/试驾|试车|体验一下|预约体验/],
    ['购车计划',/想买|准备买|打算买|考虑买|想换|准备换|打算换|订车|下订|怎么订|购买|购车|能买吗/],
    ['置换',/置换|旧车抵|旧车能抵/],
    ['交付咨询',/多久.{0,4}(提车|交付)|交付.{0,4}(多久|时间)|什么时候.{0,4}(提车|交车)|有现车|现车吗/],
    ['选车比较',/怎么选|选哪个|买哪款|哪款.{0,5}(合适|适合)|哪个.{0,5}(合适|适合)|纠结.{0,20}(买|选)|预算.{0,10}(万|w|W)/]
  ];
  const tags=rules.filter(([,re])=>re.test(s)).map(([tag])=>tag);
  for(const term of extra) if(typeof term==='string' && term && s.includes(term)) tags.push('自定义意向词');
  if(tags.length && /要是|如果|等.{0,8}降价|便宜.{0,8}(就买|再买)/.test(s)) tags.push('条件性表达');
  return [...new Set(tags)];
}
export function normalize(row,target,jobId,now=new Date().toISOString(),extra=[]) {
  if(row.target_account_id && id(row.target_account_id)!==target.account_id) return null;
  if(row.target_id && row.target_id!==target.id) return null;
  const flags=[];
  const customerId=id(row.customer_id);
  const customerName=typeof row.customer_name==='string'?row.customer_name:null;
  const rawTime=row.comment_timestamp_raw??row.comment_created_at??null;
  const time=timestamp(rawTime);
  if(!customerId) flags.push('客户ID缺失');
  if(!customerName) flags.push('客户名称缺失');
  if(!time) flags.push('评论时间缺失或不可解析');
  const tags=intent(row.comment_text,extra);
  if(!tags.length) return null;
  const record={
    schema_version:1, platform:target.platform, target_id:target.id,
    target_label:target.label||target.id,target_account_id:target.account_id,
    customer_name:customerName,customer_id:customerId,
    customer_id_type:row.customer_id_type||'unknown',
    comment_text:String(row.comment_text||''),comment_created_at:time,
    comment_timestamp_raw:rawTime, content_id:id(row.content_id),comment_id:id(row.comment_id),
    parent_comment_id:id(row.parent_comment_id),source_url:row.source_url||null,
    intent_tags:tags,quality_flags:flags,captured_at:now,job_id:jobId
  };
  record.record_key=crypto.createHash('sha256').update(JSON.stringify([
    record.platform,record.target_id,record.content_id,
    record.comment_id || [record.customer_id,record.comment_text,record.comment_created_at??record.comment_timestamp_raw]
  ])).digest('hex');
  return record;
}
export function validateConfig(config) {
  if(config.schema_version!==1 || !Array.isArray(config.targets)) throw new Error('配置需要 schema_version:1 和 targets 数组');
  const ids=new Set();
  for(const t of config.targets) {
    if(!/^[a-zA-Z0-9_-]{1,64}$/.test(t.id||'') || ids.has(t.id)) throw new Error('任务ID必须唯一，且仅包含字母数字下划线或横线');
    ids.add(t.id);
    if(!PLATFORMS.includes(t.platform)) throw new Error('平台只能为 douyin 或 xiaohongshu');
    if(typeof t.selected!=='boolean') throw new Error('每个账号必须明确 selected:true/false');
    if(!['browser','http','fixture'].includes(t.source)) throw new Error('未知数据源');
    if(!t.account_id) throw new Error('account_id 缺失');
    if(t.source==='browser' && profileIdentity(t.platform,t.profile_url)!==t.account_id) throw new Error('主页链接与account_id不一致');
    if(t.source==='http' && (!t.endpoint || !t.token_env || new URL(t.endpoint).protocol!=='https:')) throw new Error('HTTP数据源需要HTTPS endpoint及token_env');
    if(t.source==='fixture' && !t.fixture_file) throw new Error('fixture_file缺失');
  }
  for(const [key,def,max] of [['max_posts',10,100],['max_comments_per_post',200,2000],['scroll_rounds',8,50]]) {
    const v=config.limits?.[key]??def;
    if(!Number.isInteger(v)||v<1||v>max) throw new Error(`${key} 必须为1至${max}的整数`);
  }
  if(config.lookback_days!==undefined && (!Number.isFinite(config.lookback_days)||config.lookback_days<=0)) throw new Error('lookback_days必须为正数');
  return config;
}
export async function readConfig(filename) {
  const absolute=path.resolve(filename);
  const config=validateConfig(JSON.parse(await fs.readFile(absolute,'utf8')));
  return {config,base:path.dirname(absolute)};
}
export function chooseTargets(config,explicit) {
  if(!explicit) return config.targets.filter(t=>t.selected);
  const ids=explicit.split(',').map(s=>s.trim()).filter(Boolean);
  const selected=ids.map(v=>config.targets.find(t=>t.id===v));
  if(!ids.length||selected.some(t=>!t)) throw new Error('圈选任务ID不存在；不会扩大抓取范围');
  return [...new Map(selected.map(t=>[t.id,t])).values()];
}
export function safeCell(value) {
  let s=Array.isArray(value)?value.join('；'):String(value??'');
  if(/^[\s]*[=+@-]/.test(s)) s="'"+s;
  return '"'+s.replaceAll('"','""')+'"';
}
export function csv(rows) {
  return '\uFEFF'+COLUMNS.map(([,label])=>safeCell(label)).join(',')+'\r\n'+
    rows.map(r=>COLUMNS.map(([k])=>safeCell(r[k])).join(',')).join('\r\n')+'\r\n';
}
export async function atomicJson(filename,data) {
  await fs.mkdir(path.dirname(filename),{recursive:true});
  const tmp=filename+`.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tmp,JSON.stringify(data,null,2),{mode:0o600});
  await fs.rename(tmp,filename);
}
async function fixture(target,base) {
  const data=JSON.parse(await fs.readFile(path.resolve(base,target.fixture_file),'utf8'));
  if(data.target_account_id!==target.account_id) throw new Error('样本文件账号不匹配');
  if(!Array.isArray(data.comments)) throw new Error('样本缺少comments数组');
  return {rows:data.comments,status:'fixture',coverage:'synthetic',details:'虚构样本，仅验证处理链路'};
}
export async function httpCollect(target,config) {
  const token=process.env[target.token_env];
  if(!token) throw new Error('HTTP数据源授权环境变量未配置');
  const rows=[];const cursors=new Set();let cursor='';let complete=false;
  const maxRows=(config.limits?.max_posts??10)*(config.limits?.max_comments_per_post??200);
  for(let page=0;page<(config.http_max_pages??20);page++) {
    const u=new URL(target.endpoint);
    u.searchParams.set('platform',target.platform);u.searchParams.set('account_id',target.account_id);
    u.searchParams.set('max_posts',String(config.limits?.max_posts??10));
    u.searchParams.set('max_comments_per_post',String(config.limits?.max_comments_per_post??200));
    if(cursor)u.searchParams.set('cursor',cursor);
    const response=await fetch(u,{headers:{Authorization:`Bearer ${token}`},redirect:'error',signal:AbortSignal.timeout(30000)});
    if(!response.ok)throw new Error(`HTTP数据源请求失败(${response.status})`);
    const text=await response.text();if(text.length>5_000_000)throw new Error('HTTP数据源响应过大');
    const data=JSON.parse(text);
    if(data.target_account_id!==target.account_id || data.platform!==target.platform || !Array.isArray(data.comments))throw new Error('HTTP数据源返回的账号、平台或结构不匹配');
    if(data.comments.some(r=>r.target_account_id && r.target_account_id!==target.account_id))throw new Error('HTTP数据源包含圈选范围外的评论');
    rows.push(...data.comments);
    if(!data.next_cursor){complete=data.coverage==='complete';break;}
    cursor=String(data.next_cursor);if(cursors.has(cursor))throw new Error('HTTP数据源游标重复');cursors.add(cursor);
    if(rows.length>maxRows)break;
  }
  return {rows:rows.slice(0,maxRows),status:'observed',coverage:complete&&rows.length<=maxRows?'source_declared_complete':'limited',details:'按数据源返回范围采集，不推定覆盖全部评论'};
}
export async function runJob(configFile,options={}) {
  const {config,base}=await readConfig(configFile);
  const targets=chooseTargets(config,options.targets);
  if(!targets.length) throw new Error('未圈选账号：先添加主页链接并设为selected:true');
  const live=targets.some(t=>t.source!=='fixture');
  const dataDir=path.resolve(base,config.data_dir||'data');
  const stateFile=path.join(dataDir,'state.json'),lockFile=path.join(dataDir,'run.lock');
  await fs.mkdir(dataDir,{recursive:true});
  let lock;
  try{lock=await fs.open(lockFile,'wx',0o600);}catch(e){if(e.code==='EEXIST')throw new Error('已有运行任务或遗留run.lock；确认旧进程结束后删除锁文件');throw e;}
  await lock.writeFile(JSON.stringify({pid:process.pid,started_at:new Date().toISOString()}));
  try {
    let state={schema_version:1,records:{}};
    try{state=JSON.parse(await fs.readFile(stateFile,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
    if(state.schema_version!==1 || !state.records)throw new Error('历史状态结构无效；不会覆盖');
    const now=new Date().toISOString();const jobId=now.replace(/[:.]/g,'-')+'-'+crypto.randomUUID().slice(0,8);
    const reports=[],added=[],observedKeys=new Set();let rejected=0;
    const cutoff=Date.now()-(config.lookback_days??30)*86400000;
    for(const target of targets) {
      try {
        let result;
        if(target.source==='fixture')result=await fixture(target,base);
        else if(target.source==='http')result=await httpCollect(target,config);
        else{const {collectBrowser}=await import('./browser.mjs');result=await collectBrowser(target,config,base);}
        const stats={target_id:target.id,platform:target.platform,status:result.status,coverage:result.coverage,comments_observed:result.rows.length,intent_candidates:0,new_candidates:0,invalid_rows:0,details:result.details,content_reports:result.content_reports??[]};
        for(const input of result.rows){
          let row;
          try{row=normalize(input,target,jobId,now,config.intent_keywords||[]);}catch{stats.invalid_rows++;rejected++;continue;}
          if(!row)continue;
          if(row.comment_created_at && new Date(row.comment_created_at).getTime()<cutoff)continue;
          if(observedKeys.has(row.record_key))continue;
          observedKeys.add(row.record_key);stats.intent_candidates++;
          if(!state.records[row.record_key]){row.first_seen_at=now;added.push(row);stats.new_candidates++;}
          else row.first_seen_at=state.records[row.record_key].first_seen_at;
          row.last_seen_at=now;state.records[row.record_key]=row;
        }
        reports.push(stats);
      }catch(e){reports.push({target_id:target.id,platform:target.platform,status:'failed',coverage:'unknown',error:String(e.message).slice(0,300)});}
    }
    const allowed=new Map(targets.map(t=>[t.id,t]));
    const cumulative=Object.values(state.records).filter(r=>{
      const target=allowed.get(r.target_id);
      return target && r.platform===target.platform && r.target_account_id===target.account_id &&
        (!r.comment_created_at||new Date(r.comment_created_at).getTime()>=cutoff);
    });
    const failures=reports.filter(r=>['failed','blocked','unsupported','partial'].includes(r.status)||r.invalid_rows>0).length;
    const summary={schema_version:1,version:VERSION,job_id:jobId,started_at:now,finished_at:new Date().toISOString(),mode:live?'live':'fixture',status:failures===reports.length?'failed':failures?'partial':'success',target_ids:targets.map(t=>t.id),new_candidates:added.length,cumulative_candidates:cumulative.length,rejected_rows:rejected,targets:reports};
    await atomicJson(stateFile,state);
    const out=path.join(dataDir,'runs',jobId);await fs.mkdir(out,{recursive:true});
    await fs.writeFile(path.join(out,'new-leads.csv'),csv(added),{mode:0o600});
    await fs.writeFile(path.join(out,'new-leads.jsonl'),added.map(r=>JSON.stringify(r)).join('\n')+(added.length?'\n':''),{mode:0o600});
    await fs.writeFile(path.join(out,'selected-leads.csv'),csv(cumulative),{mode:0o600});
    await atomicJson(path.join(out,'report.json'),summary);
    await atomicJson(path.join(dataDir,'latest-report.json'),{...summary,output_dir:out});
    return {...summary,output_dir:out};
  }finally{await lock.close();await fs.unlink(lockFile);}
}
