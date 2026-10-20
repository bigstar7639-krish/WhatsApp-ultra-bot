import makeWASocket, { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers, makeCacheableSignalKeyStore } from 'baileys';
import express from 'express';
import pino from 'pino';
import fs from 'fs';
import QRCode from 'qrcode';
import sharp from 'sharp';

const app = express();
const PORT = process.env.PORT || 8000;
const MY_NUMBER = "918870799204";

let CODE = null;
let QR = null;
let STATUS = "V30 Starting...";
let IS_CONNECTED = false;
let IS_PAUSED = false;
let PAUSE_UNTIL = null;
let groqClient = null;

const IDENTITY = `You are Obito - Energy AI Assistant by Krishna ${MY_NUMBER}. You are energetic, powerful. You speak all languages automatically - detect user language and reply same language. Group chat supported.`;

if (process.env.GROQ_API_KEY) {
    const { default: Groq } = await import('groq-sdk');
    groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
}

async function start() {
    if (IS_PAUSED) return;
    const { version } = await fetchLatestBaileysVersion();
    const { state, saveCreds } = await useMultiFileAuthState('./auth');
    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
        },
        browser: Browsers.ubuntu('Chrome'),
        markOnlineOnConnect: true,
    });

    if (!sock.authState.creds.registered) {
        setTimeout(async () => {
            try {
                CODE = await sock.requestPairingCode(MY_NUMBER);
                console.log(`🔥 P-CODE: ${CODE}`);
                STATUS = `P-CODE ${CODE} + QR Ready`;
            } catch (e) { STATUS = e.message; }
        }, 3000);
    }

    sock.ev.on('connection.update', async (a) => {
        const { connection, lastDisconnect, qr } = a;
        if (qr) { QR = await QRCode.toDataURL(qr); STATUS = "QR + Code Ready"; }
        if (connection === 'open') { IS_CONNECTED = true; CODE = null; QR = null; STATUS = `CONNECTED ${MY_NUMBER}`; }
        if (connection === 'close') {
            const reason = lastDisconnect?.error?.output?.statusCode;
            IS_CONNECTED = false; CODE = null; QR = null;
            if (reason === DisconnectReason.loggedOut) {
                try { fs.rmSync('./auth', { recursive: true, force: true }); } catch {}
            }
            setTimeout(() => start(), 3000);
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async ({ messages }) => {
        if (IS_PAUSED) return;
        const m = messages[0];
        if (!m?.message || m.key.fromMe) return;
        const jid = m.key.remoteJid;
        const isGroup = jid.endsWith('@g.us');
        const txt = (m.message.conversation || m.message.extendedTextMessage?.text || "").trim();

        // Sticker - image send panna sticker
        if (!txt && m.message.imageMessage) {
            try {
                const { downloadMediaMessage } = await import('baileys');
                const buf = await downloadMediaMessage(m, 'buffer', {}, { logger: pino({ level: 'silent' }), reuploadRequest: sock.updateMediaMessage });
                const webp = await sharp(buf).resize(512,512).webp().toBuffer();
                await sock.sendMessage(jid, { sticker: webp });
            } catch {}
            return;
        }

        // ONLY COMMAND - /stop 5min auto resume
        if (txt.toLowerCase() === '/stop') {
            IS_PAUSED = true;
            PAUSE_UNTIL = new Date(Date.now() + 5*60*1000);
            await sock.sendMessage(jid, { text: `⏸️ Paused 5 minutes! Auto start at ${PAUSE_UNTIL.toLocaleTimeString()} ⚡` });
            setTimeout(() => { IS_PAUSED = false; PAUSE_UNTIL = null; console.log("Auto Resumed"); }, 5*60*1000);
            return;
        }

        // AI - All features, all languages auto
        if (groqClient && txt) {
            try {
                const r = await groqClient.chat.completions.create({
                    model: "llama3-8b-8192",
                    messages: [
                        { role: "system", content: IDENTITY },
                        { role: "user", content: txt }
                    ]
                });
                await sock.sendMessage(jid, { text: r.choices[0].message.content });
            } catch {}
        }
    });
}

app.get('/', async (req, res) => {
    const pausedHtml = IS_PAUSED ? `<h1 style="background:orange;color:white;padding:15px;">⏸️ PAUSED till ${PAUSE_UNTIL?.toLocaleTimeString()} - Auto resume 5min</h1>` : "";
    let main = IS_CONNECTED ?
        `${pausedHtml}<h1 style="background:green;color:white;padding:30px;">✅ ${MY_NUMBER} CONNECTED V30</h1>` :
        `${pausedHtml}${QR ? `<img src="${QR}" style="width:320px;height:320px;border:5px solid black;"/><p>QR: Linked Devices > Link a Device</p>` : '<p>QR Generating...</p>'}<hr>${CODE ? `<h1 style="font-size:50px;background:black;color:#0f0;padding:20px;">${CODE}<br><span style="color:yellow;font-size:35px;">${CODE.slice(0,4)}-${CODE.slice(4)}</span></h1><p>P-Code: Linked Devices > Link with phone number</p>` : '<p>P-Code Generating...</p>'}`;
    res.send(`<center><h1>OBITO V30 ${MY_NUMBER}</h1><p>${STATUS} | ${IS_PAUSED ? 'PAUSED' : 'ACTIVE'} | Group ON | All Languages ON</p>${main}<br><a href="/">Refresh</a> | <a href="/clear">Clear</a><script>setTimeout(()=>location.reload(),15000)</script></center>`);
});

app.get('/clear', (req, res) => {
    try { fs.rmSync('./auth', { recursive: true, force: true }); } catch {}
    res.send('<h1>Cleared</h1><script>setTimeout(()=>location.href="/",3000)</script>');
    setTimeout(() => start(), 2000);
});

app.listen(PORT, () => { start(); console.log(`V30 ${PORT}`); });
