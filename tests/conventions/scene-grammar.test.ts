import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { REPO_ROOT } from "./walk";

import { ChatDraftScene } from "@/components/marketing/scenes/chat-draft-scene";
import { DashboardScene } from "@/components/marketing/scenes/dashboard-scene";
import { PipelineScene } from "@/components/marketing/scenes/pipeline-scene";
import {
  SCENE_MIN_RESOLVED_HOLD_MS,
  SCENE_TYPING_CHARS_PER_SECOND,
} from "@/components/marketing/scenes/scene-grammar";


const SCENES_DIR = join(REPO_ROOT, "components", "marketing", "scenes");

const GRAMMAR = "scene-grammar.tsx";

const TYPING_CHARS_PER_SECOND = SCENE_TYPING_CHARS_PER_SECOND;

const MIN_RESOLVED_HOLD_MS = SCENE_MIN_RESOLVED_HOLD_MS;

function sceneFiles(): string[] {
  return readdirSync(SCENES_DIR).filter((file) => file.endsWith(".tsx") && file !== GRAMMAR);
}

function read(file: string): string {
  return readFileSync(join(SCENES_DIR, file), "utf8");
}

function parseBeats(source: string): Record<string, [number, number]> {
  const block = source.match(/_BEATS\s*=\s*\{([\s\S]*?)\}\s*as const/u);
  if (!block) return {};

  const beats: Record<string, [number, number]> = {};
  for (const match of block[1].matchAll(/(\w+)\s*:\s*\[\s*([\d.]+)\s*,\s*([\d.]+)\s*\]/gu)) {
    beats[match[1]] = [Number.parseFloat(match[2]), Number.parseFloat(match[3])];
  }
  return beats;
}

function parseDuration(source: string): number | null {
  const match = source.match(/_DURATION_MS\s*=\s*([\d_]+)/u);
  return match ? Number.parseInt(match[1].replaceAll("_", ""), 10) : null;
}

const FILMED = {
  "chat-draft-scene.tsx": ChatDraftScene,
  "dashboard-scene.tsx": DashboardScene,
  "pipeline-scene.tsx": PipelineScene,
} as const;

const LAST_FRAME = 1 - 1 / 288;

function withoutPointerPosition(markup: string): string {
  return markup.replaceAll(/left:[\d.]+%;top:[\d.]+%/gu, "left:*;top:*");
}

function parseStreamedText(source: string): { beat: string; text: string } | null {
  const call = source.match(/sceneStream\(\s*(\w+)\s*,\s*\w+\s*,\s*\w+_BEATS\.(\w+)\s*\)/u);
  if (!call) return null;

  const literal = source.match(new RegExp(`const ${call[1]}\\s*=\\s*"([^"]*)"`, "u"));
  return literal ? { beat: call[2], text: literal[1] } : null;
}

describe("scene grammar", () => {
  const files = sceneFiles();

  it("ships scenes to govern", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("composes every scene from the shared frame rather than hand-rolled chrome", () => {
    const offenders = files.filter((file) => {
      const source = read(file);
      if (!/\breturn\s*\(?\s*<Scene/u.test(source) && !source.includes("<SceneFrame")) return false;
      return !source.includes("SceneFrame");
    });

    expect(
      offenders,
      "a scene must import SceneFrame from ./scene-grammar so ground, crop and radius cannot drift per scene",
    ).toEqual([]);
  });

  it("keeps every beat map ordered and inside the normalised clock", () => {
    const problems: string[] = [];

    for (const file of files) {
      const beats = Object.entries(parseBeats(read(file)));
      for (const [name, [from, to]] of beats) {
        if (from < 0 || to > 1) problems.push(`${file}: ${name} leaves 0..1 (${from}..${to})`);
        if (to <= from) problems.push(`${file}: ${name} does not advance (${from}..${to})`);
      }
    }

    expect(problems).toEqual([]);
  });

  it("types inside the 18 to 32 characters per second bound", () => {
    const problems: string[] = [];

    for (const file of files) {
      const source = read(file);
      const duration = parseDuration(source);
      const streamed = parseStreamedText(source);
      const beats = parseBeats(source);
      if (!duration || !streamed || !beats[streamed.beat]) continue;

      const [from, to] = beats[streamed.beat];
      const seconds = ((to - from) * duration) / 1000;
      const rate = streamed.text.length / seconds;

      if (rate < TYPING_CHARS_PER_SECOND.min || rate > TYPING_CHARS_PER_SECOND.max) {
        problems.push(`${file}: ${rate.toFixed(1)} chars/s over beat ${streamed.beat}`);
      }
    }

    expect(problems, "typing that outruns reading is decoration, not explanation").toEqual([]);
  });

  it("films every scene that drives a cursor", () => {
    const filmed = files.filter((file) => read(file).includes("CURSOR_PATH"));

    expect(
      filmed.filter((file) => !(file in FILMED)),
      "a scene with a cursor path is a film, and every film is held to the loop rule below",
    ).toEqual([]);
  });

  it("returns every film to its opening frame so the loop cannot jump", () => {
    const problems: string[] = [];

    for (const [file, Scene] of Object.entries(FILMED)) {
      const opening = withoutPointerPosition(renderToStaticMarkup(createElement(Scene, { film: true, t: 0 })));
      const closing = withoutPointerPosition(
        renderToStaticMarkup(createElement(Scene, { film: true, t: LAST_FRAME })),
      );
      if (opening !== closing) problems.push(file);
    }

    expect(
      problems,
      "the last frame has to render what the first frame renders, or the loop reads as a cut",
    ).toEqual([]);
  });

  it("holds the resolved state long enough to be read", () => {
    const problems: string[] = [];

    for (const file of files) {
      const source = read(file);
      const duration = parseDuration(source);
      const streamed = parseStreamedText(source);
      const beats = parseBeats(source);
      if (!duration || !streamed || !beats[streamed.beat]) continue;

      const typingEnd = beats[streamed.beat][1];
      const next = Object.values(beats)
        .map(([from]) => from)
        .filter((from) => from > typingEnd + 1e-6)
        .sort((a, b) => a - b)[0];
      if (next === undefined) continue;

      const holdMs = (next - typingEnd) * duration;
      if (holdMs < MIN_RESOLVED_HOLD_MS) {
        problems.push(`${file}: holds ${Math.round(holdMs)}ms after typing, needs ${MIN_RESOLVED_HOLD_MS}ms`);
      }
    }

    expect(problems).toEqual([]);
  });
});
