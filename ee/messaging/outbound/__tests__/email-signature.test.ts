import { describe, expect, it } from "vitest";

import { SIGNATURE_DELIMITER, composeEmailBodies, signatureToHtml, toEmailHtml } from "../email-signature";

const HTML_END = "</body></html>";

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

  it("treats a bare tag name in prose as text unless html is explicit", () => {
    expect(toEmailHtml("Write <div> literally")).toBe("Write &lt;div&gt; literally");
    expect(toEmailHtml("Write <div> literally", "html")).toBe("Write <div> literally");
  });

  it("recognizes valid html tags outside the old fixed allow-list", () => {
    expect(toEmailHtml("<section>already html</section>")).toBe("<section>already html</section>");
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
    expect(html).toBe('Hello<div data-customermates-signature="true"><br><br>-- <br><p><strong>Ben</strong></p></div>');
  });

  it("ignores a blank signature", () => {
    expect(composeEmailBodies("Hello", "   ").plainText).toBe("Hello");
  });

  it("does not double-append when the body already ends with a signature block", () => {
    const once = composeEmailBodies("Hello", "Ben").plainText;

    expect(composeEmailBodies(once, "Ben").plainText.match(/-- \n/g)).toHaveLength(1);
  });

  it("does not mistake a quoted sender signature for the current sender's signature", () => {
    const body = "My reply\n\nOn Tuesday, A wrote:\n> Previous\n> \n> -- \n> Their signature";

    expect(composeEmailBodies(body, "My signature").plainText).toContain("\n\n-- \nMy signature");
  });

  it("derives text from html, inserts inside a full document, and remains idempotent", () => {
    const once = composeEmailBodies("<html><body><section>Hello</section></body></html>", "Ben", null, "html");
    const twice = composeEmailBodies(once.html, "Ben", null, "html");

    expect(once.plainText).toBe(`Hello${SIGNATURE_DELIMITER}Ben`);
    expect(once.html.indexOf(HTML_END)).toBeGreaterThan(once.html.indexOf("data-customermates-signature"));
    expect(twice.html).toBe(once.html);
    expect(twice.html.match(/data-customermates-signature/g)).toHaveLength(1);
  });
});
