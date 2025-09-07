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

// Ogni client ha un oggetto con ws, name e profilePic
let clients = new Map();

wss.on("connection", (ws) => {
  clients.set(ws, { name: null, profilePic: null });
  broadcastOnline();

  ws.on("message", (message) => {
    let data = {};
    try {
      data = JSON.parse(message);
    } catch (e) {
      return;
    }

    if (data.type === "register") {
      // Salva i dati dell'utente
      clients.set(ws, { name: data.name, profilePic: data.profilePic });
      broadcastOnline();
    }

    if (data.type === "chat") {
      const user = clients.get(ws);
      if (!user || !user.name) return;

      broadcast({
        type: "chat",
        user: user.name,
        profilePic: user.profilePic,
        message: data.message
      });
    }
  });

  ws.on("close", () => {
    clients.delete(ws);
    broadcastOnline();
  });
});

function broadcast(msg) {
  for (let client of clients.keys()) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(msg));
    }
  }
}

function broadcastOnline() {
  const onlineUsers = Array.from(clients.values())
    .filter(u => u.name !== null)
    .map(u => ({ name: u.name, profilePic: u.profilePic }));

  broadcast({
    type: "online",
    count: onlineUsers.length,
    users: onlineUsers
  });
}

