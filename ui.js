let notifications = [];

function showNotification(playerId, msg, color) {
  notifications.push({ playerId, msg, color, timer: 120 });
  if (notifications.length > 3) notifications.shift();
}

function drawUI(p, phase, timeLeft, counts) {
  p.push();
  p.textFont('monospace');

  const hudH = 40;
  p.noStroke(); p.fill(0, 0, 0, 210);
  p.rect(0, 0, CANVAS_W, hudH);

  const totalTiles = ROWS * COLS;
  const barX = 10, barY = 26, barW = CANVAS_W-20, barH = 8;

  p.fill(40); p.rect(barX, barY, barW, barH, 5);
  
  // 배신타임 전 (협력 PHASE_COOP 또는 솔로 PHASE_SOLO 페이즈)
  // 왼쪽: 좀비 영역(Z), 오른쪽: 플레이어 팀 영역(team)
  if (phase === PHASE_COOP || phase === PHASE_SOLO) {
    const wZombie = Math.max(0, (counts.Z / totalTiles) * barW);
    const wTeam = Math.max(0, (counts.team / totalTiles) * barW);
    
    if (wZombie > 0) { p.fill(COLOR_ZOMBIE); p.rect(barX, barY, wZombie, barH, 5, 0, 0, 5); }
    if (wTeam > 0) { p.fill(COLOR_TEAM); p.rect(barX + barW - wTeam, barY, wTeam, barH, 0, 5, 5, 0); }
    
    p.fill(COLOR_ZOMBIE); p.textSize(10); p.textAlign(p.LEFT, p.CENTER);
    p.text(`Z: ${counts.Z}`, barX, 14);
    p.fill(COLOR_TEAM); p.textAlign(p.RIGHT, p.CENTER);
    p.text(`TEAM: ${counts.team}`, barX + barW, 14);
  } 
  // 배신타임 시작 후 (PHASE_BETRAYAL)
  // 왼쪽: A 플레이어 영역, 오른쪽: B 플레이어 영역
  else {
    const wA = Math.max(0, (counts.A / totalTiles) * barW);
    const wB = Math.max(0, (counts.B / totalTiles) * barW);
    
    if (wA > 0) { p.fill(COLOR_A); p.rect(barX, barY, wA, barH, 5, 0, 0, 5); }
    if (wB > 0) { p.fill(COLOR_B); p.rect(barX + barW - wB, barY, wB, barH, 0, 5, 5, 0); }
    
    p.fill(COLOR_A); p.textSize(10); p.textAlign(p.LEFT, p.CENTER);
    p.text(`A: ${counts.A}`, barX, 14);
    p.fill(COLOR_B); p.textAlign(p.RIGHT, p.CENTER);
    p.text(`B: ${counts.B}`, barX + barW, 14);
  }

  const timeFraction = Math.max(0, Math.min(1, timeLeft / GAME_TOTAL_TIME));
  
  p.noStroke(); p.fill(50);
  p.rect(0, hudH, CANVAS_W, 5);
  
  const barColor = timeFraction > 0.4 ? '#4CAF50' : timeFraction > 0.15 ? '#FF9800' : '#F44336';
  p.fill(barColor);
  p.rect(0, hudH, CANVAS_W * timeFraction, 5);

  const mins = Math.floor(timeLeft/60);
  const secs = Math.floor(timeLeft%60);
  const timeStr = `${mins}:${secs.toString().padStart(2,'0')}`;
  
  // 모든 상단 중앙 제한시간 타이틀 글자색을 빨간색 계열(#FF5252 또는 #F44336)로 수정
  p.textAlign(p.CENTER, p.CENTER);
  if (phase === PHASE_BETRAYAL) {
    p.fill(timeLeft < 10 ? (p.frameCount%10<5?'#FF1744':'#FF8A80') : '#FF5252');
    p.textSize(15); p.text(`⚠ 배신 ${timeStr} ⚠`, CANVAS_W/2, 13);
  } else if (phase === PHASE_SOLO) {
    p.fill('#F44336'); p.textSize(14);
    p.text(`⏱ 제한 ${timeStr}`, CANVAS_W/2, 13);
  } else {
    p.fill('#F44336'); p.textSize(13);
    p.text(timeStr, CANVAS_W/2, 13);
  }

  p.textSize(9); p.textAlign(p.CENTER, p.BOTTOM);
  if (phase === PHASE_COOP)     { p.fill('#4CAF50'); p.text('[ 협력 페이즈 ]', CANVAS_W/2, 38); }
  else if (phase === PHASE_SOLO){ p.fill('#FF9800'); p.text('[ 한 명 사망 — 제한시간! ]', CANVAS_W/2, 38); }
  else if (phase === PHASE_BETRAYAL){ p.fill('#FF5252'); p.text('[ 배신 페이즈 — 팀원도 적! ]', CANVAS_W/2, 38); }

  if (phase === PHASE_BETRAYAL) {
    const alpha = 80 + Math.sin(p.frameCount*0.1)*40;
    p.noFill(); p.stroke(255,50,50,alpha); p.strokeWeight(6);
    p.rect(3,3,CANVAS_W-6,CANVAS_H-6,2); p.noStroke();
  }

  _drawPlayerStatus(p, playerA, 10, hudH+10, 'A');
  _drawPlayerStatus(p, playerB, CANVAS_W-10, hudH+10, 'B');

  if (zombieBloodTimer > 0) {
    p.fill('#E53935'); p.textSize(10); p.textAlign(p.CENTER, p.TOP);
    p.text(`🩸 좀비 가속 ${Math.ceil(zombieBloodTimer/FRAME_RATE)}초`, CANVAS_W/2, hudH+10);
  }

  _drawNotifications(p);
  p.pop();
}

function _drawPlayerStatus(p, player, x, y, label) {
  if (!player) return;
  p.textSize(10); p.noStroke();
  const icons = [];
  if (player.boostTimer > 0) icons.push(`⚡${Math.ceil(player.boostTimer/FRAME_RATE)}s`);
  if (player.steelTailTimer > 0) icons.push(`🛡${Math.ceil(player.steelTailTimer/FRAME_RATE)}s`);
  p.fill(label==='A' ? COLOR_A : COLOR_B);
  p.textAlign(label==='A' ? p.LEFT : p.RIGHT, p.TOP);
  p.text(`P${label} ${!player.alive?'💀':'●'} ${icons.join(' ')}`, x, y);
}

function _drawNotifications(p) {
  for (let i = notifications.length-1; i >= 0; i--) {
    const n = notifications[i];
    if (betrayalAnnounceFade <= 0) n.timer--;
    if (n.timer <= 0) { notifications.splice(i,1); continue; }
    const alpha = Math.min(255, n.timer*3);
    const yPos = CANVAS_H - 30 - (notifications.length-1-i)*24;
    p.noStroke(); p.fill(0,0,0,alpha*0.7);
    p.rect(10, yPos-10, CANVAS_W-20, 20, 4);
    const c = p.color(n.color);
    p.fill(p.red(c), p.green(c), p.blue(c), alpha);
    p.textSize(11); p.textAlign(p.CENTER, p.CENTER);
    p.text(n.msg, CANVAS_W/2, yPos);
  }
}

function drawResultScreen(p, counts, winner) {
  p.fill(0,0,0,200); p.noStroke(); p.rect(0,0,CANVAS_W,CANVAS_H);
  const cx=CANVAS_W/2, cy=CANVAS_H/2;
  p.fill(20,20,30,240); p.stroke(80); p.strokeWeight(1);
  p.rect(cx-200, cy-130, 400, 270, 12);
  p.noStroke(); p.textAlign(p.CENTER, p.CENTER);
  p.textSize(22); p.fill(255); p.text('게임 종료', cx, cy-100);
  p.textSize(26);
  if (winner==='A')      { p.fill(COLOR_A); p.text('플레이어 A 승리! 🏆', cx, cy-58); }
  else if (winner==='B') { p.fill(COLOR_B); p.text('플레이어 B 승리! 🏆', cx, cy-58); }
  else if (winner==='draw') { p.fill('#FFD600'); p.text('무승부!', cx, cy-58); }
  else { p.fill('#AB47BC'); p.text('좀비의 승리... 😱', cx, cy-58); }
  p.textSize(14);
  p.fill(COLOR_A); p.text(`A 영역: ${counts.A} 타일`, cx, cy-15);
  p.fill(COLOR_B); p.text(`B 영역: ${counts.B} 타일`, cx, cy+10);
  p.fill(50,50,70); p.stroke(120); p.strokeWeight(1);
  p.rect(cx-80, cy+58, 160, 38, 8);
  p.noStroke(); p.fill(200); p.textSize(14);
  p.text('다시 시작 (R)', cx, cy+78);
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
  const cx=CANVAS_W/2, cy=CANVAS_H/2;
  p.textAlign(p.CENTER, p.CENTER);
  p.textSize(36); p.fill('#4CAF50'); p.text('좀비 영역 전쟁', cx, cy-160);
  p.textSize(13); p.fill(180); p.text('2인 협력 → 배신 영역 점령 게임', cx, cy-118);
  p.textSize(12);
  p.fill(COLOR_A); p.text('플레이어 A: W A S D', cx-120, cy-72);
  p.fill(COLOR_B); p.text('플레이어 B: ↑ ↓ ← →', cx+120, cy-72);
  p.textSize(11); p.fill(160);
  p.text('협력 페이즈 30초 → 배신 페이즈 30초', cx, cy-38);
  p.text('상대 꼬리를 끊어야 죽음 / 머리끼리 부딪히면 밀려남', cx, cy-18);
  p.text('맵 밖으로 나갈 수 없음', cx, cy+2);
  p.fill(255,165,0);
  p.text('💊 약: 보너스 땅   🩸 피: 좀비 가속   ⚡ 에너지드링크: 속도2배+강철꼬리', cx, cy+32);
  p.fill(180); p.text('좀비 꼬리를 밟으면 좀비가 죽습니다!', cx, cy+52);
  const blink = Math.floor(p.frameCount/20)%2===0;
  p.fill(blink?'#4CAF50':'#2E7D32'); p.noStroke();
  p.rect(cx-100, cy+80, 200, 46, 10);
  p.fill(255); p.textSize(15); p.text('시작하기 (SPACE)', cx, cy+104);
}
