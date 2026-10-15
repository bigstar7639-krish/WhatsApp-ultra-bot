const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, downloadMediaMessage } = require('@whiskeysockets/baileys');
const { Groq } = require('groq-sdk');
const pino = require('pino');
const express = require('express');
const QRCode = require('qrcode');

const app = express();
let latestQR = null;

app.get('/', (req,res)=>{
    if(latestQR){
        res.send(`<h1>Scan QR da 🔥</h1><p>WhatsApp > Linked Devices > Link a device</p><img src="${latestQR}" style="width:300px"><br><a href="/qr">Refresh</a><br><br>ULTIMATE META AI CLONE - LIVE`);
    } else {
        res.send('ULTIMATE META AI CLONE - ALL FEATURES LIVE 🔥<br>QR illa da, Bot connect aayiduchu! <br> Illa na Render logs paaru');
    }
});
app.get('/qr', (req,res)=>{
    if(latestQR) res.send(`<h1>Scan QR da 🔥</h1><img src="${latestQR}" style="width:300px"><br><script>setTimeout(()=>location.reload(),5000)</script>`);
    else res.send('QR not ready da, 10 sec wait pannu, refresh pannu');
});
app.listen(process.env.PORT || 3000, ()=>console.log('Server LIVE'));

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const COOLDOWN = new Map();

async function startBot(){
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    const sock = makeWASocket({ auth: state, logger: pino({level:'silent'}), browser: ['MetaClone','Chrome','1.0'] });
    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('connection.update', async (u)=>{
        const { connection, lastDisconnect, qr } = u;
        if(qr){
            console.log('QR GENERATED DA! Scan pannu!');
            try{
                latestQR = await QRCode.toDataURL(qr);
                console.log('QR ready on website: /qr');
            }catch(e){ console.log(e) }
        }
        if(connection==='close'){
            latestQR = null;
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode!==DisconnectReason.loggedOut;
            console.log('Connection closed, reconnecting:', shouldReconnect);
            if(shouldReconnect) startBot();
        }
        if(connection==='open'){
            latestQR = null;
            console.log('🔥 ALL FEATURES BOT CONNECTED');
        }
    });

    sock.ev.on('messages.upsert', async ({messages})=>{
        const msg=messages[0]; if(!msg.message||msg.key.fromMe) return;
        const jid=msg.key.remoteJid;
        let text = msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || "";
        if(jid.includes('@g.us')||jid.includes('status')||jid.includes('broadcast')) return;
        if(text.includes('Number Status')||text.includes('Data Balance')||text.includes('Plan Active')) return;
        if(jid.includes('70008')) return;
        if(COOLDOWN.has(jid)&&Date.now()-COOLDOWN.get(jid)<8000) return;
        COOLDOWN.set(jid, Date.now());

        if(text.toLowerCase().startsWith('!img')||text.toLowerCase().startsWith('!image')||text.toLowerCase().startsWith('!photo')||text.toLowerCase().startsWith('!generate')){
            const prompt = text.replace(/!img|!image|!photo|!generate/gi, '').trim();
            if(!prompt){ await sock.sendMessage(jid,{text:"Dei enna photo create pannanum sollu da! Ex:!img batman eating biryani"}); return; }
            await sock.sendMessage(jid,{text:`🎨 "${prompt}" - create panren da 5 sec...`});
            try{
                const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=1024&nologo=true&seed=${Math.floor(Math.random()*1000)}`;
                await sock.sendMessage(jid,{ image:{url:url}, caption:`Indha da un photo 🔥\n"${prompt}"` });
            }catch(e){ await sock.sendMessage(jid,{text:"Photo error da, vera prompt try pannu"}); }
            return;
        }

        let imageBase64 = null; let isImage = false;
        if(msg.message.imageMessage){
            try{
                const buffer = await downloadMediaMessage(msg, 'buffer', {});
                imageBase64 = buffer.toString('base64');
                isImage = true;
                if(!text) text = "Ithu enna photo nu sollu da";
            }catch(e){}
        }
        if(!text &&!isImage) return;

        try{
            const systemPrompt = `You are Ultimate Meta AI Clone for WhatsApp. You do EVERYTHING like Meta AI:
            POWERS:
            - Chat Tanglish/English friendly
            - See & explain photos (if photo sent, describe it fully)
            - Write code with Tamil explanation
            - Translate, Explain, Motivate, Roast, Jokes, Stories, Maths, Business ideas, Captions
            - Keep reply 2-4 lines max, WhatsApp style, 1 emoji
            - If user speaks Tamil, reply Tanglish with da/machi
            - You are user's personal bot`;

            let aiMessages; let model = "openai/gpt-oss-20b";
            if(isImage){
                model = "meta-llama/llama-4-scout-17b-16e-instruct";
                aiMessages = [{role:"system",content:systemPrompt},{role:"user",content:[{type:"text",text:text},{type:"image_url",image_url:{url:`data:image/jpeg;base64,${imageBase64}`}}]}];
            } else {
                aiMessages = [{role:"system",content:systemPrompt},{role:"user",content:text}];
            }

            const completion = await groq.chat.completions.create({ model, messages: aiMessages, max_tokens: 600, temperature: 0.85 });
            await sock.sendMessage(jid,{text:completion.choices[0].message.content});
        }catch(e){ console.log(e.message); }
    });
}
startBot();
