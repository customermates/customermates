import { describe, expect, it } from "vitest";

import { htmlToPlainText } from "../email-body-text";

describe("htmlToPlainText", () => {
  it("returns null for absent, empty or whitespace-only input", () => {
    expect(htmlToPlainText(null)).toBeNull();
    expect(htmlToPlainText(undefined)).toBeNull();
    expect(htmlToPlainText("")).toBeNull();
    expect(htmlToPlainText("   \n\t ")).toBeNull();
  });

  it("returns null when the markup carries no readable text", () => {
    expect(htmlToPlainText("<style>a{color:red}</style>")).toBeNull();
    expect(htmlToPlainText("<script>var a = 1;</script>")).toBeNull();
    expect(htmlToPlainText("<div><span></span></div>")).toBeNull();
  });

  it("passes a plain-text body through unchanged", () => {
    expect(htmlToPlainText("Just a plain sentence.")).toBe("Just a plain sentence.");
  });

  it("drops script, style and head content instead of inlining it", () => {
    const html = "<head><title>t</title></head><style>.x{color:red}</style><p>Visible</p><script>alert(1)</script>";

    expect(htmlToPlainText(html)).toBe("Visible");
  });

  it("turns block boundaries into line breaks", () => {
    expect(htmlToPlainText("<p>One</p><p>Two</p>")).toBe("One\n\nTwo");
    expect(htmlToPlainText("A<br>B")).toBe("A\nB");
    expect(htmlToPlainText("<ul><li>a</li><li>b</li></ul>")).toBe("a\n\nb");
  });

  it("preserves the canonical url behind a link", () => {
    const html = '<a href="https://reddit.com/r/crm/comments/abc">See the post</a>';

    expect(htmlToPlainText(html)).toBe("See the post (https://reddit.com/r/crm/comments/abc)");
  });

  it("does not duplicate a url used as its own label", () => {
    const html = '<a href="https://example.com/x">https://example.com/x</a>';

    expect(htmlToPlainText(html)).toBe("https://example.com/x");
  });

  it("drops javascript and data hrefs but keeps the label", () => {
    expect(htmlToPlainText('<a href="javascript:alert(1)">Click</a>')).toBe("Click");
    expect(htmlToPlainText('<a href="data:text/html,x">Click</a>')).toBe("Click");
  });

  it("decodes named, decimal and hex entities", () => {
    expect(htmlToPlainText("<p>Tom &amp; Jerry &lt;3 &#65; &#x42;</p>")).toBe("Tom & Jerry <3 A B");
  });

  it("leaves an unknown entity alone rather than mangling it", () => {
    expect(htmlToPlainText("<p>&notarealentity; x</p>")).toBe("&notarealentity; x");
  });

  it("collapses runs of whitespace and blank lines", () => {
    expect(htmlToPlainText("<p>a    b</p>\n\n\n<p>c</p>")).toBe("a b\n\nc");
  });

  it("survives malformed markup without throwing", () => {
    expect(() => htmlToPlainText("<p>unclosed <b>bold")).not.toThrow();
    expect(htmlToPlainText("<p>unclosed <b>bold")).toBe("unclosed bold");
    expect(htmlToPlainText("<<>><p>ok</p>")).toContain("ok");
  });

  it("keeps bare angle brackets so plain-text quoting is not damaged", () => {
    expect(htmlToPlainText("> previous message\n> second line")).toBe("> previous message\n> second line");
    expect(htmlToPlainText("3 > 2")).toBe("3 > 2");
  });

  it("extracts the readable text and source link from an html-only alert", () => {
    const html = [
      "<html><head><style>.wrap{padding:0}</style></head><body>",
      '<table><tr><td><div class="wrap">',
      "<h2>New mention of <b>Customermates</b></h2>",
      "<p>Someone asked which CRM handles WhatsApp and LinkedIn in one inbox.</p>",
      '<p><a href="https://www.reddit.com/r/smallbusiness/comments/1abcd/">View the post</a></p>',
      "</div></td></tr></table></body></html>",
    ].join("");

    const text = htmlToPlainText(html);

    expect(text).toContain("New mention of Customermates");
    expect(text).toContain("Someone asked which CRM handles WhatsApp and LinkedIn in one inbox.");
    expect(text).toContain("https://www.reddit.com/r/smallbusiness/comments/1abcd/");
    expect(text).not.toContain("padding");
    expect(text).not.toContain("<");
  });
});
