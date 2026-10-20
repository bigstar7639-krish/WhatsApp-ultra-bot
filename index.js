// ============================================
// OBITO - Energy AI Assistant By Krishna
// V33.1 FINAL PRO - 300 LINE - BIG CODE 95px
// MY_NUMBER: 918870799204 - TODAY WORKING
// ============================================

import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  Browsers,
  makeCacheableSignalKeyStore
} from 'baileys';
import express from 'express';
import pino from 'pino';
import fs from 'fs';
import QRCode from 'qrcode';
import sharp from 'sharp';

// ================= CONFIG =================
const app = express();
const PORT = process.env.PORT || 8000;
const MY_NUMBER = "918870799204"; // NO +, NO SPACE

// ================= GLOBAL STATE =================
let CODE = null;          // P-CODE storage
let QR = null;            // QR Data URL
let STATUS = "V33.1 300 LINE PRO Starting... | By Krishna";
let IS_CONNECTED = false; // WhatsApp connected?
let IS_PAUSED = false;    // /stop paused?
let PAUSE_UNTIL = null;   // Pause expiry time
let groqClient = null;    // Groq AI client
let CURRENT_SOCK = null;  // Current socket reference

// ================= IDENTITY =================
const IDENTITY = `
You are Obito - Energy AI Assistant by Krishna.
Energetic. Friendly. Auto detect user language.
Support Tamil, Hindi, English, Malayalam, Telugu etc.
Group chat supported. No numbers in reply.
Be concise but energetic. By Krishna.
`;

// ================= GROQ INIT =================
if (process.env.GROQ_API_KEY) {
  const { default: Groq } = await import('groq-sdk');
  groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
  console.log("✅ Groq AI Ready - Llama3-8b-8192");
}

// ================= P-CODE FUNCTION - TODAY WORKING =================
/**
 * Request Pairing Code - 1 Stable Way
 * Fixed: No fake browser loop, single stable macOS Desktop
 * Today working: Version fallback if fetch fails
 */
async function getPairingCode(sock) {
  try {
    if (!sock) throw new Error("Socket not ready - Wait 5 sec");
    
    console.log(`🔑 Requesting P-CODE for ${MY_NUMBER}...`);
    CODE = await sock.requestPairingCode(MY_NUMBER);
    
    if (!CODE) throw new Error("Empty code received");
    
    const formatted = `${CODE.slice(0, 4)}-${CODE.slice(4)}`;
    console.log(`✅ P-CODE SUCCESS: ${CODE} | ${formatted} | For ${MY_NUMBER}`);
    
    STATUS = `✅ P-CODE ${CODE} (${formatted}) | For ${MY_NUMBER} | By Krishna | 300 LINE PRO`;
    return CODE;
    
  } catch (e) {
    console.log(`❌ P-CODE Failed: ${e.message}`);
    STATUS = `❌ P-CODE Failed: ${e.message} | Delete linked devices (max 4) | Use QR | By Krishna`;
    return null;
  }
}

// ================= MAIN BOT START =================
async function start() {
  // Auto unpause if expired on restart
  if (IS_PAUSED && PAUSE_UNTIL && new Date() > PAUSE_UNTIL) {
    IS_PAUSED = false;
    PAUSE_UNTIL = null;
    STATUS = "✅ Auto resumed after 5 min pause";
  }
  
  if (IS_PAUSED) {
    console.log(`⏸️ Bot is paused till ${PAUSE_UNTIL?.toLocaleTimeString()}`);
    return;
  }

  // Get latest WA version with fallback for today
  let version;
  try {
    const v = await fetchLatestBaileysVersion();
    version = v.version;
    console.log(`✅ WA Version: ${version}`);
  } catch {
    version = [2, 3000, 1015901307]; // Fallback stable version
    console.log(`⚠️ Using fallback WA version`);
  }

  // Load auth state from ./auth folder
  const { state, saveCreds } = await useMultiFileAuthState('./auth');

  // Create WhatsApp socket
  const sock = makeWASocket({
    version,
    logger: pino({ level: 'silent' }), // Silent logs
    printQRInTerminal: false,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
    },
    browser: Browsers.macOS('Desktop'), // Most stable for P-CODE
    markOnlineOnConnect: true, // Show online
    syncFullHistory: false, // Save bandwidth
  });

  CURRENT_SOCK = sock;
  console.log(`🚀 Socket created for ${MY_NUMBER}`);

  // ============ AUTO P-CODE GENERATION ============
  if (!state.creds.registered) {
    console.log("📱 Not registered - Will generate P-CODE in 4 sec...");
    
    // Way 1: Auto after 4 sec
    setTimeout(async () => {
      console.log("🔑 Auto generating P-CODE (Way 1)...");
      await getPairingCode(sock);
    }, 4000);

    // Way 2: Retry every 30 sec if no code and not connected
    const retryInterval = setInterval(async () => {
      if (!CODE && !IS_CONNECTED && !state.creds.registered && CURRENT_SOCK) {
        console.log("🔄 Retrying P-CODE (Way 2 - 30s)...");
        await getPairingCode(CURRENT_SOCK);
      } else {
        clearInterval(retryInterval);
      }
    }, 30000);
  }

  // ============ CONNECTION EVENTS ============
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    // QR Generated
    if (qr) {
      QR = await QRCode.toDataURL(qr);
      STATUS = `QR Ready | ${CODE ? `P-CODE ${CODE} (${CODE.slice(0,4)}-${CODE.slice(4)})` : 'P-CODE generating...'} | By Krishna | 300 LINE`;
      console.log("📷 QR Generated");
    }

    // Connected Successfully
    if (connection === 'open') {
      IS_CONNECTED = true;
      CODE = null;
      QR = null;
      STATUS = `✅ CONNECTED ${MY_NUMBER} - By Krishna - V33.1 300 LINE PRO BIG`;
      console.log(`✅ CONNECTED - ${MY_NUMBER} - V33.1 300 LINE PRO`);
    }

    // Connection Closed
    if (connection === 'close') {
      const reason = lastDisconnect?.error?.output?.statusCode;
      IS_CONNECTED = false;
      CODE = null;
      QR = null;

      console.log(`❌ Connection closed - Reason: ${reason}`);

      if (reason === DisconnectReason.loggedOut) {
        console.log("🗑️ Logged out - Clearing auth...");
        try {
          fs.rmSync('./auth', { recursive: true, force: true });
        } catch {}
        STATUS = "Logged out - Cleared - Generating new...";
      } else {
        STATUS = `Connection Closed - Reason ${reason} - Retrying in 4 sec...`;
      }

      // Auto reconnect after 4 sec
      setTimeout(() => start(), 4000);
    }
  });

  // Save credentials on update
  sock.ev.on('creds.update', saveCreds);

  // ============ MESSAGE HANDLER ============
  sock.ev.on('messages.upsert', async ({ messages }) => {
    const m = messages[0];
    if (!m?.message || m.key.fromMe) return;

    const jid = m.key.remoteJid;
    const txt = (
      m.message.conversation ||
      m.message.extendedTextMessage?.text ||
      ""
    ).trim();

    // ---- Auto Unpause Check ----
    if (IS_PAUSED && PAUSE_UNTIL && new Date() > PAUSE_UNTIL) {
      IS_PAUSED = false;
      PAUSE_UNTIL = null;
      STATUS = `✅ Auto resumed after 5 min - By Krishna - FINAL`;
      console.log("✅ Auto resumed after 5 min pause");
    }

    // ---- Command: /start - Wake Bot ----
    if (txt.toLowerCase() === '/start') {
      IS_PAUSED = false;
      PAUSE_UNTIL = null;
      STATUS = `✅ CONNECTED - By Krishna - V33.1 FINAL PRO`;
      await sock.sendMessage(jid, {
        text: "⚡ *Obito AI activated!* Ready to serve you with full energy! By Krishna ⚡",
      });
      console.log(`✅ /start from ${jid} - Resumed`);
      return;
    }

    // ---- Command: /stop - Pause 5 MIN AUTO ----
    if (txt.toLowerCase() === '/stop') {
      IS_PAUSED = true;
      PAUSE_UNTIL = new Date(Date.now() + 5 * 60 * 1000); // 5 MIN
      STATUS = `⏸️ PAUSED 5 MIN till ${PAUSE_UNTIL.toLocaleTimeString()} | By Krishna`;
      
      await sock.sendMessage(jid, {
        text: `⏸️ *Obito AI paused for 5 minutes!* ⏸️\nAuto resume at ${PAUSE_UNTIL.toLocaleTimeString()} ⚡\nSend /start to wake early!\nBy Krishna`,
      });
      
      console.log(`⏸️ /stop from ${jid} - Paused 5 min till ${PAUSE_UNTIL.toLocaleTimeString()}`);
      
      // Auto resume after 5 min
      setTimeout(() => {
        IS_PAUSED = false;
        PAUSE_UNTIL = null;
        STATUS = `✅ Auto resumed after 5 min - By Krishna - FINAL`;
        console.log("✅ Auto resumed after 5 min timeout");
      }, 5 * 60 * 1000);
      
      return;
    }

    // Silent exit if paused
    if (IS_PAUSED) return;

    // ---- Image to Sticker - 512x512 ----
    if (!txt && m.message.imageMessage) {
      try {
        const { downloadMediaMessage } = await import('baileys');
        const buffer = await downloadMediaMessage(
          m,
          'buffer',
          {},
          { logger: pino({ level: 'silent' }), reuploadRequest: sock.updateMediaMessage }
        );
        const webpBuffer = await sharp(buffer).resize(512, 512).webp().toBuffer();
        await sock.sendMessage(jid, { sticker: webpBuffer });
        console.log(`✅ Sticker sent to ${jid}`);
      } catch (err) {
        console.log(`❌ Sticker failed: ${err.message}`);
      }
      return;
    }

    // ---- AI Chat via Groq - Llama3-8b ----
    if (txt && groqClient) {
      try {
        const completion = await groqClient.chat.completions.create({
          model: "llama3-8b-8192",
          messages: [
            { role: "system", content: IDENTITY },
            { role: "user", content: txt },
          ],
        });
        const reply = completion.choices[0]?.message?.content;
        if (reply) {
          await sock.sendMessage(jid, { text: reply });
        }
      } catch (err) {
        console.log(`❌ Groq Error: ${err.message}`);
      }
    }
  });
}

// ================= WEB DASHBOARD - BIG CODE 95px =================
app.get('/', (req, res) => {
  const pausedBanner = IS_PAUSED
    ? `<h1 style="background:orange;color:white;padding:18px;border-radius:12px;font-size:28px;">⏸️ PAUSED 5 MIN till ${PAUSE_UNTIL?.toLocaleTimeString()}<br>Send /start to wake early</h1>`
    : "";

  // BIG CODE BOX - 95px
  let codeBox = CODE
    ? `
        <div style="background:black;padding:45px;border-radius:22px;border:6px solid #0f0;margin:15px 0;">
            <h2 style="color:white;margin:0;font-size:24px;">FOR ${MY_NUMBER} - 300 LINE PRO BIG - BY KRISHNA</h2>
            <h1 style="color:#0f0;font-size:95px;margin:15px 0;letter-spacing:10px;font-weight:900;line-height:1;">${CODE}</h1>
            <h1 style="color:yellow;font-size:70px;margin:0;letter-spacing:8px;font-weight:900;">${CODE.slice(0,4)}-${CODE.slice(4)}</h1>
            <p style="color:white;font-size:22px;margin-top:25px;line-height:1.5;">
            <b>HOW TO USE P-CODE:</b><br>
            1. WhatsApp > Settings > Linked Devices<br>
            2. Click "Link a Device"<br>
            3. BOTTOM: "Link with phone number instead"<br>
            4. Enter this 8 digit code - BE FAST 60 SEC!<br><br>
            <b style="color:#0f0;">If fails: Delete old linked devices (max 4) then try /clear</b>
            </p>
            <div style="margin-top:20px;display:flex;gap:15px;justify-content:center;flex-wrap:wrap;">
                <a href="/getcode" style="background:#0f0;color:black;padding:16px 28px;text-decoration:none;border-radius:12px;font-weight:bold;font-size:20px;">Raw JSON</a>
                <a href="/pair" style="background:yellow;color:black;padding:16px 28px;text-decoration:none;border-radius:12px;font-weight:bold;font-size:20px;">🔄 New BIG Code</a>
            </div>
        </div>`
    : `<h1 style="font-size:32px;">Generating BIG P-CODE for ${MY_NUMBER}... 4 sec...<br><br><a href="/pair" style="font-size:26px;background:blue;color:white;padding:18px 30px;text-decoration:none;border-radius:12px;">Force Generate BIG Code</a></h1>`;

  let qrBox = QR
    ? `<div style="margin:25px 0;"><img src="${QR}" style="width:480px;height:480px;border:10px solid black;border-radius:20px;"/><br><b style="font-size:26px;">QR WAY - 100% SCAN WORKS</b></div>`
    : `<h3>QR Generating... 3 sec</h3>`;

  let mainContent = IS_CONNECTED
    ? `${pausedBanner}<h1 style="background:green;color:white;padding:40px;border-radius:20px;font-size:50px;">✅ CONNECTED<br>${MY_NUMBER}<br>By Krishna<br>V33.1 300 LINE PRO FINAL</h1>`
    : `${pausedBanner}${qrBox}<hr>${codeBox}`;

  res.send(`
    <center style="max-width:900px;margin:auto;font-family:Arial;padding:10px;">
        <h1 style="font-size:36px;">⚡ OBITO V33.1 300 LINE PRO FINAL BIG - ${MY_NUMBER}</h1>
        <p style="font-size:20px;">${STATUS} | ${IS_PAUSED ? 'PAUSED 5 MIN' : 'ACTIVE'} | TODAY WORKING</p>
        ${mainContent}
        <br><br>
        <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;">
            <a href="/" style="padding:16px 22px;background:black;color:white;text-decoration:none;border-radius:10px;font-size:20px;font-weight:bold;">🔄 Refresh</a>
            <a href="/clear" style="padding:16px 22px;background:red;color:white;text-decoration:none;border-radius:10px;font-size:20px;font-weight:bold;">🗑️ Clear Auth</a>
            <a href="/pair" style="padding:16px 22px;background:blue;color:white;text-decoration:none;border-radius:10px;font-size:20px;font-weight:bold;">🔑 New BIG Code</a>
            <a href="/getcode" style="padding:16px 22px;background:green;color:white;text-decoration:none;border-radius:10px;font-size:20px;font-weight:bold;">Raw JSON</a>
            <a href="/status" style="padding:16px 22px;background:purple;color:white;text-decoration:none;border-radius:10px;font-size:20px;font-weight:bold;">Status</a>
        </div>
        <div style="margin-top:25px;background:#eee;padding:20px;border-radius:12px;text-align:left;font-size:16px;line-height:1.6;">
            <b>✅ 300 LINE PRO - ALL FEATURES INCLUDED:</b><br>
            ✅ BIG CODE 95px + 70px + QR 480px + Auto Retry 30s<br>
            ✅ 5 Endpoints: / + /pair + /getcode + /status + /clear<br>
            ✅ Baileys Stable + Version Fallback + Today Working<br>
            ✅ Group + Private + All Languages Auto + By Krishna<br>
            ✅ Sticker 512x512 + Groq Llama3-8b-8192 + Energetic<br>
            ✅ /stop 5 MIN Auto + /start Instant Wake + Auto Resume<br>
            ✅ Auto Reconnect + Keep-Alive 8 min + 24/7 Online + markOnlineOnConnect<br>
            ✅ LoggedOut Auto Clear + Auth Save + No Number in Identity<br>
        </div>
        <p style="margin-top:15px;color:#666;">Built by Krishna | 918870799204 | 300 LINE PRO FINAL | ${new Date().toLocaleString()}</p>
        <script>setTimeout(()=>location.reload(),25000)</script>
    </center>
  `);
});

// ================= OTHER ENDPOINTS =================
app.get('/pair', async (req, res) => {
  try {
    if (!CURRENT_SOCK) {
      return res.send(`<h1>Bot not ready - Wait 5 sec then refresh</h1><a href="/">Back</a>`);
    }
    STATUS = "Forcing new BIG P-CODE...";
    await getPairingCode(CURRENT_SOCK);
    if (!CODE) {
      return res.send(`<h1>Failed - Delete linked devices (max 4 allowed) then try</h1><a href="/clear">Clear Auth</a> | <a href="/">Home</a>`);
    }
    res.send(`
      <center style="font-family:Arial;padding:20px;">
        <h1 style="font-size:85px;margin:0;">${CODE}</h1>
        <h1 style="font-size:65px;color:yellow;background:black;padding:25px;border-radius:15px;margin:10px 0;">${CODE.slice(0,4)}-${CODE.slice(4)}</h1>
        <h2>FOR ${MY_NUMBER} - ENTER FAST 60 SEC!</h2>
        <a href="/" style="font-size:26px;background:green;color:white;padding:15px 25px;text-decoration:none;border-radius:10px;font-weight:bold;">Go Back - BIG CODE Dashboard</a>
      </center>
      <script>setTimeout(()=>location.href="/",5000)</script>
    `);
  } catch (e) {
    res.send(`<h1>Error: ${e.message}</h1><a href="/clear">Clear</a> | <a href="/">Home</a>`);
  }
});

app.get('/getcode', (req, res) => {
  res.json({
    code: CODE,
    formatted: CODE ? `${CODE.slice(0,4)}-${CODE.slice(4)}` : null,
    number: MY_NUMBER,
    status: STATUS,
    connected: IS_CONNECTED,
    paused: IS_PAUSED,
    pauseUntil: PAUSE_UNTIL,
    bigCode: "95px + 70px",
    version: "V33.1 300 LINE PRO FINAL",
    by: "Krishna",
    todayWorking: true
  });
});

app.get('/status', (req, res) => {
  res.json({
    status: STATUS,
    isConnected: IS_CONNECTED,
    isPaused: IS_PAUSED,
    pauseUntil: PAUSE_UNTIL,
    pairingCode: CODE,
    number: MY_NUMBER,
    version: "300 LINE PRO FINAL",
    endpoints: ["/", "/pair", "/getcode", "/status", "/clear"],
    features: "BIG CODE, QR, Group, Private, Auto Language, Sticker, Groq, /stop 5min, /start"
  });
});

app.get('/clear', (req, res) => {
  try {
    fs.rmSync('./auth', { recursive: true, force: true });
    console.log("🗑️ Auth cleared");
  } catch {}
  QR = null;
  CODE = null;
  STATUS = "Cleared - Generating new BIG CODE in 5 sec... | 300 LINE PRO";
  res.send('<h1>✅ Cleared V33.1 300 LINE PRO - New BIG CODE in 5 sec</h1><script>setTimeout(()=>location.href="/",4000)</script>');
  setTimeout(() => start(), 2000);
});

// ================= START SERVER =================
app.listen(PORT, () => {
  start().catch(err => console.error("❌ Start error:", err));
  console.log(`🚀 V33.1 300 LINE PRO FINAL BIG - Port ${PORT} - ${MY_NUMBER} - By Krishna`);
  
  // Keep-Alive for Render - Ping every 8 min to prevent sleep
  const url = process.env.RENDER_EXTERNAL_URL;
  if (url) {
    console.log(`🔄 Keep-Alive enabled for ${url} - Every 8 min`);
    setInterval(() => {
      fetch(url).catch(() => {});
    }, 8 * 60 * 1000);
  }
});

// ================= END OF 300 LINE PRO =================
