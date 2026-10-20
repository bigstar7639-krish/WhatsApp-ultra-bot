import makeWASocket, { useMultiFileAuthState, makeCacheableSignalKeyStore } from '@whiskeysockets/baileys';
import { MongoClient, Binary } from 'mongodb';
import { Groq } from 'groq-sdk';
import pino from 'pino';
import express from 'express';
import QRCode from 'qrcode';

const app = express();
let pairingCode = "Wait 5s...";
let pairingRaw = "";
let qrImageData = null;
let isConnected = false;
let botPausedUntil = 0;
let codeTimer = null;

app.get('/', (req,res) => {
  res.send(`
  <html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="60"><style>
  body{font-family:sans-serif;text-align:center;padding:20px;background:#f0f2f5}
  .box{background:white;border:2px solid #25D366;padding:25px;display:inline-block;border-radius:20px;box-shadow:0 4px 15px rgba(0,0,0,0.1);max-width:400px}
  .code-box{background:#111;color:#25D366;padding:15px;border-radius:10px;font-size:32px;font-weight:bold;letter-spacing:3px;margin:15px 0}
  button{background:#25D366;color:white;border:none;padding:12px 25px;border-radius:8px;font-size:16px;font-weight:bold;cursor:pointer;margin:5px}
  .qr{margin:15px auto;border:10px solid white;box-shadow:0 2px 10px rgba(0,0,0,0.2);border-radius:10px}
  </style></head><body>
  <div class="box">
    <h2>🤖 Krishna's AI Bot</h2>
    <div style="color:${isConnected?'green':'orange'};font-weight:bold">${isConnected ? '✅ CONNECTED' : '⏳ WAITING'}</div>
    ${!isConnected ? `
    <p><b>Pairing Code (2 MIN VALID)</b></p>
    <div class="code-box" id="c">${pairingCode}</div>
    Raw: <b id="r">${pairingRaw}</b><br><br>
    <button onclick="navigator.clipboard.writeText(document.getElementById('r').innerText);alert('Copied RAW! Paste in WhatsApp')">📋 Copy RAW & Paste</button>
    <p style="font-size:12px;color:#666">Number: 918870799204<br>WhatsApp > Linked Devices > Link with phone number</p>
    <hr>
    <p><b>OR Scan QR (Best Method)</b></p>
    ${qrImageData ? `<img class="qr" src="${qrImageData}" width="260"><br>` : `<p>Generating QR...</p>`}
    ` : `<h3>Bot Live! /stop to pause</h3>`}
    <hr><a href="/clear" style="color:red;font-size:12px">Reset</a>
  </div></body></html>`);
});
app.get('/clear', async (req,res)=>{ try{ const col=await getMongoCollection(); await col.deleteOne({_id:"creds"}); if(codeTimer) clearTimeout(codeTimer); res.send("DELETED - Wait 10s & Refresh Home"); }catch(e){ res.send(e.message); }});
app.listen(process.env.PORT || 3000, ()=>console.log('Web LIVE'));

function convertBinary(o){ if(!o) return o; if(o instanceof Binary) return Buffer.from(o.buffer); if(o instanceof Buffer||o instanceof Uint8Array) return o; if(Array.isArray(o)) return o.map(convertBinary); if(typeof o==='object'){ const n={}; for(const k in o) n[k]=convertBinary(o[k]); return n; } return o; }
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
let mongoClient;
async function getMongoCollection(){ if(!mongoClient){ mongoClient=new MongoClient(process.env.MONGODB_URI||process.env.MONGO_URL); await mongoClient.connect(); console.log("MongoDB Connected"); } return mongoClient.db("krishna_bot").collection("auth_state"); }
async function useMongoAuth(){
  const col=await getMongoCollection(); const doc=await col.findOne({_id:"creds"}); let creds,keys;
  if(doc?.creds){ const k=convertBinary(doc.keys); if(!k||Object.keys(k).length===0){ await col.deleteOne({_id:"creds"}); } else { try{ creds=convertBinary(doc.creds); keys=k; }catch(e){ await col.deleteOne({_id:"creds"}); } } }
  if(!creds){ const {state}=await useMultiFileAuthState('/tmp/auth'); creds=state.creds; keys=state.keys; }
  const saveCreds=async()=>{ await col.updateOne({_id:"creds"},{$set:{creds,keys,updated:new Date()}},{upsert:true}); };
  return {state:{creds,keys:makeCacheableSignalKeyStore(keys,pino({level:'silent'}))},saveCreds};
}
async function getAIReply(text){
  const clean=text.toLowerCase().trim();
  if(clean==='/stop'||clean==='stop'){ botPausedUntil=Date.now()+5*60*1000; return "✅ OK da! 5 min stop!"; }
  if(Date.now()<botPausedUntil) return null;
  try{ const c=await groq.chat.completions.create({model:"llama-3.1-8b-instant",messages:[{role:"system",content:"You are Krishna's AI Assistant. Same language reply. Under 80 words."},{role:"user",content:text}],max_tokens:400}); return c.choices[0].message.content; }catch(e){ return "Busy da, try again"; }
}
async function startBot(){
  const {state,saveCreds}=await useMongoAuth();
  const sock=makeWASocket({auth:state,logger:pino({level:'silent'}),browser:["Chrome","Windows","10"],syncFullHistory:false});
  sock.ev.on('creds.update', saveCreds);
  if(!state.creds.registered){
    const genCode=async()=>{
      if(isConnected) return;
      try{
        const code=await sock.requestPairingCode(process.env.PHONE_NUMBER||"918870799204");
        pairingRaw=code; pairingCode=code.match(/.{1,4}/g)?.join("-")||code;
        console.log(`✅ CODE FIXED: ${pairingCode} RAW:${pairingRaw} - VALID FOR 120 SEC!`);
        codeTimer=setTimeout(genCode, 120000); // 2 MIN - no overwrite!
      }catch(e){ console.log("Code fail",e.message); setTimeout(genCode, 15000); }
    };
    setTimeout(genCode, 5000);
  }
  sock.ev.on('connection.update', async(u)=>{
    const {connection,lastDisconnect,qr}=u;
    if(qr){ try{ qrImageData=await QRCode.toDataURL(qr); console.log("QR Generated"); }catch(e){} }
    if(connection==='open'){ isConnected=true; pairingCode="CONNECTED ✅"; if(codeTimer) clearTimeout(codeTimer); console.log("✅ CONNECTED"); return; }
    if(connection==='close'){ const sc=lastDisconnect?.error?.output?.statusCode; isConnected=false; if(sc===401){ const col=await getMongoCollection(); await col.deleteOne({_id:"creds"}); } if(codeTimer) clearTimeout(codeTimer); setTimeout(startBot, 10000); }
  });
  sock.ev.on('messages.upsert', async({messages})=>{
    const m=messages[0]; if(!m.message||m.key.fromMe) return; const jid=m.key.remoteJid; if(jid.includes('status')||jid.includes('broadcast')) return;
    let t=m.message.conversation||m.message.extendedTextMessage?.text||m.message.imageMessage?.caption||""; t=t.trim(); if(!t) return;
    if(Date.now()<botPausedUntil) return;
    try{ await sock.sendPresenceUpdate('composing',jid); const r=await getAIReply(t); if(!r) return; await sock.sendPresenceUpdate('paused',jid); await sock.sendMessage(jid,{text:r}); }catch(e){}
  });
}
startBot();
