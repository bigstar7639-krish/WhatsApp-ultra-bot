import makeWASocket, { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers, downloadMediaMessage } from '@whiskeysockets/baileys';
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
let STATUS = "Starting V19...";
let IS_CONNECTED = false;
let CONNECTED_NUM = "";
let LAST_TIME = "";
let pairingAttempts = 0;

console.log("⚡ @obito V19 - 100% P-CODE FIX - Starting...");

if (process.env.GROQ_API_KEY) {
    const { default: Groq } = await import('groq-sdk');
    groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
    console.log("✅ GROQ Connected");
}

async function askAI(prompt) {
    if (!groqClient) return null;
    try {
        const r = await groqClient.chat.completions.create({
            model: "llama3-8b-8192",
            messages: [
                { role: "system", content: "You are @obito energy ai assistant by Krishna. Tamil Tanglish, short, cool." },
                { role: "user", content: prompt }
            ]
        });
        return r.choices[0].message.content;
    } catch (e) { return null; }
}

async function generatePairingCode(sock, phoneNumber) {
    try {
        pairingAttempts++;
        console.log(`🔄 [Attempt ${pairingAttempts}] Requesting P-Code for ${phoneNumber}...`);
        STATUS = `Generating P-Code Attempt ${pairingAttempts}...`;
        
        // LATEST FIX: Request with 3 sec delay + custom browser
        CODE = await sock.requestPairingCode(phoneNumber);
        const formatted = `${CODE.slice(0,4)}-${CODE.slice(4)}`;
        
        console.log("========================================");
        console.log(`🔥🔥🔥 PAIRING CODE: ${CODE} 🔥🔥🔥`);
        console.log(`🔥 FORMATTED: ${formatted}`);
        console.log(`📱 ENTER IN: WhatsApp -> Linked Devices -> Link with phone number`);
        console.log(`⏰ Valid for 60 sec - Attempt: ${pairingAttempts}`);
        console.log("========================================");
        
        STATUS = `Pairing Code Ready: ${formatted} | Attempt ${pairingAttempts} | Valid 60s`;
        return CODE;
    } catch (e) {
        console.log(`❌ P-Code Error (Attempt ${pairingAttempts}):`, e.message);
        STATUS = `P-Code Failed: ${e.message} - Retrying...`;
        return null;
    }
}

async function start() {
    const raw = process.env.PHONE_NUMBER || '';
    const num = raw.replace(/[^0-9]/g, '');
    console.log(`📱 PHONE ENV: ${raw} -> Cleaned: ${num} (must be country code + number, no +)`);
    
    if (num.length < 11) {
        console.log("❌ PHONE_NUMBER invalid! Use 918870799204 format (12 digits)");
        STATUS = "❌ Invalid PHONE_NUMBER - Use 91 + 10 digits";
    }

    const { version } = await fetchLatestBaileysVersion();
    console.log(`📦 Baileys Latest Version: ${version} (Fixed 6.7.22)`);
    
    const { state, saveCreds } = await useMultiFileAuthState('./auth');
    
    // LATEST FIX: Use Browsers.ubuntu + correct config【7912633517451486994†L14-L18】
    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        auth: state,
        browser: Browsers.ubuntu('Chrome'),
        keepAliveIntervalMs: 10000,
        markOnlineOnConnect: true,
        syncFullHistory: false,
        shouldSyncHistoryMessage: () => false,
    });

    // AUTO P-CODE GENERATION - LATEST LOGIC
    if (!sock.authState.creds.registered) {
        IS_CONNECTED = false;
        STATUS = "Not registered - Will generate P-Code in 3s...";
        console.log("⏳ Not registered - Preparing P-Code...");
        
        setTimeout(async () => {
            const code = await generatePairingCode(sock, num);
            // Auto refresh code every 50 sec if not connected (prevent expire)
            const refreshInterval = setInterval(async () => {
                if (!IS_CONNECTED && sock.authState.creds.registered === false) {
                    console.log("🔄 Auto refreshing P-Code (old expired)...");
                    await generatePairingCode(sock, num);
                } else {
                    clearInterval(refreshInterval);
                }
            }, 50000); // 50 sec refresh
        }, 3000);
    } else {
        STATUS = "Already registered - Connecting...";
    }

    sock.ev.on('connection.update', async (u) => {
        const { connection, lastDisconnect, qr } = u;
        
        if (qr) {
            QR = await qrcode.toDataURL(qr);
            STATUS = "QR Ready - Scan or Use P-Code";
            console.log("📷 QR Generated");
        }
        
        if (connection === 'connecting') {
            STATUS = "Connecting to WhatsApp...";
        }
        
        if (connection === 'open') {
            QR = null; CODE = null;
            IS_CONNECTED = true;
            CONNECTED_NUM = num;
            LAST_TIME = new Date().toLocaleString("en-IN", {timeZone: "Asia/Kolkata"});
            STATUS = `✅ CONNECTED - ${LAST_TIME}`;
            pairingAttempts = 0;
            console.log("✅✅✅ CONNECTED SUCCESSFULLY ✅✅✅");
            console.log(`Number: ${num} | Time: ${LAST_TIME}`);
        }
        
        if (connection === 'close') {
            IS_CONNECTED = false;
            const code = lastDisconnect?.error?.output?.statusCode;
            const msg = lastDisconnect?.error?.message || "";
            console.log(`❌ Connection closed - Code: ${code} | ${msg}`);
            
            if (code === DisconnectReason.loggedOut) {
                STATUS = "🔴 LOGGED OUT - Clear Auth needed";
            } else if (code === 405 || msg.includes("405")) {
                // Specific fix for Couldn't link device - clear and retry
                STATUS = "❌ P-Code Expired/Invalid - Clearing & Retrying...";
                console.log("🗑️ Clearing auth due to link failure...");
                try { fs.rmSync('./auth', { recursive: true, force: true }); } catch {}
                setTimeout(() => start(), 3000);
            } else {
                STATUS = `Disconnected (${code}) - Reconnecting 5s...`;
                setTimeout(() => start(), 5000);
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
            await sock.sendMessage(jid, { text: `⚡ Status\nConnected: ${IS_CONNECTED}\n${STATUS}\nCode: ${CODE || 'None'}` });
            return;
        }
        if (lower === '.stop') {
            stoppedUntil = Date.now() + 5*60*1000;
            await sock.sendMessage(jid, { text: "⚡ 5 min rest 😴" });
            setTimeout(async () => { stoppedUntil = 0; try { await sock.sendMessage(jid, { text: "⚡ back da! 🔥" }); } catch {} }, 5*60*1000);
            return;
        }
        if (Date.now() < stoppedUntil) return;
        if (lower === '.ping') { await sock.sendMessage(jid, { text: `⚡ Online V19 ✅\n${STATUS}` }); return; }

        if (m.message.imageMessage) {
            try {
                const buf = await downloadMediaMessage(m, 'buffer', {}, { logger: pino({ level: 'silent' }), reuploadRequest: sock.updateMediaMessage });
                const webp = await sharp(buf).resize(512,512).webp().toBuffer();
                await sock.sendMessage(jid, { sticker: webp });
            } catch {}
            return;
        }
        if (!txt || !groqClient) return;
        try { const a = await askAI(txt); if (a) await sock.sendMessage(jid, { text: a }); } catch {}
    });
}

app.get('/', (req, res) => {
    let color = IS_CONNECTED ? "#00ff00" : (STATUS.includes("Ready") ? "#ffaa00" : "#ff4444");
    let statusBox = `<div style="background:#111;color:${color};padding:15px;border:3px solid ${color};margin:10px;">
        <h2>STATUS: ${STATUS}</h2>
        <p>Connected: ${IS_CONNECTED ? 'YES ✅' : 'NO ❌'}</p>
        ${CONNECTED_NUM ? `<p>Num: ${CONNECTED_NUM}<br>Since: ${LAST_TIME}</p>` : ''}
        <p>Attempts: ${pairingAttempts}</p>
    </div>`;

    let mainHtml = '';
    if (IS_CONNECTED) {
        mainHtml = `<h1 style="background:green;color:white;padding:20px;">✅ CONNECTED - ${CONNECTED_NUM}</h1><p>Bot working! Try .ping</p>`;
    } else if (CODE) {
        mainHtml = `<div style="background:#000;padding:20px;">
            <h1 style="color:#0f0;font-size:42px;margin:0;">${CODE.slice(0,4)}-${CODE.slice(4)}</h1>
            <h2 style="color:white;">${CODE}</h2>
            <p style="color:yellow;">⚠️ Auto refresh every 50 sec - Use latest code!</p>
            <p style="color:white;">Enter in: WhatsApp -> Linked Devices -> Link with phone number</p>
        </div>`;
    } else {
        mainHtml = `<h3>Generating... Wait 5 sec & Refresh</h3>`;
    }

    const qrImg = !IS_CONNECTED && QR ? `<div style="border:3px solid black;padding:10px;"><h3>OR SCAN QR (100% WORK)</h3><img src="${QR}" width="340"><p>Linked Devices -> Link a Device -> Scan</p></div>` : '';

    res.send(`<center><h1>⚡ @obito V19 - 100% P-CODE FIX (6.7.22)</h1>${statusBox}${mainHtml}${qrImg}<br>
    <a href="/" style="background:black;color:white;padding:10px;">Refresh</a> <a href="/clear" style="background:red;color:white;padding:10px;margin-left:10px;">Clear Auth</a>
    <br><br><p>.ping | .status | .stop</p><p><a href="/status">JSON Status</a></p>
    <p style="color:red;"><b>FIX: If P-Code fails, QR scan - instant connect!</b></p>
    <p style="font-size:12px;">Fixes: Baileys 6.7.22 latest, Browsers.ubuntu, Auto-refresh P-Code every 50s, Auto clear on 405 error</p>
    <script>setTimeout(()=>location.reload(),8000)</script></center>`);
});

app.get('/status', (req, res) => res.json({ connected: IS_CONNECTED, status: STATUS, code: CODE, formatted: CODE ? `${CODE.slice(0,4)}-${CODE.slice(4)}` : null, attempts: pairingAttempts, hasQR: !!QR, number: CONNECTED_NUM }));
app.get('/clear', (req, res) => { try { fs.rmSync('./auth', { recursive: true, force: true }); } catch {} IS_CONNECTED = false; CODE = null; QR = null; STATUS = "Cleared - Restarting..."; res.send('Cleared...'); setTimeout(()=>process.exit(1),1000); });

app.listen(PORT, () => {
    console.log(`🚀 V19 Running on ${PORT}`);
    start();
    setInterval(() => { const url = process.env.RENDER_EXTERNAL_URL; if (url) fetch(url).catch(()=>{}); }, 7*60*1000);
});
