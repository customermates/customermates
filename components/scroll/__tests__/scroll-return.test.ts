import { describe, expect, it } from "vitest";

import { SCROLL_RETURN_THRESHOLD } from "../use-scroll-return";

type Metrics = { scrollHeight: number; scrollTop: number; clientHeight: number };

function distanceFromAnchor(metrics: Metrics, direction: "top" | "bottom") {
  return direction === "bottom" ? metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight : metrics.scrollTop;
}

function isAway(metrics: Metrics, direction: "top" | "bottom") {
  return distanceFromAnchor(metrics, direction) > SCROLL_RETURN_THRESHOLD;
}

const TALL: Metrics = { scrollHeight: 5000, scrollTop: 0, clientHeight: 800 };

describe("scroll-return anchor distance", () => {
  it("keeps the control hidden at the top anchor and just below the threshold", () => {
    expect(isAway({ ...TALL, scrollTop: 0 }, "top")).toBe(false);
    expect(isAway({ ...TALL, scrollTop: SCROLL_RETURN_THRESHOLD }, "top")).toBe(false);
  });

  it("reveals the top control once the user is past the threshold", () => {
    expect(isAway({ ...TALL, scrollTop: SCROLL_RETURN_THRESHOLD + 1 }, "top")).toBe(true);
    expect(isAway({ ...TALL, scrollTop: 3000 }, "top")).toBe(true);
  });

  it("keeps the control hidden at the bottom anchor and just above the threshold", () => {
    expect(isAway({ ...TALL, scrollTop: 4200 }, "bottom")).toBe(false);
    expect(isAway({ ...TALL, scrollTop: 4200 - SCROLL_RETURN_THRESHOLD }, "bottom")).toBe(false);
  });

  it("reveals the bottom control once the user scrolls away from the latest content", () => {
    expect(isAway({ ...TALL, scrollTop: 4200 - SCROLL_RETURN_THRESHOLD - 1 }, "bottom")).toBe(true);
    expect(isAway({ ...TALL, scrollTop: 0 }, "bottom")).toBe(true);
  });

  it("treats a container shorter than its viewport as anchored in both directions", () => {
    const short: Metrics = { scrollHeight: 400, scrollTop: 0, clientHeight: 800 };

    expect(isAway(short, "top")).toBe(false);
    expect(isAway(short, "bottom")).toBe(false);
  });
});
