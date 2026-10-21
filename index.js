import express from 'express';
import fs from 'fs';
import path from 'path';
import pino from 'pino';
import makeWASocket, { useMultiFileAuthState, Browsers, makeCacheableSignalKeyStore } from '@whiskeysockets/baileys';

const app = express();
const PORT = process.env.PORT || 10000;
const AUTH_FOLDER = './auth';
let authDataBase64 = '';
let connectionStatus = 'Starting...';
let pairCode = '';
const delay = (ms) => new Promise(r => setTimeout(r, ms));

function loadAuthFromEnv(){
  if(process.env.AUTH_DATA){
    try{
      const decoded = Buffer.from(process.env.AUTH_DATA,'base64').toString('utf-8');
      const data = JSON.parse(decoded);
      if(!fs.existsSync(AUTH_FOLDER)) fs.mkdirSync(AUTH_FOLDER,{recursive:true});
      for(const f in data) fs.writeFileSync(path.join(AUTH_FOLDER,f), data[f],'utf-8');
      console.log('✅ AUTH_DATA Loaded');
      return true;
    }catch(e){console.log('Load fail',e.message)}
  }
  return false;
}

async function saveAuthData(){
  try{
    if(!fs.existsSync(AUTH_FOLDER)) return;
    const files = fs.readdirSync(AUTH_FOLDER);
    const data={};
    for(const f of files) data[f]=fs.readFileSync(path.join(AUTH_FOLDER,f),'utf-8');
    const b64 = Buffer.from(JSON.stringify(data)).toString('base64');
    authDataBase64=b64;
    fs.writeFileSync('auth_data.txt',b64,'utf-8');
    console.log('\n===== AUTH_DATA =====\n'+b64+'\n===== END =====\n');
    return b64;
  }catch(e){}
}

loadAuthFromEnv();

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
    await delay(3000);
    try{
      const num=(process.env.PHONE_NUMBER||'').replace(/[^0-9]/g,'');
      if(num){
        pairCode = await sock.requestPairingCode(num);
        console.log('Pair Code:',pairCode);
      }
    }catch(e){console.log('Pair error',e.message)}
  }

  sock.ev.on('creds.update', async()=>{await saveCreds(); await saveAuthData();});
  sock.ev.on('connection.update', async(u)=>{
    const {connection,lastDisconnect}=u;
    if(connection==='open'){connectionStatus='CONNECTED ✅'; console.log('✅ Connected!'); await saveAuthData();}
    else if(connection==='close'){
      connectionStatus='Reconnecting...';
      const code=lastDisconnect?.error?.output?.statusCode;
      if(code!==401) setTimeout(startBot,5000);
      else connectionStatus='Logged Out - Re-pair needed';
    }
  });
  sock.ev.on('messages.upsert', async({messages})=>{
    const msg=messages[0]; if(!msg?.message) return;
    const text=msg.message.conversation||msg.message.extendedTextMessage?.text||'';
    if(text.toLowerCase()==='.menu') await sock.sendMessage(msg.key.remoteJid,{text:'*Obito V33.9 Online* 🔥\nStatus: '+connectionStatus});
    if(text.toLowerCase()==='.ping') await sock.sendMessage(msg.key.remoteJid,{text:'Pong! 🏓'});
  });
}

app.get('/',(req,res)=>{res.send(`<body style="background:#111;color:#fff;text-align:center;font-family:sans-serif;padding:40px"><div style="background:#1e3a8a;padding:20px;border-radius:15px;max-width:500px;margin:auto"><h2>🤖 Obito V33.9</h2><p>Status: <b>${connectionStatus}</b></p><p>Code: <b style="font-size:24px;letter-spacing:3px">${pairCode||'Connected...'}</b></p><a href="/saveauth" style="color:#fff;background:#2563eb;padding:10px 20px;border-radius:8px;text-decoration:none">Get AUTH_DATA</a></div></body>`);});
app.get('/saveauth',(req,res)=>{
  try{
    if(fs.existsSync('auth_data.txt')) return res.type('text/plain').send(fs.readFileSync('auth_data.txt','utf-8'));
    if(authDataBase64) return res.type('text/plain').send(authDataBase64);
    if(fs.existsSync(AUTH_FOLDER)){
      const files=fs.readdirSync(AUTH_FOLDER);
      if(files.length>0){const d={}; for(const f of files) d[f]=fs.readFileSync(path.join(AUTH_FOLDER,f),'utf-8'); return res.type('text/plain').send(Buffer.from(JSON.stringify(d)).toString('base64'));}
    }
    res.send('Not ready yet - pair first');
  }catch(e){res.send('Error '+e.message);}
});
app.listen(PORT,()=>{console.log(`Server ${PORT}`); startBot();});
