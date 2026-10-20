const makeWASocket = require('@whiskeysockets/baileys').default;
const { useMultiFileAuthState, DisconnectReason, makeCacheableSignalKeyStore } = require('@whiskeysockets/baileys');
const { MongoClient } = require('mongodb');
const { Groq } = require('groq-sdk');
const pino = require('pino');
const express = require('express');

const app = express();
let pairingCode = "Starting...";
app.get('/', (req,res)=>res.send(`<h1>Krishna's AI 🤖 LIVE 24/7</h1><h2>Code: ${pairingCode}</h2>`));
app.listen(process.env.PORT || 3000, ()=>console.log('Web LIVE'));

setInterval(()=>{ 
  fetch(`http://${process.env.RENDER_EXTERNAL_HOSTNAME || 'localhost:3000'}`).catch(()=>{});
  console.log("KeepAlive ping");
}, 10*60*1000);

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const PAUSED = new Map();
const COOLDOWN = new Map();

let mongoClient;
async function getMongoCollection(){
  if(!mongoClient){
    const uri = process.env.MONGODB_URI || process.env.MONGO_URL;
    if(!uri) throw new Error("MONGODB_URI not set!");
    mongoClient = new MongoClient(uri);
    await mongoClient.connect();
    console.log("MongoDB Connected ✅");
  }
  return mongoClient.db("krishna_bot").collection("auth_state");
}

async function useMongoAuth(){
  const col = await getMongoCollection();
  const doc = await col.findOne({ _id: "creds" });
  
  let creds, keys;
  if(doc && doc.creds){
    creds = doc.creds;
    keys = doc.keys;
  } else {
    const { state } = await useMultiFileAuthState('/tmp/temp_auth');
    creds = state.creds;
    keys = state.keys;
  }

  const saveCreds = async () => {
    await col.updateOne({ _id: "creds" }, { $set: { creds, keys } }, { upsert: true });
  };

  return {
    state: {
      creds,
      keys: makeCacheableSignalKeyStore(keys, pino({level:'silent'}))
    },
    saveCreds
  };
}

const MOODS = {
  funny: "You are Krishna's AI. Funny Chennai friend, Tanglish, 😂. Under 40 words.",
  serious: "You are Krishna's AI made by Krishna. Professional, short. Under 50 words.",
  happy: "You are Krishna's AI. Positive hype friend! ✨. Under 40 words.",
  friendly: "You are Krishna's AI. Best friend, warm Chennai Tanglish. Under 40 words."
};

function detectMood(t){
  t=t.toLowerCase();
  if(t.includes('joke')||t.includes('😂')) return 'funny';
  if(t.includes('sad')||t.includes('lonely')) return 'happy';
  if(t.includes('?')||t.includes('help')) return 'serious';
  return 'friendly';
}

function parseReminder(text){
  if(!text.toLowerCase().includes('remind')) return null;
  const m = text.toLowerCase().match(/in (\d+)\s*(min|minute)/);
  if(!m) return null;
  return { minutes: parseInt(m[1]), task: text.replace(/.*to /i,'') };
}

async function startBot(){
  const { state, saveCreds } = await useMongoAuth();
  
  const sock = makeWASocket({
    auth: state,
    logger: pino({level:'silent'}),
    browser: ["Krishna AI","Chrome","1.0"],
    markOnlineOnConnect: true,
    keepAliveIntervalMs: 30000
  });

  sock.ev.on('creds.update', saveCreds);

  if(!sock.authState.creds.registered){
    const num = (process.env.PHONE_NUMBER||"").replace(/[^0-9]/g,"");
    if(num){
      setTimeout(async()=>{
        try{
          const code = await sock.requestPairingCode(num);
          pairingCode = code.match(/.{1,4}/g)?.join("-") || code;
          console.log("PAIRING CODE:", pairingCode);
        }catch(e){ pairingCode = e.message; console.log(e.message); }
      },5000);
    }
  }

  sock.ev.on('connection.update', async (u)=>{
    const { connection, lastDisconnect } = u;
    console.log("Connection:", connection);
    if(connection==='close'){
      const code = lastDisconnect?.error?.output?.statusCode;
      if(code !== DisconnectReason.loggedOut){
        console.log("Reconnecting in 5s...");
        setTimeout(startBot, 5000);
      } else {
        const col = await getMongoCollection();
        await col.deleteOne({ _id: "creds" });
        pairingCode = "Logged out - restart needed";
      }
    }
    if(connection==='open'){
      console.log("✅ CONNECTED 24/7");
      pairingCode = "CONNECTED ✅ 24/7";
    }
  });

  sock.ev.on('messages.upsert', async ({messages})=>{
    const msg=messages[0];
    if(!msg.message) return;
    const jid=msg.key.remoteJid;
    let text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
    text=text.trim();
    if(!text || jid.includes('status')||jid.includes('broadcast')) return;

    if(msg.key.fromMe){
      if(text.toLowerCase()==='/stop'){ PAUSED.set(jid, Date.now()); await sock.sendMessage(jid,{text:"Ok da ✅ 5 min pause"}); return; }
      if(text.toLowerCase()==='/start'){ PAUSED.delete(jid); await sock.sendMessage(jid,{text:"Back da 💜"}); return; }
      return;
    }

    if(PAUSED.has(jid) && Date.now()-PAUSED.get(jid)<5*60*1000) return;
    PAUSED.delete(jid);
    if(COOLDOWN.has(jid) && Date.now()-COOLDOWN.get(jid)<5000) return;
    COOLDOWN.set(jid, Date.now());

    const rem = parseReminder(text);
    if(rem){
      await sock.sendMessage(jid,{text:`✅ Reminder set ${rem.minutes} min`});
      setTimeout(()=>sock.sendMessage(jid,{text:`⏰ Reminder: ${rem.task}`}), rem.minutes*60*1000);
      return;
    }

    try{
      await sock.sendPresenceUpdate('composing', jid);
      const mood = detectMood(text);
      const c = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [{role:"system", content: MOODS[mood]}, {role:"user", content: text}],
        max_tokens: 200
      });
      await sock.sendPresenceUpdate('paused', jid);
      await sock.sendMessage(jid,{text: c.choices[0].message.content});
    }catch(e){ console.log(e.message); }
  });
}

startBot();
process.on('uncaughtException', (e)=>{ console.log("Error:", e.message); setTimeout(startBot, 5000); });
