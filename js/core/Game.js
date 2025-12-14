// js/core/Game.js
import { Board } from "./Board.js";

export class Game {
  constructor({ ctx, cellSize = 20, tickMs = 120 }) {
    this.ctx = ctx;
    this.cellSize = cellSize;
    this.tickMs = tickMs;

    this.board = new Board(
      ctx.canvas.width / cellSize,
      ctx.canvas.height / cellSize
    );

    this.snakes = [];
    this.intervalId = null;



    // sätts utifrån main.js
    this.onSnakeDeath = null;

 /*   this.matchTime = 60;
this.onMatchEnd = null;
this.timeLeft = this.matchTime;

const MATCH_TIME = 60;
let matchTimerId = null;
let isHost = false;          // används i multiplayer
const timerEl = document.getElementById("timer"); */

  }

  

  _handleSnakeDeath(snake) {
    if (this.onSnakeDeath) {
      this.onSnakeDeath(snake);


    }
    // resetta ormen till en rimlig startposition

  
  const maxX = this.board.width;   // eller cols, beroende på din Board
  const maxY = this.board.height;  // eller rows
  const x = Math.floor(Math.random() * maxX);
  const y = Math.floor(Math.random() * maxY);
    snake.reset(x, y);

  }
  
  addSnake(snake) {
    this.snakes.push(snake);
  }

  start() {
    this.board.spawnFood();



    if (this.intervalId) clearInterval(this.intervalId);
    this.intervalId = setInterval(() => this.tick(), this.tickMs);


  





  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
   // clearInterval(this.timerId);
  }




_startTimer() {
  this.timerId = setInterval(() => {
    this.timeLeft--;

    // Uppdatera UI (om du har t.ex. <div id="timer">)
    const el = document.getElementById("timer");
    if (el) el.textContent = `Tid kvar: ${this.timeLeft}s`;

    if (this.timeLeft <= 0) {
      clearInterval(this.timerId);
      if (this.onMatchEnd) this.onMatchEnd();
      this.stop();
    }
  }, 1000);
}





  tick() {
    // 1. Flytta alla ormar, hantera vägg + egen kropp
    for (const snake of this.snakes) {
      const willEat =
        this.board.food &&
        snake.head.x === this.board.food.x &&
        snake.head.y === this.board.food.y;

      snake.move(willEat);

      if (willEat) {
        snake.score++;
        this.board.spawnFood();
      }

      // vägg-kollision
      if (this.board.isOutOfBounds(snake.head.x, snake.head.y)) {
        this._handleSnakeDeath(snake);
        continue;
      }

      // egen kropp-kollision
      if (snake.collidesWithSelf()) {
        this._handleSnakeDeath(snake);
        continue;
      }
    }

    // 2. Kollision mellan TVÅ ORMAR
    //    "den som kör in i den andra förlorar"
    for (const snake of this.snakes) {
      for (const other of this.snakes) {
        if (snake === other) continue;

        const head = snake.head;
        for (const seg of other.segments) {
          if (head.x === seg.x && head.y === seg.y) {
            this._handleSnakeDeath(snake);
            break;
          }
        }
      }
    }

    // 3. Render
    this.render();
  
  }
  render() {
    const c = this.ctx;
    const s = this.cellSize;

    c.clearRect(0, 0, c.canvas.width, c.canvas.height);

    // mat
    if (this.board.food) {
      c.fillStyle = "red";
      c.fillRect(
        this.board.food.x * s,
        this.board.food.y * s,
        s,
        s
      );
    }

    // ormar
    for (const snake of this.snakes) {
      c.fillStyle = snake.color;
      for (const seg of snake.segments) {
        c.fillRect(seg.x * s, seg.y * s, s, s);
      }
    }
  }
  
}