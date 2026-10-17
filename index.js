const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Groq } = require('groq-sdk');
const pino = require('pino');
const express = require('express');

const app = express();
let pairingCodeData = "Generating...";

app.get('/', (req,res) => res.send(`<h1>Pairing Code: ${pairingCodeData}</h1><p>Bot is LIVE</p>`));
app.get('/qr', (req,res) => res.send(`<h1>Pairing Code: ${pairingCodeData}</h1>`));
app.listen(process.env.PORT || 3000, ()=>console.log('Server LIVE'));

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const COOLDOWN = new Map();
const PAUSED = new Map(); // For /stop feature

async function startBot(){
  const { state, saveCreds } = await useMultiFileAuthState('auth_info');
  const sock = makeWASocket({ 
    auth: state, 
    logger: pino({level:'silent'}),
    printQRInTerminal: false 
  });
  sock.ev.on('creds.update', saveCreds);

  if(!sock.authState.creds.registered){
    const phoneNumber = (process.env.PHONE_NUMBER || "").replace(/[^0-9]/g,"");
    if(phoneNumber){
      setTimeout(async()=>{
        try{
          const code = await sock.requestPairingCode(phoneNumber);
          pairingCodeData = code;
          console.log(`PAIRING CODE: ${code} for ${phoneNumber}`);
        }catch(e){ console.log("Pairing error", e.message) }
      },3000);
    }else{
      pairingCodeData = "Set PHONE_NUMBER env var!";
    }
  }

  sock.ev.on('connection.update', (u)=>{
    if(u.connection === 'close'){
        const shouldReconnect = u.lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
        if(shouldReconnect) startBot();
    }
    if(u.connection === 'open'){ 
        console.log('🔥 CONNECTED'); 
        pairingCodeData = "CONNECTED ✅";
    }
  });

  sock.ev.on('messages.upsert', async ({messages})=>{
    const msg=messages[0]; 
    if(!msg.message) return;
    
    const jid=msg.key.remoteJid;
    let text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
    text = text.trim();
    if(!text) return;

    // Feature: If YOU send /stop, pause bot for that chat for 5 mins
    if(msg.key.fromMe){
      if(text.toLowerCase() === '/stop' || text.toLowerCase() === '/pause'){
        PAUSED.set(jid, Date.now());
        await sock.sendMessage(jid,{text:"Ok ✅ 5 mins ku bot pause. Nee pesu da. 5 min ku aprom naane auto start aayiduren."});
        return;
      }
      return; // Don't reply to your own other messages
    }

    // If chat is paused, check time
    if(PAUSED.has(jid)){
      if(Date.now() - PAUSED.get(jid) < 5*60*1000){
        return; // Still paused
      }else{
        PAUSED.delete(jid); // 5 mins over, auto start
        // await sock.sendMessage(jid,{text:"I'm back da! 😎 5 mins over."});
      }
    }

    if(jid.includes('@g.us') || jid.includes('status') || jid.includes('@broadcast')) return;
    if(COOLDOWN.has(jid) && Date.now()-COOLDOWN.get(jid)<8000) return;
    COOLDOWN.set(jid, Date.now());
    
    try{
      const systemPrompt = `You are D - a friendly WhatsApp assistant.
Reply in the SAME language user uses. Support ALL languages (Tamil, English, Hindi, etc). Auto-detect.
Be friendly, short, helpful, casual like a friend. Use Tanglish if user uses Tanglish.
Never claim you are Meta AI, ChatGPT, or made by Meta/Google.`;

      const c = await groq.chat.completions.create({
        model:"openai/gpt-oss-20b", 
        messages: [{role:"system",content:systemPrompt},{role:"user",content:text}]
      });
      await sock.sendMessage(jid,{text: c.choices[0].message.content});
    }catch(e){ console.log(e.message); }
  });
}
startBot();
