export const DEMO_VISUAL_PERSON_ROLES = ["contact", "member", "messaging-participant"] as const;

export type DemoVisualPersonRole = (typeof DEMO_VISUAL_PERSON_ROLES)[number];

export const DEMO_VISUAL_PEOPLE = {
  "hannah-kessler": {
    asset: "/demo/avatars/people/smb--hannah.jpg",
    name: "Hannah Kessler",
    roles: ["contact"],
  },
  "james-finch": {
    asset: "/demo/avatars/people/smb--james.jpg",
    name: "James Finch",
    roles: ["contact", "messaging-participant"],
  },
  "chloe-bennett": {
    asset: "/demo/avatars/people/smb--chloe.jpg",
    name: "Chloe Bennett",
    roles: ["contact", "messaging-participant"],
  },
  "sophie-turner": {
    asset: "/demo/avatars/people/smb--sophie.jpg",
    name: "Sophie Turner",
    roles: ["contact", "messaging-participant"],
  },
  "megan-hughes": {
    asset: "/demo/avatars/people/smb--megan.jpg",
    name: "Megan Hughes",
    roles: ["contact", "messaging-participant"],
  },
  "lucas-grant": {
    asset: "/demo/avatars/people/smb--lucas.jpg",
    name: "Lucas Grant",
    roles: ["contact", "messaging-participant"],
  },
  "helen-ashworth": {
    asset: "/demo/avatars/people/consultants--helen.jpg",
    name: "Helen Ashworth",
    roles: ["contact"],
  },
  "martin-pryce": {
    asset: "/demo/avatars/people/consultants--martin.jpg",
    name: "Martin Pryce",
    roles: ["contact"],
  },
  "laura-bennett": {
    asset: "/demo/avatars/people/consultants--laura.jpg",
    name: "Laura Bennett",
    roles: ["contact"],
  },
  "rachel-donovan": {
    asset: "/demo/avatars/people/agencies--rachel.jpg",
    name: "Rachel Donovan",
    roles: ["contact"],
  },
  "michael-sutton": {
    asset: "/demo/avatars/people/agencies--michael.jpg",
    name: "Michael Sutton",
    roles: ["contact"],
  },
  "ben-carlisle": {
    asset: "/demo/avatars/people/agencies--ben.jpg",
    name: "Ben Carlisle",
    roles: ["contact"],
  },
  "sam-whitaker": {
    asset: "/demo/avatars/people/freelancers--sam.jpg",
    name: "Sam Whitaker",
    roles: ["contact"],
  },
  "nina-castillo": {
    asset: "/demo/avatars/people/freelancers--nina.jpg",
    name: "Nina Castillo",
    roles: ["contact", "messaging-participant"],
  },
  "dan-okafor": {
    asset: "/demo/avatars/people/freelancers--dan.jpg",
    name: "Dan Okafor",
    roles: ["contact"],
  },
  "diane-harlow": {
    asset: "/demo/avatars/people/startups--precisionCeo.jpg",
    name: "Diane Harlow",
    roles: ["contact", "messaging-participant"],
  },
  "elena-marsh": {
    asset: "/demo/avatars/people/startups--seedPartner.jpg",
    name: "Elena Marsh",
    roles: ["contact"],
  },
  "greg-holloway": {
    asset: "/demo/avatars/people/startups--pumpsIt.jpg",
    name: "Greg Holloway",
    roles: ["contact"],
  },
  "diane-mercer": {
    asset: "/demo/avatars/people/client-management--diane.jpg",
    name: "Diane Mercer",
    roles: ["contact"],
  },
  "patrick-quinn": {
    asset: "/demo/avatars/people/client-management--patrick.jpg",
    name: "Patrick Quinn",
    roles: ["contact"],
  },
  "karen-doyle": {
    asset: "/demo/avatars/people/client-management--karen.jpg",
    name: "Karen Doyle",
    roles: ["contact"],
  },
  "peter-nolan": {
    asset: "/demo/avatars/people/sales-pipeline--peter.jpg",
    name: "Peter Nolan",
    roles: ["contact"],
  },
  "helen-carver": {
    asset: "/demo/avatars/people/sales-pipeline--helen.jpg",
    name: "Helen Carver",
    roles: ["contact"],
  },
  "rachel-dawson": {
    asset: "/demo/avatars/people/linkedin-crm--rachel.jpg",
    name: "Rachel Dawson",
    roles: ["contact", "messaging-participant"],
  },
  "george-lamb": {
    asset: "/demo/avatars/people/linkedin-crm--george.jpg",
    name: "George Lamb",
    roles: ["contact", "messaging-participant"],
  },
  "kate-morrison": {
    asset: "/demo/avatars/people/linkedin-crm--kate.jpg",
    name: "Kate Morrison",
    roles: ["contact"],
  },
  "claire-donovan": {
    asset: "/demo/avatars/people/whatsapp-crm--claire.jpg",
    name: "Claire Donovan",
    roles: ["contact", "messaging-participant"],
  },
  "tom-marlowe": {
    asset: "/demo/avatars/people/whatsapp-crm--tom.jpg",
    name: "Tom Marlowe",
    roles: ["contact"],
  },
  "max-bergmann": {
    asset: "/demo/avatars/people/team--max-bergmann.jpg",
    name: "Max Bergmann",
    roles: ["member"],
  },
  "sofia-rossi": {
    asset: "/demo/avatars/people/team--sofia-rossi.jpg",
    name: "Sofia Rossi",
    roles: ["member"],
  },
  "elena-hoffmann": {
    asset: "/demo/avatars/people/team--elena-hoffmann.jpg",
    name: "Elena Hoffmann",
    roles: ["member"],
  },
  "kian-rahimi": {
    asset: "/demo/avatars/people/team--kian-rahimi.jpg",
    name: "Kian Rahimi",
    roles: ["member"],
  },
  "laura-fischer": {
    asset: "/demo/avatars/people/team--laura-fischer.jpg",
    name: "Laura Fischer",
    roles: ["member"],
  },
  "clara-neumann": {
    asset: "/demo/avatars/people/team--clara-neumann.jpg",
    name: "Clara Neumann",
    roles: ["member", "messaging-participant"],
  },
  "marco-silva": {
    asset: "/demo/avatars/people/team--marco-silva.jpg",
    name: "Marco Silva",
    roles: ["member", "messaging-participant"],
  },
} as const satisfies Record<
  string,
  {
    asset: `/demo/avatars/people/${string}.jpg`;
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
      de: "Riverton HVAC Service - Jahreswartung",
      en: "Riverton HVAC Service - yearly maintenance",
    },
    name: "Riverton HVAC Service - yearly maintenance",
    status: "deal-lost",
    totalValue: 8400,
    weightedValue: 0,
  },
  "deal-oakridge-climate-systems": {
    assignee: "max-bergmann",
    currency: "EUR",
    kind: "deal",
    localizedName: {
      de: "Oakridge Climate Systems - Wartungsplan Wärmepumpe",
      en: "Oakridge Climate Systems - heat pump service plan",
    },
    name: "Oakridge Climate Systems - heat pump service plan",
    status: "deal-open",
    totalValue: 6720,
    weightedValue: 2016,
  },
  "deal-moorfield-property-management": {
    assignee: "max-bergmann",
    currency: "EUR",
    kind: "deal",
    localizedName: {
      de: "Moorfield Property Management - Jahresprüfungen",
      en: "Moorfield Property Management - yearly inspections",
    },
    name: "Moorfield Property Management - yearly inspections",
    status: "deal-won",
    totalValue: 14400,
    weightedValue: 14400,
  },
  "deal-altmark-heating-cooling": {
    assignee: "max-bergmann",
    currency: "EUR",
    kind: "deal",
    localizedName: {
      de: "Altmark Heating and Cooling - Servicevertrag",
      en: "Altmark Heating and Cooling - service agreement",
    },
    name: "Altmark Heating and Cooling - service agreement",
    status: "deal-won",
    totalValue: 9600,
    weightedValue: 9600,
  },
  "deal-mainbrueck-solar": {
    assignee: "max-bergmann",
    currency: "EUR",
    kind: "deal",
    localizedName: {
      de: "Mainbrück Solar - Wechselrichter-Tausch",
      en: "Mainbrück Solar - inverter replacement",
    },
    name: "Mainbrück Solar - inverter replacement",
    status: "deal-open",
    totalValue: 4800,
    weightedValue: 1440,
  },
  "deal-sonnenhof-fire-safety": {
    assignee: "max-bergmann",
    currency: "EUR",
    kind: "deal",
    localizedName: {
      de: "Sonnenhof Fire and Safety - Jahresinspektion",
      en: "Sonnenhof Fire and Safety - annual inspections",
    },
    name: "Sonnenhof Fire and Safety - annual inspections",
    projectPeriod: ["2026-10-19", "2027-10-18"],
    status: "deal-open",
    totalQuantity: 24,
    totalValue: 7200,
    weightedValue: 2160,
  },
  "deal-ironvale-pump-service": {
    assignee: "max-bergmann",
    currency: "EUR",
    kind: "deal",
    localizedName: {
      de: "Ironvale Pump Service - Pumpenrevision",
      en: "Ironvale Pump Service - pump overhaul",
    },
    name: "Ironvale Pump Service - pump overhaul",
    status: "deal-lost",
    totalValue: 12600,
    weightedValue: 0,
  },
  "deal-hansen-building-services": {
    assignee: "max-bergmann",
    currency: "EUR",
    kind: "deal",
    localizedName: {
      de: "Hansen Building Services - Wartungs-Retainer",
      en: "Hansen Building Services - maintenance retainer",
    },
    name: "Hansen Building Services - maintenance retainer",
    status: "deal-won",
    totalValue: 18000,
    weightedValue: 18000,
  },
  "deal-brightwater-fire-safety": {
    assignee: "max-bergmann",
    currency: "EUR",
    kind: "deal",
    localizedName: {
      de: "Brightwater Fire and Safety - Brandschutztür-Prüfung",
      en: "Brightwater Fire and Safety - fire door checks",
    },
    name: "Brightwater Fire and Safety - fire door checks",
    status: "deal-abandoned",
    totalValue: 3900,
    weightedValue: 0,
  },
  "deal-lowell-property-care": {
    assignee: "max-bergmann",
    currency: "EUR",
    kind: "deal",
    localizedName: {
      de: "Lowell Property Care - Saisonservice",
      en: "Lowell Property Care - seasonal service",
    },
    name: "Lowell Property Care - seasonal service",
    status: "deal-won",
    totalValue: 5400,
    weightedValue: 5400,
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
    person: "nina-castillo",
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
  gmail: ["nina-castillo", "james-finch", "clara-neumann", "diane-harlow"],
  instagram: ["megan-hughes"],
  linkedin: ["rachel-dawson", "george-lamb"],
  outlook: ["chloe-bennett"],
  telegram: ["lucas-grant"],
  whatsapp: ["sophie-turner", "claire-donovan", "marco-silva"],
} as const satisfies Record<string, readonly (keyof typeof DEMO_VISUAL_PEOPLE)[]>;
