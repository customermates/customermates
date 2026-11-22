export type ParticleTarget = {
  x: number;
  y: number;
};

export type Particle = {
  accent: number;
  alpha: number;
  delay: number;
  drift: number;
  ox: number;
  oy: number;
  phase: number;
  sea: boolean;
  size: number;
  speed: number;
  tx: number;
  ty: number;
  vx: number;
  vy: number;
  x: number;
  y: number;
};

export type ParticleClearing = {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
};

export type ParticlePointer = {
  x: number;
  y: number;
};

export const PARTICLE_SAMPLE_DIVISOR = 220;
export const PARTICLE_MIN_STEP = 4;
export const PARTICLE_SIZE = 1.5;
export const PARTICLE_LARGE_SIZE = 2.3;
export const PARTICLE_LARGE_SHARE = 0.12;
export const PARTICLE_ACCENT_SHARE = 0.22;
export const PARTICLE_ACCENT_COUNT = 4;
export const PARTICLE_REPEL_RADIUS = 120;
export const PARTICLE_REPEL_FORCE = 3;
export const PARTICLE_SPRING = 0.018;
export const PARTICLE_DAMPING = 0.86;
export const PARTICLE_MARK_DRIFT = 1.1;
export const SEA_AREA_PER_PARTICLE = 900;
export const SEA_MAX_PARTICLES = 2200;
export const SEA_ACCENT_SHARE = 0.4;
export const SEA_DRIFT_MIN = 10;
export const SEA_DRIFT_MAX = 28;
export const SEA_SPEED = 3.2;
export const CLEARING_INNER = 0.45;
export const MARK_CLEARING_FLOOR = 0.55;
export const INTRO_DURATION_MS = 1600;
export const INTRO_MAX_DELAY_MS = 700;
export const INTRO_SCATTER_MIN = 80;
export const INTRO_SCATTER_MAX = 260;
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

export function createParticles(
  count: number,
  width: number,
  height: number,
  random: () => number,
  sea = false,
): Particle[] {
  const accentShare = sea ? SEA_ACCENT_SHARE : PARTICLE_ACCENT_SHARE;
  return Array.from({ length: count }, (_, index) => {
    const x = random() * width;
    const y = random() * height;
    return {
      accent: random() < accentShare ? index % PARTICLE_ACCENT_COUNT : NO_ACCENT,
      alpha: 1,
      delay: 0,
      drift: sea ? SEA_DRIFT_MIN + random() * (SEA_DRIFT_MAX - SEA_DRIFT_MIN) : PARTICLE_MARK_DRIFT,
      ox: x,
      oy: y,
      phase: random() * Math.PI * 2,
      sea,
      size: random() < PARTICLE_LARGE_SHARE ? PARTICLE_LARGE_SIZE : PARTICLE_SIZE,
      speed: sea ? SEA_SPEED : 1,
      tx: 0,
      ty: 0,
      vx: 0,
      vy: 0,
      x,
      y,
    };
  });
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
    particle.alpha = 1;
  }
}

export function clearingWeight(clearing: ParticleClearing | null, x: number, y: number): number {
  if (!clearing || clearing.rx <= 0 || clearing.ry <= 0) return 1;
  const distance = Math.hypot((x - clearing.cx) / clearing.rx, (y - clearing.cy) / clearing.ry);
  if (distance >= 1) return 1;
  return Math.max(0, (distance - CLEARING_INNER) / (1 - CLEARING_INNER));
}

export function thinMarkTargets(
  targets: readonly ParticleTarget[],
  clearing: ParticleClearing | null,
  random: () => number,
): ParticleTarget[] {
  return targets.filter(
    (target) =>
      random() < MARK_CLEARING_FLOOR + (1 - MARK_CLEARING_FLOOR) * clearingWeight(clearing, target.x, target.y),
  );
}

export function seaCount(width: number, height: number): number {
  return Math.min(SEA_MAX_PARTICLES, Math.round((width * height) / SEA_AREA_PER_PARTICLE));
}

export function seaTargets(
  width: number,
  height: number,
  count: number,
  clearing: ParticleClearing | null,
  random: () => number,
): ParticleTarget[] {
  const targets: ParticleTarget[] = [];
  for (let attempt = 0; targets.length < count && attempt < count * 20; attempt += 1) {
    const x = random() * width;
    const y = random() * height;
    if (random() < clearingWeight(clearing, x, y)) targets.push({ x, y });
  }
  return targets;
}

export function scatterForIntro(particles: Particle[], random: () => number): void {
  for (const particle of particles) {
    const angle = random() * Math.PI * 2;
    const radius = INTRO_SCATTER_MIN + random() * (INTRO_SCATTER_MAX - INTRO_SCATTER_MIN);
    particle.ox = particle.tx + Math.cos(angle) * radius;
    particle.oy = particle.ty + Math.sin(angle) * radius;
    particle.delay = random() * INTRO_MAX_DELAY_MS;
    particle.x = particle.ox;
    particle.y = particle.oy;
    particle.vx = 0;
    particle.vy = 0;
    particle.alpha = 0;
  }
}

export function introProgress(elapsed: number, delay: number): number {
  const linear = Math.min(1, Math.max(0, (elapsed - delay) / INTRO_DURATION_MS));
  return 1 - (1 - linear) ** 3;
}

export function placeForIntro(particle: Particle, elapsed: number): void {
  const progress = introProgress(elapsed, particle.delay);
  particle.x = particle.ox + (particle.tx - particle.ox) * progress;
  particle.y = particle.oy + (particle.ty - particle.oy) * progress;
  particle.alpha = progress;
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

  const wave = time / particle.speed;
  particle.vx += (particle.tx + Math.sin(wave / 900 + particle.phase) * particle.drift - particle.x) * PARTICLE_SPRING;
  particle.vy += (particle.ty + Math.cos(wave / 1100 + particle.phase) * particle.drift - particle.y) * PARTICLE_SPRING;
  particle.vx *= PARTICLE_DAMPING;
  particle.vy *= PARTICLE_DAMPING;
  particle.x += particle.vx;
  particle.y += particle.vy;
}
