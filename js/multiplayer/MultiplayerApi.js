/*
// FAKER – byt mot den riktiga från utbildaren sen
export class MultiplayerApi {
  constructor(url) {
    console.log("Fake MultiplayerApi connected to", url);
    this.url = url;
    this.listeners = [];
    this._nextClientId = 1;
    this._sessionId = null;
    this._messageId = 1;
  }

  host() {
    return new Promise(resolve => {
      this._sessionId = "SESSION-" + Math.random().toString(16).slice(2, 8);
      console.log("Hosted fake session:", this._sessionId);
      resolve(this._sessionId);
    });
  }

  join(sessionId, data) {
    return new Promise(resolve => {
      console.log("Joined fake session:", sessionId, data);
      this._sessionId = sessionId;
      const clientId = this._nextClientId++;
      // skicka ett "joined"-event till alla lyssnare
      this._emit("joined", this._messageId++, clientId, data);
      resolve();
    });
  }

  game(data) {
    // skicka "game"-event lokalt till alla lyssnare
    const clientId = 0; // fake
    this._emit("game", this._messageId++, clientId, data);
  }

  listen(callback) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(cb => cb !== callback);
    };
  }

  _emit(event, messageId, clientId, data) {
    for (const cb of this.listeners) {
      cb(event, messageId, clientId, data);
    }
  }
}*/
// js/multiplayer/MultiplayerApi.js
// Multiplayer-klient för ditt Snake-spel.
// Matchar server.js som använder cmd: "host" | "join" | "game"
// och skickar event: "joined" | "leaved" | "game".

export class MultiplayerApi {
  constructor(url) {
    this.url = url;
    this.ws = null;
    this.listeners = [];

    this.sessionId = null; // t.ex. "SESSION-ab12cd"
    this.clientId = null;  // t.ex. "1"

    // Promise som resolvar när WebSocket är redo
    this.ready = new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      this.ws = ws;

      ws.onopen = () => {
        console.log("[MP] WebSocket open:", url);
        resolve();
      };

      ws.onerror = (err) => {
        console.error("[MP] WebSocket error:", err);
        reject(err);
      };

      ws.onmessage = (event) => {
        let payload;
        try {
          payload = JSON.parse(event.data);
        } catch (e) {
          console.error("[MP] Invalid JSON:", event.data);
          return;
        }

        const { event: ev, messageId, clientId, data } = payload;

        // spara sessionId/clientId när vi får vår egen joined
        if (ev === "joined" && data && data.isSelf) {
          this.sessionId = data.sessionId;
          this.clientId = clientId;
          console.log("[MP] Joined as self:", this.sessionId, this.clientId);
        }

        // skicka vidare till alla lyssnare
        this.listeners.forEach((cb) => cb(ev, messageId, clientId, data));
      };

      ws.onclose = () => {
        console.log("[MP] WebSocket closed");
      };
    });
  }

  /**
   * Skapar en session som host.
   * Resolvar med { session, clientId } när vi fått vår egen "joined".
   */
  async host() {
    await this.ready;

    this.ws.send(JSON.stringify({ cmd: "host" }));

    return new Promise((resolve, reject) => {
      const start = Date.now();

      const check = () => {
        if (this.sessionId && this.clientId) {
          resolve({
            session: this.sessionId,
            clientId: this.clientId,
          });
        } else if (Date.now() - start > 3000) {
          reject(new Error("Timeout: fick inget joined efter host()"));
        } else {
          setTimeout(check, 50);
        }
      };

      check();
    });
  }

  /**
   * Joinar en befintlig session.
   * data = valfri info om spelaren (name, färg etc)
   * Resolvar med { session, clientId } när vi fått vår egen "joined".
   */
  async join(sessionId, data = {}) {
    await this.ready;

    this.ws.send(JSON.stringify({ cmd: "join", sessionId, data }));

    return new Promise((resolve, reject) => {
      const start = Date.now();

      const check = () => {
        if (this.sessionId === sessionId && this.clientId) {
          resolve({
            session: this.sessionId,
            clientId: this.clientId,
          });
        } else if (Date.now() - start > 3000) {
          reject(new Error("Timeout: fick inget joined efter join()"));
        } else {
          setTimeout(check, 50);
        }
      };

      check();
    });
  }

  /**
   * Skickar spel-data till alla i sessionen (inkl. oss själva).
   * data är ett objekt, t.ex. { type: "direction", dir: "up" }
   */
  async game(data) {
    await this.ready;
    if (this.ws.readyState !== WebSocket.OPEN) {
      console.warn("[MP] game(): WebSocket är inte öppen");
      return;
    }

    this.ws.send(JSON.stringify({ cmd: "game", data }));
  }

  /**
   * Lyssna på inkommande events.
   * cb(event, messageId, clientId, data)
   * event ∈ "joined" | "leaved" | "game"
   * returnerar en unsubscribe-funktion.
   */
  listen(callback) {
    this.listeners.push(callback);

    return () => {
      this.listeners = this.listeners.filter((cb) => cb !== callback);
    };
  }
}