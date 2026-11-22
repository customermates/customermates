import { describe, expect, it } from "vitest";

import {
  assignTargets,
  CLEARING_INNER,
  clearingWeight,
  createParticles,
  INTRO_DURATION_MS,
  INTRO_MAX_DELAY_MS,
  INTRO_SCATTER_MIN,
  introProgress,
  MARK_CLEARING_FLOOR,
  placeForIntro,
  scatterForIntro,
  SEA_AREA_PER_PARTICLE,
  SEA_MAX_PARTICLES,
  SEA_SPEED,
  seaCount,
  seaTargets,
  thinMarkTargets,
  LOGO_CENTER,
  NO_ACCENT,
  OFFSCREEN_POINTER,
  PARTICLE_ACCENT_SHARE,
  PARTICLE_MIN_STEP,
  sampleAlphaPoints,
  sampleStep,
  settleParticles,
  stepParticle,
} from "../homepage-hero-particles-model";

function opaque(size: number): Uint8ClampedArray {
  return new Uint8ClampedArray(size * size * 4).fill(255);
}

function sequence(values: number[]): () => number {
  let index = 0;
  return () => values[index++ % values.length];
}

describe("homepage hero particle model", () => {
  it("keeps the large C airy: one dot every few pixels, never denser than the minimum step", () => {
    expect(sampleStep(1200)).toBeGreaterThan(5);
    expect(sampleStep(200)).toBe(PARTICLE_MIN_STEP);

    const size = 400;
    const count = sampleAlphaPoints(opaque(size), size, sampleStep(size)).length;
    expect(count).toBe(Math.ceil(size / PARTICLE_MIN_STEP) ** 2);
  });

  it("keeps only opaque pixels when sampling the logo", () => {
    const size = 10;
    const data = new Uint8ClampedArray(size * size * 4);
    data[(2 * size + 4) * 4 + 3] = 255;

    expect(sampleAlphaPoints(data, size, 1)).toEqual([{ x: 4, y: 2 }]);
  });

  it("loosens the grid by at most half a step so the dots do not form rows", () => {
    const size = 40;
    const step = 8;
    const points = sampleAlphaPoints(opaque(size), size, step, sequence([0, 1]));

    expect(points[0]).toEqual({ x: -4, y: 4 });
    for (const point of points) {
      const column = Math.round(point.x / step) * step;
      expect(Math.abs(point.x - column)).toBeLessThanOrEqual(step / 2);
    }
  });

  it("centres the drawn C, not its square", () => {
    expect(LOGO_CENTER.x).toBeLessThan(0.5);
    expect(LOGO_CENTER.y).toBeGreaterThan(0.5);
  });

  it("colours about a fifth of the dots and gives every particle a target", () => {
    const particles = createParticles(5, 100, 100, sequence([0.1, 0.5, 0.9]));
    assignTargets(particles, [
      { x: 1, y: 2 },
      { x: 3, y: 4 },
    ]);

    expect(particles.map((particle) => [particle.tx, particle.ty])).toEqual([
      [1, 2],
      [3, 4],
      [1, 2],
      [3, 4],
      [1, 2],
    ]);
    expect(PARTICLE_ACCENT_SHARE).toBeGreaterThan(0.2);
    expect(createParticles(1, 10, 10, sequence([0.99]))[0].accent).toBe(NO_ACCENT);
  });

  it("settles on the shape for reduced motion and springs back to it after the pointer leaves", () => {
    const [particle] = createParticles(1, 100, 100, sequence([0.9]));
    particle.tx = 50;
    particle.ty = 50;
    particle.x = 10;
    particle.y = 90;

    for (let frame = 0; frame < 400; frame += 1) stepParticle(particle, OFFSCREEN_POINTER, frame * 16);
    expect(Math.abs(particle.x - 50)).toBeLessThan(3);
    expect(Math.abs(particle.y - 50)).toBeLessThan(3);

    particle.x = 0;
    settleParticles([particle]);
    expect([particle.x, particle.y, particle.vx, particle.vy]).toEqual([50, 50, 0, 0]);
  });

  it("keeps the text clear: no sea dots in the inner clearing, half of the C stays behind the text", () => {
    const clearing = { cx: 500, cy: 300, rx: 300, ry: 120 };
    expect(clearingWeight(clearing, 500, 300)).toBe(0);
    expect(clearingWeight(clearing, 500 + 300 * CLEARING_INNER, 300)).toBe(0);
    expect(clearingWeight(clearing, 900, 300)).toBe(1);
    expect(clearingWeight(null, 500, 300)).toBe(1);

    const sea = seaTargets(1000, 600, 2000, clearing, Math.random);
    expect(sea.length).toBeGreaterThan(1500);
    expect(sea.filter((target) => clearingWeight(clearing, target.x, target.y) === 0)).toEqual([]);

    const centre = Array.from({ length: 4000 }, () => ({ x: 500, y: 300 }));
    const kept = thinMarkTargets(centre, clearing, Math.random).length / centre.length;
    expect(kept).toBeGreaterThan(MARK_CLEARING_FLOOR - 0.05);
    expect(kept).toBeLessThan(MARK_CLEARING_FLOOR + 0.05);
  });

  it("scales the sea with the area and caps it", () => {
    expect(seaCount(1440, 900)).toBe(Math.round((1440 * 900) / SEA_AREA_PER_PARTICLE));
    expect(seaCount(10_000, 10_000)).toBe(SEA_MAX_PARTICLES);
    expect(createParticles(1, 10, 10, sequence([0.5]), true)[0]).toMatchObject({ sea: true, speed: SEA_SPEED });
  });

  it("assembles the C smoothly: dots fade in and glide to their place without overshooting", () => {
    const particles = createParticles(20, 100, 100, Math.random);
    assignTargets(particles, [{ x: 50, y: 50 }]);
    scatterForIntro(particles, Math.random);

    for (const particle of particles) {
      expect(particle.alpha).toBe(0);
      const start = Math.hypot(particle.x - 50, particle.y - 50);
      expect(start).toBeGreaterThanOrEqual(INTRO_SCATTER_MIN - 0.001);
      expect(particle.delay).toBeLessThanOrEqual(INTRO_MAX_DELAY_MS);

      let previous = start;
      for (let elapsed = 0; elapsed <= INTRO_DURATION_MS + INTRO_MAX_DELAY_MS; elapsed += 50) {
        placeForIntro(particle, elapsed);
        const distance = Math.hypot(particle.x - 50, particle.y - 50);
        expect(distance).toBeLessThanOrEqual(previous + 0.001);
        previous = distance;
      }
      expect(particle.alpha).toBe(1);
      expect(previous).toBeLessThan(0.001);
    }
    expect(introProgress(0, 0)).toBe(0);
    expect(introProgress(INTRO_DURATION_MS / 2, 0)).toBeGreaterThan(0.5);
  });

  it("pushes dots away from the pointer", () => {
    const [particle] = createParticles(1, 100, 100, sequence([0.9]));
    particle.tx = 50;
    particle.ty = 50;
    settleParticles([particle]);

    stepParticle(particle, { x: 45, y: 50 }, 0);

    expect(particle.vx).toBeGreaterThan(0);
  });
});
