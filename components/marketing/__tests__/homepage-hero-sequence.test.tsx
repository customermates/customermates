import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

const motionState = vi.hoisted(() => ({ shouldAnimate: true, shouldReduceMotion: false }));
vi.mock("@/app/[locale]/(static)/components/homepage-motion", () => ({
  useHomepageMotion: () => ({ ref: { current: null }, ...motionState }),
}));
vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => children,
  motion: { div: ({ children }: { children: ReactNode }) => createElement("div", null, children) },
}));
vi.mock("@/components/chip/app-chip", () => ({
  AppChip: ({ children }: { children: ReactNode }) => createElement("span", null, children),
}));
import { HomepageHeroVisual } from "@/app/[locale]/(static)/components/homepage-hero-visual";

const copy = {
  label: "Workflow",
  prompt: "Prepare a follow-up",
  context: "Context checked",
  draft: "Hi Leon",
  ready: "Ready",
  channels: "Channels",
  working: "Working",
  replay: "Replay",
  response: "Draft for",
  draftLabel: "Message draft",
  steps: ["LinkedIn", "WhatsApp", "Email", "Draft"].map((name) => ({
    running: `Reading ${name}`,
    done: `Checked ${name}`,
  })),
};
let root: ReturnType<typeof createRoot>;
afterEach(() => {
  act(() => root?.unmount());
  document.body.replaceChildren();
  vi.useRealTimers();
  motionState.shouldReduceMotion = false;
  motionState.shouldAnimate = true;
});
function render() {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root.render(createElement(HomepageHeroVisual, { copy })));
  return host;
}
function visibleSteps(host: HTMLElement) {
  return Array.from(host.querySelectorAll('ol li[aria-hidden="false"] span[aria-hidden="false"]')).map(
    (step) => step.textContent,
  );
}
it("checks each provider, creates a draft, keeps activity visible, and supports replay", () => {
  vi.useFakeTimers();
  const host = render();
  expect(host.querySelector("[data-hero-response]")?.getAttribute("aria-hidden")).toBe("true");
  act(() => {
    vi.advanceTimersByTime(800);
  });
  expect(visibleSteps(host)).toEqual(["Reading LinkedIn"]);
  act(() => {
    vi.advanceTimersByTime(1100);
  });
  expect(visibleSteps(host)).toEqual(["Checked LinkedIn", "Reading WhatsApp"]);
  act(() => {
    vi.advanceTimersByTime(1100);
  });
  expect(visibleSteps(host)).toEqual(["Checked LinkedIn", "Checked WhatsApp", "Reading Email"]);
  act(() => {
    vi.advanceTimersByTime(1100);
  });
  expect(visibleSteps(host)).toEqual(["Checked LinkedIn", "Checked WhatsApp", "Checked Email", "Reading Draft"]);
  act(() => {
    vi.advanceTimersByTime(1100);
  });
  expect(visibleSteps(host)).toEqual(["Checked LinkedIn", "Checked WhatsApp", "Checked Email", "Checked Draft"]);
  act(() => {
    vi.advanceTimersByTime(500);
  });
  expect(host.querySelector("ol")).not.toBeNull();
  expect(host.querySelector("[data-hero-response]")?.getAttribute("aria-hidden")).toBe("false");
  expect(host.textContent).toContain("Hi Leon");
  act(() => host.querySelector<HTMLButtonElement>('button[aria-label="Replay"]')?.click());
  expect(host.querySelector("[data-hero-response]")?.getAttribute("aria-hidden")).toBe("true");
});
it("shows the completed draft immediately with reduced motion", () => {
  motionState.shouldReduceMotion = true;
  motionState.shouldAnimate = false;
  const host = render();
  expect(host.querySelector("[data-hero-response]")?.getAttribute("aria-hidden")).toBe("false");
  expect(host.textContent).toContain("Hi Leon");
  expect(host.querySelector("ol")).not.toBeNull();
  expect(host.querySelector('button[aria-label="Replay"]')).toBeNull();
});
