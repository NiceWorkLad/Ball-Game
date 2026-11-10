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

  // SCORE is the hits in the current go (shown on the board). The climb (below) is the
  // running total across goes.
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
  // The climb to 1000. Every hit lifts you one step up one long, continuous world, and
  // when the ball drops you keep the height you reached. The record is reaching the Moon
  // in the fewest goes. The world is 8 sections ("stages" in the code) of 125 hits each.
  // Each ball size has its own climb and its own record.
  // ---------------------------------------------------------------------------
  const GOAL = 1000;
  const STAGES = [
    { key: 'pavement', name: 'Pavement', where: 'the Pavement', at: 0 },
    { key: 'shops', name: 'Shops & market', where: 'the Shops', at: 125 },
    { key: 'apartments', name: 'Apartments', where: 'the Apartments', at: 250 },
    { key: 'skyscrapers', name: 'Skyscrapers', where: 'the Skyscrapers', at: 375 },
    { key: 'birds', name: 'Birds & planes', where: 'the Birds & planes', at: 500 },
    { key: 'station', name: 'Space station', where: 'the Space station', at: 625 },
    { key: 'void', name: 'Space void', where: 'the Space void', at: 750 },
    { key: 'moon', name: 'The Moon', where: 'the Moon', at: 875 },
  ];
  // Medals for landing on the Moon in at most this many goes
  const MEDALS = [
    { name: 'Gold', goes: 20 },
    { name: 'Silver', goes: 40 },
    { name: 'Bronze', goes: 60 },
  ];
  const medalFor = (goes) => MEDALS.find((m) => goes <= m.goes) || null;

  function stageFor(height) {
    let i = 0;
    STAGES.forEach((s, n) => { if (Math.max(height, 0) >= s.at) i = n; });
    return i;
  }

  // Saved per ball size: the climb in progress ("height:goes") and the fewest goes to the Moon
  const CLIMB_COOKIE = 'ballgame_climb';
  const MOON_COOKIE = 'ballgame_moon_goes';
  const climbs = {};
  const bestGoes = {};
  SIZES.forEach((z) => {
    const [h, g] = (getCookie(`${CLIMB_COOKIE}_${z.key}`) || '').split(':').map((v) => parseInt(v, 10));
    climbs[z.key] = { height: Math.min(Math.max(h || 0, 0), GOAL - 1), goes: Math.max(g || 0, 0) };
    bestGoes[z.key] = parseInt(getCookie(`${MOON_COOKIE}_${z.key}`), 10) || 0; // 0: never landed
  });
  const climb = () => climbs[sizeKey];
  const saveClimb = () => setCookie(`${CLIMB_COOKIE}_${sizeKey}`, `${climb().height}:${climb().goes}`);

  function newClimb() {
    climbs[sizeKey] = { height: 0, goes: 0 };
    saveClimb();
  }

  // The furthest section ever reached, per ball size (for the "NEW SECTION!" banner).
  // The old 4-stage cookies (ballgame_stage_*) meant something else, so they are ignored.
  const STAGE_COOKIE = 'ballgame_section';
  const stageCookie = (key) => `${STAGE_COOKIE}_${key}`;
  const furthestStage = {};
  SIZES.forEach((z) => {
    const saved = parseInt(getCookie(stageCookie(z.key)), 10) || 0;
    const landed = bestGoes[z.key] ? STAGES.length - 1 : 0;
    furthestStage[z.key] = Math.min(Math.max(saved, landed, stageFor(climbs[z.key].height)), STAGES.length - 1);
  });

  // Called on every hit. The first touch of a go is the serve: it starts the go
  // (and counts it) but gives no height. Every hit after that is one step up.
  let landed = false; // just reached the Moon; the landing screen is up
  function climbHit() {
    const c = climb();
    if (SCORE === 0) {
      c.goes++;
    } else {
      c.height = Math.min(c.height + 1, GOAL);
      const next = stageFor(c.height);
      if (next > stageIndex) enterStage(next);
    }
    saveClimb();
    if (c.height >= GOAL) land();
  }

  let stageIndex = stageFor(climb().height); // the section the climb is in right now
  let prevStageIndex = stageIndex;           // the one it just left (for the colour blend)
  let stageChangedAt = -Infinity;
  let newStageThisRun = false; // reached a stage never reached before (with this ball size)

  const stageBanner = document.getElementById('stage-banner');
  const stageKicker = document.getElementById('stage-kicker');
  const stageName = document.getElementById('stage-name');

  function setStage(i) {
    if (i === stageIndex) return;
    prevStageIndex = stageIndex;
    stageIndex = i;
    stageChangedAt = performance.now();
    applyPagePalette();
    updateGravity();
  }

  function enterStage(i) {
    setStage(i);
    const isNew = i > furthestStage[sizeKey];
    if (isNew) {
      furthestStage[sizeKey] = i;
      setCookie(stageCookie(sizeKey), i);
      newStageThisRun = true;
    }
    stageKicker.innerText = isNew ? 'NEW SECTION!' : `SECTION ${i + 1}`;
    stageName.innerText = STAGES[i].name.toUpperCase();
    // Restart the banner animation
    stageBanner.classList.remove('show');
    void stageBanner.offsetWidth;
    stageBanner.classList.add('show');
  }

  // The journey track on the start and game over screens: a dot per section. Eight names
  // don't fit side by side, so only the current section is named and the next one shows
  // the height it starts at. (Build step 6 turns this into a height meter.)
  const journeyList = document.getElementById('journey');
  function renderJourney(current = -1) {
    const furthest = furthestStage[sizeKey];
    journeyList.innerHTML = '';
    STAGES.forEach((s, i) => {
      const li = document.createElement('li');
      li.className = i <= furthest ? 'reached' : i === furthest + 1 ? 'next' : 'locked';
      if (i === current) li.classList.add('current');
      const label = i === current ? s.name : i === current + 1 ? `${s.at}` : '';
      li.innerHTML = '<span class="journey-dot"></span>';
      const text = document.createElement('span');
      text.className = 'journey-label';
      text.innerText = label;
      li.appendChild(text);
      li.setAttribute('aria-label', i <= furthest ? s.name : `Stage ${i + 1}, not reached yet`);
      journeyList.appendChild(li);
    });
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
  const overlayStage = document.getElementById('overlay-stage');

  // `journey` is the stage to highlight on the journey track (-1: none), or null to hide the track
  function showOverlay(title, scoreText, hint, stageText = '', journey = null) {
    overlayTitle.innerText = title;
    overlayScore.innerText = scoreText;
    overlayScore.style.display = scoreText ? '' : 'none';
    overlayStage.innerText = stageText;
    overlayStage.style.display = stageText ? '' : 'none';
    journeyList.style.display = journey === null ? 'none' : '';
    if (journey !== null) renderJourney(journey);
    overlayHint.innerText = hint;
    document.body.classList.add('overlay-open');
  }

  function hideOverlay() {
    document.body.classList.remove('overlay-open');
  }

  const plural = (n, word) => `${n} ${n === 1 ? word : word === 'go' ? 'goes' : `${word}s`}`;
  const climbText = () => `${climb().height} / ${GOAL} \u00b7 ${plural(climb().goes, 'go')}`;

  function showStartScreen() {
    const c = climb();
    if (c.height === 0 && c.goes === 0) {
      showOverlay('KEEP UP!', `Climb to the Moon: ${GOAL} hits`, 'Tap to start', 'In as few goes as you can', 0);
    } else {
      showOverlay('KEEP UP!', climbText(), 'Tap to carry on', STAGES[stageIndex].name, stageIndex);
    }
  }
  showStartScreen();

  function startGame() {
    if (landed) { // the landing screen was up: the new climb starts from the pavement
      landed = false;
      setStage(0);
    }
    resetBall();
    bestAtStart = highScore;
    newStageThisRun = false;
    setScore(startScore);
    activePointers.clear();
    setState('playing');
    hideOverlay();
  }

  // The ball dropped: this go is over, but the height is kept
  function endGame() {
    setState('over');
    gameOverAt = performance.now();
    const hits = Math.max(SCORE, 0);
    const newBest = hits > 0 && hits > bestAtStart;
    const stageText = newStageThisRun
      ? `New section: ${STAGES[stageIndex].name}!`
      : `${climb().height} / ${GOAL} \u00b7 ${STAGES[stageIndex].name}`;
    showOverlay(
      'DROPPED',
      `${plural(hits, 'hit')} this go${newBest ? ' \u2014 NEW BEST!' : ''}`,
      'Tap for the next go',
      stageText,
      stageIndex
    );
  }

  // Reached 1000: the landing screen, with the goes it took and any medal.
  // The climb is reset straight away; the camera stays on the Moon until the next tap.
  function land() {
    const goes = climb().goes;
    const best = bestGoes[sizeKey];
    const newRecord = !best || goes < best;
    if (newRecord) {
      bestGoes[sizeKey] = goes;
      setCookie(`${MOON_COOKIE}_${sizeKey}`, goes);
    }
    newClimb();
    landed = true;
    setState('over');
    gameOverAt = performance.now();
    const medal = medalFor(goes);
    let medalText = medal ? `${medal.name} medal` : `Under ${MEDALS[MEDALS.length - 1].goes} goes for a medal`;
    if (newRecord && best) medalText += ' \u00b7 NEW RECORD!';
    else if (!newRecord) medalText += ` \u00b7 record ${best}`;
    showOverlay('THE MOON!', `Landed in ${plural(goes, 'go')}`, 'Tap to climb again', medalText, STAGES.length - 1);
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

  function setMuted(value) {
    muted = value;
    setCookie(MUTE_COOKIE, muted ? '1' : '0');
    renderSettings();
    if (!muted) unlockAudio();
  }

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
    source.playbackRate.value = 0.95 + stageIndex * 0.025 + Math.random() * 0.15; // slight variety, a little higher each section
    const gain = audioCtx.createGain();
    gain.gain.value = volume / 100;
    source.connect(gain).connect(audioCtx.destination);
    source.start(0);
  }

  // ---------------------------------------------------------------------------
  // Settings — sound and ball size, saved in cookies. The art style is fixed
  // (see "Art" below), so there are no theme or font choices any more.
  // ---------------------------------------------------------------------------
  const settingsPanel = document.getElementById('settings');
  const openSettingsButton = document.getElementById('open-settings');
  const closeSettingsButton = document.getElementById('close-settings');
  const soundToggle = document.getElementById('sound-toggle');
  const volumeInput = document.getElementById('volume');
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

  SIZES.forEach((z) => {
    const b = makeChoice(sizeList, z, 'size-choice', applySize);
    const dot = Math.round(10 + (z.radius / BASE_RADIUS - 1) * 18 + 4); // grows with the ball
    b.innerHTML = `<span class="size-dot" style="width:${dot}px;height:${dot}px"></span>`
      + `<span class="size-text"><span>${z.name}</span><small></small></span>`;
  });

  // Arrow keys move between options (radio-button behaviour)
  sizeList.addEventListener('keydown', (e) => {
    const items = [...sizeList.children];
    const i = items.indexOf(document.activeElement);
    if (i < 0) return;
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const next = items[(i + step + items.length) % items.length];
    next.click();
    next.focus();
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
    soundToggle.querySelector('span').textContent = muted ? 'Off' : 'On';
    soundToggle.querySelector('use').setAttribute('href', muted ? '#i-sound-off' : '#i-sound-on');
    volumeInput.value = volume;
    volumeInput.disabled = muted;
    markChecked(sizeList, sizeKey);
    [...sizeList.children].forEach((b) => {
      b.querySelector('small').textContent = `Best ${highScores[b.dataset.key]}`;
      b.setAttribute('aria-label', `${SIZES.find((z) => z.key === b.dataset.key).name} ball, best ${highScores[b.dataset.key]}`);
    });
    const c = climb();
    const best = bestGoes[sizeKey];
    climbStatus.textContent = `${climbText()} · ${best ? `record ${plural(best, 'go')}` : 'no landing yet'}`;
    newClimbButton.disabled = c.height === 0 && c.goes === 0;
    showClimbConfirm(false);
  }

  // Starting a new climb throws away the one in progress, so it asks first
  const climbStatus = document.getElementById('climb-status');
  const newClimbButton = document.getElementById('new-climb');
  const climbConfirm = document.getElementById('climb-confirm');
  const climbConfirmText = document.getElementById('climb-confirm-text');
  function showClimbConfirm(on) {
    climbConfirm.hidden = !on;
    newClimbButton.parentElement.hidden = on;
    if (on) {
      climbConfirmText.textContent = `Lose this climb (${climbText()})? Only finished climbs count towards your record.`;
      document.getElementById('climb-cancel').focus({ preventScroll: true });
    }
  }
  newClimbButton.addEventListener('click', () => showClimbConfirm(true));
  document.getElementById('climb-cancel').addEventListener('click', () => {
    showClimbConfirm(false);
    newClimbButton.focus({ preventScroll: true });
  });
  document.getElementById('climb-restart').addEventListener('click', () => {
    newClimb();
    landed = false;
    goToClimb(true);
    renderSettings();
    newClimbButton.focus({ preventScroll: true });
  });

  // Move the board to the current climb: `snap` jumps the camera there instead of easing
  function goToClimb(snap) {
    const i = stageFor(climb().height);
    if (snap) {
      prevStageIndex = i;
      stageIndex = i;
      stageChangedAt = -Infinity;
      applyPagePalette();
      updateGravity();
      camera = climb().height;
    } else setStage(i);
    if (state === 'ready') showStartScreen();
    else if (state === 'over' && !landed) {
      showOverlay('DROPPED', climbText(), 'Tap for the next go', STAGES[stageIndex].name, stageIndex);
    }
  }

  function applySize(key) {
    sizeKey = key;
    setCookie(SIZE_COOKIE, key);
    highScore = highScores[key];
    renderHighScore();
    ball.radius = currentSize().radius;
    resetBall(); // drop the new ball from the middle so you can see its size
    landed = false;
    goToClimb(true); // this size's own climb
    renderSettings();
  }

  function openSettings() {
    if (state !== 'ready' && state !== 'over') return; // start screen and game over only
    settingsOpen = true;
    settingsPanel.hidden = false;
    document.body.classList.add('settings-open');
    renderSettings();
    settingsPanel.scrollTop = 0;
    updateScrollHints();
    soundToggle.focus({ preventScroll: true });
  }

  function closeSettings() {
    settingsOpen = false;
    settingsPanel.hidden = true;
    document.body.classList.remove('settings-open');
    openSettingsButton.focus({ preventScroll: true });
  }

  // Shading hints for the scrolling menu: a line under the title once scrolled,
  // and a fade at the bottom while there is more below
  function updateScrollHints() {
    const { scrollTop, scrollHeight, clientHeight } = settingsPanel;
    settingsPanel.classList.toggle('scrolled', scrollTop > 2);
    settingsPanel.classList.toggle('more-below', scrollTop + clientHeight < scrollHeight - 2);
  }
  settingsPanel.addEventListener('scroll', updateScrollHints, { passive: true });
  window.addEventListener('resize', () => { if (settingsOpen) updateScrollHints(); });

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

  renderSettings();

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
    spin: 0, // angle of the ball's facets; it turns as the ball moves sideways
  };

  let dx = 0;
  let dy = 10;

  // Gravity on the Moon is about a sixth of Earth's. The hit is softened to match, so
  // the ball rises just as high but hangs in the air about 2.4 times as long.
  const EARTH_GRAVITY = 0.2;
  const HIT_SPEED = 14;
  const MOON_GRAVITY_SCALE = 1 / 6;
  const onMoon = () => STAGES[stageIndex].key === 'moon';
  const hitSpeed = () => HIT_SPEED * (onMoon() ? Math.sqrt(MOON_GRAVITY_SCALE) : 1);
  function updateGravity() {
    ball.gravity = EARTH_GRAVITY * (onMoon() ? MOON_GRAVITY_SCALE : 1);
  }
  updateGravity();

  function resetBall() {
    ball.x = WORLD / 2;
    ball.y = WORLD / 2;
    dx = 0;
    dy = 10;
    prevX = ball.x;
    prevY = ball.y;
    ball.lastHit = -Infinity;
    ball.spin = 0;
    trail.length = 0;
  }

  // Where the ball was before the latest physics step, used to draw smoothly
  // between steps (see the game loop).
  let prevX = ball.x;
  let prevY = ball.y;

  // ---------------------------------------------------------------------------
  // Art — one style: minimalist, low-poly, colourful gradients, always gently moving.
  // Everything on the board is flat-shaded triangles lit from the top left. Each stage
  // has its own palette; the sky (and the page around the board) blends between them.
  // ---------------------------------------------------------------------------
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  const css = (c, alpha = 1) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${alpha})`;
  const WHITE = [255, 255, 255];
  // A steady pseudo-random number in 0..1 for (index, seed), so shapes never flicker
  const hash = (i, k) => {
    const v = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
    return v - Math.floor(v);
  };

  // Placeholder palettes for the 8 sections (build step 2 settles each one as it is drawn).
  // page: the gradient around the board; band: the colour of the section's placeholder shapes.
  const PALETTES = {
    pavement: { page: ['#3fa9e6', '#8edbc4', '#ffd27f'], ink: '#123a5c', accent: '#ff7a59', band: '#c98a6a' },
    shops: { page: ['#3a9fe0', '#7fcde8', '#ffc98a'], ink: '#1f3358', accent: '#ff7a59', band: '#f2c14e' },
    apartments: { page: ['#3a8fd8', '#6cb8ea', '#f7b39a'], ink: '#1e2d5c', accent: '#ffd166', band: '#d7a072' },
    skyscrapers: { page: ['#2f7fd0', '#4c9be0', '#9fd0f0'], ink: '#162a5a', accent: '#ffd166', band: '#4f8fcf' },
    birds: { page: ['#2a5fb8', '#3f86d8', '#8fc8f0'], ink: '#14204f', accent: '#ffe08a', band: '#f4f8ff' },
    station: { page: ['#0f1a52', '#1b2a6e', '#3a5bb0'], ink: '#060a26', accent: '#6ec1ee', band: '#c9ced8' },
    void: { page: ['#04040f', '#0b0d33', '#1a1650'], ink: '#020110', accent: '#b48cff', band: '#8f8ad0' },
    moon: { page: ['#07061c', '#1a1650', '#4a4668'], ink: '#020110', accent: '#e6e3f0', band: '#d9d6e3' },
  };
  // Pre-parse every colour once
  Object.values(PALETTES).forEach((p) => {
    Object.keys(p).forEach((k) => { p[k] = Array.isArray(p[k]) ? p[k].map(hex) : hex(p[k]); });
  });
  const paletteOf = (i) => PALETTES[STAGES[i].key];

  // The page gradient and accent colour live in CSS (they ease between stages there)
  function applyPagePalette() {
    const p = paletteOf(stageIndex);
    const root = document.documentElement.style;
    p.page.forEach((c, i) => root.setProperty(`--g${i + 1}`, css(c)));
    root.setProperty('--accent', css(p.accent));
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = `#${p.page[0].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  }
  applyPagePalette();

  const STAGE_FADE_MS = 1400;
  const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let parallaxX = WORLD / 2; // follows the ball lazily, so near layers shift a little more than far ones

  // Light comes from the top left: a direction (unit vector) facing it gets brighter
  const lit = (nx, ny) => -(nx * 0.6 + ny * 0.8);

  // Lighten towards white or darken towards the palette's own coloured shadow
  const shade = (c, amt, ink) => (amt >= 0 ? mix(c, WHITE, amt) : mix(c, ink, -amt));

  function tri(a, b, c, color) {
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.lineTo(c[0], c[1]);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.strokeStyle = color; // a hairline of the same colour hides seams between facets
    ctx.fill();
    ctx.stroke();
  }

  // A faceted disc (sun, planet, the ball): outer ring, inner ring, centre
  function lowPolyDisc(cx, cy, r, color, ink, sides = 9, rot = 0, strength = 0.28) {
    const step = (Math.PI * 2) / sides;
    const outer = [];
    const inner = [];
    for (let i = 0; i < sides; i++) {
      const a = rot + i * step;
      outer.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
      inner.push([cx + Math.cos(a + step / 2) * r * 0.56, cy + Math.sin(a + step / 2) * r * 0.56]);
    }
    const c = [cx, cy];
    const facet = (p, q, s, k) => {
      const mx = (p[0] + q[0] + s[0]) / 3 - cx;
      const my = (p[1] + q[1] + s[1]) / 3 - cy;
      const d = Math.hypot(mx, my) || 1;
      const amt = lit(mx / d, my / d) * strength * (d / r + 0.3) + (hash(k, 5) - 0.5) * 0.05;
      tri(p, q, s, css(shade(color, amt, ink)));
    };
    ctx.lineWidth = 0.8;
    for (let i = 0; i < sides; i++) {
      const j = (i + 1) % sides;
      facet(outer[i], outer[j], inner[i], i * 3);
      facet(inner[i], outer[j], inner[j], i * 3 + 1);
      facet(c, inner[i], inner[j], i * 3 + 2);
    }
  }

  // Low-poly building blocks (ridges, streets, trees, clouds). The old 4-stage scenes used
  // them; they are kept for drawing the section art in build step 2.

  // A ridge of points across the world. First and last share a height, so it tiles.
  function makeRidge(seed, count, top, bottom) {
    const pts = [];
    for (let i = 0; i <= count; i++) {
      const jitter = i > 0 && i < count ? (hash(i, seed) - 0.5) * (WORLD / count) * 0.6 : 0;
      pts.push([(i / count) * WORLD + jitter, top + hash(i % count, seed + 1) * (bottom - top)]);
    }
    return pts;
  }
  const ridgeY = (pts, x) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i];
      const [bx, by] = pts[i + 1];
      if (x >= ax && x <= bx) return ay + (by - ay) * ((x - ax) / (bx - ax));
    }
    return pts[pts.length - 1][1];
  };

  // Faceted hills or mountains: a slope facet for each ridge segment, valley facets below.
  // Peaks above `snowLine` get a snow cap.
  function drawRange(pts, color, ink, snow = null, snowLine = 0) {
    const base = WORLD + 60;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(pts[0][0] - 0.5, base); // half a pixel of overlap hides the join between tiles
    ctx.lineTo(pts[0][0] - 0.5, pts[0][1]);
    pts.forEach(([x, y]) => ctx.lineTo(x, y));
    ctx.lineTo(pts[pts.length - 1][0] + 0.5, pts[pts.length - 1][1]);
    ctx.lineTo(pts[pts.length - 1][0] + 0.5, base);
    ctx.closePath();
    ctx.fillStyle = css(shade(color, -0.06, ink));
    ctx.fill();

    const mids = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const low = Math.max(a[1], b[1]);
      mids.push([(a[0] + b[0]) / 2 + (hash(i, 9) - 0.5) * 24, low + (base - low) * 0.3]);
    }
    // The valley facet that joins this tile to the one before it. Each tile draws its own
    // (reaching back past its left edge), so no facet ever hangs over into the next tile,
    // where that tile's own base would paint over it and leave a seam.
    const last = mids.length - 1;
    tri([mids[last][0] - WORLD, mids[last][1]], pts[0], mids[0], css(shade(color, (hash(last, 11) - 0.6) * 0.12, ink)));
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const m = mids[i];
      const ex = b[0] - a[0];
      const ey = b[1] - a[1];
      const len = Math.hypot(ex, ey) || 1;
      const slope = lit(ey / len, -ex / len); // the segment's upward normal
      tri(a, b, m, css(shade(color, slope * 0.32 + 0.05, ink)));
      if (i < last) tri(m, b, mids[i + 1], css(shade(color, (hash(i, 11) - 0.6) * 0.12, ink)));
      if (snow && Math.min(a[1], b[1]) < snowLine) {
        // Snow cap: a small facet hugging the top of the slope
        const top = a[1] < b[1] ? a : b;
        const other = a[1] < b[1] ? b : a;
        const k = Math.min((snowLine - top[1]) / (other[1] - top[1] + 1), 0.6);
        const s1 = [top[0] + (other[0] - top[0]) * k, top[1] + (other[1] - top[1]) * k];
        const s2 = [top[0] + (m[0] - top[0]) * k, top[1] + (m[1] - top[1]) * k];
        tri(top, s1, s2, css(shade(snow, slope * 0.15, ink)));
      }
    }
  }

  // Draw a layer that drifts sideways and wraps around, shifted a little by the ball (parallax)
  function drifting(now, speed, depth, draw) {
    const offset = reducedMotion ? 0 : (now * speed) % WORLD;
    const shift = -offset - (parallaxX - WORLD / 2) * depth;
    for (const copy of [-WORLD, 0, WORLD]) {
      ctx.save();
      ctx.translate(copy + shift, 0);
      draw();
      ctx.restore();
    }
  }

  function lowPolyTree(x, y, h, color, ink) {
    const w = h * 0.38;
    ctx.fillStyle = css(ink, 0.55);
    ctx.fillRect(x - 2.5, y - h * 0.22, 5, h * 0.26);
    tri([x, y - h], [x - w, y - h * 0.2], [x, y - h * 0.2], css(shade(color, 0.12, ink)));
    tri([x, y - h], [x, y - h * 0.2], [x + w, y - h * 0.2], css(shade(color, -0.18, ink)));
  }

  // A row of buildings that exactly fills the world's width, so it tiles
  function makeStreet(seed, minH, maxH, roofs) {
    const out = [];
    let x = 0;
    let i = 0;
    while (x < WORLD) {
      let w = 60 + hash(i, seed) * 60;
      if (WORLD - x < 80) w = WORLD - x; // last one closes the gap
      out.push({ x, w, h: minH + hash(i, seed + 1) * (maxH - minH), peak: roofs && hash(i, seed + 2) > 0.45, i });
      x += w;
      i++;
    }
    return out;
  }

  function drawStreet(street, color, ink, windows = null) {
    ctx.lineWidth = 0.8;
    street.forEach(({ x, w, h, peak, i }) => {
      const top = WORLD - h;
      const tone = (hash(i, 21) - 0.5) * 0.1;
      ctx.fillStyle = css(shade(color, tone, ink));
      ctx.fillRect(x - 0.5, top, w + 1, h + 1);
      ctx.fillStyle = css(shade(color, tone - 0.16, ink)); // side in shadow
      ctx.fillRect(x + w * 0.7, top, w * 0.3 + 0.5, h + 1);
      if (peak) {
        const ridge = top - w * 0.42;
        tri([x, top], [x + w * 0.5, ridge], [x + w * 0.5, top], css(shade(color, tone + 0.14, ink)));
        tri([x + w * 0.5, ridge], [x + w, top], [x + w * 0.5, top], css(shade(color, tone - 0.1, ink)));
      }
      if (windows) {
        for (let r = 0; r < 4; r++) {
          for (let c = 0; c < 2; c++) {
            if (hash(i * 8 + r * 2 + c, 31) < 0.72) continue;
            ctx.fillStyle = css(windows, 0.85);
            ctx.fillRect(x + w * (0.18 + c * 0.28), top + 22 + r * 34, w * 0.14, 14);
          }
        }
      }
    });
  }

  function lowPolyCloud(cx, cy, w, color, ink, seed) {
    const n = 7;
    const top = [];
    for (let j = 0; j <= n; j++) {
      const a = Math.PI + (j / n) * Math.PI;
      const bump = j === 0 || j === n ? 1 : 0.75 + hash(j, seed) * 0.5;
      top.push([cx + Math.cos(a) * w * 0.5, cy + Math.sin(a) * w * 0.28 * bump]);
    }
    const c = [cx, cy + w * 0.06];
    ctx.lineWidth = 0.8;
    for (let j = 0; j < n; j++) {
      const mx = (top[j][0] + top[j + 1][0]) / 2 - cx;
      const my = (top[j][1] + top[j + 1][1]) / 2 - cy;
      const d = Math.hypot(mx, my) || 1;
      tri(c, top[j], top[j + 1], css(shade(color, lit(mx / d, my / d) * 0.25 - 0.04, ink)));
    }
    tri(top[0], c, top[n], css(shade(color, -0.2, ink))); // flat underside
  }

  // ---------------------------------------------------------------------------
  // The world: one tall strip, 8 sections of 2 boards each, Moon at the top. Heights
  // are "altitude" in world units, measured up from the pavement. The camera follows
  // the climb: each hit is about 1/80 of a board, and it eases there so the world
  // creeps down past the board. Until build step 2 draws the real section art, each
  // section is a band of sky with faceted placeholder shapes in its own colour.
  // ---------------------------------------------------------------------------
  const SECTION_H = WORLD * 2;
  const WORLD_H = SECTION_H * STAGES.length;
  const CAMERA_EASE_MS = 220; // how quickly the camera catches up with the climb
  let camera = climb().height; // the climb height (in hits) the camera is showing
  let lastDrawAt = performance.now();

  const cameraAlt = () => (camera / GOAL) * (WORLD_H - WORLD); // altitude of the board's bottom edge
  const screenY = (a, camAlt) => WORLD - (a - camAlt);

  // The sky from the morning street (bottom) to deep space (top)
  const SKY = [[0, '#a9dcf2'], [0.18, '#7cc6ef'], [0.42, '#4c9be0'], [0.6, '#2f63bd'], [0.68, '#1b2a6e'],
    [0.74, '#0b0d33'], [0.82, '#05061b'], [1, '#04040f']].map(([f, c]) => [f * WORLD_H, hex(c)]);
  function skyAt(a) {
    for (let i = 0; i < SKY.length - 1; i++) {
      const [a0, c0] = SKY[i];
      const [a1, c1] = SKY[i + 1];
      if (a <= a1) return mix(c0, c1, Math.min(Math.max((a - a0) / (a1 - a0), 0), 1));
    }
    return SKY[SKY.length - 1][1];
  }

  // Placeholder shapes for each section, placed once
  const PLACEHOLDERS = STAGES.map((s, i) => Array.from({ length: 14 }, (_, k) => ({
    x: 40 + hash(k, i * 7 + 1) * (WORLD - 80),
    a: i * SECTION_H + 140 + hash(k, i * 7 + 2) * (SECTION_H - 280),
    r: 18 + hash(k, i * 7 + 3) * 40,
    rot: hash(k, i * 7 + 4) * Math.PI,
  })));

  function drawWorld(now, camAlt) {
    const top = camAlt + WORLD;

    // Sky
    const g = ctx.createLinearGradient(0, WORLD, 0, 0);
    for (let k = 0; k <= 4; k++) g.addColorStop(k / 4, css(skyAt(camAlt + (k / 4) * WORLD)));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, WORLD, WORLD);

    // Stars, fading in above the atmosphere
    const starFrom = WORLD_H * 0.7;
    if (top > starFrom) {
      for (let i = 0; i < 160; i++) {
        const a = starFrom + hash(i, 61) * (WORLD_H - starFrom);
        if (a < camAlt - 10 || a > top + 10) continue;
        const x = hash(i, 62) * WORLD;
        const y = screenY(a, camAlt);
        const r = 2 + hash(i, 63) * 4;
        const depth = Math.min((a - starFrom) / (WORLD_H * 0.08), 1);
        const twinkle = reducedMotion ? 0.8 : 0.45 + 0.55 * Math.abs(Math.sin(now / 900 + i * 1.7));
        ctx.beginPath();
        ctx.moveTo(x, y - r);
        ctx.lineTo(x + r * 0.55, y);
        ctx.lineTo(x, y + r);
        ctx.lineTo(x - r * 0.55, y);
        ctx.closePath();
        ctx.fillStyle = css(WHITE, twinkle * 0.85 * depth);
        ctx.fill();
      }
    }

    // The Moon, filling the top of the last section
    const moonA = WORLD_H + 880;
    if (moonA - 1400 < top) {
      const p = PALETTES.moon;
      lowPolyDisc(WORLD / 2, screenY(moonA, camAlt), 1400, p.band, p.ink, 16, reducedMotion ? 0 : now * 0.000004, 0.25);
    }

    // Each section in view: its placeholder shapes, and a marker line where it begins
    ctx.lineWidth = 0.8;
    STAGES.forEach((s, i) => {
      const from = i * SECTION_H;
      if (from > top + 80 || from + SECTION_H < camAlt - 80) return;
      const p = paletteOf(i);
      PLACEHOLDERS[i].forEach(({ x, a, r, rot }) => {
        if (a + r < camAlt || a - r > top) return;
        ctx.globalAlpha = 0.5;
        lowPolyDisc(x, screenY(a, camAlt), r, p.band, p.ink, 4, rot, 0.4);
        ctx.globalAlpha = 1;
      });
      if (i > 0) {
        const y = screenY(from, camAlt);
        ctx.fillStyle = css(WHITE, 0.35);
        ctx.fillRect(0, y - 1, WORLD, 2);
        ctx.font = '600 22px Outfit, system-ui, sans-serif';
        ctx.fillStyle = css(WHITE, 0.6);
        ctx.fillText(`${s.at} · ${s.name.toUpperCase()}`, 24, y - 12);
      }
    });

    // The pavement: slabs and a kerb along the bottom of the world
    const groundTop = screenY(110, camAlt);
    if (groundTop < WORLD) {
      ctx.fillStyle = '#bfc3cc';
      ctx.fillRect(0, groundTop, WORLD, WORLD - groundTop + 1);
      ctx.fillStyle = '#a7abb6';
      for (let x = 0; x < WORLD; x += 80) ctx.fillRect(x, groundTop, 3, 110);
      ctx.fillStyle = '#9196a3';
      ctx.fillRect(0, groundTop, WORLD, 12);
    }
  }

  // 0 -> 1 over a stage change, eased (blends the colours used to shade the ball)
  function stageProgress(now) {
    const t = Math.min(Math.max((now - stageChangedAt) / STAGE_FADE_MS, 0), 1);
    return t * t * (3 - 2 * t);
  }

  function drawBall(alpha = 1) {
    const x = prevX + (ball.x - prevX) * alpha;
    const y = prevY + (ball.y - prevY) * alpha;
    const now = performance.now();
    const e = stageProgress(now);
    parallaxX += (Math.min(Math.max(x, 0), WORLD) - parallaxX) * 0.04;

    // Ease the camera towards the climb (on the landing screen it stays on the Moon)
    const target = landed ? GOAL : climb().height;
    const dt = Math.min(Math.max(now - lastDrawAt, 0), 100);
    lastDrawAt = now;
    camera += (target - camera) * (reducedMotion ? 1 : 1 - Math.exp(-dt / CAMERA_EASE_MS));
    if (Math.abs(target - camera) < 0.001) camera = target;
    const camAlt = cameraAlt();

    drawWorld(now, camAlt);

    // The ball: white facets with a hint of the sky, spinning as it rolls through the air
    const ink = mix(paletteOf(prevStageIndex).ink, paletteOf(stageIndex).ink, e);
    const tint = skyAt(camAlt + WORLD / 2);
    const r = ball.radius;
    ctx.globalAlpha = 1;
    ctx.beginPath(); // soft shadow under the ball
    ctx.ellipse(x + r * 0.08, y + r * 0.12, r * 1.02, r * 1.02, 0, 0, Math.PI * 2);
    ctx.fillStyle = css(ink, 0.16);
    ctx.fill();
    lowPolyDisc(x, y, r, mix(WHITE, tint, 0.12), ink, 10, ball.spin, 0.42);

    drawOffscreenArrow(x, y);
  }

  // When the ball is completely above the top of the screen, show an arrow at the
  // top edge that follows it sideways. It shrinks and fades the higher the ball is.
  function drawOffscreenArrow(x, y) {
    const above = -(y + ball.radius); // how far the ball is above the screen
    if (above <= 0) return;

    const t = Math.min(above / WORLD, 1); // 0 = just left the screen, 1 = very high
    const size = 32 - 14 * t;
    const alpha = 0.95 - 0.45 * t;
    const margin = size + 10;
    const ax = Math.min(Math.max(x, margin), WORLD - margin);
    const top = 14;
    ctx.lineWidth = 0.8;
    // Two facets, like the rest of the art
    tri([ax, top], [ax - size, top + size * 1.1], [ax, top + size * 0.8], css(WHITE, alpha));
    tri([ax, top], [ax, top + size * 0.8], [ax + size, top + size * 1.1], css(mix(WHITE, paletteOf(stageIndex).ink, 0.2), alpha));
  }

  function updateBallPosition() {
    ball.x += dx;
    ball.y += dy;
    dy += ball.gravity;
    ball.spin += dx / ball.radius;

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

  // How much the sideways kick varies from hit to hit. Within a go it grows with the
  // score: none up to RANDOM_START, ramping up to the full amount at RANDOM_FULL.
  // Each section of the climb also sets a floor that the go starts from, stepping up
  // section by section, so the sky is harder than the street from the very first hit.
  const RANDOM_START = 10;
  const RANDOM_FULL = 50;
  const SECTION_RANDOMNESS = [0, 0.1, 0.2, 0.3, 0.45, 0.6, 0.75, 0.9]; // per section, 0..1

  function hitMultiplier(score) {
    const inGo = Math.min(Math.max((score - RANDOM_START) / (RANDOM_FULL - RANDOM_START), 0), 1);
    const floor = SECTION_RANDOMNESS[stageIndex] || 0;
    const randomness = floor + (1 - floor) * inGo;
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
        dy = -hitSpeed();
        // Scaled to the ball's size, so hitting the edge of a big ball kicks it as much as a normal one
        dx = -(offset * BASE_RADIUS / ball.radius) * hitMultiplier(SCORE) / 10;
        ball.lastHit = now;
        setScore(SCORE + 1);
        playHitSound();
        climbHit(); // last: reaching 1000 ends the climb
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

  // Move the dot straight from each mouse event (no smoothing, so no lag)
  window.addEventListener('pointermove', (event) => {
    if (event.pointerType !== 'mouse') return;
    cursorDot.style.transform = `translate3d(${event.clientX}px, ${event.clientY}px, 0) translate(-50%, -50%)`;
    document.body.classList.add('cursor-visible');
  });

  window.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse') document.body.classList.add('cursor-pressed');
  });
  window.addEventListener('pointerup', () => document.body.classList.remove('cursor-pressed'));
  document.documentElement.addEventListener('mouseleave', () => {
    document.body.classList.remove('cursor-visible');
  });
});
