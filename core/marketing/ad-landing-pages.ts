import { PUBLIC_DEMO_ORIGIN } from "@/components/marketing/product-demo-src";
import { SIGNUP_PATH } from "@/features/acquisition/signup-link";
import { SIGNUP_JOB_QUERY_PARAM } from "@/features/onboarding-funnel/onboarding-job";
import { buildLocalePath } from "@/i18n/locale-registry";

export type AdLandingCapture = "homepage-dashboard" | "homepage-inbox" | "homepage-pipeline" | "homepage-record";

export type AdLandingProof = { title: string; text: string };

export type AdLandingPage = {
  adGroup: string;
  h1: string;
  lede: string;
  title: string;
  description: string;
  capture: AdLandingCapture;
  captureAlt: string;
  proofTitle: string;
  proof: readonly AdLandingProof[];
  faq: readonly { question: string; answer: string }[];
  ctaTitle: string;
};

export const AD_LANDING_LOCALE = "de";

export const AD_LANDING_ROUTE = "/lp";

export const AD_LANDING_AUDIENCE = "Für Teams von 2 bis 20 Personen";

export const AD_LANDING_PRICE_UNIT = "pro Nutzer und Monat, monatlich abgerechnet";

export const AD_LANDING_PLANS = [
  { name: "Starter", price: "[[commercial.price.starter.monthly]]", note: "Kontakte, Deals, Aufgaben" },
  {
    name: "Pro",
    price: "[[commercial.price.pro.monthly]]",
    note: "[[commercial.trial.days]] Tage kostenlos, ohne Karte",
    highlight: true,
  },
  { name: "Business", price: "[[commercial.price.business.monthly]]", note: "Konten mit dem Team teilen" },
] as const;

export const AD_LANDING_CTA = "[[commercial.trial.days]] Tage kostenlos testen";

export const AD_LANDING_CTA_HINT = "Pro-Tarif, keine Kreditkarte, Cloud mit Datenbank in Frankfurt";

export const AD_LANDING_SIGNUP_HREF = `${buildLocalePath(AD_LANDING_LOCALE, SIGNUP_PATH)}?${new URLSearchParams({ [SIGNUP_JOB_QUERY_PARAM]: "workspace" }).toString()}`;

export const AD_LANDING_DEMO_LABEL = "Live-Demo ansehen";

export const AD_LANDING_DEMO_HREF = `${PUBLIC_DEMO_ORIGIN}/de/w/kleine-unternehmen/dashboard`;

export const AD_LANDING_SELF_HOST_LABEL = "Lieber auf dem eigenen Server? Zur Community Edition";

export const AD_LANDING_SELF_HOST_HREF = buildLocalePath(AD_LANDING_LOCALE, "/features/self-hosted");

export const AD_LANDING_PRODUCT_CAPTION = "Beispiel-Workspace eines kleinen IT-Dienstleisters, mit Demodaten";

export const AD_LANDING_FAQ_TITLE = "Häufige Fragen";

export const AD_LANDING_CTA_DESCRIPTION =
  "Workspace anlegen, Kunden aus Excel oder CSV importieren, Postfach verbinden. Danach entscheiden Sie, ob es passt.";

const PRICE_ANSWER =
  "Starter kostet [[commercial.price.starter.monthly]], Pro [[commercial.price.pro.monthly]] und Business [[commercial.price.business.monthly]] pro Nutzer und Monat, monatlich abgerechnet. Pro testen Sie [[commercial.trial.days]] Tage kostenlos, ohne Kreditkarte.";

const TRIAL_ANSWER =
  "Nein. Sie testen Pro [[commercial.trial.days]] Tage kostenlos und geben dafür keine Kreditkarte an.";

const DATA_ANSWER =
  "Die Datenbank von Customermates Cloud steht in der AWS-Region Frankfurt. Ein Auftragsverarbeitungsvertrag liegt vor, und die Liste der Unterauftragsverarbeiter nennt alle beteiligten Anbieter, auch solche aus den USA.";

const CHANNELS_ANSWER =
  "Ab Pro liegen Outlook-, Gmail-, LinkedIn- und WhatsApp-Gespräche direkt am Kunden. Outlook und Gmail verbinden Sie ohne Add-in in der Web-App; WhatsApp läuft nicht über die WhatsApp Business API.";

const IMPORT_ANSWER =
  "Ja. Der Import-Assistent liest .xlsx-, .xls- und .csv-Dateien, und Sie ordnen die Spalten Ihren Feldern zu. Importieren Sie Organisationen vor Kontakten und Deals, dann werden die Verknüpfungen über den Namen zugeordnet.";

const LIMITS_ANSWER =
  "Es gibt keine Mobile-App (die Web-App läuft im Browser), keine E-Mail-Sequenzen und keinen Massenversand. Angebotsdokumente erstellen Sie weiter in Ihrem gewohnten Programm.";

const SELF_HOST_ANSWER =
  "Ja. Die Community Edition betreiben Sie für Ihr eigenes Unternehmen ohne Lizenzkosten auf Ihrem Server, mit dem Funktionsumfang von Starter, ohne Posteingang und ohne den KI-Assistenten Mate.";

const PROOF = {
  lists: {
    title: "Kunden, Angebote und Aufgaben an einem Ort",
    text: "Kontakte, Organisationen, Deals, Leistungen und Aufgaben als Listen, die das ganze Team nutzt. Jede Liste öffnet sich als Tabelle oder Board.",
  },
  conversations: {
    title: "E-Mail, LinkedIn und WhatsApp je Kunde",
    text: "Ab Pro liegen Outlook-, Gmail-, LinkedIn- und WhatsApp-Gespräche direkt am Kunden und im gemeinsamen Posteingang.",
  },
  outlook: {
    title: "Outlook ohne Add-in",
    text: "Outlook und Gmail verbinden Sie direkt in der Web-App. Nichts zu installieren, auch nicht auf den Rechnern im Team.",
  },
  templates: {
    title: "Vorlagen für Ihre Branche",
    text: "In der Cloud baut die KI-Einrichtung aus Ihrer Beschreibung Listen, Felder, Deal-Phasen und ein Dashboard. Sie benennen alles mit den Begriffen Ihres Teams um.",
  },
  automations: {
    title: "Automationen ohne Zusatztool",
    text: "Feste Wenn-dann-Regeln in jedem Tarif: Erinnerung vor einem Datum, Folgeaufgabe anlegen, Benachrichtigung in der App und per E-Mail.",
  },
  nextStep: {
    title: "Ein Datum für den nächsten Schritt",
    text: "Ein Datumsfeld wie „Nächster Schritt“ am Deal und eine danach sortierte Ansicht zeigen, wen Sie heute kontaktieren.",
  },
  pipeline: {
    title: "Pipeline mit Ihren eigenen Phasen",
    text: "Phasen benennen Sie selbst, mit Wahrscheinlichkeit je Phase. Daraus berechnet Customermates den gewichteten Wert der Pipeline.",
  },
  import: {
    title: "Import aus Excel und CSV",
    text: "Der Import-Assistent liest .xlsx-, .xls- und .csv-Dateien. Sie ordnen jede Spalte einem Feld zu, eigene Felder eingeschlossen.",
  },
  views: {
    title: "Ansichten statt Tabellenblätter",
    text: "Filter, Sortierung, Gruppierung und Spalten speichern Sie als benannte Ansicht, für sich oder für das ganze Team.",
  },
  frankfurt: {
    title: "Datenbank in Frankfurt",
    text: "Die Cloud-Datenbank steht in der AWS-Region Frankfurt. Auftragsverarbeitungsvertrag und Liste der Unterauftragsverarbeiter sind öffentlich.",
  },
  sourceCode: {
    title: "Quellcode einsehbar",
    text: "Der Quellcode von Customermates ist öffentlich einsehbar. Die Community Edition betreiben Sie auf Wunsch selbst.",
  },
  team: {
    title: "Rollen und Rechte im Team",
    text: "Mitglieder laden Sie unter Einstellungen ein; Rollen legen fest, wer welche Listen sehen und bearbeiten darf.",
  },
  sharedAccount: {
    title: "Ein Konto mit dem Team teilen",
    text: "Im Tarif Business teilen Sie ein ganzes verbundenes Postfach mit dem Team, zum Beispiel die Vertriebsadresse.",
  },
  monthly: {
    title: "Monatlich, pro Nutzer",
    text: "Starter [[commercial.price.starter.monthly]], Pro [[commercial.price.pro.monthly]], Business [[commercial.price.business.monthly]] pro Nutzer und Monat. Monatlich abgerechnet, ohne Vertriebsgespräch.",
  },
} as const satisfies Record<string, AdLandingProof>;

export const AD_LANDING_PAGES = {
  "crm-system": {
    adGroup: "CRM System",
    h1: "CRM-System für kleine Teams",
    lede: "Kunden, Angebote und Aufgaben an einem Ort, dazu Outlook, Gmail, LinkedIn und WhatsApp je Kunde in einem CRM.",
    title: "CRM-System für kleine Teams",
    description:
      "CRM-System für Teams von 2 bis 20: Kunden, Angebote und Aufgaben an einem Ort. Ab [[commercial.price.starter.monthly]] pro Nutzer und Monat, Datenbank in Frankfurt.",
    capture: "homepage-record",
    captureAlt: "Kundendatensatz in Customermates mit Kontaktdaten und den E-Mail- und WhatsApp-Gesprächen daneben",
    proofTitle: "Was das CRM-System heute kann",
    proof: [PROOF.lists, PROOF.conversations, PROOF.templates, PROOF.automations],
    faq: [
      { question: "Was kostet das CRM-System?", answer: PRICE_ANSWER },
      { question: "Brauche ich für den Test eine Kreditkarte?", answer: TRIAL_ANSWER },
      { question: "Wo liegen unsere Daten?", answer: DATA_ANSWER },
      { question: "Was kann Customermates nicht?", answer: LIMITS_ANSWER },
    ],
    ctaTitle: "Das CRM-System mit Ihren eigenen Kunden testen",
  },
  "crm-software": {
    adGroup: "CRM Software",
    h1: "CRM-Software für kleine Teams",
    lede: "Eine Software für Kontakte, Deals und die Kundengespräche Ihres Teams. Outlook ohne Add-in, dazu Gmail, LinkedIn und WhatsApp.",
    title: "CRM-Software für kleine Teams",
    description:
      "CRM-Software für Teams von 2 bis 20, mit Outlook ohne Add-in. Ab [[commercial.price.starter.monthly]] pro Nutzer und Monat, monatlich abgerechnet.",
    capture: "homepage-inbox",
    captureAlt: "Gemeinsamer Posteingang in Customermates mit E-Mail-, WhatsApp-, LinkedIn- und Instagram-Gesprächen",
    proofTitle: "Was die Software heute kann",
    proof: [PROOF.outlook, PROOF.conversations, PROOF.lists, PROOF.automations],
    faq: [
      {
        question: "Brauche ich ein Outlook-Add-in?",
        answer: "Nein. Outlook verbinden Sie ohne Add-in in der Web-App. Die Gespräche liegen ab Pro am Kunden.",
      },
      { question: "Kann ich die Software vorher testen?", answer: TRIAL_ANSWER },
      { question: "Wie wird abgerechnet?", answer: PRICE_ANSWER },
      { question: "Gibt es eine App fürs Smartphone?", answer: LIMITS_ANSWER },
    ],
    ctaTitle: "Die CRM-Software mit Ihrem Postfach testen",
  },
  vertrieb: {
    adGroup: "Vertrieb",
    h1: "CRM für den Vertrieb kleiner Teams",
    lede: "Jeder Deal in Ihrer Pipeline, jedes Gespräch am Kunden. Sie sehen, welcher Deal als Nächstes dran ist.",
    title: "CRM für den Vertrieb kleiner Teams",
    description:
      "Vertriebs-CRM für Teams von 2 bis 20: Pipeline mit Ihren Phasen, E-Mail und LinkedIn je Kunde ab Pro. Ab [[commercial.price.starter.monthly]] pro Nutzer und Monat.",
    capture: "homepage-pipeline",
    captureAlt: "Deal-Pipeline in Customermates mit den Phasen Neu, Qualifiziert, Im Gespräch und Angebot gesendet",
    proofTitle: "Was das Vertriebs-CRM heute kann",
    proof: [PROOF.pipeline, PROOF.nextStep, PROOF.conversations, PROOF.sharedAccount],
    faq: [
      {
        question: "Kann das Team ein verbundenes Konto gemeinsam nutzen?",
        answer: "Ja, im Tarif Business. Dort teilen Sie ein ganzes verbundenes Konto mit dem Team.",
      },
      { question: "Welche Gespräche sehe ich am Kunden?", answer: CHANNELS_ANSWER },
      {
        question: "Gibt es E-Mail-Sequenzen?",
        answer:
          "Nein. Customermates arbeitet an einzelnen Kunden und Deals; Sequenzen, Drip-Kampagnen und Massenversand gibt es nicht.",
      },
      { question: "Was kostet es?", answer: PRICE_ANSWER },
    ],
    ctaTitle: "Ihre Pipeline in Customermates aufbauen",
  },
  "angebote-nachfassen": {
    adGroup: "Angebote nachfassen",
    h1: "Angebote nachfassen im CRM",
    lede: "Jedes Angebot als Deal mit Wiedervorlage, die Gespräche dazu am Kunden. So bleibt kein Angebot liegen.",
    title: "Angebote nachfassen im CRM",
    description:
      "Angebote mit Wiedervorlage: jedes Angebot als Deal mit Datum für den nächsten Schritt, die Gespräche dazu am Kunden. Für Teams von 2 bis 20.",
    capture: "homepage-dashboard",
    captureAlt: "Dashboard in Customermates mit offener Pipeline und der Liste der nächsten Schritte für 14 Tage",
    proofTitle: "So fassen Sie Angebote nach",
    proof: [
      PROOF.nextStep,
      {
        title: "Erinnerung vor dem Datum",
        text: "Eine Automation erinnert Sie vor dem Nachfass-Datum in der App und per E-Mail, in jedem Tarif.",
      },
      {
        title: "Der Verlauf am Angebot",
        text: "Ab Pro liegt die E-Mail, mit der Sie das Angebot verschickt haben, am selben Kunden. Beim Nachfassen haben Sie den Verlauf vor sich.",
      },
      PROOF.pipeline,
    ],
    faq: [
      {
        question: "Erstellt Customermates Angebotsdokumente?",
        answer:
          "Nein. Ein Angebot ist in Customermates ein Deal mit einem Datum für den nächsten Schritt. Das Dokument erstellen Sie weiter mit Ihrem bisherigen Werkzeug.",
      },
      { question: "Sehe ich, was der Kunde zuletzt geschrieben hat?", answer: CHANNELS_ANSWER },
      {
        question: "Wie werde ich ans Nachfassen erinnert?",
        answer:
          "Mit einer Automation, die vor dem Datum am Deal eine Benachrichtigung in der App und per E-Mail schickt oder eine Folgeaufgabe anlegt. Automationen gibt es in jedem Tarif.",
      },
      { question: "Was kostet es?", answer: PRICE_ANSWER },
    ],
    ctaTitle: "Offene Angebote ab heute im Blick",
  },
  "statt-excel": {
    adGroup: "Excel und Notion",
    h1: "Vom Excel-Blatt zum CRM",
    lede: "Ihre Kundenliste aus Excel importieren und als Team gleichzeitig daran arbeiten, mit Wiedervorlage statt übersehener Zeile.",
    title: "Vom Excel-Blatt zum CRM",
    description:
      "Kundenliste statt Excel: Import aus .xlsx und .csv, Kontakte und Deals für das ganze Team. Ab [[commercial.price.starter.monthly]] pro Nutzer und Monat.",
    capture: "homepage-pipeline",
    captureAlt: "Deals in Customermates als Board nach Phasen, statt als Zeilen in einer Tabelle",
    proofTitle: "Was besser ist als die Tabelle",
    proof: [PROOF.import, PROOF.views, PROOF.nextStep, PROOF.conversations],
    faq: [
      { question: "Kann ich meine Excel-Liste übernehmen?", answer: IMPORT_ANSWER },
      {
        question: "Und wenn unsere Liste in Notion oder Google Tabellen liegt?",
        answer:
          "Exportieren Sie sie als .csv oder .xlsx und importieren Sie die Datei. Anhänge werden dabei nicht übertragen.",
      },
      { question: "Was kostet der Umstieg?", answer: PRICE_ANSWER },
      { question: "Brauche ich für den Test eine Kreditkarte?", answer: TRIAL_ANSWER },
    ],
    ctaTitle: "Ihre Kundenliste heute importieren",
  },
  kundendatenbank: {
    adGroup: "Kontakte und Adressen",
    h1: "Kundendatenbank für Teams",
    lede: "Kontakte und Kunden im Team: alle Ansprechpartner und Organisationen an einem Ort, mit den Gesprächen an jedem Kunden.",
    title: "Kundendatenbank für Teams",
    description:
      "Kundendatenbank für Teams von 2 bis 20: Kontakte und Organisationen an einem Ort, Datenbank in Frankfurt, Gespräche am Kunden ab Pro.",
    capture: "homepage-record",
    captureAlt: "Kontakt in Customermates mit E-Mail, Telefon, Notizen und den Gesprächen mit diesem Kunden",
    proofTitle: "Was die Kundendatenbank heute kann",
    proof: [
      {
        title: "Kontakte und Organisationen verknüpft",
        text: "Ansprechpartner hängen an ihrer Organisation, Deals und Aufgaben am Kunden. Eigene Felder legen Sie selbst an.",
      },
      PROOF.import,
      PROOF.conversations,
      PROOF.team,
    ],
    faq: [
      { question: "Wo liegt die Kundendatenbank?", answer: DATA_ANSWER },
      { question: "Kann ich bestehende Kontakte importieren?", answer: IMPORT_ANSWER },
      {
        question: "Läuft WhatsApp über die WhatsApp Business API?",
        answer: "Nein. WhatsApp-Gespräche liegen ab Pro am Kunden, ohne die WhatsApp Business API.",
      },
      { question: "Was kostet es?", answer: PRICE_ANSWER },
    ],
    ctaTitle: "Ihre Kundendatenbank in einem Nachmittag aufbauen",
  },
  "crm-deutschland": {
    adGroup: "Hosting EU",
    h1: "CRM mit Datenbank in Frankfurt",
    lede: "CRM auf Deutsch, Datenbank in Frankfurt, Quellcode offen einsehbar. Für Teams, die wissen wollen, wo ihre Kundendaten liegen.",
    title: "CRM mit Datenbank in Frankfurt",
    description:
      "CRM für Teams von 2 bis 20: Datenbank in Frankfurt, Quellcode einsehbar, auf Deutsch. Ab [[commercial.price.starter.monthly]] pro Nutzer und Monat.",
    capture: "homepage-dashboard",
    captureAlt: "Dashboard in Customermates auf Deutsch, mit Pipeline, nächsten Schritten und letzten Aktivitäten",
    proofTitle: "Was hinter dem Standort steht",
    proof: [
      PROOF.frankfurt,
      PROOF.sourceCode,
      {
        title: "Auf Deutsch",
        text: "Oberfläche und Hilfeseiten auf Deutsch. Ihre Listen benennen Sie mit den Begriffen Ihres Teams.",
      },
      PROOF.conversations,
    ],
    faq: [
      { question: "Wo steht die Datenbank?", answer: DATA_ANSWER },
      {
        question: "Kann ich den Quellcode ansehen?",
        answer: "Ja, der Quellcode von Customermates ist öffentlich einsehbar.",
      },
      { question: "Kann ich Customermates selbst betreiben?", answer: SELF_HOST_ANSWER },
      { question: "Was kostet die Cloud?", answer: PRICE_ANSWER },
    ],
    ctaTitle: "Das CRM mit Datenbank in Frankfurt testen",
  },
  preise: {
    adGroup: "Salesforce Kosten",
    h1: "CRM ab [[commercial.price.starter.monthly]] pro Nutzer, Preise ohne Vertriebsgespräch",
    lede: "Alle Preise stehen hier. Monatliche Abrechnung pro Nutzer und kein Vertriebstermin, bevor Sie testen dürfen.",
    title: "CRM-Preise ohne Vertriebsgespräch",
    description:
      "Starter [[commercial.price.starter.monthly]], Pro [[commercial.price.pro.monthly]], Business [[commercial.price.business.monthly]] pro Nutzer und Monat, monatlich abgerechnet. Pro [[commercial.trial.days]] Tage kostenlos testen.",
    capture: "homepage-inbox",
    captureAlt: "Gemeinsamer Posteingang in Customermates, im Tarif Pro enthalten",
    proofTitle: "Was in welchem Tarif steckt",
    proof: [
      {
        title: "Starter, [[commercial.price.starter.monthly]]",
        text: "Kontakte, Organisationen, Deals, Leistungen, Aufgaben, eigene Felder, Ansichten, Dashboard, Import und Export, Automationen.",
      },
      {
        title: "Pro, [[commercial.price.pro.monthly]]",
        text: "Alles aus Starter, dazu E-Mail-, LinkedIn- und WhatsApp-Gespräche am Kunden und der gemeinsame Posteingang.",
      },
      {
        title: "Business, [[commercial.price.business.monthly]]",
        text: "Alles aus Pro, dazu mehr verbundene Konten pro Person und ein ganzes Konto mit dem Team teilen.",
      },
      PROOF.monthly,
    ],
    faq: [
      {
        question: "Worin unterscheiden sich die Tarife?",
        answer:
          "Ab Pro liegen Outlook-, Gmail-, LinkedIn- und WhatsApp-Gespräche am Kunden. Im Tarif Business teilen Sie zusätzlich ein ganzes verbundenes Konto mit dem Team.",
      },
      { question: "Brauche ich für den Test eine Kreditkarte?", answer: TRIAL_ANSWER },
      {
        question: "Was zahlt ein Team mit drei Personen?",
        answer:
          "Im Tarif Starter [[commercial.price.starter.monthly.seats.3]] im Monat, im Tarif Pro [[commercial.price.pro.monthly.seats.3]], monatlich abgerechnet.",
      },
      { question: "Gibt es eine Version ohne monatliche Kosten?", answer: SELF_HOST_ANSWER },
    ],
    ctaTitle: "Pro [[commercial.trial.days]] Tage kostenlos testen",
  },
} as const satisfies Record<string, AdLandingPage>;

export type AdLandingSlug = keyof typeof AD_LANDING_PAGES;

export const AD_LANDING_SLUGS = Object.keys(AD_LANDING_PAGES) as AdLandingSlug[];

export function isAdLandingSlug(value: string): value is AdLandingSlug {
  return Object.hasOwn(AD_LANDING_PAGES, value);
}

export function adLandingPath(slug: AdLandingSlug): string {
  return `/${AD_LANDING_LOCALE}${AD_LANDING_ROUTE}/${slug}`;
}
