
// server.js
// Enkel WebSocket-server för Multiplayer Snake
// Funkar ihop med fake MultiplayerApi.js jag gav dig tidigare.

const { WebSocketServer } = require("ws");

const PORT = 8080;
const wss = new WebSocketServer({ port: PORT });

console.log(`Multiplayer Snake server running on ws://localhost:${PORT}`);

let nextClientId = 1;
const sessions = new Map(); // sessionId -> { clients:Set<Client>, lastMessageId:number }

class Client {
  constructor(ws) {
    this.ws = ws;
    this.clientId = String(nextClientId++);
    this.sessionId = null;
  }
}

function createSessionId() {
  return "SESSION-" + Math.random().toString(16).slice(2, 8);
}

function getOrCreateSession(sessionId) {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, {
      clients: new Set(),
      lastMessageId: 0
    });
  }
  return sessions.get(sessionId);
}

function sendToClient(client, payload) {
  if (client.ws.readyState === client.ws.OPEN) {
    client.ws.send(JSON.stringify(payload));
  }
}

function broadcastToSession(sessionId, payload) {
  const session = sessions.get(sessionId);
  if (!session) return;
  for (const client of session.clients) {
    sendToClient(client, payload);
  }
}

wss.on("connection", (ws) => {
  const client = new Client(ws);
  console.log(`Client connected: ${client.clientId}`);

  ws.on("message", (msg) => {
    let data;
    try {
      data = JSON.parse(msg.toString());
    } catch (err) {
      console.error("Invalid JSON from client", err);
      return;
    }

    const cmd = data.cmd;
    if (!cmd) return;

    // HOST: skapa ny session och lägg klienten där
    if (cmd === "host") {
      const sessionId = createSessionId();
      client.sessionId = sessionId;

      const session = getOrCreateSession(sessionId);
      session.clients.add(client);

      console.log(`Client ${client.clientId} hosted session ${sessionId}`);

      // Skicka "joined" event till hostens klient
      session.lastMessageId++;
      const messageId = session.lastMessageId;

      sendToClient(client, {
        event: "joined",
        messageId,
        clientId: client.clientId,
        data: {
          sessionId,
          isSelf: true
        }
      });

      return;
    }

    // JOIN: anslut till befintlig session
    if (cmd === "join") {
      const sessionId = data.sessionId;
      const userData = data.data || {};

      if (!sessionId || !sessions.has(sessionId)) {
        console.warn(`Client ${client.clientId} tried to join invalid session ${sessionId}`);
        // ev. skicka fel tillbaka
        return;
      }

      client.sessionId = sessionId;
      const session = getOrCreateSession(sessionId);
      session.clients.add(client);

      console.log(`Client ${client.clientId} joined session ${sessionId}`);

      // Skicka "joined" event till ALLA i sessionen
      session.lastMessageId++;
      const messageId = session.lastMessageId;

      broadcastToSession(sessionId, {
        event: "joined",
        messageId,
        clientId: client.clientId,
        data: {
          ...userData,
          sessionId,
          isSelf: false
        }
      });

      // Skicka separat joined till den nya klienten där isSelf = true,
      // så klientkoden kan veta "detta är jag".
      sendToClient(client, {
        event: "joined",
        messageId: session.lastMessageId + 1,
        clientId: client.clientId,
        data: {
          ...userData,
          sessionId,
          isSelf: true
        }
      });

      session.lastMessageId++;
      return;
    }

    // GAME: broadcast spel-data till alla i samma session
    if (cmd === "game") {
      const sessionId = client.sessionId;
      if (!sessionId || !sessions.has(sessionId)) {
        return; // inte i någon session
      }

      const session = sessions.get(sessionId);
      session.lastMessageId++;
      const messageId = session.lastMessageId;

      const payload = {
        event: "game",
        messageId,
        clientId: client.clientId,
        data: data.data
      };

      broadcastToSession(sessionId, payload);
      return;
    }
  });

  ws.on("close", () => {
    console.log(`Client disconnected: ${client.clientId}`);

    const sessionId = client.sessionId;
    if (sessionId && sessions.has(sessionId)) {
      const session = sessions.get(sessionId);
      session.clients.delete(client);

      // skicka "leaved" event om du vill
      session.lastMessageId++;
      const messageId = session.lastMessageId;
      broadcastToSession(sessionId, {
        event: "leaved",
        messageId,
        clientId: client.clientId,
        data: {}
      });

      if (session.clients.size === 0) {
        sessions.delete(sessionId);
        console.log(`Session ${sessionId} emptied and removed`);
      }
    }
  });

  ws.on("error", (err) => {
    console.error("WebSocket error:", err);
  });
});
