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
      goToClimb(true); // jump straight there, rather than building every tile on the way down
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
  const screenCtx = canvas.getContext('2d');
  let ctx = screenCtx; // swapped for a tile's own context while a tile is being built (see Tiles)
  const canvasBox = document.getElementById('canvas-box');

  function resizeCanvas() {
    // Fit inside the screen on both portrait (phone) and landscape (desktop)
    const size = Math.floor(Math.min(window.innerWidth * 0.92, window.innerHeight * 0.8));
    const dpr = window.devicePixelRatio || 1;

    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    canvas.width = Math.round(size * dpr); // sharp on high-res screens
    canvas.height = Math.round(size * dpr);
    screenCtx.setTransform(canvas.width / WORLD, 0, 0, canvas.height / WORLD, 0, 0);

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

  // A low-poly cloud: a fan of lit facets with a flat, shaded underside
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
  // the climb: each hit moves the world UNITS_PER_HIT (12, about 1/67 of a board), and
  // the camera eases there so the world creeps down past the board.
  // ---------------------------------------------------------------------------
  const SECTION_H = WORLD * 2;
  const WORLD_H = SECTION_H * STAGES.length;
  const UNITS_PER_HIT = (WORLD_H - WORLD) / GOAL;
  const CAMERA_EASE_MS = 220; // how quickly the camera catches up with the climb
  let camera = climb().height; // the climb height (in hits) the camera is showing
  let lastDrawAt = performance.now();

  const cameraAlt = () => camera * UNITS_PER_HIT; // altitude of the board's bottom edge
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

  // ---------------------------------------------------------------------------
  // Drawing helpers for the world art. Everything is placed by altitude `a`, and Y(a)
  // turns that into a y on whatever is being drawn: a tile while it is being built
  // (see Tiles below) or the board itself for the live details.
  // ---------------------------------------------------------------------------
  let artTop = WORLD; // the altitude at the top edge of the canvas being drawn on
  const Y = (a) => artTop - a;
  const INK = '#3b2846'; // the street's coloured shadow

  // A hex colour lightened (amt > 0) or shaded towards ink (amt < 0), as CSS. Cached.
  const toneCache = new Map();
  function tone(c, amt = 0, ink = INK, alpha = 1) {
    const key = `${c}${amt}${ink}${alpha}`;
    let v = toneCache.get(key);
    if (!v) {
      v = css(shade(hex(c), amt, hex(ink)), alpha);
      toneCache.set(key, v);
    }
    return v;
  }
  function box(x, a, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x, Y(a + h), w, h);
  }
  function poly(pts, color) {
    ctx.beginPath();
    pts.forEach(([x, a], i) => (i ? ctx.lineTo(x, Y(a)) : ctx.moveTo(x, Y(a))));
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }
  function disc(x, a, r, color) {
    ctx.beginPath();
    ctx.arc(x, Y(a), r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }
  // A block (wall, sign, crate) with a lit face, a shaded side and a lit top edge
  function block(x, a, w, h, c, side = 'right', ink = INK) {
    box(x, a, w, h, tone(c, 0, ink));
    const sw = Math.min(w * 0.14, 24);
    box(side === 'right' ? x + w - sw : x, a, sw, h, tone(c, -0.18, ink));
    box(x, a + h - Math.min(6, h * 0.2), w, Math.min(6, h * 0.2), tone(c, 0.14, ink));
  }
  // A window: frame, glass (or warm light), a diagonal reflection, and a sill
  function pane(x, a, w, h, glass, lit = false) {
    box(x - 5, a - 5, w + 10, h + 10, tone('#f3ebe1'));
    box(x, a, w, h, tone(lit ? '#ffe08a' : glass));
    if (!lit) poly([[x, a + h * 0.35], [x + w * 0.45, a + h], [x + w * 0.75, a + h], [x, a + h * 0.05]], 'rgba(255,255,255,0.28)');
    box(x - 9, a - 12, w + 18, 9, tone('#e2d6c8', -0.05));
  }
  // A striped awning: a slanted strip of alternating facets
  function awning(x, a, w, drop, colors, n = 8) {
    const sw = w / n;
    for (let k = 0; k < n; k++) {
      const c = colors[k % colors.length];
      poly([[x + k * sw, a], [x + (k + 1) * sw, a], [x + (k + 1) * sw + 8, a - drop], [x + k * sw + 8, a - drop]], tone(c, 0.04));
      poly([[x + k * sw + 8, a - drop], [x + (k + 1) * sw + 8, a - drop], [x + (k + 1) * sw + 8, a - drop - 12], [x + k * sw + 8, a - drop - 12]], tone(c, -0.22));
    }
  }
  function label(text, x, a, size, color, align = 'center') {
    ctx.font = `700 ${size}px Outfit, "Trebuchet MS", system-ui, sans-serif`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(text, x, Y(a));
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
  }
  const cloud = (x, a, w, c, seed) => lowPolyCloud(x, Y(a), w, hex(c), hex('#8193c4'), seed);

  // The street: two rows of buildings either side of a gap of sky, from the pavement
  // up to the rooftops. Storeys get shorter going up (shops 450, flats 200), which is
  // the camera quietly zooming out.
  const LEFT = [0, 290];
  const RIGHT = [510, 800];
  const ROOF = { left: 4620, right: 4380 };
  const BRICK = { left: '#c98a6a', right: '#d9a077' };

  // ---------------------------------------------------------------------------
  // Static art: drawn once into tiles. Each layer covers altitudes from..to and is
  // only drawn into tiles that overlap it. Order matters: earlier layers are behind.
  // ---------------------------------------------------------------------------
  const STATIC_ART = [
    { name: 'far street', from: 140, to: 3800, draw() {
      for (let i = 0; i < 6; i++) {
        const x = 286 + i * 38;
        const h = 700 + hash(i, 7) * 2900;
        const c = i % 2 ? '#b8cadc' : '#c6d5e4';
        box(x, 140, 40, h, tone(c));
        for (let w = 300; w < h - 80; w += 120) box(x + 10, 140 + w, 8, 30, tone(c, 0.25));
      }
    } },

    { name: 'towers', from: 4300, to: 6460, draw() {
      const towers = [[40, 100, 5150, '#6aa6dc'], [215, 70, 5300, '#7cb3e2'], [300, 92, 5650, '#4f8fcf'],
        [520, 84, 5850, '#5b97d4'], [640, 120, 5500, '#4a86c8'], [400, 110, 6180, '#3d78bd']];
      towers.forEach(([x, w, top, c], i) => {
        box(x, 4300, w, top - 4300, tone(c));
        box(x + w * 0.66, 4300, w * 0.34, top - 4300, tone(c, -0.25, '#1b2a6e'));
        for (let f = 4360; f < top - 30; f += 60) box(x, f, w, 3, 'rgba(255,255,255,0.2)'); // 4 m floors
        for (let m = x + 14; m < x + w - 6; m += 22) box(m, 4300, 2, top - 4300, 'rgba(20,40,90,0.12)');
        poly([[x, top - 260], [x + w * 0.66, top - 120], [x + w * 0.66, top - 60], [x, top - 200]], 'rgba(255,255,255,0.18)');
        box(x - 4, top, w + 8, 10, tone(c, 0.2, '#1b2a6e'));
        if (i === 5) poly([[x + w * 0.4, top + 10], [x + w * 0.6, top + 10], [x + w * 0.5, top + 270]], tone(c, 0.1)); // spire
        if (i === 3) { // helipad
          ctx.beginPath();
          ctx.ellipse(x + w / 2, Y(top + 14), w * 0.42, 9, 0, 0, Math.PI * 2);
          ctx.fillStyle = tone('#4d5468');
          ctx.fill();
          label('H', x + w / 2, top + 15, 12, '#f2c14e');
        }
      });
      // Tower crane mast on the widest tower (the jib swings, see the live art)
      for (let s = 0; s < 260; s += 20) {
        box(676, 5500 + s, 3, 20, tone('#f2c14e'));
        box(689, 5500 + s, 3, 20, tone('#f2c14e', -0.2));
        poly([[676, 5500 + s], [679, 5500 + s], [692, 5520 + s], [689, 5520 + s]], tone('#f2c14e', -0.1));
      }
    } },

    { name: 'buildings', from: 140, to: 4800, draw() {
      [[LEFT, ROOF.left, BRICK.left, 'right'], [RIGHT, ROOF.right, BRICK.right, 'left']].forEach(([[x0, x1], top, c, side]) => {
        const w = x1 - x0;
        box(x0, 140, w, top - 140, tone(c));
        box(side === 'right' ? x1 - 26 : x0, 140, 26, top - 140, tone(c, -0.18)); // the side facing the street, in shade
        // Cornices between storeys
        [760, 1290, 1740, 2190, 2640].forEach((a) => box(x0, a, w, 12, tone(c, 0.16)));
        // Brick texture: a few darker bricks
        for (let k = 0; k < 90; k++) {
          const bx = x0 + 8 + hash(k, x0 + 3) * (w - 50);
          const ba = 800 + hash(k, x0 + 4) * (top - 900);
          box(bx, ba, 22, 9, tone(c, -0.08));
        }
        // Roof: parapet, chimneys, an aerial
        box(x0, top, w, 26, tone(c, -0.25));
        box(x0, top + 20, w, 6, tone(c, 0.1));
        block(x0 + 40, top + 26, 36, 80, '#9a6048', side);
        box(x0 + 36, top + 100, 44, 10, tone('#9a6048', -0.2));
        block(x0 + 190, top + 26, 28, 56, '#9a6048', side);
        box(x0 + 128, top + 26, 4, 150, tone('#6d5a60'));
        box(x0 + 106, top + 140, 48, 4, tone('#6d5a60'));
        box(x0 + 114, top + 164, 32, 4, tone('#6d5a60'));
      });
      // Water tank on the right-hand roof
      block(640, ROOF.right + 26, 70, 90, '#8a7d76', 'left');
      poly([[632, ROOF.right + 116], [718, ROOF.right + 116], [675, ROOF.right + 150]], tone('#8a7d76', -0.1));

      // Shopfronts (the Pavement): a café on the left, a greengrocer on the right
      pane(18, 160, 176, 300, '#9fd8f0');
      block(210, 140, 62, 270, '#5b3b2e', 'right');
      pane(222, 300, 38, 80, '#9fd8f0');
      block(8, 560, 274, 110, '#2f8f83', 'right');
      label('CAFÉ', 140, 615, 52, '#ffffff');
      awning(8, 540, 274, 48, ['#ff7a59', '#ffffff']);

      block(528, 140, 62, 270, '#3b4a7a', 'left');
      pane(540, 300, 38, 80, '#9fd8f0');
      pane(606, 160, 176, 300, '#9fd8f0');
      block(518, 560, 274, 110, '#5a5fc8', 'left');
      label('MARKET', 655, 615, 44, '#ffffff');
      awning(518, 540, 274, 48, ['#f2c14e', '#ffffff']);

      // The market floors: tall windows, little awnings, flower boxes
      [840, 1290, 1740, 2190].forEach((a0, fl) => {
        [[LEFT[0] + 40, 0], [LEFT[0] + 162, 1], [RIGHT[0] + 50, 2], [RIGHT[0] + 172, 3]].forEach(([wx, c]) => {
          pane(wx, a0 + 70, 86, 220, '#a7d3ea', hash(fl * 4 + c, 41) > 0.8);
          if ((fl + c) % 2 === 0) awning(wx - 8, a0 + 330, 102, 30, [['#ff7a59', '#2f8f83', '#f2c14e', '#5a8de0'][(fl + c) % 4], '#ffffff'], 4);
          else {
            block(wx - 6, a0 + 40, 98, 26, '#7a5a44');
            for (let k = 0; k < 5; k++) disc(wx + 6 + k * 19, a0 + 74, 10, tone(['#3fa36b', '#ff8fab', '#3fa36b', '#ffd166', '#3fa36b'][k], hash(k, fl) * 0.1));
          }
        });
      });
      // A hanging bracket sign on the left
      box(270, 1150, 64, 5, tone('#4d5468'));
      box(300, 1060, 2, 90, tone('#4d5468'));
      box(326, 1060, 2, 90, tone('#4d5468'));
      block(286, 980, 56, 80, '#ff7a59');
      disc(314, 1022, 16, tone('#ffffff'));
      // The neon sign board on the right (its glow flickers, see the live art)
      block(512, 1760, 46, 380, '#2b2140', 'left');

      // The flats: shorter storeys with balconies, plants and air-con units
      [[LEFT, ROOF.left, 0], [RIGHT, ROOF.right, 1]].forEach(([[x0, x1], top, s]) => {
        for (let fl = 0; fl < 10; fl++) {
          const a0 = 2700 + fl * 200;
          if (a0 + 120 > top - 60) break;
          for (let c = 0; c < 3; c++) {
            const wx = x0 + 26 + c * 86;
            pane(wx, a0, 54, 96, '#8fc0da', hash(fl * 3 + c, s + 5) > 0.62);
            if (c !== 1) {
              box(wx - 10, a0 - 8, 74, 8, tone('#6f6670'));
              for (let b = 0; b < 6; b++) box(wx - 8 + b * 13, a0, 3, 34, tone('#6f6670'));
              box(wx - 10, a0 + 32, 74, 4, tone('#6f6670'));
              if (hash(fl, c + 9) > 0.55) disc(wx + 46, a0 + 14, 13, tone('#3fa36b'));
            }
          }
          if (fl % 3 === 1) block(s ? x0 + 30 : x1 - 70, a0 + 116, 40, 28, '#d9dde3', s ? 'left' : 'right');
        }
      });
    } },

    { name: 'pavement', from: 0, to: 1080, draw() {
      box(0, 0, WORLD, 140, tone('#c3c7d0'));
      for (let x = 0; x < WORLD; x += 80) box(x, 0, 3, 128, tone('#c3c7d0', -0.1));
      box(0, 64, WORLD, 3, tone('#c3c7d0', -0.1));
      box(0, 128, WORLD, 14, tone('#9196a3'));
      // Lamp post at the kerb
      box(296, 140, 12, 880, tone('#4d5468'));
      box(292, 140, 20, 30, tone('#4d5468', -0.2));
      poly([[272, 1020], [332, 1020], [318, 1052], [286, 1052]], tone('#4d5468'));
      box(284, 1004, 36, 16, tone('#ffe9a8'));
      // Café table and chairs outside the café
      box(70, 300, 110, 10, tone('#ffffff', -0.05));
      box(120, 140, 8, 160, tone('#6d5a60'));
      box(96, 140, 56, 6, tone('#6d5a60'));
      [[40, 'right'], [190, 'left']].forEach(([cx, side]) => {
        box(cx, 140, 6, 140, tone('#6d5a60'));
        box(cx + 34, 140, 6, 140, tone('#6d5a60'));
        block(cx - 4, 240, 48, 10, '#2f8f83', side);
        box(side === 'right' ? cx - 4 : cx + 38, 240, 6, 110, tone('#2f8f83'));
      });
      // Fruit crates outside the greengrocer
      [[614, '#ff9f43'], [688, '#ff5f6d'], [652, '#7ed957']].forEach(([cx, fruit], k) => {
        const a = k === 2 ? 236 : 140;
        block(cx, a, 70, 90, '#b07a4f', 'left');
        for (let f = 0; f < 4; f++) disc(cx + 12 + f * 16, a + 96, 9, tone(fruit, (f % 2) * 0.12));
      });
      // Bin and bollards
      block(338, 140, 52, 86, '#3c7a5a');
      box(334, 222, 60, 10, tone('#2f6248'));
      [460, 492].forEach((x) => {
        box(x, 140, 16, 66, tone('#4d5468'));
        disc(x + 8, 206, 8, tone('#4d5468'));
      });
    } },

    { name: 'cloud bank', from: 6040, to: 7700, draw() {
      // Low cloud: the join between the Skyscrapers and the Birds & planes (it hides the zoom)
      for (let row = 0; row < 3; row++) {
        for (let i = 0; i < 9; i++) {
          const x = -40 + i * 110 + row * 40 + hash(i, row) * 30;
          cloud(x, 6200 + row * 90 + hash(i, row + 3) * 50, 230 + hash(i, row + 6) * 90, row ? '#f4f8ff' : '#e3ebf7', i + row * 9);
        }
      }
      // Higher, thinner cloud
      [[120, 6900, 200], [560, 7050, 240], [320, 7350, 180], [700, 7550, 160], [60, 7650, 140]].forEach(([x, a, w], i) => cloud(x, a, w, '#eef4ff', i + 40));
    } },

    { name: 'edge of the atmosphere', from: 7700, to: 8460, draw() {
      // The curve of the Earth, fading into the haze below it
      const R = 5200;
      const centreA = 8150 - R;
      ctx.save();
      ctx.beginPath();
      ctx.rect(-10, Y(8460), WORLD + 20, 8460 - 7700);
      ctx.clip();
      ctx.beginPath();
      ctx.arc(WORLD / 2, Y(centreA), R + 70, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(110,193,238,0.22)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(WORLD / 2, Y(centreA), R + 26, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(150,215,250,0.45)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(WORLD / 2, Y(centreA), R, 0, Math.PI * 2);
      ctx.fillStyle = tone('#1f6fb5');
      ctx.fill();
      // Land and cloud facets along the curve
      [[60, 8090, 180, '#3fa36b'], [430, 8110, 240, '#4fb27a'], [300, 8060, 90, '#c9b27a']].forEach(([x, a, w, c]) => {
        poly([[x, a], [x + w * 0.5, a + 36], [x + w, a - 8], [x + w * 0.6, a - 60], [x + 20, a - 50]], tone(c));
        poly([[x + w * 0.5, a + 36], [x + w, a - 8], [x + w * 0.6, a - 60]], tone(c, -0.15, '#123a5c'));
      });
      [[200, 8120, 120], [620, 8115, 100]].forEach(([x, a, w]) => poly([[x, a], [x + w, a + 6], [x + w * 0.8, a - 14], [x + 10, a - 10]], 'rgba(255,255,255,0.75)'));
      // Haze: the Earth fades into the sky below, so the join is soft
      const g = ctx.createLinearGradient(0, Y(7720), 0, Y(8040));
      const haze = skyAt(7720);
      g.addColorStop(0, css(haze, 1));
      g.addColorStop(1, css(haze, 0));
      ctx.fillStyle = g;
      ctx.fillRect(-10, Y(8040), WORLD + 20, 8040 - 7700);
      ctx.restore();
    } },

    { name: 'distant planets', from: 9800, to: 11000, draw() {
      lowPolyDisc(150, Y(10260), 22, hex('#e0754f'), hex('#2a0e1c'), 7, 0.3, 0.4);
      lowPolyDisc(640, Y(10820), 34, hex('#d9b38c'), hex('#2a1a1c'), 8, 0.1, 0.4);
      ctx.beginPath();
      ctx.ellipse(640, Y(10820), 58, 12, -0.25, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,214,165,0.7)';
      ctx.lineWidth = 4;
      ctx.stroke();
    } },
  ];

  // ---------------------------------------------------------------------------
  // Live art: small details drawn every frame on top of the tiles, only while on screen.
  // ---------------------------------------------------------------------------
  const still = (now, period, phase = 0) => (reducedMotion ? 0 : Math.sin(now / period + phase));
  const crossing = (now, speed, span, offset = 0) => (reducedMotion ? offset % span : (offset + now * speed) % span);

  const LIVE_ART = [
    { name: 'person', from: 0, to: 520, draw(now) {
      const px = crossing(now, 0.025, 1300, 400) - 250;
      const step = still(now, 120) * 14;
      disc(px, 470, 26, tone('#3b3355'));
      poly([[px - 30, 430], [px + 30, 430], [px + 24, 280], [px - 24, 280]], tone('#ff7a59'));
      poly([[px - 22, 282], [px - 4, 282], [px - 6 - step, 140], [px - 20 - step, 140]], tone('#3b3355'));
      poly([[px + 4, 282], [px + 22, 282], [px + 20 + step, 140], [px + 6 + step, 140]], tone('#3b3355', -0.1));
    } },
    { name: 'pigeons', from: 130, to: 200, draw(now) {
      [[400, 0], [436, 1.3]].forEach(([x, ph]) => {
        const hop = Math.max(0, still(now, 260, ph * 3)) * 10;
        disc(x, 156 + hop, 13, tone('#7b7f92'));
        disc(x + 12, 170 + hop, 7, tone('#6b6f82'));
        poly([[x + 18, 171 + hop], [x + 26, 168 + hop], [x + 18, 165 + hop]], tone('#f2c14e'));
      });
    } },
    { name: 'bunting', from: 1640, to: 2620, draw(now) {
      [1760, 2160, 2560].forEach((a, row) => {
        const sway = still(now, 700, row) * 6;
        box(290, a, 220, 2, 'rgba(60,50,70,0.5)');
        for (let k = 0; k < 9; k++) {
          const x = 290 + k * 24.5;
          const dip = Math.sin((k / 8) * Math.PI) * 40;
          poly([[x, a - dip], [x + 22, a - dip], [x + 11 + sway, a - dip - 34]], tone(['#ff7a59', '#f2c14e', '#3fb48e', '#5a8de0'][(k + row) % 4]));
        }
        if (row === 1) [330, 400, 470].forEach((x, k) => { // paper lanterns
          const dip = Math.sin(((x - 290) / 220) * Math.PI) * 40;
          box(x - 1, a - dip - 26, 2, 26, 'rgba(60,50,70,0.5)');
          disc(x + still(now, 900, k) * 3, a - dip - 48, 20, tone('#ff5f6d'));
          box(x - 12, a - dip - 70, 24, 6, tone('#2b2140'));
        });
      });
    } },
    { name: 'neon sign', from: 1760, to: 2140, draw(now) {
      const on = reducedMotion || hash(Math.floor(now / 140), 3) > 0.08;
      ['O', 'P', 'E', 'N'].forEach((ch, k) => label(ch, 535, 2080 - k * 80, 50, on ? '#7cf5ff' : 'rgba(124,245,255,0.25)'));
    } },
    { name: 'washing line', from: 3460, to: 3560, draw(now) {
      const flap = still(now, 300) * 5;
      box(290, 3550, 220, 2, tone('#5d5462'));
      [[310, '#ff8fab'], [352, '#ffffff'], [402, '#6ec1ee'], [455, '#ffd166']].forEach(([x, c], i) => {
        poly([[x, 3550], [x + 30, 3550], [x + 32 + (i % 2 ? flap : -flap), 3490], [x - 2, 3492]], tone(c));
      });
    } },
    { name: 'chimney smoke', from: ROOF.left + 100, to: ROOF.left + 420, draw(now) {
      for (let k = 0; k < 4; k++) {
        const t = reducedMotion ? k / 4 : ((now / 2600 + k / 4) % 1);
        disc(58 + t * 40, ROOF.left + 120 + t * 280, 10 + t * 22, `rgba(235,235,245,${(0.55 * (1 - t)).toFixed(3)})`);
      }
    } },
    { name: 'crane jib', from: 5700, to: 5820, draw(now) {
      ctx.save();
      ctx.translate(684, Y(5760));
      ctx.rotate(still(now, 3000) * 0.12);
      ctx.fillStyle = tone('#f2c14e');
      ctx.fillRect(-170, -8, 240, 10);
      ctx.fillStyle = tone('#f2c14e', -0.2);
      ctx.fillRect(-170, 0, 240, 3);
      ctx.fillStyle = tone('#4d5468');
      ctx.fillRect(40, -6, 26, 18); // counterweight
      ctx.fillRect(-150, 2, 2, 80);
      ctx.fillRect(-160, 82, 22, 8);
      ctx.restore();
    } },
    { name: 'warning light', from: 6440, to: 6470, draw(now) {
      const on = reducedMotion || still(now, 400) > 0;
      disc(455, 6452, 7, on ? '#ff4d4d' : '#7a2a3a');
      if (on) disc(455, 6452, 16, 'rgba(255,77,77,0.25)');
    } },
    { name: 'flocks', from: 6600, to: 7200, draw(now) {
      [[6760, 0.03, 0], [7120, 0.022, 300]].forEach(([a, s, x0]) => {
        const x = crossing(now, s, WORLD + 600, x0) - 200;
        for (let b = 0; b < 7; b++) {
          const bx = x - Math.abs(b - 3) * 28;
          const ba = a - Math.abs(b - 3) * 18;
          const wing = 8 * (reducedMotion ? 1 : Math.sin(now / 120 + b));
          poly([[bx - 14, ba + wing], [bx, ba], [bx + 14, ba + wing], [bx, ba - 4]], tone('#2c3550'));
        }
      });
    } },
    { name: 'light aircraft', from: 7320, to: 7420, draw(now) {
      const x = crossing(now, 0.05, WORLD + 500, 100) - 200;
      poly([[x - 40, 7350], [x + 40, 7350], [x + 30, 7362], [x - 36, 7362]], tone('#ff7a59'));
      poly([[x - 6, 7356], [x + 8, 7356], [x, 7394]], tone('#ff7a59', -0.2));
      poly([[x - 40, 7356], [x - 32, 7356], [x - 44, 7380]], tone('#ff7a59', -0.1));
    } },
    { name: 'airliner', from: 7700, to: 7800, draw(now) {
      const x = crossing(now, 0.07, WORLD + 900, 500) - 200;
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillRect(x - 720, Y(7748), 690, 5);
      poly([[x - 70, 7742], [x + 60, 7742], [x + 78, 7750], [x + 60, 7758], [x - 70, 7758]], tone('#ffffff'));
      poly([[x - 70, 7758], [x - 54, 7758], [x - 78, 7792]], tone('#dfe7f5'));
      poly([[x - 12, 7750], [x + 14, 7750], [x - 26, 7716]], tone('#c7d3e8'));
      box(x + 52, 7752, 10, 4, tone('#5a8de0'));
    } },
    { name: 'space station', from: 8860, to: 9040, draw(now) {
      ctx.save();
      ctx.translate(400, Y(8950));
      ctx.rotate(-0.08 + still(now, 5000) * 0.05);
      ctx.fillStyle = '#c9ced8';
      ctx.fillRect(-230, -5, 460, 10);
      [-210, -150, 150, 210].forEach((px, k) => {
        const glint = 0.15 + Math.max(0, still(now, 1600, k)) * 0.25;
        ctx.fillStyle = '#2b4c8c';
        ctx.fillRect(px - 24, -72, 48, 62);
        ctx.fillRect(px - 24, 10, 48, 62);
        ctx.fillStyle = `rgba(255,255,255,${glint.toFixed(3)})`;
        ctx.fillRect(px - 24, -72, 48, 20);
        ctx.fillRect(px - 24, 10, 48, 20);
      });
      ctx.fillStyle = '#e6e9f0';
      ctx.fillRect(-60, -18, 120, 36);
      ctx.fillStyle = '#b9bfcc';
      ctx.fillRect(-60, 6, 120, 12);
      ctx.fillStyle = '#ffc65c';
      ctx.fillRect(-14, -26, 28, 52);
      ctx.restore();
    } },
    { name: 'satellite', from: 9980, to: 10040, draw(now) {
      box(180, 10000, 30, 18, tone('#c9ced8'));
      box(140, 10004, 36, 10, tone('#2b4c8c'));
      box(214, 10004, 36, 10, tone('#2b4c8c'));
      if (reducedMotion || still(now, 500) > 0.6) disc(195, 10024, 4, '#ff4d4d');
    } },
    { name: 'comet', from: 10100, to: 10950, draw(now) {
      const k = reducedMotion ? 0.4 : (now / 9000) % 1;
      const cx = 900 - k * 1100;
      const ca = 10500 + k * 300;
      poly([[cx, ca], [cx + 260, ca - 70], [cx + 260, ca - 58]], 'rgba(180,230,255,0.35)');
      disc(cx, ca, 9, '#e8f7ff');
    } },
  ];

  // ---------------------------------------------------------------------------
  // Tiles. The static art is drawn once into board-sized tiles (one board of altitude,
  // 62.5 hits), and only around the camera:
  //  - tiles on screen are built straight away if they are not ready
  //  - tiles up to LOOKAHEAD_HITS above the board are built ahead of time, one at a
  //    time while the browser is idle (a long go climbs about 40 hits, so that is
  //    roughly one good go of warning)
  //  - tiles more than a board below or well above the camera are thrown away
  // ---------------------------------------------------------------------------
  const TILE = WORLD;
  const TILE_PAD = 4; // tiles overlap a little so no seam shows between them
  const TILE_COUNT = Math.ceil(WORLD_H / TILE);
  const LOOKAHEAD_HITS = 40;
  const MAX_TILE_SCALE = 2; // caps a tile's memory (about 10 MB) on very sharp screens
  const tiles = new Map(); // tile index -> canvas
  let tileScale = 1;
  let tileBuildQueued = false;
  const tileStats = { built: 0, msTotal: 0, msMax: 0 }; // check speed in the console: keepUpTiles
  window.keepUpTiles = { stats: tileStats, loaded: () => [...tiles.keys()].sort((a, b) => a - b) };

  function buildTile(k) {
    const started = performance.now();
    const c = document.createElement('canvas');
    c.width = Math.ceil(WORLD * tileScale);
    c.height = Math.ceil((TILE + TILE_PAD * 2) * tileScale);
    const g = c.getContext('2d');
    g.setTransform(tileScale, 0, 0, tileScale, 0, 0);
    const from = k * TILE - TILE_PAD;
    const to = (k + 1) * TILE + TILE_PAD;
    const saved = [ctx, artTop];
    ctx = g;
    artTop = to;
    STATIC_ART.forEach((layer) => { if (layer.to >= from && layer.from <= to) layer.draw(); });
    [ctx, artTop] = saved;
    tiles.set(k, c);
    const ms = performance.now() - started;
    tileStats.built++;
    tileStats.msTotal += ms;
    tileStats.msMax = Math.max(tileStats.msMax, ms);
    return c;
  }

  function setTileScale() {
    const s = Math.min(screenCtx.getTransform().a || 1, MAX_TILE_SCALE);
    if (Math.abs(s - tileScale) > 0.01) {
      tileScale = s;
      tiles.clear(); // rebuilt at the new sharpness as they are needed
    }
  }

  function manageTiles(camAlt) {
    const keepFrom = Math.floor((camAlt - TILE) / TILE);
    const keepTo = Math.floor((camAlt + WORLD + LOOKAHEAD_HITS * UNITS_PER_HIT + TILE) / TILE);
    for (const k of tiles.keys()) if (k < keepFrom || k > keepTo) tiles.delete(k);

    if (tileBuildQueued) return;
    const aheadTo = Math.min(Math.floor((camAlt + WORLD + LOOKAHEAD_HITS * UNITS_PER_HIT) / TILE), TILE_COUNT - 1);
    for (let k = Math.max(Math.floor(camAlt / TILE), 0); k <= aheadTo; k++) {
      if (tiles.has(k)) continue;
      tileBuildQueued = true;
      const build = () => {
        tileBuildQueued = false;
        if (!tiles.has(k)) buildTile(k);
      };
      if (window.requestIdleCallback) window.requestIdleCallback(build, { timeout: 500 });
      else setTimeout(build, 30);
      return; // one at a time
    }
  }

  // The Moon is a far layer: it moves more slowly than the tiles, so it can grow from a
  // small disc in the Space void to a surface filling the top of the board at 1000.
  function drawMoon(now) {
    const p = Math.min(Math.max((camera - 700) / (GOAL - 700), 0), 1);
    if (p <= 0) return;
    const r = 46 + 1454 * p ** 3;
    const bottom = 120 + 330 * p; // y of the Moon's lowest point on the board
    const cx = WORLD / 2 + 140 * (1 - p);
    const cy = bottom - r;
    const rot = reducedMotion ? 0 : now * 0.000004;
    lowPolyDisc(cx, cy, r, hex('#d9d6e3'), hex('#3a3658'), 18, rot, 0.3);
    // Craters, placed by angle and distance from the centre so they scale with the Moon
    [[0.15, 0.82, 0.07], [0.42, 0.9, 0.05], [-0.3, 0.86, 0.06], [0.05, 0.7, 0.1], [-0.1, 0.94, 0.035], [0.3, 0.74, 0.045]].forEach(([ang, d, cr]) => {
      const x = cx + Math.sin(ang) * r * d;
      const y = cy + Math.cos(ang) * r * d;
      ctx.beginPath();
      ctx.ellipse(x, y, r * cr, r * cr * 0.55, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(120,114,150,0.45)';
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(x + r * cr * 0.12, y + r * cr * 0.1, r * cr * 0.75, r * cr * 0.38, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(196,192,214,0.6)';
      ctx.fill();
    });
    // The Earth, rising small behind once you're nearly there
    if (p > 0.55) {
      const e = (p - 0.55) / 0.45;
      lowPolyDisc(110, 760 - e * 200, 34, hex('#2f86d0'), hex('#081a40'), 9, 0.2, 0.45);
      tri([92, 742 - e * 200], [124, 748 - e * 200], [104, 772 - e * 200], css(hex('#3fa36b')));
    }
  }

  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => tiles.clear());

  function drawWorld(now, camAlt) {
    const top = camAlt + WORLD;

    // Sky
    const g = ctx.createLinearGradient(0, WORLD, 0, 0);
    for (let k = 0; k <= 4; k++) g.addColorStop(k / 4, css(skyAt(camAlt + (k / 4) * WORLD)));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, WORLD, WORLD);

    // Stars, fading in above the atmosphere
    const starFrom = WORLD_H * 0.62;
    if (top > starFrom) {
      for (let i = 0; i < 160; i++) {
        const a = starFrom + hash(i, 61) * (WORLD_H - starFrom);
        if (a < camAlt - 10 || a > top + 10) continue;
        const x = hash(i, 62) * WORLD;
        const y = screenY(a, camAlt);
        const r = 2 + hash(i, 63) * 4;
        const depth = Math.min((a - starFrom) / (WORLD_H * 0.12), 1);
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

    drawMoon(now);

    // The static art, from tiles
    setTileScale();
    const first = Math.max(Math.floor((camAlt - TILE_PAD) / TILE), 0);
    const last = Math.min(Math.floor((top + TILE_PAD) / TILE), TILE_COUNT - 1);
    for (let k = first; k <= last; k++) {
      const tile = tiles.get(k) || buildTile(k);
      const tileTop = (k + 1) * TILE + TILE_PAD;
      ctx.drawImage(tile, 0, screenY(tileTop, camAlt), WORLD, TILE + TILE_PAD * 2);
    }

    // The live details on screen
    artTop = top;
    LIVE_ART.forEach((layer) => { if (layer.to >= camAlt && layer.from <= top) layer.draw(now); });

    manageTiles(camAlt);
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

    // Ease the camera towards the climb (on the landing screen it stays on the Moon)
    const target = landed ? GOAL : climb().height;
    const dt = Math.min(Math.max(now - lastDrawAt, 0), 100);
    lastDrawAt = now;
    camera += (target - camera) * (reducedMotion ? 1 : 1 - Math.exp(-dt / CAMERA_EASE_MS));
    if (Math.abs(target - camera) < 0.001) camera = target;
    const camAlt = cameraAlt();

    drawWorld(now, camAlt);

    // The ball: a plain round white ball, lit from the top left, with a hint of the sky
    const ink = mix(paletteOf(prevStageIndex).ink, paletteOf(stageIndex).ink, e);
    const tint = skyAt(camAlt + WORLD / 2);
    const r = ball.radius;
    ctx.globalAlpha = 1;
    ctx.beginPath(); // soft shadow under the ball
    ctx.arc(x + r * 0.08, y + r * 0.12, r * 1.02, 0, Math.PI * 2);
    ctx.fillStyle = css(ink, 0.16);
    ctx.fill();
    const body = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.05, x, y, r);
    body.addColorStop(0, '#ffffff');
    body.addColorStop(0.5, css(mix(WHITE, tint, 0.08)));
    body.addColorStop(1, css(mix(mix(WHITE, tint, 0.2), ink, 0.32)));
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = body;
    ctx.fill();

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
  // One finger (or a held mouse button) at a time can hit the ball.
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

    // One finger at a time: while a finger (or the mouse button) is down, any other
    // finger is ignored. A new press replaces a lifted finger's lingering tap.
    if ([...activePointers.values()].some((p) => p.releasedAt === null)) return;
    activePointers.clear();

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
