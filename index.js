import express from 'express';
import fs from 'fs';
import pino from 'pino';
import QRCode from 'qrcode';
import makeWASocket, { useMultiFileAuthState, Browsers, makeCacheableSignalKeyStore, DisconnectReason } from '@whiskeysockets/baileys';

const app = express();
const PORT = process.env.PORT || 10000;
const AUTH_DIR = './auth';
let qrBase64 = '';
let pairCode = 'Generating...';
let status = 'Starting...';
let authB64 = '';

// Clean old auth on start
if (fs.existsSync(AUTH_DIR)) fs.rmSync(AUTH_DIR, { recursive: true, force: true });
fs.mkdirSync(AUTH_DIR, { recursive: true });

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const sock = makeWASocket({
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }))
    },
    logger: pino({ level: 'silent' }),
    browser: Browsers.macOS('Desktop'),
    printQRInTerminal: false
  });

  // Generate Pairing Code every 25 sec
  const genPair = async () => {
    try {
      if (!state.creds.registered) {
        const num = (process.env.PHONE_NUMBER || '').replace(/\D/g, '');
        if (num) {
          await new Promise(r => setTimeout(r, 2000));
          const code = await sock.requestPairingCode(num);
          pairCode = code;
          console.log('PAIR CODE:', code);
        } else {
          pairCode = 'Set PHONE_NUMBER env';
        }
      }
    } catch (e) {
      console.log('Pair gen err:', e.message);
    }
  };
  genPair();
  setInterval(genPair, 25000);

  sock.ev.on('creds.update', async () => {
    await saveCreds();
    try {
      const files = fs.readdirSync(AUTH_DIR);
      const data = {};
      for (const f of files) data[f] = fs.readFileSync(`${AUTH_DIR}/${f}`, 'utf-8');
      authB64 = Buffer.from(JSON.stringify(data)).toString('base64');
      fs.writeFileSync('auth.txt', authB64);
      console.log('AUTH SAVED');
    } catch {}
  });

  sock.ev.on('connection.update', async (u) => {
    const { connection, lastDisconnect, qr } = u;
    if (qr) {
      qrBase64 = await QRCode.toDataURL(qr);
      status = 'QR Ready - Scan Now!';
      console.log('QR READY');
    }
    if (connection === 'open') {
      status = 'CONNECTED ✅';
      qrBase64 = '';
      pairCode = 'CONNECTED ✅';
      console.log('CONNECTED SUCCESS');
    }
    if (connection === 'close') {
      const reason = lastDisconnect?.error?.output?.statusCode;
      if (reason === DisconnectReason.loggedOut || reason === 401) {
        status = 'Logged Out - Refresh for New QR';
        qrBase64 = '';
        if (fs.existsSync(AUTH_DIR)) fs.rmSync(AUTH_DIR, { recursive: true, force: true });
        fs.mkdirSync(AUTH_DIR, { recursive: true });
        setTimeout(startBot, 3000);
      } else {
        status = 'Reconnecting...';
        setTimeout(startBot, 4000);
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const m = messages[0];
    if (!m?.message) return;
    const txt = m.message.conversation || m.message.extendedTextMessage?.text || '';
    if (txt.toLowerCase() === '.menu') await sock.sendMessage(m.key.remoteJid, { text: '*Obito V36 FINAL 🔥*\n\n.menu\n.ping\n.alive' });
    if (txt.toLowerCase() === '.ping') await sock.sendMessage(m.key.remoteJid, { text: 'Pong! V36 Live 🏓' });
  });
}

app.get('/', (req, res) => {
  res.send(`
  <html>
  <body style="background:#020617;color:white;text-align:center;font-family:Arial;padding:20px">
  <div style="background:#1e293b;padding:25px;border-radius:20px;max-width:480px;margin:auto;border:2px solid #3b82f6">
  <h2>🤖 Obito V36 FINAL</h2>
  <p>Status: <b style="color:#38bdf8">${status}</b></p>
  ${qrBase64 ? `<img src="${qrBase64}" style="width:310px;background:white;padding:12px;border-radius:15px"><p style="color:#22c55e">Scan in WhatsApp > Linked Devices</p>` : `<p style="color:#fbbf24">Generating QR... Refresh after 10 sec</p>`}
  <p>Pair Code: <b style="font-size:28px;letter-spacing:3px;color:#facc15">${pairCode}</b></p>
  <p style="font-size:11px;color:#94a3b8">Code expires 30sec - Auto refresh 20sec</p>
  <a href="/qr" style="background:#2563eb;color:white;padding:12px 22px;border-radius:10px;text-decoration:none;margin:6px;display:inline-block">📱 FULL QR</a>
  <a href="/auth" style="background:#16a34a;color:white;padding:12px 22px;border-radius:10px;text-decoration:none;margin:6px;display:inline-block">📋 Get AUTH_DATA</a>
  </div>
  <script>setTimeout(()=>location.reload(),20000)</script>
  </body></html>`);
});

app.get('/qr', (req, res) => {
  if (!qrBase64) return res.send(`<body style="background:#020617;color:white;text-align:center;padding:40px"><h2>${status}</h2><h1 style="color:#facc15">${pairCode}</h1><p>Wait 10 sec...</p><a href="/" style="color:white">Back</a><script>setTimeout(()=>location.reload(),5000)</script></body>`);
  res.send(`<body style="background:black;text-align:center;padding:20px"><h2 style="color:white">Scan QR - 30sec only</h2><img src="${qrBase64}" style="width:95%;max-width:420px;background:white;padding:18px;border-radius:20px"><br><br><a href="/" style="background:#2563eb;color:white;padding:12px 20px;border-radius:8px;text-decoration:none">Back</a></body>`);
});

app.get('/auth', (req, res) => {
  try {
    if (fs.existsSync('auth.txt')) return res.type('text/plain').send(fs.readFileSync('auth.txt', 'utf-8'));
    return res.type('text/plain').send(authB64 || 'Not connected yet - Scan QR first');
  } catch { res.send('Not ready'); }
});

app.listen(PORT, () => { console.log('PORT ' + PORT); startBot(); });
