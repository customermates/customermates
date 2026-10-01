import type { LocaleCode } from "@/i18n/locale-registry";
import type { WikiCrawlCategory } from "./website-discovery";

type Vocabulary = Record<LocaleCode, readonly string[]> & { any?: readonly string[] };

const CATEGORY_WORDS: Record<Exclude<WikiCrawlCategory, "other" | "blog">, Vocabulary> = {
  pricing: {
    en: ["pricing", "prices?", "plans?", "subscriptions?"],
    de: ["preise", "tarife?", "abonnement"],
    es: ["precios"],
    fr: ["tarifs", "prix", "abonnement"],
    it: ["prezzi", "piani"],
  },
  policy: {
    en: [
      "terms",
      "tos",
      "legal",
      "privacy",
      "refunds?",
      "returns?",
      "cancell?ation",
      "sla",
      "security",
      "gdpr",
      "dpa",
      "shipping",
      "warranty",
    ],
    de: [
      "agb",
      "datenschutz",
      "widerruf",
      "kuendigung",
      "kündigung",
      "rueckgabe",
      "rückgabe",
      "erstattung",
      "versand",
      "garantie",
    ],
    es: ["terminos", "términos", "privacidad", "reembolsos?", "devoluciones", "envios", "envíos", "garantia"],
    fr: ["conditions", "confidentialite", "confidentialité", "remboursements?", "retours", "livraison", "garantie"],
    it: ["termini", "rimborsi?", "resi", "spedizioni", "garanzia"],
  },
  help: {
    en: [
      "support",
      "help",
      "helpcenter",
      "help-center",
      "hc",
      "docs",
      "documentation",
      "faqs?",
      "knowledge",
      "kb",
      "guides?",
      "tutorials?",
      "how-to",
      "getting-started",
      "troubleshooting",
      "manual",
    ],
    de: ["hilfe", "anleitungen?", "haeufige-fragen", "häufige-fragen"],
    es: ["ayuda", "soporte", "preguntas-frecuentes"],
    fr: ["aide", "assistance", "questions-frequentes"],
    it: ["aiuto", "supporto", "domande-frequenti", "documentazione"],
  },
  product: {
    en: ["products?", "features?", "solutions?", "services?", "platform", "integrations?", "how-it-works"],
    de: ["produkte?", "funktionen", "loesungen", "lösungen", "leistungen"],
    es: ["productos?", "servicios?", "soluciones", "funciones"],
    fr: ["produits?", "fonctionnalites", "fonctionnalités"],
    it: ["prodotti", "servizi", "soluzioni", "funzionalita", "funzionalità"],
  },
  about: {
    en: ["about", "about-us", "company", "team", "mission", "story"],
    de: ["unternehmen", "ueber-uns", "über-uns"],
    es: ["nosotros", "empresa", "equipo"],
    fr: ["a-propos", "entreprise", "equipe", "équipe"],
    it: ["chi-siamo", "azienda"],
  },
  customers: {
    en: ["customers?", "case-stud(?:y|ies)", "testimonials?", "industries", "use-cases?", "references?"],
    de: ["kunden", "referenzen", "branchen"],
    es: ["clientes", "casos"],
    fr: ["clients", "temoignages", "témoignages"],
    it: ["clienti", "casi"],
  },
};

const BLOG_SECTION_WORDS: Vocabulary = {
  en: ["blog", "news", "press"],
  de: ["magazin"],
  es: ["noticias"],
  fr: ["actualites", "actualités"],
  it: ["notizie"],
};

const BLOG_WORDS: Vocabulary = { ...BLOG_SECTION_WORDS, en: [...BLOG_SECTION_WORDS.en, "articles?", "posts?"] };

const SKIPPED_PATH_WORDS: Vocabulary = {
  any: ["wp-admin", "wp-json", "cdn-cgi"],
  en: [
    "login",
    "log-in",
    "signin",
    "sign-in",
    "signup",
    "sign-up",
    "register",
    "cart",
    "checkout",
    "basket",
    "account",
    "my-account",
    "careers",
    "jobs",
    "feed",
    "tag",
    "tags",
    "category",
    "categories",
    "author",
    "search",
    "share",
    "print",
  ],
  de: ["registrieren", "warenkorb", "konto", "karriere", "suche"],
  es: ["empleo"],
  fr: ["carrieres"],
  it: ["lavora-con-noi"],
};

const SKIPPED_EXTENSIONS = [
  "pdf",
  "jpe?g",
  "png",
  "gif",
  "webp",
  "svg",
  "ico",
  "css",
  "js",
  "json",
  "xml",
  "zip",
  "gz",
  "mp4",
  "mp3",
  "mov",
  "avi",
  "woff2?",
  "ttf",
  "eot",
  "docx?",
  "xlsx?",
  "pptx?",
  "csv",
  "rss",
  "atom",
];

const HOSTED_HELP_DOMAINS = [
  "zendesk.com",
  "intercom.help",
  "helpscoutdocs.com",
  "freshdesk.com",
  "gitbook.io",
  "notion.site",
  "document360.io",
  "readme.io",
  "helpjuice.com",
  "hubspot.com",
];

const HELP_SUBDOMAINS: Vocabulary = {
  en: ["help", "support", "docs", "kb", "faq"],
  de: ["hilfe"],
  es: ["ayuda", "soporte"],
  fr: ["aide", "assistance"],
  it: ["aiuto", "supporto"],
};

const alternation = (vocabulary: Vocabulary) => Object.values(vocabulary).flat().join("|");
const escaped = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

const categoryVocabulary: Record<Exclude<WikiCrawlCategory, "other">, Vocabulary> = {
  ...CATEGORY_WORDS,
  blog: BLOG_WORDS,
};
const CATEGORY_PATTERNS = Object.entries(categoryVocabulary).map(
  ([category, vocabulary]) =>
    [
      category as Exclude<WikiCrawlCategory, "other">,
      new RegExp(`(?:^|[\\s/_.-])(?:${alternation(vocabulary)})(?:$|[\\s/_.-])`, "u"),
    ] as const,
);
const BLOG_SECTION = new RegExp(`^/(?:[a-z]{2}(?:-[a-z]{2})?/)?(?:${alternation(BLOG_SECTION_WORDS)})(?:/|$)`, "u");
const SKIPPED_PATH = new RegExp(`(?:^|/)(?:${alternation(SKIPPED_PATH_WORDS)})(?:/|$)`, "u");
const SKIPPED_EXTENSION = new RegExp(`\\.(?:${SKIPPED_EXTENSIONS.join("|")})$`, "iu");
const EXTERNAL_HELP_HOST = new RegExp(
  `(?:^|\\.)(?:${HOSTED_HELP_DOMAINS.map(escaped).join("|")})$|^(?:${alternation(HELP_SUBDOMAINS)})\\.`,
  "u",
);

export function crawlPathCategory(path: string, searchable: string): WikiCrawlCategory {
  if (BLOG_SECTION.test(path)) return "blog";
  for (const [category, pattern] of CATEGORY_PATTERNS) if (pattern.test(path)) return category;
  for (const [category, pattern] of CATEGORY_PATTERNS) if (pattern.test(searchable)) return category;
  return "other";
}

export function isSkippedCrawlPath(path: string): boolean {
  return SKIPPED_PATH.test(path) || SKIPPED_EXTENSION.test(path);
}

export function isExternalHelpHost(host: string): boolean {
  return EXTERNAL_HELP_HOST.test(host.toLowerCase());
}
