// Synthesized sound, no audio files: every effect is an oscillator or a burst of
// filtered noise through the Web Audio API. Everything here is a no-op until the
// player has pressed a key or clicked (browsers keep the audio context suspended
// before the first gesture), and a muted mixer stays silent.

export function createAudio() {
  let context = null;
  let master = null;
  let muted = false;
  let padNodes = null;

  /** Build the context on the first gesture; returns false while it cannot start. */
  function ensure() {
    if (context) {
      if (context.state === 'suspended') context.resume().catch(() => {});
      return context.state === 'running';
    }
    try {
      const AudioContext = window.AudioContext ?? window.webkitAudioContext;
      if (!AudioContext) return false;
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = 0.5;
      master.connect(context.destination);
    } catch {
      return false;
    }
    return context.state === 'running';
  }

  function tone(freq, dur, type, volume, slideTo) {
    if (!ensure() || muted) return;
    const t0 = context.currentTime;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);
    gain.gain.setValueAtTime(volume, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function noise(dur, volume, filterFreq) {
    if (!ensure() || muted) return;
    const t0 = context.currentTime;
    const length = Math.max(1, Math.floor(context.sampleRate * dur));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = context.createBufferSource();
    source.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = context.createGain();
    gain.gain.setValueAtTime(volume, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(t0);
  }

  /** A low, warm drone under the night, started once and left running. */
  function startPad() {
    if (!ensure() || muted || padNodes) return;
    const gain = context.createGain();
    gain.gain.value = 0.045;
    gain.connect(master);
    const oscs = [55, 82.5, 110.3].map((freq, index) => {
      const osc = context.createOscillator();
      osc.type = index === 2 ? 'sine' : 'triangle';
      osc.frequency.value = freq;
      osc.detune.value = index * 4 - 4;
      osc.connect(gain);
      osc.start();
      return osc;
    });
    const lfo = context.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = context.createGain();
    lfoGain.gain.value = 0.02;
    lfo.connect(lfoGain);
    lfoGain.connect(gain.gain);
    lfo.start();
    padNodes = { oscs, lfo, gain };
  }

  return {
    unlock() {
      ensure();
      startPad();
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    shoot() {
      tone(720, 0.07, 'square', 0.10, 340);
    },
    kill() {
      noise(0.16, 0.22, 1800);
      tone(180, 0.14, 'sawtooth', 0.10, 60);
    },
    hurt() {
      tone(140, 0.28, 'sawtooth', 0.22, 55);
      noise(0.2, 0.18, 700);
    },
    dash() {
      noise(0.12, 0.12, 3200);
    },
    pickup() {
      tone(660, 0.09, 'sine', 0.14);
      setTimeout(() => tone(880, 0.1, 'sine', 0.14), 70);
      setTimeout(() => tone(1320, 0.14, 'sine', 0.12), 140);
    },
    wave() {
      tone(392, 0.16, 'triangle', 0.16);
      setTimeout(() => tone(523.25, 0.16, 'triangle', 0.16), 120);
      setTimeout(() => tone(659.25, 0.3, 'triangle', 0.16), 240);
    },
    win() {
      [523.25, 659.25, 783.99, 1046.5].forEach((freq, index) => {
        setTimeout(() => tone(freq, 0.4, 'triangle', 0.16), index * 150);
      });
    },
    over() {
      [392, 311, 233, 155].forEach((freq, index) => {
        setTimeout(() => tone(freq, 0.35, 'triangle', 0.15), index * 180);
      });
    },
  };
}
