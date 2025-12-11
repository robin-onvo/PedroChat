// js/storage.js

const STORAGE_KEY = "canvas-chat-sessions-v1";
const USER_KEY = "canvas-chat-user-name-v1";
const LAST_SESSION_KEY = "canvas-chat-last-session-v1";

function safeParse(json, fallback) {
	try {
		const v = JSON.parse(json);
		return v ?? fallback;
	} catch {
		return fallback;
	}
}

export const ChatStorage = {

	getAllSessions() {
		const sessions = this.loadSessions();
		return Object.values(sessions)
			.sort((a, b) => b.lastUpdated - a.lastUpdated)
			.map(s => ({
				id: s.id,
				name: s.name,
				lastUpdated: s.lastUpdated,
				messageCount: (s.messages || []).length
			}));
	},

	loadSessions() {
		const raw = localStorage.getItem(STORAGE_KEY);
		const sessions = safeParse(raw, {});
		return sessions;
	},

	saveSessions(sessions) {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions || {}));
	},

	saveMessage(sessionId, message) {
		if (!sessionId) return;
		const sessions = this.loadSessions();
		if (!sessions[sessionId]) {
			sessions[sessionId] = {
				id: sessionId,
				name: null,
				lastUpdated: 0,
				messages: []
			};
		}
		sessions[sessionId].messages.push(message);
		sessions[sessionId].lastUpdated = message.timestamp || Date.now();
		this.saveSessions(sessions);
	},

	loadMessages(sessionId) {
		if (!sessionId) return [];
		const sessions = this.loadSessions();
		const session = sessions[sessionId];
		return session && Array.isArray(session.messages) ? session.messages : [];
	},

	updateSessionMeta(sessionId, meta) {
		if (!sessionId) return;
		const sessions = this.loadSessions();
		if (!sessions[sessionId]) {
			sessions[sessionId] = {
				id: sessionId,
				name: null,
				lastUpdated: Date.now(),
				messages: []
			};
		}
		sessions[sessionId] = {
			...sessions[sessionId],
			...meta,
			lastUpdated: Date.now()
		};
		this.saveSessions(sessions);
	},

	setUserName(name) {
		localStorage.setItem(USER_KEY, name || "");
	},

	getUserName() {
		return localStorage.getItem(USER_KEY) || "";
	},

	setLastSession(sessionId) {
		if (!sessionId) {
			localStorage.removeItem(LAST_SESSION_KEY);
		} else {
			localStorage.setItem(LAST_SESSION_KEY, String(sessionId));
		}
	},

	getLastSessionId() {
		return localStorage.getItem(LAST_SESSION_KEY) || null;
	},

	getLastSessionMeta() {
		const sessionId = this.getLastSessionId();
		if (!sessionId) return null;
		const sessions = this.loadSessions();
		const session = sessions[sessionId];
		if (!session) return null;
		return {
			id: session.id,
			name: session.name,
			lastUpdated: session.lastUpdated,
			messageCount: (session.messages || []).length
		};
	}
};
