// The simulation: one lantern-keeper, waves of shadow wisps, embers, pickups and
// particles. It knows nothing about the screen or the keyboard: each step takes a
// control object {move, aim, firing, dash} and returns an event bitmask, and any
// sound it wants is queued for the caller to play.

import {
  BOLT, COMBO_MAX, COMBO_STEP, COMBO_WINDOW, DROPS, ENEMIES, FIELD, PLAYER,
  POOL, POWERUP_TIME, SPAWN, STEP, WAVES, WEAPONS, waveComposition,
} from './config.js';
import { pick, range } from './random.js';

export const EVENT_HIT = 1;
export const EVENT_OVER = 2;
export const EVENT_WIN = 4;
export const EVENT_WAVE = 8;

const KIND_WISP = 'wisp';
const KIND_SKITTER = 'skitter';
const KIND_SPITTER = 'spitter';
const KIND_BRUTE = 'brute';
const KIND_HERALD = 'herald';

function dist2(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

export function createWorld(random) {
  const state = {
    time: 0,
    wave: 1,
    phase: 'title',
    score: 0,
    combo: 0,
    comboTimer: 0,
    kills: 0,
    shotsFired: 0,
    shotsHit: 0,
    shake: 0,
    flash: 0,
    banner: null,
    enemiesLeft: 0,
    player: null,
    enemies: [],
    bullets: [],
    bolts: [],
    pickups: [],
    particles: [],
    texts: [],
  };
  let spawnQueue = [];
  let spawnTimer = 0;
  let spawnInterval = SPAWN.first;
  let breatherTimer = 0;
  let demoTimer = 0;
  let sounds = [];

  function burst(x, y, count, color, speed, size, life) {
    for (let i = 0; i < count && state.particles.length < POOL.particles; i += 1) {
      const angle = random() * Math.PI * 2;
      const v = range(random, speed * 0.3, speed);
      state.particles.push({
        x, y,
        vx: Math.cos(angle) * v,
        vy: Math.sin(angle) * v,
        life: range(random, life * 0.5, life),
        maxLife: life,
        size: range(random, size * 0.5, size * 1.4),
        color,
      });
    }
  }

  function floatText(x, y, text, color) {
    if (state.texts.length >= POOL.texts) state.texts.shift();
    state.texts.push({ x, y, text, color, life: 1.1, maxLife: 1.1 });
  }

  function queueWave(wave) {
    const comp = waveComposition(wave);
    spawnQueue = [];
    for (const [kind, count] of Object.entries(comp)) {
      for (let i = 0; i < count; i += 1) spawnQueue.push(kind);
    }
    // Shuffle the queue so the wave never arrives in one kind's block.
    for (let i = spawnQueue.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [spawnQueue[i], spawnQueue[j]] = [spawnQueue[j], spawnQueue[i]];
    }
    spawnInterval = SPAWN.first;
    spawnTimer = 0.6;
    state.enemiesLeft = spawnQueue.length;
  }

  function spawnPoint() {
    const side = Math.floor(random() * 4);
    const m = 30;
    if (side === 0) return { x: range(random, m, FIELD.width - m), y: -20 };
    if (side === 1) return { x: range(random, m, FIELD.width - m), y: FIELD.height + 20 };
    if (side === 2) return { x: -20, y: range(random, m, FIELD.height - m) };
    return { x: FIELD.width + 20, y: range(random, m, FIELD.height - m) };
  }

  function spawnEnemy(kind) {
    if (state.enemies.length >= POOL.enemies) return;
    const spec = ENEMIES[kind];
    const point = spawnPoint();
    const hp = kind === KIND_BRUTE
      ? spec.hp + Math.floor(state.wave / 2)
      : spec.hp;
    state.enemies.push({
      kind,
      x: point.x, y: point.y,
      vx: 0, vy: 0,
      hp, maxHp: hp,
      radius: spec.radius,
      speed: spec.speed + spec.speedPerWave * (state.wave - 1),
      t: range(random, 0, Math.PI * 2),
      shootTimer: range(random, 1.2, 2.4),
      burstTimer: 2.5,
    });
  }

  function dropPickup(x, y) {
    if (state.pickups.length >= POOL.pickups) return;
    const roll = random();
    let kind = null;
    if (roll < DROPS.heart) kind = 'heart';
    else if (roll < DROPS.heart + DROPS.spread) kind = 'spread';
    else if (roll < DROPS.heart + DROPS.spread + DROPS.rapid) kind = 'rapid';
    else if (roll < DROPS.heart + DROPS.spread + DROPS.rapid + DROPS.shield) kind = 'shield';
    if (!kind) return;
    state.pickups.push({ kind, x, y, t: 0, life: 14 });
  }

  function killEnemy(index) {
    const enemy = state.enemies[index];
    const spec = ENEMIES[enemy.kind];
    state.enemies.splice(index, 1);
    state.kills += 1;
    state.combo = state.comboTimer > 0 ? state.combo + 1 : 1;
    state.comboTimer = COMBO_WINDOW;
    const mult = 1 + Math.min(state.combo - 1, COMBO_MAX) * COMBO_STEP;
    const gained = Math.round(spec.score * mult);
    state.score += gained;
    floatText(enemy.x, enemy.y, `+${gained}`, '#ffe9a8');
    burst(enemy.x, enemy.y, enemy.kind === KIND_BRUTE || enemy.kind === KIND_HERALD ? 26 : 12,
      spec === ENEMIES.wisp ? '#8f7bff' : spec === ENEMIES.skitter ? '#4fe3c1' : spec === ENEMIES.spitter ? '#ff6b9d' : '#ff4d6d',
      260, 4, 0.6);
    sounds.push('kill');
    dropPickup(enemy.x, enemy.y);
    state.enemiesLeft = spawnQueue.length + state.enemies.length;
  }

  function hurtPlayer(fromX, fromY) {
    const player = state.player;
    if (player.mercy > 0 || player.dashTimer > 0) return false;
    if (player.shield) {
      player.shield = false;
      player.mercy = 0.8;
      burst(player.x, player.y, 14, '#8dff9e', 220, 4, 0.5);
      floatText(player.x, player.y - 26, 'SHIELD!', '#8dff9e');
      sounds.push('shield');
      return false;
    }
    player.hp -= 1;
    player.mercy = PLAYER.mercy;
    state.shake = 10;
    state.flash = 0.35;
    state.combo = 0;
    state.comboTimer = 0;
    const dx = player.x - fromX;
    const dy = player.y - fromY;
    const d = Math.hypot(dx, dy) || 1;
    player.vx = (dx / d) * 320;
    player.vy = (dy / d) * 320;
    burst(player.x, player.y, 16, '#ff5d5d', 240, 4, 0.5);
    sounds.push('hurt');
    return player.hp <= 0;
  }

  function fireBullet(angle) {
    const weapon = WEAPONS[state.player.weapon];
    const speed = weapon.speed;
    state.bullets.push({
      x: state.player.x + Math.cos(angle) * (PLAYER.radius + 6),
      y: state.player.y + Math.sin(angle) * (PLAYER.radius + 6),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: PLAYER.bulletLife,
      radius: PLAYER.bulletRadius,
    });
  }

  function updatePlayer(dt, control) {
    const player = state.player;
    if (player.mercy > 0) player.mercy -= dt;
    if (player.dashCooldown > 0) player.dashCooldown -= dt;
    if (player.weaponTimer > 0) {
      player.weaponTimer -= dt;
      if (player.weaponTimer <= 0) player.weapon = 'ember';
    }
    player.aimX = control.aim.x;
    player.aimY = control.aim.y;

    if (control.dash && player.dashCooldown <= 0 && player.dashTimer <= 0) {
      const dx = control.move.x;
      const dy = control.move.y;
      const len = Math.hypot(dx, dy);
      const ax = len > 0 ? dx / len : Math.cos(Math.atan2(player.aimY - player.y, player.aimX - player.x));
      const ay = len > 0 ? dy / len : Math.sin(Math.atan2(player.aimY - player.y, player.aimX - player.x));
      player.dashTimer = PLAYER.dashTime;
      player.dashCooldown = PLAYER.dashCooldown;
      player.vx = ax * PLAYER.dashSpeed;
      player.vy = ay * PLAYER.dashSpeed;
      burst(player.x, player.y, 8, '#ffb347', 160, 3, 0.35);
      sounds.push('dash');
    }
    if (player.dashTimer > 0) {
      player.dashTimer -= dt;
    } else {
      const targetVx = control.move.x * PLAYER.speed;
      const targetVy = control.move.y * PLAYER.speed;
      const k = Math.min(1, dt * 14);
      player.vx += (targetVx - player.vx) * k;
      player.vy += (targetVy - player.vy) * k;
    }
    player.x = Math.max(PLAYER.radius, Math.min(FIELD.width - PLAYER.radius, player.x + player.vx * dt));
    player.y = Math.max(PLAYER.radius, Math.min(FIELD.height - PLAYER.radius, player.y + player.vy * dt));

    player.fireTimer -= dt;
    if (control.firing && player.fireTimer <= 0 && state.bullets.length < POOL.bullets) {
      const weapon = WEAPONS[player.weapon];
      const base = Math.atan2(player.aimY - player.y, player.aimX - player.x);
      const n = weapon.bullets;
      for (let i = 0; i < n; i += 1) {
        const offset = (i - (n - 1) / 2) * weapon.spread;
        fireBullet(base + offset);
      }
      player.fireTimer = 1 / weapon.rate;
      state.shotsFired += n;
      sounds.push('shoot');
    }
  }

  function updateEnemies(dt) {
    const player = state.player;
    for (let i = state.enemies.length - 1; i >= 0; i -= 1) {
      const enemy = state.enemies[i];
      enemy.t += dt;
      const dx = player.x - enemy.x;
      const dy = player.y - enemy.y;
      const d = Math.hypot(dx, dy) || 1;
      const ux = dx / d;
      const uy = dy / d;
      if (enemy.kind === KIND_WISP) {
        enemy.vx = ux * enemy.speed;
        enemy.vy = uy * enemy.speed;
      } else if (enemy.kind === KIND_SKITTER) {
        const wobble = Math.sin(enemy.t * 5) * 0.7;
        enemy.vx = (ux - uy * wobble) * enemy.speed;
        enemy.vy = (uy + ux * wobble) * enemy.speed;
      } else if (enemy.kind === KIND_SPITTER) {
        const want = d > 300 ? 1 : d < 200 ? -1 : 0;
        enemy.vx = ux * enemy.speed * want + -uy * 30;
        enemy.vy = uy * enemy.speed * want + ux * 30;
        enemy.shootTimer -= dt;
        if (enemy.shootTimer <= 0 && state.bolts.length < POOL.bolts) {
          enemy.shootTimer = range(random, 2.0, 2.6);
          state.bolts.push({
            x: enemy.x, y: enemy.y,
            vx: ux * BOLT.speed, vy: uy * BOLT.speed,
            life: BOLT.life, radius: BOLT.radius,
          });
          sounds.push('spit');
        }
      } else if (enemy.kind === KIND_BRUTE) {
        enemy.vx = ux * enemy.speed;
        enemy.vy = uy * enemy.speed;
      } else if (enemy.kind === KIND_HERALD) {
        enemy.vx = ux * enemy.speed;
        enemy.vy = uy * enemy.speed;
        enemy.burstTimer -= dt;
        if (enemy.burstTimer <= 0 && state.bolts.length + 8 < POOL.bolts) {
          enemy.burstTimer = 3;
          for (let k = 0; k < 8; k += 1) {
            const a = (k / 8) * Math.PI * 2 + enemy.t;
            state.bolts.push({
              x: enemy.x, y: enemy.y,
              vx: Math.cos(a) * BOLT.speed * 0.8,
              vy: Math.sin(a) * BOLT.speed * 0.8,
              life: BOLT.life, radius: BOLT.radius,
            });
          }
          sounds.push('burst');
        }
      }
      enemy.x += enemy.vx * dt;
      enemy.y += enemy.vy * dt;
      // Touching the lantern hurts, then the wisp is spent.
      if (dist2(enemy.x, enemy.y, player.x, player.y) < (enemy.radius + PLAYER.radius) ** 2) {
        const dead = hurtPlayer(enemy.x, enemy.y);
        state.enemies.splice(i, 1);
        burst(enemy.x, enemy.y, 8, '#8f7bff', 200, 3, 0.4);
        state.enemiesLeft = spawnQueue.length + state.enemies.length;
        if (dead) return EVENT_OVER;
      }
    }
    return 0;
  }

  function updateBullets(dt) {
    for (let i = state.bullets.length - 1; i >= 0; i -= 1) {
      const bullet = state.bullets[i];
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      bullet.life -= dt;
      let spent = bullet.life <= 0
        || bullet.x < -20 || bullet.x > FIELD.width + 20
        || bullet.y < -20 || bullet.y > FIELD.height + 20;
      if (!spent) {
        for (let j = state.enemies.length - 1; j >= 0; j -= 1) {
          const enemy = state.enemies[j];
          const rr = enemy.radius + bullet.radius;
          if (dist2(bullet.x, bullet.y, enemy.x, enemy.y) < rr * rr) {
            enemy.hp -= 1;
            state.shotsHit += 1;
            burst(bullet.x, bullet.y, 4, '#ffe9a8', 140, 3, 0.25);
            if (enemy.hp <= 0) killEnemy(j);
            spent = true;
            break;
          }
        }
      }
      if (spent) state.bullets.splice(i, 1);
    }
  }

  function updateBolts(dt) {
    const player = state.player;
    for (let i = state.bolts.length - 1; i >= 0; i -= 1) {
      const bolt = state.bolts[i];
      bolt.x += bolt.vx * dt;
      bolt.y += bolt.vy * dt;
      bolt.life -= dt;
      let spent = bolt.life <= 0
        || bolt.x < -20 || bolt.x > FIELD.width + 20
        || bolt.y < -20 || bolt.y > FIELD.height + 20;
      if (!spent && dist2(bolt.x, bolt.y, player.x, player.y) < (bolt.radius + PLAYER.radius) ** 2) {
        const dead = hurtPlayer(bolt.x, bolt.y);
        spent = true;
        if (dead) return EVENT_OVER;
      }
      if (spent) state.bolts.splice(i, 1);
    }
    return 0;
  }

  function updatePickups(dt) {
    const player = state.player;
    for (let i = state.pickups.length - 1; i >= 0; i -= 1) {
      const pickup = state.pickups[i];
      pickup.t += dt;
      pickup.life -= dt;
      const d2 = dist2(pickup.x, pickup.y, player.x, player.y);
      if (d2 < 110 * 110) {
        const d = Math.sqrt(d2) || 1;
        pickup.x += ((player.x - pickup.x) / d) * 190 * dt;
        pickup.y += ((player.y - pickup.y) / d) * 190 * dt;
      }
      if (d2 < 30 * 30) {
        if (pickup.kind === 'heart') {
          if (player.hp < PLAYER.maxHp) {
            player.hp += 1;
            floatText(player.x, player.y - 26, '+1 LIGHT', '#ff5d73');
          } else {
            state.score += 100;
            floatText(player.x, player.y - 26, '+100', '#ff5d73');
          }
        } else if (pickup.kind === 'shield') {
          player.shield = true;
          floatText(player.x, player.y - 26, 'WARD!', '#8dff9e');
        } else {
          player.weapon = pickup.kind;
          player.weaponTimer = POWERUP_TIME;
          floatText(player.x, player.y - 26, pickup.kind === 'spread' ? 'EMBER FAN!' : 'SWIFT EMBERS!', '#ffd23f');
        }
        burst(pickup.x, pickup.y, 10, '#ffe9a8', 160, 3, 0.4);
        sounds.push('pickup');
        state.pickups.splice(i, 1);
        continue;
      }
      if (pickup.life <= 0) state.pickups.splice(i, 1);
    }
  }

  function updateParticles(dt) {
    for (let i = state.particles.length - 1; i >= 0; i -= 1) {
      const p = state.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - 2.4 * dt;
      p.vy *= 1 - 2.4 * dt;
      p.life -= dt;
      if (p.life <= 0) state.particles.splice(i, 1);
    }
    for (let i = state.texts.length - 1; i >= 0; i -= 1) {
      const t = state.texts[i];
      t.y -= 34 * dt;
      t.life -= dt;
      if (t.life <= 0) state.texts.splice(i, 1);
    }
  }

  function startWave(wave) {
    state.wave = wave;
    state.phase = 'fighting';
    queueWave(wave);
    state.banner = { text: `WAVE ${wave}`, sub: wave === WAVES ? 'The Gloom Herald comes' : pick(random, ['They come for the light', 'Hold the lantern', 'Shadows gather', 'Stay in the glow']), timer: 2.2 };
    sounds.push('wave');
  }

  /** The title screen's state: the lantern burns at the centre of an empty field. */
  function title() {
    state.time = 0;
    state.wave = 1;
    state.phase = 'title';
    state.score = 0;
    state.combo = 0;
    state.comboTimer = 0;
    state.kills = 0;
    state.shotsFired = 0;
    state.shotsHit = 0;
    state.shake = 0;
    state.flash = 0;
    state.banner = null;
    state.enemies = [];
    state.bullets = [];
    state.bolts = [];
    state.pickups = [];
    state.particles = [];
    state.texts = [];
    state.player = {
      x: FIELD.width / 2, y: FIELD.height / 2,
      vx: 0, vy: 0,
      hp: PLAYER.maxHp,
      aimX: FIELD.width / 2, aimY: 0,
      fireTimer: 0, dashTimer: 0, dashCooldown: 0,
      mercy: 0, weapon: 'ember', weaponTimer: 0, shield: false,
    };
    spawnQueue = [];
    breatherTimer = 0;
    demoTimer = 0;
    sounds = [];
  }

  function reset() {
    state.time = 0;
    state.wave = 1;
    state.phase = 'fighting';
    state.score = 0;
    state.combo = 0;
    state.comboTimer = 0;
    state.kills = 0;
    state.shotsFired = 0;
    state.shotsHit = 0;
    state.shake = 0;
    state.flash = 0;
    state.banner = null;
    state.enemies = [];
    state.bullets = [];
    state.bolts = [];
    state.pickups = [];
    state.particles = [];
    state.texts = [];
    state.player = {
      x: FIELD.width / 2, y: FIELD.height / 2,
      vx: 0, vy: 0,
      hp: PLAYER.maxHp,
      aimX: FIELD.width / 2, aimY: 0,
      fireTimer: 0, dashTimer: 0, dashCooldown: 0,
      mercy: 0, weapon: 'ember', weaponTimer: 0, shield: false,
    };
    spawnQueue = [];
    breatherTimer = 0;
    sounds = [];
    startWave(1);
  }

  /** The title screen's living backdrop: wisps drift across an empty field. */
  function stepDemo(dt) {
    state.time += dt;
    demoTimer -= dt;
    if (demoTimer <= 0 && state.enemies.length < 8) {
      demoTimer = 1.1;
      const kinds = [KIND_WISP, KIND_WISP, KIND_SKITTER, KIND_SPITTER];
      const kind = kinds[Math.floor(random() * kinds.length)];
      const point = spawnPoint();
      state.enemies.push({
        kind,
        x: point.x, y: point.y,
        vx: range(random, -30, 30), vy: range(random, 20, 60),
        hp: 1, maxHp: 1,
        radius: ENEMIES[kind].radius,
        speed: 40,
        t: range(random, 0, Math.PI * 2),
        shootTimer: 99, burstTimer: 99,
      });
    }
    for (let i = state.enemies.length - 1; i >= 0; i -= 1) {
      const enemy = state.enemies[i];
      enemy.t += dt;
      enemy.x += enemy.vx * dt + Math.sin(enemy.t * 2) * 12 * dt;
      enemy.y += enemy.vy * dt;
      if (enemy.y > FIELD.height + 40 || enemy.x < -40 || enemy.x > FIELD.width + 40) {
        state.enemies.splice(i, 1);
      }
    }
    updateParticles(dt);
    return 0;
  }

  function step(dt, control, demo) {
    if (demo) return stepDemo(dt);
    state.time += dt;
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 26);
    if (state.flash > 0) state.flash = Math.max(0, state.flash - dt * 1.6);
    if (state.comboTimer > 0) {
      state.comboTimer -= dt;
      if (state.comboTimer <= 0) state.combo = 0;
    }
    if (state.banner) {
      state.banner.timer -= dt;
      if (state.banner.timer <= 0) state.banner = null;
    }
    if (state.phase === 'breather') {
      breatherTimer -= dt;
      updateParticles(dt);
      if (breatherTimer <= 0) startWave(state.wave + 1);
      return 0;
    }

    if (spawnQueue.length > 0) {
      spawnTimer -= dt;
      if (spawnTimer <= 0) {
        spawnEnemy(spawnQueue.shift());
        state.enemiesLeft = spawnQueue.length + state.enemies.length;
        const total = state.enemiesLeft + state.kills;
        spawnInterval = SPAWN.first + (SPAWN.last - SPAWN.first) * (1 - spawnQueue.length / Math.max(1, total));
        spawnTimer = spawnInterval;
      }
    }

    updatePlayer(dt, control);
    let events = updateEnemies(dt);
    if (events & EVENT_OVER) return events;
    updateBullets(dt);
    events |= updateBolts(dt);
    if (events & EVENT_OVER) return events;
    updatePickups(dt);
    updateParticles(dt);

    if (spawnQueue.length === 0 && state.enemies.length === 0) {
      if (state.wave >= WAVES) {
        state.phase = 'won';
        const bonus = 500 + state.player.hp * 250;
        state.score += bonus;
        floatText(state.player.x, state.player.y - 30, `DAWN BONUS +${bonus}`, '#ffd9a0');
        sounds.push('win');
        return EVENT_WIN;
      }
      state.phase = 'breather';
      breatherTimer = 3;
      const bonus = 100 * state.wave;
      state.score += bonus;
      state.banner = { text: `WAVE ${state.wave} CLEARED`, sub: `+${bonus} bonus`, timer: 2.6 };
      sounds.push('wave');
      return EVENT_WAVE;
    }
    return events;
  }

  return {
    state,
    title,
    reset,
    step,
    takeSounds() {
      const out = sounds;
      sounds = [];
      return out;
    },
  };
}
