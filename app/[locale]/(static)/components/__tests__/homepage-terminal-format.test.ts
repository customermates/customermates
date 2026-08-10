import { describe, expect, it } from "vitest";

import { homepageTerminalFormatters } from "../homepage-terminal-format";

describe("homepageTerminalFormatters", () => {
  it("formats the English terminal with English content-locale conventions", () => {
    const formatters = homepageTerminalFormatters("en");

    expect(formatters.currency.format(4800)).toBe("€4,800");
    expect(formatters.days.format(21)).toBe("21d");
  });

  it("formats the German terminal with German content-locale conventions", () => {
    const formatters = homepageTerminalFormatters("de");

    expect(formatters.currency.format(4800)).toBe("4.800 €");
    expect(formatters.days.format(21)).toBe("21 T");
  });
});
