import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { id, readDb, mutate, getProject, getProjectBySlug, getProjectBySubdomain, storeMode, pingStore } from './lib/store.mjs';
import { verifyTelegramInitData, tgApi, createStarsInvoice, sendBotStart } from './lib/telegram.mjs';
import { generateConcepts, buildStory, reviseStory } from './lib/ai.mjs';
import { PLAN, paymentRequirement, isPaid, canBuild, canFinalize } from './lib/payments.mjs';
import { putMedia, storageMode, localUploadPath } from './lib/storage.mjs';
import { validateMediaUpload } from './lib/limits.mjs';
import { allowRate } from './lib/rate-limit.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
await loadEnv(path.join(ROOT,'.env'));
const PORT = Number(process.env.PORT || 8787);
const APP_URL = process.env.APP_URL || `http://localhost:${PORT}`;
const BASE_DOMAIN = process.env.BASE_DOMAIN || 'emora.uz';
const DEMO_MODE = String(process.env.DEMO_MODE || 'true') === 'true';
const UPLOAD_DIR = path.join(ROOT,'data','uploads');
await fs.mkdir(UPLOAD_DIR,{recursive:true});

async function loadEnv(file){
  try {
    const text=await fs.readFile(file,'utf8');
    for(const line of text.split(/\r?\n/)){
      const s=line.trim(); if(!s||s.startsWith('#')||!s.includes('=')) continue;
      const i=s.indexOf('='); const k=s.slice(0,i).trim(); let v=s.slice(i+1).trim();
      if((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'"))) v=v.slice(1,-1);
      if(process.env[k]===undefined) process.env[k]=v;
    }
  } catch {}
}

const MIME = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.mp3':'audio/mpeg','.m4a':'audio/mp4','.mp4':'video/mp4','.webm':'video/webm','.ico':'image/x-icon'};

function send(res,status,body,headers={}){
  const baseHeaders={
    'cache-control':'no-store',
    'x-content-type-options':'nosniff',
    'referrer-policy':'strict-origin-when-cross-origin',
    'permissions-policy':'camera=(), microphone=(), geolocation=()',
    'x-frame-options':'SAMEORIGIN',
    'cross-origin-opener-policy':'same-origin-allow-popups',
    ...headers
  };
  res.writeHead(status,baseHeaders); res.end(body);
}
function json(res,status,obj){ send(res,status,JSON.stringify(obj),{'content-type':'application/json; charset=utf-8'}); }
function err(res,status,message,code='ERROR'){ json(res,status,{ok:false,error:{code,message}}); }
function ok(res,data={}){ json(res,200,{ok:true,...data}); }

async function parseJson(req,max=16*1024*1024){
  let total=0; const chunks=[];
  for await (const ch of req){ total += ch.length; if(total>max) throw Object.assign(new Error('Request too large'),{status:413}); chunks.push(ch); }
  if(!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw Object.assign(new Error('Invalid JSON'),{status:400}); }
}
function slugify(s){
  return String(s||'emotion').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,40)||'emotion';
}
function randomSlug(){ return crypto.randomBytes(7).toString('base64url').replace(/[_-]/g,'').slice(0,9); }
function publicProject(p){
  return { id:p.id, recipientName:p.recipientName, plan:p.plan, status:p.status, story:p.story, slug:p.slug, customSubdomain:p.customSubdomain, publishedAt:p.publishedAt, brand:p.brand||'EMORA' };
}

async function auth(req){
  const initData = req.headers['x-telegram-init-data'];
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const verified = verifyTelegramInitData(initData, token);
  let externalId, firstName, username, source;
  if(verified?.user){ externalId=`tg:${verified.user.id}`; firstName=verified.user.first_name||'User'; username=verified.user.username||null; source='telegram'; }
  else if(DEMO_MODE){ externalId=`demo:${req.headers['x-demo-user']||'owner'}`; firstName='Demo User'; username=null; source='demo'; }
  else return null;
  return mutate(db=>{
    let u=db.users.find(x=>x.externalId===externalId);
    if(!u){ u={id:id('usr'),externalId,firstName,username,source,createdAt:new Date().toISOString()}; db.users.push(u); }
    return u;
  });
}

function own(project,user){ return project && user && project.ownerId===user.id; }
function lockedGuard(project){ if(project.lockedAt) throw Object.assign(new Error('Project finalized and locked. Duplicate it to make new changes.'),{status:409,code:'PROJECT_LOCKED'}); }
function paidStageForStart(plan){ return plan==='SIGNATURE'?'activation':'full'; }

async function uploadDataUrl(project, body){
  const m=String(body.dataUrl||'').match(/^data:([\w/+.-]+);base64,(.+)$/s); if(!m) throw Object.assign(new Error('Invalid data URL'),{status:400});
  const mime=m[1], data=Buffer.from(m[2],'base64');
  const kind=mime.startsWith('image/')?'image':mime.startsWith('video/')?'video':mime.startsWith('audio/')?'audio':'file';
  const allowedRoles = new Set(['content','voice','music']);
  const role = allowedRoles.has(String(body.role||'')) ? String(body.role) : (kind==='audio' ? 'voice' : 'content');
  const validation=validateMediaUpload(project,{kind,role,size:data.length,mime});
  if(validation) throw Object.assign(new Error(validation),{status:413,code:'MEDIA_LIMIT'});
  const mediaId=id('med');
  const stored=await putMedia({projectId:project.id,mime,data,name:body.name});
  return {id:mediaId,projectId:project.id,kind,role,mime,name:String(body.name||stored.storageKey||'upload').slice(0,120),size:data.length,url:stored.url,storageKey:stored.key,storageBackend:stored.backend,createdAt:new Date().toISOString()};
}

async function handleApi(req,res,url){
  if(url.pathname==='/api/health'){ try{await pingStore(); return ok(res,{service:'emora',version:'1.0.0',demo:DEMO_MODE,store:storeMode(),storage:storageMode(),time:new Date().toISOString()});}catch(e){return err(res,503,'Storage/database unavailable','NOT_READY');} }
  if(url.pathname==='/api/config') return ok(res,{appUrl:APP_URL,baseDomain:BASE_DOMAIN,demoMode:DEMO_MODE,plans:PLAN,telegramEnabled:!!process.env.TELEGRAM_BOT_TOKEN,openaiEnabled:!!process.env.OPENAI_API_KEY,store:storeMode(),storage:storageMode()});

  if(url.pathname==='/api/admin/overview' && req.method==='GET'){
    const token=req.headers['x-admin-token'];
    const expectedAdmin=process.env.ADMIN_TOKEN || (DEMO_MODE?'change-me':'');
    if(!expectedAdmin || token!==expectedAdmin) return err(res,401,'Invalid admin token');
    const db=await readDb();
    const paid=db.projects.flatMap(p=>(p.payments||[]).filter(x=>x.status==='PAID').map(x=>({...x,plan:p.plan,projectId:p.id})));
    const revenueUzs=paid.reduce((n,x)=>n+(Number(x.amountUzs)||0),0);
    const revenueStars=paid.reduce((n,x)=>n+(Number(x.amountStars)||0),0);
    const byPlan=Object.fromEntries(Object.keys(PLAN).map(k=>[k,db.projects.filter(p=>p.plan===k).length]));
    return ok(res,{overview:{users:db.users.length,projects:db.projects.length,published:db.projects.filter(p=>p.publishedAt).length,revenueUzs,revenueStars,events:db.events.length,responses:db.responses.length,byPlan},projects:db.projects.map(p=>({id:p.id,recipientName:p.recipientName,plan:p.plan,status:p.status,createdAt:p.createdAt,publishedAt:p.publishedAt,revisionsUsed:p.revisionsUsed,revisionsLimit:p.revisionsLimit}))});
  }

  if(url.pathname==='/api/telegram/webhook' && req.method==='POST'){
    const secret=process.env.TELEGRAM_WEBHOOK_SECRET;
    if(secret && req.headers['x-telegram-bot-api-secret-token']!==secret) return err(res,403,'Invalid webhook secret');
    const update=await parseJson(req,2*1024*1024);
    const token=process.env.TELEGRAM_BOT_TOKEN;
    try{
      if(update.message?.text?.startsWith('/start')) await sendBotStart({token,chatId:update.message.chat.id,appUrl:APP_URL});
      if(update.pre_checkout_query) await tgApi(token,'answerPreCheckoutQuery',{pre_checkout_query_id:update.pre_checkout_query.id,ok:true});
      const sp=update.message?.successful_payment;
      if(sp?.invoice_payload){
        const [tag,projectId,stage]=sp.invoice_payload.split(':');
        if(tag==='emora') await mutate(db=>{
          const p=db.projects.find(x=>x.id===projectId); if(!p) return;
          p.payments ||= [];
          if(!p.payments.some(x=>x.telegramChargeId===sp.telegram_payment_charge_id)) p.payments.push({id:id('pay'),stage,status:'PAID',method:'TELEGRAM_STARS',amountStars:sp.total_amount,telegramChargeId:sp.telegram_payment_charge_id,paidAt:new Date().toISOString()});
          if(p.plan==='SIGNATURE'&&stage==='activation'&&p.status==='PAYMENT_REQUIRED') p.status='BRIEF_READY';
          if(p.plan!=='SIGNATURE'&&stage==='full'&&p.status==='PAYMENT_REQUIRED') p.status='BRIEF_READY';
          if(p.plan==='SIGNATURE'&&stage==='final') p.status='READY_TO_FINISH';
        });
      }
    }catch(e){ console.error('telegram webhook',e); }
    return ok(res);
  }

  const pubMatch=url.pathname.match(/^\/api\/public\/emotion\/([^/]+)$/);
  if(pubMatch && req.method==='GET'){
    const p=await getProjectBySlug(pubMatch[1]); if(!p) return err(res,404,'Emotion not found');
    return ok(res,{project:publicProject(p)});
  }
  const pubSubMatch=url.pathname.match(/^\/api\/public\/subdomain\/([^/]+)$/);
  if(pubSubMatch && req.method==='GET'){
    const p=await getProjectBySubdomain(pubSubMatch[1]); if(!p) return err(res,404,'Emotion not found'); return ok(res,{project:publicProject(p)});
  }
  if(url.pathname==='/api/public/event' && req.method==='POST'){
    const ip=String(req.headers['x-forwarded-for']||req.socket.remoteAddress||'anon').split(',')[0].trim(); if(!allowRate(`evt:${ip}`,{limit:120,windowMs:60_000})) return err(res,429,'Too many events','RATE_LIMIT');
    const b=await parseJson(req,256*1024); if(!b.projectId||!b.type) return err(res,400,'projectId and type required');
    await mutate(db=>db.events.push({id:id('evt'),projectId:b.projectId,type:String(b.type).slice(0,40),meta:b.meta||{},createdAt:new Date().toISOString()})); return ok(res);
  }
  if(url.pathname==='/api/public/response' && req.method==='POST'){
    const ip=String(req.headers['x-forwarded-for']||req.socket.remoteAddress||'anon').split(',')[0].trim(); if(!allowRate(`rsp:${ip}`,{limit:10,windowMs:60_000})) return err(res,429,'Too many responses','RATE_LIMIT');
    const b=await parseJson(req,512*1024); const p=await getProject(b.projectId); if(!p?.publishedAt) return err(res,404,'Project not found');
    const response={id:id('rsp'),projectId:p.id,type:b.type||'text',text:String(b.text||'').slice(0,2000),createdAt:new Date().toISOString()}; await mutate(db=>db.responses.push(response)); return ok(res,{response});
  }

  const user=await auth(req); if(!user) return err(res,401,'Open inside Telegram or enable DEMO_MODE');
  if(url.pathname==='/api/me' && req.method==='GET') return ok(res,{user});
  if(url.pathname==='/api/projects' && req.method==='GET'){
    const db=await readDb(); const projects=db.projects.filter(p=>p.ownerId===user.id).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)); return ok(res,{projects});
  }
  if(url.pathname==='/api/projects' && req.method==='POST'){
    const b=await parseJson(req); const plan=String(b.plan||'STANDARD').toUpperCase(); if(!PLAN[plan]) return err(res,400,'Invalid plan');
    const recipientName=String(b.recipientName||'').trim().slice(0,80); if(!recipientName) return err(res,400,'Recipient name required');
    const project={id:id('prj'),ownerId:user.id,recipientName,plan,status:'PAYMENT_REQUIRED',brief:b.brief||{},concepts:[],selectedConceptId:null,story:null,media:[],revisionsUsed:0,revisionsLimit:PLAN[plan].revisions,payments:[],version:1,lockedAt:null,finalizedAt:null,publishedAt:null,slug:null,customSubdomain:null,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
    await mutate(db=>db.projects.push(project)); return ok(res,{project,payment:paymentRequirement(project,paidStageForStart(plan))});
  }

  const m=url.pathname.match(/^\/api\/projects\/([^/]+)(?:\/(.*))?$/); if(!m) return err(res,404,'API route not found');
  const projectId=m[1], action=m[2]||''; let project=await getProject(projectId); if(!own(project,user)) return err(res,404,'Project not found');

  if(!action && req.method==='GET'){
    const db=await readDb(); const events=db.events.filter(e=>e.projectId===projectId); const responses=db.responses.filter(e=>e.projectId===projectId); return ok(res,{project,analytics:{events,responses}});
  }
  if(action==='brief' && req.method==='PATCH'){
    lockedGuard(project); const b=await parseJson(req); await mutate(db=>{const p=db.projects.find(x=>x.id===projectId); p.brief={...p.brief,...b}; p.updatedAt=new Date().toISOString();}); project=await getProject(projectId); return ok(res,{project});
  }
  if(action==='media' && req.method==='POST'){
    lockedGuard(project); const b=await parseJson(req); const media=await uploadDataUrl(project,b); await mutate(db=>{db.media.push(media); const p=db.projects.find(x=>x.id===projectId); p.media.push(media); p.updatedAt=new Date().toISOString();}); return ok(res,{media});
  }
  if(action==='payment' && req.method==='GET'){
    const stage=url.searchParams.get('stage')||paidStageForStart(project.plan); return ok(res,{requirement:paymentRequirement(project,stage),paid:isPaid(project,stage)});
  }
  if(action==='payments/stars' && req.method==='POST'){
    const b=await parseJson(req); const stage=b.stage||paidStageForStart(project.plan); const r=paymentRequirement(project,stage);
    if(isPaid(project,stage)) return ok(res,{paid:true});
    if(!process.env.TELEGRAM_BOT_TOKEN) return err(res,503,'Telegram Bot token not configured');
    const link=await createStarsInvoice({token:process.env.TELEGRAM_BOT_TOKEN,title:r.title,description:`${project.recipientName} uchun EMORA ${project.plan}`,payload:`emora:${project.id}:${stage}`,stars:r.stars});
    return ok(res,{invoiceLink:link,requirement:r});
  }
  if(action==='payments/demo' && req.method==='POST'){
    if(!DEMO_MODE) return err(res,403,'Demo payment disabled'); const b=await parseJson(req); const stage=b.stage||paidStageForStart(project.plan); const r=paymentRequirement(project,stage);
    await mutate(db=>{const p=db.projects.find(x=>x.id===projectId); p.payments ||= []; if(!p.payments.some(x=>x.stage===stage&&x.status==='PAID')) p.payments.push({id:id('pay'),stage,status:'PAID',method:'DEMO',amountUzs:r.uzs,amountStars:r.stars,paidAt:new Date().toISOString()}); p.status=(stage==='final')?'READY_TO_FINISH':'BRIEF_READY'; p.updatedAt=new Date().toISOString();});
    return ok(res,{paid:true,requirement:r,project:await getProject(projectId)});
  }
  if(action==='concepts/generate' && req.method==='POST'){
    if(!allowRate(`ai:${user.id}`,{limit:20,windowMs:60*60_000})) return err(res,429,'AI generation limit reached','RATE_LIMIT');
    lockedGuard(project); if(!canBuild(project)) return err(res,402,'Payment required before generation','PAYMENT_REQUIRED');
    const concepts=project.plan==='STANDARD' ? [{id:'soft-romantic',name:'EMORA Classic',summary:'Tayyor premium shablon.',mood:'soft · clean',palette:{bg:'#fff8fb',ink:'#18294a',accent:'#ff9fbd',secondary:'#dceeff'}}] : await generateConcepts(project);
    await mutate(db=>{const p=db.projects.find(x=>x.id===projectId);p.concepts=concepts;p.status='CONCEPTS_READY';p.updatedAt=new Date().toISOString();}); return ok(res,{concepts,project:await getProject(projectId)});
  }
  if(action==='concept/select' && req.method==='POST'){
    lockedGuard(project); const b=await parseJson(req); const c=project.concepts.find(x=>x.id===b.conceptId); if(!c) return err(res,400,'Concept not found'); await mutate(db=>{const p=db.projects.find(x=>x.id===projectId);p.selectedConceptId=c.id;p.status='CONCEPT_SELECTED';p.updatedAt=new Date().toISOString();}); return ok(res,{project:await getProject(projectId)});
  }
  if(action==='build' && req.method==='POST'){
    if(!allowRate(`ai:${user.id}`,{limit:20,windowMs:60*60_000})) return err(res,429,'AI generation limit reached','RATE_LIMIT');
    lockedGuard(project); if(!canBuild(project)) return err(res,402,'Payment required before build','PAYMENT_REQUIRED'); const concept=project.concepts.find(x=>x.id===project.selectedConceptId)||project.concepts[0]; if(!concept) return err(res,409,'Generate and select a concept first');
    const story=await buildStory(project,concept); await mutate(db=>{const p=db.projects.find(x=>x.id===projectId);p.story=story;p.status='PREVIEW';p.version=(p.version||0)+1;p.updatedAt=new Date().toISOString();}); return ok(res,{project:await getProject(projectId)});
  }
  if(action==='revise' && req.method==='POST'){
    if(!allowRate(`ai:${user.id}`,{limit:20,windowMs:60*60_000})) return err(res,429,'AI generation limit reached','RATE_LIMIT');
    lockedGuard(project); if(!project.story) return err(res,409,'Build preview first'); if(project.revisionsUsed>=project.revisionsLimit) return err(res,409,'Revision limit reached','REVISION_LIMIT'); const b=await parseJson(req); const instruction=String(b.instruction||'').trim().slice(0,1500); if(!instruction) return err(res,400,'Instruction required');
    const story=await reviseStory(project,instruction); await mutate(db=>{const p=db.projects.find(x=>x.id===projectId);p.story=story;p.revisionsUsed++;p.status='PREVIEW';p.version++;p.updatedAt=new Date().toISOString();p.revisionHistory||=[];p.revisionHistory.push({instruction,at:new Date().toISOString()});}); return ok(res,{project:await getProject(projectId)});
  }
  if(action==='finish' && req.method==='POST'){
    lockedGuard(project); if(!project.story) return err(res,409,'Preview required'); if(project.plan==='SIGNATURE'&&!isPaid(project,'final')) return err(res,402,'Signature final payment required','FINAL_PAYMENT_REQUIRED'); if(!canFinalize(project)) return err(res,402,'Payment required','PAYMENT_REQUIRED');
    const now=new Date().toISOString(); const db=await readDb(); const base=slugify(project.recipientName); let slug=randomSlug(); let sub=null;
    if(project.plan==='PRO_AI') slug=`${base}-${randomSlug().slice(0,4)}`;
    if(project.plan==='SIGNATURE'){ sub=base; let n=2; while(db.projects.some(p=>p.id!==project.id&&p.customSubdomain===sub)) sub=`${base}${n++}`; slug=`${base}-${randomSlug().slice(0,4)}`; }
    await mutate(db2=>{const p=db2.projects.find(x=>x.id===projectId);p.lockedAt=now;p.finalizedAt=now;p.publishedAt=now;p.status='PUBLISHED';p.slug=slug;p.customSubdomain=sub;p.finalVersion=p.version;p.updatedAt=now;}); return ok(res,{project:await getProject(projectId)});
  }
  if(action==='duplicate' && req.method==='POST'){
    const now=new Date().toISOString(); const copy={...structuredClone(project),id:id('prj'),sourceProjectId:project.id,status:'PAYMENT_REQUIRED',payments:[],lockedAt:null,finalizedAt:null,publishedAt:null,slug:null,customSubdomain:null,revisionsUsed:0,createdAt:now,updatedAt:now,version:1};
    await mutate(db=>db.projects.push(copy)); return ok(res,{project:copy,payment:paymentRequirement(copy,paidStageForStart(copy.plan))});
  }
  if(action==='analytics' && req.method==='GET'){
    const db=await readDb(); const events=db.events.filter(e=>e.projectId===projectId); const responses=db.responses.filter(e=>e.projectId===projectId); const opens=events.filter(e=>e.type==='open').length; const completes=events.filter(e=>e.type==='complete').length; return ok(res,{analytics:{opens,completes,events,responses}});
  }
  return err(res,404,'Project action not found');
}

async function serveStatic(req,res,url){
  if(url.pathname.startsWith('/uploads/')){
    const f=localUploadPath(url.pathname); if(!f) return err(res,404,'File not found'); try{const data=await fs.readFile(f); return send(res,200,data,{'content-type':MIME[path.extname(f)]||'application/octet-stream','cache-control':'public, max-age=31536000, immutable'});}catch{return err(res,404,'File not found');}
  }
  const host=(req.headers.host||'').split(':')[0].toLowerCase();
  if(host.endsWith(`.${BASE_DOMAIN}`)){
    const sub=host.slice(0,-(`.${BASE_DOMAIN}`).length); if(sub&&sub!=='www'&&sub!=='app'){
      const p=await getProjectBySubdomain(sub); if(p) return serveFile(res,path.join(ROOT,'public','index.html'));
    }
  }
  const candidate=path.join(ROOT,'public',url.pathname==='/'?'index.html':url.pathname.replace(/^\//,''));
  try{const st=await fs.stat(candidate); if(st.isFile()) return serveFile(res,candidate);}catch{}
  return serveFile(res,path.join(ROOT,'public','index.html'));
}
async function serveFile(res,file){
  try{const data=await fs.readFile(file); return send(res,200,data,{'content-type':MIME[path.extname(file)]||'application/octet-stream','cache-control':path.extname(file)==='.html'?'no-store':'public, max-age=3600'});}catch{return err(res,404,'Not found');}
}

const server=http.createServer(async (req,res)=>{
  const url=new URL(req.url,APP_URL);
  try{
    if(url.pathname.startsWith('/api/')) return await handleApi(req,res,url);
    return await serveStatic(req,res,url);
  }catch(e){ console.error(e); return err(res,e.status||500,e.message||'Internal error',e.code||'ERROR'); }
});
server.listen(PORT,()=>console.log(`EMORA running on ${APP_URL}`));
