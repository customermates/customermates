import type { Particle } from "./homepage-hero-particles-model";

import {
  assignTargets,
  createParticles,
  LOGO_CENTER,
  LOGO_PATHS,
  LOGO_VIEWBOX,
  NO_ACCENT,
  OFFSCREEN_POINTER,
  offsetTargets,
  PARTICLE_ACCENT_COUNT,
  sampleAlphaPoints,
  sampleStep,
  settleParticles,
  stepParticle,
} from "./homepage-hero-particles-model";

export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

const PALETTE_TOKENS = ["--mk-particle-teal", "--mk-particle-blue", "--mk-particle-amber", "--mk-particle-clay"];
const INK_TOKEN = "--mk-particle-ink";
const INK_ALPHA = 0.24;
const ACCENT_ALPHA = 0.62;
const MARK_WIDTH_SCALE = 1.05;
const MARK_HEIGHT_SCALE = 1.22;
const MAX_DEVICE_PIXEL_RATIO = 2;

type Palette = {
  colors: string[];
};

function readPalette(canvas: HTMLCanvasElement): Palette {
  const style = getComputedStyle(canvas);
  const ink = style.getPropertyValue(INK_TOKEN).trim() || style.color;

  return { colors: [ink, ...PALETTE_TOKENS.map((token) => style.getPropertyValue(token).trim() || ink)] };
}

function colorIndex(particle: Particle): number {
  return particle.accent === NO_ACCENT ? 0 : 1 + (particle.accent % PARTICLE_ACCENT_COUNT);
}

function logoPoints(size: number, step: number, random: () => number) {
  const offscreen = document.createElement("canvas");
  offscreen.width = size;
  offscreen.height = size;
  const context = offscreen.getContext("2d", { willReadFrequently: true });
  if (!context) return [];

  context.scale(size / LOGO_VIEWBOX, size / LOGO_VIEWBOX);
  for (const path of LOGO_PATHS) context.fill(new Path2D(path));

  return sampleAlphaPoints(context.getImageData(0, 0, size, size).data, size, step, random);
}

export function startHeroParticles(canvas: HTMLCanvasElement): () => void {
  const renderingContext = canvas.getContext("2d");
  if (!renderingContext) return () => undefined;
  const context: CanvasRenderingContext2D = renderingContext;

  const reducedMotion = window.matchMedia(REDUCED_MOTION_QUERY);
  const random = Math.random;
  const pointer = { ...OFFSCREEN_POINTER };
  const area = canvas.closest<HTMLElement>("[data-homepage-hero]") ?? canvas.parentElement ?? canvas;

  let palette = readPalette(canvas);
  let particles: Particle[] = [];
  let width = 0;
  let height = 0;
  let frame = 0;
  let running = false;
  let visible = false;

  function layout(): boolean {
    const rect = canvas.getBoundingClientRect();
    width = rect.width;
    height = rect.height;
    if (width === 0 || height === 0) return false;

    const ratio = Math.min(MAX_DEVICE_PIXEL_RATIO, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);

    const size = Math.round(Math.min(width * MARK_WIDTH_SCALE, height * MARK_HEIGHT_SCALE));
    const dx = width / 2 - size * LOGO_CENTER.x;
    const dy = height / 2 - size * LOGO_CENTER.y;
    const targets = offsetTargets(logoPoints(size, sampleStep(size), random), dx, dy);

    if (particles.length !== targets.length) particles = createParticles(targets.length, width, height, random);
    assignTargets(particles, targets);

    return true;
  }

  function draw(time: number, animate: boolean) {
    context.clearRect(0, 0, width, height);

    if (animate) for (const particle of particles) stepParticle(particle, pointer, time);

    palette.colors.forEach((color, index) => {
      context.globalAlpha = index === 0 ? INK_ALPHA : ACCENT_ALPHA;
      context.fillStyle = color;
      for (const particle of particles)
        if (colorIndex(particle) === index) context.fillRect(particle.x, particle.y, particle.size, particle.size);
    });
    context.globalAlpha = 1;
  }

  function loop(time: number) {
    draw(time, true);
    if (running) frame = window.requestAnimationFrame(loop);
  }

  function drawStill() {
    if (!layout()) return;
    settleParticles(particles);
    draw(0, false);
  }

  function update() {
    const shouldRun = visible && document.visibilityState === "visible" && !reducedMotion.matches;

    if (shouldRun && !running) {
      running = true;
      frame = window.requestAnimationFrame(loop);
    } else if (!shouldRun && running) {
      running = false;
      window.cancelAnimationFrame(frame);
    }
  }

  function refresh() {
    if (reducedMotion.matches) drawStill();
    else layout();
    update();
  }

  function onPointerMove(event: PointerEvent) {
    if (reducedMotion.matches) return;
    const rect = canvas.getBoundingClientRect();
    pointer.x = event.clientX - rect.left;
    pointer.y = event.clientY - rect.top;
  }

  function onPointerLeave() {
    pointer.x = OFFSCREEN_POINTER.x;
    pointer.y = OFFSCREEN_POINTER.y;
  }

  function onThemeChange() {
    palette = readPalette(canvas);
    if (!running) drawStill();
  }

  const intersection = new IntersectionObserver(([entry]) => {
    visible = entry?.isIntersecting ?? false;
    update();
  });
  const resize = new ResizeObserver(() => refresh());
  const theme = new MutationObserver(onThemeChange);

  intersection.observe(canvas);
  resize.observe(canvas);
  theme.observe(document.documentElement, { attributeFilter: ["class", "data-theme", "style"], attributes: true });
  area.addEventListener("pointermove", onPointerMove);
  area.addEventListener("pointerleave", onPointerLeave);
  area.addEventListener("pointerup", onPointerLeave);
  document.addEventListener("visibilitychange", update);
  reducedMotion.addEventListener("change", refresh);
  refresh();

  return () => {
    running = false;
    window.cancelAnimationFrame(frame);
    intersection.disconnect();
    resize.disconnect();
    theme.disconnect();
    area.removeEventListener("pointermove", onPointerMove);
    area.removeEventListener("pointerleave", onPointerLeave);
    area.removeEventListener("pointerup", onPointerLeave);
    document.removeEventListener("visibilitychange", update);
    reducedMotion.removeEventListener("change", refresh);
  };
}
