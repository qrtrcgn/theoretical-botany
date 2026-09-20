/**
 * Soundscape Engine Tests
 * Verifies Web Audio synthesis, volume control, mute toggles, and ambient generation.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { setMute, getMute, setVolume, getVolume, playPruneSound, playGrowSound, playWaterSound, playSaveSound, toggleWindAmbiance } from "../src/audio/soundscape";

// Mock Web Audio API if running in node/bun test environment without window.AudioContext
if (typeof window === "undefined") {
  (global as unknown as { window: Record<string, unknown> }).window = {};
}

if (!(global as unknown as { window: { AudioContext?: unknown } }).window.AudioContext) {
  class MockAudioContext {
    currentTime = 0;
    sampleRate = 44100;
    state = "running";
    destination = {};
    createGain() {
      return {
        gain: { value: 1, setValueAtTime: () => {}, linearRampToValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} },
        connect: () => {}
      };
    }
    createBuffer(channels: number, length: number, sampleRate: number) {
      return {
        getChannelData: () => new Float32Array(length)
      };
    }
    createBufferSource() {
      return {
        buffer: null,
        loop: false,
        connect: () => {},
        start: () => {},
        stop: () => {}
      };
    }
    createBiquadFilter() {
      return {
        type: "lowpass",
        frequency: { value: 350, setValueAtTime: () => {} },
        Q: { value: 1, setValueAtTime: () => {} },
        connect: () => {}
      };
    }
    createOscillator() {
      return {
        type: "sine",
        frequency: { value: 440, setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} },
        connect: () => {},
        start: () => {},
        stop: () => {}
      };
    }
    resume() {
      return Promise.resolve();
    }
  }
  (global as unknown as { window: { AudioContext: unknown } }).window.AudioContext = MockAudioContext;
}

describe("Soundscape Engine", () => {
  beforeEach(() => {
    setMute(false);
    setVolume(0.7);
  });

  it("manages mute state correctly", () => {
    expect(getMute()).toBe(false);
    setMute(true);
    expect(getMute()).toBe(true);
    setMute(false);
    expect(getMute()).toBe(false);
  });

  it("manages volume state correctly", () => {
    expect(getVolume()).toBe(0.7);
    setVolume(0.5);
    expect(getVolume()).toBe(0.5);
    setVolume(1.5); // clamped
    expect(getVolume()).toBe(1.0);
    setVolume(-0.2); // clamped
    expect(getVolume()).toBe(0.0);
  });

  it("triggers procedural sound effects without throwing", () => {
    expect(() => playPruneSound()).not.toThrow();
    expect(() => playGrowSound(0)).not.toThrow();
    expect(() => playWaterSound()).not.toThrow();
    expect(() => playSaveSound()).not.toThrow();
  });

  it("toggles wind ambiance correctly", () => {
    const windOn = toggleWindAmbiance(true);
    expect(windOn).toBe(true);
    const windOff = toggleWindAmbiance(false);
    expect(windOff).toBe(false);
  });
});
