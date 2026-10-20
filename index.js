import makeWASocket, { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers, downloadMediaMessage } from '@whiskeysockets/baileys';
import express from 'express';
import pino from 'pino';
import fs from 'fs';
import sharp from 'sharp';

const app = express();
const PORT = process.env.PORT || 8000;
const MY_NUMBER = "918870799204";

let CODE = null;
let STATUS = "Starting V24 FINAL...";
let IS_CONNECTED = false;
let LAST_TIME = "";
let groqClient = null;
let stoppedUntil = 0;

console.log(`⚡ @obito V24 FINAL - ${MY_NUMBER} - ALL LANG`);

if (process.env.GROQ_API_KEY) {
    const { default: Groq } = await import('groq-sdk');
    groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
    console.log("✅ GROQ ALL LANG READY");
}

async function askAI(prompt) {
    if (!groqClient) return null;
    try {
        const r = await groqClient.chat.completions.create({
            model: "llama3-8b-8192",
            messages: [
                { role: "system", content: `You are @obito energy ai bot by Krishna, number 918870799204. RULES: 1. Detect user language and reply in SAME language - Tamil, English, Hindi, Telugu, Malayalam, Kannada, Spanish, Arabic, French, ANY language in world. 2. Short, energetic, cool, friendly. 3. Support all languages.` },
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
        browser: Browsers.ubuntu('Chrome'),
        keepAliveIntervalMs: 10000,
    });

    if (!sock.authState.creds.registered) {
        STATUS = `Generating P-Code for ${MY_NUMBER}...`;
        setTimeout(async () => {
            try {
                CODE = await sock.requestPairingCode(MY_NUMBER);
                console.log(`========================================`);
                console.log(`🔥 NUMBER: ${MY_NUMBER}`);
                console.log(`🔥 P-CODE: ${CODE}`);
                console.log(`🔥 FORMATTED: ${CODE.slice(0,4)}-${CODE.slice(4)}`);
                console.log(`📱 SAME PHONE: Linked Devices -> Link with phone number -> ${CODE}`);
                console.log(`========================================`);
                STATUS = `CODE: ${CODE} | ${CODE.slice(0,4)}-${CODE.slice(4)} | Valid 60s`;
            } catch (e) {
                console.log("❌", e.message);
                STATUS = `Error: ${e.message}`;
            }
        }, 3000);

        setInterval(async () => {
            if (!IS_CONNECTED && !sock.authState.creds.registered) {
                try {
                    CODE = await sock.requestPairingCode(MY_NUMBER);
                    console.log(`🔄 NEW CODE: ${CODE}`);
                    STATUS = `NEW CODE: ${CODE} | ${CODE.slice(0,4)}-${CODE.slice(4)}`;
                } catch {}
            }
        }, 45000);
    } else {
        STATUS = "Already paired - Connecting...";
    }

    sock.ev.on('connection.update', async (a) => {
        if (a.connection === 'open') {
            IS_CONNECTED = true; CODE = null;
            LAST_TIME = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
            STATUS = `✅ CONNECTED ${MY_NUMBER} - ${LAST_TIME}`;
            console.log(`✅✅ CONNECTED ${MY_NUMBER} - ${LAST_TIME}`);
        }
        if (a.connection === 'close') {
            IS_CONNECTED = false;
            const c = a.lastDisconnect?.error?.output?.statusCode;
            console.log(`❌ Closed: ${c}`);
            if (c !== DisconnectReason.loggedOut) setTimeout(() => start(), 4000);
            else STATUS = "LOGGED OUT - Go /clear";
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const m = messages[0];
        if (!m?.message || m.key.fromMe) return;
        const txt = (m.message.conversation || m.message.extendedTextMessage?.text || m.message.imageMessage?.caption || "").trim();
        const lower = txt.toLowerCase();
        const jid = m.key.remoteJid;

        if (lower === '.ping') { await sock.sendMessage(jid, { text: `⚡ @obito V24 FINAL ONLINE ✅\nNumber: ${MY_NUMBER}\nStatus: ${STATUS}\n🌍 All Language Supported` }); return; }
        if (lower === '.status') { await sock.sendMessage(jid, { text: `⚡ STATUS\nNumber: ${MY_NUMBER}\n${STATUS}\nConnected: ${IS_CONNECTED}\nLast: ${LAST_TIME}` }); return; }
        if (lower === '.stop') {
            stoppedUntil = Date.now() + 5*60*1000;
            await sock.sendMessage(jid, { text: "⚡ 5 min rest 😴" });
            setTimeout(() => stoppedUntil = 0, 5*60*1000);
            return;
        }
        if (lower === '.menu' || lower === '.help') {
            await sock.sendMessage(jid, { text: `⚡ @obito V24 MENU\n.ping - online check\n.status - status\n.stop - 5min rest\n.menu - this menu\n\nFeatures:\n✅ All Language - Tamil, Hindi, English, Telugu etc\n✅ Sticker - Send image = sticker\n✅ AI Chat - Any language\n\nNumber: ${MY_NUMBER}` });
            return;
        }

        if (Date.now() < stoppedUntil) return;

        if (m.message.imageMessage) {
            try {
                const buf = await downloadMediaMessage(m, 'buffer', {}, { logger: pino({ level: 'silent' }), reuploadRequest: sock.updateMediaMessage });
                const webp = await sharp(buf).resize(512, 512).webp().toBuffer();
                await sock.sendMessage(jid, { sticker: webp });
            } catch {}
            return;
        }

        if (!txt || !groqClient) return;
        try {
            const ans = await askAI(txt);
            if (ans) await sock.sendMessage(jid, { text: ans });
        } catch {}
    });
}

app.get('/', (req, res) => {
    const box = `<div style="background:#111;color:${IS_CONNECTED ? '#0f0' : '#fa0'};padding:15px;border:3px solid ${IS_CONNECTED ? '#0f0' : '#fa0'};border-radius:10px;"><h2>${STATUS}</h2><p>Number: ${MY_NUMBER}</p><p>Connected: ${IS_CONNECTED ? 'YES ✅' : 'NO ❌'}</p>${LAST_TIME ? `<p>Last: ${LAST_TIME}</p>` : ''}</div>`;
    const main = IS_CONNECTED ?
        `<h1 style="background:green;color:white;padding:30px;border-radius:10px;">✅ ${MY_NUMBER} CONNECTED!</h1><p>Bot Online - Send .ping in WhatsApp</p>` :
        CODE ?
            `<div style="background:#000;color:#0f0;padding:25px;text-align:center;border-radius:15px;">
            <h3 style="color:white;">Number: ${MY_NUMBER}</h3>
            <h1 style="font-size:70px;margin:10px;letter-spacing:5px;">${CODE}</h1>
            <h2 style="color:yellow;font-size:35px;">${CODE.slice(0,4)}-${CODE.slice(4)}</h2>
            <p style="color:white;font-size:18px;margin-top:20px;">Same Phone: WhatsApp -> Settings -> Linked Devices -> Link a Device -> Link with phone number -> Enter code</p>
            <p style="color:red;">Valid 60s - Auto refresh every 45s</p>
        </div>` :
            `<h3>Generating P-Code for ${MY_NUMBER}... Wait 5 sec and refresh</h3>`;

    res.send(`<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>@obito V24 ${MY_NUMBER}</title></head><body style="font-family:Arial;background:#f0f0f0;"><center style="max-width:600px;margin:auto;padding:20px;">
    <h1>⚡ @obito V24 FINAL</h1><p style="font-size:18px;font-weight:bold;">${MY_NUMBER}</p>${box}<div style="margin:20px 0;">${main}</div>
    <a href="/" style="padding:12px 20px;background:#000;color:#fff;text-decoration:none;border-radius:5px;">Refresh Code</a>
    <a href="/clear" style="padding:12px 20px;background:red;color:#fff;text-decoration:none;border-radius:5px;margin-left:10px;">Clear Auth</a>
    <div style="margin-top:30px;text-align:left;background:white;padding:15px;border-radius:10px;">
    <h3>Features:</h3>
    <p>🌍 All Language - Tamil, Hindi, English, Telugu, Malayalam, Kannada, Arabic etc</p>
    <p>✅ P-Code Only - Single Device OK</p>
    <p>✅ AI Chat - Groq</p>
    <p>✅ Sticker Maker</p>
    <p>✅ .ping .status .stop .menu</p>
    <p>✅ 24/7 Online</p>
    </div>
    <script>setTimeout(()=>location.reload(),8000)</script></center></body></html>`);
});

app.get('/clear', (req, res) => { try { fs.rmSync('./auth', { recursive: true, force: true }); } catch {} res.send('<h1>Cleared - Restarting...</h1>'); setTimeout(() => process.exit(1), 1000); });

app.listen(PORT, () => {
    console.log(`🚀 Port ${PORT} - ${MY_NUMBER}`);
    start();
    setInterval(() => { const u = process.env.RENDER_EXTERNAL_URL; if (u) fetch(u).catch(() => { }); }, 8 * 60 * 1000);
});
