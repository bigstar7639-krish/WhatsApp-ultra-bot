import makeWASocket, { useMultiFileAuthState, makeCacheableSignalKeyStore, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import { MongoClient, Binary } from 'mongodb';
import { Groq } from 'groq-sdk';
import pino from 'pino';
import express from 'express';
import QRCode from 'qrcode';

const app = express();
let pairingCode = "Starting...";
let pairingRaw = "";
let qrImageData = null;
let isConnected = false;
let botPausedUntil = 0;
let currentCodeGeneratedAt = 0;

app.get('/', (req,res) => {
  const left = currentCodeGeneratedAt ? Math.max(0, 120 - Math.floor((Date.now() - currentCodeGeneratedAt)/1000)) : 0;
  res.send(`
  <html><head><meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="refresh" content="30">
  <style>body{font-family:sans-serif;text-align:center;padding:15px;background:#f0f2f5}
  .box{background:white;border:2px solid #25D366;padding:20px;display:inline-block;border-radius:18px;max-width:400px}
  .code-box{background:#111;color:#25D366;padding:14px;border-radius:10px;font-size:30px;font-weight:bold;letter-spacing:3px;margin:12px 0}
  button{background:#25D366;color:white;border:none;padding:12px 22px;border-radius:8px;font-weight:bold;cursor:pointer}
  .qr{border:8px solid white;box-shadow:0 2px 10px rgba(0,0,0,.2);border-radius:10px}
  </style></head><body>
  <div class="box">
    <h3>🤖 Krishna AI Bot - v5</h3>
    <div style="color:${isConnected?'green':'#ff6b00'};font-weight:bold">${isConnected?'✅ CONNECTED - Bot Live!':'⏳ WAITING FOR LINK'}</div>
    ${!isConnected ? `
    <p><b>Pairing Code - ${left}s valid</b></p>
    <div class="code-box">${pairingCode}</div>
    RAW: <b style="font-size:20px">${pairingRaw}</b><br><br>
    <button onclick="navigator.clipboard.writeText('${pairingRaw}');alert('Copied RAW: ${pairingRaw}')">📋 Copy RAW Code</button>
    <p style="font-size:12px">WhatsApp > Linked Devices > Link with phone number<br>Number: 918870799204</p>
    <hr>
    <p><b>QR Code (Use other phone screen)</b></p>
    ${qrImageData ? `<img class="qr" src="${qrImageData}" width="250">` : `Generating QR...`}
    ` : `<p>Bot is running! Type /stop to pause 5 min</p>`}
    <br><hr><a href="/clear" style="color:red;font-size:13px">RESET /clear</a>
  </div></body></html>`);
});
app.get('/clear', async (req,res)=>{ try{ const c=await getMongoCollection(); await c.deleteOne({_id:"creds"}); res.send("DELETED - Restarting in 10s..."); setTimeout(()=>process.exit(1),2000); }catch(e){ res.send(e.message); }});
app.listen(process.env.PORT || 3000, ()=>console.log('Web LIVE on PORT'));

function convertBinary(o){ if(!o) return o; if(o instanceof Binary) return Buffer.from(o.buffer); if(o instanceof Buffer||o instanceof Uint8Array) return o; if(Array.isArray(o)) return o.map(convertBinary); if(typeof o==='object'){ const n={}; for(const k in o) n[k]=convertBinary(o[k]); return n; } return o; }
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
let mongoClient;
async function getMongoCollection(){ if(!mongoClient){ mongoClient=new MongoClient(process.env.MONGODB_URI); await mongoClient.connect(); console.log("MongoDB Connected"); } return mongoClient.db("krishna_bot").collection("auth_state"); }
async function useMongoAuth(){
  const col=await getMongoCollection(); const doc=await col.findOne({_id:"creds"}); let creds,keys;
  if(doc?.creds){ const k=convertBinary(doc.keys); if(!k||Object.keys(k).length===0){ await col.deleteOne({_id:"creds"}); } else { try{ creds=convertBinary(doc.creds); keys=k; }catch{ await col.deleteOne({_id:"creds"}); } } }
  if(!creds){ const {state}=await useMultiFileAuthState('/tmp/auth'); creds=state.creds; keys=state.keys; }
  const saveCreds=async()=>{ await col.updateOne({_id:"creds"},{$set:{creds,keys,updated:new Date()}},{upsert:true}); };
  return {state:{creds,keys:makeCacheableSignalKeyStore(keys,pino({level:'silent'}))},saveCreds};
}
async function getAIReply(text){
  const cl=text.toLowerCase().trim();
  if(cl==='/stop'||cl==='stop'){ botPausedUntil=Date.now()+5*60*1000; return "✅ OK da! 5 min pause!"; }
  if(Date.now()<botPausedUntil) return null;
  try{ const r=await groq.chat.completions.create({model:"llama-3.1-8b-instant",messages:[{role:"system",content:"You are Krishna's AI Assistant. Reply in same language as user, under 100 words."},{role:"user",content:text}],max_tokens:500}); return r.choices[0].message.content; }catch{ return "Busy da, 1 min kazhichu try pannu"; }
}
async function startBot(){
  const {version}=await fetchLatestBaileysVersion(); console.log(`WA VERSION: ${version.join('.')}`);
  const {state,saveCreds}=await useMongoAuth();
  const sock=makeWASocket({version,auth:state,logger:pino({level:'silent'}),browser:["Chrome","Windows","10"],syncFullHistory:false,markOnlineOnConnect:true});
  sock.ev.on('creds.update', saveCreds);
  if(!state.creds.registered){
    setTimeout(async()=>{
      if(isConnected) return;
      try{
        const num=(process.env.PHONE_NUMBER||"918870799204").replace(/[^0-9]/g,'');
        console.log(`Requesting Pairing Code for ${num}`);
        const code=await sock.requestPairingCode(num);
        pairingRaw=code; pairingCode=code.match(/.{1,4}/g)?.join("-")||code; currentCodeGeneratedAt=Date.now();
        console.log(`✅ FINAL CODE: ${pairingCode} RAW:${pairingRaw} - USE IN 120 SEC`);
      }catch(e){ console.log("Pairing fail:",e.message); pairingCode="Failed - will retry in 30s"; setTimeout(startBot,30000); }
    },8000);
  }
  sock.ev.on('connection.update', async(u)=>{
    const {connection,lastDisconnect,qr}=u;
    if(qr){ try{ qrImageData=await QRCode.toDataURL(qr); console.log("QR Generated"); }catch{} }
    if(connection==='open'){ isConnected=true; pairingCode="CONNECTED ✅"; console.log("✅✅✅ WHATSAPP CONNECTED ✅✅✅"); return; }
    if(connection==='close'){ const sc=lastDisconnect?.error?.output?.statusCode; isConnected=false; console.log(`Closed: ${sc}`); if(sc===401){ const col=await getMongoCollection(); await col.deleteOne({_id:"creds"}); } setTimeout(startBot, 15000); }
  });
  sock.ev.on('messages.upsert', async({messages})=>{
    const m=messages[0]; if(!m.message||m.key.fromMe) return; const jid=m.key.remoteJid; if(jid.includes('status')||jid.includes('broadcast')||jid.includes('newsletter')) return;
    let t=m.message.conversation||m.message.extendedTextMessage?.text||m.message.imageMessage?.caption||""; t=t.trim(); if(!t) return;
    if(Date.now()<botPausedUntil) return;
    try{ await sock.sendPresenceUpdate('composing',jid); const r=await getAIReply(t); if(!r) return; await sock.sendPresenceUpdate('paused',jid); await sock.sendMessage(jid,{text:r}); }catch(e){ console.log(e); }
  });
}
startBot();
