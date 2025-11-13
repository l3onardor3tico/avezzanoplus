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
server.listen(PORT, () => {
  console.log(`WebSocket server in ascolto sulla porta ${PORT}`);
});

const clients = new Map(); // ws => { name, profilePic }
const CHAT_FILE = path.join(__dirname, 'chats.json');

// ===== Funzioni di supporto =====
function loadChats() {
  try {
    const data = fs.readFileSync(CHAT_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    return { public: [], private: {} };
  }
}

function saveChats() {
  fs.writeFileSync(CHAT_FILE, JSON.stringify(chats, null, 2));
}

function cleanOldPublicMessages() {
  const now = Date.now();
  const week = 7 * 24 * 60 * 60 * 1000;
  chats.public = chats.public.filter(m => now - m.timestamp < week);
  saveChats();
}

function privateKey(userA, userB) {
  return [userA, userB].sort().join('_');
}

function send(ws, msg) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function broadcast(msg) {
  const json = JSON.stringify(msg);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(json);
  }
}

function broadcastOnline() {
  const users = Array.from(clients.values()).map(u => ({
    name: u.name,
    profilePic: u.profilePic
  }));
  broadcast({ type: 'online', count: users.length, users });
}

// ===== Dati in memoria =====
let chats = loadChats();
cleanOldPublicMessages();

// ===== Eventi WebSocket =====
wss.on('connection', (ws) => {
  console.log('Nuovo client connesso');
  clients.set(ws, { name: null, profilePic: null });

  ws.on('message', (msg) => {
    let data;
    try { data = JSON.parse(msg); } catch (e) { return; }

    // Registrazione / join
    if (data.type === 'join' || data.type === 'register') {
      clients.set(ws, { name: data.name || 'Utente', profilePic: data.profilePic || '' });
      console.log('Registrato utente:', clients.get(ws).name);

      cleanOldPublicMessages();
      send(ws, { type: 'chatHistory', chat: 'public', messages: chats.public });
      broadcastOnline();
      return;
    }

    // Cambio foto profilo
    if (data.type === 'updateProfilePic') {
      const info = clients.get(ws);
      if (!info) return;
      info.profilePic = data.profilePic || '';
      console.log(`Utente ${info.name} ha aggiornato la foto profilo.`);
      broadcastOnline(); // aggiorna la lista utenti visiva per tutti
      return;
    }

    // Messaggio pubblico
    if (data.type === 'chat') {
      const info = clients.get(ws);
      if (!info || !info.name) return;

      const message = {
        user: info.name,
        profilePic: info.profilePic,
        message: data.message || '',
        timestamp: Date.now()
      };
      chats.public.push(message);
      cleanOldPublicMessages();
      saveChats();
      broadcast({ type: 'chat', ...message });
      return;
    }

    // Messaggio privato
    if (data.type === 'private') {
      const sender = clients.get(ws);
      if (!sender || !sender.name) return;
      const targetName = data.to;
      const key = privateKey(sender.name, targetName);
      if (!chats.private[key]) chats.private[key] = [];

      const message = {
        from: sender.name,
        to: targetName,
        profilePic: sender.profilePic,
        message: data.message || '',
        timestamp: Date.now()
      };
      chats.private[key].push(message);
      saveChats();

      for (const [client, info] of clients.entries()) {
        if (info.name === targetName && client.readyState === WebSocket.OPEN) {
          send(client, { type: 'private', ...message });
        }
      }

      send(ws, { type: 'private', ...message });
      return;
    }

    // Cronologia chat privata
    if (data.type === 'loadPrivateChat') {
      const user = clients.get(ws);
      if (!user || !user.name) return;

      const key = privateKey(user.name, data.with);
      const history = chats.private[key] || [];

      send(ws, { type: 'chatHistory', chat: data.with, messages: history });
      return;
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
    broadcastOnline();
    console.log('Client disconnesso, utenti online:', clients.size);
  });
});

