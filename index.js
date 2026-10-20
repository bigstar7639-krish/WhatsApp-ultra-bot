import makeWASocket,{useMultiFileAuthState,DisconnectReason,fetchLatestBaileysVersion,Browsers,makeCacheableSignalKeyStore}from'baileys';import express from'express';import pino from'pino';import fs from'fs';import QRCode from'qrcode';import sharp from'sharp';
const app=express();
const PORT=process.env.PORT||8000;
const MY_NUMBER="918870799204";
let CODE=null,QR=null,STATUS="V33.1 FINAL ALL FIX STARTING",IS_CONNECTED=false,IS_PAUSED=false,PAUSE_UNTIL=null,groqClient=null,CURRENT_SOCK=null,RETRY_COUNT=0;
const IDENTITY=`You are @obito - Energy AI created by Krishna. You are Obito Energy Bot. Creator is Krishna. Personality: Funny when user funny, Serious when user serious, Happy energetic always, Empathetic. Auto detect ALL languages and reply SAME language user uses. Support Tamil Hindi English Malayalam Telugu Kannada Bengali Marathi Gujarati Urdu Punjabi Odia Assamese Bhojpuri Spanish French German Arabic Russian Japanese Korean Chinese and ALL world languages. Group chat: Talk in groups, mention users, be friendly, keep energy. If asked who are you: Say "I am @obito Energy created by Krishna ⚡" If asked who made you: Say "Created by Krishna - My master ❤️" Keep replies short energetic fun.`;
if(process.env.GROQ_API_KEY){const{default:Groq}=await import('groq-sdk');groqClient=new Groq({apiKey:process.env.GROQ_API_KEY});}
async function getCodeAllWays(sock){
for(let i=0;i<6;i++){try{if(i>0)await new Promise(r=>setTimeout(r,i*2000));CODE=await sock.requestPairingCode(MY_NUMBER);if(CODE){STATUS=`✅ P-CODE ${CODE} (${CODE.slice(0,4)}-${CODE.slice(4)}) - ALL FIX`;return CODE;}}catch{}}
return null;
}
async function start(){
if(IS_PAUSED&&PAUSE_UNTIL&&new Date()>PAUSE_UNTIL){IS_PAUSED=false;PAUSE_UNTIL=null;STATUS="Auto resumed 5min";}
if(IS_PAUSED)return;
let version;try{version=(await fetchLatestBaileysVersion()).version;}catch{version=[2,3000,1015901307];}
const{state,saveCreds}=await useMultiFileAuthState('./auth');
const sock=makeWASocket({version,logger:pino({level:'silent'}),printQRInTerminal:false,auth:{creds:state.creds,keys:makeCacheableSignalKeyStore(state.keys,pino({level:'silent'}))},browser:Browsers.macOS('Desktop'),markOnlineOnConnect:true,syncFullHistory:false,connectTimeoutMs:60000,keepAliveIntervalMs:10000,retryRequestDelayMs:2000,maxMsgRetryCount:5});
CURRENT_SOCK=sock;
if(!state.creds.registered){
setTimeout(async()=>{await getCodeAllWays(sock);},4000);
setInterval(async()=>{if(!CODE&&!IS_CONNECTED&&!state.creds.registered&&CURRENT_SOCK&&RETRY_COUNT<10){RETRY_COUNT++;await getCodeAllWays(CURRENT_SOCK);}},30000);
setTimeout(async()=>{if(!CODE&&!IS_CONNECTED)await getCodeAllWays(sock);},60000);
}
sock.ev.on('connection.update',async a=>{
const{connection,lastDisconnect,qr}=a;
if(qr){QR=await QRCode.toDataURL(qr);STATUS=`QR Ready | ${CODE?`P-CODE ${CODE} (${CODE.slice(0,4)}-${CODE.slice(4)})`:'Generating'} | ALL FIX | BY KRISHNA`;}
if(connection==='open'){IS_CONNECTED=true;CODE=null;QR=null;RETRY_COUNT=0;STATUS=`✅ CONNECTED ${MY_NUMBER} - ALL FIX - BY KRISHNA`;}
if(connection==='close'){const r=lastDisconnect?.error?.output?.statusCode;IS_CONNECTED=false;CODE=null;QR=null;if(r===DisconnectReason.loggedOut){try{fs.rmSync('./auth',{recursive:true,force:true});}catch{}}setTimeout(()=>start(),4000);}
});
sock.ev.on('creds.update',saveCreds);
sock.ev.on('messages.upsert',async({messages})=>{
const m=messages[0];if(!m?.message||m.key.fromMe)return;
const jid=m.key.remoteJid;
const isGroup=jid.endsWith('@g.us');
const senderName=m.pushName||"friend";
let txt=(m.message.conversation||m.message.extendedTextMessage?.text||m.message.imageMessage?.caption||m.message.videoMessage?.caption||"").trim();
if(IS_PAUSED&&PAUSE_UNTIL&&new Date()>PAUSE_UNTIL){IS_PAUSED=false;PAUSE_UNTIL=null;}
if(txt.toLowerCase()==='/start'){IS_PAUSED=false;PAUSE_UNTIL=null;STATUS=`✅ CONNECTED`;await sock.sendMessage(jid,{text:"⚡ @obito Energy activated! I am @obito Energy created by Krishna ⚡ Ready in all languages!"});return;}
if(txt.toLowerCase()==='/stop'){IS_PAUSED=true;PAUSE_UNTIL=new Date(Date.now()+5*60*1000);await sock.sendMessage(jid,{text:`⏸️ @obito paused 5 min! Auto resume ${PAUSE_UNTIL.toLocaleTimeString()} ⚡\nSend /start to wake! By Krishna`});setTimeout(()=>{IS_PAUSED=false;PAUSE_UNTIL=null;},5*60*1000);return;}
if(IS_PAUSED)return;
if(isGroup){
const lower=txt.toLowerCase();
const hasMention=lower.includes('@obito')||lower.includes('obito');
if(!hasMention && Math.random()>0.35)return;
}
if(!txt&&m.message.imageMessage){try{const{downloadMediaMessage}=await import('baileys');const buf=await downloadMediaMessage(m,'buffer',{},{logger:pino({level:'silent'}),reuploadRequest:sock.updateMediaMessage});const webp=await sharp(buf).resize(512,512).webp({quality:90}).toBuffer();await sock.sendMessage(jid,{sticker:webp});}catch{return;}}
if(!txt&&m.message.videoMessage){try{const{downloadMediaMessage}=await import('baileys');const buf=await downloadMediaMessage(m,'buffer',{},{logger:pino({level:'silent'}),reuploadRequest:sock.updateMediaMessage});const webp=await sharp(buf).resize(512,512).webp().toBuffer();await sock.sendMessage(jid,{sticker:webp});}catch{return;}}
if(txt&&groqClient){try{
const groupCtx=isGroup?`[Group:${senderName} says in group. Detect mood: funny/serious/happy. Reply same language. You are @obito created by Krishna]`:"";
const r=await groqClient.chat.completions.create({model:"llama3-8b-8192",messages:[{role:"system",content:IDENTITY+groupCtx},{role:"user",content:`${senderName}: ${txt}`}],temperature:0.85,max_tokens:800});
const rep=r.choices[0]?.message?.content;
if(rep)await sock.sendMessage(jid,{text:rep});
}catch{}}
});
}
app.get('/',(req,res)=>{
const paused=IS_PAUSED?`<h1 style="background:orange;color:white;padding:18px;border-radius:12px;">⏸️ PAUSED 5 MIN till ${PAUSE_UNTIL?.toLocaleTimeString()}<br>/start to wake</h1>`:"";
let codeBox=CODE?`<div style="background:black;padding:45px;border-radius:22px;border:6px solid #0f0;"><h2 style="color:white;margin:0;">FOR ${MY_NUMBER} - FINAL ALL FIX BIG - BY KRISHNA</h2><h1 style="color:#0f0;font-size:95px;margin:15px 0;letter-spacing:10px;font-weight:900;">${CODE}</h1><h1 style="color:yellow;font-size:70px;margin:0;letter-spacing:8px;font-weight:900;">${CODE.slice(0,4)}-${CODE.slice(4)}</h1><p style="color:white;font-size:20px;">WhatsApp > Linked Devices > Link Device > Link with phone number > Enter ${CODE} - 60 SEC!</p><a href="/pair" style="background:yellow;color:black;padding:15px 25px;text-decoration:none;border-radius:10px;font-weight:bold;">New BIG Code</a></div>`:`<h1>Generating FINAL ALL FIX BIG CODE... 4 sec...<br><br><a href="/pair" style="font-size:24px;background:blue;color:white;padding:15px 25px;text-decoration:none;border-radius:10px;">Force New BIG</a></h1>`;
let qrBox=QR?`<div><img src="${QR}" style="width:480px;height:480px;border:10px solid black;border-radius:20px;"/><br><b>QR WAY - ALL FIX</b></div>`:`<h3>QR Generating ALL FIX...</h3>`;
let main=IS_CONNECTED?`${paused}<h1 style="background:green;color:white;padding:40px;border-radius:20px;font-size:50px;">✅ CONNECTED<br>${MY_NUMBER}<br>@obito created by Krishna<br>FINAL ALL FIX</h1>`:`${paused}${qrBox}<hr>${codeBox}`;
res.send(`<center style="max-width:900px;margin:auto;font-family:Arial;padding:10px;"><h1>⚡ OBITO FINAL ALL FIX - ${MY_NUMBER}</h1><p>${STATUS} | ${IS_PAUSED?'PAUSED 5 MIN':'ACTIVE'} | ALL FIX | LIFE TIME</p>${main}<br><br><a href="/" style="padding:15px 20px;background:black;color:white;text-decoration:none;border-radius:10px;">Refresh</a><a href="/clear" style="padding:15px 20px;background:red;color:white;text-decoration:none;border-radius:10px;margin-left:10px;">Clear</a><a href="/pair" style="padding:15px 20px;background:blue;color:white;text-decoration:none;border-radius:10px;margin-left:10px;">New BIG</a><a href="/getcode" style="padding:15px 20px;background:green;color:white;text-decoration:none;border-radius:10px;margin-left:10px;">JSON</a><div style="margin-top:20px;background:#eee;padding:20px;border-radius:12px;text-align:left;"><b>ALL FIX:</b><br>✅ ALL LANGUAGE auto detect + SAME language reply<br>✅ Identity: I am @obito Energy created by Krishna<br>✅ Funny Serious Happy mood<br>✅ Group chat full + @obito mention<br>✅ BIG CODE 95px+70px QR 480px 6 ways<br>✅ /stop 5min auto + /start + Life time 8min ping + All DisconnectReason<br>✅ Sticker 512 + Groq + Energetic</div><script>setTimeout(()=>location.reload(),25000)</script></center>`);
});
app.get('/pair',async(req,res)=>{try{if(!CURRENT_SOCK)return res.send(`<h1>Wait 5 sec</h1><a href="/">Back</a>`);await getCodeAllWays(CURRENT_SOCK);if(!CODE)return res.send(`<h1>Failed - Delete linked devices max 4</h1><a href="/clear">Clear</a>`);res.send(`<center><h1 style="font-size:85px;">${CODE}</h1><h1 style="font-size:65px;color:yellow;background:black;padding:25px;border-radius:15px;">${CODE.slice(0,4)}-${CODE.slice(4)}</h1><h2>FOR ${MY_NUMBER} - ALL FIX - 60 SEC!</h2><a href="/" style="font-size:26px;background:green;color:white;padding:15px 25px;text-decoration:none;border-radius:10px;">Dashboard</a></center>`);}catch(e){res.send(e.message);}});
app.get('/getcode',(req,res)=>{res.json({code:CODE,formatted:CODE?`${CODE.slice(0,4)}-${CODE.slice(4)}`:null,number:MY_NUMBER,status:STATUS,connected:IS_CONNECTED,paused:IS_PAUSED,identity:"@obito Energy created by Krishna",languages:"ALL",group:"YES",mood:"funny serious happy",version:"FINAL ALL FIX"});});
app.get('/clear',(req,res)=>{try{fs.rmSync('./auth',{recursive:true,force:true});}catch{}QR=null;CODE=null;RETRY_COUNT=0;STATUS="Cleared - Generating FINAL ALL FIX BIG CODE...";res.send('<h1>✅ Cleared - New BIG CODE 5 sec - ALL FIX</h1><script>setTimeout(()=>location.href="/",4000)</script>');setTimeout(()=>start(),2000);});
app.listen(PORT,()=>{start();console.log(`🚀 FINAL ALL FIX - ${PORT} - ${MY_NUMBER} - @obito by Krishna`);const url=process.env.RENDER_EXTERNAL_URL;if(url)setInterval(()=>fetch(url).catch(()=>{}),8*60*1000);});
