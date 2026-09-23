import { describe, expect, it } from "vitest";

import {
  fixedFirstPanelTemplate,
  isPanelTouchReset,
  keyboardPanelDelta,
  mergeStoredPanelSizes,
  normalizePanelSizes,
  panelSizeStorageKey,
  proportionalPanelTemplate,
  readStoredPanelSizes,
  resizeAdjacentPanels,
} from "../resizable-panels.utils";

describe("resizable panel geometry", () => {
  it("normalizes valid ratios and rejects incomplete geometry", () => {
    expect(normalizePanelSizes([240, 720])).toEqual([250, 750]);
    expect(normalizePanelSizes([240])).toBeNull();
    expect(normalizePanelSizes([240, 0])).toBeNull();
    expect(normalizePanelSizes([240, Number.NaN])).toBeNull();
  });

  it("resizes only adjacent panels and preserves their combined width", () => {
    expect(
      resizeAdjacentPanels({
        sizes: [600, 400, 360],
        minimums: [320, 280, 320],
        dividerIndex: 0,
        delta: 75,
      }),
    ).toEqual([675, 325, 360]);
  });

  it("clamps both directions against minimum and maximum sizes", () => {
    expect(
      resizeAdjacentPanels({
        sizes: [240, 760],
        minimums: [192, 480],
        maximums: [384, undefined],
        dividerIndex: 0,
        delta: 500,
      }),
    ).toEqual([384, 616]);
    expect(
      resizeAdjacentPanels({
        sizes: [240, 760],
        minimums: [192, 480],
        maximums: [384, undefined],
        dividerIndex: 0,
        delta: -500,
      }),
    ).toEqual([192, 808]);
  });

  it("maps arrows and boundary keys to deterministic deltas", () => {
    const input = {
      shiftKey: false,
      leftSize: 300,
      rightSize: 700,
      leftMinimum: 192,
      rightMinimum: 480,
      leftMaximum: 384,
    };

    expect(keyboardPanelDelta({ ...input, key: "ArrowLeft" })).toBe(-10);
    expect(keyboardPanelDelta({ ...input, key: "ArrowRight", shiftKey: true })).toBe(30);
    expect(keyboardPanelDelta({ ...input, key: "Home" })).toBe(-108);
    expect(keyboardPanelDelta({ ...input, key: "End" })).toBe(84);
    expect(keyboardPanelDelta({ ...input, key: "PageDown" })).toBeUndefined();
  });

  it("recognizes only a prompt positive touch double-tap", () => {
    expect(isPanelTouchReset(undefined, 100)).toBe(false);
    expect(isPanelTouchReset(100, 500)).toBe(true);
    expect(isPanelTouchReset(100, 501)).toBe(false);
    expect(isPanelTouchReset(100, 100)).toBe(false);
  });
});

describe("resizable panel persistence", () => {
  it("isolates layout signatures and preserves unrelated personalization", () => {
    const original = {
      name: 220,
      [panelSizeStorageKey("other", "left")]: 400,
      [panelSizeStorageKey("wiki", "pages")]: 250,
      [panelSizeStorageKey("wiki", "document")]: 750,
    };
    const updated = mergeStoredPanelSizes(original, "wiki", ["pages", "document"], [300, 700]);

    expect(updated).toEqual({
      name: 220,
      [panelSizeStorageKey("other", "left")]: 400,
      [panelSizeStorageKey("wiki", "pages")]: 300,
      [panelSizeStorageKey("wiki", "document")]: 700,
    });
    expect(readStoredPanelSizes(updated, "wiki", ["pages", "document"])).toEqual([300, 700]);
  });

  it("removes only the reset layout and supports fixed pixel storage", () => {
    const stored = mergeStoredPanelSizes({}, "wiki", ["pages", "document"], [280, 720], false);

    expect(readStoredPanelSizes(stored, "wiki", ["pages", "document"], false)).toEqual([280, 720]);
    expect(mergeStoredPanelSizes({ ...stored, other: 1 }, "wiki", ["pages", "document"], null, false)).toEqual({
      other: 1,
    });
  });

  it("falls back when a stored layout is partial or malformed", () => {
    expect(
      readStoredPanelSizes({ [panelSizeStorageKey("wiki", "pages")]: 280 }, "wiki", ["pages", "document"]),
    ).toBeNull();
    expect(
      readStoredPanelSizes(
        {
          [panelSizeStorageKey("wiki", "pages")]: Number.POSITIVE_INFINITY,
          [panelSizeStorageKey("wiki", "document")]: 720,
        },
        "wiki",
        ["pages", "document"],
      ),
    ).toBeNull();
  });
});

describe("resizable panel templates", () => {
  it("keeps proportional panels responsive", () => {
    expect(proportionalPanelTemplate([600, 400], [320, 280], "default")).toBe(
      "minmax(320px, 600fr) 1px minmax(280px, 400fr)",
    );
    expect(proportionalPanelTemplate(null, [320, 280], "default")).toBe("default");
  });

  it("keeps the Wiki rail fixed while reserving the document minimum", () => {
    expect(fixedFirstPanelTemplate([300, 700], [192, 480], [384, undefined], "default")).toBe(
      "clamp(192px, 300px, min(384px, calc(100% - 481px))) 1px minmax(480px, 1fr)",
    );
  });
});
