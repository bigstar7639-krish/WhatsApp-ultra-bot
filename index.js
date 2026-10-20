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
let STATUS = "V33.1 ULTIMATE BIG Starting...";
let IS_CONNECTED = false;
let IS_PAUSED = false;
let PAUSE_UNTIL = null;
let groqClient = null;
let CURRENT_SOCK = null;

const IDENTITY = `You are Obito - Energy AI Assistant by Krishna. Energetic. Auto detect language. Group supported. No numbers.`;

if (process.env.GROQ_API_KEY) {
    const { default: Groq } = await import('groq-sdk');
    groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
}

// FIXED P-CODE - 1 STABLE WAY - NO FAKE LOOP
async function requestPairingCodeAllWays(sock) {
    try {
        if (!sock) throw new Error("Socket not ready");
        CODE = await sock.requestPairingCode(MY_NUMBER);
        if (!CODE) throw new Error("Empty code");
        const formatted = `${CODE.slice(0,4)}-${CODE.slice(4)}`;
        console.log(`✅ P-CODE: ${CODE} | ${formatted} for ${MY_NUMBER}`);
        STATUS = `✅ P-CODE ${CODE} (${formatted}) | By Krishna`;
        return CODE;
    } catch (e) {
        console.log(`❌ P-CODE failed: ${e.message}`);
        STATUS = `❌ P-CODE Failed: ${e.message} | Delete linked devices (max 4) | Use QR`;
        return null;
    }
}

async function start() {
    if (IS_PAUSED) return;
    const { version } = await fetchLatestBaileysVersion();
    const { state, saveCreds } = await useMultiFileAuthState('./auth');
    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })) },
        browser: Browsers.macOS('Desktop'),
        markOnlineOnConnect: true,
        syncFullHistory: false,
    });
    CURRENT_SOCK = sock;

    if (!state.creds.registered) {
        setTimeout(async () => { await requestPairingCodeAllWays(sock); }, 4000);
        const retryInterval = setInterval(async () => {
            if (!CODE && !IS_CONNECTED && !state.creds.registered && CURRENT_SOCK) {
                await requestPairingCodeAllWays(CURRENT_SOCK);
            } else { clearInterval(retryInterval); }
        }, 30000);
    }

    sock.ev.on('connection.update', async (a) => {
        const { connection, lastDisconnect, qr } = a;
        if (qr) {
            QR = await QRCode.toDataURL(qr);
            STATUS = `QR Ready | ${CODE ? `P-CODE ${CODE}` : 'Generating...'} | By Krishna`;
        }
        if (connection === 'open') {
            IS_CONNECTED = true; CODE = null; QR = null;
            STATUS = `✅ CONNECTED ${MY_NUMBER} - By Krishna - V33.1 BIG`;
            console.log("✅ CONNECTED!");
        }
        if (connection === 'close') {
            const reason = lastDisconnect?.error?.output?.statusCode;
            IS_CONNECTED = false; CODE = null; QR = null;
            if (reason === DisconnectReason.loggedOut) {
                try { fs.rmSync('./auth', { recursive: true, force: true }); } catch {}
                STATUS = "Logged out - Clearing";
            } else { STATUS = `Closed - Retrying Reason ${reason}`; }
            setTimeout(() => start(), 4000);
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const m = messages[0];
        if (!m?.message || m.key.fromMe) return;
        const jid = m.key.remoteJid;
        const txt = (m.message.conversation || m.message.extendedTextMessage?.text || "").trim();

        if (IS_PAUSED && PAUSE_UNTIL && new Date() > PAUSE_UNTIL) {
            IS_PAUSED = false; PAUSE_UNTIL = null; STATUS = `✅ CONNECTED - V33.1`;
        }
        if (txt.toLowerCase() === '/start') {
            IS_PAUSED = false; PAUSE_UNTIL = null; STATUS = `✅ CONNECTED - V33.1`;
            await sock.sendMessage(jid, { text: "⚡ Obito AI activated! By Krishna" });
            return;
        }
        if (txt.toLowerCase() === '/stop') {
            IS_PAUSED = true; PAUSE_UNTIL = new Date(Date.now() + 30*60*1000);
            STATUS = `⏸️ PAUSED till ${PAUSE_UNTIL.toLocaleTimeString()} | By Krishna`;
            await sock.sendMessage(jid, { text: `⏸️ Paused 30 min! Send /start to wake!` });
            return;
        }
        if (IS_PAUSED) return;

        if (!txt && m.message.imageMessage) {
            try {
                const { downloadMediaMessage } = await import('baileys');
                const buf = await downloadMediaMessage(m, 'buffer', {}, { logger: pino({ level: 'silent' }), reuploadRequest: sock.updateMediaMessage });
                const webp = await sharp(buf).resize(512,512).webp().toBuffer();
                await sock.sendMessage(jid, { sticker: webp });
            } catch (e) { console.log(e.message); }
            return;
        }
        if (txt && groqClient) {
            try {
                const r = await groqClient.chat.completions.create({ model: "llama3-8b-8192", messages: [{ role: "system", content: IDENTITY }, { role: "user", content: txt }] });
                await sock.sendMessage(jid, { text: r.choices[0].message.content });
            } catch (e) { console.log(e.message); }
        }
    });
}

// ===== BIG CODE DASHBOARD V33.1 =====
app.get('/', (req, res) => {
    const paused = IS_PAUSED ? `<h1 style="background:orange;color:white;padding:18px;border-radius:12px;font-size:28px;">⏸️ PAUSED till ${PAUSE_UNTIL?.toLocaleTimeString()} - /start to wake</h1>` : "";
    let codeBox = CODE ? `
        <div style="background:black;padding:45px;border-radius:22px;border:6px solid #0f0;margin:15px 0;">
            <h2 style="color:white;margin:0;font-size:24px;">FOR ${MY_NUMBER} - BY KRISHNA - V33.1 BIG</h2>
            <h1 style="color:#0f0;font-size:95px;margin:15px 0;letter-spacing:10px;font-weight:900;line-height:1;">${CODE}</h1>
            <h1 style="color:yellow;font-size:70px;margin:0;letter-spacing:8px;font-weight:900;">${CODE.slice(0,4)}-${CODE.slice(4)}</h1>
            <p style="color:white;font-size:22px;margin-top:25px;">1. WhatsApp > Linked Devices<br>2. Link a Device > Bottom: Link with phone number<br>3. Enter: ${CODE}<br><b style="color:red;font-size:26px;">60 SEC ONLY - BE FAST!</b><br><b style="color:#0f0;">If fails: Delete ALL linked devices (max 4)</b></p>
            <div style="margin-top:20px;display:flex;gap:15px;justify-content:center;flex-wrap:wrap;">
                <a href="/getcode" style="background:#0f0;color:black;padding:16px 28px;text-decoration:none;border-radius:12px;font-weight:bold;font-size:20px;">Raw JSON</a>
                <a href="/pair" style="background:yellow;color:black;padding:16px 28px;text-decoration:none;border-radius:12px;font-weight:bold;font-size:20px;">🔄 New BIG Code</a>
            </div>
        </div>` : `<h1 style="font-size:32px;">Generating BIG P-CODE for ${MY_NUMBER}... 4 sec...<br><br><a href="/pair" style="font-size:26px;background:blue;color:white;padding:18px 30px;text-decoration:none;border-radius:12px;">Force New Code</a></h1>`;

    let qrBox = QR ? `<div style="margin:25px 0;"><img src="${QR}" style="width:480px;height:480px;border:10px solid black;border-radius:20px;"/><br><b style="font-size:26px;">QR - 100% WORKS - SCAN</b></div>` : `<h3>QR Generating... 3 sec</h3>`;
    let main = IS_CONNECTED ? `${paused}<h1 style="background:green;color:white;padding:40px;border-radius:20px;font-size:50px;">✅ CONNECTED<br>${MY_NUMBER}<br>By Krishna - V33.1 BIG</h1>` : `${paused}${qrBox}<hr>${codeBox}`;

    res.send(`<center style="max-width:900px;margin:auto;font-family:Arial;padding:10px;">
        <h1 style="font-size:36px;">⚡ OBITO - By Krishna - V33.1 ULTIMATE BIG</h1>
        <p style="font-size:20px;">${STATUS} | ${IS_PAUSED ? 'PAUSED' : 'ACTIVE'}</p>
        ${main}
        <br><br>
        <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;">
            <a href="/" style="padding:16px 22px;background:black;color:white;text-decoration:none;border-radius:10px;font-size:20px;font-weight:bold;">Refresh</a>
            <a href="/clear" style="padding:16px 22px;background:red;color:white;text-decoration:none;border-radius:10px;font-size:20px;font-weight:bold;">Clear Auth</a>
            <a href="/pair" style="padding:16px 22px;background:blue;color:white;text-decoration:none;border-radius:10px;font-size:20px;font-weight:bold;">New BIG Code</a>
            <a href="/getcode" style="padding:16px 22px;background:green;color:white;text-decoration:none;border-radius:10px;font-size:20px;font-weight:bold;">Raw Code</a>
        </div>
        <div style="margin-top:20px;background:#eee;padding:15px;border-radius:10px;text-align:left;font-size:16px;">
            <b>✅ ALL FEATURES IN THIS SMALL CODE:</b><br>
            QR + BIG P-CODE 95px + Auto Retry 30s + /pair + /getcode + /clear + /status<br>
            Group + Private + All Languages Auto + By Krishna + Energetic<br>
            Sticker 512x512 + Groq Llama3-8b + /stop 30min + /start + Auto Reconnect + Keep-Alive 8min + 24/7
        </div>
        <script>setTimeout(()=>location.reload(),25000)</script>
    </center>`);
});

app.get('/pair', async (req, res) => {
    try {
        if (!CURRENT_SOCK) return res.send(`<h1>Bot not ready - wait 5 sec</h1><a href="/">Back</a>`);
        STATUS = "Forcing new BIG P-CODE...";
        await requestPairingCodeAllWays(CURRENT_SOCK);
        if (!CODE) return res.send(`<h1>Failed - Delete linked devices! Max 4</h1><a href="/clear">Clear</a> | <a href="/">Home</a>`);
        res.send(`<center><h1 style="font-size:80px;">${CODE}</h1><h1 style="font-size:65px;color:yellow;background:black;padding:25px;border-radius:15px;">${CODE.slice(0,4)}-${CODE.slice(4)}</h1><h2>FOR ${MY_NUMBER} - ENTER FAST 60 SEC!</h2><a href="/" style="font-size:26px;background:green;color:white;padding:15px 25px;text-decoration:none;border-radius:10px;">Go Back BIG</a></center><script>setTimeout(()=>location.href="/",5000)</script>`);
    } catch (e) { res.send(`<h1>Error: ${e.message}</h1><a href="/clear">Clear</a>`); }
});

app.get('/getcode', (req, res) => { res.json({ code: CODE, formatted: CODE ? `${CODE.slice(0,4)}-${CODE.slice(4)}` : null, number: MY_NUMBER, status: STATUS, connected: IS_CONNECTED, big: "95px" }); });
app.get('/status', (req, res) => { res.json({ status: STATUS, isConnected: IS_CONNECTED, isPaused: IS_PAUSED, pairingCode: CODE, number: MY_NUMBER }); });
app.get('/clear', (req, res) => { try { fs.rmSync('./auth', { recursive: true, force: true }); } catch {} QR = null; CODE = null; STATUS = "Cleared - Generating BIG..."; res.send('<h1>Cleared V33.1 BIG - 5 sec</h1><script>setTimeout(()=>location.href="/",4000)</script>'); setTimeout(() => start(), 2000); });

app.listen(PORT, () => {
    start().catch(err => console.error(err));
    console.log(`🚀 V33.1 BIG CODE - ${MY_NUMBER} - Port ${PORT}`);
    const url = process.env.RENDER_EXTERNAL_URL;
    if (url) setInterval(() => fetch(url).catch(()=>{}), 8*60*1000);
});
