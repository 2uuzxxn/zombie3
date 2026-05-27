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
  // 엔드 화면에서 스페이스바를 누르면 재시작 (key === 'r' || key === 'R' 체크 조건 제거)
  if (phase === PHASE_END && keyCode === 32) { resetGame(); return; }
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

function drawResultScreen(p, counts, winner, highScore, isNewHighScore) {
  p.fill(0,0,0,200); p.noStroke(); p.rect(0,0,CANVAS_W,CANVAS_H);
  const cx=CANVAS_W/2, cy=CANVAS_H/2;
  p.fill(20,20,30,240); p.stroke(80); p.strokeWeight(1);
  p.rect(cx-200, cy-150, 400, 300, 12);
  p.noStroke(); p.textAlign(p.CENTER, p.CENTER);
  
  p.textSize(22); p.fill(255); p.text('게임 종료', cx, cy-115);
  p.textSize(26);
  if (winner==='A')      { p.fill(COLOR_A); p.text('플레이어 A 승리! 🏆', cx, cy-75); }
  else if (winner==='B') { p.fill(COLOR_B); p.text('플레이어 B 승리! 🏆', cx, cy-75); }
  else if (winner==='draw') { p.fill('#FFD600'); p.text('무승부!', cx, cy-75); }
  else { p.fill('#AB47BC'); p.text('좀비의 승리... 😱', cx, cy-75); }
  
  p.textSize(14);
  // 배신타임 이전에 모두 죽은 경우(즉, 점수가 team에만 기록되어 있는 경우) 예외 처리
  if (!betrayalTriggered && winner === 'zombie') {
    p.fill(COLOR_TEAM); p.text(`TEAM 영역: ${counts.team} 타일`, cx, cy-22);
  } else {
    // 배신타임이 이미 진행되었거나 진행 중 끝난 경우 기존 방식 유지
    p.fill(COLOR_A); p.text(`A 영역: ${counts.A} 타일`, cx, cy-35);
    p.fill(COLOR_B); p.text(`B 영역: ${counts.B} 타일`, cx, cy-10);
  }
  
  p.textSize(13);
  if (isNewHighScore) {
    let blink = Math.floor(p.frameCount / 10) % 2 === 0;
    p.fill(blink ? '#FFD600' : '#FF8A00');
    p.text(`🔥 최고 기록 경신! 🔥`, cx, cy + 20);
    p.fill(255);
    p.text(`현재 최고 기록: ${highScore} 타일`, cx, cy + 40);
  } else {
    p.fill(180);
    p.text(`최고 기록: ${highScore} 타일`, cx, cy + 30);
  }
  
  p.fill(50,50,70); p.stroke(120); p.strokeWeight(1);
  p.rect(cx-90, cy+75, 180, 38, 8);
  p.noStroke(); p.fill(200); p.textSize(13);
  p.text('다시 시작 (SPACE)', cx, cy+95); // UI 텍스트에서 'R /' 문구 삭제
}

let betrayalAnnounceFade = 0;
function showBetrayalAnnounce(p) { betrayalAnnounceFade = FRAME_RATE * 2; }
function drawBetrayalAnnounce(p) {
  if (betrayalAnnounceFade <= 0) return;
  betrayalAnnounceFade--;
  const alpha = Math.min(255, betrayalAnnounceFade * 5);
  p.fill(200,0,0,alpha); p.noStroke();
  p.rect(0, CANVAS_H/2-45, CANVAS_W, 90);
  p.fill(255,255,255,alpha); p.textAlign(p.CENTER, p.CENTER);
  p.textSize(26); p.text('⚠ 배신 타이머 발동! ⚠', CANVAS_W/2, CANVAS_H/2-12);
  p.textSize(13); p.text('이제 팀원도 적입니다', CANVAS_W/2, CANVAS_H/2+18);
}

function drawLobby(p) {
  p.background(10,10,15);
  const cx = CANVAS_W / 2;
  const cy = CANVAS_H / 2;
  p.textAlign(p.CENTER, p.CENTER);
  
  // 타이틀 글자 키움 (36 -> 46)
  p.textSize(46); 
  p.fill('#4CAF50'); 
  p.text('좀비 영역 전쟁', cx, cy - 160);
  
  p.textSize(14); 
  p.fill(180); 
  p.text('2인 협력 → 배신 영역 점령 게임', cx, cy - 110);
  
  // 플레이어 글씨 키움 (12 -> 16) 및 간격 조정
  p.textSize(16);
  p.fill(COLOR_A); 
  p.text('플레이어 A: W A S D', cx - 130, cy - 65);
  p.fill(COLOR_B); 
  p.text('플레이어 B: ↑ ↓ ← →', cx + 130, cy - 65);
  
  p.textSize(11); 
  p.fill(160);
  p.text('협력 페이즈 30초 → 배신 페이즈 30초', cx, cy - 25);
  p.text('상대 꼬리를 끊어야 죽음 / 머리끼리 부딪히면 밀려남', cx, cy - 5);
  p.text('맵 밖으로 나갈 수 없음', cx, cy + 15);
  
  p.fill(255, 165, 0);
  p.text('💊 약: 보너스 땅   🩸 피: 좀비 가속   ⚡ 에너지드링크: 속도2배+강철꼬리', cx, cy + 45);
  p.fill(180); 
  p.text('좀비 꼬리를 밟으면 좀비가 죽습니다!', cx, cy + 65);
  
  const blink = Math.floor(p.frameCount / 20) % 2 === 0;
  p.fill(blink ? '#4CAF50' : '#2E7D32'); 
  p.noStroke();
  p.rect(cx - 100, cy + 95, 200, 46, 10);
  p.fill(255); 
  p.textSize(15); 
  p.text('시작하기 (SPACE)', cx, cy + 119);
}
