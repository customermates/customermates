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

const REMOVED_SUBJECTS = ["newsletter", "zoom", "supabase", "komoot"];

const EXTERNAL_IMAGE_HOSTS = [
  "flagcdn.com",
  "uneed.best",
  "b.sf-syn.com",
  "twelve.tools",
  "wired.business",
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
  fr: {
    onboarding:
      "Je suis habilité à agir pour le client professionnel et j’accepte les <termsOfServiceLink>conditions générales</termsOfServiceLink> et le <dpaLink>DPA</dpaLink>. J’ai lu la <dataPrivacyLink>politique de confidentialité</dataPrivacyLink>.",
    invited:
      "J’accepte de respecter les <termsOfServiceLink>conditions générales</termsOfServiceLink> et j’ai lu le <dpaLink>DPA</dpaLink> ainsi que la <dataPrivacyLink>politique de confidentialité</dataPrivacyLink>.",
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
    expect(legal(name, "dpa")).toMatch(/Art\.?\s?28|art\.\s28 du RGPD|Article\s?28|Auftragsverarbeitung/);
  });
});
describe("legal documents describe only what the product does", () => {
  it.each(CONTENT_LOCALES)("privacy and subprocessors (%s) drop retired subjects", (name) => {
    const text = `${legal(name, "privacy")}\n${legal(name, "subprocessors")}`.toLowerCase();
    const present = REMOVED_SUBJECTS.filter((subject) => text.includes(subject));

    expect(present, `retired subjects still disclosed: ${present.join(", ")}`).toEqual([]);
  });

  it.each(CONTENT_LOCALES)("privacy (%s) bounds the first-party advertising attribution", (name) => {
    const privacy = legal(name, "privacy");

    for (const kind of ["gclid", "gbraid", "wbraid", "oppref", "rdt_cid", "li_fat_id"])
      expect(privacy, `${name}/privacy does not name ${kind}`).toContain(kind);

    for (const recipient of ["Google", "OpenAI", "Reddit", "LinkedIn"])
      expect(privacy, `${name}/privacy does not name ${recipient}`).toContain(recipient);

    expect(privacy).toMatch(
      { en: /consent.*Privacy choices.*withdraw/is, de: /Einwilligung.*Datenschutzauswahl.*widerruf/is, fr: /consentement.*Choix de confidentialité.*retir/is }[name],
    );
    expect(privacy).toMatch({ en: /89 days.*30 days/is, de: /89 Tage.*30 Tage/is, fr: /89 jours.*30 jours/is }[name]);
    expect(privacy).toMatch(
      { en: /no directly identifying data is transmitted.*no hashed email address.*no IP address/is, de: /keine unmittelbar identifizierenden Daten übermittelt.*keine gehashte E-Mail-Adresse.*keine IP-Adresse/is, fr: /aucune donnée directement identifiante n’est transmise.*ni adresse e-mail hachée.*ni adresse IP/is }[name],
    );
    expect(privacy).toMatch({ en: /Reporting is not automatic/i, de: /Rückmeldung erfolgt nicht automatisch/i, fr: /Le retour d’information n’est pas automatique/i }[name]);
    expect(privacy).toMatch(/cm_ad_attribution/);
    for (const company of ["Google LLC", "Reddit, Inc.", "LinkedIn Corporation"])
      expect(privacy, `${name}/privacy does not name the receiving company ${company}`).toContain(company);
    expect(privacy, `${name}/privacy does not state the recipients' role`).toMatch(
      { en: /independent controller/i, de: /eigenst\u00e4ndig Verantwortlich/i, fr: /responsable du traitement à part entière/i }[name],
    );
    expect(privacy, `${name}/privacy does not state the transfer basis`).toMatch(
      { en: /Data Privacy Framework/i, de: /Data Privacy Framework/i, fr: /Data Privacy Framework/i }[name],
    );
    expect(privacy, `${name}/privacy does not describe the recipients as conditional`).toMatch(
      { en: /Potential recipients of such a report/i, de: /Mögliche Empfänger einer solchen Meldung/i, fr: /destinataires possibles d’un tel signalement/i }[name],
    );
    expect(privacy, `${name}/privacy still claims a live Google reporting route`).not.toMatch(
      /spreadsheet in a Customermates Google account|Tabelle in einem Google-Konto/i,
    );
    expect(privacy).toMatch(
      { en: /standard contractual clauses/i, de: /Standardvertragsklauseln/i, fr: /clauses contractuelles types/i }[name],
    );
    expect(privacy).toMatch(
      { en: /No advertising pixel, tag, measurement SDK/is, de: /weder Werbepixel noch Tags oder Mess-SDKs/is, fr: /n’employons ni pixels publicitaires, ni balises, ni SDK de mesure/is }[name],
    );
  });

  it.each(CONTENT_LOCALES)("privacy and subprocessors (%s) disclose every external image host", (name) => {
    const privacy = legal(name, "privacy");
    const subprocessors = legal(name, "subprocessors");

    for (const host of EXTERNAL_IMAGE_HOSTS) {
      expect(privacy, `${name}/privacy is missing ${host}`).toContain(host);
      expect(subprocessors, `${name}/subprocessors is missing ${host}`).toContain(host);
    }

    expect(privacy).toMatch({ en: /IP address.*image URL.*browser.*referr/i, de: /IP-Adresse.*Bild-URL.*Browser.*verweis/i, fr: /adresse IP.*URL de l’image.*navigateur.*référent/i }[name]);
  });

  it.each(CONTENT_LOCALES)("legal documents (%s) cover the implemented Unipile social and sales scope", (name) => {
    const text = `${legal(name, "privacy")}\n${legal(name, "dpa")}\n${legal(name, "subprocessors")}`;

    expect(text).toMatch({ en: /social posts.*comments.*reactions/i, de: /Beiträge.*Kommentare.*Reaktionen/i, fr: /publications sur les réseaux sociaux.*commentaires.*réactions/i }[name]);
    expect(text).toMatch({ en: /relationship requests/i, de: /Kontaktanfragen/i, fr: /demandes de connexion/i }[name]);
    expect(text).toMatch({ en: /Sales Navigator.*search.*list/is, de: /Sales.Navigator.*Such.*Listen/is, fr: /Sales Navigator.*recherche.*listes/is }[name]);
  });

  it.each(CONTENT_LOCALES)("privacy and subprocessors (%s) track the current Neon contract chain", (name) => {
    const text = `${legal(name, "privacy")}\n${legal(name, "subprocessors")}`;

    expect(text).toContain("https://neon.com/platform-terms");
    expect(text).toContain("https://www.databricks.com/legal/databricks-subprocessors");
    expect(text).toMatch(/Grafana Labs/);
    expect(text).not.toMatch(/16 (?:April|\. April) 2026/);
  });

  it.each(CONTENT_LOCALES)("privacy and subprocessors (%s) disclose active Mate processing", (name) => {
    const privacy = legal(name, "privacy");
    const dpa = legal(name, "dpa");
    const subprocessors = legal(name, "subprocessors");
    const terms = legal(name, "terms");
    const text = `${privacy}\n${dpa}\n${subprocessors}\n${terms}`;

    expect(text).toMatch(/Mate/);
    expect(text).toMatch(/Vercel AI Gateway/);
    expect(text).toMatch(/Anthropic/);
    expect(text).toMatch(/Exa Labs, Inc\./);
    expect(text).toMatch(/TypeSafe AI/);
    expect(`${privacy}\n${dpa}\n${terms}`).not.toMatch(/Azure/);
    expect(subprocessors).not.toMatch(/^\| \*\*Microsoft Azure\*\*/m);
    expect(privacy).toMatch(
      { en: /active in the managed service since 29 August 2026/, de: /seit dem 29\. August 2026 aktiv/, fr: /actif dans ce service depuis le 29 août 2026/ }[name],
    );
    expect(dpa).toMatch(
      { en: /when a user invokes Mate.*Vercel AI Gateway.*selected model.*downstream provider.*Subprocessors/is, de: /wenn ein Nutzer Mate (?:interaktiv )?aufruft.*Vercel AI Gateway.*ausgewählte Modell.*nachgelagerten Anbieter.*Unterauftragsverarbeiter/is, fr: /lorsqu’un utilisateur appelle Mate.*Vercel AI Gateway.*modèle sélectionné.*fournisseur de modèle en aval.*sous-traitants ultérieurs/is }[name],
    );
    expect(dpa).toMatch(
      { en: /independent controller are outside this DPA.*do not themselves store prompt.*tool-result content/is, de: /eigenständiger Verantwortlicher.*außerhalb dieses AVV.*speichern selbst aber keine Eingaben.*Werkzeugergebnisse/is, fr: /responsable du traitement à part entière.*en dehors du présent DPA.*ne stockent eux-mêmes aucune saisie.*résultat d’outil/is }[name],
    );
    expect(terms).toMatch(
      { en: /Mate generates output automatically.*may be inaccurate/is, de: /Mate erzeugt Ausgaben automatisiert.*können unrichtig/is, fr: /Mate produit ses résultats de manière automatisée.*peuvent être inexacts/is }[name],
    );
    expect(terms).toMatch(
      { en: /at least 16 years old.*under 18.*Art\. 9 GDPR.*Art\. 10 GDPR.*legal or material impact.*every person.*complies/is, de: /mindestens 16 Jahre alt.*unter 18 Jahren.*Art\. 9 DSGVO.*Art\. 10 DSGVO.*rechtliche oder wesentliche Auswirkungen.*jede Person.*einhält/is, fr: /au moins 16 ans.*moins de 18 ans.*art\. 9 du RGPD.*art\. 10 du RGPD.*effets juridiques ou significatifs.*toute personne.*respecte/is }[name],
    );
    expect(terms).toMatch(
      { en: /applicable legal basis.*data minimisation.*safeguards appropriate to the risk.*Art\. 9 GDPR.*Art\. 10 GDPR/is, de: /anwendbare Rechtsgrundlage.*Datenminimierung.*dem Risiko angemessene Schutzvorkehrungen.*Art\. 9 DSGVO.*Art\. 10 DSGVO/is, fr: /base juridique applicable.*minimisation des données.*mesures de protection adaptées au risque.*art\. 9 du RGPD.*art\. 10 du RGPD/is }[name],
    );
    expect(privacy).toMatch(
      { en: /applicable legal basis.*data minimisation.*safeguards appropriate to the risk.*Art\. 9 GDPR.*Art\. 10 GDPR/is, de: /anwendbare Rechtsgrundlage.*Datenminimierung.*dem Risiko angemessene Schutzvorkehrungen.*Art\. 9 DSGVO.*Art\. 10 DSGVO/is, fr: /base juridique applicable.*minimisation des données.*mesures de protection adaptées au risque.*art\. 9 du RGPD.*art\. 10 du RGPD/is }[name],
    );
    expect(dpa).toMatch(
      { en: /applicable legal basis.*data minimisation.*safeguards appropriate to the risk.*Art\. 9 GDPR.*Art\. 10 GDPR/is, de: /anwendbare Rechtsgrundlage.*Datenminimierung.*dem Risiko angemessene Schutzvorkehrungen.*Art\. 9 DSGVO.*Art\. 10 DSGVO/is, fr: /base juridique applicable.*minimisation des données.*mesures de protection adaptées au risque.*art\. 9 du RGPD.*art\. 10 du RGPD/is }[name],
    );
    expect(subprocessors).toMatch(
      { en: /customer determines.*necessity.*applicable legal basis.*safeguards appropriate to the risk/is, de: /Kunde bestimmt.*Erforderlichkeit.*anwendbare Rechtsgrundlage.*dem Risiko angemessene Schutzvorkehrungen/is, fr: /client détermine.*nécessité.*base juridique applicable.*mesures de protection adaptées au risque/is }[name],
    );
    expect(terms).toMatch(
      { en: /Where the managed service offers.*Routines.*saved or automated Mate runs.*manual execution.*schedule.*configured in-product event.*standing documented instruction.*without separate case-by-case confirmation/is, de: /Soweit der verwaltete Dienst.*Routines.*gespeicherte oder automatisierte Mate-Durchläufe.*anbietet.*manuellen Ausführung.*Zeitplan.*konfigurierten produktinternen Ereignis.*dokumentierte Dauerweisung.*ohne gesonderte Bestätigung im Einzelfall/is, fr: /Lorsque le service géré propose.*routines.*exécutions de Mate enregistrées ou automatisées.*exécution manuelle.*calendrier.*évènement interne au produit configuré.*instruction permanente documentée.*sans confirmation distincte dans le cas particulier/is }[name],
    );
    expect(privacy).toMatch(
      { en: /During interactive use.*must be checked before it is relied on.*Where a Routine is offered and enabled.*before activation or material change.*monitor operation and results.*without separate case-by-case confirmation/is, de: /Bei interaktiver Nutzung.*müssen geprüft werden.*Soweit eine Routine angeboten und aktiviert ist.*vor der Aktivierung oder einer wesentlichen Änderung.*Betrieb und Ergebnisse überwachen.*ohne gesonderte Bestätigung im Einzelfall/is, fr: /En cas d’utilisation interactive.*doivent être vérifiés avant de vous y fier.*Lorsqu’une routine est proposée et activée.*avant l’activation ou une modification substantielle.*surveiller le fonctionnement et les résultats.*sans confirmation distincte dans le cas particulier/is }[name],
    );
    expect(privacy).toMatch(
      { en: /full saved instruction.*recurring safety checks.*possible trigger loops.*before a Routine run starts/is, de: /vollständige gespeicherte Weisung.*wiederkehrender Sicherheitsprüfungen.*mögliche Auslöserschleifen.*bevor ein Routine-Durchlauf beginnt/is, fr: /instruction enregistrée complète.*contrôles de sécurité récurrents.*boucles de déclenchement.*avant qu’une exécution de routine ne démarre/is }[name],
    );
    expect(dpa).toMatch(
      { en: /deleting a saved Routine does not itself delete Mate conversations.*separately deleted/is, de: /Löschen einer gespeicherten Routine.*nicht automatisch.*Mate-Konversationen.*gesondert/is, fr: /suppression d’une routine enregistrée ne supprime pas automatiquement les conversations Mate.*supprimées séparément/is }[name],
    );
    expect(text).not.toMatch(
      { en: /(?:must not (?:submit or make available|send|instruct Mate to process)|Users must not include) sensitive personal information/i, de: /(?:darf keine sensiblen personenbezogenen Informationen|dürfen (?:über Mate )?keine sensiblen personenbezogenen Informationen|darf den Anbieter nicht anweisen, mit Mate sensible personenbezogene Informationen)/i, fr: /(?:ne (?:doit|doivent) pas (?:soumettre|transmettre|envoyer|inclure|mettre à disposition).*(?:informations|données) (?:personnelles |à caractère personnel )?sensibles|ne doit pas (?:donner au Prestataire l’instruction|charger le Prestataire) de traiter.*(?:informations|données) (?:personnelles |à caractère personnel )?sensibles)/i }[name],
    );
    expect(privacy).toMatch(
      { en: /output about a person.*legal or material impact/is, de: /Ausgaben über eine Person.*rechtliche oder wesentliche Auswirkungen/is, fr: /résultats concernant une personne.*effets juridiques ou significatifs/is }[name],
    );
    expect(subprocessors).toMatch(
      { en: /Google Cloud \(Vertex AI\).*Active downstream inference provider.*Anthropic-created Claude models.*text-embedding model.*United States region/is, de: /Google Cloud \(Vertex AI\).*Aktiver nachgelagerter Inferenzanbieter.*von Anthropic entwickelten Claude-Modelle.*Text-Embedding-Modell.*Region in den Vereinigten Staaten/is, fr: /Google Cloud \(Vertex AI\).*Fournisseur d’inférence en aval actif.*modèles Claude développés par Anthropic.*modèle d’embedding de texte.*région des États-Unis/is }[name],
    );
    expect(privacy).toMatch(
      { en: /team-wide.*Zero Data Retention.*every AI Gateway request.*ZDR agreement.*prompt-training opt-out/is, de: /teamweite.*Zero-Data-Retention.*jede AI-Gateway-Anfrage.*ZDR-Vereinbarung.*Training/is, fr: /Zero Data Retention.*à l’échelle de l’équipe.*chaque requête AI Gateway.*accord ZDR.*entraînement/is }[name],
    );
    expect(privacy).toMatch(
      { en: /do not delete, shorten, or otherwise change.*Customermates application-level storage/is, de: /löschen, verkürzen oder ändern nicht.*Speicherung auf Anwendungsebene bei Customermates/is, fr: /ne suppriment, ne raccourcissent ni ne modifient le stockage au niveau de l’application chez Customermates/is }[name],
    );
    expect(subprocessors).toMatch(
      { en: /Zero Data Retention provider list does not include Exa.*does not identify the exact legal entity or the inference location/is, de: /Zero-Data-Retention-Anbieterliste von Vercel enthält Exa nicht.*weder die genaue Rechtseinheit noch den Inferenzstandort/is, fr: /liste de fournisseurs Zero Data Retention de Vercel ne contient pas Exa.*ni l’entité juridique exacte ni le lieu d’inférence/is }[name],
    );
    expect(text).not.toMatch(
      { en: /(?:routes?|sends?|transfers?) (?:model )?(?:requests?|request context|prompts?|outputs?).*to OpenAI|(?:requests?|request context|prompts?|outputs?) (?:are |is )?(?:routed|sent|transferred)(?: through [^.]+)? to OpenAI|OpenAI (?:receives|processes) (?:Mate )?(?:requests?|prompts?|outputs?)|absence of a public Zero Data Retention promise for Customermates/i, de: /leitet.*(?:Anfragen?|Anfragekontext|Eingaben?|Ausgaben?).*an OpenAI weiter|(?:Anfragen?|Anfragekontext|Eingaben?|Ausgaben?).*an OpenAI (?:weitergeleitet|gesendet|übermittelt)|OpenAI (?:erhält|verarbeitet).*(?:Anfragen?|Eingaben?|Ausgaben?)|fehlenden öffentlichen Versprechens von Zero Data Retention für Customermates/i, fr: /(?:transmet|achemine|envoie|transfère).*(?:requêtes?|contexte de (?:la )?requête|saisies?|sorties?|résultats?).*à OpenAI|(?:requêtes?|contexte de (?:la )?requête|saisies?|sorties?|résultats?).*(?:sont |est )?(?:transmis|acheminés?|envoyés?|transférés?).*à OpenAI|OpenAI (?:reçoit|traite).*(?:requêtes?|saisies?|sorties?)|absence d’engagement public de Zero Data Retention pour Customermates/i }[name],
    );
    expect(privacy).toMatch(
      { en: /stores Mate conversations and messages.*tool receipts and results/is, de: /speichert Mate-Konversationen und -Nachrichten.*Werkzeugbelege und -ergebnisse/is, fr: /stocke les conversations et messages Mate.*justificatifs et résultats d’outils/is }[name],
    );
    expect(privacy).toMatch(
      { en: /Archiving a conversation hides it but does not delete it/, de: /Archivieren einer Konversation blendet sie aus, löscht sie aber nicht/, fr: /L’archivage d’une conversation la masque, mais ne la supprime pas/ }[name],
    );
    expect(text).not.toMatch(
      { en: /Planned AI Assistant|feature is not yet available|no data is currently transferred to OpenAI/i, de: /Geplanter KI-Assistent|Funktion ist noch nicht verfügbar|keine Daten an OpenAI übermittelt/i, fr: /Assistant IA prévu|fonction n’est pas encore disponible|aucune donnée n’est (?:actuellement )?transmise à OpenAI/i }[name],
    );
  });
});

describe("managed service and independent self-hosting stay separated", () => {
  it.each(CONTENT_LOCALES)("all operative documents (%s) exclude independent self-hosting", (name) => {
    const exclusions = {
      en: {
        privacy: /does not describe processing performed by an independent self-host operator/,
        terms: /do not govern an independently operated self-hosted installation/,
        dpa: /does not by itself appoint the Provider as processor/,
        subprocessors: /are engaged directly by that operator and are not Customermates subprocessors/,
      },
      de: {
        privacy: /beschreibt keine Verarbeitung durch einen unabhängigen Self-Host-Betreiber/,
        terms: /gelten nicht für eine eigenständig betriebene Self-Hosted-Installation/,
        dpa: /bestellt den Anbieter für sich genommen nicht zum Auftragsverarbeiter/,
        subprocessors: /werden unmittelbar durch diesen Betreiber beauftragt und sind keine Unterauftragsverarbeiter/,
      },
      fr: {
        privacy: /ne décrit aucun traitement effectué par un exploitant indépendant en auto-hébergement/,
        terms: /ne s’appliquent pas à une installation auto-hébergée exploitée de manière autonome/,
        dpa: /ne fait pas, en soi, du Prestataire un sous-traitant/,
        subprocessors: /sont mandatés directement par cet exploitant et ne sont pas des sous-traitants ultérieurs/,
      },
    }[name];

    for (const [document, exclusion] of Object.entries(exclusions))
      expect(legal(name, document), `${name}/${document} does not exclude independent self-hosting`).toMatch(exclusion);
  });

  it.each(CONTENT_LOCALES)("terms (%s) preserve the previously agreed version for existing customers", (name) => {
    expect(legal(name, "terms")).toMatch(
      { en: /does not by itself amend an existing contract/, de: /ändert einen bestehenden Vertrag nicht/, fr: /ne modifie pas un contrat existant/ }[name],
    );
  });

  it.each(CONTENT_LOCALES)(
    "legal documents (%s) describe Forward Email's hosted mailbox and narrow role",
    (name) => {
    const privacy = legal(name, "privacy");
    const dpa = legal(name, "dpa");
    const subprocessors = legal(name, "subprocessors");
    const combined = `${privacy}\n${dpa}\n${subprocessors}`;

    expect(privacy).toMatch({ en: /final hosted operator mailbox/, de: /endgültiges gehostetes Betreiberpostfach/, fr: /boîte aux lettres d’exploitation hébergée finale/ }[name]);
    expect(privacy).toMatch(
      { en: /content, attachments, headers, delivery and security metadata/, de: /Nachrichteninhalte, Anhänge, Kopfzeilen, Zustellungs- und Sicherheitsmetadaten/, fr: /le contenu des messages, les pièces jointes, les en-têtes, les métadonnées de remise et de sécurité/ }[name],
    );
    expect(privacy).toMatch(
      { en: /standard data processing agreement is accepted electronically through its service Terms/, de: /Standard-Auftragsverarbeitungsvertrag.*elektronisch über dessen Nutzungsbedingungen angenommen/, fr: /accord de traitement des données standard de Forward Email est accepté par voie électronique par l’intermédiaire de ses conditions d’utilisation/ }[name],
    );
    expect(privacy).toMatch(
      { en: /Standard Contractual Clauses for applicable transfers/, de: /einschlägige Übermittlungen.*EU-Standardvertragsklauseln/, fr: /pour les transferts concernés, les clauses contractuelles types de l’UE/ }[name],
    );
    expect(privacy).toMatch(
      { en: /customer determines the legal basis.*documented instructions/, de: /Kunde die Rechtsgrundlage.*dokumentierten Weisungen/, fr: /le client détermine la base juridique.*instructions documentées/ }[name],
    );
    expect(privacy).toMatch(
      { en: /No separate downstream mailbox provider is used/, de: /Ein gesonderter nachgelagerter Postfachanbieter wird nicht eingesetzt/, fr: /Aucun fournisseur de boîte aux lettres en aval distinct n’est employé/ }[name],
    );

    expect(dpa).toMatch(/Forward Email/);
    expect(dpa).toMatch(
      { en: /hosts and stores the Provider's final operator mailbox/, de: /hostet und speichert das endgültige Betreiberpostfach/, fr: /héberge et stocke la boîte aux lettres d’exploitation finale/ }[name],
    );
    expect(dpa).toMatch(
      { en: /not used for the connected-account feature or ordinary CRM processing/, de: /weder für die Funktion verbundener Konten noch für die gewöhnliche CRM-Verarbeitung/, fr: /n’est employé ni pour la fonction de comptes connectés ni pour le traitement CRM ordinaire/ }[name],
    );
    expect(dpa).toMatch({ en: /support or feedback request/, de: /Support- oder Feedbackanfrage/, fr: /demande de support ou de retour d’information/ }[name]);

    expect(subprocessors).toMatch(/Forward Email/);
    expect(subprocessors).toMatch(
      { en: /not used for connected customer mailboxes or ordinary CRM data/, de: /weder für verbundene Kundenpostfächer noch für gewöhnliche CRM-Daten/, fr: /ni pour les boîtes aux lettres connectées des clients ni pour les données CRM ordinaires/ }[name],
    );
    expect(subprocessors).toMatch({ en: /support or feedback correspondence/, de: /Support- oder Feedbackkorrespondenz/, fr: /correspondance de support ou de retour d’information/ }[name]);
    expect(subprocessors).toMatch(
      { en: /standard DPA is accepted electronically through its service Terms/, de: /Standard-AVV.*elektronisch über dessen Nutzungsbedingungen angenommen/, fr: /DPA standard de Forward Email est accepté par voie électronique par l’intermédiaire de ses conditions d’utilisation/ }[name],
    );
    expect(combined).not.toMatch(
      { en: /forwarded in memory|mailbox provider selected for that account/, de: /im Arbeitsspeicher weitergeleitet|ausgewählten Postfachanbieter/, fr: /transférés? en mémoire|fournisseur de boîte aux lettres sélectionné pour ce compte/ }[name],
    );
  });

  it.each(CONTENT_LOCALES)("affiliate disclosure (%s) records the standard managed-cloud integration", (name) => {
    const text = `${legal(name, "privacy")}\n${legal(name, "subprocessors")}\n${affiliate(name)}`;

    expect(text).toMatch(
      { en: /standard affiliate (?:tracking )?script.*managed-cloud public content pages/i, de: /verwalteten öffentlichen Cloud-Inhaltsseiten.*standardmäßige Affiliate-Tracking-Skript/i, fr: /script (?:de suivi )?d’affiliation standard.*pages de contenu (?:cloud publiques gérées|public du cloud géré)/i }[name],
    );
    expect(text).toContain("ls_aff_ref");
    expect(text).toContain("lmsqueezy.com");
    expect(text).toMatch({ en: /browser-derived visitor identifier/i, de: /Browsermerkmalen abgeleitete Besucherkennung/i, fr: /identifiant de visiteur dérivé (?:de caractéristiques )?du navigateur/i }[name]);
    expect(text).toMatch(
      { en: /attribute referred visits and purchases.*allocate commission/is, de: /vermittelte Besuche und Käufe zuzuordnen.*Provisionen zuzuweisen/is, fr: /attribuer les visites et (?:les )?achats recommandés.*(?:affecter les commissions|répartir la commission)/is }[name],
    );
    expect(text).toMatch(
      { en: /ordinary network-request data.*without an affiliate code/is, de: /Netzwerk-Anfragedaten.*ohne Affiliate-Code/is, fr: /données de requête réseau ordinaires.*sans code d’affiliation/is }[name],
    );
    expect(legal(name, "privacy")).toMatch(/§ 25(?:\(1\)| Abs\. 1| al\. 1) TDDDG/);
    expect(text).toMatch(
      { en: /not gated by a separate Customermates consent mechanism/i, de: /nicht durch einen gesonderten Einwilligungsmechanismus von Customermates gesteuert/i, fr: /n’est pas (?:piloté par|soumis à) un mécanisme de consentement distinct de Customermates/i }[name],
    );
    expect(text).toMatch({ en: /upstream self-hosted routes do not load/i, de: /vorgelagerte Self-Hosted-Routen laden.*nicht/i, fr: /routes auto-hébergées en amont ne (?:le )?chargent pas/i }[name]);
    expect(affiliate(name)).toMatch(
      { en: /name: Tracking on customermates\.com\s+source: Enabled/i, de: /name: Tracking auf customermates\.com\s+source: Aktiv/i, fr: /name: Suivi sur customermates\.com\s+source: Activé/i }[name],
    );
    expect(affiliate(name)).not.toMatch({ en: /source: Disabled/i, de: /source: Deaktiviert/i, fr: /source: Désactivé/i }[name]);
    expect(affiliate(name)).toMatch(
      { en: /registration link opens Lemon Squeezy's hosted website/i, de: /Partnerregistrierung öffnet.*Lemon Squeezy/i, fr: /lien d’inscription au programme d’affiliation ouvre le site hébergé de Lemon Squeezy/i }[name],
    );
    expect(affiliate(name)).not.toMatch({ en: /30 days/i, de: /30 Tage/i, fr: /30 jours/i }[name]);
    expect(affiliate(name)).not.toMatch(
      { en: /monthly payouts from €9|source: Monthly|Every month automatically/i, de: /monatliche Auszahlung|source: Monatlich|Jeden Monat automatisch/i, fr: /versements mensuels|paiements? mensuels?|source: Mensuel|Chaque mois automatiquement/i }[name],
    );
  });

  it("loads the standard affiliate integration and only cookieless analytics on managed static content", () => {
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
    const affiliateFiles = runtimeFiles
      .filter((path) => /lmsqueezy\.com\/affiliate\.js|lemonSqueezyAffiliateConfig/.test(readFileSync(path, "utf8")))
      .map((path) => relative(REPO_ROOT, path));
    const rootLayout = readFileSync(join(REPO_ROOT, "app/layout.tsx"), "utf8");
    const staticLayout = readFileSync(join(REPO_ROOT, "app/[locale]/(static)/layout.tsx"), "utf8");

    const affiliateLoader = readFileSync(join(REPO_ROOT, "components/acquisition/lemon-squeezy-affiliate.ts"), "utf8");
    const affiliateScript = readFileSync(
      join(REPO_ROOT, "components/acquisition/lemon-squeezy-affiliate-script.tsx"),
      "utf8",
    );
    const affiliateMounts = runtimeFiles
      .filter((path) => readFileSync(path, "utf8").includes("<LemonSqueezyAffiliateScript"))
      .map((path) => relative(REPO_ROOT, path));

    expect(affiliateFiles).toEqual(["components/acquisition/lemon-squeezy-affiliate.ts"]);
    expect(affiliateMounts).toEqual(["app/[locale]/(static)/layout.tsx"]);
    expect(rootLayout).not.toContain("lemonSqueezyAffiliateConfig");
    expect(rootLayout).not.toContain("lmsqueezy.com/affiliate.js");
    expect(rootLayout).not.toContain("LemonSqueezyAffiliateScript");
    expect(staticLayout).toContain('env.APP_MODE === "cloud"');
    expect(staticLayout.indexOf('env.APP_MODE === "cloud"')).toBeLessThan(
      staticLayout.indexOf("<LemonSqueezyAffiliateScript />"),
    );
    expect(staticLayout).not.toContain('from "next/script"');
    expect(staticLayout).not.toMatch(/<script\b/);
    expect(affiliateScript).toContain("scheduleLemonSqueezyAffiliate(window, document)");
    expect(affiliateLoader).toContain('LEMON_SQUEEZY_AFFILIATE_SCRIPT_SRC = "https://lmsqueezy.com/affiliate.js"');
    expect(affiliateLoader).toContain('LEMON_SQUEEZY_AFFILIATE_STORE = "customermates"');
    expect(affiliateLoader).toContain('LEMON_SQUEEZY_REFERRAL_PARAM = "aff"');
    expect(affiliateLoader.indexOf("lemonSqueezyAffiliateConfig")).toBeLessThan(
      affiliateLoader.indexOf("doc.body.appendChild(script)"),
    );
    expect(runtime.match(/lmsqueezy\.com\/affiliate\.js/g)).toHaveLength(1);
    expect(runtime.match(/lemonSqueezyAffiliateConfig/g)).toHaveLength(1);
    expect(runtime).not.toContain("ls_aff_ref");
    expect(runtime).not.toContain("aff_ref");
    expect(runtime).not.toContain("googletagmanager.com");
    expect(runtime).not.toContain("google-analytics.com");
    expect(runtime).not.toContain("@next/third-parties/google");
    expect(runtime).not.toMatch(/\b(?:GoogleAnalytics|GoogleTagManager|sendGAEvent|gtag)\b/);
    expect(analyticsFiles).toEqual(["app/[locale]/(static)/layout.tsx"]);
    expect(staticLayout).toContain("<Analytics />");
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

    expect(signInPage).toContain("resolveOnboardingIntent");
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
    expect(sidebar).toContain("<NavSections");
    expect(sidebar.indexOf("<LegalUpdateAlert")).toBeLessThan(sidebar.indexOf("<NavSections"));
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

  it("keeps transient advertising operations out of the privacy notice", () => {
    const enPrivacy = legal("en", "privacy");
    const dePrivacy = legal("de", "privacy");

    expect(enPrivacy).not.toMatch(
      /Customermates advertises on|has not begun|has received anything from this feature yet|no export has been submitted|conversion interface now exists|interfaces Customermates has not built|no advertisement of ours has run/i,
    );
    expect(dePrivacy).not.toMatch(
      /Customermates wirbt über|hat noch nicht begonnen|hat aus dieser Funktion bisher etwas erhalten|kein Export wurde übergeben|Conversion-Schnittstelle.*nun besteht|Programmierschnittstellen.*nicht gebaut|keine unserer Anzeigen ist bisher gelaufen/i,
    );
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
