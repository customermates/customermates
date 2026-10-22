import { DisplayType } from "@/features/widget/widget-display.schema";

import { day, defineSolution, photo, type RecordSpec, phoneNumber } from "../define-solution";

/**
 * Freelancers: Max works alone as a UX and product designer for a handful of B2B clients, most of them over several
 * years. The client list shows how long each relationship runs, the last project and the next action; work
 * opportunities carry an estimated project value from the first inquiry to closed work. Billing stays in the tools
 * Max already uses, and next actions are plain date fields that nobody is reminded of automatically.
 */

const ORGANIZATIONS = ["tidewater", "brightpath", "corvid", "meadow", "quill", "fernhill", "atlas", "juniper"] as const;
type OrganizationKey = (typeof ORGANIZATIONS)[number];
const CONTACTS = [
  "priya",
  "marcus",
  "rachel",
  "tom",
  "dan",
  "chris",
  "laura",
  "kevin",
  "nina",
  "sam",
  "jenna",
  "alex",
] as const;
type ContactKey = (typeof CONTACTS)[number];
const DEALS = [
  "tidewaterDashboard",
  "tidewaterDesignSystem",
  "brightpathOnboarding",
  "brightpathMobile",
  "brightpathCatalog",
  "corvidDriverReview",
  "meadowClaims",
  "meadowAccessibility",
  "quillOnboarding",
  "fernhillTariff",
  "atlasRider",
  "juniperRefresh",
] as const;
type DealKey = (typeof DEALS)[number];
const TASKS = [
  "walkthroughPrep",
  "scopeOptions",
  "kickoffAgenda",
  "followUpLaura",
  "replySam",
  "reviewQuillScreens",
  "testimonial",
  "caseStudy",
  "corvidCheckIn",
] as const;
type TaskKey = (typeof TASKS)[number];

const en = {
  company: "Linwood Product Design",
  website: "https://linwood-design.example",
  phones: { mobile: { templates: ["+1 202 555 01##"], start: 20 } },
  selfTitle: "Freelance UX and product designer",
  lists: {
    organization: ["Client", "Clients", "Companies I work for or talk to about work."],
    contact: ["Contact", "Contacts", "The people I work with at my clients."],
    deal: ["Work opportunity", "Work opportunities", "Possible projects, from the first inquiry to closed work."],
    task: ["Task", "Tasks", "Things I promised to do, with a due date."],
  },
  fields: {
    relationship: "Working relationship",
    clientSince: "Client since",
    lastProject: "Last project",
    nextAction: "Next action",
    nextActionDate: "Next action date",
    city: "City",
    website: "Website",
    jobTitle: "Job title",
    phone: "Phone",
    workType: "Type of work",
    source: "Source",
    decisionDate: "Decision date",
    dueDate: "Due date",
  },
  options: {
    relationship: { ongoing: "Ongoing", occasional: "Occasional", new: "New" },
    workType: {
      research: "User research",
      productDesign: "Product design",
      designSystem: "Design system",
      review: "UX review",
    },
    source: { repeat: "Existing client", referral: "Referral", website: "Website", network: "Network" },
  },
  stages: {
    inquiry: "Inquiry",
    firstConversation: "First conversation",
    proposal: "Proposal sent",
    accepted: "Accepted",
    closed: "Closed",
    lost: "Lost",
  },
  organizations: {
    tidewater: [
      "Tidewater Analytics",
      "Boston",
      "tidewater-analytics.example",
      "Design system audit",
      "Proposal walkthrough with Priya",
    ],
    brightpath: [
      "Brightpath Learning",
      "Austin",
      "brightpath-learning.example",
      "Course catalog redesign",
      "Kick-off workshop for the onboarding flow",
    ],
    corvid: [
      "Corvid Fleet Software",
      "Chicago",
      "corvid-fleet.example",
      "Driver app UX review",
      "Quarterly check-in with Dan",
    ],
    meadow: [
      "Meadowlark Insurance",
      "Hartford",
      "meadowlark-insurance.example",
      "Accessibility review of the customer area",
      "Follow up on the claims form proposal",
    ],
    quill: ["Quill & Ledger", "Seattle", "quill-ledger.example", "", "Scope call with Nina"],
    fernhill: ["Fernhill Energy", "Portland", "fernhill-energy.example", "", "Reply to Sam's inquiry"],
    atlas: ["Atlas Mobility", "Denver", "atlas-mobility.example", "", ""],
    juniper: [
      "Juniper Trails",
      "San Diego",
      "juniper-trails.example",
      "First version of the trip planner",
      "Ask Alex for current usage numbers",
    ],
  } satisfies Record<OrganizationKey, readonly [string, string, string, string, string]>,
  contacts: {
    priya: ["Priya", "Raman", "Head of Product"],
    marcus: ["Marcus", "Webb", "Engineering lead"],
    rachel: ["Rachel", "Moreno", "Design director"],
    tom: ["Tom", "Gallagher", "Product manager"],
    dan: ["Dan", "Okafor", "CTO"],
    chris: ["Chris", "Lindqvist", "Product manager"],
    laura: ["Laura", "Bishop", "Head of Digital"],
    kevin: ["Kevin", "Shaw", "Product owner"],
    nina: ["Nina", "Castillo", "Co-founder"],
    sam: ["Sam", "Whitaker", "Marketing manager"],
    jenna: ["Jenna", "Park", "Product lead"],
    alex: ["Alex", "Duncan", "Owner"],
  } satisfies Record<ContactKey, readonly [string, string, string]>,
  deals: {
    tidewaterDashboard: ["Tidewater – analytics dashboard redesign, phase 2", "Walk Priya through the proposal"],
    tidewaterDesignSystem: ["Tidewater – design system audit", ""],
    brightpathOnboarding: ["Brightpath – teacher onboarding flow", "Kick-off workshop with Rachel and Tom"],
    brightpathMobile: ["Brightpath – mobile app usability review", "Send Tom two scope options"],
    brightpathCatalog: ["Brightpath – course catalog redesign", ""],
    corvidDriverReview: ["Corvid – driver app UX review", ""],
    meadowClaims: ["Meadowlark – claims form redesign", "Follow up with Laura on the proposal"],
    meadowAccessibility: ["Meadowlark – accessibility review of the customer area", ""],
    quillOnboarding: ["Quill & Ledger – app onboarding prototype", "Scope call with Nina"],
    fernhillTariff: ["Fernhill Energy – tariff comparison page", "Reply to Sam with possible start dates"],
    atlasRider: ["Atlas Mobility – rider app redesign", ""],
    juniperRefresh: ["Juniper Trails – trip planner refresh", "Ask Alex for current usage numbers"],
  } satisfies Record<DealKey, readonly [string, string]>,
  tasks: {
    walkthroughPrep: "Prepare the phase 2 proposal walkthrough for Priya",
    scopeOptions: "Write two scope options for the mobile review",
    kickoffAgenda: "Draft the kick-off workshop agenda",
    followUpLaura: "Follow up with Laura about the claims form proposal",
    replySam: "Reply to Sam's inquiry with possible start dates",
    reviewQuillScreens: "Review Quill & Ledger's current onboarding screens",
    testimonial: "Ask Priya for a short testimonial",
    caseStudy: "Write the Meadowlark accessibility case study for the portfolio",
    corvidCheckIn: "Quarterly check-in call with Dan",
  } satisfies Record<TaskKey, string>,
  views: {
    clients: "Client list",
    pipeline: "Opportunities by stage",
    nextActions: "Next actions",
    allContacts: "All contacts",
    openTasks: "Open tasks",
    taskBoard: "Tasks by status",
  },
  widgets: {
    openValue: "Open opportunity value",
    weighted: "Weighted open value",
    ongoingClients: "Ongoing clients",
    openTasks: "Open tasks",
    byStage: "Open value by stage",
    byWorkType: "Opportunities by type of work",
    bySource: "Opportunities by source",
    activity: "Recent activity",
  },
  wiki: {
    guide: {
      title: "Operating Guide",
      markdown: [
        "Max Bergmann works alone as a UX and product designer for a small number of B2B clients, most of them over several years. This workspace is demo data; every company and person in it is fictional.",
        "",
        "## What is in this workspace",
        "- **Clients** are the companies I work for or talk to. The client list shows how long we have worked together, the kind of relationship, the last project and the next action.",
        "- **Contacts** are the people at those clients.",
        "- **Work opportunities** are possible projects, from the first inquiry to closed work. The value is my estimate of the project; the weighted value is that estimate times the stage probability.",
        "- **Tasks** are things I promised to do, with a due date. Tasks, next actions and their dates are ordinary fields: nobody is reminded automatically, so I check the Next actions view every morning.",
        "- An email or WhatsApp conversation belongs to a client or an opportunity only when I link it there.",
        "",
        "## What stays elsewhere",
        "- Billing and bookkeeping stay in the tools I already use. This workspace keeps the client relationships and the open work.",
      ],
    },
    stages: {
      title: "Stages of a work opportunity",
      markdown: [
        "Every work opportunity moves through the same six stages, so the board shows at a glance where each possible project stands.",
        "",
        "## Stages",
        "1. **Inquiry:** someone asks about a project. Add the client, the person and a rough value.",
        "2. **First conversation:** we talked about goals, timing and who decides.",
        "3. **Proposal sent:** the scope and my estimate went out by email.",
        "4. **Accepted:** the client said yes and the work is planned.",
        "5. **Closed:** the work is done. Update the client's last project.",
        "6. **Lost:** the client decided against it or went quiet. Write down why in the notes.",
      ],
    },
    afterConversation: {
      title: "After a first conversation",
      whenToUse: "When the first call or meeting about a new project has taken place.",
      markdown: [
        "A first conversation leaves notes, a better estimate and a promise to follow up. These steps keep all of that on the opportunity.",
        "",
        "## Steps",
        "1. Write goals, timing and open questions into the opportunity notes.",
        "2. Move the opportunity to First conversation and update the estimated value.",
        "3. Set the next action and its date on the opportunity and on the client.",
        "4. Link the email or WhatsApp chat with the client to the opportunity.",
      ],
    },
  },
  threads: {
    tidewaterProposal: {
      subject: "Dashboard redesign – phase 2 proposal",
      messages: [
        "Hi Max,\n\nThanks for sending the phase 2 proposal. Marcus and I read it yesterday. Could we go through the research part together? We are not sure we need five interviews again.\n\nBest,\nPriya",
        "Hi Priya,\n\nHappy to. Thursday at 10 works for me. I can show where three interviews would be enough and what we would lose.\n\nBest,\nMax",
        "Thursday at 10 it is. I will bring Marcus.",
      ],
    },
    brightpathKickoff: {
      messages: [
        "Hi Max! Tom and I are keeping Tuesday morning free for the kick-off. Does 9:30 work?",
        "Hi Rachel, 9:30 works. I'll send the agenda on Friday.",
        "Perfect. Can we also look at the old onboarding survey results? Tom found them.",
      ],
    },
    fernhillInquiry: {
      subject: "Inquiry: UX for our tariff comparison page",
      messages: [
        "Hello Mr. Bergmann,\n\nWe found your portfolio through a colleague at Meadowlark Insurance. Many visitors leave our tariff comparison page on the second step, and we would like an outside view and a redesign.\n\nWould you have capacity in the next two months?\n\nKind regards,\nSam Whitaker\nFernhill Energy",
        "Hello Sam,\n\nThank you for reaching out. Yes, I can start in the second half of next month. Before I suggest a scope, could you share the current page and the drop-off numbers per step?\n\nBest regards,\nMax Bergmann",
      ],
    },
    meadowQuestions: {
      subject: "Claims form proposal – questions",
      messages: [
        "Hi Max,\n\nOur legal team wants to review the new claims form before it goes live. Could you plan a review round with them in the second week?\n\nThanks,\nLaura",
        "Hi Laura,\n\nOf course. I will add a review round with legal in week two and move the usability test to week three. The updated proposal follows tomorrow.\n\nBest,\nMax",
      ],
    },
    corvidCheckIn: {
      subject: "Driver app – how is it going?",
      messages: [
        "Hi Dan,\n\nIt has been two months since the driver app review. How are the changes to the delivery screen working for your drivers?\n\nBest,\nMax",
        "Hi Max,\n\nGood timing. Support tickets about missed stops are down by a third. Chris wants to talk about the dispatcher view next quarter, I will loop him in.\n\nDan",
      ],
    },
    quillScope: {
      subject: "Onboarding prototype – next step",
      messages: [
        "Hi Max,\n\nGreat talking to you last week. Before we commit, we would like to agree on the scope: just the sign-up flow, or also the first bank connection?\n\nNina",
        "Hi Nina,\n\nI would take on sign-up and the first bank connection together, since most people drop off between the two. Shall we settle it in a short call on Monday?\n\nBest,\nMax",
      ],
    },
  },
};

type Strings = typeof en;

const de: Strings = {
  company: "Feldmark Produktdesign",
  website: "https://feldmark-design.example",
  phones: { mobile: { templates: ["+49 30 23125 ###"], start: 300 } },
  selfTitle: "Freiberuflicher UX- und Produktdesigner",
  lists: {
    organization: ["Kunde", "Kunden", "Unternehmen, für die ich arbeite oder mit denen ich über Projekte spreche."],
    contact: ["Kontakt", "Kontakte", "Meine Ansprechpersonen bei den Kunden."],
    deal: [
      "Projektanfrage",
      "Projektanfragen",
      "Mögliche Projekte, von der ersten Anfrage bis zur abgeschlossenen Arbeit.",
    ],
    task: ["Aufgabe", "Aufgaben", "Was ich zugesagt habe, mit Fälligkeitsdatum."],
  },
  fields: {
    relationship: "Zusammenarbeit",
    clientSince: "Kunde seit",
    lastProject: "Letztes Projekt",
    nextAction: "Nächster Schritt",
    nextActionDate: "Datum nächster Schritt",
    city: "Ort",
    website: "Website",
    jobTitle: "Position",
    phone: "Telefon",
    workType: "Art der Arbeit",
    source: "Herkunft",
    decisionDate: "Entscheidungsdatum",
    dueDate: "Fällig am",
  },
  options: {
    relationship: { ongoing: "Laufend", occasional: "Gelegentlich", new: "Neu" },
    workType: {
      research: "Nutzerforschung",
      productDesign: "Produktdesign",
      designSystem: "Designsystem",
      review: "UX-Review",
    },
    source: { repeat: "Bestandskunde", referral: "Empfehlung", website: "Website", network: "Netzwerk" },
  },
  stages: {
    inquiry: "Anfrage",
    firstConversation: "Erstgespräch",
    proposal: "Angebot gesendet",
    accepted: "Zugesagt",
    closed: "Abgeschlossen",
    lost: "Verloren",
  },
  organizations: {
    tidewater: [
      "Hafenblick Analytics GmbH",
      "Hamburg",
      "hafenblick-analytics.example",
      "Audit des Designsystems",
      "Angebot mit Katrin Vogt durchgehen",
    ],
    brightpath: [
      "Lernpfad Bildung GmbH",
      "Leipzig",
      "lernpfad-bildung.example",
      "Redesign des Kurskatalogs",
      "Kick-off-Workshop zum Onboarding",
    ],
    corvid: [
      "Rabe Flottensoftware",
      "Bremen",
      "rabe-flotte.example",
      "UX-Review der Fahrer-App",
      "Quartalsgespräch mit Stefan Brandt",
    ],
    meadow: [
      "Wiesental Versicherung",
      "Stuttgart",
      "wiesental-versicherung.example",
      "Barrierefreiheits-Review des Kundenbereichs",
      "Zum Angebot Schadenmeldung nachfassen",
    ],
    quill: ["Feder & Konto", "Frankfurt am Main", "feder-konto.example", "", "Umfang mit Nina Hartmann klären"],
    fernhill: [
      "Sonnenhang Energie",
      "Freiburg",
      "sonnenhang-energie.example",
      "",
      "Anfrage von Sebastian Ott beantworten",
    ],
    atlas: ["Nordlicht Mobility", "Kiel", "nordlicht-mobility.example", "", ""],
    juniper: [
      "Wacholder Reisen",
      "München",
      "wacholder-reisen.example",
      "Erste Version des Reiseplaners",
      "Andreas Roth nach aktuellen Nutzungszahlen fragen",
    ],
  },
  contacts: {
    priya: ["Katrin", "Vogt", "Leiterin Produkt"],
    marcus: ["Jan", "Petersen", "Leiter Entwicklung"],
    rachel: ["Miriam", "Albrecht", "Leiterin Design"],
    tom: ["Tobias", "Wendt", "Produktmanager"],
    dan: ["Stefan", "Brandt", "CTO"],
    chris: ["Christian", "Weiß", "Produktmanager"],
    laura: ["Julia", "Kramer", "Leiterin Digitales"],
    kevin: ["Florian", "Seidel", "Product Owner"],
    nina: ["Nina", "Hartmann", "Mitgründerin"],
    sam: ["Sebastian", "Ott", "Marketingleiter"],
    jenna: ["Carina", "Lorenz", "Produktleiterin"],
    alex: ["Andreas", "Roth", "Inhaber"],
  },
  deals: {
    tidewaterDashboard: ["Hafenblick – Redesign Analyse-Dashboard, Phase 2", "Angebot mit Katrin Vogt durchgehen"],
    tidewaterDesignSystem: ["Hafenblick – Audit des Designsystems", ""],
    brightpathOnboarding: [
      "Lernpfad – Onboarding für Lehrkräfte",
      "Kick-off-Workshop mit Miriam Albrecht und Tobias Wendt",
    ],
    brightpathMobile: ["Lernpfad – Usability-Review der Mobile-App", "Tobias Wendt zwei Umfangsvarianten schicken"],
    brightpathCatalog: ["Lernpfad – Redesign des Kurskatalogs", ""],
    corvidDriverReview: ["Rabe – UX-Review der Fahrer-App", ""],
    meadowClaims: ["Wiesental – Neugestaltung der Schadenmeldung", "Bei Julia Kramer zum Angebot nachfassen"],
    meadowAccessibility: ["Wiesental – Barrierefreiheits-Review des Kundenbereichs", ""],
    quillOnboarding: ["Feder & Konto – Prototyp für das App-Onboarding", "Umfang mit Nina Hartmann telefonisch klären"],
    fernhillTariff: ["Sonnenhang – Tarifvergleich auf der Website", "Sebastian Ott mögliche Starttermine nennen"],
    atlasRider: ["Nordlicht – Redesign der Fahrgast-App", ""],
    juniperRefresh: ["Wacholder – Auffrischung des Reiseplaners", "Andreas Roth nach aktuellen Nutzungszahlen fragen"],
  },
  tasks: {
    walkthroughPrep: "Durchsprache des Phase-2-Angebots für Katrin Vogt vorbereiten",
    scopeOptions: "Zwei Umfangsvarianten für das Mobile-Review ausarbeiten",
    kickoffAgenda: "Agenda für den Kick-off-Workshop entwerfen",
    followUpLaura: "Bei Julia Kramer zum Angebot Schadenmeldung nachfassen",
    replySam: "Anfrage von Sebastian Ott mit möglichen Startterminen beantworten",
    reviewQuillScreens: "Aktuelle Onboarding-Screens von Feder & Konto sichten",
    testimonial: "Katrin Vogt um ein kurzes Referenzzitat bitten",
    caseStudy: "Fallstudie zum Barrierefreiheits-Review für das Portfolio schreiben",
    corvidCheckIn: "Quartalsgespräch mit Stefan Brandt führen",
  },
  views: {
    clients: "Kundenliste",
    pipeline: "Anfragen nach Phase",
    nextActions: "Nächste Schritte",
    allContacts: "Alle Kontakte",
    openTasks: "Offene Aufgaben",
    taskBoard: "Aufgaben nach Status",
  },
  widgets: {
    openValue: "Offener Projektwert",
    weighted: "Gewichteter offener Wert",
    ongoingClients: "Laufende Kunden",
    openTasks: "Offene Aufgaben",
    byStage: "Offener Wert nach Phase",
    byWorkType: "Anfragen nach Art der Arbeit",
    bySource: "Anfragen nach Herkunft",
    activity: "Letzte Aktivitäten",
  },
  wiki: {
    guide: {
      title: "Arbeitsleitfaden",
      markdown: [
        "Max Bergmann arbeitet allein als UX- und Produktdesigner für wenige B2B-Kunden, die meisten davon seit mehreren Jahren. Dieser Arbeitsbereich enthält Demodaten; alle Unternehmen und Personen sind frei erfunden.",
        "",
        "## Was in diesem Arbeitsbereich steht",
        "- **Kunden** sind die Unternehmen, für die ich arbeite oder mit denen ich spreche. Die Kundenliste zeigt, seit wann wir zusammenarbeiten, wie eng die Zusammenarbeit ist, das letzte Projekt und den nächsten Schritt.",
        "- **Kontakte** sind meine Ansprechpersonen bei diesen Kunden.",
        "- **Projektanfragen** sind mögliche Projekte, von der ersten Anfrage bis zur abgeschlossenen Arbeit. Der Wert ist meine Schätzung für das Projekt; der gewichtete Wert ist diese Schätzung mal der Wahrscheinlichkeit der Phase.",
        "- **Aufgaben** sind Dinge, die ich zugesagt habe, mit Fälligkeitsdatum. Aufgaben, nächste Schritte und ihre Daten sind normale Felder: Niemand wird automatisch daran erinnert, deshalb schaue ich jeden Morgen in die Ansicht Nächste Schritte.",
        "- Eine E-Mail oder ein WhatsApp-Chat gehört nur dann zu einem Kunden oder einer Projektanfrage, wenn ich ihn dort verknüpfe.",
        "",
        "## Was woanders bleibt",
        "- Abrechnung und Buchhaltung bleiben in den Programmen, die ich schon nutze. Hier stehen die Kundenbeziehungen und die offene Arbeit.",
      ],
    },
    stages: {
      title: "Phasen einer Projektanfrage",
      markdown: [
        "Jede Projektanfrage durchläuft dieselben sechs Phasen, damit die Tafel auf einen Blick zeigt, wo ein mögliches Projekt steht.",
        "",
        "## Phasen",
        "1. **Anfrage:** Jemand fragt nach einem Projekt. Kunde, Ansprechperson und einen groben Wert anlegen.",
        "2. **Erstgespräch:** Wir haben über Ziele, Zeitrahmen und Entscheider gesprochen.",
        "3. **Angebot gesendet:** Umfang und meine Schätzung sind per E-Mail raus.",
        "4. **Zugesagt:** Der Kunde hat zugesagt, die Arbeit ist eingeplant.",
        "5. **Abgeschlossen:** Die Arbeit ist erledigt. Das letzte Projekt beim Kunden aktualisieren.",
        "6. **Verloren:** Der Kunde hat sich dagegen entschieden oder meldet sich nicht mehr. Den Grund in den Notizen festhalten.",
      ],
    },
    afterConversation: {
      title: "Nach einem Erstgespräch",
      whenToUse: "Wenn das erste Telefonat oder Treffen zu einem neuen Projekt stattgefunden hat.",
      markdown: [
        "Nach einem Erstgespräch gibt es Notizen, eine genauere Schätzung und eine Zusage, sich zu melden. Diese Schritte halten alles bei der Projektanfrage fest.",
        "",
        "## Schritte",
        "1. Ziele, Zeitrahmen und offene Fragen in die Notizen der Projektanfrage schreiben.",
        "2. Die Projektanfrage auf Erstgespräch setzen und den geschätzten Wert anpassen.",
        "3. Nächsten Schritt und Datum bei der Projektanfrage und beim Kunden eintragen.",
        "4. Die E-Mail oder den WhatsApp-Chat mit dem Kunden mit der Projektanfrage verknüpfen.",
      ],
    },
  },
  threads: {
    tidewaterProposal: {
      subject: "Redesign Analyse-Dashboard – Angebot Phase 2",
      messages: [
        "Hallo Herr Bergmann,\n\ndanke für das Angebot zur Phase 2. Herr Petersen und ich haben es gestern gelesen. Können wir den Research-Teil gemeinsam durchgehen? Wir sind nicht sicher, ob wir wieder fünf Interviews brauchen.\n\nViele Grüße\nKatrin Vogt",
        "Hallo Frau Vogt,\n\ngern. Donnerstag um 10 Uhr passt mir. Ich zeige Ihnen, wo drei Interviews reichen würden und was dabei wegfiele.\n\nViele Grüße\nMax Bergmann",
        "Dann Donnerstag um 10 Uhr. Herr Petersen ist auch dabei.",
      ],
    },
    brightpathKickoff: {
      messages: [
        "Hallo Max! Tobias und ich halten uns Dienstagvormittag für den Kick-off frei. Passt dir 9:30 Uhr?",
        "Hallo Miriam, 9:30 Uhr passt. Die Agenda schicke ich dir am Freitag.",
        "Super. Können wir uns auch die Ergebnisse der alten Onboarding-Umfrage ansehen? Tobias hat sie gefunden.",
      ],
    },
    fernhillInquiry: {
      subject: "Anfrage: UX für unseren Tarifvergleich",
      messages: [
        "Sehr geehrter Herr Bergmann,\n\nüber eine Kollegin bei der Wiesental Versicherung sind wir auf Ihr Portfolio gestoßen. Auf unserem Tarifvergleich brechen viele Besucher im zweiten Schritt ab. Wir wünschen uns einen Blick von außen und eine Neugestaltung.\n\nHätten Sie in den nächsten zwei Monaten Kapazität?\n\nMit freundlichen Grüßen\nSebastian Ott\nSonnenhang Energie",
        "Sehr geehrter Herr Ott,\n\nvielen Dank für Ihre Anfrage. Ja, ich kann in der zweiten Hälfte des nächsten Monats beginnen. Bevor ich einen Umfang vorschlage: Könnten Sie mir die aktuelle Seite und die Abbruchquoten pro Schritt schicken?\n\nMit freundlichen Grüßen\nMax Bergmann",
      ],
    },
    meadowQuestions: {
      subject: "Angebot Schadenmeldung – Rückfragen",
      messages: [
        "Hallo Herr Bergmann,\n\nunsere Rechtsabteilung möchte das neue Formular prüfen, bevor es live geht. Können Sie in der zweiten Woche eine Abstimmungsrunde mit ihr einplanen?\n\nDanke und viele Grüße\nJulia Kramer",
        "Hallo Frau Kramer,\n\nselbstverständlich. Ich nehme in Woche zwei eine Abstimmungsrunde mit der Rechtsabteilung auf und verschiebe den Usability-Test in Woche drei. Das angepasste Angebot schicke ich Ihnen morgen.\n\nViele Grüße\nMax Bergmann",
      ],
    },
    corvidCheckIn: {
      subject: "Fahrer-App – wie läuft es?",
      messages: [
        "Hallo Herr Brandt,\n\ndas Review der Fahrer-App ist jetzt zwei Monate her. Wie kommen Ihre Fahrer mit den Änderungen an der Zustellansicht zurecht?\n\nViele Grüße\nMax Bergmann",
        "Hallo Herr Bergmann,\n\ngutes Timing. Die Support-Anfragen zu verpassten Stopps sind um ein Drittel gesunken. Herr Weiß möchte im nächsten Quartal über die Disponentenansicht sprechen, ich setze ihn in Kopie.\n\nViele Grüße\nStefan Brandt",
      ],
    },
    quillScope: {
      subject: "Prototyp Onboarding – nächster Schritt",
      messages: [
        "Hallo Herr Bergmann,\n\nschön, dass wir letzte Woche gesprochen haben. Bevor wir zusagen, möchten wir den Umfang klären: nur die Registrierung oder auch die erste Kontoverbindung?\n\nViele Grüße\nNina Hartmann",
        "Hallo Frau Hartmann,\n\nich würde Registrierung und erste Kontoverbindung zusammen angehen, weil die meisten Nutzer genau dazwischen abspringen. Sollen wir das am Montag kurz telefonisch klären?\n\nViele Grüße\nMax Bergmann",
      ],
    },
  },
};

const ORGANIZATION_FACTS: Record<
  OrganizationKey,
  {
    relationship: string;
    since?: number;
    next?: number;
    createdDaysAgo: number;
    history?: Array<{ daysAgo: number; relationship: string }>;
  }
> = {
  tidewater: { relationship: "ongoing", since: -540, next: 3, createdDaysAgo: 545 },
  brightpath: {
    relationship: "ongoing",
    since: -420,
    next: 5,
    createdDaysAgo: 425,
    history: [{ daysAgo: 300, relationship: "new" }],
  },
  corvid: { relationship: "occasional", since: -110, next: 10, createdDaysAgo: 115 },
  meadow: { relationship: "occasional", since: -290, next: 1, createdDaysAgo: 305 },
  quill: { relationship: "new", next: 4, createdDaysAgo: 20 },
  fernhill: { relationship: "new", next: 1, createdDaysAgo: 2 },
  atlas: { relationship: "new", createdDaysAgo: 92 },
  juniper: { relationship: "occasional", since: -760, next: 6, createdDaysAgo: 400 },
};

const CONTACT_FACTS: Record<
  ContactKey,
  { organization: OrganizationKey; createdDaysAgo: number; whatsapp?: boolean; avatar?: Parameters<typeof photo>[0] }
> = {
  priya: { organization: "tidewater", createdDaysAgo: 540, avatar: "leila-chen" },
  marcus: { organization: "tidewater", createdDaysAgo: 200 },
  rachel: { organization: "brightpath", createdDaysAgo: 420, whatsapp: true, avatar: "mia-schneider" },
  tom: { organization: "brightpath", createdDaysAgo: 30, avatar: "tim-weber" },
  dan: { organization: "corvid", createdDaysAgo: 112, avatar: "paul-koch" },
  chris: { organization: "corvid", createdDaysAgo: 100 },
  laura: { organization: "meadow", createdDaysAgo: 302, avatar: "lea-bauer" },
  kevin: { organization: "meadow", createdDaysAgo: 24 },
  nina: { organization: "quill", createdDaysAgo: 19, avatar: "sophie-wagner" },
  sam: { organization: "fernhill", createdDaysAgo: 2, avatar: "jonas-weber" },
  jenna: { organization: "atlas", createdDaysAgo: 90 },
  alex: { organization: "juniper", createdDaysAgo: 400 },
};

type DealFacts = {
  organization: OrganizationKey;
  contacts: ContactKey[];
  stage: string;
  value: number;
  workType: string;
  source: string;
  createdDaysAgo: number;
  decision: number;
  next?: number;
  /** Stage changes as `[daysAgo, previous stage]`, oldest first. */
  moves?: Array<[number, string]>;
};

const DEAL_FACTS: Record<DealKey, DealFacts> = {
  tidewaterDashboard: {
    organization: "tidewater",
    contacts: ["priya", "marcus"],
    stage: "proposal",
    value: 14000,
    workType: "productDesign",
    source: "repeat",
    createdDaysAgo: 40,
    decision: 14,
    next: 3,
    moves: [
      [30, "inquiry"],
      [8, "firstConversation"],
    ],
  },
  tidewaterDesignSystem: {
    organization: "tidewater",
    contacts: ["priya"],
    stage: "closed",
    value: 6500,
    workType: "designSystem",
    source: "repeat",
    createdDaysAgo: 190,
    decision: -160,
    moves: [
      [180, "inquiry"],
      [170, "firstConversation"],
      [160, "proposal"],
      [120, "accepted"],
    ],
  },
  brightpathOnboarding: {
    organization: "brightpath",
    contacts: ["rachel", "tom"],
    stage: "accepted",
    value: 9800,
    workType: "productDesign",
    source: "repeat",
    createdDaysAgo: 35,
    decision: -6,
    next: 5,
    moves: [
      [28, "inquiry"],
      [18, "firstConversation"],
      [6, "proposal"],
    ],
  },
  brightpathMobile: {
    organization: "brightpath",
    contacts: ["tom"],
    stage: "firstConversation",
    value: 4200,
    workType: "review",
    source: "repeat",
    createdDaysAgo: 12,
    decision: 20,
    next: 2,
    moves: [[5, "inquiry"]],
  },
  brightpathCatalog: {
    organization: "brightpath",
    contacts: ["rachel"],
    stage: "closed",
    value: 12500,
    workType: "productDesign",
    source: "referral",
    createdDaysAgo: 420,
    decision: -380,
    moves: [
      [400, "inquiry"],
      [380, "proposal"],
      [300, "accepted"],
    ],
  },
  corvidDriverReview: {
    organization: "corvid",
    contacts: ["dan", "chris"],
    stage: "closed",
    value: 5400,
    workType: "review",
    source: "network",
    createdDaysAgo: 110,
    decision: -95,
    moves: [
      [100, "inquiry"],
      [95, "proposal"],
      [60, "accepted"],
    ],
  },
  meadowClaims: {
    organization: "meadow",
    contacts: ["laura", "kevin"],
    stage: "proposal",
    value: 11500,
    workType: "productDesign",
    source: "repeat",
    createdDaysAgo: 25,
    decision: 10,
    next: 1,
    moves: [
      [20, "inquiry"],
      [9, "firstConversation"],
    ],
  },
  meadowAccessibility: {
    organization: "meadow",
    contacts: ["laura"],
    stage: "closed",
    value: 4800,
    workType: "review",
    source: "website",
    createdDaysAgo: 300,
    decision: -285,
    moves: [
      [295, "inquiry"],
      [285, "proposal"],
      [240, "accepted"],
    ],
  },
  quillOnboarding: {
    organization: "quill",
    contacts: ["nina"],
    stage: "firstConversation",
    value: 7000,
    workType: "productDesign",
    source: "referral",
    createdDaysAgo: 18,
    decision: 25,
    next: 4,
    moves: [[7, "inquiry"]],
  },
  fernhillTariff: {
    organization: "fernhill",
    contacts: ["sam"],
    stage: "inquiry",
    value: 6000,
    workType: "research",
    source: "referral",
    createdDaysAgo: 2,
    decision: 30,
    next: 1,
  },
  atlasRider: {
    organization: "atlas",
    contacts: ["jenna"],
    stage: "lost",
    value: 18000,
    workType: "productDesign",
    source: "network",
    createdDaysAgo: 90,
    decision: -40,
    moves: [
      [80, "inquiry"],
      [60, "firstConversation"],
      [40, "proposal"],
    ],
  },
  juniperRefresh: {
    organization: "juniper",
    contacts: ["alex"],
    stage: "inquiry",
    value: 3500,
    workType: "review",
    source: "repeat",
    createdDaysAgo: 6,
    decision: 30,
    next: 6,
  },
};

const TASK_FACTS: Record<
  TaskKey,
  {
    status: string;
    due: number;
    deal?: DealKey;
    organization?: OrganizationKey;
    contact?: ContactKey;
    createdDaysAgo: number;
    done?: number;
  }
> = {
  walkthroughPrep: { status: "open", due: 2, deal: "tidewaterDashboard", contact: "priya", createdDaysAgo: 5 },
  scopeOptions: { status: "inProgress", due: 2, deal: "brightpathMobile", contact: "tom", createdDaysAgo: 4 },
  kickoffAgenda: { status: "open", due: 4, deal: "brightpathOnboarding", contact: "rachel", createdDaysAgo: 6 },
  followUpLaura: { status: "open", due: 1, deal: "meadowClaims", contact: "laura", createdDaysAgo: 3 },
  replySam: { status: "inProgress", due: 1, deal: "fernhillTariff", contact: "sam", createdDaysAgo: 1 },
  reviewQuillScreens: { status: "open", due: 3, deal: "quillOnboarding", contact: "nina", createdDaysAgo: 2 },
  testimonial: { status: "done", due: -10, organization: "tidewater", contact: "priya", createdDaysAgo: 30, done: 9 },
  caseStudy: { status: "onHold", due: 14, deal: "meadowAccessibility", createdDaysAgo: 60 },
  corvidCheckIn: { status: "open", due: 10, organization: "corvid", contact: "dan", createdDaysAgo: 8 },
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
  id: "freelancers",
  strings: { en, de },
  build: (t) => {
    const phone = (index: number) => phoneNumber(t.phones.mobile, index);
    const open = ["inquiry", "firstConversation", "proposal"];
    const active = [...open, "accepted"];
    const label = <K extends string>(
      options: Record<K, string>,
      colors: Record<K, "default" | "secondary" | "destructive" | "success" | "warning" | "info">,
    ) => (Object.keys(options) as K[]).map((key) => ({ key, label: options[key], color: colors[key] }));

    const organization: RecordSpec[] = ORGANIZATIONS.map((key) => {
      const facts = ORGANIZATION_FACTS[key];
      const [name, city, domain, lastProject, nextAction] = t.organizations[key];
      return {
        key,
        values: {
          name,
          relationship: facts.relationship,
          city,
          website: `https://${domain}`,
          ...(facts.since === undefined ? {} : { clientSince: day(facts.since), lastProject }),
          ...(facts.next === undefined ? {} : { nextAction, nextActionDate: day(facts.next) }),
        },
        owner: "maxBergmann",
        channels: { email: `hello@${domain}` },
        createdDaysAgo: facts.createdDaysAgo,
        ...(facts.history
          ? {
              history: facts.history.map((change) => ({
                daysAgo: change.daysAgo,
                previous: { relationship: change.relationship },
              })),
            }
          : {}),
      };
    });
    const contact: RecordSpec[] = CONTACTS.map((key, index) => {
      const facts = CONTACT_FACTS[key];
      const [firstName, lastName, jobTitle] = t.contacts[key];
      const domain = t.organizations[facts.organization][2];
      const mobile = phone(index);
      return {
        key,
        values: { firstName, lastName, jobTitle, phone: mobile },
        links: { "contact.organizations": facts.organization },
        owner: "maxBergmann",
        channels: {
          email: `${mailbox(firstName)}.${mailbox(lastName)}@${domain}`,
          ...(facts.whatsapp ? { phone: mobile } : {}),
        },
        ...(facts.avatar ? { avatar: photo(facts.avatar) } : {}),
        createdDaysAgo: facts.createdDaysAgo,
      };
    });
    const deal: RecordSpec[] = DEALS.map((key) => {
      const facts = DEAL_FACTS[key];
      const [name, nextAction] = t.deals[key];
      return {
        key,
        values: {
          name,
          stage: facts.stage,
          totalValue: facts.value,
          workType: facts.workType,
          source: facts.source,
          decisionDate: day(facts.decision),
          ...(facts.next === undefined ? {} : { nextAction, nextActionDate: day(facts.next) }),
        },
        links: { "deal.organizations": facts.organization, "deal.contacts": facts.contacts },
        owner: "maxBergmann",
        createdDaysAgo: facts.createdDaysAgo,
        ...(facts.moves
          ? { history: facts.moves.map(([daysAgo, previous]) => ({ daysAgo, previous: { stage: previous } })) }
          : {}),
      };
    });
    const task: RecordSpec[] = TASKS.map((key) => {
      const facts = TASK_FACTS[key];
      const organizationKey = organizationOf(facts);
      return {
        key,
        values: { name: t.tasks[key], status: facts.status, dueDate: day(facts.due) },
        links: {
          ...(facts.deal ? { "task.deals": facts.deal } : {}),
          ...(organizationKey ? { "task.organizations": organizationKey } : {}),
          ...(facts.contact ? { "task.contacts": facts.contact } : {}),
        },
        owner: "maxBergmann",
        createdDaysAgo: facts.createdDaysAgo,
        ...(facts.done === undefined ? {} : { history: [{ daysAgo: facts.done, previous: { status: "open" } }] }),
      };
    });

    const thread = t.threads;
    return {
      companyName: t.company,
      lists: (["organization", "contact", "deal", "task"] as const).map((key) => ({
        key,
        label: t.lists[key][0],
        pluralLabel: t.lists[key][1],
        description: t.lists[key][2],
        icon: { organization: "building", contact: "contact", deal: "handshake", task: "check" }[key],
      })),
      fields: [
        {
          key: "organization.relationship",
          label: t.fields.relationship,
          type: "select",
          options: label(t.options.relationship, { ongoing: "success", occasional: "info", new: "warning" }),
        },
        { key: "organization.clientSince", label: t.fields.clientSince, type: "date" },
        { key: "organization.lastProject", label: t.fields.lastProject, type: "text" },
        { key: "organization.nextAction", label: t.fields.nextAction, type: "text" },
        { key: "organization.nextActionDate", label: t.fields.nextActionDate, type: "date" },
        { key: "organization.city", label: t.fields.city, type: "text" },
        { key: "organization.website", label: t.fields.website, type: "url" },
        { key: "contact.jobTitle", label: t.fields.jobTitle, type: "text" },
        { key: "contact.phone", label: t.fields.phone, type: "phone" },
        {
          key: "deal.workType",
          label: t.fields.workType,
          type: "select",
          options: label(t.options.workType, {
            research: "info",
            productDesign: "success",
            designSystem: "secondary",
            review: "warning",
          }),
        },
        {
          key: "deal.source",
          label: t.fields.source,
          type: "select",
          options: label(t.options.source, {
            repeat: "success",
            referral: "info",
            website: "secondary",
            network: "warning",
          }),
        },
        { key: "deal.decisionDate", label: t.fields.decisionDate, type: "date" },
        { key: "deal.nextAction", label: t.fields.nextAction, type: "text" },
        { key: "deal.nextActionDate", label: t.fields.nextActionDate, type: "date" },
        { key: "task.dueDate", label: t.fields.dueDate, type: "date" },
      ],
      stages: [
        { key: "inquiry", label: t.stages.inquiry, color: "secondary", probability: 10 },
        { key: "firstConversation", label: t.stages.firstConversation, color: "info", probability: 30 },
        { key: "proposal", label: t.stages.proposal, color: "warning", probability: 60 },
        { key: "accepted", label: t.stages.accepted, color: "success", probability: 100 },
        { key: "closed", label: t.stages.closed, color: "default", probability: 100 },
        { key: "lost", label: t.stages.lost, color: "destructive", probability: 0 },
      ],
      records: { organization, contact, deal, task },
      views: [
        {
          key: "clients",
          list: "organization",
          name: t.views.clients,
          mode: "table",
          columns: [
            "relationship",
            "clientSince",
            "lastProject",
            "nextAction",
            "nextActionDate",
            "contact.organizations",
          ],
          sort: { field: "clientSince", direction: "asc" },
        },
        {
          key: "pipeline",
          list: "deal",
          name: t.views.pipeline,
          mode: "board",
          groupBy: "stage",
          columns: ["totalValue", "deal.organizations", "nextActionDate"],
          filters: [{ field: "stage", notIn: ["lost"] }],
        },
        {
          key: "nextActions",
          list: "deal",
          name: t.views.nextActions,
          mode: "table",
          columns: ["stage", "nextAction", "nextActionDate", "totalValue", "deal.organizations"],
          filters: [{ field: "stage", in: active }],
          sort: { field: "nextActionDate", direction: "asc" },
        },
        {
          key: "allContacts",
          list: "contact",
          name: t.views.allContacts,
          mode: "table",
          columns: ["jobTitle", "contact.organizations", "phone", "capability.identity"],
        },
        {
          key: "openTasks",
          list: "task",
          name: t.views.openTasks,
          mode: "table",
          columns: ["dueDate", "status", "task.deals", "task.organizations"],
          filters: [{ field: "status", notIn: ["done", "archived"] }],
          sort: { field: "dueDate", direction: "asc" },
        },
        {
          key: "taskBoard",
          list: "task",
          name: t.views.taskBoard,
          mode: "board",
          groupBy: "status",
          columns: ["dueDate", "task.deals"],
          filters: [{ field: "status", notIn: ["archived"] }],
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
            title: t.widgets.ongoingClients,
            list: "organization",
            aggregation: "count",
            filters: [{ field: "relationship", in: ["ongoing"] }],
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
            filters: [{ field: "stage", in: active }],
            width: 6,
          },
          {
            kind: "chart",
            title: t.widgets.byWorkType,
            display: DisplayType.doughnutChart,
            list: "deal",
            aggregation: "count",
            groupBy: { field: "workType" },
            width: 6,
          },
          {
            kind: "chart",
            title: t.widgets.bySource,
            display: DisplayType.horizontalBarChartWithLabels,
            list: "deal",
            aggregation: "count",
            groupBy: { field: "source" },
            width: 6,
          },
          { kind: "activity", title: t.widgets.activity },
        ],
      },
      wiki: [
        { key: "guide", kind: "guide", title: t.wiki.guide.title, markdown: t.wiki.guide.markdown },
        { key: "stages", kind: "knowledge", title: t.wiki.stages.title, markdown: t.wiki.stages.markdown },
        {
          key: "afterConversation",
          kind: "procedure",
          title: t.wiki.afterConversation.title,
          whenToUse: t.wiki.afterConversation.whenToUse,
          markdown: t.wiki.afterConversation.markdown,
        },
      ],
      messaging: {
        accounts: ["google", "whatsapp"],
        selfTitle: t.selfTitle,
        website: t.website,
        threads: [
          {
            account: "google",
            with: ["priya"],
            subject: thread.tidewaterProposal.subject,
            state: "open",
            latestMinutesAgo: 3 * 60,
            messages: [
              { from: "priya", text: thread.tidewaterProposal.messages[0] },
              { from: "self", text: thread.tidewaterProposal.messages[1] },
              { from: "priya", text: thread.tidewaterProposal.messages[2] },
            ],
            links: ["deal:tidewaterDashboard", "organization:tidewater"],
          },
          {
            account: "whatsapp",
            with: ["rachel"],
            state: "unread",
            latestMinutesAgo: 40,
            messages: [
              { from: "rachel", text: thread.brightpathKickoff.messages[0] },
              { from: "self", text: thread.brightpathKickoff.messages[1], reaction: { from: "rachel", value: "👍" } },
              { from: "rachel", text: thread.brightpathKickoff.messages[2] },
            ],
            links: ["deal:brightpathOnboarding", "organization:brightpath"],
          },
          {
            account: "google",
            with: ["sam"],
            subject: thread.fernhillInquiry.subject,
            state: "unread",
            latestMinutesAgo: 90,
            messages: [
              { from: "sam", text: thread.fernhillInquiry.messages[0] },
              { from: "self", text: thread.fernhillInquiry.messages[1], draft: true },
            ],
            links: ["deal:fernhillTariff", "organization:fernhill"],
          },
          {
            account: "google",
            with: ["laura"],
            subject: thread.meadowQuestions.subject,
            state: "open",
            latestMinutesAgo: 26 * 60,
            messages: [
              { from: "laura", text: thread.meadowQuestions.messages[0] },
              { from: "self", text: thread.meadowQuestions.messages[1] },
            ],
            links: ["deal:meadowClaims"],
          },
          {
            account: "google",
            with: ["nina"],
            subject: thread.quillScope.subject,
            state: "open",
            latestMinutesAgo: 2 * 24 * 60,
            messages: [
              { from: "nina", text: thread.quillScope.messages[0] },
              { from: "self", text: thread.quillScope.messages[1] },
            ],
            links: ["deal:quillOnboarding", "organization:quill"],
          },
          {
            account: "google",
            with: ["dan"],
            subject: thread.corvidCheckIn.subject,
            state: "open",
            latestMinutesAgo: 3 * 24 * 60,
            messages: [
              { from: "self", text: thread.corvidCheckIn.messages[0] },
              { from: "dan", text: thread.corvidCheckIn.messages[1] },
            ],
            links: ["organization:corvid"],
          },
        ],
      },
    };
  },
});
