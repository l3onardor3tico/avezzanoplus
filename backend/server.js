
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

let clients = new Set();

wss.on("connection", (ws) => {
  ws.userData = { username: "Utente", profilePic: "" }; // default
  clients.add(ws);
  broadcastOnline();

  ws.on("message", (message) => {
    let data = {};
    try {
      data = JSON.parse(message);
    } catch (e) {
      return;
    }

    if (data.type === "register") {
      ws.userData.username = data.username;
      ws.userData.profilePic = data.profilePic;
      broadcastOnline();
    }

    if (data.type === "chat") {
      broadcast({
        type: "chat",
        user: ws.userData.username,
        profilePic: ws.userData.profilePic,
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
  for (let client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(msg));
    }
  }
}

function broadcastOnline() {
  const onlineUsers = [...clients].map(c => ({
    username: c.userData.username,
    profilePic: c.userData.profilePic
  }));
  broadcast({ type: "online", count: clients.size, users: onlineUsers });
}
