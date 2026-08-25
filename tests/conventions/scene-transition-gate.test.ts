import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  SCENE_CAPTURE_CONTRACTS,
  captureContractViolations,
  transitionGateViolations,
} from "@/scripts/lib/scene-transition-gate.mjs";
import {
  UNIFIED_INBOX_FILM_CONTRACT,
  unifiedInboxFilmState,
} from "@/components/marketing/visuals/unified-inbox-film";
import { UNIFIED_INBOX_FILM_COPY } from "@/components/marketing/visuals/unified-inbox-film.copy";

import { REPO_ROOT } from "./walk";

const FRAME_COUNT = 100;
const TEST_CONTRACT = {
  transitionWindows: [
    {
      distanceField: "connectorDistance",
      end: 0.4,
      id: "smooth-draw",
      maximumProgressStep: 0.2,
      minimumSimilarity: 0.85,
      progressField: "progress",
      start: 0.2,
      terminalDistance: 0.01,
    },
  ],
};

function smoothSamples() {
  return Array.from({ length: FRAME_COUNT }, (_, frame) => {
    const progress = Math.min(
      Math.max((frame / FRAME_COUNT - 0.2) / 0.2, 0),
      1,
    );
    return { connectorDistance: 1 - progress, frame, progress };
  });
}

function smoothSteps() {
  return Array.from({ length: FRAME_COUNT - 1 }, (_, frame) => ({
    frame,
    value:
      frame >= 27 && frame <= 33 ? 0.89 + Math.abs(frame - 30) * 0.01 : 0.99,
  }));
}

describe("declared scene transition gate", () => {
  it("accepts a smooth declared transition even when intentional movement drops below 0.95 SSIM", () => {
    expect(
      transitionGateViolations({
        contract: TEST_CONTRACT,
        frameCount: FRAME_COUNT,
        samples: smoothSamples(),
        steps: smoothSteps(),
      }),
    ).toEqual([]);
  });

  it("rejects the historical-style 0.9418 cut when the declared subject jumps in one frame", () => {
    const samples = smoothSamples().map((sample) => ({
      ...sample,
      connectorDistance: sample.frame < 30 ? 1 : 0,
      progress: sample.frame < 30 ? 0 : 1,
    }));
    const steps = smoothSteps().map((step) =>
      step.frame === 29 ? { ...step, value: 0.9418 } : step,
    );

    expect(
      transitionGateViolations({
        contract: TEST_CONTRACT,
        frameCount: FRAME_COUNT,
        samples,
        steps,
      }).some((violation) => violation.includes("jumps")),
    ).toBe(true);
  });

  it("rejects an accidental visual cut even when progression metadata stays smooth", () => {
    const steps = smoothSteps().map((step) =>
      step.frame === 30 ? { ...step, value: 0.8 } : step,
    );

    expect(
      transitionGateViolations({
        contract: TEST_CONTRACT,
        frameCount: FRAME_COUNT,
        samples: smoothSamples(),
        steps,
      }).some((violation) => violation.includes("accidental cut")),
    ).toBe(true);
  });

  it("keeps the 0.95 adjacent-frame floor outside declared windows", () => {
    const steps = smoothSteps().map((step) =>
      step.frame === 70 ? { ...step, value: 0.9499 } : step,
    );

    expect(
      transitionGateViolations({
        contract: TEST_CONTRACT,
        frameCount: FRAME_COUNT,
        samples: smoothSamples(),
        steps,
      }).some((violation) => violation.includes("outside transition windows")),
    ).toBe(true);
  });
});

describe("Unified inbox replacement film contract", () => {
  it("uses the story-led duration, frame rate, resolved poster, and minimum hold", () => {
    const contract = SCENE_CAPTURE_CONTRACTS["unified-inbox"];

    expect(
      captureContractViolations({ contract, fps: 24, seconds: 10 }),
    ).toEqual([]);
    expect(UNIFIED_INBOX_FILM_CONTRACT).toMatchObject({
      fps: 24,
      posterTime: 0.56,
      seconds: 10,
    });
    expect(
      (UNIFIED_INBOX_FILM_CONTRACT.resolvedHold.end -
        UNIFIED_INBOX_FILM_CONTRACT.resolvedHold.start) *
        UNIFIED_INBOX_FILM_CONTRACT.seconds,
    ).toBeGreaterThanOrEqual(1.5);
    expect(UNIFIED_INBOX_FILM_CONTRACT.posterTime).toBeGreaterThanOrEqual(
      UNIFIED_INBOX_FILM_CONTRACT.resolvedHold.start,
    );
    expect(UNIFIED_INBOX_FILM_CONTRACT.posterTime).toBeLessThanOrEqual(
      UNIFIED_INBOX_FILM_CONTRACT.resolvedHold.end,
    );
    expect(
      captureContractViolations({
        contract,
        fps: 24,
        posterTime: 0,
        seconds: 10,
      }),
    ).toContain("poster time must sit inside the declared resolved hold");
    expect({
      resolvedHold: {
        end: contract.resolvedHold.end,
        start: contract.resolvedHold.start,
      },
      transitionWindows: contract.transitionWindows.map(
        ({ end, id, minimumSimilarity, progressField, start }) => ({
          end,
          id,
          minSimilarity: minimumSimilarity,
          progressField,
          start,
        }),
      ),
    }).toEqual({
      resolvedHold: UNIFIED_INBOX_FILM_CONTRACT.resolvedHold,
      transitionWindows: UNIFIED_INBOX_FILM_CONTRACT.transitionWindows,
    });
  });

  it("proves the rendered hold and invisible semantic reset from sampled state", () => {
    const contract = SCENE_CAPTURE_CONTRACTS["unified-inbox"];
    const frameCount = 240;
    const samples = Array.from({ length: frameCount }, (_, frame) => {
      const state = unifiedInboxFilmState(frame / frameCount);
      return {
        arrivalProgress: state.arrivalProgress,
        compositionOpacity: state.compositionOpacity,
        connectorDistance: 1 - state.arrivalProgress,
        frame,
        openingState: state.showOpeningState ? 1 : 0,
        resetProgress: state.resetProgress,
        resolvedProgress: state.resolvedProgress,
        threadProgress: state.threadProgress,
      };
    });
    const steps = Array.from({ length: frameCount - 1 }, (_, frame) => ({
      frame,
      value: 0.9999,
    }));

    expect(
      transitionGateViolations({ contract, frameCount, samples, steps }),
    ).toEqual([]);

    const visibleSwap = samples.map((sample) =>
      sample.openingState === 1 && sample.compositionOpacity < 0.03
        ? { ...sample, compositionOpacity: 0.5 }
        : sample,
    );
    expect(
      transitionGateViolations({
        contract,
        frameCount,
        samples: visibleSwap,
        steps,
      }).some((violation) => violation.includes("visibly opaque")),
    ).toBe(true);

    const falseHold = samples.map((sample) =>
      sample.frame === 100 ? { ...sample, resolvedProgress: 0.5 } : sample,
    );
    expect(
      transitionGateViolations({
        contract,
        frameCount,
        samples: falseHold,
        steps,
      }).some((violation) => violation.includes("resolvedProgress")),
    ).toBe(true);
  });

  it("returns to the opening visual state without visibly reversing the relationship", () => {
    const opening = unifiedInboxFilmState(0);
    const closing = unifiedInboxFilmState(0.999);

    expect({
      arrivalProgress: closing.arrivalProgress,
      compositionOpacity: closing.compositionOpacity,
      resolvedProgress: closing.resolvedProgress,
      threadProgress: closing.threadProgress,
    }).toEqual({
      arrivalProgress: opening.arrivalProgress,
      compositionOpacity: opening.compositionOpacity,
      resolvedProgress: opening.resolvedProgress,
      threadProgress: opening.threadProgress,
    });
  });

  it("uses the approved native identities, German copy, and no cursor", () => {
    const source = readFileSync(
      join(
        REPO_ROOT,
        "components",
        "marketing",
        "visuals",
        "unified-inbox-film.tsx",
      ),
      "utf8",
    );

    expect(source).toContain("ProviderMark");
    expect(source).toContain("PersonAvatar");
    expect(UNIFIED_INBOX_FILM_COPY.de).toMatchObject({
      contactDetail: "Programmmanagerin bei Roche",
      threadSubject: "Nächste Schritte für den Roche-Rollout",
    });
    expect(source).not.toMatch(/MousePointer|SceneCursor|cursor:/u);
  });

  it("forces determinism and a non-public explicit output for contracted films", () => {
    const source = readFileSync(
      join(REPO_ROOT, "scripts", "capture-scene-video.mjs"),
      "utf8",
    );

    expect(source).toContain(
      'const VERIFY = args.includes("--verify") || Boolean(CONTRACT);',
    );
    expect(source).toContain("requires an explicit non-public --out path");
    expect(source).toContain(
      "cannot write a contracted review film under public/",
    );
  });
});
