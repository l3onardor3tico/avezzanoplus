const WebSocket = require("ws");
const wss = new WebSocket.Server({ port: 3000 });

let clients = [];

wss.on("connection", ws => {

  ws.on("message", msg => {
    const data = JSON.parse(msg);

    if (data.type === "join") {
      ws.user = data.user.name;
      clients.push(ws);
      broadcastUsers();
    }

    if (data.type === "message") {
      if (data.from === data.to) return;

      if (data.to === "public") {
        broadcast(data);
      } else {
        clients.forEach(c => {
          if (c.user === data.to || c.user === data.from) {
            c.send(JSON.stringify({ type: "message", ...data }));
          }
        });
      }
    }
  });

  ws.on("close", () => {
    clients = clients.filter(c => c !== ws);
    broadcastUsers();
  });
});

function broadcastUsers() {
  const users = clients.map(c => c.user);
  broadcast({ type: "users", users });
}

function broadcast(data) {
  clients.forEach(c => c.send(JSON.stringify(data)));
}
