const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, downloadMediaMessage } = require('@whiskeysockets/baileys');
const { Groq } = require('groq-sdk');
const pino = require('pino');
const express = require('express');

const app = express();
let pairingCodeData = "Generating...";
app.get('/', (req,res)=> res.send(`<h1>Pairing Code: ${pairingCodeData}</h1><p>WhatsApp > Linked Devices > Link with phone number > Enter code</p><a href="/">Refresh</a>`));
app.get('/qr', (req,res)=> res.send(`<h1>Pairing Code: ${pairingCodeData}</h1><p>WhatsApp > Linked Devices > Link with phone number</p><script>setTimeout(()=>location.reload(),5000)</script>`));
app.listen(process.env.PORT || 3000, ()=>console.log('Server LIVE'));

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const COOLDOWN = new Map();

async function startBot(){
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    const sock = makeWASocket({ auth: state, logger: pino({level:'silent'}), browser: ['Chrome','Chrome','1.0'] });
    sock.ev.on('creds.update', saveCreds);

    if(!sock.authState.creds.registered){
        const phoneNumber = (process.env.PHONE_NUMBER || "").replace(/[^0-9]/g,'');
        if(phoneNumber){
            setTimeout(async()=>{
                try{
                    const code = await sock.requestPairingCode(phoneNumber);
                    pairingCodeData = code;
                    console.log(`PAIRING CODE: ${code} for ${phoneNumber}`);
                }catch(e){ console.log("Pairing error", e.message) }
            },3000);
        } else {
            pairingCodeData = "Set PHONE_NUMBER env var in Render! Ex: 919876543210";
            console.log("Set PHONE_NUMBER env");
        }
    }

    sock.ev.on('connection.update', (u)=>{
        if(u.connection==='close' && u.lastDisconnect?.error?.output?.statusCode!==DisconnectReason.loggedOut) startBot();
        if(u.connection==='open'){ console.log('🔥 CONNECTED'); pairingCodeData = "CONNECTED!"; }
    });

    sock.ev.on('messages.upsert', async ({messages})=>{
        const msg=messages[0]; if(!msg.message||msg.key.fromMe) return;
        const jid=msg.key.remoteJid;
        let text = msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || "";
        if(jid.includes('@g.us')||jid.includes('status')||jid.includes('broadcast')) return;
        if(COOLDOWN.has(jid)&&Date.now()-COOLDOWN.get(jid)<8000) return;
        COOLDOWN.set(jid, Date.now());
        if(text.toLowerCase().startsWith('!img')){ const prompt=text.replace(/!img/gi,'').trim(); await sock.sendMessage(jid,{text:`🎨 "${prompt}" creating...`}); try{ const url=`https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=1024&nologo=true`; await sock.sendMessage(jid,{image:{url},caption:prompt}); }catch(e){} return; }
        let imageBase64=null,isImage=false;
        if(msg.message.imageMessage){ try{ const b=await downloadMediaMessage(msg,'buffer',{}); imageBase64=b.toString('base64'); isImage=true; if(!text) text="Ithu enna?"; }catch(e){} }
        if(!text&&!isImage) return;
        try{
            const systemPrompt=`You are Ultimate Meta AI Clone for WhatsApp. Chat Tanglish, 2-4 lines, 1 emoji, da/machi if Tamil.`;
            let aiMessages,model="openai/gpt-oss-20b";
            if(isImage){ model="meta-llama/llama-4-scout-17b-16e-instruct"; aiMessages=[{role:"system",content:systemPrompt},{role:"user",content:[{type:"text",text},{type:"image_url",image_url:{url:`data:image/jpeg;base64,${imageBase64}`}}]}]; }
            else aiMessages=[{role:"system",content:systemPrompt},{role:"user",content:text}];
            const c=await groq.chat.completions.create({model,messages:aiMessages,max_tokens:600,temperature:0.85});
            await sock.sendMessage(jid,{text:c.choices[0].message.content});
        }catch(e){ console.log(e.message); }
    });
}
startBot();
