import { DisplayType } from "@/features/widget/widget-display.schema";

import { address, day, defineSolution, photo, type FileSpec, type RecordSpec, phoneNumber } from "../define-solution";

/**
 * Freelancers: Max works alone as a UX and product designer for a handful of B2B clients, most of them over several
 * years. Inquiries carry an estimated value from the first message to the decision; won work becomes a project with
 * a day rate, a number of days and a calculated fee, and each client adds up its project fees. Billing stays in the
 * tools Max already uses, and next actions are plain date fields that nobody is reminded of automatically.
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
  "corvidDispatch",
  "meadowClaims",
  "meadowPortal",
  "quillOnboarding",
  "fernhillTariff",
  "atlasRider",
  "juniperRefresh",
] as const;
type DealKey = (typeof DEALS)[number];
const PROJECTS = [
  "tidewaterAudit",
  "brightpathOnboardingFlow",
  "corvidDispatchDesign",
  "juniperCheckout",
  "meadowAccessibility",
  "brightpathQuiz",
] as const;
type ProjectKey = (typeof PROJECTS)[number];
const TASKS = [
  "walkthroughPrep",
  "scopeOptions",
  "kickoffAgenda",
  "followUpLaura",
  "replySam",
  "reviewQuillScreens",
  "testimonial",
  "corvidCheckIn",
] as const;
type TaskKey = (typeof TASKS)[number];

const en = {
  countryCode: "us",
  company: "Linwood Product Design",
  workspaceName: "Freelancers",
  website: "https://linwood-design.example",
  phones: { mobile: { templates: ["+1 202 555 01##"], start: 20 } },
  selfTitle: "Freelance UX and product designer",
  lists: {
    organization: ["Client", "Clients", "Companies I work for or talk to about work."],
    contact: ["Contact", "Contacts", "The people I work with at my clients."],
    deal: ["Inquiry", "Inquiries", "Possible projects, from the first message to the client's decision."],
    project: ["Project", "Projects", "Work I agreed to do, with day rate, days and the calculated fee."],
    task: ["Task", "Tasks", "Things I promised to do, with a due date."],
  },
  fields: {
    dealValue: "Estimated value",
    weightedValue: "Weighted value",
    relationship: "Working relationship",
    clientSince: "Client since",
    nextAction: "Next action",
    nextActionDate: "Next action date",
    totalFees: "Total project fees",
    address: "Address",
    brief: "Brief",
    files: "Files",
    website: "Website",
    jobTitle: "Job title",
    workType: "Type of work",
    source: "Source",
    decisionDate: "Decision date",
    projectStatus: "Status",
    dayRate: "Day rate",
    days: "Days",
    fee: "Fee",
    start: "Start",
    deadline: "Deadline",
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
    projectStatus: {
      planned: "Planned",
      inProgress: "In progress",
      waiting: "Waiting for feedback",
      done: "Done",
      billed: "Billed",
    },
  },
  stages: {
    inquiry: "Inquiry",
    firstCall: "First call",
    proposal: "Proposal sent",
    won: "Won",
    lost: "Lost",
  },
  organizations: {
    tidewater: ["Tidewater Analytics", "Boston", "tidewater-analytics.example", "Proposal walkthrough with Priya"],
    brightpath: [
      "Brightpath Learning",
      "Austin",
      "brightpath-learning.example",
      "Kick-off workshop for the onboarding flow",
    ],
    corvid: ["Corvid Fleet Software", "Chicago", "corvid-fleet.example", "Show Dan the first dispatcher screens"],
    meadow: [
      "Meadowlark Insurance",
      "Hartford",
      "meadowlark-insurance.example",
      "Follow up on the claims form proposal",
    ],
    quill: ["Quill & Ledger", "Seattle", "quill-ledger.example", "Scope call with Nina"],
    fernhill: ["Fernhill Energy", "Portland", "fernhill-energy.example", "Reply to Sam's inquiry"],
    atlas: ["Atlas Mobility", "Denver", "atlas-mobility.example", ""],
    juniper: ["Juniper Trails", "San Diego", "juniper-trails.example", "Ask Alex for current usage numbers"],
  } satisfies Record<OrganizationKey, readonly [string, string, string, string]>,
  addresses: {
    tidewater: ["60 Seaport Blvd", "02210", "MA", 42.34817, -71.04142],
    brightpath: ["500 W 2nd St", "78701", "TX", 30.27045, -97.74212],
    corvid: ["1000 W Fulton Market", "60607", "IL", 41.87561, -87.66417],
    meadow: ["280 Trumbull St", "06103", "CT", 41.76712, -72.67521],
    quill: ["101 S Jackson St", "98104", "WA", 47.60129, -122.32763],
    fernhill: ["1300 NW Northrup St", "97209", "OR", 45.53071, -122.68459],
    atlas: ["1550 Wewatta St", "80202", "CO", 39.75192, -104.99918],
    juniper: ["600 W Broadway", "92101", "CA", 32.71925, -117.16302],
  } satisfies Record<OrganizationKey, readonly [string, string, string, number, number]>,
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
    tidewaterDesignSystem: ["Tidewater – design system audit", "Project started"],
    brightpathOnboarding: ["Brightpath – teacher onboarding flow", "Project started"],
    brightpathMobile: ["Brightpath – mobile app usability review", "Send Tom two scope options"],
    corvidDispatch: ["Corvid – dispatcher dashboard design", "Project started"],
    meadowClaims: ["Meadowlark – claims form redesign", "Follow up with Laura on the proposal"],
    meadowPortal: ["Meadowlark – broker portal redesign", "Lost to an in-house team"],
    quillOnboarding: ["Quill & Ledger – app onboarding prototype", "Scope call with Nina"],
    fernhillTariff: ["Fernhill Energy – tariff comparison page", "Reply to Sam with possible start dates"],
    atlasRider: ["Atlas Mobility – rider app redesign", "Lost on budget"],
    juniperRefresh: ["Juniper Trails – trip planner refresh", "Ask Alex for current usage numbers"],
  } satisfies Record<DealKey, readonly [string, string]>,
  projects: {
    tidewaterAudit: "Tidewater – design system audit",
    brightpathOnboardingFlow: "Brightpath – teacher onboarding flow",
    corvidDispatchDesign: "Corvid – dispatcher dashboard design",
    juniperCheckout: "Juniper Trails – checkout UX audit",
    meadowAccessibility: "Meadowlark – accessibility review of the customer area",
    brightpathQuiz: "Brightpath – quiz builder for teachers",
  } satisfies Record<ProjectKey, string>,
  tasks: {
    walkthroughPrep: "Prepare the phase 2 proposal walkthrough for Priya",
    scopeOptions: "Write two scope options for the mobile review",
    kickoffAgenda: "Draft the kick-off workshop agenda",
    followUpLaura: "Follow up with Laura about the claims form proposal",
    replySam: "Reply to Sam's inquiry with possible start dates",
    reviewQuillScreens: "Review Quill & Ledger's current onboarding screens",
    testimonial: "Ask Priya for a short testimonial",
    corvidCheckIn: "Quarterly check-in call with Dan",
  } satisfies Record<TaskKey, string>,
  views: {
    clients: "Client list",
    inquiries: "Inquiries board",
    projects: "Projects",
    nextActions: "Next actions",
    openTasks: "Open tasks",
    calendar: "Project calendar",
  },
  widgets: {
    openQuotes: "Open proposals",
    running: "Fees of running projects",
    fees: "Project fees in the last 12 months",
    overdueTasks: "Overdue tasks",
    byStage: "Inquiry value by stage",
    byStatus: "Projects by status",
    byClient: "Project fees by client",
    feesByMonth: "Project fees by start month",
    nextActions: "Next actions this fortnight",
    tasksMonth: "Open tasks this month",
  },
  files: {
    fernhillBrief: {
      name: "Fernhill brief.pdf",
      lines: [
        "# Fernhill Energy – brief: tariff comparison page",
        "From Sam Whitaker, Marketing manager.",
        "## The problem",
        "Many visitors leave our tariff comparison page on the second step, where they enter their annual usage.",
        "| Step | Visitors | Continue |",
        "| 1. Postcode | 10,000 | 74% |",
        "| 2. Annual usage | 7,400 | 38% |",
        "| 3. Choose a tariff | 2,800 | 61% |",
        "## What we ask for",
        "An outside view with a few user interviews, then a redesign of the tariff comparison that our developers can build.",
        "## Timing and budget",
        "Start within the next two months; budget around $6,000.",
      ],
    },
    juniperBrief: {
      name: "Trip planner brief.docx",
      lines: [
        "# Juniper Trails – trip planner refresh",
        "## Goal",
        "Fewer abandoned trip plans on mobile; the planner was last redesigned four years ago.",
        "## Ask",
        "A short UX review with concrete fixes, similar to the checkout audit, which used the same tariff comparison style of before-and-after tables.",
        "## Budget",
        "About $3,500.",
      ],
    },
    tidewaterProposal: {
      name: "Phase 2 proposal.pdf",
      lines: [
        "# Tidewater Analytics – dashboard redesign, phase 2",
        "Prepared for Priya Raman and Marcus Webb.",
        "## Scope",
        "| Part | Days | Fee |",
        "| Research: five customer interviews | 5 | $4,500 |",
        "| Design of the new dashboard | 10 | $9,500 |",
        "| Total | 15 | $14,000 |",
        "With three interviews instead of five, research takes 3 days ($2,700).",
      ],
    },
    tidewaterFindings: {
      name: "Usability test findings.md",
      lines: [
        "# Usability test findings – design system audit",
        "## What worked",
        "Buttons and form fields are consistent across the product.",
        "## What did not",
        "Three different date pickers; tables use four spacing scales.",
        "## Next",
        "Merge the date pickers first; the report tables follow the tariff comparison layout we tested.",
      ],
    },
    corvidFeedback: {
      name: "First screens – feedback.md",
      lines: [
        "# First dispatcher screens – feedback",
        "## Dan",
        "The map view is the right default; the job list needs the driver's next stop.",
        "## Chris",
        "Filters should stay when switching days. Feedback on the shift view follows on Thursday.",
      ],
    },
    interviews: {
      name: "Interview schedule.xlsx",
    },
  },
  interviewRows: [
    ["Teacher", "School", "Day", "Time"],
    ["Interview 1", "Riverside Middle School", "Monday", "15:30"],
    ["Interview 2", "Oak Hill Elementary", "Tuesday", "16:00"],
    ["Interview 3", "Lakeview High School", "Wednesday", "15:00"],
    ["Interview 4", "Cedar Park Academy", "Thursday", "16:30"],
  ],
  calendar: {
    name: "Client calls",
    events: [
      "Phase 2 walkthrough with Tidewater",
      "Brightpath kick-off workshop",
      "Scope call with Quill & Ledger",
      "Feedback on the dispatcher screens with Corvid",
    ],
  },
  trash: { contact: "Sam Whitaker", deal: "Atlas Mobility – driver app audit" },
  mate: {
    title: "Inquiry from the Fernhill brief",
    question: "I attached Fernhill brief.pdf. Create an inquiry from this brief and suggest two start dates.",
    answer:
      'Done. I created the inquiry **Fernhill Energy – tariff comparison page** at the Inquiry stage, linked to Fernhill Energy and Sam Whitaker, with an estimated value of $6,000 and the source Referral (Sam found you through Meadowlark). Fernhill brief.pdf is attached to the inquiry\'s Brief field.\n\nFrom the brief: visitors drop off on step 2 of the tariff comparison (annual usage), where only 38% continue. Sam asks for a few user interviews and a redesign, starting within two months, budget around $6,000. At $900 per day for research and $950 for design, that is about 6–7 days.\n\n**Project calendar:**\n- Tidewater – design system audit runs until its deadline in about three and a half weeks.\n- Corvid – dispatcher dashboard waits for feedback and ends in about ten days.\n- Brightpath – teacher onboarding flow runs for another five to six weeks.\n\n**Two possible starts:**\n1. The Monday after the Corvid deadline, two days a week next to Brightpath and Tidewater.\n2. The Monday after the Tidewater audit is delivered, three days a week.\n\nI set the next action to "Reply to Sam with possible start dates". Your reply in the thread is still a draft, so nothing was sent.',
  },
  routines: {
    mondayPlan: {
      name: "Monday plan",
      task: "Every Monday morning, write one read-only summary of my week. Read clients and inquiries whose configured Next action date falls in the next seven days or has passed, projects whose Status is In progress or Waiting for feedback with their Deadline, and open tasks by Due date. Group the summary by day, name the client and the next action, and put overdue items first. Keep it under 300 words. Do not change any record, draft or setting.",
      runs: [
        "Listed 6 next actions and 2 project deadlines for this week; 2 items were overdue.",
        "Listed 4 next actions and 1 project deadline; nothing was overdue.",
      ],
      note: "I could not reach the model provider on this attempt, so I stopped before reading anything. Nothing was changed; next Monday's run will cover the week.",
    },
    draftInquiryReply: {
      name: "Draft replies to new inquiries",
      task: "Review the new email identified by routine_trigger. Continue only when the sender matches no existing contact through identity channels, or the email asks about new work. Read the Project calendar: Projects with Status Planned, In progress or Waiting for feedback from Start to Deadline, to find the first free weeks. Save one short reply draft with save_message_draft that thanks the sender, asks for the goal, timing and budget range, and offers two possible start dates. Preserve an existing draft. The draft is for my review; never send it and do not change CRM records.",
      runs: [
        "Prepared a reply draft for Sam at Fernhill Energy with two possible start dates.",
        "The email came from an existing client about running work, so no draft was needed.",
      ],
    },
    quietClients: {
      name: "Check in with quiet clients",
      task: 'On the first of each month, find clients whose Working relationship is Ongoing or Occasional and that have no project with Status Planned, In progress or Waiting for feedback. For each one, read the latest project and the last linked conversation. If the client has an email identity, save one short check-in draft with save_message_draft that refers to the last project; otherwise create one task "Check in with <client name>" due this week. Avoid a second task or draft for the same client. Never send a message.',
      runs: [
        "Prepared 2 check-in drafts for Juniper Trails and Meadowlark Insurance.",
        "Created a check-in task for Atlas Mobility, which has no email address on file.",
      ],
      note: "I could not reach the model provider on this attempt, so I stopped before reading anything. Nothing was changed; the next run on the first of the month will try again.",
    },
  },
  wiki: {
    guide: {
      title: "Operating Guide",
      markdown: [
        "Max Bergmann works alone as Linwood Product Design, a UX and product designer for a small number of B2B clients, most of them over several years. This workspace is demo data; every company and person in it is fictional.",
        "",
        "## What is in this workspace",
        "- **Clients** are the companies I work for or talk to. The client list shows how long we have worked together, the kind of relationship, the total of my project fees and the next action.",
        "- **Contacts** are the people at those clients.",
        "- **Inquiries** are possible projects, from the first message to the client's decision. The value is my estimate of the project; the weighted value is that estimate times the stage probability.",
        "- **Projects** are work I agreed to do. The fee is calculated from the day rate and the number of days. The status Billed is only a label: billing stays in my invoicing tool.",
        "- **Tasks** are things I promised to do, with a due date. Tasks, next actions and their dates are ordinary fields: nobody is reminded automatically, so I check the Next actions view every morning, and Mate writes a Monday plan.",
        "- An email or WhatsApp conversation belongs to a client or an inquiry only when I link it there.",
        "",
        "## What stays elsewhere",
        "- Billing and bookkeeping stay in the tools I already use. This workspace keeps the client relationships, the open inquiries and the running work.",
        "- Briefs from clients sit in the inquiry's Brief field, proposals and project documents in the project's Files, so search and Mate find them by their text. The Project calendar shows every project from start to deadline.",
      ],
    },
    stages: {
      title: "Stages of an inquiry",
      markdown: [
        "Every inquiry moves through the same stages, so the board shows at a glance where each possible project stands. Won work continues as a project.",
        "",
        "## Stages",
        "1. **Inquiry:** someone asks about a project. Add the client, the person and a rough value.",
        "2. **First call:** we talked about goals, timing and who decides.",
        "3. **Proposal sent:** the scope and my estimate went out by email.",
        "4. **Won:** the client said yes. Create the project with day rate, days, start and deadline, linked to the client and the inquiry.",
        "5. **Lost:** the client decided against it or went quiet. Write down why in the notes.",
      ],
    },
    afterCall: {
      title: "After a first call",
      whenToUse: "When the first call or meeting about a new project has taken place.",
      markdown: [
        "A first call leaves notes, a better estimate and a promise to follow up. These steps keep all of that on the inquiry.",
        "",
        "## Steps",
        "1. Write goals, timing and open questions into the inquiry notes.",
        "2. Move the inquiry to First call and update the estimated value.",
        "3. Set the next action and its date on the inquiry and on the client.",
        "4. Link the email or WhatsApp chat with the client to the inquiry.",
      ],
    },
    rates: {
      title: "My rates and terms",
      markdown: [
        "These are the rates and terms I quote, so every proposal and every project in this workspace uses the same numbers.",
        "",
        "## Day rates",
        "- Product design and design systems: $950 per day.",
        "- User research and workshops: $900 per day.",
        "- UX reviews and audits: $850 per day.",
        "",
        "## Terms",
        "- I quote a number of days per project; the project fee is day rate times days.",
        "- Existing clients with more than 20 days a year get 5 percent off the day rate.",
        "- Half of the fee is due at the start, the rest on delivery. Billing happens in my invoicing tool, not here.",
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
      subject: "Dispatcher dashboard – first screens",
      messages: [
        "Hi Dan,\n\nThe first dispatcher screens are ready. Could you and Chris look at them before Thursday? I would like your feedback on the map view before I continue.\n\nBest,\nMax",
        "Hi Max,\n\nThanks, they look promising. Chris is travelling until Wednesday, so our feedback will come on Thursday.\n\nDan",
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
  countryCode: "de",
  company: "Feldmark Produktdesign",
  workspaceName: "Selbstständige",
  website: "https://feldmark-design.example",
  phones: { mobile: { templates: ["+49 30 23125 ###"], start: 300 } },
  selfTitle: "Freiberuflicher UX- und Produktdesigner",
  lists: {
    organization: ["Kunde", "Kunden", "Unternehmen, für die ich arbeite oder mit denen ich über Projekte spreche."],
    contact: ["Kontakt", "Kontakte", "Meine Ansprechpersonen bei den Kunden."],
    deal: ["Anfrage", "Anfragen", "Mögliche Projekte, von der ersten Nachricht bis zur Entscheidung des Kunden."],
    project: ["Projekt", "Projekte", "Zugesagte Arbeit mit Tagessatz, Tagen und berechnetem Honorar."],
    task: ["Aufgabe", "Aufgaben", "Was ich zugesagt habe, mit Fälligkeitsdatum."],
  },
  fields: {
    dealValue: "Geschätzter Wert",
    weightedValue: "Gewichteter Wert",
    relationship: "Zusammenarbeit",
    clientSince: "Kunde seit",
    nextAction: "Nächster Schritt",
    nextActionDate: "Datum nächster Schritt",
    totalFees: "Honorare gesamt",
    address: "Adresse",
    brief: "Briefing",
    files: "Dateien",
    website: "Website",
    jobTitle: "Position",
    workType: "Art der Arbeit",
    source: "Herkunft",
    decisionDate: "Entscheidungsdatum",
    projectStatus: "Status",
    dayRate: "Tagessatz",
    days: "Tage",
    fee: "Honorar",
    start: "Start",
    deadline: "Abgabe",
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
    projectStatus: {
      planned: "Geplant",
      inProgress: "In Arbeit",
      waiting: "Wartet auf Feedback",
      done: "Fertig",
      billed: "Abgerechnet",
    },
  },
  stages: {
    inquiry: "Anfrage",
    firstCall: "Erstgespräch",
    proposal: "Angebot gesendet",
    won: "Zugesagt",
    lost: "Verloren",
  },
  organizations: {
    tidewater: [
      "Hafenblick Analytics GmbH",
      "Hamburg",
      "hafenblick-analytics.example",
      "Angebot mit Katrin Vogt durchgehen",
    ],
    brightpath: ["Lernpfad Bildung GmbH", "Leipzig", "lernpfad-bildung.example", "Kick-off-Workshop zum Onboarding"],
    corvid: [
      "Rabe Flottensoftware",
      "Bremen",
      "rabe-flotte.example",
      "Stefan Brandt die ersten Screens der Disposition zeigen",
    ],
    meadow: [
      "Wiesental Versicherung",
      "Stuttgart",
      "wiesental-versicherung.example",
      "Zum Angebot Schadenmeldung nachfassen",
    ],
    quill: ["Feder & Konto", "Frankfurt am Main", "feder-konto.example", "Umfang mit Nina Hartmann klären"],
    fernhill: ["Sonnenhang Energie", "Freiburg", "sonnenhang-energie.example", "Anfrage von Sebastian Ott beantworten"],
    atlas: ["Nordlicht Mobility", "Kiel", "nordlicht-mobility.example", ""],
    juniper: [
      "Wacholder Reisen",
      "München",
      "wacholder-reisen.example",
      "Andreas Roth nach aktuellen Nutzungszahlen fragen",
    ],
  },
  addresses: {
    tidewater: ["Am Sandtorkai 41", "20457", "", 53.54331, 9.98912],
    brightpath: ["Nikolaistraße 28", "04109", "", 51.34103, 12.37475],
    corvid: ["Am Wall 175", "28195", "", 53.07768, 8.80572],
    meadow: ["Königstraße 26", "70173", "", 48.77781, 9.17953],
    quill: ["Zeil 81", "60311", "", 50.11174, 8.68332],
    fernhill: ["Bertoldstraße 45", "79098", "", 47.99502, 7.84773],
    atlas: ["Holstenstraße 64", "24103", "", 54.32118, 10.13221],
    juniper: ["Sendlinger Straße 12", "80331", "", 48.13513, 11.57193],
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
    tidewaterDesignSystem: ["Hafenblick – Audit des Designsystems", "Projekt gestartet"],
    brightpathOnboarding: ["Lernpfad – Onboarding für Lehrkräfte", "Projekt gestartet"],
    brightpathMobile: ["Lernpfad – Usability-Review der Mobile-App", "Tobias Wendt zwei Umfangsvarianten schicken"],
    corvidDispatch: ["Rabe – Dashboard für die Disposition", "Projekt gestartet"],
    meadowClaims: ["Wiesental – Neugestaltung der Schadenmeldung", "Bei Julia Kramer zum Angebot nachfassen"],
    meadowPortal: ["Wiesental – Redesign des Maklerportals", "An ein internes Team verloren"],
    quillOnboarding: ["Feder & Konto – Prototyp für das App-Onboarding", "Umfang mit Nina Hartmann telefonisch klären"],
    fernhillTariff: ["Sonnenhang – Tarifvergleich auf der Website", "Sebastian Ott mögliche Starttermine nennen"],
    atlasRider: ["Nordlicht – Redesign der Fahrgast-App", "Am Budget gescheitert"],
    juniperRefresh: ["Wacholder – Auffrischung des Reiseplaners", "Andreas Roth nach aktuellen Nutzungszahlen fragen"],
  },
  projects: {
    tidewaterAudit: "Hafenblick – Audit des Designsystems",
    brightpathOnboardingFlow: "Lernpfad – Onboarding für Lehrkräfte",
    corvidDispatchDesign: "Rabe – Dashboard für die Disposition",
    juniperCheckout: "Wacholder – UX-Audit des Bezahlvorgangs",
    meadowAccessibility: "Wiesental – Barrierefreiheits-Review des Kundenbereichs",
    brightpathQuiz: "Lernpfad – Quiz-Baukasten für Lehrkräfte",
  },
  tasks: {
    walkthroughPrep: "Durchsprache des Phase-2-Angebots für Katrin Vogt vorbereiten",
    scopeOptions: "Zwei Umfangsvarianten für das Mobile-Review ausarbeiten",
    kickoffAgenda: "Agenda für den Kick-off-Workshop entwerfen",
    followUpLaura: "Bei Julia Kramer zum Angebot Schadenmeldung nachfassen",
    replySam: "Anfrage von Sebastian Ott mit möglichen Startterminen beantworten",
    reviewQuillScreens: "Aktuelle Onboarding-Screens von Feder & Konto sichten",
    testimonial: "Katrin Vogt um ein kurzes Referenzzitat bitten",
    corvidCheckIn: "Quartalsgespräch mit Stefan Brandt führen",
  },
  views: {
    clients: "Kundenliste",
    inquiries: "Anfragen nach Phase",
    projects: "Projekte",
    nextActions: "Nächste Schritte",
    openTasks: "Offene Aufgaben",
    calendar: "Projektkalender",
  },
  widgets: {
    openQuotes: "Offene Angebote",
    running: "Honorare laufender Projekte",
    fees: "Honorare der letzten 12 Monate",
    overdueTasks: "Überfällige Aufgaben",
    byStage: "Anfragewert nach Phase",
    byStatus: "Projekte nach Status",
    byClient: "Honorare nach Kunde",
    feesByMonth: "Honorare nach Startmonat",
    nextActions: "Nächste Schritte, 14 Tage",
    tasksMonth: "Offene Aufgaben im Monat",
  },
  files: {
    fernhillBrief: {
      name: "Briefing Sonnenhang.pdf",
      lines: [
        "# Sonnenhang Energie – Briefing: Tarifvergleich",
        "Von Sebastian Ott, Marketingleiter.",
        "## Das Problem",
        "Viele Besucher verlassen unseren Tarifvergleich im zweiten Schritt, wenn sie ihren Jahresverbrauch eingeben.",
        "| Schritt | Besucher | Weiter |",
        "| 1. Postleitzahl | 10.000 | 74 % |",
        "| 2. Jahresverbrauch | 7.400 | 38 % |",
        "| 3. Tarif wählen | 2.800 | 61 % |",
        "## Was wir brauchen",
        "Einen Blick von außen mit einigen Nutzerinterviews, danach ein Redesign des Tarifvergleichs, das unsere Entwickler umsetzen können.",
        "## Zeitrahmen und Budget",
        "Start in den nächsten zwei Monaten; Budget etwa 6.000 €.",
      ],
    },
    juniperBrief: {
      name: "Briefing Reiseplaner.docx",
      lines: [
        "# Wacholder Reisen – Auffrischung des Reiseplaners",
        "## Ziel",
        "Weniger abgebrochene Reisepläne auf dem Smartphone; der Planer wurde zuletzt vor vier Jahren überarbeitet.",
        "## Auftrag",
        "Ein kurzes UX-Review mit konkreten Verbesserungen, wie beim Audit des Bezahlvorgangs, mit Vorher-nachher-Tabellen im Stil eines Tarifvergleichs.",
        "## Budget",
        "Etwa 3.500 €.",
      ],
    },
    tidewaterProposal: {
      name: "Angebot Phase 2.pdf",
      lines: [
        "# Hafenblick Analytics – Redesign Dashboard, Phase 2",
        "Erstellt für Katrin Vogt und Jan Petersen.",
        "## Umfang",
        "| Teil | Tage | Honorar |",
        "| Nutzerforschung: fünf Kundeninterviews | 5 | 4.500 € |",
        "| Gestaltung des neuen Dashboards | 10 | 9.500 € |",
        "| Gesamt | 15 | 14.000 € |",
        "Mit drei statt fünf Interviews dauert die Forschung 3 Tage (2.700 €).",
      ],
    },
    tidewaterFindings: {
      name: "Ergebnisse Usability-Test.md",
      lines: [
        "# Ergebnisse Usability-Test – Audit des Designsystems",
        "## Was funktioniert",
        "Buttons und Formularfelder sind im ganzen Produkt einheitlich.",
        "## Was nicht",
        "Drei verschiedene Datumsauswahlen; Tabellen nutzen vier Abstandsskalen.",
        "## Als Nächstes",
        "Zuerst die Datumsauswahlen zusammenführen; die Berichtstabellen folgen dem getesteten Layout aus dem Tarifvergleich.",
      ],
    },
    corvidFeedback: {
      name: "Erste Screens – Feedback.md",
      lines: [
        "# Erste Screens der Disposition – Feedback",
        "## Stefan Brandt",
        "Die Kartenansicht ist der richtige Einstieg; die Auftragsliste braucht den nächsten Halt des Fahrers.",
        "## Christian Weiß",
        "Filter sollen beim Tageswechsel erhalten bleiben. Feedback zur Schichtansicht folgt am Donnerstag.",
      ],
    },
    interviews: {
      name: "Interviewplan.xlsx",
    },
  },
  interviewRows: [
    ["Lehrkraft", "Schule", "Tag", "Uhrzeit"],
    ["Interview 1", "Oberschule am Auwald", "Montag", "15:30"],
    ["Interview 2", "Grundschule Lindenau", "Dienstag", "16:00"],
    ["Interview 3", "Gymnasium am Rosental", "Mittwoch", "15:00"],
    ["Interview 4", "Gemeinschaftsschule Connewitz", "Donnerstag", "16:30"],
  ],
  calendar: {
    name: "Kundentermine",
    events: [
      "Angebot Phase 2 mit Hafenblick durchgehen",
      "Kick-off-Workshop bei Lernpfad",
      "Umfang klären mit Feder & Konto",
      "Feedback zu den Dispositions-Screens mit Rabe",
    ],
  },
  trash: { contact: "Sebastian Ott", deal: "Nordlicht – Audit der Fahrer-App" },
  mate: {
    title: "Anfrage aus dem Sonnenhang-Briefing",
    question:
      "Im Anhang ist das Briefing Sonnenhang.pdf. Lege daraus eine Anfrage an und schlage zwei Starttermine vor.",
    answer:
      "Erledigt. Ich habe die Anfrage **Sonnenhang – Tarifvergleich auf der Website** in der Phase Anfrage angelegt, verknüpft mit Sonnenhang Energie und Sebastian Ott, mit einem geschätzten Wert von 6.000 € und der Herkunft Empfehlung (Herr Ott kam über Wiesental zu Ihnen). Das Briefing Sonnenhang.pdf hängt im Feld „Briefing“ der Anfrage.\n\nAus dem Briefing: Im zweiten Schritt des Tarifvergleichs (Jahresverbrauch) machen nur 38 % weiter. Herr Ott wünscht einige Nutzerinterviews und ein Redesign, Start in den nächsten zwei Monaten, Budget etwa 6.000 €. Bei 900 € pro Tag für Forschung und 950 € für Gestaltung sind das etwa 6–7 Tage.\n\n**Projektkalender:**\n- Hafenblick – Audit des Designsystems läuft bis zur Abgabe in gut dreieinhalb Wochen.\n- Rabe – Dashboard für die Disposition wartet auf Feedback und endet in etwa zehn Tagen.\n- Lernpfad – Onboarding für Lehrkräfte läuft noch fünf bis sechs Wochen.\n\n**Zwei mögliche Starttermine:**\n1. Der Montag nach der Abgabe bei Rabe, zwei Tage pro Woche neben Lernpfad und Hafenblick.\n2. Der Montag nach der Abgabe des Hafenblick-Audits, drei Tage pro Woche.\n\nAls nächsten Schritt habe ich „Sebastian Ott mögliche Starttermine nennen“ eingetragen. Ihre Antwort im Verlauf ist noch ein Entwurf, es wurde nichts gesendet.",
  },
  routines: {
    mondayPlan: {
      name: "Wochenplan am Montag",
      task: "Schreibe jeden Montagmorgen eine Zusammenfassung meiner Woche, ohne etwas zu ändern. Lies Kunden und Anfragen, deren konfiguriertes Datum nächster Schritt in den nächsten sieben Tagen liegt oder verstrichen ist, Projekte mit dem Status In Arbeit oder Wartet auf Feedback samt Abgabe sowie offene Aufgaben nach Fälligkeit. Gliedere die Zusammenfassung nach Tagen, nenne Kunde und nächsten Schritt und stelle Überfälliges an den Anfang. Höchstens 300 Wörter. Ändere keinen Datensatz, keinen Entwurf und keine Einstellung.",
      runs: [
        "6 nächste Schritte und 2 Projektabgaben für diese Woche aufgelistet; 2 Punkte waren überfällig.",
        "4 nächste Schritte und 1 Projektabgabe aufgelistet; nichts war überfällig.",
      ],
      note: "Ich konnte den Modellanbieter bei diesem Versuch nicht erreichen und habe aufgehört, bevor ich etwas gelesen habe. Nichts wurde geändert; der Lauf am nächsten Montag deckt die Woche ab.",
    },
    draftInquiryReply: {
      name: "Antwortentwürfe für neue Anfragen",
      task: "Prüfe die neue E-Mail aus routine_trigger. Fahre nur fort, wenn der Absender über seine Identitätskanäle keinem vorhandenen Kontakt entspricht oder die E-Mail nach neuer Arbeit fragt. Lies den Projektkalender: Projekte mit dem Status Geplant, In Arbeit oder Wartet auf Feedback von Start bis Abgabe, um die ersten freien Wochen zu finden. Speichere mit save_message_draft einen kurzen Antwortentwurf, der sich bedankt, nach Ziel, Zeitrahmen und Budgetrahmen fragt und zwei mögliche Starttermine nennt. Ein vorhandener Entwurf bleibt erhalten. Der Entwurf ist zu meiner Prüfung; sende ihn nie und ändere keine CRM-Daten.",
      runs: [
        "Antwortentwurf für Sebastian Ott von Sonnenhang Energie mit zwei möglichen Startterminen vorbereitet.",
        "Die E-Mail kam von einem Bestandskunden zu laufender Arbeit, ein Entwurf war nicht nötig.",
      ],
    },
    quietClients: {
      name: "Bei ruhigen Kunden melden",
      task: 'Finde am Monatsersten Kunden mit der Zusammenarbeit Laufend oder Gelegentlich, die kein Projekt mit dem Status Geplant, In Arbeit oder Wartet auf Feedback haben. Lies für jeden das letzte Projekt und das zuletzt verknüpfte Gespräch. Hat der Kunde eine E-Mail-Identität, speichere mit save_message_draft einen kurzen Entwurf, der an das letzte Projekt anknüpft; sonst lege eine Aufgabe "Bei <Kundenname> melden" mit Fälligkeit in dieser Woche an. Keine zweite Aufgabe und kein zweiter Entwurf für denselben Kunden. Sende nie eine Nachricht.',
      runs: [
        "2 Entwürfe für Wacholder Reisen und Wiesental Versicherung vorbereitet.",
        "Aufgabe für Nordlicht Mobility angelegt, dort ist keine E-Mail-Adresse hinterlegt.",
      ],
      note: "Ich konnte den Modellanbieter bei diesem Versuch nicht erreichen und habe aufgehört, bevor ich etwas gelesen habe. Nichts wurde geändert; der nächste Lauf am Monatsersten versucht es erneut.",
    },
  },
  wiki: {
    guide: {
      title: "Arbeitsleitfaden",
      markdown: [
        "Max Bergmann arbeitet allein als Feldmark Produktdesign, UX- und Produktdesigner für wenige B2B-Kunden, die meisten davon seit mehreren Jahren. Dieser Arbeitsbereich enthält Demodaten; alle Unternehmen und Personen sind frei erfunden.",
        "",
        "## Was in diesem Arbeitsbereich steht",
        "- **Kunden** sind die Unternehmen, für die ich arbeite oder mit denen ich spreche. Die Kundenliste zeigt, seit wann wir zusammenarbeiten, wie eng die Zusammenarbeit ist, die Summe meiner Honorare und den nächsten Schritt.",
        "- **Kontakte** sind meine Ansprechpersonen bei diesen Kunden.",
        "- **Anfragen** sind mögliche Projekte, von der ersten Nachricht bis zur Entscheidung des Kunden. Der Wert ist meine Schätzung für das Projekt; der gewichtete Wert ist diese Schätzung mal der Wahrscheinlichkeit der Phase.",
        "- **Projekte** sind zugesagte Arbeit. Das Honorar ergibt sich aus Tagessatz mal Tagen. Der Status Abgerechnet ist nur eine Markierung: Die Abrechnung bleibt in meinem Rechnungsprogramm.",
        "- **Aufgaben** sind Dinge, die ich zugesagt habe, mit Fälligkeitsdatum. Aufgaben, nächste Schritte und ihre Daten sind normale Felder: Niemand wird automatisch daran erinnert, deshalb schaue ich jeden Morgen in die Ansicht Nächste Schritte, und Mate schreibt montags einen Wochenplan.",
        "- Eine E-Mail oder ein WhatsApp-Chat gehört nur dann zu einem Kunden oder einer Anfrage, wenn ich ihn dort verknüpfe.",
        "",
        "## Was woanders bleibt",
        "- Abrechnung und Buchhaltung bleiben in den Programmen, die ich schon nutze. Hier stehen die Kundenbeziehungen, die offenen Anfragen und die laufende Arbeit.",
        "- Briefings von Kunden liegen im Feld „Briefing“ der Anfrage, Angebote und Projektunterlagen in den Dateien des Projekts, damit Suche und Mate sie über ihren Text finden. Der Projektkalender zeigt jedes Projekt von Start bis Abgabe.",
      ],
    },
    stages: {
      title: "Phasen einer Anfrage",
      markdown: [
        "Jede Anfrage durchläuft dieselben Phasen, damit die Tafel auf einen Blick zeigt, wo ein mögliches Projekt steht. Zugesagte Arbeit geht als Projekt weiter.",
        "",
        "## Phasen",
        "1. **Anfrage:** Jemand fragt nach einem Projekt. Kunde, Ansprechperson und einen groben Wert anlegen.",
        "2. **Erstgespräch:** Wir haben über Ziele, Zeitrahmen und Entscheider gesprochen.",
        "3. **Angebot gesendet:** Umfang und meine Schätzung sind per E-Mail raus.",
        "4. **Zugesagt:** Der Kunde hat zugesagt. Das Projekt mit Tagessatz, Tagen, Start und Abgabe anlegen und mit Kunde und Anfrage verknüpfen.",
        "5. **Verloren:** Der Kunde hat sich dagegen entschieden oder meldet sich nicht mehr. Den Grund in den Notizen festhalten.",
      ],
    },
    afterCall: {
      title: "Nach einem Erstgespräch",
      whenToUse: "Wenn das erste Telefonat oder Treffen zu einem neuen Projekt stattgefunden hat.",
      markdown: [
        "Nach einem Erstgespräch gibt es Notizen, eine genauere Schätzung und eine Zusage, sich zu melden. Diese Schritte halten alles bei der Anfrage fest.",
        "",
        "## Schritte",
        "1. Ziele, Zeitrahmen und offene Fragen in die Notizen der Anfrage schreiben.",
        "2. Die Anfrage auf Erstgespräch setzen und den geschätzten Wert anpassen.",
        "3. Nächsten Schritt und Datum bei der Anfrage und beim Kunden eintragen.",
        "4. Die E-Mail oder den WhatsApp-Chat mit dem Kunden mit der Anfrage verknüpfen.",
      ],
    },
    rates: {
      title: "Meine Tagessätze und Konditionen",
      markdown: [
        "Das sind die Tagessätze und Konditionen, die ich anbiete, damit jedes Angebot und jedes Projekt hier mit denselben Zahlen rechnet.",
        "",
        "## Tagessätze",
        "- Produktdesign und Designsysteme: 950 € pro Tag.",
        "- Nutzerforschung und Workshops: 900 € pro Tag.",
        "- UX-Reviews und Audits: 850 € pro Tag.",
        "",
        "## Konditionen",
        "- Ich biete eine Anzahl Tage pro Projekt an; das Honorar ist Tagessatz mal Tage.",
        "- Bestandskunden mit mehr als 20 Tagen im Jahr erhalten 5 Prozent auf den Tagessatz.",
        "- Die Hälfte des Honorars ist zum Start fällig, der Rest bei Abgabe. Abgerechnet wird im Rechnungsprogramm, nicht hier.",
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
      subject: "Dashboard Disposition – erste Screens",
      messages: [
        "Hallo Herr Brandt,\n\ndie ersten Screens für die Disposition sind fertig. Könnten Sie und Herr Weiß sie sich bis Donnerstag ansehen? Ihr Feedback zur Kartenansicht hätte ich gern, bevor ich weitermache.\n\nViele Grüße\nMax Bergmann",
        "Hallo Herr Bergmann,\n\ndanke, das sieht vielversprechend aus. Herr Weiß ist bis Mittwoch unterwegs, unser Feedback kommt deshalb am Donnerstag.\n\nViele Grüße\nStefan Brandt",
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
  corvid: { relationship: "occasional", since: -110, next: 4, createdDaysAgo: 115 },
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
    next: 9,
    moves: [
      [30, "inquiry"],
      [8, "firstCall"],
    ],
  },
  tidewaterDesignSystem: {
    organization: "tidewater",
    contacts: ["priya"],
    stage: "won",
    value: 11400,
    workType: "designSystem",
    source: "repeat",
    createdDaysAgo: 60,
    decision: -28,
    moves: [
      [50, "inquiry"],
      [42, "firstCall"],
      [28, "proposal"],
    ],
  },
  brightpathOnboarding: {
    organization: "brightpath",
    contacts: ["rachel", "tom"],
    stage: "won",
    value: 9900,
    workType: "productDesign",
    source: "repeat",
    createdDaysAgo: 35,
    decision: -8,
    moves: [
      [28, "inquiry"],
      [18, "firstCall"],
      [8, "proposal"],
    ],
  },
  brightpathMobile: {
    organization: "brightpath",
    contacts: ["tom"],
    stage: "firstCall",
    value: 4200,
    workType: "review",
    source: "repeat",
    createdDaysAgo: 12,
    decision: 20,
    next: 8,
    moves: [[5, "inquiry"]],
  },
  corvidDispatch: {
    organization: "corvid",
    contacts: ["dan", "chris"],
    stage: "won",
    value: 9000,
    workType: "productDesign",
    source: "repeat",
    createdDaysAgo: 45,
    decision: -27,
    moves: [
      [38, "inquiry"],
      [32, "firstCall"],
      [27, "proposal"],
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
    next: -2,
    moves: [
      [20, "inquiry"],
      [9, "firstCall"],
    ],
  },
  meadowPortal: {
    organization: "meadow",
    contacts: ["laura"],
    stage: "lost",
    value: 7800,
    workType: "productDesign",
    source: "repeat",
    createdDaysAgo: 150,
    decision: -95,
    moves: [
      [142, "inquiry"],
      [120, "firstCall"],
      [95, "proposal"],
    ],
  },
  quillOnboarding: {
    organization: "quill",
    contacts: ["nina"],
    stage: "firstCall",
    value: 7000,
    workType: "productDesign",
    source: "referral",
    createdDaysAgo: 18,
    decision: 25,
    next: 13,
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
    next: 7,
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
      [60, "firstCall"],
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
    next: 10,
  },
};

const PROJECT_FACTS: Record<
  ProjectKey,
  {
    client: OrganizationKey;
    inquiry?: DealKey;
    status: string;
    dayRate: number;
    days: number;
    start: number;
    deadline: number;
    createdDaysAgo: number;
    /** Status changes as `[daysAgo, previous status]`, oldest first. */
    moves: Array<[number, string]>;
  }
> = {
  tidewaterAudit: {
    client: "tidewater",
    inquiry: "tidewaterDesignSystem",
    status: "inProgress",
    dayRate: 950,
    days: 12,
    start: -20,
    deadline: 25,
    createdDaysAgo: 27,
    moves: [[20, "planned"]],
  },
  brightpathOnboardingFlow: {
    client: "brightpath",
    inquiry: "brightpathOnboarding",
    status: "inProgress",
    dayRate: 900,
    days: 11,
    start: -6,
    deadline: 40,
    createdDaysAgo: 8,
    moves: [[6, "planned"]],
  },
  corvidDispatchDesign: {
    client: "corvid",
    inquiry: "corvidDispatch",
    status: "waiting",
    dayRate: 900,
    days: 10,
    start: -25,
    deadline: 10,
    createdDaysAgo: 27,
    moves: [
      [25, "planned"],
      [3, "inProgress"],
    ],
  },
  juniperCheckout: {
    client: "juniper",
    status: "done",
    dayRate: 850,
    days: 6,
    start: -60,
    deadline: -30,
    createdDaysAgo: 65,
    moves: [
      [60, "planned"],
      [30, "inProgress"],
    ],
  },
  meadowAccessibility: {
    client: "meadow",
    status: "done",
    dayRate: 850,
    days: 5,
    start: -100,
    deadline: -80,
    createdDaysAgo: 105,
    moves: [
      [100, "planned"],
      [80, "inProgress"],
    ],
  },
  brightpathQuiz: {
    client: "brightpath",
    status: "billed",
    dayRate: 950,
    days: 8,
    start: -150,
    deadline: -110,
    createdDaysAgo: 155,
    moves: [
      [150, "planned"],
      [110, "inProgress"],
      [100, "done"],
    ],
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
  followUpLaura: { status: "open", due: -3, deal: "meadowClaims", contact: "laura", createdDaysAgo: 3 },
  replySam: { status: "inProgress", due: 1, deal: "fernhillTariff", contact: "sam", createdDaysAgo: 1 },
  reviewQuillScreens: { status: "open", due: 3, deal: "quillOnboarding", contact: "nina", createdDaysAgo: 2 },
  testimonial: { status: "done", due: -10, organization: "tidewater", contact: "priya", createdDaysAgo: 30, done: 9 },
  corvidCheckIn: { status: "open", due: -5, organization: "corvid", contact: "dan", createdDaysAgo: 20 },
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
  story: {
    en: { currency: "USD", timeZone: "America/New_York" },
    de: { currency: "EUR", timeZone: "Europe/Berlin" },
  },
  build: (t) => {
    const phone = (index: number) => phoneNumber(t.phones.mobile, index);
    const open = ["inquiry", "firstCall", "proposal"];
    const label = <K extends string>(
      options: Record<K, string>,
      colors: Record<K, "default" | "secondary" | "destructive" | "success" | "warning" | "info">,
    ) => (Object.keys(options) as K[]).map((key) => ({ key, label: options[key], color: colors[key] }));

    const organization: RecordSpec[] = ORGANIZATIONS.map((key) => {
      const facts = ORGANIZATION_FACTS[key];
      const [name, city, domain, nextAction] = t.organizations[key];
      const [street, postalCode, region, lat, lon] = t.addresses[key];
      return {
        key,
        values: {
          name,
          relationship: facts.relationship,
          address: address({
            street,
            postalCode,
            city,
            ...(region ? { region } : {}),
            countryCode: t.countryCode,
            lat,
            lon,
          }),
          website: `https://${domain}`,
          ...(facts.since === undefined ? {} : { clientSince: day(facts.since) }),
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
        values: { firstName, lastName, jobTitle },
        links: { "contact.organizations": facts.organization },
        owner: "maxBergmann",
        channels: {
          email: `${mailbox(firstName)}.${mailbox(lastName)}@${domain}`,
          phone: mobile,
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
    const project: RecordSpec[] = PROJECTS.map((key) => {
      const facts = PROJECT_FACTS[key];
      return {
        key,
        values: {
          name: t.projects[key],
          status: facts.status,
          dayRate: facts.dayRate,
          days: facts.days,
          start: day(facts.start),
          deadline: day(facts.deadline),
        },
        links: {
          "project.client": facts.client,
          ...(facts.inquiry ? { "project.inquiry": facts.inquiry } : {}),
        },
        owner: "maxBergmann",
        createdDaysAgo: facts.createdDaysAgo,
        history: facts.moves.map(([daysAgo, previous]) => ({ daysAgo, previous: { status: previous } })),
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

    const file = (
      key: Exclude<keyof Strings["files"], "interviews">,
      record: string,
      kind: FileSpec["kind"],
      uploadedDaysAgo: number,
    ): FileSpec => ({
      key,
      record,
      field: record.startsWith("deal:") ? "deal.brief" : "project.files",
      name: t.files[key].name,
      kind,
      lines: t.files[key].lines,
      uploadedDaysAgo,
    });
    const thread = t.threads;
    const routine = t.routines;
    return {
      workspaceName: t.workspaceName,
      valueLabels: { value: t.fields.dealValue, weighted: t.fields.weightedValue },
      companyName: t.company,
      lists: (["organization", "contact", "deal", "project", "task"] as const).map((key) => ({
        key,
        label: t.lists[key][0],
        pluralLabel: t.lists[key][1],
        description: t.lists[key][2],
        icon: { organization: "building", contact: "contact", deal: "handshake", project: "briefcase", task: "check" }[
          key
        ],
      })),
      fields: [
        {
          key: "organization.relationship",
          label: t.fields.relationship,
          type: "select",
          options: label(t.options.relationship, { ongoing: "success", occasional: "info", new: "warning" }),
        },
        { key: "organization.clientSince", label: t.fields.clientSince, type: "date" },
        { key: "organization.nextAction", label: t.fields.nextAction, type: "text" },
        { key: "organization.nextActionDate", label: t.fields.nextActionDate, type: "date" },
        {
          key: "organization.totalFees",
          label: t.fields.totalFees,
          type: "currency",
          formula: { kind: "rollupSum", relation: "project.client", field: "project.fee" },
        },
        { key: "organization.address", label: t.fields.address, type: "address" },
        { key: "organization.website", label: t.fields.website, type: "url" },
        { key: "contact.jobTitle", label: t.fields.jobTitle, type: "text" },
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
        { key: "deal.brief", label: t.fields.brief, type: "file" },
        {
          key: "project.status",
          label: t.fields.projectStatus,
          type: "select",
          options: label(t.options.projectStatus, {
            planned: "secondary",
            inProgress: "info",
            waiting: "warning",
            done: "success",
            billed: "default",
          }),
        },
        { key: "project.dayRate", label: t.fields.dayRate, type: "currency" },
        { key: "project.days", label: t.fields.days, type: "number" },
        {
          key: "project.fee",
          label: t.fields.fee,
          type: "currency",
          formula: { kind: "product", left: "project.dayRate", right: "project.days" },
        },
        { key: "project.start", label: t.fields.start, type: "date" },
        { key: "project.deadline", label: t.fields.deadline, type: "date" },
        { key: "project.files", label: t.fields.files, type: "file" },
        { key: "task.dueDate", label: t.fields.dueDate, type: "date" },
      ],
      stages: [
        { key: "inquiry", label: t.stages.inquiry, color: "secondary", probability: 10 },
        { key: "firstCall", label: t.stages.firstCall, color: "info", probability: 30 },
        { key: "proposal", label: t.stages.proposal, color: "warning", probability: 60 },
        { key: "won", label: t.stages.won, color: "success", probability: 100 },
        { key: "lost", label: t.stages.lost, color: "destructive", probability: 0 },
      ],
      relationships: [
        {
          key: "project.client",
          source: "project",
          target: "organization",
          sourceCardinality: "one",
          targetCardinality: "many",
        },
        {
          key: "project.inquiry",
          source: "project",
          target: "deal",
          sourceCardinality: "one",
          targetCardinality: "many",
        },
      ],
      records: { organization, contact, deal, project, task },
      views: [
        {
          key: "clients",
          list: "organization",
          name: t.views.clients,
          mode: "table",
          columns: [
            "relationship",
            "nextAction",
            "nextActionDate",
            "totalFees",
            "clientSince",
            "contact.organizations",
          ],
          sort: { field: "nextActionDate", direction: "asc" },
        },
        {
          key: "inquiries",
          list: "deal",
          name: t.views.inquiries,
          mode: "board",
          groupBy: "stage",
          columns: ["totalValue", "deal.organizations", "nextActionDate"],
          filters: [{ field: "stage", notIn: ["lost"] }],
        },
        {
          key: "projects",
          list: "project",
          name: t.views.projects,
          mode: "board",
          groupBy: "status",
          columns: ["fee", "project.client", "deadline"],
        },
        {
          key: "nextActions",
          list: "deal",
          name: t.views.nextActions,
          mode: "table",
          columns: ["stage", "nextAction", "nextActionDate", "totalValue", "deal.organizations"],
          filters: [{ field: "stage", in: open }],
          sort: { field: "nextActionDate", direction: "asc" },
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
          key: "calendar",
          list: "project",
          name: t.views.calendar,
          mode: "calendar",
          calendar: { date: "start", end: "deadline", color: "status", mode: "month" },
          columns: ["status", "project.client", "fee"],
        },
      ],
      dashboard: {
        widgets: [
          {
            kind: "kpi",
            title: t.widgets.openQuotes,
            list: "deal",
            aggregation: "sum",
            field: "totalValue",
            filters: [{ field: "stage", in: ["proposal"] }],
          },
          {
            kind: "kpi",
            title: t.widgets.running,
            list: "project",
            aggregation: "sum",
            field: "fee",
            filters: [{ field: "status", in: ["inProgress", "waiting"] }],
          },
          {
            kind: "kpi",
            title: t.widgets.fees,
            list: "project",
            aggregation: "sum",
            field: "fee",
            filters: [{ field: "start", withinDays: 365 }],
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
            kind: "calendar",
            title: t.widgets.nextActions,
            list: "deal",
            layout: "upcoming",
            date: "nextActionDate",
            days: 14,
            amount: "totalValue",
            overdue: true,
            filters: [{ field: "stage", in: open }],
          },
          {
            kind: "chart",
            title: t.widgets.byStatus,
            display: DisplayType.doughnutChart,
            list: "project",
            aggregation: "count",
            groupBy: { field: "status" },
          },
          {
            kind: "chart",
            title: t.widgets.feesByMonth,
            display: DisplayType.areaChart,
            list: "project",
            aggregation: "sum",
            field: "fee",
            groupBy: { month: "start" },
            filters: [{ field: "start", withinDays: 365 }],
          },
          {
            kind: "calendar",
            title: t.widgets.tasksMonth,
            list: "task",
            layout: "month",
            date: "dueDate",
            filters: [{ field: "status", notIn: ["done", "archived"] }],
          },
          {
            kind: "chart",
            title: t.widgets.byClient,
            display: DisplayType.horizontalBarChartWithLabels,
            list: "project",
            aggregation: "sum",
            field: "fee",
            groupBy: { relation: "project.client" },
          },
        ],
      },
      wiki: [
        { key: "guide", kind: "guide", title: t.wiki.guide.title, markdown: t.wiki.guide.markdown },
        { key: "stages", kind: "knowledge", title: t.wiki.stages.title, markdown: t.wiki.stages.markdown },
        {
          key: "afterCall",
          kind: "procedure",
          title: t.wiki.afterCall.title,
          whenToUse: t.wiki.afterCall.whenToUse,
          markdown: t.wiki.afterCall.markdown,
        },
        { key: "rates", kind: "knowledge", title: t.wiki.rates.title, markdown: t.wiki.rates.markdown },
      ],
      routines: [
        {
          key: "mondayPlan",
          name: routine.mondayPlan.name,
          task: routine.mondayPlan.task,
          trigger: { kind: "schedule", cron: "0 8 * * 1" },
          runs: [
            {
              status: "succeeded",
              startedHoursAgo: 50,
              durationSeconds: 58,
              credits: 8,
              summary: routine.mondayPlan.runs[0],
            },
            {
              status: "failed",
              startedHoursAgo: 218,
              durationSeconds: 9,
              credits: 1,
              error: "providerUnavailable",
              note: routine.mondayPlan.note,
            },
            {
              status: "succeeded",
              startedHoursAgo: 386,
              durationSeconds: 61,
              credits: 8,
              summary: routine.mondayPlan.runs[1],
            },
          ],
        },
        {
          key: "draftInquiryReply",
          name: routine.draftInquiryReply.name,
          task: routine.draftInquiryReply.task,
          trigger: { kind: "event", events: ["messaging.email.received"], debounceSeconds: 300, sample: { thread: 2 } },
          runs: [
            {
              status: "succeeded",
              startedHoursAgo: 2,
              durationSeconds: 72,
              credits: 11,
              summary: routine.draftInquiryReply.runs[0],
            },
            {
              status: "succeeded",
              startedHoursAgo: 75,
              durationSeconds: 24,
              credits: 4,
              summary: routine.draftInquiryReply.runs[1],
            },
          ],
        },
        {
          key: "quietClients",
          name: routine.quietClients.name,
          task: routine.quietClients.task,
          trigger: { kind: "schedule", cron: "0 8 1 * *" },
          runs: [
            {
              status: "succeeded",
              startedHoursAgo: 530,
              durationSeconds: 84,
              credits: 13,
              summary: routine.quietClients.runs[0],
            },
            {
              status: "failed",
              startedHoursAgo: 1250,
              durationSeconds: 11,
              credits: 1,
              error: "providerUnavailable",
              note: routine.quietClients.note,
            },
            {
              status: "succeeded",
              startedHoursAgo: 1251,
              durationSeconds: 79,
              credits: 12,
              summary: routine.quietClients.runs[1],
            },
          ],
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
            links: ["deal:corvidDispatch", "organization:corvid"],
          },
        ],
        calendar: {
          name: t.calendar.name,
          events: [
            {
              title: t.calendar.events[0],
              with: ["priya", "marcus"],
              startsMinutesAgo: -3 * 24 * 60,
              durationMinutes: 60,
            },
            {
              title: t.calendar.events[1],
              with: ["rachel", "tom"],
              startsMinutesAgo: -5 * 24 * 60,
              durationMinutes: 120,
            },
            { title: t.calendar.events[2], with: ["nina"], startsMinutesAgo: -6 * 24 * 60, durationMinutes: 30 },
            {
              title: t.calendar.events[3],
              with: ["dan", "chris"],
              startsMinutesAgo: -9 * 24 * 60,
              durationMinutes: 45,
            },
          ],
        },
      },
      files: [
        file("fernhillBrief", "deal:fernhillTariff", "pdf", 2),
        file("juniperBrief", "deal:juniperRefresh", "docx", 6),
        file("tidewaterProposal", "project:tidewaterAudit", "pdf", 9),
        file("tidewaterFindings", "project:tidewaterAudit", "md", 4),
        file("corvidFeedback", "project:corvidDispatchDesign", "md", 3),
        {
          key: "interviews",
          record: "project:brightpathOnboardingFlow",
          field: "project.files",
          name: t.files.interviews.name,
          kind: "xlsx",
          rows: t.interviewRows,
          uploadedDaysAgo: 5,
        },
      ],
      planner: {
        sources: [
          { list: "project", date: "start", end: "deadline", color: "info" },
          { list: "deal", date: "nextActionDate", filters: [{ field: "stage", in: open }], color: "warning" },
          { list: "organization", date: "nextActionDate", color: "success" },
        ],
        connectedCalendar: true,
        mode: "month",
      },
      trash: [
        { list: "contact", name: t.trash.contact, daysAgo: 3 },
        { list: "deal", name: t.trash.deal, daysAgo: 18 },
      ],
      mateChats: [
        {
          title: t.mate.title,
          endedHoursAgo: 46,
          messages: [
            { role: "user", text: t.mate.question },
            { role: "assistant", text: t.mate.answer },
          ],
        },
      ],
    };
  },
});
