import { describe, expect, it } from "vitest";

import { SIGNATURE_DELIMITER, applyEmailSignature, toEmailHtml } from "../email-signature";

describe("applyEmailSignature", () => {
  it("appends the signature behind the standard delimiter", () => {
    expect(applyEmailSignature("Hello", "Ben")).toBe(`Hello${SIGNATURE_DELIMITER}Ben`);
  });

  it("leaves the body alone when there is no signature", () => {
    expect(applyEmailSignature("Hello", null)).toBe("Hello");
    expect(applyEmailSignature("Hello", "")).toBe("Hello");
    expect(applyEmailSignature("Hello", "   ")).toBe("Hello");
  });

  it("never appends twice", () => {
    const once = applyEmailSignature("Hello", "Ben");

    expect(applyEmailSignature(once, "Ben")).toBe(once);
  });

  it("respects a body that already carries its own delimiter", () => {
    const edited = `Hello${SIGNATURE_DELIMITER}Something the writer chose`;

    expect(applyEmailSignature(edited, "Ben")).toBe(edited);
  });

  it("trims trailing whitespace before the delimiter", () => {
    expect(applyEmailSignature("Hello   \n\n", "Ben")).toBe(`Hello${SIGNATURE_DELIMITER}Ben`);
  });
});

describe("toEmailHtml", () => {
  it("turns newlines in a plain-text body into line breaks", () => {
    expect(toEmailHtml("one\ntwo")).toBe("one<br>two");
  });

  it("escapes markup so a plain-text body is not interpreted", () => {
    expect(toEmailHtml("a < b & c > d")).toBe("a &lt; b &amp; c &gt; d");
  });

  it("carries a signature block through as separate lines", () => {
    expect(toEmailHtml(applyEmailSignature("Hi", "Ben\nCustomermates"))).toBe("Hi<br><br>-- <br>Ben<br>Customermates");
  });

  it("leaves an html body untouched", () => {
    const html = "<p>already html</p>\n<p>second</p>";

    expect(toEmailHtml(html)).toBe(html);
  });
});
