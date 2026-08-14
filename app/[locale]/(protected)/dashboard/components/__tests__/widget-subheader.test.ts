import { describe, expect, it } from "vitest";

import { widgetSubheader } from "../widget-subheader";

describe("widgetSubheader", () => {
  it("has nothing to show without groups", () => {
    expect(widgetSubheader(0, "€0", "groups")).toBeNull();
  });

  it("shows the total alone for a single group", () => {
    expect(widgetSubheader(1, "€1,200", "groups")).toBe("€1,200");
  });

  it("appends the group count once there is more than one", () => {
    expect(widgetSubheader(3, "€1,200", "groups")).toBe("€1,200 · 3 groups");
  });
});
