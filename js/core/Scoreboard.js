// js/core/Scoreboard.js
export class Scoreboard {
  constructor(storageKey = "snake_scoreboard") {
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
}
