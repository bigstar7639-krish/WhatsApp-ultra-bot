import makeWASocket, { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, downloadMediaMessage } from '@whiskeysockets/baileys';
import express from 'express';
import pino from 'pino';
import qrcode from 'qrcode';
import fs from 'fs';
import sharp from 'sharp';

const app = express();
const PORT = process.env.PORT || 8000;
let QR = null;
let CODE = null;
let groqClient = null;
let stoppedUntil = 0;

console.log("⚡ @obito energy ai V17 FINAL Starting...");

if (process.env.GROQ_API_KEY) {
    const { default: Groq } = await import('groq-sdk');
    groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
    console.log("✅ GROQ API Connected");
}

async function askAI(prompt) {
    if (!groqClient) return null;
    try {
        const r = await groqClient.chat.completions.create({
            model: "llama3-8b-8192",
            messages: [
                { role: "system", content: "You are @obito energy ai assistant, created by Krishna. Tamil Tanglish mix, short, energetic, always say @obito energy ai assistant." },
                { role: "user", content: prompt }
            ]
        });
        return r.choices[0].message.content;
    } catch (e) { console.log("AI Error:", e.message); return null; }
}

async function start() {
    const rawNum = process.env.PHONE_NUMBER || '';
    const num = rawNum.replace(/[^0-9]/g, '');
    console.log(`📱 PHONE: ${rawNum} -> Clean: ${num}`);

    const { version } = await fetchLatestBaileysVersion();
    const { state, saveCreds } = await useMultiFileAuthState('./auth');

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        auth: state,
        browser: ['Obito Energy V17', 'Chrome', '1.0'],
        keepAliveIntervalMs: 10000,
        markOnlineOnConnect: true,
        syncFullHistory: false,
    });

    if (!sock.authState.creds.registered) {
        console.log("⏳ Generating Pairing Code...");
        setTimeout(async () => {
            try {
                if (num.length < 10) throw new Error("Invalid PHONE_NUMBER");
                CODE = await sock.requestPairingCode(num);
                console.log("========================================");
                console.log(`🔥 PAIRING CODE: ${CODE}`);
                console.log(`🔥 CODE: ${CODE.slice(0,4)}-${CODE.slice(4)}`);
                console.log("📱 WhatsApp -> Linked Devices -> Link with phone number");
                console.log("========================================");
            } catch (e) {
                console.log("❌ Pairing Error:", e.message);
            }
        }, 3000);
    } else {
        console.log("✅ Already Paired");
    }

    sock.ev.on('connection.update', async (a) => {
        if (a.qr) {
            QR = await qrcode.toDataURL(a.qr);
            console.log("📷 QR Ready");
        }
        if (a.connection === 'open') {
            QR = null; CODE = null;
            console.log("✅✅✅ @obito CONNECTED ✅✅✅");
        }
        if (a.connection === 'close') {
            const reason = a.lastDisconnect?.error?.output?.statusCode;
            console.log(`❌ Closed Reason: ${reason}`);
            if (reason !== DisconnectReason.loggedOut) setTimeout(() => start(), 5000);
            else console.log("🔴 LOGGED OUT - Visit /clear");
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const m = messages[0];
        if (!m?.message || m.key.fromMe) return;
        const txt = (m.message.conversation || m.message.extendedTextMessage?.text || m.message.imageMessage?.caption || "").trim();
        const lower = txt.toLowerCase();
        const jid = m.key.remoteJid;

        if (lower === '.stop') {
            stoppedUntil = Date.now() + 5 * 60 * 1000;
            await sock.sendMessage(jid, { text: "⚡ @obito 5 min rest 😴 Auto varen da!" });
            console.log("⏸️ Stopped 5 min");
            setTimeout(async () => { stoppedUntil = 0; try { await sock.sendMessage(jid, { text: "⚡ @obito back da! Full power 🔥" }); } catch {} }, 5 * 60 * 1000);
            return;
        }
        if (Date.now() < stoppedUntil) return;

        if (lower === '.ping') {
            await sock.sendMessage(jid, { text: "⚡ @obito energy ai Online ✅ V17 24/7" });
            return;
        }

        if (m.message.imageMessage) {
            try {
                const buffer = await downloadMediaMessage(m, 'buffer', {}, { logger: pino({ level: 'silent' }), reuploadRequest: sock.updateMediaMessage });
                const webp = await sharp(buffer).resize(512, 512).webp().toBuffer();
                await sock.sendMessage(jid, { sticker: webp });
            } catch {}
            return;
        }

        if (!txt || !groqClient) return;
        try { const ans = await askAI(txt); if (ans) await sock.sendMessage(jid, { text: ans }); } catch {}
    });
}

app.get('/', (req, res) => {
    const isStopped = Date.now() < stoppedUntil;
    const status = isStopped ? `Rest ${Math.ceil((stoppedUntil-Date.now())/60000)}m` : `⚡ @obito V17 Running 24/7`;
    const codeHtml = CODE ? `<h1 style="background:#000;color:#0f0;padding:20px;font-size:36px;">${CODE.slice(0,4)}-${CODE.slice(4)}</h1><b style="font-size:24px;">${CODE}</b><br><small>Logs la same code irukkum</small>` : '<h2>Connected ✅ / Generating...</h2><p>Check Render Logs for PAIRING CODE</p>';
    const qrImg = QR ? `<img src="${QR}" width="320">` : '';
    res.send(`<center><h1>⚡ @obito V17 FINAL</h1><h2>${status}</h2>${codeHtml}<hr>${qrImg}<br><a href="/clear">Clear Auth</a><br><p>.ping | .stop</p><script>setTimeout(()=>location.reload(),10000)</script></center>`);
});

app.get('/clear', (req, res) => {
    try { fs.rmSync('./auth', { recursive: true, force: true }); console.log("🗑️ Auth cleared"); } catch {}
    res.send('Cleared - Restarting...');
    setTimeout(() => process.exit(1), 1000);
});

app.listen(PORT, () => {
    console.log(`🚀 Server ${PORT}`);
    start();
    setInterval(() => {
        const url = process.env.RENDER_EXTERNAL_URL;
        if (url) fetch(url).then(()=>console.log("🔄 Keep Alive ping")).catch(()=>{});
    }, 8 * 60 * 1000);
});
