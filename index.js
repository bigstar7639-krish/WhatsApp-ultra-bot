const makeWASocket = require('@whiskeysockets/baileys').default;
const { useMultiFileAuthState, DisconnectReason, makeCacheableSignalKeyStore } = require('@whiskeysockets/baileys');
const { MongoClient, Binary } = require('mongodb');
const { Groq } = require('groq-sdk');
const pino = require('pino');
const express = require('express');

const app = express();
let pairingCode = "Starting... Wait 40s and Refresh";
let lastCodeTime = 0;

app.get('/', (req,res) => res.send(`<h1>Krishna's AI LIVE</h1><h2 style="color:green">Code: ${pairingCode}</h2><p>Refresh page after 30s</p>`));
app.get('/clear', async (req,res)=>{ const c=await getMongoCollection(); await c.deleteOne({_id:"creds"}); res.send("DELETED - Now Redeploy in Render"); });
app.listen(process.env.PORT || 3000, ()=>console.log('Web LIVE'));

function convertBinary(obj){ if(!obj) return obj; if(obj instanceof Binary) return Buffer.from(obj.buffer); if(obj instanceof Buffer||obj instanceof Uint8Array) return obj; if(Array.isArray(obj)) return obj.map(convertBinary); if(typeof obj==='object'){ const n={}; for(const k in obj) n[k]=convertBinary(obj[k]); return n; } return obj; }

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
let mongoClient;
async function getMongoCollection(){
  if(!mongoClient){ mongoClient = new MongoClient(process.env.MONGODB_URI||process.env.MONGO_URL); await mongoClient.connect(); }
  return mongoClient.db("krishna_bot").collection("auth_state");
}
async function useMongoAuth(){
  const col = await getMongoCollection();
  const doc = await col.findOne({ _id: "creds" });
  let creds, keys;
  if(doc?.creds){ try{ creds=convertBinary(doc.creds); keys=convertBinary(doc.keys); }catch(e){ await col.deleteOne({_id:"creds"}); } }
  if(!creds){ const {state}=await useMultiFileAuthState('/tmp/temp_auth'); creds=state.creds; keys=state.keys; console.log("New creds created"); }
  const saveCreds = async()=>{ await col.updateOne({_id:"creds"},{$set:{creds,keys,updated:new Date()}},{upsert:true}); };
  return {state:{creds,keys:makeCacheableSignalKeyStore(keys,pino({level:'silent'}))},saveCreds};
}

async function startBot(){
  const {state,saveCreds}=await useMongoAuth();
  const sock = makeWASocket({auth:state,logger:pino({level:'silent'}),browser:["Krishna AI","Chrome","1.0"]});
  sock.ev.on('creds.update', saveCreds);

  if(!sock.authState.creds.registered){
    setTimeout(async()=>{
      if(Date.now()-lastCodeTime < 30000) return;
      lastCodeTime = Date.now();
      try{
        const code = await sock.requestPairingCode("918870799204");
        pairingCode = code.match(/.{1,4}/g)?.join("-") || code;
        console.log("PAIRING CODE:", pairingCode);
      }catch(e){ console.log("Pair error:", e.message); pairingCode = "Wait 30s and Refresh - "+e.message; }
    }, 8000);
  }

  sock.ev.on('connection.update', async(u)=>{
    const {connection,lastDisconnect}=u;
    console.log("Connection:",connection);
    if(connection==='close'){
      const code = lastDisconnect?.error?.output?.statusCode;
      console.log("Disconnect code:",code);
      if(sock.authState.creds.registered && code===401){ const col=await getMongoCollection(); await col.deleteOne({_id:"creds"}); pairingCode="Logged out - Redeploy"; }
      setTimeout(startBot, 10000);
    }
    if(connection==='open'){ console.log("✅ CONNECTED 24/7"); pairingCode="CONNECTED ✅"; }
  });

  sock.ev.on('messages.upsert', async({messages})=>{
    const msg=messages[0]; if(!msg.message) return; const jid=msg.key.remoteJid; let t=msg.message.conversation||msg.message.extendedTextMessage?.text||""; t=t.trim(); if(!t||jid.includes('status')||jid.includes('broadcast')||msg.key.fromMe) return;
    try{ await sock.sendPresenceUpdate('composing',jid); const c=await groq.chat.completions.create({model:"llama-3.3-70b-versatile",messages:[{role:"system",content:"You are Krishna's AI, Chennai Tanglish, under 50 words."},{role:"user",content:t}],max_tokens:200}); await sock.sendPresenceUpdate('paused',jid); await sock.sendMessage(jid,{text:c.choices[0].message.content}); }catch(e){ console.log(e.message); }
  });
}
startBot();
