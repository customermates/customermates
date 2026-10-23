import { DisplayType } from "@/features/widget/widget-display.schema";

import { day, defineSolution, photo, type FieldInput, type RecordSpec, phoneNumber } from "../define-solution";

/**
 * Client management: an office coffee, breakroom and catering service that looks after many ongoing client
 * relationships. Each client record carries structured details (client since, segment, account manager, preferred
 * channel, contract review date, services used, number of sites) and links its people, opportunities, tasks and the
 * conversations someone linked to it. The flagship client has four contacts, two opportunities, tasks and two linked
 * conversations. Tasks and next-step dates are ordinary fields; nothing reminds anyone automatically.
 */

const ORGANIZATIONS = [
  "halverson",
  "meridian",
  "oakfield",
  "brightside",
  "larkspur",
  "riverbend",
  "tallis",
  "greystone",
  "juniper",
  "westmoor",
  "ashcombe",
  "kingsley",
] as const;
type OrganizationKey = (typeof ORGANIZATIONS)[number];
const CONTACTS = [
  "diane",
  "tom",
  "priya",
  "greg",
  "karen",
  "sam",
  "laura",
  "marcus",
  "helen",
  "patrick",
  "nina",
  "josh",
  "beth",
  "owen",
  "carl",
  "anita",
  "zoe",
  "frank",
  "lisa",
] as const;
type ContactKey = (typeof CONTACTS)[number];
const DEALS = [
  "halversonRenewal",
  "halversonSecondSite",
  "meridianCatering",
  "oakfieldWater",
  "brightsideCoffee",
  "larkspurStart",
  "riverbendBranches",
  "riverbendRenewal",
  "tallisOffice",
  "greystoneStart",
  "juniperFruit",
  "westmoorCanteen",
  "ashcombeRenewal",
  "kingsleyPilot",
] as const;
type DealKey = (typeof DEALS)[number];
const TASKS = [
  "prepareReview",
  "secondSiteTasting",
  "updateSiteCount",
  "descaleMachines",
  "meridianMenu",
  "riverbendOffer",
  "westmoorVisit",
  "westmoorOptions",
  "kingsleyCall",
  "ashcombeCheckIn",
  "larkspurCall",
  "brightsideReview",
  "tallisOnboarding",
] as const;
type TaskKey = (typeof TASKS)[number];
type ServiceUsedKey =
  | "coffeeMachines"
  | "breakroomSupplies"
  | "meetingCatering"
  | "freshFruit"
  | "waterDispensers"
  | "eventCatering";

const en = {
  company: "Hollis Office Services",
  website: "https://hollis-office.example",
  phones: {
    mobile: { templates: ["+1 202 555 01##"], start: 0 },
    office: { templates: ["+1 614 555 01##", "+1 380 555 01##"], start: 40 },
  },
  selfTitle: "Owner and account manager",
  lists: {
    organization: ["Client", "Clients", "Offices and sites we look after or talk to."],
    contact: ["Contact", "Contacts", "People at our clients: who decides, who orders, who signs."],
    deal: ["Opportunity", "Opportunities", "New sites, extra services and yearly reviews we are discussing."],
    task: ["Task", "Tasks", "Next actions with an owner and a due date."],
  },
  fields: {
    segment: "Segment",
    city: "City",
    website: "Website",
    sites: "Sites",
    clientSince: "Client since",
    accountManager: "Account manager",
    preferredChannel: "Preferred channel",
    contractReviewDate: "Contract review date",
    servicesUsed: "Services used",
    jobTitle: "Job title",
    phone: "Phone",
    opportunityType: "Opportunity type",
    decisionDate: "Expected decision",
    nextStep: "Next step",
    nextStepDate: "Next step date",
    dueDate: "Due date",
    priority: "Priority",
    clientStatus: "Client status",
    annualValue: "Annual value",
    lastContact: "Last contact",
  },
  options: {
    segment: {
      smallOffice: "Small office (under 50)",
      midsize: "Mid-size office (50–250)",
      largeSite: "Large site (250+)",
      coworking: "Coworking space",
    },
    preferredChannel: { email: "Email", phone: "Phone", whatsapp: "WhatsApp" },
    servicesUsed: {
      coffeeMachines: "Coffee machines",
      breakroomSupplies: "Breakroom supplies",
      meetingCatering: "Meeting catering",
      freshFruit: "Fresh fruit",
      waterDispensers: "Water dispensers",
      eventCatering: "Event catering",
    } satisfies Record<ServiceUsedKey, string>,
    opportunityType: { newClient: "New client", expansion: "Extra site or service", renewal: "Yearly review" },
    priority: { low: "Low", medium: "Medium", high: "High" },
    clientStatus: { active: "Active client", prospect: "Prospect", paused: "Paused" },
  },
  stages: {
    newRelationship: "New relationship",
    activeDiscussion: "Active discussion",
    customer: "Customer",
    dormant: "Dormant",
  },
  organizations: {
    halverson: ["Halverson Engineering Group", "Columbus"],
    meridian: ["Meridian Insurance Partners", "Dublin"],
    oakfield: ["Oakfield Dental Group", "Worthington"],
    brightside: ["Brightside Coworking", "Columbus"],
    larkspur: ["Larkspur Law", "Columbus"],
    riverbend: ["Riverbend Credit Union", "Westerville"],
    tallis: ["Tallis Software", "Columbus"],
    greystone: ["Greystone Property Management", "Grandview Heights"],
    juniper: ["Juniper Architecture Studio", "Columbus"],
    westmoor: ["Westmoor Logistics Park", "Grove City"],
    ashcombe: ["Ashcombe Media", "Columbus"],
    kingsley: ["Kingsley Medical Center", "Delaware"],
  } satisfies Record<OrganizationKey, readonly [string, string]>,
  contacts: {
    diane: ["Diane", "Mercer", "Managing partner"],
    tom: ["Tom", "Okafor", "Office manager"],
    priya: ["Priya", "Nair", "Site coordinator, Cincinnati office"],
    greg: ["Greg", "Lawson", "Finance director"],
    karen: ["Karen", "Doyle", "Head of workplace"],
    sam: ["Sam", "Whitaker", "Office administrator"],
    laura: ["Laura", "Chen", "Practice manager"],
    marcus: ["Marcus", "Reid", "Community manager"],
    helen: ["Helen", "Ward", "Office manager"],
    patrick: ["Patrick", "Quinn", "Facilities manager"],
    nina: ["Nina", "Alvarez", "Executive assistant"],
    josh: ["Josh", "Turner", "People and culture lead"],
    beth: ["Beth", "Holloway", "Operations manager"],
    owen: ["Owen", "Price", "Studio manager"],
    carl: ["Carl", "Jensen", "Site manager"],
    anita: ["Anita", "Shah", "HR manager"],
    zoe: ["Zoe", "Bennett", "Office coordinator"],
    frank: ["Frank", "Morales", "Head of facilities"],
    lisa: ["Lisa", "Grant", "Procurement lead"],
  } satisfies Record<ContactKey, readonly [string, string, string]>,
  deals: {
    halversonRenewal: [
      "Halverson – yearly review for all three sites",
      "Walk Diane and Greg through the yearly review",
    ],
    halversonSecondSite: [
      "Halverson – coffee and supplies for the Cincinnati office",
      "Taste test with Priya's team in Cincinnati",
    ],
    meridianCatering: ["Meridian – catering for client meetings", "Send Karen two lunch menus"],
    oakfieldWater: ["Oakfield Dental – water dispensers for both practices", "Running since spring"],
    brightsideCoffee: ["Brightside Coworking – coffee bar and supplies", "Running, review in December"],
    larkspurStart: ["Larkspur Law – first coffee machine", "Call Helen about the kitchen size"],
    riverbendBranches: ["Riverbend – coffee for the four branches", "Send Patrick the offer per branch"],
    riverbendRenewal: ["Riverbend – head office service", "Running since last year"],
    tallisOffice: ["Tallis Software – office coffee and fruit", "Running since August"],
    greystoneStart: ["Greystone – breakroom supplies", "Ask Beth for the headcount"],
    juniperFruit: ["Juniper Studio – weekly fruit", "Paused after the studio move"],
    westmoorCanteen: ["Westmoor – break areas for the warehouse shifts", "Present two options to Carl and Anita"],
    ashcombeRenewal: ["Ashcombe Media – coffee service", "Check in after the team change"],
    kingsleyPilot: ["Kingsley Medical – catering for staff meetings", "Intro call with Frank"],
  } satisfies Record<DealKey, readonly [string, string]>,
  tasks: {
    prepareReview: "Prepare the yearly review for Halverson (usage per site)",
    secondSiteTasting: "Bring two machines for the taste test in Cincinnati",
    updateSiteCount: "Add the Cincinnati office to the Halverson client record",
    descaleMachines: "Schedule descaling of the Columbus coffee machines at Halverson",
    meridianMenu: "Put together two lunch menus for Meridian",
    riverbendOffer: "Write the per-branch offer for Riverbend",
    westmoorVisit: "Walk the break areas at Westmoor with Carl",
    westmoorOptions: "Work out shift-friendly options for Westmoor",
    kingsleyCall: "Intro call with Frank at Kingsley Medical",
    ashcombeCheckIn: "Check in with Zoe at Ashcombe",
    larkspurCall: "Call Helen about the Larkspur kitchen",
    brightsideReview: "Prepare the Brightside contract review",
    tallisOnboarding: "First delivery and machine setup at Tallis",
  } satisfies Record<TaskKey, string>,
  views: {
    pipeline: "Opportunities by stage",
    nextSteps: "Next steps",
    clients: "Client details",
    contractReviews: "Upcoming contract reviews",
    allContacts: "All contacts",
    dueSoon: "Due soon",
  },
  widgets: {
    activeClients: "Active clients",
    annualValue: "Annual value of active clients",
    noContact: "No contact in 30 days",
    overdueTasks: "Overdue tasks",
    bySegment: "Clients by segment",
    byService: "Active clients by service",
    byStage: "Opportunity value by stage",
    reviewsByMonth: "Annual value up for review",
    activeDiscussions: "Active discussions by value",
  },
  wiki: {
    guide: {
      title: "Operating Guide",
      markdown: [
        "Hollis Office Services runs coffee machines, breakroom supplies, fresh fruit, water dispensers and meeting catering for offices around Columbus. This workspace is demo data; every company and person in it is fictional.",
        "",
        "## How we use the CRM",
        "- **Clients** are the offices and sites we look after or talk to. The client record holds the structured details: client since, segment, account manager, preferred channel, contract review date, services used and number of sites.",
        "- **Contacts** are the people at a client, each linked to their client.",
        "- **Opportunities** are new clients, extra sites or services and yearly reviews. The stage shows where the relationship is; the value is typed in by hand.",
        "- **Tasks** are next actions with an owner, a status and a due date. Tasks and the next step date on an opportunity are ordinary fields: nobody is reminded automatically, so check the Due soon and Next steps views every morning.",
        "- A conversation from the inbox belongs to a client or an opportunity only when someone links it there.",
        "",
        "## Working rules",
        "- Services a client uses go into the multiple-choice field **Services used**. We do not use tags.",
        "- Contracts, menus and delivery notes stay in our shared drive; records hold no file attachments.",
        "- Every open opportunity has a next step and a next step date.",
        "- Billing and delivery planning stay in their own tools.",
      ],
    },
    clientRecord: {
      title: "What a complete client record holds",
      markdown: [
        "A complete client record lets anyone on the team see at a glance what we deliver, where, and to whom.",
        "",
        "## A client is complete when",
        "- **Segment**, **Sites** and **Services used** are filled in, so the Client details view shows what we deliver where.",
        "- **Client since** and **Contract review date** are set for every paying client. The Upcoming contract reviews view is sorted by that date.",
        "- **Account manager** names the person who looks after the relationship, and **Preferred channel** says whether the client wants email, a call or WhatsApp.",
        "- At least the person who decides and the person who orders day to day are linked as contacts.",
        "- Open opportunities and the emails or chats about them are linked to the client.",
        "",
        "## Example",
        "Halverson Engineering Group is the example: four contacts, two opportunities, open tasks and two linked conversations.",
      ],
    },
    spreadsheetMove: {
      title: "Moving clients from a spreadsheet",
      whenToUse: "When a client list kept in a spreadsheet should move into the CRM.",
      markdown: [
        "A client list kept in a spreadsheet moves in through a manual import, one workbook per list, in a fixed order.",
        "",
        "## Steps",
        "1. Save the spreadsheet as an .xlsx workbook; CSV files are not imported.",
        "2. Remove duplicate rows and split the sheet into one workbook for clients and one for contacts.",
        "3. Import clients first: on **Clients**, open **More actions › Add from file**, map the columns to the fields and import.",
        "4. Import contacts next and map the company column to their client, so each person is linked.",
        "5. An import cannot be undone. Try ten rows first and check them before importing the rest.",
        "6. Fill in Services used, Contract review date and Account manager by hand where the sheet had no clean column.",
      ],
    },
  },
  threads: {
    halversonReview: {
      subject: "Yearly review – all three sites",
      messages: [
        "Hi Max,\n\nOur contract review is coming up next month. With Cincinnati added we now have three sites. Could you show us the usage per site before we meet? Greg would like to see the numbers.\n\nBest,\nDiane",
        "Hi Diane,\n\nOf course. I will put together coffee, supplies and catering per site for the last twelve months and send it ahead of the meeting.\n\nBest,\nMax",
        "Perfect. Thursday the 14th at 10 works for both of us.",
        "Thursday at 10 is in the calendar. I will bring the per-site overview and a suggestion for Cincinnati.",
      ],
    },
    halversonMachine: {
      messages: [
        "Hi Max, the machine on the second floor shows the descaling light again.",
        "Thanks Tom. I will send someone on Wednesday morning and descale all Columbus machines in one go.",
        "Great, the kitchen is free before 9.",
      ],
    },
    riverbendBranches: {
      subject: "Coffee and water for the branches",
      messages: [
        "Hello Max,\n\nThe head office team is happy with your service. Could you make us an offer for our four branches as well? Each has around 12 staff.\n\nRegards,\nPatrick Quinn",
        "Hello Patrick,\n\nThank you, glad to hear it. I will send an offer per branch by Friday, with one machine and a water dispenser each.\n\nBest regards,\nMax",
      ],
    },
    meridianCatering: {
      subject: "Lunch for client meetings",
      messages: [
        "Hi Max,\n\nWe host client meetings about twice a week. Could you offer a lunch option for up to 12 people?\n\nThanks,\nKaren",
        "Hi Karen,\n\nYes. I will send you two menus, one light and one warm, with prices per person.\n\nBest,\nMax",
      ],
    },
    brightsideOatMilk: {
      messages: [
        "Hey Max, members keep asking for oat milk at the coffee bar. Can you add it to the weekly delivery?",
        "Sure, Marcus. From next week there will be six cartons a week.",
      ],
    },
    kingsleyIntro: {
      subject: "Introduction – catering for staff meetings",
      messages: [
        "Dear Max,\n\nThe team at Oakfield Dental recommended you. We are looking for a caterer for our weekly staff meetings, around 30 people.\n\nWould you have time for a call next week?\n\nKind regards,\nFrank Morales",
        "Dear Frank,\n\nThank you for reaching out. I would be glad to. How about Tuesday at 2 pm?\n\nBest regards,\nMax",
      ],
    },
    tallisBreakfast: {
      messages: [
        "Hi Max! Could Friday's delivery include extra fruit? We have a team breakfast.",
        "Of course, Josh. I will add two extra fruit boxes on Friday.",
      ],
    },
  },
};

type Strings = typeof en;

const de: Strings = {
  company: "Bohnenhaus Büroservice",
  website: "https://bohnenhaus-bueroservice.example",
  phones: {
    mobile: { templates: ["+49 30 23125 0##"], start: 0 },
    office: { templates: ["+49 30 23125 4##"], start: 0 },
  },
  selfTitle: "Inhaber und Kundenbetreuer",
  lists: {
    organization: ["Kunde", "Kunden", "Büros und Standorte, die wir betreuen oder ansprechen."],
    contact: ["Kontakt", "Kontakte", "Menschen bei unseren Kunden: wer entscheidet, wer bestellt, wer unterschreibt."],
    deal: [
      "Verkaufschance",
      "Verkaufschancen",
      "Neue Standorte, zusätzliche Leistungen und Jahresgespräche, über die wir sprechen.",
    ],
    task: ["Aufgabe", "Aufgaben", "Nächste Schritte mit Verantwortlichen und Fälligkeitsdatum."],
  },
  fields: {
    segment: "Segment",
    city: "Ort",
    website: "Website",
    sites: "Standorte",
    clientSince: "Kunde seit",
    accountManager: "Kundenbetreuung",
    preferredChannel: "Bevorzugter Kanal",
    contractReviewDate: "Vertragsprüfung am",
    servicesUsed: "Genutzte Leistungen",
    jobTitle: "Position",
    phone: "Telefon",
    opportunityType: "Art der Verkaufschance",
    decisionDate: "Erwartete Entscheidung",
    nextStep: "Nächster Schritt",
    nextStepDate: "Datum nächster Schritt",
    dueDate: "Fällig am",
    priority: "Priorität",
    clientStatus: "Kundenstatus",
    annualValue: "Jahreswert",
    lastContact: "Letzter Kontakt",
  },
  options: {
    segment: {
      smallOffice: "Kleines Büro (unter 50)",
      midsize: "Mittleres Büro (50–250)",
      largeSite: "Großer Standort (250+)",
      coworking: "Coworking-Space",
    },
    preferredChannel: { email: "E-Mail", phone: "Telefon", whatsapp: "WhatsApp" },
    servicesUsed: {
      coffeeMachines: "Kaffeemaschinen",
      breakroomSupplies: "Teeküchenbedarf",
      meetingCatering: "Besprechungscatering",
      freshFruit: "Frisches Obst",
      waterDispensers: "Wasserspender",
      eventCatering: "Eventcatering",
    },
    opportunityType: {
      newClient: "Neukunde",
      expansion: "Zusätzlicher Standort oder Leistung",
      renewal: "Jahresgespräch",
    },
    priority: { low: "Niedrig", medium: "Mittel", high: "Hoch" },
    clientStatus: { active: "Aktiver Kunde", prospect: "Interessent", paused: "Pausiert" },
  },
  stages: { newRelationship: "Neue Beziehung", activeDiscussion: "Im Gespräch", customer: "Kunde", dormant: "Ruhend" },
  organizations: {
    halverson: ["Hollmann Ingenieure GmbH", "Leipzig"],
    meridian: ["Merkur Versicherungsmakler", "Leipzig"],
    oakfield: ["Zahnzentrum am Eichenhof", "Markkleeberg"],
    brightside: ["Sonnenseite Coworking", "Leipzig"],
    larkspur: ["Kanzlei Lerchenfeld", "Leipzig"],
    riverbend: ["Elsteraue Kreditgenossenschaft eG", "Taucha"],
    tallis: ["Talwerk Software GmbH", "Leipzig"],
    greystone: ["Graustein Hausverwaltung", "Leipzig"],
    juniper: ["Wacholder Architekten", "Leipzig"],
    westmoor: ["Logistikpark Schkeuditz Nord", "Schkeuditz"],
    ashcombe: ["Eschental Medien", "Halle (Saale)"],
    kingsley: ["Klinikum Königsau", "Halle (Saale)"],
  },
  contacts: {
    diane: ["Dagmar", "Meißner", "Geschäftsführende Gesellschafterin"],
    tom: ["Thomas", "Ostermann", "Büroleiter"],
    priya: ["Petra", "Naumann", "Standortkoordinatorin Dresden"],
    greg: ["Gerd", "Lorenz", "Kaufmännischer Leiter"],
    karen: ["Katrin", "Dorn", "Leiterin Office Management"],
    sam: ["Simon", "Weidner", "Verwaltungsassistent"],
    laura: ["Laura", "Schenk", "Praxismanagerin"],
    marcus: ["Markus", "Reinhardt", "Community-Manager"],
    helen: ["Heike", "Wagner", "Büroleiterin"],
    patrick: ["Patrick", "Kühn", "Leiter Haustechnik"],
    nina: ["Nina", "Albrecht", "Vorstandsassistentin"],
    josh: ["Jonas", "Thiel", "Leiter Personal und Kultur"],
    beth: ["Bettina", "Holz", "Leiterin Betrieb"],
    owen: ["Ole", "Petersen", "Büromanager"],
    carl: ["Carsten", "Jahn", "Standortleiter"],
    anita: ["Anja", "Schulze", "Personalleiterin"],
    zoe: ["Zoe", "Brückner", "Office-Koordinatorin"],
    frank: ["Frank", "Moritz", "Leiter Facility Management"],
    lisa: ["Lisa", "Graf", "Leiterin Einkauf"],
  },
  deals: {
    halversonRenewal: [
      "Hollmann – Jahresgespräch für alle drei Standorte",
      "Jahresauswertung mit Frau Meißner und Herrn Lorenz besprechen",
    ],
    halversonSecondSite: [
      "Hollmann – Kaffee und Teeküche für das Büro Dresden",
      "Verkostung mit dem Team von Frau Naumann in Dresden",
    ],
    meridianCatering: ["Merkur – Catering für Kundentermine", "Frau Dorn zwei Mittagsmenüs schicken"],
    oakfieldWater: ["Zahnzentrum am Eichenhof – Wasserspender für beide Praxen", "Läuft seit dem Frühjahr"],
    brightsideCoffee: ["Sonnenseite Coworking – Kaffeebar und Teeküche", "Läuft, Prüfung im Dezember"],
    larkspurStart: ["Kanzlei Lerchenfeld – erste Kaffeemaschine", "Frau Wagner wegen der Küchengröße anrufen"],
    riverbendBranches: ["Elsteraue – Kaffee für die vier Filialen", "Herrn Kühn das Angebot je Filiale schicken"],
    riverbendRenewal: ["Elsteraue – Betreuung der Hauptstelle", "Läuft seit letztem Jahr"],
    tallisOffice: ["Talwerk Software – Bürokaffee und Obst", "Läuft seit August"],
    greystoneStart: ["Graustein – Teeküchenbedarf", "Frau Holz nach der Mitarbeiterzahl fragen"],
    juniperFruit: ["Wacholder Architekten – wöchentliches Obst", "Pausiert nach dem Büroumzug"],
    westmoorCanteen: [
      "Logistikpark – Pausenbereiche für die Lagerschichten",
      "Herrn Jahn und Frau Schulze zwei Varianten vorstellen",
    ],
    ashcombeRenewal: ["Eschental Medien – Kaffeeservice", "Nach dem Teamwechsel nachfragen"],
    kingsleyPilot: ["Klinikum Königsau – Catering für Teambesprechungen", "Kennenlerngespräch mit Herrn Moritz"],
  },
  tasks: {
    prepareReview: "Jahresauswertung für Hollmann vorbereiten (Verbrauch je Standort)",
    secondSiteTasting: "Zwei Maschinen zur Verkostung nach Dresden mitnehmen",
    updateSiteCount: "Büro Dresden im Kundendatensatz Hollmann ergänzen",
    descaleMachines: "Entkalkung der Leipziger Kaffeemaschinen bei Hollmann einplanen",
    meridianMenu: "Zwei Mittagsmenüs für Merkur zusammenstellen",
    riverbendOffer: "Angebot je Filiale für die Elsteraue schreiben",
    westmoorVisit: "Pausenbereiche im Logistikpark mit Herrn Jahn begehen",
    westmoorOptions: "Schichttaugliche Varianten für den Logistikpark ausarbeiten",
    kingsleyCall: "Kennenlerngespräch mit Herrn Moritz vom Klinikum Königsau",
    ashcombeCheckIn: "Bei Frau Brückner von Eschental Medien nachfragen",
    larkspurCall: "Frau Wagner wegen der Küche der Kanzlei anrufen",
    brightsideReview: "Vertragsprüfung für Sonnenseite Coworking vorbereiten",
    tallisOnboarding: "Erste Lieferung und Aufbau der Maschine bei Talwerk",
  },
  views: {
    pipeline: "Verkaufschancen nach Phase",
    nextSteps: "Nächste Schritte",
    clients: "Kundendetails",
    contractReviews: "Anstehende Vertragsprüfungen",
    allContacts: "Alle Kontakte",
    dueSoon: "Bald fällig",
  },
  widgets: {
    activeClients: "Aktive Kunden",
    annualValue: "Jahreswert aktiver Kunden",
    noContact: "Seit 30 Tagen kein Kontakt",
    overdueTasks: "Überfällige Aufgaben",
    bySegment: "Kunden nach Segment",
    byService: "Aktive Kunden nach Leistung",
    byStage: "Wert der Verkaufschancen nach Phase",
    reviewsByMonth: "Jahreswert zur Vertragsprüfung",
    activeDiscussions: "Laufende Gespräche nach Wert",
  },
  wiki: {
    guide: {
      title: "Leitfaden",
      markdown: [
        "Bohnenhaus Büroservice betreut Kaffeemaschinen, Teeküchenbedarf, frisches Obst, Wasserspender und Besprechungscatering für Büros in Leipzig und Umgebung. Dieser Arbeitsbereich enthält Demodaten; alle Firmen und Personen sind erfunden.",
        "",
        "## So nutzen wir das CRM",
        "- **Kunden** sind die Büros und Standorte, die wir betreuen oder ansprechen. Der Kundendatensatz enthält die strukturierten Angaben: Kunde seit, Segment, Kundenbetreuung, bevorzugter Kanal, Vertragsprüfung, genutzte Leistungen und Anzahl der Standorte.",
        "- **Kontakte** sind die Menschen bei einem Kunden, jeweils mit ihrem Kunden verknüpft.",
        "- **Verkaufschancen** sind Neukunden, zusätzliche Standorte oder Leistungen und Jahresgespräche. Die Phase zeigt, wo die Beziehung steht; den Wert tragen wir von Hand ein.",
        "- **Aufgaben** sind nächste Schritte mit Verantwortlichen, Status und Fälligkeitsdatum. Aufgaben und das Datum des nächsten Schritts sind normale Felder: Niemand wird automatisch erinnert, deshalb jeden Morgen die Ansichten „Bald fällig“ und „Nächste Schritte“ prüfen.",
        "- Ein Gespräch aus dem Posteingang gehört nur dann zu einem Kunden oder einer Verkaufschance, wenn jemand es dort verknüpft.",
        "",
        "## Arbeitsregeln",
        "- Welche Leistungen ein Kunde nutzt, steht im Mehrfachauswahlfeld **Genutzte Leistungen**. Schlagwörter nutzen wir nicht.",
        "- Verträge, Menüs und Lieferscheine bleiben auf unserem gemeinsamen Laufwerk; an Datensätzen hängen keine Dateien.",
        "- Jede offene Verkaufschance hat einen nächsten Schritt mit Datum.",
        "- Abrechnung und Lieferplanung bleiben in ihren eigenen Programmen.",
      ],
    },
    clientRecord: {
      title: "Was ein vollständiger Kundendatensatz enthält",
      markdown: [
        "Ein vollständiger Kundendatensatz zeigt allen im Team auf einen Blick, was wir wo und für wen liefern.",
        "",
        "## Ein Kunde ist vollständig, wenn",
        "- **Segment**, **Standorte** und **Genutzte Leistungen** ausgefüllt sind, damit die Ansicht „Kundendetails“ zeigt, was wir wo liefern.",
        "- **Kunde seit** und **Vertragsprüfung am** bei jedem zahlenden Kunden gesetzt sind. Die Ansicht „Anstehende Vertragsprüfungen“ ist nach diesem Datum sortiert.",
        "- **Kundenbetreuung** die Person nennt, die sich um die Beziehung kümmert, und **Bevorzugter Kanal** festhält, ob der Kunde E-Mail, einen Anruf oder WhatsApp möchte.",
        "- mindestens die entscheidende Person und die Person, die im Alltag bestellt, als Kontakte verknüpft sind.",
        "- offene Verkaufschancen und die E-Mails oder Chats dazu mit dem Kunden verknüpft sind.",
        "",
        "## Beispiel",
        "Hollmann Ingenieure ist das Beispiel: vier Kontakte, zwei Verkaufschancen, offene Aufgaben und zwei verknüpfte Gespräche.",
      ],
    },
    spreadsheetMove: {
      title: "Kunden aus einer Tabelle übernehmen",
      whenToUse: "Wenn eine Kundenliste aus einer Tabellenkalkulation ins CRM umziehen soll.",
      markdown: [
        "Eine Kundenliste aus einer Tabelle zieht per Import von Hand um, eine Arbeitsmappe pro Liste, in fester Reihenfolge.",
        "",
        "## Schritte",
        "1. Die Tabelle als .xlsx-Arbeitsmappe speichern; CSV-Dateien werden nicht importiert.",
        "2. Doppelte Zeilen entfernen und die Tabelle in eine Arbeitsmappe für Kunden und eine für Kontakte aufteilen.",
        "3. Zuerst die Kunden importieren: In **Kunden** über **Weitere Aktionen › Aus Datei hinzufügen** die Arbeitsmappe wählen, die Spalten den Feldern zuordnen und importieren.",
        "4. Danach die Kontakte importieren und die Firmenspalte dem Kunden zuordnen, damit jede Person verknüpft ist.",
        "5. Ein Import lässt sich nicht rückgängig machen. Erst zehn Zeilen testen und prüfen, dann den Rest importieren.",
        "6. Genutzte Leistungen, Vertragsprüfung und Kundenbetreuung von Hand ergänzen, wo die Tabelle keine saubere Spalte hatte.",
      ],
    },
  },
  threads: {
    halversonReview: {
      subject: "Jahresgespräch – alle drei Standorte",
      messages: [
        "Hallo Herr Bergmann,\n\nnächsten Monat steht unsere Vertragsprüfung an. Mit Dresden haben wir jetzt drei Standorte. Können Sie uns vor dem Termin den Verbrauch je Standort zeigen? Herr Lorenz möchte die Zahlen sehen.\n\nViele Grüße\nDagmar Meißner",
        "Hallo Frau Meißner,\n\nselbstverständlich. Ich stelle Kaffee, Teeküchenbedarf und Catering je Standort für die letzten zwölf Monate zusammen und schicke Ihnen die Übersicht vorab.\n\nViele Grüße\nMax Bergmann",
        "Prima. Donnerstag, der 14., um 10 Uhr passt uns beiden.",
        "Donnerstag um 10 Uhr ist eingetragen. Ich bringe die Übersicht je Standort und einen Vorschlag für Dresden mit.",
      ],
    },
    halversonMachine: {
      messages: [
        "Hallo Herr Bergmann, bei der Maschine im zweiten Stock leuchtet wieder die Entkalkungsanzeige.",
        "Danke, Herr Ostermann. Am Mittwochvormittag kommt jemand vorbei und entkalkt alle Leipziger Maschinen in einem Durchgang.",
        "Super, die Küche ist vor 9 Uhr frei.",
      ],
    },
    riverbendBranches: {
      subject: "Kaffee und Wasser für die Filialen",
      messages: [
        "Sehr geehrter Herr Bergmann,\n\ndas Team in der Hauptstelle ist mit Ihrem Service sehr zufrieden. Könnten Sie uns auch ein Angebot für unsere vier Filialen machen? Dort arbeiten jeweils etwa zwölf Personen.\n\nMit freundlichen Grüßen\nPatrick Kühn",
        "Sehr geehrter Herr Kühn,\n\nvielen Dank, das freut uns. Ich schicke Ihnen bis Freitag ein Angebot je Filiale mit jeweils einer Maschine und einem Wasserspender.\n\nMit freundlichen Grüßen\nMax Bergmann",
      ],
    },
    meridianCatering: {
      subject: "Mittagessen für Kundentermine",
      messages: [
        "Hallo Herr Bergmann,\n\nwir haben etwa zweimal pro Woche Kundentermine im Haus. Können Sie ein Mittagessen für bis zu zwölf Personen anbieten?\n\nDanke und viele Grüße\nKatrin Dorn",
        "Hallo Frau Dorn,\n\ngern. Ich schicke Ihnen zwei Menüs, ein leichtes und ein warmes, mit Preisen pro Person.\n\nViele Grüße\nMax Bergmann",
      ],
    },
    brightsideOatMilk: {
      messages: [
        "Hi Max, unsere Mitglieder fragen ständig nach Haferdrink an der Kaffeebar. Kannst du den mit in die Wochenlieferung nehmen?",
        "Klar, Markus. Ab nächster Woche kommen sechs Packungen pro Woche mit.",
      ],
    },
    kingsleyIntro: {
      subject: "Anfrage – Catering für Teambesprechungen",
      messages: [
        "Sehr geehrter Herr Bergmann,\n\ndas Zahnzentrum am Eichenhof hat Sie uns empfohlen. Wir suchen ein Catering für unsere wöchentlichen Teambesprechungen mit etwa 30 Personen.\n\nHätten Sie nächste Woche Zeit für ein Telefonat?\n\nMit freundlichen Grüßen\nFrank Moritz",
        "Sehr geehrter Herr Moritz,\n\nvielen Dank für Ihre Nachricht. Sehr gern. Passt Ihnen Dienstag um 14 Uhr?\n\nMit freundlichen Grüßen\nMax Bergmann",
      ],
    },
    tallisBreakfast: {
      messages: [
        "Hi Max! Kann die Lieferung am Freitag etwas mehr Obst enthalten? Wir haben ein Teamfrühstück.",
        "Na klar, Jonas. Ich packe am Freitag zwei zusätzliche Obstkisten dazu.",
      ],
    },
  },
};

type OrganizationFacts = {
  status: "active" | "prospect" | "paused";
  annual?: number;
  lastContact: number;
  segment: string;
  sites: number;
  channel: string;
  domain: string;
  createdDaysAgo: number;
  since?: number;
  review?: number;
  services?: ServiceUsedKey[];
  history?: Array<{ daysAgo: number; previous: Record<string, FieldInput> }>;
};

const ORGANIZATION_FACTS: Record<OrganizationKey, OrganizationFacts> = {
  halverson: {
    status: "active",
    annual: 42000,
    lastContact: -2,
    segment: "midsize",
    sites: 3,
    channel: "email",
    domain: "halverson-engineering.example",
    createdDaysAgo: 1150,
    since: -1120,
    review: 21,
    services: ["coffeeMachines", "breakroomSupplies", "meetingCatering", "freshFruit"],
    history: [{ daysAgo: 6, previous: { sites: 2 } }],
  },
  meridian: {
    status: "active",
    annual: 18500,
    lastContact: -12,
    segment: "midsize",
    sites: 2,
    channel: "email",
    domain: "meridian-insurance.example",
    createdDaysAgo: 640,
    since: -610,
    review: 75,
    services: ["coffeeMachines", "waterDispensers"],
  },
  oakfield: {
    status: "active",
    annual: 3400,
    lastContact: -41,
    segment: "smallOffice",
    sites: 2,
    channel: "phone",
    domain: "oakfield-dental.example",
    createdDaysAgo: 230,
    since: -200,
    review: 165,
    services: ["waterDispensers"],
  },
  brightside: {
    status: "active",
    annual: 12800,
    lastContact: -3,
    segment: "coworking",
    sites: 1,
    channel: "whatsapp",
    domain: "brightside-cowork.example",
    createdDaysAgo: 520,
    since: -480,
    review: 48,
    services: ["coffeeMachines", "breakroomSupplies", "eventCatering"],
    history: [{ daysAgo: 90, previous: { preferredChannel: "email" } }],
  },
  larkspur: {
    status: "prospect",
    lastContact: -5,
    segment: "smallOffice",
    sites: 1,
    channel: "phone",
    domain: "larkspur-law.example",
    createdDaysAgo: 16,
  },
  riverbend: {
    status: "active",
    annual: 21000,
    lastContact: -8,
    segment: "midsize",
    sites: 5,
    channel: "email",
    domain: "riverbend-cu.example",
    createdDaysAgo: 450,
    since: -400,
    review: 110,
    services: ["coffeeMachines", "waterDispensers", "meetingCatering"],
  },
  tallis: {
    status: "active",
    annual: 7900,
    lastContact: -1,
    segment: "midsize",
    sites: 1,
    channel: "whatsapp",
    domain: "tallis-software.example",
    createdDaysAgo: 110,
    since: -75,
    review: 290,
    services: ["coffeeMachines", "freshFruit"],
  },
  greystone: {
    status: "prospect",
    lastContact: -9,
    segment: "smallOffice",
    sites: 1,
    channel: "email",
    domain: "greystone-property.example",
    createdDaysAgo: 22,
  },
  juniper: {
    status: "paused",
    annual: 2600,
    lastContact: -64,
    segment: "smallOffice",
    sites: 1,
    channel: "email",
    domain: "juniper-studio.example",
    createdDaysAgo: 380,
    since: -350,
    services: ["freshFruit"],
  },
  westmoor: {
    status: "prospect",
    lastContact: -4,
    segment: "largeSite",
    sites: 2,
    channel: "phone",
    domain: "westmoor-logistics.example",
    createdDaysAgo: 45,
  },
  ashcombe: {
    status: "active",
    annual: 5400,
    lastContact: -62,
    segment: "smallOffice",
    sites: 1,
    channel: "email",
    domain: "ashcombe-media.example",
    createdDaysAgo: 700,
    since: -680,
    review: 30,
    services: ["coffeeMachines"],
  },
  kingsley: {
    status: "prospect",
    lastContact: -3,
    segment: "largeSite",
    sites: 3,
    channel: "email",
    domain: "kingsley-medical.example",
    createdDaysAgo: 5,
  },
};

const CONTACT_FACTS: Record<
  ContactKey,
  {
    organization: OrganizationKey;
    createdDaysAgo: number;
    mobile?: string;
    whatsapp?: boolean;
    avatar?: Parameters<typeof photo>[0];
  }
> = {
  diane: { organization: "halverson", createdDaysAgo: 1140, avatar: "anna-mueller" },
  tom: { organization: "halverson", createdDaysAgo: 1140, mobile: "11", whatsapp: true, avatar: "tim-wagner" },
  priya: { organization: "halverson", createdDaysAgo: 30, avatar: "leila-chen" },
  greg: { organization: "halverson", createdDaysAgo: 900, avatar: "paul-koch" },
  karen: { organization: "meridian", createdDaysAgo: 630, avatar: "mia-schneider" },
  sam: { organization: "meridian", createdDaysAgo: 400 },
  laura: { organization: "oakfield", createdDaysAgo: 228 },
  marcus: { organization: "brightside", createdDaysAgo: 515, mobile: "12", whatsapp: true, avatar: "lukas-fischer" },
  helen: { organization: "larkspur", createdDaysAgo: 15 },
  patrick: { organization: "riverbend", createdDaysAgo: 445, avatar: "felix-koch" },
  nina: { organization: "riverbend", createdDaysAgo: 300 },
  josh: { organization: "tallis", createdDaysAgo: 108, mobile: "13", whatsapp: true, avatar: "leon-becker" },
  beth: { organization: "greystone", createdDaysAgo: 21 },
  owen: { organization: "juniper", createdDaysAgo: 378 },
  carl: { organization: "westmoor", createdDaysAgo: 44 },
  anita: { organization: "westmoor", createdDaysAgo: 40 },
  zoe: { organization: "ashcombe", createdDaysAgo: 120 },
  frank: { organization: "kingsley", createdDaysAgo: 5 },
  lisa: { organization: "kingsley", createdDaysAgo: 4 },
};

type DealFacts = {
  organization: OrganizationKey;
  contacts: ContactKey[];
  stage: string;
  type: string;
  value: number;
  createdDaysAgo: number;
  decision: number;
  next?: number;
  /** Earlier stages, oldest first: `[daysAgo, stage before that change]`. */
  history?: Array<[number, string]>;
};

const DEAL_FACTS: Record<DealKey, DealFacts> = {
  halversonRenewal: {
    organization: "halverson",
    contacts: ["diane", "greg"],
    stage: "activeDiscussion",
    type: "renewal",
    value: 28400,
    createdDaysAgo: 40,
    decision: 21,
    next: 5,
    history: [[12, "newRelationship"]],
  },
  halversonSecondSite: {
    organization: "halverson",
    contacts: ["priya", "tom"],
    stage: "newRelationship",
    type: "expansion",
    value: 9600,
    createdDaysAgo: 28,
    decision: 35,
    next: 9,
  },
  meridianCatering: {
    organization: "meridian",
    contacts: ["karen", "sam"],
    stage: "activeDiscussion",
    type: "expansion",
    value: 6200,
    createdDaysAgo: 18,
    decision: 20,
    next: 4,
    history: [[7, "newRelationship"]],
  },
  oakfieldWater: {
    organization: "oakfield",
    contacts: ["laura"],
    stage: "customer",
    type: "newClient",
    value: 3400,
    createdDaysAgo: 226,
    decision: -200,
    history: [
      [215, "newRelationship"],
      [200, "activeDiscussion"],
    ],
  },
  brightsideCoffee: {
    organization: "brightside",
    contacts: ["marcus"],
    stage: "customer",
    type: "newClient",
    value: 12800,
    createdDaysAgo: 510,
    decision: -480,
    history: [
      [495, "newRelationship"],
      [480, "activeDiscussion"],
    ],
  },
  larkspurStart: {
    organization: "larkspur",
    contacts: ["helen"],
    stage: "newRelationship",
    type: "newClient",
    value: 4800,
    createdDaysAgo: 15,
    decision: 40,
    next: 5,
  },
  riverbendBranches: {
    organization: "riverbend",
    contacts: ["patrick", "nina"],
    stage: "activeDiscussion",
    type: "expansion",
    value: 18500,
    createdDaysAgo: 25,
    decision: 30,
    next: 2,
    history: [[10, "newRelationship"]],
  },
  riverbendRenewal: {
    organization: "riverbend",
    contacts: ["patrick"],
    stage: "customer",
    type: "newClient",
    value: 21000,
    createdDaysAgo: 440,
    decision: -400,
    history: [
      [420, "newRelationship"],
      [400, "activeDiscussion"],
    ],
  },
  tallisOffice: {
    organization: "tallis",
    contacts: ["josh"],
    stage: "customer",
    type: "newClient",
    value: 7900,
    createdDaysAgo: 105,
    decision: -75,
    history: [
      [90, "newRelationship"],
      [75, "activeDiscussion"],
    ],
  },
  greystoneStart: {
    organization: "greystone",
    contacts: ["beth"],
    stage: "newRelationship",
    type: "newClient",
    value: 3200,
    createdDaysAgo: 20,
    decision: 45,
    next: 7,
  },
  juniperFruit: {
    organization: "juniper",
    contacts: ["owen"],
    stage: "dormant",
    type: "newClient",
    value: 2600,
    createdDaysAgo: 370,
    decision: -350,
    history: [
      [350, "activeDiscussion"],
      [60, "customer"],
    ],
  },
  westmoorCanteen: {
    organization: "westmoor",
    contacts: ["carl", "anita"],
    stage: "activeDiscussion",
    type: "newClient",
    value: 24000,
    createdDaysAgo: 42,
    decision: 50,
    next: 6,
    history: [[8, "newRelationship"]],
  },
  ashcombeRenewal: {
    organization: "ashcombe",
    contacts: ["zoe"],
    stage: "dormant",
    type: "renewal",
    value: 5400,
    createdDaysAgo: 160,
    decision: -100,
    history: [[100, "activeDiscussion"]],
  },
  kingsleyPilot: {
    organization: "kingsley",
    contacts: ["frank", "lisa"],
    stage: "newRelationship",
    type: "newClient",
    value: 15000,
    createdDaysAgo: 4,
    decision: 60,
    next: 1,
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
  prepareReview: {
    status: "inProgress",
    priority: "high",
    due: 3,
    deal: "halversonRenewal",
    contact: "diane",
    createdDaysAgo: 10,
  },
  secondSiteTasting: {
    status: "open",
    priority: "medium",
    due: 9,
    deal: "halversonSecondSite",
    contact: "priya",
    createdDaysAgo: 8,
  },
  updateSiteCount: {
    status: "done",
    priority: "low",
    due: -6,
    organization: "halverson",
    contact: "tom",
    createdDaysAgo: 12,
    done: 6,
  },
  descaleMachines: {
    status: "open",
    priority: "medium",
    due: -3,
    organization: "halverson",
    contact: "tom",
    createdDaysAgo: 9,
  },
  meridianMenu: {
    status: "open",
    priority: "medium",
    due: 4,
    deal: "meridianCatering",
    contact: "karen",
    createdDaysAgo: 6,
  },
  riverbendOffer: {
    status: "inProgress",
    priority: "high",
    due: 2,
    deal: "riverbendBranches",
    contact: "patrick",
    createdDaysAgo: 5,
  },
  westmoorVisit: {
    status: "done",
    priority: "medium",
    due: -4,
    deal: "westmoorCanteen",
    contact: "carl",
    createdDaysAgo: 20,
    done: 4,
  },
  westmoorOptions: {
    status: "open",
    priority: "high",
    due: 6,
    deal: "westmoorCanteen",
    contact: "anita",
    createdDaysAgo: 3,
  },
  kingsleyCall: {
    status: "open",
    priority: "medium",
    due: 1,
    deal: "kingsleyPilot",
    contact: "frank",
    createdDaysAgo: 2,
  },
  ashcombeCheckIn: {
    status: "open",
    priority: "medium",
    due: -5,
    organization: "ashcombe",
    contact: "zoe",
    createdDaysAgo: 20,
  },
  larkspurCall: {
    status: "open",
    priority: "medium",
    due: 5,
    deal: "larkspurStart",
    contact: "helen",
    createdDaysAgo: 4,
  },
  brightsideReview: {
    status: "open",
    priority: "low",
    due: 40,
    organization: "brightside",
    contact: "marcus",
    createdDaysAgo: 7,
  },
  tallisOnboarding: {
    status: "done",
    priority: "high",
    due: -70,
    deal: "tallisOffice",
    contact: "josh",
    createdDaysAgo: 76,
    done: 70,
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
  id: "client-management",
  strings: { en, de },
  build: (t) => {
    const mobile = (suffix: string) => phoneNumber(t.phones.mobile, Number(suffix));
    const office = (index: number) => phoneNumber(t.phones.office, index);
    const open = ["newRelationship", "activeDiscussion"];
    const active = [{ field: "clientStatus", in: ["active"] }];
    const label = <K extends string>(
      options: Record<K, string>,
      colors: Record<K, "default" | "secondary" | "destructive" | "success" | "warning" | "info">,
    ) => (Object.keys(options) as K[]).map((key) => ({ key, label: options[key], color: colors[key] }));

    const organization: RecordSpec[] = ORGANIZATIONS.map((key) => {
      const facts = ORGANIZATION_FACTS[key];
      const [name, city] = t.organizations[key];
      return {
        key,
        values: {
          name,
          clientStatus: facts.status,
          ...(facts.annual === undefined ? {} : { annualValue: facts.annual }),
          lastContact: day(facts.lastContact),
          segment: facts.segment,
          city,
          website: `https://${facts.domain}`,
          sites: facts.sites,
          accountManager: "maxBergmann",
          preferredChannel: facts.channel,
          ...(facts.since === undefined ? {} : { clientSince: day(facts.since) }),
          ...(facts.review === undefined ? {} : { contractReviewDate: day(facts.review) }),
          ...(facts.services ? { servicesUsed: facts.services } : {}),
        },
        owner: "maxBergmann",
        channels: { email: `office@${facts.domain}` },
        createdDaysAgo: facts.createdDaysAgo,
        ...(facts.history ? { history: facts.history } : {}),
      };
    });
    const contact: RecordSpec[] = CONTACTS.map((key, index) => {
      const facts = CONTACT_FACTS[key];
      const [firstName, lastName, jobTitle] = t.contacts[key];
      const domain = ORGANIZATION_FACTS[facts.organization].domain;
      const phone = facts.mobile ? mobile(facts.mobile) : office(index);
      return {
        key,
        values: { firstName, lastName, jobTitle, phone },
        links: { "contact.organizations": facts.organization },
        owner: "maxBergmann",
        channels: {
          email: `${mailbox(firstName)}.${mailbox(lastName)}@${domain}`,
          ...(facts.whatsapp ? { phone } : {}),
        },
        ...(facts.avatar ? { avatar: photo(facts.avatar) } : {}),
        createdDaysAgo: facts.createdDaysAgo,
      };
    });
    const deal: RecordSpec[] = DEALS.map((key) => {
      const facts = DEAL_FACTS[key];
      const [name, nextStep] = t.deals[key];
      return {
        key,
        values: {
          name,
          stage: facts.stage,
          opportunityType: facts.type,
          totalValue: facts.value,
          decisionDate: day(facts.decision),
          nextStep,
          ...(facts.next === undefined ? {} : { nextStepDate: day(facts.next) }),
        },
        links: { "deal.organizations": facts.organization, "deal.contacts": facts.contacts },
        owner: "maxBergmann",
        createdDaysAgo: facts.createdDaysAgo,
        ...(facts.history
          ? { history: facts.history.map(([daysAgo, stage]) => ({ daysAgo, previous: { stage } })) }
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
        owner: "maxBergmann",
        createdDaysAgo: facts.createdDaysAgo,
        ...(facts.done === undefined ? {} : { history: [{ daysAgo: facts.done, previous: { status: "open" } }] }),
      };
    });

    const messages = (key: keyof Strings["threads"], senders: readonly string[], draftLast = false) =>
      t.threads[key].messages.map((text, index, all) => ({
        from: senders[index],
        text,
        ...(draftLast && index === all.length - 1 ? { draft: true } : {}),
      }));

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
          key: "organization.segment",
          label: t.fields.segment,
          type: "select",
          options: label(t.options.segment, {
            smallOffice: "secondary",
            midsize: "info",
            largeSite: "success",
            coworking: "warning",
          }),
        },
        {
          key: "organization.clientStatus",
          label: t.fields.clientStatus,
          type: "select",
          options: label(t.options.clientStatus, { active: "success", prospect: "info", paused: "secondary" }),
        },
        { key: "organization.annualValue", label: t.fields.annualValue, type: "currency" },
        { key: "organization.lastContact", label: t.fields.lastContact, type: "date" },
        { key: "organization.city", label: t.fields.city, type: "text" },
        { key: "organization.website", label: t.fields.website, type: "url" },
        { key: "organization.sites", label: t.fields.sites, type: "number" },
        { key: "organization.clientSince", label: t.fields.clientSince, type: "date" },
        { key: "organization.accountManager", label: t.fields.accountManager, type: "member" },
        {
          key: "organization.preferredChannel",
          label: t.fields.preferredChannel,
          type: "select",
          options: label(t.options.preferredChannel, { email: "info", phone: "secondary", whatsapp: "success" }),
        },
        { key: "organization.contractReviewDate", label: t.fields.contractReviewDate, type: "date" },
        {
          key: "organization.servicesUsed",
          label: t.fields.servicesUsed,
          type: "multiSelect",
          options: label(t.options.servicesUsed, {
            coffeeMachines: "warning",
            breakroomSupplies: "secondary",
            meetingCatering: "info",
            freshFruit: "success",
            waterDispensers: "info",
            eventCatering: "default",
          }),
        },
        { key: "contact.jobTitle", label: t.fields.jobTitle, type: "text" },
        { key: "contact.phone", label: t.fields.phone, type: "phone" },
        {
          key: "deal.opportunityType",
          label: t.fields.opportunityType,
          type: "select",
          options: label(t.options.opportunityType, { newClient: "success", expansion: "info", renewal: "secondary" }),
        },
        { key: "deal.decisionDate", label: t.fields.decisionDate, type: "date" },
        { key: "deal.nextStep", label: t.fields.nextStep, type: "text" },
        { key: "deal.nextStepDate", label: t.fields.nextStepDate, type: "date" },
        { key: "task.dueDate", label: t.fields.dueDate, type: "date" },
        {
          key: "task.priority",
          label: t.fields.priority,
          type: "select",
          options: label(t.options.priority, { low: "secondary", medium: "info", high: "destructive" }),
        },
      ],
      stages: [
        { key: "newRelationship", label: t.stages.newRelationship, color: "info", probability: 20 },
        { key: "activeDiscussion", label: t.stages.activeDiscussion, color: "warning", probability: 50 },
        { key: "customer", label: t.stages.customer, color: "success", probability: 100 },
        { key: "dormant", label: t.stages.dormant, color: "secondary", probability: 0 },
      ],
      records: { organization, contact, deal, task },
      views: [
        {
          key: "pipeline",
          list: "deal",
          name: t.views.pipeline,
          mode: "board",
          groupBy: "stage",
          columns: ["totalValue", "deal.organizations", "opportunityType", "nextStepDate"],
        },
        {
          key: "nextSteps",
          list: "deal",
          name: t.views.nextSteps,
          mode: "table",
          columns: ["stage", "nextStep", "nextStepDate", "totalValue", "deal.organizations", "deal.contacts"],
          filters: [{ field: "stage", in: open }],
          sort: { field: "nextStepDate", direction: "asc" },
        },
        {
          key: "clients",
          list: "organization",
          name: t.views.clients,
          mode: "table",
          columns: [
            "clientStatus",
            "annualValue",
            "lastContact",
            "segment",
            "clientSince",
            "servicesUsed",
            "sites",
            "preferredChannel",
            "accountManager",
            "city",
            "contact.organizations",
          ],
          sort: { field: "clientSince", direction: "asc" },
        },
        {
          key: "contractReviews",
          list: "organization",
          name: t.views.contractReviews,
          mode: "table",
          columns: [
            "contractReviewDate",
            "clientSince",
            "servicesUsed",
            "sites",
            "accountManager",
            "deal.organizations",
          ],
          sort: { field: "contractReviewDate", direction: "asc" },
        },
        {
          key: "allContacts",
          list: "contact",
          name: t.views.allContacts,
          mode: "table",
          columns: ["jobTitle", "contact.organizations", "phone", "capability.identity"],
        },
        {
          key: "dueSoon",
          list: "task",
          name: t.views.dueSoon,
          mode: "table",
          columns: ["dueDate", "status", "priority", "task.deals", "task.organizations", "system:assignedTo"],
          filters: [{ field: "status", notIn: ["done", "archived"] }],
          sort: { field: "dueDate", direction: "asc" },
        },
      ],
      dashboard: {
        widgets: [
          {
            kind: "kpi",
            title: t.widgets.activeClients,
            list: "organization",
            aggregation: "count",
            filters: active,
          },
          {
            kind: "kpi",
            title: t.widgets.annualValue,
            list: "organization",
            aggregation: "sum",
            field: "annualValue",
            filters: active,
          },
          {
            kind: "kpi",
            title: t.widgets.noContact,
            list: "organization",
            aggregation: "count",
            filters: [...active, { field: "lastContact", olderThanDays: 30 }],
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
            title: t.widgets.bySegment,
            display: DisplayType.doughnutChart,
            list: "organization",
            aggregation: "count",
            groupBy: { field: "segment" },
          },
          {
            kind: "chart",
            title: t.widgets.byService,
            display: DisplayType.horizontalBarChartWithLabels,
            list: "organization",
            aggregation: "count",
            groupBy: { field: "servicesUsed" },
            filters: active,
          },
          {
            kind: "chart",
            title: t.widgets.byStage,
            display: DisplayType.verticalBarChart,
            list: "deal",
            aggregation: "sum",
            field: "totalValue",
            groupBy: { field: "stage" },
          },
          {
            kind: "chart",
            title: t.widgets.reviewsByMonth,
            display: DisplayType.verticalBarChart,
            list: "organization",
            aggregation: "sum",
            field: "annualValue",
            groupBy: { month: "contractReviewDate" },
            filters: active,
          },
          {
            kind: "chart",
            title: t.widgets.activeDiscussions,
            display: DisplayType.rankedTable,
            list: "deal",
            aggregation: "sum",
            field: "totalValue",
            groupBy: { records: true },
            filters: [{ field: "stage", in: ["activeDiscussion"] }],
          },
        ],
      },
      wiki: [
        { key: "guide", kind: "guide", title: t.wiki.guide.title, markdown: t.wiki.guide.markdown },
        {
          key: "clientRecord",
          kind: "knowledge",
          title: t.wiki.clientRecord.title,
          markdown: t.wiki.clientRecord.markdown,
        },
        {
          key: "spreadsheetMove",
          kind: "procedure",
          title: t.wiki.spreadsheetMove.title,
          whenToUse: t.wiki.spreadsheetMove.whenToUse,
          markdown: t.wiki.spreadsheetMove.markdown,
        },
      ],
      messaging: {
        accounts: ["google", "whatsapp"],
        selfTitle: t.selfTitle,
        website: t.website,
        threads: [
          {
            account: "google",
            with: ["diane"],
            subject: t.threads.halversonReview.subject,
            state: "unread",
            latestMinutesAgo: 35,
            messages: messages("halversonReview", ["diane", "self", "diane", "self"], true),
            links: ["organization:halverson", "deal:halversonRenewal"],
          },
          {
            account: "whatsapp",
            with: ["tom"],
            state: "open",
            latestMinutesAgo: 3 * 60,
            messages: messages("halversonMachine", ["tom", "self", "tom"]),
            links: ["organization:halverson"],
          },
          {
            account: "google",
            with: ["patrick"],
            subject: t.threads.riverbendBranches.subject,
            state: "open",
            latestMinutesAgo: 26 * 60,
            messages: messages("riverbendBranches", ["patrick", "self"]),
            links: ["organization:riverbend", "deal:riverbendBranches"],
          },
          {
            account: "google",
            with: ["karen"],
            subject: t.threads.meridianCatering.subject,
            state: "open",
            latestMinutesAgo: 2 * 24 * 60,
            messages: messages("meridianCatering", ["karen", "self"]),
            links: ["organization:meridian", "deal:meridianCatering"],
          },
          {
            account: "whatsapp",
            with: ["marcus"],
            state: "open",
            latestMinutesAgo: 4 * 24 * 60,
            messages: messages("brightsideOatMilk", ["marcus", "self"]),
            links: ["organization:brightside"],
          },
          {
            account: "google",
            with: ["frank"],
            subject: t.threads.kingsleyIntro.subject,
            state: "unread",
            latestMinutesAgo: 90,
            messages: messages("kingsleyIntro", ["frank", "self"]),
            links: ["deal:kingsleyPilot"],
          },
          {
            account: "whatsapp",
            with: ["josh"],
            state: "unread",
            latestMinutesAgo: 5 * 60,
            messages: messages("tallisBreakfast", ["josh", "self"]),
          },
        ],
      },
    };
  },
});
