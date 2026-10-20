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

if (process.env.GROQ_API_KEY) {
    const { default: Groq } = await import('groq-sdk');
    groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
}

async function askAI(prompt) {
    if (!groqClient) return null;
    const r = await groqClient.chat.completions.create({
        model: "llama3-8b-8192",
        messages: [
            { role: "system", content: "You are @obito energy ai assistant, created by Krishna. Friendly, powerful, Tamil Tanglish mix. Always introduce as @obito energy ai assistant when asked who are you. Keep replies short, cool, energetic like Obito. Use emojis." },
            { role: "user", content: prompt }
        ]
    });
    return r.choices[0].message.content;
}

async function start() {
    const num = (process.env.PHONE_NUMBER || '').replace(/[^0-9]/g, '');
    const { version } = await fetchLatestBaileysVersion();
    const { state, saveCreds } = await useMultiFileAuthState('./auth');
    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        auth: state,
        browser: ['Obito Energy', 'Chrome', '1.0'],
        keepAliveIntervalMs: 10000,
        markOnlineOnConnect: true,
    });

    if (!sock.authState.creds.registered && num) {
        setTimeout(async () => {
            try { CODE = await sock.requestPairingCode(num); } catch {}
        }, 3000);
    }

    sock.ev.on('connection.update', async (a) => {
        if (a.qr) QR = await qrcode.toDataURL(a.qr);
        if (a.connection === 'open') { QR = null; CODE = null; console.log("✅ @obito Connected"); }
        if (a.connection === 'close' && a.lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) {
            setTimeout(() => start(), 5000);
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
            await sock.sendMessage(jid, { text: "⚡ @obito energy ai - 5 min rest 😴 Auto varen!" });
            setTimeout(async () => {
                stoppedUntil = 0;
                try { await sock.sendMessage(jid, { text: "⚡ @obito energy ai back da! Full power ready! 🔥" }); } catch {}
            }, 5 * 60 * 1000);
            return;
        }

        if (Date.now() < stoppedUntil) return;

        if (lower === '.ping') {
            await sock.sendMessage(jid, { text: "⚡ @obito energy ai assistant Online ✅\nKeepAlive ON - 24/7 🔥" });
            return;
        }

        if (m.message.imageMessage) {
            try {
                const buffer = await downloadMediaMessage(m, 'buffer', {}, { logger: pino({ level: 'silent' }), reuploadRequest: sock.updateMediaMessage });
                const webp = await sharp(buffer).resize(512, 512).webp().toBuffer();
                await sock.sendMessage(jid, { sticker: webp });
                return;
            } catch {}
        }

        if (!txt || !groqClient) return;
        try {
            const ans = await askAI(txt);
            if (ans) await sock.sendMessage(jid, { text: ans });
        } catch {}
    });
}

app.get('/', (req, res) => {
    const isStopped = Date.now() < stoppedUntil;
    const remaining = isStopped ? Math.ceil((stoppedUntil - Date.now()) / 1000 / 60) : 0;
    const status = isStopped ? `⏸️ @obito rest - ${remaining} min la auto` : `⚡ @obito energy ai - 24/7 Running`;
    const code = CODE ? `<h1 style="background:#000;color:#0f0;padding:20px;">${CODE.slice(0,4)}-${CODE.slice(4)}</h1><b>${CODE}</b><br>WhatsApp -> Link with phone number` : 'Connected ✅';
    const qr = QR ? `<img src="${QR}" width="300">` : '';
    res.send(`<center><h1>⚡ @obito energy ai V16 FINAL</h1><h2>${status}</h2>${code}<hr>${qr}<br><a href="/clear">Clear</a><br><p>.ping | .stop = 5min auto</p><script>setTimeout(()=>location.reload(),15000)</script></center>`);
});

app.get('/clear', (req, res) => {
    try { fs.rmSync('./auth', { recursive: true, force: true }); } catch {}
    res.send('cleared');
    setTimeout(() => process.exit(1), 1000);
});

app.listen(PORT, () => {
    start();
    setInterval(() => {
        const url = process.env.RENDER_EXTERNAL_URL;
        if (url) fetch(url).catch(()=>{});
    }, 10 * 60 * 1000);
});
