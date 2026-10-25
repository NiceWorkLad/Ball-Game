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
  // Game state: ready -> playing <-> paused -> over -> (tap) playing ...
  // ---------------------------------------------------------------------------
  let state = 'ready';
  let gameOverAt = 0;
  let bestAtStart = highScore;
  const RESTART_DELAY_MS = 600; // stops a frantic last tap from instantly restarting

  const overlayTitle = document.getElementById('overlay-title');
  const overlayScore = document.getElementById('overlay-score');
  const overlayHint = document.getElementById('overlay-hint');

  function showOverlay(title, scoreText, hint) {
    overlayTitle.innerText = title;
    overlayScore.innerText = scoreText;
    overlayScore.style.display = scoreText ? '' : 'none';
    overlayHint.innerText = hint;
    document.body.classList.add('overlay-open');
  }

  function hideOverlay() {
    document.body.classList.remove('overlay-open');
  }

  showOverlay('KEEP UP!', '', 'Tap to start');

  function startGame() {
    resetBall();
    bestAtStart = highScore;
    setScore(startScore);
    activePointers.clear();
    state = 'playing';
    hideOverlay();
  }

  function endGame() {
    state = 'over';
    gameOverAt = performance.now();
    const finalScore = Math.max(SCORE, 0);
    const newBest = finalScore > 0 && finalScore > bestAtStart;
    showOverlay(
      'GAME OVER',
      newBest ? `${finalScore} \u2014 NEW BEST!` : `Score ${finalScore}`,
      'Tap to play again'
    );
  }

  function pauseGame() {
    if (state !== 'playing') return;
    state = 'paused';
    activePointers.clear();
    showOverlay('PAUSED', '', 'Tap to resume');
  }

  function resumeGame() {
    state = 'playing';
    activePointers.clear();
    hideOverlay();
  }

  // Pause when the tab/app goes to the background (phone call, app switch, ...)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pauseGame();
  });

  // ---------------------------------------------------------------------------
  // Sound — Web Audio. Browsers only allow audio after a tap, so it is unlocked
  // on the first press and the clips are loaded then. A random clip plays per hit.
  // ---------------------------------------------------------------------------
  const MUTE_COOKIE = 'ballgame_muted';
  const SOUND_FILES = [1, 2, 3, 4, 5, 6, 7, 8].map(
    (n) => `sounds/ping pong sounds ${n}-ping-pong-64516.mp3`
  );
  const soundBuffers = [];
  let audioCtx = null;
  let muted = getCookie(MUTE_COOKIE) === '1';

  const muteButton = document.getElementById('mute');
  function renderMute() {
    muteButton.innerHTML = muted ? '&#128263;' : '&#128266;';
    muteButton.setAttribute('aria-pressed', String(muted));
    muteButton.setAttribute('aria-label', muted ? 'Unmute sound' : 'Mute sound');
  }
  renderMute();

  muteButton.addEventListener('click', () => {
    muted = !muted;
    setCookie(MUTE_COOKIE, muted ? '1' : '0');
    renderMute();
    if (!muted) unlockAudio();
  });

  function unlockAudio() {
    if (audioCtx) {
      if (audioCtx.state === 'suspended') audioCtx.resume();
      return;
    }
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    audioCtx = new AudioCtx();
    SOUND_FILES.forEach((file, i) => {
      fetch(encodeURI(file))
        .then((res) => res.arrayBuffer())
        .then((data) => new Promise((resolve, reject) => audioCtx.decodeAudioData(data, resolve, reject)))
        .then((decoded) => { soundBuffers[i] = decoded; })
        .catch(() => {}); // no sound is better than a broken game
    });
  }

  function playHitSound() {
    if (muted || !audioCtx) return;
    const loaded = soundBuffers.filter(Boolean);
    if (!loaded.length) return;

    const source = audioCtx.createBufferSource();
    source.buffer = loaded[Math.floor(Math.random() * loaded.length)];
    source.playbackRate.value = 0.95 + Math.random() * 0.15; // slight pitch variety
    const gain = audioCtx.createGain();
    gain.gain.value = 0.6;
    source.connect(gain).connect(audioCtx.destination);
    source.start(0);
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

  function resetBall() {
    ball.x = WORLD / 2;
    ball.y = WORLD / 2;
    dx = 0;
    dy = 10;
    prevX = ball.x;
    prevY = ball.y;
    ball.lastHit = -Infinity;
  }

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

    drawOffscreenArrow(x, y);
  }

  // When the ball is completely above the top of the screen, show an arrow at the
  // top edge that follows it sideways. It shrinks and fades the higher the ball is.
  function drawOffscreenArrow(x, y) {
    const above = -(y + ball.radius); // how far the ball is above the screen
    if (above <= 0) return;

    const t = Math.min(above / WORLD, 1); // 0 = just left the screen, 1 = very high
    const size = 32 - 14 * t;
    const alpha = 0.9 - 0.45 * t;
    const margin = size + 10;
    const ax = Math.min(Math.max(x, margin), WORLD - margin);
    const top = 14;

    ctx.beginPath();
    ctx.moveTo(ax, top);                       // tip, pointing up
    ctx.lineTo(ax - size, top + size * 1.1);
    ctx.lineTo(ax + size, top + size * 1.1);
    ctx.closePath();
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.fill();
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
      // The ball drops (and bounces) until the first hit, as before. Only
      // dropping it after that first hit ends the game.
      if (state === 'playing' && SCORE >= 0) endGame();
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

  // How much the sideways kick varies from hit to hit grows with the score:
  // none up to RANDOM_START, then ramping up smoothly to the full amount at RANDOM_FULL.
  const RANDOM_START = 10;
  const RANDOM_FULL = 50;

  function hitMultiplier(score) {
    const randomness = Math.min(Math.max((score - RANDOM_START) / (RANDOM_FULL - RANDOM_START), 0), 1);
    // Originally this was randomly 1 or 2 (average 1.5). That is now 1.5 +/- 0.5 * randomness,
    // so at full randomness it is exactly the original 1-or-2, and at none it is a steady 1.5.
    const swing = Math.random() < 0.5 ? -0.5 : 0.5;
    return 1.5 + swing * randomness;
  }

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
    if (event.target.closest && event.target.closest('#mute')) return;
    unlockAudio();

    if (state !== 'playing') {
      if (state === 'ready') startGame();
      else if (state === 'paused') resumeGame();
      else if (state === 'over' && performance.now() - gameOverAt > RESTART_DELAY_MS) startGame();
      return; // this tap only starts the game, it doesn't hit the ball
    }

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
    if (state !== 'playing' || now - ball.lastHit < HIT_COOLDOWN_MS) return;

    for (const p of activePointers.values()) {
      const distance = Math.hypot(p.x - ball.x, p.y - ball.y);

      if (distance <= ball.radius * 1.05) {
        dy = -14;
        dx = -(p.x - ball.x) * hitMultiplier(SCORE) / 10;
        ball.lastHit = now;
        setScore(SCORE + 1);
        playHitSound();
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

    if (state === 'ready' || state === 'paused') accumulator = 0; // frozen

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
