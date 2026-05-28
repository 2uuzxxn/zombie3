// sketch.js

let phase = PHASE_LOBBY;
let gameTimer = 0;
let betrayalTriggered = false;
let winner = null;
let soloTimer = 0;
let deadPlayerId = null;
let betrayalAnnounceFade = 0;
let showHowto = false; // 게임 방법 팝업 토글

let highScore = 0;
let isNewHighScore = false;

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
    drawGrid(this);
    drawTiles(this);
    drawZombies(this);
    playerA.draw(this); playerB.draw(this);
    drawBetrayalAnnounce(this);
    drawUI(this, phase, gameTimer / FRAME_RATE, countTiles());
    return;
  }

  gameTimer--;
  const timeLeftSec = gameTimer / FRAME_RATE;

  if (!betrayalTriggered && timeLeftSec <= BETRAYAL_TRIGGER_TIME) {
    _triggerBetrayal();
  }

  if (phase === PHASE_SOLO) {
    soloTimer--;
    if (soloTimer <= 0) _reviveDeadPlayer();
  }

  updateTiles(this);
  updateZombies([playerA, playerB], this);
  if (playerA.alive) playerA.update(playerB, zombies, phase, this);
  if (playerB.alive) playerB.update(playerA, zombies, phase, this);

  _checkEndConditions(timeLeftSec);

  drawGrid(this);
  drawTiles(this);
  drawZombies(this);
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
      showNotification(survivor,
        `P${deadPlayerId} 사망! ${SOLO_TIME_LIMIT}초 후 부활 & 배신 30초!`, '#FF9800');
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
  const deadSpawnC = midC;

  voronoiSplit({ r: deadSpawnR, c: deadSpawnC }, { r: survivor.r, c: survivor.c });

  const deadOwner = deadPlayerId === 'A' ? OWNER_A : OWNER_B;
  dead.revive(deadSpawnR, deadSpawnC, deadOwner);

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
    } else if (playerA.alive) {
      winner = 'A';
    } else if (playerB.alive) {
      winner = 'B';
    } else {
      winner = 'zombie';
    }
  } else if (reason === 'both_dead') {
    winner = 'zombie';
  }

  const currentMaxScore = Math.max(counts.A, counts.B, counts.team);
  if (currentMaxScore > highScore) {
    highScore = currentMaxScore;
    isNewHighScore = true;
  }
}

function keyPressed() {
  if (phase === PHASE_LOBBY && keyCode === 32 && !showHowto) { phase = PHASE_COOP; return; }
  if (phase === PHASE_LOBBY && keyCode === 27 && showHowto) { showHowto = false; return; } // ESC로 팝업 닫기
  if (phase === PHASE_END && keyCode === 32) { resetGame(); return; }
  if (betrayalAnnounceFade > 0) return;
  if (phase === PHASE_COOP || phase === PHASE_SOLO || phase === PHASE_BETRAYAL) {
    playerA.handleKeyPressed(keyCode);
    playerB.handleKeyPressed(keyCode);
  }
}

function mousePressed() {
  const cx = CANVAS_W / 2;
  const cy = CANVAS_H / 2;

  // 로비 - 게임 방법 팝업이 열려 있을 때
  if (phase === PHASE_LOBBY && showHowto) {
    // 팝업 닫기 버튼 (우상단 X, 팝업 우측 상단 기준)
    const popX = cx - 170;
    const popY = cy - 120;
    const closeX = popX + 340 - 30;
    const closeY = popY + 10;
    if (mouseX > closeX && mouseX < closeX + 30 && mouseY > closeY && mouseY < closeY + 30) {
      showHowto = false;
      return;
    }
    // 팝업 바깥 클릭 시 닫기
    if (mouseX < popX || mouseX > popX + 340 || mouseY < popY || mouseY > popY + 240) {
      showHowto = false;
      return;
    }
    return;
  }

  // 로비 - 시작하기 버튼 (크게: cx±130, cy+90 ~ cy+140)
  if (phase === PHASE_LOBBY && mouseX > cx - 130 && mouseX < cx + 130 && mouseY > cy + 90 && mouseY < cy + 142) {
    phase = PHASE_COOP;
    return;
  }

  // 로비 - 게임 방법 버튼 (cx±70, cy+152 ~ cy+182)
  if (phase === PHASE_LOBBY && mouseX > cx - 70 && mouseX < cx + 70 && mouseY > cy + 152 && mouseY < cy + 182) {
    showHowto = true;
    return;
  }

  // 종료 화면 - 다시 시작 버튼
  if (phase === PHASE_END && mouseX > cx - 80 && mouseX < cx + 80 && mouseY > cy + 58 && mouseY < cy + 96) {
    resetGame();
    return;
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
  if (winner === 'A')      { p.fill(COLOR_A); p.text('플레이어 A 승리! 🏆', cx, cy - 75); }
  else if (winner === 'B') { p.fill(COLOR_B); p.text('플레이어 B 승리! 🏆', cx, cy - 75); }
  else if (winner === 'draw') { p.fill('#FFD600'); p.text('무승부!', cx, cy - 75); }
  else { p.fill('#AB47BC'); p.text('좀비의 승리... 😱', cx, cy - 75); }

  p.textSize(14);
  if (!betrayalTriggered && winner === 'zombie') {
    p.fill(COLOR_TEAM); p.text(`TEAM 영역: ${counts.team} 타일`, cx, cy - 22);
  } else {
    p.fill(COLOR_A); p.text(`A 영역: ${counts.A} 타일`, cx, cy - 35);
    p.fill(COLOR_B); p.text(`B 영역: ${counts.B} 타일`, cx, cy - 10);
  }

  p.textSize(13);
  if (isNewHighScore) {
    let blink = Math.floor(p.frameCount / 10) % 2 === 0;
    p.fill(blink ? '#FFD600' : '#FF8A00');
    p.text('🔥 최고 기록 경신! 🔥', cx, cy + 20);
    p.fill(255);
    p.text(`현재 최고 기록: ${highScore} 타일`, cx, cy + 40);
  } else {
    p.fill(180);
    p.text(`최고 기록: ${highScore} 타일`, cx, cy + 30);
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

// 픽셀 캐릭터 드로잉 헬퍼
// col: 색상, facing: 'right'(오른쪽 바라봄) or 'left'(왼쪽 바라봄)
// ox, oy: 좌상단 기준 오프셋, ps: 픽셀 한 칸 크기
function _drawPixelChar(p, ox, oy, ps, col, facing) {
  // 픽셀 맵: 0=투명, 1=몸색, 2=밝은색(눈흰자), 3=어두운색(눈동자/디테일)
  // 7열 x 8행 캐릭터
  const map = [
    [0,0,1,1,1,0,0],  // 머리 상단
    [0,1,1,1,1,1,0],
    [0,1,2,1,2,1,0],  // 눈
    [0,1,3,1,3,1,0],  // 눈동자
    [0,1,1,1,1,1,0],  // 입
    [0,1,1,1,1,1,0],  // 몸
    [1,1,0,1,0,1,1],  // 팔+몸통
    [0,1,1,0,1,1,0],  // 다리
  ];

  for (let row = 0; row < map.length; row++) {
    for (let col = 0; col < map[row].length; col++) {
      const cell = map[row][facing === 'left' ? (map[row].length - 1 - col) : col];
      if (cell === 0) continue;
      if (cell === 1) p.fill(col);
      else if (cell === 2) p.fill(240, 240, 240);
      else if (cell === 3) p.fill(20, 20, 20);
      p.noStroke();
      p.rect(ox + col * ps, oy + row * ps, ps, ps);
    }
  }
}

function drawLobby(p) {
  p.background(10, 10, 15);
  const cx = CANVAS_W / 2;
  const cy = CANVAS_H / 2;
  p.textAlign(p.CENTER, p.CENTER);

  // ── 제목 ──
  p.textSize(54);
  p.fill('#4CAF50');
  p.text('좀비 영역 전쟁', cx, cy - 185);

  p.textSize(13);
  p.fill(160);
  p.text('2인 협력 → 배신 영역 점령 게임', cx, cy - 143);

  p.textSize(11);
  p.fill(100);
  p.text('제작자 : 이현서  이유진  전재민', cx, cy - 122);

  // ── 픽셀 캐릭터 + VS 레이아웃 ──
  const ps = 10; // 픽셀 한 칸 크기
  const charW = 7 * ps;
  const charH = 8 * ps;
  const charY = cy - 100;

  // 플레이어 A (빨강, 오른쪽 바라봄) - 왼쪽
  const axLeft = cx - 210;
  _drawPixelChar(p, axLeft, charY, ps, p.color('#E53935'), 'right');

  // 플레이어 B (파랑, 왼쪽 바라봄) - 오른쪽
  const bxLeft = cx + 210 - charW;
  _drawPixelChar(p, bxLeft, charY, ps, p.color('#1E88E5'), 'left');

  // VS 텍스트 (가운데)
  p.textSize(28);
  p.fill(60);
  p.text('VS', cx, charY + charH / 2);

  // ── 플레이어 라벨 + 키 정보 ──
  p.textSize(13);
  p.fill(COLOR_A);
  p.textAlign(p.CENTER, p.CENTER);
  p.text('PLAYER A', axLeft + charW / 2, charY - 18);

  p.textSize(11);
  p.fill(COLOR_A);
  p.text('W / A / S / D', axLeft + charW / 2, charY + charH + 14);

  p.textSize(13);
  p.fill(COLOR_B);
  p.text('PLAYER B', bxLeft + charW / 2, charY - 18);

  p.textSize(11);
  p.fill(COLOR_B);
  p.text('↑ / ↓ / ← / →', bxLeft + charW / 2, charY + charH + 14);

  // ── 시작하기 버튼 (크게) ──
  const blink = Math.floor(p.frameCount / 20) % 2 === 0;
  const btnY = cy + 90;
  const btnH = 50;
  p.fill(blink ? '#4CAF50' : '#388E3C');
  p.noStroke();
  p.rect(cx - 130, btnY, 260, btnH, 12);
  p.fill(255);
  p.textSize(18);
  p.textAlign(p.CENTER, p.CENTER);
  p.text('▶  시작하기  (SPACE)', cx, btnY + btnH / 2);

  // ── 게임 방법 버튼 ──
  p.fill(30, 30, 35);
  p.stroke(70);
  p.strokeWeight(1);
  p.rect(cx - 70, cy + 152, 140, 30, 8);
  p.noStroke();
  p.fill(140);
  p.textSize(12);
  p.text('게임 방법', cx, cy + 167);

  // ── 게임 방법 팝업 ──
  if (showHowto) {
    const popW = 340;
    const popH = 240;
    const popX = cx - popW / 2;
    const popY = cy - 120;

    // 배경 어둡게
    p.fill(0, 0, 0, 190);
    p.noStroke();
    p.rect(0, 0, CANVAS_W, CANVAS_H);

    // 팝업 박스
    p.fill(18, 18, 26);
    p.stroke(80);
    p.strokeWeight(1);
    p.rect(popX, popY, popW, popH, 12);
    p.noStroke();

    // 팝업 제목
    p.fill('#4CAF50');
    p.textSize(15);
    p.textAlign(p.LEFT, p.TOP);
    p.text('[ 게임 방법 ]', popX + 18, popY + 16);

    // 닫기 버튼
    p.fill(100);
    p.textSize(14);
    p.textAlign(p.RIGHT, p.TOP);
    p.text('✕', popX + popW - 14, popY + 14);

    // 내용
    p.fill(160);
    p.textSize(11);
    p.textAlign(p.LEFT, p.TOP);
    const lines = [
      '⏱  협력 30초 → 배신 30초',
      '🐾  꼬리를 뻗다 자기 땅으로 돌아오면 영역 확보',
      '💀  상대 꼬리를 끊으면 사망',
      '     머리끼리 부딪히면 밀려남',
      '🧟  좀비 꼬리를 밟으면 좀비 사망',
      '',
      '💊 약: 보너스 땅 획득',
      '🩸 피: 좀비 가속',
      '⚡ 에너지드링크: 속도2배 + 강철꼬리',
    ];
    for (let i = 0; i < lines.length; i++) {
      p.text(lines[i], popX + 18, popY + 46 + i * 19);
    }
  }
}
