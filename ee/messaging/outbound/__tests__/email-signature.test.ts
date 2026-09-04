import { describe, expect, it } from "vitest";

import { EmailLinkStyle, SignatureTemplate, defaultEmailSettings } from "../../email-settings";
import { SIGNATURE_DELIMITER, composeEmailBodies, signatureToHtml, toEmailHtml } from "../email-signature";

const HTML_END = "</body></html>";

describe("toEmailHtml", () => {
  it("escapes plain text, preserves line breaks, and applies account typography", () => {
    const html = toEmailHtml("one < two\nthree");

    expect(html).toContain('data-customermates-email-body="true"');
    expect(html).toContain("font-family:Arial,Helvetica,sans-serif");
    expect(html).toContain("one &lt; two<br>three");
  });

  it("renders Markdown with account link theming", () => {
    const settings = defaultEmailSettings();
    settings.appearance.linkHex = "#d23128";
    settings.appearance.linkStyle = EmailLinkStyle.plain;

    const html = toEmailHtml("**Hello** [there](https://example.com)", "markdown", settings);

    expect(html).toContain("<strong>Hello</strong>");
    expect(html).toContain("color:#d23128;text-decoration:none");
  });

  it("leaves an explicit or detected HTML body untouched", () => {
    const html = "<section>already html</section>";

    expect(toEmailHtml(html)).toBe(html);
    expect(toEmailHtml("Write <div> literally", "html")).toBe("Write <div> literally");
  });

  it("treats a tag name inside plain prose as text", () => {
    expect(toEmailHtml("Write <div> literally")).toContain("Write &lt;div&gt; literally");
  });
});

describe("signatureToHtml", () => {
  it("renders safe Markdown emphasis, links, and line breaks", () => {
    const html = signatureToHtml("**Ben**\nFounder, [Customermates](https://customermates.com)");

    expect(html).toContain("<strong>Ben</strong><br>");
    expect(html).toContain('href="https://customermates.com"');
    expect(html).toContain("Founder, ");
  });

  it("escapes raw HTML rather than trusting the stored value", () => {
    expect(signatureToHtml("<script>alert(1)</script>")).toContain("&lt;script&gt;");
  });
});

describe("composeEmailBodies", () => {
  it("returns themed plain and HTML body parts when there is no signature", () => {
    const result = composeEmailBodies("Hello\nthere", null);

    expect(result.plainText).toBe("Hello\nthere");
    expect(result.html).toContain("Hello<br>there");
    expect(result.html).not.toContain("data-customermates-signature");
  });

  it("appends rendered signature text and HTML", () => {
    const settings = defaultEmailSettings();
    settings.signature.enabled = true;
    settings.signature.template = SignatureTemplate.plain;
    settings.signature.logoUrl = "";
    const { plainText, html } = composeEmailBodies("Hello", "**Ben**", settings, "markdown");

    expect(plainText).toBe(`Hello${SIGNATURE_DELIMITER}Ben`);
    expect(html).toContain(
      'data-customermates-signature="true" style="font-family:Arial,Helvetica,sans-serif;font-size:13px;',
    );
    expect(html).toContain("<strong>Ben</strong>");
  });

  it("preserves a disabled signature without appending it", () => {
    const settings = defaultEmailSettings();
    settings.signature.enabled = false;

    const result = composeEmailBodies("Hello", "**Saved for later**", settings, "markdown");

    expect(result.plainText).toBe("Hello");
    expect(result.html).not.toContain("Saved for later");
  });

  it("does not double-append when the visible body already ends with a signature block", () => {
    const once = composeEmailBodies("Hello", "Ben").plainText;

    expect(composeEmailBodies(once, "Ben").plainText.match(/-- \n/g)).toHaveLength(1);
  });

  it("does not mistake a quoted sender signature for the current sender's signature", () => {
    const body = "My reply\n\nOn Tuesday, A wrote:\n> Previous\n> \n> -- \n> Their signature";

    expect(composeEmailBodies(body, "My signature").plainText).toContain("\n\n-- \nMy signature");
  });

  it("derives text from HTML, inserts inside a full document, and remains idempotent", () => {
    const once = composeEmailBodies("<html><body><section>Hello</section></body></html>", "Ben", null, "html");
    const twice = composeEmailBodies(once.html, "Ben", null, "html");

    expect(once.plainText).toBe(`Hello${SIGNATURE_DELIMITER}Ben`);
    expect(once.html.indexOf(HTML_END)).toBeGreaterThan(once.html.indexOf("data-customermates-signature"));
    expect(twice.html).toBe(once.html);
    expect(twice.html.match(/data-customermates-signature/g)).toHaveLength(1);
  });
});
