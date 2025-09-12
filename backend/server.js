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

/* Broadcast helper */
function broadcast(msg) {
  const json = JSON.stringify(msg);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(json);
    }
  }
}

/* Invia lista utenti online */
function broadcastOnline() {
  const users = Array.from(clients.values()).map(u => ({ name: u.name, profilePic: u.profilePic }));
  broadcast({ type: 'online', count: users.length, users });
}

wss.on('connection', (ws, req) => {
  console.log('Nuovo client connesso');
  clients.set(ws, { name: null, profilePic: null });

  ws.on('message', (msg) => {
    let data;
    try { data = JSON.parse(msg); } catch(e) { return; }

    // Registrazione/join
    if (data.type === 'join' || data.type === 'register') {
      clients.set(ws, { name: data.name || data.user || 'Utente', profilePic: data.profilePic || '' });
      console.log('Registrato utente:', clients.get(ws).name);
      broadcastOnline();
      return;
    }

    // Messaggio pubblico
    if (data.type === 'chat') {
      const info = clients.get(ws) || { name: 'Utente', profilePic: '' };
      const outgoing = {
        type: 'chat',
        user: info.name,
        profilePic: info.profilePic,
        message: data.message || ''
      };
      broadcast(outgoing);
      return;
    }

    // Messaggio privato
    if (data.type === 'private') {
      const sender = clients.get(ws);
      if (!sender || !sender.name) return;

      const targetName = data.to;
      const message = data.message || '';

      // invia al destinatario
      for (const [client, info] of clients.entries()) {
        if (info.name === targetName && client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({
            type: 'private',
            from: sender.name,
            profilePic: sender.profilePic,
            message
          }));
        }
      }

      // invia conferma al mittente
      ws.send(JSON.stringify({
        type: 'private',
        from: "Me",
        profilePic: sender.profilePic,
        message
      }));

      return;
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
    broadcastOnline();
    console.log('Client disconnesso, utenti online:', clients.size);
  });
});
