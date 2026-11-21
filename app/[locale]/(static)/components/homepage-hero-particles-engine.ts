import type { Particle, ParticleClearing } from "./homepage-hero-particles-model";

import {
  assignTargets,
  createParticles,
  INTRO_DURATION_MS,
  INTRO_MAX_DELAY_MS,
  LOGO_CENTER,
  LOGO_PATHS,
  LOGO_VIEWBOX,
  NO_ACCENT,
  OFFSCREEN_POINTER,
  offsetTargets,
  PARTICLE_ACCENT_COUNT,
  placeForIntro,
  sampleAlphaPoints,
  sampleStep,
  scatterForIntro,
  seaCount,
  seaTargets,
  settleParticles,
  stepParticle,
  thinMarkTargets,
} from "./homepage-hero-particles-model";

export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

const PALETTE_TOKENS = ["--mk-particle-teal", "--mk-particle-blue", "--mk-particle-amber", "--mk-particle-clay"];
const INK_TOKEN = "--mk-particle-ink";
const HERO_AREA_SELECTOR = "[data-homepage-hero], [data-marketing-hero], [data-page-hero]";
const MARK_ALPHA = { ink: 0.3, accent: 0.66 };
const SEA_ALPHA = { ink: 0.2, accent: 0.48 };
const MARK_WIDTH_SCALE = 1.05;
const MARK_HEIGHT_SCALE = 1.36;
const MARK_CENTER_Y = 0.56;
const MARK_MIN_HEIGHT = 480;
const CLEARING_PADDING_X = 1.15;
const CLEARING_PADDING_Y = 1.15;
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

function baseAlpha(particle: Particle): number {
  const alphas = particle.sea ? SEA_ALPHA : MARK_ALPHA;
  return particle.accent === NO_ACCENT ? alphas.ink : alphas.accent;
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

function readClearing(area: HTMLElement, canvasRect: DOMRect): ParticleClearing | null {
  const rects = [
    area.querySelector("h1"),
    area.querySelector(".mk-lede"),
    area.querySelector("[data-homepage-assurances]"),
  ]
    .filter((element): element is Element => element !== null)
    .map((element) => element.getBoundingClientRect())
    .filter((rect) => rect.width > 0 && rect.height > 0);
  if (rects.length === 0) return null;

  const left = Math.min(...rects.map((rect) => rect.left));
  const right = Math.max(...rects.map((rect) => rect.right));
  const top = Math.min(...rects.map((rect) => rect.top));
  const bottom = Math.max(...rects.map((rect) => rect.bottom));

  return {
    cx: (left + right) / 2 - canvasRect.left,
    cy: (top + bottom) / 2 - canvasRect.top,
    rx: ((right - left) / 2) * CLEARING_PADDING_X,
    ry: ((bottom - top) / 2) * CLEARING_PADDING_Y,
  };
}

export function startHeroParticles(canvas: HTMLCanvasElement): () => void {
  const renderingContext = canvas.getContext("2d");
  if (!renderingContext) return () => undefined;
  const context: CanvasRenderingContext2D = renderingContext;

  const reducedMotion = window.matchMedia(REDUCED_MOTION_QUERY);
  const random = Math.random;
  const pointer = { ...OFFSCREEN_POINTER };
  const area = canvas.closest<HTMLElement>(HERO_AREA_SELECTOR) ?? canvas.parentElement ?? canvas;
  const drawsMark = canvas.dataset.particleMark !== "off";

  let palette = readPalette(canvas);
  let particles: Particle[] = [];
  let width = 0;
  let height = 0;
  let frame = 0;
  let running = false;
  let visible = false;
  let introStart: number | null = null;
  let introDone = false;

  function layout(): boolean {
    const rect = canvas.getBoundingClientRect();
    width = rect.width;
    height = rect.height;
    if (width === 0 || height === 0) return false;

    const ratio = Math.min(MAX_DEVICE_PIXEL_RATIO, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);

    const clearing = readClearing(area, rect);
    const size = Math.round(Math.min(width * MARK_WIDTH_SCALE, height * MARK_HEIGHT_SCALE));
    const dx = width / 2 - size * LOGO_CENTER.x;
    const dy = height * MARK_CENTER_Y - size * LOGO_CENTER.y;
    const markTargets =
      drawsMark && height >= MARK_MIN_HEIGHT
        ? thinMarkTargets(offsetTargets(logoPoints(size, sampleStep(size), random), dx, dy), clearing, random)
        : [];
    const waterTargets = seaTargets(width, height, seaCount(width, height), clearing, random);

    const mark = createParticles(markTargets.length, width, height, random);
    const sea = createParticles(waterTargets.length, width, height, random, true);
    assignTargets(mark, markTargets);
    assignTargets(sea, waterTargets);
    particles = [...sea, ...mark];

    if (introDone || reducedMotion.matches) settleParticles(particles);
    else scatterForIntro(particles, random);

    return true;
  }

  function drawBatched() {
    palette.colors.forEach((color, index) => {
      context.fillStyle = color;
      for (const sea of [true, false]) {
        context.globalAlpha = sea
          ? index === 0
            ? SEA_ALPHA.ink
            : SEA_ALPHA.accent
          : index === 0
            ? MARK_ALPHA.ink
            : MARK_ALPHA.accent;
        for (const particle of particles) {
          if (particle.sea === sea && colorIndex(particle) === index)
            context.fillRect(particle.x, particle.y, particle.size, particle.size);
        }
      }
    });
    context.globalAlpha = 1;
  }

  function drawFading() {
    for (const particle of particles) {
      if (particle.alpha <= 0) continue;
      context.globalAlpha = baseAlpha(particle) * particle.alpha;
      context.fillStyle = palette.colors[colorIndex(particle)];
      context.fillRect(particle.x, particle.y, particle.size, particle.size);
    }
    context.globalAlpha = 1;
  }

  function draw(time: number, animate: boolean) {
    context.clearRect(0, 0, width, height);

    if (animate && !introDone) {
      introStart ??= time;
      const elapsed = time - introStart;
      for (const particle of particles) placeForIntro(particle, elapsed);
      if (elapsed >= INTRO_DURATION_MS + INTRO_MAX_DELAY_MS) introDone = true;
      drawFading();
      return;
    }

    if (animate) for (const particle of particles) stepParticle(particle, pointer, time);
    drawBatched();
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
    const rect = canvas.getBoundingClientRect();
    if (particles.length > 0 && rect.width === width && rect.height === height && !reducedMotion.matches) {
      update();
      return;
    }
    if (reducedMotion.matches) {
      introDone = true;
      drawStill();
    } else {
      if (introStart !== null) introDone = true;
      layout();
    }
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
