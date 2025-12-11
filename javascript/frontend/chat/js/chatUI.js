// js/chatUI.js

function formatTime(ts) {
	const d = new Date(ts);
	return d.toLocaleTimeString("sv-SE", {
		hour: "2-digit",
		minute: "2-digit"
	});
}

export class ChatUI {
	constructor() {
		// Inputs
		this.inputUserName = document.getElementById("user-name");
		this.inputRoomName = document.getElementById("room-name");
		this.inputRoomCode = document.getElementById("room-code");
		this.inputMessage = document.getElementById("message-input");

		// Buttons
		this.btnHost = document.getElementById("host-btn");
		this.btnJoin = document.getElementById("join-btn");
		this.btnLeave = document.getElementById("leave-btn");
		this.btnSend = document.getElementById("send-btn");

		// Forms / containers
		this.formMessage = document.getElementById("message-form");
		this.messagesEl = document.getElementById("messages");
		this.statusText = document.getElementById("status-text");
		this.lastSessionEl = document.getElementById("last-session");
		this.onlineList = document.getElementById("online-list");

		// Header
		this.roomTitle = document.getElementById("chat-room-title");
		this.roomSubtitle = document.getElementById("chat-room-subtitle");
		this.roomCode = document.getElementById("chat-room-code");
		this.roleLabel = document.getElementById("chat-role");

		// Callbacks
		this._onHost = null;
		this._onJoin = null;
		this._onLeave = null;
		this._onSend = null;

		this.onSessionClick = null;

		this._bindEvents();
	}

	_bindEvents() {
		this.btnHost.addEventListener("click", () => {
			if (typeof this._onHost === "function") {
				this._onHost(
					this.inputUserName.value.trim(),
					this.inputRoomName.value.trim()
				);
			}
		});

		this.btnJoin.addEventListener("click", () => {
			if (typeof this._onJoin === "function") {
				this._onJoin(
					this.inputUserName.value.trim(),
					this.inputRoomCode.value.trim()
				);
			}
		});

		this.btnLeave.addEventListener("click", () => {
			if (typeof this._onLeave === "function") {
				this._onLeave();
			}
		});

		this.formMessage.addEventListener("submit", (e) => {
			e.preventDefault();
			const text = this.inputMessage.value;
			if (!text.trim()) return;
			if (typeof this._onSend === "function") {
				this._onSend(text);
			}
			this.inputMessage.value = "";
		});
	}

	setHandlers({ onHost, onJoin, onLeave, onSend }) {
		this._onHost = onHost || null;
		this._onJoin = onJoin || null;
		this._onLeave = onLeave || null;
		this._onSend = onSend || null;
	}

	setUserName(name) {
		this.inputUserName.value = name || "";
	}

	setConnectedState({ connected, role, sessionId, roomName }) {
		const hasSession = !!sessionId;

		this.btnLeave.disabled = !connected;
		this.inputMessage.disabled = !connected;
		this.btnSend.disabled = !connected;

		if (!connected) {
			this.roomTitle.textContent = "Ingen session";
			this.roomSubtitle.textContent =
				"Skapa eller anslut till ett rum för att börja chatta.";
			this.roomCode.textContent = "–";
			this.roleLabel.textContent = "–";
			this.updateOnlineList([], null);
			return;
		}

		this.roomTitle.textContent = roomName || "Aktivt rum";
		this.roomSubtitle.textContent = `Ansluten till session ${sessionId}`;
		this.roomCode.textContent = hasSession ? sessionId : "–";
		this.roleLabel.textContent = role === "host" ? "Host" : "Klient";
	}

	setStatus(text) {
		this.statusText.textContent = text;
	}

	renderSessionList(sessionList) {
		this.lastSessionEl.innerHTML = "";

		if (!sessionList || sessionList.length === 0) {
			const p = document.createElement("p");
			p.className = "last-session-empty";
			p.textContent = "Inga sparade sessioner ännu.";
			this.lastSessionEl.appendChild(p);
			return;
		}

		sessionList.forEach(session => {
			const btn = document.createElement("button");
			btn.className = "last-session-entry";
			btn.style.display = "block";
			btn.style.width = "100%";
			btn.style.textAlign = "left";
			btn.style.cursor = "pointer";

			const title = document.createElement("div");
			title.className = "last-session-entry-title";
			title.textContent = session.name || `Session ${session.id}`;

			const info = document.createElement("div");
			info.className = "last-session-entry-meta";

			const dt = new Date(session.lastUpdated);
			const dateStr = dt.toLocaleString("sv-SE", {
				dateStyle: "short",
				timeStyle: "short"
			});

			info.textContent = `Meddelanden: ${session.messageCount} · Senast: ${dateStr}`;

			btn.appendChild(title);
			btn.appendChild(info);

			btn.addEventListener("click", () => {
				if (this.onSessionClick) {
					this.onSessionClick(session.id);
				}
			});

			this.lastSessionEl.appendChild(btn);
		});
	}


	clearMessages() {
		this.messagesEl.innerHTML = "";
	}

	addMessage(msg) {
		const wrapper = document.createElement("div");
		wrapper.className = "message";
		if (msg.mine) wrapper.classList.add("message--own");
		else wrapper.classList.add("message--other");

		const avatar = document.createElement("div");
		avatar.className = "message-avatar";
		avatar.textContent = (msg.from || "?").substring(0, 2).toUpperCase();

		const content = document.createElement("div");
		content.className = "message-content";

		const bubble = document.createElement("div");
		bubble.className = "message-bubble";

		const header = document.createElement("div");
		header.className = "message-header";

		const author = document.createElement("span");
		author.className = "message-author";
		author.textContent = msg.from || "Okänd";

		const meta = document.createElement("span");
		meta.className = "message-meta";
		meta.textContent = formatTime(msg.timestamp);

		const text = document.createElement("p");
		text.className = "message-text";
		text.textContent = msg.text;

		header.appendChild(author);
		header.appendChild(meta);
		bubble.appendChild(header);
		bubble.appendChild(text);
		content.appendChild(bubble);

		wrapper.appendChild(avatar);
		wrapper.appendChild(content);

		this.messagesEl.appendChild(wrapper);
		this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
	}

	addSystemMessage(text) {
		const p = document.createElement("div");
		p.className = "message-system";
		p.textContent = text;
		this.messagesEl.appendChild(p);
		this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
	}

	updateOnlineList(users, selfId) {
		this.onlineList.innerHTML = "";
		if (!users || users.length === 0) {
			return;
		}

		users.forEach((u) => {
			const li = document.createElement("li");
			li.textContent = u.name || ("Klient " + u.id);

			if (u.id === selfId) {
				li.classList.add("online-self");
				li.textContent += " (du)";
			}

			this.onlineList.appendChild(li);
		});
	}

	addOnlineNotification(name) {
		this.addSystemMessage(`${name} är nu online.`);
	}
}
