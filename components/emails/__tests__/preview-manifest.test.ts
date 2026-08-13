import type { ElementType } from "react";
import type { AppLocale } from "@/i18n/locale-registry";
import type { EmailPreviewManifestEntry, EmailPreviewSpec } from "../preview-manifest";

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { extname, join, relative, sep } from "node:path";

import { render } from "@react-email/render";
import { createElement } from "react";
import { describe, expect, it } from "vitest";

import enMessages from "@/i18n/locales/en.json";
import { APP_LOCALES, DEFAULT_LOCALE } from "@/i18n/locale-registry";
import { walkFiles } from "@/tests/conventions/walk";

import { EmailLayout } from "../base/email-layout";
import {
  EMAIL_PREVIEW_MANIFEST,
  emailPreviewEntryPath,
  previewLocalesFor,
  renderEmailPreview,
} from "../preview-manifest";
import LegalInformationPreview from "../variants/legal-document-notice-information";
import SubscriptionInactivationNoticePreview from "../variants/subscription-inactivation-notice";

const ROOT = process.cwd();

type PreviewComponent = ElementType & {
  PreviewProps?: Record<string, unknown>;
};

const VARIANT_COMPONENTS: Record<string, PreviewComponent> = {
  "variants/legal-document-notice-information.tsx": LegalInformationPreview,
  "variants/subscription-inactivation-notice.tsx": SubscriptionInactivationNoticePreview,
};

const LEGAL_DOCUMENT_DATES = {
  de: "7. August 2026",
  en: "August 7, 2026",
  es: "7 de agosto de 2026",
  fr: "7 août 2026",
  it: "7 agosto 2026",
} satisfies Record<AppLocale, string>;

function productionEmailSends(): string[] {
  return ["app", "core", "ee", "features"]
    .flatMap((directory) =>
      walkFiles(
        join(ROOT, directory),
        (path) => /\.(?:ts|tsx)$/.test(path) && !path.includes("/__tests__/") && !path.includes(".test."),
      ),
    )
    .flatMap((path) =>
      [...readFileSync(path, "utf8").matchAll(/\bemailService\.send\s*\(/g)].map(() => relative(ROOT, path)),
    )
    .sort();
}

function topLevelTemplates(): string[] {
  return readdirSync(join(ROOT, "components/emails"))
    .filter((name) => name.endsWith(".tsx"))
    .map((name) => `components/emails/${name}`)
    .sort();
}

function discoveredPreviewEntries(): string[] {
  const emailsRoot = join(ROOT, "components/emails");

  return walkFiles(emailsRoot, (path) => {
    const relativePath = relative(emailsRoot, path);
    const directories = relativePath.split(sep).slice(0, -1);
    if (directories.some((directory) => directory.startsWith("_") || directory === "static")) return false;
    if (![".js", ".jsx", ".tsx"].includes(extname(path))) return false;

    const fileContents = readFileSync(path, "utf8");
    return (
      /\bexport\s+default\b/m.test(fileContents) ||
      /\bmodule\.exports\s*=/m.test(fileContents) ||
      /\bexport\s+\{[^}]*\bdefault\b[^}]*\}/m.test(fileContents)
    );
  })
    .map((path) => relative(emailsRoot, path))
    .sort();
}

function previewCases() {
  return EMAIL_PREVIEW_MANIFEST.flatMap((definition) =>
    definition.previews.map((previewValue) => {
      const preview: EmailPreviewSpec = previewValue;

      return {
        component: preview.entryPath ? VARIANT_COMPONENTS[preview.entryPath] : definition.template,
        definition,
        entryPath: emailPreviewEntryPath(definition, preview),
        preview,
      };
    }),
  );
}

function renderFixture(definition: EmailPreviewManifestEntry, preview: EmailPreviewSpec, locale: AppLocale) {
  return renderEmailPreview(definition.key, {
    locale,
    variant: preview.variant,
  });
}

describe("transactional email preview inventory", () => {
  it("maps all 14 production sends onto the 13 production templates", () => {
    expect(EMAIL_PREVIEW_MANIFEST).toHaveLength(14);
    expect(new Set(EMAIL_PREVIEW_MANIFEST.map(({ key }) => key)).size).toBe(14);
    expect(new Set(EMAIL_PREVIEW_MANIFEST.map(({ templatePath }) => templatePath)).size).toBe(13);
    expect([...new Set(EMAIL_PREVIEW_MANIFEST.map(({ templatePath }) => templatePath))].sort()).toEqual(
      topLevelTemplates(),
    );
  });

  it("pins every behavior to an existing send source and imported template", () => {
    for (const definition of EMAIL_PREVIEW_MANIFEST) {
      const source = join(ROOT, definition.sourcePath);
      const template = join(ROOT, definition.templatePath);
      expect(existsSync(source), definition.sourcePath).toBe(true);
      expect(existsSync(template), definition.templatePath).toBe(true);
      expect(
        readFileSync(source, "utf8"),
        `${definition.sourcePath} does not import ${definition.templatePath}`,
      ).toContain(`@/${definition.templatePath.replace(/\.tsx$/, "")}`);
    }
  });

  it("reverse-inventories every production EmailService send call", () => {
    expect(EMAIL_PREVIEW_MANIFEST.map(({ sourcePath }) => sourcePath).sort()).toEqual(productionEmailSends());
  });

  it("keeps recipient localization and internal English explicit", () => {
    expect(EMAIL_PREVIEW_MANIFEST.filter(({ audience }) => audience === "recipient-localized")).toHaveLength(10);
    expect(EMAIL_PREVIEW_MANIFEST.filter(({ audience }) => audience === "operator-english")).toHaveLength(4);

    for (const definition of EMAIL_PREVIEW_MANIFEST) {
      expect(previewLocalesFor(definition.key)).toEqual(
        definition.audience === "recipient-localized" ? APP_LOCALES : [DEFAULT_LOCALE],
      );
    }
  });

  it("exposes every behavior and variant as one of 15 preview-server entries", () => {
    const cases = previewCases();
    const entries = cases.map(({ entryPath }) => entryPath).sort();

    expect(cases).toHaveLength(15);
    expect(new Set(entries).size).toBe(15);
    expect(discoveredPreviewEntries()).toEqual(entries);
    expect(Object.keys(VARIANT_COMPONENTS).sort()).toEqual(
      cases
        .filter(({ preview }) => preview.entryPath)
        .map(({ entryPath }) => entryPath)
        .sort(),
    );
    expect(existsSync(join(ROOT, "components/emails/static/customermates-icon.svg"))).toBe(true);
    expect(readFileSync(join(ROOT, "components/emails/static/customermates-icon.svg"), "utf8")).toBe(
      readFileSync(join(ROOT, "public/images/light/customermates-square.svg"), "utf8"),
    );
  });

  it("renders each discovered entry from its real PreviewProps", async () => {
    for (const { component, definition, entryPath, preview } of previewCases()) {
      expect(component, entryPath).toBeDefined();
      expect(component?.PreviewProps, entryPath).toBeDefined();

      const actual = await render(createElement(component as PreviewComponent, component?.PreviewProps ?? {}));

      expect(actual, entryPath).toMatch(/<html[^>]*\blang="en"/i);
      expect(actual).toContain("/static/customermates-icon.svg");
      expect(actual).not.toContain("/images/email/customermates-icon@2x.png");
      expect(actual).not.toMatch(/\{(?:firstName|inviterName|accounts|plan|deadline)\}/);

      if (preview.entryPath)
        expect(actual, entryPath).toBe(await render(renderFixture(definition, preview, DEFAULT_LOCALE)));
      else expect(`components/emails/${entryPath}`).toBe(definition.templatePath);
    }
  }, 15_000);
});

describe("transactional email preview rendering", () => {
  it("renders every behavior, locale, and variant from synthetic fixtures", async () => {
    let renderCount = 0;

    for (const definition of EMAIL_PREVIEW_MANIFEST) {
      for (const locale of previewLocalesFor(definition.key)) {
        for (const preview of definition.previews) {
          const fixture = renderFixture(definition, preview, locale);
          const html = await render(fixture);
          const plainText = await render(fixture, { plainText: true });
          renderCount += 1;

          expect(html, `${definition.key}/${locale}/${preview.variant}`).toMatch(
            new RegExp(`<html[^>]*\\blang="${locale}"`, "i"),
          );
          expect(html).toContain("/static/customermates-icon.svg");
          expect(html).not.toContain("/images/email/customermates-icon@2x.png");
          expect(html).not.toMatch(/\{(?:firstName|inviterName|accounts|plan|deadline)\}/);
          expect(html).not.toContain("jane@example.com");
          expect(plainText.toLocaleLowerCase()).toContain(
            definition.expectedText(locale, preview.variant).toLocaleLowerCase(),
          );

          if (definition.key === "legal-document-notice") {
            expect(plainText).toContain(LEGAL_DOCUMENT_DATES[locale]);
            expect(plainText).not.toContain("2026-08-07");
          }
        }
      }
    }

    expect(renderCount).toBe(59);
  }, 15_000);

  it.each(EMAIL_PREVIEW_MANIFEST.filter(({ audience }) => audience === "operator-english").map(({ key }) => key))(
    "forces the internal %s preview to English",
    async (key) => {
      const html = await render(renderEmailPreview(key, { locale: "de" }));
      expect(html).toMatch(/<html[^>]*\blang="en"/i);
      expect(html).toContain("The agentic, open-source CRM");
    },
  );

  it("keeps the legal contract and information fixtures semantically distinct", async () => {
    const contract = await render(
      renderEmailPreview("legal-document-notice", {
        locale: "en",
        variant: "contract",
      }),
    );
    const information = await render(
      renderEmailPreview("legal-document-notice", {
        locale: "en",
        variant: "information",
      }),
    );

    expect(contract).not.toBe(information);
    expect(contract).toContain(enMessages.LegalDocumentNotice.contractTitle);
    expect(contract).toContain(enMessages.LegalDocumentNotice.contractDeadlineLabel);
    expect(contract).toContain('href="https://preview.example.test/terms"');
    expect(contract).toContain('href="https://preview.example.test/dpa"');
    expect(information).toContain(enMessages.LegalDocumentNotice.informationTitle);
    expect(information).toContain(enMessages.LegalDocumentNotice.subprocessorDeadlineLabel);
    expect(information).not.toContain('href="https://preview.example.test/terms"');
    expect(information).not.toContain('href="https://preview.example.test/dpa"');
  });

  it("keeps production delivery on the absolute public email asset", async () => {
    const html = await render(
      createElement(
        EmailLayout,
        {
          layoutCopy: {
            country: "Germany",
            tagline: "Synthetic production render",
          },
          locale: "en",
          title: "Production asset contract",
        },
        "Body",
      ),
    );

    expect(html).toContain('src="http://localhost:4000/images/email/customermates-icon@2x.png"');
  });
});
