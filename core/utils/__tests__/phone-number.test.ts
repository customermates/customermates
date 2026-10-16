import { describe, expect, it } from "vitest";

import { normalizePhoneNumber } from "../phone-number";

describe("phone number normaliser", () => {
  it.each([
    ["+49 621 123456", undefined, "+49621123456"],
    ["0621 123456", "de", "+49621123456"],
    ["0621/123456", "de", "+49621123456"],
    ["0049 621 123456", undefined, "+49621123456"],
    ["0049621123456", "de", "+49621123456"],
    ["+49 (0) 621 123456", undefined, "+49621123456"],
    ["+49 (0)621-123456", "us", "+49621123456"],
    ["0151 123-456-78", "de", "+4915112345678"],
    ["01 5123456", "at", "+4315123456"],
    ["+43 1 512 34 56", undefined, "+4315123456"],
    ["0043 1 5123456", "ch", "+4315123456"],
    ["044 668 18 00", "ch", "+41446681800"],
    ["+41 44 668 18 00", "de", "+41446681800"],
    ["(201) 555-0123", "us", "+12015550123"],
    ["+1 201.555.0123", undefined, "+12015550123"],
    ["020 7946 0958", "gb", "+442079460958"],
    ["+44 20 7946 0958", "de", "+442079460958"],
    [" +49 30 1234567 ", "DE", "+49301234567"],
  ])("normalises %s with region %s to %s", (raw, region, expected) => {
    expect(normalizePhoneNumber(raw, region)).toBe(expected);
  });

  it.each([
    ["0621 123456", undefined],
    ["0621 123456", null],
    ["0621 123456", "aq"],
    ["+49 621 123456 ext. 12", undefined],
    ["+49 621 123456;ext=12", "de"],
    ["0621 123456 x12", "de"],
    ["call +49 621 123456", undefined],
    ["+49 621 123456 (office)", undefined],
    ["+1 800 FLOWERS", "us"],
    ["+1234567", undefined],
    ["+0049621123456", undefined],
    ["12", "de"],
    ["", "de"],
    ["   ", undefined],
  ])("refuses %s with region %s", (raw, region) => {
    expect(normalizePhoneNumber(raw, region)).toBeNull();
  });
});
