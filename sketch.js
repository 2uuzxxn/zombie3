// sketch.js

let phase = PHASE_LOBBY;
let gameTimer = 0;
let betrayalTriggered = false;
let winner = null;
let soloTimer = 0;
let deadPlayerId = null;
let betrayalAnnounceFade = 0;
let showHowto = false;

// ── 아이디 / 계정 시스템 ──────────────────────────────────
// accounts: { id: { highScore: number } }
let accounts = {};
let currentUserId = null; // 로그인된 사용자 ID

// lobby 서브 상태: 'main' | 'login' | 'register'
let lobbySubState = 'main';
let inputBuffer = '';   // 현재 입력 중인 텍스트
let inputError  = '';   // 에러 메시지

let highScore = 0;
let isNewHighScore = false;

// ── 승리 애니메이션 ──────────────────────────────────────
// fillAnim: 승리자 색으로 위->아래 채우는 애니메이션
let fillAnimActive = false;
let fillAnimRow = 0;       // 현재 채운 행
const FILL_SPEED = 2;      // 프레임당 채울 행 수

// 플레이어 픽셀맵 (8열 × 9행)
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
  textFont('monospace');
  resetGame();
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
}

function draw() {
  background(COLOR_EMPTY);
  if (phase === PHASE_LOBBY) { drawLobby(this); return; }

  if (phase === PHASE_END) {
    drawGrid(this); drawZombies(this);
    playerA.draw(this); playerB.draw(this);

    // 승리 채우기 애니메이션 중
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

// ── 승리 채우기 애니메이션 ────────────────────────────────
function _drawFillAnim(p) {
  // winner 색 결정
  let fillCol;
  if      (winner === 'A') fillCol = COLOR_A;
  else if (winner === 'B') fillCol = COLOR_B;
  else if (winner === 'draw') fillCol = '#FFD600';
  else                     fillCol = COLOR_ZOMBIE;

  // 채우기
  p.noStroke(); p.fill(fillCol);
  for (let row = 0; row < fillAnimRow; row++) {
    p.rect(0, row * TILE_SIZE, CANVAS_W, TILE_SIZE);
  }

  fillAnimRow += FILL_SPEED;
  if (fillAnimRow >= ROWS) {
    fillAnimActive = false;
    // 이제 결과 화면 바로 표시
  }
}

function _triggerBetrayal() {
  betrayalTriggered = true;
  phase = PHASE_BETRAYAL;
  const midR = Math.floor(ROWS / 2);
  const midC = Math.floor(COLS / 2);
  if (!playerA.alive) playerA.revive(midR - 3, midC, OWNER_A);
  if (!playerB.alive) playerB.revive(midR + 3, midC, OWNER_B);
  const pA = { r: playerA.r, c: playerA.c };
  const pB = { r: playerB.r, c: playerB.c };
  voronoiSplit(pA, pB);
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
  voronoiSplit({ r: deadSpawnR, c: midC }, { r: survivor.r, c: survivor.c });
  dead.revive(deadSpawnR, midC, deadPlayerId === 'A' ? OWNER_A : OWNER_B);
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

  // 최고기록 갱신
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

  // 승리 채우기 애니메이션 시작
  fillAnimActive = true;
  fillAnimRow = 0;
}

// ── 키보드 입력 ───────────────────────────────────────────
function keyPressed() {
  // 로비 서브 상태 (로그인/회원가입 입력창)
  if (phase === PHASE_LOBBY && (lobbySubState === 'login' || lobbySubState === 'register')) {
    if (keyCode === 27) { lobbySubState = 'main'; inputBuffer = ''; inputError = ''; return; }
    if (keyCode === 13) { _submitInput(); return; }
    if (keyCode === 8)  { inputBuffer = inputBuffer.slice(0, -1); return; }
    // 일반 문자
    if (key.length === 1) { if (inputBuffer.length < 16) inputBuffer += key; }
    return;
  }

  if (phase === PHASE_LOBBY && keyCode === 32 && !showHowto) { phase = PHASE_COOP; return; }
  if (phase === PHASE_LOBBY && keyCode === 27 && showHowto)  { showHowto = false; return; }
  if (phase === PHASE_END   && keyCode === 32) { resetGame(); return; }
  if (betrayalAnnounceFade > 0) return;
  if (phase === PHASE_COOP || phase === PHASE_SOLO || phase === PHASE_BETRAYAL) {
    playerA.handleKeyPressed(keyCode);
    playerB.handleKeyPressed(keyCode);
  }
}

// 로그인/회원가입 처리
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

  // 로그인/회원가입 팝업에서 X 또는 바깥 클릭
  if (phase === PHASE_LOBBY && (lobbySubState === 'login' || lobbySubState === 'register')) {
    const pw = 340, ph = 200;
    const px = cx - pw / 2;
    const py = CANVAS_H / 2 - ph / 2;
    // X 버튼
    if (mouseX > px + pw - 36 && mouseX < px + pw - 6 && mouseY > py + 6 && mouseY < py + 36) {
      lobbySubState = 'main'; inputBuffer = ''; inputError = ''; return;
    }
    // 확인 버튼
    const btnY2 = py + ph - 52;
    if (mouseX > cx - 70 && mouseX < cx + 70 && mouseY > btnY2 && mouseY < btnY2 + 34) {
      _submitInput(); return;
    }
    // 바깥 클릭
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
      phase = PHASE_COOP; return;
    }
    // 게임 방법 버튼
    if (mouseX > 359 && mouseX < 541 && mouseY > 551 && mouseY < 590) {
      showHowto = true; return;
    }
    // 로그인 버튼
    if (mouseX > cx - 95 && mouseX < cx - 5 && mouseY > 605 && mouseY < 637) {
      lobbySubState = 'login'; inputBuffer = ''; inputError = ''; return;
    }
    // 회원가입 버튼
    if (mouseX > cx + 5 && mouseX < cx + 95 && mouseY > 605 && mouseY < 637) {
      lobbySubState = 'register'; inputBuffer = ''; inputError = ''; return;
    }
    // 로그아웃 버튼 (로그인 상태)
    if (currentUserId) {
      if (mouseX > cx - 45 && mouseX < cx + 45 && mouseY > 605 && mouseY < 637) {
        currentUserId = null; highScore = 0; return;
      }
    }
  }

  if (phase === PHASE_END) {
    const cy = CANVAS_H / 2;
    if (mouseX > cx - 80 && mouseX < cx + 80 && mouseY > cy + 58 && mouseY < cy + 96) {
      resetGame(); return;
    }
  }
}

// ── 결과 화면 ─────────────────────────────────────────────
function drawResultScreen(p, counts, winner, highScore, isNewHighScore) {
  p.fill(0, 0, 0, 200); p.noStroke(); p.rect(0, 0, CANVAS_W, CANVAS_H);
  const cx = CANVAS_W / 2, cy = CANVAS_H / 2;
  p.fill(20, 20, 30, 240); p.stroke(80); p.strokeWeight(1);
  p.rect(cx - 210, cy - 170, 420, 340, 12);
  p.noStroke(); p.textAlign(p.CENTER, p.CENTER);
  p.textSize(22); p.fill(255); p.text('게임 종료', cx, cy - 130);
  p.textSize(26);
  if (winner === 'A')         { p.fill(COLOR_A); p.text('플레이어 A 승리! 🏆', cx, cy - 90); }
  else if (winner === 'B')    { p.fill(COLOR_B); p.text('플레이어 B 승리! 🏆', cx, cy - 90); }
  else if (winner === 'draw') { p.fill('#FFD600'); p.text('무승부!', cx, cy - 90); }
  else                        { p.fill('#AB47BC'); p.text('좀비의 승리... 😱', cx, cy - 90); }
  p.textSize(14);
  if (!betrayalTriggered && winner === 'zombie') {
    p.fill(COLOR_TEAM); p.text(`TEAM 영역: ${counts.team} 타일`, cx, cy - 40);
  } else {
    p.fill(COLOR_A); p.text(`A 영역: ${counts.A} 타일`, cx, cy - 52);
    p.fill(COLOR_B); p.text(`B 영역: ${counts.B} 타일`, cx, cy - 28);
  }

  // 최고기록
  p.textSize(13);
  if (currentUserId) {
    const userBest = accounts[currentUserId] ? accounts[currentUserId].highScore : 0;
    if (isNewHighScore) {
      const blink = Math.floor(p.frameCount / 10) % 2 === 0;
      p.fill(blink ? '#FFD600' : '#FF8A00');
      p.text('🔥 최고 기록 경신! 🔥', cx, cy + 5);
      p.fill(255); p.text(`${currentUserId}님의 최고 기록: ${userBest} 타일`, cx, cy + 28);
    } else {
      const best = Math.max(counts.A, counts.B, counts.team);
      p.fill(180); p.text(`이번 점수: ${best} 타일`, cx, cy + 5);
      p.fill(140); p.text(`${currentUserId}님의 최고 기록: ${userBest} 타일`, cx, cy + 28);
    }
  } else {
    if (isNewHighScore) {
      const blink = Math.floor(p.frameCount / 10) % 2 === 0;
      p.fill(blink ? '#FFD600' : '#FF8A00');
      p.text('🔥 최고 기록 경신! 🔥', cx, cy + 5);
      p.fill(255); p.text(`최고 기록: ${highScore} 타일`, cx, cy + 28);
    } else {
      p.fill(180); p.text(`최고 기록: ${highScore} 타일`, cx, cy + 28);
    }
  }

  p.fill(50, 50, 70); p.stroke(120); p.strokeWeight(1);
  p.rect(cx - 90, cy + 58, 180, 38, 8);
  p.noStroke(); p.fill(200); p.textSize(13);
  p.text('다시 시작 (SPACE)', cx, cy + 78);
}

function showBetrayalAnnounce(p) { betrayalAnnounceFade = FRAME_RATE * 2; }
function drawBetrayalAnnounce(p) {
  if (betrayalAnnounceFade <= 0) return;
  betrayalAnnounceFade--;
  const alpha = Math.min(255, betrayalAnnounceFade * 5);
  p.fill(200, 0, 0, alpha); p.noStroke();
  p.rect(0, CANVAS_H / 2 - 45, CANVAS_W, 90);
  p.fill(255, 255, 255, alpha); p.textAlign(p.CENTER, p.CENTER);
  p.textSize(26); p.text('⚠ 배신 타이머 발동! ⚠', CANVAS_W / 2, CANVAS_H / 2 - 12);
  p.textSize(13); p.text('이제 팀원도 적입니다', CANVAS_W / 2, CANVAS_H / 2 + 18);
}

// ── 로비 화면 ─────────────────────────────────────────────
function drawLobby(p) {
  p.background(10, 10, 15);
  p.noStroke();
  p.textAlign(p.CENTER, p.CENTER);

  const cx = CANVAS_W / 2;

  // ── 제목: 더 두껍게 (4겹 오프셋) ──────────────────────
  p.textSize(72);
  // 그림자 레이어들
  p.fill('#1a5c1d');
  p.text('좀비 슬라이드 듀오', cx + 3, 88);
  p.text('좀비 슬라이드 듀오', cx - 3, 88);
  p.text('좀비 슬라이드 듀오', cx, 91);
  p.text('좀비 슬라이드 듀오', cx, 85);
  p.fill('#2e7d32');
  p.text('좀비 슬라이드 듀오', cx + 2, 87);
  p.text('좀비 슬라이드 듀오', cx - 2, 87);
  p.text('좀비 슬라이드 듀오', cx + 1, 88);
  p.text('좀비 슬라이드 듀오', cx - 1, 87);
  p.fill('#4CAF50');
  p.text('좀비 슬라이드 듀오', cx, 86);

  // ── 부제목 ───────────────────────────────────────────
  p.textSize(14);
  p.fill(255);
  p.text('2인 협력  →  배신 영역 점령 게임', cx, 148);

  p.textSize(11);
  p.fill(255);
  p.text('제작자 : 이현서  이유진  전재민', cx, 166);

  // ── 픽셀 캐릭터 ──────────────────────────────────────
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

  // ── PLAYER 라벨 ──────────────────────────────────────
  const labelY = charTopY - 22;
  p.textSize(13); p.noStroke();
  p.fill(COLOR_A); p.text('PLAYER  A', axMid, labelY);
  p.fill(COLOR_B); p.text('PLAYER  B', bxMid, labelY);
  p.fill('#2E7D32'); p.text('Z O M B I E', cx, labelY);

  // ── VS ───────────────────────────────────────────────
  const vsY = charTopY + charH / 2;
  p.textSize(18); p.fill(50);
  p.text('VS', 309, vsY);
  p.text('VS', 591, vsY);

  p.stroke(28); p.strokeWeight(1);
  p.line(360, charTopY + 10, 360, charTopY + charH - 10);
  p.line(540, charTopY + 10, 540, charTopY + charH - 10);
  p.noStroke();

  // ── 키캡 ─────────────────────────────────────────────
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

  // ── 시작하기 버튼 ────────────────────────────────────
  const btnW = 420, btnH = 87;
  const btnX = cx - btnW / 2;
  const btnY = 448;
  const blink = Math.floor(p.frameCount / 18) % 2 === 0;
  p.fill(blink ? '#43A047' : '#2E7D32');
  p.rect(btnX, btnY, btnW, btnH, 16);
  p.textSize(26);
  p.fill(0, 60, 0);
  p.text('▶  시작하기  (SPACE)', cx + 1, btnY + btnH / 2 + 1);
  p.fill(255);
  p.text('▶  시작하기  (SPACE)', cx, btnY + btnH / 2);

  // ── 게임 방법 버튼 (눈에 잘 띄게) ───────────────────
  const htW = 190, htH = 42;
  const htX = cx - htW / 2;
  const htY = 551;
  const htBlink = Math.floor(p.frameCount / 25) % 2 === 0;
  p.fill(htBlink ? '#1565C0' : '#0D47A1');
  p.stroke('#42A5F5');
  p.strokeWeight(2);
  p.rect(htX, htY, htW, htH, 10);
  p.noStroke();
  // 작은 아이콘 + 텍스트
  p.fill(255);
  p.textSize(15);
  p.text('❓  게임 방법', cx, htY + htH / 2);

  // ── 로그인/회원가입 버튼 (또는 로그인 상태 표시) ──────
  const accountY = 610;
  if (currentUserId) {
    // 로그인 상태
    p.textSize(12); p.fill(160);
    p.text(`로그인 중: `, cx, accountY - 16);
    p.textSize(13); p.fill(255);
    p.text(`👤 ${currentUserId}`, cx, accountY);
    p.textSize(11); p.fill(100);
    p.text(`최고 기록: ${highScore} 타일`, cx, accountY + 18);
    // 로그아웃 버튼
    p.fill(40, 40, 50); p.stroke(80); p.strokeWeight(1);
    p.rect(cx - 45, accountY + 30, 90, 28, 6);
    p.noStroke(); p.fill(160); p.textSize(11);
    p.text('로그아웃', cx, accountY + 44);
  } else {
    // 로그인 / 회원가입 버튼
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

  // ── 게임 방법 팝업 ────────────────────────────────────
  if (showHowto) {
    p.fill(0, 0, 0, 190); p.noStroke(); p.rect(0, 0, CANVAS_W, CANVAS_H);
    const pw = 380, ph = 270;
    const px = cx - pw / 2;
    const py = CANVAS_H / 2 - ph / 2;
    p.fill(16, 16, 24); p.stroke(70); p.strokeWeight(1);
    p.rect(px, py, pw, ph, 12); p.noStroke();
    p.fill('#4CAF50'); p.textSize(14); p.textAlign(p.LEFT, p.TOP);
    p.text('[ 게임 방법 ]', px + 22, py + 20);
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

  // ── 로그인/회원가입 팝업 ─────────────────────────────
  if (lobbySubState === 'login' || lobbySubState === 'register') {
    p.fill(0, 0, 0, 200); p.noStroke(); p.rect(0, 0, CANVAS_W, CANVAS_H);
    const pw = 340, ph = 200;
    const px = cx - pw / 2;
    const py = CANVAS_H / 2 - ph / 2;
    p.fill(16, 16, 26); p.stroke(80); p.strokeWeight(1);
    p.rect(px, py, pw, ph, 12); p.noStroke();

    // 타이틀
    p.fill(255); p.textSize(15); p.textAlign(p.CENTER, p.TOP);
    const title = lobbySubState === 'login' ? '🔑  로그인' : '📝  회원가입';
    p.text(title, cx, py + 22);

    // X 버튼
    p.fill(80); p.textSize(15); p.textAlign(p.RIGHT, p.TOP);
    p.text('✕', px + pw - 16, py + 16);

    // 설명
    p.fill(130); p.textSize(11); p.textAlign(p.CENTER, p.TOP);
    const desc = lobbySubState === 'login' ? '아이디를 입력하세요 (최대 16자)' : '새 아이디를 입력하세요 (최대 16자)';
    p.text(desc, cx, py + 52);

    // 입력 박스
    const ibX = px + 20, ibY = py + 76, ibW = pw - 40, ibH = 36;
    p.fill(25, 25, 38); p.stroke(100); p.strokeWeight(1.5);
    p.rect(ibX, ibY, ibW, ibH, 6);
    p.noStroke();
    // 커서 깜박임
    const cursor = Math.floor(p.frameCount / 15) % 2 === 0 ? '|' : '';
    p.fill(230); p.textSize(14); p.textAlign(p.LEFT, p.CENTER);
    p.text(inputBuffer + cursor, ibX + 10, ibY + ibH / 2);

    // 에러 메시지
    if (inputError) {
      p.fill('#FF5252'); p.textSize(11); p.textAlign(p.CENTER, p.TOP);
      p.text(inputError, cx, py + 120);
    }

    // 확인 버튼
    const btnY2 = py + ph - 50;
    p.fill('#2E7D32'); p.stroke('#4CAF50'); p.strokeWeight(1);
    p.rect(cx - 70, btnY2, 140, 34, 8);
    p.noStroke(); p.fill(255); p.textSize(13); p.textAlign(p.CENTER, p.CENTER);
    p.text('확인 (Enter)', cx, btnY2 + 17);
  }
}
