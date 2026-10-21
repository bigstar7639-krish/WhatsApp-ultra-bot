import makeWASocket,{useMultiFileAuthState,DisconnectReason,fetchLatestBaileysVersion,Browsers,makeCacheableSignalKeyStore,delay}from'baileys';import express from'express';import pino from'pino';import fs from'fs';import QRCode from'qrcode';import sharp from'sharp';
const app=express();
const PORT=process.env.PORT||8000;
const MY_NUMBER="918870799204";
let CODE=null,QR=null,STATUS="V33.8 ENV FIX STARTING",IS_CONNECTED=false,IS_PAUSED=false,PAUSE_UNTIL=null,groqClient=null,CURRENT_SOCK=null,START_TIME=new Date(),MSG_COUNT=0;
const IDENTITY="You are @obito - Personal assistant for Krishna's circle. You help with support, bookings, reminders, tasks, friendly chat. You are NOT a general-purpose AI distribution. You are a private assistant created by Krishna for friends and family. Keep replies concise, helpful, task-focused. Auto detect language Tamil Hindi English Malayalam Telugu Kannada Bengali Marathi Gujarati Urdu Punjabi Odia Assamese Bhojpuri Spanish French German Arabic Russian Japanese Korean Chinese ALL and reply same language. If asked who are you say I am @obito personal assistant created by Krishna for this circle. If asked who made you say Created by Krishna.";
if(process.env.GROQ_API_KEY){const{default:Groq}=await import('groq-sdk');groqClient=new Groq({apiKey:process.env.GROQ_API_KEY});}

// --- ENV PERSISTENCE FIX START ---
function restoreAuthFromEnv(){
try{
if(!process.env.AUTH_DATA)return;
console.log("🔄 Restoring auth from ENV...");
const data=JSON.parse(Buffer.from(process.env.AUTH_DATA,'base64').toString());
if(!fs.existsSync('./auth'))fs.mkdirSync('./auth',{recursive:true});
for(const f in data){fs.writeFileSync('./auth/'+f,data[f]);}
console.log("✅ Auth restored from ENV!");
}catch(e){console.log("ENV restore fail:",e.message);}
}
function getAuthDataBase64(){
try{
if(!fs.existsSync('./auth'))return null;
const files=fs.readdirSync('./auth');
const obj={};
for(const f of files){obj[f]=fs.readFileSync('./auth/'+f,'utf-8');}
return Buffer.from(JSON.stringify(obj)).toString('base64');
}catch{return null;}
}
restoreAuthFromEnv();
// --- ENV PERSISTENCE FIX END ---

async function getCodeAllWays(sock){for(let i=0;i<8;i++){try{if(i>0)await delay(2500);CODE=await sock.requestPairingCode(MY_NUMBER);if(CODE){STATUS="✅ CODE "+CODE;return CODE;}}catch(e){}}return null;}
async function start(){
if(IS_PAUSED&&PAUSE_UNTIL&&new Date()>PAUSE_UNTIL){IS_PAUSED=false;PAUSE_UNTIL=null;}
if(IS_PAUSED)return;
let version;try{version=(await fetchLatestBaileysVersion()).version;}catch{version=[2,3000,1015901307];}
const{state,saveCreds}=await useMultiFileAuthState('./auth');
const sock=makeWASocket({version,logger:pino({level:'silent'}),printQRInTerminal:false,auth:{creds:state.creds,keys:makeCacheableSignalKeyStore(state.keys,pino({level:'silent'}))},browser:Browsers.ubuntu('Chrome'),markOnlineOnConnect:true,syncFullHistory:false,connectTimeoutMs:60000,keepAliveIntervalMs:10000,retryRequestDelayMs:2000});
CURRENT_SOCK=sock;
sock.ev.on('connection.update',async a=>{
const{connection,lastDisconnect,qr}=a;
if(connection==='connecting'&&!state.creds.registered){await delay(3000);await getCodeAllWays(sock);}
if(qr){QR=await QRCode.toDataURL(qr);STATUS="📱 QR Ready | Code: "+(CODE||"Generating");}
if(connection==='open'){IS_CONNECTED=true;CODE=null;QR=null;STATUS="✅ CONNECTED "+MY_NUMBER+" | V33.8";setInterval(async()=>{try{if(CURRENT_SOCK){await CURRENT_SOCK.sendPresenceUpdate('available');}}catch{}},25000);}
if(connection==='close'){const r=lastDisconnect?.error?.output?.statusCode;IS_CONNECTED=false;CODE=null;QR=null;if(r===DisconnectReason.loggedOut){try{fs.rmSync('./auth',{recursive:true,force:true});}catch{}}await delay(4000);start();}
});
sock.ev.on('creds.update',async()=>{
await saveCreds();
// Auto save to console for manual ENV copy
const b64=getAuthDataBase64();
if(b64)console.log("SAVE THIS TO ENV AUTH_DATA:",b64.slice(0,100)+"...");
});
sock.ev.on('messages.upsert',async({messages})=>{
const m=messages[0];if(!m?.message||m.key.fromMe)return;
const jid=m.key.remoteJid;const isGroup=jid.endsWith('@g.us');const senderName=m.pushName||"friend";
let txt=(m.message.conversation||m.message.extendedTextMessage?.text||m.message.imageMessage?.caption||m.message.videoMessage?.caption||"").trim();
if(txt.toLowerCase()==='/stop'){IS_PAUSED=true;PAUSE_UNTIL=new Date(Date.now()+5*60*1000);await sock.sendMessage(jid,{text:"⏸️ @obito paused 5 min - Auto resume after 5 min"});setTimeout(()=>{IS_PAUSED=false;PAUSE_UNTIL=null;},5*60*1000);return;}
if(IS_PAUSED)return;
if(isGroup&&!txt.toLowerCase().includes('obito')&&Math.random()>0.30)return;
if(!txt&&m.message.imageMessage){try{const{downloadMediaMessage}=await import('baileys');const buf=await downloadMediaMessage(m,'buffer',{},{logger:pino({level:'silent'}),reuploadRequest:sock.updateMediaMessage});const webp=await sharp(buf).resize(512,512).webp().toBuffer();await sock.sendMessage(jid,{sticker:webp});}catch(e){}return;}
if(txt){MSG_COUNT++;if(!groqClient){await sock.sendMessage(jid,{text:"⚠️ GROQ key missing!"});return;}try{await sock.sendPresenceUpdate('composing',{},{jid});await delay(1200+Math.random()*800);const r=await groqClient.chat.completions.create({model:"llama3-8b-8192",messages:[{role:"system",content:IDENTITY},{role:"user",content:senderName+": "+txt}],temperature:0.7,max_tokens:600});const rep=r.choices[0]?.message?.content;await sock.sendPresenceUpdate('paused',{},{jid});if(rep)await sock.sendMessage(jid,{text:rep});}catch(e){await sock.sendMessage(jid,{text:"Error: "+e.message});}}
});
}
app.get('/',(req,res)=>{
const uptime=Math.floor((new Date()-START_TIME)/1000/60);
const fmt=CODE?CODE.slice(0,4)+"-"+CODE.slice(4):"";
const pausedBox=IS_PAUSED?`<div style='background:linear-gradient(135deg,#ff9800,#f57c00);color:white;padding:20px;border-radius:15px;margin:20px 0;'><h2>⏸️ PAUSED</h2><p>Auto resume at ${PAUSE_UNTIL?.toLocaleTimeString()}</p></div>`:"";
const b64=getAuthDataBase64();
const saveBox=IS_CONNECTED&&b64?`<div style='background:#e8f5e9;padding:20px;border-radius:15px;margin:20px 0;border:2px solid #4caf50;text-align:left;word-break:break-all;'><h3 style='color:#2e7d32;margin-top:0;'>✅ PERMANENT FIX - COPY THIS TO RENDER ENV:</h3><p style='font-size:13px;'>Render Dashboard → Environment → Add AUTH_DATA → Paste below value → Save → Restart auto permanent aayidum!</p><textarea style='width:100%;height:120px;font-size:10px;'>${b64}</textarea><br><a href='/saveauth' style='background:#2e7d32;color:white;padding:8px 15px;border-radius:20px;text-decoration:none;font-size:12px;'>Download Full</a></div>`:"";
const connectedBox=IS_CONNECTED?`<div style='background:linear-gradient(135deg,#00c853,#009624);color:white;padding:30px;border-radius:20px;margin:20px 0;'><h1 style='font-size:36px;margin:0;'>✅ CONNECTED</h1><h2>${MY_NUMBER}</h2><p>Uptime: ${uptime} min | Messages: ${MSG_COUNT}</p></div>`:`<div style='display:flex;gap:20px;flex-wrap:wrap;justify-content:center;'><div style='background:white;padding:25px;border-radius:20px;box-shadow:0 8px 25px rgba(0,0,0,0.15);min-width:350px;'><h2 style='color:#333;'>📱 QR LOGIN</h2>${QR?`<img src='${QR}' style='width:380px;height:380px;border-radius:15px;border:4px solid #000;'/>`:`<div style='width:380px;height:380px;background:#f0f0f0;display:flex;align-items:center;justify-content:center;border-radius:15px;'>Generating...</div>`}</div><div style='background:black;padding:30px;border-radius:20px;min-width:350px;text-align:center;'><h2 style='color:white;'>🔑 CODE</h2>${CODE?`<h1 style='color:#0f0;font-size:70px;margin:10px 0;'>${CODE}</h1><h1 style='color:yellow;font-size:50px;background:#222;padding:15px;border-radius:12px;'>${fmt}</h1><p style='color:#ccc;'>For ${MY_NUMBER}</p>`:`<h2 style='color:#888;'>Generating...</h2>`}</div></div>`;
res.send(`<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Obito V33.8</title></head><body style='margin:0;background:#f5f7fa;font-family:Arial;'><center style='max-width:1100px;margin:auto;padding:20px;'><div style='background:linear-gradient(135deg,#1a237e,#283593);color:white;padding:25px;border-radius:20px;margin-bottom:20px;'><h1 style='margin:0;'>⚡ OBITO V33.8 ENV FIX</h1><p>${STATUS} | Uptime ${uptime}m | Msgs ${MSG_COUNT}</p><p style='font-size:11px;opacity:0.7;'>Free Permanent Fix - No Disk Money!</p></div>${pausedBox}${saveBox}${connectedBox}<div style='display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin:20px 0;'><a href='/' style='background:#1a237e;color:white;padding:12px 25px;border-radius:25px;text-decoration:none;'>🔄 Refresh</a><a href='/clear' style='background:#c62828;color:white;padding:12px 25px;border-radius:25px;text-decoration:none;'>🗑️ Clear</a><a href='/pair' style='background:#2e7d32;color:white;padding:12px 25px;border-radius:25px;text-decoration:none;'>🔑 New Code</a><a href='/saveauth' style='background:#ef6c00;color:white;padding:12px 25px;border-radius:25px;text-decoration:none;'>💾 Save Auth</a></div></center><script>setTimeout(()=>location.reload(),30000)</script></body></html>`);
});
app.get('/pair',async(req,res)=>{if(!CURRENT_SOCK)return res.send("Wait 5 sec <a href='/'>Back</a>");await getCodeAllWays(CURRENT_SOCK);if(!CODE)return res.send("Fail <a href='/'>Back</a>");const fmt=CODE.slice(0,4)+"-"+CODE.slice(4);res.send(`<center style='font-family:Arial;padding:30px;'><h1 style='font-size:80px;'>${CODE}</h1><h1 style='background:black;color:yellow;padding:20px;font-size:60px;border-radius:15px;'>${fmt}</h1><p>For ${MY_NUMBER}</p><a href='/'>Back</a></center>`);});
app.get('/saveauth',(req,res)=>{const b64=getAuthDataBase64();if(!b64)return res.send("Not connected yet - Connect first then /saveauth <a href='/'>Back</a>");res.setHeader('Content-Type','text/plain');res.send(b64);});
app.get('/clear',(req,res)=>{try{fs.rmSync('./auth',{recursive:true,force:true});}catch{}QR=null;CODE=null;STATUS="Cleared";res.send('<center style="font-family:Arial;padding:50px;"><h1>Cleared!</h1><script>setTimeout(()=>location.href="/",3000)</script></center>');setTimeout(()=>start(),2000);});
app.listen(PORT,()=>{start();console.log("🚀 V33.8 ENV FIX - "+PORT);const url=process.env.RENDER_EXTERNAL_URL;if(url)setInterval(()=>fetch(url).catch(()=>{}),8*60*1000);});
