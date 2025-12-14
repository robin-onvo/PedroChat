// js/core/Scoreboard.js
const STORAGE_KEY = "multiplayer-snake-scoreboard";
export class Scoreboard {
  constructor(storageKey = "snake_scoreboard") {
        const raw = localStorage.getItem(STORAGE_KEY);
    this.entries = raw ? JSON.parse(raw) : [];
    this._sort();

    this.storageKey = storageKey;
    this.entries = this.load();
  }

  load() {
    try {
      return JSON.parse(localStorage.getItem(this.storageKey)) || [];
    } catch {
      return [];
    }
  }


    _sort() {
    // sortera fallande på score
    this.entries.sort((a, b) => b.score - a.score);
  }

  save() {
    localStorage.setItem(this.storageKey, JSON.stringify(this.entries));
  }

  add(name, score, localStorage) {
    this.entries.push({
      name,
      score,
      date: new Date().toISOString()
  
    });
    this.entries.sort((a, b) => b.score - a.score);
    this.save();
  }
    clear() {
    this.entries = [];
    this._save();
  }
}
