import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT } from "./walk";

import { LEGAL_DOCUMENT_VERSIONS } from "@/constants/legal-documents";

// Guards the connected-account disclosure (CUS-56) against one-language drift and
// against describing processing the product does not perform.

const LOCALES = ["en", "de"] as const;

const ACCEPTANCE_MESSAGE_KEYS = ["OnboardingForm", "SignUpForm", "SignInForm"] as const;

const REMOVED_SUBJECTS = ["newsletter", "zoom", "google ads", "supabase", "flagcdn"];

function legal(locale: string, slug: string): string {
  return readFileSync(join(REPO_ROOT, "content", "legal", locale, `${slug}.mdx`), "utf8");
}

function locale(name: string): Record<string, Record<string, string>> {
  return JSON.parse(readFileSync(join(REPO_ROOT, "i18n", "locales", `${name}.json`), "utf8"));
}

function richTags(message: string): string[] {
  return [...message.matchAll(/<([a-zA-Z][a-zA-Z0-9]*)>/g)].map((match) => match[1]).sort();
}

describe("legal Unipile disclosure parity", () => {
  it.each(LOCALES)("privacy (%s) names Unipile and links the subprocessor list", (name) => {
    const privacy = legal(name, "privacy");

    expect(privacy).toMatch(/Unipile/);
    expect(privacy).toMatch(/\/subprocessors/);
  });

  it.each(LOCALES)("terms (%s) disclose the Unipile dependency and incorporate the DPA", (name) => {
    const terms = legal(name, "terms");

    expect(terms).toMatch(/Unipile/);
    expect(terms).toMatch(/\/dpa/);
  });

  it.each(LOCALES)("subprocessors (%s) list Unipile and the database processor", (name) => {
    const subprocessors = legal(name, "subprocessors");

    expect(subprocessors).toMatch(/Unipile/);
    expect(subprocessors).toMatch(/Neon/);
  });

  it.each(LOCALES)("dpa (%s) references Art. 28 processing on behalf", (name) => {
    expect(legal(name, "dpa")).toMatch(/Art\.?\s?28|Article\s?28|Auftragsverarbeitung/);
  });
});

describe("legal documents describe only what the product does", () => {
  it.each(LOCALES)("privacy and subprocessors (%s) drop retired subjects", (name) => {
    const text = `${legal(name, "privacy")}\n${legal(name, "subprocessors")}`.toLowerCase();
    const present = REMOVED_SUBJECTS.filter((subject) => text.includes(subject));

    expect(present, `retired subjects still disclosed: ${present.join(", ")}`).toEqual([]);
  });

  it.each(LOCALES)("privacy (%s) does not claim a consent mechanism the product lacks", (name) => {
    expect(legal(name, "privacy")).not.toMatch(/flagcdn|Google Ads/i);
  });
});

describe("managed service and independent self-hosting stay separated", () => {
  it.each(LOCALES)("all operative documents (%s) exclude independent self-hosting", (name) => {
    const exclusions =
      name === "en"
        ? {
            privacy: /does not describe processing performed by an independent self-host operator/,
            terms: /do not govern an independently operated self-hosted installation/,
            dpa: /does not by itself appoint the Provider as processor/,
            subprocessors: /are engaged directly by that operator and are not Customermates subprocessors/,
          }
        : {
            privacy: /beschreibt keine Verarbeitung durch einen unabhängigen Self-Host-Betreiber/,
            terms: /gelten nicht für eine eigenständig betriebene Self-Hosted-Installation/,
            dpa: /bestellt den Anbieter für sich genommen nicht zum Auftragsverarbeiter/,
            subprocessors:
              /werden unmittelbar durch diesen Betreiber beauftragt und sind keine Unterauftragsverarbeiter/,
          };

    for (const [document, exclusion] of Object.entries(exclusions))
      expect(legal(name, document), `${name}/${document} does not exclude independent self-hosting`).toMatch(exclusion);
  });

  it.each(LOCALES)("terms (%s) preserve the previously agreed version for existing customers", (name) => {
    expect(legal(name, "terms")).toMatch(
      name === "en" ? /does not by itself amend an existing contract/ : /ändert einen bestehenden Vertrag nicht/,
    );
  });

  it.each(LOCALES)("legal documents (%s) describe Forward Email's hosted mailbox and narrow role", (name) => {
    const privacy = legal(name, "privacy");
    const dpa = legal(name, "dpa");
    const subprocessors = legal(name, "subprocessors");
    const combined = `${privacy}\n${dpa}\n${subprocessors}`;

    expect(privacy).toMatch(name === "en" ? /final hosted operator mailbox/ : /endgültiges gehostetes Betreiberpostfach/);
    expect(privacy).toMatch(name === "en" ? /encrypted SQLite databases/ : /verschlüsselten SQLite-Datenbanken/);
    expect(privacy).toContain("Cloudflare R2");
    expect(privacy).toMatch(
      name === "en" ? /outbound SMTP emails are stored for approximately 30 days/ : /ausgehende SMTP-E-Mails ungefähr 30 Tage gespeichert/i,
    );
    expect(privacy).toMatch(name === "en" ? /published statements conflict/ : /Aufgrund dieses Widerspruchs/);
    expect(privacy).toMatch(
      name === "en"
        ? /customer determines the legal basis.*documented instructions/
        : /Kunde die Rechtsgrundlage.*dokumentierten Weisungen/,
    );
    expect(privacy).toMatch(
      name === "en"
        ? /No separate downstream mailbox provider is used/
        : /Ein gesonderter nachgelagerter Postfachanbieter wird nicht eingesetzt/,
    );

    expect(dpa).toMatch(/Forward Email/);
    expect(dpa).toMatch(
      name === "en"
        ? /hosts and stores the Provider's final operator mailbox/
        : /hostet und speichert das endgültige Betreiberpostfach/,
    );
    expect(dpa).toMatch(
      name === "en"
        ? /not used for the connected-account feature or ordinary CRM processing/
        : /weder für die Funktion verbundener Konten noch für die gewöhnliche CRM-Verarbeitung/,
    );
    expect(dpa).toMatch(name === "en" ? /support or feedback request/ : /Support- oder Feedbackanfrage/);

    expect(subprocessors).toMatch(/Forward Email/);
    expect(subprocessors).toContain("Cloudflare R2");
    expect(subprocessors).toMatch(
      name === "en"
        ? /not used for connected customer mailboxes or ordinary CRM data/
        : /weder für verbundene Kundenpostfächer noch für gewöhnliche CRM-Daten/,
    );
    expect(subprocessors).toMatch(name === "en" ? /support or feedback request/ : /Support- oder Feedbackanfrage/);
    expect(combined).not.toMatch(
      name === "en"
        ? /forwarded in memory|mailbox provider selected for that account/
        : /im Arbeitsspeicher weitergeleitet|ausgewählten Postfachanbieter/,
    );
  });

  it.each(LOCALES)("affiliate disclosure (%s) records the consent and self-host boundaries", (name) => {
    const text = `${legal(name, "privacy")}\n${legal(name, "subprocessors")}`;

    expect(text).toMatch(/APP_MODE=self-hosted/);
    expect(text).toMatch(
      name === "en"
        ? /consent mechanism is not currently implemented/
        : /Einwilligungsmechanismus ist derzeit nicht implementiert/,
    );
  });
});

describe("legal document versions stay coupled to the acceptance record", () => {
  it.each(LOCALES)("privacy, terms and dpa (%s) carry their version", (name) => {
    expect(legal(name, "privacy")).toContain(LEGAL_DOCUMENT_VERSIONS.privacy);
    expect(legal(name, "terms")).toContain(LEGAL_DOCUMENT_VERSIONS.terms);
    expect(legal(name, "dpa")).toContain(LEGAL_DOCUMENT_VERSIONS.dpa);
  });
});

describe("registration acceptance covers the DPA", () => {
  it.each(LOCALES)("acceptance messages (%s) link the DPA", (name) => {
    const messages = locale(name);

    for (const key of ACCEPTANCE_MESSAGE_KEYS)
      expect(messages[key].agreeToTerms, `${key}.agreeToTerms is missing the DPA link`).toContain("<dpaLink>");
  });

  it("keeps rich-text tags identical across locales", () => {
    const en = locale("en");
    const de = locale("de");

    for (const key of ACCEPTANCE_MESSAGE_KEYS)
      expect(richTags(de[key].agreeToTerms), `${key}.agreeToTerms tag mismatch`).toEqual(
        richTags(en[key].agreeToTerms),
      );
  });

  it.each(LOCALES)("places assent at onboarding rather than sign-in or initial sign-up (%s)", (name) => {
    const messages = locale(name);

    expect(messages.OnboardingForm.agreeToTerms).toMatch(name === "en" ? /business customer/ : /Geschäftskunden/);
    expect(messages.OnboardingForm.agreeToTerms).toMatch(
      name === "en" ? /authorised/ : /zu dessen Vertretung berechtigt/,
    );
    expect(messages.OnboardingForm.agreeToTerms).toMatch(
      name === "en" ? /does not accept those documents/ : /keine Annahme dieser Dokumente/,
    );
    expect(messages.SignUpForm.agreeToTerms).toMatch(
      name === "en" ? /^For the managed service, onboarding will ask/ : /^Für den verwalteten Dienst wirst du/,
    );
    expect(messages.SignUpForm.agreeToTerms).toMatch(name === "en" ? /documents do not apply/ : /Dokumente nicht/);
    expect(messages.SignUpForm.agreeToTerms).not.toMatch(
      name === "en"
        ? /\bBy registering\b|\b(?:I|you)\s+(?:agree|accept|assent)\b/i
        : /\b(?:Beim|Durch das) Registrieren\b|\bdu\s+(?:akzeptierst|stimmst)\b/i,
    );
    expect(messages.SignInForm.agreeToTerms).toMatch(name === "en" ? /^Review our/ : /^Hier kannst du/);
    expect(messages.SignInForm.agreeToTerms).not.toMatch(
      name === "en" ? /\b(?:I|you)\s+(?:agree|accept|assent)\b|\bBy signing in\b/i : /zustimm|akzeptier|Annahme/i,
    );
  });

  it("renders a DPA link in every acceptance surface", () => {
    const surfaces = [
      "app/[locale]/(protected)/onboarding/wizard/components/step-profile.tsx",
      "app/[locale]/(public)/auth/signup/sign-up-form.tsx",
      "app/[locale]/(public)/auth/signin/sign-in-form.tsx",
    ];

    for (const surface of surfaces) {
      const source = readFileSync(join(REPO_ROOT, surface), "utf8");
      expect(source, `${surface} does not render the DPA link`).toContain('href="/dpa"');
    }
  });
});
