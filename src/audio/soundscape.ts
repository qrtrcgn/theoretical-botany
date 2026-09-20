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
 */
export function playPruneSound(): void {
  const ctx = getAudioContext();
  if (!ctx || isMuted) return;

  const now = ctx.currentTime;

  // 1. Noise burst (shear)
  const bufferSize = ctx.sampleRate * 0.08;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.02));
  }
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(3200, now);
  filter.Q.setValueAtTime(3.0, now);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.6 * volume, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

  noise.connect(filter);
  filter.connect(gain);
  if (masterGain) gain.connect(masterGain);

  noise.start(now);
  noise.stop(now + 0.08);

  // 2. Woody stem click ping
  const osc = ctx.createOscillator();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(850, now);
  osc.frequency.exponentialRampToValueAtTime(180, now + 0.05);

  const oscGain = ctx.createGain();
  oscGain.gain.setValueAtTime(0.4 * volume, now);
  oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

  osc.connect(oscGain);
  if (masterGain) oscGain.connect(masterGain);

  osc.start(now);
  osc.stop(now + 0.05);
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
 * Procedural water tone / droplet plink.
 */
export function playWaterSound(): void {
  const ctx = getAudioContext();
  if (!ctx || isMuted) return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = "sine";
  const startFreq = 800 + Math.random() * 400;
  osc.frequency.setValueAtTime(startFreq, now);
  osc.frequency.exponentialRampToValueAtTime(startFreq * 0.6, now + 0.12);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.3 * volume, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

  osc.connect(gain);
  if (masterGain) gain.connect(masterGain);

  osc.start(now);
  osc.stop(now + 0.12);
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
