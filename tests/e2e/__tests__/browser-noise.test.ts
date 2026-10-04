import { describe, expect, it } from "vitest";

import { isAppConsoleError, isBenignPageError } from "../browser-noise";

const message = (type: string, text: string) => ({ type: () => type, text: () => text }) as Parameters<typeof isAppConsoleError>[0];

describe("browser engine noise filters", () => {
  it("ignores only WebKit's notice about the deliberate interactive-widget viewport key", () => {
    expect(isAppConsoleError(message("error", 'Viewport argument key "interactive-widget" not recognized and ignored.'))).toBe(false);
    expect(isAppConsoleError(message("error", 'Viewport argument key "width" not recognized and ignored.'))).toBe(true);
    expect(isAppConsoleError(message("error", "Hydration failed"))).toBe(true);
    expect(isAppConsoleError(message("warning", "Hydration failed"))).toBe(false);
  });

  it("ignores only cancelled loopback route prefetches and the ResizeObserver notice", () => {
    expect(isBenignPageError("ResizeObserver loop completed with undelivered notifications.")).toBe(true);
    expect(
      isBenignPageError("Fetch API cannot load http://127.0.0.1:4127/en/dashboard?_rsc=RxfmFIOaYlZ7eL0a due to access control checks."),
    ).toBe(true);
    expect(isBenignPageError("Fetch API cannot load http://127.0.0.1:4127/api/v2/records/query due to access control checks.")).toBe(false);
    expect(isBenignPageError("Fetch API cannot load https://example.com/en/x?_rsc=abc due to access control checks.")).toBe(false);
    expect(isBenignPageError("TypeError: Load failed")).toBe(false);
  });
});
