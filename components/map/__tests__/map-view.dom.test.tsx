import type { ReactNode } from "react";
import type { Root } from "react-dom/client";
import type { MapViewPoint, MapViewProps } from "../map-view";

import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ChartColor } from "@/features/widget/widget-display.schema";

import { FIT_MAX_ZOOM, FIT_PADDING, MAX_ZOOM, fitCamera, project, worldBoundsOf } from "../map-geometry";
import { PIN_RADIUS_DEFAULT } from "../map-markers";

import { REGION_FIXTURE, WORLD_FIXTURE, jsonResponse } from "./basemap-fixture";

const WIDTH = 800;
const HEIGHT = 400;

const labels: MapViewProps["labels"] = {
  zoomIn: "Zoom in",
  zoomOut: "Zoom out",
  reset: "Reset view",
  loading: "Loading map",
  failed: "Map failed, retry",
  attribution: "Natural Earth",
  cluster: (count) => `${count} records`,
  point: (id) => `Record ${id}`,
};

function point(id: string, lat: number, lon: number, group: string | null = null): MapViewPoint {
  return { id, lat, lon, group, color: ChartColor.primary1, weight: null };
}

const munich = [point("m1", 48.137, 11.575, "a"), point("m2", 48.155, 11.6, "a"), point("m3", 48.12, 11.55, "b")];
const berlin = point("berlin", 52.52, 13.405);

let MapView: (props: MapViewProps) => ReactNode;
let host: HTMLDivElement;
let root: Root;

function Harness({ points, onSelect }: { points: MapViewPoint[]; onSelect?: (id: string | null) => void }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  return (
    <MapView
      label="Records map"
      labels={labels}
      language="en"
      points={points}
      renderPopover={(id) => <p>Details {id}</p>}
      selectedId={selectedId}
      onSelect={(id) => {
        onSelect?.(id);
        setSelectedId(id);
      }}
    />
  );
}

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function render(points: MapViewPoint[], onSelect?: (id: string | null) => void) {
  act(() => root.render(<Harness points={points} onSelect={onSelect} />));
  await flush();
}

function viewport() {
  const element = host.querySelector<HTMLElement>("[data-map-viewport]");
  if (!element) throw new Error("expected the map viewport");
  return element;
}

function zoom() {
  return Number(viewport().dataset.zoom);
}

function markers(kind: "pin" | "cluster") {
  return [...host.querySelectorAll<HTMLButtonElement>(`[data-map-marker="${kind}"]`)];
}

function pin(id: string) {
  const element = host.querySelector<HTMLButtonElement>(`[data-point-id="${id}"]`);
  if (!element) throw new Error(`expected the pin ${id}`);
  return element;
}

function center(element: HTMLElement) {
  const match = /translate3d\(([-\d.e]+)px, ([-\d.e]+)px, 0\)/.exec(element.style.transform);
  if (!match) throw new Error(`unexpected transform ${element.style.transform}`);
  const half = Number.parseFloat(element.style.width) / 2;
  return { x: Number(match[1]) + half, y: Number(match[2]) + half };
}

function press(target: Element, key: string) {
  act(() => {
    target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  });
}

function dialog() {
  return document.querySelector<HTMLElement>('[role="dialog"]');
}

beforeEach(async () => {
  Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "ResizeObserver",
    vi.fn(function () {
      return { observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn() };
    }),
  );
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("reduced-motion"),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => Promise.resolve(jsonResponse(url.endsWith("world.json") ? WORLD_FIXTURE : REGION_FIXTURE))),
  );
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    return this.hasAttribute("data-map-viewport") ? new DOMRect(0, 0, WIDTH, HEIGHT) : new DOMRect(0, 0, 0, 0);
  });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockImplementation(
    () => [new DOMRect(0, 0, 10, 10)] as unknown as DOMRectList,
  );
  vi.resetModules();
  MapView = (await import("../map-view")).default;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("MapView markers", () => {
  it("renders single pins and clusters with their counts", async () => {
    await render([...munich, berlin]);
    expect(markers("cluster").map((cluster) => [cluster.textContent, cluster.getAttribute("aria-label")])).toEqual([
      ["3", "3 records"],
    ]);
    expect(markers("pin").map((element) => element.getAttribute("aria-label"))).toEqual(["Record berlin"]);
    expect(viewport().getAttribute("aria-label")).toBe("Records map");
    expect(host.textContent).toContain("Natural Earth");
  });

  it("zooms to the expansion zoom of an activated cluster, centred on it", async () => {
    await render([...munich, berlin]);
    const before = zoom();
    const [cluster] = markers("cluster");
    if (!cluster) throw new Error("expected a cluster");
    act(() => cluster.click());
    expect(zoom()).toBeGreaterThan(before);
    expect(Number.isInteger(zoom())).toBe(true);
    expect(document.activeElement).toBe(viewport());
    expect(new Set(markers("pin").map((element) => element.dataset.pointId))).toEqual(new Set(["m1", "m2", "m3"]));
    const centres = ["m1", "m2", "m3"].map((id) => center(pin(id)));
    const mean = centres.reduce((sum, { x, y }) => ({ x: sum.x + x / 3, y: sum.y + y / 3 }), { x: 0, y: 0 });
    expect(Math.abs(mean.x - WIDTH / 2)).toBeLessThan(WIDTH / 4);
    expect(Math.abs(mean.y - HEIGHT / 2)).toBeLessThan(HEIGHT / 4);
  });

  it("spreads points that share a location when their cluster cannot expand", async () => {
    await render([point("s1", 49.487, 8.466), point("s2", 49.487, 8.466), point("s3", 49.487, 8.466)]);
    const [cluster] = markers("cluster");
    if (!cluster) throw new Error("expected a cluster");
    act(() => cluster.click());
    expect(zoom()).toBeLessThanOrEqual(MAX_ZOOM);
    expect(markers("cluster")).toHaveLength(0);
    expect(markers("pin")).toHaveLength(3);
    expect(document.activeElement?.getAttribute("data-map-marker")).toBe("pin");
    expect(new Set(markers("pin").map((element) => element.style.transform)).size).toBe(3);
    press(markers("pin")[0] as HTMLElement, "Escape");
    expect(markers("cluster").map((element) => element.textContent)).toEqual(["3"]);
    expect(document.activeElement).toBe(viewport());
  });
});

describe("MapView popover", () => {
  it("opens on click, closes on Escape and returns focus to the pin", async () => {
    const onSelect = vi.fn();
    await render([...munich, berlin], onSelect);
    act(() => pin("berlin").click());
    expect(onSelect).toHaveBeenLastCalledWith("berlin");
    expect(dialog()?.getAttribute("aria-label")).toBe("Record berlin");
    expect(dialog()?.textContent).toContain("Details berlin");
    expect(pin("berlin").getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(dialog());
    press(dialog() as HTMLElement, "Escape");
    await flush();
    expect(onSelect).toHaveBeenLastCalledWith(null);
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(pin("berlin"));
  });

  it("opens from the keyboard with Enter on a focused pin", async () => {
    await render([...munich, berlin]);
    act(() => pin("berlin").focus());
    press(pin("berlin"), "Enter");
    expect(dialog()?.textContent).toContain("Details berlin");
  });

  it("moves the popover to another pin and closes it on a tap on the map", async () => {
    const onSelect = vi.fn();
    await render([point("a", 52.52, 13.405), point("b", 48.137, 11.575)], onSelect);
    act(() => pin("a").click());
    act(() => pin("b").click());
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    expect(dialog()?.textContent).toContain("Details b");
    const canvas = viewport().querySelector("canvas");
    if (!canvas) throw new Error("expected the canvas");
    act(() => {
      canvas.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientX: 30, clientY: 300 }));
      canvas.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, clientX: 30, clientY: 300 }));
    });
    await flush();
    expect(onSelect).toHaveBeenLastCalledWith(null);
    expect(dialog()).toBeNull();
  });
});

describe("MapView camera", () => {
  it("fits a single point at the city-level cap", async () => {
    await render([berlin]);
    expect(zoom()).toBe(FIT_MAX_ZOOM);
    expect(center(pin("berlin"))).toEqual({ x: WIDTH / 2, y: HEIGHT / 2 });
    expect(pin("berlin").style.width).toBe(`${PIN_RADIUS_DEFAULT * 2}px`);
  });

  it("fits several points inside the padded view", async () => {
    const points = [
      point("koeln", 50.938, 6.96),
      point("wien", 48.208, 16.373),
      point("zuerich", 47.377, 8.541),
      point("hamburg", 53.551, 9.993),
    ];
    await render(points);
    const bounds = worldBoundsOf(points.map(({ lon, lat }) => project(lon, lat)));
    if (!bounds) throw new Error("expected bounds");
    expect(zoom()).toBeCloseTo(fitCamera(bounds, { width: WIDTH, height: HEIGHT }).zoom, 3);
    for (const id of ["koeln", "wien", "zuerich", "hamburg"]) {
      const { x, y } = center(pin(id));
      expect(x).toBeGreaterThanOrEqual(FIT_PADDING - 0.01);
      expect(x).toBeLessThanOrEqual(WIDTH - FIT_PADDING + 0.01);
      expect(y).toBeGreaterThanOrEqual(FIT_PADDING - 0.01);
      expect(y).toBeLessThanOrEqual(HEIGHT - FIT_PADDING + 0.01);
    }
  });

  it("zooms, pans and resets from the keyboard", async () => {
    await render([...munich, berlin]);
    const start = zoom();
    const before = center(pin("berlin"));
    act(() => viewport().focus());
    press(viewport(), "+");
    expect(zoom()).toBeCloseTo(start + 1, 3);
    press(viewport(), "-");
    expect(zoom()).toBeCloseTo(start, 3);
    press(viewport(), "ArrowRight");
    expect(center(pin("berlin")).x).toBeCloseTo(before.x - WIDTH / 4, 3);
    press(viewport(), "0");
    expect(zoom()).toBeCloseTo(start, 3);
    expect(center(pin("berlin"))).toEqual(before);
  });

  it("leaves the wheel to the page unless Ctrl or Cmd is held or the map has focus", async () => {
    await render([berlin]);
    const start = zoom();
    const wheel = async (init: WheelEventInit) => {
      const event = new WheelEvent("wheel", { deltaY: -500, clientX: 50, clientY: 50, cancelable: true, ...init });
      act(() => {
        viewport().dispatchEvent(event);
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 200));
      });
      return event.defaultPrevented;
    };
    expect(await wheel({})).toBe(false);
    expect(zoom()).toBe(start);
    expect(await wheel({ ctrlKey: true })).toBe(true);
    expect(zoom()).toBeCloseTo(start + 1, 3);
    expect(await wheel({ metaKey: true, deltaY: 500 })).toBe(true);
    expect(zoom()).toBeCloseTo(start, 3);
    act(() => viewport().focus());
    expect(await wheel({})).toBe(true);
    expect(zoom()).toBeCloseTo(start + 1, 3);
  });

  it("pans with the mouse but leaves one-finger touch to the page and zooms with two fingers", async () => {
    await render([berlin]);
    const start = zoom();
    const before = center(pin("berlin"));
    const pointer = (type: string, pointerId: number, pointerType: string, clientX: number, clientY = 100) =>
      act(() => {
        viewport().dispatchEvent(
          Object.assign(new MouseEvent(type, { clientX, clientY, button: 0, buttons: 1, bubbles: true }), {
            pointerId,
            pointerType,
          }),
        );
      });
    pointer("pointerdown", 1, "touch", 100);
    pointer("pointermove", 1, "touch", 180);
    pointer("pointerup", 1, "touch", 180);
    expect(center(pin("berlin"))).toEqual(before);
    pointer("pointerdown", 2, "touch", 100);
    pointer("pointerdown", 3, "touch", 200);
    pointer("pointermove", 3, "touch", 300);
    pointer("pointerup", 3, "touch", 300);
    pointer("pointerup", 2, "touch", 100);
    expect(zoom()).toBeCloseTo(start + 1, 3);
    const zoomed = center(pin("berlin"));
    pointer("pointerdown", 4, "mouse", 100);
    pointer("pointermove", 4, "mouse", 160);
    pointer("pointerup", 4, "mouse", 160);
    expect(center(pin("berlin")).x).toBeCloseTo(zoomed.x + 60, 3);
  });

  it("zooms with the buttons and disables zoom in at the maximum", async () => {
    await render([berlin]);
    const zoomIn = host.querySelector<HTMLButtonElement>('button[aria-label="Zoom in"]');
    const zoomOut = host.querySelector<HTMLButtonElement>('button[aria-label="Zoom out"]');
    act(() => zoomOut?.click());
    expect(zoom()).toBe(FIT_MAX_ZOOM - 1);
    for (let step = 0; step < 6; step += 1) act(() => zoomIn?.click());
    expect(zoom()).toBe(MAX_ZOOM);
    expect(zoomIn?.disabled).toBe(true);
  });
});

describe("MapView basemap", () => {
  it("shows pins while the basemap loads and offers a retry after a failure", async () => {
    let fail: (error: Error) => void = () => undefined;
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => new Promise((_, reject) => (fail = reject)))
      .mockImplementation((url: string) =>
        Promise.resolve(jsonResponse(url.endsWith("world.json") ? WORLD_FIXTURE : REGION_FIXTURE)),
      );
    vi.stubGlobal("fetch", fetchMock);
    await render([berlin]);
    expect(host.querySelector('[role="status"]')?.textContent).toBe("Loading map");
    expect(markers("pin")).toHaveLength(1);
    act(() => fail(new Error("offline")));
    await flush();
    const retry = host.querySelector<HTMLButtonElement>('[role="alert"] button');
    expect(retry?.textContent).toBe("Map failed, retry");
    act(() => retry?.click());
    await flush();
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(host.querySelector('[role="status"]')).toBeNull();
    expect(fetchMock.mock.calls.map(([url]) => url)).toContain("/maps/v1/world.json");
  });

  it("loads region detail only once zoomed in to the detail level", async () => {
    const fetchMock = vi.mocked(fetch);
    await render([point("a", 0, -120), point("b", 10, 120)]);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(["/maps/v1/world.json"]);
    await render([...munich, berlin]);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(["/maps/v1/world.json", "/maps/v1/region-4-8-5.json"]);
  });
});
