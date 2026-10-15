const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Groq } = require('groq-sdk');
const express = require('express');
const qrcode = require('qrcode');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000;
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

let logs = [];
let qrCodeData = null;
let sock = null;
let isConnected = false;

function addLog(msg) {
    const time = new Date().toLocaleTimeString('en-IN', { hour12: true, timeZone: 'Asia/Kolkata' });
    // SECURITY: Number / Pairing code ah log la kaamikatha
    let safeMsg = msg;
    safeMsg = safeMsg.replace(/91\d{10}/g, '91**********');
    safeMsg = safeMsg.replace(/NMZPWZ86/g, '****');
    safeMsg = safeMsg.replace(/YOUR PAIRING CODE FOR.*/, 'YOUR PAIRING CODE Generated ✅');
    
    logs.unshift(`[${time}] ${safeMsg}`);
    if (logs.length > 50) logs.pop();
    console.log(safeMsg);
}

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    
    sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            qrCodeData = await qrcode.toDataURL(qr);
            addLog('✅ NEW QR CODE Generated - Scan it!');
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            isConnected = false;
            const reason = lastDisconnect?.error?.message || 'Unknown';
            addLog(`Closed: ${reason} - Reconnect: ${shouldReconnect}`);
            if (shouldReconnect) {
                setTimeout(startBot, 3000);
            }
        } else if (connection === 'open') {
            isConnected = true;
            qrCodeData = null;
            addLog('🎉 WHATSAPP CONNECTED SUCCESSFULLY!');
            addLog('Connection: open');
        } else if (connection) {
            addLog(`Connection: ${connection}`);
        }
    });

    // PAIRING CODE - Only in Render Logs, not in Dashboard Logs
    if (!state.creds.registered) {
        try {
            const number = process.env.PHONE_NUMBER || '918870799204';
            setTimeout(async () => {
                if (!isConnected && sock) {
                    try {
                        const code = await sock.requestPairingCode(number);
                        console.log(`\n🔑 PAIRING CODE FOR SECURED NUMBER: ${code}\n`); // Only in Render console
                        addLog('🔑 YOUR PAIRING CODE Generated - Check Render Logs for code');
                    } catch (e) {
                        addLog(`Pairing Error: ${e.message}`);
                    }
                }
            }, 3000);
        } catch (e) {}
    }

    // AI REPLY - LOOP SAFE
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
        if (!text || text.length < 2) return;

        const jid = msg.key.remoteJid;
        // IMPORTANT: Business / Status ku reply panna koodathu - Loop varum
        if (jid.includes('status') || jid.includes('broadcast') || jid.includes('JioCare')) return;
        if (text.toLowerCase().includes('bot working')) return; // Loop stop

        addLog(`Msg from ${jid.split('@')[0].slice(0,4)}****: ${text.substring(0,20)}`);

        try {
            const chatCompletion = await groq.chat.completions.create({
                messages: [
                    { role: "system", content: "You are a friendly Tamil friend. Reply in short Tanglish (Tamil + English mixed). Max 2 lines. Be fun." },
                    { role: "user", content: text }
                ],
                model: "openai/gpt-oss-20b", // NEW WORKING MODEL
                temperature: 0.8,
                max_tokens: 150
            });
            const reply = chatCompletion.choices[0]?.message?.content || "Sollu da! Enna vishayam?";
            await sock.sendMessage(jid, { text: reply });
            addLog(`Replied: ${reply.substring(0,30)}`);
        } catch (err) {
            addLog(`Groq Error: ${err.status || ''} ${err.message.substring(0,50)}`);
            // Error na reply panna vendaam - Loop varakoodathu
        }
    });
}

startBot();

// DASHBOARD
app.get('/', (req, res) => {
    const qrImg = qrCodeData ? `<img src="${qrCodeData}" style="width:250px;border-radius:15px;" />` : '<p style="color:white;">No QR - Already Connected or Wait...</p>';
    const statusColor = isConnected ? '#00ff00' : '#ff4444';
    const statusText = isConnected ? 'CONNECTED ✅' : 'DISCONNECTED ❌';
    const logsHtml = logs.map(l => `<div style="color:#00ff00;font-family:monospace;font-size:13px;margin:4px 0;">${l}</div>`).join('');

    res.send(`
    <html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ultra Bot</title></head>
    <body style="background:#111;color:white;text-align:center;font-family:sans-serif;padding:20px;">
        <h1>🤖 ULTRA CLEAR DASHBOARD</h1>
        <div style="border:2px solid ${statusColor};box-shadow:0 0 20px ${statusColor};border-radius:20px;padding:20px;margin:20px auto;max-width:400px;">
            <h2>Status: <span style="color:${statusColor}">${statusText}</span></h2>
            ${qrImg}
        </div>
        <div style="border:2px solid #00ff00;box-shadow:0 0 20px #00ff00;border-radius:20px;padding:15px;margin:20px auto;max-width:500px;text-align:left;">
            <h3 style="text-align:center;">Logs</h3>
            <div style="background:#000;padding:10px;border-radius:10px;max-height:300px;overflow:auto;">${logsHtml || 'Waiting for logs...'}</div>
            <div style="text-align:center;margin-top:15px;"><button onclick="location.reload()" style="padding:8px 20px;border-radius:8px;">Refresh</button></div>
        </div>
        <p style="margin-top:20px;font-size:14px;opacity:0.8;">Number: Secured ✅ | QR = Safe | Bot = Active ✅</p>
        <p style="font-size:12px;opacity:0.5;">Expiration*: 18 October 2026</p>
    </body></html>
    `);
});

app.listen(PORT, () => {
    addLog(`Dashboard running on port ${PORT}`);
});
