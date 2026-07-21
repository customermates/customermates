import { describe, it, expect } from "vitest";

import { findPastedImageUrl, isImageUrl, isSafeLinkHref } from "../image-extension";

class FakeClipboard {
  private readonly data: Record<string, string>;

  constructor(data: Record<string, string>) {
    this.data = data;
  }

  getData(type: string): string {
    return this.data[type] ?? "";
  }
}

const clipboard = (data: Record<string, string>) => new FakeClipboard(data) as unknown as DataTransfer;

describe("isImageUrl", () => {
  it.each([
    "https://example.com/a.png",
    "http://example.com/a.JPEG",
    "https://example.com/a.svg?v=2",
    "https://cdn.example.com/path/to/a.webp",
  ])("accepts %s", (value) => {
    expect(isImageUrl(value)).toBe(true);
  });

  it.each(["https://example.com/page", "javascript:alert(1)", "/relative/a.png", "not a url", ""])(
    "rejects %s",
    (value) => {
      expect(isImageUrl(value)).toBe(false);
    },
  );
});

describe("findPastedImageUrl", () => {
  it("leaves html clipboards alone; the image extension's own parseHTML handles pasted <img> markup", () => {
    const html = '<meta charset="utf-8"><img src="https://example.com/copied.png" alt="copied">';

    expect(findPastedImageUrl(clipboard({ "text/html": html }))).toBeNull();
  });

  it("falls back to a uri-list entry that points at an image", () => {
    const uriList = "# comment\nhttps://example.com/from-uri-list.gif";

    expect(findPastedImageUrl(clipboard({ "text/uri-list": uriList }))).toBe("https://example.com/from-uri-list.gif");
  });

  it("treats a bare image url pasted as text as an image", () => {
    expect(findPastedImageUrl(clipboard({ "text/plain": "https://example.com/bare.png" }))).toBe(
      "https://example.com/bare.png",
    );
  });

  it("leaves ordinary pasted text alone", () => {
    expect(findPastedImageUrl(clipboard({ "text/plain": "just some notes" }))).toBeNull();
  });

  it("leaves a non-image link alone so it stays a link", () => {
    expect(findPastedImageUrl(clipboard({ "text/plain": "https://example.com/article" }))).toBeNull();
  });

  it("returns null when there is no clipboard", () => {
    expect(findPastedImageUrl(null)).toBeNull();
  });
});

describe("isSafeLinkHref", () => {
  it.each([
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
    "/relative/path.png",
    "",
  ])("refuses to build a clickable fallback for %j", (src) => {
    expect(isSafeLinkHref(src)).toBe(false);
  });

  it.each(["https://example.com/a.png", "http://example.com/broken", "https://example.com/x?y=1"])(
    "allows a fallback link for %j",
    (src) => {
      expect(isSafeLinkHref(src)).toBe(true);
    },
  );
});
