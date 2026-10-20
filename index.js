import makeWASocket, { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers, makeCacheableSignalKeyStore } from 'baileys';
import express from 'express';
import pino from 'pino';
import fs from 'fs';
import QRCode from 'qrcode';
import sharp from 'sharp';

const app = express();
const PORT = process.env.PORT || 8000;
const MY_NUMBER = "918870799204";
let CODE = null; let QR = null; let STATUS = "V32 By Krishna Starting..."; let IS_CONNECTED = false; let IS_PAUSED = false; let PAUSE_UNTIL = null; let groqClient = null;
const IDENTITY = `You are Obito - Energy AI Assistant by Krishna. Energetic. Auto detect language and reply same language. Group supported. Never mention phone numbers.`;

if (process.env.GROQ_API_KEY) { const { default: Groq } = await import('groq-sdk'); groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY }); }

async function start() {
    if (IS_PAUSED) return;
    const { version } = await fetchLatestBaileysVersion();
    const { state, saveCreds } = await useMultiFileAuthState('./auth');
    const sock = makeWASocket({ version, logger: pino({ level: 'silent' }), printQRInTerminal: false, auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })) }, browser: Browsers.macOS('Desktop'), markOnlineOnConnect: true });
    if (!sock.authState.creds.registered) { setTimeout(async () => { try { CODE = await sock.requestPairingCode(MY_NUMBER); STATUS = `P-CODE ${CODE} + QR Ready | By Krishna`; console.log("CODE:", CODE); } catch (e) { STATUS = e.message; } }, 8000); }
    sock.ev.on('connection.update', async (a) => {
        const { connection, lastDisconnect, qr } = a;
        if (qr) { QR = await QRCode.toDataURL(qr); }
        if (connection === 'open') { IS_CONNECTED = true; CODE = null; QR = null; STATUS = `✅ CONNECTED - By Krishna - V32`; console.log("CONNECTED"); }
        if (connection === 'close') { const r = lastDisconnect?.error?.output?.statusCode; IS_CONNECTED = false; CODE = null; QR = null; if (r === DisconnectReason.loggedOut) { try { fs.rmSync('./auth', { recursive: true, force: true }); } catch {} } setTimeout(() => start(), 3000); }
    });
    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('messages.upsert', async ({ messages }) => {
        if (IS_PAUSED) return; const m = messages[0]; if (!m?.message || m.key.fromMe) return; const jid = m.key.remoteJid; const txt = (m.message.conversation || m.message.extendedTextMessage?.text || "").trim();
        if (!txt && m.message.imageMessage) { try { const { downloadMediaMessage } = await import('baileys'); const buf = await downloadMediaMessage(m, 'buffer', {}, { logger: pino({ level: 'silent' }), reuploadRequest: sock.updateMediaMessage }); const webp = await sharp(buf).resize(512,512).webp().toBuffer(); await sock.sendMessage(jid, { sticker: webp }); } catch {} return; }
        if (txt.toLowerCase() === '/stop') { IS_PAUSED = true; PAUSE_UNTIL = new Date(Date.now() + 5*60*1000); await sock.sendMessage(jid, { text: `⏸️ Paused 5 min! Auto resume ${PAUSE_UNTIL.toLocaleTimeString()} ⚡\nBy Krishna` }); setTimeout(() => { IS_PAUSED = false; PAUSE_UNTIL = null; }, 5*60*1000); return; }
        if (groqClient && txt) { try { const r = await groqClient.chat.completions.create({ model: "llama3-8b-8192", messages: [{ role: "system", content: IDENTITY }, { role: "user", content: txt }] }); await sock.sendMessage(jid, { text: r.choices[0].message.content }); } catch {} }
    });
}
app.get('/', async (req, res) => {
    const paused = IS_PAUSED ? `<h1 style="background:orange;color:white;padding:15px;">⏸️ PAUSED till ${PAUSE_UNTIL?.toLocaleTimeString()}</h1>` : "";
    let main = IS_CONNECTED ? `${paused}<h1 style="background:green;color:white;padding:30px;border-radius:15px;">✅ CONNECTED<br>OBITO - By Krishna<br>V32 FINAL</h1>` : `${paused}${QR ? `<img src="${QR}" style="width:320px;height:320px;border:6px solid black;"/>` : '<h3>Generating QR... 8 sec</h3>'}<hr>${CODE ? `<h1 style="font-size:48px;background:black;color:#0f0;padding:15px;">${CODE}<br><span style="color:yellow;font-size:32px;">${CODE.slice(0,4)}-${CODE.slice(4)}</span></h1>` : '<h3>Generating P-Code...</h3>'}`;
    res.send(`<center style="max-width:800px;margin:auto;font-family:Arial;"><h1>⚡ OBITO - By Krishna - V32 FINAL</h1><p>${STATUS}</p>${main}<br><a href="/">Refresh</a> | <a href="/clear">Clear</a><script>setTimeout(()=>location.reload(),15000)</script></center>`);
});
app.get('/clear', (req, res) => { try { fs.rmSync('./auth', { recursive: true, force: true }); } catch {} QR = null; CODE = null; res.send('<h1>Cleared - By Krishna V32</h1><script>setTimeout(()=>location.href="/",4000)</script>'); setTimeout(() => start(), 2000); });
app.listen(PORT, () => { start(); const url = process.env.RENDER_EXTERNAL_URL; if (url) setInterval(() => fetch(url).catch(()=>{}), 8*60*1000); });
