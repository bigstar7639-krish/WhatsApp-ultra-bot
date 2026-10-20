import makeWASocket, { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers, downloadMediaMessage } from '@whiskeysockets/baileys';
import express from 'express';
import pino from 'pino';
import fs from 'fs';
import sharp from 'sharp';

const app = express();
const PORT = process.env.PORT || 8000;
const MY_NUMBER = "918870799204";

let CODE = null;
let STATUS = "Starting...";
let IS_CONNECTED = false;
let groqClient = null;

if (process.env.GROQ_API_KEY) {
    const { default: Groq } = await import('groq-sdk');
    groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
}

async function askAI(prompt) {
    if (!groqClient) return null;
    try {
        const r = await groqClient.chat.completions.create({
            model: "llama3-8b-8192",
            messages: [
                { role: "system", content: `You are @obito bot by Krishna. Detect user language and reply same language. Short, energetic. Support all languages.` },
                { role: "user", content: prompt }
            ]
        });
        return r.choices[0].message.content;
    } catch { return null; }
}

async function start() {
    const { version } = await fetchLatestBaileysVersion();
    const { state, saveCreds } = await useMultiFileAuthState('./auth');
    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        auth: state,
        browser: Browsers.macOS('Safari'),
    });

    if (!sock.authState.creds.registered) {
        setTimeout(async () => {
            try {
                CODE = await sock.requestPairingCode(MY_NUMBER);
                STATUS = `CODE: ${CODE}`;
                console.log(`🔥 NEW CODE: ${CODE}`);
            } catch (e) { STATUS = e.message; }
        }, 4000);
    }

    sock.ev.on('connection.update', async (a) => {
        const { connection, lastDisconnect } = a;
        if (connection === 'open') {
            IS_CONNECTED = true; CODE = null;
            STATUS = `✅ CONNECTED ${MY_NUMBER}`;
            console.log("✅ CONNECTED");
        }
        if (connection === 'close') {
            const reason = lastDisconnect?.error?.output?.statusCode;
            console.log(`❌ Close: ${reason}`);
            IS_CONNECTED = false;
            CODE = null;
            if (reason === DisconnectReason.loggedOut) {
                console.log("LOGGED OUT - Clearing auth...");
                try { fs.rmSync('./auth', { recursive: true, force: true }); } catch {}
                STATUS = "Logged out - New code in 5 sec - Go to /";
                setTimeout(() => start(), 5000);
            } else {
                setTimeout(() => start(), 3000);
            }
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const m = messages[0];
        if (!m?.message || m.key.fromMe) return;
        const txt = (m.message.conversation || m.message.extendedTextMessage?.text || "").trim();
        const jid = m.key.remoteJid;
        if (!txt || !groqClient) return;
        if (m.message.imageMessage) {
            try {
                const buf = await downloadMediaMessage(m, 'buffer', {}, { logger: pino({ level: 'silent' }), reuploadRequest: sock.updateMediaMessage });
                const webp = await sharp(buf).resize(512,512).webp().toBuffer();
                await sock.sendMessage(jid, { sticker: webp });
            } catch {}
            return;
        }
        try { const ans = await askAI(txt); if (ans) await sock.sendMessage(jid, { text: ans }); } catch {}
    });
}

app.get('/', (req, res) => {
    const html = IS_CONNECTED ? `<h1 style="background:green;color:white;padding:20px;">✅ CONNECTED ${MY_NUMBER}</h1>` :
    CODE ? `<div style="background:#000;color:#0f0;padding:20px;text-align:center;"><h1 style="font-size:60px;">${CODE}</h1><h2 style="color:yellow;">${CODE.slice(0,4)}-${CODE.slice(4)}</h2><p style="color:white;">WhatsApp > Settings > Linked Devices > Link a device > Link with phone number > Enter this</p><p style="color:red;">Valid 60s</p></div>` :
    `<h2>${STATUS} - Wait 5 sec refresh</h2>`;
    res.send(`<center><h1>${MY_NUMBER}</h1>${html}<br><a href="/">Refresh</a> | <a href="/clear" style="color:red;">Clear</a><script>setTimeout(()=>location.reload(),10000)</script></center>`);
});

app.get('/clear', (req, res) => {
    try { fs.rmSync('./auth', { recursive: true, force: true }); } catch {}
    res.send('<h1>Cleared - Restarting in 3 sec</h1><script>setTimeout(()=>location.href="/",3000)</script>');
    setTimeout(() => { CODE = null; start(); }, 2000);
});

app.listen(PORT, () => { start(); });
