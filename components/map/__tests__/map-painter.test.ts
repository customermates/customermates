import type { BasemapPlace } from "../map-basemap";

import { describe, expect, it } from "vitest";

import { project, toScreen } from "../map-geometry";
import { LABEL_LIMIT, LABEL_ZOOM_OFFSET, placeLabels, placeName } from "../map-painter";

const SIZE = { width: 800, height: 400 };
const CAMERA = { ...project(10, 50), zoom: 6 };
const measure = (text: string) => text.length * 6;

function place(name: string, longitude: number, latitude: number, minZoom: number, names: Record<string, string> = {}) {
  return { ...project(longitude, latitude), minZoom, name, names } satisfies BasemapPlace;
}

describe("city labels", () => {
  it("shows places whose minimum zoom is reached, most important first", () => {
    const places = [
      place("Small", 9, 50, CAMERA.zoom + LABEL_ZOOM_OFFSET + 0.5),
      place("Town", 11, 49.5, CAMERA.zoom + LABEL_ZOOM_OFFSET),
      place("Capital", 10, 51, 2),
    ];
    expect(placeLabels(places, CAMERA, SIZE, "en", measure).map(({ text }) => text)).toEqual(["Capital", "Town"]);
  });

  it("uses the page language where Natural Earth has a name for it", () => {
    const munich = place("Munich", 11.575, 48.137, 3, { de: "München" });
    expect(placeName(munich, "de")).toBe("München");
    expect(placeName(munich, "it")).toBe("Munich");
    expect(placeLabels([munich], CAMERA, SIZE, "de", measure)[0]?.text).toBe("München");
  });

  it("skips a label that would overlap a more important one or a marker", () => {
    const first = place("Mannheim", 8.466, 49.487, 3);
    const neighbour = place("Ludwigshafen", 8.44, 49.48, 4);
    expect(placeLabels([first, neighbour], CAMERA, SIZE, "en", measure).map(({ text }) => text)).toEqual(["Mannheim"]);
    const { x, y } = toScreen(CAMERA, SIZE, first);
    const marker = { left: x - 10, top: y - 10, right: x + 10, bottom: y + 10 };
    expect(placeLabels([first], CAMERA, SIZE, "en", measure, [marker])).toEqual([]);
  });

  it("puts the label left of its dot near the right edge", () => {
    const edge = place("Eastern", 0, 50, 3);
    const camera = { ...CAMERA, x: project(0, 50).x - (SIZE.width / 2 - 10) / 2 ** CAMERA.zoom };
    const [label] = placeLabels([edge], camera, SIZE, "en", measure);
    expect(label?.align).toBe("right");
    expect(label && label.textX < label.x).toBe(true);
  });

  it("drops places outside the view and stops at the label limit", () => {
    const outside = place("Far", 40, 10, 1);
    expect(placeLabels([outside], CAMERA, SIZE, "en", measure)).toEqual([]);
    const crowd = Array.from({ length: LABEL_LIMIT + 40 }, (_, index) =>
      place(`P${index}`, 4.5 + (index % 12), 49 + Math.floor(index / 12) * 0.25, 3),
    );
    expect(placeLabels(crowd, CAMERA, SIZE, "en", () => 1)).toHaveLength(LABEL_LIMIT);
  });
});
