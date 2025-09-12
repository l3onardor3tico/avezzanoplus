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

let clients = new Map(); // ws -> userData

wss.on("connection", (ws) => {
  console.log("Nuovo client connesso");

  ws.on("message", (message) => {
    let data = {};
    try {
      data = JSON.parse(message);
    } catch (e) {
      return;
    }

    if (data.type === "register") {
      clients.set(ws, { name: data.name, profilePic: data.profilePic });
      broadcastOnline();
    }

    if (data.type === "chat") {
      broadcast({ 
        type: "chat", 
        user: data.user, 
        profilePic: data.profilePic,
        message: data.message 
      });
    }

    if (data.type === "private") {
      // trova destinatario
      for (let [client, user] of clients.entries()) {
        if (user.name === data.to && client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({
            type: "private",
            from: data.from,
            profilePic: data.profilePic,
            message: data.message
          }));
        }
      }
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
  const users = Array.from(clients.values()).map(u => ({ name: u.name, profilePic: u.profilePic }));
  broadcast({ type: "online", count: clients.size, users });
}

