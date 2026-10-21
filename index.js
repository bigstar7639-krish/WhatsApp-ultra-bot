// V33.9 - PERMANENT FIX - AUTH_DATA 100% Working
const express = require('express');
const fs = require('fs');
const path = require('path');
const pino = require('pino');
const { default: makeWASocket, useMultiFileAuthState, Browsers, delay } = require('@whiskeysockets/baileys');

const app = express();
const PORT = process.env.PORT || 10000;
const AUTH_FOLDER = './auth';
let authDataBase64 = '';
let connectionStatus = 'Starting...';
let pairCode = '';

// --- 1. AUTH_DATA LOAD (MOST IMPORTANT) ---
function loadAuthFromEnv() {
    try {
        if (process.env.AUTH_DATA) {
            console.log('✅ AUTH_DATA Found in ENV! Loading...');
            const decoded = Buffer.from(process.env.AUTH_DATA, 'base64').toString('utf-8');
            const data = JSON.parse(decoded);
            
            if (!fs.existsSync(AUTH_FOLDER)) fs.mkdirSync(AUTH_FOLDER, { recursive: true });
            
            for (const file in data) {
                const filePath = path.join(AUTH_FOLDER, file);
                fs.writeFileSync(filePath, data[file], 'utf-8');
                console.log(`Loaded: ${file}`);
            }
            console.log('✅ AUTH_DATA Loaded - Permanent Mode ON');
            return true;
        } else {
            console.log('⚠️ No AUTH_DATA in ENV - New Login Mode');
            return false;
        }
    } catch (e) {
        console.error('❌ AUTH_DATA Load Failed:', e.message);
        return false;
    }
}

// --- 2. SAVE AUTH TO FILE & ENV STRING ---
async function saveAuthData() {
    try {
        if (!fs.existsSync(AUTH_FOLDER)) return;
        const files = fs.readdirSync(AUTH_FOLDER);
        const data = {};
        for (const file of files) {
            data[file] = fs.readFileSync(path.join(AUTH_FOLDER, file), 'utf-8');
        }
        const jsonStr = JSON.stringify(data);
        const base64 = Buffer.from(jsonStr).toString('base64');
        authDataBase64 = base64;
        fs.writeFileSync('auth_data.txt', base64, 'utf-8');
        console.log('\n\n========== COPY THIS AUTH_DATA TO RENDER ENV ==========');
        console.log(base64);
        console.log('========== END AUTH_DATA ==========\n\n');
        return base64;
    } catch (e) {
        console.error('Save Auth Error:', e.message);
    }
}

loadAuthFromEnv();

async function startBot() {
    if (!fs.existsSync(AUTH_FOLDER)) fs.mkdirSync(AUTH_FOLDER, { recursive: true });
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);
    
    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: Browsers.ubuntu('Chrome'),
        printQRInTerminal: false,
    });

    if (!process.env.AUTH_DATA && !state.creds.registered) {
        try {
            await delay(3000);
            const num = process.env.PHONE_NUMBER || '';
            if (num) {
                pairCode = await sock.requestPairingCode(num.replace(/[^0-9]/g, ''));
                console.log(`Pair Code: ${pairCode}`);
            }
        } catch (e) {
            console.log('Pairing code error:', e.message);
        }
    }

    sock.ev.on('creds.update', async () => {
        await saveCreds();
        await saveAuthData();
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'open') {
            connectionStatus = 'CONNECTED ✅';
            console.log('✅ Bot Connected Successfully!');
            await saveAuthData();
        } else if (connection === 'close') {
            connectionStatus = 'Disconnected - Reconnecting...';
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== 401;
            if (shouldReconnect) {
                setTimeout(startBot, 5000);
            }
        }
    });

    // Simple Message Handler
    sock.ev.on('messages.upsert', async ({ messages }) => {
        try {
            const msg = messages[0];
            if (!msg.message) return;
            const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
            if (text.toLowerCase() === '.menu' || text.toLowerCase() === 'menu') {
                await sock.sendMessage(msg.key.remoteJid, { text: `*Obito V33.9 Bot Online!* 🔥\n\n✅ Permanent Mode\n✅ AUTH_DATA Loaded\n\nCommands: .menu .ping .alive` });
            }
            if (text.toLowerCase() === '.ping') {
                await sock.sendMessage(msg.key.remoteJid, { text: 'Pong! 🏓 V33.9 Active' });
            }
        } catch {}
    });
}

// --- EXPRESS ROUTES ---
app.get('/', (req, res) => {
    res.send(`
    <html><head><title>Obito V33.9</title>
    <style>body{font-family:sans-serif;text-align:center;padding:20px;background:#0f0f0f;color:white}
    .box{background:#1e3a8a;padding:20px;border-radius:15px;margin:20px auto;max-width:600px}
    .code{background:#000;padding:15px;border-radius:10px;font-size:22px;letter-spacing:3px;margin:15px}
    a{color:#60a5fa;text-decoration:none;display:inline-block;margin:10px;padding:10px 20px;background:#1e40af;border-radius:8px}
    </style></head>
    <body>
    <div class="box">
    <h2>🤖 Obito V33.9</h2>
    <p>Status: <b>${connectionStatus}</b></p>
    <p>Pair Code: <b>${pairCode || 'Connected / Generating...'}</b></p>
    <p>Free Permanent Fix - No Disk Money!</p>
    <a href="/saveauth">📋 Get AUTH_DATA</a>
    <a href="/qr">📱 QR Login</a>
    </div>
    ${authDataBase64 ? `<div class="box"><h3>AUTH_DATA Ready - Copy Below</h3><textarea style="width:100%;height:150px;background:#000;color:#0f0;padding:10px">${authDataBase64}</textarea></div>` : ''}
    </body></html>
    `);
});

app.get('/saveauth', (req, res) => {
    try {
        if (fs.existsSync('auth_data.txt')) {
            const data = fs.readFileSync('auth_data.txt', 'utf-8');
            res.setHeader('Content-Type', 'text/plain');
            return res.send(data);
        }
        if (authDataBase64) {
            res.setHeader('Content-Type', 'text/plain');
            return res.send(authDataBase64);
        }
        // Try generate from folder
        if (fs.existsSync(AUTH_FOLDER)) {
            const files = fs.readdirSync(AUTH_FOLDER);
            if (files.length > 0) {
                const data = {};
                for (const file of files) data[file] = fs.readFileSync(path.join(AUTH_FOLDER, file), 'utf-8');
                const base64 = Buffer.from(JSON.stringify(data)).toString('base64');
                res.setHeader('Content-Type', 'text/plain');
                return res.send(base64);
            }
        }
        res.send('AUTH_DATA not ready yet! Bot not connected yet. Please connect first via QR/Pair code.');
    } catch (e) {
        res.send('Error: ' + e.message);
    }
});

app.get('/qr', (req, res) => res.redirect('/'));

app.listen(PORT, () => {
    console.log(`Server running on ${PORT}`);
    startBot();
});
