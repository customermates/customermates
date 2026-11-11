import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { AD_ATTRIBUTION_NOTICE_VERSION, LEGAL_DOCUMENT_VERSIONS } from "@/constants/legal-documents";
import { CONTENT_LOCALES, type ContentLocale } from "@/i18n/locale-registry";

import { REPO_ROOT } from "./walk";

const SUBPROCESSOR_VERSION_HEADER = {
  de: /^_Stand: (\d{4}-\d{2}-\d{2})_$/m,
  en: /^_Last updated: (\d{4}-\d{2}-\d{2})_$/m,
  fr: /^_Dernière mise à jour\u00a0: (\d{4}-\d{2}-\d{2})_$/m,
  it: /^_Ultimo aggiornamento: (\d{4}-\d{2}-\d{2})_$/m,
  es: /^_Última actualización: (\d{4}-\d{2}-\d{2})_$/m,
  pt: /^_Última atualização: (\d{4}-\d{2}-\d{2})_$/m,
  pl: /^_Ostatnia aktualizacja: (\d{4}-\d{2}-\d{2})_$/m,
  nl: /^_Laatst bijgewerkt: (\d{4}-\d{2}-\d{2})_$/m,
} satisfies Record<ContentLocale, RegExp>;

function legal(locale: ContentLocale, slug: string): string {
  return readFileSync(join(REPO_ROOT, "content", "legal", locale, `${slug}.mdx`), "utf8");
}

function versionHeader(locale: ContentLocale, slug: string): string {
  const content = legal(locale, slug);
  const header =
    slug === "subprocessors"
      ? content.match(SUBPROCESSOR_VERSION_HEADER[locale])
      : content.match(/^_(?:Versione?|Versión|Versão|Wersja|Versie) (\d{4}-\d{2}-\d{2})(?:[^\n]*)_$/m);
  expect(header, `${locale}/${slug} has no ISO version header`).not.toBeNull();
  return header![1];
}

describe("legal document versions", () => {
  it.each(["terms", "privacy", "dpa", "subprocessors"] as const)(
    "keeps %s content locales and the application constant equal",
    (slug) => {
      for (const locale of CONTENT_LOCALES) {
        expect(versionHeader(locale, slug)).toBe(LEGAL_DOCUMENT_VERSIONS[slug]);
      }
    },
  );
  it("keeps the advertising consent version independent of, and never ahead of, the privacy notice", () => {
    expect(AD_ATTRIBUTION_NOTICE_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(
      AD_ATTRIBUTION_NOTICE_VERSION <= LEGAL_DOCUMENT_VERSIONS.privacy,
      "AD_ATTRIBUTION_NOTICE_VERSION dates what the advertising Allow covers. It moves only when that scope changes, which is a change to the notice, so it can never be later than the privacy version.",
    ).toBe(true);
  });

  it.each(CONTENT_LOCALES)("keeps the %s notice's promise that only a scope change voids an advertising consent", (locale) => {
    const privacy = legal(locale, "privacy");
    expect(
      privacy,
      `${locale}/privacy must say that only a change to what the Allow covers voids it, because AD_ATTRIBUTION_NOTICE_VERSION is bumped deliberately rather than on every edit`,
    ).toMatch(
      {
        en: /If we change what your Allow covers, your earlier decision is treated as if it had not been given/i,
        de: /Ändern wir den Umfang Ihrer Einwilligung, gilt Ihre frühere Entscheidung als nicht erteilt/i,
        fr: /Si nous modifions l’étendue de votre consentement, votre décision antérieure est réputée non donnée/i,
        it: /Se modifichiamo l’ambito del consenso dell’utente, la decisione precedente vale come non prestata/i,
        es: /Si modificamos el alcance de tu consentimiento, tu decisión anterior se considera no otorgada/i,
        pt: /Se alterarmos o alcance do seu consentimento, a sua decisão anterior passa a valer como não dada/i,
        pl: /Jeżeli zmienimy zakres twojej zgody, twoja wcześniejsza decyzja jest traktowana jako niewyrażona/i,
        nl: /Wijzigen wij de reikwijdte van je toestemming, dan geldt je eerdere beslissing als niet gegeven/i,
      }[locale],
    );
    expect(
      privacy,
      `${locale}/privacy must say that a factual correction leaves the decision in place`,
    ).toMatch(
      {
        en: /leaves your decision in place/i,
        de: /lässt Ihre Entscheidung bestehen/i,
        fr: /laisse votre décision en vigueur/i,
        it: /lascia in vigore la decisione dell’utente/i,
        es: /deja subsistente tu decisión/i,
        pt: /mantém a sua decisão/i,
        pl: /pozostawia twoją decyzję w mocy/i,
        nl: /laat je beslissing bestaan/i,
      }[locale],
    );
  });
});
