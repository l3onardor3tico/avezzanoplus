
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
  clients.add(ws);
  broadcastOnline();

  ws.on("message", (message) => {
    let data = {};
    try {
      data = JSON.parse(message);
    } catch (e) {
      return;
    }
    if (data.type === "chat") {
      broadcast({ type: "chat", user: "Utente", message: data.message });
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
  broadcast({ type: "online", count: clients.size });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`WebSocket server in ascolto sulla porta ${PORT}`);
});
