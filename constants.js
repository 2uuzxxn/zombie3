const TILE_SIZE = 18;
const COLS = 50;
const ROWS = 50;
const CANVAS_W = COLS * TILE_SIZE;
const CANVAS_H = ROWS * TILE_SIZE;

const GAME_TOTAL_TIME = 60;        // 전체 게임 시간 1분
const BETRAYAL_TRIGGER_TIME = 30;  // 게임 시작 30초 후(남은 시간 30초) 배신 페이즈 시작

const SOLO_TIME_LIMIT = 30;         // 한 명 사망 후 제한 시간 30초
const EMERGENCY_BETRAYAL_TIME = 30; // 부활 후 배신 타이머 30초

const PLAYER_SPEED = 8;
const BOOST_MULTIPLIER = 2.0;
const BOOST_DURATION = 150;
const STEEL_TAIL_DURATION = 150;

const ZOMBIE_COUNT = 6;
const ZOMBIE_SPEED_NORMAL = 4.2;    
const ZOMBIE_SPEED_BOOSTED = 8.5;   
const ZOMBIE_BLOOD_DURATION = 150;
const ZOMBIE_RANDOM_CHANCE = 0.03;

const BOX_COUNT_EACH = 3;
const BOMB_RADIUS = 3;

const OWNER_NONE = null;
const OWNER_TEAM = 'team';
const OWNER_A = 'A';
const OWNER_B = 'B';
const OWNER_ZOMBIE = 'Z';

const TILE_TYPE_NORMAL = 'normal';

const BOX_TYPE_MEDICINE = 'medicine';
const BOX_TYPE_BLOOD    = 'blood';
const BOX_TYPE_ENERGY   = 'energy';

const PHASE_LOBBY    = 'lobby';
const PHASE_COOP     = 'coop';
const PHASE_SOLO     = 'solo';
const PHASE_BETRAYAL = 'betrayal';
const PHASE_END      = 'end';

const COLOR_TEAM   = '#4CAF50';
const COLOR_A      = '#E53935';
const COLOR_B      = '#1E88E5';
const COLOR_ZOMBIE = '#7B1FA2';
const COLOR_EMPTY  = '#1a1a1a';
const COLOR_GRID   = '#222222';

const FRAME_RATE = 30;
