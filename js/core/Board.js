// js/core/Board.js
export class Board {
  constructor(width, height) {
    this.width = Math.floor(width);
    this.height = Math.floor(height);
    this.food = null;
  }

  randomCell() {
    return {
      x: Math.floor(Math.random() * this.width),
      y: Math.floor(Math.random() * this.height)
    };
  }

  spawnFood() {
    this.food = this.randomCell();
  }

  isOutOfBounds(x, y) {
    return x < 0 || y < 0 || x >= this.width || y >= this.height;
  }
}
