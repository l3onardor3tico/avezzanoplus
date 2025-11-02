const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const WebSocket = require('ws');
const wss = new WebSocket.Server({ server });
const fs = require('fs');
const path = require('path');

app.use(express.static('public'));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`WebSocket server in ascolto sulla porta ${PORT}`);
});

/* === Gestione dati persistenti === */
const DATA_DIR = path.join(__dirname, 'chat_data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

function loadChatFile(filename) {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA_DIR, filename), 'utf8'));
  } catch {
    return [];
  }
}

function saveChatFile(filename, data) {
  fs.writeFileSync(path.join(DATA_DIR, filename), JSON.stringify(data, null, 2));
}

/* === Carica chat pubblica (solo ultimi 7 giorni) === */
let publicChat = loadChatFile('public.json').filter(msg => {
  return Date.now() - msg.timestamp < 7 * 24 * 60 * 60 * 1000;
});
saveChatFile('public.json', publicChat);

/* === Mappa client === */
const clients = new Map(); // ws => { name, profilePic }

/* === Helper === */
function broadcast(msg) {
  const json = JSON.stringify(msg);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(json);
    }
  }
}

function broadcastOnline() {
  const users = Array.from(clients.values()).map(u => ({ name: u.name, profilePic: u.profilePic }));
  broadcast({ type: 'online', users });
}

/* === Gestione WebSocket === */
wss.on('connection', (ws) => {
  console.log('Nuovo client connesso');
  clients.set(ws, { name: null, profilePic: null });

  ws.on('message', (msg) => {
    let data;
    try { data = JSON.parse(msg); } catch { return; }

    /* Registrazione utente */
    if (data.type === 'join') {
      clients.set(ws, { name: data.name, profilePic: data.profilePic });
      console.log('Registrato utente:', data.name);
      broadcastOnline();

      // Invia chat pubblica
      ws.send(JSON.stringify({ type: 'chat_history', chat: 'public', messages: publicChat }));

      // Invia chat private salvate
      const privateDir = path.join(DATA_DIR, 'private');
      if (!fs.existsSync(privateDir)) fs.mkdirSync(privateDir);
      fs.readdirSync(privateDir).forEach(file => {
        if (file.includes(data.name)) {
          const msgs = loadChatFile(path.join('private', file));
          ws.send(JSON.stringify({ type: 'chat_history', chat: file.replace('.json', ''), messages: msgs }));
        }
      });
      return;
    }

    /* Messaggio pubblico */
    if (data.type === 'chat') {
      const sender = clients.get(ws);
      if (!sender || !sender.name) return;
      const msgData = {
        user: sender.name,
        profilePic: sender.profilePic,
        message: data.message,
        timestamp: Date.now()
      };
      publicChat.push(msgData);
      saveChatFile('public.json', publicChat);
      broadcast({ type: 'chat', ...msgData });
      return;
    }

    /* Messaggio privato */
    if (data.type === 'private') {
      const sender = clients.get(ws);
      if (!sender || !sender.name) return;
      const targetName = data.to;
      const chatId = [sender.name, targetName].sort().join('_');
      const filename = path.join('private', chatId + '.json');
      const filepath = path.join(DATA_DIR, filename);
      const msgs = loadChatFile(filename);

      const msgData = {
        from: sender.name,
        to: targetName,
        profilePic: sender.profilePic,
        message: data.message,
        timestamp: Date.now()
      };
      msgs.push(msgData);
      saveChatFile(filename, msgs);

      // Invia al destinatario se online
      for (const [client, info] of clients.entries()) {
        if (info.name === targetName && client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ type: 'private', ...msgData }));
        }
      }

      // Invia al mittente per aggiornare la chat
      ws.send(JSON.stringify({ type: 'private', ...msgData }));
      return;
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
    broadcastOnline();
    console.log('Client disconnesso');
  });
});

