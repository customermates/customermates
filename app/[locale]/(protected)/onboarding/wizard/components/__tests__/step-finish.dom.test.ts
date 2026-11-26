import type { Root } from "react-dom/client";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({ rootStore: null as unknown }));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/core/stores/root-store.provider", () => ({ useRootStore: () => harness.rootStore }));
vi.mock("@/core/errors/report-application-error", () => ({
  runUserAction: (action: () => unknown) => void action(),
  reportApplicationError: vi.fn(),
}));

import { StepFinish } from "../step-finish";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("StepFinish", () => {
  it("completes the onboarding on its own and offers a manual retry", async () => {
    const complete = vi.fn().mockResolvedValue(undefined);
    harness.rootStore = { onboardingWizardStore: { complete, isSubmitting: false } };

    await act(async () => {
      root.render(createElement(StepFinish));
      await Promise.resolve();
    });

    expect(complete).toHaveBeenCalledTimes(1);
    act(() => container.querySelector<HTMLButtonElement>("button")?.click());
    expect(complete).toHaveBeenCalledTimes(2);
  });
});
