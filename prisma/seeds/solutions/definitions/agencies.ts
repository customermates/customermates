import { DisplayType } from "@/features/widget/widget-display.schema";

import { day, defineSolution, photo, type RecordSpec, phoneNumber } from "../define-solution";

/**
 * Agencies: a small brand and marketing agency tracks its new business. Every pitch moves across the board from the
 * first inquiry through briefing, pitch preparation, proposal and negotiation to a decision; a won pitch can lead to a
 * retainer, an ordinary record the team keeps with its monthly fee, scope and review date (no billing). Emails around
 * a pitch belong to the pitch or client only when someone links them, and a follow-up after a presentation waits as a
 * draft.
 */

const ORGANIZATIONS = [
  "harlow",
  "bramble",
  "meridian",
  "quarry",
  "tidewell",
  "orchard",
  "copperleaf",
  "lumen",
  "wexford",
  "northshore",
  "pinewood",
  "greenmile",
] as const;
type OrganizationKey = (typeof ORGANIZATIONS)[number];
const CONTACTS = [
  "rachel",
  "tom",
  "nina",
  "laura",
  "greg",
  "jake",
  "diane",
  "kevin",
  "samantha",
  "michael",
  "erin",
  "priya",
  "jordan",
  "paul",
  "claire",
  "melissa",
  "ben",
  "alex",
] as const;
type ContactKey = (typeof CONTACTS)[number];
const DEALS = [
  "meridianBrand",
  "tidewellIdentity",
  "copperleafContent",
  "lumenLaunch",
  "orchardWebsite",
  "pinewoodReport",
  "harlowSpring",
  "brambleShop",
  "quarryLabels",
  "greenmileBrand",
  "harlowContent",
  "brambleSocial",
  "northshoreExhibition",
  "wexfordCatalogue",
  "harlowAutumn",
  "harlowSummer",
  "quarryTaproom",
  "quarryWebsite",
  "brambleMenu",
  "greenmileOpening",
  "copperleafEvents",
  "meridianCampaign",
  "lumenDeck",
  "wexfordShowroom",
  "harlowWinter",
  "wexfordLookbook",
  "quarryFestival",
  "brambleCatering",
] as const;
type DealKey = (typeof DEALS)[number];
const RETAINERS = [
  "harlowRetainer",
  "brambleRetainer",
  "greenmileRetainer",
  "quarryRetainer",
  "wexfordRetainer",
] as const;
type RetainerKey = (typeof RETAINERS)[number];
const TASKS = [
  "tidewellDeck",
  "tidewellRehearsal",
  "meridianFollowUp",
  "copperleafScope",
  "lumenNotes",
  "lumenQuestions",
  "orchardCall",
  "pinewoodReply",
  "harlowShoot",
  "brambleSamples",
  "quarryReview",
  "greenmileKickoff",
  "northshoreDebrief",
  "credentials",
] as const;
type TaskKey = (typeof TASKS)[number];

const en = {
  company: "Fernhill Creative",
  website: "https://fernhill-creative.example",
  phones: { office: { templates: ["+1 312 555 01##", "+1 773 555 01##", "+1 847 555 01##"], start: 40 } },
  selfTitle: "Founder and managing director",
  lists: {
    organization: ["Client or prospect", "Clients and prospects", "Brands we work for or are pitching to."],
    contact: ["Contact", "Contacts", "Marketing leads, founders and decision makers at clients and prospects."],
    deal: ["Pitch", "Pitches", "New business from the first conversation to the client's decision."],
    retainer: [
      "Retainer",
      "Retainers",
      "Ongoing monthly engagements with clients, kept as records. Billing happens in the accounting tool.",
    ],
    task: ["Task", "Tasks", "Next actions with an owner and a due date."],
  },
  fields: {
    industry: "Industry",
    relationship: "Relationship",
    city: "City",
    website: "Website",
    employees: "Employees",
    jobTitle: "Job title",
    phone: "Phone",
    decisionRole: "Decision role",
    source: "Source",
    services: "Services in scope",
    competitors: "Agencies in the pitch",
    pitchDate: "Pitch presentation",
    closeDate: "Decision expected",
    nextStep: "Next step",
    nextStepDate: "Next step date",
    lostReason: "Lost reason",
    monthlyFee: "Monthly fee",
    startDate: "Start date",
    reviewDate: "Review date",
    scope: "Scope",
    retainerStatus: "Status",
    dueDate: "Due date",
    priority: "Priority",
  },
  options: {
    industry: {
      retail: "Retail and consumer goods",
      food: "Food and drink",
      health: "Healthcare",
      hospitality: "Hospitality",
      technology: "Technology",
      finance: "Insurance and finance",
      culture: "Culture",
      education: "Education",
      manufacturing: "Manufacturing",
    },
    relationship: { prospect: "Prospect", client: "Client", former: "Former client" },
    decisionRole: { decisionMaker: "Decision maker", influencer: "Influencer", buyer: "Procurement" },
    source: {
      referral: "Referral",
      existing: "Existing client",
      inbound: "Website inquiry",
      invitation: "Pitch invitation",
      event: "Industry event",
    },
    services: {
      strategy: "Brand strategy",
      identity: "Visual identity",
      website: "Website",
      content: "Content production",
      packaging: "Packaging",
      social: "Social media",
      print: "Print and reports",
    },
    lostReason: {
      budget: "Budget",
      otherAgency: "Chose another agency",
      postponed: "Project postponed",
      fit: "Not the right fit",
    },
    retainerStatus: { active: "Active", paused: "Paused", ended: "Ended" },
    priority: { low: "Low", medium: "Medium", high: "High" },
  },
  stages: {
    inquiry: "Inquiry",
    briefing: "Briefing",
    pitchPreparation: "Pitch preparation",
    proposal: "Proposal sent",
    negotiation: "Negotiation",
    won: "Won",
    lost: "Lost",
  },
  organizations: {
    harlow: ["Harlow Outdoor Co.", "Chicago", "harlow-outdoor.example"],
    bramble: ["Bramble & Rye Bakery", "Evanston", "brambleandrye.example"],
    meridian: ["Meridian Health Clinics", "Chicago", "meridian-clinics.example"],
    quarry: ["Quarry Lane Brewing", "Milwaukee", "quarrylane-brewing.example"],
    tidewell: ["Tidewell Insurance", "Chicago", "tidewell-insurance.example"],
    orchard: ["Orchard Street Dental", "Oak Park", "orchardstreet-dental.example"],
    copperleaf: ["Copperleaf Hotels", "Chicago", "copperleaf-hotels.example"],
    lumen: ["Lumen Robotics", "Naperville", "lumen-robotics.example"],
    wexford: ["Wexford Furniture", "Grand Rapids", "wexford-furniture.example"],
    northshore: ["Northshore Art Museum", "Chicago", "northshore-museum.example"],
    pinewood: ["Pinewood Schools Foundation", "Evanston", "pinewood-foundation.example"],
    greenmile: ["Green Mile Cycles", "Chicago", "greenmile-cycles.example"],
  } satisfies Record<OrganizationKey, readonly [string, string, string]>,
  contacts: {
    rachel: ["Rachel", "Donovan", "Marketing director"],
    tom: ["Tom", "Whitaker", "Brand manager"],
    nina: ["Nina", "Patel", "Owner"],
    laura: ["Laura", "Kim", "Head of communications"],
    greg: ["Greg", "Holt", "Chief executive"],
    jake: ["Jake", "Morrison", "Co-founder"],
    diane: ["Diane", "Foster", "Marketing director"],
    kevin: ["Kevin", "Lowe", "Procurement manager"],
    samantha: ["Samantha", "Reyes", "Practice owner"],
    michael: ["Michael", "Sutton", "Commercial director"],
    erin: ["Erin", "Doyle", "Brand manager"],
    priya: ["Priya", "Raman", "Co-founder and CEO"],
    jordan: ["Jordan", "Pike", "Head of marketing"],
    paul: ["Paul", "Hendricks", "Managing director"],
    claire: ["Claire", "Benson", "Director of marketing"],
    melissa: ["Melissa", "Cho", "Executive director"],
    ben: ["Ben", "Carlisle", "Founder"],
    alex: ["Alex", "Romero", "Marketing lead"],
  } satisfies Record<ContactKey, readonly [string, string, string]>,
  deals: {
    meridianBrand: [
      "Meridian Health – brand refresh for six clinics",
      "Answer Laura's questions on the rollout phases",
    ],
    tidewellIdentity: ["Tidewell Insurance – brand identity and website", "Present the pitch to Diane and the board"],
    copperleafContent: [
      "Copperleaf Hotels – monthly content and social",
      "Agree on the notice period and the monthly fee",
    ],
    lumenLaunch: ["Lumen Robotics – launch positioning and website", "Send Priya the follow-up questions"],
    orchardWebsite: ["Orchard Street Dental – new website", "Intro call with Samantha"],
    pinewoodReport: ["Pinewood Foundation – annual report design", "Confirm the timeline with Melissa"],
    harlowSpring: ["Harlow Outdoor – spring collection launch content", "Send the follow-up after the presentation"],
    brambleShop: ["Bramble & Rye – packaging for the second shop", "Show Nina the packaging samples"],
    quarryLabels: ["Quarry Lane – seasonal beer labels", "Settle the number of label designs"],
    greenmileBrand: ["Green Mile Cycles – brand and social media", "Retainer started"],
    harlowContent: ["Harlow Outdoor – content retainer", "Retainer started"],
    brambleSocial: ["Bramble & Rye – social media retainer", "Retainer started"],
    northshoreExhibition: ["Northshore Art Museum – exhibition identity", "Feedback call done"],
    wexfordCatalogue: ["Wexford Furniture – catalogue and retainer renewal", "Closed lost"],
    harlowAutumn: ["Harlow Outdoor – autumn campaign content", "Campaign delivered"],
    harlowSummer: ["Harlow Outdoor – summer social campaign", "Campaign delivered"],
    quarryTaproom: ["Quarry Lane – taproom identity and menus", "Delivered"],
    quarryWebsite: ["Quarry Lane – new website", "Website live"],
    brambleMenu: ["Bramble & Rye – menu boards and bread bags", "Delivered"],
    greenmileOpening: ["Green Mile Cycles – shop opening campaign", "Campaign delivered"],
    copperleafEvents: ["Copperleaf Hotels – events brochure", "Closed lost"],
    meridianCampaign: ["Meridian Health – patient campaign", "Closed lost"],
    lumenDeck: ["Lumen Robotics – investor deck design", "Closed lost"],
    wexfordShowroom: ["Wexford Furniture – showroom graphics", "Closed lost"],
    harlowWinter: ["Harlow Outdoor – winter gear content", "Content delivered"],
    wexfordLookbook: ["Wexford Furniture – spring lookbook", "Delivered"],
    quarryFestival: ["Quarry Lane – beer festival print and social", "Campaign delivered"],
    brambleCatering: ["Bramble & Rye – catering menu and flyers", "Delivered"],
  } satisfies Record<DealKey, readonly [string, string]>,
  retainers: {
    harlowRetainer: [
      "Harlow Outdoor – content retainer",
      "Product photography, two shoots per quarter, monthly social content for Instagram and the newsletter.",
    ],
    brambleRetainer: [
      "Bramble & Rye – social media",
      "Three posts a week, seasonal menu boards, one shop photo session per quarter.",
    ],
    greenmileRetainer: [
      "Green Mile Cycles – brand and social",
      "Brand guardian role, social content for the new shop, event graphics for group rides.",
    ],
    quarryRetainer: [
      "Quarry Lane – brand support",
      "Label updates and taproom graphics. Paused over winter at the client's request.",
    ],
    wexfordRetainer: [
      "Wexford Furniture – brand support",
      "Catalogue layout and showroom graphics. Ended after the client moved design in-house.",
    ],
  } satisfies Record<RetainerKey, readonly [string, string]>,
  tasks: {
    tidewellDeck: "Finish the pitch deck for Tidewell",
    tidewellRehearsal: "Rehearse the Tidewell presentation with the team",
    meridianFollowUp: "Follow up with Laura on the Meridian proposal",
    copperleafScope: "Send Copperleaf the revised scope and monthly fee",
    lumenNotes: "Write up the Lumen briefing notes",
    lumenQuestions: "Send Priya the follow-up questions on positioning",
    orchardCall: "Intro call with Samantha at Orchard Street Dental",
    pinewoodReply: "Reply to Pinewood about the annual report timeline",
    harlowShoot: "Price the spring content shoot for Harlow",
    brambleSamples: "Order packaging samples for Bramble & Rye",
    quarryReview: "Prepare the Quarry Lane retainer review",
    greenmileKickoff: "Kick-off meeting with Green Mile Cycles",
    northshoreDebrief: "Ask Northshore for feedback on the lost pitch",
    credentials: "Add the Green Mile work to our credentials deck",
  } satisfies Record<TaskKey, string>,
  views: {
    pitchBoard: "Pitch board",
    nextSteps: "Next steps",
    clients: "Clients and prospects",
    retainers: "Retainers",
    allContacts: "All contacts",
    dueSoon: "Due soon",
  },
  widgets: {
    retainerMrr: "Retainer MRR",
    openPitches: "Open pitch value",
    won: "Won in the last 12 months",
    overdueTasks: "Overdue tasks",
    byStage: "Open pitch value by stage",
    lostByReason: "Lost pitches by reason",
    byDiscipline: "Open pitches by discipline",
    wonByMonth: "Won value by month",
    topClients: "Top clients by won value",
  },
  wiki: {
    guide: {
      title: "Operating Guide",
      markdown: [
        "Fernhill Creative is a brand and marketing agency of eight people in Chicago. We work for consumer brands, hospitality and healthcare clients. This workspace is demo data; every company and person in it is fictional.",
        "",
        "## How we use the CRM",
        "- **Pitches** are our new business. The pitch board shows every pitch by stage, from the first inquiry to the decision. The value is our estimate of the first year's fees, entered by hand; the weighted value is that estimate times the stage probability.",
        "- **Clients and prospects** are the brands we work for or pitch to. **Contacts** are the people there.",
        "- **Retainers** are ordinary records we keep for ongoing client work: monthly fee, scope, start and review date, status. They do not create invoices or recurring billing; billing stays in our accounting tool.",
        "- **Tasks** and the next step date on a pitch are ordinary fields. Nobody gets an automatic reminder, so check the Next steps and Due soon views every morning.",
        "- An email belongs to a pitch or a client only when someone links it there. Link every thread about a pitch to that pitch.",
        "",
        "## Working rules",
        "- Every open pitch has a next step and a next step date.",
        "- When a pitch is won, set it to Won and create the retainer, linked to the client and the pitch.",
        "- When a pitch is lost, record the reason and ask for feedback.",
        "- Project delivery, timesheets and billing stay in their own tools.",
      ],
    },
    process: {
      title: "Pitch process",
      markdown: [
        "Every pitch moves through the same stages on the pitch board. This page explains what each stage means for us.",
        "",
        "## Stages",
        "1. **Inquiry:** someone asks about working with us. Add the client and the person who asked.",
        "2. **Briefing:** we have the brief or a briefing call, know the budget range, the deadline and who decides.",
        "3. **Pitch preparation:** the team works on the idea and the deck. Enter the presentation date and the number of agencies in the pitch.",
        "4. **Proposal sent:** the presentation is done and the written proposal with scope and fees is with the client.",
        "5. **Negotiation:** scope, fee and terms are being agreed.",
        "6. **Won or Lost:** record the outcome. Won pitches with ongoing work get a retainer record.",
      ],
    },
    afterPitch: {
      title: "After a pitch presentation",
      whenToUse: "When we presented a pitch to a client or prospect and the follow-up email is due.",
      markdown: [
        "The day after a presentation decides how the client remembers it. Follow these steps for every pitch we present.",
        "",
        "## Steps",
        "1. Write a short thank-you email that sums up the two or three points the client reacted to most.",
        "2. Answer open questions from the meeting or name the date when you will.",
        "3. Link the email thread to the pitch and the client.",
        "4. Move the pitch to Proposal sent once the proposal is out, and set the next step and its date.",
        "5. Create a task for every promise you made in the room.",
      ],
    },
  },
  threads: {
    tidewellBrief: {
      subject: "Tidewell brand pitch – presentation date and questions",
      messages: [
        "Hi Max,\n\nThanks for confirming your participation. We have invited three agencies. The presentations take place next week; you have 60 minutes including questions.\n\nPlease send any questions about the brief by Friday.\n\nBest regards,\nDiane Foster",
        "Hi Diane,\n\nThank you, next week works for us. Two questions: is the website relaunch part of the same budget, and will your board members join the presentation?\n\nBest,\nMax",
        "Good questions. The website is part of the budget, the split is up to you. Our CEO and Kevin from procurement will join.",
      ],
    },
    meridianProposal: {
      subject: "Meridian brand refresh – proposal",
      messages: [
        "Hi Laura,\n\nAs promised, here is our proposal for the brand refresh of all six clinics, including the signage rollout in two phases.\n\nBest,\nMax",
        "Hi Max,\n\nThanks, the team liked it a lot. Greg asked whether we could start with the three downtown clinics and do the rest next year. Would that change the fee?\n\nLaura",
      ],
    },
    copperleafTerms: {
      name: "Copperleaf content retainer",
      subject: "Copperleaf content retainer – terms",
      messages: [
        "Hi Max, we are happy with the scope. Could we agree on a three-month notice period instead of six?",
        "Hi Michael, three months works if we fix the scope for the first two quarters. I will send the revised terms on Thursday.",
        "Sounds fair. I would like the first shoot before the holiday season, so the sooner we sign, the better.",
      ],
    },
    harlowFollowUp: {
      subject: "Spring collection presentation",
      messages: [
        "Hi Rachel,\n\nLooking forward to presenting our ideas for the spring collection on Tuesday at 10.\n\nBest,\nMax",
        "Great, see you then. Tom will join as well.",
        "Hi Rachel, hi Tom,\n\nThank you for your time yesterday. Three things we took away: you liked the trail portraits most, the launch should start with the newsletter, and the shoot needs to happen before the end of February.\n\nI will send the written proposal with the shoot days and fees by Friday.\n\nBest,\nMax",
      ],
    },
    orchardInquiry: {
      subject: "New website for our practice",
      messages: [
        "Hello,\n\nWe are a dental practice in Oak Park and our website is ten years old. A friend at Bramble & Rye recommended you. Do you take on smaller projects like ours?\n\nKind regards,\nSamantha Reyes",
        "Hi Samantha,\n\nThank you for thinking of us. Yes, we do. Would a 30-minute call next week work to talk about what the new site needs to do?\n\nBest,\nMax",
      ],
    },
    greenmileKickoff: {
      subject: "Kick-off and first month",
      messages: [
        "Hi Max, thanks for a great kick-off. Alex will be your contact for the day-to-day social posts.",
        "Thanks, Ben. We will send the first month's content plan to Alex on Monday.",
      ],
    },
  },
  calendar: {
    name: "Pitch dates",
    events: ["Tidewell pitch presentation", "Call with Meridian about the rollout"],
  },
};

type Strings = typeof en;

const de: Strings = {
  company: "Kranich Kommunikation",
  website: "https://kranich-kommunikation.example",
  phones: { office: { templates: ["+49 30 23125 4##"], start: 0 } },
  selfTitle: "Gründer und Geschäftsführer",
  lists: {
    organization: ["Kunde oder Interessent", "Kunden und Interessenten", "Marken, für die wir arbeiten oder pitchen."],
    contact: ["Kontakt", "Kontakte", "Marketingverantwortliche, Gründer und Entscheider bei Kunden und Interessenten."],
    deal: ["Pitch", "Pitches", "Neugeschäft vom ersten Gespräch bis zur Entscheidung des Kunden."],
    retainer: [
      "Retainer",
      "Retainer",
      "Laufende monatliche Betreuung von Kunden, als Datensätze geführt. Abgerechnet wird in der Buchhaltung.",
    ],
    task: ["Aufgabe", "Aufgaben", "Nächste Schritte mit Verantwortlichen und Fälligkeitsdatum."],
  },
  fields: {
    industry: "Branche",
    relationship: "Beziehung",
    city: "Ort",
    website: "Website",
    employees: "Mitarbeitende",
    jobTitle: "Position",
    phone: "Telefon",
    decisionRole: "Rolle in der Entscheidung",
    source: "Quelle",
    services: "Leistungsumfang",
    competitors: "Agenturen im Pitch",
    pitchDate: "Präsentationstermin",
    closeDate: "Entscheidung erwartet",
    nextStep: "Nächster Schritt",
    nextStepDate: "Datum nächster Schritt",
    lostReason: "Verlustgrund",
    monthlyFee: "Monatliches Honorar",
    startDate: "Beginn",
    reviewDate: "Überprüfung am",
    scope: "Umfang",
    retainerStatus: "Status",
    dueDate: "Fällig am",
    priority: "Priorität",
  },
  options: {
    industry: {
      retail: "Handel und Konsumgüter",
      food: "Lebensmittel und Getränke",
      health: "Gesundheit",
      hospitality: "Hotellerie",
      technology: "Technologie",
      finance: "Versicherung und Finanzen",
      culture: "Kultur",
      education: "Bildung",
      manufacturing: "Produktion",
    },
    relationship: { prospect: "Interessent", client: "Kunde", former: "Ehemaliger Kunde" },
    decisionRole: { decisionMaker: "Entscheider", influencer: "Beeinflusser", buyer: "Einkauf" },
    source: {
      referral: "Empfehlung",
      existing: "Bestandskunde",
      inbound: "Anfrage über die Website",
      invitation: "Einladung zum Pitch",
      event: "Branchenveranstaltung",
    },
    services: {
      strategy: "Markenstrategie",
      identity: "Corporate Design",
      website: "Website",
      content: "Content-Produktion",
      packaging: "Verpackung",
      social: "Social Media",
      print: "Print und Berichte",
    },
    lostReason: {
      budget: "Budget",
      otherAgency: "Andere Agentur gewählt",
      postponed: "Projekt verschoben",
      fit: "Passt nicht zu uns",
    },
    retainerStatus: { active: "Aktiv", paused: "Pausiert", ended: "Beendet" },
    priority: { low: "Niedrig", medium: "Mittel", high: "Hoch" },
  },
  stages: {
    inquiry: "Anfrage",
    briefing: "Briefing",
    pitchPreparation: "Pitch-Vorbereitung",
    proposal: "Angebot gesendet",
    negotiation: "Verhandlung",
    won: "Gewonnen",
    lost: "Verloren",
  },
  organizations: {
    harlow: ["Hartmann Outdoor GmbH", "Leipzig", "hartmann-outdoor.example"],
    bramble: ["Backhaus Brombeere", "Leipzig", "backhaus-brombeere.example"],
    meridian: ["Meridian Gesundheitszentren", "Halle (Saale)", "meridian-gesundheit.example"],
    quarry: ["Brauerei Steinbruch", "Chemnitz", "brauerei-steinbruch.example"],
    tidewell: ["Gezeiten Versicherung AG", "Dresden", "gezeiten-versicherung.example"],
    orchard: ["Zahnzentrum am Obstmarkt", "Markkleeberg", "zahnzentrum-obstmarkt.example"],
    copperleaf: ["Kupferblatt Hotels", "Dresden", "kupferblatt-hotels.example"],
    lumen: ["Lumen Robotik GmbH", "Jena", "lumen-robotik.example"],
    wexford: ["Möbelwerk Weber", "Erfurt", "moebelwerk-weber.example"],
    northshore: ["Kunsthalle Nordufer", "Magdeburg", "kunsthalle-nordufer.example"],
    pinewood: ["Bildungsstiftung Waldblick", "Leipzig", "stiftung-waldblick.example"],
    greenmile: ["Grünweg Fahrräder", "Leipzig", "gruenweg-fahrraeder.example"],
  },
  contacts: {
    rachel: ["Katrin", "Vogt", "Marketingleiterin"],
    tom: ["Tobias", "Wendt", "Markenmanager"],
    nina: ["Nina", "Seidel", "Inhaberin"],
    laura: ["Laura", "Kühn", "Leiterin Unternehmenskommunikation"],
    greg: ["Gerd", "Holtmann", "Geschäftsführer"],
    jake: ["Jakob", "Morgenstern", "Mitgründer"],
    diane: ["Dagmar", "Fuchs", "Marketingleiterin"],
    kevin: ["Kevin", "Lorenz", "Leiter Einkauf"],
    samantha: ["Sabine", "Reuter", "Praxisinhaberin"],
    michael: ["Michael", "Sommer", "Kaufmännischer Leiter"],
    erin: ["Elif", "Demir", "Markenmanagerin"],
    priya: ["Paula", "Rademacher", "Mitgründerin und Geschäftsführerin"],
    jordan: ["Jonas", "Pietsch", "Leiter Marketing"],
    paul: ["Peter", "Weber", "Geschäftsführer"],
    claire: ["Charlotte", "Benz", "Leiterin Marketing"],
    melissa: ["Miriam", "Scholz", "Vorständin"],
    ben: ["Benedikt", "Kaiser", "Gründer"],
    alex: ["Alexandra", "Ritter", "Marketing"],
  },
  deals: {
    meridianBrand: [
      "Meridian Gesundheitszentren – Markenauffrischung für sechs Standorte",
      "Fragen von Frau Kühn zu den Ausbaustufen beantworten",
    ],
    tidewellIdentity: [
      "Gezeiten Versicherung – Corporate Design und Website",
      "Pitch vor Frau Fuchs und dem Vorstand präsentieren",
    ],
    copperleafContent: [
      "Kupferblatt Hotels – monatlicher Content und Social Media",
      "Kündigungsfrist und monatliches Honorar abstimmen",
    ],
    lumenLaunch: [
      "Lumen Robotik – Positionierung zum Marktstart und Website",
      "Rückfragen an Frau Rademacher schicken",
    ],
    orchardWebsite: ["Zahnzentrum am Obstmarkt – neue Website", "Kennenlerngespräch mit Frau Reuter"],
    pinewoodReport: ["Bildungsstiftung Waldblick – Gestaltung Jahresbericht", "Zeitplan mit Frau Scholz bestätigen"],
    harlowSpring: [
      "Hartmann Outdoor – Content zur Frühjahrskollektion",
      "Nachfass-E-Mail nach der Präsentation senden",
    ],
    brambleShop: ["Backhaus Brombeere – Verpackung für die zweite Filiale", "Frau Seidel die Verpackungsmuster zeigen"],
    quarryLabels: ["Brauerei Steinbruch – Etiketten für Saisonbiere", "Anzahl der Etikettenentwürfe festlegen"],
    greenmileBrand: ["Grünweg Fahrräder – Marke und Social Media", "Retainer gestartet"],
    harlowContent: ["Hartmann Outdoor – Content-Retainer", "Retainer gestartet"],
    brambleSocial: ["Backhaus Brombeere – Social-Media-Retainer", "Retainer gestartet"],
    northshoreExhibition: ["Kunsthalle Nordufer – Ausstellungsdesign", "Feedbackgespräch geführt"],
    wexfordCatalogue: ["Möbelwerk Weber – Katalog und Verlängerung des Retainers", "Verloren"],
    harlowAutumn: ["Hartmann Outdoor – Content zur Herbstkampagne", "Kampagne geliefert"],
    harlowSummer: ["Hartmann Outdoor – Social-Media-Kampagne im Sommer", "Kampagne geliefert"],
    quarryTaproom: ["Brauerei Steinbruch – Auftritt und Karten für den Ausschank", "Geliefert"],
    quarryWebsite: ["Brauerei Steinbruch – neue Website", "Website online"],
    brambleMenu: ["Backhaus Brombeere – Thekentafeln und Brottüten", "Geliefert"],
    greenmileOpening: ["Grünweg Fahrräder – Kampagne zur Ladeneröffnung", "Kampagne geliefert"],
    copperleafEvents: ["Kupferblatt Hotels – Veranstaltungsbroschüre", "Verloren"],
    meridianCampaign: ["Meridian Gesundheitszentren – Patientenkampagne", "Verloren"],
    lumenDeck: ["Lumen Robotik – Gestaltung der Investorenpräsentation", "Verloren"],
    wexfordShowroom: ["Möbelwerk Weber – Grafiken für die Ausstellung", "Verloren"],
    harlowWinter: ["Hartmann Outdoor – Content zur Winterausrüstung", "Content geliefert"],
    wexfordLookbook: ["Möbelwerk Weber – Lookbook für das Frühjahr", "Geliefert"],
    quarryFestival: ["Brauerei Steinbruch – Print und Social Media zum Bierfest", "Kampagne geliefert"],
    brambleCatering: ["Backhaus Brombeere – Cateringkarte und Flyer", "Geliefert"],
  },
  retainers: {
    harlowRetainer: [
      "Hartmann Outdoor – Content-Retainer",
      "Produktfotografie mit zwei Shootings pro Quartal, monatlicher Content für Instagram und den Newsletter.",
    ],
    brambleRetainer: [
      "Backhaus Brombeere – Social Media",
      "Drei Beiträge pro Woche, saisonale Tafeln für die Theke, ein Fotoshooting in der Filiale pro Quartal.",
    ],
    greenmileRetainer: [
      "Grünweg Fahrräder – Marke und Social Media",
      "Markenbetreuung, Social-Media-Content für den neuen Laden, Grafiken für die gemeinsamen Ausfahrten.",
    ],
    quarryRetainer: [
      "Brauerei Steinbruch – Markenbetreuung",
      "Anpassungen an Etiketten und Grafiken für den Ausschank. Auf Wunsch des Kunden über den Winter pausiert.",
    ],
    wexfordRetainer: [
      "Möbelwerk Weber – Markenbetreuung",
      "Katalogsatz und Grafiken für die Ausstellung. Beendet, seit der Kunde die Gestaltung selbst übernimmt.",
    ],
  },
  tasks: {
    tidewellDeck: "Pitch-Präsentation für die Gezeiten Versicherung fertigstellen",
    tidewellRehearsal: "Präsentation für die Gezeiten Versicherung mit dem Team proben",
    meridianFollowUp: "Bei Frau Kühn zum Angebot für Meridian nachfassen",
    copperleafScope: "Überarbeiteten Umfang und Honorar an Kupferblatt Hotels senden",
    lumenNotes: "Notizen aus dem Briefing mit Lumen Robotik aufschreiben",
    lumenQuestions: "Rückfragen zur Positionierung an Frau Rademacher senden",
    orchardCall: "Kennenlerngespräch mit Frau Reuter vom Zahnzentrum",
    pinewoodReply: "Der Bildungsstiftung zum Zeitplan des Jahresberichts antworten",
    harlowShoot: "Shooting für den Frühjahrs-Content von Hartmann Outdoor kalkulieren",
    brambleSamples: "Verpackungsmuster für das Backhaus Brombeere bestellen",
    quarryReview: "Überprüfung des Retainers mit der Brauerei Steinbruch vorbereiten",
    greenmileKickoff: "Kick-off mit Grünweg Fahrräder",
    northshoreDebrief: "Bei der Kunsthalle Nordufer Feedback zum verlorenen Pitch einholen",
    credentials: "Arbeiten für Grünweg in die Agenturpräsentation aufnehmen",
  },
  views: {
    pitchBoard: "Pitch-Board",
    nextSteps: "Nächste Schritte",
    clients: "Kunden und Interessenten",
    retainers: "Retainer",
    allContacts: "Alle Kontakte",
    dueSoon: "Bald fällig",
  },
  widgets: {
    retainerMrr: "Retainer pro Monat",
    openPitches: "Offenes Pitch-Volumen",
    won: "Gewonnen in 12 Monaten",
    overdueTasks: "Überfällige Aufgaben",
    byStage: "Offenes Pitch-Volumen nach Phase",
    lostByReason: "Verlorene Pitches nach Grund",
    byDiscipline: "Offene Pitches nach Leistung",
    wonByMonth: "Gewonnener Wert pro Monat",
    topClients: "Top-Kunden nach gewonnenem Wert",
  },
  wiki: {
    guide: {
      title: "Leitfaden",
      markdown: [
        "Kranich Kommunikation ist eine Agentur für Marke und Kommunikation mit acht Leuten in Leipzig. Wir arbeiten für Konsumgütermarken, Hotellerie und Gesundheitsunternehmen. Dieser Arbeitsbereich enthält Demodaten; alle Firmen und Personen sind erfunden.",
        "",
        "## So nutzen wir das CRM",
        "- **Pitches** sind unser Neugeschäft. Das Pitch-Board zeigt jeden Pitch nach Phase, von der ersten Anfrage bis zur Entscheidung. Der Wert ist unsere Schätzung der Honorare im ersten Jahr und wird von Hand eingetragen; der gewichtete Wert ist diese Schätzung mal der Wahrscheinlichkeit der Phase.",
        "- **Kunden und Interessenten** sind die Marken, für die wir arbeiten oder pitchen. **Kontakte** sind die Menschen dort.",
        "- **Retainer** sind normale Datensätze für laufende Kundenarbeit: Monatshonorar, Umfang, Beginn, Überprüfungstermin und Status. Sie erzeugen keine Rechnungen und keine wiederkehrende Abrechnung; abgerechnet wird weiter in unserer Buchhaltung.",
        "- **Aufgaben** und das Datum des nächsten Schritts an einem Pitch sind normale Felder. Niemand wird automatisch erinnert, deshalb jeden Morgen die Ansichten „Nächste Schritte“ und „Bald fällig“ prüfen.",
        "- Eine E-Mail gehört nur dann zu einem Pitch oder Kunden, wenn jemand sie dort verknüpft. Jeden Verlauf zu einem Pitch mit diesem Pitch verknüpfen.",
        "",
        "## Arbeitsregeln",
        "- Jeder offene Pitch hat einen nächsten Schritt mit Datum.",
        "- Ist ein Pitch gewonnen, auf „Gewonnen“ setzen und den Retainer anlegen, verknüpft mit Kunde und Pitch.",
        "- Ist ein Pitch verloren, den Grund eintragen und um Feedback bitten.",
        "- Projektabwicklung, Zeiterfassung und Abrechnung bleiben in ihren eigenen Programmen.",
      ],
    },
    process: {
      title: "Ablauf eines Pitches",
      markdown: [
        "Jeder Pitch durchläuft auf dem Pitch-Board dieselben Phasen. Diese Seite erklärt, was jede Phase für uns bedeutet.",
        "",
        "## Phasen",
        "1. **Anfrage:** Jemand möchte mit uns arbeiten. Kunde und anfragende Person anlegen.",
        "2. **Briefing:** Das Briefing liegt vor oder das Briefinggespräch ist geführt; Budgetrahmen, Termin und Entscheider sind bekannt.",
        "3. **Pitch-Vorbereitung:** Das Team arbeitet an Idee und Präsentation. Präsentationstermin und Anzahl der Agenturen im Pitch eintragen.",
        "4. **Angebot gesendet:** Die Präsentation ist gehalten, das schriftliche Angebot mit Umfang und Honorar liegt beim Kunden.",
        "5. **Verhandlung:** Umfang, Honorar und Konditionen werden abgestimmt.",
        "6. **Gewonnen oder Verloren:** Ergebnis festhalten. Gewonnene Pitches mit laufender Arbeit bekommen einen Retainer.",
      ],
    },
    afterPitch: {
      title: "Nach einer Pitch-Präsentation",
      whenToUse:
        "Wenn wir einen Pitch bei Kunden oder Interessenten präsentiert haben und die Nachfass-E-Mail ansteht.",
      markdown: [
        "Der Tag nach einer Präsentation entscheidet, wie der Kunde sie in Erinnerung behält. Diese Schritte gelten für jeden Pitch.",
        "",
        "## Schritte",
        "1. Eine kurze Dankes-E-Mail schreiben, die die zwei oder drei Punkte zusammenfasst, auf die der Kunde am stärksten reagiert hat.",
        "2. Offene Fragen aus dem Termin beantworten oder sagen, bis wann die Antwort kommt.",
        "3. Den E-Mail-Verlauf mit dem Pitch und dem Kunden verknüpfen.",
        "4. Den Pitch auf „Angebot gesendet“ setzen, sobald das Angebot raus ist, und den nächsten Schritt mit Datum eintragen.",
        "5. Für jede Zusage aus dem Termin eine Aufgabe anlegen.",
      ],
    },
  },
  threads: {
    tidewellBrief: {
      subject: "Pitch Corporate Design – Präsentationstermin und Rückfragen",
      messages: [
        "Sehr geehrter Herr Bergmann,\n\nvielen Dank für Ihre Zusage. Wir haben drei Agenturen eingeladen. Die Präsentationen finden nächste Woche statt; Sie haben 60 Minuten einschließlich Fragen.\n\nRückfragen zum Briefing senden Sie bitte bis Freitag.\n\nMit freundlichen Grüßen\nDagmar Fuchs",
        "Sehr geehrte Frau Fuchs,\n\nvielen Dank, der Termin nächste Woche passt uns gut. Zwei Fragen: Gehört der Relaunch der Website zum selben Budget, und nimmt der Vorstand an der Präsentation teil?\n\nMit freundlichen Grüßen\nMax Bergmann",
        "Gute Fragen. Die Website gehört zum Budget, die Aufteilung überlassen wir Ihnen. Unser Vorstandsvorsitzender und Herr Lorenz aus dem Einkauf sind dabei.",
      ],
    },
    meridianProposal: {
      subject: "Markenauffrischung Meridian – Angebot",
      messages: [
        "Hallo Frau Kühn,\n\nwie besprochen erhalten Sie hier unser Angebot für die Markenauffrischung aller sechs Standorte, einschließlich der Beschilderung in zwei Ausbaustufen.\n\nViele Grüße\nMax Bergmann",
        "Hallo Herr Bergmann,\n\ndanke, das Team war sehr angetan. Herr Holtmann fragt, ob wir mit den drei Standorten in der Innenstadt beginnen und den Rest im nächsten Jahr machen können. Ändert das Ihr Honorar?\n\nLaura Kühn",
      ],
    },
    copperleafTerms: {
      name: "Content-Retainer Kupferblatt",
      subject: "Content-Retainer Kupferblatt – Konditionen",
      messages: [
        "Hallo Herr Bergmann, mit dem Umfang sind wir zufrieden. Können wir uns auf drei Monate Kündigungsfrist statt sechs einigen?",
        "Hallo Herr Sommer, drei Monate sind in Ordnung, wenn wir den Umfang für die ersten beiden Quartale festlegen. Die überarbeiteten Konditionen schicke ich Ihnen am Donnerstag.",
        "Klingt fair. Das erste Shooting hätte ich gern vor der Weihnachtssaison, je früher wir unterschreiben, desto besser.",
      ],
    },
    harlowFollowUp: {
      subject: "Präsentation Frühjahrskollektion",
      messages: [
        "Hallo Frau Vogt,\n\nich freue mich darauf, Ihnen am Dienstag um 10 Uhr unsere Ideen für die Frühjahrskollektion vorzustellen.\n\nViele Grüße\nMax Bergmann",
        "Prima, bis dann. Herr Wendt ist auch dabei.",
        "Hallo Frau Vogt, hallo Herr Wendt,\n\nvielen Dank für Ihre Zeit gestern. Drei Punkte haben wir mitgenommen: Die Porträts auf dem Wanderweg haben Ihnen am besten gefallen, der Auftakt soll über den Newsletter laufen, und das Shooting muss vor Ende Februar stattfinden.\n\nDas schriftliche Angebot mit Shootingtagen und Honorar schicke ich Ihnen bis Freitag.\n\nViele Grüße\nMax Bergmann",
      ],
    },
    orchardInquiry: {
      subject: "Neue Website für unsere Praxis",
      messages: [
        "Guten Tag,\n\nwir sind eine Zahnarztpraxis in Markkleeberg, und unsere Website ist zehn Jahre alt. Eine Bekannte vom Backhaus Brombeere hat Sie empfohlen. Übernehmen Sie auch kleinere Projekte wie unseres?\n\nMit freundlichen Grüßen\nSabine Reuter",
        "Sehr geehrte Frau Reuter,\n\nvielen Dank, dass Sie an uns gedacht haben. Ja, sehr gern. Passt Ihnen nächste Woche ein Gespräch von 30 Minuten, um zu besprechen, was die neue Website leisten soll?\n\nMit freundlichen Grüßen\nMax Bergmann",
      ],
    },
    greenmileKickoff: {
      subject: "Kick-off und erster Monat",
      messages: [
        "Hallo Herr Bergmann, danke für den gelungenen Kick-off. Für die laufenden Social-Media-Beiträge ist Frau Ritter Ihre Ansprechpartnerin.",
        "Danke, Herr Kaiser. Den Redaktionsplan für den ersten Monat schicken wir Frau Ritter am Montag.",
      ],
    },
  },
  calendar: {
    name: "Pitch-Termine",
    events: ["Pitch-Präsentation Gezeiten Versicherung", "Telefonat mit Meridian zu den Ausbaustufen"],
  },
};

type Member = "maxBergmann";

const ORGANIZATION_FACTS: Record<
  OrganizationKey,
  { industry: string; relationship: string; employees: number; createdDaysAgo: number }
> = {
  harlow: { industry: "retail", relationship: "client", employees: 140, createdDaysAgo: 420 },
  bramble: { industry: "food", relationship: "client", employees: 35, createdDaysAgo: 260 },
  meridian: { industry: "health", relationship: "prospect", employees: 210, createdDaysAgo: 75 },
  quarry: { industry: "food", relationship: "client", employees: 28, createdDaysAgo: 540 },
  tidewell: { industry: "finance", relationship: "prospect", employees: 380, createdDaysAgo: 30 },
  orchard: { industry: "health", relationship: "prospect", employees: 14, createdDaysAgo: 4 },
  copperleaf: { industry: "hospitality", relationship: "prospect", employees: 260, createdDaysAgo: 95 },
  lumen: { industry: "technology", relationship: "prospect", employees: 45, createdDaysAgo: 22 },
  wexford: { industry: "manufacturing", relationship: "former", employees: 120, createdDaysAgo: 700 },
  northshore: { industry: "culture", relationship: "prospect", employees: 60, createdDaysAgo: 110 },
  pinewood: { industry: "education", relationship: "prospect", employees: 25, createdDaysAgo: 9 },
  greenmile: { industry: "retail", relationship: "client", employees: 18, createdDaysAgo: 85 },
};

const CONTACT_FACTS: Record<
  ContactKey,
  { organization: OrganizationKey; role: string; createdDaysAgo: number; avatar?: Parameters<typeof photo>[0] }
> = {
  rachel: { organization: "harlow", role: "decisionMaker", createdDaysAgo: 418, avatar: "lea-bauer" },
  tom: { organization: "harlow", role: "influencer", createdDaysAgo: 400, avatar: "tim-weber" },
  nina: { organization: "bramble", role: "decisionMaker", createdDaysAgo: 258, avatar: "nia-johnson" },
  laura: { organization: "meridian", role: "influencer", createdDaysAgo: 74, avatar: "sophie-hoffmann" },
  greg: { organization: "meridian", role: "decisionMaker", createdDaysAgo: 60 },
  jake: { organization: "quarry", role: "decisionMaker", createdDaysAgo: 538 },
  diane: { organization: "tidewell", role: "decisionMaker", createdDaysAgo: 29, avatar: "anna-mueller" },
  kevin: { organization: "tidewell", role: "buyer", createdDaysAgo: 20 },
  samantha: { organization: "orchard", role: "decisionMaker", createdDaysAgo: 3 },
  michael: { organization: "copperleaf", role: "decisionMaker", createdDaysAgo: 93, avatar: "max-schmidt" },
  erin: { organization: "copperleaf", role: "influencer", createdDaysAgo: 90 },
  priya: { organization: "lumen", role: "decisionMaker", createdDaysAgo: 21, avatar: "leila-chen" },
  jordan: { organization: "lumen", role: "influencer", createdDaysAgo: 21 },
  paul: { organization: "wexford", role: "decisionMaker", createdDaysAgo: 690 },
  claire: { organization: "northshore", role: "decisionMaker", createdDaysAgo: 108 },
  melissa: { organization: "pinewood", role: "decisionMaker", createdDaysAgo: 8 },
  ben: { organization: "greenmile", role: "decisionMaker", createdDaysAgo: 84, avatar: "jonas-weber" },
  alex: { organization: "greenmile", role: "influencer", createdDaysAgo: 30 },
};

type DealFacts = {
  organization: OrganizationKey;
  contacts: ContactKey[];
  stage: string;
  source: string;
  services: string[];
  value: number;
  competitors?: number;
  pitch?: number;
  createdDaysAgo: number;
  close: number;
  next?: number;
  lost?: string;
  history?: Array<{ daysAgo: number; stage: string }>;
};

const DEAL_FACTS: Record<DealKey, DealFacts> = {
  meridianBrand: {
    organization: "meridian",
    contacts: ["laura", "greg"],
    stage: "proposal",
    source: "referral",
    services: ["strategy", "identity", "print"],
    value: 48000,
    competitors: 2,
    pitch: -9,
    createdDaysAgo: 72,
    close: 18,
    next: 1,
    history: [
      { daysAgo: 60, stage: "briefing" },
      { daysAgo: 35, stage: "pitchPreparation" },
      { daysAgo: 8, stage: "proposal" },
    ],
  },
  tidewellIdentity: {
    organization: "tidewell",
    contacts: ["diane", "kevin"],
    stage: "pitchPreparation",
    source: "invitation",
    services: ["strategy", "identity", "website"],
    value: 85000,
    competitors: 3,
    pitch: 6,
    createdDaysAgo: 28,
    close: 30,
    next: 6,
    history: [
      { daysAgo: 24, stage: "briefing" },
      { daysAgo: 12, stage: "pitchPreparation" },
    ],
  },
  copperleafContent: {
    organization: "copperleaf",
    contacts: ["michael", "erin"],
    stage: "negotiation",
    source: "event",
    services: ["content", "social"],
    value: 36000,
    competitors: 1,
    pitch: -30,
    createdDaysAgo: 92,
    close: 10,
    next: 2,
    history: [
      { daysAgo: 80, stage: "briefing" },
      { daysAgo: 50, stage: "pitchPreparation" },
      { daysAgo: 28, stage: "proposal" },
      { daysAgo: 7, stage: "negotiation" },
    ],
  },
  lumenLaunch: {
    organization: "lumen",
    contacts: ["priya", "jordan"],
    stage: "briefing",
    source: "inbound",
    services: ["strategy", "website"],
    value: 42000,
    createdDaysAgo: 20,
    close: 45,
    next: 5,
    history: [{ daysAgo: 3, stage: "briefing" }],
  },
  orchardWebsite: {
    organization: "orchard",
    contacts: ["samantha"],
    stage: "inquiry",
    source: "referral",
    services: ["website"],
    value: 14000,
    createdDaysAgo: 3,
    close: 60,
    next: 2,
  },
  pinewoodReport: {
    organization: "pinewood",
    contacts: ["melissa"],
    stage: "inquiry",
    source: "inbound",
    services: ["print"],
    value: 12000,
    createdDaysAgo: 8,
    close: 40,
    next: 6,
  },
  harlowSpring: {
    organization: "harlow",
    contacts: ["rachel", "tom"],
    stage: "pitchPreparation",
    source: "existing",
    services: ["content"],
    value: 22000,
    competitors: 0,
    pitch: -1,
    createdDaysAgo: 26,
    close: 14,
    next: 0,
    history: [
      { daysAgo: 18, stage: "briefing" },
      { daysAgo: 10, stage: "pitchPreparation" },
    ],
  },
  brambleShop: {
    organization: "bramble",
    contacts: ["nina"],
    stage: "briefing",
    source: "existing",
    services: ["packaging"],
    value: 9500,
    createdDaysAgo: 14,
    close: 35,
    next: 9,
    history: [{ daysAgo: 6, stage: "briefing" }],
  },
  quarryLabels: {
    organization: "quarry",
    contacts: ["jake"],
    stage: "negotiation",
    source: "existing",
    services: ["packaging", "identity"],
    value: 16000,
    competitors: 0,
    pitch: -16,
    createdDaysAgo: 40,
    close: 7,
    next: 3,
    history: [
      { daysAgo: 32, stage: "briefing" },
      { daysAgo: 20, stage: "proposal" },
      { daysAgo: 5, stage: "negotiation" },
    ],
  },
  greenmileBrand: {
    organization: "greenmile",
    contacts: ["ben", "alex"],
    stage: "won",
    source: "referral",
    services: ["identity", "social"],
    value: 30000,
    competitors: 2,
    pitch: -40,
    createdDaysAgo: 82,
    close: -20,
    history: [
      { daysAgo: 65, stage: "briefing" },
      { daysAgo: 45, stage: "pitchPreparation" },
      { daysAgo: 35, stage: "proposal" },
    ],
  },
  harlowContent: {
    organization: "harlow",
    contacts: ["rachel"],
    stage: "won",
    source: "event",
    services: ["content", "social"],
    value: 30000,
    competitors: 3,
    pitch: -330,
    createdDaysAgo: 410,
    close: -300,
    history: [
      { daysAgo: 360, stage: "pitchPreparation" },
      { daysAgo: 325, stage: "proposal" },
    ],
  },
  brambleSocial: {
    organization: "bramble",
    contacts: ["nina"],
    stage: "won",
    source: "referral",
    services: ["social"],
    value: 18000,
    createdDaysAgo: 255,
    close: -200,
    history: [{ daysAgo: 230, stage: "proposal" }],
  },
  northshoreExhibition: {
    organization: "northshore",
    contacts: ["claire"],
    stage: "lost",
    source: "invitation",
    services: ["identity", "print"],
    value: 26000,
    competitors: 4,
    pitch: -55,
    createdDaysAgo: 105,
    close: -40,
    lost: "otherAgency",
    history: [
      { daysAgo: 90, stage: "briefing" },
      { daysAgo: 70, stage: "pitchPreparation" },
      { daysAgo: 54, stage: "proposal" },
    ],
  },
  wexfordCatalogue: {
    organization: "wexford",
    contacts: ["paul"],
    stage: "lost",
    source: "existing",
    services: ["print"],
    value: 20000,
    createdDaysAgo: 130,
    close: -90,
    lost: "budget",
    history: [{ daysAgo: 110, stage: "proposal" }],
  },
  harlowAutumn: {
    organization: "harlow",
    contacts: ["rachel", "tom"],
    stage: "won",
    source: "existing",
    services: ["content"],
    value: 26000,
    createdDaysAgo: 150,
    close: -125,
    history: [
      { daysAgo: 140, stage: "briefing" },
      { daysAgo: 132, stage: "proposal" },
    ],
  },

  harlowSummer: {
    organization: "harlow",
    contacts: ["tom"],
    stage: "won",
    source: "existing",
    services: ["content", "social"],
    value: 21000,
    createdDaysAgo: 240,
    close: -225,
    history: [{ daysAgo: 232, stage: "proposal" }],
  },

  quarryTaproom: {
    organization: "quarry",
    contacts: ["jake"],
    stage: "won",
    source: "existing",
    services: ["identity", "print"],
    value: 12000,
    createdDaysAgo: 280,
    close: -250,
    history: [{ daysAgo: 265, stage: "proposal" }],
  },
  quarryWebsite: {
    organization: "quarry",
    contacts: ["jake"],
    stage: "won",
    source: "existing",
    services: ["website"],
    value: 19000,
    createdDaysAgo: 200,
    close: -175,
    history: [
      { daysAgo: 192, stage: "briefing" },
      { daysAgo: 185, stage: "proposal" },
    ],
  },

  brambleMenu: {
    organization: "bramble",
    contacts: ["nina"],
    stage: "won",
    source: "existing",
    services: ["print", "packaging"],
    value: 11500,
    createdDaysAgo: 100,
    close: -72,
    history: [{ daysAgo: 85, stage: "proposal" }],
  },

  greenmileOpening: {
    organization: "greenmile",
    contacts: ["ben", "alex"],
    stage: "won",
    source: "existing",
    services: ["print", "social"],
    value: 12000,
    createdDaysAgo: 70,
    close: -46,
    history: [{ daysAgo: 58, stage: "proposal" }],
  },

  copperleafEvents: {
    organization: "copperleaf",
    contacts: ["michael"],
    stage: "lost",
    source: "event",
    services: ["print"],
    value: 15000,
    createdDaysAgo: 88,
    close: -60,
    lost: "postponed",
    history: [{ daysAgo: 75, stage: "proposal" }],
  },
  meridianCampaign: {
    organization: "meridian",
    contacts: ["laura"],
    stage: "lost",
    source: "inbound",
    services: ["content"],
    value: 18000,
    createdDaysAgo: 70,
    close: -45,
    lost: "budget",
    history: [
      { daysAgo: 58, stage: "briefing" },
      { daysAgo: 52, stage: "proposal" },
    ],
  },
  lumenDeck: {
    organization: "lumen",
    contacts: ["priya"],
    stage: "lost",
    source: "inbound",
    services: ["print"],
    value: 6000,
    createdDaysAgo: 20,
    close: -8,
    lost: "fit",
    history: [{ daysAgo: 14, stage: "proposal" }],
  },
  wexfordShowroom: {
    organization: "wexford",
    contacts: ["paul"],
    stage: "lost",
    source: "existing",
    services: ["print"],
    value: 11000,
    createdDaysAgo: 300,
    close: -260,
    lost: "otherAgency",
    history: [{ daysAgo: 280, stage: "proposal" }],
  },
  harlowWinter: {
    organization: "harlow",
    contacts: ["rachel"],
    stage: "won",
    source: "existing",
    services: ["content"],
    value: 14000,
    createdDaysAgo: 300,
    close: -275,
    history: [{ daysAgo: 285, stage: "proposal" }],
  },
  wexfordLookbook: {
    organization: "wexford",
    contacts: ["paul"],
    stage: "won",
    source: "existing",
    services: ["print"],
    value: 14000,
    createdDaysAgo: 175,
    close: -150,
    history: [{ daysAgo: 160, stage: "proposal" }],
  },
  quarryFestival: {
    organization: "quarry",
    contacts: ["jake"],
    stage: "won",
    source: "existing",
    services: ["print", "social"],
    value: 13000,
    createdDaysAgo: 120,
    close: -100,
    history: [{ daysAgo: 110, stage: "proposal" }],
  },
  brambleCatering: {
    organization: "bramble",
    contacts: ["nina"],
    stage: "won",
    source: "existing",
    services: ["print"],
    value: 9500,
    createdDaysAgo: 30,
    close: -5,
    history: [{ daysAgo: 15, stage: "proposal" }],
  },
};

const RETAINER_FACTS: Record<
  RetainerKey,
  {
    organization: OrganizationKey;
    pitch?: DealKey;
    status: string;
    fee: number;
    start: number;
    review: number;
    createdDaysAgo: number;
    history?: Array<{ daysAgo: number; status: string }>;
  }
> = {
  harlowRetainer: {
    organization: "harlow",
    pitch: "harlowContent",
    status: "active",
    fee: 4500,
    start: -290,
    review: 40,
    createdDaysAgo: 298,
  },
  brambleRetainer: {
    organization: "bramble",
    pitch: "brambleSocial",
    status: "active",
    fee: 1500,
    start: -190,
    review: 25,
    createdDaysAgo: 198,
  },
  greenmileRetainer: {
    organization: "greenmile",
    pitch: "greenmileBrand",
    status: "active",
    fee: 2500,
    start: -10,
    review: 80,
    createdDaysAgo: 19,
  },
  quarryRetainer: {
    organization: "quarry",
    status: "paused",
    fee: 1800,
    start: -480,
    review: 12,
    createdDaysAgo: 500,
    history: [{ daysAgo: 45, status: "active" }],
  },
  wexfordRetainer: {
    organization: "wexford",
    status: "ended",
    fee: 3000,
    start: -650,
    review: -90,
    createdDaysAgo: 660,
    history: [{ daysAgo: 85, status: "active" }],
  },
};

const TASK_FACTS: Record<
  TaskKey,
  {
    status: string;
    priority: string;
    due: number;
    deal?: DealKey;
    organization?: OrganizationKey;
    contact?: ContactKey;
    createdDaysAgo: number;
    done?: number;
  }
> = {
  tidewellDeck: { status: "inProgress", priority: "high", due: 3, deal: "tidewellIdentity", createdDaysAgo: 11 },
  tidewellRehearsal: { status: "open", priority: "high", due: 5, deal: "tidewellIdentity", createdDaysAgo: 4 },
  meridianFollowUp: {
    status: "open",
    priority: "high",
    due: 1,
    deal: "meridianBrand",
    contact: "laura",
    createdDaysAgo: 2,
  },
  copperleafScope: {
    status: "inProgress",
    priority: "high",
    due: 2,
    deal: "copperleafContent",
    contact: "michael",
    createdDaysAgo: 3,
  },
  lumenNotes: { status: "done", priority: "medium", due: -2, deal: "lumenLaunch", createdDaysAgo: 3, done: 2 },
  lumenQuestions: {
    status: "open",
    priority: "medium",
    due: 5,
    deal: "lumenLaunch",
    contact: "priya",
    createdDaysAgo: 2,
  },
  orchardCall: {
    status: "open",
    priority: "medium",
    due: 2,
    deal: "orchardWebsite",
    contact: "samantha",
    createdDaysAgo: 1,
  },
  pinewoodReply: {
    status: "open",
    priority: "low",
    due: -3,
    deal: "pinewoodReport",
    contact: "melissa",
    createdDaysAgo: 5,
  },
  harlowShoot: {
    status: "done",
    priority: "medium",
    due: -6,
    deal: "harlowSpring",
    contact: "tom",
    createdDaysAgo: 15,
    done: 7,
  },
  brambleSamples: { status: "onHold", priority: "low", due: 10, deal: "brambleShop", createdDaysAgo: 5 },
  quarryReview: {
    status: "open",
    priority: "medium",
    due: -4,
    organization: "quarry",
    contact: "jake",
    createdDaysAgo: 6,
  },
  greenmileKickoff: {
    status: "done",
    priority: "high",
    due: -8,
    deal: "greenmileBrand",
    contact: "ben",
    createdDaysAgo: 18,
    done: 8,
  },
  northshoreDebrief: {
    status: "done",
    priority: "low",
    due: -32,
    deal: "northshoreExhibition",
    contact: "claire",
    createdDaysAgo: 39,
    done: 33,
  },
  credentials: { status: "open", priority: "low", due: 14, createdDaysAgo: 7 },
};

const OWNER: Member = "maxBergmann";

function mailbox(name: string): string {
  return name
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z]/g, "");
}

function organizationOf(facts: { organization?: OrganizationKey; deal?: DealKey }): OrganizationKey | undefined {
  return facts.organization ?? (facts.deal ? DEAL_FACTS[facts.deal].organization : undefined);
}

export default defineSolution<Strings>({
  id: "agencies",
  strings: { en, de },
  build: (t) => {
    const office = (index: number) => phoneNumber(t.phones.office, index);
    const open = ["inquiry", "briefing", "pitchPreparation", "proposal", "negotiation"];
    const label = <K extends string>(
      options: Record<K, string>,
      colors: Record<K, "default" | "secondary" | "destructive" | "success" | "warning" | "info">,
    ) => (Object.keys(options) as K[]).map((key) => ({ key, label: options[key], color: colors[key] }));
    const domainOf = (key: OrganizationKey) => t.organizations[key][2];

    const organization: RecordSpec[] = ORGANIZATIONS.map((key) => {
      const facts = ORGANIZATION_FACTS[key];
      const [name, city, domain] = t.organizations[key];
      return {
        key,
        values: {
          name,
          industry: facts.industry,
          relationship: facts.relationship,
          city,
          website: `https://${domain}`,
          employees: facts.employees,
        },
        owner: OWNER,
        channels: { email: `hello@${domain}` },
        createdDaysAgo: facts.createdDaysAgo,
      };
    });
    const contact: RecordSpec[] = CONTACTS.map((key, index) => {
      const facts = CONTACT_FACTS[key];
      const [firstName, lastName, jobTitle] = t.contacts[key];
      return {
        key,
        values: { firstName, lastName, jobTitle, decisionRole: facts.role, phone: office(index) },
        links: { "contact.organizations": facts.organization },
        owner: OWNER,
        channels: { email: `${mailbox(firstName)}.${mailbox(lastName)}@${domainOf(facts.organization)}` },
        ...(facts.avatar ? { avatar: photo(facts.avatar) } : {}),
        createdDaysAgo: facts.createdDaysAgo,
      };
    });
    const deal: RecordSpec[] = DEALS.map((key) => {
      const facts = DEAL_FACTS[key];
      const [name, nextStep] = t.deals[key];
      const closed = facts.stage === "won" || facts.stage === "lost";
      return {
        key,
        values: {
          name,
          stage: facts.stage,
          source: facts.source,
          disciplines: facts.services,
          totalValue: facts.value,
          closeDate: day(facts.close),
          nextStep,
          ...(facts.competitors === undefined ? {} : { competitors: facts.competitors }),
          ...(facts.pitch === undefined ? {} : { pitchDate: day(facts.pitch) }),
          ...(facts.next === undefined ? {} : { nextStepDate: day(facts.next) }),
          ...(facts.lost ? { lostReason: facts.lost } : {}),
        },
        links: { "deal.organizations": facts.organization, "deal.contacts": facts.contacts },
        owner: OWNER,
        createdDaysAgo: facts.createdDaysAgo,
        history: [
          ...(facts.history ?? []).map((change, index, all) => ({
            daysAgo: change.daysAgo,
            previous: { stage: index === 0 ? "inquiry" : all[index - 1].stage },
          })),
          ...(closed
            ? [{ daysAgo: Math.max(0, -facts.close), previous: { stage: facts.history?.at(-1)?.stage ?? "proposal" } }]
            : []),
        ].filter((change, index, all) => index === 0 || change.daysAgo < all[index - 1].daysAgo),
      };
    });
    const retainer: RecordSpec[] = RETAINERS.map((key) => {
      const facts = RETAINER_FACTS[key];
      const [name, scope] = t.retainers[key];
      return {
        key,
        values: {
          name,
          status: facts.status,
          monthlyFee: facts.fee,
          startDate: day(facts.start),
          reviewDate: day(facts.review),
          scope,
        },
        links: {
          "retainer.organization": facts.organization,
          ...(facts.pitch ? { "retainer.pitch": facts.pitch } : {}),
        },
        owner: OWNER,
        createdDaysAgo: facts.createdDaysAgo,
        ...(facts.history
          ? {
              history: facts.history.map((change) => ({
                daysAgo: change.daysAgo,
                previous: { status: change.status },
              })),
            }
          : {}),
      };
    });
    const task: RecordSpec[] = TASKS.map((key) => {
      const facts = TASK_FACTS[key];
      const organizationKey = organizationOf(facts);
      return {
        key,
        values: { name: t.tasks[key], status: facts.status, priority: facts.priority, dueDate: day(facts.due) },
        links: {
          ...(facts.deal ? { "task.deals": facts.deal } : {}),
          ...(organizationKey ? { "task.organizations": organizationKey } : {}),
          ...(facts.contact ? { "task.contacts": facts.contact } : {}),
        },
        owner: OWNER,
        createdDaysAgo: facts.createdDaysAgo,
        ...(facts.done === undefined ? {} : { history: [{ daysAgo: facts.done, previous: { status: "open" } }] }),
      };
    });

    const thread = (key: keyof Strings["threads"], from: readonly string[]) =>
      t.threads[key].messages.map((text, index) => ({ from: from[index], text }));

    return {
      companyName: t.company,
      lists: (["deal", "organization", "contact", "retainer", "task"] as const).map((key) => ({
        key,
        label: t.lists[key][0],
        pluralLabel: t.lists[key][1],
        description: t.lists[key][2],
        icon: { organization: "building", contact: "contact", deal: "handshake", retainer: "repeat", task: "check" }[
          key
        ],
      })),
      fields: [
        {
          key: "organization.industry",
          label: t.fields.industry,
          type: "select",
          options: label(t.options.industry, {
            retail: "info",
            food: "warning",
            health: "success",
            hospitality: "info",
            technology: "secondary",
            finance: "default",
            culture: "secondary",
            education: "success",
            manufacturing: "default",
          }),
        },
        {
          key: "organization.relationship",
          label: t.fields.relationship,
          type: "select",
          options: label(t.options.relationship, { prospect: "info", client: "success", former: "secondary" }),
        },
        { key: "organization.city", label: t.fields.city, type: "text" },
        { key: "organization.website", label: t.fields.website, type: "url" },
        { key: "organization.employees", label: t.fields.employees, type: "number" },
        { key: "contact.jobTitle", label: t.fields.jobTitle, type: "text" },
        { key: "contact.phone", label: t.fields.phone, type: "phone" },
        {
          key: "contact.decisionRole",
          label: t.fields.decisionRole,
          type: "select",
          options: label(t.options.decisionRole, { decisionMaker: "success", influencer: "info", buyer: "warning" }),
        },
        {
          key: "deal.source",
          label: t.fields.source,
          type: "select",
          options: label(t.options.source, {
            referral: "success",
            existing: "secondary",
            inbound: "info",
            invitation: "warning",
            event: "default",
          }),
        },
        {
          key: "deal.disciplines",
          label: t.fields.services,
          type: "multiSelect",
          options: label(t.options.services, {
            strategy: "info",
            identity: "secondary",
            website: "info",
            content: "warning",
            packaging: "default",
            social: "success",
            print: "secondary",
          }),
        },
        { key: "deal.competitors", label: t.fields.competitors, type: "number" },
        { key: "deal.pitchDate", label: t.fields.pitchDate, type: "date" },
        { key: "deal.closeDate", label: t.fields.closeDate, type: "date" },
        { key: "deal.nextStep", label: t.fields.nextStep, type: "text" },
        { key: "deal.nextStepDate", label: t.fields.nextStepDate, type: "date" },
        {
          key: "deal.lostReason",
          label: t.fields.lostReason,
          type: "select",
          options: label(t.options.lostReason, {
            budget: "warning",
            otherAgency: "destructive",
            postponed: "info",
            fit: "secondary",
          }),
        },
        {
          key: "retainer.status",
          label: t.fields.retainerStatus,
          type: "select",
          options: label(t.options.retainerStatus, { active: "success", paused: "warning", ended: "secondary" }),
        },
        { key: "retainer.monthlyFee", label: t.fields.monthlyFee, type: "currency" },
        { key: "retainer.startDate", label: t.fields.startDate, type: "date" },
        { key: "retainer.reviewDate", label: t.fields.reviewDate, type: "date" },
        { key: "retainer.scope", label: t.fields.scope, type: "text" },
        { key: "task.dueDate", label: t.fields.dueDate, type: "date" },
        {
          key: "task.priority",
          label: t.fields.priority,
          type: "select",
          options: label(t.options.priority, { low: "secondary", medium: "info", high: "destructive" }),
        },
      ],
      stages: [
        { key: "inquiry", label: t.stages.inquiry, color: "secondary", probability: 10 },
        { key: "briefing", label: t.stages.briefing, color: "info", probability: 20 },
        { key: "pitchPreparation", label: t.stages.pitchPreparation, color: "info", probability: 35 },
        { key: "proposal", label: t.stages.proposal, color: "warning", probability: 55 },
        { key: "negotiation", label: t.stages.negotiation, color: "warning", probability: 75 },
        { key: "won", label: t.stages.won, color: "success", probability: 100 },
        { key: "lost", label: t.stages.lost, color: "destructive", probability: 0 },
      ],
      relationships: [
        {
          key: "retainer.organization",
          source: "retainer",
          target: "organization",
          sourceCardinality: "one",
          targetCardinality: "many",
        },
        {
          key: "retainer.pitch",
          source: "retainer",
          target: "deal",
          sourceCardinality: "one",
          targetCardinality: "many",
        },
      ],
      records: { organization, contact, deal, retainer, task },
      views: [
        {
          key: "pitchBoard",
          list: "deal",
          name: t.views.pitchBoard,
          mode: "board",
          groupBy: "stage",
          columns: ["totalValue", "deal.organizations", "pitchDate", "nextStepDate"],
          filters: [{ field: "stage", notIn: ["lost"] }],
        },
        {
          key: "nextSteps",
          list: "deal",
          name: t.views.nextSteps,
          mode: "table",
          columns: ["stage", "nextStep", "nextStepDate", "pitchDate", "totalValue", "deal.organizations"],
          filters: [{ field: "stage", in: open }],
          sort: { field: "nextStepDate", direction: "asc" },
        },
        {
          key: "clients",
          list: "organization",
          name: t.views.clients,
          mode: "table",
          columns: ["relationship", "industry", "city", "contact.organizations", "retainer.organization"],
          sort: { field: "relationship", direction: "asc" },
        },
        {
          key: "retainers",
          list: "retainer",
          name: t.views.retainers,
          mode: "table",
          columns: ["status", "monthlyFee", "retainer.organization", "startDate", "reviewDate", "retainer.pitch"],
          sort: { field: "reviewDate", direction: "asc" },
        },
        {
          key: "allContacts",
          list: "contact",
          name: t.views.allContacts,
          mode: "table",
          columns: ["jobTitle", "contact.organizations", "decisionRole", "phone", "capability.identity"],
        },
        {
          key: "dueSoon",
          list: "task",
          name: t.views.dueSoon,
          mode: "table",
          columns: ["dueDate", "status", "priority", "task.deals", "task.organizations"],
          filters: [{ field: "status", notIn: ["done", "archived"] }],
          sort: { field: "dueDate", direction: "asc" },
        },
      ],
      dashboard: {
        widgets: [
          {
            kind: "kpi",
            title: t.widgets.retainerMrr,
            list: "retainer",
            aggregation: "sum",
            field: "monthlyFee",
            filters: [{ field: "status", in: ["active"] }],
          },
          {
            kind: "kpi",
            title: t.widgets.openPitches,
            list: "deal",
            aggregation: "sum",
            field: "totalValue",
            filters: [{ field: "stage", in: open }],
          },
          {
            kind: "kpi",
            title: t.widgets.won,
            list: "deal",
            aggregation: "sum",
            field: "totalValue",
            filters: [
              { field: "stage", in: ["won"] },
              { field: "closeDate", withinDays: 365 },
            ],
          },
          {
            kind: "kpi",
            title: t.widgets.overdueTasks,
            list: "task",
            aggregation: "count",
            filters: [
              { field: "status", notIn: ["done", "archived"] },
              { field: "dueDate", olderThanDays: 1 },
            ],
          },
          {
            kind: "chart",
            title: t.widgets.byStage,
            display: DisplayType.verticalBarChart,
            list: "deal",
            aggregation: "sum",
            field: "totalValue",
            groupBy: { field: "stage" },
            filters: [{ field: "stage", in: open }],
          },
          {
            kind: "chart",
            title: t.widgets.lostByReason,
            display: DisplayType.doughnutChart,
            list: "deal",
            aggregation: "count",
            groupBy: { field: "lostReason" },
            filters: [
              { field: "stage", in: ["lost"] },
              { field: "closeDate", withinDays: 365 },
            ],
          },
          {
            kind: "chart",
            title: t.widgets.byDiscipline,
            display: DisplayType.horizontalBarChartWithLabels,
            list: "deal",
            aggregation: "count",
            groupBy: { field: "disciplines" },
            filters: [{ field: "stage", in: open }],
          },
          {
            kind: "chart",
            title: t.widgets.wonByMonth,
            display: DisplayType.areaChart,
            list: "deal",
            aggregation: "sum",
            field: "totalValue",
            groupBy: { month: "closeDate" },
            filters: [
              { field: "stage", in: ["won"] },
              { field: "closeDate", withinDays: 365 },
            ],
          },
          {
            kind: "chart",
            title: t.widgets.topClients,
            display: DisplayType.rankedTable,
            list: "deal",
            aggregation: "sum",
            field: "totalValue",
            groupBy: { relation: "deal.organizations" },
            filters: [
              { field: "stage", in: ["won"] },
              { field: "closeDate", withinDays: 365 },
            ],
          },
        ],
      },
      wiki: [
        { key: "guide", kind: "guide", title: t.wiki.guide.title, markdown: t.wiki.guide.markdown },
        { key: "process", kind: "knowledge", title: t.wiki.process.title, markdown: t.wiki.process.markdown },
        {
          key: "afterPitch",
          kind: "procedure",
          title: t.wiki.afterPitch.title,
          whenToUse: t.wiki.afterPitch.whenToUse,
          markdown: t.wiki.afterPitch.markdown,
        },
      ],
      messaging: {
        accounts: ["google"],
        selfTitle: t.selfTitle,
        website: t.website,
        threads: [
          {
            account: "google",
            with: ["diane"],
            subject: t.threads.tidewellBrief.subject,
            state: "unread",
            latestMinutesAgo: 40,
            messages: thread("tidewellBrief", ["diane", "self", "diane"]),
            links: ["deal:tidewellIdentity", "organization:tidewell"],
          },
          {
            account: "google",
            with: ["laura"],
            subject: t.threads.meridianProposal.subject,
            state: "unread",
            latestMinutesAgo: 3 * 60,
            messages: thread("meridianProposal", ["self", "laura"]),
            links: ["deal:meridianBrand"],
          },
          {
            account: "google",
            with: ["michael", "erin"],
            name: t.threads.copperleafTerms.name,
            subject: t.threads.copperleafTerms.subject,
            state: "open",
            latestMinutesAgo: 26 * 60,
            messages: thread("copperleafTerms", ["michael", "self", "michael"]),
            links: ["deal:copperleafContent", "organization:copperleaf"],
          },
          {
            account: "google",
            with: ["rachel", "tom"],
            name: t.threads.harlowFollowUp.subject,
            subject: t.threads.harlowFollowUp.subject,
            state: "open",
            latestMinutesAgo: 20,
            messages: [
              ...thread("harlowFollowUp", ["self", "rachel", "self"]).slice(0, 2),
              { from: "self", text: t.threads.harlowFollowUp.messages[2], draft: true },
            ],
            links: ["deal:harlowSpring", "organization:harlow"],
          },
          {
            account: "google",
            with: ["samantha"],
            subject: t.threads.orchardInquiry.subject,
            state: "open",
            latestMinutesAgo: 22 * 60,
            messages: thread("orchardInquiry", ["samantha", "self"]),
          },
          {
            account: "google",
            with: ["ben"],
            subject: t.threads.greenmileKickoff.subject,
            state: "open",
            latestMinutesAgo: 7 * 24 * 60,
            messages: thread("greenmileKickoff", ["ben", "self"]),
            links: ["organization:greenmile"],
          },
        ],
        calendar: {
          name: t.calendar.name,
          events: [
            {
              title: t.calendar.events[0],
              with: ["diane", "kevin"],
              startsMinutesAgo: -6 * 24 * 60,
              durationMinutes: 60,
            },
            { title: t.calendar.events[1], with: ["laura"], startsMinutesAgo: -24 * 60, durationMinutes: 30 },
          ],
        },
      },
    };
  },
});
