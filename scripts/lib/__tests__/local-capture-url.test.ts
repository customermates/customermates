import { describe, expect, it } from "vitest";

import { assertLocalCaptureUrl } from "../local-capture-url.mjs";

describe("product-proof capture URL boundary", () => {
  it.each([
    "http://localhost:4000",
    "http://LOCALHOST:4000/en",
    "http://127.0.0.1:4000",
    "http://[::1]:4000",
  ])("accepts the explicit local HTTP host %s", (value) => {
    expect(assertLocalCaptureUrl(value)).toBe(value);
  });

  it.each([
    ["a hosted application", "http://customermates.com"],
    ["a localhost look-alike", "http://localhost.example.com:4000"],
    ["another IPv4 loopback address", "http://127.0.0.2:4000"],
    ["another IPv6 loopback address", "http://[::2]:4000"],
    ["a canonicalized abbreviated address", "http://127.1:4000"],
    ["a canonicalized numeric address", "http://2130706433:4000"],
  ])("rejects %s", (_name, value) => {
    expect(() => assertLocalCaptureUrl(value)).toThrow(/host must be/);
  });

  it.each([
    ["HTTPS", "https://localhost:4000"],
    ["a file URL", "file:///tmp/customermates"],
    ["FTP", "ftp://localhost:4000"],
  ])("rejects %s before capture", (_name, value) => {
    expect(() => assertLocalCaptureUrl(value)).toThrow(/must use http:/);
  });

  it.each([
    ["username and password", "http://user:secret@localhost:4000"],
    ["username", "http://user@127.0.0.1:4000"],
    ["empty userinfo", "http://@localhost:4000"],
  ])("rejects %s", (_name, value) => {
    expect(() => assertLocalCaptureUrl(value)).toThrow(/must not contain credentials/);
  });

  it.each([
    ["a relative URL", "/en/dashboard"],
    ["surrounding whitespace", " http://localhost:4000"],
    ["a backslash authority trick", "http://localhost\\@customermates.com"],
  ])("rejects %s", (_name, value) => {
    expect(() => assertLocalCaptureUrl(value)).toThrow();
  });
});
