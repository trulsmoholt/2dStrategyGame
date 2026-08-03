export type Rng = number;                       // uint32, never 0

const ZERO_SEED_FALLBACK = 0x9e3779b9;           // xorshift32 has 0 as a fixed point

export function seedRng(seed: number): Rng {
  const s = seed >>> 0;
  return s === 0 ? ZERO_SEED_FALLBACK : s;
}

function step(x: number): number {
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return x >>> 0;
}

export function nextRng(s: Rng): [value: number, next: Rng] {
  const next = step(s);
  return [next / 0x100000000, next];   // value in [0, 1)
}

export function rollInt(s: Rng, min: number, max: number): [n: number, next: Rng] {
  const [v, next] = nextRng(s);
  const range = max - min + 1;
  return [min + Math.floor(v * range), next];
}
