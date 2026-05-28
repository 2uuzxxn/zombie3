// grid.js
let grid = [];

function initGrid() {
  grid = [];
  for (let r = 0; r < ROWS; r++) {
    grid[r] = [];
    for (let c = 0; c < COLS; c++) {
      grid[r][c] = { owner: OWNER_NONE, type: TILE_TYPE_NORMAL, dirty: true };
    }
  }
}

function setOwner(r, c, owner) {
  if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return;
  if (grid[r][c].owner !== owner) {
    grid[r][c].owner = owner;
    grid[r][c].dirty = true;
  }
}

function getOwner(r, c) {
  if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return null;
  return grid[r][c].owner;
}

function drawGrid(p) {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const tile = grid[r][c];
      const x = c * TILE_SIZE;
      const y = r * TILE_SIZE;
      p.fill(tileColor(tile.owner));
      p.noStroke();
      p.rect(x, y, TILE_SIZE, TILE_SIZE);
      p.stroke(COLOR_GRID);
      p.strokeWeight(0.3);
      p.noFill();
      p.rect(x, y, TILE_SIZE, TILE_SIZE);
      tile.dirty = false;
    }
  }
}

function tileColor(owner) {
  switch (owner) {
    case OWNER_TEAM:   return COLOR_TEAM;
    case OWNER_A:      return COLOR_A;
    case OWNER_B:      return COLOR_B;
    case OWNER_ZOMBIE: return COLOR_ZOMBIE;
    default:           return COLOR_EMPTY;
  }
}

// 꼬리로 둘러싸인 내부 영역을 내 땅으로 채우는 BFS 알고리즘
function floodFillEnclosed(tailSet, owner, p) {
  const visited = new Set();
  const queue = [];

  // 외곽(경계선)에서 시작하여 꼬리와 자신의 땅을 제외한 영역을 탐색
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (r === 0 || r === ROWS-1 || c === 0 || c === COLS-1) {
        const key = `${r},${c}`;
        if (!tailSet.has(key) && grid[r][c].owner !== owner && !visited.has(key)) {
          visited.add(key);
          queue.push([r, c]);
        }
      }
    }
  }

  const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
  while (queue.length > 0) {
    const [r, c] = queue.shift();
    for (const [dr, dc] of dirs) {
      const nr = r+dr, nc = c+dc;
      if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
      const key = `${nr},${nc}`;
      if (visited.has(key) || tailSet.has(key)) continue;
      if (grid[nr][nc].owner === owner) continue;
      visited.add(key);
      queue.push([nr, nc]);
    }
  }

  for (const key of tailSet) {
    const [r, c] = key.split(',').map(Number);
    setOwner(r, c, owner);
  }
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const key = `${r},${c}`;
      if (grid[r][c].owner !== owner && !visited.has(key) && !tailSet.has(key)) {
        setOwner(r, c, owner);
      }
    }
  }
}

// 배신 시 팀 영역 분할 알고리즘 (보로노이 다이어그램)
function voronoiSplit(posA, posB) {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (grid[r][c].owner === OWNER_TEAM) {
        const dA = Math.abs(r-posA.r) + Math.abs(c-posA.c);
        const dB = Math.abs(r-posB.r) + Math.abs(c-posB.c);
        grid[r][c].owner = dA <= dB ? OWNER_A : OWNER_B;
        grid[r][c].dirty = true;
      }
    }
  }
}

function countTiles() {
  let counts = { team: 0, A: 0, B: 0, Z: 0, none: 0 };
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const o = grid[r][c].owner;
      if (o === OWNER_TEAM) counts.team++;
      else if (o === OWNER_A) counts.A++;
      else if (o === OWNER_B) counts.B++;
      else if (o === OWNER_ZOMBIE) counts.Z++;
      else counts.none++;
    }
  }
  return counts;
}

function applyAreaBomb(centerR, centerC, owner) {
  for (let r = centerR-BOMB_RADIUS; r <= centerR+BOMB_RADIUS; r++) {
    for (let c = centerC-BOMB_RADIUS; c <= centerC+BOMB_RADIUS; c++) {
      if (r < 0 || r >= ROWS || c < 0 || c >= COLS) continue;
      if (Math.abs(r-centerR)+Math.abs(c-centerC) <= BOMB_RADIUS) {
        if (grid[r][c].owner === OWNER_NONE) setOwner(r, c, owner);
      }
    }
  }
}
