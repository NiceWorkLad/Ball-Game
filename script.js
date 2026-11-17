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

  // The dev build keeps its own saves (dev_ballgame_...), so testing can't touch the real game's
  const COOKIE_PREFIX = 'dev_';
  function getCookie(name) {
    name = COOKIE_PREFIX + name;
    const row = document.cookie.split('; ').find((r) => r.startsWith(name + '='));
    return row ? decodeURIComponent(row.split('=')[1]) : null;
  }

  function setCookie(name, value, days = 365) {
    const maxAge = days * 24 * 60 * 60;
    name = COOKIE_PREFIX + name;
    document.cookie = `${name}=${encodeURIComponent(value)}; max-age=${maxAge}; path=/; SameSite=Lax`;
  }

  // ---------------------------------------------------------------------------
  // Dev options (dev-options branch only). Every knob lives in DEV, with its default
  // and range in DEV_OPTIONS; Settings > Developer is built from this list, so adding
  // an entry here adds a control. Saved in this browser only (localStorage), and
  // only the ones changed from the default. Many of these can break the game: that's the point.
  // ---------------------------------------------------------------------------
  const times = (v) => `\u00d7${(+v).toFixed(2)}`;
  const ms = (v) => `${v} ms`;
  const DEV_OPTIONS = [
    // Physics
    { group: 'Physics', key: 'speed', label: 'Game speed', type: 'range', def: 1, min: 0.1, max: 4, step: 0.05, fmt: times, help: 'Slows or speeds up the whole simulation' },
    { group: 'Physics', key: 'freeze', label: 'Freeze physics', type: 'toggle', def: false },
    { group: 'Physics', key: 'gravity', label: 'Gravity', type: 'range', def: 1, min: 0, max: 5, step: 0.05, fmt: times },
    { group: 'Physics', key: 'gravityAngle', label: 'Gravity angle', type: 'range', def: 0, min: -180, max: 180, step: 5, fmt: (v) => `${v}\u00b0`, help: '0 = down, 90 = right, -90 = left, 180 = up. Hits push against gravity' },
    { group: 'Physics', key: 'moonGravity', label: 'Moon gravity', type: 'range', def: 1 / 6, min: 0.01, max: 1, step: 0.01, fmt: times, help: 'Gravity in the Moon section, as a share of normal' },
    { group: 'Physics', key: 'hitPower', label: 'Hit power', type: 'range', def: 1, min: 0.2, max: 3, step: 0.05, fmt: times },
    { group: 'Physics', key: 'kick', label: 'Sideways kick', type: 'range', def: 1, min: 0, max: 4, step: 0.1, fmt: times },
    { group: 'Physics', key: 'randomness', label: 'Kick randomness', type: 'range', def: -0.05, min: -0.05, max: 1, step: 0.05, fmt: (v) => (v < 0 ? 'Auto' : `${Math.round(v * 100)}%`), help: 'Auto = grows with the score and the section' },
    { group: 'Physics', key: 'sectionDifficulty', label: 'Harder by section', type: 'toggle', def: true, help: 'Each section adds a floor of randomness (when randomness is Auto)' },
    { group: 'Physics', key: 'wallBounce', label: 'Wall bounce', type: 'range', def: 1 / 1.2, min: 0, max: 1.5, step: 0.01, fmt: times },
    { group: 'Physics', key: 'floorBounce', label: 'Floor bounce', type: 'range', def: 0.5, min: 0, max: 1.5, step: 0.01, fmt: times },
    { group: 'Physics', key: 'airDrag', label: 'Air drag', type: 'range', def: 0, min: 0, max: 0.02, step: 0.0005, fmt: (v) => (+v).toFixed(4) },
    { group: 'Physics', key: 'maxSpeed', label: 'Speed limit', type: 'range', def: 0, min: 0, max: 60, step: 1, fmt: (v) => (v > 0 ? v : 'None') },
    { group: 'Physics', key: 'walls', label: 'Side walls', type: 'select', def: 'bounce', choices: [['bounce', 'Bounce'], ['wrap', 'Wrap around'], ['none', 'None']] },
    { group: 'Physics', key: 'ceiling', label: 'Ceiling', type: 'toggle', def: false, help: 'The top of the board bounces like a wall' },
    // Balls
    { group: 'Balls', key: 'ballCount', label: 'Number of balls', type: 'range', def: 1, min: 1, max: 20, step: 1, fmt: (v) => v },
    { group: 'Balls', key: 'radius', label: 'Ball radius', type: 'range', def: 0, min: 0, max: 250, step: 5, fmt: (v) => (v > 0 ? v : 'Auto'), help: 'Auto = the Ball size setting' },
    { group: 'Balls', key: 'collide', label: 'Balls collide', type: 'toggle', def: false },
    { group: 'Balls', key: 'dropRule', label: 'Go ends when', type: 'select', def: 'any', choices: [['any', 'Any ball drops'], ['all', 'All balls drop'], ['never', 'Never']] },
    // Input
    { group: 'Input', key: 'reach', label: 'Hit area', type: 'range', def: 1, min: 0.2, max: 4, step: 0.05, fmt: times },
    { group: 'Input', key: 'cooldown', label: 'Hit cooldown', type: 'range', def: 200, min: 0, max: 1000, step: 10, fmt: ms },
    { group: 'Input', key: 'tapBuffer', label: 'Tap buffer', type: 'range', def: 120, min: 0, max: 500, step: 10, fmt: ms, help: 'A lifted finger still counts for this long' },
    { group: 'Input', key: 'lateTap', label: 'Late tap', type: 'range', def: 80, min: 0, max: 500, step: 10, fmt: ms, help: 'A tap counts if the ball was there this recently' },
    { group: 'Input', key: 'multiTouch', label: 'Several fingers', type: 'toggle', def: false, help: 'Turns off the one-finger-at-a-time rule' },
    { group: 'Input', key: 'autoPlay', label: 'Autoplay', type: 'toggle', def: false, help: 'A bot hits every ball and starts the next go. Best with normal gravity' },
    // Climb
    { group: 'Climb', key: 'climbStep', label: 'Climb per hit', type: 'range', def: 1, min: 1, max: 100, step: 1, fmt: (v) => v },
    { group: 'Climb', key: 'cameraEase', label: 'Camera ease', type: 'range', def: 220, min: 0, max: 3000, step: 20, fmt: (v) => (v > 0 ? ms(v) : 'Snap') },
    // Look
    { group: 'Look', key: 'hud', label: 'Height readout & bar', type: 'toggle', def: true },
    { group: 'Look', key: 'facts', label: 'Height lines', type: 'toggle', def: true },
    { group: 'Look', key: 'trail', label: 'Ball trail', type: 'toggle', def: true },
    { group: 'Look', key: 'squash', label: 'Squash on hit', type: 'toggle', def: true },
    { group: 'Look', key: 'hitFx', label: 'Hit ring & sparks', type: 'toggle', def: true },
    { group: 'Look', key: 'showHitArea', label: 'Show hit areas', type: 'toggle', def: false, help: 'Dashed: mouse reach. Dotted: touch reach' },
    { group: 'Look', key: 'debug', label: 'Debug readout', type: 'toggle', def: false },
    // Sound
    { group: 'Sound', key: 'pitch', label: 'Hit pitch', type: 'range', def: 1, min: 0.25, max: 4, step: 0.05, fmt: times },
  ];
  const DEV_KEY = 'ballgame_dev';
  const DEV = {};
  let savedDev = {};
  try { savedDev = JSON.parse(localStorage.getItem(DEV_KEY)) || {}; } catch (e) { savedDev = {}; }
  DEV_OPTIONS.forEach((o) => {
    const v = savedDev[o.key];
    const ok = typeof v === typeof o.def && (o.type !== 'select' || o.choices.some((c) => c[0] === v));
    DEV[o.key] = ok ? v : o.def;
  });
  const devChanged = (o) => DEV[o.key] !== o.def;
  function saveDev() {
    const out = {};
    DEV_OPTIONS.forEach((o) => { if (devChanged(o)) out[o.key] = DEV[o.key]; });
    try { localStorage.setItem(DEV_KEY, JSON.stringify(out)); } catch (e) { /* private window: just not saved */ }
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

  // The furthest section ever reached, per ball size.
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
      c.height = Math.min(c.height + DEV.climbStep, GOAL);
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

  // How strongly the climb art and height markers show, 0..100 (0 = a plain white board)
  const BACKGROUND_COOKIE = 'ballgame_background';
  const savedBackground = parseInt(getCookie(BACKGROUND_COOKIE), 10);
  let backgroundOpacity = Number.isFinite(savedBackground) ? Math.min(Math.max(savedBackground, 0), 100) : 40;

  // Animations: 'auto' follows the device's reduce-motion setting, 'on' and 'off' override it.
  // `reducedMotion` is what the drawing code checks; the reduce-motion class does the same for CSS.
  const MOTION_COOKIE = 'ballgame_motion';
  const MOTION_CHOICES = [
    { key: 'auto', name: 'Auto' },
    { key: 'on', name: 'On' },
    { key: 'off', name: 'Off' },
  ];
  const motionQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  let motionSetting = MOTION_CHOICES.some((m) => m.key === getCookie(MOTION_COOKIE)) ? getCookie(MOTION_COOKIE) : 'auto';
  let reducedMotion = false;
  function applyMotion() {
    reducedMotion = motionSetting === 'off' || (motionSetting === 'auto' && !!(motionQuery && motionQuery.matches));
    document.documentElement.classList.toggle('reduce-motion', reducedMotion);
  }
  applyMotion();
  if (motionQuery) {
    const onDeviceChange = () => { applyMotion(); if (settingsOpen) renderSettings(); };
    if (motionQuery.addEventListener) motionQuery.addEventListener('change', onDeviceChange);
    else if (motionQuery.addListener) motionQuery.addListener(onDeviceChange);
  }

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
    source.playbackRate.value = (0.95 + stageIndex * 0.025 + Math.random() * 0.15) * DEV.pitch; // slight variety, a little higher each section
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
  const backgroundInput = document.getElementById('background-opacity');
  const backgroundValue = document.getElementById('background-value');
  const sizeList = document.getElementById('size-list');
  const motionList = document.getElementById('motion-list');
  const motionNote = document.getElementById('motion-note');
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

  MOTION_CHOICES.forEach((m) => {
    const b = makeChoice(motionList, m, 'motion-choice', (key) => {
      motionSetting = key;
      setCookie(MOTION_COOKIE, key);
      applyMotion();
      renderSettings();
    });
    b.textContent = m.name;
  });

  // Arrow keys move between options (radio-button behaviour)
  const radioKeys = (list) => list.addEventListener('keydown', (e) => {
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
  radioKeys(sizeList);
  radioKeys(motionList);

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
    backgroundInput.value = backgroundOpacity;
    backgroundValue.textContent = `${backgroundOpacity}%`;
    markChecked(sizeList, sizeKey);
    markChecked(motionList, motionSetting);
    motionNote.textContent = motionSetting === 'auto'
      ? `Following this device: ${reducedMotion ? 'reduce motion is on, so animations are off' : 'animations on'}`
      : `Animations ${reducedMotion ? 'off' : 'on'}, whatever this device is set to`;
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
    resetBall(); // drop the new ball from the middle so you can see its size
    landed = false;
    goToClimb(true); // this size's own climb
    renderSettings();
  }

  function openSettings() {
    if (state === 'playing') pauseGame(); // dev: settings can open mid-go (with the ` key), pausing it
    if (state !== 'ready' && state !== 'over' && state !== 'paused') return;
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
    if (e.key === '`') { // dev: open or close settings at any time
      e.preventDefault();
      if (settingsOpen) closeSettings(); else openSettings();
    }
  });

  soundToggle.addEventListener('click', () => setMuted(!muted));
  volumeInput.addEventListener('input', () => {
    volume = Number(volumeInput.value);
    setCookie(VOLUME_COOKIE, volume);
  });
  backgroundInput.addEventListener('input', () => {
    backgroundOpacity = Number(backgroundInput.value);
    backgroundValue.textContent = `${backgroundOpacity}%`;
    setCookie(BACKGROUND_COOKIE, backgroundOpacity);
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
  // Dev: there can be several balls. Each has its own position, speed and last hit;
  // `ball` is the first one, and also holds the shared gravity and friction.
  const ballRadius = () => (DEV.radius > 0 ? DEV.radius : currentSize().radius);
  const makeBall = () => ({ x: WORLD / 2, y: WORLD / 2, dx: 0, dy: 10, px: WORLD / 2, py: WORLD / 2, radius: ballRadius(), lastHit: -Infinity, dropped: false });
  const ball = Object.assign(makeBall(), { gravity: 0.2, friction: 0.0 });
  const balls = [ball];

  // Gravity on the Moon is about a sixth of Earth's. The hit is softened to match, so
  // the ball rises just as high but hangs in the air about 2.4 times as long.
  const EARTH_GRAVITY = 0.2;
  const HIT_SPEED = 14;
  // (the Moon's 1/6 is DEV.moonGravity in this build)
  const onMoon = () => STAGES[stageIndex].key === 'moon';
  const hitSpeed = () => HIT_SPEED * DEV.hitPower * (onMoon() ? Math.sqrt(DEV.moonGravity) : 1);
  function updateGravity() {
    ball.gravity = EARTH_GRAVITY * DEV.gravity * (onMoon() ? DEV.moonGravity : 1);
  }
  updateGravity();

  // Put every ball back in the air. Several balls are spread across the board,
  // every other one a little higher. b.px/b.py are where each ball was before the
  // latest physics step, used to draw smoothly between steps (see the game loop).
  function resetBall() {
    const n = Math.max(1, Math.round(DEV.ballCount));
    while (balls.length < n) balls.push(makeBall());
    balls.length = n;
    const r = ballRadius();
    balls.forEach((b, i) => {
      b.radius = r;
      b.x = n === 1 ? WORLD / 2 : Math.min(Math.max(r + (WORLD - 2 * r) * (i / (n - 1)), r), WORLD - r);
      b.y = WORLD / 2 - (i % 2) * Math.min(r, 120);
      b.dx = 0;
      b.dy = 10;
      b.px = b.x;
      b.py = b.y;
      b.lastHit = -Infinity;
      b.dropped = false;
    });
    trail.length = 0;
  }

  // ---------------------------------------------------------------------------
  // Art — kept deliberately simple for now: a black wireframe on a white board, with
  // numbers in Bebas Neue and labels in Space Mono.
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

  // Colours. page: the gradient around the board; ink: the lines; accent: buttons.
  // (One set for every section for now; they can differ per section later.)
  const PALETTES = {};
  ['pavement', 'shops', 'apartments', 'skyscrapers', 'birds', 'station', 'void', 'moon'].forEach((key) => {
    PALETTES[key] = { page: ['#161616', '#1e1e1e', '#2a2a2a'], ink: '#111111', accent: '#ffffff' };
  });
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


  // ---------------------------------------------------------------------------
  // The world: one tall strip, 8 sections of 2 boards each, Moon at the top. Heights
  // are "altitude" in world units, measured up from the pavement. The camera follows
  // the climb: each hit moves the world UNITS_PER_HIT (12, about 1/67 of a board), and
  // the camera eases there so the world creeps down past the board.
  // ---------------------------------------------------------------------------
  const SECTION_H = WORLD * 2;
  const WORLD_H = SECTION_H * STAGES.length;
  const UNITS_PER_HIT = (WORLD_H - WORLD) / GOAL;
  // (how quickly the camera catches up with the climb is DEV.cameraEase in this build)
  let camera = climb().height; // the climb height (in hits) the camera is showing
  let lastDrawAt = performance.now();

  const cameraAlt = () => camera * UNITS_PER_HIT; // altitude of the board's bottom edge
  const screenY = (a, camAlt) => WORLD - (a - camAlt);
  const clamp01 = (v) => Math.min(Math.max(v, 0), 1);

  // The board is plain white paper all the way up; the world is drawn on it in black
  // lines. (The page around the board is dark, like a desk under a sheet of paper.)
  const PAPER = '#ffffff';
  const INK = '#111111';
  const INK_SOFT = 'rgba(17,17,17,0.35)'; // secondary lines: floors, bars, far things

  // ---------------------------------------------------------------------------
  // Drawing helpers for the world art: a black wireframe. Near things are filled with
  // paper so they hide what is behind them, then outlined. Everything is placed by
  // altitude `a`, and Y(a) turns that into a y on whatever is being drawn: a tile while
  // it is being built (see Tiles below) or the board itself for the live details.
  // ---------------------------------------------------------------------------
  let artTop = WORLD; // the altitude at the top edge of the canvas being drawn on
  const Y = (a) => artTop - a;

  // A line through points (not closed)
  function line(pts, width = 2, color = INK) {
    ctx.beginPath();
    pts.forEach(([x, a], i) => (i ? ctx.lineTo(x, Y(a)) : ctx.moveTo(x, Y(a))));
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
  }
  // A closed shape: filled with paper (so it hides what's behind), then outlined
  function shape(pts, width = 2, color = INK, fill = PAPER) {
    ctx.beginPath();
    pts.forEach(([x, a], i) => (i ? ctx.lineTo(x, Y(a)) : ctx.moveTo(x, Y(a))));
    ctx.closePath();
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
  }
  // A rectangle: filled with paper and outlined (fill null leaves it see-through)
  function rect(x, a, w, h, width = 2, color = INK, fill = PAPER) {
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fillRect(x, Y(a + h), w, h);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.strokeRect(x, Y(a + h), w, h);
  }
  function circle(x, a, r, width = 2, color = INK, fill = PAPER, dash = null) {
    ctx.beginPath();
    ctx.arc(x, Y(a), r, 0, Math.PI * 2);
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (dash) ctx.setLineDash(dash);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
    if (dash) ctx.setLineDash([]);
  }
  function dot(x, a, r, color = INK) {
    ctx.beginPath();
    ctx.arc(x, Y(a), r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }
  // A window: a frame with a cross of glazing bars
  function pane(x, a, w, h, width = 1.5) {
    rect(x, a, w, h, width);
    line([[x + w / 2, a], [x + w / 2, a + h]], 1, INK_SOFT);
    line([[x, a + h / 2], [x + w, a + h / 2]], 1, INK_SOFT);
  }
  // An awning: a slanted band with a scalloped edge
  function awning(x, a, w, drop, n = 8) {
    const sw = w / n;
    shape([[x, a], [x + w, a], [x + w + 8, a - drop], [x + 8, a - drop]], 2);
    for (let k = 1; k < n; k++) line([[x + k * sw, a], [x + k * sw + 8, a - drop]], 1, INK_SOFT);
    ctx.beginPath();
    for (let k = 0; k < n; k++) {
      ctx.moveTo(x + 8 + (k + 1) * sw, Y(a - drop));
      ctx.arc(x + 8 + k * sw + sw / 2, Y(a - drop), sw / 2, 0, Math.PI);
    }
    ctx.fillStyle = PAPER;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  const DISPLAY = '"Bebas Neue", "Arial Narrow", Impact, sans-serif';
  const MONO = '"Space Mono", ui-monospace, Menlo, monospace';
  function label(text, x, a, size, color = INK, font = DISPLAY) {
    ctx.font = `400 ${size}px ${font}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(text, x, Y(a));
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
  }
  // A soft organic outline (continents, the Moon's seas). Leaves the path open to draw.
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
  // A cloud: the outline of a few overlapping bumps on a flat base. y is the base, on
  // the canvas. (Stroked thick, then filled with paper, so only the outer edge shows.)
  function puff(x, y, w, seed) {
    const n = 4 + Math.floor(hash(seed, 11) * 3);
    const h = w * 0.3;
    ctx.save();
    const path = new Path2D();
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const r = (w / n) * (0.7 + hash(i, seed) * 0.45) * (0.7 + 0.75 * Math.sin(t * Math.PI));
      const px = x - w * 0.42 + t * w * 0.84;
      path.moveTo(px + r, y - r * 0.35);
      path.arc(px, y - r * 0.35, r, 0, Math.PI * 2);
    }
    path.rect(x - w * 0.42, y - h * 0.3, w * 0.84, h * 0.3);
    ctx.beginPath();
    ctx.rect(x - w, y - w, w * 2, w); // nothing below the flat base
    ctx.clip();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 4;
    ctx.stroke(path);
    ctx.fillStyle = PAPER;
    ctx.fill(path);
    ctx.restore();
    // the flat base, between where the outer bumps meet it
    const bump = (i) => (w / n) * (0.7 + hash(i, seed) * 0.45) * (0.7 + 0.75 * Math.sin(((i + 0.5) / n) * Math.PI));
    const x0 = x - w * 0.42 + (0.5 / n) * w * 0.84 - bump(0) * 0.937;
    const x1 = x - w * 0.42 + ((n - 0.5) / n) * w * 0.84 + bump(n - 1) * 0.937;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x1, y);
    ctx.stroke();
  }

  // The street: two rows of buildings either side of a gap of sky, from the pavement
  // up to the rooftops. Storeys get shorter going up (shops 450, flats 200), which is
  // the camera quietly zooming out.
  const LEFT = [0, 290];
  const RIGHT = [510, 800];
  const ROOF = { left: 4620, right: 4380 };

  // ---------------------------------------------------------------------------
  // Static art: drawn once into tiles. Each layer covers altitudes from..to and is
  // only drawn into tiles that overlap it. Order matters: earlier layers are behind.
  // ---------------------------------------------------------------------------
  const STATIC_ART = [
    { name: 'far street', from: 140, to: 3900, draw() {
      // Two faint buildings each side, further down the street
      [[286, 46, 3600], [332, 36, 2500], [438, 34, 3000], [472, 42, 3760]].forEach(([x, w, h]) => rect(x, 140, w, h, 1.2, INK_SOFT, null));
    } },

    { name: 'towers', from: 4200, to: 6460, draw() {
      // The skyline. Each tower is an outline with either floor lines, upright lines or a
      // grid, and some have a narrower block or a mast on top. Drawn tallest first, so
      // shorter towers stand in front of taller ones.
      // [x, width, top, pattern, topping]
      const BASE = 4300;
      // Two clusters with open sky between them, so the ball and score have clear paper
      const towers = [
        [120, 100, 6180, 'grid', 'spire'],
        [580, 90, 5900, 'uprights', 'block'],
        [230, 90, 5600, 'floors', 'block'],
        [680, 110, 5450, 'grid', null], // the crane stands on this one
        [490, 80, 5350, 'floors', 'mast'],
        [20, 90, 5100, 'uprights', null],
        [70, 80, 4750, 'floors', null],
        [620, 90, 4700, 'floors', null],
      ];
      line([[LEFT[1], BASE], [RIGHT[0], BASE]], 1.5); // the far rooftops the towers stand behind
      towers.forEach(([x, w, top, pattern, topping]) => {
        if (topping === 'block') rect(x + w * 0.2, top, w * 0.6, 70, 2);
        if (topping === 'mast') line([[x + w / 2, top], [x + w / 2, top + 130]], 2);
        if (topping === 'spire') line([[x + w * 0.3, top], [x + w / 2, top + 270], [x + w * 0.7, top]], 2);
        rect(x, BASE, w, top - BASE, 2.5);
        if (pattern !== 'uprights') for (let f = top - 60; f > BASE + 20; f -= 60) line([[x, f], [x + w, f]], 1, INK_SOFT); // 4 m floors
        if (pattern !== 'floors') {
          const bays = Math.round(w / 24);
          for (let m = 1; m < bays; m++) line([[x + (m * w) / bays, BASE], [x + (m * w) / bays, top]], 1, INK_SOFT);
        }
      });
      // The crane mast (the jib swings, see the live art)
      line([[729, 5450], [729, 5770]], 2);
      line([[741, 5450], [741, 5770]], 2);
      for (let k = 5450; k < 5770; k += 32) line([[729, k], [741, k + 32]], 1);
    } },

    { name: 'buildings', from: 140, to: 4900, draw() {
      [[LEFT, ROOF.left], [RIGHT, ROOF.right]].forEach(([[x0, x1], top]) => {
        const w = x1 - x0;
        rect(x0 - 4, 140, w + 8, top - 140, 3);
        [760, 1290, 1740, 2190, 2640].forEach((a) => line([[x0, a], [x1, a]], 1.5)); // between storeys
        // Roof: parapet, chimney, aerial
        rect(x0 - 8, top, w + 16, 22, 2.5);
        rect(x0 + 40, top + 22, 36, 80, 2);
        rect(x0 + 36, top + 102, 44, 10, 2);
        line([[x0 + 130, top + 22], [x0 + 130, top + 170]], 2);
        line([[x0 + 108, top + 140], [x0 + 152, top + 140]], 2);
        line([[x0 + 116, top + 160], [x0 + 144, top + 160]], 2);
      });

      // Shopfronts (the Pavement): a café on the left, a greengrocer on the right
      const shop = (x0, doorX, winX, name, size) => {
        pane(winX, 196, 176, 264, 2.5);
        rect(doorX, 146, 62, 280, 2.5);
        pane(doorX + 12, 300, 38, 96, 1.5);
        dot(doorX + (x0 ? 10 : 52), 280, 4);
        rect(x0 + 8, 560, 274, 110, 3);
        label(name, x0 + 145, 610, size);
        awning(x0 + 8, 540, 274, 46);
      };
      shop(0, 210, 22, 'CAFÉ', 84);
      shop(510, 532, 610, 'MARKET', 80);

      // The market floors: tall windows, some with a little awning, some with a flower box
      [840, 1290, 1740, 2190].forEach((a0, fl) => {
        [[LEFT[0] + 40, 0], [LEFT[0] + 162, 1], [RIGHT[0] + 50, 2], [RIGHT[0] + 172, 3]].forEach(([wx, c]) => {
          pane(wx, a0 + 70, 86, 220, 2);
          if ((fl + c) % 2 === 0) awning(wx - 8, a0 + 330, 102, 28, 4);
          else {
            rect(wx - 6, a0 + 40, 98, 22, 2);
            for (let k = 0; k < 5; k++) circle(wx + 6 + k * 20, a0 + 70, 9, 1.5);
          }
        });
      });
      // A hanging bracket sign on the left, and the neon sign board on the right
      line([[284, 1152], [334, 1152]], 3);
      line([[300, 1150], [300, 1060]], 1.5);
      line([[326, 1150], [326, 1060]], 1.5);
      rect(286, 980, 56, 80, 2.5);
      circle(314, 1020, 16, 2);
      rect(512, 1760, 46, 380, 2);

      // The flats: shorter storeys with balconies
      [[LEFT, ROOF.left], [RIGHT, ROOF.right]].forEach(([[x0], top]) => {
        for (let fl = 0; fl < 10; fl++) {
          const a0 = 2700 + fl * 200;
          if (a0 + 120 > top - 60) break;
          for (let c = 0; c < 3; c++) {
            const wx = x0 + 26 + c * 86;
            pane(wx, a0, 54, 96);
            if (c !== 1) { // balcony
              line([[wx - 12, a0 - 4], [wx + 66, a0 - 4]], 2.5);
              line([[wx - 12, a0 + 34], [wx + 66, a0 + 34]], 2);
              for (let b = 0; b < 6; b++) line([[wx - 8 + b * 14, a0 - 4], [wx - 8 + b * 14, a0 + 34]], 1);
            }
          }
        }
      });
    } },

    { name: 'pavement', from: 0, to: 1080, draw() {
      line([[0, 140], [WORLD, 140]], 3);
      line([[0, 128], [WORLD, 128]], 1.5);
      for (let x = 0; x < WORLD; x += 80) line([[x, 0], [x, 128]], 1, INK_SOFT);
      line([[0, 64], [WORLD, 64]], 1, INK_SOFT);
      // Lamp post
      line([[302, 140], [302, 1004]], 3);
      rect(292, 140, 20, 34, 2);
      shape([[272, 1020], [332, 1020], [318, 1054], [286, 1054]], 2);
      rect(284, 1004, 36, 16, 2);
      // Café table and a chair
      line([[70, 304], [180, 304]], 3);
      line([[124, 304], [124, 144]], 2.5);
      line([[98, 144], [152, 144]], 2.5);
      line([[40, 140], [40, 350]], 2);
      line([[78, 140], [78, 246]], 2);
      line([[36, 246], [84, 246]], 2.5);
      // Fruit crates outside the greengrocer
      [[652, 140], [726, 140], [690, 230]].forEach(([cx, a]) => {
        rect(cx, a, 70, 90, 2);
        line([[cx, a + 45], [cx + 70, a + 45]], 1, INK_SOFT);
        for (let f = 0; f < 4; f++) circle(cx + 12 + f * 16, a + 98, 8, 1.5);
      });
      // Bin and bollards
      rect(338, 140, 52, 86, 2);
      line([[332, 228], [396, 228]], 3);
      [460, 492].forEach((x) => rect(x, 140, 16, 66, 2));
    } },

    { name: 'cloud bank', from: 5900, to: 6800, draw() {
      // Low cloud: the join between the Skyscrapers and the Birds & planes (it hides the zoom)
      [[6520, 300], [6440, 330], [6350, 360], [6260, 340], [6170, 300]].forEach(([a, w], row) => {
        for (let i = 0; i < 6; i++) {
          const x = -60 + i * 180 + (row % 2) * 90 + hash(i, row) * 40;
          puff(x, Y(a + hash(i, row + 3) * 40), w + hash(i, row + 6) * 90, i + row * 9);
        }
      });
    } },

    { name: 'the Earth', from: 7700, to: 8480, draw() {
      // The curve of the Earth, with a dashed line for the top of the air
      const R = 5200;
      const cx = WORLD / 2;
      const cy = Y(8150 - R);
      ctx.save();
      ctx.beginPath();
      ctx.rect(-10, Y(8480), WORLD + 20, 780);
      ctx.clip();
      ctx.setLineDash([12, 10]);
      ctx.beginPath();
      ctx.arc(cx, cy, R + 90, 0, Math.PI * 2);
      ctx.strokeStyle = INK_SOFT;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fillStyle = PAPER;
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.clip();
      [[150, 8072, 150, 36, 3], [540, 8086, 190, 30, 5], [330, 8018, 110, 28, 8], [700, 7985, 130, 32, 9], [40, 7965, 110, 30, 12]].forEach(([x, a, rx, ry, seed]) => {
        blobPath(x, Y(a), rx, ry, seed);
        ctx.strokeStyle = INK;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      });
      ctx.restore();
    } },

    { name: 'deep space', from: 8300, to: 12000, draw() {
      // Small crosses for distant stars
      for (let i = 0; i < 260; i++) {
        const a = 8400 + hash(i, 71) * 3600;
        const x = hash(i, 72) * WORLD;
        const s = 2 + hash(i, 75) * 3;
        line([[x - s, a], [x + s, a]], 1, INK_SOFT);
        line([[x, a - s], [x, a + s]], 1, INK_SOFT);
      }
      // Orbits, as dashed arcs
      ctx.setLineDash([12, 10]);
      [8890, 9940].forEach((a) => {
        ctx.beginPath();
        ctx.ellipse(WORLD / 2, Y(a), 900, 60, 0, Math.PI, Math.PI * 2);
        ctx.strokeStyle = INK_SOFT;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      });
      ctx.setLineDash([]);
      // Two distant planets
      circle(650, 10200, 24, 2);
      line([[632, 10208], [668, 10208]], 1, INK_SOFT);
      ctx.beginPath();
      ctx.ellipse(600, Y(10950), 66, 15, -0.25, Math.PI, Math.PI * 2);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      ctx.stroke();
      circle(600, 10950, 36, 2);
      ctx.beginPath();
      ctx.ellipse(600, Y(10950), 66, 15, -0.25, 0, Math.PI);
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
      const step = still(now, 120) * 16;
      line([[px - 8, 282], [px - 12 - step, 140]], 3);
      line([[px + 8, 282], [px + 12 + step, 140]], 3);
      shape([[px - 28, 430], [px + 28, 430], [px + 22, 276], [px - 22, 276]], 2.5);
      circle(px, 468, 24, 2.5);
    } },
    { name: 'pigeons', from: 130, to: 200, draw(now) {
      [[400, 0], [436, 1.3]].forEach(([x, ph]) => {
        const hop = Math.max(0, still(now, 260, ph * 3)) * 10;
        circle(x, 156 + hop, 12, 2);
        circle(x + 12, 170 + hop, 7, 2);
      });
    } },
    { name: 'bunting', from: 1640, to: 2620, draw(now) {
      [1760, 2160, 2560].forEach((a, row) => {
        const sway = still(now, 700, row) * 6;
        ctx.beginPath();
        ctx.moveTo(290, Y(a));
        ctx.quadraticCurveTo(400, Y(a - 84), 510, Y(a));
        ctx.strokeStyle = INK;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        for (let k = 0; k < 9; k++) {
          const x = 290 + k * 24.5;
          const dip = Math.sin((k / 8) * Math.PI) * 40;
          shape([[x, a - dip], [x + 22, a - dip], [x + 11 + sway, a - dip - 34]], 1.5);
        }
      });
    } },
    { name: 'neon sign', from: 1760, to: 2140, draw(now) {
      const on = reducedMotion || hash(Math.floor(now / 140), 3) > 0.08;
      ['O', 'P', 'E', 'N'].forEach((ch, k) => label(ch, 535, 2076 - k * 84, 62, on ? INK : INK_SOFT));
    } },
    { name: 'washing line', from: 3460, to: 3560, draw(now) {
      const flap = still(now, 300) * 5;
      line([[290, 3550], [510, 3550]], 1.5);
      [310, 352, 402, 455].forEach((x, i) => {
        const f = i % 2 ? flap : -flap;
        shape([[x, 3550], [x + 30, 3550], [x + 32 + f, 3490], [x - 2, 3492]], 1.5);
      });
    } },
    { name: 'crane jib', from: 5690, to: 5850, draw(now) {
      ctx.save();
      ctx.translate(735, Y(5770));
      ctx.rotate(still(now, 3000) * 0.12);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-190, 0); ctx.lineTo(50, 0);
      ctx.moveTo(-190, 0); ctx.lineTo(0, -40); ctx.lineTo(50, 0);
      ctx.moveTo(-170, 0); ctx.lineTo(-170, 84);
      ctx.stroke();
      ctx.fillStyle = PAPER;
      ctx.fillRect(22, 0, 26, 18);
      ctx.strokeRect(22, 0, 26, 18);
      ctx.strokeRect(-180, 84, 20, 8);
      ctx.restore();
    } },
    { name: 'warning light', from: 6430, to: 6480, draw(now) {
      const on = reducedMotion || still(now, 400) > 0;
      circle(170, 6456, 6, 2, INK, on ? INK : PAPER);
    } },
    { name: 'drifting clouds', from: 6560, to: 7760, draw(now) {
      [[6720, 250, 0.006, 100, 51], [6900, 190, 0.01, 620, 52], [7080, 300, 0.005, 380, 53], [7260, 170, 0.012, 60, 54],
        [7440, 230, 0.008, 520, 55], [7620, 150, 0.014, 280, 56]].forEach(([a, w, speed, x0, seed]) => {
        puff(crossing(now, speed, WORLD + 500, x0) - 250, Y(a), w, seed);
      });
    } },
    { name: 'flocks', from: 6600, to: 7200, draw(now) {
      [[6800, 0.03, 0], [7140, 0.022, 300]].forEach(([a, s, x0]) => {
        const x = crossing(now, s, WORLD + 600, x0) - 200;
        for (let b = 0; b < 7; b++) {
          const bx = x - Math.abs(b - 3) * 28;
          const ba = a - Math.abs(b - 3) * 18;
          const wing = 8 * (reducedMotion ? 1 : Math.sin(now / 120 + b));
          line([[bx - 14, ba + wing], [bx, ba], [bx + 14, ba + wing]], 2);
        }
      });
    } },
    { name: 'light aircraft', from: 7310, to: 7420, draw(now) {
      const x = crossing(now, 0.05, WORLD + 500, 100) - 200;
      shape([[x - 40, 7350], [x + 40, 7350], [x + 30, 7362], [x - 36, 7362]], 2);
      line([[x, 7356], [x, 7394]], 2);
      line([[x - 38, 7358], [x - 44, 7380]], 2);
    } },
    { name: 'airliner', from: 7690, to: 7810, draw(now) {
      const x = crossing(now, 0.07, WORLD + 900, 500) - 200;
      ctx.setLineDash([14, 10]); // the contrail
      line([[x - 760, 7750], [x - 74, 7750]], 1.5, INK_SOFT);
      ctx.setLineDash([]);
      shape([[x - 70, 7742], [x + 60, 7742], [x + 78, 7750], [x + 60, 7758], [x - 70, 7758]], 2);
      shape([[x - 70, 7758], [x - 54, 7758], [x - 78, 7792]], 2);
      shape([[x - 12, 7750], [x + 14, 7750], [x - 26, 7716]], 2);
    } },
    { name: 'space station', from: 8840, to: 9060, draw(now) {
      ctx.save();
      ctx.translate(400, Y(8950));
      ctx.rotate(-0.08 + still(now, 5000) * 0.05);
      ctx.strokeStyle = INK;
      ctx.fillStyle = PAPER;
      ctx.lineWidth = 2;
      ctx.fillRect(-236, -5, 472, 10);
      ctx.strokeRect(-236, -5, 472, 10);
      [-210, -150, 150, 210].forEach((px) => {
        [[-76, 66], [10, 66]].forEach(([py, ph]) => {
          ctx.fillRect(px - 24, py, 48, ph);
          ctx.strokeRect(px - 24, py, 48, ph);
          ctx.beginPath();
          for (let l = 1; l < 4; l++) { ctx.moveTo(px - 24, py + l * (ph / 4)); ctx.lineTo(px + 24, py + l * (ph / 4)); }
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.lineWidth = 2;
        });
      });
      ctx.fillRect(-62, -18, 124, 36);
      ctx.strokeRect(-62, -18, 124, 36);
      ctx.fillRect(-14, -28, 28, 56);
      ctx.strokeRect(-14, -28, 28, 56);
      ctx.restore();
    } },
    { name: 'satellite', from: 10020, to: 10120, draw(now) {
      rect(560, 10060, 30, 18, 2);
      rect(520, 10064, 36, 10, 1.5);
      rect(594, 10064, 36, 10, 1.5);
      line([[575, 10078], [575, 10092]], 1.5);
      circle(575, 10094, 3.5, 1.5, INK, reducedMotion || still(now, 500) > 0.6 ? INK : PAPER);
    } },
    { name: 'comet', from: 10100, to: 10950, draw(now) {
      const k = reducedMotion ? 0.4 : (now / 9000) % 1;
      const cx = 900 - k * 1100;
      const ca = 10500 + k * 300;
      [-8, 0, 8].forEach((d) => line([[cx + 6, ca + d * 0.5], [cx + 240, ca - 64 + d * 2]], 1, INK_SOFT));
      circle(cx, ca, 7, 2);
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

  // The sun above the rooftops: a dashed circle, so it never looks like the ball
  function drawSun(camAlt) {
    const vis = clamp01((camAlt - 3500) / 900) * clamp01((7800 - camAlt) / 500);
    if (vis <= 0) return;
    const x = 640;
    const y = 120 + (camAlt - 3500) * 0.07;
    ctx.globalAlpha = vis;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.arc(x, y, 40, 0, Math.PI * 2);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  // Twinkling stars above the atmosphere: small crosses (the tiles add fainter ones)
  function drawStars(now, camAlt) {
    const top = camAlt + WORLD;
    const starFrom = WORLD_H * 0.62;
    if (top <= starFrom) return;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 60; i++) {
      const a = starFrom + hash(i, 61) * (WORLD_H - starFrom);
      if (a < camAlt - 10 || a > top + 10) continue;
      const x = hash(i, 62) * WORLD;
      const y = screenY(a, camAlt);
      const r = (5 + hash(i, 63) * 5) * (reducedMotion ? 1 : 0.7 + 0.3 * Math.abs(Math.sin(now / 900 + i * 1.7)));
      ctx.beginPath();
      ctx.moveTo(x - r, y); ctx.lineTo(x + r, y);
      ctx.moveTo(x, y - r); ctx.lineTo(x, y + r);
      ctx.stroke();
    }
  }

  // The Moon grows from a small circle in the Space void to a surface filling the top of
  // the board at 1000. Craters are placed by angle (from the Moon's lowest point) and
  // distance from its centre, so they scale with it.
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
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = PAPER;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    ctx.stroke();
    MOON_CRATERS.forEach(([ang, d, size]) => {
      const cr = r * size;
      if (cr < 1.5) return;
      const x = cx + Math.sin(ang) * r * d;
      const y = cy + Math.cos(ang) * r * d;
      if (y < -cr || y > WORLD + cr || x < -cr || x > WORLD + cr) return;
      const flat = Math.max(Math.sqrt(1 - d * d), 0.3); // craters near the edge look squashed
      ctx.beginPath();
      ctx.ellipse(x, y, cr, cr * flat, -ang, 0, Math.PI * 2);
      ctx.strokeStyle = INK;
      ctx.lineWidth = Math.min(Math.max(cr * 0.04, 1.2), 2.5);
      ctx.stroke();
    });
    // The Earth, rising small behind once you're nearly there
    if (p > 0.5) {
      const e = (p - 0.5) / 0.5;
      const ex = 120;
      const ey = 770 - e * 230;
      ctx.globalAlpha = clamp01(e * 4);
      ctx.beginPath();
      ctx.arc(ex, ey, 36, 0, Math.PI * 2);
      ctx.fillStyle = PAPER;
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.save();
      ctx.clip();
      blobPath(ex - 10, ey - 6, 20, 14, 4);
      ctx.lineWidth = 1.5;
      ctx.stroke();
      blobPath(ex + 18, ey + 16, 14, 9, 6);
      ctx.stroke();
      ctx.restore();
      ctx.globalAlpha = 1;
    }
  }

  // The art's two typefaces are used on the canvas, so make sure they are loaded, then
  // redraw anything that was drawn with a stand-in font
  if (document.fonts && document.fonts.load) {
    Promise.all(['400 40px "Bebas Neue"', '400 20px "Space Mono"', '700 20px "Space Mono"'].map((f) => document.fonts.load(f)))
      .then(() => { tiles.clear(); sprites.clear(); })
      .catch(() => {});
  }

  function drawWorld(now, camAlt) {
    const top = camAlt + WORLD;
    ctx.fillStyle = PAPER;
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

    drawMoon(); // in front of the faint stars, behind the satellite and comet

    // The live details on screen
    artTop = top;
    LIVE_ART.forEach((layer) => { if (layer.to >= camAlt && layer.from <= top) layer.draw(now); });

    manageTiles(camAlt);
  }

  // ---------------------------------------------------------------------------
  // The infographic layer: real heights on top of the art, as measurements. Dashed lines mark real things at their real heights,
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

  // Label text: Bebas Neue for numbers, Space Mono for captions. Black on the white
  // board, with a white edge so it stays readable where it crosses a line.
  function infoText(text, x, y, font, fill = INK, align = 'left') {
    ctx.font = font;
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 6;
    ctx.strokeStyle = PAPER;
    ctx.strokeText(text, x, y);
    ctx.fillStyle = fill;
    ctx.fillText(text, x, y);
    ctx.textAlign = 'start';
  }

  // Each label is drawn once into a small picture of its own and reused (the readout
  // gets a new one only when its number changes)
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
      ctx.setLineDash([10, 8]);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(WORLD, y);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = INK;
      ctx.stroke();
      ctx.setLineDash([]);
      const img = sprite(f.big, 620, 120, () => {
        infoText(f.big, f.left ? 14 : 606, 56, `400 52px ${DISPLAY}`, INK, f.left ? 'left' : 'right');
        infoText(f.text, f.left ? 14 : 606, 96, `400 18px ${MONO}`, INK, f.left ? 'left' : 'right');
      });
      ctx.globalAlpha = clamp01((y - (f.left ? 170 : 110)) / 40); // fade before reaching the readout or the settings button
      ctx.drawImage(img, f.left ? 10 : WORLD - 650, y - 66, 620, 120);
      ctx.globalAlpha = 1;
    });
  }

  // The height readout (top left) and the climb bar (right edge), on top of everything
  function drawHud() {
    // The readout steps once per hit (from the climb, not the gliding camera)
    const height = formatHeight(realHeight((landed ? GOAL : climb().height) * UNITS_PER_HIT + WORLD / 2));
    const readout = sprite(`height ${height}`, 460, 120, () => {
      ctx.font = `400 62px ${DISPLAY}`;
      ctx.fillStyle = PAPER;
      ctx.fillRect(4, 8, ctx.measureText(height.toUpperCase()).width + 24, 100);
      infoText('HEIGHT', 14, 34, `400 18px ${MONO}`);
      infoText(height.toUpperCase(), 14, 92, `400 62px ${DISPLAY}`);
    });
    ctx.drawImage(readout, 10, 10, 460, 120);

    // The climb bar: a ruler with a notch per section
    const x = WORLD - 22;
    const top = 120;
    const bottom = WORLD - 28;
    const at = (hits) => bottom - (hits / GOAL) * (bottom - top);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    STAGES.forEach((s) => { ctx.moveTo(x - 8, at(s.at)); ctx.lineTo(x + 8, at(s.at)); });
    ctx.moveTo(x - 8, top); ctx.lineTo(x + 8, top);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, at(camera));
    ctx.lineTo(x, bottom);
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, at(camera), 7, 0, Math.PI * 2);
    ctx.fillStyle = PAPER;
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }

  function drawBall(alpha = 1) {
    const now = performance.now();

    // Ease the camera towards the climb (on the landing screen it stays on the Moon)
    const target = landed ? GOAL : climb().height;
    const dt = Math.min(Math.max(now - lastDrawAt, 0), 100);
    lastDrawAt = now;
    camera += (target - camera) * (reducedMotion || DEV.cameraEase <= 0 ? 1 : 1 - Math.exp(-dt / DEV.cameraEase));
    if (Math.abs(target - camera) < 0.001) camera = target;
    const camAlt = cameraAlt();

    // The background and the height markers, faded back by the Background setting
    // so the ball and the HUD stand out (at 0 they aren't drawn at all)
    if (backgroundOpacity > 0) {
      drawWorld(now, camAlt);
      if (DEV.facts) drawFacts(camAlt);
    }
    if (backgroundOpacity < 100) {
      ctx.globalAlpha = 1 - backgroundOpacity / 100;
      ctx.fillStyle = PAPER;
      ctx.fillRect(0, 0, WORLD, WORLD);
      ctx.globalAlpha = 1;
    }

    // Hit effects: a ring opening out under the ball and a fan of sparks
    for (let i = hitFx.length - 1; i >= 0; i--) {
      const f = hitFx[i];
      const t = (now - f.t) / 420;
      if (t >= 1) { hitFx.splice(i, 1); continue; }
      const ease = 1 - (1 - t) ** 3;
      ctx.beginPath();
      ctx.ellipse(f.x, f.y, f.r * (0.5 + 1.3 * ease), f.r * (0.2 + 0.5 * ease), 0, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(17,17,17,${(0.7 * (1 - t)).toFixed(3)})`;
      ctx.lineWidth = 3 * (1 - t) + 1;
      ctx.stroke();
      for (let k = 0; k < 7; k++) {
        const ang = Math.PI * (0.12 + (0.76 * k) / 6) + (hash(k, f.seed) - 0.5) * 0.3;
        const d = f.r * (0.7 + (1.2 + hash(k, f.seed + 1)) * ease);
        ctx.beginPath();
        ctx.arc(f.x + Math.cos(ang) * d, f.y + Math.sin(ang) * d * 0.8 + 60 * t * t, 5 * (1 - t) + 1, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(17,17,17,${(1 - t).toFixed(3)})`;
        ctx.fill();
      }
    }

    // The balls: white with a black outline
    ctx.globalAlpha = 1;
    const drawn = balls.map((b) => ({ b, x: b.px + (b.x - b.px) * alpha, y: b.py + (b.y - b.py) * alpha }));
    if (DEV.trail && !reducedMotion && state === 'playing') { // a faint blur of where the first ball has just been
      for (let k = 4; k >= 1; k--) {
        const was = trail[trail.length - 1 - k * 8];
        if (!was) continue;
        ctx.beginPath();
        ctx.arc(was.x, was.y, ball.radius * (1 - k * 0.07), 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(17,17,17,${0.2 - k * 0.04})`;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
    drawn.forEach(({ b, x, y }) => {
      const r = b.radius;
      // It squashes for a moment when hit
      const since = now - b.lastHit;
      const squash = DEV.squash && !reducedMotion && since >= 0 && since < 240 ? Math.sin((since / 240) * Math.PI) * (1 - since / 240) * 0.22 : 0;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(1 + squash, 1 - squash);
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fillStyle = PAPER;
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.restore();
      if (DEV.showHitArea) { // dashed: mouse reach, dotted: touch reach
        [['mouse', [10, 8]], ['touch', [2, 6]]].forEach(([type, dash]) => {
          ctx.beginPath();
          ctx.arc(x, y, reachFor(b, type), 0, Math.PI * 2);
          ctx.setLineDash(dash);
          ctx.strokeStyle = 'rgba(220,40,60,0.8)';
          ctx.lineWidth = 2;
          ctx.stroke();
        });
        ctx.setLineDash([]);
      }
    });

    if (DEV.hud) drawHud();
    drawn.forEach(({ b, x, y }) => drawOffscreenArrow(x, y, b.radius));
  }

  // When the ball is completely above the top of the screen, show an arrow at the
  // top edge that follows it sideways. It shrinks and fades the higher the ball is.
  function drawOffscreenArrow(x, y, radius) {
    const above = -(y + radius); // how far the ball is above the screen
    if (above <= 0) return;

    const t = Math.min(above / WORLD, 1); // 0 = just left the screen, 1 = very high
    const size = 32 - 14 * t;
    const alpha = 0.95 - 0.45 * t;
    const margin = size + 10;
    const ax = Math.min(Math.max(x, margin), WORLD - margin);
    const top = 14;
    ctx.beginPath();
    ctx.moveTo(ax, top);
    ctx.lineTo(ax + size, top + size * 1.1);
    ctx.lineTo(ax, top + size * 0.8);
    ctx.lineTo(ax - size, top + size * 1.1);
    ctx.closePath();
    ctx.fillStyle = `rgba(17,17,17,${alpha.toFixed(3)})`;
    ctx.fill();
  }

  // The gravity angle as a direction: (0, 1) is straight down
  const gravityDir = () => {
    const a = (DEV.gravityAngle * Math.PI) / 180;
    return { gx: Math.sin(a), gy: Math.cos(a) };
  };

  function updateBallPosition(b) {
    const { gx, gy } = gravityDir();
    const r = b.radius;
    b.x += b.dx;
    b.y += b.dy;
    b.dx += ball.gravity * gx;
    b.dy += ball.gravity * gy;
    if (DEV.airDrag > 0) {
      b.dx *= 1 - DEV.airDrag;
      b.dy *= 1 - DEV.airDrag;
    }
    if (DEV.maxSpeed > 0) {
      const speed = Math.hypot(b.dx, b.dy);
      if (speed > DEV.maxSpeed) {
        b.dx *= DEV.maxSpeed / speed;
        b.dy *= DEV.maxSpeed / speed;
      }
    }

    // Walls
    if (DEV.walls === 'bounce') {
      if (b.x + r > WORLD) {
        b.x = WORLD - r;
        b.dx = -b.dx * DEV.wallBounce;
      } else if (b.x - r < 0) {
        b.x = r;
        b.dx = -b.dx * DEV.wallBounce;
      }
    } else if (DEV.walls === 'wrap') { // off one side, on at the other (no smoothing across the jump)
      if (b.x - r > WORLD) { b.x -= WORLD + 2 * r; b.px = b.x; }
      else if (b.x + r < 0) { b.x += WORLD + 2 * r; b.px = b.x; }
    }
    if (DEV.ceiling && b.y - r < 0) {
      b.y = r;
      b.dy = -b.dy * DEV.wallBounce;
    }

    // Floor
    if (b.y + r >= WORLD) {
      b.dx *= ball.friction;
    }
    if (b.y + r > WORLD) {
      b.dy = -b.dy * DEV.floorBounce;
      b.y = WORLD - r;
      // The ball drops (and bounces) until the first hit, as before. Only
      // dropping it after that first hit can end the game (see Go ends when).
      if (state === 'playing' && SCORE >= 0) {
        b.dropped = true;
        checkDropped();
      }
    }
    if (b.y + r >= WORLD && Math.abs(b.dy) < 1) {
      b.dy = 0;
    }
  }

  function checkDropped() {
    if (DEV.dropRule === 'never') return;
    if (DEV.dropRule === 'any' || balls.every((b) => b.dropped)) endGame();
  }

  // Equal-mass elastic bounces between balls (dev: Balls collide)
  function collideBalls() {
    for (let i = 0; i < balls.length; i++) {
      for (let j = i + 1; j < balls.length; j++) {
        const a = balls[i];
        const b = balls[j];
        const ox = b.x - a.x;
        const oy = b.y - a.y;
        const d = Math.hypot(ox, oy);
        const min = a.radius + b.radius;
        if (d === 0 || d >= min) continue;
        const nx = ox / d;
        const ny = oy / d;
        const push = (min - d) / 2;
        a.x -= nx * push; a.y -= ny * push;
        b.x += nx * push; b.y += ny * push;
        const closing = (b.dx - a.dx) * nx + (b.dy - a.dy) * ny;
        if (closing < 0) {
          a.dx += closing * nx; a.dy += closing * ny;
          b.dx -= closing * nx; b.dy -= closing * ny;
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Input — pointer events cover mouse, touch and pen in one go.
  // One finger (or a held mouse button) at a time can hit the ball.
  // ---------------------------------------------------------------------------
  const activePointers = new Map(); // pointerId -> pointer info (see addPointer)
  // (the hit cooldown is DEV.cooldown in this build)

  // Touch is less precise than a mouse, and the ball is fast, so touch is more forgiving:
  //  - a bigger hit area (a fingertip covers the ball it is trying to hit)
  //  - a tap counts if the ball arrives within TAP_BUFFER_MS after the finger lifts
  //  - a tap counts if the ball was there within the last LATE_TAP_MS (late taps)
  //  - a quick swipe counts even if it jumps over the ball between two move events
  const HIT_SCALE = { mouse: 1.05, pen: 1.3, touch: 1.7 }; // multiples of the ball radius
  // (the tap buffer and late tap times are DEV.tapBuffer and DEV.lateTap in this build)
  // The extra reach is a fixed margin around the ball, so bigger balls don't get a giant hit area
  const reachFor = (b, type) => (b.radius + BASE_RADIUS * ((HIT_SCALE[type] || HIT_SCALE.mouse) - 1)) * DEV.reach;
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
    const floor = DEV.sectionDifficulty ? SECTION_RANDOMNESS[stageIndex] || 0 : 0;
    const randomness = DEV.randomness >= 0 ? DEV.randomness : floor + (1 - floor) * inGo;
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
    // (dev: Several fingers turns this off)
    if (!DEV.multiTouch) {
      if ([...activePointers.values()].some((p) => p.releasedAt === null)) return;
      activePointers.clear();
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
    else p.releasedAt = performance.now(); // a lifted finger's tap lingers for DEV.tapBuffer
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
      if (p.releasedAt !== null && now - p.releasedAt > DEV.tapBuffer) activePointers.delete(id);
    }

    // Each ball can be hit once per touch; with several balls one tap can hit more than one
    for (const b of balls) {
      if (now - b.lastHit < DEV.cooldown) continue;
      for (const p of activePointers.values()) {
        const reach = reachFor(b, p.type);
        let hit = distToSegment(b.x, b.y, p.px, p.py, p.x, p.y) <= reach;

        // Late tap: the finger came down just after the ball passed where it landed
        // (only the first ball keeps a trail)
        if (!hit && fresh && p.type === 'touch' && b === ball) {
          hit = trail.some((t) => t.t >= now - DEV.lateTap && Math.hypot(p.x - t.x, p.y - t.y) <= reach);
        }

        if (hit) {
          // The offset across the ball, measured at right angles to gravity
          const { gx, gy } = gravityDir();
          hitBall(b, (p.x - b.x) * gy - (p.y - b.y) * gx, now);
          if (state !== 'playing') return; // that hit reached the Moon
          break;
        }
      }
    }
  }

  // Send a ball back up (against gravity). `offset` is how far off-centre it was hit.
  function hitBall(b, offset, now) {
    // Keep the sideways kick in the same range as a mouse hit, however wide the hit area
    const limit = b.radius * HIT_SCALE.mouse;
    offset = Math.max(-limit, Math.min(limit, offset));
    // Scaled to the ball's size, so hitting the edge of a big ball kicks it as much as a normal one
    const side = -(offset * BASE_RADIUS / b.radius) * hitMultiplier(SCORE) / 10 * DEV.kick;
    const up = hitSpeed();
    // The usual (side, -up), turned so that "up" is against gravity
    const { gx, gy } = gravityDir();
    b.dx = side * gy - up * gx;
    b.dy = -side * gx - up * gy;
    b.lastHit = now;
    b.dropped = false;
    if (DEV.hitFx && !reducedMotion) hitFx.push({ x: b.x, y: b.y + b.radius * 0.7, r: b.radius, t: now, seed: SCORE });
    setScore(SCORE + 1);
    playHitSound();
    climbHit(); // last: reaching 1000 ends the climb
  }

  // Dev: Autoplay. A pretend finger hits each ball as it falls into the bottom third,
  // a little off-centre, and starts the next go after a drop.
  function autoPlay(now) {
    if (settingsOpen) return;
    if (state === 'ready' || (state === 'over' && now - gameOverAt > 800)) { startGame(); return; }
    if (state !== 'playing') return;
    for (const b of balls) {
      if (b.dy > 0 && b.y > WORLD * 0.68 && now - b.lastHit >= DEV.cooldown) {
        hitBall(b, (Math.random() - 0.5) * b.radius * 0.8, now);
        if (state !== 'playing') return;
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
    accumulator += Math.min(Math.max(now - lastTime, 0), 100) * DEV.speed;
    lastTime = now;
    if (DEV.autoPlay) autoPlay(now);

    if (state === 'ready' || state === 'paused' || DEV.freeze) accumulator = 0; // frozen

    while (accumulator >= STEP_MS) {
      checkHits(now);
      if (DEV.autoPlay) autoPlay(now);
      for (const b of balls) {
        b.px = b.x;
        b.py = b.y;
        updateBallPosition(b);
      }
      if (DEV.collide && balls.length > 1) collideBalls();
      trail.push({ t: now, x: ball.x, y: ball.y });
      accumulator -= STEP_MS;
    }
    while (trail.length && trail[0].t < now - 250) trail.shift();

    // Draw part-way between the last two physics steps. A 60Hz screen gets 4 or 5
    // steps per frame, so without this the motion looks slightly uneven.
    drawBall(accumulator / STEP_MS);
    updateDebug(now);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // ---------------------------------------------------------------------------
  // Dev panel: Settings > Developer, built from DEV_OPTIONS
  // ---------------------------------------------------------------------------
  const devGroups = document.getElementById('dev-groups');
  const devRows = {}; // key -> { row, input, out }
  const devSummaries = {}; // group -> summary element

  // What has to happen when an option changes, beyond the game reading DEV
  function onDevChange(key) {
    if (key === 'gravity' || key === 'moonGravity') updateGravity();
    if (key === 'ballCount' || key === 'radius') resetBall();
    if (key === 'autoPlay' && !DEV.autoPlay) activePointers.clear();
  }

  function setDev(key, value) {
    DEV[key] = value;
    saveDev();
    onDevChange(key);
    renderDev();
  }

  [...new Set(DEV_OPTIONS.map((o) => o.group))].forEach((group) => {
    const box = document.createElement('details');
    box.className = 'dev-group';
    const summary = document.createElement('summary');
    box.appendChild(summary);
    devSummaries[group] = summary;
    DEV_OPTIONS.filter((o) => o.group === group).forEach((o) => {
      const id = `dev-${o.key}`;
      const row = document.createElement('div');
      row.className = `dev-row dev-${o.type}`;
      const name = document.createElement('label');
      name.className = 'dev-name';
      name.htmlFor = id;
      name.textContent = o.label;
      let input;
      if (o.type === 'range') {
        input = document.createElement('input');
        input.type = 'range';
        Object.assign(input, { min: o.min, max: o.max, step: o.step });
        input.addEventListener('input', () => setDev(o.key, Number(input.value)));
      } else if (o.type === 'toggle') {
        input = document.createElement('input');
        input.type = 'checkbox';
        input.addEventListener('change', () => setDev(o.key, input.checked));
      } else {
        input = document.createElement('select');
        o.choices.forEach(([value, text]) => input.add(new Option(text, value)));
        input.addEventListener('change', () => setDev(o.key, input.value));
      }
      input.id = id;
      input.className = 'dev-input';
      const out = document.createElement('output');
      out.className = 'dev-value';
      out.htmlFor = id;
      const reset = document.createElement('button');
      reset.type = 'button';
      reset.className = 'dev-reset-one';
      reset.textContent = '\u21ba';
      reset.title = reset.ariaLabel = `Reset ${o.label}`;
      reset.addEventListener('click', () => setDev(o.key, o.def));
      row.append(name, input, out, reset);
      if (o.help) {
        const help = document.createElement('p');
        help.className = 'dev-help';
        help.textContent = o.help;
        row.appendChild(help);
      }
      box.appendChild(row);
      devRows[o.key] = { row, input, out };
    });
    devGroups.appendChild(box);
  });

  // Climb: jump straight to any height (for this ball size's climb)
  const jumpInput = document.getElementById('dev-jump');
  const jumpValue = document.getElementById('dev-jump-value');
  jumpInput.max = GOAL;
  jumpInput.addEventListener('input', () => { jumpValue.textContent = `${jumpInput.value} \u00b7 ${STAGES[stageFor(+jumpInput.value)].name}`; });
  document.getElementById('dev-jump-go').addEventListener('click', () => {
    const h = Math.min(Math.max(Math.round(+jumpInput.value), 0), GOAL - 1);
    climb().height = h;
    saveClimb();
    const i = stageFor(h);
    if (i > furthestStage[sizeKey]) {
      furthestStage[sizeKey] = i;
      setCookie(stageCookie(sizeKey), i);
    }
    landed = false;
    goToClimb(true);
    renderSettings();
  });
  document.getElementById('dev-end-go').addEventListener('click', () => {
    if (state === 'playing' || state === 'paused') endGame();
    closeSettings();
  });
  document.getElementById('dev-reset').addEventListener('click', () => {
    DEV_OPTIONS.forEach((o) => { DEV[o.key] = o.def; });
    saveDev();
    updateGravity();
    resetBall();
    renderDev();
  });

  function renderDev() {
    let changed = 0;
    DEV_OPTIONS.forEach((o) => {
      const { row, input, out } = devRows[o.key];
      const v = DEV[o.key];
      if (o.type === 'toggle') input.checked = v;
      else input.value = v;
      out.textContent = o.type === 'range' ? o.fmt(v) : o.type === 'toggle' ? (v ? 'On' : 'Off') : '';
      row.classList.toggle('changed', devChanged(o));
      if (devChanged(o)) changed++;
    });
    Object.entries(devSummaries).forEach(([group, summary]) => {
      const n = DEV_OPTIONS.filter((o) => o.group === group && devChanged(o)).length;
      summary.textContent = n ? `${group} \u00b7 ${n} changed` : group;
    });
    document.getElementById('dev-reset').disabled = changed === 0;
    document.body.classList.toggle('dev-changed', changed > 0);
    document.getElementById('dev-badge').textContent = changed ? `DEV \u00b7 ${changed} changed` : 'DEV';
    jumpInput.value = landed ? 0 : climb().height;
    jumpValue.textContent = `${jumpInput.value} \u00b7 ${STAGES[stageFor(+jumpInput.value)].name}`;
    document.getElementById('dev-end-go').disabled = !(state === 'playing' || state === 'paused');
    debugBox.hidden = !DEV.debug;
  }

  // Debug readout: frame rate, state, climb and each ball, updated a few times a second
  const debugBox = document.getElementById('dev-readout');
  let debugFrames = 0;
  let debugSince = performance.now();
  function updateDebug(now) {
    debugFrames++;
    if (!DEV.debug || now - debugSince < 200) return;
    const fps = (debugFrames * 1000) / (now - debugSince);
    debugFrames = 0;
    debugSince = now;
    const f = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : String(v));
    const lines = [
      `fps ${f(fps, 0)} · speed ${f(DEV.speed, 2)}${DEV.freeze ? ' (frozen)' : ''}`,
      `${state} · score ${SCORE} · ${sizeKey}`,
      `climb ${climb().height}/${GOAL} · goes ${climb().goes} · cam ${f(camera, 2)}`,
      `section ${stageIndex} ${STAGES[stageIndex].name}`,
      `gravity ${f(ball.gravity, 3)} @ ${DEV.gravityAngle}\u00b0 · tiles ${tiles.size}`,
      ...balls.slice(0, 6).map((b, i) => `#${i + 1} ${f(b.x, 0)},${f(b.y, 0)} v ${f(b.dx)},${f(b.dy)}${b.dropped ? ' down' : ''}`),
    ];
    if (balls.length > 6) lines.push(`+${balls.length - 6} more`);
    debugBox.textContent = lines.join('\n');
  }

  renderDev();
  resetBall(); // picks up a saved ball count or radius
  const renderSettingsBase = renderSettings;
  renderSettings = function renderSettingsWithDev() { renderSettingsBase(); renderDev(); };

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
