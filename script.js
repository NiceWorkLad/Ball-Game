document.addEventListener('DOMContentLoaded', () => {
  // ---------------------------------------------------------------------------
  // No zooming. Two thumbs playing at once look like a pinch, and rapid taps look
  // like a double-tap, so the browser must not be allowed to zoom the page.
  // (Buttons and the settings screen, marked data-ui, are left alone so they still work.)
  // ---------------------------------------------------------------------------
  const isUI = (e) => !!(e.target.closest && e.target.closest('[data-ui]'));

  // iOS Safari's own pinch events
  ['gesturestart', 'gesturechange', 'gestureend'].forEach((name) => {
    document.addEventListener(name, (e) => e.preventDefault());
  });
  document.addEventListener('touchstart', (e) => { if (!isUI(e)) e.preventDefault(); }, { passive: false });
  document.addEventListener('touchmove', (e) => { if (!isUI(e)) e.preventDefault(); }, { passive: false });

  // Double-tap zoom: swallow the second tap of two quick taps
  let lastTouchEnd = 0;
  document.addEventListener('touchend', (e) => {
    const now = Date.now();
    if (now - lastTouchEnd < 350 && !isUI(e)) e.preventDefault();
    lastTouchEnd = now;
  }, { passive: false });

  // Safety net: if the page somehow ends up zoomed in, snap back to normal
  function resetZoom() {
    const meta = document.querySelector('meta[name="viewport"]');
    if (!meta) return;
    const original = meta.content;
    meta.content = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no';
    setTimeout(() => { meta.content = original; }, 150);
  }
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => {
      if (window.visualViewport.scale > 1.01) resetZoom();
    });
  }

  // ---------------------------------------------------------------------------
  // High score (saved in a cookie for a year)
  // ---------------------------------------------------------------------------
  const HIGH_SCORE_COOKIE = 'ballgame_highscore'; // Normal keeps the original cookie, so old bests carry over

  // Ball sizes. Normal is the original (and smallest); each size has its own best score.
  const BASE_RADIUS = 60;
  const SIZES = [
    { key: 'normal', name: 'Normal', radius: BASE_RADIUS },
    { key: 'big', name: 'Big', radius: 80 },
    { key: 'huge', name: 'Huge', radius: 100 },
  ];
  const SIZE_COOKIE = 'ballgame_size';
  const highScoreCookie = (key) => (key === 'normal' ? HIGH_SCORE_COOKIE : `${HIGH_SCORE_COOKIE}_${key}`);

  function getCookie(name) {
    const row = document.cookie.split('; ').find((r) => r.startsWith(name + '='));
    return row ? decodeURIComponent(row.split('=')[1]) : null;
  }

  function setCookie(name, value, days = 365) {
    const maxAge = days * 24 * 60 * 60;
    document.cookie = `${name}=${encodeURIComponent(value)}; max-age=${maxAge}; path=/; SameSite=Lax`;
  }

  const highScores = {};
  SIZES.forEach((z) => { highScores[z.key] = parseInt(getCookie(highScoreCookie(z.key)), 10) || 0; });
  let sizeKey = SIZES.some((z) => z.key === getCookie(SIZE_COOKIE)) ? getCookie(SIZE_COOKIE) : 'normal';
  const currentSize = () => SIZES.find((z) => z.key === sizeKey);
  let highScore = highScores[sizeKey];

  const scoreElement = document.getElementById('score');
  const highScoreElement = document.getElementById('high-score');

  function renderHighScore(isNewBest = false) {
    const size = currentSize();
    highScoreElement.innerText = size.key === 'normal'
      ? `BEST ${highScore}`
      : `${size.name.toUpperCase()} \u00b7 BEST ${highScore}`;
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
      highScores[sizeKey] = highScore;
      setCookie(highScoreCookie(sizeKey), highScore);
      renderHighScore(true);
    }
  }

  // ---------------------------------------------------------------------------
  // Game state: ready -> playing <-> paused -> over -> (tap) playing ...
  // ---------------------------------------------------------------------------
  let state = 'ready';
  function setState(next) {
    state = next;
    document.body.dataset.state = next; // e.g. the settings button only shows when "ready"
  }
  setState('ready');
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
    setState('playing');
    hideOverlay();
  }

  function endGame() {
    setState('over');
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
    setState('paused');
    activePointers.clear();
    showOverlay('PAUSED', '', 'Tap to resume');
  }

  function resumeGame() {
    setState('playing');
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
  const VOLUME_COOKIE = 'ballgame_volume';
  const savedVolume = parseInt(getCookie(VOLUME_COOKIE), 10);
  let volume = Number.isFinite(savedVolume) ? Math.min(Math.max(savedVolume, 0), 100) : 60;

  const muteButton = document.getElementById('mute');
  function renderMute() {
    muteButton.innerHTML = muted ? '&#128263;' : '&#128266;';
    muteButton.setAttribute('aria-pressed', String(muted));
    muteButton.setAttribute('aria-label', muted ? 'Unmute sound' : 'Mute sound');
  }
  renderMute();

  function setMuted(value) {
    muted = value;
    setCookie(MUTE_COOKIE, muted ? '1' : '0');
    renderMute();
    renderSettings();
    if (!muted) unlockAudio();
  }

  muteButton.addEventListener('click', () => setMuted(!muted));

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
    gain.gain.value = volume / 100;
    source.connect(gain).connect(audioCtx.destination);
    source.start(0);
  }

  // ---------------------------------------------------------------------------
  // Settings — sound, font and colour theme, all saved in cookies.
  // The themes come from the pool game: each is a block of colour tokens in styles.css.
  // ---------------------------------------------------------------------------
  const THEMES = [
    { key: 'sunset', name: 'Sunset', meta: '#FF7E5F' },
    { key: 'hall', name: 'Pool Hall', meta: '#12100e' },
    { key: 'sketch', name: 'Sketchbook', meta: '#f6f3ec' },
    { key: 'pastel', name: 'Pastel', meta: '#f6f1fa' },
    { key: 'neon', name: 'Neon Arcade', meta: '#07060d' },
    { key: 'slate', name: 'Slate', meta: '#0e131a' },
  ];
  const FONTS = [
    { key: 'oi', name: 'Oi', css: '"Oi", serif' },
    { key: 'fredoka', name: 'Fredoka', css: '"Fredoka", sans-serif' },
    { key: 'audiowide', name: 'Audiowide', css: '"Audiowide", sans-serif' },
    { key: 'caveat', name: 'Caveat', css: '"Caveat", cursive' },
    { key: 'alfa', name: 'Alfa Slab', css: '"Alfa Slab One", serif' },
    { key: 'bricolage', name: 'Bricolage', css: '"Bricolage Grotesque", sans-serif' },
  ];
  const THEME_COOKIE = 'ballgame_theme';
  const FONT_COOKIE = 'ballgame_font';
  const pick = (list, key, fallback) => (list.some((x) => x.key === key) ? key : fallback);
  let themeKey = pick(THEMES, getCookie(THEME_COOKIE), 'sunset');
  let fontKey = pick(FONTS, getCookie(FONT_COOKIE), 'oi');

  // Canvas colours, read from the theme's CSS tokens
  let ballColor = '#ffffff';
  let ballGlow = '';
  let ballStyle = 'solid'; // 'sketch' draws the ball in pencil

  const settingsPanel = document.getElementById('settings');
  const openSettingsButton = document.getElementById('open-settings');
  const closeSettingsButton = document.getElementById('close-settings');
  const soundToggle = document.getElementById('sound-toggle');
  const volumeInput = document.getElementById('volume');
  const fontList = document.getElementById('font-list');
  const themeList = document.getElementById('theme-list');
  const fontName = document.getElementById('font-name');
  const themeName = document.getElementById('theme-name');
  const sizeList = document.getElementById('size-list');
  let settingsOpen = false;

  function makeChoice(list, item, className, onPick) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `choice ${className}`;
    button.setAttribute('role', 'radio');
    button.setAttribute('aria-label', item.name);
    button.title = item.name;
    button.dataset.key = item.key;
    button.addEventListener('click', () => onPick(item.key));
    list.appendChild(button);
    return button;
  }

  FONTS.forEach((f) => {
    const b = makeChoice(fontList, f, 'font-choice', applyFont);
    b.textContent = 'Aa';
    b.style.fontFamily = f.css; // each button shows its own font
  });

  THEMES.forEach((t) => {
    const b = makeChoice(themeList, t, 'theme-choice', applyTheme);
    b.dataset.theme = t.key; // the card wears its own theme's colours
    b.innerHTML = '<span class="mini"></span>';
  });

  SIZES.forEach((z) => {
    const b = makeChoice(sizeList, z, 'size-choice', applySize);
    const dot = Math.round(10 + (z.radius / BASE_RADIUS - 1) * 18 + 4); // grows with the ball
    b.innerHTML = `<span class="size-dot" style="width:${dot}px;height:${dot}px"></span>`
      + `<span class="size-text"><span>${z.name}</span><small></small></span>`;
  });

  // Arrow keys move between options in a group (radio-button behaviour)
  [sizeList, fontList, themeList].forEach((list) => {
    list.addEventListener('keydown', (e) => {
      const items = [...list.children];
      const i = items.indexOf(document.activeElement);
      if (i < 0) return;
      const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      if (!step) return;
      e.preventDefault();
      const next = items[(i + step + items.length) % items.length];
      next.click();
      next.focus();
    });
  });

  function markChecked(list, key) {
    [...list.children].forEach((b) => {
      const on = b.dataset.key === key;
      b.setAttribute('aria-checked', String(on));
      b.tabIndex = on ? 0 : -1;
    });
  }

  function renderSettings() {
    soundToggle.setAttribute('aria-pressed', String(!muted));
    soundToggle.textContent = muted ? 'Off' : 'On';
    volumeInput.value = volume;
    volumeInput.disabled = muted;
    markChecked(sizeList, sizeKey);
    [...sizeList.children].forEach((b) => {
      b.querySelector('small').textContent = `Best ${highScores[b.dataset.key]}`;
      b.setAttribute('aria-label', `${SIZES.find((z) => z.key === b.dataset.key).name} ball, best ${highScores[b.dataset.key]}`);
    });
    markChecked(fontList, fontKey);
    markChecked(themeList, themeKey);
    fontName.textContent = FONTS.find((f) => f.key === fontKey).name;
    themeName.textContent = THEMES.find((t) => t.key === themeKey).name;
  }

  function applyTheme(key) {
    themeKey = key;
    document.documentElement.dataset.theme = key;
    setCookie(THEME_COOKIE, key);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = THEMES.find((t) => t.key === key).meta;

    const tokens = getComputedStyle(document.documentElement);
    ballColor = tokens.getPropertyValue('--ball').trim() || '#ffffff';
    const glow = tokens.getPropertyValue('--ball-glow').trim();
    ballGlow = glow && glow !== 'none' ? glow : '';
    ballStyle = tokens.getPropertyValue('--ball-style').trim() || 'solid';
    renderSettings();
  }

  function applySize(key) {
    sizeKey = key;
    setCookie(SIZE_COOKIE, key);
    highScore = highScores[key];
    renderHighScore();
    ball.radius = currentSize().radius;
    resetBall(); // drop the new ball from the middle so you can see its size
    renderSettings();
  }

  function applyFont(key) {
    fontKey = key;
    document.documentElement.style.setProperty('--font', FONTS.find((f) => f.key === key).css);
    setCookie(FONT_COOKIE, key);
    renderSettings();
  }

  function openSettings() {
    if (state !== 'ready' && state !== 'over') return; // start screen and game over only
    settingsOpen = true;
    settingsPanel.hidden = false;
    document.body.classList.add('settings-open');
    renderSettings();
    soundToggle.focus({ preventScroll: true });
  }

  function closeSettings() {
    settingsOpen = false;
    settingsPanel.hidden = true;
    document.body.classList.remove('settings-open');
    openSettingsButton.focus({ preventScroll: true });
  }

  openSettingsButton.addEventListener('click', openSettings);
  closeSettingsButton.addEventListener('click', closeSettings);
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && settingsOpen) closeSettings();
  });

  soundToggle.addEventListener('click', () => setMuted(!muted));
  volumeInput.addEventListener('input', () => {
    volume = Number(volumeInput.value);
    setCookie(VOLUME_COOKIE, volume);
  });
  volumeInput.addEventListener('change', () => { // let go of the slider: play a sample at the new volume
    unlockAudio();
    playHitSound();
  });

  applyFont(fontKey);
  applyTheme(themeKey);

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
    radius: currentSize().radius,
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
    trail.length = 0;
  }

  // Where the ball was before the latest physics step, used to draw smoothly
  // between steps (see the game loop).
  let prevX = ball.x;
  let prevY = ball.y;

  function drawBall(alpha = 1) {
    const x = prevX + (ball.x - prevX) * alpha;
    const y = prevY + (ball.y - prevY) * alpha;
    ctx.clearRect(0, 0, WORLD, WORLD);
    if (ballStyle === 'sketch') {
      drawSketchBall(x, y, ball.radius);
      drawOffscreenArrow(x, y);
      return;
    }
    ctx.beginPath();
    ctx.arc(x, y, ball.radius, 0, Math.PI * 2);
    ctx.fillStyle = ballColor;
    if (ballGlow) {
      ctx.shadowColor = ballGlow;
      ctx.shadowBlur = 40;
    }
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.closePath();

    drawOffscreenArrow(x, y);
  }

  // ---- Sketchbook pencil drawing ----
  // The wobble comes from a hash of the point's index, not the time, so lines look hand-drawn
  // but stay perfectly still (no flicker) as the ball moves.
  const wobble = (i, k) => {
    const v = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
    return (v - Math.floor(v)) * 2 - 1;
  };

  // Two pencil passes over a shape: a firm line and a lighter, slightly offset one
  function pencil(points, closed, width = 3, amp = 2.5) {
    for (let pass = 0; pass < 2; pass++) {
      ctx.beginPath();
      points.forEach(([px, py], i) => {
        const wx = px + wobble(i, pass * 2 + 1) * amp;
        const wy = py + wobble(i, pass * 2 + 2) * amp;
        if (i) ctx.lineTo(wx, wy); else ctx.moveTo(wx, wy);
      });
      if (closed) ctx.closePath();
      ctx.lineWidth = pass ? width * 0.55 : width;
      ctx.globalAlpha = pass ? 0.5 : 0.92;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.strokeStyle = ballColor;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawSketchBall(x, y, r) {
    // Pencil hatching inside the ball
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r * 0.94, 0, Math.PI * 2);
    ctx.clip();
    ctx.beginPath();
    for (let k = -2 * r; k < 2 * r; k += 12) {
      ctx.moveTo(x + k - r, y + r);
      ctx.lineTo(x + k + r, y - r);
    }
    ctx.strokeStyle = ballColor;
    ctx.lineWidth = 1.6;
    ctx.globalAlpha = 0.35;
    ctx.stroke();
    ctx.restore();

    // Outline drawn a little past a full circle, like a quick pen stroke
    const points = [];
    const steps = 26;
    for (let i = 0; i <= steps + 3; i++) {
      const a = -0.6 + (i / steps) * Math.PI * 2;
      const rr = r + wobble(i, 7) * r * 0.035;
      points.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]);
    }
    pencil(points, false, 3.4, 1.8);
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

    if (ballStyle === 'sketch') {
      ctx.save();
      ctx.globalAlpha = alpha;
      pencil([[ax, top], [ax - size, top + size * 1.1], [ax + size, top + size * 1.1]], true, 3, 1.5);
      ctx.restore();
      return;
    }

    ctx.beginPath();
    ctx.moveTo(ax, top);                       // tip, pointing up
    ctx.lineTo(ax - size, top + size * 1.1);
    ctx.lineTo(ax + size, top + size * 1.1);
    ctx.closePath();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = ballColor;
    ctx.fill();
    ctx.globalAlpha = 1;
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
  const activePointers = new Map(); // pointerId -> pointer info (see addPointer)
  const HIT_COOLDOWN_MS = 200;

  // Touch is less precise than a mouse, and the ball is fast, so touch is more forgiving:
  //  - a bigger hit area (a fingertip covers the ball it is trying to hit)
  //  - a tap counts if the ball arrives within TAP_BUFFER_MS after the finger lifts
  //  - a tap counts if the ball was there within the last LATE_TAP_MS (late taps)
  //  - a quick swipe counts even if it jumps over the ball between two move events
  const HIT_SCALE = { mouse: 1.05, pen: 1.3, touch: 1.7 }; // multiples of the ball radius
  const TAP_BUFFER_MS = 120;
  const LATE_TAP_MS = 80;
  const trail = []; // the ball's recent positions: { t, x, y }

  function distToSegment(px, py, ax, ay, bx, by) {
    const abx = bx - ax;
    const aby = by - ay;
    const len2 = abx * abx + aby * aby;
    const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / len2)) : 0;
    return Math.hypot(px - (ax + t * abx), py - (ay + t * aby));
  }

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
    if (isUI(event) || settingsOpen) return;
    unlockAudio();

    if (state !== 'playing') {
      if (state === 'ready') startGame();
      else if (state === 'paused') resumeGame();
      else if (state === 'over' && performance.now() - gameOverAt > RESTART_DELAY_MS) startGame();
      return; // this tap only starts the game, it doesn't hit the ball
    }

    const w = toWorld(event);
    activePointers.set(event.pointerId, {
      x: w.x, y: w.y,          // where the pointer is now
      px: w.x, py: w.y,        // where it was at the previous move event (for swipes)
      type: event.pointerType || 'mouse',
      releasedAt: null,        // set when a finger lifts, so the tap can stay "live" briefly
    });
    checkHits(performance.now(), true);
  });

  window.addEventListener('pointermove', (event) => {
    const p = activePointers.get(event.pointerId);
    if (p && p.releasedAt === null) {
      const w = toWorld(event);
      p.px = p.x;
      p.py = p.y;
      p.x = w.x;
      p.y = w.y;
      checkHits(performance.now());
    }
  });

  window.addEventListener('pointerup', (event) => {
    const p = activePointers.get(event.pointerId);
    if (!p) return;
    if (p.type === 'mouse') activePointers.delete(event.pointerId);
    else p.releasedAt = performance.now(); // a lifted finger's tap lingers for TAP_BUFFER_MS
  });
  window.addEventListener('pointerup', unlockAudio); // on touch, audio is only allowed once a finger lifts
  window.addEventListener('pointercancel', (event) => activePointers.delete(event.pointerId));
  window.addEventListener('blur', () => activePointers.clear());

  // Stop long-press menus on mobile
  window.addEventListener('contextmenu', (event) => event.preventDefault());

  // `fresh` is true only at the moment of a new press, which is when a "late" tap is judged.
  function checkHits(now, fresh = false) {
    if (state !== 'playing') return;

    // Forget taps whose grace period has run out
    for (const [id, p] of activePointers) {
      if (p.releasedAt !== null && now - p.releasedAt > TAP_BUFFER_MS) activePointers.delete(id);
    }

    if (now - ball.lastHit < HIT_COOLDOWN_MS) return;

    for (const p of activePointers.values()) {
      // The extra reach is a fixed margin around the ball, so bigger balls don't get a giant hit area
      const reach = ball.radius + BASE_RADIUS * ((HIT_SCALE[p.type] || HIT_SCALE.mouse) - 1);

      let hit = distToSegment(ball.x, ball.y, p.px, p.py, p.x, p.y) <= reach;

      // Late tap: the finger came down just after the ball passed where it landed
      if (!hit && fresh && p.type === 'touch') {
        hit = trail.some((t) => t.t >= now - LATE_TAP_MS && Math.hypot(p.x - t.x, p.y - t.y) <= reach);
      }

      if (hit) {
        // Keep the sideways kick in the same range as a mouse hit, however wide the hit area
        const limit = ball.radius * HIT_SCALE.mouse;
        const offset = Math.max(-limit, Math.min(limit, p.x - ball.x));
        dy = -14;
        // Scaled to the ball's size, so hitting the edge of a big ball kicks it as much as a normal one
        dx = -(offset * BASE_RADIUS / ball.radius) * hitMultiplier(SCORE) / 10;
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
      trail.push({ t: now, x: ball.x, y: ball.y });
      accumulator -= STEP_MS;
    }
    while (trail.length && trail[0].t < now - 250) trail.shift();

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
