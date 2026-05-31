// sketch.js

let phase = PHASE_LOBBY;
let gameTimer = 0;
let betrayalTriggered = false;
let winner = null;
let soloTimer = 0;
let deadPlayerId = null;
let betrayalAnnounceFade = 0;
let showHowto = false;

// ── 아이디 / 계정 시스템
let accounts = {};
let currentUserId = null;

// lobby 서브 상태
let lobbySubState = 'main';
let inputBuffer = '';
let inputError  = '';

let highScore = 0;
let isNewHighScore = false;

// ── 승리 애니메이션 (픽셀 스캐터 방식)
let fillAnimActive = false;
let fillAnimRow = 0;
const FILL_SPEED = 2;
let pixelFillQueue = [];
let pixelFillDone = new Set();
let pixelFillColor = '';
const PIXEL_FILL_PER_FRAME = 55;

// ── 혈흔 파티클 (로비 효과)
let bloodDrops = [];

// ── 사운드 시스템 (Web Audio API)
let audioCtx = null;

function getAudioCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}

// 좀비 으르렁 소리 (게임 시작/재시작) - 더 끔찍하고 좀비다운 소리
function playZombieRoar() {
  try {
    const ctx = getAudioCtx();
    const now = ctx.currentTime;

    // 1. 낮고 거친 으르렁 (메인)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    const dist = ctx.createWaveShaper();
    const curve = new Float32Array(512);
    for (let i = 0; i < 512; i++) {
      const x = (i * 2) / 512 - 1;
      curve[i] = (Math.PI + 400) * x / (Math.PI + 400 * Math.abs(x));
    }
    dist.curve = curve;
    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(60, now);
    osc1.frequency.linearRampToValueAtTime(40, now + 0.3);
    osc1.frequency.linearRampToValueAtTime(75, now + 0.7);
    osc1.frequency.linearRampToValueAtTime(30, now + 1.4);
    gain1.gain.setValueAtTime(0, now);
    gain1.gain.linearRampToValueAtTime(0.5, now + 0.08);
    gain1.gain.setValueAtTime(0.45, now + 1.0);
    gain1.gain.linearRampToValueAtTime(0, now + 1.5);
    osc1.connect(dist); dist.connect(gain1); gain1.connect(ctx.destination);
    osc1.start(now); osc1.stop(now + 1.5);

    // 2. 숨소리 / 헐떡임 (노이즈)
    const bufSize = ctx.sampleRate * 1.2;
    const buffer = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * 0.6;
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const bandpass = ctx.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.setValueAtTime(300, now);
    bandpass.frequency.linearRampToValueAtTime(150, now + 1.2);
    bandpass.Q.value = 0.8;
    const gainN = ctx.createGain();
    gainN.gain.setValueAtTime(0, now);
    gainN.gain.linearRampToValueAtTime(0.18, now + 0.15);
    gainN.gain.linearRampToValueAtTime(0.05, now + 0.6);
    gainN.gain.linearRampToValueAtTime(0.2, now + 0.9);
    gainN.gain.linearRampToValueAtTime(0, now + 1.3);
    noise.connect(bandpass); bandpass.connect(gainN); gainN.connect(ctx.destination);
    noise.start(now); noise.stop(now + 1.4);

    // 3. 높은 끽 소리 (좀비 비명 느낌)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'square';
    osc2.frequency.setValueAtTime(220, now + 0.5);
    osc2.frequency.linearRampToValueAtTime(110, now + 1.0);
    gain2.gain.setValueAtTime(0, now + 0.5);
    gain2.gain.linearRampToValueAtTime(0.08, now + 0.55);
    gain2.gain.linearRampToValueAtTime(0, now + 1.1);
    osc2.connect(gain2); gain2.connect(ctx.destination);
    osc2.start(now + 0.5); osc2.stop(now + 1.2);
  } catch(e) {}
}

// 분위기 있는 주기적 좀비 소리
let ambientTimer = 0;
const AMBIENT_INTERVAL = 300; // 10초마다

function playAmbientGroan() {
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(80, ctx.currentTime + 0.8);
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.08, ctx.currentTime + 0.1);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.0);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 1.0);
  } catch(e) {}
}

// 에너지드링크 마시는 소리 (꿀꺽꿀꺽)
function playSoundDrink() {
  try {
    const ctx = getAudioCtx();
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      const t = ctx.currentTime + i * 0.15;
      osc.frequency.setValueAtTime(600, t);
      osc.frequency.linearRampToValueAtTime(300, t + 0.1);
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.15, t + 0.02);
      gain.gain.linearRampToValueAtTime(0, t + 0.12);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(t); osc.stop(t + 0.15);
    }
  } catch(e) {}
}

// 좋은 아이템 획득 소리 (번쩍번쩍)
function playSoundPowerup() {
  try {
    const ctx = getAudioCtx();
    const freqs = [523, 659, 784, 1047];
    freqs.forEach((f, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      const t = ctx.currentTime + i * 0.08;
      osc.frequency.setValueAtTime(f, t);
      gain.gain.setValueAtTime(0.12, t);
      gain.gain.linearRampToValueAtTime(0, t + 0.1);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(t); osc.stop(t + 0.12);
    });
  } catch(e) {}
}

// 좀비 아이템 소리 (으으으)
function playSoundZombie() {
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(100, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(60, ctx.currentTime + 0.5);
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.6);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.6);
  } catch(e) {}
}

// ── 플레이어 픽셀맵 (8열 × 9행)
const _PMAP = [
  [0,0,1,1,1,1,0,0],
  [0,1,1,1,1,1,1,0],
  [0,1,2,1,1,2,1,0],
  [0,1,3,1,1,3,1,0],
  [0,1,1,1,1,1,1,0],
  [0,1,1,1,1,1,1,0],
  [1,1,0,1,1,0,1,1],
  [0,1,1,0,0,1,1,0],
  [0,1,1,0,0,1,1,0],
];

// 좀비 픽셀맵 (8열 × 9행)
const _ZMAP = [
  [0,0,1,1,1,1,0,0],
  [0,1,1,1,1,1,1,0],
  [0,1,2,1,1,2,1,0],
  [0,1,3,1,1,3,1,0],
  [0,1,1,1,1,1,1,0],
  [0,1,4,1,1,4,1,0],
  [1,1,0,1,1,0,1,1],
  [0,1,1,0,0,1,1,0],
  [0,1,1,0,0,1,1,0],
];

// 얼굴만 (위 5행)
const _PFACE = [
  [0,0,1,1,1,1,0,0],
  [0,1,1,1,1,1,1,0],
  [0,1,2,1,1,2,1,0],
  [0,1,3,1,1,3,1,0],
  [0,1,1,1,1,1,1,0],
];

const _ZFACE = [
  [0,0,1,1,1,1,0,0],
  [0,1,1,1,1,1,1,0],
  [0,1,2,1,1,2,1,0],
  [0,1,3,1,1,3,1,0],
  [0,1,1,1,1,1,1,0],
];

function _drawPMap(p, map, ox, oy, ps, c1, c2, c3, c4, flipH) {
  p.noStroke();
  const COLS8 = map[0].length;
  for (let r = 0; r < map.length; r++) {
    for (let c = 0; c < COLS8; c++) {
      const col = flipH ? COLS8 - 1 - c : c;
      const v = map[r][col];
      if (v === 0) continue;
      if      (v === 1) p.fill(c1);
      else if (v === 2) p.fill(c2);
      else if (v === 3) p.fill(c3);
      else if (v === 4) p.fill(c4);
      p.rect(ox + c * ps, oy + r * ps, ps, ps);
    }
  }
}

function _drawKey(p, label, x, y, w, h, col) {
  p.fill(18, 18, 26);
  p.stroke(col);
  p.strokeWeight(1.5);
  p.rect(x, y, w, h, 4);
  p.noStroke();
  p.fill(col);
  p.textSize(11);
  p.textAlign(p.CENTER, p.CENTER);
  p.text(label, x + w / 2, y + h / 2);
}

function setup() {
  createCanvas(CANVAS_W, CANVAS_H);
  frameRate(FRAME_RATE);
  textFont('Nunito');
  resetGame();
  _initBloodDrops();
}

function _initBloodDrops() {
  bloodDrops = [];
  // 정적인 핏자국 스플래터 생성
  for (let i = 0; i < 22; i++) {
    bloodDrops.push(_newBloodSplatter());
  }
}

function _newBloodSplatter() {
  return {
    x: Math.random() * CANVAS_W,
    y: Math.random() * CANVAS_H,
    size: 6 + Math.random() * 22,
    alpha: 40 + Math.random() * 90,
    // 스플래터 타입: 0=원형, 1=타원, 2=작은 방울 무리
    type: Math.floor(Math.random() * 3),
    angle: Math.random() * Math.PI * 2,
    drips: Math.floor(Math.random() * 4), // 흘러내리는 방울 수
    dripOffsets: Array.from({length: 4}, () => ({
      ox: (Math.random() - 0.5) * 20,
      oy: Math.random() * 25 + 5,
      size: 2 + Math.random() * 6
    }))
  };
}

function resetGame() {
  initGrid();
  initZombies();
  initPlayers();
  initTiles(this);
  gameTimer = GAME_TOTAL_TIME * FRAME_RATE;
  betrayalTriggered = false;
  winner = null;
  betrayalAnnounceFade = 0;
  soloTimer = 0;
  deadPlayerId = null;
  notifications = [];
  phase = PHASE_LOBBY;
  isNewHighScore = false;
  showHowto = false;
  fillAnimActive = false;
  fillAnimRow = 0;
  lobbySubState = 'main';
  inputBuffer = '';
  inputError = '';
  ambientTimer = 0;
}

function draw() {
  background(COLOR_EMPTY);
  if (phase === PHASE_LOBBY) { drawLobby(this); return; }

  // 게임 중 주기적 좀비 소리
  if (phase !== PHASE_END) {
    ambientTimer++;
    if (ambientTimer >= AMBIENT_INTERVAL) {
      ambientTimer = 0;
      playAmbientGroan();
    }
  }

  if (phase === PHASE_END) {
    drawGrid(this); drawZombies(this);
    playerA.draw(this); playerB.draw(this);

    if (fillAnimActive) {
      _drawFillAnim(this);
      return;
    }

    drawResultScreen(this, countTiles(), winner, highScore, isNewHighScore);
    return;
  }

  if (betrayalAnnounceFade > 0) {
    drawGrid(this); drawTiles(this); drawZombies(this);
    playerA.draw(this); playerB.draw(this);
    drawBetrayalAnnounce(this);
    drawUI(this, phase, gameTimer / FRAME_RATE, countTiles());
    return;
  }

  gameTimer--;
  const timeLeftSec = gameTimer / FRAME_RATE;
  if (!betrayalTriggered && timeLeftSec <= BETRAYAL_TRIGGER_TIME) _triggerBetrayal();

  if (phase === PHASE_SOLO) {
    soloTimer--;
    if (soloTimer <= 0) _reviveDeadPlayer();
  }

  updateTiles(this);
  updateZombies([playerA, playerB], this);
  if (playerA.alive) playerA.update(playerB, zombies, phase, this);
  if (playerB.alive) playerB.update(playerA, zombies, phase, this);

  _checkEndConditions(timeLeftSec);

  drawGrid(this); drawTiles(this); drawZombies(this);
  playerA.draw(this); playerB.draw(this);
  drawBetrayalAnnounce(this);
  drawUI(this, phase, timeLeftSec, countTiles());
}

function _drawFillAnim(p) {
  // 이번 프레임에 채울 칸들 처리
  let filled = 0;
  while (pixelFillQueue.length > 0 && filled < PIXEL_FILL_PER_FRAME) {
    const idx = pixelFillQueue.pop();
    const r = Math.floor(idx / COLS);
    const c = idx % COLS;
    pixelFillDone.add(idx);
    filled++;
  }

  // 이미 채워진 칸 그리기
  p.noStroke();
  for (const idx of pixelFillDone) {
    const r = Math.floor(idx / COLS);
    const c = idx % COLS;
    // 픽셀 노이즈 느낌: 살짝 밝기 변화
    const flicker = Math.sin(idx * 7.3 + p.frameCount * 0.3) * 18;
    const col = p.color(pixelFillColor);
    p.fill(
      Math.min(255, Math.max(0, p.red(col) + flicker)),
      Math.min(255, Math.max(0, p.green(col) + flicker)),
      Math.min(255, Math.max(0, p.blue(col) + flicker))
    );
    p.rect(c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);
  }

  if (pixelFillQueue.length === 0) {
    fillAnimActive = false;
  }
}

function _triggerBetrayal() {
  betrayalTriggered = true;
  phase = PHASE_BETRAYAL;

  const midC = Math.floor(COLS / 2);
  const midR = Math.floor(ROWS / 2);

  // 플레이어 부활 위치 설정
  if (!playerA.alive) playerA.revive(midR - 3, midC - 5, OWNER_A);
  if (!playerB.alive) playerB.revive(midR + 3, midC + 5, OWNER_B);

  // ── 핵심 수정: TEAM 땅만 반반 분할, 나머지(NONE, ZOMBIE)는 그대로 유지
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (grid[r][c].owner === OWNER_TEAM) {
        grid[r][c].owner = c < midC ? OWNER_A : OWNER_B;
        grid[r][c].dirty = true;
      }
      // OWNER_NONE, OWNER_ZOMBIE 는 건드리지 않음
    }
  }

  playerA.setPhase(PHASE_BETRAYAL);
  playerB.setPhase(PHASE_BETRAYAL);
  for (const t of playerA.tail) setOwner(t.r, t.c, OWNER_A);
  for (const t of playerB.tail) setOwner(t.r, t.c, OWNER_B);
  showBetrayalAnnounce(this);
}

function _checkEndConditions(timeLeftSec) {
  if (gameTimer <= 0) { _endGame('timer'); return; }
  if (!playerA.alive && !playerB.alive) { _endGame('both_dead'); return; }
  if (phase === PHASE_COOP) {
    if (!playerA.alive || !playerB.alive) {
      phase = PHASE_SOLO;
      deadPlayerId = !playerA.alive ? 'A' : 'B';
      soloTimer = SOLO_TIME_LIMIT * FRAME_RATE;
      const survivor = deadPlayerId === 'A' ? 'B' : 'A';
      showNotification(survivor, `P${deadPlayerId} 사망! ${SOLO_TIME_LIMIT}초 후 부활 & 배신 30초!`, '#FF9800');
    }
  }
  if (phase === PHASE_BETRAYAL) {
    if (!playerA.alive && playerB.alive) { winner = 'B'; _endGame('elimination'); return; }
    if (!playerB.alive && playerA.alive) { winner = 'A'; _endGame('elimination'); return; }
  }
}

function _reviveDeadPlayer() {
  const midR = Math.floor(ROWS / 2);
  const midC = Math.floor(COLS / 2);
  const survivor = deadPlayerId === 'A' ? playerB : playerA;
  const dead = deadPlayerId === 'A' ? playerA : playerB;
  const deadSpawnR = midR + (deadPlayerId === 'A' ? -3 : 3);

  // TEAM 땅만 절반 분할 (NONE, ZOMBIE 는 그대로)
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (grid[r][c].owner === OWNER_TEAM) {
        grid[r][c].owner = c < midC ? OWNER_A : OWNER_B;
        grid[r][c].dirty = true;
      }
    }
  }

  dead.revive(deadSpawnR, midC - (deadPlayerId === 'A' ? 5 : -5), deadPlayerId === 'A' ? OWNER_A : OWNER_B);
  gameTimer = EMERGENCY_BETRAYAL_TIME * FRAME_RATE;
  betrayalTriggered = true;
  phase = PHASE_BETRAYAL;
  playerA.setPhase(PHASE_BETRAYAL);
  playerB.setPhase(PHASE_BETRAYAL);
  deadPlayerId = null;
  showBetrayalAnnounce(this);
  showNotification('A', '부활! 배신 타이머 30초 발동!', '#FF5252');
}

function _endGame(reason) {
  phase = PHASE_END;
  const counts = countTiles();
  if (reason === 'timer') {
    if (playerA.alive && playerB.alive) {
      if (counts.A > counts.B) winner = 'A';
      else if (counts.B > counts.A) winner = 'B';
      else winner = 'draw';
    } else if (playerA.alive) { winner = 'A'; }
    else if (playerB.alive)   { winner = 'B'; }
    else                      { winner = 'zombie'; }
  } else if (reason === 'both_dead') {
    winner = 'zombie';
  } else if (reason === 'elimination') {
    // already set
  }

  if (!betrayalTriggered) {
    winner = 'zombie';
  }

  const best = Math.max(counts.A, counts.B, counts.team);
  if (currentUserId) {
    if (!accounts[currentUserId]) accounts[currentUserId] = { highScore: 0 };
    if (best > accounts[currentUserId].highScore) {
      accounts[currentUserId].highScore = best;
      isNewHighScore = true;
    }
    highScore = accounts[currentUserId].highScore;
  } else {
    if (best > highScore) { highScore = best; isNewHighScore = true; }
  }

  fillAnimActive = true;
  fillAnimRow = 0;
  // 픽셀 채우기 초기화: 랜덤 순서로 섞기
  pixelFillColor = winner === 'A' ? COLOR_A :
                   winner === 'B' ? COLOR_B :
                   winner === 'draw' ? '#FFD600' : COLOR_ZOMBIE;
  pixelFillDone = new Set();
  pixelFillQueue = [];
  for (let i = 0; i < ROWS * COLS; i++) pixelFillQueue.push(i);
  // Fisher-Yates shuffle
  for (let i = pixelFillQueue.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pixelFillQueue[i], pixelFillQueue[j]] = [pixelFillQueue[j], pixelFillQueue[i]];
  }
}

// ── 키보드 입력
function keyPressed() {
  if (phase === PHASE_LOBBY && (lobbySubState === 'login' || lobbySubState === 'register')) {
    if (keyCode === 27) { lobbySubState = 'main'; inputBuffer = ''; inputError = ''; return; }
    if (keyCode === 13) { _submitInput(); return; }
    if (keyCode === 8)  { inputBuffer = inputBuffer.slice(0, -1); return; }
    if (key.length === 1) { if (inputBuffer.length < 16) inputBuffer += key; }
    return;
  }

  if (phase === PHASE_LOBBY && keyCode === 32 && !showHowto) {
    playZombieRoar();
    phase = PHASE_COOP;
    return;
  }
  if (phase === PHASE_LOBBY && keyCode === 27 && showHowto)  { showHowto = false; return; }
  if (phase === PHASE_END   && keyCode === 32) {
    playZombieRoar();
    resetGame();
    return;
  }
  if (betrayalAnnounceFade > 0) return;
  if (phase === PHASE_COOP || phase === PHASE_SOLO || phase === PHASE_BETRAYAL) {
    playerA.handleKeyPressed(keyCode);
    playerB.handleKeyPressed(keyCode);
  }
}

function _submitInput() {
  const id = inputBuffer.trim();
  if (!id) { inputError = '아이디를 입력하세요.'; return; }

  if (lobbySubState === 'login') {
    if (!accounts[id]) { inputError = '존재하지 않는 아이디입니다.'; return; }
    currentUserId = id;
    highScore = accounts[id].highScore;
    inputBuffer = ''; inputError = '';
    lobbySubState = 'main';
  } else if (lobbySubState === 'register') {
    if (accounts[id]) { inputError = '이미 사용 중인 아이디입니다.'; return; }
    accounts[id] = { highScore: 0 };
    currentUserId = id;
    highScore = 0;
    inputBuffer = ''; inputError = '';
    lobbySubState = 'main';
  }
}

function mousePressed() {
  const cx = CANVAS_W / 2;

  if (phase === PHASE_LOBBY && (lobbySubState === 'login' || lobbySubState === 'register')) {
    const pw = 340, ph = 200;
    const px = cx - pw / 2;
    const py = CANVAS_H / 2 - ph / 2;
    if (mouseX > px + pw - 36 && mouseX < px + pw - 6 && mouseY > py + 6 && mouseY < py + 36) {
      lobbySubState = 'main'; inputBuffer = ''; inputError = ''; return;
    }
    const btnY2 = py + ph - 52;
    if (mouseX > cx - 70 && mouseX < cx + 70 && mouseY > btnY2 && mouseY < btnY2 + 34) {
      _submitInput(); return;
    }
    if (mouseX < px || mouseX > px + pw || mouseY < py || mouseY > py + ph) {
      lobbySubState = 'main'; inputBuffer = ''; inputError = ''; return;
    }
    return;
  }

  if (phase === PHASE_LOBBY && showHowto) {
    const pw = 380, ph = 270;
    const px = cx - pw / 2;
    const py = CANVAS_H / 2 - ph / 2;
    if (mouseX > px + pw - 36 && mouseX < px + pw - 6 && mouseY > py + 6 && mouseY < py + 36) {
      showHowto = false; return;
    }
    if (mouseX < px || mouseX > px + pw || mouseY < py || mouseY > py + ph) {
      showHowto = false; return;
    }
    return;
  }

  if (phase === PHASE_LOBBY) {
    const cx = CANVAS_W / 2;
    // 새 레이아웃 기준으로 버튼 위치 재계산
    const ps = 15, charH = 9 * ps;
    const charTopY = 158;
    const kh = 22, gap = 4;
    const keyTopY = charTopY + charH + 10;
    const btnAreaY = keyTopY + kh * 2 + gap + 14;
    const btnW = 380, btnH = 52;
    const htH = 36;
    const htY = btnAreaY + btnH + 10;
    const accountY = htY + htH + 18;

    // 시작하기 버튼
    if (mouseX > cx - btnW/2 && mouseX < cx + btnW/2 && mouseY > btnAreaY && mouseY < btnAreaY + btnH) {
      playZombieRoar();
      phase = PHASE_COOP; return;
    }
    // 게임 방법 버튼
    if (mouseX > cx - 90 && mouseX < cx + 90 && mouseY > htY && mouseY < htY + htH) {
      showHowto = true; return;
    }
    // 로그아웃
    if (currentUserId) {
      if (mouseX > cx - 40 && mouseX < cx + 40 && mouseY > accountY + 44 && mouseY < accountY + 70) {
        currentUserId = null; highScore = 0; return;
      }
    } else {
      if (mouseX > cx - 90 && mouseX < cx - 6 && mouseY > accountY && mouseY < accountY + 30) {
        lobbySubState = 'login'; inputBuffer = ''; inputError = ''; return;
      }
      if (mouseX > cx + 6 && mouseX < cx + 90 && mouseY > accountY && mouseY < accountY + 30) {
        lobbySubState = 'register'; inputBuffer = ''; inputError = ''; return;
      }
    }
  }

  if (phase === PHASE_END) {
    const cy = CANVAS_H / 2;
    // 다시하기 버튼 영역 (새 레이아웃에 맞게)
    if (mouseX > cx - 110 && mouseX < cx + 110 && mouseY > cy + 110 && mouseY < cy + 155) {
      playZombieRoar();
      resetGame(); return;
    }
  }
}

// ── 배신 공지
function showBetrayalAnnounce(p) { betrayalAnnounceFade = FRAME_RATE * 2; }
function drawBetrayalAnnounce(p) {
  if (betrayalAnnounceFade <= 0) return;
  betrayalAnnounceFade--;
  const alpha = Math.min(255, betrayalAnnounceFade * 5);
  p.fill(200, 0, 0, alpha); p.noStroke();
  p.rect(0, CANVAS_H / 2 - 45, CANVAS_W, 90);
  p.fill(255, 255, 255, alpha); p.textAlign(p.CENTER, p.CENTER);
  p.textFont('Nunito');
  p.textStyle(p.BOLD);
  p.textSize(26); p.text('⚠ 배신 타이머 발동! ⚠', CANVAS_W / 2, CANVAS_H / 2 - 12);
  p.textSize(14); p.text('이제 팀원도 적입니다', CANVAS_W / 2, CANVAS_H / 2 + 18);
  p.textStyle(p.NORMAL);
}

// ── 결과 화면 (완전 리디자인)
function drawResultScreen(p, counts, winner, highScore, isNewHighScore) {
  const cx = CANVAS_W / 2, cy = CANVAS_H / 2;

  // 배경 오버레이
  p.fill(0, 0, 0, 210); p.noStroke(); p.rect(0, 0, CANVAS_W, CANVAS_H);

  // 메인 패널
  const panW = 460, panH = 380;
  const panX = cx - panW / 2, panY = cy - panH / 2;

  // 패널 그림자
  p.fill(0, 0, 0, 120); p.noStroke();
  p.rect(panX + 6, panY + 6, panW, panH, 18);

  // 패널 배경
  let panelBg = winner === 'A' ? p.color(30, 10, 10) :
                winner === 'B' ? p.color(10, 15, 30) :
                winner === 'draw' ? p.color(28, 25, 5) : p.color(18, 8, 22);
  p.fill(panelBg);
  p.stroke(winner === 'A' ? '#E53935' : winner === 'B' ? '#1E88E5' :
           winner === 'draw' ? '#FFD600' : '#AB47BC');
  p.strokeWeight(3);
  p.rect(panX, panY, panW, panH, 18);
  p.noStroke();

  // 상단 컬러 띠
  let topCol = winner === 'A' ? COLOR_A : winner === 'B' ? COLOR_B :
               winner === 'draw' ? '#FFD600' : COLOR_ZOMBIE;
  p.fill(topCol);
  p.rect(panX, panY, panW, 55, 18, 18, 0, 0);

  // ── GAME OVER 타이틀
  p.textFont('Nunito');
  p.textStyle(p.BOLD);
  p.fill(255, 255, 255, 220);
  p.textSize(13);
  p.textAlign(p.CENTER, p.CENTER);
  p.text('GAME OVER', cx, panY + 20);

  // ── 승리자 텍스트 (크고 굵고 빨간색 계열)
  p.textSize(30);
  // 그림자
  p.fill(0, 0, 0, 150);
  let winText = winner === 'A' ? '플레이어 A 승리!' :
                winner === 'B' ? '플레이어 B 승리!' :
                winner === 'draw' ? '무 승 부 !' : '좀비의 승리...';
  p.text(winText, cx + 2, panY + 42);
  // 메인 (항상 강한 빨간/흰 대비)
  p.fill(winner === 'draw' ? '#FFD600' : '#FF1744');
  p.text(winText, cx, panY + 40);
  p.textStyle(p.NORMAL);

  // ── 승리자 캐릭터 얼굴 아이콘
  const facePS = 10;
  const faceW = 8 * facePS;
  const faceH = 5 * facePS;
  const faceX = cx - faceW / 2;
  const faceY = panY + 65;

  if (winner === 'A') {
    _drawPMap(p, _PFACE, faceX, faceY, facePS, '#C62828', '#eeeeee', '#111111', '#ffffff', false);
  } else if (winner === 'B') {
    _drawPMap(p, _PFACE, faceX, faceY, facePS, '#1565C0', '#eeeeee', '#111111', '#ffffff', true);
  } else if (winner === 'zombie') {
    _drawPMap(p, _ZFACE, faceX, faceY, facePS, '#2E7D32', '#ccffcc', '#1B5E20', '#e8ffe8', false);
  } else {
    // draw
    const faceX2 = cx - faceW - 12;
    _drawPMap(p, _PFACE, faceX2, faceY, facePS, '#C62828', '#eeeeee', '#111111', '#ffffff', false);
    _drawPMap(p, _PFACE, cx + 12, faceY, facePS, '#1565C0', '#eeeeee', '#111111', '#ffffff', true);
  }

  // ── 구분선
  const divY = faceY + faceH + 10;
  p.stroke(80); p.strokeWeight(1);
  p.line(panX + 30, divY, panX + panW - 30, divY);
  p.noStroke();

  // ── 영역 통계
  const statsY = divY + 18;
  p.textFont('Nunito');
  p.textStyle(p.BOLD);
  p.textSize(12);
  p.textAlign(p.CENTER, p.CENTER);

  if (!betrayalTriggered && winner === 'zombie') {
    p.fill(COLOR_TEAM);
    p.text(`🟢  TEAM 영역`, cx - 60, statsY);
    p.fill(255); p.text(`${counts.team} 타일`, cx + 60, statsY);
  } else {
    // A 영역 바
    const barW = panW - 80;
    const barX = panX + 40;
    const totalTiles = ROWS * COLS;

    p.fill(40); p.rect(barX, statsY, barW, 14, 7);
    const wA = Math.max(4, (counts.A / totalTiles) * barW);
    p.fill(COLOR_A); p.rect(barX, statsY, wA, 14, 7, 0, 0, 7);
    p.fill(COLOR_A); p.textAlign(p.LEFT, p.CENTER);
    p.text(`A  ${counts.A}타일`, barX + 4, statsY + 7);

    p.fill(40); p.rect(barX, statsY + 22, barW, 14, 7);
    const wB = Math.max(4, (counts.B / totalTiles) * barW);
    p.fill(COLOR_B); p.rect(barX + barW - wB, statsY + 22, wB, 14, 0, 7, 7, 0);
    p.fill(COLOR_B); p.textAlign(p.RIGHT, p.CENTER);
    p.text(`${counts.B}타일  B`, barX + barW - 4, statsY + 29);

    p.fill(120); p.textAlign(p.CENTER, p.CENTER);
    p.textSize(10);
    const zPct = Math.round((counts.Z / totalTiles) * 100);
    p.text(`좀비 점령: ${counts.Z}타일 (${zPct}%)`, cx, statsY + 50);
  }

  // ── 고득점
  p.textStyle(p.NORMAL);
  const scoreY = statsY + 72;
  p.stroke(60); p.strokeWeight(1);
  p.line(panX + 30, scoreY - 8, panX + panW - 30, scoreY - 8);
  p.noStroke();

  p.textSize(12); p.textAlign(p.CENTER, p.CENTER);
  if (currentUserId) {
    const userBest = accounts[currentUserId] ? accounts[currentUserId].highScore : 0;
    if (isNewHighScore) {
      const blink = Math.floor(p.frameCount / 10) % 2 === 0;
      p.textStyle(p.BOLD);
      p.fill(blink ? '#FFD600' : '#FF8A00');
      p.textSize(14); p.text('🔥  최고 기록 경신!  🔥', cx, scoreY + 4);
      p.textStyle(p.NORMAL);
      p.fill(220); p.textSize(11);
      p.text(`${currentUserId}님의 최고 기록: ${userBest} 타일`, cx, scoreY + 24);
    } else {
      const best = Math.max(counts.A, counts.B, counts.team);
      p.fill(160); p.text(`이번 점수: ${best} 타일`, cx, scoreY + 4);
      p.fill(120); p.text(`${currentUserId}님의 최고 기록: ${userBest} 타일`, cx, scoreY + 22);
    }
  } else {
    if (isNewHighScore) {
      const blink = Math.floor(p.frameCount / 10) % 2 === 0;
      p.textStyle(p.BOLD);
      p.fill(blink ? '#FFD600' : '#FF8A00');
      p.textSize(14); p.text('🔥  최고 기록 경신!  🔥', cx, scoreY + 4);
      p.textStyle(p.NORMAL);
      p.fill(220); p.textSize(11); p.text(`최고 기록: ${highScore} 타일`, cx, scoreY + 24);
    } else {
      p.fill(160); p.textSize(11); p.text(`최고 기록: ${highScore} 타일`, cx, scoreY + 14);
    }
  }

  // ── 다시하기 버튼
  const btnW = 220, btnH = 42;
  const btnX = cx - btnW / 2;
  const btnY2 = panY + panH - 58;
  const blink2 = Math.floor(p.frameCount / 15) % 2 === 0;
  p.fill(blink2 ? '#43A047' : '#2E7D32');
  p.stroke('#76FF03'); p.strokeWeight(2);
  p.rect(btnX, btnY2, btnW, btnH, 10);
  p.noStroke();
  p.textStyle(p.BOLD);
  p.fill(0, 40, 0); p.textSize(15);
  p.text('▶  다시 시작  (SPACE)', cx + 1, btnY2 + btnH / 2 + 1);
  p.fill(255); p.text('▶  다시 시작  (SPACE)', cx, btnY2 + btnH / 2);
  p.textStyle(p.NORMAL);
}

// ── 로비 화면
function drawLobby(p) {
  p.background(10, 10, 15);
  p.noStroke();

  // ── 혈흔 스플래터 효과 (배경)
  _updateDrawBloodDrops(p);

  p.textAlign(p.CENTER, p.CENTER);
  p.textFont('Nunito');

  const cx = CANVAS_W / 2;
  // 전체 레이아웃 기준점 (CANVAS_H = 900)
  // 제목: Y=70
  // 부제목: Y=115
  // 제작자: Y=138
  // 캐릭터 영역: Y=165~330
  // 키캡: Y=340~390
  // 시작 버튼: Y=408~460
  // 게임방법 버튼: Y=472~514
  // 로그인 영역: Y=528~600

  // ── 제목 (단층, 두께 있게)
  p.textStyle(p.BOLD);
  p.textSize(68);
  // 그림자 한 겹만
  p.fill(10, 50, 12);
  p.text('좀비 슬라이드 듀오', cx, 72);
  // 메인 색
  p.fill('#4CAF50');
  p.text('좀비 슬라이드 듀오', cx, 70);
  p.textStyle(p.NORMAL);

  // ── 부제목
  p.textSize(13);
  p.fill(200);
  p.text('2인 협력  →  배신 영역 점령 게임', cx, 112);

  // ── 제작자 (부제목 바로 아래, 겹치지 않게)
  p.textSize(10);
  p.fill(110);
  p.text('제작자 : 이현서  이유진  전재민', cx, 130);

  // ── 구분선
  p.stroke(40); p.strokeWeight(1);
  p.line(80, 143, CANVAS_W - 80, 143);
  p.noStroke();

  // ── 픽셀 캐릭터 영역 (Y=155~310)
  const ps    = 15;
  const charW = 8 * ps;
  const charH = 9 * ps;
  const charTopY = 158;

  const axMid = 155;
  _drawPMap(p, _PMAP, axMid - charW / 2, charTopY, ps,
    '#C62828', '#eeeeee', '#111111', '#ffffff', false);

  const bxMid = CANVAS_W - 155;
  _drawPMap(p, _PMAP, bxMid - charW / 2, charTopY, ps,
    '#1565C0', '#eeeeee', '#111111', '#ffffff', true);

  const zps  = 13;
  const zW   = 8 * zps;
  const zTopY = charTopY + (charH - 9 * zps) / 2;
  _drawPMap(p, _ZMAP, cx - zW / 2, zTopY, zps,
    '#2E7D32', '#ccffcc', '#1B5E20', '#e8ffe8', false);

  // ── PLAYER/ZOMBIE 라벨 (캐릭터 위)
  const labelY = charTopY - 18;
  p.textStyle(p.BOLD);
  p.textSize(12); p.noStroke();
  p.fill(COLOR_A); p.text('PLAYER  A', axMid, labelY);
  p.fill(COLOR_B); p.text('PLAYER  B', bxMid, labelY);
  p.fill('#2E7D32'); p.text('Z O M B I E', cx, labelY);
  p.textStyle(p.NORMAL);

  // ── VS 텍스트
  const vsY = charTopY + charH / 2;
  p.textStyle(p.BOLD);
  p.textSize(16); p.fill(55);
  p.text('VS', (axMid + cx) / 2, vsY);
  p.text('VS', (bxMid + cx) / 2, vsY);
  p.textStyle(p.NORMAL);

  // 구분선
  p.stroke(30); p.strokeWeight(1);
  p.line(axMid + charW/2 + 8, charTopY + 10, cx - zW/2 - 8, charTopY + charH - 10);
  p.line(cx + zW/2 + 8, charTopY + 10, bxMid - charW/2 - 8, charTopY + charH - 10);
  p.noStroke();

  // ── 키캡 (캐릭터 바로 아래)
  const kw = 26, kh = 22, gap = 4;
  const keyTopY = charTopY + charH + 10;

  _drawKey(p, 'W', axMid - kw/2,          keyTopY,        kw, kh, COLOR_A);
  _drawKey(p, 'A', axMid - kw*1.5 - gap,  keyTopY+kh+gap, kw, kh, COLOR_A);
  _drawKey(p, 'S', axMid - kw/2,          keyTopY+kh+gap, kw, kh, COLOR_A);
  _drawKey(p, 'D', axMid + kw/2 + gap,    keyTopY+kh+gap, kw, kh, COLOR_A);

  _drawKey(p, '↑', bxMid - kw/2,          keyTopY,        kw, kh, COLOR_B);
  _drawKey(p, '←', bxMid - kw*1.5 - gap,  keyTopY+kh+gap, kw, kh, COLOR_B);
  _drawKey(p, '↓', bxMid - kw/2,          keyTopY+kh+gap, kw, kh, COLOR_B);
  _drawKey(p, '→', bxMid + kw/2 + gap,    keyTopY+kh+gap, kw, kh, COLOR_B);

  // ── 시작하기 버튼
  const btnAreaY = keyTopY + kh * 2 + gap + 14;
  const btnW = 380, btnH = 52;
  const btnX = cx - btnW / 2;
  const blink = Math.floor(p.frameCount / 18) % 2 === 0;
  p.fill(blink ? '#43A047' : '#2E7D32');
  p.stroke('#76FF03'); p.strokeWeight(1.5);
  p.rect(btnX, btnAreaY, btnW, btnH, 14);
  p.noStroke();
  p.textStyle(p.BOLD);
  p.textSize(21);
  p.fill(0, 50, 0);
  p.text('▶  시작하기  (SPACE)', cx + 1, btnAreaY + btnH / 2 + 1);
  p.fill(255);
  p.text('▶  시작하기  (SPACE)', cx, btnAreaY + btnH / 2);
  p.textStyle(p.NORMAL);

  // ── 게임 방법 버튼
  const htW = 180, htH = 36;
  const htX = cx - htW / 2;
  const htY = btnAreaY + btnH + 10;
  const htBlink = Math.floor(p.frameCount / 25) % 2 === 0;
  p.fill(htBlink ? '#1565C0' : '#0D47A1');
  p.stroke('#42A5F5'); p.strokeWeight(1.5);
  p.rect(htX, htY, htW, htH, 10);
  p.noStroke();
  p.fill(255);
  p.textStyle(p.BOLD);
  p.textSize(13);
  p.text('❓  게임 방법', cx, htY + htH / 2);
  p.textStyle(p.NORMAL);

  // ── 로그인/회원가입
  const accountY = htY + htH + 18;
  if (currentUserId) {
    p.textSize(11); p.fill(120);
    p.text('로그인 중:', cx, accountY);
    p.textSize(13); p.fill(220);
    p.text(`👤 ${currentUserId}`, cx, accountY + 18);
    p.textSize(10); p.fill(90);
    p.text(`최고 기록: ${highScore} 타일`, cx, accountY + 34);
    p.fill(40, 40, 50); p.stroke(70); p.strokeWeight(1);
    p.rect(cx - 40, accountY + 44, 80, 26, 6);
    p.noStroke(); p.fill(150); p.textSize(11);
    p.text('로그아웃', cx, accountY + 57);
  } else {
    p.fill(30, 30, 40); p.stroke(65); p.strokeWeight(1);
    p.rect(cx - 90, accountY, 84, 30, 7);
    p.fill(45, 45, 60); p.stroke(85);
    p.rect(cx + 6, accountY, 84, 30, 7);
    p.noStroke();
    p.fill(190); p.textSize(12);
    p.text('로그인', cx - 48, accountY + 15);
    p.text('회원가입', cx + 48, accountY + 15);
    p.fill(80); p.textSize(9);
    p.text('아이디로 최고기록을 저장하세요', cx, accountY + 38);
  }

  // ── 게임 방법 팝업
  if (showHowto) {
    p.fill(0, 0, 0, 190); p.noStroke(); p.rect(0, 0, CANVAS_W, CANVAS_H);
    const pw = 390, ph = 280;
    const px = cx - pw / 2;
    const py = CANVAS_H / 2 - ph / 2;
    p.fill(16, 16, 24); p.stroke(70); p.strokeWeight(1);
    p.rect(px, py, pw, ph, 12); p.noStroke();
    p.textStyle(p.BOLD);
    p.fill('#4CAF50'); p.textSize(14); p.textAlign(p.LEFT, p.TOP);
    p.text('[ 게임 방법 ]', px + 22, py + 20);
    p.textStyle(p.NORMAL);
    p.fill(80); p.textSize(16); p.textAlign(p.RIGHT, p.TOP);
    p.text('✕', px + pw - 16, py + 14);
    p.fill(145); p.textSize(11); p.textAlign(p.LEFT, p.TOP);
    const lines = [
      '⏱  협력 30초  →  배신 30초',
      '🐾  꼬리를 뻗다 자기 땅으로 돌아오면 영역 확보',
      '💀  상대 꼬리를 끊으면 사망',
      '      머리끼리 부딪히면 밀려남',
      '🧟  좀비 꼬리를 밟으면 좀비 사망',
      '',
      '💊  약 :  보너스 땅 획득',
      '🩸  피 :  좀비 가속',
      '⚡  에너지드링크 :  속도 2배 + 강철꼬리',
    ];
    for (let i = 0; i < lines.length; i++) {
      p.text(lines[i], px + 22, py + 54 + i * 21);
    }
  }

  // ── 로그인/회원가입 팝업
  if (lobbySubState === 'login' || lobbySubState === 'register') {
    p.fill(0, 0, 0, 200); p.noStroke(); p.rect(0, 0, CANVAS_W, CANVAS_H);
    const pw = 340, ph = 200;
    const px = cx - pw / 2;
    const py = CANVAS_H / 2 - ph / 2;
    p.fill(16, 16, 26); p.stroke(80); p.strokeWeight(1);
    p.rect(px, py, pw, ph, 12); p.noStroke();

    p.textStyle(p.BOLD);
    p.fill(255); p.textSize(15); p.textAlign(p.CENTER, p.TOP);
    const title = lobbySubState === 'login' ? '🔑  로그인' : '📝  회원가입';
    p.text(title, cx, py + 22);
    p.textStyle(p.NORMAL);

    p.fill(80); p.textSize(16); p.textAlign(p.RIGHT, p.TOP);
    p.text('✕', px + pw - 16, py + 14);

    p.fill(130); p.textSize(11); p.textAlign(p.CENTER, p.TOP);
    const desc = lobbySubState === 'login' ? '아이디를 입력하세요 (최대 16자)' : '새 아이디를 입력하세요 (최대 16자)';
    p.text(desc, cx, py + 52);

    const ibX = px + 20, ibY = py + 76, ibW = pw - 40, ibH = 36;
    p.fill(25, 25, 38); p.stroke(100); p.strokeWeight(1.5);
    p.rect(ibX, ibY, ibW, ibH, 6);
    p.noStroke();
    const cursor = Math.floor(p.frameCount / 15) % 2 === 0 ? '|' : '';
    p.fill(230); p.textSize(14); p.textAlign(p.LEFT, p.CENTER);
    p.text(inputBuffer + cursor, ibX + 10, ibY + ibH / 2);

    if (inputError) {
      p.fill('#FF5252'); p.textSize(11); p.textAlign(p.CENTER, p.TOP);
      p.text(inputError, cx, py + 120);
    }

    const btnY2 = py + ph - 50;
    p.fill('#2E7D32'); p.stroke('#4CAF50'); p.strokeWeight(1);
    p.rect(cx - 70, btnY2, 140, 34, 8);
    p.noStroke(); p.textStyle(p.BOLD);
    p.fill(255); p.textSize(13); p.textAlign(p.CENTER, p.CENTER);
    p.text('확인 (Enter)', cx, btnY2 + 17);
    p.textStyle(p.NORMAL);
  }
}

// ── 혈흔 스플래터 그리기 (정적)
function _updateDrawBloodDrops(p) {
  p.noStroke();
  for (const d of bloodDrops) {
    const r1 = 160, g1 = 0, b1 = 0;
    // 메인 핏방울
    p.fill(r1, g1, b1, d.alpha);
    if (d.type === 0) {
      p.ellipse(d.x, d.y, d.size, d.size);
    } else if (d.type === 1) {
      p.push();
      p.translate(d.x, d.y);
      p.rotate(d.angle);
      p.ellipse(0, 0, d.size * 1.6, d.size * 0.7);
      p.pop();
    } else {
      // 방울 무리
      p.ellipse(d.x, d.y, d.size, d.size);
      p.fill(r1, g1, b1, d.alpha * 0.7);
      p.ellipse(d.x + d.size * 0.8, d.y - d.size * 0.4, d.size * 0.5, d.size * 0.5);
      p.ellipse(d.x - d.size * 0.6, d.y + d.size * 0.5, d.size * 0.4, d.size * 0.4);
    }
    // 흘러내리는 방울들
    for (let i = 0; i < d.drips; i++) {
      const dr = d.dripOffsets[i];
      p.fill(120, 0, 0, d.alpha * 0.5);
      p.ellipse(d.x + dr.ox, d.y + dr.oy, dr.size, dr.size * 1.4);
    }
  }
}
