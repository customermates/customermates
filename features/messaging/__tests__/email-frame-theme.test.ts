import { describe, expect, it } from "vitest";

import { emailFrameThemeCss, emailFrameTone, supportsDarkMode } from "../email-frame-theme";
import { renderEmailMarkdown } from "@/ee/messaging/outbound/render-signature";
import { composeEmailBodies, toEmailHtml } from "@/ee/messaging/outbound/email-signature";
import { defaultEmailSettings } from "@/ee/messaging/email-settings";

const palette = {
  background: "#151518",
  foreground: "#fafafa",
  muted: "#a1a1a8",
  link: "#7c6df2",
  border: "rgb(255 255 255 / 22%)",
  fontFamily: "Inter, sans-serif",
};

function parse(html: string) {
  return new DOMParser().parseFromString(html, "text/html");
}

describe("emailFrameTone", () => {
  it("themes Customermates markdown, signature and plain-text bodies", () => {
    const settings = defaultEmailSettings();
    const signed = composeEmailBodies("Hi **Anna**,\n\n- one\n- two", "**Max**", settings, "markdown").html;
    expect(emailFrameTone(renderEmailMarkdown("Hello", settings.appearance).html)).toBe("own");
    expect(emailFrameTone(signed)).toBe("own");
    expect(emailFrameTone(toEmailHtml("Plain body", "plain_text", settings))).toBe("own");
    expect(
      emailFrameTone(
        `${renderEmailMarkdown("Reply", settings.appearance).html}<div class="gmail_quote"><p>Earlier</p></div>`,
      ),
    ).toBe("own");
  });

  it("keeps external HTML external even when it quotes a Customermates email", () => {
    const own = renderEmailMarkdown("Original", defaultEmailSettings().appearance).html;
    expect(emailFrameTone(`<div dir="ltr">Thanks!</div><blockquote>${own}</blockquote>`)).toBe("paper");
    expect(emailFrameTone(`Loose text ${own}`)).toBe("paper");
    expect(emailFrameTone('<table><tr><td style="background:#0f4c5c">Brand</td></tr></table>')).toBe("paper");
  });

  it("renders external HTML with its own dark mode adaptively", () => {
    expect(
      emailFrameTone('<html><head><meta name="color-scheme" content="light dark"></head><body>Hi</body></html>'),
    ).toBe("adaptive");
    expect(
      emailFrameTone("<style>@media (prefers-color-scheme: dark) { body { background: #000 } }</style><p>Hi</p>"),
    ).toBe("adaptive");
  });
});

describe("supportsDarkMode", () => {
  it.each([
    '<meta name="color-scheme" content="light dark">',
    '<meta name="supported-color-schemes" content="light dark">',
    "<style>:root { color-scheme: light dark; }</style>",
    "<style>@media screen and (prefers-color-scheme:dark){.a{color:#fff}}</style>",
    "<style>[data-ogsc] .a { color: #fff }</style>",
    '<div style="color-scheme: dark">Hi</div>',
  ])("detects %s", (html) => {
    expect(supportsDarkMode(parse(html))).toBe(true);
  });

  it.each([
    '<meta name="color-scheme" content="light">',
    "<style>@media (prefers-color-scheme: light) { .a { color: #000 } }</style>",
    '<p style="color:#fafafa;background:#121212">Dark by default</p>',
  ])("ignores %s", (html) => {
    expect(supportsDarkMode(parse(html))).toBe(false);
  });
});

describe("emailFrameThemeCss", () => {
  it("paints own emails with the app palette and scheme, scoped to Customermates markers", () => {
    const css = emailFrameThemeCss("own", "dark", palette);
    expect(css).toContain("color-scheme: dark");
    expect(css).toContain("background: #151518");
    expect(css).toContain("color: #fafafa");
    expect(css).toContain("font-family: Inter, sans-serif");
    expect(css).toMatch(/\[data-customermates-email-markdown\][^{]*a \{ color: #7c6df2 !important/);
    expect(css).toContain("[data-customermates-signature] { color: #a1a1a8 !important; }");
  });

  it("leaves paper untouched and lets adaptive emails follow their own media queries", () => {
    expect(emailFrameThemeCss("paper", "dark", palette)).toBe("");
    const adaptive = emailFrameThemeCss("adaptive", "dark", palette);
    expect(adaptive).toContain("color-scheme: light dark");
    expect(adaptive).not.toContain("!important");
    expect(adaptive).not.toContain(palette.background);
  });
});
