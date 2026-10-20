const makeWASocket = require('@whiskeysockets/baileys').default;
const { useMultiFileAuthState, DisconnectReason, makeCacheableSignalKeyStore } = require('@whiskeysockets/baileys');
const { MongoClient, Binary } = require('mongodb');
const { Groq } = require('groq-sdk');
const pino = require('pino');
const express = require('express');

const app = express();
let pairingCode = "Starting... Wait 30s and Refresh";
let sock;

app.get('/', (req,res) => {
  res.send(`<h1>Krishna's AI 🤖 LIVE</h1><h2 style="color:green">Code: ${pairingCode}</h2><p>Number: 918870799204 | Refresh for new code</p><p>Enter code in WhatsApp: Linked Devices > Link with phone number</p>`);
});
app.listen(process.env.PORT || 3000, () => console.log('Web LIVE'));

function convertBinary(obj){
  if(!obj) return obj;
  if(obj instanceof Binary) return Buffer.from(obj.buffer);
  if(obj instanceof Buffer || obj instanceof Uint8Array) return obj;
  if(Array.isArray(obj)) return obj.map(convertBinary);
  if(typeof obj==='object'){
    const n={};
    for(const k in obj) n[k]=convertBinary(obj[k]);
    return n;
  }
  return obj;
}

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
let mongoClient;
async function getMongoCollection(){
  if(!mongoClient){
    mongoClient = new MongoClient(process.env.MONGODB_URI || process.env.MONGO_URL);
    await mongoClient.connect();
    console.log("MongoDB Connected ✅");
  }
  return mongoClient.db("krishna_bot").collection("auth_state");
}

async function useMongoAuth(){
  const col = await getMongoCollection();
  const doc = await col.findOne({ _id: "creds" });
  let creds, keys;
  if(doc?.creds){
    try{
      creds = convertBinary(doc.creds);
      keys = convertBinary(doc.keys);
      console.log("Loaded creds from MongoDB");
    }catch(e){
      console.log("Bad creds, deleting");
      await col.deleteOne({ _id: "creds" });
    }
  }
  if(!creds){
    const { state } = await useMultiFileAuthState('/tmp/temp_auth');
    creds = state.creds; keys = state.keys;
    console.log("New creds created");
  }
  const saveCreds = async () => {
    await col.updateOne({ _id: "creds" }, { $set: { creds, keys, updated: new Date() } }, { upsert: true });
    console.log("Creds saved");
  };
  return { state: { creds, keys: makeCacheableSignalKeyStore(keys, pino({level:'silent'})) }, saveCreds };
}

async function startBot(){
  const { state, saveCreds } = await useMongoAuth();
  sock = makeWASocket({
    auth: state,
    logger: pino({level:'silent'}),
    browser: ["Krishna AI","Chrome","1.0"],
    markOnlineOnConnect: true
  });
  sock.ev.on('creds.update', saveCreds);

  // Request pairing code
  async function requestCode(){
    if(sock.authState.creds.registered) return;
    const num = "918870799204";
    try{
      await new Promise(r=>setTimeout(r, 3000));
      const code = await sock.requestPairingCode(num);
      pairingCode = code.match(/.{1,4}/g)?.join("-") || code;
      console.log("PAIRING CODE:", pairingCode);
    }catch(e){
      console.log("Pair error:", e.message);
      pairingCode = "Retry in 20s: " + e.message;
      setTimeout(requestCode, 20000);
    }
  }
  setTimeout(requestCode, 5000);

  sock.ev.on('connection.update', async(u)=>{
    const { connection, lastDisconnect } = u;
    console.log("Connection:", connection);
    if(connection==='close'){
      const code = lastDisconnect?.error?.output?.statusCode;
      console.log("Disconnect code:", code);
      // Delete only if already logged in and got logged out
      if(sock.authState.creds.registered && (code===401 || code===DisconnectReason.loggedOut)){
        console.log("401 - Deleting bad creds");
        const col = await getMongoCollection();
        await col.deleteOne({ _id: "creds" });
        pairingCode = "Logged out - new code in 10s";
      }
      setTimeout(startBot, 5000);
      return;
    }
    if(connection==='open'){
      console.log("✅ CONNECTED 24/7");
      pairingCode = "CONNECTED ✅";
    }
  });

  sock.ev.on('messages.upsert', async({messages})=>{
    const msg=messages[0];
    if(!msg.message) return;
    const jid=msg.key.remoteJid;
    let text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
    text=text.trim();
    if(!text || jid.includes('status') || jid.includes('broadcast') || msg.key.fromMe) return;
    try{
      await sock.sendPresenceUpdate('composing', jid);
      const c = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [{role:"system", content: "You are Krishna's AI, friendly Chennai Tanglish assistant. Under 50 words."},{role:"user", content: text}],
        max_tokens: 200
      });
      await sock.sendPresenceUpdate('paused', jid);
      await sock.sendMessage(jid,{text: c.choices[0].message.content});
    }catch(e){ console.log(e.message); }
  });
}
startBot();
