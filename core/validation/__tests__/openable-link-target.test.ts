import { describe, expect, it } from "vitest";

import { openableLinkTarget } from "../openable-link-target";

describe("openableLinkTarget", () => {
  it.each([
    ["asdf.com", "https://asdf.com"],
    ["wavestone.com/careers", "https://wavestone.com/careers"],
    ["intranet.example.com:8443/x", "https://intranet.example.com:8443/x"],
    ["  asdf.com  ", "https://asdf.com"],
  ])("gives %j the scheme it was missing, so the browser cannot resolve it same-origin", (input, expected) => {
    expect(openableLinkTarget(input)).toBe(expected);
  });

  it.each([
    ["https://www.wavestone.com", "https://www.wavestone.com"],
    ["https://www.wavestone.com/careers?ref=1#top", "https://www.wavestone.com/careers?ref=1#top"],
    ["http://intranet.example.com", "http://intranet.example.com"],
    ["mailto:sales@customermates.com", "mailto:sales@customermates.com"],
    ["tel:+4915112345678", "tel:+4915112345678"],
  ])("opens %j unchanged", (input, expected) => {
    expect(openableLinkTarget(input)).toBe(expected);
  });

  it.each([
    ["/internal/report.pdf"],
    ["//cdn.example.com/x"],
    [String.fromCharCode(92) + "evil.example"],
    ["javascript:alert(1)"],
    ["data:text/html,hi"],
    ["ftp://example.com"],
    [""],
    ["   "],
  ])("refuses to open %j", (input) => {
    expect(openableLinkTarget(input)).toBeNull();
  });
});
