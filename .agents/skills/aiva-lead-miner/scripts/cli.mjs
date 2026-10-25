#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {runJob,readConfig,profileIdentity,atomicJson,validateConfig,chooseTargets} from './core.mjs';
const {values,positionals}=parseArgs({allowPositionals:true,options:{
  config:{type:'string',default:'config.json'}, platform:{type:'string'},url:{type:'string'},
  id:{type:'string'},label:{type:'string'},ids:{type:'string'},targets:{type:'string'},
  daily:{type:'string'},install:{type:'boolean'},remove:{type:'boolean'},
  hours:{type:'string'},help:{type:'boolean'}
}});
const command=positionals[0]||'help';
const print=value=>console.log(JSON.stringify(value,null,2));
async function main(){
  if(values.help||command==='help'){
    console.log(`AIVA线索挖掘 v0.1.1 (Node.js 20+)\n\ninit --config config.json\ndemo --config demo/config.json\nadd --config config.json --platform douyin|xiaohongshu --url 完整主页链接 --id 唯一任务ID --label 账号名称\nselect --config config.json --ids 任务ID1,任务ID2\nlist --config config.json\nlogin --config config.json --platform douyin|xiaohongshu\nrun --config config.json [--targets 任务ID1,任务ID2]\nschedule --config config.json --daily 10:00 [--install]\nschedule --remove\ndaemon --config config.json --hours 6\ndoctor --config config.json\n\ninit不会圈选真实账号。schedule默认仅预览，加--install才安装系统计划任务。`);return;
  }
  if(command==='init'){
    const template=JSON.parse(await fs.readFile(fileURLToPath(new URL('../assets/config.example.json',import.meta.url)),'utf8'));
    await fs.writeFile(path.resolve(values.config),JSON.stringify(template,null,2),{flag:'wx',mode:0o600});
    print({config:path.resolve(values.config),message:'已创建配置；使用add添加账号，然后select圈选'});return;
  }
  if(command==='demo'){
    const template=JSON.parse(await fs.readFile(fileURLToPath(new URL('../assets/demo-config.json',import.meta.url)),'utf8'));
    template.data_dir='data';
    for(const t of template.targets)t.fixture_file=fileURLToPath(new URL('../assets/'+t.fixture_file,import.meta.url));
    await fs.mkdir(path.dirname(path.resolve(values.config)),{recursive:true});
    await fs.writeFile(path.resolve(values.config),JSON.stringify(template,null,2),{flag:'wx',mode:0o600});
    print(await runJob(values.config));return;
  }
  if(command==='schedule'&&values.remove){const {removeSchedule}=await import('./schedule.mjs');print(removeSchedule());return;}
  const {config,base}=await readConfig(values.config);
  if(command==='list'){print(config.targets.map(t=>({id:t.id,label:t.label,platform:t.platform,selected:t.selected,profile_url:t.profile_url})));return;}
  if(command==='add'){
    if(!values.id||!values.platform||!values.url)throw new Error('add需要--id、--platform和--url');
    if(config.targets.some(t=>t.id===values.id))throw new Error('任务ID已存在');
    config.targets.push({id:values.id,platform:values.platform,label:values.label||values.id,profile_url:values.url,account_id:profileIdentity(values.platform,values.url),source:'browser',selected:false});
    validateConfig(config);await atomicJson(path.resolve(values.config),config);print({added:values.id,selected:false});return;
  }
  if(command==='select'){
    if(values.ids===undefined)throw new Error('select需要--ids；空字符串表示取消全部圈选');
    const ids=values.ids?chooseTargets(config,values.ids).map(t=>t.id):[];
    for(const t of config.targets)t.selected=ids.includes(t.id);
    await atomicJson(path.resolve(values.config),config);print({selected:ids});return;
  }
  if(command==='login'){
    if(!['douyin','xiaohongshu'].includes(values.platform))throw new Error('login需要--platform douyin或xiaohongshu');
    const {login}=await import('./browser.mjs');print(await login(values.platform,config,base));return;
  }
  if(command==='run'){const result=await runJob(values.config,{targets:values.targets});print(result);process.exitCode=result.status==='success'?0:result.status==='partial'?2:1;return;}
  if(command==='schedule'){
    if(!chooseTargets(config).length)throw new Error('先圈选账号再设置计划任务');
    if(!values.daily)throw new Error('schedule需要--daily HH:MM');
    const {scheduleDefinition,installSchedule}=await import('./schedule.mjs');
    print(values.install?await installSchedule(values.config,values.daily):scheduleDefinition(values.config,values.daily));return;
  }
  if(command==='daemon'){
    const hours=Number(values.hours??6);
    if(!Number.isFinite(hours)||hours<1||hours>168)throw new Error('--hours范围为1至168');
    let stopped=false;process.on('SIGINT',()=>{stopped=true;});process.on('SIGTERM',()=>{stopped=true;});
    console.log('常驻采集已启动，按Ctrl+C停止；每次执行重新读取圈选清单。');
    while(!stopped){try{print(await runJob(values.config));}catch(e){print({status:'failed',error:e.message});}
      const until=Date.now()+hours*3600000;while(!stopped&&Date.now()<until)await new Promise(r=>setTimeout(r,1000));
    }return;
  }
  if(command==='doctor'){
    const issues=[];
    for(const platform of new Set(config.targets.filter(t=>t.selected&&t.source==='browser').map(t=>t.platform))){
      try{await fs.access(path.resolve(base,config.sessions?.[platform]||`sessions/${platform}.json`));}catch{issues.push(`${platform}:需要登录`);}
    }
    if(!chooseTargets(config).length)issues.push('未圈选账号');
    print({selected:chooseTargets(config).map(t=>t.id),issues,note:'会话文件存在不证明登录有效；平台连通性与字段覆盖需真实抓取验证'});return;
  }
  throw new Error('未知命令，运行 help 查看用法');
}
main().catch(e=>{console.error(JSON.stringify({status:'failed',error:e.message}));process.exitCode=1;});
