'use strict';
/** MyFit private Google Health bridge. Never expose Google OAuth tokens to the browser. */
const http = require('node:http');
const crypto = require('node:crypto');
const { Firestore, FieldValue } = require('@google-cloud/firestore');
const db = new Firestore();
const env = process.env;
const base = (env.MYFIT_BRIDGE_URL || '').replace(/\/+$/, '');
const allowedOrigin = 'https://amalficode.github.io';
const returnUrl = 'https://amalficode.github.io/myFit/';
const secret = env.GOOGLE_CLIENT_SECRET || '';
const client = env.GOOGLE_CLIENT_ID || '';
const apiKey = env.MYFIT_API_KEY || '';
const key = /^[a-f0-9]{64}$/i.test(env.MYFIT_ENCRYPTION_KEY || '') ? Buffer.from(env.MYFIT_ENCRYPTION_KEY, 'hex') : null;
const ready = base.startsWith('https://') && client && secret && key && apiKey.length >= 32;
const scopes = [
  'https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly',
  'https://www.googleapis.com/auth/googlehealth.sleep.readonly',
  'https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly'
];
const healthDoc = db.doc('private/health_connection');
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
function safeEqual(a,b){ const x=Buffer.from(a||''), y=Buffer.from(b||''); return x.length===y.length && crypto.timingSafeEqual(x,y); }
function seal(token){
  const iv=crypto.randomBytes(12), c=crypto.createCipheriv('aes-256-gcm',key,iv);
  return Buffer.concat([iv,c.update(token,'utf8'),c.final(),c.getAuthTag()]).toString('base64url');
}
function unseal(blob){
  const buf=Buffer.from(blob,'base64url'), iv=buf.subarray(0,12), authTag=buf.subarray(buf.length-16), body=buf.subarray(12,buf.length-16);
  const d=crypto.createDecipheriv('aes-256-gcm',key,iv); d.setAuthTag(authTag);
  return Buffer.concat([d.update(body),d.final()]).toString('utf8');
}
function respond(res,status,data){
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'});
  res.end(JSON.stringify(data));
}
function dateString(d){return d.toISOString().slice(0,10)}
function shift(s,n){const d=new Date(s+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return dateString(d)}
function civil(d){return d?.year&&d?.month&&d?.day ? [d.year,String(d.month).padStart(2,'0'),String(d.day).padStart(2,'0')].join('-') : null}
function asCivil(s){return {date:{year:Number(s.slice(0,4)),month:Number(s.slice(5,7)),day:Number(s.slice(8,10))}}}
function validNumber(n,min,max){const v=Number(n);return n!==null&&n!==undefined&&n!==''&&Number.isFinite(v)&&v>=min&&v<=max?v:null}
async function httpJson(url,opts={}){
 const res=await fetch(url,{...opts,signal:AbortSignal.timeout(20000)});
 let json={};try{json=await res.json()}catch{}
 if(!res.ok){const e=new Error('Google returned HTTP '+res.status);e.code=res.status===400&&json.error==='invalid_grant'?'AUTH':res.status===401||res.status===403?'AUTH':'UPSTREAM';throw e}
 return json;
}
async function googleToken(){
 const snap=await healthDoc.get();const refresh=snap.data()?.refresh;
 if(!refresh){const err=new Error('Not connected');err.code='NOT_CONNECTED';throw err}
 const body=new URLSearchParams({client_id:client,client_secret:secret,refresh_token:unseal(refresh),grant_type:'refresh_token'});
 const tok=await httpJson('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});
 return tok.access_token;
}
async function listData(token,type,filter){
 const output=[];let page='';
 for(let i=0;i<8;i++){
   const u=new URL('https://health.googleapis.com/v4/users/me/dataTypes/'+type+'/dataPoints');
   u.searchParams.set('filter',filter);u.searchParams.set('pageSize','25');
   u.searchParams.set('dataSourceFamily','users/me/dataSourceFamilies/google-wearables');
   if(page)u.searchParams.set('pageToken',page);
   const data=await httpJson(u,{headers:{Authorization:'Bearer '+token}});
   output.push(...(data.dataPoints||[]));page=data.nextPageToken||'';
   if(!page)break;
 }
 return output;
}
async function stepsData(token,start,end){
 const data=await httpJson('https://health.googleapis.com/v4/users/me/dataTypes/steps/dataPoints:dailyRollUp',{
  method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
  body:JSON.stringify({range:{start:asCivil(start),end:asCivil(end)},windowSizeDays:1,dataSourceFamily:'users/me/dataSourceFamilies/google-wearables'})
 });
 return data.rollupDataPoints||[];
}
function sleepWakeDate(data){
 const i=data.sleep?.interval;
 if(i?.civilEndTime?.date)return civil(i.civilEndTime.date);
 if(!i?.endTime)return null;
 const ms=new Date(i.endTime).getTime()+Number((i.endUtcOffset||'0s').replace('s',''))*1000;
 return Number.isFinite(ms)?dateString(new Date(ms)):null;
}
async function syncHealth(){
 const token=await googleToken();
 const end=shift(dateString(new Date()),1),start=shift(end,-16),merged=new Map();
 const put=(date,field,value)=>{
   if(date && date>=start && date<end && value!==null){const old=merged.get(date)||{date};old[field]=value;merged.set(date,old)}
 };
 const steps=await stepsData(token,start,end);
 for(const row of steps)put(civil(row.civilStartTime?.date),'steps',validNumber(row.steps?.countSum,0,150000));
 const sleepFilter='sleep.interval.civil_end_time >= "'+start+'" AND sleep.interval.civil_end_time < "'+end+'"';
 const sleeps=await listData(token,'sleep',sleepFilter);
 const mainSleep=new Map();
 for(const row of sleeps){
   const day=sleepWakeDate(row),minutes=validNumber(row.sleep?.summary?.minutesAsleep,0,1440);
   if(!day||minutes===null)continue;
   const main=row.sleep?.metadata?.mainSleep===true,old=mainSleep.get(day);
   if(!old || (main&&!old.main) || (main===old.main&&minutes>old.minutes))mainSleep.set(day,{minutes,main});
 }
 for(const [day,s] of mainSleep)put(day,'sleepHours',Math.round(s.minutes/6)/10);
 // Optional metrics: if unavailable on the wearable, do not invent values.
 for(const metric of [
   {type:'daily-resting-heart-rate',name:'dailyRestingHeartRate',field:'restingHr',get:x=>validNumber(x?.beatsPerMinute,30,180)},
   {type:'daily-heart-rate-variability',name:'dailyHeartRateVariability',field:'hrv',get:x=>validNumber(x?.averageHeartRateVariabilityMilliseconds,1,300)}
 ]){
   try{
     const filter=metric.name+'.date >= "'+start+'" AND '+metric.name+'.date < "'+end+'"';
     const records=await listData(token,metric.type,filter);
     for(const record of records){const x=record[metric.name];put(civil(x?.date),metric.field,metric.get(x))}
   }catch(e){if(e.code==='AUTH')throw e}
 }
 const batch=db.batch();
 for(const [day,value] of merged)batch.set(db.doc('health_daily/'+day),{...value,updatedAt:new Date().toISOString()},{merge:true});
 batch.set(healthDoc,{lastSync:new Date().toISOString()},{merge:true});await batch.commit();
 return merged.size;
}
async function dailyData(){
 const start=shift(dateString(new Date()),-22);
 const snaps=await db.collection('health_daily').where('date','>=',start).orderBy('date').limit(40).get();
 return snaps.docs.map(x=>{const r=x.data();return {date:r.date,steps:r.steps??null,sleepHours:r.sleepHours??null,restingHr:r.restingHr??null,hrv:r.hrv??null}});
}
async function oauthCallback(res,requestUrl){
 const code=requestUrl.searchParams.get('code'),state=requestUrl.searchParams.get('state')||'';
 if(!code||!/^[a-f0-9]{64}$/.test(state))return respond(res,400,{error:'Invalid OAuth response'});
 const pending=db.doc('oauth_states/'+sha(state)),r=await pending.get();
 if(!r.exists||r.data().expires<Date.now())return respond(res,400,{error:'Expired login request'});
 await pending.delete(); // Single-use state.
 const form=new URLSearchParams({code,client_id:client,client_secret:secret,redirect_uri:base+'/oauth/callback',grant_type:'authorization_code'});
 const tokens=await httpJson('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:form});
 if(!tokens.refresh_token)return respond(res,409,{error:'REFRESH_TOKEN_MISSING'});
 const identity=await fetch('https://health.googleapis.com/v4/users/me/identity',{headers:{Authorization:'Bearer '+tokens.access_token},signal:AbortSignal.timeout(20000)});
 if(!identity.ok)return respond(res,403,{error:'GOOGLE_HEALTH_NOT_LINKED'});
 await healthDoc.set({refresh:seal(tokens.refresh_token),connectedAt:new Date().toISOString()},{merge:true});
 res.writeHead(302,{'Location':returnUrl+'#google-health-connected','Cache-Control':'no-store','Referrer-Policy':'no-referrer'});res.end();
}
const server=http.createServer(async(req,res)=>{
 try{
  res.setHeader('X-Frame-Options','DENY');
  const u=new URL(req.url||'/','http://localhost');
  if(u.pathname==='/health'&&req.method==='GET')return respond(res,200,{ok:true,configured:!!ready});
  if(!ready)return respond(res,503,{error:'CONFIG_REQUIRED'});
  if(u.pathname==='/oauth/callback'&&req.method==='GET')return await oauthCallback(res,u);
  if(req.headers.origin && req.headers.origin!==allowedOrigin)return respond(res,403,{error:'ORIGIN_DENIED'});
  if(req.headers.origin){res.setHeader('Access-Control-Allow-Origin',allowedOrigin);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Headers','Authorization,Content-Type');res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS')}
  if(req.method==='OPTIONS'){res.writeHead(204);return res.end()}
  if(!safeEqual((req.headers.authorization||'').replace(/^Bearer /i,''),apiKey))return respond(res,401,{error:'BAD_KEY'});
  if(u.pathname==='/api/status'&&req.method==='GET'){
    const r=(await healthDoc.get()).data();return respond(res,200,{connected:!!r?.refresh,lastSync:r?.lastSync||null});
  }
  if(u.pathname==='/auth/start'&&req.method==='POST'){
    const state=crypto.randomBytes(32).toString('hex');
    await db.doc('oauth_states/'+sha(state)).set({expires:Date.now()+600000});
    const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');
    Object.entries({client_id:client,redirect_uri:base+'/oauth/callback',response_type:'code',scope:scopes.join(' '),access_type:'offline',prompt:'consent',state}).forEach(([k,v])=>url.searchParams.set(k,v));
    return respond(res,200,{url:String(url)});
  }
  if(u.pathname==='/api/daily'&&req.method==='GET'){
    const r=(await healthDoc.get()).data();if(!r?.refresh)return respond(res,409,{error:'NOT_CONNECTED'});
    let warning=null;
    if(Date.now()-new Date(r.lastSync||0).getTime()>6*3600000 || u.searchParams.get('refresh')==='1'){
      try{await syncHealth()}catch(e){warning=e.code==='AUTH'?'RECONNECT_REQUIRED':'SYNC_FAILED'}
    }
    const latest=(await healthDoc.get()).data();return respond(res,200,{data:await dailyData(),lastSync:latest?.lastSync||null,warning});
  }
  if(u.pathname==='/api/disconnect'&&req.method==='POST'){
    await healthDoc.update({refresh:FieldValue.delete(),lastSync:FieldValue.delete()});return respond(res,200,{connected:false});
  }
  return respond(res,404,{error:'NOT_FOUND'});
 }catch(e){return respond(res,e.code==='NOT_CONNECTED'?409:e.code==='AUTH'?401:500,{error:e.code==='AUTH'?'RECONNECT_REQUIRED':e.code==='NOT_CONNECTED'?'NOT_CONNECTED':'SERVER_ERROR'})}
});
server.listen(Number(env.PORT||8080),'0.0.0.0');