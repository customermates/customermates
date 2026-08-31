import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT } from "./walk";

function source(path: string) {
  return readFileSync(join(REPO_ROOT, path), "utf8");
}

describe("German website voice boundary", () => {
  it("uses formal address on public acquisition surfaces", () => {
    const messages = JSON.parse(source("i18n/locales/de.json")) as Record<
      string,
      unknown
    >;
    const publicCopy = JSON.stringify({
      ContactPage: messages.ContactPage,
      DocsPage: messages.DocsPage,
      HomepagePricing: messages.HomepagePricing,
      HomepageStatsRow: messages.HomepageStatsRow,
      NotFoundPage: messages.NotFoundPage,
    });

    expect(publicCopy).toMatch(/Sie|Ihre|Ihnen/u);
    expect(publicCopy).not.toMatch(
      /\b(?:du|dein(?:e|em|en|er|es)?|dir|dich|schreib|schick|starte|betreibe|lass)\b/iu,
    );
    expect(source("content/contact/de/contact.mdx")).toContain(
      "Schreiben Sie dem Gründer",
    );
    expect(source("content/blog/de/blog.mdx")).not.toMatch(
      /\b(?:du|dein(?:e|em|en|er|es)?|dir|dich|starte|nutze)\b/iu,
    );

    const demo = source("components/marketing/product-demo.tsx");
    expect(demo).not.toMatch(
      /\b(?:Verschaffe dir|Öffne|Prüfe|Vergleiche|Probiere)\b/u,
    );
  });

  it("keeps the product-entry auth flow consistently informal", () => {
    for (const file of [
      "forgot-password",
      "reset-password",
      "signin",
      "signup",
    ]) {
      const metadata = source(`content/auth/de/${file}.mdx`);
      expect(metadata, file).not.toMatch(/\b(?:Sie|Ihr(?:e|em|en|er|es)?)\b/u);
      expect(metadata, file).toMatch(
        /\b(?:du|dein(?:e|em|en|er|es)?|dich|dir)\b/iu,
      );
    }
  });
});
