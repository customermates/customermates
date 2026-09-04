import { describe, expect, it } from "vitest";

import type { SignatureFields } from "../../signature-fields";

import { SIGNATURE_LOGO_URL, SignatureAccent, SignatureFieldsSchema, SignatureTemplate } from "../../signature-fields";
import { composeEmailBodies, renderSignature } from "../email-signature";
import { renderSignatureFields } from "../render-signature";

function fields(overrides: Record<string, unknown> = {}): SignatureFields {
  return SignatureFieldsSchema.parse({
    template: SignatureTemplate.stacked,
    accent: SignatureAccent.violet,
    fullName: "Benjamin Wagner",
    jobTitle: "Founder",
    company: "Customermates",
    email: "mail@customermates.com",
    phone: "+49 170 0000000",
    website: "customermates.com",
    logoUrl: SIGNATURE_LOGO_URL,
    ...overrides,
  });
}

function rendered(signatureFields: SignatureFields, markdown = "") {
  const result = renderSignatureFields(signatureFields, markdown);
  if (!result) throw new Error("expected a rendered signature");

  return result;
}

describe("renderSignatureFields", () => {
  it("emits nothing but inline styles on a presentation table", () => {
    const { html } = rendered(fields());

    expect(html.startsWith('<table role="presentation"')).toBe(true);
    expect(html).toContain("mso-table-lspace:0pt");
    for (const forbidden of ["<style", "@media", "<!--", "data:", ".svg", "background-color", "<link", "<hr"])
      expect(html).not.toContain(forbidden);
  });

  it("sizes the logo with attributes and inline css so a blocked image keeps its box", () => {
    const { html } = rendered(fields());

    expect(html).toContain(`src="${SIGNATURE_LOGO_URL}"`);
    expect(html).toContain('width="48" height="48"');
    expect(html).toContain("width:48px;height:48px");
    expect(html).toContain('alt="Customermates"');
    expect(html).toContain('border="0"');
  });

  it("keeps every declared colour readable on white and on a dark surface", () => {
    const { html } = rendered(fields());
    const hexes = [...html.matchAll(/#[0-9a-f]{6}/g)].map(([hex]) => hex);

    const luminance = (hex: string) => {
      const channel = (start: number) => {
        const value = parseInt(hex.slice(start, start + 2), 16) / 255;
        return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
    };
    const contrast = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

    expect(hexes.length).toBeGreaterThan(0);
    for (const hex of hexes) {
      expect(contrast(luminance(hex), luminance("#ffffff"))).toBeGreaterThanOrEqual(2.8);
      expect(contrast(luminance(hex), luminance("#1f1f1f"))).toBeGreaterThanOrEqual(2.8);
    }
  });

  it("draws no logo cell for the text-only template", () => {
    const { html } = rendered(fields({ template: SignatureTemplate.plain }));

    expect(html).not.toContain("<img");
  });

  it("puts the divider on a border, never on a filler cell", () => {
    const stacked = rendered(fields()).html;
    const beside = rendered(fields({ template: SignatureTemplate.sideBySide })).html;

    expect(stacked).toContain("border-top:1px solid");
    expect(beside).toContain("border-right:1px solid");
    expect(stacked).not.toContain("&nbsp;");
  });

  it("links phone, email and website with dial-safe and absolute hrefs", () => {
    const { html } = rendered(fields());

    expect(html).toContain('href="tel:+491700000000"');
    expect(html).toContain('href="mailto:mail@customermates.com"');
    expect(html).toContain('href="https://customermates.com"');
  });

  it("truncates a long website label but keeps the full href", () => {
    const long = `example.com/${"a".repeat(80)}`;
    const { html } = rendered(fields({ website: long }));

    expect(html).toContain(`href="https://${long}"`);
    expect(html).toContain("…");
  });

  it("escapes every interpolated value", () => {
    const { html } = rendered(fields({ fullName: '<script>"x"' }));

    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;&quot;x&quot;");
  });

  it("upgrades a bare-domain autolink in the free-form block to https", () => {
    const { html } = rendered(fields(), "see customermates.com");

    expect(html).toContain('href="https://customermates.com"');
    expect(html).not.toContain('href="http://customermates.com"');
  });

  it("returns null when there is nothing but a logo, rather than inventing content", () => {
    const empty = fields({ fullName: "", jobTitle: "", company: "", email: "", phone: "", website: "" });

    expect(renderSignatureFields(empty, "")).toBeNull();
  });
});

describe("the plain-text part", () => {
  it("carries the same facts with no markup and no logo", () => {
    const { text } = rendered(fields(), "**Bold** and [a link](https://example.com)");

    expect(text).toBe(
      [
        "Benjamin Wagner",
        "Founder, Customermates",
        "+49 170 0000000",
        "mail@customermates.com",
        "https://customermates.com",
        "Bold and a link (https://example.com)",
      ].join("\n"),
    );
    expect(text).not.toContain(SIGNATURE_LOGO_URL);
    expect(text).not.toContain("&amp;");
  });

  it("is never empty while the html part is not", () => {
    const logoAndCompanyOnly = rendered(fields({ fullName: "", email: "", phone: "", website: "" }));

    expect(logoAndCompanyOnly.text.trim().length).toBeGreaterThan(0);
    expect(logoAndCompanyOnly.html.length).toBeGreaterThan(0);
  });
});

describe("the legacy lane", () => {
  it("renders markdown exactly as before when no fields are stored", () => {
    expect(renderSignature("**Ben**", null)).toEqual({
      html: "<p><strong>Ben</strong></p>",
      text: "**Ben**",
    });
  });

  it("keeps composeEmailBodies byte-identical without a fields argument", () => {
    expect(composeEmailBodies("Hello", "**Ben**").html).toBe("Hello<br><br>-- <br><p><strong>Ben</strong></p>");
  });

  it("uses the table once fields are stored", () => {
    const { html, plainText } = composeEmailBodies("Hello", "", fields());

    expect(html).toContain('<table role="presentation"');
    expect(plainText).toContain("Benjamin Wagner");
  });
});
