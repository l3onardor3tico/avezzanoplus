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

let clients = new Map(); // ws -> { name, profilePic }

wss.on("connection", (ws) => {
  console.log("Nuovo utente connesso");

  ws.on("message", (message) => {
    let data = {};
    try {
      data = JSON.parse(message);
    } catch (e) {
      return;
    }

    if (data.type === "join") {
      // Salva le info utente
      clients.set(ws, { name: data.name, profilePic: data.profilePic });
      broadcastOnline();
    }

    if (data.type === "chat") {
      const userInfo = clients.get(ws) || { name: "Utente", profilePic: "" };
      broadcast({
        type: "chat",
        user: userInfo.name,
        profilePic: userInfo.profilePic,
        message: data.message
      });
    }
  });

  ws.on("close", () => {
    clients.delete(ws);
    broadcastOnline();
  });
});

// Invia un messaggio a tutti
function broadcast(msg) {
  for (let client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(msg));
    }
  }
}

// Aggiorna lista utenti online
function broadcastOnline() {
  const users = Array.from(clients.values());
  broadcast({ type: "online", count: users.length, users });
}

