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
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { launchChrome } from "./lib/cdp.mjs";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? fallback : args[index + 1];
};

const FPS = Number.parseInt(flag("fps", "30"), 10);
const SECONDS = Number.parseFloat(flag("seconds", "11"));
const BASE = flag("url", "http://localhost:4000/en/styleguide/frame");
const OUT = flag("out", "public/scenes/chat-draft.mp4");
const WIDTH = 1920;
const HEIGHT = 1080;
const FRAMES = Math.round(FPS * SECONDS);
const WORK = join("/tmp", `scene-capture-${process.pid}`);

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
    await browser.eval(`(() => { window.setSceneFrame(${t}); return true; })()`);
    const png = await settledScreenshot(browser, clip);
    hashes.push(createHash("sha1").update(png).digest("hex"));
    await writeFile(join(dir, `frame-${String(frame).padStart(5, "0")}.png`), png);
  }

  return hashes;
}

const browser = await launchChrome({ width: WIDTH, height: HEIGHT, scale: 1 });

try {
  await browser.goto(`${BASE}?t=0`);
  await browser.eval(`(async () => {
    for (let i = 0; i < 200; i += 1) {
      if (window.sceneFrameReady) return true;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error("capture route never exposed setSceneFrame");
  })()`);

  await browser.eval("document.fonts.ready.then(() => true)");

  // The scene is authored dark, matching the reference posters.
  await browser.eval(`(() => { document.documentElement.classList.remove("light"); document.documentElement.classList.add("dark"); return true; })()`);

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

  await mkdir("public/scenes", { recursive: true });
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
    OUT,
  ]);
  console.log(`wrote ${OUT}`);
} finally {
  await browser.close();
  await rm(WORK, { recursive: true, force: true });
}
