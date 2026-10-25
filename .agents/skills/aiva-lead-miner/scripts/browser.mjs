import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createInterface} from 'node:readline/promises';
import {id} from './core.mjs';
const require=createRequire(import.meta.url);
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

function allowedHost(platform,url) {
  const h=new URL(url).hostname;
  return platform==='douyin' ? /(^|\.)douyin\.com$/.test(h) : /(^|\.)xiaohongshu\.com$/.test(h);
}
export function parsePosts(platform,url,payload,accountId) {
  if(!allowedHost(platform,url))return [];
  const u=new URL(url);let items;
  if(platform==='douyin') {
    if(!/\/aweme\/post\/?$/.test(u.pathname)||u.searchParams.get('sec_user_id')!==accountId)return [];
    items=payload.aweme_list;
  }else{
    if(!/\/user_posted\/?$/.test(u.pathname)||u.searchParams.get('user_id')!==accountId)return [];
    items=payload.data?.notes;
  }
  if(!Array.isArray(items))throw new Error('PROFILE_SCHEMA_CHANGED: 未识别到账号作品列表');
  return items.flatMap(item=>{
    const author=item.author||item.user||item.note_card?.user;
    const owner=platform==='douyin'?author?.sec_uid:author?.user_id;
    if(owner && id(owner)!==accountId)return [];
    const contentId=id(platform==='douyin'?item.aweme_id:(item.note_id??item.id));
    if(!contentId)return [];
    const token=item.xsec_token||item.note_card?.xsec_token;
    const contentUrl=platform==='douyin'?`https://www.douyin.com/video/${encodeURIComponent(contentId)}`:
      `https://www.xiaohongshu.com/explore/${encodeURIComponent(contentId)}`+(token?`?xsec_token=${encodeURIComponent(token)}&xsec_source=pc_user`:'');
    return [{content_id:contentId,url:contentUrl}];
  });
}
export function parseComments(platform,url,payload,target,posts) {
  if(!allowedHost(platform,url))return null;
  const u=new URL(url);
  const route=platform==='douyin'?/\/comment\/(list|list\/reply)\/?$/:/\/comment\/(page|sub\/page)\/?$/;
  if(!route.test(u.pathname))return null;
  const contentId=u.searchParams.get(platform==='douyin'?'aweme_id':'note_id')||u.searchParams.get('item_id');
  if(!contentId||!posts.has(contentId))return null;
  if(payload.status_code!==undefined && payload.status_code!==0)throw new Error('COMMENT_REQUEST_DENIED: 评论请求被平台拒绝');
  if(payload.success===false)throw new Error('COMMENT_REQUEST_DENIED: 评论请求被平台拒绝');
  const data=platform==='douyin'?payload:payload.data;
  if(!Array.isArray(data?.comments))throw new Error('COMMENT_SCHEMA_CHANGED: 未识别到评论列表');
  const rows=[];
  const fallbackParent=u.searchParams.get('comment_id')||u.searchParams.get('root_comment_id')||null;
  function append(c,parent=null) {
    const user=platform==='douyin'?c.user:c.user_info;
    const sec=platform==='douyin'?user?.sec_uid:user?.user_id;
    const cid=id(platform==='douyin'?c.cid:c.id);
    rows.push({
      target_account_id:target.account_id,content_id:contentId,comment_id:cid,
      parent_comment_id:parent||id(c.reply_id)||fallbackParent,
      customer_name:user?.nickname??null,customer_id:id(sec),
      customer_id_type:platform==='douyin'?'sec_uid':'user_id',
      comment_text:platform==='douyin'?(c.text??''):(c.content??''),
      comment_timestamp_raw:c.create_time??null,
      source_url:posts.get(contentId).url
    });
    const children=platform==='douyin'?c.reply_comment:c.sub_comments;
    if(Array.isArray(children))for(const child of children)append(child,cid);
  }
  for(const c of data.comments)append(c,fallbackParent);
  return {content_id:contentId,rows,has_more:Boolean(data.has_more)};
}
function playwright() {
  try{return require('playwright');}catch{throw new Error('PLAYWRIGHT_MISSING: 在Skill的scripts目录运行 npm install，然后 npx playwright install chromium');}
}
async function launch(config,headless) {
  const opts={headless};
  if(config.browser?.channel)opts.channel=config.browser.channel;
  if(config.browser?.executable_path)opts.executablePath=config.browser.executable_path;
  try{return await playwright().chromium.launch(opts);}catch{throw new Error('BROWSER_UNAVAILABLE: 请安装Chromium或配置 browser.channel:"chrome"；定时环境需要可用浏览器');}
}
export async function login(platform,config,base) {
  const browser=await launch(config,false);
  try {
    const context=await browser.newContext();const page=await context.newPage();
    await page.goto(platform==='douyin'?'https://www.douyin.com/':'https://www.xiaohongshu.com/',{waitUntil:'domcontentloaded',timeout:45000});
    const rl=createInterface({input:process.stdin,output:process.stdout});
    try{await rl.question('请在浏览器中自行完成登录。确认登录成功后，回到这里按回车保存本地会话：');}finally{rl.close();}
    const filename=path.resolve(base,config.sessions?.[platform]||`sessions/${platform}.json`);
    await fs.mkdir(path.dirname(filename),{recursive:true});
    await context.storageState({path:filename});await fs.chmod(filename,0o600);
    return {platform,session_file:filename,note:'只保存本地会话；平台是否允许数据采集仍按实际访问权限判断'};
  }finally{await browser.close();}
}
async function blockReason(page) {
  const text=await page.locator('body').innerText({timeout:5000}).catch(()=> '');
  if(/访问过于频繁|操作频繁|请完成.*验证|安全验证|拖动滑块|请拖动|异常访问|访问受限/.test(text))return '平台要求验证或限制访问，请人工处理';
  const visibleLogin=await page.locator('[class*="login-modal"], [class*="loginModal"], [data-e2e="login-dialog"]').filter({hasText:/登录/}).first().isVisible().catch(()=>false);
  if(visibleLogin)return '平台登录弹窗阻止访问，请重新登录';
  return null;
}
async function scrollComments(page,platform) {
  const selectors=platform==='xiaohongshu'?['.comments-container','.comment-container','.note-scroller']:
    ['[data-e2e="comment-list"]','[data-e2e="comment-list-container"]'];
  for(const s of selectors){const el=page.locator(s).first();if(await el.isVisible().catch(()=>false)){
    await el.hover();await page.mouse.wheel(0,900);return;
  }}
  await page.mouse.wheel(0,900);
}
export async function collectBrowser(target,config,base) {
  const session=path.resolve(base,config.sessions?.[target.platform]||`sessions/${target.platform}.json`);
  try{await fs.access(session);}catch{throw new Error(`LOGIN_REQUIRED: 请先运行 login --platform ${target.platform}`);}
  const browser=await launch(config,config.browser?.headless!==false);
  try {
    const context=await browser.newContext({storageState:session});
    const page=await context.newPage();const posts=new Map();const comments=new Map();
    const batches=new Map(),errors=[],pending=new Set();let responses=0;
    const maxPosts=config.limits?.max_posts??10,maxComments=config.limits?.max_comments_per_post??200;
    const rounds=config.limits?.scroll_rounds??8,delay=config.browser?.delay_ms??1600;
    page.on('response',response=>{
      const url=response.url();
      if(!allowedHost(target.platform,url)||!/(\/aweme\/post|\/user_posted|\/comment\/)/.test(new URL(url).pathname))return;
      if(++responses>300)return;
      const task=(async()=>{
        if([401,403,429].includes(response.status())){errors.push('平台拒绝访问或限流');return;}
        const size=Number(response.headers()['content-length']||0);if(size>5_000_000){errors.push('平台响应过大');return;}
        const payload=await response.json();
        const newPosts=parsePosts(target.platform,url,payload,target.account_id);
        for(const item of newPosts)if(posts.size<maxPosts||posts.has(item.content_id))posts.set(item.content_id,item);
        const result=parseComments(target.platform,url,payload,target,posts);
        if(result){
          batches.set(result.content_id,{...(batches.get(result.content_id)||{}),seen:true,has_more:result.has_more});
          if(!comments.has(result.content_id))comments.set(result.content_id,new Map());
          const bucket=comments.get(result.content_id);
          for(const row of result.rows){
            const key=row.comment_id||JSON.stringify([row.customer_id,row.comment_text,row.comment_timestamp_raw]);
            if(bucket.size<maxComments||bucket.has(key))bucket.set(key,row);
          }
        }
      })().catch(e=>errors.push(/SCHEMA_CHANGED|REQUEST_DENIED|UNSAFE_ID/.test(e.message)?e.message:'响应读取失败'));
      pending.add(task);task.finally(()=>pending.delete(task));
    });
    const settle=async()=>{await sleep(delay);await Promise.allSettled([...pending]);};
    await page.goto(target.profile_url,{waitUntil:'domcontentloaded',timeout:45000});await settle();
    for(let i=0;i<rounds && posts.size<maxPosts;i++){
      const blocked=await blockReason(page);if(blocked)return {rows:[],status:'blocked',coverage:'unknown',details:blocked};
      await page.mouse.wheel(0,1100);await settle();
    }
    if(!posts.size)return {rows:[],status:'unsupported',coverage:'unknown',details:errors[0]||'未观察到圈选账号的作品列表；可能为登录失效、页面结构变化或没有可访问作品，不推定无潜客'};
    const contentReports=[];
    for(const post of posts.values()){
      await page.goto(post.url,{waitUntil:'domcontentloaded',timeout:45000});await settle();
      if(target.platform==='douyin'){
        const button=page.locator('[data-e2e="comment-icon"], [data-e2e="video-comment-button"]').first();
        if(await button.isVisible().catch(()=>false)){await button.click();await settle();}
      }
      let blocked=null;
      for(let i=0;i<rounds;i++){
        blocked=await blockReason(page);if(blocked)break;
        if((comments.get(post.content_id)?.size||0)>=maxComments)break;
        await scrollComments(page,target.platform);await settle();
      }
      // Replies are read only when exposed by the normal page. Never replay hidden API requests.
      if(!blocked){
        const replies=page.getByText(/展开.{0,6}(条回复|回复)|查看.{0,6}回复/).all();
        for(const el of (await replies).slice(0,config.browser?.max_reply_clicks??5)){
          if((comments.get(post.content_id)?.size||0)>=maxComments)break;
          if(await el.isVisible().catch(()=>false)){await el.click({timeout:3000}).catch(()=>{});await settle();}
        }
      }
      contentReports.push({content_id:post.content_id,status:blocked?'blocked':batches.has(post.content_id)?'observed':'unsupported',comments_observed:comments.get(post.content_id)?.size||0,coverage:'limited',details:blocked||'页面可访问范围；数量与滚动上限生效，嵌套回复可能未全部展开'});
      if(blocked)break;
    }
    await Promise.allSettled([...pending]);
    const rows=[...comments.values()].flatMap(m=>[...m.values()]);
    const incomplete=contentReports.some(r=>r.status!=='observed')||errors.length>0;
    return {rows,status:incomplete?(rows.length?'partial':'unsupported'):'observed',coverage:'limited',details:errors[0]||'从正常浏览器页面响应中读取，未验证平台全量覆盖',content_reports:contentReports};
  }finally{await browser.close();}
}
