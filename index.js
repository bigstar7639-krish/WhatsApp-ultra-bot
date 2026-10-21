import makeWASocket,{useMultiFileAuthState,DisconnectReason,fetchLatestBaileysVersion,Browsers,makeCacheableSignalKeyStore,delay}from'baileys';import express from'express';import pino from'pino';import fs from'fs';import QRCode from'qrcode';import sharp from'sharp';
const app=express();
const PORT=process.env.PORT||8000;
const MY_NUMBER="918870799204";
let CODE=null,QR=null,STATUS="V33.4 FINAL ONLINE FIX",IS_CONNECTED=false,IS_PAUSED=false,PAUSE_UNTIL=null,groqClient=null,CURRENT_SOCK=null;
const IDENTITY="You are @obito - Personal assistant for Krishna's circle. You help with support, bookings, reminders, tasks, friendly chat. You are NOT a general-purpose AI distribution. You are a private assistant created by Krishna for friends and family. Keep replies concise, helpful, task-focused. Auto detect language Tamil Hindi English Malayalam Telugu Kannada Bengali Marathi Gujarati Urdu Punjabi Odia Assamese Bhojpuri Spanish French German Arabic Russian Japanese Korean Chinese ALL and reply same language. If asked who are you say I am @obito personal assistant created by Krishna for this circle. If asked who made you say Created by Krishna.";
if(process.env.GROQ_API_KEY){const{default:Groq}=await import('groq-sdk');groqClient=new Groq({apiKey:process.env.GROQ_API_KEY});console.log("✅ Groq ready");}else{console.log("⚠️ GROQ_API_KEY missing");}
async function getCodeAllWays(sock){
for(let i=0;i<6;i++){try{if(i>0)await delay(i*2000);CODE=await sock.requestPairingCode(MY_NUMBER);if(CODE){const fmt=CODE.slice(0,4)+"-"+CODE.slice(4);STATUS="✅ BIG CODE "+CODE+" ("+fmt+")";console.log(STATUS);return CODE;}}catch(e){console.log("Pair try "+i+" fail "+e.message);}}
return null;
}
async function start(){
if(IS_PAUSED&&PAUSE_UNTIL&&new Date()>PAUSE_UNTIL){IS_PAUSED=false;PAUSE_UNTIL=null;}
if(IS_PAUSED)return;
let version;try{version=(await fetchLatestBaileysVersion()).version;}catch{version=[2,3000,1015901307];}
const{state,saveCreds}=await useMultiFileAuthState('./auth');
const sock=makeWASocket({version,logger:pino({level:'silent'}),printQRInTerminal:false,auth:{creds:state.creds,keys:makeCacheableSignalKeyStore(state.keys,pino({level:'silent'}))},browser:Browsers.macOS('Desktop'),markOnlineOnConnect:true,syncFullHistory:false,connectTimeoutMs:60000,keepAliveIntervalMs:10000,retryRequestDelayMs:2000});
CURRENT_SOCK=sock;
sock.ev.on('connection.update',async a=>{
const{connection,lastDisconnect,qr}=a;
if(connection==='connecting'&&!state.creds.registered){await delay(2500);await getCodeAllWays(sock);}
if(qr){QR=await QRCode.toDataURL(qr);STATUS="QR Ready | "+(CODE||"Gen");console.log(STATUS);}
if(connection==='open'){
IS_CONNECTED=true;CODE=null;QR=null;STATUS="✅ CONNECTED "+MY_NUMBER+" FINAL";console.log(STATUS);
// FINAL FIX: Force online presence every 25 sec
setInterval(async()=>{try{if(CURRENT_SOCK){await CURRENT_SOCK.sendPresenceUpdate('available');console.log("💚 Presence: available");}}catch(e){}},25000);
// Also mark chat as available when message comes
setInterval(async()=>{try{if(CURRENT_SOCK&&IS_CONNECTED){await CURRENT_SOCK.sendPresenceUpdate('available');}}catch(e){}},8*60*1000);
}
if(connection==='close'){const r=lastDisconnect?.error?.output?.statusCode;IS_CONNECTED=false;CODE=null;QR=null;if(r===DisconnectReason.loggedOut){try{fs.rmSync('./auth',{recursive:true,force:true});}catch{}}await delay(4000);start();}
});
sock.ev.on('creds.update',saveCreds);
sock.ev.on('messages.upsert',async({messages})=>{
const m=messages[0];if(!m?.message||m.key.fromMe)return;
const jid=m.key.remoteJid;
const isGroup=jid.endsWith('@g.us');
const senderName=m.pushName||"friend";
let txt=(m.message.conversation||m.message.extendedTextMessage?.text||m.message.imageMessage?.caption||m.message.videoMessage?.caption||"").trim();
console.log("📩 "+senderName+": "+txt.slice(0,100));
if(txt.toLowerCase()==='/start'){IS_PAUSED=false;PAUSE_UNTIL=null;await delay(800);await sock.sendMessage(jid,{text:"⚡ @obito activated! Krishna's assistant ⚡"});return;}
if(txt.toLowerCase()==='/stop'){IS_PAUSED=true;PAUSE_UNTIL=new Date(Date.now()+5*60*1000);await delay(800);await sock.sendMessage(jid,{text:"⏸️ Paused 5 min"});setTimeout(()=>{IS_PAUSED=false;PAUSE_UNTIL=null;},5*60*1000);return;}
if(IS_PAUSED)return;
if(isGroup&&!txt.toLowerCase().includes('obito')&&Math.random()>0.30)return;
if(!txt&&m.message.imageMessage){try{const{downloadMediaMessage}=await import('baileys');const buf=await downloadMediaMessage(m,'buffer',{},{logger:pino({level:'silent'}),reuploadRequest:sock.updateMediaMessage});const webp=await sharp(buf).resize(512,512).webp().toBuffer();await delay(1500);await sock.sendMessage(jid,{sticker:webp});}catch(e){console.log(e.message);}return;}
if(txt){
if(!groqClient){await sock.sendMessage(jid,{text:"⚠️ GROQ_API_KEY missing! Render Env la add pannu da!"});return;}
try{
await sock.sendPresenceUpdate('composing',{},{jid}); // Typing...
await delay(1500+Math.random()*1000);
const r=await groqClient.chat.completions.create({model:"llama3-8b-8192",messages:[{role:"system",content:IDENTITY},{role:"user",content:senderName+": "+txt}],temperature:0.7,max_tokens:600});
const rep=r.choices[0]?.message?.content;
await sock.sendPresenceUpdate('paused',{},{jid});
if(rep){await sock.sendMessage(jid,{text:rep});console.log("✅ Replied");}
}catch(e){console.log("❌ Error: "+e.message);await sock.sendMessage(jid,{text:"⚡ Error: "+e.message});}
}
});
}
app.get('/',(req,res)=>{
const paused=IS_PAUSED?"<h1 style='background:orange;color:white;padding:15px;border-radius:12px;'>PAUSED till "+PAUSE_UNTIL?.toLocaleTimeString()+"</h1>":"";
const fmt=CODE?CODE.slice(0,4)+"-"+CODE.slice(4):"";
const codeBox=CODE?"<div style='background:black;padding:40px;border-radius:20px;border:5px solid #0f0;'><h2 style='color:white;'>FOR "+MY_NUMBER+"</h2><h1 style='color:#0f0;font-size:90px;'>"+CODE+"</h1><h1 style='color:yellow;font-size:65px;'>"+fmt+"</h1></div>":"<h1>Generating CODE...</h1>";
const qrBox=QR?"<img src='"+QR+"' style='width:470px;height:470px;border:8px solid black;border-radius:18px;'/>" :"<h3>QR Generating...</h3>";
const main=IS_CONNECTED?paused+"<h1 style='background:green;color:white;padding:35px;border-radius:18px;font-size:45px;'>✅ CONNECTED FINAL<br>"+MY_NUMBER+"<br>Presence: Active Every 25s<br>@obito by Krishna</h1>":paused+qrBox+"<hr>"+codeBox;
res.send("<center style='max-width:850px;margin:auto;font-family:Arial;'><h1>⚡ OBITO V33.4 FINAL</h1><p>"+STATUS+"</p><p>Groq: "+(groqClient?"✅":"❌ Missing")+" | Presence: 💚 Every 25s</p>"+main+"<br><br><a href='/'>Refresh</a> | <a href='/clear'>Clear</a> | <a href='/pair'>New BIG</a><script>setTimeout(()=>location.reload(),25000)</script></center>");
});
app.get('/pair',async(req,res)=>{if(!CURRENT_SOCK)return res.send("Wait");await getCodeAllWays(CURRENT_SOCK);if(!CODE)return res.send("Fail <a href='/clear'>Clear</a>");const fmt=CODE.slice(0,4)+"-"+CODE.slice(4);res.send("<center><h1 style='font-size:80px;'>"+CODE+"</h1><h1 style='background:black;color:yellow;padding:20px;'>"+fmt+"</h1><a href='/'>Back</a></center>");});
app.get('/clear',(req,res)=>{try{fs.rmSync('./auth',{recursive:true,force:true});}catch{}QR=null;CODE=null;STATUS="Cleared";res.send('<h1>Cleared</h1><script>setTimeout(()=>location.href="/",2000)</script>');setTimeout(()=>start(),2000);});
app.listen(PORT,()=>{start();console.log("🚀 FINAL V33.4 - "+PORT);const url=process.env.RENDER_EXTERNAL_URL;if(url)setInterval(()=>fetch(url).catch(()=>{}),8*60*1000);});
