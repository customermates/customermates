import { describe, expect, it } from "vitest";

import { SIGNATURE_DELIMITER, composeEmailBodies, signatureToHtml, toEmailHtml } from "../email-signature";

describe("toEmailHtml", () => {
  it("turns newlines in a plain-text body into line breaks", () => {
    expect(toEmailHtml("one\ntwo")).toBe("one<br>two");
  });

  it("escapes markup so a plain-text body is not interpreted", () => {
    expect(toEmailHtml("a < b & c > d")).toBe("a &lt; b &amp; c &gt; d");
  });

  it("leaves an html body untouched", () => {
    const html = "<p>already html</p>\n<p>second</p>";

    expect(toEmailHtml(html)).toBe(html);
  });
});

describe("signatureToHtml", () => {
  it("renders markdown emphasis and links", () => {
    expect(signatureToHtml("**Ben**\nFounder, [Customermates](https://customermates.com)")).toBe(
      '<p><strong>Ben</strong><br>\nFounder, <a href="https://customermates.com">Customermates</a></p>',
    );
  });

  it("keeps single newlines as line breaks", () => {
    expect(signatureToHtml("Ben\nCustomermates")).toBe("<p>Ben<br>\nCustomermates</p>");
  });

  it("escapes raw html rather than trusting the stored value", () => {
    expect(signatureToHtml("<script>alert(1)</script>")).toContain("&lt;script&gt;");
  });
});

describe("composeEmailBodies", () => {
  it("returns the body untouched on both parts when there is no signature", () => {
    expect(composeEmailBodies("Hello\nthere", null)).toEqual({
      plainText: "Hello\nthere",
      html: "Hello<br>there",
    });
  });

  it("appends the markdown source to the plain part and the rendered form to the html part", () => {
    const { plainText, html } = composeEmailBodies("Hello", "**Ben**");

    expect(plainText).toBe(`Hello${SIGNATURE_DELIMITER}**Ben**`);
    expect(html).toBe("Hello<br><br>-- <br><p><strong>Ben</strong></p>");
  });

  it("ignores a blank signature", () => {
    expect(composeEmailBodies("Hello", "   ").plainText).toBe("Hello");
  });

  it("does not double-append when the body already ends with a signature block", () => {
    const once = composeEmailBodies("Hello", "Ben").plainText;

    expect(composeEmailBodies(once, "Ben").plainText.match(/-- \n/g)).toHaveLength(1);
  });
});
