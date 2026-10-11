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
    roles: ["member"],
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
    roles: ["member"],
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
    roles: ["member", "messaging-participant"],
  },
  "marco-silva": {
    asset: "/demo/avatars/photos/marco-silva.png",
    name: "Marco Silva",
    roles: ["member", "messaging-participant"],
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
  "deal-riverton-hvac-service": {
    assignee: "max-bergmann",
    currency: "EUR",
    kind: "deal",
    localizedName: {
      de: "Riverton HVAC Service - Enterprise 213 - Neu",
      en: "Riverton HVAC Service - Enterprise 213 - New",
    },
    name: "Riverton HVAC Service - Enterprise 213 - New",
    status: "deal-lost",
    totalValue: 213931.6,
    weightedValue: 0,
  },
  "deal-oakridge-climate-systems": {
    assignee: "max-bergmann",
    currency: "EUR",
    kind: "deal",
    localizedName: {
      de: "Oakridge Climate Systems - Professional 140 - Neu",
      en: "Oakridge Climate Systems - Professional 140 - New",
    },
    name: "Oakridge Climate Systems - Professional 140 - New",
    status: "deal-open",
    totalValue: 86704,
    weightedValue: 26011.2,
  },
  "deal-moorfield-property-management": {
    assignee: "max-bergmann",
    currency: "EUR",
    kind: "deal",
    localizedName: {
      de: "Moorfield Property Management - Enterprise 373 - Neu",
      en: "Moorfield Property Management - Enterprise 373 - New",
    },
    name: "Moorfield Property Management - Enterprise 373 - New",
    status: "deal-won",
    totalValue: 347243.6,
    weightedValue: 347243.6,
  },
  "deal-altmark-heating-cooling": {
    assignee: "max-bergmann",
    currency: "EUR",
    kind: "deal",
    localizedName: {
      de: "Altmark Heating and Cooling - Enterprise 343 - Neu",
      en: "Altmark Heating and Cooling - Enterprise 343 - New",
    },
    name: "Altmark Heating and Cooling - Enterprise 343 - New",
    status: "deal-won",
    totalValue: 282331.2,
    weightedValue: 282331.2,
  },
  "deal-mainbrueck-solar": {
    assignee: "max-bergmann",
    currency: "EUR",
    kind: "deal",
    localizedName: {
      de: "Mainbrück Solar - Professional 120 - Neu",
      en: "Mainbrück Solar - Professional 120 - New",
    },
    name: "Mainbrück Solar - Professional 120 - New",
    status: "deal-open",
    totalValue: 80532,
    weightedValue: 24159.6,
  },
  "deal-sonnenhof-fire-safety": {
    assignee: "max-bergmann",
    currency: "EUR",
    kind: "deal",
    localizedName: {
      de: "Sonnenhof Fire and Safety - Enterprise 377 - Neu",
      en: "Sonnenhof Fire and Safety - Enterprise 377 - New",
    },
    name: "Sonnenhof Fire and Safety - Enterprise 377 - New",
    projectPeriod: ["2026-10-19", "2027-10-18"],
    status: "deal-open",
    totalQuantity: 382,
    totalValue: 310616.8,
    weightedValue: 93185.04,
  },
  "deal-ironvale-pump-service": {
    assignee: "max-bergmann",
    currency: "EUR",
    kind: "deal",
    localizedName: {
      de: "Ironvale Pump Service - Professional 141 - Neu",
      en: "Ironvale Pump Service - Professional 141 - New",
    },
    name: "Ironvale Pump Service - Professional 141 - New",
    status: "deal-lost",
    totalValue: 92262.6,
    weightedValue: 0,
  },
  "deal-hansen-building-services": {
    assignee: "max-bergmann",
    currency: "EUR",
    kind: "deal",
    localizedName: {
      de: "Hansen Building Services - Professional 159 - Neu",
      en: "Hansen Building Services - Professional 159 - New",
    },
    name: "Hansen Building Services - Professional 159 - New",
    status: "deal-won",
    totalValue: 110867.4,
    weightedValue: 110867.4,
  },
  "deal-brightwater-fire-safety": {
    assignee: "max-bergmann",
    currency: "EUR",
    kind: "deal",
    localizedName: {
      de: "Brightwater Fire and Safety - Professional 116 - Neu",
      en: "Brightwater Fire and Safety - Professional 116 - New",
    },
    name: "Brightwater Fire and Safety - Professional 116 - New",
    status: "deal-abandoned",
    totalValue: 78997.6,
    weightedValue: 0,
  },
  "deal-lowell-property-care": {
    assignee: "max-bergmann",
    currency: "EUR",
    kind: "deal",
    localizedName: {
      de: "Lowell Property Care - Professional 144 - Neu",
      en: "Lowell Property Care - Professional 144 - New",
    },
    name: "Lowell Property Care - Professional 144 - New",
    status: "deal-won",
    totalValue: 98038.4,
    weightedValue: 98038.4,
  },
} as const satisfies Record<
  string,
  {
    assignee: keyof typeof DEMO_VISUAL_PEOPLE;
    currency: "EUR";
    kind: "deal";
    localizedName: Readonly<Record<string, string>>;
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
  instagram: ["yasmin-farouk"],
  linkedin: ["leon-becker", "rashid-malik"],
  outlook: ["amin-hassan"],
  telegram: ["jonas-weber"],
  whatsapp: ["sophie-wagner", "jonas-weber", "marco-silva"],
} as const satisfies Record<string, readonly (keyof typeof DEMO_VISUAL_PEOPLE)[]>;
