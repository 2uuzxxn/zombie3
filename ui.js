// ui.js
let notifications = [];

function showNotification(playerId, msg, color) {
  notifications.push({ playerId, msg, color, timer: 120 });
  if (notifications.length > 3) notifications.shift();
}

function drawUI(p, phase, timeLeft, counts) {
  p.push();
  p.textFont('Nunito');

  const hudH = 40;
  p.noStroke(); p.fill(0, 0, 0, 210);
  p.rect(0, 0, CANVAS_W, hudH);

  const totalTiles = ROWS * COLS;
  const barX = 10, barY = 26, barW = CANVAS_W-20, barH = 8;

  p.fill(40); p.rect(barX, barY, barW, barH, 5);
  
  if (phase === PHASE_COOP || phase === PHASE_SOLO) {
    const wZombie = Math.max(0, (counts.Z / totalTiles) * barW);
    const wTeam = Math.max(0, (counts.team / totalTiles) * barW);
    
    if (wZombie > 0) { p.fill(COLOR_ZOMBIE); p.rect(barX, barY, wZombie, barH, 5, 0, 0, 5); }
    if (wTeam > 0) { p.fill(COLOR_TEAM); p.rect(barX + barW - wTeam, barY, wTeam, barH, 0, 5, 5, 0); }
    
    p.textStyle(p.BOLD);
    p.fill(COLOR_ZOMBIE); p.textSize(10); p.textAlign(p.LEFT, p.CENTER);
    p.text(`Z: ${counts.Z}`, barX, 14);
    p.fill(COLOR_TEAM); p.textAlign(p.RIGHT, p.CENTER);
    p.text(`TEAM: ${counts.team}`, barX + barW, 14);
    p.textStyle(p.NORMAL);
  } else {
    const wA = Math.max(0, (counts.A / totalTiles) * barW);
    const wB = Math.max(0, (counts.B / totalTiles) * barW);
    
    if (wA > 0) { p.fill(COLOR_A); p.rect(barX, barY, wA, barH, 5, 0, 0, 5); }
    if (wB > 0) { p.fill(COLOR_B); p.rect(barX + barW - wB, barY, wB, barH, 0, 5, 5, 0); }
    
    p.textStyle(p.BOLD);
    p.fill(COLOR_A); p.textSize(10); p.textAlign(p.LEFT, p.CENTER);
    p.text(`A: ${counts.A}`, barX, 14);
    p.fill(COLOR_B); p.textAlign(p.RIGHT, p.CENTER);
    p.text(`B: ${counts.B}`, barX + barW, 14);
    p.textStyle(p.NORMAL);
  }

  const timeFraction = Math.max(0, Math.min(1, timeLeft / GAME_TOTAL_TIME));
  
  p.noStroke(); p.fill(50);
  p.rect(0, hudH, CANVAS_W, 5);
  
  const barColor = '#F44336';
  p.fill(barColor);
  p.rect(0, hudH, CANVAS_W * timeFraction, 5);

  const mins = Math.floor(timeLeft/60);
  const secs = Math.floor(timeLeft%60);
  const timeStr = `${mins}:${secs.toString().padStart(2,'0')}`;
  
  p.textStyle(p.BOLD);
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

  p.textStyle(p.NORMAL);
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
    p.textStyle(p.BOLD);
    p.fill('#E53935'); p.textSize(10); p.textAlign(p.CENTER, p.TOP);
    p.text(`🩸 좀비 가속 ${Math.ceil(zombieBloodTimer/FRAME_RATE)}초`, CANVAS_W/2, hudH+10);
    p.textStyle(p.NORMAL);
  }

  _drawNotifications(p);
  p.pop();
}

function _drawPlayerStatus(p, player, x, y, label) {
  if (!player) return;
  p.textStyle(p.BOLD);
  p.textSize(10); p.noStroke();
  const icons = [];
  if (player.boostTimer > 0) icons.push(`⚡${Math.ceil(player.boostTimer/FRAME_RATE)}s`);
  if (player.steelTailTimer > 0) icons.push(`🛡${Math.ceil(player.steelTailTimer/FRAME_RATE)}s`);
  p.fill(label==='A' ? COLOR_A : COLOR_B);
  p.textAlign(label==='A' ? p.LEFT : p.RIGHT, p.TOP);
  p.text(`P${label} ${!player.alive?'💀':'●'} ${icons.join(' ')}`, x, y);
  p.textStyle(p.NORMAL);
}

function _drawNotifications(p) {
  p.textFont('Nunito');
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
    p.textStyle(p.BOLD);
    p.textSize(11); p.textAlign(p.CENTER, p.CENTER);
    p.text(n.msg, CANVAS_W/2, yPos);
    p.textStyle(p.NORMAL);
  }
}
