const makeWASocket = require('@whiskeysockets/baileys').default;
const { useMultiFileAuthState, makeCacheableSignalKeyStore } = require('@whiskeysockets/baileys');
const { MongoClient, Binary } = require('mongodb');
const { Groq } = require('groq-sdk');
const pino = require('pino');
const express = require('express');

const app = express();
let pairingCode = "Starting... Wait 30s";
let isConnected = false;
let botPausedUntil = 0;

app.get('/', (req,res) => {
  res.send(`
  <html><head><meta http-equiv="refresh" content="15"><style>body{font-family:sans-serif;text-align:center;padding-top:30px}h1{font-size:42px;color:#25D366;letter-spacing:4px}.box{border:3px solid #25D366;padding:20px;display:inline-block;border-radius:15px}</style></head>
  <body><div class="box"><h2>Krishna's AI ${isConnected ? '✅ CONNECTED' : '⏳ WAITING'}</h2>
  <h1>${pairingCode}</h1>
  <p>Number: 918870799204</p>
  <p>Linked Devices > Link with phone number</p>
  <p>✅ Private Chat: ON<br>✅ Group Chat: ON<br>✅ Command: /stop (5 min)</p>
  <p><a href="/clear">Reset Session</a></p></div></body></html>`);
});
app.get('/clear', async (req,res)=>{ try{ const c=await getMongoCollection(); await c.deleteOne({_id:"creds"}); res.send("DELETED - Now Render > Clear cache & Deploy"); }catch(e){ res.send(e.message); }});
app.listen(process.env.PORT || 3000, ()=>console.log('Web LIVE'));

function convertBinary(o){ if(!o) return o; if(o instanceof Binary) return Buffer.from(o.buffer); if(o instanceof Buffer||o instanceof Uint8Array) return o; if(Array.isArray(o)) return o.map(convertBinary); if(typeof o==='object'){ const n={}; for(const k in o) n[k]=convertBinary(o[k]); return n; } return o; }

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
let mongoClient;
async function getMongoCollection(){ 
  if(!mongoClient){ mongoClient=new MongoClient(process.env.MONGODB_URI||process.env.MONGO_URL); await mongoClient.connect(); console.log("MongoDB Connected"); } 
  return mongoClient.db("krishna_bot").collection("auth_state"); 
}
async function useMongoAuth(){
  const col = await getMongoCollection();
  const doc = await col.findOne({ _id: "creds" });
  let creds, keys;
  if(doc?.creds){
    const k = convertBinary(doc.keys);
    if(!k || Object.keys(k).length===0){ await col.deleteOne({_id:"creds"}); }
    else { try{ creds=convertBinary(doc.creds); keys=k; console.log("Loaded creds"); }catch(e){ await col.deleteOne({_id:"creds"}); } }
  }
  if(!creds){ const {state}=await useMultiFileAuthState('/tmp/auth'); creds=state.creds; keys=state.keys; }
  const saveCreds = async()=>{ await col.updateOne({_id:"creds"},{$set:{creds,keys,updated:new Date()}},{upsert:true}); console.log("Saved"); };
  return {state:{creds,keys:makeCacheableSignalKeyStore(keys,pino({level:'silent'}))},saveCreds};
}

async function getAIReply(text, jid){
  const clean = text.toLowerCase().trim();

  if(clean === '/stop' || clean === '/stop 5min' || clean === 'stop'){
    botPausedUntil = Date.now() + 5*60*1000;
    console.log(`STOPPED by ${jid}`);
    return "✅ OK da! Bot 5 min ku stop! 5 min kazhichu auto on aayidum. - Krishna's AI Assistant";
  }

  if(Date.now() < botPausedUntil) return null;

  try{
    const c = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages:[
        {role:"system", content:"You are Krishna's AI Assistant. Speak ALL languages (Tamil, Tanglish, English, Hindi, Telugu, Malayalam). Reply in same language user used. If asked who are you, say 'I am Krishna's AI Assistant'. Helpful, friendly, under 80 words."},
        {role:"user", content: text}
      ],
      max_tokens:400, temperature:0.7
    });
    return c.choices[0].message.content;
  }catch(e){ console.log(e.message); return "Busy da, 2 sec la try pannu 😅"; }
}

async function startBot(){
  const {state,saveCreds}=await useMongoAuth();
  const sock = makeWASocket({ auth:state, logger:pino({level:'silent'}), browser:["Chrome","Windows","10"], syncFullHistory:false, connectTimeoutMs:60000, keepAliveIntervalMs:10000 });
  sock.ev.on('creds.update', saveCreds);

  if(!state.creds.registered){
    const genCode = async () => {
      if(isConnected) return;
      try{ const code = await sock.requestPairingCode("918870799204"); pairingCode = code.match(/.{1,4}/g)?.join("-") || code; console.log(`CODE: ${pairingCode}`); }
      catch(e){ pairingCode="Retrying..."; }
      if(!isConnected) setTimeout(genCode, 70000);
    };
    setTimeout(genCode, 5000);
  }

  sock.ev.on('connection.update', async(u)=>{
    const {connection,lastDisconnect}=u; console.log("Conn:",connection);
    if(connection==='open'){ isConnected=true; pairingCode="CONNECTED ✅"; console.log("✅ CONNECTED"); return; }
    if(connection==='close'){ const sc=lastDisconnect?.error?.output?.statusCode; isConnected=false; if(sc===401){ const col=await getMongoCollection(); await col.deleteOne({_id:"creds"}); } setTimeout(startBot, 15000); }
  });

  sock.ev.on('messages.upsert', async({messages})=>{
    const m=messages[0]; if(!m.message || m.key.fromMe) return; 
    const jid=m.key.remoteJid; 
    const isGroup = jid.endsWith('@g.us');
    if(jid.includes('status')||jid.includes('broadcast')) return;
    let t=m.message.conversation||m.message.extendedTextMessage?.text||m.message.imageMessage?.caption||""; t=t.trim(); if(!t) return;

    if(Date.now() < botPausedUntil){ console.log("Paused ignore"); return; }

    try{ 
      await sock.sendPresenceUpdate('composing',jid); 
      const reply = await getAIReply(t, jid);
      if(!reply) return;
      await sock.sendPresenceUpdate('paused',jid); 
      await sock.sendMessage(jid,{text:reply}); 
      console.log(`Replied to ${isGroup?'GROUP':'PRIVATE'}: ${jid}`);
    }catch(e){ console.log(e.message); }
  });

  setInterval(()=>{ if(botPausedUntil && Date.now() > botPausedUntil){ console.log("Auto resumed"); botPausedUntil=0; } }, 10000);
}
startBot();
