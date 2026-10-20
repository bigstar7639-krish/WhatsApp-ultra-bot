const makeWASocket = require('@whiskeysockets/baileys').default;
const { useMultiFileAuthState, makeCacheableSignalKeyStore } = require('@whiskeysockets/baileys');
const { MongoClient, Binary } = require('mongodb');
const { Groq } = require('groq-sdk');
const pino = require('pino');
const express = require('express');

const app = express();
let pairingCode = "Starting... Wait 45s Then Refresh";
let codeGenerated = false;

app.get('/', (req,res) => res.send(`<h1>Krishna AI LIVE</h1><h2 style="color:green">${pairingCode}</h2><p>Number: 918870799204</p><p>Link: WhatsApp > Linked Devices > Link with phone number</p>`));
app.get('/clear', async (req,res)=>{ try{ const c=await getMongoCollection(); await c.deleteOne({_id:"creds"}); res.send("DELETED OK - Now Clear Cache & Deploy"); }catch(e){ res.send(e.message); }});
app.listen(process.env.PORT || 3000, ()=>console.log('Web LIVE'));

function convertBinary(o){ if(!o) return o; if(o instanceof Binary) return Buffer.from(o.buffer); if(o instanceof Buffer||o instanceof Uint8Array) return o; if(Array.isArray(o)) return o.map(convertBinary); if(typeof o==='object'){ const n={}; for(const k in o) n[k]=convertBinary(o[k]); return n; } return o; }
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
let mongoClient;
async function getMongoCollection(){ if(!mongoClient){ mongoClient=new MongoClient(process.env.MONGODB_URI||process.env.MONGO_URL); await mongoClient.connect(); console.log("MongoDB Connected"); } return mongoClient.db("krishna_bot").collection("auth_state"); }

async function useMongoAuth(){
  const col = await getMongoCollection();
  const doc = await col.findOne({ _id: "creds" });
  let creds, keys;
  if(doc?.creds){
    const k = convertBinary(doc.keys);
    // FIX: If keys empty, delete it - its corrupt
    if(!k || Object.keys(k).length===0 || (k['preKeys'] && Object.keys(k['preKeys']).length===0)){
      console.log("Empty keys found - Deleting corrupt doc");
      await col.deleteOne({_id:"creds"});
    } else {
      try{ creds=convertBinary(doc.creds); keys=k; console.log("Loaded creds"); }catch(e){ await col.deleteOne({_id:"creds"}); }
    }
  }
  if(!creds){
    const {state}=await useMultiFileAuthState('/tmp/auth'); creds=state.creds; keys=state.keys;
    console.log("New creds created");
  }
  const saveCreds = async()=>{ await col.updateOne({_id:"creds"},{$set:{creds,keys,updated:new Date()}},{upsert:true}); };
  return {state:{creds,keys:makeCacheableSignalKeyStore(keys,pino({level:'silent'}))},saveCreds};
}

async function startBot(){
  const {state,saveCreds}=await useMongoAuth();
  const sock = makeWASocket({auth:state,logger:pino({level:'silent'}),browser:["Chrome","Windows","10"],syncFullHistory:false});
  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async(u)=>{
    const {connection,lastDisconnect}=u;
    console.log("Connection:",connection);
    if(connection==='open'){ console.log("✅ CONNECTED 24/7"); pairingCode="CONNECTED ✅"; return; }
    if(connection==='close'){
      const sc = lastDisconnect?.error?.output?.statusCode;
      console.log("Disconnect:",sc, lastDisconnect?.error?.message);
      if(sc===401 && sock.authState.creds.registered){ const col=await getMongoCollection(); await col.deleteOne({_id:"creds"}); pairingCode="Logged out"; }
      setTimeout(startBot, 8000);
    }
  });

  // Request code only once after socket is stable
  if(!state.creds.registered && !codeGenerated){
    codeGenerated = true;
    setTimeout(async()=>{
      try{
        console.log("Requesting pairing code...");
        const code = await sock.requestPairingCode("918870799204");
        pairingCode = code.match(/.{1,4}/g)?.join("-") || code;
        console.log("PAIRING CODE:", pairingCode);
      }catch(e){ console.log("Pair error:", e.message); pairingCode="Error: "+e.message+" - Refresh in 30s"; codeGenerated=false; }
    }, 10000);
  }

  sock.ev.on('messages.upsert', async({messages})=>{
    const m=messages[0]; if(!m.message) return; const jid=m.key.remoteJid; let t=m.message.conversation||m.message.extendedTextMessage?.text||""; t=t.trim(); if(!t||jid.includes('status')||jid.includes('broadcast')||m.key.fromMe) return;
    try{ await sock.sendPresenceUpdate('composing',jid); const c=await groq.chat.completions.create({model:"llama-3.3-70b-versatile",messages:[{role:"system",content:"You are Krishna AI, Chennai Tanglish friendly, under 40 words."},{role:"user",content:t}],max_tokens:150}); await sock.sendPresenceUpdate('paused',jid); await sock.sendMessage(jid,{text:c.choices[0].message.content}); }catch(e){ console.log(e.message); }
  });
}
startBot();
