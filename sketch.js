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

// ── 승리 애니메이션 (위에서 아래로 채워지는 스캔라인 방식)
let fillAnimActive = false;
let fillAnimRow = 0;
const FILL_SPEED = 1.25; // 한 프레임에 채워질 행(Row)의 수 (1.5 → 1.25, 약 1.2배 느리게)
let pixelFillColor = '';

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

// [사운드 변경] 시작 및 다시 시작 버튼: 기괴하고 웅장한 좀비 포효 사운드
function playZombieRoar() {
  try {
    const ctx = getAudioCtx();
    const now = ctx.currentTime;

    // 레이어 1: 거칠고 무거운 디스토션 그로울
    const osc1 = ctx.createOscillator();
    const dist1 = ctx.createWaveShaper();
    const g1 = ctx.createGain();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
      const x = (i * 2) / 1024 - 1;
      curve[i] = Math.max(-0.9, Math.min(0.9, x * 12)) * 0.8;
    }
    dist1.curve = curve;
    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(65, now);
    osc1.frequency.linearRampToValueAtTime(32, now + 0.4);
    osc1.frequency.linearRampToValueAtTime(55, now + 0.9);
    osc1.frequency.linearRampToValueAtTime(25, now + 1.5);
    
    g1.gain.setValueAtTime(0, now);
    g1.gain.linearRampToValueAtTime(0.6, now + 0.1);
    g1.gain.setValueAtTime(0.5, now + 1.1);
    g1.gain.linearRampToValueAtTime(0, now + 1.7);
    
    osc1.connect(dist1); dist1.connect(g1); g1.connect(ctx.destination);
    osc1.start(now); osc1.stop(now + 1.8);

    // 레이어 2: 긁히는 숨소리 노이즈
    const sr = ctx.sampleRate;
    const buf = ctx.createBuffer(1, sr * 1.8, sr);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      last = last * 0.95 + (Math.random() * 2 - 1) * 0.05;
      d[i] = last * 10 + (Math.random() * 2 - 1) * 0.2;
    }
    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = buf;
    
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(350, now);
    lp.frequency.linearRampToValueAtTime(150, now + 1.6);
    lp.Q.value = 6;
    
    const gN = ctx.createGain();
    gN.gain.setValueAtTime(0, now);
    gN.gain.linearRampToValueAtTime(0.3, now + 0.15);
    gN.gain.setValueAtTime(0.2, now + 1.1);
    gN.gain.linearRampToValueAtTime(0, now + 1.7);
    
    noiseSrc.connect(lp); lp.connect(gN); gN.connect(ctx.destination);
    noiseSrc.start(now); noiseSrc.stop(now + 1.8);
  } catch(e) {}
}

// 분위기 있는 주기적 좀비 소리
let ambientTimer = 0;
const AMBIENT_INTERVAL = 300; 

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

// [사운드 변경] 에너지드링크 캔 따는 소리 (딸깍 툭 - 치이익)
function playSoundDrink() {
  try {
    const ctx = getAudioCtx();
    const now = ctx.currentTime;

    // 1. 캔 탭 따는 소리 (날카로운 금속성 클릭 2방)
    const clickOsc = ctx.createOscillator();
    const clickGain = ctx.createGain();
    clickOsc.type = 'triangle';
    clickOsc.frequency.setValueAtTime(1400, now);
    clickOsc.frequency.setValueAtTime(800, now + 0.03);
    
    clickGain.gain.setValueAtTime(0.3, now);
    clickGain.gain.linearRampToValueAtTime(0.01, now + 0.05);
    
    clickOsc.connect(clickGain);
    clickGain.connect(ctx.destination);
    clickOsc.start(now);
    clickOsc.stop(now + 0.05);

    // 2. 탄산 가스 빠지는 소리 (High-pass Noise)
    const sr = ctx.sampleRate;
    const bufSize = sr * 0.6; // 0.6초 분량
    const buf = ctx.createBuffer(1, bufSize, sr);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) {
      d[i] = Math.random() * 2 - 1;
    }
    const fizzSrc = ctx.createBufferSource();
    fizzSrc.buffer = buf;

    const hpFilter = ctx.createBiquadFilter();
    hpFilter.type = 'highpass';
    hpFilter.frequency.setValueAtTime(6000, now);
    hpFilter.frequency.exponentialRampToValueAtTime(2500, now + 0.5);

    const fizzGain = ctx.createGain();
    fizzGain.gain.setValueAtTime(0, now + 0.01);
    fizzGain.gain.linearRampToValueAtTime(0.25, now + 0.04); // 가스 분출 피크
    fizzGain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);

    fizzSrc.connect(hpFilter);
    hpFilter.connect(fizzGain);
    fizzGain.connect(ctx.destination);
    
    fizzSrc.start(now + 0.01);
    fizzSrc.stop(now + 0.6);
  } catch(e) {}
}

// [사운드 변경] 약(좀비타일) 먹었을 때: 날카롭고 신경질적인 좀비 비명 소리
function playSoundPowerup() {
  try {
    const ctx = getAudioCtx();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(350, now);
    osc.frequency.linearRampToValueAtTime(650, now + 0.15);
    osc.frequency.exponentialRampToValueAtTime(180, now + 0.4);
    
    // 비명에 바이브레이션 효과 추가 (LFO)
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.type = 'square';
    lfo.frequency.value = 22; 
    lfoGain.gain.value = 45; 
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    lfo.start(now);
    lfo.stop(now + 0.4);

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.35, now + 0.05);
    gain.gain.linearRampToValueAtTime(0.2, now + 0.2);
    gain.gain.linearRampToValueAtTime(0, now + 0.4);

    // 하이패스 필터로 카랑카랑하게 조절
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1000;

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start(now);
    osc.stop(now + 0.4);
  } catch(e) {}
}

// [사운드 변경] 피 먹었을 때: 피가 끓어오르며 낮게 크르릉거리는 좀비 소리
function playSoundZombie() {
  try {
    const ctx = getAudioCtx();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const dist = ctx.createWaveShaper();
    const g = ctx.createGain();
    const c2 = new Float32Array(512);
    for (let i = 0; i < 512; i++) {
      const x = (i * 2) / 512 - 1;
      c2[i] = Math.max(-0.8, Math.min(0.8, x * 8));
    }
    dist.curve = c2;
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(90, now);
    osc.frequency.linearRampToValueAtTime(45, now + 0.4);
    osc.frequency.linearRampToValueAtTime(70, now + 0.7);
    osc.frequency.linearRampToValueAtTime(35, now + 1.0);
    
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.45, now + 0.05);
    g.gain.setValueAtTime(0.3, now + 0.7);
    g.gain.linearRampToValueAtTime(0, now + 1.0);
    
    osc.connect(dist); dist.connect(g); g.connect(ctx.destination);
    osc.start(now); osc.stop(now + 1.0);

    // 끈적거리는 물방울 피치 노이즈 레이어 결합
    const sr = ctx.sampleRate;
    const buf = ctx.createBuffer(1, sr * 0.9, sr);
    const nd = buf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = (Math.random() * 2 - 1);
    const ns = ctx.createBufferSource(); ns.buffer = buf;
    
    const bp = ctx.createBiquadFilter(); 
    bp.type = 'bandpass';
    bp.frequency.value = 180; 
    bp.Q.value = 3;
    
    const gn = ctx.createGain();
    gn.gain.setValueAtTime(0, now);
    gn.gain.linearRampToValueAtTime(0.18, now + 0.1);
    gn.gain.linearRampToValueAtTime(0, now + 0.9);
    
    ns.connect(bp); bp.connect(gn); gn.connect(ctx.destination);
    ns.start(now); ns.stop(now + 0.9);
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
  // 가장자리 튀김 (진하고 크게)
  for (let i = 0; i < 28; i++) {
    bloodDrops.push(_newBloodSplatter(160));
  }
  // 화면 전체에 작은 튀김 점들 (가독성 유지하며 분위기)
  for (let i = 0; i < 22; i++) {
    bloodDrops.push(_newBloodSplatterFull());
  }
}

function _newBloodSplatterFull() {
  return {
    x: Math.random() * CANVAS_W,
    y: Math.random() * CANVAS_H,
    size: 3 + Math.random() * 9,
    alpha: 40 + Math.random() * 55,
    type: Math.floor(Math.random() * 3),
    angle: Math.random() * Math.PI * 2,
    drips: Math.floor(Math.random() * 2),
    dripOffsets: Array.from({length: 3}, () => ({
      ox: (Math.random() - 0.5) * 22,
      oy: Math.random() * 28 + 4,
      size: 2 + Math.random() * 4
    }))
  };
}

function _newBloodSplatter(margin) {
  const side = Math.floor(Math.random() * 4);
  let x, y;
  if (side === 0) {        
    x = Math.random() * CANVAS_W;
    y = Math.random() * margin;
  } else if (side === 1) { 
    x = Math.random() * CANVAS_W;
    y = CANVAS_H - Math.random() * margin;
  } else if (side === 2) { 
    x = Math.random() * margin;
    y = Math.random() * CANVAS_H;
  } else {                 
    x = CANVAS_W - Math.random() * margin;
    y = Math.random() * CANVAS_H;
  }
  return {
    x, y,
    size: 10 + Math.random() * 32,
    alpha: 70 + Math.random() * 80,
    type: Math.floor(Math.random() * 3),
    angle: Math.random() * Math.PI * 2,
    drips: Math.floor(Math.random() * 4),
    dripOffsets: Array.from({length: 4}, () => ({
      ox: (Math.random() - 0.5) * 28,
      oy: Math.random() * 30 + 4,
      size: 3 + Math.random() * 7
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

    // 필 애니메이션 완료 후: 승자 색 배경을 유지한 채 결과 화면 표시
    const col = this.color(pixelFillColor);
    this.fill(col); this.noStroke();
    this.rect(0, 0, CANVAS_W, CANVAS_H);

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
  fillAnimRow += FILL_SPEED;
  if (fillAnimRow >= ROWS) {
    fillAnimRow = ROWS;
    fillAnimActive = false;
  }

  p.noStroke();
  const col = p.color(pixelFillColor);
  p.fill(col);
  p.rect(0, 0, CANVAS_W, fillAnimRow * TILE_SIZE);
}

function _triggerBetrayal() {
  betrayalTriggered = true;
  phase = PHASE_BETRAYAL;

  const midC = Math.floor(COLS / 2);
  const midR = Math.floor(ROWS / 2);

  if (!playerA.alive) playerA.revive(midR - 3, midC - 5, OWNER_A);
  if (!playerB.alive) playerB.revive(midR + 3, midC + 5, OWNER_B);

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (grid[r][c].owner === OWNER_TEAM) {
        grid[r][c].owner = c < midC ? OWNER_A : OWNER_B;
        grid[r][c].dirty = true;
      }
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
  pixelFillColor = winner === 'A' ? COLOR_A :
                   winner === 'B' ? COLOR_B :
                   winner === 'draw' ? '#FFD600' : COLOR_ZOMBIE;
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
    const pw = 390, ph = 280;
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
    // 레이아웃 수치 (drawLobby와 동일)
    const ps = 17, charH = 9 * ps, charTopY = 245;
    const kh = 22, gap = 3;
    const keyTopY = charTopY + charH + 10;
    const startBtnY = keyTopY + kh * 2 + gap + 18;
    const btnH = 52;
    const howtoBtnY = startBtnY + btnH + 12;
    const htH = 36;
    const accountAreaY = howtoBtnY + htH + 14;

    if (mouseX > cx - 180 && mouseX < cx + 180 && mouseY > startBtnY && mouseY < startBtnY + btnH) {
      playZombieRoar();
      phase = PHASE_COOP; 
      return;
    }
    if (mouseX > cx - 95 && mouseX < cx + 95 && mouseY > howtoBtnY && mouseY < howtoBtnY + htH) {
      showHowto = true; 
      return;
    }
    if (currentUserId) {
      if (mouseX > cx - 40 && mouseX < cx + 40 && mouseY > accountAreaY + 52 && mouseY < accountAreaY + 76) {
        currentUserId = null; highScore = 0; return;
      }
    } else {
      if (mouseX > cx - 92 && mouseX < cx - 6 && mouseY > accountAreaY + 18 && mouseY < accountAreaY + 46) {
        lobbySubState = 'login'; inputBuffer = ''; inputError = ''; return;
      }
      if (mouseX > cx + 6 && mouseX < cx + 92 && mouseY > accountAreaY + 18 && mouseY < accountAreaY + 46) {
        lobbySubState = 'register'; inputBuffer = ''; inputError = ''; return;
      }
    }
  }

  if (phase === PHASE_END) {
    const cy = CANVAS_H / 2;
    const panY = cy + 50, panH = 220;
    const btnY2 = panY + panH - 58;
    if (mouseX > cx - 120 && mouseX < cx + 120 && mouseY > btnY2 && mouseY < btnY2 + 44) {
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

// ── 결과 화면
function drawResultScreen(p, counts, winner, highScore, isNewHighScore) {
  const cx = CANVAS_W / 2, cy = CANVAS_H / 2;

  // 승자 색상 정의
  const winColor   = winner === 'A' ? '#E53935' :
                     winner === 'B' ? '#1E88E5' :
                     winner === 'draw' ? '#FFD600' : '#AB47BC';
  const winColorDk = winner === 'A' ? '#7f0000' :
                     winner === 'B' ? '#003c8f' :
                     winner === 'draw' ? '#8a6d00' : '#4a0072';

  // 배경은 이미 승자 색으로 채워진 상태 — 어두운 반투명 레이어만 추가
  p.fill(0, 0, 0, 100); p.noStroke(); p.rect(0, 0, CANVAS_W, CANVAS_H);

  // 승자 색 방사형 글로우 (화면 중앙에서 퍼짐)
  const pulse = 0.85 + Math.sin(p.frameCount * 0.07) * 0.15;
  const wc = p.color(winColor);
  for (let i = 8; i >= 1; i--) {
    p.fill(p.red(wc), p.green(wc), p.blue(wc), 8 * pulse * i);
    p.noStroke();
    p.ellipse(cx, cy - 60, 520 - i * 30, 300 - i * 18);
  }

  // ── 승자 표시 (초대형, 화면 상단 1/3 장악)
  p.textFont('Nunito');
  p.textAlign(p.CENTER, p.CENTER);

  // GAME OVER 작은 라벨
  p.textStyle(p.BOLD);
  p.fill(180, 180, 180, 200);
  p.textSize(12);
  p.text('G A M E   O V E R', cx, cy - 175);

  // 승리 문구 — 크고 굵게, 글로우 레이어 4겹
  let winText = winner === 'A' ? 'PLAYER  A  WIN!' :
                winner === 'B' ? 'PLAYER  B  WIN!' :
                winner === 'draw' ? 'D R A W !' : 'ZOMBIE  WIN...';
  p.textSize(52);
  for (let g = 5; g >= 1; g--) {
    p.fill(p.red(wc), p.green(wc), p.blue(wc), 20 * pulse);
    p.text(winText, cx, cy - 138 + g);
  }
  // 그림자
  p.fill(0, 0, 0, 160);
  p.text(winText, cx + 3, cy - 135);
  // 본문
  p.fill(winColor);
  p.text(winText, cx, cy - 138);
  p.textStyle(p.NORMAL);

  // ── 캐릭터 픽셀맵 (승자만 크게, 패자는 작고 흐릿하게 양옆에)
  const fPS = 13, fW = 8 * fPS, fH = 5 * fPS;
  const faceY = cy - 110;

  if (winner === 'A') {
    // 승자 A 크게 중앙
    _drawPMap(p, _PFACE, cx - fW/2, faceY, fPS, '#C62828', '#eeeeee', '#111111', '#ffffff', false);
    // 패자 B 작고 흐릿하게 우측
    p.fill(0, 0, 0, 100); p.noStroke();
    p.rect(cx + fW/2 + 22, faceY - 2, 8*8+4, 5*8+4, 4);
    _drawPMap(p, _PFACE, cx + fW/2 + 24, faceY, 8, '#444', '#888', '#222', '#666', true);
  } else if (winner === 'B') {
    // 패자 A 작고 흐릿하게 좌측
    p.fill(0, 0, 0, 100); p.noStroke();
    p.rect(cx - fW/2 - 8*8 - 28, faceY - 2, 8*8+4, 5*8+4, 4);
    _drawPMap(p, _PFACE, cx - fW/2 - 8*8 - 26, faceY, 8, '#444', '#888', '#222', '#666', false);
    // 승자 B 크게 중앙
    _drawPMap(p, _PFACE, cx - fW/2, faceY, fPS, '#1565C0', '#eeeeee', '#111111', '#ffffff', true);
  } else if (winner === 'zombie') {
    _drawPMap(p, _ZFACE, cx - fW/2, faceY, fPS, '#2E7D32', '#ccffcc', '#1B5E20', '#e8ffe8', false);
  } else {
    // 무승부: 둘 다 같은 크기
    const smPS = 10, smW = 8 * smPS;
    _drawPMap(p, _PFACE, cx - smW - 10, faceY + 10, smPS, '#C62828', '#eeeeee', '#111111', '#ffffff', false);
    _drawPMap(p, _PFACE, cx + 10, faceY + 10, smPS, '#1565C0', '#eeeeee', '#111111', '#ffffff', true);
  }

  // ── 하단 패널 (스탯 + 버튼)
  const panW = 460, panH = 220;
  const panX = cx - panW / 2, panY = cy + 50;

  // 패널 그림자
  p.fill(0, 0, 0, 120); p.noStroke();
  p.rect(panX + 5, panY + 5, panW, panH, 14);
  // 패널 본체
  p.fill(14, 14, 20);
  p.stroke(winColor); p.strokeWeight(2);
  p.rect(panX, panY, panW, panH, 14);
  p.noStroke();

  // 패널 상단 컬러 띠
  p.fill(winColor);
  p.rect(panX, panY, panW, 6, 14, 14, 0, 0);

  // ── 타일 점수 바
  const statsY = panY + 22;
  const barW = panW - 80, barX = panX + 40;
  const totalTiles = ROWS * COLS;

  if (!betrayalTriggered && winner === 'zombie') {
    p.textStyle(p.BOLD); p.textSize(11); p.textAlign(p.CENTER, p.CENTER);
    p.fill(COLOR_TEAM); p.text('🟢  TEAM 영역', cx - 60, statsY + 8);
    p.fill(255); p.text(counts.team + ' 타일', cx + 60, statsY + 8);
    p.textStyle(p.NORMAL);
  } else {
    // A 바
    p.fill(30); p.rect(barX, statsY, barW, 18, 9);
    const wA = Math.max(6, (counts.A / totalTiles) * barW);
    p.fill(COLOR_A); p.rect(barX, statsY, wA, 18, 9, 0, 0, 9);
    // B 바
    p.fill(30); p.rect(barX, statsY + 26, barW, 18, 9);
    const wB = Math.max(6, (counts.B / totalTiles) * barW);
    p.fill(COLOR_B); p.rect(barX + barW - wB, statsY + 26, wB, 18, 0, 9, 9, 0);

    p.textStyle(p.BOLD); p.textSize(11); p.noStroke();
    p.fill(COLOR_A); p.textAlign(p.LEFT, p.CENTER);
    p.text('A  ' + counts.A + ' 타일', barX + 6, statsY + 9);
    p.fill(COLOR_B); p.textAlign(p.RIGHT, p.CENTER);
    p.text(counts.B + ' 타일  B', barX + barW - 6, statsY + 35);

    p.fill(100); p.textAlign(p.CENTER, p.CENTER); p.textSize(10);
    const zPct = Math.round((counts.Z / totalTiles) * 100);
    p.text('좀비 점령: ' + counts.Z + '타일 (' + zPct + '%)', cx, statsY + 58);
    p.textStyle(p.NORMAL);
  }

  // ── 최고 기록
  const scoreY = panY + 108;
  p.stroke(40); p.strokeWeight(1);
  p.line(panX + 24, scoreY - 6, panX + panW - 24, scoreY - 6);
  p.noStroke();

  p.textAlign(p.CENTER, p.CENTER);
  if (isNewHighScore) {
    const blink = Math.floor(p.frameCount / 10) % 2 === 0;
    p.textStyle(p.BOLD); p.textSize(14);
    p.fill(blink ? '#FFD600' : '#FF8A00');
    p.text('🔥  최고 기록 경신!  🔥', cx, scoreY + 10);
    p.textStyle(p.NORMAL); p.fill(200); p.textSize(11);
    if (currentUserId) {
      const userBest = accounts[currentUserId] ? accounts[currentUserId].highScore : 0;
      p.text(currentUserId + '님의 최고 기록: ' + userBest + ' 타일', cx, scoreY + 28);
    } else {
      p.text('최고 기록: ' + highScore + ' 타일', cx, scoreY + 28);
    }
  } else {
    const best = Math.max(counts.A, counts.B, counts.team);
    p.fill(130); p.textSize(11);
    p.text('이번 점수: ' + best + ' 타일', cx, scoreY + 8);
    if (currentUserId) {
      const userBest = accounts[currentUserId] ? accounts[currentUserId].highScore : 0;
      p.fill(90); p.text(currentUserId + '님의 최고 기록: ' + userBest + ' 타일', cx, scoreY + 24);
    } else {
      p.fill(90); p.text('최고 기록: ' + highScore + ' 타일', cx, scoreY + 24);
    }
  }

  // ── 다시 시작 버튼
  const btnW = 240, btnH = 44;
  const btnX = cx - btnW / 2;
  const btnY2 = panY + panH - 58;
  const blink2 = Math.floor(p.frameCount / 15) % 2 === 0;
  if (blink2) {
    p.fill(67, 160, 71, 50); p.noStroke();
    p.rect(btnX - 4, btnY2 - 4, btnW + 8, btnH + 8, 16);
  }
  p.fill(blink2 ? '#43A047' : '#2E7D32');
  p.stroke('#76FF03'); p.strokeWeight(2);
  p.rect(btnX, btnY2, btnW, btnH, 12);
  p.noStroke();
  p.fill(255, 255, 255, 30);
  p.rect(btnX + 2, btnY2 + 2, btnW - 4, btnH/2 - 2, 10, 10, 0, 0);
  p.textStyle(p.BOLD); p.textSize(15);
  p.fill(0, 50, 0);
  p.text('▶  다시 시작  (SPACE)', cx + 1, btnY2 + btnH/2 + 1);
  p.fill(255);
  p.text('▶  다시 시작  (SPACE)', cx, btnY2 + btnH/2);
  p.textStyle(p.NORMAL);
}

// ── 로비 화면
function drawLobby(p) {
  // 배경: 어두운 그리드 패턴
  p.background(8, 8, 12);
  p.noStroke();

  // 배경 그리드 패턴 (게임 분위기)
  p.stroke(18, 28, 18, 80);
  p.strokeWeight(0.5);
  for (let x = 0; x < CANVAS_W; x += 20) { p.line(x, 0, x, CANVAS_H); }
  for (let y = 0; y < CANVAS_H; y += 20) { p.line(0, y, CANVAS_W, y); }
  p.noStroke();

  // 제목을 완전히 비추는 넓은 글로우 (여러 레이어)
  for (let i = 10; i >= 1; i--) {
    p.fill(34, 180, 60, 7 - Math.floor(i / 2));
    p.ellipse(CANVAS_W / 2, 80, 820 - i * 30, 260 - i * 14);
  }

  _updateDrawBloodDrops(p);

  p.textAlign(p.CENTER, p.CENTER);
  p.textFont('Nunito');

  const cx = CANVAS_W / 2;

  // ── 제목 영역 (상단 고정, 더 크게)
  // 제목 글로우 효과
  p.textStyle(p.BOLD);
  p.textSize(60);
  for (let i = 4; i >= 1; i--) {
    p.fill(34, 200, 60, 18 - i * 3);
    p.text('좀비 슬라이드 듀오', cx, 92 + i);
  }
  p.fill(10, 40, 12);
  p.text('좀비 슬라이드 듀오', cx + 2, 94);
  p.fill('#55CC60');
  p.text('좀비 슬라이드 듀오', cx, 92);
  p.textStyle(p.NORMAL);

  // 부제·크레딧: 제목+20, 아래요소+40 = +60px
  p.textSize(13);
  p.fill(160, 200, 160);
  p.text('2인 협력  →  배신 영역 점령 게임', cx, 180);

  p.textSize(10);
  p.fill(80, 110, 80);
  p.text('제작자 : 이현서  이유진  전재민', cx, 197);

  // ── 캐릭터 영역: 기존 165 + 80 = 245
  const ps    = 17;
  const charW = 8 * ps;
  const charH = 9 * ps;
  const charTopY = 245;

  const axMid = 140;
  const bxMid = CANVAS_W - 140;

  // Player A 패널 배경 (선 없음)
  p.fill(40, 10, 10, 120);
  p.noStroke();
  p.rect(axMid - charW/2 - 8, charTopY - 28, charW + 16, charH + 56, 8);

  // Player B 패널 배경 (선 없음)
  p.fill(10, 15, 40, 120);
  p.noStroke();
  p.rect(bxMid - charW/2 - 8, charTopY - 28, charW + 16, charH + 56, 8);

  _drawPMap(p, _PMAP, axMid - charW / 2, charTopY, ps, '#C62828', '#eeeeee', '#111111', '#ffffff', false);
  _drawPMap(p, _PMAP, bxMid - charW / 2, charTopY, ps, '#1565C0', '#eeeeee', '#111111', '#ffffff', true);

  const zps  = 15;
  const zW   = 8 * zps;
  const zTopY = charTopY + (charH - 9 * zps) / 2 + 4;

  // Zombie 패널 배경 (선 없음)
  p.fill(8, 30, 8, 120);
  p.noStroke();
  p.rect(cx - zW/2 - 8, charTopY - 28, zW + 16, charH + 56, 8);

  _drawPMap(p, _ZMAP, cx - zW / 2, zTopY, zps, '#2E7D32', '#ccffcc', '#1B5E20', '#e8ffe8', false);

  // 라벨 (패널 상단) - 모두 동일한 labelY 사용
  const labelY = charTopY - 14;
  p.textStyle(p.BOLD);
  p.textSize(11); p.noStroke();

  // Player A 라벨 배지
  p.fill('#C62828');
  p.rect(axMid - 38, labelY - 10, 76, 18, 4);
  p.fill(255); p.text('PLAYER  A', axMid, labelY);

  // Player B 라벨 배지
  p.fill('#1565C0');
  p.rect(bxMid - 38, labelY - 10, 76, 18, 4);
  p.fill(255); p.text('PLAYER  B', bxMid, labelY);

  // Zombie 라벨 배지 - zTopY 기준이 아닌 동일한 labelY 사용
  p.fill('#2E7D32');
  p.rect(cx - 42, labelY - 10, 84, 18, 4);
  p.fill('#ccffcc'); p.text('Z O M B I E', cx, labelY);
  p.textStyle(p.NORMAL);

  // VS 텍스트
  const vsY = charTopY + charH / 2;
  p.textStyle(p.BOLD);
  p.textSize(16);
  // VS 좌측
  p.fill(0, 0, 0, 140);
  p.ellipse((axMid + cx) / 2, vsY, 34, 34);
  p.fill(80, 80, 80); p.text('VS', (axMid + cx) / 2, vsY);
  // VS 우측
  p.fill(0, 0, 0, 140);
  p.ellipse((bxMid + cx) / 2, vsY, 34, 34);
  p.fill(80, 80, 80); p.text('VS', (bxMid + cx) / 2, vsY);
  p.textStyle(p.NORMAL);

  // ── 키 안내
  const kw = 26, kh = 22, gap = 3;
  const keyTopY = charTopY + charH + 10;

  _drawKey(p, 'W', axMid - kw/2,         keyTopY,        kw, kh, COLOR_A);
  _drawKey(p, 'A', axMid - kw*1.5 - gap, keyTopY+kh+gap, kw, kh, COLOR_A);
  _drawKey(p, 'S', axMid - kw/2,         keyTopY+kh+gap, kw, kh, COLOR_A);
  _drawKey(p, 'D', axMid + kw/2 + gap,   keyTopY+kh+gap, kw, kh, COLOR_A);

  _drawKey(p, '↑', bxMid - kw/2,         keyTopY,        kw, kh, COLOR_B);
  _drawKey(p, '←', bxMid - kw*1.5 - gap, keyTopY+kh+gap, kw, kh, COLOR_B);
  _drawKey(p, '↓', bxMid - kw/2,         keyTopY+kh+gap, kw, kh, COLOR_B);
  _drawKey(p, '→', bxMid + kw/2 + gap,   keyTopY+kh+gap, kw, kh, COLOR_B);

  // ── 시작 버튼 (키 아래 충분한 여백)
  const startBtnY = keyTopY + kh * 2 + gap + 18;
  const btnW = 360, btnH = 52;
  const btnX = cx - btnW / 2;
  const blink = Math.floor(p.frameCount / 16) % 2 === 0;

  // 버튼 글로우
  if (blink) {
    p.fill(67, 160, 71, 40);
    p.rect(btnX - 4, startBtnY - 4, btnW + 8, btnH + 8, 18);
  }
  // 버튼 본체
  p.fill(blink ? '#43A047' : '#2E7D32');
  p.stroke('#76FF03'); p.strokeWeight(2);
  p.rect(btnX, startBtnY, btnW, btnH, 12);
  // 버튼 상단 하이라이트
  p.noStroke();
  p.fill(255, 255, 255, 30);
  p.rect(btnX + 2, startBtnY + 2, btnW - 4, btnH / 2 - 2, 10, 10, 0, 0);
  p.noStroke();
  p.textStyle(p.BOLD);
  p.textSize(20);
  p.fill(0, 60, 0);
  p.text('▶  시작하기  (SPACE)', cx + 1, startBtnY + btnH / 2 + 1);
  p.fill(255);
  p.text('▶  시작하기  (SPACE)', cx, startBtnY + btnH / 2);
  p.textStyle(p.NORMAL);

  // ── 게임 방법 버튼
  const howtoBtnY = startBtnY + btnH + 12;
  const htW = 190, htH = 36;
  const htX = cx - htW / 2;
  const htBlink = Math.floor(p.frameCount / 25) % 2 === 0;
  p.fill(htBlink ? '#1565C0' : '#0D47A1');
  p.stroke('#42A5F5'); p.strokeWeight(1.5);
  p.rect(htX, howtoBtnY, htW, htH, 8);
  p.noStroke();
  p.fill(255, 255, 255, 25);
  p.rect(htX + 2, howtoBtnY + 2, htW - 4, htH / 2 - 2, 6, 6, 0, 0);
  p.fill(255);
  p.textStyle(p.BOLD);
  p.textSize(13);
  p.text('❓  게임 방법', cx, howtoBtnY + htH / 2);
  p.textStyle(p.NORMAL);

  // ── 계정 영역
  const accountAreaY = howtoBtnY + htH + 14;
  if (currentUserId) {
    // 로그인 상태 패널
    p.fill(20, 28, 20, 200);
    p.stroke(50, 80, 50); p.strokeWeight(1);
    p.rect(cx - 110, accountAreaY - 4, 220, 72, 8);
    p.noStroke();
    p.textSize(10); p.fill(100, 150, 100);
    p.text('로그인 중', cx, accountAreaY + 10);
    p.textSize(14); p.fill(220, 255, 220);
    p.textStyle(p.BOLD);
    p.text('👤 ' + currentUserId, cx, accountAreaY + 28);
    p.textStyle(p.NORMAL);
    p.textSize(10); p.fill(100, 130, 100);
    p.text('최고 기록: ' + highScore + ' 타일', cx, accountAreaY + 44);

    p.fill(35, 35, 48); p.stroke(65); p.strokeWeight(1);
    p.rect(cx - 40, accountAreaY + 52, 80, 24, 5);
    p.noStroke(); p.fill(140); p.textSize(11);
    p.text('로그아웃', cx, accountAreaY + 64);
  } else {
    // 비로그인 패널
    p.fill(18, 18, 28, 180);
    p.stroke(45, 45, 65); p.strokeWeight(1);
    p.rect(cx - 110, accountAreaY - 4, 220, 58, 8);
    p.noStroke();
    p.fill(80); p.textSize(9);
    p.text('아이디로 로그인하여 최고기록을 관리하세요', cx, accountAreaY + 8);

    // 로그인 버튼
    p.fill(28, 28, 42); p.stroke(60); p.strokeWeight(1);
    p.rect(cx - 92, accountAreaY + 18, 86, 28, 6);
    // 회원가입 버튼
    p.fill(38, 38, 55); p.stroke(75);
    p.rect(cx + 6, accountAreaY + 18, 86, 28, 6);
    p.noStroke();
    p.fill(190); p.textSize(12);
    p.textStyle(p.BOLD);
    p.text('로그인', cx - 49, accountAreaY + 32);
    p.text('회원가입', cx + 49, accountAreaY + 32);
    p.textStyle(p.NORMAL);
  }

  // ── 게임 방법 팝업
  if (showHowto) {
    p.fill(0, 0, 0, 200); p.noStroke(); p.rect(0, 0, CANVAS_W, CANVAS_H);
    const pw = 400, ph = 300;
    const px = cx - pw / 2;
    const py = CANVAS_H / 2 - ph / 2;

    // 팝업 그림자
    p.fill(0, 0, 0, 100); p.rect(px + 8, py + 8, pw, ph, 14);
    // 팝업 본체
    p.fill(12, 18, 12);
    p.stroke('#2E7D32'); p.strokeWeight(2);
    p.rect(px, py, pw, ph, 14);
    // 팝업 상단 헤더
    p.fill('#1B5E20');
    p.rect(px, py, pw, 44, 14, 14, 0, 0);
    p.noStroke();
    p.textStyle(p.BOLD);
    p.fill('#A5D6A7'); p.textSize(14); p.textAlign(p.LEFT, p.CENTER);
    p.text('📖  게임 방법', px + 20, py + 22);
    p.textStyle(p.NORMAL);
    // 닫기 버튼
    p.fill(80, 20, 20); p.stroke('#E53935'); p.strokeWeight(1);
    p.rect(px + pw - 36, py + 8, 28, 28, 6);
    p.noStroke(); p.fill(255); p.textSize(13); p.textAlign(p.CENTER, p.CENTER);
    p.text('✕', px + pw - 22, py + 22);

    const lines = [
      ['⏱', '협력 30초  →  배신 30초'],
      ['🐾', '꼬리를 뻗다 자기 땅으로 돌아오면 영역 확보'],
      ['💀', '상대 꼬리를 끊으면 사망'],
      ['🧟', '좀비 꼬리를 밟으면 좀비 사망'],
      ['💊', '약 :  보너스 땅 획득'],
      ['🩸', '피 :  좀비 가속'],
      ['⚡', '에너지드링크 :  속도 2배 + 강철꼬리'],
    ];
    const emojiX = px + 26;   // 이모티콘 고정 x
    const textX  = px + 56;   // 텍스트 시작 x (이모티콘과 완전히 분리)
    for (let i = 0; i < lines.length; i++) {
      const ly = py + 84 + i * 30;  // 기존 64 → 84 (+20px 아래로)
      if (i === 4) {
        p.stroke(40, 70, 40); p.strokeWeight(1);
        p.line(px + 16, ly - 10, px + pw - 16, ly - 10);
        p.noStroke(); p.fill(60, 100, 60); p.textSize(9); p.textAlign(p.LEFT, p.TOP);
        p.text('ITEMS', emojiX, ly - 8);
      }
      // 이모티콘
      p.noStroke(); p.textSize(15); p.textAlign(p.LEFT, p.CENTER);
      p.fill(255);
      p.text(lines[i][0], emojiX, ly);
      // 설명 텍스트
      p.fill(160, 200, 160); p.textSize(11);
      p.text(lines[i][1], textX, ly);
    }
  }

  // ── 로그인/회원가입 팝업
  if (lobbySubState === 'login' || lobbySubState === 'register') {
    p.fill(0, 0, 0, 210); p.noStroke(); p.rect(0, 0, CANVAS_W, CANVAS_H);
    const pw = 340, ph = 210;
    const px = cx - pw / 2;
    const py = CANVAS_H / 2 - ph / 2;

    // 그림자
    p.fill(0, 0, 0, 100); p.rect(px + 6, py + 6, pw, ph, 14);
    // 팝업 본체
    p.fill(14, 14, 22);
    const popColor = lobbySubState === 'login' ? '#1565C0' : '#4CAF50';
    p.stroke(popColor); p.strokeWeight(2);
    p.rect(px, py, pw, ph, 14);
    // 헤더
    p.fill(lobbySubState === 'login' ? '#0D47A1' : '#1B5E20');
    p.rect(px, py, pw, 44, 14, 14, 0, 0);
    p.noStroke();
    p.textStyle(p.BOLD);
    p.fill(240); p.textSize(14); p.textAlign(p.CENTER, p.CENTER);
    const popTitle = lobbySubState === 'login' ? '🔑  로그인' : '📝  회원가입';
    p.text(popTitle, cx, py + 22);
    p.textStyle(p.NORMAL);
    // 닫기
    p.fill(50, 20, 20); p.stroke('#E53935'); p.strokeWeight(1);
    p.rect(px + pw - 36, py + 8, 28, 28, 6);
    p.noStroke(); p.fill(255); p.textSize(13); p.textAlign(p.CENTER, p.CENTER);
    p.text('✕', px + pw - 22, py + 22);

    p.fill(110); p.textSize(11); p.textAlign(p.CENTER, p.TOP);
    const desc = lobbySubState === 'login' ? '아이디를 입력하세요 (최대 16자)' : '새 아이디를 입력하세요 (최대 16자)';
    p.text(desc, cx, py + 54);
    const ibX = px + 20, ibY = py + 78, ibW = pw - 40, ibH = 36;
    p.fill(20, 20, 32); p.stroke(90); p.strokeWeight(1.5);
    p.rect(ibX, ibY, ibW, ibH, 6);
    p.noStroke();
    const cursor = Math.floor(p.frameCount / 15) % 2 === 0 ? '|' : '';
    p.fill(220); p.textSize(14); p.textAlign(p.LEFT, p.CENTER);
    p.text(inputBuffer + cursor, ibX + 10, ibY + ibH / 2);
    if (inputError) {
      p.fill('#FF5252'); p.textSize(11); p.textAlign(p.CENTER, p.TOP);
      p.text(inputError, cx, py + 122);
    }
    const popBtnY = py + ph - 54;
    p.fill(lobbySubState === 'login' ? '#1565C0' : '#2E7D32');
    p.stroke(lobbySubState === 'login' ? '#42A5F5' : '#4CAF50'); p.strokeWeight(1);
    p.rect(cx - 70, popBtnY, 140, 36, 8);
    p.noStroke(); p.textStyle(p.BOLD);
    p.fill(255); p.textSize(13); p.textAlign(p.CENTER, p.CENTER);
    p.text('확인 (Enter)', cx, popBtnY + 18);
    p.textStyle(p.NORMAL);
  }
}

function _updateDrawBloodDrops(p) {
  p.noStroke();
  for (const d of bloodDrops) {
    const r1 = 160, g1 = 0, b1 = 0;
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
      p.ellipse(d.x, d.y, d.size, d.size);
      p.fill(r1, g1, b1, d.alpha * 0.7);
      p.ellipse(d.x + d.size * 0.8, d.y - d.size * 0.4, d.size * 0.5, d.size * 0.5);
      p.ellipse(d.x - d.size * 0.6, d.y + d.size * 0.5, d.size * 0.4, d.size * 0.4);
    }
    for (let i = 0; i < d.drips; i++) {
      const dr = d.dripOffsets[i];
      p.fill(120, 0, 0, d.alpha * 0.5);
      p.ellipse(d.x + dr.ox, d.y + dr.oy, dr.size, dr.size * 1.4);
    }
  }
}
