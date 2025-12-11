// js/chatClient.js
import { PedroChatApi } from "./PedroChatApi.js";

const APP_IDENTIFIER = "67bdb04f-6e7c-4d76-81a3-191f7d78dd45";

export class ChatClient {
	constructor(serverUrl) {
		this.api = new PedroChatApi(serverUrl, APP_IDENTIFIER);
		this.sessionId = null;
		this.clientId = null;
		this.userName = null;

		this.onlineUsers = new Map(); // clientId -> { id, name }

		this._onMessage = null;
		this._onSystemEvent = null;

		this.api.listen((event, messageId, clientId, data) => {
			if (event === "game") {
				if (!data || data.type !== "chat") return;

				const mine = this.clientId && clientId && this.clientId === clientId;
				const msg = {
					id: messageId != null ? String(messageId) : String(Date.now()),
					text: data.text || "",
					from: data.userName || "Okänd",
					timestamp: data.timestamp || Date.now(),
					mine
				};

				if (typeof this._onMessage === "function") {
					this._onMessage(msg);
				}
			} else if (event === "joined") {
				const name = (data && data.name) || ("Klient " + (clientId || ""));
				this.onlineUsers.set(clientId, { id: clientId, name });
				if (typeof this._onSystemEvent === "function") {
					this._onSystemEvent("online", clientId, { name });
				}
			} else if (event === "left") {
				this.onlineUsers.delete(clientId);
				if (typeof this._onSystemEvent === "function") {
					this._onSystemEvent("offline", clientId, data || {});
				}
			} else if (event === "closed") {
				if (typeof this._onSystemEvent === "function") {
					this._onSystemEvent("closed", clientId, data || {});
				}
			}
		});
	}

	async host(userName, roomName) {
		if (!userName || !userName.trim()) {
			throw new Error("Namnet får inte vara tomt.");
		}
		this.userName = userName.trim();

		const payload = {};
		if (roomName && roomName.trim()) {
			payload.name = roomName.trim();
		}

		const result = await this.api.host(payload);
		this.sessionId = result.session;
		this.clientId = result.clientId;

		this.onlineUsers.clear();
		this.onlineUsers.set(this.clientId, {
			id: this.clientId,
			name: this.userName
		});

		return {
			sessionId: this.sessionId,
			clientId: this.clientId,
			roomName: payload.name || null,
			data: result.data || {}
		};
	}

	async join(sessionCode, userName) {
		if (!userName || !userName.trim()) {
			throw new Error("Namnet får inte vara tomt.");
		}
		if (!sessionCode || !sessionCode.trim()) {
			throw new Error("Rums-/sessionskod får inte vara tom.");
		}

		this.userName = userName.trim();
		const trimmedCode = sessionCode.trim();

		const result = await this.api.join(trimmedCode, { name: this.userName });
		this.sessionId = result.session;
		this.clientId = result.clientId;

		this.onlineUsers.clear();
		(result.clients || []).forEach((c) => {
			this.onlineUsers.set(c.clientId, {
				id: c.clientId,
				name: c.name || "Okänd"
			});
		});
		this.onlineUsers.set(this.clientId, {
			id: this.clientId,
			name: this.userName
		});

		return {
			sessionId: this.sessionId,
			clientId: this.clientId,
			roomName: result.name || null,
			hostClientId: result.host || null,
			clients: result.clients || []
		};
	}

	leave() {
		this.api.leave();
		this.sessionId = null;
		this.clientId = null;
		this.onlineUsers.clear();
	}

	sendMessage(text) {
		if (!this.sessionId) {
			throw new Error("Inte ansluten till något rum.");
		}
		const trimmed = (text || "").trim();
		if (!trimmed) return;

		const payload = {
			type: "chat",
			text: trimmed,
			userName: this.userName,
			timestamp: Date.now()
		};

		this.api.transmit(payload);
	}

	onMessage(callback) {
		this._onMessage = typeof callback === "function" ? callback : null;
	}

	onSystemEvent(callback) {
		this._onSystemEvent = typeof callback === "function" ? callback : null;
	}
}
