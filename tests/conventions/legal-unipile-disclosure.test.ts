import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT, walkFiles } from "./walk";

import { LEGAL_DOCUMENT_VERSIONS } from "@/constants/legal-documents";
import { APP_LOCALES, CONTENT_LOCALES, type AppLocale, type ContentLocale } from "@/i18n/locale-registry";

// Guards the connected-account disclosure (CUS-56) against one-language drift and
// against describing processing the product does not perform.

const LEGAL_COPY_MESSAGES = [
  ["OnboardingForm", "agreeToTerms"],
  ["OnboardingForm", "invitedAgreeToTerms"],
  ["SignUpForm", "agreeToTerms"],
  ["SignInForm", "agreeToTerms"],
] as const;

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

const ONBOARDING_COPY = {
  en: {
    onboarding:
      "I am authorised to act for the business customer and accept the <termsOfServiceLink>Terms</termsOfServiceLink> and <dpaLink>DPA</dpaLink>. I have read the <dataPrivacyLink>Privacy Policy</dataPrivacyLink>.",
    invited:
      "I agree to comply with the <termsOfServiceLink>Terms</termsOfServiceLink> and have read the <dpaLink>DPA</dpaLink> and <dataPrivacyLink>Privacy Policy</dataPrivacyLink>.",
  },
  de: {
    onboarding:
      "Ich bin berechtigt, für den Geschäftskunden zu handeln, und stimme den <termsOfServiceLink>AGB</termsOfServiceLink> sowie dem <dpaLink>AVV</dpaLink> zu. Die <dataPrivacyLink>Datenschutzerklärung</dataPrivacyLink> habe ich gelesen.",
    invited:
      "Ich verpflichte mich, die <termsOfServiceLink>AGB</termsOfServiceLink> einzuhalten, und habe den <dpaLink>AVV</dpaLink> sowie die <dataPrivacyLink>Datenschutzerklärung</dataPrivacyLink> gelesen.",
  },
} satisfies Record<ContentLocale, { onboarding: string; invited: string }>;

const AUTH_CONTINUATION_COPY = {
  en: "By continuing, you agree to our <termsOfServiceLink>Terms</termsOfServiceLink> and acknowledge our <dataPrivacyLink>Privacy Policy</dataPrivacyLink>. See our <dpaLink>DPA</dpaLink>.",
  de: "Mit dem Fortfahren stimmst du unseren <termsOfServiceLink>AGB</termsOfServiceLink> zu und nimmst unsere <dataPrivacyLink>Datenschutzerklärung</dataPrivacyLink> zur Kenntnis. Siehe unseren <dpaLink>AVV</dpaLink>.",
  fr: "En continuant, vous acceptez nos <termsOfServiceLink>conditions générales</termsOfServiceLink> et reconnaissez avoir lu notre <dataPrivacyLink>politique de confidentialité</dataPrivacyLink>. Consultez notre <dpaLink>DPA</dpaLink>.",
  it: "Continuando, accetti i nostri <termsOfServiceLink>Termini</termsOfServiceLink> e dichiari di aver letto la nostra <dataPrivacyLink>Informativa sulla privacy</dataPrivacyLink>. Consulta il nostro <dpaLink>DPA</dpaLink>.",
  es: "Al continuar, aceptas nuestros <termsOfServiceLink>Términos</termsOfServiceLink> y reconoces haber leído nuestra <dataPrivacyLink>Política de privacidad</dataPrivacyLink>. Consulta nuestro <dpaLink>DPA</dpaLink>.",
} satisfies Record<AppLocale, string>;

function legal(locale: string, slug: string): string {
  return readFileSync(join(REPO_ROOT, "content", "legal", locale, `${slug}.mdx`), "utf8");
}

function affiliate(locale: ContentLocale): string {
  return readFileSync(join(REPO_ROOT, "content", "affiliate", locale, "affiliate.mdx"), "utf8");
}

function locale(name: string): Record<string, Record<string, string>> {
  return JSON.parse(readFileSync(join(REPO_ROOT, "i18n", "locales", `${name}.json`), "utf8"));
}

function richTags(message: string): string[] {
  return [...message.matchAll(/<([a-zA-Z][a-zA-Z0-9]*)>/g)].map((match) => match[1]).sort();
}

describe("legal Unipile disclosure parity", () => {
  it.each(CONTENT_LOCALES)("privacy (%s) names Unipile and links the subprocessor list", (name) => {
    const privacy = legal(name, "privacy");

    expect(privacy).toMatch(/Unipile/);
    expect(privacy).toMatch(/\/subprocessors/);
  });

  it.each(CONTENT_LOCALES)("terms (%s) disclose the Unipile dependency and incorporate the DPA", (name) => {
    const terms = legal(name, "terms");

    expect(terms).toMatch(/Unipile/);
    expect(terms).toMatch(/\/dpa/);
  });

  it.each(CONTENT_LOCALES)("subprocessors (%s) list Unipile and the database processor", (name) => {
    const subprocessors = legal(name, "subprocessors");

    expect(subprocessors).toMatch(/Unipile/);
    expect(subprocessors).toMatch(/Neon/);
  });

  it.each(CONTENT_LOCALES)("dpa (%s) references Art. 28 processing on behalf", (name) => {
    expect(legal(name, "dpa")).toMatch(/Art\.?\s?28|Article\s?28|Auftragsverarbeitung/);
  });
});
describe("legal documents describe only what the product does", () => {
  it.each(CONTENT_LOCALES)("privacy and subprocessors (%s) drop retired subjects", (name) => {
    const text = `${legal(name, "privacy")}\n${legal(name, "subprocessors")}`.toLowerCase();
    const present = REMOVED_SUBJECTS.filter((subject) => text.includes(subject));

    expect(present, `retired subjects still disclosed: ${present.join(", ")}`).toEqual([]);
  });

  it.each(CONTENT_LOCALES)("privacy (%s) does not claim a consent mechanism the product lacks", (name) => {
    expect(legal(name, "privacy")).not.toMatch(/Google Ads/i);
  });

  it.each(CONTENT_LOCALES)("privacy and subprocessors (%s) disclose every external image host", (name) => {
    const privacy = legal(name, "privacy");
    const subprocessors = legal(name, "subprocessors");

    for (const host of EXTERNAL_IMAGE_HOSTS) {
      expect(privacy, `${name}/privacy is missing ${host}`).toContain(host);
      expect(subprocessors, `${name}/subprocessors is missing ${host}`).toContain(host);
    }

    expect(privacy).toMatch(name === "en" ? /IP address.*image URL.*browser.*referr/i : /IP-Adresse.*Bild-URL.*Browser.*verweis/i);
  });

  it.each(CONTENT_LOCALES)("legal documents (%s) cover the implemented Unipile social and sales scope", (name) => {
    const text = `${legal(name, "privacy")}\n${legal(name, "dpa")}\n${legal(name, "subprocessors")}`;

    expect(text).toMatch(name === "en" ? /social posts.*comments.*reactions/i : /Beiträge.*Kommentare.*Reaktionen/i);
    expect(text).toMatch(name === "en" ? /relationship requests/i : /Kontaktanfragen/i);
    expect(text).toMatch(name === "en" ? /Sales Navigator.*search.*list/is : /Sales.Navigator.*Such.*Listen/is);
  });

  it.each(CONTENT_LOCALES)("privacy and subprocessors (%s) track the current Neon contract chain", (name) => {
    const text = `${legal(name, "privacy")}\n${legal(name, "subprocessors")}`;

    expect(text).toContain("https://neon.com/platform-terms");
    expect(text).toContain("https://www.databricks.com/legal/databricks-subprocessors");
    expect(text).toMatch(/Grafana Labs/);
    expect(text).not.toMatch(/16 (?:April|\. April) 2026/);
  });
});

describe("managed service and independent self-hosting stay separated", () => {
  it.each(CONTENT_LOCALES)("all operative documents (%s) exclude independent self-hosting", (name) => {
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

  it.each(CONTENT_LOCALES)("terms (%s) preserve the previously agreed version for existing customers", (name) => {
    expect(legal(name, "terms")).toMatch(
      name === "en" ? /does not by itself amend an existing contract/ : /ändert einen bestehenden Vertrag nicht/,
    );
  });

  it.each(CONTENT_LOCALES)(
    "legal documents (%s) describe Forward Email's hosted mailbox and narrow role",
    (name) => {
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

  it.each(CONTENT_LOCALES)("affiliate disclosure (%s) records the disabled integration gate", (name) => {
    const text = `${legal(name, "privacy")}\n${legal(name, "subprocessors")}\n${affiliate(name)}`;

    expect(text).toMatch(
      name === "en"
        ? /optional affiliate tracker is not loaded|does not currently load or initialise the optional affiliate script/i
        : /optionaler Affiliate-Tracker wird weder.*geladen|lädt oder initialisiert das optionale Affiliate-Skript derzeit weder/i,
    );
    expect(affiliate(name)).toMatch(
      name === "en"
        ? /does not currently load Lemon Squeezy's affiliate tracking script/i
        : /lädt das Affiliate-Tracking-Skript von Lemon Squeezy derzeit nicht/i,
    );
    expect(affiliate(name)).toMatch(
      name === "en" ? /registration link opens Lemon Squeezy's hosted website/i : /Partnerregistrierung öffnet.*Lemon Squeezy/i,
    );
    expect(affiliate(name)).not.toMatch(name === "en" ? /30 days/i : /30 Tage/i);
  });

  it("loads only cookieless analytics on managed static content", () => {
    const runtimeFiles = walkFiles(
      REPO_ROOT,
      (path) =>
        /\.(?:ts|tsx)$/.test(path) &&
        !path.includes("/__tests__/") &&
        !path.includes("/tests/") &&
        !path.includes("/scripts/") &&
        !path.endsWith("vitest.config.ts"),
    );
    const runtime = runtimeFiles.map((path) => readFileSync(path, "utf8")).join("\n");
    const analyticsFiles = runtimeFiles
      .filter((path) => readFileSync(path, "utf8").includes("@vercel/analytics"))
      .map((path) => relative(REPO_ROOT, path));
    const staticLayout = readFileSync(join(REPO_ROOT, "app/[locale]/(static)/layout.tsx"), "utf8");

    expect(runtime).not.toContain("lmsqueezy.com/affiliate.js");
    expect(runtime).not.toContain("lemonSqueezyAffiliateConfig");
    expect(runtime).not.toContain("googletagmanager.com");
    expect(runtime).not.toContain("google-analytics.com");
    expect(runtime).not.toContain("@next/third-parties/google");
    expect(runtime).not.toMatch(/\b(?:GoogleAnalytics|GoogleTagManager|sendGAEvent|gtag)\b/);
    expect(analyticsFiles).toEqual(["app/[locale]/(static)/layout.tsx"]);
    expect(staticLayout).toContain('env.APP_MODE === "cloud" ? <Analytics /> : null');
  });
});

describe("legal document versions stay coupled to the acceptance record", () => {
  it.each(CONTENT_LOCALES)("all legal documents (%s) carry their version", (name) => {
    expect(legal(name, "privacy")).toContain(LEGAL_DOCUMENT_VERSIONS.privacy);
    expect(legal(name, "terms")).toContain(LEGAL_DOCUMENT_VERSIONS.terms);
    expect(legal(name, "dpa")).toContain(LEGAL_DOCUMENT_VERSIONS.dpa);
    expect(legal(name, "subprocessors")).toContain(LEGAL_DOCUMENT_VERSIONS.subprocessors);
  });
});

describe("registration legal copy covers the DPA", () => {
  it.each(APP_LOCALES)("legal-document messages (%s) link the DPA", (name) => {
    const messages = locale(name);

    for (const [namespace, key] of LEGAL_COPY_MESSAGES)
      expect(messages[namespace][key], `${namespace}.${key} is missing the DPA link`).toContain("<dpaLink>");
  });

  it.each(APP_LOCALES)("keeps rich-text tags identical across locales (%s)", (name) => {
    const en = locale("en");
    const messages = locale(name);

    for (const [namespace, key] of LEGAL_COPY_MESSAGES)
      expect(richTags(messages[namespace][key]), `${namespace}.${key} tag mismatch`).toEqual(richTags(en[namespace][key]));
  });

  it.each(CONTENT_LOCALES)("keeps the auth continuation notice distinct from explicit onboarding assent (%s)", (name) => {
    const messages = locale(name);
    const expected = ONBOARDING_COPY[name];

    expect(messages.OnboardingForm.agreeToTerms).toBe(expected.onboarding);
    expect(messages.OnboardingForm.invitedAgreeToTerms).toBe(expected.invited);
  });

  it.each(APP_LOCALES)("pins the auth continuation notice in every application locale (%s)", (name) => {
    const messages = locale(name);

    expect(messages.SignUpForm.agreeToTerms).toBe(AUTH_CONTINUATION_COPY[name]);
    expect(messages.SignInForm.agreeToTerms).toBe(AUTH_CONTINUATION_COPY[name]);
  });

  it("renders a DPA link in every legal-copy surface", () => {
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

  it("requires personal cloud onboarding acknowledgement without treating invitees as company acceptors", () => {
    const signInPage = readFileSync(join(REPO_ROOT, "app/[locale]/(public)/auth/signin/page.tsx"), "utf8");
    const signInForm = readFileSync(join(REPO_ROOT, "app/[locale]/(public)/auth/signin/sign-in-form.tsx"), "utf8");
    const signUpForm = readFileSync(join(REPO_ROOT, "app/[locale]/(public)/auth/signup/sign-up-form.tsx"), "utf8");
    const onboarding = readFileSync(
      join(REPO_ROOT, "app/[locale]/(protected)/onboarding/wizard/components/step-profile.tsx"),
      "utf8",
    );
    const registration = readFileSync(join(REPO_ROOT, "features/user/register/register-user.interactor.ts"), "utf8");

    expect(signInPage).toContain("getInviteTokenValidationInteractor");
    expect(signInForm).toContain('appMode === "cloud" && !isInvited');
    expect(signUpForm).toContain('appMode === "cloud" && !isInvited');
    expect(onboarding).toContain('appMode === "cloud"');
    expect(onboarding).toContain("<FormCheckbox");
    expect(onboarding).toContain("required");
    expect(onboarding).toContain("isInvited ?");
    expect(onboarding).toContain('"OnboardingForm.invitedAgreeToTerms"');
    expect(registration).toContain('env.APP_MODE === "cloud" && data.agreeToTerms !== true');
    expect(registration).toContain("if (isNewCloudCompany)");
  });

  it("keeps the legal acceptance page in the app shell while public legal pages remain readable", () => {
    const navigation = readFileSync(join(REPO_ROOT, "app/components/navigation/navigation-switch.tsx"), "utf8");
    const protectedLayout = readFileSync(join(REPO_ROOT, "app/[locale]/(protected)/layout.tsx"), "utf8");
    const sidebar = readFileSync(join(REPO_ROOT, "app/components/app-sidebar.tsx"), "utf8");
    const alert = readFileSync(join(REPO_ROOT, "app/components/navigation/legal-update-alert.tsx"), "utf8");
    const view = readFileSync(
      join(REPO_ROOT, "app/[locale]/(protected)/legal-update/components/legal-update-view.tsx"),
      "utf8",
    );
    const page = readFileSync(join(REPO_ROOT, "app/[locale]/(protected)/legal-update/page.tsx"), "utf8");
    const action = readFileSync(
      join(REPO_ROOT, "app/[locale]/(protected)/legal-update/actions.ts"),
      "utf8",
    );
    const routeGuard = readFileSync(join(REPO_ROOT, "features/auth/route-guard.service.ts"), "utf8");
    const accountState = readFileSync(join(REPO_ROOT, "features/auth/account-state.ts"), "utf8");

    expect(navigation).not.toContain("isLegalUpdateRoute");
    expect(navigation).toContain("legalStatus={legalStatus}");
    expect(protectedLayout).not.toContain("isLegalUpdateRoute");
    expect(routeGuard).toContain('state: "legal"');
    expect(accountState).toContain('legal: "/legal-update"');
    expect(sidebar).toContain("<LegalUpdateAlert");
    expect(sidebar).toContain("<NavMain");
    expect(sidebar.indexOf("<LegalUpdateAlert")).toBeLessThan(sidebar.indexOf("<NavMain"));
    expect(alert).toContain('href="/legal-update"');
    expect(alert).toContain("aria-label");
    expect(alert).not.toContain("useEffect");
    expect(alert).not.toContain("useRouter");
    expect(alert).not.toContain("setTimeout");
    expect(alert).toContain("status.contractNoticeSent");
    expect(alert).toContain("!status.contractAccepted");
    expect(alert).not.toContain("status.informationNoticeVisible");
    expect(alert).toContain("status.mustAccept");
    expect(alert).toContain("border-primary/30 bg-primary/10 text-primary");
    expect(alert).toContain("border-warning/30 bg-warning/10 text-warning");
    expect(page).toContain("status.contractNoticeSent");
    expect(page).toContain("status.contractAccepted");
    expect(page).toContain("status.effectiveAt");
    expect(page).not.toContain("informationNoticeVisible");
    expect(view).not.toContain("informationNoticeVisible");
    expect(view).not.toContain('t("LegalUpdateView.continue")');
    expect(view).toContain("<Label");
    expect(view).not.toContain("items-start gap-3 text-sm");
    expect(view).toContain('variant="secondary"');
    expect(view).not.toContain('t("LegalUpdateView.signOut")');
    expect(action).toContain("refresh()");
    expect(action).toContain('redirect("/")');
    expect(action).not.toContain("revalidatePath");
    expect(action).not.toContain("getLocale");
  });

  it("keeps the UI-only legal restriction out of API routes", () => {
    const apiSources = walkFiles(join(REPO_ROOT, "app", "api"), (path) => /\.(?:ts|tsx)$/.test(path))
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");

    expect(apiSources).not.toContain("getLegalStatusInteractor");
    expect(apiSources).not.toContain("skipLegalAcceptanceCheck");
    expect(apiSources).not.toContain("/legal-update");
  });
});

describe("legal update workflow disclosure", () => {
  it("states the managed-service contract notice and acceptance procedure in both locales", () => {
    const en = legal("en", "terms");
    const de = legal("de", "terms");

    expect(en).toMatch(/automated change notices by email to active system administrators until an authorised/i);
    expect(en).toMatch(/14 calendar days after the first such notice has been successfully sent/i);
    expect(en).toMatch(/Silence or inactivity does not constitute acceptance/i);
    expect(en).toMatch(/restrict access to the managed-service user interface/i);
    expect(en).toMatch(/Price changes remain subject to the separate two-month procedure/i);

    expect(de).toMatch(/automatisierte Änderungsmitteilungen per E-Mail an aktive Systemadministratoren, bis ein berechtigter/i);
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

  it("keeps supplier-originated subprocessor notices tied to the supplier's actual remaining deadline", () => {
    const constants = readFileSync(join(REPO_ROOT, "constants/legal-documents.ts"), "utf8");
    const notices = readFileSync(
      join(REPO_ROOT, "ee/lifecycle/send-legal-document-notices.interactor.ts"),
      "utf8",
    );

    expect(constants).toContain("SUPPLIER_SUBPROCESSOR_OBJECTION_DEADLINE");
    expect(notices).toContain("resolveSupplierSubprocessorObjectionDeadline");
  });

  it("discloses the audit evidence fields, retention behavior, and Resend legal notices", () => {
    const enPrivacy = legal("en", "privacy");
    const dePrivacy = legal("de", "privacy");
    const enSubprocessors = legal("en", "subprocessors");
    const deSubprocessors = legal("de", "subprocessors");

    for (const phrase of [
      "company and user identifiers",
      "audit-record creation time",
      "current document versions",
      "exact documents included in the email",
      "snapshot of the recipient's email address",
      "effective or objection date",
      "initial onboarding",
      "cascade",
    ]) expect(enPrivacy).toContain(phrase);

    for (const phrase of [
      "Unternehmens- und Nutzerkennungen",
      "Erstellungszeitpunkt des Audit-Eintrags",
      "aktuellen Dokumentversionen",
      "genau in der E-Mail aufgeführten Dokumente",
      "Momentaufnahme der E-Mail-Adresse des Empfängers",
      "Wirksamkeits- oder Widerspruchstermin",
      "erstmaligen Onboarding",
      "Kaskadenlöschverhalten",
    ]) expect(dePrivacy).toContain(phrase);

    for (const stale of [
      "deterministic legal-version key",
      "Resend provider message ID",
      "deployed Git commit",
      "selected locale",
    ])
      expect(enPrivacy).not.toContain(stale);
    for (const stale of [
      "deterministischen Rechtsdokument-Versionsschlüssel",
      "Resend-Nachrichtenkennung",
      "eingesetzten Git-Commit",
      "gewählte Sprache",
    ])
      expect(dePrivacy).not.toContain(stale);

    expect(enPrivacy).toMatch(/notices about updated Terms.*Data Processing Agreement.*Privacy Policy.*subprocessors/i);
    expect(dePrivacy).toMatch(/Mitteilungen über aktualisierte AGB.*AVV.*Datenschutzerklärung.*Unterauftragsverarbeiter/i);
    expect(enSubprocessors).toMatch(/Resend[\s\S]*notices about updated Terms/i);
    expect(deSubprocessors).toMatch(/Resend[\s\S]*Mitteilungen über aktualisierte AGB/i);
  });

  it("keeps the legal flow free of superseded deployment and deterministic-key machinery", () => {
    const productionPaths = [
      "constants/legal-documents.ts",
      "ee/lifecycle/send-legal-document-notices.interactor.ts",
      "features/email/email.service.ts",
      "features/legal/accept-legal-documents.interactor.ts",
      "features/legal/get-legal-status.interactor.ts",
      "features/user/register/register-user.interactor.ts",
      "components/emails/legal-document-notice-contract.tsx",
      "components/emails/legal-document-notice-information.tsx",
      "env.ts",
    ];
    const productionFlow = productionPaths.map((path) => readFileSync(join(REPO_ROOT, path), "utf8")).join("\n");

    for (const stale of [
      "VERCEL_GIT_COMMIT_SHA",
      "deployedGitCommit",
      "providerMessageId",
      "idempotencyKey",
      "revisionUrl",
      "LEGAL_CONTRACT_KEY",
      "LEGAL_INFORMATION_KEY",
    ])
      expect(productionFlow).not.toContain(stale);

    const schema = readFileSync(join(REPO_ROOT, "prisma/schema.prisma"), "utf8");
    expect(schema).not.toContain("@@index([companyId, event, entityId, userId])");
    expect(
      existsSync(join(REPO_ROOT, "prisma/migrations/20260807133000_legal_audit_lookup/migration.sql")),
    ).toBe(false);
  });
});
