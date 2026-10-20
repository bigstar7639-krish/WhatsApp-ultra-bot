import makeWASocket, { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers, makeCacheableSignalKeyStore } from 'baileys';
import express from 'express';
import pino from 'pino';
import fs from 'fs';
import QRCode from 'qrcode';
import sharp from 'sharp';

const app = express();
const PORT = process.env.PORT || 8000;
const MY_NUMBER = "918870799204";
let CODE = null; let QR = null; let STATUS = "V33.1 FINAL TODAY Starting...";
let IS_CONNECTED = false; let IS_PAUSED = false; let PAUSE_UNTIL = null;
let groqClient = null; let CURRENT_SOCK = null;

const IDENTITY = `You are Obito - Energy AI Assistant by Krishna. Energetic. Auto detect language. Group supported. No numbers.`;

if (process.env.GROQ_API_KEY) { const { default: Groq } = await import('groq-sdk'); groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY }); }

async function requestPairingCodeAllWays(sock) {
    try {
        CODE = await sock.requestPairingCode(MY_NUMBER);
        if (!CODE) throw new Error("Empty");
        const f = `${CODE.slice(0,4)}-${CODE.slice(4)}`;
        STATUS = `✅ P-CODE ${CODE} (${f}) | By Krishna | TODAY WORKING`;
        console.log(`✅ P-CODE ${CODE} | ${f}`);
        return CODE;
    } catch (e) { STATUS = `❌ P-CODE Failed: ${e.message} | Delete linked devices (max 4)`; return null; }
}

async function start() {
    const ver = await fetchLatestBaileysVersion().then(v=>v.version).catch(()=> [2,3000,1015901307]);
    const { state, saveCreds } = await useMultiFileAuthState('./auth');
    const sock = makeWASocket({
        version: ver,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })) },
        browser: Browsers.macOS('Desktop'),
        markOnlineOnConnect: true,
        syncFullHistory: false,
    });
    CURRENT_SOCK = sock;
    if (!state.creds.registered) {
        setTimeout(() => requestPairingCodeAllWays(sock), 4000);
        setInterval(() => { if (!CODE && !IS_CONNECTED && !state.creds.registered) requestPairingCodeAllWays(CURRENT_SOCK); }, 30000);
    }
    sock.ev.on('connection.update', async (a) => {
        const { connection, lastDisconnect, qr } = a;
        if (qr) { QR = await QRCode.toDataURL(qr); STATUS = `QR Ready | ${CODE ? `P-CODE ${CODE}` : 'Generating...'} | TODAY`; }
        if (connection === 'open') { IS_CONNECTED = true; CODE = null; QR = null; STATUS = `✅ CONNECTED ${MY_NUMBER} - FINAL TODAY`; }
        if (connection === 'close') {
            const r = lastDisconnect?.error?.output?.statusCode;
            IS_CONNECTED = false; CODE = null; QR = null;
            if (r === DisconnectReason.loggedOut) { try { fs.rmSync('./auth', { recursive: true, force: true }); } catch {} }
            setTimeout(() => start(), 4000);
        }
    });
    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const m = messages[0]; if (!m?.message || m.key.fromMe) return;
        const jid = m.key.remoteJid; const txt = (m.message.conversation || m.message.extendedTextMessage?.text || "").trim();
        if (IS_PAUSED && PAUSE_UNTIL && new Date() > PAUSE_UNTIL) { IS_PAUSED = false; PAUSE_UNTIL = null; }
        if (txt.toLowerCase() === '/start') { IS_PAUSED = false; PAUSE_UNTIL = null; await sock.sendMessage(jid, { text: "⚡ Obito activated! By Krishna" }); return; }
        if (txt.toLowerCase() === '/stop') {
            IS_PAUSED = true; PAUSE_UNTIL = new Date(Date.now() + 5*60*1000);
            await sock.sendMessage(jid, { text: `⏸️ Paused 5 min! ${PAUSE_UNTIL.toLocaleTimeString()} - /start to wake` });
            setTimeout(() => { IS_PAUSED = false; PAUSE_UNTIL = null; }, 5*60*1000); return;
        }
        if (IS_PAUSED) return;
        if (!txt && m.message.imageMessage) {
            try { const { downloadMediaMessage } = await import('baileys'); const buf = await downloadMediaMessage(m, 'buffer', {}, { logger: pino({ level: 'silent' }), reuploadRequest: sock.updateMediaMessage }); const webp = await sharp(buf).resize(512,512).webp().toBuffer(); await sock.sendMessage(jid, { sticker: webp }); } catch {} return;
        }
        if (txt && groqClient) { try { const r = await groqClient.chat.completions.create({ model: "llama3-8b-8192", messages: [{ role: "system", content: IDENTITY }, { role: "user", content: txt }] }); await sock.sendMessage(jid, { text: r.choices[0].message.content }); } catch {} }
    });
}

app.get('/', (req, res) => {
    const paused = IS_PAUSED ? `<h1 style="background:orange;color:white;padding:18px;border-radius:12px;">⏸️ PAUSED 5 MIN till ${PAUSE_UNTIL?.toLocaleTimeString()}</h1>` : "";
    let codeBox = CODE ? `<div style="background:black;padding:45px;border-radius:22px;border:6px solid #0f0;"><h2 style="color:white;margin:0;">FOR ${MY_NUMBER} - FINAL TODAY - BY KRISHNA</h2><h1 style="color:#0f0;font-size:95px;margin:15px 0;letter-spacing:10px;font-weight:900;">${CODE}</h1><h1 style="color:yellow;font-size:70px;margin:0;letter-spacing:8px;font-weight:900;">${CODE.slice(0,4)}-${CODE.slice(4)}</h1></div>` : `<h1>Generating BIG CODE... 4 sec...</h1>`;
    let qrBox = QR ? `<img src="${QR}" style="width:480px;height:480px;border:10px solid black;border-radius:20px;"/>` : `<h3>QR Generating...</h3>`;
    let main = IS_CONNECTED ? `<h1 style="background:green;color:white;padding:40px;border-radius:20px;font-size:50px;">✅ CONNECTED ${MY_NUMBER}<br>FINAL TODAY</h1>` : `${paused}${qrBox}<hr>${codeBox}`;
    res.send(`<center style="max-width:900px;margin:auto;font-family:Arial;"><h1>⚡ OBITO V33.1 FINAL TODAY BIG - ${MY_NUMBER}</h1><p>${STATUS}</p>${main}<br><a href="/">Refresh</a> | <a href="/clear">Clear</a> | <a href="/pair">New BIG Code</a><script>setTimeout(()=>location.reload(),25000)</script></center>`);
});
app.get('/pair', async (req, res) => { try { if (!CURRENT_SOCK) return res.send(`<h1>Wait 5 sec</h1>`); await requestPairingCodeAllWays(CURRENT_SOCK); res.send(`<center><h1 style="font-size:80px;">${CODE}</h1><h1 style="font-size:65px;color:yellow;background:black;padding:20px;">${CODE?.slice(0,4)}-${CODE?.slice(4)}</h1><a href="/">Go Back</a></center><script>setTimeout(()=>location.href="/",5000)</script>`); } catch (e) { res.send(e.message); } });
app.get('/getcode', (req, res) => { res.json({ code: CODE, formatted: CODE ? `${CODE.slice(0,4)}-${CODE.slice(4)}` : null }); });
app.get('/clear', (req, res) => { try { fs.rmSync('./auth', { recursive: true, force: true }); } catch {} QR = null; CODE = null; res.send('<h1>Cleared - 5 sec</h1><script>setTimeout(()=>location.href="/",4000)</script>'); setTimeout(() => start(), 2000); });
app.listen(PORT, () => { start(); console.log(`FINAL TODAY BIG - ${PORT}`); const url = process.env.RENDER_EXTERNAL_URL; if (url) setInterval(() => fetch(url).catch(()=>{}), 8*60*1000); });
