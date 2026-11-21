export type ParticleTarget = {
  x: number;
  y: number;
};

export type Particle = {
  accent: number;
  phase: number;
  size: number;
  tx: number;
  ty: number;
  vx: number;
  vy: number;
  x: number;
  y: number;
};

export type ParticlePointer = {
  x: number;
  y: number;
};

export const PARTICLE_SAMPLE_DIVISOR = 160;
export const PARTICLE_MIN_STEP = 4;
export const PARTICLE_SIZE = 1.5;
export const PARTICLE_LARGE_SIZE = 2.3;
export const PARTICLE_LARGE_SHARE = 0.12;
export const PARTICLE_ACCENT_SHARE = 0.3;
export const PARTICLE_ACCENT_COUNT = 4;
export const PARTICLE_REPEL_RADIUS = 120;
export const PARTICLE_REPEL_FORCE = 3;
export const PARTICLE_SPRING = 0.018;
export const PARTICLE_DAMPING = 0.86;
export const NO_ACCENT = -1;
export const OFFSCREEN_POINTER: ParticlePointer = { x: -1e4, y: -1e4 };

export const LOGO_VIEWBOX = 256;
export const LOGO_PATHS = [
  "M201.697 178.505L175.67 168.424C169.43 166.007 162.039 168.153 156.544 171.971C149.591 176.802 137.646 182.809 118.247 186.566C81.5296 193.677 60.3846 153.139 60.3846 153.139C60.3846 153.139 64.84 196.282 114.909 210.505C164.978 224.727 201.697 178.505 201.697 178.505Z",
  "M161.754 53.5827C161.754 53.5827 98.2194 61.1686 91.5434 110.946C84.8675 160.724 134.937 178.502 134.937 178.502C134.937 178.502 115.366 188.683 95.3394 181.576C75.3116 174.468 64.8398 153.61 64.8398 153.61C64.8398 153.61 41.4738 114.502 74.8537 75.3907C108.233 36.2797 161.754 53.5827 161.754 53.5827Z",
  "M201.672 86.0414L181.054 96.11C172.525 100.275 159.267 88.6796 150.153 86.0293C147.272 85.1916 143.526 84.9392 138.683 85.555C110.719 89.1106 96.0384 103.819 96.0384 103.819C96.0384 103.819 100.233 77.3772 142.179 61.3915C184.124 45.4054 201.672 86.0414 201.672 86.0414Z",
] as const;

export const LOGO_CENTER = { x: 125 / LOGO_VIEWBOX, y: 131 / LOGO_VIEWBOX } as const;

export function sampleStep(size: number): number {
  return Math.max(PARTICLE_MIN_STEP, size / PARTICLE_SAMPLE_DIVISOR);
}

export function sampleAlphaPoints(
  data: Uint8ClampedArray,
  size: number,
  step: number,
  random?: () => number,
): ParticleTarget[] {
  const points: ParticleTarget[] = [];

  for (let row = 0; row < size; row += step) {
    for (let column = 0; column < size; column += step) {
      const x = random ? column + (random() - 0.5) * step : column;
      const y = random ? row + (random() - 0.5) * step : row;
      const pixelX = Math.min(size - 1, Math.max(0, Math.round(x)));
      const pixelY = Math.min(size - 1, Math.max(0, Math.round(y)));

      if (data[(pixelY * size + pixelX) * 4 + 3] > 128) points.push({ x, y });
    }
  }

  return points;
}

export function offsetTargets(points: readonly ParticleTarget[], dx: number, dy: number): ParticleTarget[] {
  return points.map((point) => ({ x: point.x + dx, y: point.y + dy }));
}

export function createParticles(count: number, width: number, height: number, random: () => number): Particle[] {
  return Array.from({ length: count }, (_, index) => ({
    accent: random() < PARTICLE_ACCENT_SHARE ? index % PARTICLE_ACCENT_COUNT : NO_ACCENT,
    phase: random() * Math.PI * 2,
    size: random() < PARTICLE_LARGE_SHARE ? PARTICLE_LARGE_SIZE : PARTICLE_SIZE,
    tx: 0,
    ty: 0,
    vx: 0,
    vy: 0,
    x: random() * width,
    y: random() * height,
  }));
}

export function assignTargets(particles: Particle[], targets: readonly ParticleTarget[]): void {
  if (targets.length === 0) return;

  particles.forEach((particle, index) => {
    const target = targets[index % targets.length];
    particle.tx = target.x;
    particle.ty = target.y;
  });
}

export function settleParticles(particles: Particle[]): void {
  for (const particle of particles) {
    particle.x = particle.tx;
    particle.y = particle.ty;
    particle.vx = 0;
    particle.vy = 0;
  }
}

export function stepParticle(particle: Particle, pointer: ParticlePointer, time: number): void {
  const dx = particle.x - pointer.x;
  const dy = particle.y - pointer.y;
  const distanceSquared = dx * dx + dy * dy;

  if (distanceSquared < PARTICLE_REPEL_RADIUS * PARTICLE_REPEL_RADIUS) {
    const distance = Math.sqrt(distanceSquared) + 0.001;
    const force = (1 - distance / PARTICLE_REPEL_RADIUS) * PARTICLE_REPEL_FORCE;
    particle.vx += (dx / distance) * force;
    particle.vy += (dy / distance) * force;
  }

  particle.vx += (particle.tx + Math.sin(time / 900 + particle.phase) * 1.1 - particle.x) * PARTICLE_SPRING;
  particle.vy += (particle.ty + Math.cos(time / 1100 + particle.phase) * 1.1 - particle.y) * PARTICLE_SPRING;
  particle.vx *= PARTICLE_DAMPING;
  particle.vy *= PARTICLE_DAMPING;
  particle.x += particle.vx;
  particle.y += particle.vy;
}
