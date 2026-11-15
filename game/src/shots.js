// The screenshot scenes behind ?shot=start|play|win|end. Each one plays the real
// rules forward from a fresh world for a fixed number of steps, steered by a simple
// autopilot (kite away from the nearest shadow, shoot the nearest one, dash when
// crowded), so the frame is what a short game really looks like and the same seed
// always gives the same frame.
import { FIELD, STEP } from './config.js';
import { EVENT_OVER, EVENT_WIN } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';

const START_SECONDS = 6;
const END_LIMIT_SECONDS = 600;
const WIN_LIMIT_SECONDS = 900;
const SAMPLE = 1 / 30;

/** The autopilot's eyes: the nearest shadow, and how far away it is. */
function nearestEnemy(state) {
  const player = state.player;
  let best = null;
  let bestD = Infinity;
  for (const enemy of state.enemies) {
    const dx = enemy.x - player.x;
    const dy = enemy.y - player.y;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = enemy;
    }
  }
  return { enemy: best, dist: Math.sqrt(bestD) };
}

function countNear(state, radius) {
  const player = state.player;
  let count = 0;
  for (const enemy of state.enemies) {
    const dx = enemy.x - player.x;
    const dy = enemy.y - player.y;
    if (dx * dx + dy * dy < radius * radius) count += 1;
  }
  return count;
}

/**
 * Kite away from danger, chase pickups when it is safe, shoot the nearest shadow.
 * `bold` plays closer to the edge (the win scene's pilot); `bold` false keeps its
 * distance (the play scene's pilot).
 */
function autopilot(state, bold) {
  const player = state.player;
  const { enemy, dist } = nearestEnemy(state);
  const move = { x: 0, y: 0 };
  let aim = { x: player.x, y: player.y - 100 };
  let firing = false;
  if (enemy) {
    // Lead the shot a little along the shadow's path.
    aim = {
      x: enemy.x + enemy.vx * 0.25,
      y: enemy.y + enemy.vy * 0.25,
    };
    firing = true;
    const keepAway = bold ? 130 : 175;
    if (dist < keepAway) {
      const dx = player.x - enemy.x;
      const dy = player.y - enemy.y;
      const len = Math.hypot(dx, dy) || 1;
      move.x = dx / len;
      move.y = dy / len;
    } else {
      // Strafe around it so the embers keep landing while it closes in.
      const dx = enemy.x - player.x;
      const dy = enemy.y - player.y;
      const len = Math.hypot(dx, dy) || 1;
      move.x = -dy / len;
      move.y = dx / len;
    }
    // A pickup nearby and nothing too close: drift toward it.
    if (dist > 190) {
      let pickup = null;
      let pickupD = 220 * 220;
      for (const p of state.pickups) {
        const dx = p.x - player.x;
        const dy = p.y - player.y;
        const d = dx * dx + dy * dy;
        if (d < pickupD) {
          pickupD = d;
          pickup = p;
        }
      }
      if (pickup) {
        const dx = pickup.x - player.x;
        const dy = pickup.y - player.y;
        const len = Math.hypot(dx, dy) || 1;
        move.x = dx / len;
        move.y = dy / len;
      }
    }
  } else {
    // Nothing left: drift back to the middle and wait for the next wave.
    const dx = FIELD.width / 2 - player.x;
    const dy = FIELD.height / 2 - player.y;
    const len = Math.hypot(dx, dy) || 1;
    if (len > 60) {
      move.x = dx / len;
      move.y = dy / len;
    }
  }
  // Keep off the walls: the middle is safer than a corner.
  if (player.x < 90) move.x = Math.max(move.x, 0.7);
  if (player.x > FIELD.width - 90) move.x = Math.min(move.x, -0.7);
  if (player.y < 90) move.y = Math.max(move.y, 0.7);
  if (player.y > FIELD.height - 90) move.y = Math.min(move.y, -0.7);
  const dash = countNear(state, bold ? 200 : 150) >= 3 && player.dashCooldown <= 0;
  return { move, aim, firing, dash };
}

/**
 * Set `world` to the named scene (start, play, win or end; any other name is start)
 * and return the screen to draw over it and the best score to show.
 */
export function stageShot(name, world) {
  if (name === 'play') {
    world.reset();
    // Play until the arena is busy: at least 14 seconds in, five shadows on
    // screen, and one of them close enough to read at a glance.
    let seconds = 0;
    while (seconds < 45) {
      world.step(STEP, autopilot(world.state, false), false);
      seconds += STEP;
      const { dist } = nearestEnemy(world.state);
      if (seconds >= 14 && world.state.enemies.length >= 5 && dist < 380) break;
    }
    return { screen: SCREEN_PLAY, best: 0 };
  }
  if (name === 'win') {
    world.reset();
    let won = false;
    for (let index = 0; index < WIN_LIMIT_SECONDS / STEP; index += 1) {
      const events = world.step(STEP, autopilot(world.state, true), false);
      if (events & EVENT_WIN) {
        won = true;
        break;
      }
      if (events & EVENT_OVER) break;
    }
    // The bold pilot should win; if it somehow fell, the frame still shows play.
    return { screen: won ? SCREEN_WIN : SCREEN_PLAY, best: world.state.score, won };
  }
  if (name === 'end') {
    world.reset();
    // The doomed pilot: it stands its ground and shoots, but never moves or
    // dashes, so the shadows close in and the light goes out — with a few kills
    // and a score to show for it, not a blank zero.
    for (let index = 0; index < END_LIMIT_SECONDS / STEP; index += 1) {
      const { enemy } = nearestEnemy(world.state);
      const control = {
        move: { x: 0, y: 0 },
        aim: enemy ? { x: enemy.x, y: enemy.y } : { x: 640, y: 360 },
        firing: enemy !== null,
        dash: false,
      };
      const events = world.step(STEP, control, false);
      if (events & EVENT_OVER) break;
    }
    return { screen: SCREEN_OVER, best: world.state.score };
  }
  world.title();
  for (let index = 0; index < START_SECONDS / STEP; index += 1) {
    world.step(STEP, null, true);
  }
  return { screen: SCREEN_TITLE, best: 0 };
}
