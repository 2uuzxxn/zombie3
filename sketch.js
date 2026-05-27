let phase = PHASE_LOBBY;
let gameTimer = 0;
let betrayalTriggered = false;
let winner = null;
let soloTimer = 0;
let deadPlayerId = null;

// 최고 기록을 저장할 변수 (초기값 0)
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
  isNewHighScore = false; // 게임 시작 시 경신 플래그 초기화
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

  // 배신타임 알림창이 떠 있는 동안 시간정지 및 움직임 정지 처리
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
  
  // 배신 페이즈 시작 시점에 죽어있는 플레이어가 있다면 강제 부활 처리
  const midR = Math.floor(ROWS/2);
  const midC = Math.floor(COLS/2);
  
  if (!playerA.alive) {
    playerA.revive(midR - 3, midC, OWNER_A);
  }
  if (!playerB.alive) {
    playerB.revive(midR + 3, midC, OWNER_B);
  }

  const pA = {r:playerA.r, c:playerA.c};
  const pB = {r:playerB.r, c:playerB.c};
  
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
  const midR = Math.floor(ROWS/2);
  const midC = Math.floor(COLS/2);
  const survivor = deadPlayerId === 'A' ? playerB : playerA;
  const dead     = deadPlayerId === 'A' ? playerA : playerB;

  const deadSpawnR = midR + (deadPlayerId === 'A' ? -3 : 3);
  const deadSpawnC = midC;

  voronoiSplit({r:deadSpawnR, c:deadSpawnC}, {r:survivor.r, c:survivor.c});

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

  // 최고 기록 정산 (플레이어 점수 중 높은 점수 기준)
  const currentMaxScore = Math.max(counts.A, counts.B, counts.team);
  if (currentMaxScore > highScore) {
    highScore = currentMaxScore;
    isNewHighScore = true;
  }
}

function keyPressed() {
  // 로비에서 스페이스바를 누르면 시작
  if (phase === PHASE_LOBBY && keyCode === 32) { phase = PHASE_COOP; return; }
  // 엔드 화면에서 R 또는 스페이스바를 누르면 재시작
  if (phase === PHASE_END && (key === 'r' || key === 'R' || keyCode === 32)) { resetGame(); return; }
  if (betrayalAnnounceFade > 0) return; // 배신 알림 도중 키 입력 무시
  if (phase === PHASE_COOP || phase === PHASE_SOLO || phase === PHASE_BETRAYAL) {
    playerA.handleKeyPressed(keyCode);
    playerB.handleKeyPressed(keyCode);
  }
}

function mousePressed() {
  const cx = CANVAS_W / 2;
  const cy = CANVAS_H / 2;

  // 로비 화면에서 시작하기 버튼 클릭 처리
  if (phase === PHASE_LOBBY && mouseX > cx - 100 && mouseX < cx + 100 && mouseY > cy + 80 && mouseY < cy + 126) {
    phase = PHASE_COOP;
    return;
  }

  // 종료 화면에서 다시 시작 버튼 클릭 처리
  if (phase === PHASE_END && mouseX > cx - 80 && mouseX < cx + 80 && mouseY > cy + 58 && mouseY < cy + 96) {
    resetGame();
    return;
  }
}
