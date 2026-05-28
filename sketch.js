// sketch.js

let phase = PHASE_LOBBY;
let gameTimer = 0;
let betrayalTriggered = false;
let winner = null;
let soloTimer = 0;
let deadPlayerId = null;
let betrayalAnnounceFade = 0;
let showHowto = false;

let highScore = 0;
let isNewHighScore = false;

// 플레이어 픽셀맵 (8열 × 9행)
// 0=투명, 1=몸통색, 2=눈흰자, 3=눈동자
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
// 0=투명, 1=몸통(초록), 2=눈흰자, 3=눈동자(진초록), 4=이빨(연초록)
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

// 픽셀맵 드로잉 헬퍼
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
}

function draw() {
  background(COLOR_EMPTY);
  if (phase === PHASE_LOBBY) { drawLobby(this); return; }

  if (phase === PHASE_END) {
    drawGrid(this); drawZombies(this);
    playerA.draw(this); playerB.draw(this);
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
  const best = Math.max(counts.A, counts.B, counts.team);
  if (best > highScore) { highScore = best; isNewHighScore = true; }
}

function keyPressed() {
  if (phase === PHASE_LOBBY && keyCode === 32 && !showHowto) { phase = PHASE_COOP; return; }
  if (phase === PHASE_LOBBY && keyCode === 27 && showHowto)  { showHowto = false; return; }
  if (phase === PHASE_END   && keyCode === 32) { resetGame(); return; }
  if (betrayalAnnounceFade > 0) return;
  if (phase === PHASE_COOP || phase === PHASE_SOLO || phase === PHASE_BETRAYAL) {
    playerA.handleKeyPressed(keyCode);
    playerB.handleKeyPressed(keyCode);
  }
}

function mousePressed() {
  const cx = CANVAS_W / 2; // 450

  if (phase === PHASE_LOBBY && showHowto) {
    const pw = 360, ph = 260;
    const px = cx - pw / 2;
    const py = CANVAS_H / 2 - ph / 2;
    // X 버튼
    if (mouseX > px + pw - 36 && mouseX < px + pw - 6 && mouseY > py + 6 && mouseY < py + 36) {
      showHowto = false; return;
    }
    // 팝업 바깥 클릭
    if (mouseX < px || mouseX > px + pw || mouseY < py || mouseY > py + ph) {
      showHowto = false; return;
    }
    return;
  }

  if (phase === PHASE_LOBBY) {
    // 시작하기 버튼: x 300~600, y 370~432
    if (mouseX > 300 && mouseX < 600 && mouseY > 370 && mouseY < 432) {
      phase = PHASE_COOP; return;
    }
    // 게임 방법 버튼: x 380~520, y 445~475
    if (mouseX > 380 && mouseX < 520 && mouseY > 445 && mouseY < 475) {
      showHowto = true; return;
    }
  }

  if (phase === PHASE_END) {
    const cy = CANVAS_H / 2;
    if (mouseX > cx - 80 && mouseX < cx + 80 && mouseY > cy + 58 && mouseY < cy + 96) {
      resetGame(); return;
    }
  }
}

function drawResultScreen(p, counts, winner, highScore, isNewHighScore) {
  p.fill(0, 0, 0, 200); p.noStroke(); p.rect(0, 0, CANVAS_W, CANVAS_H);
  const cx = CANVAS_W / 2, cy = CANVAS_H / 2;
  p.fill(20, 20, 30, 240); p.stroke(80); p.strokeWeight(1);
  p.rect(cx - 200, cy - 150, 400, 300, 12);
  p.noStroke(); p.textAlign(p.CENTER, p.CENTER);
  p.textSize(22); p.fill(255); p.text('게임 종료', cx, cy - 115);
  p.textSize(26);
  if (winner === 'A')         { p.fill(COLOR_A); p.text('플레이어 A 승리! 🏆', cx, cy - 75); }
  else if (winner === 'B')    { p.fill(COLOR_B); p.text('플레이어 B 승리! 🏆', cx, cy - 75); }
  else if (winner === 'draw') { p.fill('#FFD600'); p.text('무승부!', cx, cy - 75); }
  else                        { p.fill('#AB47BC'); p.text('좀비의 승리... 😱', cx, cy - 75); }
  p.textSize(14);
  if (!betrayalTriggered && winner === 'zombie') {
    p.fill(COLOR_TEAM); p.text(`TEAM 영역: ${counts.team} 타일`, cx, cy - 22);
  } else {
    p.fill(COLOR_A); p.text(`A 영역: ${counts.A} 타일`, cx, cy - 35);
    p.fill(COLOR_B); p.text(`B 영역: ${counts.B} 타일`, cx, cy - 10);
  }
  p.textSize(13);
  if (isNewHighScore) {
    const blink = Math.floor(p.frameCount / 10) % 2 === 0;
    p.fill(blink ? '#FFD600' : '#FF8A00');
    p.text('🔥 최고 기록 경신! 🔥', cx, cy + 20);
    p.fill(255); p.text(`현재 최고 기록: ${highScore} 타일`, cx, cy + 40);
  } else {
    p.fill(180); p.text(`최고 기록: ${highScore} 타일`, cx, cy + 30);
  }
  p.fill(50, 50, 70); p.stroke(120); p.strokeWeight(1);
  p.rect(cx - 90, cy + 75, 180, 38, 8);
  p.noStroke(); p.fill(200); p.textSize(13);
  p.text('다시 시작 (SPACE)', cx, cy + 95);
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

function drawLobby(p) {
  p.background(10, 10, 15);
  p.noStroke();
  p.textAlign(p.CENTER, p.CENTER);

  const cx = CANVAS_W / 2; // 450

  // ── 제목 ──────────────────────────────────────────────
  p.textSize(60);
  p.fill('#4CAF50');
  p.text('좀비 영역 전쟁', cx, 110);

  p.textSize(13);
  p.fill(110);
  p.text('2인 협력  →  배신 영역 점령 게임', cx, 165);

  p.textSize(11);
  p.fill(70);
  p.text('제작자 : 이현서  이유진  전재민', cx, 186);

  // ── 픽셀 캐릭터 ───────────────────────────────────────
  // ps=11 → 캐릭터 88×99px
  const ps    = 11;
  const charW = 8 * ps;  // 88
  const charH = 9 * ps;  // 99
  const charTopY = 220;

  // Player A: 중심 x=180, 오른쪽 바라봄
  const axMid = 180;
  _drawPMap(p, _PMAP, axMid - charW / 2, charTopY, ps,
    '#C62828', '#eeeeee', '#111111', '#ffffff', false);

  // Player B: 중심 x=720, 왼쪽 바라봄
  const bxMid = 720;
  _drawPMap(p, _PMAP, bxMid - charW / 2, charTopY, ps,
    '#1565C0', '#eeeeee', '#111111', '#ffffff', true);

  // Zombie: 중심 x=450, ps=10 → 80×90px
  const zps = 10;
  const zW  = 8 * zps; // 80
  _drawPMap(p, _ZMAP, cx - zW / 2, charTopY + 5, zps,
    '#2E7D32', '#ccffcc', '#1B5E20', '#e8ffe8', false);

  // ── 라벨 + 키 ─────────────────────────────────────────
  const labelY = charTopY - 20;
  const keyY   = charTopY + charH + 18;

  p.textSize(13);
  p.fill(COLOR_A);
  p.text('PLAYER  A', axMid, labelY);

  p.textSize(12);
  p.fill(COLOR_A);
  p.text('W  /  A  /  S  /  D', axMid, keyY);

  p.textSize(13);
  p.fill(COLOR_B);
  p.text('PLAYER  B', bxMid, labelY);

  p.textSize(12);
  p.fill(COLOR_B);
  p.text('↑  /  ↓  /  ←  /  →', bxMid, keyY);

  p.textSize(12);
  p.fill('#2E7D32');
  p.text('Z O M B I E', cx, labelY);

  // ── VS + 구분선 ───────────────────────────────────────
  p.textSize(16);
  p.fill(45);
  p.text('VS', 315, charTopY + charH / 2);
  p.text('VS', 585, charTopY + charH / 2);

  p.stroke(30);
  p.strokeWeight(1);
  p.line(360, charTopY, 360, charTopY + charH);
  p.line(540, charTopY, 540, charTopY + charH);
  p.noStroke();

  // ── 시작하기 버튼 (y: 370~432, 높이 62) ──────────────
  const btnW = 300;
  const btnH = 62;
  const btnX = cx - btnW / 2;
  const btnY = 370;
  const blink = Math.floor(p.frameCount / 18) % 2 === 0;
  p.fill(blink ? '#43A047' : '#2E7D32');
  p.rect(btnX, btnY, btnW, btnH, 14);
  p.fill(255);
  p.textSize(22);
  p.text('▶  시작하기  (SPACE)', cx, btnY + btnH / 2);

  // ── 게임 방법 버튼 (y: 445~475) ──────────────────────
  const htW = 140;
  const htH = 30;
  const htX = cx - htW / 2;
  const htY = 445;
  p.fill(22, 22, 30);
  p.stroke(55);
  p.strokeWeight(1);
  p.rect(htX, htY, htW, htH, 7);
  p.noStroke();
  p.fill(120);
  p.textSize(12);
  p.text('게임  방법', cx, htY + htH / 2);

  // ── 게임 방법 팝업 ────────────────────────────────────
  if (showHowto) {
    p.fill(0, 0, 0, 190);
    p.noStroke();
    p.rect(0, 0, CANVAS_W, CANVAS_H);

    const pw = 360, ph = 260;
    const px = cx - pw / 2;
    const py = CANVAS_H / 2 - ph / 2;

    p.fill(16, 16, 24);
    p.stroke(70);
    p.strokeWeight(1);
    p.rect(px, py, pw, ph, 12);
    p.noStroke();

    p.fill('#4CAF50');
    p.textSize(14);
    p.textAlign(p.LEFT, p.TOP);
    p.text('[ 게임 방법 ]', px + 22, py + 20);

    p.fill(80);
    p.textSize(15);
    p.textAlign(p.RIGHT, p.TOP);
    p.text('✕', px + pw - 16, py + 16);

    p.fill(145);
    p.textSize(11);
    p.textAlign(p.LEFT, p.TOP);
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
}
