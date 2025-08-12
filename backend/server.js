const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const WebSocket = require('ws');
const wss = new WebSocket.Server({ server });

// Serve i file statici
app.use(express.static('public'));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`WebSocket server in ascolto sulla porta ${PORT}`);
});

let clients = new Set();

wss.on("connection", (ws) => {
  ws.userData = { user: null, profilePic: null };
  clients.add(ws);

  ws.on("message", (message) => {
    let data = {};
    try {
      data = JSON.parse(message);
    } catch (e) {
      return;
    }

    if (data.type === "login") {
      ws.userData.user = data.user;
      ws.userData.profilePic = data.profilePic;
      broadcastOnline();
    }

    if (data.type === "chat") {
      broadcast({ type: "chat", user: ws.userData.user || "Utente", message: data.message });
    }
  });

  ws.on("close", () => {
    clients.delete(ws);
    broadcastOnline();
  });
});

function broadcast(msg) {
  for (let client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(msg));
    }
  }
}

function broadcastOnline() {
  const onlineUsers = Array.from(clients)
    .filter(c => c.userData.user)
    .map(c => ({ user: c.userData.user, profilePic: c.userData.profilePic }));

  broadcast({ type: "online", count: onlineUsers.length, users: onlineUsers });
}
