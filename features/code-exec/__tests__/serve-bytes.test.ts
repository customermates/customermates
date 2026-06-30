import { describe, expect, it } from "vitest";

import { safeServeHeaders } from "../serve-bytes";

describe("safeServeHeaders (stored-XSS defense)", () => {
  it("always sets nosniff + a script-blocking CSP", () => {
    const h = safeServeHeaders("image/png", "x.png");
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["content-security-policy"]).toContain("sandbox");
  });

  it("serves browser-executable types as a download, never inline", () => {
    for (const mime of ["text/html", "image/svg+xml", "application/xml", "text/csv", "application/octet-stream"]) {
      const h = safeServeHeaders(mime, "evil.html");
      expect(h["content-type"]).toBe("application/octet-stream");
      expect(h["content-disposition"]).toContain("attachment");
    }
  });

  it("previews allowlisted safe types inline with their real type", () => {
    for (const mime of ["image/png", "image/jpeg", "image/gif", "image/webp", "application/pdf", "text/plain"]) {
      const h = safeServeHeaders(mime, "ok.bin");
      expect(h["content-type"]).toBe(mime);
      expect(h["content-disposition"]).toContain("inline");
    }
  });

  it("sanitizes the filename in content-disposition", () => {
    const h = safeServeHeaders("image/png", 'a"b;c .png');
    expect(h["content-disposition"]).not.toContain('"b;c');
  });
});
