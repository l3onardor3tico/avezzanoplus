// server.js - versione corretta e robusta
const fs = require('fs');
const path = require('path');
const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const WebSocket = require('ws');
const wss = new WebSocket.Server({ server });

app.use(express.static('public'));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server in ascolto sulla porta ${PORT}`));

const CHAT_FILE = path.join(__dirname, 'chats.json');
const clients = new Map(); // ws -> { name, profilePic }

// carico/salvo chat
function loadChats(){
  try { return JSON.parse(fs.readFileSync(CHAT_FILE,'utf8')); }
  catch(e){ return { public: [], private: {} }; }
}
function saveChats(chats){
  fs.writeFileSync(CHAT_FILE, JSON.stringify(chats, null, 2));
}
let chats = loadChats();

// pulisco pubblici più vecchi di 7 giorni
function cleanOldPublicMessages(){
  const now = Date.now();
  const week = 7 * 24 * 60 * 60 * 1000;
  chats.public = chats.public.filter(m => (now - (m.timestamp||0)) < week);
  saveChats(chats);
}
cleanOldPublicMessages();

function privateKey(a,b){ return [a,b].sort().join('_'); }
function send(ws,msg){ if (ws.readyState===WebSocket.OPEN) ws.send(JSON.stringify(msg)); }
function broadcast(msg){
  const json = JSON.stringify(msg);
  for (const c of wss.clients) if (c.readyState===WebSocket.OPEN) c.send(json);
}
function broadcastOnline(){
  // dedup per name (in caso ci fossero doppioni)
  const map = new Map();
  for (const v of clients.values()) if (v.name) map.set(v.name, v.profilePic||'');
  const users = Array.from(map.entries()).map(([name,profilePic]) => ({ name, profilePic }));
  broadcast({ type: 'online', count: users.length, users });
}

wss.on('connection', (ws) => {
  clients.set(ws, { name: null, profilePic: null });
  console.log('Nuovo client connesso. Tot:', clients.size);

  ws.on('message', (raw) => {
    let data;
    try { data = JSON.parse(raw); } catch(e){ return; }

    // REGISTER / JOIN
    if (data.type === 'join' || data.type === 'register'){
      const name = (data.name || 'Utente').toString();
      const profilePic = data.profilePic || '';
      clients.set(ws, { name, profilePic });
      console.log('Registrato:', name);

      // invia cronologia pubblica e lista utenti
      cleanOldPublicMessages();
      send(ws, { type: 'chatHistory', chat: 'public', messages: chats.public });
      broadcastOnline();
      return;
    }

    // UPDATE PROFILE PIC
    if (data.type === 'updateProfilePic'){
      const info = clients.get(ws);
      if (!info || !info.name) return;
      info.profilePic = data.profilePic || '';
      // notifica tutti che profilo aggiornato
      broadcast({ type: 'profileUpdated', name: info.name, profilePic: info.profilePic });
      broadcastOnline();
      return;
    }

    // CHAT PUBBLICA
    if (data.type === 'chat'){
      const info = clients.get(ws);
      if (!info || !info.name) return;
      const message = {
        id: data.id || (`m_${Date.now()}_${Math.random().toString(36).slice(2,8)}`),
        user: info.name,
        profilePic: info.profilePic || '',
        message: data.message || '',
        timestamp: Date.now()
      };
      chats.public.push(message);
      cleanOldPublicMessages();
      saveChats(chats);
      broadcast({ type: 'chat', ...message });
      return;
    }

    // CHAT PRIVATA
    if (data.type === 'private'){
      const sender = clients.get(ws);
      if (!sender || !sender.name) return;
      const to = data.to;
      if (!to) return;
      const key = privateKey(sender.name, to);
      if (!chats.private[key]) chats.private[key] = [];

      const message = {
        id: data.id || (`p_${Date.now()}_${Math.random().toString(36).slice(2,8)}`),
        from: sender.name,
        to,
        profilePic: sender.profilePic || '',
        message: data.message || '',
        timestamp: Date.now()
      };
      chats.private[key].push(message);
      saveChats(chats);

      // invia al destinatario se online
      for (const [client, info] of clients.entries()){
        if (info.name === to && client.readyState === WebSocket.OPEN){
          send(client, { type: 'private', ...message });
        }
      }
      // invia echo al mittente (utile per conferma)
      send(ws, { type: 'private', ...message });
      return;
    }

    // RICHIESTA CRONOLOGIA PRIVATA
    if (data.type === 'loadPrivateChat'){
      const user = clients.get(ws);
      if (!user || !user.name) return;
      const other = data.with;
      if (!other) return;
      const key = privateKey(user.name, other);
      const history = chats.private[key] || [];
      send(ws, { type: 'chatHistory', chat: other, messages: history });
      return;
    }
  });

  ws.on('close', () => {
    const info = clients.get(ws);
    clients.delete(ws);
    broadcastOnline();
    console.log('Client disconnesso:', info?.name || 'sconosciuto', 'tot:', clients.size);
  });
});
