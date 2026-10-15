require('dotenv').config();
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, makeCacheableSignalKeyStore } = require('@whiskeysockets/baileys');
const express = require('express');
const qrcode = require('qrcode');
const pino = require('pino');
const Groq = require('groq-sdk');

const app = express();
const PORT = process.env.PORT || 3000;

let qrCodeData = null;
let pairingCodeData = null;
let connectionStatus = "Disconnected";
let logs = [];

function addLog(msg) {
    console.log(msg);
    logs.push(`[${new Date().toLocaleTimeString()}] ${msg}`);
    if (logs.length > 100) logs.shift();
}

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    
    const sock = makeWASocket({
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }))
        },
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        browser: ["Ubuntu", "Chrome", "20.0.04"]
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr, pairingCode } = update;
        
        if (qr) {
            qrCodeData = qr;
            connectionStatus = "Scan QR Code";
            addLog("✅ NEW QR CODE Generated - Scan it!");
        }
        if (pairingCode) {
            pairingCodeData = pairingCode;
            addLog(`✅ PAIRING CODE: ${pairingCode}`);
        }
        if (connection) {
            connectionStatus = connection;
            addLog(`Connection: ${connection}`);
        }
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            addLog(`Closed: ${lastDisconnect?.error} - Reconnect: ${shouldReconnect}`);
            if (shouldReconnect) {
                setTimeout(startBot, 3000);
            }
        }
        if (connection === 'open') {
            qrCodeData = null;
            pairingCodeData = null;
            connectionStatus = "CONNECTED ✅";
            addLog("🎉 WHATSAPP CONNECTED SUCCESSFULLY!");
        }
    });

    // Request Pairing Code - Change number here
    if (!sock.authState.creds.registered) {
        setTimeout(async () => {
            try {
                const number = "918870799204"; // Your number without +
                const code = await sock.requestPairingCode(number);
                pairingCodeData = code;
                addLog(`🔑 YOUR PAIRING CODE FOR ${number}: ${code}`);
            } catch (e) {
                addLog(`Pairing Error (QR still works): ${e.message}`);
            }
        }, 3000);
    }

    // AI Message Handler
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;
        
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text;
        if (!text) return;

        const jid = msg.key.remoteJid;
        addLog(`Message from ${jid}: ${text}`);

        try {
            const chatCompletion = await groq.chat.completions.create({
                messages: [{ role: "user", content: text }],
                model: "llama-3.1-8b-instant",
            });
            const reply = chatCompletion.choices[0]?.message?.content || "Hi da!";
            await sock.sendMessage(jid, { text: reply });
            addLog(`Replied to ${jid}`);
        } catch (err) {
            addLog(`Groq Error: ${err.message}`);
            await sock.sendMessage(jid, { text: "Hi da! Bot working da!" });
        }
    });
}

// DASHBOARD
app.get('/', async (req, res) => {
    let qrImage = "";
    if (qrCodeData) {
        qrImage = await qrcode.toDataURL(qrCodeData);
    }
    
    res.send(`
    <html>
    <head><title>Ultra Bot Dashboard</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body{font-family:Arial;background:#111;color:#fff;text-align:center;padding:20px}
        .card{background:#222;padding:20px;border-radius:15px;margin:15px auto;max-width:500px;box-shadow:0 0 20px #0f0}
        .qr{background:#fff;padding:15px;border-radius:10px;display:inline-block}
        .code{font-size:40px;letter-spacing:10px;color:#0f0;font-weight:bold}
        .status{font-size:20px;margin:10px}
        .log{background:#000;text-align:left;padding:10px;height:200px;overflow-y:scroll;font-size:12px;color:#0f0}
        .green{color:#0f0}.red{color:red}
    </style>
    </head>
    <body>
        <h1>🤖 ULTRA CLEAR DASHBOARD</h1>
        <div class="card">
            <div class="status">Status: <b class="${connectionStatus.includes('CONNECTED') ? 'green' : 'red'}">${connectionStatus}</b></div>
            ${qrImage ? `<div class="qr"><img src="${qrImage}" width="250"/><p style="color:black">Scan this QR in WhatsApp > Linked Devices</p></div>` : '<p>No QR - Already Connected or Wait...</p>'}
            ${pairingCodeData ? `<div><p>OR USE PAIRING CODE:</p><div class="code">${pairingCodeData}</div><p>WhatsApp > Linked Devices > Link with phone number</p></div>` : ''}
        </div>
        <div class="card">
            <h3>Logs</h3>
            <div class="log">${logs.slice().reverse().join('<br>')}</div>
            <button onclick="location.reload()" style="margin-top:10px;padding:10px 20px">Refresh</button>
        </div>
        <p>Number: 918870799204 | QR = No Block | Pairing = May Block 24hr</p>
    </body>
    </html>
    `);
});

app.listen(PORT, () => {
    addLog(`Dashboard running on port ${PORT}`);
    startBot();
});
