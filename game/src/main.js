// Boot and the one loop: input is read every frame, the world advances in fixed
// 1/60 s steps (several in a slow frame, none in a fast one), and the renderer paints
// what is there. The game moves between five screens: title, play, paused, game
// over and dawn (the win).
//
// ?seed=N fixes the falling pattern. ?shot=start|play|win|end (with &seed=N) stages
// that scene instead of running the loop, paints it twice and sets window.__shotReady
// for a screenshot.
import { BEST_KEY, PLAYER, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_HIT, EVENT_OVER, EVENT_WIN } from './world.js';
import { ACTION_CONFIRM, ACTION_DASH, ACTION_MUTE, ACTION_PAUSE, createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const netcheck = document.getElementById('netcheck');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();

/** Runtime errors, kept for the page's own check (see below). */
window.__errors = [];
window.addEventListener('error', (event) => {
  window.__errors.push(String(event.message));
});

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function accuracy() {
  const fired = world.state.shotsFired;
  if (fired === 0) return 0;
  return Math.round((world.state.shotsHit / fired) * 100);
}

/**
 * After the page settles, count any resource the page fetched from outside this
 * machine and any runtime error, and write them into the hidden check line so a
 * headless run can read them back. The game itself must load nothing over the
 * network: every script, image, sound and font is a file under game/ or a data: URI.
 */
function runNetCheck() {
  const resources = performance.getEntriesByType('resource') || [];
  const outside = resources.filter((entry) => {
    try {
      const url = new URL(entry.name);
      return url.protocol !== 'data:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1';
    } catch {
      return false;
    }
  });
  netcheck.textContent = `errors:${window.__errors.length} external:${outside.length}`;
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best, accuracy());
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else {
      runNetCheck();
      window.__shotReady = true;
    }
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  world.title();

  // Screen readers (and anyone watching the page's text) hear the screen changes and each hit.
  function announce(message) {
    status.textContent = message;
  }

  function playSounds() {
    for (const sound of world.takeSounds()) {
      if (sound === 'shoot') audio.shoot();
      else if (sound === 'kill') audio.kill();
      else if (sound === 'hurt') audio.hurt();
      else if (sound === 'dash') audio.dash();
      else if (sound === 'pickup') audio.pickup();
      else if (sound === 'wave') audio.wave();
      else if (sound === 'win') audio.win();
      else if (sound === 'over') audio.over();
      else if (sound === 'shield') audio.pickup();
      else if (sound === 'spit' || sound === 'burst') audio.shoot();
    }
  }

  function startGame() {
    audio.unlock();
    world.reset();
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce(`Playing. Wave 1 of 10. ${PLAYER.maxHp} lights.`);
  }

  function endGame(won) {
    screen = won ? SCREEN_WIN : SCREEN_OVER;
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    announce(won
      ? `Dawn breaks. Score ${world.state.score}. Best ${best}.`
      : `Game over. Score ${world.state.score}. Best ${best}.`);
  }

  function handleActions(actions) {
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      announce(muted ? 'Muted.' : 'Sound on.');
    }
    if (actions & ACTION_CONFIRM && (screen === SCREEN_TITLE || screen === SCREEN_OVER || screen === SCREEN_WIN)) {
      startGame();
    } else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
  }

  function step(actions) {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, null, true);
      return 0;
    }
    const control = {
      move: input.direction(),
      aim: input.aim(),
      firing: input.firing(),
      // A dash press counts once, on the step that reads it.
      dash: Boolean(actions & ACTION_DASH),
    };
    const events = world.step(STEP, control, false);
    playSounds();
    if (events & EVENT_OVER) {
      audio.over();
      endGame(false);
    } else if (events & EVENT_WIN) {
      endGame(true);
    } else if (events & EVENT_HIT) {
      announce(world.state.player.hp === 1 ? 'Hit. 1 light left.' : `Hit. ${world.state.player.hp} lights left.`);
    }
    return events;
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    // Read the one-shot actions once per frame and share them with every step.
    const actions = input.takeActions();
    handleActions(actions);
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step(actions);
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, best, accuracy());
  }

  // Leaving the tab pauses a running game rather than letting shadows fall unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Emberfall. Press Enter or click to begin.');
  setTimeout(runNetCheck, 2000);
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
