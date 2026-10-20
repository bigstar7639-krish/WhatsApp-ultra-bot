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
let CONNECTION_STATUS = "Starting...";
let IS_CONNECTED = false;
let CONNECTED_NUMBER = "";
let LAST_CONNECTED = "";

console.log("⚡ @obito energy ai V18 FINAL Starting...");

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
                { role: "system", content: "You are @obito energy ai assistant, created by Krishna. Tamil Tanglish mix, short energetic." },
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
        browser: ['Obito Energy V18', 'Chrome', '1.0'],
        keepAliveIntervalMs: 10000,
        markOnlineOnConnect: true,
        syncFullHistory: false,
    });

    if (!sock.authState.creds.registered) {
        CONNECTION_STATUS = "Waiting for Pairing / QR Scan...";
        IS_CONNECTED = false;
        console.log("⏳ Not registered - Generating Pairing Code...");
        setTimeout(async () => {
            try {
                CODE = await sock.requestPairingCode(num);
                console.log("========================================");
                console.log(`🔥 PAIRING CODE: ${CODE}`);
                console.log(`🔥 CODE: ${CODE.slice(0,4)}-${CODE.slice(4)}`);
                console.log("========================================");
                CONNECTION_STATUS = `Pairing Code Ready: ${CODE.slice(0,4)}-${CODE.slice(4)}`;
            } catch (e) {
                console.log("❌ Pairing Error:", e.message);
                CONNECTION_STATUS = "Pairing Failed - Use QR";
            }
        }, 3000);
    } else {
        CONNECTION_STATUS = "Already Paired - Connecting...";
    }

    sock.ev.on('connection.update', async (a) => {
        const { connection, lastDisconnect, qr } = a;
        if (qr) {
            QR = await qrcode.toDataURL(qr);
            CONNECTION_STATUS = "QR Ready - Scan Now!";
            console.log("📷 QR Ready");
        }
        if (connection === 'connecting') {
            CONNECTION_STATUS = "Connecting to WhatsApp...";
            console.log("🔄 Connecting...");
        }
        if (connection === 'open') {
            QR = null; CODE = null;
            IS_CONNECTED = true;
            CONNECTED_NUMBER = num;
            LAST_CONNECTED = new Date().toLocaleString("en-IN", {timeZone: "Asia/Kolkata"});
            CONNECTION_STATUS = `✅ CONNECTED - ${LAST_CONNECTED}`;
            console.log("✅✅✅ @obito CONNECTED SUCCESSFULLY ✅✅✅");
            console.log(`✅ Number: ${num} | Time: ${LAST_CONNECTED}`);
        }
        if (connection === 'close') {
            IS_CONNECTED = false;
            const reason = lastDisconnect?.error?.output?.statusCode;
            const msg = lastDisconnect?.error?.message || "Unknown";
            CONNECTION_STATUS = `❌ DISCONNECTED - Reason: ${reason} - ${msg}`;
            console.log(`❌ Closed - ${reason} - ${msg}`);
            if (reason !== DisconnectReason.loggedOut) {
                CONNECTION_STATUS = "Reconnecting in 5s...";
                setTimeout(() => start(), 5000);
            } else {
                CONNECTION_STATUS = "🔴 LOGGED OUT - Click Clear Auth";
            }
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const m = messages[0];
        if (!m?.message || m.key.fromMe) return;
        const txt = (m.message.conversation || m.message.extendedTextMessage?.text || m.message.imageMessage?.caption || "").trim();
        const lower = txt.toLowerCase();
        const jid = m.key.remoteJid;

        if (lower === '.status') {
            const s = IS_CONNECTED ? `✅ CONNECTED\nNumber: ${CONNECTED_NUMBER}\nSince: ${LAST_CONNECTED}\nStatus: ${CONNECTION_STATUS}` : `❌ NOT CONNECTED\nStatus: ${CONNECTION_STATUS}\nCode: ${CODE || 'None'}`;
            await sock.sendMessage(jid, { text: `⚡ @obito Status\n${s}` });
            return;
        }

        if (lower === '.stop') {
            stoppedUntil = Date.now() + 5 * 60 * 1000;
            await sock.sendMessage(jid, { text: "⚡ @obito 5 min rest 😴 Auto varen!" });
            setTimeout(async () => { stoppedUntil = 0; try { await sock.sendMessage(jid, { text: "⚡ @obito back da! 🔥" }); } catch {} }, 5 * 60 * 1000);
            return;
        }
        if (Date.now() < stoppedUntil) return;
        if (lower === '.ping') { await sock.sendMessage(jid, { text: `⚡ @obito Online ✅ V18\n${CONNECTION_STATUS}` }); return; }

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
    const stopMsg = isStopped ? `⏸️ Rest ${Math.ceil((stoppedUntil-Date.now())/60000)}m` : '';
    
    let statusColor = IS_CONNECTED ? "#00ff00" : "#ff9900";
    if (CONNECTION_STATUS.includes("DISCONNECTED") || CONNECTION_STATUS.includes("LOGGED OUT")) statusColor = "#ff0000";
    
    let statusBox = `<div style="background:#111;color:${statusColor};padding:15px;border:2px solid ${statusColor};margin:10px;">
        <h2 style="margin:0;">STATUS: ${CONNECTION_STATUS}</h2>
        <p style="margin:5px 0;">Connected: ${IS_CONNECTED ? 'YES ✅' : 'NO ❌'}</p>
        ${CONNECTED_NUMBER ? `<p>Number: ${CONNECTED_NUMBER}</p><p>Since: ${LAST_CONNECTED}</p>` : ''}
        ${stopMsg ? `<p>${stopMsg}</p>` : ''}
    </div>`;

    let codeHtml = '';
    if (IS_CONNECTED) {
        codeHtml = `<h1 style="background:green;color:white;padding:20px;">✅ CONNECTED</h1><h2>${CONNECTED_NUMBER}</h2><p>Bot Working! Send .ping in WhatsApp</p>`;
    } else if (CODE) {
        codeHtml = `<h1 style="background:#000;color:#0f0;padding:20px;font-size:36px;">${CODE.slice(0,4)}-${CODE.slice(4)}</h1><b style="font-size:24px;">${CODE}</b><p>Enter in WhatsApp: Linked Devices -> Link with phone number</p><p><b>OR SCAN QR BELOW - BETTER!</b></p>`;
    } else {
        codeHtml = `<h3>Generating Code/QR... Wait 10 sec then refresh</h3>`;
    }

    const qrImg = !IS_CONNECTED && QR ? `<div style="border:3px solid #000;padding:10px;margin:10px;"><h3>SCAN THIS QR - 100% WORK!</h3><img src="${QR}" width="320"><br><b>WhatsApp -> Linked Devices -> Link a Device -> Scan</b></div>` : '';

    res.send(`
    <center>
        <h1>⚡ @obito V18 FINAL - STATUS FIX</h1>
        ${statusBox}
        ${codeHtml}
        ${qrImg}
        <hr>
        <a href="/" style="background:#000;color:#fff;padding:10px;">Refresh Status</a> 
        <a href="/clear" style="background:red;color:#fff;padding:10px;margin-left:10px;">Clear Auth</a>
        <br><br>
        <p>Commands: .ping | .status | .stop</p>
        <p><a href="/status">JSON Status (for UptimeRobot)</a></p>
        <script>setTimeout(()=>location.reload(),12000)</script>
    </center>`);
});

app.get('/status', (req, res) => {
    res.json({
        connected: IS_CONNECTED,
        status: CONNECTION_STATUS,
        number: CONNECTED_NUMBER,
        lastConnected: LAST_CONNECTED,
        code: CODE,
        hasQR: !!QR,
        uptime: process.uptime()
    });
});

app.get('/clear', (req, res) => {
    try { fs.rmSync('./auth', { recursive: true, force: true }); console.log("🗑️ Auth cleared"); } catch {}
    CONNECTION_STATUS = "Cleared - Restarting...";
    IS_CONNECTED = false;
    res.send('Cleared - Restarting in 2 sec...');
    setTimeout(() => process.exit(1), 1000);
});

app.listen(PORT, () => {
    console.log(`🚀 Server ${PORT}`);
    start();
    setInterval(() => {
        const url = process.env.RENDER_EXTERNAL_URL;
        if (url) fetch(url).then(()=>console.log("🔄 Keep Alive")).catch(()=>{});
    }, 8 * 60 * 1000);
});
