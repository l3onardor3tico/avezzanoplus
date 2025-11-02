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

// =====================
// FUNZIONI DI SUPPORTO
// =====================

// Carica le chat salvate
function loadChats() {
  try {
    const data = fs.readFileSync(CHAT_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    return { public: [], private: {} };
  }
}

// Salva le chat su disco
function saveChats() {
  fs.writeFileSync(CHAT_FILE, JSON.stringify(chats, null, 2));
}

// Rimuove messaggi pubblici più vecchi di 7 giorni
function cleanOldPublicMessages() {
  const now = Date.now();
  const week = 7 * 24 * 60 * 60 * 1000;
  chats.public = chats.public.filter(m => now - m.timestamp < week);
  saveChats();
}

// Restituisce la chiave univoca per una chat privata
function privateKey(userA, userB) {
  return [userA, userB].sort().join('_');
}

// Invia un messaggio a un singolo client
function send(ws, msg) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

// Invia un messaggio a tutti i client connessi
function broadcast(msg) {
  const json = JSON.stringify(msg);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(json);
  }
}

// Aggiorna la lista utenti online
function broadcastOnline() {
  const users = Array.from(clients.values()).map(u => ({ name: u.name, profilePic: u.profilePic }));
  broadcast({ type: 'online', count: users.length, users });
}

// =====================
// CHAT IN MEMORIA
// =====================
let chats = loadChats();
cleanOldPublicMessages();

// =====================
// EVENTI WEBSOCKET
// =====================
wss.on('connection', (ws) => {
  console.log('Nuovo client connesso');
  clients.set(ws, { name: null, profilePic: null });

  ws.on('message', (msg) => {
    let data;
    try { data = JSON.parse(msg); } catch (e) { return; }

    // ===== REGISTRAZIONE =====
    if (data.type === 'join' || data.type === 'register') {
      clients.set(ws, { name: data.name || 'Utente', profilePic: data.profilePic || '' });
      console.log('Registrato utente:', clients.get(ws).name);

      // Invia la chat pubblica (solo ultimi 7 giorni)
      cleanOldPublicMessages();
      send(ws, { type: 'chatHistory', chat: 'public', messages: chats.public });

      broadcastOnline();
      return;
    }

    // ===== MESSAGGIO PUBBLICO =====
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

    // ===== MESSAGGIO PRIVATO =====
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

      // Invia a destinatario
      for (const [client, info] of clients.entries()) {
        if (info.name === targetName && client.readyState === WebSocket.OPEN) {
          send(client, { type: 'private', ...message });
        }
      }

      // Rimanda anche al mittente
      send(ws, { type: 'private', ...message });
      return;
    }

    // ===== RICHIESTA CRONOLOGIA PRIVATA =====
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
