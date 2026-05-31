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

// ── 승리 애니메이션
let fillAnimActive = false;
let fillAnimRow = 0;
const FILL_SPEED = 2;

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

// 좀비 으르렁 소리 (게임 시작/재시작)
function playZombieRoar() {
  try {
    const ctx = getAudioCtx();
    const duration = 1.2;
    // 메인 오실레이터 (낮고 거친)
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const distortion = ctx.createWaveShaper();

    // distortion 커브
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const x = (i * 2) / 256 - 1;
      curve[i] = (Math.PI + 200) * x / (Math.PI + 200 * Math.abs(x));
    }
    distortion.curve = curve;

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(80, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(55, ctx.currentTime + 0.4);
    osc.frequency.linearRampToValueAtTime(90, ctx.currentTime + 0.8);
    osc.frequency.linearRampToValueAtTime(40, ctx.currentTime + duration);

    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.4, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.4, ctx.currentTime + 0.9);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + duration);

    osc.connect(distortion);
    distortion.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
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
  for (let i = 0; i < 18; i++) {
    bloodDrops.push(_newBloodDrop(true));
  }
}

function _newBloodDrop(randomY) {
  return {
    x: Math.random() * CANVAS_W,
    y: randomY ? Math.random() * CANVAS_H : -20,
    speed: 0.5 + Math.random() * 1.5,
    size: 4 + Math.random() * 12,
    alpha: 120 + Math.random() * 100,
    wobble: Math.random() * Math.PI * 2,
    wobbleSpeed: 0.01 + Math.random() * 0.02,
    drip: Math.random() > 0.5,
    dripLen: 5 + Math.random() * 30,
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
  let fillCol;
  if      (winner === 'A') fillCol = COLOR_A;
  else if (winner === 'B') fillCol = COLOR_B;
  else if (winner === 'draw') fillCol = '#FFD600';
  else                     fillCol = COLOR_ZOMBIE;

  p.noStroke(); p.fill(fillCol);
  for (let row = 0; row < fillAnimRow; row++) {
    p.rect(0, row * TILE_SIZE, CANVAS_W, TILE_SIZE);
  }

  fillAnimRow += FILL_SPEED;
  if (fillAnimRow >= ROWS) {
    fillAnimActive = false;
  }
}

function _triggerBetrayal() {
  betrayalTriggered = true;
  phase = PHASE_BETRAYAL;

  // ── 정확히 50:50 분할 ──────────────────────────────────
  // 모든 플레이어 땅(TEAM, A, B, NONE)을 세어 정확히 절반씩
  const midC = Math.floor(COLS / 2);
  const midR = Math.floor(ROWS / 2);

  // 플레이어 부활 위치 설정
  if (!playerA.alive) playerA.revive(midR - 3, midC - 5, OWNER_A);
  if (!playerB.alive) playerB.revive(midR + 3, midC + 5, OWNER_B);

  // 정확한 절반 분할: 왼쪽 절반 A, 오른쪽 절반 B (좀비 땅 제외)
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (grid[r][c].owner !== OWNER_ZOMBIE) {
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

  // 정확한 절반 분할
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (grid[r][c].owner !== OWNER_ZOMBIE) {
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
    // 시작하기 버튼
    if (mouseX > 240 && mouseX < 660 && mouseY > 448 && mouseY < 535) {
      playZombieRoar();
      phase = PHASE_COOP; return;
    }
    if (mouseX > 359 && mouseX < 541 && mouseY > 551 && mouseY < 590) {
      showHowto = true; return;
    }
    if (mouseX > cx - 95 && mouseX < cx - 5 && mouseY > 605 && mouseY < 637) {
      lobbySubState = 'login'; inputBuffer = ''; inputError = ''; return;
    }
    if (mouseX > cx + 5 && mouseX < cx + 95 && mouseY > 605 && mouseY < 637) {
      lobbySubState = 'register'; inputBuffer = ''; inputError = ''; return;
    }
    if (currentUserId) {
      if (mouseX > cx - 45 && mouseX < cx + 45 && mouseY > 605 && mouseY < 637) {
        currentUserId = null; highScore = 0; return;
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

  // ── 혈흔 드롭 효과
  _updateDrawBloodDrops(p);

  p.textAlign(p.CENTER, p.CENTER);
  p.textFont('Nunito');

  const cx = CANVAS_W / 2;

  // ── 제목
  p.textStyle(p.BOLD);
  p.textSize(72);
  p.fill('#1a5c1d');
  p.text('좀비 슬라이드 듀오', cx + 3, 88);
  p.text('좀비 슬라이드 듀오', cx - 3, 88);
  p.text('좀비 슬라이드 듀오', cx, 91);
  p.text('좀비 슬라이드 듀오', cx, 85);
  p.fill('#2e7d32');
  p.text('좀비 슬라이드 듀오', cx + 2, 87);
  p.text('좀비 슬라이드 듀오', cx - 2, 87);
  p.fill('#4CAF50');
  p.text('좀비 슬라이드 듀오', cx, 86);
  p.textStyle(p.NORMAL);

  // ── 부제목
  p.textSize(14);
  p.fill(255);
  p.text('2인 협력  →  배신 영역 점령 게임', cx, 148);

  p.textSize(11);
  p.fill(200);
  p.text('제작자 : 이현서  이유진  전재민', cx, 166);

  // ── 픽셀 캐릭터
  const ps    = 17;
  const charW = 8 * ps;
  const charH = 9 * ps;
  const charTopY = 195;

  const axMid = 160;
  _drawPMap(p, _PMAP, axMid - charW / 2, charTopY, ps,
    '#C62828', '#eeeeee', '#111111', '#ffffff', false);

  const bxMid = 740;
  _drawPMap(p, _PMAP, bxMid - charW / 2, charTopY, ps,
    '#1565C0', '#eeeeee', '#111111', '#ffffff', true);

  const zps  = 15;
  const zW   = 8 * zps;
  const zTopY = charTopY + (charH - 9 * zps) / 2;
  _drawPMap(p, _ZMAP, cx - zW / 2, zTopY, zps,
    '#2E7D32', '#ccffcc', '#1B5E20', '#e8ffe8', false);

  // ── PLAYER 라벨
  const labelY = charTopY - 22;
  p.textStyle(p.BOLD);
  p.textSize(13); p.noStroke();
  p.fill(COLOR_A); p.text('PLAYER  A', axMid, labelY);
  p.fill(COLOR_B); p.text('PLAYER  B', bxMid, labelY);
  p.fill('#2E7D32'); p.text('Z O M B I E', cx, labelY);
  p.textStyle(p.NORMAL);

  // ── VS
  const vsY = charTopY + charH / 2;
  p.textStyle(p.BOLD);
  p.textSize(18); p.fill(50);
  p.text('VS', 309, vsY);
  p.text('VS', 591, vsY);
  p.textStyle(p.NORMAL);

  p.stroke(28); p.strokeWeight(1);
  p.line(360, charTopY + 10, 360, charTopY + charH - 10);
  p.line(540, charTopY + 10, 540, charTopY + charH - 10);
  p.noStroke();

  // ── 키캡
  const kw = 28, kh = 24, gap = 4;
  const keyTopY = charTopY + charH + 25;

  _drawKey(p, 'W', axMid - kw/2,           keyTopY,        kw, kh, COLOR_A);
  _drawKey(p, 'A', axMid - kw*1.5 - gap,   keyTopY+kh+gap, kw, kh, COLOR_A);
  _drawKey(p, 'S', axMid - kw/2,           keyTopY+kh+gap, kw, kh, COLOR_A);
  _drawKey(p, 'D', axMid + kw/2 + gap,     keyTopY+kh+gap, kw, kh, COLOR_A);

  _drawKey(p, '↑', bxMid - kw/2,           keyTopY,        kw, kh, COLOR_B);
  _drawKey(p, '←', bxMid - kw*1.5 - gap,   keyTopY+kh+gap, kw, kh, COLOR_B);
  _drawKey(p, '↓', bxMid - kw/2,           keyTopY+kh+gap, kw, kh, COLOR_B);
  _drawKey(p, '→', bxMid + kw/2 + gap,     keyTopY+kh+gap, kw, kh, COLOR_B);

  // ── 시작하기 버튼
  const btnW = 420, btnH = 87;
  const btnX = cx - btnW / 2;
  const btnY = 448;
  const blink = Math.floor(p.frameCount / 18) % 2 === 0;
  p.fill(blink ? '#43A047' : '#2E7D32');
  p.rect(btnX, btnY, btnW, btnH, 16);
  p.textStyle(p.BOLD);
  p.textSize(26);
  p.fill(0, 60, 0);
  p.text('▶  시작하기  (SPACE)', cx + 1, btnY + btnH / 2 + 1);
  p.fill(255);
  p.text('▶  시작하기  (SPACE)', cx, btnY + btnH / 2);
  p.textStyle(p.NORMAL);

  // ── 게임 방법 버튼
  const htW = 190, htH = 42;
  const htX = cx - htW / 2;
  const htY = 551;
  const htBlink = Math.floor(p.frameCount / 25) % 2 === 0;
  p.fill(htBlink ? '#1565C0' : '#0D47A1');
  p.stroke('#42A5F5');
  p.strokeWeight(2);
  p.rect(htX, htY, htW, htH, 10);
  p.noStroke();
  p.fill(255);
  p.textStyle(p.BOLD);
  p.textSize(15);
  p.text('❓  게임 방법', cx, htY + htH / 2);
  p.textStyle(p.NORMAL);

  // ── 로그인/회원가입
  const accountY = 610;
  if (currentUserId) {
    p.textSize(12); p.fill(160);
    p.text(`로그인 중: `, cx, accountY - 16);
    p.textSize(13); p.fill(255);
    p.text(`👤 ${currentUserId}`, cx, accountY);
    p.textSize(11); p.fill(100);
    p.text(`최고 기록: ${highScore} 타일`, cx, accountY + 18);
    p.fill(40, 40, 50); p.stroke(80); p.strokeWeight(1);
    p.rect(cx - 45, accountY + 30, 90, 28, 6);
    p.noStroke(); p.fill(160); p.textSize(11);
    p.text('로그아웃', cx, accountY + 44);
  } else {
    p.fill(30, 30, 40); p.stroke(70); p.strokeWeight(1);
    p.rect(cx - 95, accountY, 88, 32, 7);
    p.fill(50, 50, 65); p.stroke(90);
    p.rect(cx + 5, accountY, 88, 32, 7);
    p.noStroke();
    p.fill(200); p.textSize(12);
    p.text('로그인', cx - 51, accountY + 16);
    p.text('회원가입', cx + 49, accountY + 16);
    p.fill(90); p.textSize(10);
    p.text('아이디로 최고기록을 저장하세요', cx, accountY + 48);
  }

  // ── 게임 방법 팝업
  if (showHowto) {
    p.fill(0, 0, 0, 190); p.noStroke(); p.rect(0, 0, CANVAS_W, CANVAS_H);
    const pw = 380, ph = 270;
    const px = cx - pw / 2;
    const py = CANVAS_H / 2 - ph / 2;
    p.fill(16, 16, 24); p.stroke(70); p.strokeWeight(1);
    p.rect(px, py, pw, ph, 12); p.noStroke();
    p.textStyle(p.BOLD);
    p.fill('#4CAF50'); p.textSize(14); p.textAlign(p.LEFT, p.TOP);
    p.text('[ 게임 방법 ]', px + 22, py + 20);
    p.textStyle(p.NORMAL);
    p.fill(80); p.textSize(15); p.textAlign(p.RIGHT, p.TOP);
    p.text('✕', px + pw - 16, py + 16);
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
      p.text(lines[i], px + 22, py + 52 + i * 20);
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

    p.fill(80); p.textSize(15); p.textAlign(p.RIGHT, p.TOP);
    p.text('✕', px + pw - 16, py + 16);

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

// ── 혈흔 드롭 업데이트 & 그리기
function _updateDrawBloodDrops(p) {
  for (let i = 0; i < bloodDrops.length; i++) {
    const d = bloodDrops[i];
    d.y += d.speed;
    d.wobble += d.wobbleSpeed;
    const wx = Math.sin(d.wobble) * 2;

    // 혈흔 방울
    p.noStroke();
    p.fill(180, 0, 0, d.alpha * 0.6);
    p.ellipse(d.x + wx, d.y, d.size * 0.7, d.size);

    // 드립 (흘러내리는 효과)
    if (d.drip) {
      p.fill(140, 0, 0, d.alpha * 0.4);
      p.rect(d.x + wx - d.size * 0.15, d.y + d.size * 0.3, d.size * 0.3, d.dripLen, 3);
    }

    // 바닥에 닿으면 퍼짐 표시 후 재생성
    if (d.y > CANVAS_H + 60) {
      bloodDrops[i] = _newBloodDrop(false);
    }
  }
}
