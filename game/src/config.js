// EMBERFALL — The Last Lantern. Every tuning number and colour in one place.
// The arena is a fixed 1280x720 logical field; the renderer scales it to the window,
// so no rule below depends on the screen size.

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** Waves: clear wave 10 and dawn breaks — that is the win. */
export const WAVES = 10;

export const PLAYER = {
  radius: 14,
  speed: 265,
  maxHp: 3,
  /** Seconds of mercy after a hit. */
  mercy: 1.4,
  /** Dash: a short burst with its own brief mercy, then a cooldown. */
  dashSpeed: 640,
  dashTime: 0.16,
  dashCooldown: 1.6,
  /** Embers per second with the plain lantern. */
  fireRate: 5.2,
  bulletSpeed: 660,
  bulletRadius: 5,
  bulletLife: 0.85,
};

export const WEAPONS = {
  ember: { rate: 5.2, spread: 0, bullets: 1, speed: 660 },
  spread: { rate: 4.2, spread: 0.32, bullets: 3, speed: 620 },
  rapid: { rate: 10.5, spread: 0.05, bullets: 1, speed: 720 },
};

/** Seconds a picked-up weapon lasts. */
export const POWERUP_TIME = 12;

/** Enemy kinds. hp and speed grow a little with the wave; score is per kill. */
export const ENEMIES = {
  wisp: { radius: 13, hp: 1, speed: 72, speedPerWave: 4, score: 50, touch: 1 },
  skitter: { radius: 10, hp: 1, speed: 148, speedPerWave: 4, score: 75, touch: 1 },
  spitter: { radius: 14, hp: 2, speed: 56, speedPerWave: 2, score: 100, touch: 1 },
  brute: { radius: 26, hp: 6, speed: 44, speedPerWave: 1, score: 250, touch: 1 },
  herald: { radius: 34, hp: 42, speed: 50, speedPerWave: 0, score: 1000, touch: 1 },
};

/** Spitter shadow bolts. */
export const BOLT = { radius: 6, speed: 205, life: 5 };

/** What a wave is made of: counts per kind, in the order they are queued. */
export function waveComposition(wave) {
  const wisps = 5 + wave * 2;
  const skitters = wave >= 2 ? 1 + wave : 0;
  const spitters = wave >= 3 ? Math.floor(wave / 2) : 0;
  const brutes = wave >= 4 ? Math.floor((wave - 2) / 2) : 0;
  const heralds = wave === WAVES ? 1 : 0;
  return { wisp: wisps, skitter: skitters, spitter: spitters, brute: brutes, herald: heralds };
}

/** Seconds between spawns at the start of a wave, shrinking as the wave goes on. */
export const SPAWN = { first: 0.9, last: 0.28 };

/** Drop chances on a kill, per kind of pickup. */
export const DROPS = { heart: 0.05, spread: 0.09, rapid: 0.09, shield: 0.05 };

/** Combo: kills closer together than this chain; each link adds 10% to the kill score. */
export const COMBO_WINDOW = 2.5;
export const COMBO_STEP = 0.1;
export const COMBO_MAX = 20;

/** How many of each thing can exist at once; pools are allocated once, at boot. */
export const POOL = { enemies: 48, bullets: 96, bolts: 64, particles: 320, pickups: 24, texts: 32 };

export const PALETTE = {
  night: '#0d0b1e',
  nightEdge: '#070614',
  star: '#cfd6ff',
  floor: '#141129',
  floorLine: '#1e1a3d',
  player: '#ffb347',
  playerCore: '#fff3c4',
  ember: '#ff9a2f',
  emberCore: '#ffe9a8',
  wisp: '#8f7bff',
  wispCore: '#cfc4ff',
  skitter: '#4fe3c1',
  spitter: '#ff6b9d',
  brute: '#b06bff',
  herald: '#ff4d6d',
  bolt: '#c9a6ff',
  heart: '#ff5d73',
  spread: '#ffd23f',
  rapid: '#5ee6ff',
  shield: '#8dff9e',
  text: '#f5eedd',
  muted: '#9a93c2',
  danger: '#ff5d5d',
  panel: 'rgba(16, 13, 38, 0.82)',
  dawn: '#ffd9a0',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'emberfall.best';
