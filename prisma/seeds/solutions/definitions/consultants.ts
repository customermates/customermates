import { ChartColor, DisplayType } from "@/features/widget/widget-display.schema";

import { day, defineSolution, photo, type FieldInput, type RecordSpec, phoneNumber } from "../define-solution";

/**
 * Consultants: an independent, relationship-led consulting practice that advises mid-sized B2B companies on strategy
 * and operations. Engagement opportunities move from introduction through discovery and scoping to a proposal and a
 * decision; the proposal itself is written outside the CRM, the stage only records where things stand. The story
 * follows one engagement (Fairhaven / Falkenried) from the first introduction to the recorded decision, and Max drafts a
 * personal follow-up to the client. Contacts carry a relationship strength and the date of the last meeting; next steps
 * and task due dates are ordinary fields, and a conversation belongs to an opportunity only when someone links it.
 */

const ORGANIZATIONS = [
  "fairhaven",
  "northwold",
  "brightwater",
  "calder",
  "ellison",
  "greyfriars",
  "kestrel",
  "marlow",
  "oakham",
  "riverton",
  "stanmore",
  "wexford",
] as const;
type OrganizationKey = (typeof ORGANIZATIONS)[number];
const CONTACTS = [
  "helen",
  "martin",
  "rachel",
  "tom",
  "claire",
  "sarah",
  "adam",
  "george",
  "alan",
  "nina",
  "paul",
  "laura",
  "simon",
  "diane",
  "ian",
  "emily",
  "richard",
  "kevin",
] as const;
type ContactKey = (typeof CONTACTS)[number];
const DEALS = [
  "fairhavenReview",
  "northwoldReview",
  "brightwaterScaling",
  "brightwaterInterim",
  "ellisonPricing",
  "greyfriarsSuccession",
  "kestrelSales",
  "marlowIntegration",
  "rivertonExport",
  "oakhamStrategy",
  "calderReview",
  "wexfordPlant",
  "kestrelWorkshop",
] as const;
type DealKey = (typeof DEALS)[number];
const SERVICES = [
  "discoverySprint",
  "operatingModelReview",
  "pricingReview",
  "workshopDay",
  "offsiteFacilitation",
  "interimDay",
] as const;
type ServiceKey = (typeof SERVICES)[number];
const TASKS = [
  "briefHelen",
  "kickoffAgenda",
  "callTom",
  "brightwaterScope",
  "interimAvailability",
  "ellisonQuestions",
  "thankRichard",
  "kestrelWalkthrough",
  "briefDiane",
  "rivertonNotes",
  "lunchGeorge",
  "oakhamCheckIn",
] as const;
type TaskKey = (typeof TASKS)[number];
type StoryStage = "introduction" | "discovery" | "scoping" | "proposal" | "decision";

const en = {
  company: "Ashcombe Advisory",
  website: "https://ashcombe-advisory.example",
  phones: { mobile: { templates: ["+44 20 7946 0###"], start: 300 } },
  selfTitle: "Principal consultant",
  lists: {
    organization: ["Client organization", "Client organizations", "Companies we advise, talk to or work alongside."],
    contact: ["Contact", "Contacts", "The people behind every engagement and introduction."],
    deal: [
      "Engagement opportunity",
      "Engagement opportunities",
      "Possible engagements, from the first introduction to the decision.",
    ],
    service: ["Service", "Services", "Fixed-fee packages, workshop days and interim days."],
    task: ["Task", "Tasks", "Things we promised, with a due date."],
  },
  fields: {
    industry: "Industry",
    relationship: "Relationship",
    city: "City",
    website: "Website",
    employees: "Employees",
    jobTitle: "Job title",
    phone: "Phone",
    strength: "Relationship strength",
    lastMeeting: "Last meeting",
    referralSource: "Referral source",
    decisionDate: "Decision date",
    nextStep: "Next step",
    nextStepDate: "Next step date",
    lostReason: "Lost reason",
    dueDate: "Due date",
    priority: "Priority",
  },
  options: {
    industry: {
      manufacturing: "Manufacturing",
      logistics: "Logistics",
      software: "Software",
      packaging: "Packaging",
      engineering: "Engineering",
      wholesale: "Wholesale",
      medtech: "Medical technology",
      facility: "Facility services",
      food: "Food ingredients",
      legal: "Legal",
      chemicals: "Chemicals",
    },
    relationship: { prospect: "Prospect", client: "Client", former: "Former client", partner: "Referral partner" },
    strength: { strong: "Strong", warm: "Warm", early: "New" },
    referralSource: {
      clientReferral: "Client referral",
      peerReferral: "Peer or partner referral",
      event: "Talk or roundtable",
      content: "Article or LinkedIn post",
      existingClient: "Existing client",
    },
    lostReason: {
      timing: "Timing",
      budget: "Budget",
      inHouse: "Handled in-house",
      otherAdvisor: "Chose another advisor",
    },
    priority: { low: "Low", medium: "Medium", high: "High" },
  },
  stages: {
    introduction: "Introduction",
    discovery: "Discovery",
    scoping: "Scoping",
    proposal: "Proposal sent",
    decision: "Decision",
    won: "Won",
    lost: "Lost",
  },
  organizations: {
    fairhaven: ["Fairhaven Components", "Sheffield", "fairhaven-components.example"],
    northwold: ["Northwold Logistics", "Leeds", "northwold-logistics.example"],
    brightwater: ["Brightwater Software", "Manchester", "brightwater-software.example"],
    calder: ["Calder Packaging", "Bradford", "calder-packaging.example"],
    ellison: ["Ellison Fluid Systems", "Nottingham", "ellison-fluid.example"],
    greyfriars: ["Greyfriars Wholesale", "Birmingham", "greyfriars-wholesale.example"],
    kestrel: ["Kestrel Medical Supplies", "Bristol", "kestrel-medical.example"],
    marlow: ["Marlow Facility Services", "Leicester", "marlow-facility.example"],
    oakham: ["Oakham Precision", "Derby", "oakham-precision.example"],
    riverton: ["Riverton Food Ingredients", "York", "riverton-ingredients.example"],
    stanmore: ["Hale & Stanmore Solicitors", "Manchester", "hale-stanmore.example"],
    wexford: ["Wexford Industrial Coatings", "Huddersfield", "wexford-coatings.example"],
  } satisfies Record<OrganizationKey, readonly [string, string, string]>,
  contacts: {
    helen: ["Helen", "Ashworth", "Chief executive"],
    martin: ["Martin", "Pryce", "Operations director"],
    rachel: ["Rachel", "Dunn", "Finance director"],
    tom: ["Tom", "Whitaker", "Managing director"],
    claire: ["Claire", "Hollis", "Head of transformation"],
    sarah: ["Sarah", "Kemp", "Chief operating officer"],
    adam: ["Adam", "Lowe", "Chief financial officer"],
    george: ["George", "Barlow", "Chair of the advisory board"],
    alan: ["Alan", "Fenwick", "Managing director"],
    nina: ["Nina", "Patel", "Head of supply chain"],
    paul: ["Paul", "Gregson", "Owner and managing director"],
    laura: ["Laura", "Bennett", "Managing director"],
    simon: ["Simon", "Hart", "Head of sales"],
    diane: ["Diane", "Marsh", "Chief executive"],
    ian: ["Ian", "Pollard", "Managing director"],
    emily: ["Emily", "Rowe", "Commercial director"],
    richard: ["Richard", "Hale", "Partner"],
    kevin: ["Kevin", "Walsh", "Managing director"],
  } satisfies Record<ContactKey, readonly [string, string, string]>,
  services: {
    discoverySprint: "Discovery sprint (fixed fee, three weeks)",
    operatingModelReview: "Operating model review (fixed fee)",
    pricingReview: "Pricing and margin review (fixed fee)",
    workshopDay: "Workshop day with preparation",
    offsiteFacilitation: "Leadership offsite, two days (fixed fee)",
    interimDay: "Interim management day",
  } satisfies Record<ServiceKey, string>,
  deals: {
    fairhavenReview: ["Fairhaven Components – operating model review", "Kick-off workshop with the leadership team"],
    northwoldReview: ["Northwold Logistics – depot network review", "Answer Tom's two questions on the proposal"],
    brightwaterScaling: ["Brightwater Software – scaling customer operations", "Send Sarah two scope options"],
    brightwaterInterim: ["Brightwater Software – interim head of operations", "Sarah confirms the start date"],
    ellisonPricing: ["Ellison Fluid Systems – pricing and margin review", "Discovery call with Alan and Nina"],
    greyfriarsSuccession: ["Greyfriars Wholesale – leadership offsite on succession", "First call with Paul"],
    kestrelSales: ["Kestrel Medical – sales organisation review", "Walk Laura and Simon through the proposal"],
    marlowIntegration: ["Marlow Facility Services – integration support after the merger", "First meeting with Diane"],
    rivertonExport: ["Riverton Food Ingredients – export market assessment", "Share the discovery summary with Emily"],
    oakhamStrategy: ["Oakham Precision – strategy day with the owners", "Check in again in spring"],
    calderReview: ["Calder Packaging – operating model review", "Engagement completed"],
    wexfordPlant: ["Wexford Coatings – plant operations review", "Closed"],
    kestrelWorkshop: ["Kestrel Medical – annual strategy workshop", "Workshop delivered"],
  } satisfies Record<DealKey, readonly [string, string]>,
  story: {
    introduction: "Discovery conversation with Helen and Martin",
    discovery: "Agree the scope and the people to interview",
    scoping: "Send the proposal with two scope options",
    proposal: "Hear back after the leadership meeting",
    decision: "Helen records the decision with us",
  } satisfies Record<StoryStage, string>,
  fairhavenNotes: [
    "Introduced by Richard Hale, who has advised Helen for years.",
    "Discovery: margins are under pressure because each plant plans on its own; Martin wants one planning rhythm across the three plants.",
    "Scoping: five interviews, one site visit per plant, two workshop days with the leadership team.",
    "Decision: option B (review plus two workshop days), confirmed by Helen in writing.",
  ],
  tasks: {
    briefHelen: "Prepare a relationship brief for the kick-off with Helen",
    kickoffAgenda: "Send Martin the kick-off agenda and two dates",
    callTom: "Call Tom about his questions on the proposal",
    brightwaterScope: "Write two scope options for Brightwater",
    interimAvailability: "Confirm interim days for January with Sarah",
    ellisonQuestions: "Prepare discovery questions for Alan and Nina",
    thankRichard: "Thank Richard for the introduction to Greyfriars",
    kestrelWalkthrough: "Walk Laura through the split workshop days",
    briefDiane: "Prepare a relationship brief for the first meeting with Diane",
    rivertonNotes: "Write up the Riverton discovery call",
    lunchGeorge: "Suggest two lunch dates to George",
    oakhamCheckIn: "Check in with Ian about the strategy day",
  } satisfies Record<TaskKey, string>,
  views: {
    pipeline: "Engagement pipeline",
    nextSteps: "Next steps",
    organizations: "Client organizations",
    relationships: "Relationships by last meeting",
    openTasks: "Open tasks",
    services: "Services and fees",
  },
  widgets: {
    openValue: "Open opportunities",
    weighted: "Weighted value",
    won: "Won value",
    openTasks: "Open tasks",
    byStage: "Open opportunities by stage",
    bySource: "Opportunities by referral source",
    wonByMonth: "Won value by month",
    byStrength: "Contacts by relationship strength",
    activity: "Recent activity",
  },
  wiki: {
    guide: {
      title: "Operating Guide",
      markdown: [
        "Ashcombe Advisory is an independent practice that advises mid-sized B2B companies on strategy and operations. Most work comes from relationships: clients, former colleagues and partners who introduce us. This workspace is demo data; every company and person in it is fictional.",
        "",
        "## How we use the CRM",
        "- **Client organizations** are the companies we advise or talk to, plus the partners who refer us. **Contacts** are the people there, with a relationship strength and the date of the last meeting.",
        "- **Engagement opportunities** move from Introduction through Discovery, Scoping, Proposal sent and Decision to Won or Lost. The proposal itself is written outside the CRM; the stage only records that it was sent and what was decided.",
        "- **Services** are our fixed-fee packages, workshop days and interim days. The value of an opportunity comes from the services added to it.",
        "- **Tasks** are things we promised, with a due date. Tasks, next steps and next step dates are ordinary fields: nobody is reminded automatically, so look at the Next steps and Open tasks views every morning.",
        "- A conversation from the inbox belongs to an engagement opportunity or client organization only when someone links it there.",
        "",
        "## Working rules",
        "- Every open opportunity has a next step and a next step date.",
        "- After every meeting, update the contact's last meeting date and relationship strength.",
        "- Record a decision on the opportunity as soon as the client tells us, with the lost reason when we did not get it.",
        "- Fees come from the Services list. Billing and project work stay in their own tools.",
      ],
    },
    process: {
      title: "How engagements move",
      markdown: [
        "Every engagement opportunity moves through the same stages. The stage records where the conversation stands, not a document.",
        "",
        "## Stages",
        "1. **Introduction:** someone introduced us or the client got in touch. Add the organization, the person and who referred them.",
        "2. **Discovery:** first conversation done. Write down the problem in the client's words and who else is involved.",
        "3. **Scoping:** we agree what the engagement covers, who we interview and which services fit.",
        "4. **Proposal sent:** the proposal went out by email; services are on the opportunity.",
        "5. **Decision:** the client is deciding. Keep the next step on the date they gave us.",
        "6. **Won or Lost:** record the decision manually and, when lost, the reason. Thank the person who referred us either way.",
      ],
    },
    brief: {
      title: "Prepare a relationship brief",
      whenToUse: "When a meeting with a client, prospect or referral partner is coming up.",
      markdown: [
        "A relationship brief takes ten minutes and makes sure we walk into every meeting knowing the person, not just the opportunity.",
        "",
        "## Steps",
        "1. Open the contact and check the relationship strength, the last meeting and who introduced us.",
        "2. Open the organization and its engagement opportunities: stage, next step and earlier work together.",
        "3. Read the conversations linked to the opportunity and the organization. Conversations nobody linked do not show up there, so check the inbox for the person's name as well.",
        "4. Write five lines into the notes of the opportunity: what they care about, what changed since we last spoke, what we promised, one personal detail worth remembering, and the question we want answered.",
        "5. After the meeting, update the last meeting date, the relationship strength, the next step and its date, and add a task for every promise.",
      ],
    },
  },
  threads: {
    fairhavenDecision: {
      subject: "Proposal: operating model review",
      messages: [
        "Dear Helen,\n\nThank you for the open conversation last week. As agreed, the proposal has two scope options: option A covers the operations review on its own, option B adds two workshop days with your leadership team.\n\nI am happy to walk Martin and Rachel through it before your leadership meeting.\n\nBest regards,\nMax",
        "Dear Max,\n\nWe discussed the proposal in Monday's leadership meeting and decided to go ahead with option B. Martin will coordinate the kick-off dates with you.\n\nThank you for taking the time to understand how we really work before writing anything down.\n\nBest,\nHelen",
        "Dear Helen,\n\nThank you for your decision and for the trust behind it. It was a pleasure getting to know your team during the interviews, and I am looking forward to working with all of you.\n\nI will send Martin two dates for the kick-off workshop this week. And good luck to your son in the regional final on Saturday!\n\nWarm regards,\nMax",
      ],
    },
    fairhavenInterviews: {
      subject: "Interviews for the discovery phase",
      messages: [
        "Hi Max,\n\nHere is the list for the interviews: the three plant managers, our head of purchasing and the customer service lead. Rachel can join for the cost questions.\n\nWould 45 minutes each work?\n\nMartin",
        "Hi Martin,\n\n45 minutes is perfect. I will contact everyone directly and share a one-page summary with you and Helen afterwards.\n\nBest,\nMax",
        "Great, thanks. The plant managers prefer early mornings.",
      ],
    },
    richardIntro: {
      messages: [
        "Max, I had lunch with Paul Gregson from Greyfriars Wholesale yesterday. He is thinking about handing the business to the next generation and asked whether I knew someone who listens before advising. May I introduce you?",
        "Thank you, Richard, that means a lot. Yes, please. I will call him this week.",
        "Done, you both have my email. Coffee soon?",
      ],
    },
    ellisonArticle: {
      messages: [
        "Hello Max, I read your article on pricing in engineering firms. Our margins have dropped for two years although volumes are up. Would you have time for a conversation?",
        "Hello Alan, thank you for reaching out. That pattern is common, and it is usually solvable. How about a call on Thursday at 10?",
        "Thursday works. I will bring Nina, our head of supply chain.",
      ],
    },
    kestrelQuestion: {
      subject: "Question on the sales review proposal",
      messages: [
        "Hi Max,\n\nThank you for the proposal. Simon asked whether we could split the two workshop days: one with the sales leads in March, one with the whole team in April. Would that change anything?\n\nBest,\nLaura",
        "Hi Laura,\n\nThat works well and does not change the fee. Splitting the days gives the team time to try things in between. Shall we go through it on a short call tomorrow?\n\nBest,\nMax",
        "Yes, tomorrow at 4 works.",
      ],
    },
    northwoldQuestions: {
      subject: "Depot network review – proposal",
      messages: [
        "Dear Tom,\n\nAs promised, here is the proposal for the depot network review: a three-week discovery sprint followed by three workshop days with your depot managers.\n\nI am happy to discuss any part of it.\n\nBest regards,\nMax",
        "Hi Max,\n\nThanks for the proposal. Two questions before we decide: could the depot visits happen in the first two weeks, and would Claire be part of the workshops?\n\nRegards,\nTom",
      ],
    },
    georgeCatchUp: {
      messages: [
        "George, congratulations on chairing the advisory board. Well deserved!",
        "Thank you, Max! It has been a while. Lunch next month? I would like to hear what you are working on.",
        "Gladly. I will suggest two dates by email.",
      ],
    },
  },
  calendar: {
    name: "Client meetings",
    events: [
      "Kick-off workshop at Fairhaven Components",
      "Discovery call with Ellison Fluid Systems",
      "Proposal call with Kestrel Medical",
    ],
  },
};

type Strings = typeof en;

const de: Strings = {
  company: "Kronfeld Beratung",
  website: "https://kronfeld-beratung.example",
  phones: { mobile: { templates: ["+49 30 23125 ###"], start: 300 } },
  selfTitle: "Inhaber und Berater",
  lists: {
    organization: [
      "Kundenorganisation",
      "Kundenorganisationen",
      "Unternehmen, die wir beraten, ansprechen oder mit denen wir zusammenarbeiten.",
    ],
    contact: ["Kontakt", "Kontakte", "Die Menschen hinter jedem Mandat und jeder Empfehlung."],
    deal: ["Mandatsanfrage", "Mandatsanfragen", "Mögliche Mandate, vom ersten Kennenlernen bis zur Entscheidung."],
    service: ["Leistung", "Leistungen", "Festpreispakete, Workshoptage und Interimstage."],
    task: ["Aufgabe", "Aufgaben", "Was wir zugesagt haben, mit Fälligkeitsdatum."],
  },
  fields: {
    industry: "Branche",
    relationship: "Beziehung",
    city: "Ort",
    website: "Website",
    employees: "Mitarbeitende",
    jobTitle: "Position",
    phone: "Telefon",
    strength: "Beziehungsstärke",
    lastMeeting: "Letztes Treffen",
    referralSource: "Empfehlungsquelle",
    decisionDate: "Entscheidungsdatum",
    nextStep: "Nächster Schritt",
    nextStepDate: "Datum nächster Schritt",
    lostReason: "Absagegrund",
    dueDate: "Fällig am",
    priority: "Priorität",
  },
  options: {
    industry: {
      manufacturing: "Industrie",
      logistics: "Logistik",
      software: "Software",
      packaging: "Verpackung",
      engineering: "Maschinen- und Anlagenbau",
      wholesale: "Großhandel",
      medtech: "Medizintechnik",
      facility: "Gebäudedienste",
      food: "Lebensmittelzutaten",
      legal: "Recht",
      chemicals: "Chemie",
    },
    relationship: {
      prospect: "Interessent",
      client: "Kunde",
      former: "Ehemaliger Kunde",
      partner: "Empfehlungspartner",
    },
    strength: { strong: "Eng", warm: "Gut", early: "Neu" },
    referralSource: {
      clientReferral: "Kundenempfehlung",
      peerReferral: "Empfehlung aus dem Netzwerk",
      event: "Vortrag oder Gesprächsrunde",
      content: "Fachartikel oder LinkedIn-Beitrag",
      existingClient: "Bestandskunde",
    },
    lostReason: {
      timing: "Zeitpunkt",
      budget: "Budget",
      inHouse: "Intern gelöst",
      otherAdvisor: "Andere Beratung beauftragt",
    },
    priority: { low: "Niedrig", medium: "Mittel", high: "Hoch" },
  },
  stages: {
    introduction: "Kennenlernen",
    discovery: "Bedarfsklärung",
    scoping: "Auftragsklärung",
    proposal: "Angebot gesendet",
    decision: "Entscheidung",
    won: "Gewonnen",
    lost: "Verloren",
  },
  organizations: {
    fairhaven: ["Falkenried Komponenten GmbH", "Reutlingen", "falkenried-komponenten.example"],
    northwold: ["Nordwald Logistik GmbH", "Heilbronn", "nordwald-logistik.example"],
    brightwater: ["Klarwasser Software AG", "Karlsruhe", "klarwasser-software.example"],
    calder: ["Kalder Verpackungen GmbH", "Pforzheim", "kalder-verpackungen.example"],
    ellison: ["Ellwanger Fluidtechnik GmbH", "Esslingen", "ellwanger-fluidtechnik.example"],
    greyfriars: ["Grauhof Großhandel GmbH", "Ulm", "grauhof-grosshandel.example"],
    kestrel: ["Sperber Medizintechnik GmbH", "Tübingen", "sperber-medizintechnik.example"],
    marlow: ["Marbach Gebäudeservice GmbH", "Ludwigsburg", "marbach-gebaeudeservice.example"],
    oakham: ["Achtal Präzision GmbH", "Aalen", "achtal-praezision.example"],
    riverton: ["Uferhof Lebensmittelzutaten GmbH", "Schwäbisch Hall", "uferhof-zutaten.example"],
    stanmore: ["Haller & Stein Rechtsanwälte", "Stuttgart", "haller-stein.example"],
    wexford: ["Weißach Industrielacke GmbH", "Göppingen", "weissach-lacke.example"],
  },
  contacts: {
    helen: ["Heike", "Albrecht", "Geschäftsführerin"],
    martin: ["Markus", "Pfeiffer", "Leiter Operations"],
    rachel: ["Ruth", "Decker", "Kaufmännische Leiterin"],
    tom: ["Thomas", "Wendt", "Geschäftsführer"],
    claire: ["Claudia", "Hensel", "Leiterin Transformation"],
    sarah: ["Sabine", "Kern", "Vorständin Betrieb"],
    adam: ["Achim", "Lorenz", "Finanzvorstand"],
    george: ["Georg", "Brenner", "Beiratsvorsitzender"],
    alan: ["Andreas", "Fenske", "Geschäftsführer"],
    nina: ["Nina", "Engel", "Leiterin Supply Chain"],
    paul: ["Peter", "Grauhof", "Geschäftsführender Gesellschafter"],
    laura: ["Lena", "Brandl", "Geschäftsführerin"],
    simon: ["Stefan", "Hartl", "Vertriebsleiter"],
    diane: ["Doris", "Merkle", "Geschäftsführerin"],
    ian: ["Ingo", "Pohl", "Geschäftsführer"],
    emily: ["Eva", "Rößler", "Leiterin Vertrieb"],
    richard: ["Richard", "Haller", "Partner"],
    kevin: ["Klaus", "Wieland", "Geschäftsführer"],
  },
  services: {
    discoverySprint: "Analysesprint (Festpreis, drei Wochen)",
    operatingModelReview: "Überprüfung des Betriebsmodells (Festpreis)",
    pricingReview: "Preis- und Margenanalyse (Festpreis)",
    workshopDay: "Workshoptag inklusive Vorbereitung",
    offsiteFacilitation: "Klausur der Geschäftsleitung, zwei Tage (Festpreis)",
    interimDay: "Interim-Management-Tag",
  },
  deals: {
    fairhavenReview: [
      "Falkenried Komponenten – Überprüfung des Betriebsmodells",
      "Auftaktworkshop mit der Geschäftsleitung",
    ],
    northwoldReview: [
      "Nordwald Logistik – Analyse des Standortnetzes",
      "Die zwei Fragen von Herrn Wendt zum Angebot beantworten",
    ],
    brightwaterScaling: [
      "Klarwasser Software – Kundenbetrieb skalieren",
      "Frau Kern zwei Varianten für den Umfang schicken",
    ],
    brightwaterInterim: ["Klarwasser Software – Interimsleitung Betrieb", "Frau Kern bestätigt den Starttermin"],
    ellisonPricing: [
      "Ellwanger Fluidtechnik – Preis- und Margenanalyse",
      "Erstgespräch mit Herrn Fenske und Frau Engel",
    ],
    greyfriarsSuccession: ["Grauhof Großhandel – Klausur zur Nachfolge", "Erstes Telefonat mit Herrn Grauhof"],
    kestrelSales: [
      "Sperber Medizintechnik – Analyse der Vertriebsorganisation",
      "Angebot mit Frau Brandl und Herrn Hartl durchgehen",
    ],
    marlowIntegration: [
      "Marbach Gebäudeservice – Begleitung der Integration nach der Fusion",
      "Erstes Treffen mit Frau Merkle",
    ],
    rivertonExport: [
      "Uferhof Lebensmittelzutaten – Bewertung neuer Exportmärkte",
      "Zusammenfassung der Bedarfsklärung an Frau Rößler schicken",
    ],
    oakhamStrategy: ["Achtal Präzision – Strategietag mit den Gesellschaftern", "Im Frühjahr erneut nachfragen"],
    calderReview: ["Kalder Verpackungen – Überprüfung des Betriebsmodells", "Mandat abgeschlossen"],
    wexfordPlant: ["Weißach Industrielacke – Analyse der Werksabläufe", "Abgeschlossen"],
    kestrelWorkshop: ["Sperber Medizintechnik – jährlicher Strategieworkshop", "Workshop durchgeführt"],
  },
  story: {
    introduction: "Erstgespräch mit Frau Albrecht und Herrn Pfeiffer",
    discovery: "Umfang und Interviewpartner abstimmen",
    scoping: "Angebot mit zwei Varianten schicken",
    proposal: "Rückmeldung nach der Sitzung der Geschäftsleitung abwarten",
    decision: "Frau Albrecht teilt uns die Entscheidung mit",
  },
  fairhavenNotes: [
    "Empfohlen von Richard Haller, der Frau Albrecht seit Jahren berät.",
    "Bedarfsklärung: Die Margen stehen unter Druck, weil jedes Werk für sich plant; Herr Pfeiffer möchte einen gemeinsamen Planungsrhythmus für alle drei Werke.",
    "Auftragsklärung: fünf Interviews, ein Besuch pro Werk, zwei Workshoptage mit der Geschäftsleitung.",
    "Entscheidung: Variante B (Überprüfung plus zwei Workshoptage), von Frau Albrecht schriftlich bestätigt.",
  ],
  tasks: {
    briefHelen: "Beziehungsbriefing für den Auftakt mit Frau Albrecht vorbereiten",
    kickoffAgenda: "Herrn Pfeiffer Agenda und zwei Termine für den Auftakt schicken",
    callTom: "Herrn Wendt wegen seiner Fragen zum Angebot anrufen",
    brightwaterScope: "Zwei Varianten für den Umfang bei Klarwasser ausarbeiten",
    interimAvailability: "Interimstage im Januar mit Frau Kern abstimmen",
    ellisonQuestions: "Fragen für das Erstgespräch mit Ellwanger vorbereiten",
    thankRichard: "Richard für die Empfehlung an Grauhof danken",
    kestrelWalkthrough: "Mit Frau Brandl die geteilten Workshoptage durchgehen",
    briefDiane: "Beziehungsbriefing für das erste Treffen mit Frau Merkle vorbereiten",
    rivertonNotes: "Gespräch zur Bedarfsklärung mit Uferhof zusammenfassen",
    lunchGeorge: "Georg zwei Termine für ein Mittagessen vorschlagen",
    oakhamCheckIn: "Bei Herrn Pohl wegen des Strategietags nachfragen",
  },
  views: {
    pipeline: "Mandatspipeline",
    nextSteps: "Nächste Schritte",
    organizations: "Kundenorganisationen",
    relationships: "Beziehungen nach letztem Treffen",
    openTasks: "Offene Aufgaben",
    services: "Leistungen und Honorare",
  },
  widgets: {
    openValue: "Offene Mandatsanfragen",
    weighted: "Gewichteter Wert",
    won: "Gewonnener Wert",
    openTasks: "Offene Aufgaben",
    byStage: "Offene Anfragen nach Phase",
    bySource: "Anfragen nach Empfehlungsquelle",
    wonByMonth: "Gewonnener Wert pro Monat",
    byStrength: "Kontakte nach Beziehungsstärke",
    activity: "Letzte Aktivitäten",
  },
  wiki: {
    guide: {
      title: "Leitfaden",
      markdown: [
        "Kronfeld Beratung ist eine unabhängige Beratung für mittelständische B2B-Unternehmen mit Schwerpunkt Strategie und Organisation. Die meisten Mandate entstehen aus Beziehungen: Kunden, frühere Kollegen und Partner, die uns weiterempfehlen. Dieser Arbeitsbereich enthält Demodaten; alle Firmen und Personen sind erfunden.",
        "",
        "## So nutzen wir das CRM",
        "- **Kundenorganisationen** sind die Unternehmen, die wir beraten oder ansprechen, dazu die Partner, die uns empfehlen. **Kontakte** sind die Menschen dort, mit Beziehungsstärke und Datum des letzten Treffens.",
        "- **Mandatsanfragen** durchlaufen Kennenlernen, Bedarfsklärung, Auftragsklärung, Angebot gesendet und Entscheidung bis Gewonnen oder Verloren. Das Angebot selbst entsteht außerhalb des CRM; die Phase hält nur fest, dass es verschickt wurde und wie entschieden wurde.",
        "- **Leistungen** sind unsere Festpreispakete, Workshoptage und Interimstage. Der Wert einer Mandatsanfrage ergibt sich aus den Leistungen, die ihr zugeordnet sind.",
        "- **Aufgaben** sind Zusagen mit Fälligkeitsdatum. Aufgaben, nächste Schritte und deren Datum sind normale Felder: Niemand wird automatisch erinnert, deshalb jeden Morgen die Ansichten „Nächste Schritte“ und „Offene Aufgaben“ prüfen.",
        "- Ein Gespräch aus dem Posteingang gehört nur dann zu einer Mandatsanfrage oder Kundenorganisation, wenn jemand es dort verknüpft.",
        "",
        "## Arbeitsregeln",
        "- Jede offene Mandatsanfrage hat einen nächsten Schritt mit Datum.",
        "- Nach jedem Treffen beim Kontakt das Datum des letzten Treffens und die Beziehungsstärke aktualisieren.",
        "- Entscheidungen sofort in der Mandatsanfrage festhalten, bei einer Absage mit Grund.",
        "- Honorare kommen aus der Liste der Leistungen. Abrechnung und Projektarbeit bleiben in ihren eigenen Programmen.",
      ],
    },
    process: {
      title: "So entwickeln sich Mandate",
      markdown: [
        "Jede Mandatsanfrage durchläuft dieselben Phasen. Die Phase hält fest, wo das Gespräch steht, sie ist kein Dokument.",
        "",
        "## Phasen",
        "1. **Kennenlernen:** Jemand hat uns empfohlen oder das Unternehmen hat sich gemeldet. Organisation, Person und Empfehlungsquelle anlegen.",
        "2. **Bedarfsklärung:** Das erste Gespräch hat stattgefunden. Das Problem in den Worten des Kunden festhalten und notieren, wer noch beteiligt ist.",
        "3. **Auftragsklärung:** Wir stimmen ab, was das Mandat umfasst, wen wir interviewen und welche Leistungen passen.",
        "4. **Angebot gesendet:** Das Angebot ist per E-Mail verschickt; die Leistungen sind in der Mandatsanfrage erfasst.",
        "5. **Entscheidung:** Der Kunde entscheidet. Den nächsten Schritt auf das Datum legen, das er uns genannt hat.",
        "6. **Gewonnen oder Verloren:** Die Entscheidung von Hand eintragen, bei einer Absage mit Grund. In beiden Fällen der Person danken, die uns empfohlen hat.",
      ],
    },
    brief: {
      title: "Beziehungsbriefing vorbereiten",
      whenToUse: "Wenn ein Treffen mit Kunden, Interessenten oder Empfehlungspartnern ansteht.",
      markdown: [
        "Ein Beziehungsbriefing dauert zehn Minuten und sorgt dafür, dass wir in jedes Treffen gehen und den Menschen kennen, nicht nur die Anfrage.",
        "",
        "## Schritte",
        "1. Den Kontakt öffnen und Beziehungsstärke, letztes Treffen und Empfehlungsquelle prüfen.",
        "2. Die Organisation und ihre Mandatsanfragen öffnen: Phase, nächster Schritt und frühere Zusammenarbeit.",
        "3. Die Gespräche lesen, die mit der Mandatsanfrage und der Organisation verknüpft sind. Nicht verknüpfte Gespräche erscheinen dort nicht, deshalb auch im Posteingang nach dem Namen der Person suchen.",
        "4. Fünf Zeilen in die Notizen der Mandatsanfrage schreiben: was der Person wichtig ist, was sich seit dem letzten Gespräch geändert hat, was wir zugesagt haben, ein persönliches Detail, das wir uns merken sollten, und die Frage, die wir beantwortet haben wollen.",
        "5. Nach dem Treffen letztes Treffen, Beziehungsstärke, nächsten Schritt und Datum aktualisieren und für jede Zusage eine Aufgabe anlegen.",
      ],
    },
  },
  threads: {
    fairhavenDecision: {
      subject: "Angebot: Überprüfung des Betriebsmodells",
      messages: [
        "Sehr geehrte Frau Albrecht,\n\nvielen Dank für das offene Gespräch in der vergangenen Woche. Wie besprochen enthält das Angebot zwei Varianten: Variante A umfasst die Überprüfung der Abläufe, Variante B zusätzlich zwei Workshoptage mit Ihrer Geschäftsleitung.\n\nGern gehe ich das Angebot vor Ihrer Sitzung mit Herrn Pfeiffer und Frau Decker durch.\n\nMit freundlichen Grüßen\nMax Bergmann",
        "Sehr geehrter Herr Bergmann,\n\nwir haben das Angebot am Montag in der Geschäftsleitung besprochen und uns für Variante B entschieden. Herr Pfeiffer stimmt die Termine für den Auftakt mit Ihnen ab.\n\nDanke, dass Sie sich die Zeit genommen haben, unsere Abläufe wirklich zu verstehen, bevor Sie etwas aufgeschrieben haben.\n\nViele Grüße\nHeike Albrecht",
        "Sehr geehrte Frau Albrecht,\n\nherzlichen Dank für Ihre Entscheidung und das Vertrauen, das dahintersteht. Es war eine Freude, Ihr Team in den Interviews kennenzulernen, und ich freue mich auf die Zusammenarbeit.\n\nHerrn Pfeiffer schicke ich diese Woche zwei Termine für den Auftaktworkshop. Und viel Erfolg für Ihren Sohn beim Landesfinale am Samstag!\n\nHerzliche Grüße\nMax Bergmann",
      ],
    },
    fairhavenInterviews: {
      subject: "Interviews für die Bedarfsklärung",
      messages: [
        "Hallo Herr Bergmann,\n\nhier die Liste für die Interviews: die drei Werkleiter, unser Einkaufsleiter und die Leiterin Kundenservice. Frau Decker kommt für die Kostenfragen dazu.\n\nPassen jeweils 45 Minuten?\n\nViele Grüße\nMarkus Pfeiffer",
        "Hallo Herr Pfeiffer,\n\n45 Minuten passen sehr gut. Ich melde mich direkt bei allen und schicke Ihnen und Frau Albrecht danach eine Zusammenfassung auf einer Seite.\n\nViele Grüße\nMax Bergmann",
        "Prima, danke. Die Werkleiter bevorzugen frühe Termine am Morgen.",
      ],
    },
    richardIntro: {
      messages: [
        "Max, ich war gestern mit Peter Grauhof vom Grauhof Großhandel essen. Er denkt darüber nach, das Unternehmen an die nächste Generation zu übergeben, und hat gefragt, ob ich jemanden kenne, der erst zuhört und dann berät. Darf ich euch bekannt machen?",
        "Danke dir, Richard, das bedeutet mir viel. Sehr gern. Ich rufe ihn diese Woche an.",
        "Erledigt, ihr habt beide meine Mail. Bald mal einen Kaffee?",
      ],
    },
    ellisonArticle: {
      messages: [
        "Guten Tag Herr Bergmann, ich habe Ihren Artikel über Preise im Maschinenbau gelesen. Unsere Margen sinken seit zwei Jahren, obwohl die Stückzahlen steigen. Hätten Sie Zeit für ein Gespräch?",
        "Guten Tag Herr Fenske, danke für Ihre Nachricht. Das Muster ist häufig und meist gut lösbar. Passt Ihnen ein Telefonat am Donnerstag um 10 Uhr?",
        "Donnerstag passt. Frau Engel, unsere Leiterin Supply Chain, ist auch dabei.",
      ],
    },
    kestrelQuestion: {
      subject: "Rückfrage zum Angebot für die Vertriebsanalyse",
      messages: [
        "Hallo Herr Bergmann,\n\nvielen Dank für das Angebot. Herr Hartl fragt, ob wir die zwei Workshoptage aufteilen können: einen mit den Vertriebsleitern im März, einen mit dem ganzen Team im April. Ändert das etwas?\n\nViele Grüße\nLena Brandl",
        "Hallo Frau Brandl,\n\ndas passt gut und ändert am Honorar nichts. Mit zwei getrennten Tagen hat das Team dazwischen Zeit, Dinge auszuprobieren. Wollen wir das morgen kurz telefonisch durchgehen?\n\nViele Grüße\nMax Bergmann",
        "Ja, morgen um 16 Uhr passt.",
      ],
    },
    northwoldQuestions: {
      subject: "Analyse des Standortnetzes – Angebot",
      messages: [
        "Sehr geehrter Herr Wendt,\n\nwie versprochen erhalten Sie hier das Angebot für die Analyse Ihres Standortnetzes: ein dreiwöchiger Analysesprint, danach drei Workshoptage mit Ihren Standortleitern.\n\nGern bespreche ich jeden Punkt mit Ihnen.\n\nMit freundlichen Grüßen\nMax Bergmann",
        "Hallo Herr Bergmann,\n\ndanke für das Angebot. Zwei Fragen, bevor wir entscheiden: Können die Besuche an den Standorten in den ersten zwei Wochen stattfinden, und wäre Frau Hensel bei den Workshops dabei?\n\nViele Grüße\nThomas Wendt",
      ],
    },
    georgeCatchUp: {
      messages: [
        "Georg, herzlichen Glückwunsch zum Beiratsvorsitz. Hochverdient!",
        "Danke dir, Max! Lange nicht gesehen. Mittagessen nächsten Monat? Mich interessiert, woran du gerade arbeitest.",
        "Sehr gern. Ich schlage dir per Mail zwei Termine vor.",
      ],
    },
  },
  calendar: {
    name: "Kundentermine",
    events: [
      "Auftaktworkshop bei Falkenried Komponenten",
      "Erstgespräch mit Ellwanger Fluidtechnik",
      "Angebotsbesprechung mit Sperber Medizintechnik",
    ],
  },
};

const ORGANIZATION_FACTS: Record<
  OrganizationKey,
  { industry: string; relationship: string; employees: number; createdDaysAgo: number; becameClient?: number }
> = {
  fairhaven: { industry: "manufacturing", relationship: "client", employees: 240, createdDaysAgo: 54, becameClient: 2 },
  northwold: { industry: "logistics", relationship: "prospect", employees: 380, createdDaysAgo: 36 },
  brightwater: { industry: "software", relationship: "client", employees: 160, createdDaysAgo: 260 },
  calder: { industry: "packaging", relationship: "former", employees: 210, createdDaysAgo: 310 },
  ellison: { industry: "engineering", relationship: "prospect", employees: 320, createdDaysAgo: 17 },
  greyfriars: { industry: "wholesale", relationship: "prospect", employees: 140, createdDaysAgo: 5 },
  kestrel: { industry: "medtech", relationship: "client", employees: 190, createdDaysAgo: 200 },
  marlow: { industry: "facility", relationship: "prospect", employees: 450, createdDaysAgo: 8 },
  oakham: { industry: "engineering", relationship: "prospect", employees: 120, createdDaysAgo: 115 },
  riverton: { industry: "food", relationship: "prospect", employees: 270, createdDaysAgo: 13 },
  stanmore: { industry: "legal", relationship: "partner", employees: 35, createdDaysAgo: 420 },
  wexford: { industry: "chemicals", relationship: "prospect", employees: 230, createdDaysAgo: 165 },
};

const CONTACT_FACTS: Record<
  ContactKey,
  {
    organization: OrganizationKey;
    strength: string;
    lastMeeting: number;
    createdDaysAgo: number;
    linkedin?: boolean;
    avatar?: Parameters<typeof photo>[0];
  }
> = {
  helen: { organization: "fairhaven", strength: "strong", lastMeeting: -5, createdDaysAgo: 54, avatar: "anna-mueller" },
  martin: { organization: "fairhaven", strength: "warm", lastMeeting: -12, createdDaysAgo: 50, avatar: "felix-koch" },
  rachel: { organization: "fairhaven", strength: "warm", lastMeeting: -12, createdDaysAgo: 40 },
  tom: {
    organization: "northwold",
    strength: "warm",
    lastMeeting: -9,
    createdDaysAgo: 36,
    linkedin: true,
    avatar: "leon-becker",
  },
  claire: { organization: "northwold", strength: "early", lastMeeting: -20, createdDaysAgo: 28 },
  sarah: {
    organization: "brightwater",
    strength: "strong",
    lastMeeting: -6,
    createdDaysAgo: 258,
    linkedin: true,
    avatar: "mia-schneider",
  },
  adam: { organization: "brightwater", strength: "warm", lastMeeting: -25, createdDaysAgo: 240 },
  george: { organization: "calder", strength: "strong", lastMeeting: -140, createdDaysAgo: 305, linkedin: true },
  alan: {
    organization: "ellison",
    strength: "early",
    lastMeeting: -15,
    createdDaysAgo: 17,
    linkedin: true,
    avatar: "tim-wagner",
  },
  nina: { organization: "ellison", strength: "early", lastMeeting: -15, createdDaysAgo: 15 },
  paul: { organization: "greyfriars", strength: "early", lastMeeting: -3, createdDaysAgo: 5 },
  laura: { organization: "kestrel", strength: "strong", lastMeeting: -10, createdDaysAgo: 198, avatar: "lea-bauer" },
  simon: { organization: "kestrel", strength: "warm", lastMeeting: -10, createdDaysAgo: 120 },
  diane: { organization: "marlow", strength: "early", lastMeeting: -7, createdDaysAgo: 8, linkedin: true },
  ian: { organization: "oakham", strength: "warm", lastMeeting: -72, createdDaysAgo: 115 },
  emily: {
    organization: "riverton",
    strength: "early",
    lastMeeting: -4,
    createdDaysAgo: 13,
    linkedin: true,
    avatar: "sophie-wagner",
  },
  richard: {
    organization: "stanmore",
    strength: "strong",
    lastMeeting: -14,
    createdDaysAgo: 420,
    linkedin: true,
    avatar: "paul-koch",
  },
  kevin: { organization: "wexford", strength: "warm", lastMeeting: -105, createdDaysAgo: 165 },
};

type DealFacts = {
  organization: OrganizationKey;
  contacts: ContactKey[];
  stage: string;
  source: string;
  lines: Array<[ServiceKey, number]>;
  createdDaysAgo: number;
  decision: number;
  next?: number;
  lost?: string;
  /** Stage moves, oldest first: on `daysAgo` the opportunity left the stage `from`. */
  moves?: Array<{ daysAgo: number; from: string }>;
};

const DEAL_FACTS: Record<DealKey, DealFacts> = {
  fairhavenReview: {
    organization: "fairhaven",
    contacts: ["helen", "martin", "rachel"],
    stage: "won",
    source: "peerReferral",
    lines: [
      ["operatingModelReview", 1],
      ["workshopDay", 2],
    ],
    createdDaysAgo: 52,
    decision: -2,
    next: 9,
    moves: [
      { daysAgo: 45, from: "introduction" },
      { daysAgo: 33, from: "discovery" },
      { daysAgo: 19, from: "scoping" },
      { daysAgo: 7, from: "proposal" },
      { daysAgo: 2, from: "decision" },
    ],
  },
  northwoldReview: {
    organization: "northwold",
    contacts: ["tom", "claire"],
    stage: "proposal",
    source: "event",
    lines: [
      ["discoverySprint", 1],
      ["workshopDay", 3],
    ],
    createdDaysAgo: 34,
    decision: 14,
    next: 1,
    moves: [
      { daysAgo: 27, from: "introduction" },
      { daysAgo: 18, from: "discovery" },
      { daysAgo: 6, from: "scoping" },
    ],
  },
  brightwaterScaling: {
    organization: "brightwater",
    contacts: ["sarah", "adam"],
    stage: "scoping",
    source: "existingClient",
    lines: [["operatingModelReview", 1]],
    createdDaysAgo: 21,
    decision: 30,
    next: 2,
    moves: [
      { daysAgo: 16, from: "introduction" },
      { daysAgo: 6, from: "discovery" },
    ],
  },
  brightwaterInterim: {
    organization: "brightwater",
    contacts: ["sarah"],
    stage: "decision",
    source: "existingClient",
    lines: [["interimDay", 40]],
    createdDaysAgo: 30,
    decision: 5,
    next: 4,
    moves: [
      { daysAgo: 24, from: "introduction" },
      { daysAgo: 20, from: "discovery" },
      { daysAgo: 15, from: "scoping" },
      { daysAgo: 9, from: "proposal" },
    ],
  },
  ellisonPricing: {
    organization: "ellison",
    contacts: ["alan", "nina"],
    stage: "discovery",
    source: "content",
    lines: [["pricingReview", 1]],
    createdDaysAgo: 16,
    decision: 40,
    next: 3,
    moves: [{ daysAgo: 4, from: "introduction" }],
  },
  greyfriarsSuccession: {
    organization: "greyfriars",
    contacts: ["paul"],
    stage: "introduction",
    source: "peerReferral",
    lines: [
      ["offsiteFacilitation", 1],
      ["workshopDay", 1],
    ],
    createdDaysAgo: 4,
    decision: 60,
    next: 2,
  },
  kestrelSales: {
    organization: "kestrel",
    contacts: ["laura", "simon"],
    stage: "proposal",
    source: "existingClient",
    lines: [
      ["discoverySprint", 1],
      ["workshopDay", 2],
    ],
    createdDaysAgo: 40,
    decision: 10,
    next: 1,
    moves: [
      { daysAgo: 33, from: "introduction" },
      { daysAgo: 22, from: "discovery" },
      { daysAgo: 9, from: "scoping" },
    ],
  },
  marlowIntegration: {
    organization: "marlow",
    contacts: ["diane"],
    stage: "introduction",
    source: "event",
    lines: [["interimDay", 20]],
    createdDaysAgo: 7,
    decision: 45,
    next: 3,
  },
  rivertonExport: {
    organization: "riverton",
    contacts: ["emily"],
    stage: "discovery",
    source: "content",
    lines: [["discoverySprint", 1]],
    createdDaysAgo: 12,
    decision: 35,
    next: 5,
    moves: [{ daysAgo: 4, from: "introduction" }],
  },
  oakhamStrategy: {
    organization: "oakham",
    contacts: ["ian"],
    stage: "lost",
    source: "clientReferral",
    lines: [["workshopDay", 1]],
    createdDaysAgo: 110,
    decision: -70,
    lost: "timing",
    moves: [
      { daysAgo: 95, from: "introduction" },
      { daysAgo: 84, from: "discovery" },
      { daysAgo: 70, from: "proposal" },
    ],
  },
  calderReview: {
    organization: "calder",
    contacts: ["george"],
    stage: "won",
    source: "clientReferral",
    lines: [
      ["operatingModelReview", 1],
      ["workshopDay", 3],
    ],
    createdDaysAgo: 300,
    decision: -220,
    moves: [
      { daysAgo: 280, from: "introduction" },
      { daysAgo: 262, from: "discovery" },
      { daysAgo: 245, from: "scoping" },
      { daysAgo: 232, from: "proposal" },
      { daysAgo: 220, from: "decision" },
    ],
  },
  wexfordPlant: {
    organization: "wexford",
    contacts: ["kevin"],
    stage: "lost",
    source: "event",
    lines: [["operatingModelReview", 1]],
    createdDaysAgo: 160,
    decision: -100,
    lost: "otherAdvisor",
    moves: [
      { daysAgo: 150, from: "introduction" },
      { daysAgo: 135, from: "discovery" },
      { daysAgo: 118, from: "proposal" },
      { daysAgo: 100, from: "decision" },
    ],
  },
  kestrelWorkshop: {
    organization: "kestrel",
    contacts: ["laura"],
    stage: "won",
    source: "existingClient",
    lines: [["workshopDay", 2]],
    createdDaysAgo: 190,
    decision: -150,
    moves: [
      { daysAgo: 175, from: "proposal" },
      { daysAgo: 150, from: "decision" },
    ],
  },
};

const SERVICE_PRICES: Record<ServiceKey, number> = {
  discoverySprint: 6500,
  operatingModelReview: 18500,
  pricingReview: 12000,
  workshopDay: 2400,
  offsiteFacilitation: 5800,
  interimDay: 1350,
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
  briefHelen: {
    status: "open",
    priority: "high",
    due: 8,
    deal: "fairhavenReview",
    contact: "helen",
    createdDaysAgo: 2,
  },
  kickoffAgenda: {
    status: "inProgress",
    priority: "high",
    due: 3,
    deal: "fairhavenReview",
    contact: "martin",
    createdDaysAgo: 2,
  },
  callTom: { status: "open", priority: "high", due: 1, deal: "northwoldReview", contact: "tom", createdDaysAgo: 1 },
  brightwaterScope: {
    status: "inProgress",
    priority: "high",
    due: 2,
    deal: "brightwaterScaling",
    contact: "sarah",
    createdDaysAgo: 6,
  },
  interimAvailability: {
    status: "open",
    priority: "medium",
    due: 4,
    deal: "brightwaterInterim",
    contact: "sarah",
    createdDaysAgo: 9,
  },
  ellisonQuestions: {
    status: "open",
    priority: "medium",
    due: 2,
    deal: "ellisonPricing",
    contact: "alan",
    createdDaysAgo: 3,
  },
  thankRichard: {
    status: "done",
    priority: "medium",
    due: -2,
    organization: "stanmore",
    contact: "richard",
    createdDaysAgo: 5,
    done: 3,
  },
  kestrelWalkthrough: {
    status: "open",
    priority: "high",
    due: 1,
    deal: "kestrelSales",
    contact: "laura",
    createdDaysAgo: 1,
  },
  briefDiane: {
    status: "open",
    priority: "medium",
    due: 2,
    deal: "marlowIntegration",
    contact: "diane",
    createdDaysAgo: 6,
  },
  rivertonNotes: {
    status: "done",
    priority: "medium",
    due: -3,
    deal: "rivertonExport",
    contact: "emily",
    createdDaysAgo: 5,
    done: 4,
  },
  lunchGeorge: {
    status: "open",
    priority: "low",
    due: 5,
    organization: "calder",
    contact: "george",
    createdDaysAgo: 6,
  },
  oakhamCheckIn: {
    status: "onHold",
    priority: "low",
    due: 60,
    deal: "oakhamStrategy",
    contact: "ian",
    createdDaysAgo: 68,
  },
};

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
  id: "consultants",
  strings: { en, de },
  build: (t) => {
    const phone = (index: number) => phoneNumber(t.phones.mobile, index);
    const open = ["introduction", "discovery", "scoping", "proposal", "decision"];
    const label = <K extends string>(
      options: Record<K, string>,
      colors: Record<K, "default" | "secondary" | "destructive" | "success" | "warning" | "info">,
    ) => (Object.keys(options) as K[]).map((key) => ({ key, label: options[key], color: colors[key] }));
    const domain = (key: OrganizationKey) => t.organizations[key][2];

    const organization: RecordSpec[] = ORGANIZATIONS.map((key) => {
      const facts = ORGANIZATION_FACTS[key];
      const [name, city] = t.organizations[key];
      return {
        key,
        values: {
          name,
          industry: facts.industry,
          relationship: facts.relationship,
          city,
          website: `https://${domain(key)}`,
          employees: facts.employees,
        },
        channels: { email: `office@${domain(key)}` },
        createdDaysAgo: facts.createdDaysAgo,
        ...(facts.becameClient === undefined
          ? {}
          : { history: [{ daysAgo: facts.becameClient, previous: { relationship: "prospect" } }] }),
      };
    });
    const contact: RecordSpec[] = CONTACTS.map((key, index) => {
      const facts = CONTACT_FACTS[key];
      const [firstName, lastName, jobTitle] = t.contacts[key];
      const handle = `${mailbox(firstName)}-${mailbox(lastName)}`;
      return {
        key,
        values: {
          firstName,
          lastName,
          jobTitle,
          phone: phone(index),
          strength: facts.strength,
          lastMeeting: day(facts.lastMeeting),
        },
        links: { "contact.organizations": facts.organization },
        channels: {
          email: `${mailbox(firstName)}.${mailbox(lastName)}@${domain(facts.organization)}`,
          ...(facts.linkedin
            ? { linkedin: `${handle}.linkedin.example`, linkedinUrl: `https://linkedin.example/in/${handle}` }
            : {}),
        },
        ...(facts.avatar ? { avatar: photo(facts.avatar) } : {}),
        createdDaysAgo: facts.createdDaysAgo,
      };
    });
    const service: RecordSpec[] = SERVICES.map((key, index) => ({
      key,
      values: { name: t.services[key], amount: SERVICE_PRICES[key] },
      createdDaysAgo: 600 - index,
    }));
    const deal: RecordSpec[] = DEALS.map((key) => {
      const facts = DEAL_FACTS[key];
      const [name, nextStep] = t.deals[key];
      const story = key === "fairhavenReview";
      return {
        key,
        values: {
          name,
          stage: facts.stage,
          referralSource: facts.source,
          decisionDate: day(facts.decision),
          nextStep,
          ...(facts.next === undefined ? {} : { nextStepDate: day(facts.next) }),
          ...(facts.lost ? { lostReason: facts.lost } : {}),
          ...(story ? { notes: t.fairhavenNotes } : {}),
        },
        links: { "deal.organizations": facts.organization, "deal.contacts": facts.contacts },
        lines: facts.lines,
        createdDaysAgo: facts.createdDaysAgo,
        history: (facts.moves ?? []).map((move) => ({
          daysAgo: move.daysAgo,
          previous: (story
            ? { stage: move.from, nextStep: t.story[move.from as StoryStage] }
            : { stage: move.from }) as Record<string, FieldInput>,
        })),
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
        createdDaysAgo: facts.createdDaysAgo,
        ...(facts.done === undefined ? {} : { history: [{ daysAgo: facts.done, previous: { status: "open" } }] }),
      };
    });

    const thread = (key: keyof Strings["threads"], senders: readonly string[], draftLast = false) =>
      senders.map((from, index) => ({
        from,
        text: t.threads[key].messages[index],
        ...(draftLast && index === senders.length - 1 ? { draft: true } : {}),
      }));

    return {
      companyName: t.company,
      lists: (["organization", "contact", "deal", "service", "task"] as const).map((key) => ({
        key,
        label: t.lists[key][0],
        pluralLabel: t.lists[key][1],
        description: t.lists[key][2],
        icon: { organization: "building", contact: "contact", deal: "handshake", service: "package", task: "check" }[
          key
        ],
      })),
      fields: [
        {
          key: "organization.industry",
          label: t.fields.industry,
          type: "select",
          options: label(t.options.industry, {
            manufacturing: "default",
            logistics: "info",
            software: "secondary",
            packaging: "warning",
            engineering: "default",
            wholesale: "warning",
            medtech: "success",
            facility: "secondary",
            food: "success",
            legal: "info",
            chemicals: "destructive",
          }),
        },
        {
          key: "organization.relationship",
          label: t.fields.relationship,
          type: "select",
          options: label(t.options.relationship, {
            prospect: "info",
            client: "success",
            former: "secondary",
            partner: "warning",
          }),
        },
        { key: "organization.city", label: t.fields.city, type: "text" },
        { key: "organization.website", label: t.fields.website, type: "url" },
        { key: "organization.employees", label: t.fields.employees, type: "number" },
        { key: "contact.jobTitle", label: t.fields.jobTitle, type: "text" },
        { key: "contact.phone", label: t.fields.phone, type: "phone" },
        {
          key: "contact.strength",
          label: t.fields.strength,
          type: "select",
          options: label(t.options.strength, { strong: "success", warm: "warning", early: "info" }),
        },
        { key: "contact.lastMeeting", label: t.fields.lastMeeting, type: "date" },
        {
          key: "deal.referralSource",
          label: t.fields.referralSource,
          type: "select",
          options: label(t.options.referralSource, {
            clientReferral: "success",
            peerReferral: "success",
            event: "warning",
            content: "info",
            existingClient: "secondary",
          }),
        },
        { key: "deal.decisionDate", label: t.fields.decisionDate, type: "date" },
        { key: "deal.nextStep", label: t.fields.nextStep, type: "text" },
        { key: "deal.nextStepDate", label: t.fields.nextStepDate, type: "date" },
        {
          key: "deal.lostReason",
          label: t.fields.lostReason,
          type: "select",
          options: label(t.options.lostReason, {
            timing: "info",
            budget: "warning",
            inHouse: "secondary",
            otherAdvisor: "destructive",
          }),
        },
        { key: "task.dueDate", label: t.fields.dueDate, type: "date" },
        {
          key: "task.priority",
          label: t.fields.priority,
          type: "select",
          options: label(t.options.priority, { low: "secondary", medium: "info", high: "destructive" }),
        },
      ],
      stages: [
        { key: "introduction", label: t.stages.introduction, color: "secondary", probability: 10 },
        { key: "discovery", label: t.stages.discovery, color: "info", probability: 20 },
        { key: "scoping", label: t.stages.scoping, color: "info", probability: 35 },
        { key: "proposal", label: t.stages.proposal, color: "warning", probability: 55 },
        { key: "decision", label: t.stages.decision, color: "warning", probability: 70 },
        { key: "won", label: t.stages.won, color: "success", probability: 100 },
        { key: "lost", label: t.stages.lost, color: "destructive", probability: 0 },
      ],
      records: { organization, contact, service, deal, task },
      views: [
        {
          key: "pipeline",
          list: "deal",
          name: t.views.pipeline,
          mode: "board",
          groupBy: "stage",
          columns: ["totalValue", "deal.organizations", "nextStepDate"],
          filters: [{ field: "stage", notIn: ["lost"] }],
        },
        {
          key: "nextSteps",
          list: "deal",
          name: t.views.nextSteps,
          mode: "table",
          columns: ["stage", "nextStep", "nextStepDate", "deal.organizations", "deal.contacts", "totalValue"],
          filters: [{ field: "stage", in: open }],
          sort: { field: "nextStepDate", direction: "asc" },
        },
        {
          key: "organizations",
          list: "organization",
          name: t.views.organizations,
          mode: "table",
          columns: ["relationship", "industry", "city", "employees", "contact.organizations"],
          sort: { field: "relationship", direction: "asc" },
        },
        {
          key: "relationships",
          list: "contact",
          name: t.views.relationships,
          mode: "table",
          columns: ["jobTitle", "contact.organizations", "strength", "lastMeeting", "capability.identity"],
          sort: { field: "lastMeeting", direction: "asc" },
        },
        {
          key: "openTasks",
          list: "task",
          name: t.views.openTasks,
          mode: "table",
          columns: ["dueDate", "status", "priority", "task.deals", "task.contacts"],
          filters: [{ field: "status", notIn: ["done", "archived"] }],
          sort: { field: "dueDate", direction: "asc" },
        },
        {
          key: "services",
          list: "service",
          name: t.views.services,
          mode: "table",
          columns: ["amount"],
          sort: { field: "amount", direction: "desc" },
        },
      ],
      dashboard: {
        widgets: [
          {
            kind: "kpi",
            title: t.widgets.openValue,
            list: "deal",
            aggregation: "sum",
            field: "totalValue",
            filters: [{ field: "stage", in: open }],
          },
          {
            kind: "kpi",
            title: t.widgets.weighted,
            list: "deal",
            aggregation: "sum",
            field: "weightedValue",
            filters: [{ field: "stage", in: open }],
          },
          {
            kind: "kpi",
            title: t.widgets.won,
            list: "deal",
            aggregation: "sum",
            field: "totalValue",
            filters: [{ field: "stage", in: ["won"] }],
          },
          {
            kind: "kpi",
            title: t.widgets.openTasks,
            list: "task",
            aggregation: "count",
            filters: [{ field: "status", notIn: ["done", "archived"] }],
          },
          {
            kind: "chart",
            title: t.widgets.byStage,
            display: DisplayType.verticalBarChartWithLabels,
            list: "deal",
            aggregation: "sum",
            field: "totalValue",
            groupBy: { field: "stage" },
            filters: [{ field: "stage", in: open }],
            width: 6,
          },
          {
            kind: "chart",
            title: t.widgets.bySource,
            display: DisplayType.doughnutChart,
            list: "deal",
            aggregation: "count",
            groupBy: { field: "referralSource" },
            width: 6,
          },
          {
            kind: "chart",
            title: t.widgets.wonByMonth,
            display: DisplayType.areaChart,
            list: "deal",
            aggregation: "sum",
            field: "totalValue",
            groupBy: { month: "decisionDate" },
            filters: [{ field: "stage", in: ["won"] }],
            width: 6,
          },
          {
            kind: "chart",
            title: t.widgets.byStrength,
            display: DisplayType.horizontalBarChartWithLabels,
            list: "contact",
            aggregation: "count",
            groupBy: { field: "strength" },
            colors: [ChartColor.secondary1],
            width: 6,
          },
          { kind: "activity", title: t.widgets.activity },
        ],
      },
      wiki: [
        { key: "guide", kind: "guide", title: t.wiki.guide.title, markdown: t.wiki.guide.markdown },
        { key: "process", kind: "knowledge", title: t.wiki.process.title, markdown: t.wiki.process.markdown },
        {
          key: "brief",
          kind: "procedure",
          title: t.wiki.brief.title,
          whenToUse: t.wiki.brief.whenToUse,
          markdown: t.wiki.brief.markdown,
        },
      ],
      messaging: {
        accounts: ["google", "linkedin"],
        selfTitle: t.selfTitle,
        website: t.website,
        threads: [
          {
            account: "google",
            with: ["helen"],
            subject: t.threads.fairhavenDecision.subject,
            state: "unread",
            latestMinutesAgo: 40,
            messages: thread("fairhavenDecision", ["self", "helen", "self"], true),
            links: ["deal:fairhavenReview", "organization:fairhaven"],
          },
          {
            account: "google",
            with: ["martin"],
            subject: t.threads.fairhavenInterviews.subject,
            state: "open",
            latestMinutesAgo: 30 * 24 * 60,
            messages: thread("fairhavenInterviews", ["martin", "self", "martin"]),
            links: ["deal:fairhavenReview"],
          },
          {
            account: "google",
            with: ["tom"],
            subject: t.threads.northwoldQuestions.subject,
            state: "unread",
            latestMinutesAgo: 2 * 60,
            messages: thread("northwoldQuestions", ["self", "tom"]),
            links: ["deal:northwoldReview", "organization:northwold"],
          },
          {
            account: "google",
            with: ["laura"],
            subject: t.threads.kestrelQuestion.subject,
            state: "open",
            latestMinutesAgo: 20 * 60,
            messages: thread("kestrelQuestion", ["laura", "self", "laura"]),
            links: ["deal:kestrelSales"],
          },
          {
            account: "linkedin",
            with: ["richard"],
            state: "open",
            latestMinutesAgo: 4 * 24 * 60,
            messages: thread("richardIntro", ["richard", "self", "richard"]),
            links: ["deal:greyfriarsSuccession", "organization:greyfriars"],
          },
          {
            account: "linkedin",
            with: ["alan"],
            state: "unread",
            latestMinutesAgo: 3 * 60,
            messages: thread("ellisonArticle", ["alan", "self", "alan"]).map((message, index) =>
              index === 1 ? { ...message, reaction: { from: "alan", value: "👍" } } : message,
            ),
            links: ["deal:ellisonPricing"],
          },
          {
            account: "linkedin",
            with: ["george"],
            state: "open",
            latestMinutesAgo: 6 * 24 * 60,
            messages: thread("georgeCatchUp", ["self", "george", "self"]),
          },
        ],
        calendar: {
          name: t.calendar.name,
          events: [
            {
              title: t.calendar.events[0],
              with: ["helen", "martin"],
              startsMinutesAgo: -9 * 24 * 60,
              durationMinutes: 180,
            },
            {
              title: t.calendar.events[1],
              with: ["alan", "nina"],
              startsMinutesAgo: -2 * 24 * 60,
              durationMinutes: 60,
            },
            { title: t.calendar.events[2], with: ["laura"], startsMinutesAgo: -20 * 60, durationMinutes: 30 },
          ],
        },
      },
    };
  },
});
