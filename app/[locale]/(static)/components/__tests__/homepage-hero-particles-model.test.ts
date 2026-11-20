import { describe, expect, it } from "vitest";

import {
  assignTargets,
  createParticles,
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
    expect(sampleStep(820)).toBeGreaterThan(5);
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

  it("colours about a third of the dots and gives every particle a target", () => {
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

  it("pushes dots away from the pointer", () => {
    const [particle] = createParticles(1, 100, 100, sequence([0.9]));
    particle.tx = 50;
    particle.ty = 50;
    settleParticles([particle]);

    stepParticle(particle, { x: 45, y: 50 }, 0);

    expect(particle.vx).toBeGreaterThan(0);
  });
});
