// js/core/Snake.js
export class Snake {
  constructor(x, y, color = "#4CAF50", name = "Player") {
    this.name = name;
    this.color = color;
    this.segments = [
      { x, y },
      { x: x - 1, y }
    ];
    this.direction = "right";
    this.pendingDirection = "right";
    this.score = 0;
    this.alive = true;
  }

  get head() {
    return this.segments[0];
  }

  setDirection(dir) {
    const opposites = { up: "down", down: "up", left: "right", right: "left" };
    if (dir !== opposites[this.direction]) {
      this.pendingDirection = dir;
    }
  }

  move(grow = false) {
    this.direction = this.pendingDirection;

    const { x, y } = this.head;
    let newHead = { x, y };

    if (this.direction === "up") newHead.y--;
    if (this.direction === "down") newHead.y++;
    if (this.direction === "left") newHead.x--;
    if (this.direction === "right") newHead.x++;

    this.segments.unshift(newHead);
    if (!grow) {
      this.segments.pop();
    }
  }

  collidesWithSelf() {
    const [head, ...body] = this.segments;
    return body.some(seg => seg.x === head.x && seg.y === head.y);
  }

  reset(x, y) {
    this.segments = [
      { x, y },
      { x: x - 1, y }
    ];
    this.direction = "right";
    this.pendingDirection = "right";
    this.score = 0;
    this.alive = true;
  }
}
