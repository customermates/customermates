import { describe, expect, it } from "vitest";

import type { EmailSettings } from "../../email-settings";

import {
  DEFAULT_LINK_HEX,
  EmailFontFamily,
  EmailLinkStyle,
  EmailSettingsSchema,
  SIGNATURE_LOGO_URL,
  SignatureTemplate,
  defaultEmailSettings,
  emailLinkContrast,
  isEmailLinkHex,
  isPublicEmailImageUrl,
  normalizeEmailLinkUrl,
  resolveStoredEmailSettings,
} from "../../email-settings";
import { composeEmailBodies, renderSignature } from "../email-signature";
import { renderEmailMarkdown, renderSignatureFields } from "../render-signature";

function settings(overrides: Partial<EmailSettings["signature"]> = {}): EmailSettings {
  const value = defaultEmailSettings();
  value.signature = { ...value.signature, enabled: true, ...overrides };
  return value;
}

function rendered(value: EmailSettings, markdown = "**Benjamin Wagner**  \nFounder at Customermates") {
  const result = renderSignatureFields(value, markdown);
  if (!result) throw new Error("expected a rendered signature");
  return result;
}

describe("email settings", () => {
  it("accepts public HTTPS logo URLs without requiring a file extension", () => {
    expect(isPublicEmailImageUrl("https://images.example.com/assets/logo?id=42")).toBe(true);
    expect(isPublicEmailImageUrl("http://images.example.com/logo.png")).toBe(false);
    expect(isPublicEmailImageUrl("https://localhost/logo.png")).toBe(false);
    expect(isPublicEmailImageUrl("https://localhost./logo.png")).toBe(false);
    expect(isPublicEmailImageUrl("https://asset.internal/logo.png")).toBe(false);
    expect(isPublicEmailImageUrl("https://home.arpa/logo.png")).toBe(false);
    expect(isPublicEmailImageUrl("https://router.home.arpa/logo.png")).toBe(false);
    expect(isPublicEmailImageUrl("https://127.0.0.1/logo.png")).toBe(false);
    expect(isPublicEmailImageUrl("https://127.0.0.1.nip.io/logo.png")).toBe(false);
    expect(isPublicEmailImageUrl("https://[::1]/logo.png")).toBe(false);
    expect(isPublicEmailImageUrl("https://[::127.0.0.1]/logo.png")).toBe(false);
    expect(isPublicEmailImageUrl("https://[fec0::1]/logo.png")).toBe(false);
    expect(isPublicEmailImageUrl("https://user:secret@example.com/logo.png")).toBe(false);
  });

  it("normalizes bare editor links and rejects unsafe schemes", () => {
    expect(normalizeEmailLinkUrl("example.com/path")).toBe("https://example.com/path");
    expect(normalizeEmailLinkUrl("mailto:hello@example.com")).toBe("mailto:hello@example.com");
    expect(normalizeEmailLinkUrl("javascript:alert(1)")).toBeNull();
  });

  it("requires a public logo only while a logo layout is enabled", () => {
    const missing = settings({ logoUrl: "" });
    expect(EmailSettingsSchema.safeParse(missing).success).toBe(false);

    missing.signature.enabled = false;
    expect(EmailSettingsSchema.safeParse(missing).success).toBe(true);

    missing.signature.logoUrl = "not a URL";
    expect(EmailSettingsSchema.safeParse(missing).success).toBe(true);

    missing.signature.enabled = true;
    missing.signature.template = SignatureTemplate.plain;
    expect(EmailSettingsSchema.safeParse(missing).success).toBe(true);
  });

  it("keeps contrast advisory without restricting valid custom colours", () => {
    expect(emailLinkContrast("#5e4ae3").readable).toBe(false);
    expect(emailLinkContrast(DEFAULT_LINK_HEX).readable).toBe(true);
    const custom = settings();
    custom.appearance.linkHex = "#ffffff";
    expect(EmailSettingsSchema.safeParse(custom).success).toBe(true);
  });

  it.each(["#abcdef", "#ABCDEF", "#1a2B3c", "#000000", "#ffffff"])("accepts the custom colour %s", (hex) => {
    const custom = settings();
    custom.appearance.linkHex = hex;
    expect(isEmailLinkHex(hex)).toBe(true);
    expect(EmailSettingsSchema.safeParse(custom).success).toBe(true);
  });

  it.each(["", "#", "#abc", "abcdef", "#gg0000", "#1234567", " #123456", "red", "#123456;outline:0"])(
    "rejects malformed custom colour %s in both the control and saved settings",
    (hex) => {
      const custom = settings();
      custom.appearance.linkHex = hex;
      expect(isEmailLinkHex(hex)).toBe(false);
      expect(EmailSettingsSchema.safeParse(custom).success).toBe(false);
    },
  );

  it("converts legacy structured fields into one Markdown signature", () => {
    const result = resolveStoredEmailSettings("VAT **DE123**", {
      template: SignatureTemplate.sideBySide,
      accent: "green",
      fontSize: 16,
      fullName: "Benjamin Wagner",
      jobTitle: "Founder",
      company: "Customermates",
      email: "mail@customermates.com",
      phone: "+49 170 0000000",
      website: "customermates.com",
      logoUrl: SIGNATURE_LOGO_URL,
    });

    expect(result.migratedLegacyFields).toBe(true);
    expect(result.settings.signature.enabled).toBe(true);
    expect(result.settings.signature.template).toBe(SignatureTemplate.sideBySide);
    expect(result.settings.appearance.fontSize).toBe(16);
    expect(result.settings.appearance.linkHex).toBe("#2ba449");
    expect(result.markdown).toContain("**Benjamin Wagner**");
    expect(result.markdown).toContain("[mail@customermates.com](mailto:mail@customermates.com)");
    expect(result.markdown).toContain("[customermates.com](https://customermates.com)");
    expect(result.markdown).toContain("VAT **DE123**");
  });

  it("falls back to text-only when a legacy logo is absent", () => {
    const result = resolveStoredEmailSettings(null, {
      fullName: "Ben",
      template: SignatureTemplate.stacked,
    });

    expect(result.settings.signature.template).toBe(SignatureTemplate.plain);
    expect(EmailSettingsSchema.safeParse(result.settings).success).toBe(true);
  });

  it("keeps a legacy normal-weight name unbolded", () => {
    const result = resolveStoredEmailSettings(null, {
      fullName: "Ben",
      fontWeight: "normal",
    });

    expect(result.markdown).toBe("Ben");
  });

  it("does not add a logo to an old Markdown-only signature", () => {
    const result = resolveStoredEmailSettings("**Ben**", null);

    expect(result.settings.signature.enabled).toBe(true);
    expect(result.settings.signature.template).toBe(SignatureTemplate.plain);
    expect(result.settings.signature.logoUrl).toBe("");
  });
});

describe("renderEmailMarkdown", () => {
  it("applies the selected font, size, link colour, and link style", () => {
    const value = settings();
    value.appearance = {
      fontFamily: EmailFontFamily.serif,
      fontSize: 16,
      linkHex: "#d23128",
      linkStyle: EmailLinkStyle.plain,
    };
    const { html, text } = renderEmailMarkdown("**Hello** [there](https://example.com)", value.appearance);

    expect(html).toContain("font-family:Georgia,'Times New Roman',serif");
    expect(html).toContain("font-size:16px");
    expect(html).toContain("color:#d23128;text-decoration:none");
    expect(text).toBe("Hello there (https://example.com)");
  });

  it("escapes raw HTML, drops Markdown images, and rejects unsafe link schemes", () => {
    const { html } = renderEmailMarkdown(
      "<script>alert(1)</script> ![tracking](https://example.com/pixel.png) [bad](javascript:alert(1))",
      settings().appearance,
    );

    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).not.toContain('href="javascript:');
    expect(html).toContain("tracking");
  });

  it("upgrades a bare-domain autolink to HTTPS", () => {
    const { html } = renderEmailMarkdown("See customermates.com", settings().appearance);

    expect(html).toContain('href="https://customermates.com"');
    expect(html).not.toContain('href="http://customermates.com"');
  });

  it("keeps one plain-text newline for one Markdown hard break", () => {
    const { text } = renderEmailMarkdown("line 1\\\nline 2", settings().appearance);

    expect(text).toBe("line 1\nline 2");
  });
});

describe("renderSignatureFields", () => {
  it.each([
    [SignatureTemplate.plain, false],
    [SignatureTemplate.stacked, true],
    [SignatureTemplate.sideBySide, true],
  ])("renders the %s layout without a fixed divider", (template, hasLogo) => {
    const { html } = rendered(settings({ template }));

    expect(html.startsWith('<table role="presentation"')).toBe(true);
    expect(html.includes("<img")).toBe(hasLogo);
    expect(html).not.toMatch(/border-(?:top|right|bottom|left):/);
    expect(html).not.toContain("<style");
  });

  it("uses fixed inline logo sizing and an empty decorative alt", () => {
    const { html } = rendered(settings());

    expect(html).toContain(`src="${SIGNATURE_LOGO_URL}"`);
    expect(html).toContain('width="48" height="48" alt=""');
    expect(html).toContain("width:48px;height:48px");
  });

  it("can render a logo-only signature when that is what the user configured", () => {
    const result = renderSignatureFields(settings(), "");

    expect(result?.html).toContain("<img");
    expect(result?.text).toBe("");
  });

  it("emits nothing while disabled and preserves the configured content", () => {
    const value = settings({ enabled: false });

    expect(renderSignatureFields(value, "**Saved content**")).toBeNull();
    value.signature.enabled = true;
    expect(rendered(value, "**Saved content**").html).toContain("<strong>Saved content</strong>");
  });

  it("returns readable plain text with no logo markup", () => {
    const { text } = rendered(settings(), "**Ben** and [a link](https://example.com)");

    expect(text).toBe("Ben and a link (https://example.com)");
    expect(text).not.toContain(SIGNATURE_LOGO_URL);
  });
});

describe("legacy compatibility", () => {
  it("renders an old Markdown-only signature with safe defaults", () => {
    const result = renderSignature("**Ben**", null);

    expect(result?.html).toContain("<strong>Ben</strong>");
    expect(result?.text).toBe("Ben");
  });

  it("still appends an old Markdown-only signature", () => {
    const result = composeEmailBodies("Hello", "**Ben**");

    expect(result.plainText).toContain("Hello\n\n-- \nBen");
    expect(result.html).toContain('data-customermates-signature="true"');
    expect(result.html).toContain("<strong>Ben</strong>");
  });
});
