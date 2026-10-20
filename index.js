import makeWASocket, { useMultiFileAuthState, makeCacheableSignalKeyStore, DisconnectReason, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import { MongoClient } from 'mongodb';
import express from 'express';
import pino from 'pino';
import qrcode from 'qrcode';
import fs from 'fs';

const app = express();
const PORT = process.env.PORT || 10000;
let latestQR = null;
let latestPairCode = null;
let sockInstance = null;

async function connectToWA() {
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URL;
    const phoneNumber = (process.env.PHONE_NUMBER || '').replace(/[^0-9]/g, '');
    
    console.log(`Starting for: ${phoneNumber}`);
    
    const { version } = await fetchLatestBaileysVersion();
    console.log(`WA VERSION: ${version.join('.')}`);

    // MongoDB Auth
    const client = new MongoClient(mongoUri);
    await client.connect();
    console.log('MongoDB Connected');
    const collection = client.db('whatsapp_bot').collection('auth');
    
    // Simple file auth backup (Render Disk illa na kooda work aagum)
    const { state, saveCreds } = await useMultiFileAuthState('./auth_info');
    
    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: true,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }))
        },
        browser: ['Krishna Ultra', 'Chrome', '1.0.0'],
        markOnlineOnConnect: false,
    });
    
    sockInstance = sock;

    // Pairing Code - PROPER TIMING FIX
    if (!sock.authState.creds.registered && phoneNumber) {
        setTimeout(async () => {
            try {
                if (!sock.authState.creds.registered) {
                    console.log(`Requesting Pairing Code for: ${phoneNumber}`);
                    const code = await sock.requestPairingCode(phoneNumber);
                    latestPairCode = code;
                    console.log(`>>> FINAL CODE: ${code.slice(0,4)}-${code.slice(4)} RAW:${code} <<<`);
                }
            } catch (e) {
                console.log('Pairing Code Error:', e.message);
                console.log('Use QR Code Instead - More Stable!');
            }
        }, 5000); // 5 sec delay - THIS IS THE FIX!
    }

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
            latestQR = await qrcode.toDataURL(qr);
            console.log('QR Generated - Scan from website!');
        }
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Connection closed, reconnecting:', shouldReconnect);
            if (shouldReconnect) connectToWA();
        } else if (connection === 'open') {
            console.log('✅ BOT CONNECTED SUCCESSFULLY!');
            latestQR = null;
            latestPairCode = null;
        }
    });

    sock.ev.on('creds.update', saveCreds);
    
    // Simple ping reply test
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message) return;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
        if (text.toLowerCase() === '.ping') {
            await sock.sendMessage(msg.key.remoteJid, { text: '🏓 Pong! Bot Live da Krishna! ✅' });
        }
    });
}

app.get('/', async (req, res) => {
    let qrImg = latestQR ? `<img src="${latestQR}" style="width:300px"><br><br>` : '<p>QR Loading... Refresh after 10 sec</p>';
    let codeHtml = latestPairCode ? `<h1 style="background:#000;color:#0f0;padding:20px;font-size:40px;">${latestPairCode.slice(0,4)}-${latestPairCode.slice(4)}</h1><p>RAW: ${latestPairCode} (No dash needed)</p><p>Use this within 60 sec!</p>` : '<p>Pairing code generating...</p>';
    
    res.send(`
        <center style="font-family:sans-serif;padding:20px;">
        <h1>🤖 Krishna AI Bot - v6 FIXED</h1>
        <h2 style="color:orange;">WAITING FOR LINK</h2>
        ${codeHtml}
        <hr>
        ${qrImg}
        <p><b>Best Method: Scan QR above 👆</b></p>
        <p>If QR not working, use Pairing Code</p>
        <p><a href="/clear">Clear Session & Get New Code</a></p>
        <script>setTimeout(()=>location.reload(), 15000)</script>
        </center>
    `);
});

app.get('/clear', async (req, res) => {
    try { fs.rmSync('./auth_info', { recursive: true, force: true }); } catch {}
    latestQR = null; latestPairCode = null;
    res.send('DELETED - Restarting... Go back in 10 sec');
    setTimeout(() => process.exit(1), 2000);
});

app.listen(PORT, () => {
    console.log(`Web LIVE on PORT ${PORT}`);
    console.log(`Your service is live 🎉`);
    connectToWA();
});
