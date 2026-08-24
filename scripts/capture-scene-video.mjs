// Renders a marketing scene to an MP4 by stepping its clock, one frame at a time.
//
// The scene is a pure function of a normalised 0..1 clock, so this never records the
// screen and never depends on wall-clock timing: it sets t, waits for paint, screenshots,
// repeats. That is what makes the output reproducible. Re-running this on the same commit
// produces the same frames, which the --verify flag proves by hashing two passes.
//
// Usage:
//   yarn dev
//   node scripts/capture-scene-video.mjs                     # writes public/scenes/chat-draft.mp4
//   node scripts/capture-scene-video.mjs --verify             # also proves determinism
//   node scripts/capture-scene-video.mjs --fps 30 --seconds 11
//
// Needs ffmpeg on PATH. The capture route is noindex and exists only for this.

import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { launchChrome } from "./lib/cdp.mjs";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? fallback : args[index + 1];
};

const FPS = Number.parseInt(flag("fps", "24"), 10);
const SECONDS = Number.parseFloat(flag("seconds", "12"));
const BASE = flag("url", "http://localhost:4000/en/styleguide/frame");
const SCENE = flag("scene", "chat-draft");
const THEME = flag("theme", "dark");
const OUT = flag("out", `public/scenes/${THEME}/${SCENE}.mp4`);
const MAX_BYTES = 1_048_576;
const MIN_LOOP_SSIM = 0.97;

// Loop closure only ever compared the two ends, so a hard cut in the middle of a film sailed
// through both gates. One was shipped: a sent message reverted to a draft in a single frame and
// jumped across the window, scoring 0.9418 between two adjacent frames. Text reflowing by a line
// is the noisiest legitimate step and measures about 0.962, so the floor sits between the two.
const MIN_STEP_SSIM = 0.95;
const WIDTH = 1280;
const HEIGHT = 920;
const FRAMES = Math.round(FPS * SECONDS);
const WORK = join("/tmp", `scene-capture-${process.pid}`);

// Structural similarity between two frames, read back out of ffmpeg's own filter.
async function ssim(a, b) {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", ["-v", "info", "-i", a, "-i", b, "-filter_complex", "ssim", "-f", "null", "-"], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let text = "";
    child.stderr.on("data", (chunk) => (text += chunk.toString()));
    child.on("error", reject);
    child.on("exit", () => {
      const match = text.match(/All:([0-9.]+)/u);
      resolve(match ? Number.parseFloat(match[1]) : 0);
    });
  });
}

// Every adjacent pair of frames in one ffmpeg pass: the same image sequence is opened twice, the
// second starting one frame later, so frame n is compared with frame n + 1 all the way through.
async function stepSimilarity(dir) {
  const statsPath = join(dir, "steps.txt");
  await run("ffmpeg", [
    "-y", "-v", "error",
    "-start_number", "0", "-i", join(dir, "frame-%05d.png"),
    "-start_number", "1", "-i", join(dir, "frame-%05d.png"),
    "-filter_complex", `ssim=stats_file=${statsPath}`,
    "-f", "null", "-",
  ]);

  const stats = await readFile(statsPath, "utf8");
  const steps = [];
  for (const line of stats.split("\n")) {
    const match = line.match(/n:(\d+).*All:([0-9.]+)/u);
    if (match) steps.push({ frame: Number.parseInt(match[1], 10) - 1, value: Number.parseFloat(match[2]) });
  }

  return steps.sort((a, b) => a.value - b.value);
}

function run(command, commandArgs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`))));
  });
}

// A screenshot is only trustworthy once two consecutive captures agree. Waiting a fixed
// number of animation frames is not enough: React has to commit and the compositor has to
// paint, and under load that occasionally takes longer than the wait. Capturing without
// this settle loop produced four differing frames out of twenty-four across two passes,
// which is exactly the non-determinism the --verify flag exists to catch.
async function settledScreenshot(browser, clip, attempts = 8) {
  await browser.eval("new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))");
  let previous = await browser.screenshot(clip);
  let previousHash = createHash("sha1").update(previous).digest("hex");

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await browser.eval("new Promise((r) => requestAnimationFrame(() => r(true)))");
    const next = await browser.screenshot(clip);
    const nextHash = createHash("sha1").update(next).digest("hex");
    if (nextHash === previousHash) return next;
    previous = next;
    previousHash = nextHash;
  }

  return previous;
}

async function capturePass(browser, dir, clip) {
  await mkdir(dir, { recursive: true });
  const hashes = [];

  for (let frame = 0; frame < FRAMES; frame += 1) {
    const t = frame / FRAMES;
    await browser.eval(`(() => { ${DROP_DEV_OVERLAY} window.setSceneFrame(${t}); return true; })()`);
    const png = await settledScreenshot(browser, clip);
    hashes.push(createHash("sha1").update(png).digest("hex"));
    await writeFile(join(dir, `frame-${String(frame).padStart(5, "0")}.png`), png);
  }

  return hashes;
}

// The dev server paints its own indicator into the corner of every page, and it lands inside
// the clip. It is not part of the product, it re-mounts on its own, and a frame that carries it
// is a frame we would have to retouch, so it is removed again before every single screenshot.
const DROP_DEV_OVERLAY = 'for (const node of document.querySelectorAll("nextjs-portal")) node.remove();';

// The viewport is deliberately taller than the frame we clip to. Chrome paints a clipped
// screenshot only where it has painted the page, and a clip that reaches the very bottom of an
// exactly-viewport-sized window came back with the last 43 rows blank: enough to slice the day
// labels off the dashboard chart in every single frame.
const browser = await launchChrome({ width: WIDTH, height: HEIGHT + 160, scale: 1 });

try {
  await browser.goto(`${BASE}?scene=${SCENE}&t=0`);
  await browser.eval(`(async () => {
    for (let i = 0; i < 200; i += 1) {
      if (window.sceneFrameReady) return true;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error("capture route never exposed setSceneFrame");
  })()`);

  await browser.eval(`(() => { ${DROP_DEV_OVERLAY} return true; })()`);

  await browser.eval("document.fonts.ready.then(() => true)");

  // Radix paints an avatar only once its image has loaded, so a film whose first frames were
  // captured before the photos decoded showed initials and then swapped to a face mid-loop.
  await browser.eval(`(async () => {
    await Promise.all([...document.images].map((image) => image.decode().catch(() => null)));
    return true;
  })()`);

  // Theme is a flag now: a film ships as a light/dark pair because an MP4 cannot follow CSS.
  await browser.eval(`(() => {
    localStorage.setItem("theme", ${JSON.stringify(THEME)});
    document.cookie = "theme=" + ${JSON.stringify(THEME)} + "; path=/; max-age=604800";
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(${JSON.stringify(THEME)});
    return true;
  })()`);

  // Clip to the scene itself. The capture route inherits the site layout, whose footer runs
  // a 25s infinite marquee; capturing the whole viewport pulled that animation into the
  // frames and made two passes disagree on four frames out of twenty-four. Clipping also
  // keeps navigation chrome out of a video that is meant to show only the product.
  const clip = await browser.eval(`(() => {
    const el = document.querySelector('[data-scene-capture]');
    const r = el.getBoundingClientRect();
    return { x: r.x + window.scrollX, y: r.y + window.scrollY, width: Math.round(r.width), height: Math.round(r.height) };
  })()`);
  console.log(`capturing ${FRAMES} frames, clipped to ${clip.width}x${clip.height}`);
  const first = await capturePass(browser, join(WORK, "pass-1"), clip);

  if (args.includes("--verify")) {
    console.log("second pass for determinism");
    const second = await capturePass(browser, join(WORK, "pass-2"), clip);
    const drift = first.filter((hash, index) => hash !== second[index]).length;
    console.log(drift === 0 ? "deterministic: both passes identical" : `NOT deterministic: ${drift} frames differ`);
    if (drift !== 0) process.exitCode = 1;
  }

  // Nothing reaches public/ until every gate below has passed. A film that fails the loop or
  // the weight budget used to be written anyway and only reported as an error, which left a
  // broken artifact on disk looking exactly like a good one.
  const staged = join(WORK, "staged.mp4");
  await run("ffmpeg", [
    "-y",
    "-framerate", String(FPS),
    "-i", join(WORK, "pass-1", "frame-%05d.png"),
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-preset", "slow",
    "-crf", "23",
    "-movflags", "+faststart",
    "-an",
    staged,
  ]);

  // A film has to arrive back where it started or the loop visibly jumps. The reference films
  // measure 0.87 to 0.9999 first-vs-last frame; anything below 0.97 reads as a cut.
  const closure = await ssim(join(WORK, "pass-1", "frame-00000.png"), join(WORK, "pass-1", `frame-${String(FRAMES - 1).padStart(5, "0")}.png`));
  console.log(`loop closure SSIM ${closure.toFixed(4)}`);

  const steps = await stepSimilarity(join(WORK, "pass-1"));
  const roughest = steps[0];
  console.log(
    `roughest step SSIM ${roughest ? roughest.value.toFixed(4) : "n/a"}` +
      (roughest ? ` at t ${(roughest.frame / FRAMES).toFixed(4)}` : ""),
  );

  const { size } = await stat(staged);
  console.log(`${(size / 1024).toFixed(0)} KB`);

  const failures = [];
  if (closure < MIN_LOOP_SSIM) failures.push(`NOT a clean loop: ${closure.toFixed(4)} is below ${MIN_LOOP_SSIM}`);
  for (const step of steps.filter((entry) => entry.value < MIN_STEP_SSIM)) {
    failures.push(
      `cuts mid-film: frames ${step.frame} to ${step.frame + 1} (t ${(step.frame / FRAMES).toFixed(4)}) score ${step.value.toFixed(4)}, below ${MIN_STEP_SSIM}`,
    );
  }
  if (size > MAX_BYTES) failures.push(`too heavy: ${(size / 1024).toFixed(0)} KB exceeds ${MAX_BYTES / 1024} KB`);

  if (failures.length) {
    for (const failure of failures) console.log(failure);
    console.log(`kept ${OUT} as it was`);
    process.exitCode = 1;
  } else {
    await mkdir(dirname(OUT), { recursive: true });
    await writeFile(OUT, await readFile(staged));

    // The poster is the film's own opening frame, so a video that has not loaded yet shows the
    // state it will return to rather than an empty box.
    await writeFile(OUT.replace(/\.mp4$/u, ".png"), await readFile(join(WORK, "pass-1", "frame-00000.png")));
    console.log(`wrote ${OUT}`);
  }
} finally {
  await browser.close();
  await rm(WORK, { recursive: true, force: true });
}
