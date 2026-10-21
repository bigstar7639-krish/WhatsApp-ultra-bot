import express from 'express';
import fs from 'fs';
import path from 'path';
import pino from 'pino';
import QRCode from 'qrcode';
import makeWASocket, { useMultiFileAuthState, Browsers, makeCacheableSignalKeyStore } from '@whiskeysockets/baileys';

const app = express();
const PORT = process.env.PORT || 10000;
const AUTH_FOLDER = './auth';
let authDataBase64 = '';
let connectionStatus = 'Starting...';
let pairCode = '';
let qrImage = '';
const delay = ms => new Promise(r => setTimeout(r, ms));

function loadAuth(){
  if(process.env.AUTH_DATA){
    try{
      const data = JSON.parse(Buffer.from(process.env.AUTH_DATA,'base64').toString('utf-8'));
      if(!fs.existsSync(AUTH_FOLDER)) fs.mkdirSync(AUTH_FOLDER,{recursive:true});
      for(const f in data) fs.writeFileSync(path.join(AUTH_FOLDER,f), data[f],'utf-8');
      console.log('✅ AUTH_DATA Loaded');
      return true;
    }catch(e){ console.log('Load fail') }
  }
  return false;
}
async function saveAuth(){
  try{
    if(!fs.existsSync(AUTH_FOLDER)) return;
    const files = fs.readdirSync(AUTH_FOLDER);
    const data={}; for(const f of files) data[f]=fs.readFileSync(path.join(AUTH_FOLDER,f),'utf-8');
    const b64 = Buffer.from(JSON.stringify(data)).toString('base64');
    authDataBase64=b64; fs.writeFileSync('auth_data.txt',b64,'utf-8');
    console.log('\n===== SAVE THIS AUTH_DATA =====\n'+b64.substring(0,100)+'...\n===== END =====\n');
    return b64;
  }catch(e){}
}
loadAuth();

async function startBot(){
  if(!fs.existsSync(AUTH_FOLDER)) fs.mkdirSync(AUTH_FOLDER,{recursive:true});
  const {state,saveCreds} = await useMultiFileAuthState(AUTH_FOLDER);
  const sock = makeWASocket({
    auth:{creds:state.creds, keys:makeCacheableSignalKeyStore(state.keys, pino({level:'silent'}))},
    logger:pino({level:'silent'}),
    browser:Browsers.ubuntu('Chrome'),
    printQRInTerminal:false
  });

  if(!state.creds.registered){
    await delay(2000);
    try{
      const num=(process.env.PHONE_NUMBER||'').replace(/[^0-9]/g,'');
      if(num){ pairCode = await sock.requestPairingCode(num); console.log('Pair Code:',pairCode); }
    }catch(e){ console.log('Pair error',e.message) }
  }

  sock.ev.on('creds.update', async()=>{ await saveCreds(); await saveAuth(); });
  sock.ev.on('connection.update', async(u)=>{
    const {connection,lastDisconnect,qr} = u;
    if(qr){
      qrImage = await QRCode.toDataURL(qr);
      console.log('QR Generated - Check website /qr');
    }
    if(connection==='open'){ connectionStatus='CONNECTED ✅'; console.log('✅ Connected!'); qrImage=''; pairCode='Connected'; await saveAuth(); }
    else if(connection==='close'){
      const code = lastDisconnect?.error?.output?.statusCode;
      if(code===401){ connectionStatus='Logged Out - Re-pair needed'; qrImage=''; }
      else { connectionStatus='Reconnecting...'; setTimeout(startBot,5000); }
    }
  });
  sock.ev.on('messages.upsert', async({messages})=>{
    const msg=messages[0]; if(!msg?.message) return;
    const text=msg.message.conversation||msg.message.extendedTextMessage?.text||'';
    if(text.toLowerCase()==='.menu') await sock.sendMessage(msg.key.remoteJid,{text:'*Obito V34 FINAL 🔥*\n✅ Connected!\n\nCommands:\n.menu\n.ping\n.alive'});
    if(text.toLowerCase()==='.ping') await sock.sendMessage(msg.key.remoteJid,{text:'Pong! V34 Live 🏓'});
    if(text.toLowerCase()==='.alive') await sock.sendMessage(msg.key.remoteJid,{text:'Obito V34 FINAL is Alive! 🚀 Permanent Mode ON'});
  });
}

app.get('/',(req,res)=>{
  res.send(`<body style="background:#0f172a;color:#fff;text-align:center;font-family:sans-serif;padding:20px"><div style="background:#1e3a8a;padding:25px;border-radius:15px;max-width:500px;margin:auto"><h2>🤖 Obito V34 FINAL</h2><p>Status: <b>${connectionStatus}</b></p>${qrImage?`<img src="${qrImage}" style="width:280px;background:#fff;padding:10px;border-radius:10px"><p>Scan this QR in WhatsApp</p>`:''}<p>Pair Code: <b style="font-size:28px;letter-spacing:4px;color:#60f">${pairCode||'Wait...'}</b></p><p style="font-size:12px;color:#aaa">Code expires in 30sec - Refresh for new code</p><a href="/saveauth" style="display:inline-block;margin:10px;padding:10px 20px;background:#2563eb;color:#fff;border-radius:8px;text-decoration:none">📋 Get AUTH_DATA</a><a href="/qr" style="display:inline-block;margin:10px;padding:10px 20px;background:#059669;color:#fff;border-radius:8px;text-decoration:none">📱 Show QR</a></div><script>setTimeout(()=>location.reload(),30000)</script></body>`);
});
app.get('/qr',(req,res)=>{
  if(qrImage) res.send(`<body style="background:#000;text-align:center;padding:20px"><h2 style="color:#fff">Scan QR - Expires 30sec</h2><img src="${qrImage}" style="width:350px;background:#fff;padding:15px;border-radius:15px"><br><br><a href="/" style="color:#fff;background:#2563eb;padding:10px 20px;border-radius:8px;text-decoration:none">Back</a><script>setTimeout(()=>location.reload(),20000)</script></body>`);
  else res.send(`<body style="background:#111;color:#fff;text-align:center;padding:40px"><h3>${connectionStatus}</h3><p>${pairCode?`Pair Code: ${pairCode}`:'Waiting...'}</p><a href="/" style="color:#fff">Back</a><script>setTimeout(()=>location.reload(),5000)</script></body>`);
});
app.get('/saveauth',(req,res)=>{
  try{
    if(fs.existsSync('auth_data.txt')) return res.type('text/plain').send(fs.readFileSync('auth_data.txt','utf-8'));
    if(authDataBase64) return res.type('text/plain').send(authDataBase64);
    if(fs.existsSync(AUTH_FOLDER)){
      const files=fs.readdirSync(AUTH_FOLDER);
      if(files.length>0){const d={}; for(const f of files) d[f]=fs.readFileSync(path.join(AUTH_FOLDER,f),'utf-8'); return res.type('text/plain').send(Buffer.from(JSON.stringify(d)).toString('base64'));}
    }
    res.send('Not ready - Pair first!');
  }catch(e){res.send('Error '+e.message);}
});
app.listen(PORT,()=>{ console.log('Server '+PORT); startBot(); });
