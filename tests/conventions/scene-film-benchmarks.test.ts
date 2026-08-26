import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MOTION_STORYBOARDS } from "@/app/[locale]/(static)/styleguide/components/motion-storyboards.data";
import { resolveSceneName, SCENE_NAMES } from "@/app/[locale]/(static)/styleguide/frame/scene-names";
import {
  AGENT_PIPELINE_FILM_CONTRACT,
  AgentPipelineFilm,
  agentPipelineFilmState,
} from "@/components/marketing/visuals/agent-pipeline-film";
import { AGENT_PIPELINE_FILM_COPY } from "@/components/marketing/visuals/agent-pipeline-film.copy";
import {
  DASHBOARD_INSIGHT_FILM_CONTRACT,
  DashboardInsightFilm,
  dashboardInsightFilmState,
} from "@/components/marketing/visuals/dashboard-insight-film";
import { DASHBOARD_INSIGHT_FILM_COPY } from "@/components/marketing/visuals/dashboard-insight-film.copy";
import {
  UNIFIED_INBOX_FILM_CONTRACT,
  UnifiedInboxFilm,
  unifiedInboxFilmState,
} from "@/components/marketing/visuals/unified-inbox-film";
import {
  SCENE_CAPTURE_CONTRACTS,
  captureContractViolations,
  transitionGateViolations,
} from "@/scripts/lib/scene-transition-gate.mjs";

import { REPO_ROOT } from "./walk";

const FILM_CASES = [
  {
    contract: AGENT_PIPELINE_FILM_CONTRACT,
    id: "agent-pipeline",
    sample(frame: number, frameCount: number) {
      const state = agentPipelineFilmState(frame / frameCount);
      return {
        actionProgress: state.actionProgress,
        compositionOpacity: state.compositionOpacity,
        connectorDistance: 1 - state.transitProgress,
        frame,
        openingState: state.showOpeningState ? 1 : 0,
        resetProgress: state.resetProgress,
        resolvedProgress: state.resolvedProgress,
        transitProgress: state.transitProgress,
      };
    },
    state: agentPipelineFilmState,
  },
  {
    contract: DASHBOARD_INSIGHT_FILM_CONTRACT,
    id: "dashboard-insight",
    sample(frame: number, frameCount: number) {
      const state = dashboardInsightFilmState(frame / frameCount);
      return {
        actionProgress: state.actionProgress,
        compositionOpacity: state.compositionOpacity,
        cursorOpacity: state.cursorOpacity,
        frame,
        openingState: state.showOpeningState ? 1 : 0,
        resetProgress: state.resetProgress,
        resolvedProgress: state.resolvedProgress,
        selectionProgress: state.selectionProgress,
      };
    },
    state: dashboardInsightFilmState,
  },
  {
    contract: UNIFIED_INBOX_FILM_CONTRACT,
    id: "unified-inbox",
    sample(frame: number, frameCount: number) {
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
    },
    state: unifiedInboxFilmState,
  },
] as const;

function smoothSteps(frameCount: number) {
  return Array.from({ length: frameCount - 1 }, (_, frame) => ({
    frame,
    value: 0.9999,
  }));
}

describe("deterministic storyboard film benchmarks", () => {
  it("registers all three contracted scene IDs and rejects an unknown or omitted scene", () => {
    for (const { id } of FILM_CASES) {
      expect(SCENE_NAMES).toContain(id);
      expect(resolveSceneName(id)).toBe(id);
    }

    expect(resolveSceneName("agent-pipline")).toBeNull();
    expect(resolveSceneName(undefined)).toBeNull();

    const framePage = readFileSync(
      join(REPO_ROOT, "app", "[locale]", "(static)", "styleguide", "frame", "page.tsx"),
      "utf8",
    );
    const frameDriver = readFileSync(
      join(REPO_ROOT, "app", "[locale]", "(static)", "styleguide", "frame", "frame-driver.tsx"),
      "utf8",
    );
    expect(framePage).toContain("if (!name) notFound()");
    expect(frameDriver).not.toContain("?? ChatDraftScene");
  });

  it("keeps source and capture contracts aligned", () => {
    for (const { contract: sourceContract, id } of FILM_CASES) {
      const captureContract = SCENE_CAPTURE_CONTRACTS[id];
      expect(captureContract).toBeDefined();
      expect(
        captureContractViolations({
          contract: captureContract,
          fps: sourceContract.fps,
          posterTime: sourceContract.posterTime,
          seconds: sourceContract.seconds,
        }),
      ).toEqual([]);
      expect({
        resolvedHold: {
          end: captureContract.resolvedHold.end,
          start: captureContract.resolvedHold.start,
        },
        transitionWindows: captureContract.transitionWindows.map(
          ({ end, id: windowId, minimumSimilarity, progressField, start }) => ({
            end,
            id: windowId,
            minSimilarity: minimumSimilarity,
            progressField,
            start,
          }),
        ),
      }).toEqual({
        resolvedHold: sourceContract.resolvedHold,
        transitionWindows: sourceContract.transitionWindows,
      });
    }
  });

  it("passes every template-specific progression and resolved-hold gate from pure sampled state", () => {
    for (const { id, sample } of FILM_CASES) {
      const contract = SCENE_CAPTURE_CONTRACTS[id];
      const frameCount = contract.duration.preferred * contract.allowedFps[0];
      const samples = Array.from({ length: frameCount }, (_, frame) => sample(frame, frameCount));

      expect(
        transitionGateViolations({
          contract,
          frameCount,
          samples,
          steps: smoothSteps(frameCount),
        }),
        id,
      ).toEqual([]);
    }
  });

  it("plants an accidental cut inside each declared action window and rejects it", () => {
    for (const { id, sample } of FILM_CASES) {
      const contract = SCENE_CAPTURE_CONTRACTS[id];
      const frameCount = contract.duration.preferred * contract.allowedFps[0];
      const samples = Array.from({ length: frameCount }, (_, frame) => sample(frame, frameCount));
      const actionWindow = contract.transitionWindows[0];
      const cutFrame = Math.floor(((actionWindow.start + actionWindow.end) / 2) * frameCount);
      const steps = smoothSteps(frameCount).map((step) =>
        step.frame === cutFrame ? { ...step, value: actionWindow.minimumSimilarity - 0.01 } : step,
      );

      expect(
        transitionGateViolations({ contract, frameCount, samples, steps }).some((violation) =>
          violation.includes("accidental cut"),
        ),
        id,
      ).toBe(true);
    }
  });

  it("is deterministic and closes each semantic loop without visibly reversing the action", () => {
    for (const { id, state } of FILM_CASES) {
      expect(state(0.412345)).toEqual(state(0.412345));

      const opening = state(0);
      const closing = state(0.999);
      expect(closing.compositionOpacity, id).toBe(opening.compositionOpacity);
      expect(closing.resolvedProgress, id).toBe(opening.resolvedProgress);
      expect(closing.resetProgress, id).toBe(1);
      expect(closing.showOpeningState, id).toBe(true);
    }
  });

  it("renders the exact approved storyboards as resolved, localized poster sources", () => {
    const inbox = renderToStaticMarkup(
      createElement(UnifiedInboxFilm, {
        brief: MOTION_STORYBOARDS[0],
        locale: "de",
        t: 0.56,
      }),
    );
    const pipeline = renderToStaticMarkup(
      createElement(AgentPipelineFilm, {
        brief: MOTION_STORYBOARDS[1],
        locale: "de",
        t: 0.56,
      }),
    );
    const dashboard = renderToStaticMarkup(
      createElement(DashboardInsightFilm, {
        brief: MOTION_STORYBOARDS[2],
        locale: "de",
        t: 0.56,
      }),
    );

    expect(inbox).toContain('data-scene-film="unified-inbox"');
    expect(inbox).toContain("Nächste Schritte für den Roche-Rollout");
    expect(pipeline).toContain('data-scene-film="agent-pipeline"');
    expect(pipeline).toContain(AGENT_PIPELINE_FILM_COPY.de.instruction);
    expect(pipeline).not.toContain("lucide-mouse-pointer");
    expect(dashboard).toContain('data-scene-film="dashboard-insight"');
    expect(dashboard).toContain(DASHBOARD_INSIGHT_FILM_COPY.de.widget);
    expect(dashboard).toContain("545.500");
    expect(dashboard).not.toContain('data-dashboard-cursor="causal-human"');
  });

  it("keeps capture outputs non-public, exact-scene checked, and state sampling generic", () => {
    const source = readFileSync(join(REPO_ROOT, "scripts", "capture-scene-video.mjs"), "utf8");

    expect(source).toContain("requires an explicit non-public --out path");
    expect(source).toContain("cannot write a contracted review film under public/");
    expect(source).toContain("key.startsWith('film')");
    expect(source).toContain("renderedScene !== SCENE");
    expect(source).not.toContain("filmArrivalProgress: Number");
  });
});
