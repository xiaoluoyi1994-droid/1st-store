import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
export const TASK_NAME='AIVA-Lead-Miner';
const quote=s=>"'"+s.replaceAll("'","'\\''")+"'";
export function scheduleDefinition(configFile,time,platform=process.platform,node=process.execPath) {
  if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))throw new Error('时间必须为HH:MM，例如10:00');
  const config=path.resolve(configFile);
  if(/[\r\n]/.test(config)||config.includes('%'))throw new Error('配置路径不能包含换行或%');
  const cli=fileURLToPath(new URL('./cli.mjs',import.meta.url));
  if(platform==='win32'){
    const psQuote=s=>"'"+s.replaceAll("'","''")+"'";
    const script=`$ErrorActionPreference = 'Stop'\n& ${psQuote(node)} ${psQuote(cli)} run --config ${psQuote(config)}\nexit $LASTEXITCODE\n`;
    return {kind:'windows',script,config,time,task_name:TASK_NAME};
  }
  const [hour,minute]=time.split(':').map(Number);
  return {kind:'cron',line:`${minute} ${hour} * * * ${quote(node)} ${quote(cli)} run --config ${quote(config)} # ${TASK_NAME}`,time,config};
}
export async function installSchedule(configFile,time) {
  const def=scheduleDefinition(configFile,time);
  if(def.kind==='windows'){
    const scriptPath=path.join(path.dirname(def.config),'scheduled-run.ps1');
    await fs.writeFile(scriptPath,def.script,{mode:0o600});
    execFileSync('schtasks',['/Create','/TN',TASK_NAME,'/SC','DAILY','/ST',time,'/TR',`powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}"`],{stdio:'pipe'});
    return {...def,script_file:scriptPath,note:'按电脑本地时区执行；电脑需开机，登录状态需有效。已有同名任务不会被覆盖。'};
  }
  let existing='';
  try{existing=execFileSync('crontab',['-l'],{encoding:'utf8'});}catch(e){if(e.status!==1)throw new Error('crontab不可用，使用daemon常驻模式或配置系统计划任务');}
  if(existing.includes(`# ${TASK_NAME}`))throw new Error('已有AIVA计划任务；先移除旧任务再安装');
  execFileSync('crontab',['-'],{input:existing.replace(/\n?$/,'\n')+def.line+'\n'});
  return {...def,note:'按运行机器本地时区执行；机器需常开，登录状态需有效。'};
}
export function removeSchedule() {
  if(process.platform==='win32')execFileSync('schtasks',['/Delete','/TN',TASK_NAME,'/F']);
  else{
    const existing=execFileSync('crontab',['-l'],{encoding:'utf8'});
    execFileSync('crontab',['-'],{input:existing.split('\n').filter(l=>!l.includes(`# ${TASK_NAME}`)).join('\n')});
  }
  return {removed:TASK_NAME};
}
