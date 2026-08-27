export const DEMO_VISUAL_PERSON_ROLES = ["contact", "member", "messaging-participant"] as const;

export type DemoVisualPersonRole = (typeof DEMO_VISUAL_PERSON_ROLES)[number];

export const DEMO_VISUAL_PEOPLE = {
  "leon-becker": {
    asset: "/demo/avatars/photos/leon-becker.png",
    name: "Leon Becker",
    roles: ["contact", "messaging-participant"],
  },
  "tim-wagner": {
    asset: "/demo/avatars/photos/tim-wagner.png",
    name: "Tim Wagner",
    roles: ["contact"],
  },
  "lucio-ball": {
    asset: "/demo/avatars/photos/lucio-ball.png",
    name: "Lucio Ball",
    roles: ["contact"],
  },
  "mara-bauer": {
    asset: "/demo/avatars/photos/mara-bauer.png",
    name: "Mara Bauer",
    roles: ["contact"],
  },
  "max-schmidt": {
    asset: "/demo/avatars/photos/max-schmidt.png",
    name: "Max Schmidt",
    roles: ["contact"],
  },
  "sophie-hoffmann": {
    asset: "/demo/avatars/photos/sophie-hoffmann.png",
    name: "Sophie Hoffmann",
    roles: ["contact"],
  },
  "jonas-weber": {
    asset: "/demo/avatars/photos/jonas-weber.png",
    name: "Jonas Weber",
    roles: ["contact", "messaging-participant"],
  },
  "amin-hassan": {
    asset: "/demo/avatars/photos/amin-hassan.png",
    name: "Amin Hassan",
    roles: ["contact", "messaging-participant"],
  },
  "lea-bauer": {
    asset: "/demo/avatars/photos/lea-bauer.png",
    name: "Lea Bauer",
    roles: ["contact"],
  },
  "maxine-zoll": {
    asset: "/demo/avatars/photos/maxine-zoll.png",
    name: "Maxine Zoll",
    roles: ["contact"],
  },
  "lina-alvarez": {
    asset: "/demo/avatars/photos/lina-alvarez.png",
    name: "Lina Alvarez",
    roles: ["contact"],
  },
  "felix-koch": {
    asset: "/demo/avatars/photos/felix-koch.png",
    name: "Felix Koch",
    roles: ["contact"],
  },
  "omar-khalil": {
    asset: "/demo/avatars/photos/omar-khalil.png",
    name: "Omar Khalil",
    roles: ["contact"],
  },
  "tim-weber": {
    asset: "/demo/avatars/photos/tim-weber.png",
    name: "Tim Weber",
    roles: ["contact"],
  },
  "kian-rahimi": {
    asset: "/demo/avatars/photos/kian-rahimi.png",
    name: "Kian Rahimi",
    roles: ["contact"],
  },
  "leila-chen": {
    asset: "/demo/avatars/photos/leila-chen.png",
    name: "Leila Chen",
    roles: ["contact"],
  },
  "mia-schneider": {
    asset: "/demo/avatars/photos/mia-schneider.png",
    name: "Mia Schneider",
    roles: ["contact"],
  },
  "laura-fischer": {
    asset: "/demo/avatars/photos/laura-fischer.png",
    name: "Laura Fischer",
    roles: ["contact"],
  },
  "amir-haddad": {
    asset: "/demo/avatars/photos/amir-haddad.png",
    name: "Amir Haddad",
    roles: ["contact"],
  },
  "sophie-wagner": {
    asset: "/demo/avatars/photos/sophie-wagner.png",
    name: "Sophie Wagner",
    roles: ["contact", "messaging-participant"],
  },
  "reinhold-mertens": {
    asset: "/demo/avatars/photos/reinhold-mertens.png",
    name: "Reinhold Mertens",
    roles: ["contact"],
  },
  "alexej-sofr": {
    asset: "/demo/avatars/photos/alexej-sofr.png",
    name: "Alexej Sofr",
    roles: ["contact"],
  },
  "anna-mueller": {
    asset: "/demo/avatars/photos/anna-mueller.png",
    name: "Anna Müller",
    roles: ["contact", "messaging-participant"],
  },
  "yasmin-farouk": {
    asset: "/demo/avatars/photos/yasmin-farouk.png",
    name: "Yasmin Farouk",
    roles: ["contact", "messaging-participant"],
  },
  "lukas-fischer": {
    asset: "/demo/avatars/photos/lukas-fischer.png",
    name: "Lukas Fischer",
    roles: ["contact"],
  },
  "felix-schneider": {
    asset: "/demo/avatars/photos/felix-schneider.png",
    name: "Felix Schneider",
    roles: ["contact"],
  },
  "rashid-malik": {
    asset: "/demo/avatars/photos/rashid-malik.png",
    name: "Rashid Malik",
    roles: ["contact", "messaging-participant"],
  },
  "paul-koch": {
    asset: "/demo/avatars/photos/paul-koch.png",
    name: "Paul Koch",
    roles: ["contact"],
  },
  "nia-johnson": {
    asset: "/demo/avatars/photos/nia-johnson.png",
    name: "Nia Johnson",
    roles: ["contact"],
  },
  "paul-fischer": {
    asset: "/demo/avatars/photos/paul-fischer.png",
    name: "Paul Fischer",
    roles: ["contact"],
  },
  "max-bergmann": {
    asset: "/demo/avatars/photos/max-bergmann.png",
    name: "Max Bergmann",
    roles: ["member"],
  },
  "sofia-rossi": {
    asset: "/demo/avatars/photos/sofia-rossi.png",
    name: "Sofia Rossi",
    roles: ["member"],
  },
  "elena-hoffmann": {
    asset: "/demo/avatars/photos/elena-hoffmann.png",
    name: "Elena Hoffmann",
    roles: ["member"],
  },
  "clara-neumann": {
    asset: "/demo/avatars/photos/clara-neumann.png",
    name: "Clara Neumann",
    roles: ["messaging-participant"],
  },
  "marco-silva": {
    asset: "/demo/avatars/photos/marco-silva.png",
    name: "Marco Silva",
    roles: ["messaging-participant"],
  },
} as const satisfies Record<
  string,
  {
    asset: `/demo/avatars/photos/${string}.png`;
    name: string;
    roles: readonly DemoVisualPersonRole[];
  }
>;

export const DEMO_VISUAL_DEAL_STATUSES = {
  "deal-open": {
    label: "Open",
    variant: "warning",
    weight: 30,
  },
  "deal-won": {
    label: "Won",
    variant: "success",
    weight: 100,
  },
  "deal-lost": {
    label: "Lost",
    variant: "destructive",
    weight: 0,
  },
  "deal-abandoned": {
    label: "Abandoned",
    variant: "secondary",
    weight: 0,
  },
} as const;

export const DEMO_VISUAL_DEALS = {
  "deal-process-automation": {
    assignee: "max-bergmann",
    currency: "EUR",
    kind: "deal",
    name: "Process Automation Program",
    status: "deal-lost",
    totalValue: 120_000,
    weightedValue: 0,
  },
  "deal-data-analytics": {
    assignee: "max-bergmann",
    currency: "EUR",
    kind: "deal",
    name: "Data & Analytics Transformation",
    status: "deal-open",
    totalValue: 185_000,
    weightedValue: 55_500,
  },
  "deal-crm-rollout": {
    assignee: "max-bergmann",
    currency: "EUR",
    kind: "deal",
    name: "CRM Rollout & Sales Enablement",
    status: "deal-won",
    totalValue: 124_000,
    weightedValue: 124_000,
  },
  "deal-enterprise-integration": {
    assignee: "max-bergmann",
    currency: "EUR",
    kind: "deal",
    name: "Enterprise Integration Program",
    status: "deal-won",
    totalValue: 212_000,
    weightedValue: 212_000,
  },
  "deal-workplace-hardware": {
    assignee: "max-bergmann",
    currency: "EUR",
    kind: "deal",
    name: "Workplace Hardware Rollout",
    status: "deal-open",
    totalValue: 342_000,
    weightedValue: 102_600,
  },
  "deal-digital-customer-platform": {
    assignee: "max-bergmann",
    currency: "EUR",
    kind: "deal",
    name: "Digital Customer Platform",
    projectPeriod: ["2026-06-01", "2026-08-28"],
    status: "deal-open",
    totalQuantity: 162,
    totalValue: 198_500,
    weightedValue: 59_550,
  },
  "deal-data-center-refresh": {
    assignee: "max-bergmann",
    currency: "EUR",
    kind: "deal",
    name: "Data Center Refresh",
    status: "deal-lost",
    totalValue: 418_500,
    weightedValue: 0,
  },
  "deal-cloud-infrastructure": {
    assignee: "max-bergmann",
    currency: "EUR",
    kind: "deal",
    name: "Cloud Infrastructure Migration",
    status: "deal-won",
    totalValue: 142_000,
    weightedValue: 142_000,
  },
  "deal-network-infrastructure": {
    assignee: "max-bergmann",
    currency: "EUR",
    kind: "deal",
    name: "Network Infrastructure Upgrade",
    status: "deal-abandoned",
    totalValue: 156_400,
    weightedValue: 0,
  },
  "deal-hr-systems": {
    assignee: "max-bergmann",
    currency: "EUR",
    kind: "deal",
    name: "HR Systems Optimization",
    status: "deal-won",
    totalValue: 67_500,
    weightedValue: 67_500,
  },
} as const satisfies Record<
  string,
  {
    assignee: keyof typeof DEMO_VISUAL_PEOPLE;
    currency: "EUR";
    kind: "deal";
    name: string;
    projectPeriod?: readonly [string, string];
    status: keyof typeof DEMO_VISUAL_DEAL_STATUSES;
    totalQuantity?: number;
    totalValue: number;
    weightedValue: number;
  }
>;

export const DEMO_VISUAL_CONVERSATIONS = {
  "gmail-rollout-next-steps": {
    localizedSubject: {
      de: "Nächste Schritte für den Rollout",
      en: "Next steps for the rollout",
    },
    person: "anna-mueller",
    provider: "gmail",
    state: "open",
    subject: "Next steps for the rollout",
  },
} as const satisfies Record<
  string,
  {
    localizedSubject: Readonly<Record<string, string>>;
    person: keyof typeof DEMO_VISUAL_PEOPLE;
    provider: "gmail" | "linkedin" | "whatsapp";
    state: "open" | "unread";
    subject: string;
  }
>;

export const DEMO_VISUAL_PROVIDER_PERSON_PAIRINGS = {
  gmail: ["anna-mueller", "amin-hassan", "clara-neumann", "yasmin-farouk"],
  linkedin: ["leon-becker", "rashid-malik"],
  whatsapp: ["sophie-wagner", "jonas-weber", "marco-silva"],
} as const satisfies Record<string, readonly (keyof typeof DEMO_VISUAL_PEOPLE)[]>;
