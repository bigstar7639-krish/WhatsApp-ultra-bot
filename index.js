import makeWASocket, { useMultiFileAuthState, makeCacheableSignalKeyStore } from '@whiskeysockets/baileys';
import { MongoClient, Binary } from 'mongodb';
import { Groq } from 'groq-sdk';
import pino from 'pino';
import express from 'express';
import QRCode from 'qrcode';

const app = express();
let pairingCode = "Generating...";
let pairingRaw = "";
let qrImageData = null;
let isConnected = false;
let botPausedUntil = 0;

app.get('/', (req,res) => {
  res.send(`
  <html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="30"><style>
  body{font-family:sans-serif;text-align:center;padding:20px;background:#f0f2f5}
  .box{background:white;border:2px solid #25D366;padding:25px;display:inline-block;border-radius:20px;box-shadow:0 4px 15px rgba(0,0,0,0.1);max-width:400px}
  h1{font-size:38px;color:#25D366;letter-spacing:4px;margin:15px 0}
  .code-box{background:#111;color:#25D366;padding:15px;border-radius:10px;font-size:32px;font-weight:bold;letter-spacing:3px;margin:15px 0}
  button{background:#25D366;color:white;border:none;padding:12px 25px;border-radius:8px;font-size:16px;font-weight:bold;cursor:pointer;margin:5px}
  button:hover{background:#128C7E}
  .qr{margin:15px auto;border:10px solid white;box-shadow:0 2px 10px rgba(0,0,0,0.2);border-radius:10px}
  .status{font-size:18px;font-weight:bold;margin:10px}
  </style></head><body>
  <div class="box">
    <h2>🤖 Krishna's AI Bot</h2>
    <div class="status" style="color:${isConnected?'green':'orange'}">${isConnected ? '✅ CONNECTED - 24/7 ON' : '⏳ WAITING FOR LINK'}</div>
    
    ${!isConnected ? `
    <p><b>Method 1: Pairing Code</b></p>
    <div class="code-box" id="codeText">${pairingCode}</div>
    <p>Raw: <span id="rawText" style="font-weight:bold">${pairingRaw}</span></p>
    <button onclick="copyCode()">📋 Copy Code</button>
    <button onclick="copyRaw()">📋 Copy Without Dash</button>
    <p style="font-size:13px;color:#666">Number: ${process.env.PHONE_NUMBER||'918870799204'}<br>WhatsApp > Linked Devices > Link with phone number</p>
    
    <hr style="margin:20px 0">
    <p><b>Method 2: QR Code</b></p>
    ${qrImageData ? `<img class="qr" src="${qrImageData}" width="250"><br><p style="font-size:13px">Scan this QR in WhatsApp</p>` : `<p>Generating QR... Wait 10s & Refresh</p>`}
    ` : `<h3>Bot Live! Group + Private ON ✅<br>Command: /stop (5 min)</h3>`}

    <hr>
    <a href="/clear" style="color:red;font-size:13px">Reset Session</a>
    <p style="font-size:11px;color:gray">Auto refresh 30s</p>
  </div>
  <script>
  function copyCode(){ const t=document.getElementById('codeText').innerText; navigator.clipboard.writeText(t); alert('Copied: '+t); }
  function copyRaw(){ const t=document.getElementById('rawText').innerText || document.getElementById('codeText').innerText.replace(/-/g,''); navigator.clipboard.writeText(t); alert('Copied RAW: '+t+' - Paste in WhatsApp'); }
  </script>
  </body></html>`);
});
app.get('/clear', async (req,res)=>{ try{ const c=await getMongoCollection(); await c.deleteOne({_id:"creds"}); res.send("DELETED - Go Home & New Code in 10s"); }catch(e){ res.send(e.message); }});
app.listen(process.env.PORT || 3000, ()=>console.log('Web LIVE'));

function convertBinary(o){ if(!o) return o; if(o instanceof Binary) return Buffer.from(o.buffer); if(o instanceof Buffer||o instanceof Uint8Array) return o; if(Array.isArray(o)) return o.map(convertBinary); if(typeof o==='object'){ const n={}; for(const k in o) n[k]=convertBinary(o[k]); return n; } return o; }
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
let mongoClient;
async function getMongoCollection(){ if(!mongoClient){ mongoClient=new MongoClient(process.env.MONGODB_URI||process.env.MONGO_URL); await mongoClient.connect(); console.log("MongoDB Connected"); } return mongoClient.db("krishna_bot").collection("auth_state"); }
async function useMongoAuth(){
  const col = await getMongoCollection(); const doc = await col.findOne({ _id: "creds" }); let creds, keys;
  if(doc?.creds){ const k=convertBinary(doc.keys); if(!k||Object.keys(k).length===0){ await col.deleteOne({_id:"creds"}); } else { try{ creds=convertBinary(doc.creds); keys=k; }catch(e){ await col.deleteOne({_id:"creds"}); } } }
  if(!creds){ const {state}=await useMultiFileAuthState('/tmp/auth'); creds=state.creds; keys=state.keys; }
  const saveCreds = async()=>{ await col.updateOne({_id:"creds"},{$set:{creds,keys,updated:new Date()}},{upsert:true}); };
  return {state:{creds,keys:makeCacheableSignalKeyStore(keys,pino({level:'silent'}))},saveCreds};
}
async function getAIReply(text){
  const clean=text.toLowerCase().trim();
  if(clean==='/stop'||clean==='/stop 5min'||clean==='stop'){ botPausedUntil=Date.now()+5*60*1000; return "✅ OK da! Bot 5 min ku stop! Auto on aayidum. - Krishna's AI Assistant"; }
  if(Date.now()<botPausedUntil) return null;
  try{
    const c=await groq.chat.completions.create({ model:"llama-3.1-8b-instant", messages:[{role:"system", content:"You are Krishna's AI Assistant. All languages ok. Same language reply. If who are you, say 'I am Krishna's AI Assistant'. Under 80 words."},{role:"user", content:text}], max_tokens:400, temperature:0.7 });
    return c.choices[0].message.content;
  }catch(e){ return "Busy da, 2 sec la try pannu 😅"; }
}
async function startBot(){
  const {state,saveCreds}=await useMongoAuth();
  const sock = makeWASocket({ auth:state, logger:pino({level:'silent'}), browser:["Chrome","Windows","10"], syncFullHistory:false });
  sock.ev.on('creds.update', saveCreds);
  if(!state.creds.registered){
    const genCode = async () => {
      if(isConnected) return;
      try{ const code=await sock.requestPairingCode(process.env.PHONE_NUMBER||"918870799204"); pairingRaw=code; pairingCode=code.match(/.{1,4}/g)?.join("-")||code; console.log(`CODE: ${pairingCode} RAW:${pairingRaw}`); }
      catch(e){ pairingCode="Retrying..."; }
      if(!isConnected) setTimeout(genCode, 25000);
    };
    setTimeout(genCode, 3000);
  }
  sock.ev.on('connection.update', async(u)=>{
    const {connection,lastDisconnect,qr}=u;
    if(qr){ try{ qrImageData=await QRCode.toDataURL(qr); console.log("QR Generated"); }catch(e){} }
    if(connection==='open'){ isConnected=true; pairingCode="CONNECTED ✅"; qrImageData=null; console.log("✅ CONNECTED"); return; }
    if(connection==='close'){ const sc=lastDisconnect?.error?.output?.statusCode; isConnected=false; if(sc===401){ const col=await getMongoCollection(); await col.deleteOne({_id:"creds"}); } setTimeout(startBot, 10000); }
  });
  sock.ev.on('messages.upsert', async({messages})=>{
    const m=messages[0]; if(!m.message||m.key.fromMe) return; const jid=m.key.remoteJid; if(jid.includes('status')||jid.includes('broadcast')) return;
    let t=m.message.conversation||m.message.extendedTextMessage?.text||m.message.imageMessage?.caption||""; t=t.trim(); if(!t) return;
    if(Date.now()<botPausedUntil) return;
    try{ await sock.sendPresenceUpdate('composing',jid); const reply=await getAIReply(t); if(!reply) return; await sock.sendPresenceUpdate('paused',jid); await sock.sendMessage(jid,{text:reply}); }catch(e){}
  });
  setInterval(()=>{ if(botPausedUntil&&Date.now()>botPausedUntil){ botPausedUntil=0; console.log("Auto resumed"); } }, 10000);
}
startBot();
