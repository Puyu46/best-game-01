// Everything the player sees: the night arena, the lantern-keeper, the wisps, the
// HUD and the five screens (title, play, paused, game over, dawn). Drawing reads
// the world's state and never changes it.

import { FIELD, FONT, PALETTE, PLAYER, WAVES } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_WIN = 'win';

/** Star positions for the backdrop, fixed at boot so the night never reshuffles. */
function makeStars() {
  let a = 12345;
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const stars = [];
  for (let i = 0; i < 110; i += 1) {
    stars.push({ x: next() * FIELD.width, y: next() * FIELD.height, r: 0.6 + next() * 1.5, tw: next() * Math.PI * 2 });
  }
  return stars;
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const stars = makeStars();

  function fit() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    return dpr;
  }

  function glowCircle(x, y, radius, color, alpha) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = alpha;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function drawBackground(state) {
    const g = ctx.createLinearGradient(0, 0, 0, FIELD.height);
    g.addColorStop(0, PALETTE.night);
    g.addColorStop(1, PALETTE.nightEdge);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    for (const star of stars) {
      const a = 0.35 + 0.3 * Math.sin(state.time * 1.4 + star.tw);
      ctx.globalAlpha = Math.max(0.08, a);
      ctx.fillStyle = PALETTE.star;
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = PALETTE.floorLine;
    ctx.lineWidth = 1;
    for (let x = 160; x < FIELD.width; x += 160) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, FIELD.height);
      ctx.stroke();
    }
    for (let y = 120; y < FIELD.height; y += 120) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(FIELD.width, y);
      ctx.stroke();
    }
    // The arena's edge: a low stone wall the lantern cannot cross.
    ctx.strokeStyle = '#2c2652';
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, FIELD.width - 6, FIELD.height - 6);
  }

  function drawPickup(pickup, time) {
    const bob = Math.sin(time * 3 + pickup.x * 0.01) * 3;
    const x = pickup.x;
    const y = pickup.y + bob;
    const pulse = 0.75 + 0.25 * Math.sin(time * 5);
    glowCircle(x, y, 26 * pulse, pickup.kind === 'heart' ? '#ff5d73' : pickup.kind === 'spread' ? '#ffd23f' : pickup.kind === 'rapid' ? '#5ee6ff' : '#8dff9e', 0.5);
    ctx.fillStyle = '#10102a';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = pickup.kind === 'heart' ? PALETTE.heart : pickup.kind === 'spread' ? PALETTE.spread : pickup.kind === 'rapid' ? PALETTE.rapid : PALETTE.shield;
    ctx.font = 'bold 15px ' + FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const glyph = pickup.kind === 'heart' ? '♥' : pickup.kind === 'spread' ? '✦' : pickup.kind === 'rapid' ? '»' : '◈';
    ctx.fillText(glyph, x, y + 1);
  }

  function drawEnemy(enemy, time) {
    const wobble = Math.sin(time * 6 + enemy.t) * 2;
    const x = enemy.x;
    const y = enemy.y + wobble;
    const r = enemy.radius;
    const color = enemy.kind === 'wisp' ? PALETTE.wisp
      : enemy.kind === 'skitter' ? PALETTE.skitter
      : enemy.kind === 'spitter' ? PALETTE.spitter
      : enemy.kind === 'brute' ? PALETTE.brute : PALETTE.herald;
    const core = enemy.kind === 'wisp' ? PALETTE.wispCore : '#ffffff';
    glowCircle(x, y, r * 2.4, color, 0.45);
    // Body: a soft blob with a wavering tail.
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x - r * 0.7, y + r * 0.4);
    ctx.quadraticCurveTo(x - r * 0.2, y + r * 1.5 + wobble * 2, x + r * 0.3, y + r * 0.5);
    ctx.quadraticCurveTo(x + r * 0.7, y + r * 0.9, x + r * 0.75, y + r * 0.2);
    ctx.closePath();
    ctx.fill();
    // Eyes: two white dots with dark pupils, always watching the lantern.
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x - r * 0.36, y - r * 0.15, r * 0.2, 0, Math.PI * 2);
    ctx.arc(x + r * 0.36, y - r * 0.15, r * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#140f2e';
    ctx.beginPath();
    ctx.arc(x - r * 0.36, y - r * 0.15, r * 0.1, 0, Math.PI * 2);
    ctx.arc(x + r * 0.36, y - r * 0.15, r * 0.1, 0, Math.PI * 2);
    ctx.fill();
    if (enemy.kind === 'herald') {
      ctx.strokeStyle = '#ffd9a0';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, r + 9 + Math.sin(time * 3) * 2, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (enemy.maxHp > 2) {
      const w = r * 2;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(x - w / 2, y - r - 12, w, 5);
      ctx.fillStyle = color;
      ctx.fillRect(x - w / 2, y - r - 12, (w * enemy.hp) / enemy.maxHp, 5);
    }
  }

  function drawPlayer(player, time) {
    const flicker = 1 + 0.08 * Math.sin(time * 11) + 0.05 * Math.sin(time * 23);
    const dashing = player.dashTimer > 0;
    const blink = player.mercy > 0 && Math.floor(time * 14) % 2 === 0;
    glowCircle(player.x, player.y, 150 * flicker, '#ff9a2f', dashing ? 0.5 : 0.34);
    if (player.shield) {
      ctx.strokeStyle = 'rgba(141,255,158,0.85)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(player.x, player.y, PLAYER.radius + 10 + Math.sin(time * 4) * 2, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (blink) return;
    // Handle.
    ctx.strokeStyle = '#8a6b3d';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(player.x, player.y - 6, 12, Math.PI, 0);
    ctx.stroke();
    // Lantern body.
    const bodyGrad = ctx.createLinearGradient(player.x, player.y - 14, player.x, player.y + 16);
    bodyGrad.addColorStop(0, '#ffcf7d');
    bodyGrad.addColorStop(1, '#e07f2a');
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.moveTo(player.x - 12, player.y - 8);
    ctx.lineTo(player.x + 12, player.y - 8);
    ctx.lineTo(player.x + 9, player.y + 14);
    ctx.lineTo(player.x - 9, player.y + 14);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#7a4d16';
    ctx.lineWidth = 2;
    ctx.stroke();
    // Flame.
    ctx.fillStyle = PALETTE.playerCore;
    ctx.beginPath();
    ctx.moveTo(player.x, player.y - 9);
    ctx.quadraticCurveTo(player.x + 6 * flicker, player.y + 2, player.x, player.y + 9);
    ctx.quadraticCurveTo(player.x - 6 * flicker, player.y + 2, player.x, player.y - 9);
    ctx.fill();
    // Aim tick: a short line toward the mouse so the shot's direction is visible.
    const aim = Math.atan2(player.aimY - player.y, player.aimX - player.x);
    ctx.strokeStyle = 'rgba(255,233,168,0.8)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(player.x + Math.cos(aim) * 20, player.y + Math.sin(aim) * 20);
    ctx.lineTo(player.x + Math.cos(aim) * 30, player.y + Math.sin(aim) * 30);
    ctx.stroke();
  }

  function drawHeart(x, y, filled, size) {
    ctx.fillStyle = filled ? PALETTE.heart : 'rgba(255,93,115,0.25)';
    ctx.beginPath();
    ctx.moveTo(x, y + size * 0.55);
    ctx.bezierCurveTo(x - size, y - size * 0.1, x - size * 0.55, y - size, x, y - size * 0.35);
    ctx.bezierCurveTo(x + size * 0.55, y - size, x + size, y - size * 0.1, x, y + size * 0.55);
    ctx.fill();
  }

  function drawHud(state, best) {
    const player = state.player;
    ctx.textBaseline = 'alphabetic';
    // Top-left: light (hearts) and ward.
    for (let i = 0; i < PLAYER.maxHp; i += 1) {
      drawHeart(34 + i * 34, 34, i < player.hp, 13);
    }
    if (player.shield) {
      ctx.fillStyle = PALETTE.shield;
      ctx.font = 'bold 15px ' + FONT;
      ctx.textAlign = 'left';
      ctx.fillText('◈ WARD', 34, 68);
    }
    // Top-centre: wave and shadows left.
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.text;
    ctx.font = 'bold 22px ' + FONT;
    ctx.fillText(`WAVE ${state.wave} / ${WAVES}`, FIELD.width / 2, 36);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '15px ' + FONT;
    ctx.fillText(`${state.enemiesLeft} shadows remain`, FIELD.width / 2, 58);
    // Top-right: score, best, combo.
    ctx.textAlign = 'right';
    ctx.fillStyle = PALETTE.text;
    ctx.font = 'bold 26px ' + FONT;
    ctx.fillText(String(state.score).padStart(6, '0'), FIELD.width - 28, 38);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '14px ' + FONT;
    ctx.fillText(`BEST ${best}`, FIELD.width - 28, 60);
    if (state.combo > 1) {
      ctx.fillStyle = '#ffd23f';
      ctx.font = 'bold 18px ' + FONT;
      ctx.fillText(`COMBO ×${state.combo}`, FIELD.width - 28, 86);
      ctx.fillStyle = 'rgba(255,210,63,0.35)';
      ctx.fillRect(FIELD.width - 128, 92, 100 * Math.min(1, state.comboTimer / 2.5), 4);
    }
    // Bottom-left: dash readiness.
    const dashFrac = player.dashCooldown <= 0 ? 1 : 1 - player.dashCooldown / 1.6;
    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '13px ' + FONT;
    ctx.fillText('DASH [SPACE]', 28, FIELD.height - 46);
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fillRect(28, FIELD.height - 38, 110, 7);
    ctx.fillStyle = dashFrac >= 1 ? '#5ee6ff' : '#8a93b8';
    ctx.fillRect(28, FIELD.height - 38, 110 * dashFrac, 7);
    // Bottom-right: active weapon.
    if (player.weapon !== 'ember') {
      const name = player.weapon === 'spread' ? 'EMBER FAN' : 'SWIFT EMBERS';
      ctx.textAlign = 'right';
      ctx.fillStyle = '#ffd23f';
      ctx.font = 'bold 15px ' + FONT;
      ctx.fillText(name, FIELD.width - 28, FIELD.height - 46);
      ctx.fillStyle = 'rgba(255,210,63,0.35)';
      ctx.fillRect(FIELD.width - 128, FIELD.height - 38, 100 * (player.weaponTimer / 12), 7);
    }
    // Wave banner.
    if (state.banner) {
      const alpha = Math.min(1, state.banner.timer * 2);
      ctx.globalAlpha = alpha;
      ctx.textAlign = 'center';
      ctx.fillStyle = PALETTE.text;
      ctx.font = 'bold 52px ' + FONT;
      ctx.fillText(state.banner.text, FIELD.width / 2, 240);
      ctx.fillStyle = PALETTE.muted;
      ctx.font = '20px ' + FONT;
      ctx.fillText(state.banner.sub, FIELD.width / 2, 274);
      ctx.globalAlpha = 1;
    }
  }

  function panel(x, y, w, h) {
    ctx.fillStyle = PALETTE.panel;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 18);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,179,71,0.35)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  function drawTitle(state, best) {
    ctx.textAlign = 'center';
    panel(FIELD.width / 2 - 380, 130, 760, 430);
    glowCircle(FIELD.width / 2, 220, 130, '#ff9a2f', 0.5);
    ctx.fillStyle = PALETTE.player;
    ctx.font = 'bold 84px ' + FONT;
    ctx.fillText('EMBERFALL', FIELD.width / 2, 250);
    ctx.fillStyle = PALETTE.dawn;
    ctx.font = '26px ' + FONT;
    ctx.fillText('— The Last Lantern —', FIELD.width / 2, 292);
    ctx.fillStyle = PALETTE.text;
    ctx.font = '19px ' + FONT;
    ctx.fillText('Ten waves of shadow come for your light.', FIELD.width / 2, 340);
    ctx.fillText('Survive them all and bring the dawn.', FIELD.width / 2, 368);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '17px ' + FONT;
    ctx.fillText('WASD / arrows — move      Mouse — aim      Hold click — shoot', FIELD.width / 2, 420);
    ctx.fillText('SPACE — dash      P — pause      M — mute', FIELD.width / 2, 448);
    ctx.fillStyle = PALETTE.text;
    ctx.font = 'bold 20px ' + FONT;
    const pulse = 0.65 + 0.35 * Math.sin(state.time * 3);
    ctx.globalAlpha = pulse;
    ctx.fillText('PRESS ENTER OR CLICK TO BEGIN', FIELD.width / 2, 506);
    ctx.globalAlpha = 1;
    if (best > 0) {
      ctx.fillStyle = PALETTE.muted;
      ctx.font = '16px ' + FONT;
      ctx.fillText(`BEST SCORE ${best}`, FIELD.width / 2, 536);
    }
  }

  function drawPaused() {
    ctx.fillStyle = 'rgba(7,6,20,0.6)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.text;
    ctx.font = 'bold 56px ' + FONT;
    ctx.fillText('PAUSED', FIELD.width / 2, 330);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '20px ' + FONT;
    ctx.fillText('Press P or click to carry on', FIELD.width / 2, 372);
  }

  function drawOver(state, best, accuracy) {
    ctx.fillStyle = 'rgba(10,4,10,0.55)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    ctx.textAlign = 'center';
    panel(FIELD.width / 2 - 330, 150, 660, 400);
    ctx.fillStyle = PALETTE.danger;
    ctx.font = 'bold 52px ' + FONT;
    ctx.fillText('THE LIGHT GOES OUT', FIELD.width / 2, 240);
    ctx.fillStyle = PALETTE.text;
    ctx.font = '22px ' + FONT;
    ctx.fillText(`You held until wave ${state.wave} of ${WAVES}.`, FIELD.width / 2, 292);
    ctx.font = 'bold 34px ' + FONT;
    ctx.fillText(`SCORE ${state.score}`, FIELD.width / 2, 348);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '18px ' + FONT;
    ctx.fillText(`Best ${best}   •   ${state.kills} shadows banished   •   ${accuracy}% of embers hit`, FIELD.width / 2, 392);
    ctx.fillStyle = PALETTE.text;
    ctx.font = 'bold 20px ' + FONT;
    const pulse = 0.65 + 0.35 * Math.sin(state.time * 3);
    ctx.globalAlpha = pulse;
    ctx.fillText('PRESS ENTER OR CLICK TO TRY AGAIN', FIELD.width / 2, 470);
    ctx.globalAlpha = 1;
  }

  function drawWin(state, best, accuracy) {
    const g = ctx.createLinearGradient(0, 0, 0, FIELD.height);
    g.addColorStop(0, 'rgba(255,180,90,0.35)');
    g.addColorStop(0.6, 'rgba(255,140,80,0.12)');
    g.addColorStop(1, 'rgba(13,11,30,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    ctx.textAlign = 'center';
    panel(FIELD.width / 2 - 330, 140, 660, 410);
    glowCircle(FIELD.width / 2, 210, 120, '#ffd9a0', 0.6);
    ctx.fillStyle = PALETTE.dawn;
    ctx.font = 'bold 64px ' + FONT;
    ctx.fillText('DAWN BREAKS', FIELD.width / 2, 240);
    ctx.fillStyle = PALETTE.text;
    ctx.font = '22px ' + FONT;
    ctx.fillText('Ten waves, and the lantern still burns.', FIELD.width / 2, 292);
    ctx.font = 'bold 34px ' + FONT;
    ctx.fillText(`SCORE ${state.score}`, FIELD.width / 2, 348);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '18px ' + FONT;
    ctx.fillText(`Best ${best}   •   ${state.kills} shadows banished   •   ${accuracy}% of embers hit`, FIELD.width / 2, 392);
    ctx.fillStyle = PALETTE.text;
    ctx.font = 'bold 20px ' + FONT;
    const pulse = 0.65 + 0.35 * Math.sin(state.time * 3);
    ctx.globalAlpha = pulse;
    ctx.fillText('PRESS ENTER OR CLICK TO PLAY AGAIN', FIELD.width / 2, 470);
    ctx.globalAlpha = 1;
  }

  function draw(state, screen, best, accuracy) {
    const dpr = fit();
    const scale = Math.min(canvas.width / FIELD.width, canvas.height / FIELD.height);
    const offsetX = (canvas.width - FIELD.width * scale) / 2;
    const offsetY = (canvas.height - FIELD.height * scale) / 2;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#05040d';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(scale, 0, 0, scale, offsetX, offsetY);
    // Screen shake, driven by the clock so a frame paints the same way twice.
    if (state.shake > 0) {
      const s = state.shake;
      ctx.translate(Math.sin(state.time * 61) * s * 0.6, Math.cos(state.time * 53) * s * 0.6);
    }
    drawBackground(state);
    if (screen === SCREEN_TITLE) {
      for (const enemy of state.enemies) drawEnemy(enemy, state.time);
      if (state.player) drawPlayer(state.player, state.time);
      drawTitle(state, best);
      return;
    }
    for (const pickup of state.pickups) drawPickup(pickup, state.time);
    for (const enemy of state.enemies) drawEnemy(enemy, state.time);
    for (const bolt of state.bolts) {
      glowCircle(bolt.x, bolt.y, 18, PALETTE.bolt, 0.55);
      ctx.fillStyle = '#e9dcff';
      ctx.beginPath();
      ctx.arc(bolt.x, bolt.y, bolt.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'lighter';
    for (const bullet of state.bullets) {
      glowCircle(bullet.x, bullet.y, 16, PALETTE.ember, 0.8);
      ctx.fillStyle = PALETTE.emberCore;
      ctx.beginPath();
      ctx.arc(bullet.x, bullet.y, bullet.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const p of state.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    drawPlayer(state.player, state.time);
    for (const t of state.texts) {
      ctx.globalAlpha = Math.max(0, t.life / t.maxLife);
      ctx.fillStyle = t.color;
      ctx.font = 'bold 17px ' + FONT;
      ctx.textAlign = 'center';
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;
    drawHud(state, best);
    if (state.flash > 0) {
      ctx.fillStyle = `rgba(255,40,40,${state.flash * 0.35})`;
      ctx.fillRect(-20, -20, FIELD.width + 40, FIELD.height + 40);
    }
    if (screen === SCREEN_PAUSED) drawPaused();
    else if (screen === SCREEN_OVER) drawOver(state, best, accuracy);
    else if (screen === SCREEN_WIN) drawWin(state, best, accuracy);
  }

  return { draw };
}
