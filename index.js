// V33.9 FIX - ES MODULE VERSION
import express from 'express';
import fs from 'fs';
import path from 'path';
import pino from 'pino';
import pkg from '@whiskeysockets/baileys';
const { default: makeWASocket, useMultiFileAuthState, Browsers, delay } = pkg;

const app = express();
const PORT = process.env.PORT || 10000;
const AUTH_FOLDER = './auth';
let authDataBase64 = '';
let connectionStatus = 'Starting...';
let pairCode = '';

// 1. LOAD AUTH_DATA
function loadAuthFromEnv() {
    try {
        if (process.env.AUTH_DATA) {
            console.log('✅ AUTH_DATA Found in ENV! Loading...');
            const decoded = Buffer.from(process.env.AUTH_DATA, 'base64').toString('utf-8');
            const data = JSON.parse(decoded);
            if (!fs.existsSync(AUTH_FOLDER)) fs.mkdirSync(AUTH_FOLDER, { recursive: true });
            for (const file in data) {
                fs.writeFileSync(path.join(AUTH_FOLDER, file), data[file], 'utf-8');
                console.log(`Loaded: ${file}`);
            }
            console.log('✅ AUTH_DATA Loaded - Permanent Mode ON');
            return true;
        }
        console.log('⚠️ No AUTH_DATA - New Login Mode');
        return false;
    } catch (e) {
        console.error('❌ AUTH_DATA Load Failed:', e.message);
        return false;
    }
}

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
        console.log('\n========== AUTH_DATA ==========\n' + base64 + '\n========== END ==========\n');
        return base64;
    } catch (e) { console.error(e.message); }
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
            const num = (process.env.PHONE_NUMBER || '').replace(/[^0-9]/g, '');
            if (num) {
                pairCode = await sock.requestPairingCode(num);
                console.log(`Pair Code: ${pairCode}`);
            }
        } catch (e) { console.log('Pairing error:', e.message); }
    }

    sock.ev.on('creds.update', async () => {
        await saveCreds();
        await saveAuthData();
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'open') {
            connectionStatus = 'CONNECTED ✅';
            console.log('✅ Bot Connected!');
            await saveAuthData();
        } else if (connection === 'close') {
            connectionStatus = 'Disconnected - Reconnecting...';
            if (lastDisconnect?.error?.output?.statusCode !== 401) {
                setTimeout(startBot, 5000);
            }
        }
    });

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg?.message) return;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
        if (text.toLowerCase() === '.menu' || text.toLowerCase() === 'menu') {
            await sock.sendMessage(msg.key.remoteJid, { text: `*Obito V33.9 Online!* 🔥\nStatus: ${connectionStatus}\n\n.menu .ping` });
        }
        if (text.toLowerCase() === '.ping') {
            await sock.sendMessage(msg.key.remoteJid, { text: 'Pong! V33.9 Active 🏓' });
        }
    });
}

app.get('/', (req, res) => {
    res.send(`<html><head><title>Obito V33.9</title><style>body{font-family:sans-serif;text-align:center;padding:20px;background:#0f0f0f;color:white}.box{background:#1e3a8a;padding:20px;border-radius:15px;margin:20px auto;max-width:600px}.code{background:#000;padding:15px;border-radius:10px;font-size:22px;letter-spacing:3px;margin:15px}a{color:#60a5fa;text-decoration:none;display:inline-block;margin:10px;padding:10px 20px;background:#1e40af;border-radius:8px}textarea{width:100%;height:150px;background:#000;color:#0f0;padding:10px}</style></head><body><div class="box"><h2>🤖 Obito V33.9</h2><p>Status: <b>${connectionStatus}</b></p><p>Pair Code: <b>${pairCode || 'Connected...'}</b></p><a href="/saveauth">📋 Get AUTH_DATA</a></div>${authDataBase64 ? `<div class="box"><h3>AUTH_DATA Ready</h3><textarea>${authDataBase64}</textarea></div>` : ''}</body></html>`);
});

app.get('/saveauth', (req, res) => {
    try {
        if (fs.existsSync('auth_data.txt')) return res.type('text/plain').send(fs.readFileSync('auth_data.txt', 'utf-8'));
        if (authDataBase64) return res.type('text/plain').send(authDataBase64);
        if (fs.existsSync(AUTH_FOLDER)) {
            const files = fs.readdirSync(AUTH_FOLDER);
            if (files.length > 0) {
                const data = {};
                for (const f of files) data[f] = fs.readFileSync(path.join(AUTH_FOLDER, f), 'utf-8');
                return res.type('text/plain').send(Buffer.from(JSON.stringify(data)).toString('base64'));
            }
        }
        res.send('Not ready yet - Connect bot first!');
    } catch (e) { res.send('Error: ' + e.message); }
});

app.listen(PORT, () => { console.log(`Server on ${PORT}`); startBot(); });
