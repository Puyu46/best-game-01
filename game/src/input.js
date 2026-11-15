// Keyboard and mouse, read as one state each frame: a movement vector, the aim point
// in logical field coordinates, whether the trigger is held, and one-shot actions
// (confirm, pause, dash, mute) taken once per press.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_DASH = 4;
export const ACTION_MUTE = 8;

/** Map a client point on the canvas to the 1280x720 field, letterboxed inside it. */
export function toField(canvas, clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const scale = Math.min(rect.width / 1280, rect.height / 720);
  const offsetX = (rect.width - 1280 * scale) / 2;
  const offsetY = (rect.height - 720 * scale) / 2;
  return {
    x: (clientX - rect.left - offsetX) / scale,
    y: (clientY - rect.top - offsetY) / scale,
  };
}

export function createInput(canvas) {
  const keys = new Set();
  const pressed = new Set();
  let mouseX = 640;
  let mouseY = 360;
  let mouseDown = false;
  let mousePressed = false;

  function keyOf(event) {
    return event.key.length === 1 ? event.key.toLowerCase() : event.key;
  }

  window.addEventListener('keydown', (event) => {
    const key = keyOf(event);
    if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) event.preventDefault();
    if (!event.repeat) pressed.add(key);
    keys.add(key);
  });
  window.addEventListener('keyup', (event) => keys.delete(keyOf(event)));
  window.addEventListener('blur', () => {
    keys.clear();
    mouseDown = false;
  });
  canvas.addEventListener('mousemove', (event) => {
    const point = toField(canvas, event.clientX, event.clientY);
    mouseX = point.x;
    mouseY = point.y;
  });
  canvas.addEventListener('mousedown', (event) => {
    const point = toField(canvas, event.clientX, event.clientY);
    mouseX = point.x;
    mouseY = point.y;
    if (event.button === 0) {
      mouseDown = true;
      mousePressed = true;
    }
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) mouseDown = false;
  });
  // Losing the window clears held keys so the lantern never drifts on its own.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) keys.clear();
  });

  function take(key) {
    const had = pressed.has(key);
    if (had) pressed.delete(key);
    return had;
  }

  return {
    /** Normalised movement from WASD or the arrow keys. */
    direction() {
      let x = 0;
      let y = 0;
      if (keys.has('a') || keys.has('ArrowLeft')) x -= 1;
      if (keys.has('d') || keys.has('ArrowRight')) x += 1;
      if (keys.has('w') || keys.has('ArrowUp')) y -= 1;
      if (keys.has('s') || keys.has('ArrowDown')) y += 1;
      if (x !== 0 && y !== 0) {
        x *= Math.SQRT1_2;
        y *= Math.SQRT1_2;
      }
      return { x, y };
    },
    aim() {
      return { x: mouseX, y: mouseY };
    },
    firing() {
      return mouseDown;
    },
    /** One-shot actions since the last call; each press counts once. */
    takeActions() {
      let actions = 0;
      if (take('Enter') || take(' ') || mousePressed) actions |= ACTION_CONFIRM;
      if (take('p') || take('P') || take('Escape')) actions |= ACTION_PAUSE;
      if (take('Shift')) actions |= ACTION_DASH;
      if (take('m') || take('M')) actions |= ACTION_MUTE;
      mousePressed = false;
      return actions;
    },
  };
}
