import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT } from "./walk";

import { LEGAL_DOCUMENT_VERSIONS } from "@/constants/legal-documents";

// Guards the connected-account disclosure (CUS-56) against one-language drift and
// against describing processing the product does not perform.

const LOCALES = ["en", "de"] as const;

const ACCEPTANCE_MESSAGE_KEYS = ["OnboardingForm", "SignUpForm", "SignInForm"] as const;

const REMOVED_SUBJECTS = ["newsletter", "zoom", "google ads", "supabase"];

const EXTERNAL_IMAGE_HOSTS = [
  "flagcdn.com",
  "uneed.best",
  "b.sf-syn.com",
  "twelve.tools",
  "wired.business",
  "startupfa.me",
  "open-launch.com",
] as const;

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
    expect(legal(name, "privacy")).not.toMatch(/Google Ads/i);
  });

  it.each(LOCALES)("privacy and subprocessors (%s) disclose every external image host", (name) => {
    const privacy = legal(name, "privacy");
    const subprocessors = legal(name, "subprocessors");

    for (const host of EXTERNAL_IMAGE_HOSTS) {
      expect(privacy, `${name}/privacy is missing ${host}`).toContain(host);
      expect(subprocessors, `${name}/subprocessors is missing ${host}`).toContain(host);
    }

    expect(privacy).toMatch(name === "en" ? /IP address.*image URL.*browser.*referr/i : /IP-Adresse.*Bild-URL.*Browser.*verweis/i);
  });

  it.each(LOCALES)("legal documents (%s) cover the implemented Unipile social and sales scope", (name) => {
    const text = `${legal(name, "privacy")}\n${legal(name, "dpa")}\n${legal(name, "subprocessors")}`;

    expect(text).toMatch(name === "en" ? /social posts.*comments.*reactions/i : /Beiträge.*Kommentare.*Reaktionen/i);
    expect(text).toMatch(name === "en" ? /relationship requests/i : /Kontaktanfragen/i);
    expect(text).toMatch(name === "en" ? /Sales Navigator.*search.*list/is : /Sales.Navigator.*Such.*Listen/is);
  });

  it.each(LOCALES)("privacy and subprocessors (%s) track the current Neon contract chain", (name) => {
    const text = `${legal(name, "privacy")}\n${legal(name, "subprocessors")}`;

    expect(text).toContain("https://neon.com/platform-terms");
    expect(text).toContain("https://www.databricks.com/legal/databricks-subprocessors");
    expect(text).toMatch(/Grafana Labs/);
    expect(text).not.toMatch(/16 (?:April|\. April) 2026/);
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
    expect(privacy).toMatch(
      name === "en"
        ? /content, attachments, headers, delivery and security metadata/
        : /Nachrichteninhalte, Anhänge, Kopfzeilen, Zustellungs- und Sicherheitsmetadaten/,
    );
    expect(privacy).toMatch(
      name === "en"
        ? /standard data processing agreement is accepted electronically through its service Terms/
        : /Standard-Auftragsverarbeitungsvertrag.*elektronisch über dessen Nutzungsbedingungen angenommen/,
    );
    expect(privacy).toMatch(
      name === "en"
        ? /Standard Contractual Clauses for applicable transfers/
        : /einschlägige Übermittlungen.*EU-Standardvertragsklauseln/,
    );
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
    expect(subprocessors).toMatch(
      name === "en"
        ? /not used for connected customer mailboxes or ordinary CRM data/
        : /weder für verbundene Kundenpostfächer noch für gewöhnliche CRM-Daten/,
    );
    expect(subprocessors).toMatch(name === "en" ? /support or feedback correspondence/ : /Support- oder Feedbackkorrespondenz/);
    expect(subprocessors).toMatch(
      name === "en"
        ? /standard DPA is accepted electronically through its service Terms/
        : /Standard-AVV.*elektronisch über dessen Nutzungsbedingungen angenommen/,
    );
    expect(combined).not.toMatch(
      name === "en"
        ? /forwarded in memory|mailbox provider selected for that account/
        : /im Arbeitsspeicher weitergeleitet|ausgewählten Postfachanbieter/,
    );
  });

  it.each(LOCALES)("affiliate disclosure (%s) records the consent and current self-host behavior", (name) => {
    const text = `${legal(name, "privacy")}\n${legal(name, "subprocessors")}`;

    expect(text).toMatch(
      name === "en"
        ? /does not suppress the script solely because `APP_MODE=self-hosted` is set/
        : /unterdrückt das Skript nicht allein deshalb, weil `APP_MODE=self-hosted` gesetzt ist/,
    );
    expect(text).toMatch(
      name === "en"
        ? /consent mechanism is not currently implemented/
        : /Einwilligungsmechanismus ist derzeit nicht implementiert/,
    );
  });
});

describe("legal document versions stay coupled to the acceptance record", () => {
  it.each(LOCALES)("all legal documents (%s) carry their version", (name) => {
    expect(legal(name, "privacy")).toContain(LEGAL_DOCUMENT_VERSIONS.privacy);
    expect(legal(name, "terms")).toContain(LEGAL_DOCUMENT_VERSIONS.terms);
    expect(legal(name, "dpa")).toContain(LEGAL_DOCUMENT_VERSIONS.dpa);
    expect(legal(name, "subprocessors")).toContain(LEGAL_DOCUMENT_VERSIONS.subprocessors);
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
    const expected = name === "en"
      ? {
          onboarding:
            "I am authorised to act for the business customer and accept the <termsOfServiceLink>Terms</termsOfServiceLink> and <dpaLink>DPA</dpaLink>. I have read the <dataPrivacyLink>Privacy Policy</dataPrivacyLink>.",
          auth: "See our <termsOfServiceLink>Terms</termsOfServiceLink>, <dpaLink>DPA</dpaLink>, and <dataPrivacyLink>Privacy Policy</dataPrivacyLink>.",
        }
      : {
          onboarding:
            "Ich bin berechtigt, für den Geschäftskunden zu handeln, und stimme den <termsOfServiceLink>AGB</termsOfServiceLink> sowie dem <dpaLink>AVV</dpaLink> zu. Die <dataPrivacyLink>Datenschutzerklärung</dataPrivacyLink> habe ich gelesen.",
          auth: "Siehe unsere <termsOfServiceLink>AGB</termsOfServiceLink>, unseren <dpaLink>AVV</dpaLink> und unsere <dataPrivacyLink>Datenschutzerklärung</dataPrivacyLink>.",
        };

    expect(messages.OnboardingForm.agreeToTerms).toBe(expected.onboarding);
    expect(messages.SignUpForm.agreeToTerms).toBe(expected.auth);
    expect(messages.SignInForm.agreeToTerms).toBe(expected.auth);
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

  it("limits hosted legal copy and acceptance to non-invited cloud company creation", () => {
    const signInPage = readFileSync(join(REPO_ROOT, "app/[locale]/(public)/auth/signin/page.tsx"), "utf8");
    const signInForm = readFileSync(join(REPO_ROOT, "app/[locale]/(public)/auth/signin/sign-in-form.tsx"), "utf8");
    const signUpForm = readFileSync(join(REPO_ROOT, "app/[locale]/(public)/auth/signup/sign-up-form.tsx"), "utf8");
    const onboarding = readFileSync(
      join(REPO_ROOT, "app/[locale]/(protected)/onboarding/wizard/components/step-profile.tsx"),
      "utf8",
    );

    expect(signInPage).toContain("getInviteTokenValidationInteractor");
    expect(signInForm).toContain('appMode === "cloud" && !isInvited');
    expect(signUpForm).toContain('appMode === "cloud" && !isInvited');
    expect(onboarding).toContain('appMode === "cloud" && !isInvited');
  });

  it("keeps the forced legal route isolated while public legal pages remain readable", () => {
    const navigation = readFileSync(join(REPO_ROOT, "app/components/navigation/navigation-switch.tsx"), "utf8");
    const protectedLayout = readFileSync(join(REPO_ROOT, "app/[locale]/(protected)/layout.tsx"), "utf8");
    const banner = readFileSync(join(REPO_ROOT, "app/components/legal-update-banner.tsx"), "utf8");
    const view = readFileSync(
      join(REPO_ROOT, "app/[locale]/(protected)/legal-update/components/legal-update-view.tsx"),
      "utf8",
    );
    const action = readFileSync(
      join(REPO_ROOT, "app/[locale]/(protected)/legal-update/actions.ts"),
      "utf8",
    );

    expect(navigation).toMatch(/if \(isLegalUpdateRoute\)/);
    expect(protectedLayout).toContain("!isLegalUpdateRoute");
    expect(banner).toContain("isPublicPathname(pathname)");
    expect(banner).toContain("window.location.replace");
    expect(view).toContain("status.contractNoticeSent");
    expect(view).toContain("!status.mustAccept");
    expect(view).toContain('t("signOut")');
    expect(action).toContain('revalidatePath("/", "layout")');
    expect(action).toContain("RedirectType.replace");
  });
});

describe("legal update workflow disclosure", () => {
  it("states the managed-service contract notice and acceptance procedure in both locales", () => {
    const en = legal("en", "terms");
    const de = legal("de", "terms");

    expect(en).toMatch(/automated change notice to every active system administrator/i);
    expect(en).toMatch(/14 calendar days after the first such notice has been successfully sent/i);
    expect(en).toMatch(/Silence or inactivity does not constitute acceptance/i);
    expect(en).toMatch(/restrict access to the managed-service user interface/i);
    expect(en).toMatch(/Price changes remain subject to the separate two-month procedure/i);

    expect(de).toMatch(/automatisierte Änderungsmitteilung an jeden aktiven Systemadministrator/i);
    expect(de).toMatch(/14 Kalendertage nach dem ersten erfolgreichen Versand/i);
    expect(de).toMatch(/Schweigen oder Untätigkeit gelten nicht als Zustimmung/i);
    expect(de).toMatch(/Zugang zur Benutzeroberfläche des verwalteten Dienstes/i);
    expect(de).toMatch(/Preisänderungen unterliegen weiterhin dem gesonderten Zweimonatsverfahren/i);
  });

  it("keeps electronic DPA acceptance separate from the subprocessor objection process", () => {
    const en = legal("en", "dpa");
    const de = legal("de", "dpa");

    expect(en).toMatch(/authorised system administrator accepts it electronically/i);
    expect(en).toMatch(/separate notice and objection procedure/i);
    expect(de).toMatch(/berechtigter Systemadministrator.*elektronisch/i);
    expect(de).toMatch(/gesonderten Mitteilungs- und Widerspruchsverfahren/i);
  });

  it("discloses the audit evidence fields, retention behavior, and Resend legal notices", () => {
    const enPrivacy = legal("en", "privacy");
    const dePrivacy = legal("de", "privacy");
    const enSubprocessors = legal("en", "subprocessors");
    const deSubprocessors = legal("de", "subprocessors");

    for (const phrase of [
      "deterministic legal-version key",
      "email-address snapshot",
      "Resend provider message ID",
      "deployed Git commit",
      "initial onboarding",
      "cascade",
    ]) expect(enPrivacy).toContain(phrase);

    for (const phrase of [
      "deterministischen Rechtsdokument-Versionsschlüssel",
      "E-Mail-Adressmomentaufnahme",
      "Resend-Nachrichtenkennung",
      "eingesetzten Git-Commit",
      "erstmaligen Onboarding",
      "Kaskadenlöschverhalten",
    ]) expect(dePrivacy).toContain(phrase);

    expect(enPrivacy).toMatch(/notices about updated Terms.*Data Processing Agreement.*Privacy Policy.*subprocessors/i);
    expect(dePrivacy).toMatch(/Mitteilungen über aktualisierte AGB.*AVV.*Datenschutzerklärung.*Unterauftragsverarbeiter/i);
    expect(enSubprocessors).toMatch(/Resend[\s\S]*notices about updated Terms/i);
    expect(deSubprocessors).toMatch(/Resend[\s\S]*Mitteilungen über aktualisierte AGB/i);
  });
});
