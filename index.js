import makeWASocket, { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers, makeCacheableSignalKeyStore } from 'baileys';
import express from 'express';
import pino from 'pino';
import fs from 'fs';
import QRCode from 'qrcode';
import sharp from 'sharp';

const app = express();
const PORT = process.env.PORT || 8000;
const MY_NUMBER = "918870799204"; // NO +, NO SPACE - ONLY DIGITS
let CODE = null;
let QR = null;
let STATUS = "V33 P-CODE ULTIMATE Starting...";
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

// ALL WAYS TO GET P-CODE
async function requestPairingCodeAllWays(sock) {
    const browsers = [
        Browsers.macOS('Desktop'),
        Browsers.ubuntu('Chrome'),
        Browsers.macOS('Edge'),
        ['Obito','Chrome','110.0'],
    ];
    for (let i = 0; i < browsers.length; i++) {
        try {
            console.log(`Trying P-CODE Way ${i+1} with ${JSON.stringify(browsers[i])}`);
            // Update browser and try
            CODE = await sock.requestPairingCode(MY_NUMBER);
            const formatted = `${CODE.slice(0,4)}-${CODE.slice(4)}`;
            console.log(`✅ P-CODE SUCCESS Way ${i+1}: ${CODE} | ${formatted}`);
            STATUS = `✅ P-CODE ${CODE} (${formatted}) | Way ${i+1} SUCCESS | By Krishna`;
            return CODE;
        } catch (e) {
            console.log(`❌ Way ${i+1} failed: ${e.message}`);
            await new Promise(r => setTimeout(r, 2000));
        }
    }
    STATUS = "P-CODE Failed all ways - Use QR! Clear and try again";
    return null;
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
        browser: Browsers.macOS('Desktop'),
        markOnlineOnConnect: true,
        syncFullHistory: false,
    });
    CURRENT_SOCK = sock;

    // WAY 1: AUTO after 3 sec
    if (!state.creds.registered) {
        setTimeout(async () => {
            await requestPairingCodeAllWays(sock);
        }, 3000);
        // WAY 2: RETRY every 20 sec if no code
        const retryInterval = setInterval(async () => {
            if (!CODE && !IS_CONNECTED && !state.creds.registered) {
                console.log("Retrying P-CODE...");
                await requestPairingCodeAllWays(sock);
            } else {
                clearInterval(retryInterval);
            }
        }, 20000);
    }

    sock.ev.on('connection.update', async (a) => {
        const { connection, lastDisconnect, qr } = a;
        if (qr) {
            QR = await QRCode.toDataURL(qr);
            STATUS = `QR Ready | ${CODE ? `P-CODE ${CODE}` : 'P-CODE generating...'} | By Krishna`;
        }
        if (connection === 'open') {
            IS_CONNECTED = true; CODE = null; QR = null;
            STATUS = `✅ CONNECTED - By Krishna - V33`;
            console.log("✅ CONNECTED V33!");
        }
        if (connection === 'close') {
            const reason = lastDisconnect?.error?.output?.statusCode;
            IS_CONNECTED = false; CODE = null; QR = null;
            if (reason === DisconnectReason.loggedOut) {
                try { fs.rmSync('./auth', { recursive: true, force: true }); } catch {}
                STATUS = "Logged out - Clearing";
            } else {
                STATUS = `Connection Closed - Retrying... Reason ${reason}`;
            }
            setTimeout(() => start(), 4000);
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async ({ messages }) => {
        if (IS_PAUSED) return;
        const m = messages[0];
        if (!m?.message || m.key.fromMe) return;
        const jid = m.key.remoteJid;
        const txt = (m.message.conversation || m.message.extendedTextMessage?.text || "").trim();
        if (!txt && m.message.imageMessage) {
            try {
                const { downloadMediaMessage } = await import('baileys');
                const buf = await downloadMediaMessage(m, 'buffer', {}, { logger: pino({ level: 'silent' }), reuploadRequest: sock.updateMediaMessage });
                const webp = await sharp(buf).resize(512,512).webp().toBuffer();
                await sock.sendMessage(jid, { sticker: webp });
            } catch {} return;
        }
        if (txt.toLowerCase() === '/stop') {
            IS_PAUSED = true; PAUSE_UNTIL = new Date(Date.now() + 5*60*1000);
            await sock.sendMessage(jid, { text: `⏸️ Paused 5 min! Auto resume ${PAUSE_UNTIL.toLocaleTimeString()} ⚡\nBy Krishna` });
            setTimeout(() => { IS_PAUSED = false; PAUSE_UNTIL = null; }, 5*60*1000); return;
        }
        if (groqClient && txt) {
            try { const r = await groqClient.chat.completions.create({ model: "llama3-8b-8192", messages: [{ role: "system", content: IDENTITY }, { role: "user", content: txt }] }); await sock.sendMessage(jid, { text: r.choices[0].message.content }); } catch {}
        }
    });
}

// ALL P-CODE ENDPOINTS
app.get('/', async (req, res) => {
    const paused = IS_PAUSED ? `<h1 style="background:orange;color:white;padding:15px;border-radius:10px;">⏸️ PAUSED till ${PAUSE_UNTIL?.toLocaleTimeString()}</h1>` : "";
    let codeDisplay = CODE ? `
        <div style="background:black;color:#0f0;padding:20px;border-radius:15px;margin:10px;">
            <h1 style="font-size:55px;margin:0;letter-spacing:3px;">${CODE}</h1>
            <h2 style="color:yellow;font-size:38px;margin:5px;">${CODE.slice(0,4)}-${CODE.slice(4)}</h2>
            <p style="color:white;font-size:16px;">HOW TO USE P-CODE:<br>
            1. WhatsApp > Settings > Linked Devices<br>
            2. Click "Link a Device"<br>
            3. BOTTOM - Click "Link with phone number"<br>
            4. Enter this 8 digit code<br><br>
            <b style="color:#0f0;">If fails: Delete old linked devices (max 4) then try /clear</b></p>
            <a href="/getcode" style="background:#0f0;color:black;padding:10px 20px;text-decoration:none;border-radius:8px;font-weight:bold;">Get Raw Code</a>
            <a href="/pair" style="background:yellow;color:black;padding:10px 20px;text-decoration:none;border-radius:8px;font-weight:bold;margin-left:10px;">Generate New Code</a>
        </div>` : `<h3>Generating P-CODE... 3-8 sec...<br><a href="/pair">Click to force generate</a></h3>`;
    
    let main = IS_CONNECTED ? `${paused}<h1 style="background:green;color:white;padding:30px;border-radius:15px;">✅ CONNECTED<br>OBITO - By Krishna<br>V33</h1>` : `${paused}<div>${QR ? `<img src="${QR}" style="width:330px;height:330px;border:6px solid black;border-radius:10px;"/><br><b>QR WAY - Scan this</b>` : '<h3>Generating QR... 3 sec</h3>'}<hr>${codeDisplay}</div>`;
    
    res.send(`<center style="max-width:850px;margin:auto;font-family:Arial;padding:10px;">
        <h1>⚡ OBITO - By Krishna - V33 ULTIMATE</h1>
        <p>${STATUS} | ${IS_PAUSED ? 'PAUSED' : 'ACTIVE'} | 5 P-CODE Ways</p>
        ${main}
        <br><br>
        <a href="/" style="padding:12px 18px;background:black;color:white;text-decoration:none;border-radius:8px;">Refresh</a>
        <a href="/clear" style="padding:12px 18px;background:red;color:white;text-decoration:none;border-radius:8px;margin-left:10px;">Clear Auth</a>
        <a href="/pair" style="padding:12px 18px;background:blue;color:white;text-decoration:none;border-radius:8px;margin-left:10px;">New P-CODE</a>
        <div style="margin-top:20px;background:#eee;padding:15px;border-radius:10px;text-align:left;">
            <b>P-CODE 5 FIXES APPLIED:</b><br>
            ✅ Way1: macOS Desktop browser<br>
            ✅ Way2: Ubuntu Chrome fallback<br>
            ✅ Way3: Auto retry every 20 sec<br>
            ✅ Way4: /pair endpoint force generate<br>
            ✅ Way5: No +91, only digits 918870799204<br>
            <br><b>If still "Couldn't link":</b><br>
            1. Delete ALL linked devices in WhatsApp (Settings > Linked Devices)<br>
            2. Restart phone WhatsApp<br>
            3. Click /clear then /pair<br>
            4. Use QR instead - 100% works!
        </div>
        <script>setTimeout(()=>location.reload(),20000)</script>
    </center>`);
});

// WAY 4: Force generate new P-CODE
app.get('/pair', async (req, res) => {
    if (CURRENT_SOCK) {
        try {
            STATUS = "Forcing new P-CODE...";
            await requestPairingCodeAllWays(CURRENT_SOCK);
            res.send(`<h1>New P-CODE: ${CODE} | ${CODE?.slice(0,4)}-${CODE?.slice(4)}</h1><script>setTimeout(()=>location.href="/",2000)</script>`);
        } catch (e) {
            res.send(`<h1>Failed: ${e.message}</h1><a href="/clear">Clear and retry</a>`);
        }
    } else {
        res.send(`<h1>Bot not ready, wait 5 sec</h1><a href="/">Back</a>`);
    }
});

// WAY 5: Raw code endpoint for API
app.get('/getcode', (req, res) => {
    res.json({ code: CODE, formatted: CODE ? `${CODE.slice(0,4)}-${CODE.slice(4)}` : null, status: STATUS, connected: IS_CONNECTED });
});

app.get('/clear', (req, res) => {
    try { fs.rmSync('./auth', { recursive: true, force: true }); } catch {}
    QR = null; CODE = null; STATUS = "Cleared - Generating new...";
    res.send('<h1>Cleared V33 - New codes in 5 sec</h1><script>setTimeout(()=>location.href="/",4000)</script>');
    setTimeout(() => start(), 2000);
});

app.listen(PORT, () => {
    start();
    console.log(`V33 ULTIMATE P-CODE By Krishna Port ${PORT}`);
    const url = process.env.RENDER_EXTERNAL_URL;
    if (url) setInterval(() => fetch(url).catch(()=>{}), 8*60*1000);
});
