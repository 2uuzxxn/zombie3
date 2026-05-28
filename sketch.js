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
    else if (playerB.alive) { winner = 'B'; }
    else { winner = 'zombie'; }
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
  const cy = CANVAS_H / 2; // 450

  if (phase === PHASE_LOBBY && showHowto) {
    // 팝업 영역: cx-170 ~ cx+170, cy-125 ~ cy+125
    const px = cx - 170, py = cy - 125, pw = 340, ph = 250;
    // X버튼: 우상단
    if (mouseX > px + pw - 34 && mouseX < px + pw - 4 && mouseY > py + 6 && mouseY < py + 34) {
      showHowto = false; return;
    }
    // 팝업 바깥 클릭
    if (mouseX < px || mouseX > px + pw || mouseY < py || mouseY > py + ph) {
      showHowto = false; return;
    }
    return;
  }

  if (phase === PHASE_LOBBY) {
    // 시작하기 버튼: cx-140~cx+140, cy+95~cy+150
    if (mouseX > cx-140 && mouseX < cx+140 && mouseY > cy+95 && mouseY < cy+150) {
      phase = PHASE_COOP; return;
    }
    // 게임 방법 버튼: cx-65~cx+65, cy+160~cy+185
    if (mouseX > cx-65 && mouseX < cx+65 && mouseY > cy+160 && mouseY < cy+185) {
      showHowto = true; return;
    }
  }

  if (phase === PHASE_END && mouseX > cx-80 && mouseX < cx+80 && mouseY > cy+58 && mouseY < cy+96) {
    resetGame(); return;
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

// ── 픽셀 드로잉 ────────────────────────────────────────────
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
// 0=투명, 1=몸통색(초록), 2=눈흰자, 3=눈동자(어두운초록), 4=이빨(흰색)
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

// map을 ox,oy 기준으로 그리기. ps=픽셀한칸크기, flipH=좌우반전
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

function drawLobby(p) {
  p.background(10, 10, 15);
  p.noStroke();
  p.textAlign(p.CENTER, p.CENTER);

  const cx = CANVAS_W / 2; // 450
  const cy = CANVAS_H / 2; // 450

  // ── 제목 ──────────────────────────────────
  p.textSize(58);
  p.fill('#4CAF50');
  p.text('좀비 영역 전쟁', cx, cy - 210);

  p.textSize(13);
  p.fill(120);
  p.text('2인 협력  →  배신 영역 점령 게임', cx, cy - 162);

  p.textSize(11);
  p.fill(75);
  p.text('제작자 : 이현서  이유진  전재민', cx, cy - 142);

  // ── 픽셀 캐릭터 레이아웃 ─────────────────
  // 픽셀 한 칸: 10px, 캐릭터 = 8×10=80px wide, 9×10=90px tall
  const ps = 10;
  const charW = 8 * ps; // 80
  const charH = 9 * ps; // 90

  // 각 캐릭터 상단 y
  const charTopY = cy - 118;

  // A (왼쪽, 오른쪽 바라봄): x 중앙 = cx-200
  const axMid = cx - 200;
  const axLeft = axMid - charW / 2; // 410-40=370... 450-200=250, 250-40=210
  _drawPMap(p, _PMAP, axLeft, charTopY, ps,
    '#C62828', '#eeeeee', '#111111', '#ffffff', false);

  // B (오른쪽, 왼쪽 바라봄): x 중앙 = cx+200
  const bxMid = cx + 200;
  const bxLeft = bxMid - charW / 2;
  _drawPMap(p, _PMAP, bxLeft, charTopY, ps,
    '#1565C0', '#eeeeee', '#111111', '#ffffff', true);

  // Z 좀비 (가운데): x 중앙 = cx
  const zps = 9; // 좀비는 약간 작게
  const zW = 8 * zps;
  const zH = 9 * zps;
  const zLeft = cx - zW / 2;
  const zTopY = cy - 108;
  _drawPMap(p, _ZMAP, zLeft, zTopY, zps,
    '#2E7D32', '#ccffcc', '#1B5E20', '#e8ffe8', false);

  // ── 라벨 + 키 정보 ──────────────────────
  const labelY = charTopY - 18;
  const keyY   = charTopY + charH + 16;

  // PLAYER A 라벨
  p.textSize(12);
  p.fill(COLOR_A);
  p.text('PLAYER  A', axMid, labelY);

  // PLAYER A 키
  p.textSize(11);
  p.fill(COLOR_A);
  p.text('W  /  A  /  S  /  D', axMid, keyY);

  // PLAYER B 라벨
  p.textSize(12);
  p.fill(COLOR_B);
  p.text('PLAYER  B', bxMid, labelY);

  // PLAYER B 키
  p.textSize(11);
  p.fill(COLOR_B);
  p.text('↑  /  ↓  /  ←  /  →', bxMid, keyY);

  // VS 텍스트 (좀비 위, 아래)
  p.textSize(13);
  p.fill(50);
  p.text('VS', cx - 130, cy - 75); // A와 Z 사이
  p.text('VS', cx + 130, cy - 75); // Z와 B 사이

  // ── 구분선 ──────────────────────────────
  p.stroke(28);
  p.strokeWeight(1);
  p.line(cx - 70, charTopY - 8, cx - 70, charTopY + charH + 8);
  p.line(cx + 70, charTopY - 8, cx + 70, charTopY + charH + 8);
  p.noStroke();

  // ── 시작하기 버튼 ────────────────────────
  // 위치: cy+95 ~ cy+150 (높이 55)
  const btnX = cx - 140;
  const btnY = cy + 95;
  const btnW = 280;
  const btnH = 55;
  const blink = Math.floor(p.frameCount / 18) % 2 === 0;
  p.fill(blink ? '#43A047' : '#2E7D32');
  p.rect(btnX, btnY, btnW, btnH, 12);
  p.fill(255);
  p.textSize(20);
  p.text('▶  시작하기  (SPACE)', cx, btnY + btnH / 2);

  // ── 게임 방법 버튼 ──────────────────────
  // 위치: cy+160 ~ cy+185
  const htX = cx - 65;
  const htY = cy + 160;
  const htW = 130;
  const htH = 28;
  p.fill(22, 22, 30);
  p.stroke(55);
  p.strokeWeight(1);
  p.rect(htX, htY, htW, htH, 7);
  p.noStroke();
  p.fill(130);
  p.textSize(12);
  p.text('게임  방법', cx, htY + htH / 2);

  // ── 게임 방법 팝업 ──────────────────────
  if (showHowto) {
    // 어두운 오버레이
    p.fill(0, 0, 0, 185);
    p.rect(0, 0, CANVAS_W, CANVAS_H);

    // 팝업 박스: cx-170~cx+170, cy-125~cy+125 (340×250)
    const pw = 340, ph = 250;
    const px = cx - pw / 2;
    const py = cy - 125;
    p.fill(16, 16, 24);
    p.stroke(70);
    p.strokeWeight(1);
    p.rect(px, py, pw, ph, 12);
    p.noStroke();

    // 팝업 제목
    p.fill('#4CAF50');
    p.textSize(14);
    p.textAlign(p.LEFT, p.TOP);
    p.text('[ 게임 방법 ]', px + 20, py + 18);

    // X 닫기
    p.fill(90);
    p.textSize(15);
    p.textAlign(p.RIGHT, p.TOP);
    p.text('✕', px + pw - 14, py + 14);

    // 내용
    p.fill(150);
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
      p.text(lines[i], px + 20, py + 50 + i * 19);
    }
  }
}
