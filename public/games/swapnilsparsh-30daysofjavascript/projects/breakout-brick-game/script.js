// Breakout Game — script.js

// Canvas & context
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// UI refs
const scoreEl = document.getElementById('score');
const livesEl = document.getElementById('lives');
const levelEl = document.getElementById('level');
const startBtn = document.getElementById('startBtn');
const pauseBtn = document.getElementById('pauseBtn');
const mouseToggle = document.getElementById('mouseToggle');

// Game state
let score = 0;
let lives = 3;
let level = 1;
let isRunning = false;
let isPaused = false;

// Canvas size adapt (keep internal resolution fixed for gameplay)
const GAME_WIDTH = 800;
const GAME_HEIGHT = 600;
canvas.width = GAME_WIDTH;
canvas.height = GAME_HEIGHT;

// Paddle
const paddle = {
  width: 110,
  height: 14,
  x: (GAME_WIDTH - 110) / 2,
  y: GAME_HEIGHT - 40,
  speed: 8,
  dx: 0,
};

// Ball
const ball = {
  x: GAME_WIDTH / 2,
  y: GAME_HEIGHT - 60,
  radius: 9,
  speed: 5,
  dx: 5 * (Math.random() > 0.5 ? 1 : -1),
  dy: -5,
};

// Bricks configuration (changes with level)
let bricks = [];
const BRICK_PADDING = 8;
const BRICK_OFFSET_TOP = 60;
const BRICK_OFFSET_LEFT = 35;

function createBricks(levelNum) {
  bricks = [];
  // increase rows/cols based on level but clamp
  const rows = Math.min(6, 3 + Math.floor((levelNum - 1) / 1)); // e.g., level1->3 rows, level3->5 rows
  const cols = Math.min(10, 6 + Math.floor((levelNum - 1) / 2)); // more columns on higher levels
  const brickWidth = Math.floor((GAME_WIDTH - BRICK_OFFSET_LEFT * 2 - (cols - 1) * BRICK_PADDING) / cols);
  const brickHeight = 20;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = BRICK_OFFSET_LEFT + c * (brickWidth + BRICK_PADDING);
      const y = BRICK_OFFSET_TOP + r * (brickHeight + BRICK_PADDING);
      bricks.push({
        x,
        y,
        width: brickWidth,
        height: brickHeight,
        destroyed: false,
        hits: 1 + Math.floor(levelNum / 3) // bricks may take more hits on higher levels
      });
    }
  }
}

// Reset ball to paddle
function resetBall() {
  ball.x = paddle.x + paddle.width / 2;
  ball.y = paddle.y - ball.radius - 2;
  const speed = 4 + Math.min(level - 1, 6); // cap speed increase
  ball.speed = speed;
  ball.dx = speed * (Math.random() > 0.5 ? 1 : -1);
  ball.dy = -speed;
}

// Draw functions
function drawRect(x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}
function drawArc(x, y, r, color) {
  ctx.beginPath();
  ctx.fillStyle = color;
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}
function drawText(text, x, y, size = 20, align = 'left') {
  ctx.fillStyle = '#e6eef8';
  ctx.font = `${size}px Inter, Arial`;
  ctx.textAlign = align;
  ctx.fillText(text, x, y);
}

// Update and game logic
function update() {
  if (!isRunning || isPaused) return;

  // Move paddle
  paddle.x += paddle.dx;
  if (paddle.x < 0) paddle.x = 0;
  if (paddle.x + paddle.width > GAME_WIDTH) paddle.x = GAME_WIDTH - paddle.width;

  // Move ball
  ball.x += ball.dx;
  ball.y += ball.dy;

  // Wall collisions
  if (ball.x + ball.radius > GAME_WIDTH) {
    ball.x = GAME_WIDTH - ball.radius;
    ball.dx *= -1;
  } else if (ball.x - ball.radius < 0) {
    ball.x = ball.radius;
    ball.dx *= -1;
  }
  if (ball.y - ball.radius < 0) {
    ball.y = ball.radius;
    ball.dy *= -1;
  }

  // Paddle collision
  if (ball.y + ball.radius >= paddle.y &&
      ball.y + ball.radius <= paddle.y + paddle.height &&
      ball.x >= paddle.x &&
      ball.x <= paddle.x + paddle.width) {

    // reflect ball based on impact point
    const collidePoint = (ball.x - (paddle.x + paddle.width / 2));
    // normalize
    const normalized = collidePoint / (paddle.width / 2);
    // angle range ~ 60 degrees
    const maxBounce = Math.PI / 3;
    const bounceAngle = normalized * maxBounce;

    const speed = Math.sqrt(ball.dx * ball.dx + ball.dy * ball.dy) || ball.speed;
    ball.dx = speed * Math.sin(bounceAngle);
    ball.dy = -Math.abs(speed * Math.cos(bounceAngle));

    // small tweak so ball doesn't get stuck
    ball.y = paddle.y - ball.radius - 1;
  }

  // Brick collisions
  for (let b of bricks) {
    if (b.destroyed) continue;
    if (ball.x + ball.radius > b.x &&
        ball.x - ball.radius < b.x + b.width &&
        ball.y + ball.radius > b.y &&
        ball.y - ball.radius < b.y + b.height) {

      // Determine collision side to reflect appropriately
      const prevX = ball.x - ball.dx;
      const prevY = ball.y - ball.dy;
      const collidedHorizontally = !(prevX + ball.radius > b.x && prevX - ball.radius < b.x + b.width);
      if (collidedHorizontally) {
        ball.dx *= -1;
      } else {
        ball.dy *= -1;
      }

      // hit brick
      b.hits -= 1;
      if (b.hits <= 0) {
        b.destroyed = true;
        score += 10;
      } else {
        // partial damage: add smaller score
        score += 5;
      }

      // speed up slightly on every brick hit
      const speedIncrease = 0.04;
      if (ball.dx > 0) ball.dx += speedIncrease;
      else ball.dx -= speedIncrease;
      if (ball.dy > 0) ball.dy += speedIncrease;
      else ball.dy -= speedIncrease;

      break; // only one brick collision per frame
    }
  }

  // Ball below paddle (lose life)
  if (ball.y - ball.radius > GAME_HEIGHT) {
    lives -= 1;
    updateUI();
    if (lives <= 0) {
      isRunning = false;
      setTimeout(() => {
        alert(`Game Over!\nScore: ${score}\nLevel: ${level}`);
      }, 50);
    } else {
      resetBall();
      isPaused = true;
      setTimeout(() => { isPaused = false; }, 600);
    }
  }

  // Check level complete
  const allDestroyed = bricks.every(b => b.destroyed);
  if (allDestroyed) {
    // advance level
    level += 1;
    score += 100; // bonus
    updateUI();
    // create new bricks with higher difficulty
    createBricks(level);
    resetBall();
    // small pause between levels
    isPaused = true;
    setTimeout(() => { isPaused = false; }, 700);
  }

  updateUI();
}

function draw() {
  // clear
  ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

  // draw paddle
  const paddleGrad = ctx.createLinearGradient(paddle.x, 0, paddle.x + paddle.width, 0);
  paddleGrad.addColorStop(0, '#44c2ff');
  paddleGrad.addColorStop(1, '#3b82f6');
  ctx.fillStyle = paddleGrad;
  ctx.fillRect(paddle.x, paddle.y, paddle.width, paddle.height);

  // draw ball
  const ballGrad = ctx.createRadialGradient(ball.x - 3, ball.y - 3, 2, ball.x, ball.y, ball.radius);
  ballGrad.addColorStop(0, '#ffffff');
  ballGrad.addColorStop(1, '#ffd166');
  drawArc(ball.x, ball.y, ball.radius, ballGrad);

  // draw bricks
  for (let b of bricks) {
    if (b.destroyed) continue;
    // color based on hits left
    let color;
    if (b.hits >= 3) color = '#ef4444'; // red (tough)
    else if (b.hits === 2) color = '#f59e0b'; // amber
    else color = '#10b981'; // green
    // border
    ctx.fillStyle = color;
    ctx.fillRect(b.x, b.y, b.width, b.height);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.strokeRect(b.x, b.y, b.width, b.height);
  }

  // debug: draw text
  // drawText(`Score: ${score}`, 10, 26, 18);
}

// Update UI elements
function updateUI() {
  scoreEl.textContent = score;
  livesEl.textContent = lives;
  levelEl.textContent = level;
}

// Game loop
function loop() {
  update();
  draw();
  if (isRunning) requestAnimationFrame(loop);
}

// Controls
let leftPressed = false;
let rightPressed = false;

document.addEventListener('keydown', (e) => {
  if (e.code === 'ArrowLeft' || e.key === 'ArrowLeft') {
    leftPressed = true;
    paddle.dx = -paddle.speed;
  } else if (e.code === 'ArrowRight' || e.key === 'ArrowRight') {
    rightPressed = true;
    paddle.dx = paddle.speed;
  } else if (e.code === 'Space') {
    togglePause();
  }
});
document.addEventListener('keyup', (e) => {
  if (e.code === 'ArrowLeft' || e.key === 'ArrowLeft') {
    leftPressed = false;
    if (!rightPressed) paddle.dx = 0;
    else paddle.dx = paddle.speed;
  } else if (e.code === 'ArrowRight' || e.key === 'ArrowRight') {
    rightPressed = false;
    if (!leftPressed) paddle.dx = 0;
    else paddle.dx = -paddle.speed;
  }
});

// Mouse control for paddle
canvas.addEventListener('mousemove', (e) => {
  if (!mouseToggle.checked) return;
  const rect = canvas.getBoundingClientRect();
  const scaleX = GAME_WIDTH / rect.width;
  const x = (e.clientX - rect.left) * scaleX;
  paddle.x = x - paddle.width / 2;
  if (paddle.x < 0) paddle.x = 0;
  if (paddle.x + paddle.width > GAME_WIDTH) paddle.x = GAME_WIDTH - paddle.width;
});

// Buttons
startBtn.addEventListener('click', () => {
  startGame();
});
pauseBtn.addEventListener('click', () => {
  togglePause();
});

// Pause toggle
function togglePause() {
  if (!isRunning) return;
  isPaused = !isPaused;
  pauseBtn.textContent = isPaused ? 'Resume' : 'Pause';
}

// Start / Restart
function startGame() {
  // reset state
  score = 0;
  lives = 3;
  level = 1;
  isRunning = true;
  isPaused = false;
  paddle.width = 110;
  createBricks(level);
  resetBall();
  updateUI();
  pauseBtn.textContent = 'Pause';
  requestAnimationFrame(loop);
}

// initialize on load
(function init() {
  createBricks(level);
  resetBall();
  updateUI();
  draw(); // one frame
})();
