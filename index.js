// V33.9 FINAL FIX - For baileys 7.0.0-rc14
import express from 'express';
import fs from 'fs';
import path from 'path';
import pino from 'pino';
import makeWASocket, { useMultiFileAuthState, Browsers, makeCacheableSignalKeyStore } from 'baileys';

const app = express();
const PORT = process.env.PORT || 10000;
const AUTH_FOLDER = './auth';
let authDataBase64 = '';
let connectionStatus = 'Starting...';
let pairCode = '';
const delay = (ms) => new Promise(res => setTimeout(res, ms));

function loadAuthFromEnv() {
    try {
        if (process.env.AUTH_DATA) {
            console.log('✅ AUTH_DATA Found! Loading...');
            const decoded = Buffer.from(process.env.AUTH_DATA, 'base64').toString('utf-8');
            const data = JSON.parse(decoded);
            if (!fs.existsSync(AUTH_FOLDER)) fs.mkdirSync(AUTH_FOLDER, { recursive: true });
            for (const file in data) {
                fs.writeFileSync(path.join(AUTH_FOLDER, file), data[file], 'utf-8');
            }
            console.log('✅ AUTH_DATA Loaded - Permanent Mode ON');
            return true;
        }
        console.log('⚠️ No AUTH_DATA - New Login');
        return false;
    } catch (e) {
        console.error('Load Failed:', e.message);
        return false;
    }
}

async function saveAuthData() {
    try {
        if (!fs.existsSync(AUTH_FOLDER)) return;
        const files = fs.readdirSync(AUTH_FOLDER);
        const data = {};
        for (const file of files) data[file] = fs.readFileSync(path.join(AUTH_FOLDER, file), 'utf-8');
        const base64 = Buffer.from(JSON.stringify(data)).toString('base64');
        authDataBase64 = base64;
        fs.writeFileSync('auth_data.txt', base64, 'utf-8');
        console.log('\n========== AUTH_DATA ==========\n' + base64 + '\n========== END ==========\n');
        return base64;
    } catch (e) {}
}

loadAuthFromEnv();

async function startBot() {
    if (!fs.existsSync(AUTH_FOLDER)) fs.mkdirSync(AUTH_FOLDER, { recursive: true });
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);
    const sock = makeWASocket({
        auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })) },
        logger: pino({ level: 'silent' }),
        browser: Browsers.ubuntu('Chrome'),
        printQRInTerminal: false,
    });

    if (!process.env.AUTH_DATA && !state.creds.registered) {
        await delay(3000);
        try {
            const num = (process.env.PHONE_NUMBER || '').replace(/[^0-9]/g, '');
            if (num) {
                pairCode = await sock.requestPairingCode(num);
                console.log(`Pair Code: ${pairCode}`);
            }
        } catch (e) { console.log('Pair error', e.message); }
    }

    sock.ev.on('creds.update', async () => {
        await saveCreds();
        await saveAuthData();
    });

    sock.ev.on('connection.update', async (u) => {
        const { connection, lastDisconnect } = u;
        if (connection === 'open') {
            connectionStatus = 'CONNECTED ✅';
            console.log('✅ Connected!');
            await saveAuthData();
        } else if (connection === 'close') {
            connectionStatus = 'Reconnecting...';
            if (lastDisconnect?.error?.output?.statusCode !== 401) setTimeout(startBot, 5000);
        }
    });

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg?.message) return;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
        if (text.toLowerCase() === '.menu') {
            await sock.sendMessage(msg.key.remoteJid, { text: `*Obito V33.9 Online!* 🔥\nStatus: ${connectionStatus}\n\nCommands: .menu .ping` });
        }
        if (text.toLowerCase() === '.ping') {
            await sock.sendMessage(msg.key.remoteJid, { text: 'Pong! V33.9 Active 🏓' });
        }
    });
}

app.get('/', (req, res) => {
    res.send(`<html><head><title>Obito V33.9</title><style>body{font-family:sans-serif;text-align:center;padding:20px;background:#0f0f0f;color:white}.box{background:#1e3a8a;padding:20px;border-radius:15px;margin:20px auto;max-width:600px}a{color:#60a5fa;text-decoration:none;display:inline-block;margin:10px;padding:10px 20px;background:#1e40af;border-radius:8px}</style></head><body><div class="box"><h2>🤖 Obito V33.9</h2><p>Status: <b>${connectionStatus}</b></p><p>Code: <b>${pairCode || 'Connected...'}</b></p><a href="/saveauth">📋 Get AUTH_DATA</a></div></body></html>`);
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
        res.send('Not ready - Connect bot first!');
    } catch (e) { res.send('Error: ' + e.message); }
});

app.listen(PORT, () => { console.log(`Server on ${PORT}`); startBot(); });
