import makeWASocket, { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers, downloadMediaMessage } from '@whiskeysockets/baileys';
import express from 'express';
import pino from 'pino';
import fs from 'fs';
import sharp from 'sharp';
import QRCode from 'qrcode';

const app = express();
const PORT = process.env.PORT || 8000;
const MY_NUMBER = "918870799204";

let CODE = null;
let QR = null;
let STATUS = "Starting V26 BOTH...";
let IS_CONNECTED = false;
let groqClient = null;

console.log(`⚡ V26 BOTH QR+PCODE - ${MY_NUMBER}`);

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
                { role: "system", content: `You are @obito bot by Krishna ${MY_NUMBER}. Detect language, reply same language. All languages support. Short, energetic.` },
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
    });

    if (!sock.authState.creds.registered) {
        STATUS = `Waiting QR/P-Code for ${MY_NUMBER}...`;
        setTimeout(async () => {
            try {
                CODE = await sock.requestPairingCode(MY_NUMBER);
                console.log(`🔥 P-CODE: ${CODE} - ${CODE.slice(0,4)}-${CODE.slice(4)}`);
                STATUS = `P-CODE: ${CODE} | QR Ready`;
            } catch (e) { console.log(e.message); }
        }, 5000);
    }

    sock.ev.on('connection.update', async (a) => {
        const { connection, lastDisconnect, qr } = a;
        
        if (qr) {
            try {
                QR = await QRCode.toDataURL(qr);
                console.log("✅ QR Generated");
                STATUS = `QR Ready + P-CODE: ${CODE || 'Generating...'}`;
            } catch {}
        }

        if (connection === 'open') {
            IS_CONNECTED = true; CODE = null; QR = null;
            STATUS = `✅ CONNECTED ${MY_NUMBER}`;
            console.log("✅ CONNECTED!");
        }
        if (connection === 'close') {
            const reason = lastDisconnect?.error?.output?.statusCode;
            console.log(`❌ Close ${reason}`);
            IS_CONNECTED = false;
            CODE = null; QR = null;
            if (reason === DisconnectReason.loggedOut) {
                try { fs.rmSync('./auth', { recursive: true, force: true }); } catch {}
                STATUS = "Logged out - Restarting for new QR/Code";
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
        if (!txt) {
            if (m.message.imageMessage) {
                try {
                    const buf = await downloadMediaMessage(m, 'buffer', {}, { logger: pino({ level: 'silent' }), reuploadRequest: sock.updateMediaMessage });
                    const webp = await sharp(buf).resize(512,512).webp().toBuffer();
                    await sock.sendMessage(jid, { sticker: webp });
                } catch {}
            }
            return;
        }
        if (groqClient) {
            try { const ans = await askAI(txt); if (ans) await sock.sendMessage(jid, { text: ans }); } catch {}
        }
    });
}

app.get('/', async (req, res) => {
    let main = "";
    if (IS_CONNECTED) {
        main = `<h1 style="background:green;color:white;padding:30px;border-radius:15px;">✅ ${MY_NUMBER} CONNECTED!</h1><p>Bot Online - Both QR+PCode Active</p>`;
    } else {
        const qrPart = QR ? `<div style="background:white;padding:15px;border-radius:15px;margin:15px;"><h2>📱 QR CODE - SCAN</h2><img src="${QR}" style="width:300px;height:300px;border:5px solid black;"/><p>WhatsApp > Linked Devices > Link a Device > Scan QR</p></div>` : `<h3>Generating QR...</h3>`;
        const codePart = CODE ? `<div style="background:#000;color:#0f0;padding:20px;border-radius:15px;margin:15px;text-align:center;"><h2>🔢 P-CODE - SAME PHONE</h2><h1 style="font-size:60px;letter-spacing:5px;">${CODE}</h1><h2 style="color:yellow;font-size:35px;">${CODE.slice(0,4)}-${CODE.slice(4)}</h2><p style="color:white;">WhatsApp > Settings > Linked Devices > Link a device > Link with phone number</p><p style="color:red;">Valid 60s</p></div>` : `<h3>Generating P-CODE...</h3>`;
        main = `${qrPart}<hr style="margin:20px;"><h3>OR</h3>${codePart}`;
    }

    res.send(`<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>V26 BOTH ${MY_NUMBER}</title></head><body style="font-family:Arial;background:#eee;"><center style="max-width:650px;margin:auto;padding:15px;">
    <h1>⚡ V26 BOTH MODE</h1><h2>${MY_NUMBER}</h2><p>${STATUS}</p>${main}<br>
    <a href="/" style="padding:10px 20px;background:black;color:white;text-decoration:none;border-radius:5px;">Refresh</a>
    <a href="/clear" style="padding:10px 20px;background:red;color:white;text-decoration:none;border-radius:5px;margin-left:10px;">Clear Auth</a>
    <div style="margin-top:20px;background:white;padding:15px;border-radius:10px;text-align:left;">
    <h3>How to Login:</h3>
    <p><b>QR Method:</b> Another phone/laptop la WhatsApp open > Linked Devices > Link a Device > Scan QR in this page</p>
    <p><b>P-Code Method:</b> Same phone la Settings > Linked Devices > Link a Device > Link with phone number > Enter code</p>
    <p>🌍 All Language Support</p>
    </div>
    <script>setTimeout(()=>location.reload(),15000)</script></center></body></html>`);
});

app.get('/clear', (req, res) => {
    try { fs.rmSync('./auth', { recursive: true, force: true }); } catch {}
    QR = null; CODE = null;
    res.send('<h1>Cleared - New QR/Code in 5 sec</h1><script>setTimeout(()=>location.href="/",3000)</script>');
    setTimeout(() => start(), 2000);
});

app.listen(PORT, () => {
    console.log(`🚀 Port ${PORT}`);
    start();
    const url = process.env.RENDER_EXTERNAL_URL;
    if (url) setInterval(() => fetch(url).catch(()=>{}), 8*60*1000);
});
