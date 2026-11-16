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
    if (SCORE > 0) { // a little pop on every hit
      scoreElement.classList.remove('pop');
      void scoreElement.offsetWidth;
      scoreElement.classList.add('pop');
    }

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
  // Art — one style: flat, colourful shapes with soft gradients, glows and warm shadows,
  // lit from the top left and always gently moving. Each section has its own palette for
  // the page around the board, taken from its sky.
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

  // Per-section colours. page: the gradient around the board (set from the sky further
  // down); ink: the shadow colour; accent: buttons and the sparks when the ball is hit.
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
  const clamp01 = (v) => Math.min(Math.max(v, 0), 1);

  // The sky: a warm morning glow at street level, blue above, then into deep space
  const SKY = [[0, '#ffe3c0'], [0.035, '#d3ebf4'], [0.1, '#a3d8f3'], [0.2, '#77c2ee'], [0.42, '#4a98e0'],
    [0.58, '#2f63bd'], [0.66, '#1b2a6e'], [0.73, '#0b0d33'], [0.82, '#05061b'], [1, '#04040f']].map(([f, c]) => [f * WORLD_H, hex(c)]);
  function skyAt(a) {
    for (let i = 0; i < SKY.length - 1; i++) {
      const [a0, c0] = SKY[i];
      const [a1, c1] = SKY[i + 1];
      if (a <= a1) return mix(c0, c1, clamp01((a - a0) / (a1 - a0)));
    }
    return SKY[SKY.length - 1][1];
  }

  // The page around the board takes its colours from the sky of the section you're in
  STAGES.forEach((s, i) => {
    const p = PALETTES[s.key];
    const low = skyAt(i * SECTION_H + WORLD * 0.5);
    const high = skyAt((i + 1) * SECTION_H);
    p.page = [mix(high, p.ink, 0.3), mix(low, high, 0.5), mix(low, WHITE, 0.14)];
  });
  PALETTES.pavement.page[2] = hex('#ffd9a8');
  applyPagePalette();

  // ---------------------------------------------------------------------------
  // Drawing helpers for the world art. Everything is placed by altitude `a`, and Y(a)
  // turns that into a y on whatever is being drawn: a tile while it is being built
  // (see Tiles below) or the board itself for the live details. Light comes from the
  // top left, and shadows are a warm plum rather than grey.
  // ---------------------------------------------------------------------------
  let artTop = WORLD; // the altitude at the top edge of the canvas being drawn on
  const Y = (a) => artTop - a;
  const INK = '#3b2846'; // the street's coloured shadow
  const NAVY = '#1b2a6e'; // shadow colour for glass and sky things
  const SH = (alpha) => `rgba(59,40,70,${alpha})`;

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
  // A box with a vertical gradient: `top` colour at the top edge, `bottom` at the bottom
  function vbox(x, a, w, h, top, bottom) {
    const g = ctx.createLinearGradient(0, Y(a + h), 0, Y(a));
    g.addColorStop(0, top);
    g.addColorStop(1, bottom);
    ctx.fillStyle = g;
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
  // A soft glow: rgb is 'r,g,b'. glowAt takes a y on the canvas, glow an altitude.
  function glowAt(x, y, r, rgb, alpha) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${rgb},${alpha})`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const glow = (x, a, r, rgb, alpha) => glowAt(x, Y(a), r, rgb, alpha);
  // The soft shadow something casts on the wall below it: darkest at altitude a, fading down
  const shadowUnder = (x, a, w, depth, alpha = 0.22) => vbox(x, a - depth, w, depth, SH(alpha), SH(0));
  // The soft shadow where something stands on the pavement
  function standsOn(x, w) {
    ctx.beginPath();
    ctx.ellipse(x, Y(138), w / 2, 7, 0, 0, Math.PI * 2);
    ctx.fillStyle = SH(0.22);
    ctx.fill();
  }
  // A ball lit from the top left (planets, the little Earth). y is on the canvas.
  function sphereAt(x, y, r, light, dark) {
    const g = ctx.createRadialGradient(x - r * 0.4, y - r * 0.45, r * 0.05, x - r * 0.1, y - r * 0.1, r * 1.15);
    g.addColorStop(0, light);
    g.addColorStop(1, dark);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
  }
  // A soft organic outline (continents, the Moon's seas). Leaves the path open to fill.
  function blobPath(cx, cy, rx, ry, seed, n = 9) {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2;
      const k = 0.72 + hash(i, seed) * 0.4;
      pts.push([cx + Math.cos(ang) * rx * k, cy + Math.sin(ang) * ry * k]);
    }
    const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    let m = mid(pts[n - 1], pts[0]);
    ctx.beginPath();
    ctx.moveTo(m[0], m[1]);
    for (let i = 0; i < n; i++) {
      m = mid(pts[i], pts[(i + 1) % n]);
      ctx.quadraticCurveTo(pts[i][0], pts[i][1], m[0], m[1]);
    }
    ctx.closePath();
  }
  // A puffy cloud with a flat base at y (on the canvas), white on top and shaded underneath
  function puff(x, y, w, seed, alpha = 1, under = '#b9cbed') {
    const n = 4 + Math.floor(hash(seed, 11) * 3);
    const h = w * 0.3;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.rect(x - w, y - w, w * 2, w);
    ctx.clip();
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const r = (w / n) * (0.7 + hash(i, seed) * 0.45) * (0.7 + 0.75 * Math.sin(t * Math.PI));
      const px = x - w * 0.42 + t * w * 0.84;
      ctx.moveTo(px + r, y - r * 0.35);
      ctx.arc(px, y - r * 0.35, r, 0, Math.PI * 2);
    }
    ctx.rect(x - w * 0.42, y - h * 0.3, w * 0.84, h * 0.3);
    const g = ctx.createLinearGradient(0, y - h * 1.6, 0, y);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.55, '#f2f6ff');
    g.addColorStop(1, under);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.restore();
  }
  // A block (wall, sign, crate) with a lit face, a shaded side and a lit top edge
  function block(x, a, w, h, c, side = 'right', ink = INK) {
    vbox(x, a, w, h, tone(c, 0.06, ink), tone(c, -0.06, ink));
    const sw = Math.min(w * 0.14, 24);
    box(side === 'right' ? x + w - sw : x, a, sw, h, tone(c, -0.2, ink));
    box(x, a + h - Math.min(6, h * 0.2), w, Math.min(6, h * 0.2), tone(c, 0.2, ink));
  }
  // A window: frame, glass reflecting the sky (or warm light and curtains), glazing bars
  // and a sill. `plain` leaves out the bars, for shop windows.
  function pane(x, a, w, h, glass, lit = false, plain = false) {
    const frame = tone('#f7f0e7');
    if (lit) glow(x + w / 2, a + h / 2, Math.max(w, h) * 1.05, '255,214,130', 0.3);
    box(x - 6, a - 6, w + 12, h + 12, frame);
    if (lit) {
      vbox(x, a, w, h, '#fff3c9', '#ffc66b');
      poly([[x, a + h], [x + w * 0.4, a + h], [x + w * 0.12, a + h * 0.3], [x, a + h * 0.25]], 'rgba(255,255,255,0.5)');
      poly([[x + w, a + h], [x + w * 0.6, a + h], [x + w * 0.88, a + h * 0.3], [x + w, a + h * 0.25]], 'rgba(255,255,255,0.5)');
    } else {
      vbox(x, a, w, h, tone(glass, 0.3), tone(glass, -0.22, '#2b4c8c'));
      poly([[x, a + h * 0.3], [x + w * 0.5, a + h], [x + w * 0.78, a + h], [x, a]], 'rgba(255,255,255,0.3)');
      poly([[x + w * 0.62, a], [x + w, a + h * 0.55], [x + w, a + h * 0.4], [x + w * 0.74, a]], 'rgba(255,255,255,0.16)');
    }
    vbox(x, a + h - 12, w, 12, 'rgba(40,30,70,0.28)', 'rgba(40,30,70,0)'); // the frame's shadow on the glass
    if (!plain) {
      box(x + w / 2 - 1.5, a, 3, h, frame);
      if (h > 150) box(x, a + h * 0.64, w, 3, frame);
    }
    shadowUnder(x - 10, a - 14, w + 20, 16, 0.22);
    box(x - 10, a - 14, w + 20, 9, tone('#efe5d8'));
    box(x - 10, a - 8, w + 20, 3, 'rgba(255,255,255,0.5)');
  }
  // A striped awning with a scalloped edge and the shadow it casts
  function awning(x, a, w, drop, colors, n = 8) {
    const sw = w / n;
    shadowUnder(x + 8, a - drop - 8, w, 54, 0.28);
    for (let k = 0; k < n; k++) {
      const c = colors[k % colors.length];
      const x0 = x + k * sw;
      poly([[x0, a], [x0 + sw, a], [x0 + sw + 8, a - drop], [x0 + 8, a - drop]], tone(c, 0.05));
      box(x0 + 8, a - drop - 9, sw, 9, tone(c, -0.18));
      disc(x0 + 8 + sw / 2, a - drop - 9, sw / 2, tone(c, -0.18));
    }
    box(x, a - 3, w, 3, 'rgba(255,255,255,0.4)');
  }
  function label(text, x, a, size, color, shadow = true) {
    ctx.font = `700 ${size}px Outfit, "Trebuchet MS", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (shadow) {
      ctx.fillStyle = SH(0.35);
      ctx.fillText(text, x + 2, Y(a) + 3);
    }
    ctx.fillStyle = color;
    ctx.fillText(text, x, Y(a));
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
  }
  // A leafy bush: a few overlapping discs, lighter towards the light
  function bush(x, a, r, c = '#3fa36b') {
    disc(x + r * 0.5, a - r * 0.1, r * 0.8, tone(c, -0.18));
    disc(x - r * 0.5, a, r * 0.75, tone(c, -0.05));
    disc(x, a + r * 0.3, r, tone(c));
    disc(x - r * 0.3, a + r * 0.55, r * 0.5, tone(c, 0.2));
  }

  // The street: two rows of buildings either side of a gap of sky, from the pavement
  // up to the rooftops. Storeys get shorter going up (shops 450, flats 200), which is
  // the camera quietly zooming out.
  const LEFT = [0, 290];
  const RIGHT = [510, 800];
  const ROOF = { left: 4620, right: 4380 };
  const BRICK = { left: '#c98a6a', right: '#dba27a' };

  // ---------------------------------------------------------------------------
  // Static art: drawn once into tiles. Each layer covers altitudes from..to and is
  // only drawn into tiles that overlap it. Order matters: earlier layers are behind.
  // ---------------------------------------------------------------------------
  const STATIC_ART = [
    { name: 'morning sun', from: 0, to: 1500, draw() {
      // Low sun at the end of the street, behind the far buildings
      glow(400, 560, 900, '255,226,170', 0.55);
      glow(400, 560, 260, '255,244,214', 0.9);
      disc(400, 560, 74, '#fffaf0');
    } },

    { name: 'far street', from: 140, to: 3900, draw() {
      // Two rows of hazy buildings down the street, paler the further away
      const row = (list, c, seed) => list.forEach(([x, w, h], i) => {
        vbox(x, 140, w, h, tone(c, 0, '#5b6fa8'), tone('#f6e3cc'));
        box(x, 140 + h - 5, w, 5, tone(c, 0.3));
        box(x + w * 0.7, 140, w * 0.3, h, 'rgba(70,90,150,0.08)');
        for (let a = 400; a < h - 60; a += 90) {
          for (let k = 0; k < 2; k++) if (hash(a + k, seed + i) > 0.45) box(x + 6 + k * (w * 0.42), 140 + a, w * 0.2, 30, 'rgba(255,255,255,0.22)');
        }
      });
      // (the middle is left open, so the sun shows at the end of the street)
      row([[286, 46, 3600], [332, 36, 2500], [438, 34, 3000], [472, 42, 3760]], '#c2d6ea', 3);
      row([[286, 34, 2150], [320, 32, 1300], [450, 28, 1650], [478, 36, 1900]], '#a9c0dc', 8);
      box(334, 1440, 3, 80, tone('#8fa6c6')); // an aerial on a far roof
    } },

    { name: 'distant towers', from: 3700, to: 6000, draw() {
      [[-20, 90, 4900], [90, 70, 5350], [170, 60, 4750], [250, 80, 5500], [350, 60, 5050], [470, 70, 5300],
        [560, 90, 4850], [700, 60, 5450], [750, 70, 5000]].forEach(([x, w, top]) => {
        vbox(x, 3700, w, top - 3700, 'rgba(150,198,238,0.95)', 'rgba(190,222,245,0.55)');
        box(x + w * 0.7, 3700, w * 0.3, top - 3700, 'rgba(60,110,190,0.12)');
        box(x, top - 4, w, 4, 'rgba(255,255,255,0.4)');
      });
    } },

    { name: 'towers', from: 4300, to: 6460, draw() {
      const towers = [[40, 100, 5150, '#6aa6dc'], [215, 70, 5300, '#7cb3e2'], [300, 92, 5650, '#4f8fcf'],
        [520, 84, 5850, '#5b97d4'], [640, 120, 5500, '#4a86c8'], [400, 110, 6180, '#3d78bd']];
      towers.forEach(([x, w, top, c], i) => {
        const h = top - 4300;
        const face = w * 0.68;
        const bays = Math.round(face / 18);
        const bay = face / bays;
        vbox(x, 4300, w, h, tone(c, 0.22, NAVY), tone(c, -0.08, NAVY));
        box(x + face, 4300, w - face, h, 'rgba(20,40,110,0.24)'); // the side in shade
        for (let f = 4330; f < top - 30; f += 60) { // 4 m floors
          box(x, f + 44, w, 4, 'rgba(255,255,255,0.16)');
          for (let m = 0; m < bays; m++) if (hash(f + m, i + 20) > 0.8) box(x + m * bay + 2, f, bay - 4, 42, 'rgba(255,255,255,0.15)');
        }
        for (let m = 1; m < bays; m++) box(x + m * bay, 4300, 1.5, h, 'rgba(20,40,90,0.14)');
        // The sky reflected across the glass
        poly([[x, top - 320], [x + face, top - 130], [x + face, top - 20], [x, top - 210]], 'rgba(255,255,255,0.17)');
        poly([[x, top - 760], [x + face, top - 570], [x + face, top - 520], [x, top - 710]], 'rgba(255,255,255,0.1)');
        box(x, 4300, 3, h, 'rgba(255,255,255,0.3)'); // the lit edge
        box(x - 4, top, w + 8, 10, tone(c, 0.35, NAVY));
        box(x + w * 0.2, top + 10, w * 0.6, 12, tone(c, -0.1, NAVY));
        if (i === 5) { // spire
          poly([[x + w * 0.4, top + 22], [x + w * 0.5, top + 22], [x + w * 0.5, top + 270]], tone(c, 0.3, NAVY));
          poly([[x + w * 0.5, top + 22], [x + w * 0.6, top + 22], [x + w * 0.5, top + 270]], tone(c, -0.1, NAVY));
        }
        if (i === 3) { // helipad
          ctx.beginPath();
          ctx.ellipse(x + w / 2, Y(top + 26), w * 0.42, 9, 0, 0, Math.PI * 2);
          ctx.fillStyle = tone('#4d5468');
          ctx.fill();
          label('H', x + w / 2, top + 27, 12, '#f2c14e', false);
        }
      });
      // Tower crane mast on the widest tower (the jib swings, see the live art)
      for (let s = 0; s < 260; s += 20) {
        box(676, 5510 + s, 3, 20, tone('#f6c95a'));
        box(689, 5510 + s, 3, 20, tone('#f2c14e', -0.2));
        poly([[676, 5510 + s], [679, 5510 + s], [692, 5530 + s], [689, 5530 + s]], tone('#f2c14e', -0.1));
      }
      // Haze where the towers meet the rooftops
      vbox(0, 4300, WORLD, 800, 'rgba(170,212,245,0)', 'rgba(190,224,248,0.6)');
    } },

    { name: 'buildings', from: 140, to: 4900, draw() {
      [[LEFT, ROOF.left, BRICK.left, 'right'], [RIGHT, ROOF.right, BRICK.right, 'left']].forEach(([[x0, x1], top, c, side]) => {
        const w = x1 - x0;
        const h = top - 140;
        box(x0, 140, w, h, tone(c));
        // Brick texture: a scatter of lighter and darker bricks
        for (let k = 0; k < 130; k++) {
          const bx = x0 + 8 + hash(k, x0 + 3) * (w - 40);
          const ba = 800 + hash(k, x0 + 4) * (top - 900);
          box(bx, ba, 22, 9, tone(c, hash(k, x0 + 5) > 0.5 ? -0.07 : 0.08));
        }
        // Light across the face: the left-hand wall falls into shade towards the street,
        // the right-hand wall catches the sun along its street edge
        const g = ctx.createLinearGradient(x0, 0, x1, 0);
        if (side === 'right') {
          g.addColorStop(0, 'rgba(255,236,200,0.12)');
          g.addColorStop(1, SH(0.2));
        } else {
          g.addColorStop(0, 'rgba(255,236,200,0.26)');
          g.addColorStop(0.5, 'rgba(255,236,200,0.06)');
          g.addColorStop(1, SH(0.1));
        }
        ctx.fillStyle = g;
        ctx.fillRect(x0, Y(top), w, h);
        if (side === 'right') box(x1 - 22, 140, 22, h, SH(0.2));
        else {
          box(x0, 140, 22, h, 'rgba(255,240,210,0.22)');
          // Shafts of sunlight slanting down the wall
          [1050, 2380, 3460].forEach((a) => poly([[x0, a + 330], [x1, a], [x1, a + 250], [x0, a + 580]], 'rgba(255,232,180,0.13)'));
        }
        // Cornices between storeys, each with its shadow
        [760, 1290, 1740, 2190, 2640].forEach((a) => {
          shadowUnder(x0, a, w, 28, 0.22);
          box(x0, a, w, 14, tone(c, 0.2));
          box(x0, a + 14, w, 4, tone(c, 0.36));
        });
        // Drainpipe
        box(side === 'right' ? x0 + 8 : x1 - 14, 760, 6, top - 760, tone(c, -0.3));
        // Roof: parapet, chimneys with pots, an aerial
        shadowUnder(x0, top, w, 34, 0.24);
        box(x0, top, w, 26, tone(c, -0.25));
        box(x0, top + 20, w, 6, tone(c, 0.18));
        block(x0 + 40, top + 26, 36, 80, '#9a6048', side);
        box(x0 + 36, top + 100, 44, 10, tone('#9a6048', -0.2));
        box(x0 + 44, top + 110, 10, 16, tone('#c98a6a'));
        box(x0 + 62, top + 110, 10, 16, tone('#c98a6a', -0.1));
        block(x0 + 190, top + 26, 28, 56, '#9a6048', side);
        box(x0 + 128, top + 26, 4, 150, tone('#6d5a60'));
        box(x0 + 106, top + 140, 48, 4, tone('#6d5a60'));
        box(x0 + 114, top + 164, 32, 4, tone('#6d5a60'));
      });
      // Water tank and a roof garden
      block(640, ROOF.right + 26, 70, 90, '#8a7d76', 'left');
      poly([[632, ROOF.right + 116], [718, ROOF.right + 116], [675, ROOF.right + 150]], tone('#8a7d76', -0.1));
      block(120, ROOF.left + 26, 60, 22, '#7a5a44');
      bush(136, ROOF.left + 58, 15);
      bush(164, ROOF.left + 56, 13, '#58b377');

      // Shopfronts (the Pavement): a café on the left, a greengrocer on the right
      const shop = (x0, paint, doorX, winX, name, size, stripe, side) => {
        vbox(x0 + 6, 140, 278, 416, tone(paint, 0.04), tone(paint, -0.14));
        box(x0 + 6, 140, 278, 44, tone(paint, -0.26)); // the stall riser under the window
        // Window, and what's inside
        pane(winX, 196, 176, 264, '#9fd8f0', false, true);
        // Door, with a window, a handle and a step
        shadowUnder(doorX - 4, 428, 70, 14, 0.2);
        vbox(doorX, 150, 62, 276, tone(paint, -0.3), tone(paint, -0.45));
        box(doorX + 5, 160, 52, 110, tone(paint, -0.38));
        pane(doorX + 12, 300, 38, 96, '#9fd8f0', false, true);
        disc(doorX + (side === 'right' ? 52 : 10), 280, 4, tone('#f2c14e'));
        box(doorX - 6, 140, 74, 10, tone('#a9adb8'));
        // Fascia sign
        shadowUnder(x0 + 8, 560, 274, 20, 0.2);
        vbox(x0 + 8, 560, 274, 110, tone(paint, 0.12), tone(paint, -0.08));
        box(x0 + 8, 664, 274, 6, tone(paint, 0.3));
        box(x0 + 18, 572, 254, 2, 'rgba(255,255,255,0.35)');
        box(x0 + 18, 656, 254, 2, 'rgba(255,255,255,0.35)');
        label(name, x0 + 145, 614, size, '#ffffff');
        awning(x0 + 8, 540, 274, 48, [stripe, '#ffffff']);
      };
      shop(0, '#2f8f83', 210, 22, 'CAFÉ', 52, '#ff7a59', 'right');
      shop(510, '#5a5fc8', 532, 610, 'MARKET', 44, '#f2c14e', 'left');
      // Inside the café: pendant lamps and a counter
      [56, 110, 164].forEach((x, k) => {
        box(x - 1, 400 - k * 6, 2, 60 + k * 6, 'rgba(50,40,60,0.5)');
        glow(x, 392 - k * 6, 34, '255,214,130', 0.55);
        disc(x, 392 - k * 6, 9, '#ffe6a8');
      });
      box(22, 196, 176, 56, 'rgba(60,40,60,0.3)');
      box(40, 252, 36, 30, 'rgba(60,40,60,0.3)');
      // Inside the greengrocer: shelves of produce
      [0, 1].forEach((s) => {
        box(610, 372 - s * 76, 176, 5, 'rgba(60,40,60,0.35)');
        for (let k = 0; k < 9; k++) disc(622 + k * 19, 385 - s * 76, 8, tone(['#ff9f43', '#7ed957', '#ff5f6d', '#ffd166'][(k + s) % 4], 0, INK, 0.75));
      });

      // The market floors: tall windows, little awnings, flower boxes
      [840, 1290, 1740, 2190].forEach((a0, fl) => {
        [[LEFT[0] + 40, 0], [LEFT[0] + 162, 1], [RIGHT[0] + 50, 2], [RIGHT[0] + 172, 3]].forEach(([wx, c]) => {
          pane(wx, a0 + 70, 86, 220, '#a7d3ea', hash(fl * 4 + c, 41) > 0.8);
          if ((fl + c) % 2 === 0) awning(wx - 8, a0 + 330, 102, 30, [['#ff7a59', '#2f8f83', '#f2c14e', '#5a8de0'][(fl + c) % 4], '#ffffff'], 4);
          else {
            shadowUnder(wx - 6, a0 + 40, 98, 16, 0.2);
            block(wx - 6, a0 + 40, 98, 24, '#7a5a44');
            for (let k = 0; k < 6; k++) disc(wx + 2 + k * 16.5, a0 + 68, 11, tone(k % 2 ? '#58b377' : '#3fa36b'));
            for (let k = 0; k < 5; k++) disc(wx + 8 + k * 18, a0 + 76 + (k % 2) * 4, 6, tone(['#ff8fab', '#ffd166', '#ffffff', '#ff7a59', '#ff8fab'][(k + fl) % 5]));
          }
        });
      });
      // A hanging bracket sign on the left
      box(270, 1150, 64, 5, tone('#4d5468'));
      box(300, 1060, 2, 90, tone('#4d5468'));
      box(326, 1060, 2, 90, tone('#4d5468'));
      block(286, 980, 56, 80, '#ff7a59');
      disc(314, 1022, 17, tone('#ffffff'));
      disc(314, 1022, 9, tone('#ff7a59', -0.1));
      // The neon sign board on the right (its glow flickers, see the live art)
      vbox(512, 1760, 46, 380, tone('#3a2c58'), tone('#221a38'));
      box(512, 1760, 5, 380, 'rgba(255,255,255,0.12)');

      // The flats: shorter storeys with balconies, plants and air-con units
      [[LEFT, ROOF.left, 0], [RIGHT, ROOF.right, 1]].forEach(([[x0, x1], top, s]) => {
        for (let fl = 0; fl < 10; fl++) {
          const a0 = 2700 + fl * 200;
          if (a0 + 120 > top - 60) break;
          for (let c = 0; c < 3; c++) {
            const wx = x0 + 26 + c * 86;
            pane(wx, a0, 54, 96, '#8fc0da', hash(fl * 3 + c, s + 5) > 0.62);
            if (c !== 1) { // balcony
              shadowUnder(wx - 12, a0 - 8, 78, 18, 0.24);
              box(wx - 12, a0 - 10, 78, 9, tone('#8b8290'));
              for (let b = 0; b < 6; b++) box(wx - 9 + b * 14, a0 - 2, 3, 36, tone('#5f5766'));
              box(wx - 12, a0 + 32, 78, 4, tone('#5f5766'));
              if (hash(fl, c + 9) > 0.5) bush(wx + 48, a0 + 10, 11, hash(fl, c) > 0.5 ? '#3fa36b' : '#58b377');
            }
          }
          if (fl % 3 === 1) {
            const ax = s ? x0 + 30 : x1 - 70;
            shadowUnder(ax, a0 + 116, 40, 12, 0.2);
            block(ax, a0 + 116, 40, 28, '#d9dde3', s ? 'left' : 'right');
            disc(ax + 20, a0 + 130, 8, tone('#aab0bb'));
          }
        }
      });
    } },

    { name: 'pavement', from: 0, to: 1080, draw() {
      vbox(0, 0, WORLD, 128, tone('#d3d6dd'), tone('#b4b8c3'));
      for (let x = 0; x < WORLD; x += 80) box(x, 0, 3, 128, 'rgba(110,112,130,0.25)');
      box(0, 64, WORLD, 3, 'rgba(110,112,130,0.25)');
      box(0, 128, WORLD, 14, tone('#9a9fac'));
      box(0, 138, WORLD, 4, 'rgba(255,255,255,0.4)');
      // The buildings' shadow where they meet the ground, and the sun down the middle
      const lightAcross = ctx.createLinearGradient(0, 0, WORLD, 0);
      [[0, SH(0.2)], [0.3, SH(0.14)], [0.5, 'rgba(255,236,190,0.4)'], [0.7, SH(0.05)], [1, SH(0.1)]].forEach(([f, c]) => lightAcross.addColorStop(f, c));
      ctx.fillStyle = lightAcross;
      ctx.fillRect(0, Y(128), WORLD, 128);
      // Lamp post at the kerb
      standsOn(302, 44);
      box(296, 140, 12, 880, tone('#4d5468'));
      box(296, 140, 4, 880, 'rgba(255,255,255,0.18)');
      box(291, 140, 22, 34, tone('#4d5468', -0.2));
      poly([[272, 1020], [332, 1020], [318, 1054], [286, 1054]], tone('#4d5468'));
      glow(302, 1010, 70, '255,233,168', 0.6);
      box(284, 1004, 36, 16, '#fff1c4');
      // Planters by the doors
      [[190, 'right'], [606, 'left']].forEach(([x, side]) => {
        standsOn(x + 18, 48);
        block(x, 140, 36, 46, '#c96f4a', side);
        box(x - 3, 180, 42, 8, tone('#c96f4a', 0.12));
        bush(x + 18, 212, 24);
      });
      // Café table and chairs outside the café
      standsOn(124, 150);
      box(70, 300, 110, 10, tone('#ffffff', -0.03));
      box(70, 296, 110, 4, tone('#ffffff', -0.2));
      box(120, 140, 8, 158, tone('#6d5a60'));
      box(96, 140, 56, 6, tone('#6d5a60'));
      box(112, 310, 16, 14, tone('#ff7a59')); // a cup
      box(40, 140, 6, 140, tone('#6d5a60')); // a chair
      box(74, 140, 6, 140, tone('#6d5a60'));
      block(36, 240, 48, 10, '#2f8f83', 'right');
      box(36, 240, 6, 110, tone('#2f8f83'));
      // Fruit crates outside the greengrocer
      standsOn(700, 180);
      [[652, '#ff9f43'], [726, '#ff5f6d'], [690, '#7ed957']].forEach(([cx, fruit], k) => {
        const a = k === 2 ? 236 : 140;
        block(cx, a, 70, 90, '#b9814f', 'left');
        box(cx, a + 28, 70, 3, tone('#b9814f', -0.25));
        box(cx, a + 58, 70, 3, tone('#b9814f', -0.25));
        for (let f = 0; f < 4; f++) {
          disc(cx + 12 + f * 16, a + 96, 10, tone(fruit, (f % 2) * 0.1));
          disc(cx + 9 + f * 16, a + 99, 3, 'rgba(255,255,255,0.45)');
        }
      });
      // Bin and bollards
      standsOn(364, 70);
      block(338, 140, 52, 86, '#3c7a5a');
      box(334, 222, 60, 10, tone('#2f6248'));
      box(352, 196, 24, 6, tone('#2f6248', -0.2));
      [460, 492].forEach((x) => {
        standsOn(x + 8, 30);
        box(x, 140, 16, 66, tone('#4d5468'));
        box(x, 140, 5, 66, 'rgba(255,255,255,0.18)');
        disc(x + 8, 206, 8, tone('#4d5468'));
        box(x, 186, 16, 5, tone('#f2c14e'));
      });
    } },

    { name: 'cloud bank', from: 5900, to: 6800, draw() {
      // Low cloud: the join between the Skyscrapers and the Birds & planes (it hides the zoom)
      const g = ctx.createLinearGradient(0, Y(6640), 0, Y(6020));
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.35, 'rgba(244,248,255,0.8)');
      g.addColorStop(0.7, 'rgba(226,235,250,0.75)');
      g.addColorStop(1, 'rgba(226,235,250,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, Y(6640), WORLD, 620);
      [[6520, 0.9, '#a9bfe6', 300], [6440, 1, '#b4c8ea', 330], [6350, 1, '#bfd0ee', 360], [6260, 1, '#c6d6f0', 340], [6170, 0.92, '#aebfe2', 300]].forEach(([a, alpha, under, w], row) => {
        for (let i = 0; i < 6; i++) {
          const x = -60 + i * 180 + (row % 2) * 90 + hash(i, row) * 40;
          puff(x, Y(a + hash(i, row + 3) * 40), w + hash(i, row + 6) * 90, i + row * 9, alpha, under);
        }
      });
    } },

    { name: 'the Earth', from: 7700, to: 8480, draw() {
      // The curve of the Earth with its glowing skin of air, fading into the haze below
      const R = 5200;
      const cx = WORLD / 2;
      const cy = Y(8150 - R);
      ctx.save();
      ctx.beginPath();
      ctx.rect(-10, Y(8480), WORLD + 20, 780);
      ctx.clip();
      let g = ctx.createRadialGradient(cx, cy, R - 20, cx, cy, R + 190);
      g.addColorStop(0, 'rgba(190,232,255,0.95)');
      g.addColorStop(0.12, 'rgba(130,200,255,0.55)');
      g.addColorStop(0.45, 'rgba(100,170,255,0.18)');
      g.addColorStop(1, 'rgba(90,160,255,0)');
      ctx.beginPath();
      ctx.arc(cx, cy, R + 190, 0, Math.PI * 2);
      ctx.fillStyle = g;
      ctx.fill();
      g = ctx.createRadialGradient(cx, cy, R - 480, cx, cy, R);
      g.addColorStop(0, '#0e4c9a');
      g.addColorStop(0.7, '#1c72c2');
      g.addColorStop(0.96, '#4aa6e6');
      g.addColorStop(1, '#9fdcff');
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.clip();
      // Land
      [[150, 8072, 150, 36, 3, '#4aa96c'], [540, 8086, 190, 30, 5, '#58b377'], [330, 8018, 110, 28, 8, '#d9c189'],
        [700, 7985, 130, 32, 9, '#4aa96c'], [40, 7965, 110, 30, 12, '#58b377']].forEach(([x, a, rx, ry, seed, c]) => {
        blobPath(x, Y(a), rx, ry, seed);
        ctx.fillStyle = c;
        ctx.fill();
        blobPath(x + rx * 0.18, Y(a - ry * 0.25), rx * 0.6, ry * 0.5, seed + 1);
        ctx.fillStyle = 'rgba(20,80,70,0.22)';
        ctx.fill();
      });
      // Streaks of cloud
      [[240, 8108, 130, 9], [610, 8040, 170, 11], [430, 8122, 90, 6], [100, 8028, 120, 9], [710, 8104, 80, 6], [330, 8062, 70, 6]].forEach(([x, a, rx, ry]) => {
        ctx.beginPath();
        ctx.ellipse(x, Y(a), rx, ry, -0.04, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.78)';
        ctx.fill();
      });
      ctx.restore();
      // The Earth fades away into the sky below, so the join is soft (nothing else is
      // drawn in tiles at these heights, so erasing is safe)
      g = ctx.createLinearGradient(0, Y(7720), 0, Y(8050));
      g.addColorStop(0, 'rgba(0,0,0,1)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = g;
      ctx.fillRect(-10, Y(8050), WORLD + 20, 8050 - 7690);
      ctx.globalCompositeOperation = 'source-over';
    } },

    { name: 'deep space', from: 8300, to: 12000, draw() {
      // Faint clouds of colour
      [[180, 9500, 430, '120,90,235', 0.2], [640, 10150, 480, '70,170,210', 0.14], [300, 10800, 520, '215,90,170', 0.13],
        [620, 11400, 380, '120,90,235', 0.14], [200, 9950, 260, '255,150,120', 0.08]].forEach(([x, a, r, rgb, alpha]) => glow(x, a, r, rgb, alpha));
      // A dust of tiny stars, thicker along one slanting band
      for (let i = 0; i < 700; i++) {
        const a = 8300 + hash(i, 71) * 3700;
        const x = i % 2 ? 150 + ((a - 8300) / 3700) * 500 + (hash(i, 73) - 0.5) * 280 : hash(i, 72) * WORLD;
        const s = 1 + hash(i, 75) * 1.6;
        box(x, a, s, s, `rgba(255,255,255,${((0.2 + hash(i, 74) * 0.5) * clamp01((a - 8300) / 600)).toFixed(3)})`);
      }
      // Two distant planets
      glow(650, 10200, 70, '255,140,100', 0.25);
      sphereAt(650, Y(10200), 24, '#ffb38a', '#7a2f2a');
      glow(600, 10950, 110, '255,214,165', 0.2);
      ctx.strokeStyle = 'rgba(255,224,180,0.75)';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.ellipse(600, Y(10950), 64, 14, -0.25, Math.PI, Math.PI * 2); // the ring, behind
      ctx.stroke();
      sphereAt(600, Y(10950), 36, '#f6dcb4', '#7d5a48');
      ctx.save();
      ctx.beginPath();
      ctx.arc(600, Y(10950), 36, 0, Math.PI * 2);
      ctx.clip();
      [-16, -2, 12].forEach((dy, k) => box(560, 10950 + dy, 80, 6, `rgba(150,100,70,${0.18 + k * 0.05})`));
      ctx.restore();
      ctx.beginPath();
      ctx.ellipse(600, Y(10950), 64, 14, -0.25, 0, Math.PI); // the ring, in front
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
      standsOn(px, 70);
      poly([[px - 22, 282], [px - 4, 282], [px - 6 - step, 140], [px - 20 - step, 140]], tone('#3b3355'));
      poly([[px + 4, 282], [px + 22, 282], [px + 20 + step, 140], [px + 6 + step, 140]], tone('#3b3355', -0.15));
      poly([[px - 30, 430], [px + 30, 430], [px + 24, 276], [px - 24, 276]], tone('#ff7a59'));
      poly([[px + 8, 430], [px + 30, 430], [px + 24, 276], [px + 12, 276]], tone('#ff7a59', -0.15));
      poly([[px - 30, 426], [px - 18, 426], [px - 22 + step, 300], [px - 34 + step, 304]], tone('#ff7a59', 0.12)); // arm
      disc(px, 470, 26, tone('#f0c7a4'));
      poly([[px - 27, 470], [px - 22, 494], [px, 500], [px + 22, 494], [px + 27, 474], [px + 8, 482], [px - 14, 478]], tone('#3b3355')); // hair
    } },
    { name: 'pigeons', from: 130, to: 200, draw(now) {
      [[400, 0], [436, 1.3]].forEach(([x, ph]) => {
        const hop = Math.max(0, still(now, 260, ph * 3)) * 10;
        standsOn(x + 3, 30);
        disc(x, 156 + hop, 13, tone('#7b7f92'));
        disc(x - 3, 160 + hop, 7, tone('#9da1b3'));
        disc(x + 12, 170 + hop, 7, tone('#6b6f82'));
        poly([[x + 18, 171 + hop], [x + 26, 168 + hop], [x + 18, 165 + hop]], tone('#f2c14e'));
      });
    } },
    { name: 'bunting', from: 1640, to: 2620, draw(now) {
      [1760, 2160, 2560].forEach((a, row) => {
        const sway = still(now, 700, row) * 6;
        ctx.beginPath(); // the string, sagging between the buildings
        ctx.moveTo(290, Y(a));
        ctx.quadraticCurveTo(400, Y(a - 84), 510, Y(a));
        ctx.strokeStyle = 'rgba(60,50,70,0.55)';
        ctx.lineWidth = 2;
        ctx.stroke();
        for (let k = 0; k < 9; k++) {
          const x = 290 + k * 24.5;
          const dip = Math.sin((k / 8) * Math.PI) * 40;
          const c = ['#ff7a59', '#f2c14e', '#3fb48e', '#5a8de0'][(k + row) % 4];
          poly([[x, a - dip], [x + 22, a - dip], [x + 11 + sway, a - dip - 34]], tone(c));
          poly([[x + 11, a - dip], [x + 22, a - dip], [x + 11 + sway, a - dip - 34]], tone(c, -0.15));
        }
        if (row === 1) [330, 400, 470].forEach((x, k) => { // paper lanterns
          const dip = Math.sin(((x - 290) / 220) * Math.PI) * 40;
          const lx = x + still(now, 900, k) * 3;
          box(x - 1, a - dip - 26, 2, 26, 'rgba(60,50,70,0.5)');
          glow(lx, a - dip - 48, 46, '255,120,110', 0.4);
          disc(lx, a - dip - 48, 20, tone('#ff5f6d'));
          disc(lx - 6, a - dip - 42, 8, 'rgba(255,255,255,0.3)');
          box(x - 12, a - dip - 70, 24, 6, tone('#2b2140'));
          box(x - 8, a - dip - 30, 16, 5, tone('#2b2140'));
        });
      });
    } },
    { name: 'neon sign', from: 1760, to: 2140, draw(now) {
      const on = reducedMotion || hash(Math.floor(now / 140), 3) > 0.08;
      if (on) glow(535, 1950, 150, '124,245,255', 0.28);
      ['O', 'P', 'E', 'N'].forEach((ch, k) => label(ch, 535, 2080 - k * 80, 50, on ? '#b8fbff' : 'rgba(124,245,255,0.25)', false));
    } },
    { name: 'washing line', from: 3460, to: 3560, draw(now) {
      const flap = still(now, 300) * 5;
      box(290, 3550, 220, 2, tone('#5d5462'));
      [[310, '#ff8fab'], [352, '#ffffff'], [402, '#6ec1ee'], [455, '#ffd166']].forEach(([x, c], i) => {
        const f = i % 2 ? flap : -flap;
        poly([[x, 3550], [x + 30, 3550], [x + 32 + f, 3490], [x - 2, 3492]], tone(c));
        poly([[x + 20, 3550], [x + 30, 3550], [x + 32 + f, 3490], [x + 22 + f, 3491]], tone(c, -0.14));
      });
    } },
    { name: 'chimney smoke', from: ROOF.left + 100, to: ROOF.left + 420, draw(now) {
      for (let k = 0; k < 5; k++) {
        const t = reducedMotion ? k / 5 : ((now / 2600 + k / 5) % 1);
        disc(58 + t * 46 + Math.sin(t * 6 + k) * 6, ROOF.left + 130 + t * 280, 10 + t * 24, `rgba(240,240,250,${(0.5 * (1 - t)).toFixed(3)})`);
      }
    } },
    { name: 'crane jib', from: 5700, to: 5830, draw(now) {
      ctx.save();
      ctx.translate(684, Y(5770));
      ctx.rotate(still(now, 3000) * 0.12);
      ctx.fillStyle = tone('#f6c95a');
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
      if (on) glow(455, 6452, 34, '255,77,77', 0.5);
      disc(455, 6452, 6, on ? '#ff6b6b' : '#7a2a3a');
    } },
    { name: 'drifting clouds', from: 6560, to: 7760, draw(now) {
      [[6720, 250, 0.006, 100, 51], [6900, 190, 0.01, 620, 52], [7080, 300, 0.005, 380, 53], [7260, 170, 0.012, 60, 54],
        [7440, 230, 0.008, 520, 55], [7620, 150, 0.014, 280, 56]].forEach(([a, w, speed, x0, seed]) => {
        puff(crossing(now, speed, WORLD + 500, x0) - 250, Y(a), w, seed, 0.96);
      });
    } },
    { name: 'flocks', from: 6600, to: 7200, draw(now) {
      [[6800, 0.03, 0], [7140, 0.022, 300]].forEach(([a, s, x0]) => {
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
      poly([[x - 40, 7350], [x + 40, 7350], [x + 36, 7354], [x - 38, 7354]], tone('#ff7a59', -0.2));
      poly([[x - 6, 7356], [x + 8, 7356], [x, 7394]], tone('#ff7a59', -0.2));
      poly([[x - 40, 7356], [x - 32, 7356], [x - 44, 7380]], tone('#ff7a59', -0.1));
      box(x + 14, 7356, 12, 5, tone('#bfe6f5'));
    } },
    { name: 'airliner', from: 7700, to: 7800, draw(now) {
      const x = crossing(now, 0.07, WORLD + 900, 500) - 200;
      const g = ctx.createLinearGradient(x - 760, 0, x - 40, 0); // the contrail, fading out behind
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(1, 'rgba(255,255,255,0.7)');
      ctx.fillStyle = g;
      ctx.fillRect(x - 760, Y(7750), 720, 7);
      poly([[x - 70, 7742], [x + 60, 7742], [x + 78, 7750], [x + 60, 7758], [x - 70, 7758]], tone('#ffffff'));
      poly([[x - 70, 7742], [x + 60, 7742], [x + 70, 7746], [x - 70, 7746]], tone('#c7d3e8'));
      poly([[x - 70, 7758], [x - 54, 7758], [x - 78, 7792]], tone('#5a8de0'));
      poly([[x - 12, 7750], [x + 14, 7750], [x - 26, 7716]], tone('#c7d3e8'));
      box(x + 52, 7752, 10, 4, tone('#5a8de0'));
    } },
    { name: 'space station', from: 8840, to: 9060, draw(now) {
      ctx.save();
      ctx.translate(400, Y(8950));
      ctx.rotate(-0.08 + still(now, 5000) * 0.05);
      ctx.fillStyle = '#c9ced8';
      ctx.fillRect(-236, -5, 472, 10);
      ctx.fillStyle = '#9aa1b0';
      ctx.fillRect(-236, 2, 472, 3);
      [-210, -150, 150, 210].forEach((px, k) => {
        const glint = 0.12 + Math.max(0, still(now, 1600, k)) * 0.3;
        [[-76, 66], [10, 66]].forEach(([py, ph]) => {
          const g = ctx.createLinearGradient(0, py, 0, py + ph);
          g.addColorStop(0, '#4a78c8');
          g.addColorStop(1, '#22407f');
          ctx.fillStyle = g;
          ctx.fillRect(px - 24, py, 48, ph);
          ctx.fillStyle = 'rgba(255,255,255,0.22)';
          for (let l = 1; l < 5; l++) ctx.fillRect(px - 24, py + l * (ph / 5), 48, 1);
          ctx.fillRect(px - 0.5, py, 1, ph);
          ctx.fillStyle = `rgba(255,255,255,${glint.toFixed(3)})`;
          ctx.fillRect(px - 24, py, 48, 18);
        });
      });
      ctx.fillStyle = '#eef0f5';
      ctx.fillRect(-62, -18, 124, 36);
      ctx.fillStyle = '#b9bfcc';
      ctx.fillRect(-62, 6, 124, 12);
      ctx.fillStyle = '#ffc65c';
      ctx.fillRect(-14, -28, 28, 56);
      ctx.fillStyle = '#d99a2b';
      ctx.fillRect(-14, 14, 28, 14);
      ctx.fillStyle = '#8fd8ff';
      [-44, -30, 30, 44].forEach((wx) => ctx.fillRect(wx - 3, -8, 6, 6));
      ctx.restore();
    } },
    { name: 'satellite', from: 9960, to: 10060, draw(now) {
      box(180, 10000, 30, 18, tone('#dfe3ea'));
      box(180, 10000, 30, 6, tone('#aab0bb'));
      box(140, 10004, 36, 10, tone('#3a62b0'));
      box(214, 10004, 36, 10, tone('#3a62b0'));
      if (reducedMotion || still(now, 500) > 0.6) {
        glow(195, 10024, 16, '255,77,77', 0.6);
        disc(195, 10024, 3.5, '#ff6b6b');
      }
    } },
    { name: 'comet', from: 10100, to: 10950, draw(now) {
      const k = reducedMotion ? 0.4 : (now / 9000) % 1;
      const cx = 900 - k * 1100;
      const ca = 10500 + k * 300;
      const g = ctx.createLinearGradient(cx, Y(ca), cx + 300, Y(ca - 80));
      g.addColorStop(0, 'rgba(190,235,255,0.7)');
      g.addColorStop(1, 'rgba(190,235,255,0)');
      ctx.beginPath();
      ctx.moveTo(cx, Y(ca + 7));
      ctx.lineTo(cx + 300, Y(ca - 80));
      ctx.lineTo(cx, Y(ca - 7));
      ctx.closePath();
      ctx.fillStyle = g;
      ctx.fill();
      glow(cx, ca, 30, '200,240,255', 0.7);
      disc(cx, ca, 7, '#f2fbff');
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
  const TILE_PAD = 4; // each tile is drawn a little past its edges, so its edge pixels are clean
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

  // ---------------------------------------------------------------------------
  // Far layers, drawn every frame. They move more slowly than the tiles, which is what
  // gives the world its depth.
  // ---------------------------------------------------------------------------

  // The sun: comes out above the rooftops and hangs in the sky up to the edge of space
  function drawSun(camAlt) {
    const vis = clamp01((camAlt - 3500) / 900) * clamp01((7800 - camAlt) / 500);
    if (vis <= 0) return;
    const x = 610;
    const y = 150 + (camAlt - 3500) * 0.07;
    glowAt(x, y, 520, '255,244,214', 0.5 * vis);
    glowAt(x, y, 130, '255,250,232', 0.9 * vis);
    ctx.beginPath();
    ctx.arc(x, y, 44, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,253,244,${vis})`;
    ctx.fill();
  }

  // Twinkling stars, fading in above the atmosphere (the tiles add a dust of tiny ones)
  function drawStars(now, camAlt) {
    const top = camAlt + WORLD;
    const starFrom = WORLD_H * 0.62;
    if (top <= starFrom) return;
    for (let i = 0; i < 110; i++) {
      const a = starFrom + hash(i, 61) * (WORLD_H - starFrom);
      if (a < camAlt - 10 || a > top + 10) continue;
      const x = hash(i, 62) * WORLD;
      const y = screenY(a, camAlt);
      const big = i % 6 === 0;
      const r = big ? 6 + hash(i, 63) * 4 : 2 + hash(i, 63) * 3;
      const depth = clamp01((a - starFrom) / (WORLD_H * 0.12));
      const twinkle = reducedMotion ? 0.8 : 0.45 + 0.55 * Math.abs(Math.sin(now / 900 + i * 1.7));
      const alpha = twinkle * 0.9 * depth;
      if (big) glowAt(x, y, r * 3, i % 12 ? '190,215,255' : '255,225,190', alpha * 0.45);
      ctx.beginPath(); // a four-pointed sparkle
      ctx.moveTo(x, y - r);
      ctx.quadraticCurveTo(x, y, x + r * 0.7, y);
      ctx.quadraticCurveTo(x, y, x, y + r);
      ctx.quadraticCurveTo(x, y, x - r * 0.7, y);
      ctx.quadraticCurveTo(x, y, x, y - r);
      ctx.fillStyle = css(WHITE, alpha);
      ctx.fill();
    }
  }

  // The Moon grows from a small disc in the Space void to a surface filling the top of
  // the board at 1000. Seas and craters are placed by angle (from the Moon's lowest
  // point) and distance from its centre, so they scale with it.
  const MOON_SEAS = [[0.1, 0.84, 0.16, 0.07, 21], [-0.2, 0.9, 0.12, 0.05, 22], [0.5, 0.5, 0.26, 0.2, 23], [2.6, 0.45, 0.3, 0.22, 24], [-1.6, 0.5, 0.2, 0.24, 25]];
  const MOON_CRATERS = [];
  for (let i = 0; i < 14; i++) MOON_CRATERS.push([(hash(i, 31) - 0.5) * 0.62, 0.72 + hash(i, 32) * 0.25, 0.012 + hash(i, 33) ** 2 * 0.05]); // the face you land on
  for (let i = 0; i < 12; i++) MOON_CRATERS.push([hash(i, 34) * Math.PI * 2, 0.1 + hash(i, 35) * 0.6, 0.03 + hash(i, 36) * 0.07]); // the rest of the disc

  function drawMoon() {
    const p = clamp01((camera - 700) / (GOAL - 700));
    if (p <= 0) return;
    const r = 46 + 1454 * p ** 3;
    const bottom = 120 + 330 * p; // y of the Moon's lowest point on the board
    const cx = WORLD / 2 + 140 * (1 - p);
    const cy = bottom - r;

    let g = ctx.createRadialGradient(cx, cy, r * 0.97, cx, cy, r * 1.1 + 46); // a halo of light
    g.addColorStop(0, 'rgba(205,210,255,0.26)');
    g.addColorStop(1, 'rgba(205,210,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, WORLD, WORLD);

    g = ctx.createRadialGradient(cx - r * 0.3, cy + r * 0.5, r * 0.1, cx, cy, r * 1.05); // lit from the lower left
    g.addColorStop(0, '#f6f4fb');
    g.addColorStop(0.55, '#d6d2e3');
    g.addColorStop(1, '#8b86a6');
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.clip();
    MOON_SEAS.forEach(([ang, d, sx, sy, seed]) => {
      blobPath(cx + Math.sin(ang) * r * d, cy + Math.cos(ang) * r * d, r * sx, r * sy, seed);
      ctx.fillStyle = 'rgba(122,117,152,0.26)';
      ctx.fill();
    });
    MOON_CRATERS.forEach(([ang, d, size]) => {
      const cr = r * size;
      if (cr < 1.5) return;
      const x = cx + Math.sin(ang) * r * d;
      const y = cy + Math.cos(ang) * r * d;
      if (y < -cr || y > WORLD + cr || x < -cr || x > WORLD + cr) return;
      const flat = Math.max(Math.sqrt(1 - d * d), 0.3); // craters near the edge look squashed
      ctx.beginPath();
      ctx.ellipse(x, y, cr, cr * flat, -ang, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(98,92,130,0.5)';
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(x - cr * 0.08, y + cr * flat * 0.16, cr * 0.82, cr * flat * 0.78, -ang, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(216,212,230,0.75)';
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(x, y, cr, cr * flat, -ang, Math.PI * 1.05, Math.PI * 1.95);
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = Math.max(cr * 0.07, 1);
      ctx.stroke();
    });
    ctx.restore();

    // The Earth, rising small behind once you're nearly there
    if (p > 0.5) {
      const e = (p - 0.5) / 0.5;
      const ex = 120;
      const ey = 770 - e * 230;
      ctx.save();
      ctx.globalAlpha = clamp01(e * 4);
      glowAt(ex, ey, 100, '90,170,255', 0.4);
      sphereAt(ex, ey, 36, '#7fd0ff', '#0b3a88');
      ctx.beginPath();
      ctx.arc(ex, ey, 36, 0, Math.PI * 2);
      ctx.clip();
      blobPath(ex - 10, ey - 6, 20, 14, 4);
      ctx.fillStyle = 'rgba(74,169,108,0.9)';
      ctx.fill();
      blobPath(ex + 18, ey + 16, 14, 9, 6);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(ex + 4, ey - 20, 22, 4, -0.2, 0, Math.PI * 2);
      ctx.ellipse(ex - 8, ey + 10, 18, 3, 0.1, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.fill();
      ctx.restore();
    }
  }

  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { tiles.clear(); sprites.clear(); });

  function drawWorld(now, camAlt) {
    const top = camAlt + WORLD;

    // Sky
    const g = ctx.createLinearGradient(0, WORLD, 0, 0);
    for (let k = 0; k <= 4; k++) g.addColorStop(k / 4, css(skyAt(camAlt + (k / 4) * WORLD)));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, WORLD, WORLD);

    drawSun(camAlt);
    drawStars(now, camAlt);

    // The static art, from tiles
    setTileScale();
    const first = Math.max(Math.floor((camAlt - TILE_PAD) / TILE), 0);
    const last = Math.min(Math.floor((top + TILE_PAD) / TILE), TILE_COUNT - 1);
    const px = screenCtx.getTransform().a || 1; // screen pixels per world unit
    const edge = (k) => Math.round(screenY(k * TILE, camAlt) * px) / px; // tiles meet on whole pixels
    for (let k = first; k <= last; k++) {
      const tile = tiles.get(k) || buildTile(k);
      const y = edge(k + 1);
      ctx.drawImage(tile, 0, TILE_PAD * tileScale, tile.width, TILE * tileScale, 0, y, WORLD, edge(k) - y);
    }

    drawMoon(); // in front of the star dust, behind the satellite and comet

    // The live details on screen
    artTop = top;
    LIVE_ART.forEach((layer) => { if (layer.to >= camAlt && layer.from <= top) layer.draw(now); });

    // A soft darkening towards the corners, to hold the eye in the middle of the board
    const v = ctx.createRadialGradient(WORLD / 2, WORLD * 0.46, WORLD * 0.36, WORLD / 2, WORLD / 2, WORLD * 0.8);
    v.addColorStop(0, 'rgba(12,8,44,0)');
    v.addColorStop(1, 'rgba(12,8,44,0.26)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, WORLD, WORLD);

    manageTiles(camAlt);
  }

  // ---------------------------------------------------------------------------
  // The infographic layer: real heights on top of the art, in the bold outlined style
  // of a size-comparison video. Dashed lines mark real things at their real heights,
  // a readout shows how high the ball is, and a bar shows how far up the climb you are.
  //
  // HEIGHTS ties the world to real metres at a few landmarks in the art; in between,
  // heights grow smoothly (each step multiplies), which is how the climb fits a street
  // and the Moon into one world.
  // ---------------------------------------------------------------------------
  const HEIGHTS = [[140, 0], [500, 1.8], [1020, 5], [2640, 18], [4620, 55], [5150, 150], [6180, 828], [6350, 2000],
    [7350, 3000], [7750, 11000], [8150, 100e3], [8950, 400e3], [10000, 20200e3], [10950, 150000e3], [12400, 384400e3]];
  function realHeight(a) { // world altitude -> metres
    if (a <= HEIGHTS[0][0]) return 0;
    for (let i = 1; i < HEIGHTS.length; i++) {
      const [a0, m0] = HEIGHTS[i - 1];
      const [a1, m1] = HEIGHTS[i];
      if (a > a1) continue;
      const t = (a - a0) / (a1 - a0);
      return m0 === 0 ? m1 * t : m0 * (m1 / m0) ** t;
    }
    return HEIGHTS[HEIGHTS.length - 1][1];
  }
  function altitudeOf(m) { // metres -> world altitude
    for (let i = 1; i < HEIGHTS.length; i++) {
      const [a0, m0] = HEIGHTS[i - 1];
      const [a1, m1] = HEIGHTS[i];
      if (m > m1) continue;
      const t = m0 === 0 ? m / m1 : Math.log(m / m0) / Math.log(m1 / m0);
      return a0 + (a1 - a0) * t;
    }
    return HEIGHTS[HEIGHTS.length - 1][0];
  }
  function formatHeight(m) {
    if (m < 10) return `${m.toFixed(1)} m`;
    if (m < 1000) return `${Math.round(m)} m`;
    const km = m / 1000;
    if (km < 100) return `${km.toFixed(1)} km`;
    const step = 10 ** (Math.floor(Math.log10(km)) - 2); // three figures: 20,200 km, 384,000 km
    return `${(Math.round(km / step) * step).toLocaleString('en-GB')} km`;
  }

  // Real things at their real heights (metres)
  const FACTS = [
    [1.7, '1.7 m', 'Average person'],
    [4.4, '4.4 m', 'Double-decker bus'],
    [5.5, '5.5 m', 'Giraffe'],
    [10, '10 m', 'Olympic high dive'],
    [20, '20 m', 'A cricket pitch stood on end'],
    [30, '30 m', 'Blue whale, nose to tail'],
    [52, '52 m', "Nelson's Column"],
    [96, '96 m', 'Big Ben'],
    [135, '135 m', 'London Eye'],
    [310, '310 m', 'The Shard'],
    [828, '828 m', 'Burj Khalifa, tallest building'],
    [2000, '2 km', 'Fluffy cumulus clouds'],
    [4000, '4 km', 'Skydivers jump from here'],
    [8849, '8,849 m', 'Mount Everest'],
    [11000, '11 km', 'Airliners cruise here'],
    [39000, '39 km', 'Highest balloon skydive'],
    [100e3, '100 km', 'The edge of space'],
    [400e3, '400 km', 'International Space Station'],
    [20200e3, '20,200 km', 'GPS satellites'],
    [35786e3, '35,786 km', 'TV satellites'],
    [192200e3, '192,200 km', 'Halfway to the Moon'],
    [384400e3, '384,400 km', 'The Moon'],
  ].map(([m, big, text], i) => ({ a: altitudeOf(m), big, text: text.toUpperCase(), left: i % 2 === 0 }));

  const INFO_INK = '#14102e';
  const INFO_YELLOW = '#ffe14d';
  // Chunky text with a thick dark outline
  function outlined(text, x, y, size, fill, align = 'left') {
    ctx.font = `800 ${size}px Outfit, "Trebuchet MS", system-ui, sans-serif`;
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    ctx.lineJoin = 'round';
    ctx.lineWidth = size * 0.3;
    ctx.strokeStyle = INFO_INK;
    ctx.strokeText(text, x, y);
    ctx.fillStyle = fill;
    ctx.fillText(text, x, y);
    ctx.textAlign = 'start';
  }

  // Outlined text is slow to draw, so each label is drawn once into a small picture of
  // its own and reused (the readout gets a new one only when its number changes)
  const sprites = new Map();
  function sprite(key, w, h, draw) {
    const k = `${key}@${tileScale}`;
    let c = sprites.get(k);
    if (!c) {
      if (sprites.size > 60) sprites.clear();
      c = document.createElement('canvas');
      c.width = Math.ceil(w * tileScale);
      c.height = Math.ceil(h * tileScale);
      const saved = ctx;
      ctx = c.getContext('2d');
      ctx.setTransform(tileScale, 0, 0, tileScale, 0, 0);
      draw();
      ctx = saved;
      sprites.set(k, c);
    }
    return c;
  }

  // The dashed height lines and their labels (behind the ball)
  function drawFacts(camAlt) {
    FACTS.forEach((f) => {
      const y = screenY(f.a, camAlt);
      if (y < -70 || y > WORLD + 70) return;
      ctx.setLineDash([16, 12]);
      ctx.lineCap = 'butt';
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(WORLD, y);
      ctx.lineWidth = 7;
      ctx.strokeStyle = css(hex(INFO_INK), 0.55);
      ctx.stroke();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
      ctx.setLineDash([]);
      const label = sprite(f.big, 620, 120, () => {
        outlined(f.big, f.left ? 14 : 606, 50, 46, INFO_YELLOW, f.left ? 'left' : 'right');
        outlined(f.text, f.left ? 14 : 606, 98, 23, '#ffffff', f.left ? 'left' : 'right');
      });
      ctx.globalAlpha = clamp01((y - (f.left ? 120 : 100)) / 50); // fade out under the readout and the settings button
      ctx.drawImage(label, f.left ? 10 : WORLD - 650, y - 64, 620, 120);
      ctx.globalAlpha = 1;
    });
  }

  // The height readout (top left) and the climb bar (right edge), on top of everything
  function drawHud() {
    // The readout steps once per hit (from the climb, not the gliding camera)
    const height = formatHeight(realHeight((landed ? GOAL : climb().height) * UNITS_PER_HIT + WORLD / 2));
    const readout = sprite(`height ${height}`, 460, 110, () => {
      outlined('HEIGHT', 14, 34, 20, '#ffffff');
      outlined(height, 14, 82, 50, INFO_YELLOW);
    });
    ctx.drawImage(readout, 10, 10, 460, 110);

    const x = WORLD - 22;
    const top = 120;
    const bottom = WORLD - 28;
    const at = (hits) => bottom - (hits / GOAL) * (bottom - top);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.lineWidth = 16;
    ctx.strokeStyle = INFO_INK;
    ctx.stroke();
    ctx.lineWidth = 8;
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, at(camera));
    ctx.lineTo(x, bottom);
    ctx.strokeStyle = INFO_YELLOW;
    ctx.stroke();
    ctx.lineCap = 'butt';
    STAGES.forEach((s) => { // a notch where each section starts
      if (!s.at) return;
      ctx.fillStyle = INFO_INK;
      ctx.fillRect(x - 8, at(s.at) - 1.5, 16, 3);
    });
    ctx.beginPath();
    ctx.arc(x, at(camera), 9, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = INFO_INK;
    ctx.stroke();
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
    drawFacts(camAlt);

    // Hit effects: a ring opening out under the ball and a fan of sparks
    const accent = paletteOf(stageIndex).accent;
    for (let i = hitFx.length - 1; i >= 0; i--) {
      const f = hitFx[i];
      const t = (now - f.t) / 420;
      if (t >= 1) { hitFx.splice(i, 1); continue; }
      const ease = 1 - (1 - t) ** 3;
      ctx.beginPath();
      ctx.ellipse(f.x, f.y, f.r * (0.5 + 1.3 * ease), f.r * (0.2 + 0.5 * ease), 0, 0, Math.PI * 2);
      ctx.strokeStyle = css(WHITE, 0.6 * (1 - t));
      ctx.lineWidth = 6 * (1 - t) + 1;
      ctx.stroke();
      for (let k = 0; k < 7; k++) {
        const ang = Math.PI * (0.12 + (0.76 * k) / 6) + (hash(k, f.seed) - 0.5) * 0.3;
        const d = f.r * (0.7 + (1.2 + hash(k, f.seed + 1)) * ease);
        ctx.beginPath();
        ctx.arc(f.x + Math.cos(ang) * d, f.y + Math.sin(ang) * d * 0.8 + 60 * t * t, 6 * (1 - t), 0, Math.PI * 2);
        ctx.fillStyle = css(k % 2 ? WHITE : accent, 1 - t);
        ctx.fill();
      }
    }

    // The ball: a plain round white ball, lit from the top left, with a hint of the sky
    const ink = mix(paletteOf(prevStageIndex).ink, paletteOf(stageIndex).ink, e);
    const tint = skyAt(camAlt + WORLD / 2);
    const r = ball.radius;
    ctx.globalAlpha = 1;
    if (!reducedMotion && state === 'playing') { // a faint blur of where it has just been
      for (let k = 4; k >= 1; k--) {
        const was = trail[trail.length - 1 - k * 8];
        if (!was) continue;
        ctx.beginPath();
        ctx.arc(was.x, was.y, r * (1 - k * 0.07), 0, Math.PI * 2);
        ctx.fillStyle = css(WHITE, 0.1 - k * 0.02);
        ctx.fill();
      }
    }
    // It squashes for a moment when hit
    const since = now - ball.lastHit;
    const squash = !reducedMotion && since >= 0 && since < 240 ? Math.sin((since / 240) * Math.PI) * (1 - since / 240) * 0.22 : 0;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1 + squash, 1 - squash);
    const shadow = ctx.createRadialGradient(r * 0.14, r * 0.22, r * 0.55, r * 0.14, r * 0.22, r * 1.28);
    shadow.addColorStop(0, css(ink, 0.22));
    shadow.addColorStop(1, css(ink, 0));
    ctx.beginPath();
    ctx.arc(r * 0.14, r * 0.22, r * 1.28, 0, Math.PI * 2);
    ctx.fillStyle = shadow;
    ctx.fill();
    const body = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.05, 0, 0, r);
    body.addColorStop(0, '#ffffff');
    body.addColorStop(0.55, css(mix(WHITE, tint, 0.07)));
    body.addColorStop(1, css(mix(mix(WHITE, tint, 0.22), ink, 0.3)));
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = body;
    ctx.fill();
    const bounce = ctx.createRadialGradient(r * 0.5, r * 0.6, 0, r * 0.5, r * 0.6, r * 0.75); // light bounced back from below
    bounce.addColorStop(0, css(mix(WHITE, tint, 0.35), 0.5));
    bounce.addColorStop(1, css(WHITE, 0));
    ctx.fillStyle = bounce;
    ctx.fill();
    ctx.beginPath(); // the shine
    ctx.ellipse(-r * 0.38, -r * 0.44, r * 0.2, r * 0.12, -0.7, 0, Math.PI * 2);
    ctx.fillStyle = css(WHITE, 0.9);
    ctx.fill();
    ctx.restore();

    drawHud();
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
  const hitFx = []; // the ring and sparks from recent hits: { x, y, r, t, seed }

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
        if (!reducedMotion) hitFx.push({ x: ball.x, y: ball.y + ball.radius * 0.7, r: ball.radius, t: now, seed: SCORE });
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
