import type { Root } from "react-dom/client";

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HomepageViewportVideo } from "../homepage-viewport-video";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let play: ReturnType<typeof vi.fn>;
let pause: ReturnType<typeof vi.fn>;

type Observer = { callback: IntersectionObserverCallback; target: Element | null };
const observers: Observer[] = [];

function render(props: Partial<Parameters<typeof HomepageViewportVideo>[0]> = {}) {
  act(() =>
    root.render(
      <HomepageViewportVideo
        ariaLabel="Product film"
        className="film"
        playLabel="Play the film"
        src="/film.mp4"
        {...props}
      />,
    ),
  );
}

function video() {
  return container.querySelector("video") as HTMLVideoElement;
}

function playButton() {
  return container.querySelector<HTMLButtonElement>("[data-film-play]");
}

function emit(name: string) {
  act(() => {
    video().dispatchEvent(new Event(name));
  });
}

function installBrowserApis(reducedMotion: boolean) {
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      private readonly entry: Observer;

      constructor(callback: IntersectionObserverCallback) {
        this.entry = { callback, target: null };
        observers.push(this.entry);
      }

      observe(target: Element) {
        this.entry.target = target;
      }

      disconnect() {
        this.entry.target = null;
      }

      unobserve() {}

      takeRecords() {
        return [];
      }
    },
  );
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: reducedMotion && query.includes("prefers-reduced-motion"),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

function scrollIntoView() {
  const [observer] = observers;
  act(() => {
    observer.callback(
      [{ isIntersecting: true, intersectionRatio: 1, target: observer.target } as unknown as IntersectionObserverEntry],
      observer as unknown as IntersectionObserver,
    );
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  observers.length = 0;
  play = vi.fn(() => Promise.resolve());
  pause = vi.fn();
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(play as never);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(pause as never);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("homepage film placeholder", () => {
  it("keeps the video transparent without native controls and offers a play button until a frame exists", () => {
    render();

    expect(video().hasAttribute("data-film-ready")).toBe(false);
    expect(video().controls).toBe(false);
    expect(video().getAttribute("aria-hidden")).toBe("true");
    expect(video().className).toContain("opacity-0");
    expect(video().className).not.toContain("opacity-100");
    expect(video().className).toContain("film");
    expect(video().getAttribute("preload")).toBe("none");
    const button = playButton();
    expect(button?.getAttribute("aria-label")).toBe("Play the film");
    expect(button?.getAttribute("type")).toBe("button");
  });

  it("unmutes and plays from the button", () => {
    render();

    act(() => playButton()?.click());

    expect(video().muted).toBe(false);
    expect(play).toHaveBeenCalledOnce();
  });

  it.each(["loadeddata", "playing"])("shows the film, hides the button and adds controls on %s", (name) => {
    render();

    emit(name);

    expect(video().hasAttribute("data-film-ready")).toBe(true);
    expect(video().controls).toBe(true);
    expect(video().getAttribute("aria-hidden")).toBe("false");
    expect(video().className).toContain("opacity-100");
    expect(video().className).not.toContain("opacity-0");
    expect(playButton()).toBeNull();
  });

  it("stays ready once a frame exists, also after a pause or the end of the film", () => {
    render();
    emit("loadeddata");

    emit("pause");
    emit("ended");

    expect(video().hasAttribute("data-film-ready")).toBe(true);
    expect(playButton()).toBeNull();
  });

  it("starts muted when it is mostly in view and the visitor accepts motion", () => {
    installBrowserApis(false);
    render();

    scrollIntoView();
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(play).toHaveBeenCalledOnce();
    expect(video().muted).toBe(true);
    expect(video().hasAttribute("data-film-ready")).toBe(false);
    expect(playButton()).not.toBeNull();
    emit("playing");
    expect(video().hasAttribute("data-film-ready")).toBe(true);
    expect(playButton()).toBeNull();
  });

  it("never starts by itself under reduced motion, and the button still starts it", () => {
    installBrowserApis(true);
    render();

    scrollIntoView();
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(play).not.toHaveBeenCalled();
    expect(video().hasAttribute("data-film-ready")).toBe(false);
    act(() => playButton()?.click());
    expect(play).toHaveBeenCalledOnce();
    expect(video().muted).toBe(false);
  });
});
