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
  chats.public = chats.public.filter(m => now - (m.timestamp || 0) < week);
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
  const users = Array.from(clients.values())
    .filter(u => u && u.name)
    .map(u => ({ name: u.name, profilePic: u.profilePic }));
  broadcast({ type: 'online', count: users.length, users });
}

// In-memory chats (loaded from disk)
let chats = loadChats();
cleanOldPublicMessages();

wss.on('connection', (ws) => {
  console.log('Nuovo client connesso');
  clients.set(ws, { name: null, profilePic: null });

  ws.on('message', (msg) => {
    let data;
    try { data = JSON.parse(msg); } catch (e) { return; }

    // ==== REGISTER / JOIN ====
    if (data.type === 'join' || data.type === 'register') {
      clients.set(ws, { name: data.name || 'Utente', profilePic: data.profilePic || '' });
      console.log('Registrato utente:', clients.get(ws).name);

      // Invia cronologia pubblica (ultimi 7 giorni)
      cleanOldPublicMessages();
      send(ws, { type: 'chatHistory', chat: 'public', messages: chats.public });

      broadcastOnline();
      return;
    }

    // ==== PUBLIC CHAT ====
    if (data.type === 'chat') {
      const info = clients.get(ws);
      if (!info || !info.name) return;

      // assicuriamoci di avere un id
      const id = data.id || `${Date.now()}-${Math.random().toString(36).slice(2)}`;

      const message = {
        id: id,
        user: info.name,
        profilePic: info.profilePic,
        message: data.message || '',
        timestamp: Date.now()
      };

      chats.public = chats.public || [];
      chats.public.push(message);
      cleanOldPublicMessages();
      saveChats();

      // broadcast include id
      broadcast({ type: 'chat', ...message });
      return;
    }

    // ==== PRIVATE MESSAGE ====
    if (data.type === 'private') {
      const sender = clients.get(ws);
      if (!sender || !sender.name) return;
      const targetName = data.to;
      if (!targetName) return;

      const key = privateKey(sender.name, targetName);
      chats.private = chats.private || {};
      if (!chats.private[key]) chats.private[key] = [];

      const id = data.id || `${Date.now()}-${Math.random().toString(36).slice(2)}`;

      const message = {
        id: id,
        from: sender.name,
        to: targetName,
        profilePic: sender.profilePic,
        message: data.message || '',
        timestamp: Date.now()
      };

      chats.private[key].push(message);
      saveChats();

      // invia al destinatario se online
      for (const [client, info] of clients.entries()) {
        if (info.name === targetName && client.readyState === WebSocket.OPEN) {
          send(client, { type: 'private', ...message });
        }
      }

      // rimanda anche al mittente (con id) — il client mittente ignorerà tramite id già visto
      send(ws, { type: 'private', ...message });
      return;
    }

    // ==== LOAD PRIVATE HISTORY ====
    if (data.type === 'loadPrivateChat') {
      const user = clients.get(ws);
      if (!user || !user.name) return;
      const other = data.with;
      const key = privateKey(user.name, other);
      const history = (chats.private && chats.private[key]) ? chats.private[key] : [];
      send(ws, { type: 'chatHistory', chat: other, messages: history });
      return;
    }
  });

  ws.on('close', () => {
    const info = clients.get(ws);
    console.log('Client disconnesso:', info?.name || 'sconosciuto');
    clients.delete(ws);
    broadcastOnline();
  });
});

