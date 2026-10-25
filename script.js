document.addEventListener('DOMContentLoaded', () => {
  // ---------------------------------------------------------------------------
  // High score (saved in a cookie for a year)
  // ---------------------------------------------------------------------------
  const HIGH_SCORE_COOKIE = 'ballgame_highscore';

  function getCookie(name) {
    const row = document.cookie.split('; ').find((r) => r.startsWith(name + '='));
    return row ? decodeURIComponent(row.split('=')[1]) : null;
  }

  function setCookie(name, value, days = 365) {
    const maxAge = days * 24 * 60 * 60;
    document.cookie = `${name}=${encodeURIComponent(value)}; max-age=${maxAge}; path=/; SameSite=Lax`;
  }

  let highScore = parseInt(getCookie(HIGH_SCORE_COOKIE), 10) || 0;

  const scoreElement = document.getElementById('score');
  const highScoreElement = document.getElementById('high-score');

  function renderHighScore(isNewBest = false) {
    highScoreElement.innerText = `BEST ${highScore}`;
    if (isNewBest) {
      // Restart the pulse animation each time a new best is set
      highScoreElement.classList.remove('new-best');
      void highScoreElement.offsetWidth;
      highScoreElement.classList.add('new-best');
    }
  }
  renderHighScore();

  // ---------------------------------------------------------------------------
  // Score
  // ---------------------------------------------------------------------------
  const startScore = -1; // first touch is the "serve", so it doesn't count
  let SCORE = startScore;

  function setScore(value) {
    SCORE = value;
    scoreElement.innerText = Math.max(SCORE, 0);

    if (SCORE > highScore) {
      highScore = SCORE;
      setCookie(HIGH_SCORE_COOKIE, highScore);
      renderHighScore(true);
    }
  }

  // ---------------------------------------------------------------------------
  // Canvas — the game runs in a fixed 800x800 "world" that is scaled to fit
  // the screen, so the ball behaves the same on a phone and on a monitor.
  // ---------------------------------------------------------------------------
  const WORLD = 800;
  const canvas = document.getElementById('game-screen');
  const ctx = canvas.getContext('2d');
  const canvasBox = document.getElementById('canvas-box');

  function resizeCanvas() {
    // Fit inside the screen on both portrait (phone) and landscape (desktop)
    const size = Math.floor(Math.min(window.innerWidth * 0.92, window.innerHeight * 0.8));
    const dpr = window.devicePixelRatio || 1;

    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    canvas.width = Math.round(size * dpr); // sharp on high-res screens
    canvas.height = Math.round(size * dpr);
    ctx.setTransform(canvas.width / WORLD, 0, 0, canvas.height / WORLD, 0, 0);

    canvasBox.style.setProperty('--board', `${size}px`);
    canvas.style.opacity = 1;
  }
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  // ---------------------------------------------------------------------------
  // Ball
  // ---------------------------------------------------------------------------
  const ball = {
    x: WORLD / 2,
    y: WORLD / 2,
    radius: 60,
    color: 'white',
    gravity: 0.2,
    bounce: 0.5,
    friction: 0.0,
    lastHit: -Infinity,
  };

  let dx = 0;
  let dy = 10;

  // Where the ball was before the latest physics step, used to draw smoothly
  // between steps (see the game loop).
  let prevX = ball.x;
  let prevY = ball.y;

  function drawBall(alpha = 1) {
    const x = prevX + (ball.x - prevX) * alpha;
    const y = prevY + (ball.y - prevY) * alpha;
    ctx.clearRect(0, 0, WORLD, WORLD);
    ctx.beginPath();
    ctx.arc(x, y, ball.radius, 0, Math.PI * 2);
    ctx.fillStyle = ball.color;
    ctx.fill();
    ctx.closePath();
  }

  function updateBallPosition() {
    ball.x += dx;
    ball.y += dy;
    dy += ball.gravity;

    // Walls
    if (ball.x + ball.radius > WORLD) {
      ball.x = WORLD - ball.radius;
      dx = -dx / 1.2;
    } else if (ball.x - ball.radius < 0) {
      ball.x = ball.radius;
      dx = -dx / 1.2;
    }

    // Floor
    if (ball.y + ball.radius >= WORLD) {
      dx *= ball.friction;
    }
    if (ball.y + ball.radius > WORLD) {
      dy = -dy * ball.bounce;
      if (SCORE !== startScore) setScore(startScore);
      ball.y = WORLD - ball.radius;
    }
    if (ball.y + ball.radius >= WORLD && Math.abs(dy) < 1) {
      dy = 0;
    }
  }

  // ---------------------------------------------------------------------------
  // Input — pointer events cover mouse, touch and pen in one go.
  // Every finger currently on the screen (or a held mouse button) can hit the ball.
  // ---------------------------------------------------------------------------
  const activePointers = new Map(); // pointerId -> { x, y } in world coords
  const HIT_COOLDOWN_MS = 200;

  function toWorld(event) {
    const rect = canvas.getBoundingClientRect();
    // getBoundingClientRect includes the white border, clientLeft/Top is its width
    const x = (event.clientX - rect.left - canvas.clientLeft) * (WORLD / canvas.clientWidth);
    const y = (event.clientY - rect.top - canvas.clientTop) * (WORLD / canvas.clientHeight);
    return { x, y };
  }

  // Hits are checked straight away on press/move as well as every physics step,
  // so a quick tap still counts even if the finger lifts before the next frame.
  window.addEventListener('pointerdown', (event) => {
    activePointers.set(event.pointerId, toWorld(event));
    checkHits(performance.now());
  });

  window.addEventListener('pointermove', (event) => {
    if (activePointers.has(event.pointerId)) {
      activePointers.set(event.pointerId, toWorld(event));
      checkHits(performance.now());
    }
  });

  const releasePointer = (event) => activePointers.delete(event.pointerId);
  window.addEventListener('pointerup', releasePointer);
  window.addEventListener('pointercancel', releasePointer);
  window.addEventListener('blur', () => activePointers.clear());

  // Stop long-press menus on mobile
  window.addEventListener('contextmenu', (event) => event.preventDefault());

  function checkHits(now) {
    if (now - ball.lastHit < HIT_COOLDOWN_MS) return;

    for (const p of activePointers.values()) {
      const distance = Math.hypot(p.x - ball.x, p.y - ball.y);

      if (distance <= ball.radius * 1.05) {
        dy = -14;
        const randomNumber = Math.floor(Math.random() * 2) + 1;
        dx = -(p.x - ball.x) * randomNumber / 10;
        ball.lastHit = now;
        setScore(SCORE + 1);
        // const audio = new Audio(`sounds/ping pong sounds 1-ping-pong-64516.mp3`);
        // audio.play(); // Need to be fixed
        return;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Game loop — physics runs in fixed 4ms steps (the original 250 ticks/sec),
  // so the speed is the same on every device and frame rate.
  // ---------------------------------------------------------------------------
  const STEP_MS = 1000 / 250;
  let lastTime = performance.now();
  let accumulator = 0;

  function loop(now) {
    // Clamp: never negative, and capped after tab switches so the ball doesn't jump
    accumulator += Math.min(Math.max(now - lastTime, 0), 100);
    lastTime = now;

    while (accumulator >= STEP_MS) {
      checkHits(now);
      prevX = ball.x;
      prevY = ball.y;
      updateBallPosition();
      accumulator -= STEP_MS;
    }

    // Draw part-way between the last two physics steps. A 60Hz screen gets 4 or 5
    // steps per frame, so without this the motion looks slightly uneven.
    drawBall(accumulator / STEP_MS);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // ---------------------------------------------------------------------------
  // Custom cursor (mouse only — hidden on touch screens via CSS)
  // ---------------------------------------------------------------------------
  const cursorDot = document.querySelector('.cursor-dot');
  const cursorOutline = document.querySelector('.cursor-outline');
  const cursor = { x: -100, y: -100, outlineX: -100, outlineY: -100 };

  window.addEventListener('pointermove', (event) => {
    if (event.pointerType !== 'mouse') return;
    cursor.x = event.clientX;
    cursor.y = event.clientY;
    cursorDot.style.transform = `translate3d(${cursor.x}px, ${cursor.y}px, 0) translate(-50%, -50%)`;
    document.body.classList.add('cursor-visible');
  });

  window.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse') document.body.classList.add('cursor-pressed');
  });
  window.addEventListener('pointerup', () => document.body.classList.remove('cursor-pressed'));
  document.documentElement.addEventListener('mouseleave', () => {
    document.body.classList.remove('cursor-visible');
  });

  // The outline trails slightly behind the dot
  function animateCursor() {
    cursor.outlineX += (cursor.x - cursor.outlineX) * 0.2;
    cursor.outlineY += (cursor.y - cursor.outlineY) * 0.2;
    cursorOutline.style.transform = `translate3d(${cursor.outlineX}px, ${cursor.outlineY}px, 0) translate(-50%, -50%)`;
    requestAnimationFrame(animateCursor);
  }
  requestAnimationFrame(animateCursor);
});
