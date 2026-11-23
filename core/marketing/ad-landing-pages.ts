export type AdLandingPage = {
  h1: string;
  title: string;
  description: string;
  points: readonly [string, string, string];
  faq: readonly { question: string; answer: string }[];
};

export const AD_LANDING_LOCALE = "de";

export const AD_LANDING_ROUTE = "/start";

export const AD_LANDING_AUDIENCE =
  "Für Teams von 2 bis 20 Personen, die Kunden, Deals und Gespräche an einem Ort führen wollen.";

export const AD_LANDING_PRICE_LINE =
  "Starter [[commercial.price.starter.monthly]], Pro [[commercial.price.pro.monthly]], Business [[commercial.price.business.monthly]] pro Nutzer und Monat, monatlich abgerechnet. Pro [[commercial.trial.days]] Tage kostenlos testen, ohne Kreditkarte.";

export const AD_LANDING_CTA = "[[commercial.trial.days]] Tage kostenlos testen";

export const AD_LANDING_SIGNUP_HREF = "/de/auth/signup?job=workspace";

export const AD_LANDING_PRODUCT_CAPTION = "Beispiel-Workspace eines kleinen Dienstleisters, mit Demodaten";

export const AD_LANDING_FAQ_TITLE = "Häufige Fragen";

const PRICE_ANSWER =
  "Starter kostet [[commercial.price.starter.monthly]], Pro [[commercial.price.pro.monthly]] und Business [[commercial.price.business.monthly]] pro Nutzer und Monat, monatlich abgerechnet. Pro testen Sie [[commercial.trial.days]] Tage kostenlos, ohne Kreditkarte.";

const TRIAL_ANSWER =
  "Nein. Sie testen Pro [[commercial.trial.days]] Tage kostenlos und geben dafür keine Kreditkarte an.";

const DATA_ANSWER = "Die Datenbank von Customermates Cloud steht in Frankfurt.";

const CHANNELS_ANSWER =
  "Ab Pro liegen Outlook-, Gmail-, LinkedIn- und WhatsApp-Gespräche direkt am Kunden. Outlook verbinden Sie ohne Add-in; WhatsApp läuft nicht über die WhatsApp Business API.";

export const AD_LANDING_PAGES = {
  "crm-system": {
    h1: "CRM-System für kleine Teams",
    title: "CRM-System für kleine Teams",
    description:
      "CRM-System für Teams von 2 bis 20: Kontakte, Deals und Kundengespräche an einem Ort. Ab [[commercial.price.starter.monthly]] pro Nutzer und Monat.",
    points: [
      "Kontakte, Organisationen und Deals in einem System, das Ihr ganzes Team nutzt.",
      "Ab Pro liegen Outlook-, Gmail-, LinkedIn- und WhatsApp-Gespräche direkt am Kunden.",
      "Die Datenbank steht in Frankfurt, der Quellcode ist einsehbar.",
    ],
    faq: [
      { question: "Was kostet das CRM-System?", answer: PRICE_ANSWER },
      { question: "Brauche ich für den Test eine Kreditkarte?", answer: TRIAL_ANSWER },
      { question: "Wo liegen unsere Daten?", answer: DATA_ANSWER },
    ],
  },
  "crm-software": {
    h1: "CRM-Software für kleine Teams",
    title: "CRM-Software für kleine Teams",
    description:
      "CRM-Software für Teams von 2 bis 20, mit Outlook ohne Add-in. Ab [[commercial.price.starter.monthly]] pro Nutzer und Monat, monatlich abgerechnet.",
    points: [
      "Eine Software für Kontakte, Deals und die Kundengespräche Ihres Teams.",
      "Outlook ohne Add-in, dazu Gmail, LinkedIn und WhatsApp, ab Pro.",
      "Monatlich abgerechnet, ab [[commercial.price.starter.monthly]] pro Nutzer.",
    ],
    faq: [
      {
        question: "Brauche ich ein Outlook-Add-in?",
        answer: "Nein. Outlook verbinden Sie ohne Add-in. Die Gespräche liegen ab Pro am Kunden.",
      },
      { question: "Kann ich die Software vorher testen?", answer: TRIAL_ANSWER },
      { question: "Wie wird abgerechnet?", answer: PRICE_ANSWER },
    ],
  },
  vertrieb: {
    h1: "CRM für den Vertrieb",
    title: "CRM für den Vertrieb kleiner Teams",
    description:
      "CRM für den Vertrieb: jeder Deal mit Datum für den nächsten Schritt, Gespräche am Kunden ab Pro. Für Teams von 2 bis 20.",
    points: [
      "Jeder Deal hat ein Datum für den nächsten Schritt.",
      "Ab Pro sehen Sie E-Mails, LinkedIn- und WhatsApp-Nachrichten direkt am Kunden.",
      "Ein ganzes verbundenes Konto teilen Sie im Tarif Business mit dem Team.",
    ],
    faq: [
      {
        question: "Kann das Team ein verbundenes Konto gemeinsam nutzen?",
        answer: "Ja, im Tarif Business. Dort teilen Sie ein ganzes verbundenes Konto mit dem Team.",
      },
      { question: "Welche Gespräche sehe ich am Kunden?", answer: CHANNELS_ANSWER },
      { question: "Was kostet es?", answer: PRICE_ANSWER },
    ],
  },
  "angebote-nachfassen": {
    h1: "Angebote nachfassen, ohne eines zu vergessen",
    title: "Angebote nachfassen, ohne eines zu vergessen",
    description:
      "Jedes Angebot als Deal mit Datum für den nächsten Schritt, die Gespräche dazu am Kunden. Für Teams von 2 bis 20.",
    points: [
      "Jedes Angebot ist ein Deal mit einem Datum für den nächsten Schritt.",
      "Die Gespräche zum Angebot liegen ab Pro am Kunden: Outlook, Gmail, LinkedIn und WhatsApp.",
      "Ihre Angebotsdokumente schreiben Sie weiter wie bisher; im CRM steht, wann Sie nachfassen.",
    ],
    faq: [
      {
        question: "Erstellt Customermates Angebotsdokumente?",
        answer:
          "Nein. Ein Angebot ist in Customermates ein Deal mit einem Datum für den nächsten Schritt. Das Dokument erstellen Sie weiter mit Ihrem bisherigen Werkzeug.",
      },
      { question: "Sehe ich, was der Kunde zuletzt geschrieben hat?", answer: CHANNELS_ANSWER },
      { question: "Was kostet es?", answer: PRICE_ANSWER },
    ],
  },
  "statt-excel": {
    h1: "Vom Excel-Blatt zum CRM",
    title: "Vom Excel-Blatt zum CRM",
    description:
      "Statt Kundenliste in Excel: Kontakte und Deals, die das ganze Team gleichzeitig nutzt. Ab [[commercial.price.starter.monthly]] pro Nutzer und Monat.",
    points: [
      "Kontakte, Organisationen und Deals als Listen, die das ganze Team gleichzeitig nutzt.",
      "Jeder Deal hat ein Datum für den nächsten Schritt statt einer Zeile, die man übersieht.",
      "Ab Pro liegen die Gespräche zu jedem Kunden direkt daneben.",
    ],
    faq: [
      { question: "Was kostet der Umstieg?", answer: PRICE_ANSWER },
      { question: "Brauche ich für den Test eine Kreditkarte?", answer: TRIAL_ANSWER },
      { question: "Wo liegen die Daten danach?", answer: DATA_ANSWER },
    ],
  },
  kundendatenbank: {
    h1: "Kundendatenbank für Ihr Team",
    title: "Kundendatenbank für Ihr Team",
    description:
      "Kundendatenbank für Teams von 2 bis 20, mit Datenbank in Frankfurt und den Gesprächen am Kunden ab Pro.",
    points: [
      "Alle Kunden, Ansprechpartner und Organisationen an einem Ort, für das ganze Team.",
      "Ab Pro mit den Gesprächen aus Outlook, Gmail, LinkedIn und WhatsApp an jedem Kunden.",
      "Die Datenbank steht in Frankfurt, der Quellcode ist einsehbar.",
    ],
    faq: [
      { question: "Wo liegt die Kundendatenbank?", answer: DATA_ANSWER },
      {
        question: "Läuft WhatsApp über die WhatsApp Business API?",
        answer: "Nein. WhatsApp-Gespräche liegen ab Pro am Kunden, ohne die WhatsApp Business API.",
      },
      { question: "Was kostet es?", answer: PRICE_ANSWER },
    ],
  },
  "crm-deutschland": {
    h1: "CRM mit Datenbank in Frankfurt",
    title: "CRM mit Datenbank in Frankfurt",
    description:
      "CRM für Teams von 2 bis 20: Datenbank in Frankfurt, Quellcode einsehbar. Ab [[commercial.price.starter.monthly]] pro Nutzer und Monat.",
    points: [
      "Die Datenbank von Customermates Cloud steht in Frankfurt.",
      "Der Quellcode ist einsehbar.",
      "Monatlich abgerechnet, ab [[commercial.price.starter.monthly]] pro Nutzer.",
    ],
    faq: [
      { question: "Wo steht die Datenbank?", answer: DATA_ANSWER },
      { question: "Kann ich den Quellcode ansehen?", answer: "Ja, der Quellcode von Customermates ist einsehbar." },
      { question: "Was kostet es?", answer: PRICE_ANSWER },
    ],
  },
  preise: {
    h1: "CRM ab [[commercial.price.starter.monthly]] pro Nutzer, Preise ohne Vertriebsgespräch",
    title: "CRM-Preise ohne Vertriebsgespräch",
    description:
      "Starter [[commercial.price.starter.monthly]], Pro [[commercial.price.pro.monthly]], Business [[commercial.price.business.monthly]] pro Nutzer und Monat, monatlich abgerechnet. Pro [[commercial.trial.days]] Tage kostenlos testen.",
    points: [
      "Starter [[commercial.price.starter.monthly]], Pro [[commercial.price.pro.monthly]], Business [[commercial.price.business.monthly]] pro Nutzer und Monat.",
      "Monatlich abgerechnet; Pro [[commercial.trial.days]] Tage kostenlos testen, ohne Kreditkarte.",
      "Gespräche aus Outlook, Gmail, LinkedIn und WhatsApp am Kunden ab Pro; ein ganzes verbundenes Konto teilen ab Business.",
    ],
    faq: [
      {
        question: "Worin unterscheiden sich die Tarife?",
        answer:
          "Ab Pro liegen Outlook-, Gmail-, LinkedIn- und WhatsApp-Gespräche am Kunden. Im Tarif Business teilen Sie zusätzlich ein ganzes verbundenes Konto mit dem Team.",
      },
      { question: "Brauche ich für den Test eine Kreditkarte?", answer: TRIAL_ANSWER },
      {
        question: "Wie wird abgerechnet?",
        answer:
          "Monatlich, pro Nutzer: Starter [[commercial.price.starter.monthly]], Pro [[commercial.price.pro.monthly]], Business [[commercial.price.business.monthly]].",
      },
    ],
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
