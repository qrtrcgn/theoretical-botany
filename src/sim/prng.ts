export type PrngState = number;

function hashSeed(seed: number | string): number {
  const str = String(seed);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 16777619) >>> 0;
  }
  return h >>> 0;
}

export interface Prng {
  random: () => number;
  float: (min?: number, max?: number) => number;
  int: (min: number, max: number) => number;
  gaussian: (mean?: number, stdev?: number) => number;
  clone: () => Prng;
  reseed: (seed: number | string) => void;
}

export function createPrng(seed?: number | string): Prng {
  let s: number = hashSeed(seed !== undefined ? seed : (Date.now() ^ (Math.random() * 0xffffffff)));
  let spareAvailable = false;
  let spare = 0;

  function next(): number {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1) >>> 0;
    t ^= (t + Math.imul(t ^ (t >>> 7), t | 61)) >>> 0;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function gaussian(mean = 0, stdev = 1): number {
    if (spareAvailable) {
      spareAvailable = false;
      return mean + spare * stdev;
    }
    let u = 0, v = 0, sq = 0;
    do {
      u = next() * 2 - 1;
      v = next() * 2 - 1;
      sq = u * u + v * v;
    } while (sq >= 1 || sq === 0);
    const r = Math.sqrt((-2 * Math.log(sq)) / sq);
    spare = v * r;
    spareAvailable = true;
    return mean + u * r * stdev;
  }

  const api: Prng = {
    random: () => next(),
    float: (min = 0, max = 1) => {
      if (min >= max) return min;
      return min + next() * (max - min);
    },
    int: (min: number, max: number) => {
      if (min > max) [min, max] = [max, min];
      return Math.floor(min + next() * (max - min + 1));
    },
    gaussian,
    clone: () => {
      const c = createPrng(0);
      (c as unknown as { _restore: (s2: number, sa: boolean, sp: number) => void })._restore(s, spareAvailable, spare);
      return c;
    },
    reseed: (ns: number | string) => {
      s = hashSeed(ns);
      spareAvailable = false;
      spare = 0;
    },
  };
  (api as unknown as { _restore: (s2: number, sa: boolean, sp: number) => void })._restore = (s2, sa, sp) => {
    s = s2 >>> 0;
    spareAvailable = sa;
    spare = sp;
  };
  return api;
}

export default createPrng;
