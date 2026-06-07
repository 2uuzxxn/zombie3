// tile.js
let boxes = [];

function initTiles(p) {
  boxes = [];
  _placeBoxes(p);
}

function _placeBoxes(p) {
  const types = [BOX_TYPE_MEDICINE, BOX_TYPE_BLOOD, BOX_TYPE_ENERGY];
  const midR = Math.floor(ROWS/2);
  const midC = Math.floor(COLS/2);
  for (const type of types) {
    let placed = 0, attempts = 0;
    while (placed < BOX_COUNT_EACH && attempts < 300) {
      attempts++;
      const r = Math.floor(p.random(5, ROWS-5));
      const c = Math.floor(p.random(5, COLS-5));
      if (Math.abs(r-midR) < 7 && Math.abs(c-midC) < 9) continue;
      if (boxes.some(b => Math.abs(b.r-r) < 4 && Math.abs(b.c-c) < 4)) continue;
      boxes.push({ r, c, type });
      placed++;
    }
  }
}

function updateTiles(p) {}

function drawTiles(p) {
  for (const box of boxes) {
    const x = box.c * TILE_SIZE - TILE_SIZE/2;
    const y = box.r * TILE_SIZE - TILE_SIZE/2;
    const size = TILE_SIZE * 2; 
    const blink = Math.sin(p.frameCount * 0.12) > 0;

    p.noStroke();
    switch (box.type) {
      case BOX_TYPE_MEDICINE: p.fill(blink ? '#43A047' : '#2E7D32'); break;
      case BOX_TYPE_BLOOD:    p.fill(blink ? '#E53935' : '#B71C1C'); break;
      case BOX_TYPE_ENERGY:   p.fill(blink ? '#FFD600' : '#F9A825'); break;
    }
    p.rect(x+1, y+1, size-2, size-2, 6);

    p.textAlign(p.CENTER, p.CENTER);
    p.textSize(16);
    p.fill(255);
    let icon = '';
    switch (box.type) {
      case BOX_TYPE_MEDICINE: icon = '💊'; break;
      case BOX_TYPE_BLOOD:    icon = '🩸'; break;
      case BOX_TYPE_ENERGY:   icon = '⚡'; break;
    }
    p.text(icon, x + size/2, y + size/2);
  }
}

function checkTilePickup(player, zombiesArr, phase, p) {
  for (let i = boxes.length-1; i >= 0; i--) {
    const box = boxes[i];
    const dist = Math.abs(box.r - player.r) + Math.abs(box.c - player.c);
    if (dist <= 1) { 
      _applyBoxEffect(box, player, phase, p);
      boxes.splice(i, 1);
    }
  }
}

function _applyBoxEffect(box, player, phase, p) {
  switch (box.type) {
    case BOX_TYPE_MEDICINE: {
      const owner = (phase === PHASE_COOP || phase === PHASE_SOLO) 
                    ? OWNER_TEAM 
                    : (player.id === 'A' ? OWNER_A : OWNER_B);
      applyAreaBomb(player.r, player.c, owner);
      player.bombFlash = 20;
      _playSFX('item');
      showNotification(player.id, '💊 약을 먹었다! 보너스 땅이 주어졌다!!', '#43A047');
      break;
    }
    case BOX_TYPE_BLOOD: {
      zombieBloodTimer = ZOMBIE_BLOOD_DURATION;
      _playSFX('blood');
      showNotification(player.id, '🩸 피를 먹었다! 좀비가 빨라진다!!', '#E53935');
      break;
    }
    case BOX_TYPE_ENERGY: {
      player.boostTimer = BOOST_DURATION;
      player.steelTailTimer = STEEL_TAIL_DURATION;
      _playSFX('energy_drink');
      // 에너지드링크 효과음 끝난 후 속도업 BGM 재생
      const edAudio = _sfx['energy_drink'];
      if (edAudio) {
        const onEnd = () => { _playSFX('speedup'); edAudio.removeEventListener('ended', onEnd); };
        edAudio.addEventListener('ended', onEnd);
      }
      showNotification(player.id, '⚡ 에너지드링크를 마셨다! 강철꼬리가 생겼다!!', '#00E676');
      break;
    }
  }
}
