// js/multiplayer/MultiplayerManager.js
import { MultiplayerApi } from "./multiplayer/MultiplayerApi.js";

/**
 * Wrapper runt MultiplayerApi som ger dig:
 * - onJoined(callback)
 * - onGame(callback)
 * - host()
 * - join(sessionId, data)
 * - sendGameData(data)
 */
export class MultiplayerManager {
    constructor(url) {
        this.url = url;
        this.ws = null;

        this.session = null;
        this.clientId = null;

        this.listeners = [];
        this.messageQueue = [];
        this.lastMessageId = 0;
    }

    connect() {
        return new Promise((resolve, reject) => {
            this.ws = new WebSocket(this.url);

            this.ws.onopen = () => {
                resolve();
            };

            this.ws.onerror = (err) => {
                reject(err);
            };

            this.ws.onmessage = (event) => {
                let msg;
                try {
                    msg = JSON.parse(event.data);
                } catch {
                    return;
                }

                this._handleIncoming(msg);
            };

            this.ws.onclose = () => { };
        });
    }

    async host() {
        if (!this.ws) await this.connect();

        return new Promise((resolve) => {
            this._send("host", {});

            const unsubscribe = this.listen((event, messageId, clientId, data) => {
                if (event === "hosted") {
                    this.session = data.session;
                    this.clientId = data.clientId;
                    unsubscribe();
                    resolve({ session: this.session, clientId: this.clientId });
                }
            });
        });
    }

    async join(session, data = {}) {
        if (!this.ws) await this.connect();

        return new Promise((resolve) => {
            this._send("join", {
                session,
                data
            });

            const unsubscribe = this.listen((event, messageId, clientId, response) => {
                if (event === "joined") {
                    this.session = session;
                    this.clientId = clientId;
                    unsubscribe();
                    resolve({ session: this.session, clientId: clientId });
                }
            });
        });
    }

    game(data) {
        this._send("game", {
            session: this.session,
            data
        });
    }

    listen(callback) {
        this.listeners.push(callback);

        return () => {
            this.listeners = this.listeners.filter(cb => cb !== callback);
        };
    }

    _send(event, data) {
        this.ws.send(JSON.stringify({
            event,
            data
        }));
    }

    _handleIncoming(msg) {
        const { event, messageId, clientId, data } = msg;

        if (messageId <= this.lastMessageId) return;
        this.lastMessageId = messageId;

        for (const cb of this.listeners) {
            cb(event, messageId, clientId, data);
        }
    }
}  
