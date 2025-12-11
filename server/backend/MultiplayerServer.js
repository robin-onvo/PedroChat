const { randomUUID } = require("crypto");
const WebSocket = require("ws");
const net = require("net");
const { type } = require("os");

class MultiplayerServer {
	servers = [];
	sessions = new Map();

	wss = null;
	tcpServer = null;

	constructor(servers, options = {}) {
		if (!servers) throw new Error("No server provided to MultiplayerServer");
		if (!Array.isArray(servers)) throw new Error("servers must be an array");

		this.servers = servers;

		this.path = options.path || "/multiplayer";
		this.tcpPort = options.tcpPort;

		this.wss = new WebSocket.Server(
			{
				noServer: true
			}
		);

		this.servers.forEach((server) => {
			server.on("upgrade", this.handleUpgrade.bind(this));
		});

		this.wss.on("connection", (ws) => this.handleWebSocketConnection(ws));

		console.log("MultiplayerServer online at path:", this.path);

		// Starta TCP-server för C-klienter om tcpPort är satt
		if (typeof this.tcpPort === "number") {
			this.tcpServer = net.createServer((socket) => this.handleTcpConnection(socket));

			this.tcpServer.on("error", (err) => {
				console.error("Multiplayer TCP server error:", err);
			});

			this.tcpServer.listen(this.tcpPort, () => {
				console.log("Multiplayer TCP server listening on port:", this.tcpPort);
			});
		}
	}

	handleUpgrade(request, socket, head) {
		if (request.url === this.path) {
			this.wss.handleUpgrade(request, socket, head, (ws) => {
				this.wss.emit("connection", ws, request);
			});
		}
	}

	generateSessionId() {
		const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
		let id = "";
		do {
			id = "";
			for (let i = 0; i < 6; i++) {
				id += chars.charAt(Math.floor(Math.random() * chars.length));
			}
		} while (this.sessions.has(id));
		return id;
	}

	// --- WebSocket-klienter (JS) ---

	handleWebSocketConnection(ws) {
		console.log("New WebSocket multiplayer connection");

		const client = {
			type: "ws",
			socket: ws,
			sessionId: null,
			clientId: randomUUID(),
			isHost: false,
			messageId: 0,
			send: (jsonString) => {
				if (ws.readyState === WebSocket.OPEN) {
					ws.send(jsonString);
				}
			},
			isOpen: () => ws.readyState === WebSocket.OPEN
		};

		ws.on("message", (message) => this.handleMessage(client, message.toString()));
		ws.on("close", () => this.handleClose(client));
		ws.on("error", () => this.handleClose(client));
	}

	// --- TCP-klienter (C via MultiplayerApi.c) ---

	handleTcpConnection(socket) {
		console.log("New TCP multiplayer connection");

		socket.setEncoding("utf8");

		const client = {
			type: "tcp",
			socket,
			buffer: "",
			sessionId: null,
			clientId: randomUUID(),
			isHost: false,
			messageId: 0,
			send: (jsonString) => {
				if (!socket.destroyed) {
					// Varje JSON‑meddelande avslutas med '\n'
					socket.write(jsonString + "\n");
				}
			},
			isOpen: () => !socket.destroyed
		};

		socket.on("data", (chunk) => {
			client.buffer += chunk.toString();
			let index;
			while ((index = client.buffer.indexOf("\n")) !== -1) {
				const line = client.buffer.slice(0, index).trim();
				client.buffer = client.buffer.slice(index + 1);
				if (line.length > 0) {
					this.handleMessage(client, line);
				}
			}
		});

		socket.on("end", () => this.handleClose(client));
		socket.on("close", () => this.handleClose(client));
		socket.on("error", () => this.handleClose(client));
	}

	// --- Gemensam meddelandehantering ---

	handleMessage(client, message) {
		let payload;
		try {
			if (typeof message !== "string") {
				message = message.toString();
			}
			payload = JSON.parse(message);
		} catch (e) {
			return;
		}

		const identifier = typeof payload.identifier === "string" ? payload.identifier : null;

		if (!identifier) {
			client.send(JSON.stringify({
				cmd: "error",
				clientId: client.clientId,
				data: { reason: "missing_identifier" }
			}));
			return;
		}

		console.log("Processing message from client:", client.clientId, "Payload:", payload);

		const cmd = typeof payload.cmd === "string" ? payload.cmd : null;
		const data = payload && typeof payload.data === "object" ? payload.data : {};
		let sessionId = typeof payload.session === "string" ? payload.session : null;
		const clientId = client.clientId;

		console.log("Identifier:", identifier, "Command:", cmd, "Session ID:", sessionId, "Client ID:", clientId);

		switch (cmd) {
			case "host":
				{
					sessionId = this.generateSessionId();

					let session = {
						identifier: identifier,
						messageId: 0,
						isPrivate: data.private === true,
						name: typeof data.name === "string" ? data.name : "Unnamed",
						host: client,
						clients: [client]
					};

					this.sessions.set(sessionId, session);

					client.sessionId = sessionId;

					client.send(JSON.stringify({
						session: sessionId,
						cmd: "host",
						clientId: client.clientId,
						data
					}));
				} break;

			case "join":
				{
					if (!sessionId || !this.sessions.has(sessionId)) {
						client.send(JSON.stringify({
							session: sessionId,
							cmd: "join",
							clientId: client.clientId,
							data: { status: "error", reason: "invalid_session" }
						}));
						return;
					}

					let session = this.sessions.get(sessionId);

					if (session.identifier !== identifier) {
						client.send(JSON.stringify({
							session: sessionId,
							cmd: "join",
							clientId: client.clientId,
							data: { status: "error", reason: "identifier_mismatch" }
						}));
						return;
					}

					if (session.clients.indexOf(client) !== -1) {
						client.send(JSON.stringify({
							session: sessionId,
							cmd: "join",
							clientId: client.clientId,
							data: { status: "error", reason: "already_joined" }
						}));
						return;
					}

					client.sessionId = sessionId;

					client.send(JSON.stringify({
						session: sessionId,
						name: session.name,
						host: session.host.clientId,
						clients: session.clients.map(c => c.clientId),
						cmd: "join",
						clientId: client.clientId,
						data
					}));

					const joinedData = JSON.stringify({
						session: sessionId,
						cmd: "joined",
						clientId: client.clientId,
						data
					});


					session.clients.forEach((other) => {
						if (other.isOpen()) {
							other.send(joinedData);
						}
					});

					session.clients.push(client);

				} break;

			case "leave":
				{
					let session = this.sessions.get(sessionId);
					if (!session) return;

					let index = session.clients.indexOf(client);
					if (index !== -1) {
						session.clients.splice(index, 1);
					}

					const serialized = JSON.stringify({
						cmd: "left",
						clientId: client.clientId,
						data
					});

					for (let other of clientSet) {
						if (other.isOpen()) {
							other.send(serialized);
						}
					}

					this.handleClose(client);

				} break;

			case "list":
				{
					let data = {
						cmd: "list",
						data: {
							list: []
						}
					};

					for (const [key, session] of this.sessions) {

						if (!session.isPrivate) {
							data.data.list.push({
								id: key,
								name: session.name,
								clients: session.clients.map(c => c.clientId)
							});
						}
					}


					client.send(JSON.stringify(data));

				} break;

			case "game":
				{
					let session = this.sessions.get(sessionId);
					if (!session) return;

					const destination = typeof payload.destination === "string" ? payload.destination : null;

					const serialized = JSON.stringify({
						cmd: "game",
						messageId: session.messageId++,
						clientId: client.clientId,
						broadcast: destination ? false : true,
						data
					});

					for (let other of session.clients) {
						if (!destination || other.clientId === destination) {
							if (other !== client && other.isOpen()) {
								other.send(serialized);
							}
						}
					}
				} break;
		}

	}

	handleClose(client) {
		console.log("Client disconnected:", client.clientId);

		// Ta bort klienten från dess session
		const sessionId = client.sessionId;
		if (sessionId && this.sessions.has(sessionId)) {
			const session = this.sessions.get(sessionId);
			const index = session.clients.indexOf(client);
			if (index !== -1) {
				session.clients.splice(index, 1);
			}

			// Om klienten var host, ta bort hela sessionen och informera övriga klienter
			if (client === session.host) {
				const serialized = JSON.stringify({
					cmd: "closed",
					data: { reason: "host_disconnected" }
				});

				session.clients.forEach((other) => {
					if (other !== client && other.isOpen()) {
						other.send(serialized);
						other.sessionId = null;
					}
				});

				this.sessions.delete(sessionId);
			}
		}

		try {
			// Stäng anslutningen om den fortfarande är öppen
			client.close();
		} catch (e) {

		}

	}
}

module.exports = MultiplayerServer;

