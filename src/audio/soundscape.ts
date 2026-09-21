/**
 * ZenPlant Procedural Soundscape Engine
 * Powered by Web Audio API for zero external media assets.
 */

let audioCtx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let windNode: { source: AudioBufferSourceNode; gain: GainNode; filter: BiquadFilterNode; lfo: OscillatorNode } | null = null;
let isMuted = false;
let volume = 0.7;

export function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioCtxClass) {
      audioCtx = new AudioCtxClass();
      masterGain = audioCtx.createGain();
      masterGain.gain.setValueAtTime(isMuted ? 0 : volume, audioCtx.currentTime);
      masterGain.connect(audioCtx.destination);
    }
  }
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

export function setMute(muted: boolean): void {
  isMuted = muted;
  if (masterGain && audioCtx) {
    masterGain.gain.setValueAtTime(isMuted ? 0 : volume, audioCtx.currentTime);
  }
}

export function getMute(): boolean {
  return isMuted;
}

export function setVolume(vol: number): void {
  volume = Math.max(0, Math.min(1, vol));
  if (masterGain && audioCtx && !isMuted) {
    masterGain.gain.setValueAtTime(volume, audioCtx.currentTime);
  }
}

export function getVolume(): number {
  return volume;
}

/**
 * Procedural pruning snip: crisp shear noise burst combined with a sharp woody/metallic click.
 * Frequency and timbre scale with stem thickness for deep woody snaps on thick branches vs light snips on twigs.
 */
export function playPruneSound(thickness = 4): void {
  const ctx = getAudioContext();
  if (!ctx || isMuted) return;

  const now = ctx.currentTime;
  const clampedThick = Math.max(1, Math.min(20, thickness));
  
  // Frequency scales inversely with thickness (thicker = lower bass thud)
  const baseFreq = Math.max(160, 950 - clampedThick * 45);
  const dropFreq = Math.max(80, baseFreq * 0.35);
  const duration = Math.min(0.12, 0.05 + clampedThick * 0.004);

  // 1. Noise burst (shear blade friction)
  const bufferSize = Math.floor(ctx.sampleRate * Math.min(0.1, 0.06 + clampedThick * 0.002));
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.02));
  }
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  // Filter frequency lower for thick cuts
  const filterFreq = Math.max(1800, 3600 - clampedThick * 120);
  filter.frequency.setValueAtTime(filterFreq, now);
  filter.Q.setValueAtTime(3.0, now);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.6 * volume, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  noise.connect(filter);
  filter.connect(gain);
  if (masterGain) gain.connect(masterGain);

  noise.start(now);
  noise.stop(now + duration);

  // 2. Woody stem crack ping
  const osc = ctx.createOscillator();
  osc.type = clampedThick > 6 ? "sawtooth" : "triangle";
  osc.frequency.setValueAtTime(baseFreq, now);
  osc.frequency.exponentialRampToValueAtTime(dropFreq, now + duration);

  const oscGain = ctx.createGain();
  oscGain.gain.setValueAtTime((0.35 + clampedThick * 0.02) * volume, now);
  oscGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  osc.connect(oscGain);
  if (masterGain) oscGain.connect(masterGain);

  osc.start(now);
  osc.stop(now + duration);

  // 3. For very thick branches (trunk / main limbs), add a subtle low resonant thud
  if (clampedThick > 5) {
    const subOsc = ctx.createOscillator();
    subOsc.type = "sine";
    subOsc.frequency.setValueAtTime(120, now);
    subOsc.frequency.exponentialRampToValueAtTime(50, now + duration * 1.2);

    const subGain = ctx.createGain();
    subGain.gain.setValueAtTime(0.3 * volume, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + duration * 1.2);

    subOsc.connect(subGain);
    if (masterGain) subGain.connect(masterGain);

    subOsc.start(now);
    subOsc.stop(now + duration * 1.2);
  }
}

/**
 * Procedural leaf pluck / defoliation: soft miniature snap and leaf rustle.
 */
export function playDefoliateSound(): void {
  const ctx = getAudioContext();
  if (!ctx || isMuted) return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(1400, now);
  osc.frequency.exponentialRampToValueAtTime(600, now + 0.04);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.2 * volume, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

  osc.connect(gain);
  if (masterGain) gain.connect(masterGain);

  osc.start(now);
  osc.stop(now + 0.04);
}

/**
 * Procedural growing chime: gentle ascending pentatonic harp/marimba tone.
 */
export function playGrowSound(noteIndex = 0): void {
  const ctx = getAudioContext();
  if (!ctx || isMuted) return;

  const now = ctx.currentTime;
  const pentatonic = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33];
  const freq = pentatonic[noteIndex % pentatonic.length];

  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(freq, now);

  const osc2 = ctx.createOscillator();
  osc2.type = "triangle";
  osc2.frequency.setValueAtTime(freq * 2, now);

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(1200, now);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0, now);
  gain.gain.linearRampToValueAtTime(0.25 * volume, now + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

  osc.connect(filter);
  osc2.connect(filter);
  filter.connect(gain);
  if (masterGain) gain.connect(masterGain);

  osc.start(now);
  osc2.start(now);
  osc.stop(now + 0.6);
  osc2.stop(now + 0.6);
}

/**
 * Procedural water tone / droplet plink with bubble pitch rise.
 */
export function playWaterSound(): void {
  const ctx = getAudioContext();
  if (!ctx || isMuted) return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = "sine";
  const startFreq = 400 + Math.random() * 200;
  // Acoustic droplet bubble frequency rises rapidly
  osc.frequency.setValueAtTime(startFreq, now);
  osc.frequency.exponentialRampToValueAtTime(startFreq * 2.2, now + 0.08);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.35 * volume, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

  osc.connect(gain);
  if (masterGain) gain.connect(masterGain);

  osc.start(now);
  osc.stop(now + 0.09);
}

/**
 * Procedural bonsai wire bending sound: metallic copper wire shimmer and chime.
 */
export function playWireSound(): void {
  const ctx = getAudioContext();
  if (!ctx || isMuted) return;

  const now = ctx.currentTime;
  const fundamental = 587.33; // D5

  // Primary tone
  const osc1 = ctx.createOscillator();
  osc1.type = "sine";
  osc1.frequency.setValueAtTime(fundamental, now);

  // Metallic inharmonic overtone (copper wire ring)
  const osc2 = ctx.createOscillator();
  osc2.type = "triangle";
  osc2.frequency.setValueAtTime(fundamental * 2.41, now);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0, now);
  gain.gain.linearRampToValueAtTime(0.28 * volume, now + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

  osc1.connect(gain);
  osc2.connect(gain);
  if (masterGain) gain.connect(masterGain);

  osc1.start(now);
  osc2.start(now);
  osc1.stop(now + 0.45);
  osc2.stop(now + 0.45);
}

/**
 * Procedural save sound: harmonious temple bell chord / resonant gong.
 */
export function playSaveSound(): void {
  const ctx = getAudioContext();
  if (!ctx || isMuted) return;

  const now = ctx.currentTime;
  const freqs = [261.63, 392.00, 659.25];

  freqs.forEach((freq, idx) => {
    const osc = ctx.createOscillator();
    osc.type = idx === 0 ? "triangle" : "sine";
    osc.frequency.setValueAtTime(freq, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0, now);
    gain.gain.linearRampToValueAtTime(0.2 * volume, now + 0.05 + idx * 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 1.8 + idx * 0.2);

    osc.connect(gain);
    if (masterGain) gain.connect(masterGain);

    osc.start(now);
    osc.stop(now + 2.0);
  });
}

/**
 * Toggle continuous binaural wind ambiance.
 */
export function toggleWindAmbiance(forceState?: boolean): boolean {
  const ctx = getAudioContext();
  if (!ctx) return false;

  const newState = forceState !== undefined ? forceState : !windNode;

  if (newState && !windNode) {
    const bufferSize = ctx.sampleRate * 3;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      data[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
      data[i] *= 0.11;
      b6 = white * 0.115926;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(350, ctx.currentTime);
    filter.Q.setValueAtTime(4.0, ctx.currentTime);

    const lfo = ctx.createOscillator();
    lfo.frequency.setValueAtTime(0.2, ctx.currentTime);
    const lfoGain = ctx.createGain();
    lfoGain.gain.setValueAtTime(250, ctx.currentTime);

    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.35 * volume, ctx.currentTime + 1.0);

    source.connect(filter);
    filter.connect(gain);
    if (masterGain) gain.connect(masterGain);

    source.start();
    lfo.start();

    windNode = { source, gain, filter, lfo };
  } else if (!newState && windNode) {
    try {
      const activeWind = windNode;
      activeWind.gain.gain.linearRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      setTimeout(() => {
        try {
          activeWind.source.stop();
          activeWind.lfo.stop();
        } catch {}
      }, 500);
      windNode = null;
    } catch {
      windNode = null;
    }
  }

  return windNode !== null;
}

/**
 * Procedural singing bowl / meditative chime tone for mindful breathing intervals.
 */
export function playSingingBowlSound(pitch = 216): void {
  const ctx = getAudioContext();
  if (!ctx || isMuted) return;

  const now = ctx.currentTime;
  const partials = [1, 2.76, 5.4, 8.1];
  const amplitudes = [0.4, 0.18, 0.08, 0.03];

  partials.forEach((mult, idx) => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(pitch * mult, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0, now);
    gain.gain.linearRampToValueAtTime(amplitudes[idx] * volume, now + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.0005, now + 3.0);

    osc.connect(gain);
    if (masterGain) gain.connect(masterGain);

    osc.start(now);
    osc.stop(now + 3.0);
  });
}

/**
 * Modulates the ambient soundscape according to breathing phase.
 * Inhale opens the air filter; exhale releases and warms the tone.
 */
export function setBreatheIntensity(phase: "inhale" | "hold" | "exhale"): void {
  const ctx = getAudioContext();
  if (!ctx || !windNode) return;

  const now = ctx.currentTime;
  if (phase === "inhale") {
    windNode.filter.frequency.cancelScheduledValues(now);
    windNode.filter.frequency.linearRampToValueAtTime(650, now + 3.8);
  } else if (phase === "hold") {
    windNode.filter.frequency.cancelScheduledValues(now);
    windNode.filter.frequency.setValueAtTime(650, now);
  } else if (phase === "exhale") {
    windNode.filter.frequency.cancelScheduledValues(now);
    windNode.filter.frequency.linearRampToValueAtTime(260, now + 3.8);
  }
}

/**
 * Procedural Zen sand rake: whispering granular friction of wood dragging across fine granite gravel.
 */
export function playRakeSound(): void {
  const ctx = getAudioContext();
  if (!ctx || isMuted) return;

  const now = ctx.currentTime;
  const duration = 0.14;

  // 1. Granular white/pink sand friction
  const bufferSize = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    // Grainy grit noise with exponential envelope
    data[i] = (Math.random() * 2 - 1) * Math.sin((i / bufferSize) * Math.PI);
  }

  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(1800 + Math.random() * 400, now);
  filter.Q.setValueAtTime(2.2, now);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.28 * volume, now);
  gain.gain.linearRampToValueAtTime(0.35 * volume, now + 0.04);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  noise.connect(filter);
  filter.connect(gain);

  // 2. Subtle wooden tine resonance (hollow wooden rake)
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(340 + Math.random() * 40, now);
  osc.frequency.exponentialRampToValueAtTime(280, now + duration);

  const oscGain = ctx.createGain();
  oscGain.gain.setValueAtTime(0.08 * volume, now);
  oscGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  osc.connect(oscGain);

  if (masterGain) {
    gain.connect(masterGain);
    oscGain.connect(masterGain);
  }

  noise.start(now);
  noise.stop(now + duration);
  osc.start(now);
  osc.stop(now + duration);
}

/**
 * Procedural Jin / deadwood carving: crisp sound of wood fibers peeling and being carved.
 */
export function playJinSound(): void {
  const ctx = getAudioContext();
  if (!ctx || isMuted) return;

  const now = ctx.currentTime;
  const duration = 0.16;

  // 1. Sharp wood fiber friction burst
  const bufferSize = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.04));
  }
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(1450, now);
  filter.Q.setValueAtTime(4.0, now);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.45 * volume, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  noise.connect(filter);
  filter.connect(gain);

  // 2. High-tension wood carving blade slice tone
  const osc = ctx.createOscillator();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(820, now);
  osc.frequency.exponentialRampToValueAtTime(460, now + duration);

  const oscGain = ctx.createGain();
  oscGain.gain.setValueAtTime(0.2 * volume, now);
  oscGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  osc.connect(oscGain);

  if (masterGain) {
    gain.connect(masterGain);
    oscGain.connect(masterGain);
  }

  noise.start(now);
  noise.stop(now + duration);
  osc.start(now);
  osc.stop(now + duration);
}

/**
 * Iconic Shishi-Odoshi (鹿威し) hollow bamboo clack:
 * Heavy bamboo tube emptying water and striking a wet river rock.
 */
export function playShishiOdoshiClack(): void {
  const ctx = getAudioContext();
  if (!ctx || isMuted) return;

  const now = ctx.currentTime;

  // 1. Deep hollow bamboo impact fundamental (88 Hz)
  const oscLow = ctx.createOscillator();
  oscLow.type = "sine";
  oscLow.frequency.setValueAtTime(88, now);
  oscLow.frequency.exponentialRampToValueAtTime(62, now + 0.12);

  const gainLow = ctx.createGain();
  gainLow.gain.setValueAtTime(0.7 * volume, now);
  gainLow.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

  oscLow.connect(gainLow);

  // 2. Hollow acoustic bamboo chamber resonances (350 Hz & 720 Hz)
  const oscMid = ctx.createOscillator();
  oscMid.type = "triangle";
  oscMid.frequency.setValueAtTime(350, now);
  oscMid.frequency.exponentialRampToValueAtTime(260, now + 0.09);

  const gainMid = ctx.createGain();
  gainMid.gain.setValueAtTime(0.45 * volume, now);
  gainMid.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

  oscMid.connect(gainMid);

  // 3. Sharp wooden impact click (stone strike)
  const clickOsc = ctx.createOscillator();
  clickOsc.type = "square";
  clickOsc.frequency.setValueAtTime(940, now);
  clickOsc.frequency.exponentialRampToValueAtTime(400, now + 0.03);

  const clickGain = ctx.createGain();
  clickGain.gain.setValueAtTime(0.35 * volume, now);
  clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);

  clickOsc.connect(clickGain);

  if (masterGain) {
    gainLow.connect(masterGain);
    gainMid.connect(masterGain);
    clickGain.connect(masterGain);
  }

  oscLow.start(now);
  oscLow.stop(now + 0.15);
  oscMid.start(now);
  oscMid.stop(now + 0.1);
  clickOsc.start(now);
  clickOsc.stop(now + 0.035);
}

/**
 * Japanese Furin (風鈴) temple wind bell:
 * High, pure shimmering bronze/glass tone with long ethereal ring.
 */
export function playFurinSound(): void {
  const ctx = getAudioContext();
  if (!ctx || isMuted) return;

  const now = ctx.currentTime;
  const frequencies = [1760, 2640, 3520]; // A6, E7, A7 overtones
  const ringDuration = 2.4;

  frequencies.forEach((freq, idx) => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq + (Math.random() * 6 - 3), now);

    const gain = ctx.createGain();
    const amp = (0.28 / (idx + 1)) * volume;
    gain.gain.setValueAtTime(amp, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + ringDuration);

    osc.connect(gain);
    if (masterGain) gain.connect(masterGain);

    osc.start(now);
    osc.stop(now + ringDuration);
  });
}

let rainGain: GainNode | null = null;
let rainSource: AudioBufferSourceNode | null = null;

/**
 * Toggles gentle garden rain ambiance (Shigure).
 */
export function toggleRainAmbiance(enabled: boolean): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  if (enabled) {
    if (rainSource) return; // already active

    const bufferSize = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    // Pinkish rain noise
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      data[i] = (b0 + b1 + b2) * 0.15;
    }

    rainSource = ctx.createBufferSource();
    rainSource.buffer = buffer;
    rainSource.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(2200, ctx.currentTime);

    rainGain = ctx.createGain();
    rainGain.gain.setValueAtTime(0.001, ctx.currentTime);
    rainGain.gain.linearRampToValueAtTime(0.22 * volume, ctx.currentTime + 1.2);

    rainSource.connect(filter);
    filter.connect(rainGain);
    if (masterGain) rainGain.connect(masterGain);

    rainSource.start(0);
  } else {
    if (rainSource && rainGain && ctx) {
      rainGain.gain.linearRampToValueAtTime(0.001, ctx.currentTime + 0.8);
      setTimeout(() => {
        rainSource?.stop();
        rainSource?.disconnect();
        rainSource = null;
        rainGain = null;
      }, 850);
    }
  }
}

/**
 * Procedural wood creaking sound: resonant groaning wood fibers under mechanical bending stress.
 */
export function playWoodCreakSound(strain = 0.8): void {
  const ctx = getAudioContext();
  if (!ctx || isMuted) return;

  const now = ctx.currentTime;
  const osc1 = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  const gain = ctx.createGain();

  osc1.type = "sawtooth";
  osc2.type = "triangle";

  const baseFreq = 95 + strain * 40;
  osc1.frequency.setValueAtTime(baseFreq, now);
  osc1.frequency.linearRampToValueAtTime(baseFreq * 0.92, now + 0.18);
  osc2.frequency.setValueAtTime(baseFreq * 1.48, now);
  osc2.frequency.linearRampToValueAtTime(baseFreq * 1.35, now + 0.18);

  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(420, now);
  filter.Q.setValueAtTime(6.0, now);

  gain.gain.setValueAtTime(0.001, now);
  gain.gain.linearRampToValueAtTime(0.24 * volume * Math.min(1.0, strain), now + 0.04);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

  osc1.connect(filter);
  osc2.connect(filter);
  filter.connect(gain);
  if (masterGain) gain.connect(masterGain);

  osc1.start(now);
  osc2.start(now);
  osc1.stop(now + 0.22);
  osc2.stop(now + 0.22);
}

/**
 * Procedural bark cracking sound: crisp micro-fractures of bark flaking off under tension.
 */
export function playBarkCrackSound(): void {
  const ctx = getAudioContext();
  if (!ctx || isMuted) return;

  const now = ctx.currentTime;
  const bufferSize = Math.floor(ctx.sampleRate * 0.04);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.2));
  }

  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(2600 + Math.random() * 800, now);
  filter.Q.setValueAtTime(8.0, now);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.35 * volume, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

  noise.connect(filter);
  filter.connect(gain);
  if (masterGain) gain.connect(masterGain);

  noise.start(now);
}

/**
 * Procedural branch fracture snap: sudden violent splintering wood break.
 */
export function playBranchSnapSound(): void {
  const ctx = getAudioContext();
  if (!ctx || isMuted) return;

  const now = ctx.currentTime;

  // 1. Low impact thud
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(140, now);
  osc.frequency.exponentialRampToValueAtTime(52, now + 0.12);

  const oscGain = ctx.createGain();
  oscGain.gain.setValueAtTime(0.6 * volume, now);
  oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

  osc.connect(oscGain);
  if (masterGain) oscGain.connect(masterGain);
  osc.start(now);
  osc.stop(now + 0.14);

  // 2. Sharp wideband splinter crack
  const bufferSize = Math.floor(ctx.sampleRate * 0.18);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.15));
  }

  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(1650, now);
  filter.Q.setValueAtTime(3.5, now);

  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.85 * volume, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

  noise.connect(filter);
  filter.connect(noiseGain);
  if (masterGain) noiseGain.connect(masterGain);

  noise.start(now);
}

/**
 * Procedural sap drip sound: gentle viscous droplet bead oozing at wound sites.
 */
export function playSapDripSound(): void {
  const ctx = getAudioContext();
  if (!ctx || isMuted) return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(580, now);
  osc.frequency.exponentialRampToValueAtTime(860, now + 0.05);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.22 * volume, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

  osc.connect(gain);
  if (masterGain) gain.connect(masterGain);

  osc.start(now);
  osc.stop(now + 0.07);
}

