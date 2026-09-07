import { describe, expect, it } from "vitest";

import { isPlainTextEmailBody, splitQuotedText } from "../email-quote";

describe("splitQuotedText", () => {
  it("splits a trailing quote block with its attribution line", () => {
    const text =
      "Heyyyyy\n\n> On 8. Jul 2026, at 17:32, Julian Wagner <julianwagner.ainovi@outlook.de> wrote:\n> \n> Hello there ..... brbrgwtnbw nbwrgnrg\n";

    const result = splitQuotedText(text);

    expect(result.visible).toBe("Heyyyyy");
    expect(result.quoted).toContain("Hello there");
  });

  it("absorbs an unquoted attribution line directly above the quote", () => {
    const text = "Danke dir!\n\nAm 08.07.2026 um 17:32 schrieb Julian Wagner:\n> Hallo zusammen\n> Gruesse";

    const result = splitQuotedText(text);

    expect(result.visible).toBe("Danke dir!");
    expect(result.quoted).toContain("Am 08.07.2026 um 17:32 schrieb Julian Wagner:");
    expect(result.quoted).toContain("> Hallo zusammen");
  });

  it("returns the text unchanged when there is no quote block", () => {
    const text = "Just a normal message\nwith two lines";

    expect(splitQuotedText(text)).toEqual({ visible: text, quoted: null });
  });

  it("keeps a quote-only body unchanged instead of hiding everything", () => {
    const text = "> On Tue wrote:\n> quoted only";

    expect(splitQuotedText(text)).toEqual({ visible: text, quoted: null });
  });

  it("ignores quote markers in the middle of the message", () => {
    const text = "> quoting you here\nMy actual reply comes after";

    expect(splitQuotedText(text)).toEqual({ visible: text, quoted: null });
  });
});

describe("isPlainTextEmailBody", () => {
  it("treats a body whose only angle brackets wrap an email address as plain text", () => {
    expect(
      isPlainTextEmailBody("Heyyyyy\n\n> On 8. Jul 2026, at 17:32, Julian Wagner <julian@outlook.de> wrote:\n> Hi"),
    ).toBe(true);
  });

  it("recognizes paired custom html tags and ignores a bare tag name in prose", () => {
    expect(isPlainTextEmailBody("<section>Hello</section>")).toBe(false);
    expect(isPlainTextEmailBody("Write <div> literally")).toBe(true);
  });

  it("recognizes real html bodies", () => {
    expect(isPlainTextEmailBody('<div dir="ltr">Hello<br></div>')).toBe(false);
    expect(isPlainTextEmailBody("<html><body>Hi</body></html>")).toBe(false);
  });
});
