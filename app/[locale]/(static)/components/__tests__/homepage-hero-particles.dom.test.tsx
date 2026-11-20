import type { Root } from "react-dom/client";

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const engine = vi.hoisted(() => ({ start: vi.fn(), stop: vi.fn() }));

vi.mock("../homepage-hero-particles-engine", () => ({
  startHeroParticles: (canvas: HTMLCanvasElement) => {
    engine.start(canvas);
    return engine.stop;
  },
}));

import { HomepageHeroParticles, PARTICLES_IDLE_FALLBACK_MS } from "../homepage-hero-particles";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let readyState: DocumentReadyState;

async function flush() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(PARTICLES_IDLE_FALLBACK_MS);
    await vi.dynamicImportSettled();
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  engine.start.mockClear();
  engine.stop.mockClear();
  readyState = "complete";
  Object.defineProperty(document, "readyState", { configurable: true, get: () => readyState });
  Object.defineProperty(window, "requestIdleCallback", { configurable: true, value: undefined });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  Reflect.deleteProperty(document, "readyState");
  Reflect.deleteProperty(window, "requestIdleCallback");
  vi.useRealTimers();
});

describe("HomepageHeroParticles", () => {
  it("renders an empty decorative canvas on first paint and starts the engine only when the browser is idle", async () => {
    act(() => root.render(<HomepageHeroParticles className="size-full" />));
    const canvas = container.querySelector("canvas");

    expect(canvas?.getAttribute("aria-hidden")).toBe("true");
    expect(engine.start).not.toHaveBeenCalled();

    await flush();

    expect(engine.start).toHaveBeenCalledWith(canvas);
  });

  it("waits for the load event while the page is still loading", async () => {
    readyState = "loading";
    act(() => root.render(<HomepageHeroParticles />));

    await flush();
    expect(engine.start).not.toHaveBeenCalled();

    window.dispatchEvent(new Event("load"));
    await flush();
    expect(engine.start).toHaveBeenCalledTimes(1);
  });

  it("stops the animation when the hero unmounts", async () => {
    act(() => root.render(<HomepageHeroParticles />));
    await flush();

    act(() => root.unmount());
    root = createRoot(container);

    expect(engine.stop).toHaveBeenCalledTimes(1);
  });
});
