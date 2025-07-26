
const express = require('express');
const app = express();
const http = require('http');
const WebSocket = require('ws');

const PORT = process.env.PORT || 3000;
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Serve i file statici
app.use(express.static('public'));

server.listen(PORT, () => {
  console.log(`WebSocket server in ascolto sulla porta ${PORT}`);
});

let clients = new Set();

wss.on("connection", (ws, req) => {
  // [Opzionale] Ignora connessioni sospette tipo health check:
  // if (req.headers['user-agent'] && req.headers['user-agent'].includes('render')) {
  //   ws.close(); return;
  // }

  clients.add(ws);
  console.log("🟢 Nuovo client connesso. Totale:", clients.size);
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
    console.log("🔴 Client disconnesso. Totale:", clients.size);
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

