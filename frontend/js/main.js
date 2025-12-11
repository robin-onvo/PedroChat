import { ChatClient } from "./chatClient.js";
import { ChatStorage } from "./storage.js";
import { ChatUI } from "./chatUI.js";

const SERVER_URL = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/net`;

const ui = new ChatUI();
const client = new ChatClient(SERVER_URL);

// Initiera UI från localStorage
(function initFromStorage() {
	const userName = ChatStorage.getUserName();
	if (userName) {
		ui.setUserName(userName);
	}

	const meta = ChatStorage.getLastSessionMeta();
	ui.renderSessionList(ChatStorage.getAllSessions());
})();

ui.onSessionClick = async (sessionId) => {
	const userName = ChatStorage.getUserName();
	if (!userName) {
		ui.setStatus("Ange ett användarnamn innan du ansluter.");
		return;
	}

	ui.setStatus(`Försöker ansluta till session ${sessionId}...`);

	try {
		const result = await client.join(sessionId, userName);

		ChatStorage.setLastSession(sessionId);

		ui.setConnectedState({
			connected: true,
			role: "client",
			sessionId: sessionId,
			roomName: result.roomName || null
		});

		ui.clearMessages();

		const history = ChatStorage.loadMessages(sessionId);
		history.forEach(m => ui.addMessage(m));

		ui.updateOnlineList([...client.onlineUsers.values()], client.clientId);
		ui.setStatus("Ansluten.");
	} catch (err) {
		ui.setStatus("Kunde inte ansluta. Session kan vara stängd.");
	}
};

// Koppla UI-händelser
ui.setHandlers({
	onHost: async (userName, roomName) => {
		try {
			ChatStorage.setUserName(userName);
			ui.setStatus("Skapar nytt rum...");
			const result = await client.host(userName, roomName);

			ChatStorage.updateSessionMeta(result.sessionId, {
				name: result.roomName || null
			});
			ChatStorage.setLastSession(result.sessionId);

			ui.setConnectedState({
				connected: true,
				role: "host",
				sessionId: result.sessionId,
				roomName: result.roomName || null
			});
			ui.clearMessages();
			ui.setStatus(`Hostar rum med kod: ${result.sessionId}`);

			const meta = ChatStorage.getLastSessionMeta();
			ui.renderSessionList(ChatStorage.getAllSessions());

			ui.updateOnlineList([...client.onlineUsers.values()], client.clientId);

			// Ladda ev. lokal historik för samma session (om du hostat tidigare)
			const history = ChatStorage.loadMessages(result.sessionId);
			history.forEach((m) => ui.addMessage(m));
		} catch (err) {
			ui.setStatus(String(err));
		}
	},

	onJoin: async (userName, roomCode) => {
		try {
			ChatStorage.setUserName(userName);
			ui.setStatus("Ansluter till rum...");
			const result = await client.join(roomCode, userName);

			ChatStorage.updateSessionMeta(result.sessionId, {
				name: result.roomName || null
			});
			ChatStorage.setLastSession(result.sessionId);

			ui.setConnectedState({
				connected: true,
				role: "client",
				sessionId: result.sessionId,
				roomName: result.roomName || null
			});
			ui.clearMessages();
			ui.setStatus(`Ansluten till rum ${result.sessionId}`);

			const meta = ChatStorage.getLastSessionMeta();
			ui.renderSessionList(ChatStorage.getAllSessions());

			ui.updateOnlineList([...client.onlineUsers.values()], client.clientId);

			// Ladda lokal historik (per webbläsare)
			const history = ChatStorage.loadMessages(result.sessionId);
			history.forEach((m) => ui.addMessage(m));
		} catch (err) {
			ui.setStatus(String(err));
		}
	},

	onLeave: () => {
		client.leave();
		ui.setConnectedState({
			connected: false,
			role: null,
			sessionId: null,
			roomName: null
		});
		ui.setStatus("Lämnade rummet.");
	},

	onSend: (text) => {
		try {
			const userName = ChatStorage.getUserName() || "Du";
			const msg = {
				id: Date.now().toString(),
				text,
				from: userName,
				timestamp: Date.now(),
				mine: true
			};

			ui.addMessage(msg);

			if (client.sessionId) {
				ChatStorage.saveMessage(client.sessionId, msg);
			}

			client.sendMessage(text);
		} catch (err) {
			ui.setStatus(String(err));
		}
	}
});

// Lyssna på inkommande meddelanden och events
client.onMessage((msg) => {
	// Undvik dubblett av egna meddelanden (vi ritar dem direkt lokalt i onSend)
	if (msg.mine) {
		return;
	}

	ui.addMessage(msg);
	if (client.sessionId) {
		ChatStorage.saveMessage(client.sessionId, msg);
		ChatStorage.setLastSession(client.sessionId);
		const meta = ChatStorage.getLastSessionMeta();
		ui.renderSessionList(ChatStorage.getAllSessions());
	}
});

client.onSystemEvent((event, clientId, data) => {
	if (event === "online") {
		ui.addOnlineNotification(data.name || "Okänd");
		ui.updateOnlineList([...client.onlineUsers.values()], client.clientId);
	} else if (event === "offline") {
		ui.addSystemMessage(`En klient lämnade: ${clientId || "okänt id"}.`);
		ui.updateOnlineList([...client.onlineUsers.values()], client.clientId);
	} else if (event === "closed") {
		ui.addSystemMessage("Sessionen stängdes av hosten.");
		ui.setConnectedState({
			connected: false,
			role: null,
			sessionId: null,
			roomName: null
		});
	}
});
