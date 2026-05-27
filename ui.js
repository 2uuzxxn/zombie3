function drawLobby(p) {
  p.background(10,10,15);
  const cx = CANVAS_W / 2;
  const cy = CANVAS_H / 2;
  p.textAlign(p.CENTER, p.CENTER);
  
  // 기존 36 -> 46으로 크기 확대
  p.textSize(46); 
  p.fill('#4CAF50'); 
  p.text('좀비 영역 전쟁', cx, cy - 160);
  
  p.textSize(14); 
  p.fill(180); 
  p.text('2인 협력 → 배신 영역 점령 게임', cx, cy - 110);
  
  // 기존 12 -> 16으로 크기 확대 및 위치 조정
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
