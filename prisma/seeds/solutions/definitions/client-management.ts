import { DisplayType } from "@/features/widget/widget-display.schema";

import {
  groupDigits,
  address,
  day,
  defineSolution,
  rangeAt,
  type AddressInput,
  type FieldInput,
  type FileSpec,
  type RecordSpec,
  phoneNumber,
} from "../define-solution";
import { agentApiKeys, agentEdited, agentsPage, type AgentsPageText, type AgentKeyName } from "../agent-native";
import { inboxThreads, type InboxThreadPlan, type InboxThreadText } from "../inbox-threads";
import { es } from "./locales/client-management.es";
import { pt } from "./locales/client-management.pt";
import { pl } from "./locales/client-management.pl";
import { nl } from "./locales/client-management.nl";

/**
 * Client management: an office coffee, breakroom and catering service that looks after many ongoing client
 * relationships with a small account team. Each client carries a relationship status, segment, account manager, last
 * contact and next action date; its contracts (one service at one site, with a monthly fee and a review date) add up
 * to the client's annual value. Opportunities are new sites, extra services and yearly reviews on a short pipeline.
 * The flagship client has four contacts, four contracts across three sites, two opportunities, tasks and two linked
 * conversations. Tasks and next-action dates are ordinary fields; nothing reminds anyone automatically.
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
  "ellen",
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
const CONTRACTS = [
  "halversonCoffee",
  "halversonCatering",
  "halversonWorkshop",
  "halversonWater",
  "meridianCoffee",
  "meridianWater",
  "oakfieldWaterNorth",
  "oakfieldWaterSouth",
  "brightsideCoffee",
  "brightsideSupplies",
  "brightsideEvents",
  "riverbendCoffee",
  "riverbendWater",
  "riverbendCatering",
  "tallisCoffee",
  "tallisSupplies",
  "juniperSupplies",
  "ashcombeCoffee",
] as const;
type ContractKey = (typeof CONTRACTS)[number];
const DEALS = [
  "halversonRenewal",
  "halversonSecondSite",
  "meridianCatering",
  "oakfieldWater",
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
  "oakfieldDispensers",
] as const;
type TaskKey = (typeof TASKS)[number];
type InboxKey =
  | "lisaLinkedin"
  | "anitaLinkedin"
  | "bethLinkedin"
  | "gregUsage"
  | "samMenus"
  | "ellenDispenser"
  | "zoeCheckIn"
  | "priyaTasting"
  | "carlWalkthrough"
  | "owenMove";
type ServiceKey = "coffeeMachines" | "breakroomSupplies" | "catering" | "waterDispensers";
/** Contracts whose signed service agreement is attached. */
const SIGNED_CONTRACTS = [
  "halversonCoffee",
  "halversonCatering",
  "halversonWater",
  "meridianCoffee",
  "brightsideCoffee",
  "riverbendCoffee",
  "tallisCoffee",
  "ashcombeCoffee",
] as const satisfies readonly ContractKey[];

const en = {
  company: "Hollis Office Services",
  workspaceName: "Clients",
  website: "https://hollis-office.example",
  phones: {
    mobile: { templates: ["+1 202 555 01##"], start: 0 },
    office: { templates: ["+1 614 555 01##", "+1 380 555 01##"], start: 40 },
  },
  selfTitle: "Owner and account manager",
  money: (amount: number) => `$${groupDigits(amount, ",")}`,
  members: {
    colleagueA: ["Rachel", "Kim", "rachel.kim@hollis-office.example"],
    colleagueB: ["Daniel", "Brooks", "daniel.brooks@hollis-office.example"],
  },
  lists: {
    organization: ["Client", "Clients", "Offices and sites we look after or talk to."],
    contact: ["Contact", "Contacts", "People at our clients: who decides, who orders, who signs."],
    contract: [
      "Contract",
      "Contracts",
      "One service at one client site, with its monthly fee and review date. Billing stays in the accounting tool.",
    ],
    deal: ["Opportunity", "Opportunities", "New sites, extra services and yearly reviews we are discussing."],
    task: ["Task", "Tasks", "Next actions with an owner and a due date."],
  },
  fields: {
    relationshipStatus: "Relationship status",
    segment: "Segment",
    headOffice: "Head office",
    website: "Website",
    sites: "Sites",
    clientSince: "Client since",
    accountManager: "Account manager",
    preferredChannel: "Preferred channel",
    lastContact: "Last contact",
    nextActionDate: "Next action date",
    annualValue: "Annual value",
    jobTitle: "Job title",
    role: "Role",
    service: "Service",
    siteAddress: "Site address",
    signedContract: "Signed contract",
    documents: "Documents",
    scheduled: "Scheduled",
    monthlyFee: "Monthly fee",
    startDate: "Start date",
    reviewDate: "Review date",
    contractStatus: "Status",
    opportunityType: "Type",
    decisionDate: "Expected decision",
    nextStep: "Next step",
    nextStepDate: "Next step date",
    dueDate: "Due date",
    priority: "Priority",
  },
  options: {
    relationshipStatus: {
      newRelationship: "New relationship",
      activeDiscussion: "Active discussion",
      customer: "Customer",
      dormant: "Dormant",
    },
    segment: {
      smallOffice: "Small office (under 50)",
      midsize: "Mid-size office (50–250)",
      largeSite: "Large site (250+)",
      coworking: "Coworking space",
    },
    preferredChannel: { email: "Email", phone: "Phone", whatsapp: "WhatsApp" },
    role: { officeManager: "Office manager", purchasing: "Purchasing", management: "Management" },
    service: {
      coffeeMachines: "Coffee machines",
      breakroomSupplies: "Breakroom supplies",
      catering: "Catering",
      waterDispensers: "Water dispensers",
    } satisfies Record<ServiceKey, string>,
    contractStatus: { active: "Active", reviewDue: "Review due", cancelled: "Cancelled" },
    opportunityType: { newClient: "New client", expansion: "New site or service", renewal: "Yearly review" },
    priority: { low: "Low", medium: "Medium", high: "High" },
  },
  stages: {
    identified: "Identified",
    offerSent: "Offer sent",
    trial: "Tasting / trial",
    agreed: "Agreed",
    notNow: "Not now",
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
    juniper: ["Juniper Architecture Studio", "Newark"],
    westmoor: ["Westmoor Logistics Park", "Grove City"],
    ashcombe: ["Ashcombe Media", "Marysville"],
    kingsley: ["Kingsley Medical Center", "Delaware"],
  } satisfies Record<OrganizationKey, readonly [string, string]>,
  addresses: {
    halverson: address({
      street: "175 S Third St",
      postalCode: "43215",
      city: "Columbus",
      region: "OH",
      countryCode: "us",
      lat: 39.9612,
      lon: -82.9988,
    }),
    meridian: address({
      street: "5500 Frantz Rd",
      postalCode: "43017",
      city: "Dublin",
      region: "OH",
      countryCode: "us",
      lat: 40.11,
      lon: -83.114,
    }),
    oakfield: address({
      street: "6600 N High St",
      postalCode: "43085",
      city: "Worthington",
      region: "OH",
      countryCode: "us",
      lat: 40.1,
      lon: -83.017,
    }),
    brightside: address({
      street: "1150 N High St",
      postalCode: "43201",
      city: "Columbus",
      region: "OH",
      countryCode: "us",
      lat: 39.99,
      lon: -83.006,
    }),
    larkspur: address({
      street: "41 S High St",
      postalCode: "43215",
      city: "Columbus",
      region: "OH",
      countryCode: "us",
      lat: 39.9612,
      lon: -82.9988,
    }),
    riverbend: address({
      street: "600 N State St",
      postalCode: "43081",
      city: "Westerville",
      region: "OH",
      countryCode: "us",
      lat: 40.126,
      lon: -82.929,
    }),
    tallis: address({
      street: "1275 Kinnear Rd",
      postalCode: "43212",
      city: "Columbus",
      region: "OH",
      countryCode: "us",
      lat: 39.987,
      lon: -83.045,
    }),
    greystone: address({
      street: "1500 W Third Ave",
      postalCode: "43212",
      city: "Grandview Heights",
      region: "OH",
      countryCode: "us",
      lat: 39.987,
      lon: -83.045,
    }),
    juniper: address({
      street: "35 N Park Pl",
      postalCode: "43055",
      city: "Newark",
      region: "OH",
      countryCode: "us",
      lat: 40.058,
      lon: -82.401,
    }),
    westmoor: address({
      street: "3700 Southpark Pl",
      postalCode: "43123",
      city: "Grove City",
      region: "OH",
      countryCode: "us",
      lat: 39.881,
      lon: -83.093,
    }),
    ashcombe: address({
      street: "125 N Main St",
      postalCode: "43040",
      city: "Marysville",
      region: "OH",
      countryCode: "us",
      lat: 40.236,
      lon: -83.367,
    }),
    kingsley: address({
      street: "564 W Central Ave",
      postalCode: "43015",
      city: "Delaware",
      region: "OH",
      countryCode: "us",
      lat: 40.299,
      lon: -83.068,
    }),
  } satisfies Record<OrganizationKey, AddressInput>,
  extraSites: {
    workshop: address({
      street: "3800 Southwest Blvd",
      postalCode: "43123",
      city: "Grove City",
      region: "OH",
      countryCode: "us",
      lat: 39.881,
      lon: -83.093,
    }),
    cincinnati: address({
      street: "312 Walnut St",
      postalCode: "45202",
      city: "Cincinnati",
      region: "OH",
      countryCode: "us",
      lat: 39.107,
      lon: -84.505,
    }),
    downtown: address({
      street: "88 E Broad St",
      postalCode: "43215",
      city: "Columbus",
      region: "OH",
      countryCode: "us",
      lat: 39.9612,
      lon: -82.9988,
    }),
    south: address({
      street: "1110 E Main St",
      postalCode: "43130",
      city: "Lancaster",
      region: "OH",
      countryCode: "us",
      lat: 39.715,
      lon: -82.6,
    }),
  } satisfies Record<"workshop" | "cincinnati" | "downtown" | "south", AddressInput>,
  contacts: {
    diane: ["Diane", "Mercer", "Managing partner"],
    tom: ["Tom", "Okafor", "Office manager"],
    priya: ["Priya", "Nair", "Site coordinator, Cincinnati office"],
    greg: ["Greg", "Lawson", "Finance director"],
    karen: ["Karen", "Doyle", "Head of workplace"],
    sam: ["Sam", "Whitaker", "Office administrator"],
    laura: ["Laura", "Chen", "Practice manager"],
    ellen: ["Ellen", "Park", "Practice manager, south practice"],
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
  sites: {
    head: "Head office",
    workshop: "Workshop",
    cincinnati: "Cincinnati office",
    downtown: "Downtown office",
    north: "North practice",
    south: "South practice",
    main: "Main building",
  },
  contracts: {
    halversonCoffee: "Halverson – coffee machines, head office",
    halversonCatering: "Halverson – meeting catering, head office",
    halversonWorkshop: "Halverson – breakroom supplies, workshop",
    halversonWater: "Halverson – water dispensers, Cincinnati",
    meridianCoffee: "Meridian – coffee machines, head office",
    meridianWater: "Meridian – water dispensers, downtown",
    oakfieldWaterNorth: "Oakfield Dental – water dispenser, north practice",
    oakfieldWaterSouth: "Oakfield Dental – water dispenser, south practice",
    brightsideCoffee: "Brightside – coffee bar",
    brightsideSupplies: "Brightside – breakroom supplies",
    brightsideEvents: "Brightside – catering for member events",
    riverbendCoffee: "Riverbend – coffee machines, head office",
    riverbendWater: "Riverbend – water dispensers, head office",
    riverbendCatering: "Riverbend – board meeting catering",
    tallisCoffee: "Tallis – coffee machines",
    tallisSupplies: "Tallis – breakroom supplies and fruit",
    juniperSupplies: "Juniper – weekly fruit and supplies",
    ashcombeCoffee: "Ashcombe Media – coffee machine",
  } satisfies Record<ContractKey, string>,
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
    oakfieldWater: ["Oakfield Dental – water for the south practice", "Agreed, dispenser installed"],
    larkspurStart: ["Larkspur Law – first coffee machine", "Call Helen about the kitchen size"],
    riverbendBranches: ["Riverbend – coffee for the four branches", "Trial machine in the Polaris branch"],
    riverbendRenewal: ["Riverbend – yearly review, head office", "Agreed for another year"],
    tallisOffice: ["Tallis Software – office coffee and fruit", "Agreed, running since August"],
    greystoneStart: ["Greystone – breakroom supplies", "Ask Beth for the headcount"],
    juniperFruit: ["Juniper Studio – coffee for the new studio", "Not now, after the studio move"],
    westmoorCanteen: ["Westmoor – break areas for the warehouse shifts", "Present two options to Carl and Anita"],
    ashcombeRenewal: ["Ashcombe Media – espresso upgrade", "Not now, after the team change"],
    kingsleyPilot: ["Kingsley Medical – catering for staff meetings", "Intro call with Frank"],
  } satisfies Record<DealKey, readonly [string, string]>,
  tasks: {
    prepareReview: "Prepare the yearly review for Halverson (usage per site)",
    secondSiteTasting: "Bring two machines for the taste test in Cincinnati",
    descaleMachines: "Schedule descaling of the Columbus coffee machines at Halverson",
    meridianMenu: "Lunch tasting with Karen: two menus for Meridian",
    riverbendOffer: "Write the per-branch offer for Riverbend",
    westmoorVisit: "Walk the break areas at Westmoor with Carl",
    westmoorOptions: "Work out shift-friendly options for Westmoor",
    kingsleyCall: "Intro call with Frank at Kingsley Medical",
    ashcombeCheckIn: "Check in with Zoe at Ashcombe",
    larkspurCall: "Call Helen about the Larkspur kitchen",
    brightsideReview: "Prepare the Brightside contract review",
    tallisOnboarding: "First delivery and machine setup at Tallis",
    oakfieldDispensers: "Check both water dispensers at Oakfield Dental (south practice drips)",
  } satisfies Record<TaskKey, string>,
  views: {
    clientsByStatus: "Clients by status",
    clientOverview: "Client overview",
    upcomingReviews: "Upcoming reviews",
    noRecentContact: "No recent contact",
    pipeline: "Opportunities by stage",
    allContacts: "All contacts",
    dueSoon: "Due soon",
    reviewCalendar: "Review calendar",
  },
  widgets: {
    annualValue: "Annual contract value",
    reviewDue: "Contracts up for review",
    noContact: "No contact in 30 days",
    overdueTasks: "Overdue tasks",
    byStatus: "Clients by relationship status",
    reviews: "Reviews in the next 30 days",
    sitesMap: "Sites we serve",
    topClients: "Top clients by annual value",
    actionsMonth: "Client actions this month",
    latestActivity: "Latest client activity",
  },
  routines: {
    noContact: {
      name: "Clients without recent contact",
      task: "Every Monday, find clients whose Relationship status is Customer, sorted by their Last contact date, oldest first. For each client whose Last contact lies more than 30 days back and that has no open task named \"Check in with <client name>\", create one ordinary task with that name for the client's Account manager, due this week, Medium priority, linked to the client, with the client's active contracts in notes. Do not change the client, create opportunities or message anyone. Report the clients and tasks.",
      runs: [
        "Found 2 customers without contact for more than 30 days and created a check-in task for each account manager.",
        "Created 1 check-in task; the other quiet customer already had one.",
      ],
      note: "I could not reach the model provider on this attempt, so I stopped before reading or changing anything. Nothing was modified. The next scheduled run will pick this up.",
    },
    contractReviews: {
      name: "Prepare contract reviews",
      task: "On the first day of each month, find contracts whose Status is not Cancelled and whose Review date lies within the next 60 days. For each one, read its client, site address, service, monthly fee and the text of its signed contract file, and the client's other contracts and open opportunities. Append a dated usage summary of at most 120 words to the contract's notes, retaining prior notes. If the client has no open task named \"Prepare review: <contract name>\", create one ordinary task with that name for the client's Account manager, due two weeks before the Review date, linked to the client. Set the contract Status to Review due when it is Active. Do not change fees or dates and do not message the client.",
      runs: [
        "Found 3 contracts with a review in the next 60 days, added a usage summary to each and created 3 preparation tasks.",
        "Found 1 contract with a review in the next 60 days and created 1 preparation task.",
      ],
    },
    followUp: {
      name: "Every morning, draft follow-ups for opportunities due today",
      task: 'Every weekday morning, find opportunities whose Stage is Identified, Offer sent or Tasting / trial and whose Next step date is today or earlier. For each one, read its client, the linked contacts and the last conversation linked to the opportunity. If that conversation already ends in a draft, leave it alone. Otherwise save one short follow-up draft in that conversation with save_message_draft: thank the person for the last message, name the Next step in one sentence and suggest one concrete time. When no conversation is linked, create one ordinary task "Follow up with <contact name>" due today for the client\'s Account manager instead. Never send a message, do not change the opportunity and report the opportunities and drafts.',
      runs: [
        "Found 3 opportunities with a next step due today and saved 3 follow-up drafts in the Inbox, for Halverson, Meridian and Kingsley Medical.",
        "Found 2 opportunities due: saved a follow-up draft for Riverbend and created a task for Larkspur Law, which has no conversation linked yet.",
        "Found 1 opportunity due, Westmoor Logistics Park, and saved one draft for Carl and Anita.",
      ],
    },
    replyTasks: {
      name: "Reply tasks for client emails",
      task: "Review the new email identified by routine_trigger. Continue only when the sender matches a Contact through the identity channels and the contact's client has the Relationship status Customer or Active discussion. Read the client's open opportunities and its contracts with the Status Review due. Create one ordinary task \"Reply to <contact name>\" linked to the contact, the client and, when exactly one is open, its opportunity, due the next working day, Priority High when a contract of the client is on Review due and Medium otherwise, for the client's Account manager. Do not create a second task when an open one with that name exists. Do not draft or send a reply and do not change any other record.",
      runs: [
        'Matched the new email from Ellen Park at Oakfield Dental and created the task "Reply to Ellen Park" with High priority, because the north practice contract is up for review.',
        'Matched the email from Sam Whitaker at Meridian Insurance Partners and created the task "Reply to Sam Whitaker" due tomorrow with Medium priority.',
      ],
    },
  },
  wiki: {
    guide: {
      title: "Operating Guide",
      markdown: [
        "Hollis Office Services runs coffee machines, breakroom supplies, water dispensers and meeting catering for offices around Columbus. Three of us look after about 40 business clients. This workspace is demo data; every company and person in it is fictional.",
        "",
        "## How we use the CRM",
        "- **Clients** are the offices we look after or talk to. Each client has a relationship status (New relationship, Active discussion, Customer, Dormant), an account manager, the last contact and the next action date. Its annual value adds up the annual value of its contracts.",
        "- **Contacts** are the people at a client, each linked to their client with their role.",
        "- **Contracts** are one service at one site address: monthly fee, start and review date, status. The annual value is the monthly fee times 12. Contracts do not create invoices; billing stays in our accounting tool.",
        "- **Opportunities** are new clients, new sites or services and yearly reviews: Identified, Offer sent, Tasting / trial, then Agreed or Not now. The value is typed in by hand.",
        "- **Tasks** are next actions with an owner, a status and a due date. Tasks, the next action date and the next step date are ordinary fields: nobody is reminded automatically, so check the Due soon and No recent contact views every morning.",
        "- A conversation from the inbox belongs to a client or an opportunity only when someone links it there.",
        "",
        "## Working rules",
        "- Update Last contact after every call, visit or chat that mattered.",
        "- Signed contracts are attached to the contract in its Signed contract field, and yearly review workbooks to the opportunity's Documents. Menus and delivery notes stay in the delivery tool.",
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
        "- **Relationship status**, **Segment**, **Sites** and **Account manager** are filled in, so the Client overview shows who looks after whom.",
        "- Every service we deliver is a **contract** linked to the client, with its site address, monthly fee, review date and signed contract. The client's **Annual value** is calculated from them.",
        "- **Last contact** and **Next action date** are kept current. The No recent contact view is sorted by the last contact.",
        "- At least the person who decides and the person who orders day to day are linked as contacts, each with their **Role**.",
        "- Open opportunities and the emails or chats about them are linked to the client.",
        "",
        "## Example",
        "Halverson Engineering Group is the example: four contacts, four contracts across three sites, two opportunities, open tasks and two linked conversations.",
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
        "2. Remove duplicate rows and split the sheet into one workbook each for clients, contacts and contracts.",
        "3. Import clients first: on **Clients**, open **More actions › Add from file**, map the columns to the fields and import.",
        "4. Import contacts and contracts next and map the company column to their client, so each row is linked.",
        "5. An import cannot be undone. Try ten rows first and check them before importing the rest.",
        "6. Fill in Relationship status, Account manager and Last contact by hand where the sheet had no clean column.",
      ],
    },
    yearlyReview: {
      title: "Yearly review",
      whenToUse: "When a client contract reaches its review date and the yearly review with the client is due.",
      markdown: [
        "Every contract gets a yearly review with the client before its review date. This is how we prepare and hold it.",
        "",
        "## Steps",
        "1. Open the Upcoming reviews view and pick the contracts reviewing in the next 60 days; set their status to Review due.",
        "2. Open the client and read all of its contracts, so the review covers every site at once.",
        "3. Create a Yearly review opportunity for the client with the expected decision date and link the contacts who decide.",
        "4. Prepare the usage per site for the last twelve months from the delivery tool, attach the workbook to the opportunity's Documents and agree a date with the client.",
        "5. After the meeting, update the monthly fees and review dates on the contracts, move the opportunity to Agreed or Not now and set the next action date on the client.",
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
        "Hi Max,\n\nThe team at Oakfield Dental recommended you. We are looking for a caterer for our weekly staff meetings, around 30 people.\n\nWould you have time for a call next week?\n\nKind regards,\nFrank Morales",
        "Hi Frank,\n\nThank you for reaching out. I would be glad to. How about Tuesday at 2 pm?\n\nBest regards,\nMax",
      ],
    },
    tallisBreakfast: {
      messages: [
        "Hi Max! Could Friday's delivery include extra fruit? We have a team breakfast.",
        "Of course, Josh. I will add two extra fruit boxes on Friday.",
      ],
    },
  },
  inbox: {
    lisaLinkedin: {
      messages: [
        "Hi Lisa, Frank Morales mentioned you handle purchasing at Kingsley. Happy to answer anything on the catering side before we speak.",
        "Hi Max, thanks for reaching out. Could you send a short reference list and the price per person for our weekly staff meetings?",
        "Of course. I'll send three references from medical offices and the per-person price this afternoon.",
        "Great. Please also tell me how you handle dietary needs, we have a lot of them.",
      ],
    },
    anitaLinkedin: {
      messages: [
        "Hi Max, Carl shared your walkthrough notes, thanks for coming out. One thing is missing: we run a night shift from 10 pm to 6 am with about 40 people.",
        "Hi Anita, good catch. Night crews need a different setup: a machine and a stocked fridge instead of a daily delivery. I'll add it as a third option.",
        "That would help a lot. Would it cost much more than the day options?",
        "A bit more for restocking the fridge, but fewer visits than you would think. I'll show all three side by side.",
        "Perfect. Our works council meets on Monday, could you send them before the weekend?",
      ],
    },
    bethLinkedin: {
      messages: [
        "Hi Beth, Max from Hollis Office Services here. We look after coffee and breakroom supplies for offices around Columbus. Glad to connect.",
        "Hi Max, thanks for the note. We are a property management office, two floors, about 35 people. Is a starter set possible? Coffee, milk, tea and some fruit.",
        "Yes, that is a normal start for a team your size. Do you already have a machine, or should we bring one?",
        "We have an old filter machine nobody likes. A new one would be welcome.",
        "Hi Beth, then I suggest one machine plus a weekly delivery of beans, milk, tea and a fruit box. I'll send a one-page offer with prices by Thursday. Would Monday mornings suit for the delivery?",
      ],
    },
    gregUsage: {
      subject: "Usage overview per site",
      messages: [
        "Hi Greg,\n\nDiane asked me to send you the usage overview per site for the last twelve months. Coffee at the head office is steady at about 3,100 cups a month, and Cincinnati only started this month.\n\nBest,\nMax",
        "Hi Max,\n\nThanks. Two questions before Thursday: catering shows 9 events a month at the head office, but we booked 8. And what would a coffee machine plus supplies cost for Cincinnati?\n\nGreg",
        "Hi Greg,\n\nThe ninth event is the all-hands lunch you booked on short notice, I'll show it as a separate line. For Cincinnati, a machine with weekly supplies is about $800 a month, exact numbers on Thursday.\n\nBest,\nMax",
        "Thanks, that clears it up. Our controller would like the catering split by department. Can you do that for Thursday?\n\nGreg",
      ],
    },
    samMenus: {
      subject: "Lunch menus for finance",
      messages: [
        "Hi Sam,\n\nKaren asked me to send you the two lunch menus for finance. The light menu is $14 per person, the warm menu $19, and delivery to the head office is $25 per order.\n\nBest,\nMax",
        "Hi Max,\n\nThanks. Finance would like one monthly estimate for about two lunches a week, ideally with delivery included. Can you send that?\n\nSam",
        "Hi Sam,\n\nSure. I'll send a one-page offer with the monthly estimate and delivery included by tomorrow.\n\nBest,\nMax",
        "Thanks. Please also tell us who should get the monthly bill, Karen or accounts payable.\n\nSam",
      ],
    },
    ellenDispenser: {
      subject: "Dispenser at the south practice",
      messages: [
        "Hi Max,\n\nThe water dispenser in the south practice has been dripping at the tap since Monday. Could someone have a look before Friday? Our first patients arrive at 8.\n\nThanks,\nEllen",
        "Hi Ellen,\n\nSorry about that. Rachel will come by on Thursday around 2 pm and replace the tap seal. She can check the north practice dispenser on the same trip, and she will text you when she is on the way.\n\nBest,\nMax",
      ],
    },
    zoeCheckIn: {
      subject: "Checking in on the espresso machine",
      messages: [
        "Hi Zoe,\n\nIt has been a while since we last spoke. How is the machine doing, and has the team change settled down?\n\nBest,\nMax",
        "Hi Max,\n\nThe machine is fine. A new studio lead starts next month and wants a say in the coffee, so the espresso upgrade will have to wait for him. Can we talk then?\n\nZoe",
        "Hi Zoe,\n\nOf course. I'll note the second week of next month and bring a short comparison of the espresso option. If you tell me his start date, I'll suggest two dates for a quick tasting.\n\nBest,\nMax",
      ],
    },
    priyaTasting: {
      messages: [
        "Hi Max, could we move the taste test in Cincinnati to 11? Our all-hands runs until 10:30.",
        "Sure Priya, 11 works. I'll bring both machines and set up before you finish.",
        "Thanks! Could you also bring decaf beans? Half the team skips coffee after lunch.",
      ],
    },
    carlWalkthrough: {
      messages: [
        "Max, thanks for the walkthrough. Heads up: forklift crews eat at 5:30, not 6, and the south break area opens at 5.",
        "Thanks Carl, noted. I'll plan the first refill for 4:30 so everything is ready by 5.",
        "Also, the south area has no water connection near the door. Is that a problem for a dispenser?",
        "No, we use bottle dispensers there. I'll mark the spot on the plan.",
      ],
    },
    owenMove: {
      messages: [
        "Hi Max, the studio move is confirmed for the first week of next month.",
        "Great news Owen. Want me to restart the fruit and coffee delivery once you are in?",
        "Yes please, from the second week. I'll send you the new address and the door code.",
        "Perfect. I'll set it up and ask Daniel to bring a machine for the first morning.",
      ],
    },
  } satisfies Record<InboxKey, InboxThreadText>,
  agents: {
    company: "Hollis Office Services",
    records: "clients, contracts and opportunities",
    mate: "At Max's request it reads clients and contracts, creates tasks for the account managers and saves reply drafts, for example after a customer reports a dripping dispenser.",
    claude:
      "Max has it summarise a call into the notes of the opportunity, for example the Halverson yearly review, and prepare the usage per site from the contracts.",
    chatgpt:
      "It drafts offer text from walkthrough notes, such as the Westmoor options, which Max then edits and sends himself.",
    codex:
      "It cleans up exports and imports by script, for example merging duplicate contacts such as Tom Okafor, and writes a note about what it changed.",
    followUp:
      'Every weekday at 8 am the routine "Every morning, draft follow-ups for opportunities due today" looks at the opportunities whose next step date is today or earlier and saves one short follow-up draft per opportunity in the Inbox. Max reads each draft, edits it and sends it himself. The routine never sends a message and never deletes anything.',
  } satisfies AgentsPageText,
  notes: {
    halversonRenewal:
      "Summary by Claude after the call on Monday:\nDiane wants the yearly review to cover all three sites in one go, Greg wants the numbers per site.\nPromised: the usage overview before Thursday and a suggestion for Cincinnati.\nFee range for Cincinnati: one machine with weekly supplies is about $800 a month.\nNext step: send the overview, then walk Diane and Greg through it on Thursday at 10.",
    westmoorCanteen:
      "Draft by ChatGPT from the walkthrough notes:\nTwo day options are on the table: a cold breakfast with a lunch bar, or a hot lunch from the van.\nCrews eat at 5:30, the south break area opens at 5 and has no water connection near the door, so bottle dispensers go there.\nAnita added a night shift of about 40 people from 10 pm to 6 am: third option with a machine and a stocked fridge.\nNext step: send all three options side by side before the works council meets on Monday.",
    greystoneStart:
      "Summary by Claude after the LinkedIn chat with Beth:\nTwo floors, about 35 people, an old filter machine nobody likes.\nStarter set wanted: one machine, weekly beans, milk, tea and a fruit box.\nNext step: one-page offer by Thursday, delivery on Monday mornings.",
    tom: 'Cleaned up by Codex (script run on the CSV export):\nThe duplicate "Tom Okafor (duplicate)" was merged into this contact.\nThe mobile number used for WhatsApp was kept, email and job title are unchanged.\nNo other contact at Halverson was touched.',
  },
  mateChatDispenser: {
    title: "Dripping dispenser at Oakfield",
    messages: [
      "Ellen Park from Oakfield Dental wrote that the south practice dispenser drips. Create a task for Rachel to check both dispensers on Thursday at 2 pm and draft a reply.",
      "Done. This is what I created and checked:\n\n- **Task created:** Check both water dispensers at Oakfield Dental (south practice drips), assigned to Rachel Kim, Priority High, due Thursday, scheduled 2:00 to 3:00 pm, linked to Oakfield Dental Group and Ellen Park.\n- **Contracts checked, not changed:** the south practice dispenser ($140 a month, started 70 days ago) is Active. The north practice contract is still on Review due, and I left it as it is. Oakfield's last contact is 41 days back; update it after the visit.\n- **Reply drafted:** in the email thread with Ellen, saying that Rachel comes on Thursday around 2 pm, replaces the tap seal and looks at the north practice dispenser on the same trip.\n\nNothing was sent. The draft waits in your Inbox for your review.",
    ],
  },
  files: {
    agreement: {
      title: "Service agreement",
      between: "Between Hollis Office Services and",
      scope: "Scope",
      columns: ["Service", "Site address", "Monthly fee", "Annual value"],
      care: "Service levels",
      clauses: {
        coffeeMachines:
          "Machines, installation and parts are included. Our technician handles descaling every four weeks and replaces the water filter twice a year; a breakdown is answered within one working day.",
        breakroomSupplies:
          "Weekly delivery of coffee beans, milk, tea, fruit and kitchen supplies, counted and restocked by our driver. Kettles and machines on site are part of the descaling round.",
        catering:
          "Lunch and snacks for meetings, ordered by noon on the day before. Coffee machines used at events follow the same descaling schedule as the office machines.",
        waterDispensers:
          "Dispensers, bottles and cups are included. Quarterly hygiene service with descaling and sanitising of every dispenser.",
      } satisfies Record<ServiceKey, string>,
      term: "Term",
      termText:
        "The agreement runs for twelve months from the start date and renews for another year unless either side cancels in writing one month before the yearly review. Fees are billed monthly by our accounting team.",
      signed: "Signed for the client by",
    },
    workbook: {
      name: "Yearly review – usage by site.xlsx",
      rows: [
        [
          "Site",
          "Service",
          "Coffee cups per month",
          "Catering events per month",
          "Water bottles per month",
          "Monthly fee ($)",
        ],
        ["Head office, Columbus", "Coffee machines", 3100, "", "", 420],
        ["Head office, Columbus", "Meeting catering", "", 9, "", 950],
        ["Workshop, Grove City", "Breakroom supplies", 650, "", "", 310],
        ["Cincinnati office", "Water dispensers", "", "", 40, 120],
        ["Total", "", 3750, 9, 40, 1800],
      ],
    },
  },
  trash: ["Tom Okafor (duplicate)", "Juniper Studio – breakroom supplies renewal"],
  mateChat: {
    title: "Prepare the Halverson yearly review",
    messages: [
      "Prepare the Halverson yearly review",
      "Halverson Engineering Group has 4 contracts across 3 sites:\n\n| Contract | Site | Monthly fee |\n| --- | --- | --- |\n| Coffee machines | Head office, Columbus | $420 |\n| Meeting catering | Head office, Columbus | $950 |\n| Breakroom supplies | Workshop, Grove City | $310 |\n| Water dispensers | Cincinnati office | $120 |\n\nTogether that is $1,800 a month or $21,600 a year. The usage workbook on the review opportunity shows about 3,100 cups a month at the head office and 9 catering events a month; Cincinnati only started this month. The signed coffee machine agreement includes descaling every four weeks, and Tom reported the descaling light again on WhatsApp, so I would confirm the descaling visit before the meeting. The review opportunity is valued at $23,400 for next year.\n\nSuggested agenda for Diane and Greg: usage per site, the Cincinnati start, coffee and supplies for Cincinnati (the open $9,600 opportunity) and the new monthly fees.",
    ],
  },
};

export type Strings = typeof en;

const de: Strings = {
  company: "Bohnenhaus Büroservice",
  workspaceName: "Kunden",
  website: "https://bohnenhaus-bueroservice.example",
  phones: {
    mobile: { templates: ["+49 30 23125 0##"], start: 0 },
    office: { templates: ["+49 30 23125 4##"], start: 0 },
  },
  selfTitle: "Inhaber und Kundenbetreuer",
  money: (amount: number) => `${groupDigits(amount, ".", ",")} €`,
  members: {
    colleagueA: ["Lena", "Hartmann", "lena.hartmann@bohnenhaus-bueroservice.example"],
    colleagueB: ["Tobias", "Krüger", "tobias.krueger@bohnenhaus-bueroservice.example"],
  },
  lists: {
    organization: ["Kunde", "Kunden", "Büros und Standorte, die wir betreuen oder ansprechen."],
    contact: ["Kontakt", "Kontakte", "Menschen bei unseren Kunden: wer entscheidet, wer bestellt, wer unterschreibt."],
    contract: [
      "Vertrag",
      "Verträge",
      "Eine Leistung an einem Standort eines Kunden, mit Monatspauschale und Prüftermin. Die Abrechnung bleibt in der Buchhaltung.",
    ],
    deal: [
      "Verkaufschance",
      "Verkaufschancen",
      "Neue Standorte, zusätzliche Leistungen und Jahresgespräche, über die wir sprechen.",
    ],
    task: ["Aufgabe", "Aufgaben", "Nächste Schritte mit Verantwortlichen und Fälligkeitsdatum."],
  },
  fields: {
    relationshipStatus: "Beziehungsstatus",
    segment: "Segment",
    headOffice: "Hauptsitz",
    website: "Website",
    sites: "Standorte",
    clientSince: "Kunde seit",
    accountManager: "Kundenbetreuung",
    preferredChannel: "Bevorzugter Kanal",
    lastContact: "Letzter Kontakt",
    nextActionDate: "Nächste Aktion am",
    annualValue: "Jahreswert",
    jobTitle: "Position",
    role: "Rolle",
    service: "Leistung",
    siteAddress: "Standortadresse",
    signedContract: "Unterschriebener Vertrag",
    documents: "Dokumente",
    scheduled: "Termin",
    monthlyFee: "Monatspauschale",
    startDate: "Beginn",
    reviewDate: "Prüftermin",
    contractStatus: "Status",
    opportunityType: "Art",
    decisionDate: "Erwartete Entscheidung",
    nextStep: "Nächster Schritt",
    nextStepDate: "Datum nächster Schritt",
    dueDate: "Fällig am",
    priority: "Priorität",
  },
  options: {
    relationshipStatus: {
      newRelationship: "Neue Beziehung",
      activeDiscussion: "Im Gespräch",
      customer: "Kunde",
      dormant: "Ruhend",
    },
    segment: {
      smallOffice: "Kleines Büro (unter 50)",
      midsize: "Mittleres Büro (50–250)",
      largeSite: "Großer Standort (250+)",
      coworking: "Coworking-Space",
    },
    preferredChannel: { email: "E-Mail", phone: "Telefon", whatsapp: "WhatsApp" },
    role: { officeManager: "Büroleitung", purchasing: "Einkauf", management: "Geschäftsleitung" },
    service: {
      coffeeMachines: "Kaffeemaschinen",
      breakroomSupplies: "Teeküchenbedarf",
      catering: "Catering",
      waterDispensers: "Wasserspender",
    },
    contractStatus: { active: "Aktiv", reviewDue: "Prüfung fällig", cancelled: "Gekündigt" },
    opportunityType: {
      newClient: "Neukunde",
      expansion: "Neuer Standort oder Leistung",
      renewal: "Jahresgespräch",
    },
    priority: { low: "Niedrig", medium: "Mittel", high: "Hoch" },
  },
  stages: {
    identified: "Erkannt",
    offerSent: "Angebot gesendet",
    trial: "Probephase",
    agreed: "Vereinbart",
    notNow: "Nicht jetzt",
  },
  organizations: {
    halverson: ["Hollmann Ingenieure GmbH", "Leipzig"],
    meridian: ["Merkur Versicherungsmakler", "Leipzig"],
    oakfield: ["Zahnzentrum am Eichenhof", "Markkleeberg"],
    brightside: ["Sonnenseite Coworking", "Leipzig"],
    larkspur: ["Kanzlei Lerchenfeld", "Leipzig"],
    riverbend: ["Elsteraue Kreditgenossenschaft eG", "Taucha"],
    tallis: ["Talwerk Software GmbH", "Leipzig"],
    greystone: ["Graustein Hausverwaltung", "Leipzig"],
    juniper: ["Wacholder Architekten", "Delitzsch"],
    westmoor: ["Logistikpark Schkeuditz Nord", "Schkeuditz"],
    ashcombe: ["Eschental Medien", "Halle (Saale)"],
    kingsley: ["Klinikum Königsau", "Halle (Saale)"],
  },
  addresses: {
    halverson: address({
      street: "Katharinenstraße 14",
      postalCode: "04109",
      city: "Leipzig",
      countryCode: "de",
      lat: 51.34,
      lon: 12.373,
    }),
    meridian: address({
      street: "Gerichtsweg 28",
      postalCode: "04103",
      city: "Leipzig",
      countryCode: "de",
      lat: 51.342,
      lon: 12.39,
    }),
    oakfield: address({
      street: "Rathausstraße 22",
      postalCode: "04416",
      city: "Markkleeberg",
      countryCode: "de",
      lat: 51.278,
      lon: 12.37,
    }),
    brightside: address({
      street: "Karl-Heine-Straße 93",
      postalCode: "04229",
      city: "Leipzig",
      countryCode: "de",
      lat: 51.328,
      lon: 12.335,
    }),
    larkspur: address({
      street: "Funkenburgstraße 4",
      postalCode: "04105",
      city: "Leipzig",
      countryCode: "de",
      lat: 51.35,
      lon: 12.365,
    }),
    riverbend: address({
      street: "Leipziger Straße 60",
      postalCode: "04425",
      city: "Taucha",
      countryCode: "de",
      lat: 51.38,
      lon: 12.49,
    }),
    tallis: address({
      street: "Karl-Liebknecht-Straße 120",
      postalCode: "04275",
      city: "Leipzig",
      countryCode: "de",
      lat: 51.32,
      lon: 12.375,
    }),
    greystone: address({
      street: "Georg-Schumann-Straße 20",
      postalCode: "04155",
      city: "Leipzig",
      countryCode: "de",
      lat: 51.365,
      lon: 12.37,
    }),
    juniper: address({
      street: "Dübener Straße 12",
      postalCode: "04509",
      city: "Delitzsch",
      countryCode: "de",
      lat: 51.526,
      lon: 12.342,
    }),
    westmoor: address({
      street: "Radefelder Allee 5",
      postalCode: "04435",
      city: "Schkeuditz",
      countryCode: "de",
      lat: 51.396,
      lon: 12.222,
    }),
    ashcombe: address({
      street: "Große Ulrichstraße 30",
      postalCode: "06108",
      city: "Halle (Saale)",
      countryCode: "de",
      lat: 51.483,
      lon: 11.97,
    }),
    kingsley: address({
      street: "Ernst-Grube-Straße 40",
      postalCode: "06120",
      city: "Halle (Saale)",
      countryCode: "de",
      lat: 51.498,
      lon: 11.935,
    }),
  },
  extraSites: {
    workshop: address({
      street: "Fritz-Haber-Straße 9",
      postalCode: "06217",
      city: "Merseburg",
      countryCode: "de",
      lat: 51.355,
      lon: 11.993,
    }),
    cincinnati: address({
      street: "Ostra-Allee 9",
      postalCode: "01067",
      city: "Dresden",
      countryCode: "de",
      lat: 51.054,
      lon: 13.735,
    }),
    downtown: address({
      street: "Petersstraße 36",
      postalCode: "04109",
      city: "Leipzig",
      countryCode: "de",
      lat: 51.34,
      lon: 12.373,
    }),
    south: address({
      street: "Leipziger Straße 25",
      postalCode: "04442",
      city: "Zwenkau",
      countryCode: "de",
      lat: 51.221,
      lon: 12.325,
    }),
  },
  contacts: {
    diane: ["Dagmar", "Meißner", "Geschäftsführende Gesellschafterin"],
    tom: ["Thomas", "Ostermann", "Büroleiter"],
    priya: ["Petra", "Naumann", "Standortkoordinatorin Dresden"],
    greg: ["Gerd", "Lorenz", "Kaufmännischer Leiter"],
    karen: ["Katrin", "Dorn", "Leiterin Office Management"],
    sam: ["Simon", "Weidner", "Verwaltungsassistent"],
    laura: ["Laura", "Schenk", "Praxismanagerin"],
    ellen: ["Elke", "Pohl", "Praxismanagerin, Praxis Süd"],
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
  sites: {
    head: "Hauptsitz",
    workshop: "Werkstatt",
    cincinnati: "Büro Dresden",
    downtown: "Büro Innenstadt",
    north: "Praxis Nord",
    south: "Praxis Süd",
    main: "Hauptgebäude",
  },
  contracts: {
    halversonCoffee: "Hollmann – Kaffeemaschinen, Hauptsitz",
    halversonCatering: "Hollmann – Besprechungscatering, Hauptsitz",
    halversonWorkshop: "Hollmann – Teeküchenbedarf, Werkstatt",
    halversonWater: "Hollmann – Wasserspender, Dresden",
    meridianCoffee: "Merkur – Kaffeemaschinen, Hauptsitz",
    meridianWater: "Merkur – Wasserspender, Innenstadt",
    oakfieldWaterNorth: "Zahnzentrum am Eichenhof – Wasserspender, Praxis Nord",
    oakfieldWaterSouth: "Zahnzentrum am Eichenhof – Wasserspender, Praxis Süd",
    brightsideCoffee: "Sonnenseite – Kaffeebar",
    brightsideSupplies: "Sonnenseite – Teeküchenbedarf",
    brightsideEvents: "Sonnenseite – Catering für Mitglieder-Events",
    riverbendCoffee: "Elsteraue – Kaffeemaschinen, Hauptstelle",
    riverbendWater: "Elsteraue – Wasserspender, Hauptstelle",
    riverbendCatering: "Elsteraue – Catering für Vorstandssitzungen",
    tallisCoffee: "Talwerk – Kaffeemaschinen",
    tallisSupplies: "Talwerk – Teeküchenbedarf und Obst",
    juniperSupplies: "Wacholder – wöchentliches Obst und Teeküche",
    ashcombeCoffee: "Eschental Medien – Kaffeemaschine",
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
    oakfieldWater: ["Zahnzentrum am Eichenhof – Wasser für die Praxis Süd", "Vereinbart, Spender aufgestellt"],
    larkspurStart: ["Kanzlei Lerchenfeld – erste Kaffeemaschine", "Frau Wagner wegen der Küchengröße anrufen"],
    riverbendBranches: ["Elsteraue – Kaffee für die vier Filialen", "Probemaschine in der Filiale Taucha-Mitte"],
    riverbendRenewal: ["Elsteraue – Jahresgespräch Hauptstelle", "Für ein weiteres Jahr vereinbart"],
    tallisOffice: ["Talwerk Software – Bürokaffee und Obst", "Vereinbart, läuft seit August"],
    greystoneStart: ["Graustein – Teeküchenbedarf", "Frau Holz nach der Mitarbeiterzahl fragen"],
    juniperFruit: ["Wacholder Architekten – Kaffee für das neue Büro", "Nicht jetzt, nach dem Büroumzug"],
    westmoorCanteen: [
      "Logistikpark – Pausenbereiche für die Lagerschichten",
      "Herrn Jahn und Frau Schulze zwei Varianten vorstellen",
    ],
    ashcombeRenewal: ["Eschental Medien – Siebträger statt Vollautomat", "Nicht jetzt, nach dem Teamwechsel"],
    kingsleyPilot: ["Klinikum Königsau – Catering für Teambesprechungen", "Kennenlerngespräch mit Herrn Moritz"],
  },
  tasks: {
    prepareReview: "Jahresauswertung für Hollmann vorbereiten (Verbrauch je Standort)",
    secondSiteTasting: "Zwei Maschinen zur Verkostung nach Dresden mitnehmen",
    descaleMachines: "Entkalkung der Leipziger Kaffeemaschinen bei Hollmann einplanen",
    meridianMenu: "Mittagsverkostung mit Frau Dorn: zwei Menüs für Merkur",
    riverbendOffer: "Angebot je Filiale für die Elsteraue schreiben",
    westmoorVisit: "Pausenbereiche im Logistikpark mit Herrn Jahn begehen",
    westmoorOptions: "Schichttaugliche Varianten für den Logistikpark ausarbeiten",
    kingsleyCall: "Kennenlerngespräch mit Herrn Moritz vom Klinikum Königsau",
    ashcombeCheckIn: "Bei Frau Brückner von Eschental Medien nachfragen",
    larkspurCall: "Frau Wagner wegen der Küche der Kanzlei anrufen",
    brightsideReview: "Vertragsprüfung für Sonnenseite Coworking vorbereiten",
    tallisOnboarding: "Erste Lieferung und Aufbau der Maschine bei Talwerk",
    oakfieldDispensers: "Beide Wasserspender im Zahnzentrum am Eichenhof prüfen (Praxis Süd tropft)",
  },
  views: {
    clientsByStatus: "Kunden nach Status",
    clientOverview: "Kundenübersicht",
    upcomingReviews: "Anstehende Prüfungen",
    noRecentContact: "Lange kein Kontakt",
    pipeline: "Verkaufschancen nach Phase",
    allContacts: "Alle Kontakte",
    dueSoon: "Bald fällig",
    reviewCalendar: "Prüfkalender",
  },
  widgets: {
    annualValue: "Jahreswert der Verträge",
    reviewDue: "Verträge zur Prüfung",
    noContact: "Kunden ohne Kontakt seit 30 Tagen",
    overdueTasks: "Überfällige Aufgaben",
    byStatus: "Kunden nach Beziehungsstatus",
    reviews: "Prüftermine in 30 Tagen",
    sitesMap: "Standorte, die wir beliefern",
    topClients: "Top-Kunden nach Jahreswert",
    actionsMonth: "Kundenaktionen im Monat",
    latestActivity: "Letzte Kundenaktivität",
  },
  routines: {
    noContact: {
      name: "Kunden ohne aktuellen Kontakt",
      task: "Suche jeden Montag die Kunden mit dem Beziehungsstatus Kunde, sortiert nach dem Datum Letzter Kontakt, ältestes zuerst. Lege für jeden Kunden, dessen letzter Kontakt mehr als 30 Tage zurückliegt und der keine offene Aufgabe „Nachfassen bei <Kundenname>“ hat, genau eine normale Aufgabe mit diesem Namen für die eingetragene Kundenbetreuung an: fällig diese Woche, Priorität Mittel, mit dem Kunden verknüpft, mit seinen aktiven Verträgen in den Notizen. Ändere den Kunden nicht, lege keine Verkaufschancen an und schreibe niemandem. Berichte, welche Kunden und Aufgaben es betrifft.",
      runs: [
        "Zwei Kunden ohne Kontakt seit über 30 Tagen gefunden und für die jeweilige Kundenbetreuung je eine Aufgabe zum Nachfassen angelegt.",
        "Eine Aufgabe zum Nachfassen angelegt; der zweite ruhige Kunde hatte schon eine.",
      ],
      note: "Ich konnte den Modellanbieter bei diesem Versuch nicht erreichen und habe daher vor jedem Lesen oder Ändern abgebrochen. Es wurde nichts verändert. Der nächste geplante Lauf übernimmt das.",
    },
    contractReviews: {
      name: "Vertragsprüfungen vorbereiten",
      task: "Suche am Ersten jedes Monats alle Verträge, deren Status nicht Gekündigt ist und deren Prüftermin in den nächsten 60 Tagen liegt. Lies für jeden Vertrag Kunde, Standortadresse, Leistung, Monatspauschale und den Text des unterschriebenen Vertrags sowie die übrigen Verträge und offenen Verkaufschancen des Kunden. Ergänze in den Notizen des Vertrags eine datierte Verbrauchsübersicht mit höchstens 120 Wörtern und behalte die bisherigen Notizen. Hat der Kunde keine offene Aufgabe „Prüfung vorbereiten: <Vertragsname>“, lege genau eine normale Aufgabe mit diesem Namen für die Kundenbetreuung an, fällig zwei Wochen vor dem Prüftermin, verknüpft mit dem Kunden. Setze den Status aktiver Verträge auf Prüfung fällig. Ändere keine Pauschalen oder Termine und schreibe dem Kunden nicht.",
      runs: [
        "Drei Verträge mit Prüftermin in den nächsten 60 Tagen gefunden, je eine Verbrauchsübersicht ergänzt und drei Aufgaben zur Vorbereitung angelegt.",
        "Einen Vertrag mit Prüftermin in den nächsten 60 Tagen gefunden und eine Aufgabe zur Vorbereitung angelegt.",
      ],
    },
    followUp: {
      name: "Jeden Morgen Nachfass-Entwürfe für fällige Verkaufschancen",
      task: "Suche jeden Werktagmorgen die Verkaufschancen in den Phasen Erkannt, Angebot gesendet oder Probephase, deren Datum des nächsten Schritts heute oder früher ist. Lies für jede Verkaufschance den Kunden, die verknüpften Kontakte und die letzte mit ihr verknüpfte Unterhaltung. Endet die Unterhaltung schon in einem Entwurf, lass ihn unverändert. Speichere sonst mit save_message_draft in dieser Unterhaltung einen kurzen Nachfass-Entwurf: Bedanke dich für die letzte Nachricht, nenne den nächsten Schritt in einem Satz und schlage einen konkreten Termin vor. Ist keine Unterhaltung verknüpft, lege stattdessen genau eine normale Aufgabe „Nachfassen bei <Kontaktname>“ für die Kundenbetreuung des Kunden an, fällig heute. Sende nie eine Nachricht, ändere die Verkaufschance nicht und berichte, welche Verkaufschancen und Entwürfe es betrifft.",
      runs: [
        "Drei Verkaufschancen mit fälligem nächsten Schritt gefunden und drei Nachfass-Entwürfe im Posteingang gespeichert, für Hollmann, Merkur und das Klinikum Königsau.",
        "Zwei fällige Verkaufschancen gefunden: Für die Elsteraue einen Nachfass-Entwurf gespeichert und für die Kanzlei Lerchenfeld, die noch keine verknüpfte Unterhaltung hat, eine Aufgabe angelegt.",
        "Eine fällige Verkaufschance gefunden, den Logistikpark Schkeuditz Nord, und einen Entwurf für Herrn Jahn und Frau Schulze gespeichert.",
      ],
    },
    replyTasks: {
      name: "Antwort-Aufgaben für Kunden-E-Mails",
      task: "Lies die neue E-Mail, die routine_trigger nennt. Mache nur weiter, wenn der Absender über die Identitätskanäle zu einem Kontakt passt und der Kunde den Beziehungsstatus Kunde oder Im Gespräch hat. Lies die offenen Verkaufschancen des Kunden und seine Verträge mit dem Status Prüfung fällig. Lege genau eine normale Aufgabe „Antworten an <Kontaktname>“ an, verknüpft mit dem Kontakt, dem Kunden und, wenn genau eine offen ist, ihrer Verkaufschance, fällig am nächsten Werktag, Priorität Hoch, wenn ein Vertrag des Kunden auf Prüfung fällig steht, sonst Mittel, für die Kundenbetreuung des Kunden. Lege keine zweite Aufgabe an, wenn eine offene mit diesem Namen existiert. Entwirf und sende keine Antwort und ändere keinen anderen Datensatz.",
      runs: [
        "Die neue E-Mail von Elke Pohl vom Zahnzentrum am Eichenhof zugeordnet und die Aufgabe „Antworten an Elke Pohl“ mit Priorität Hoch angelegt, weil der Vertrag der Praxis Nord zur Prüfung ansteht.",
        "Die E-Mail von Simon Weidner von Merkur Versicherungsmakler zugeordnet und die Aufgabe „Antworten an Simon Weidner“ mit Priorität Mittel für morgen angelegt.",
      ],
    },
  },
  wiki: {
    guide: {
      title: "Leitfaden",
      markdown: [
        "Bohnenhaus Büroservice betreut Kaffeemaschinen, Teeküchenbedarf, Wasserspender und Besprechungscatering für Büros in Leipzig und Umgebung. Zu dritt kümmern wir uns um rund 40 Geschäftskunden. Dieser Arbeitsbereich enthält Demodaten; alle Firmen und Personen sind erfunden.",
        "",
        "## So nutzen wir das CRM",
        "- **Kunden** sind die Büros, die wir betreuen oder ansprechen. Jeder Kunde hat einen Beziehungsstatus (Neue Beziehung, Im Gespräch, Kunde, Ruhend), eine Kundenbetreuung, den letzten Kontakt und das Datum der nächsten Aktion. Sein Jahreswert ist die Summe der Jahreswerte seiner Verträge.",
        "- **Kontakte** sind die Menschen bei einem Kunden, jeweils mit ihrem Kunden und ihrer Rolle verknüpft.",
        "- **Verträge** sind eine Leistung an einer Standortadresse: Monatspauschale, Beginn, Prüftermin und Status. Der Jahreswert ist die Monatspauschale mal 12. Verträge erzeugen keine Rechnungen; die Abrechnung bleibt in unserer Buchhaltung.",
        "- **Verkaufschancen** sind Neukunden, neue Standorte oder Leistungen und Jahresgespräche: Erkannt, Angebot gesendet, Probephase, dann Vereinbart oder Nicht jetzt. Den Wert tragen wir von Hand ein.",
        "- **Aufgaben** sind nächste Schritte mit Verantwortlichen, Status und Fälligkeitsdatum. Aufgaben, das Datum der nächsten Aktion und das Datum des nächsten Schritts sind normale Felder: Niemand wird automatisch erinnert, deshalb jeden Morgen die Ansichten „Bald fällig“ und „Lange kein Kontakt“ prüfen.",
        "- Ein Gespräch aus dem Posteingang gehört nur dann zu einem Kunden oder einer Verkaufschance, wenn jemand es dort verknüpft.",
        "",
        "## Arbeitsregeln",
        "- Nach jedem wichtigen Anruf, Besuch oder Chat den letzten Kontakt aktualisieren.",
        "- Unterschriebene Verträge hängen im Feld „Unterschriebener Vertrag“ am Vertrag, Auswertungen fürs Jahresgespräch in den Dokumenten der Verkaufschance. Menüs und Lieferscheine bleiben im Lieferprogramm.",
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
        "- **Beziehungsstatus**, **Segment**, **Standorte** und **Kundenbetreuung** ausgefüllt sind, damit die Kundenübersicht zeigt, wer wen betreut.",
        "- jede Leistung, die wir liefern, ein mit dem Kunden verknüpfter **Vertrag** mit Standortadresse, Monatspauschale, Prüftermin und unterschriebenem Vertrag ist. Der **Jahreswert** des Kunden wird daraus berechnet.",
        "- **Letzter Kontakt** und **Nächste Aktion am** aktuell sind. Die Ansicht „Lange kein Kontakt“ ist nach dem letzten Kontakt sortiert.",
        "- mindestens die entscheidende Person und die Person, die im Alltag bestellt, als Kontakte mit ihrer **Rolle** verknüpft sind.",
        "- offene Verkaufschancen und die E-Mails oder Chats dazu mit dem Kunden verknüpft sind.",
        "",
        "## Beispiel",
        "Hollmann Ingenieure ist das Beispiel: vier Kontakte, vier Verträge an drei Standorten, zwei Verkaufschancen, offene Aufgaben und zwei verknüpfte Gespräche.",
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
        "2. Doppelte Zeilen entfernen und die Tabelle in je eine Arbeitsmappe für Kunden, Kontakte und Verträge aufteilen.",
        "3. Zuerst die Kunden importieren: In **Kunden** über **Weitere Aktionen › Aus Datei hinzufügen** die Arbeitsmappe wählen, die Spalten den Feldern zuordnen und importieren.",
        "4. Danach Kontakte und Verträge importieren und die Firmenspalte dem Kunden zuordnen, damit jede Zeile verknüpft ist.",
        "5. Ein Import lässt sich nicht rückgängig machen. Erst zehn Zeilen testen und prüfen, dann den Rest importieren.",
        "6. Beziehungsstatus, Kundenbetreuung und letzten Kontakt von Hand ergänzen, wo die Tabelle keine saubere Spalte hatte.",
      ],
    },
    yearlyReview: {
      title: "Jahresgespräch",
      whenToUse: "Wenn ein Kundenvertrag seinen Prüftermin erreicht und das Jahresgespräch mit dem Kunden ansteht.",
      markdown: [
        "Jeder Vertrag bekommt vor seinem Prüftermin ein Jahresgespräch mit dem Kunden. So bereiten wir es vor und führen es.",
        "",
        "## Schritte",
        "1. Die Ansicht „Anstehende Prüfungen“ öffnen, die Verträge mit Prüftermin in den nächsten 60 Tagen wählen und ihren Status auf Prüfung fällig setzen.",
        "2. Den Kunden öffnen und alle seine Verträge lesen, damit das Gespräch alle Standorte auf einmal abdeckt.",
        "3. Eine Verkaufschance der Art Jahresgespräch mit erwarteter Entscheidung anlegen und die entscheidenden Kontakte verknüpfen.",
        "4. Den Verbrauch je Standort der letzten zwölf Monate aus dem Lieferprogramm zusammenstellen, die Arbeitsmappe an die Dokumente der Verkaufschance hängen und einen Termin vereinbaren.",
        "5. Nach dem Termin Monatspauschalen und Prüftermine der Verträge anpassen, die Verkaufschance auf Vereinbart oder Nicht jetzt setzen und beim Kunden das Datum der nächsten Aktion eintragen.",
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
  inbox: {
    lisaLinkedin: {
      messages: [
        "Guten Tag Frau Graf, Herr Moritz hat erwähnt, dass Sie im Klinikum Königsau den Einkauf verantworten. Gern beantworte ich Ihnen vor unserem Gespräch alle Fragen zum Catering.",
        "Guten Tag Herr Bergmann, danke für Ihre Nachricht. Könnten Sie uns eine kurze Referenzliste und den Preis pro Person für unsere wöchentlichen Teambesprechungen schicken?",
        "Selbstverständlich. Ich schicke Ihnen heute Nachmittag drei Referenzen aus medizinischen Einrichtungen und den Preis pro Person.",
        "Sehr gut. Bitte schreiben Sie auch, wie Sie mit Unverträglichkeiten umgehen, davon haben wir viele.",
      ],
    },
    anitaLinkedin: {
      messages: [
        "Hallo Herr Bergmann, Herr Jahn hat mir Ihre Notizen zur Begehung weitergeleitet, danke fürs Vorbeikommen. Eines fehlt noch: Wir fahren eine Nachtschicht von 22 bis 6 Uhr mit etwa 40 Leuten.",
        "Guten Tag Frau Schulze, guter Hinweis. Für die Nachtschicht braucht es ein anderes Konzept: eine Maschine und einen bestückten Kühlschrank statt einer täglichen Lieferung. Ich nehme das als dritte Variante auf.",
        "Das würde uns sehr helfen. Kostet das deutlich mehr als die Tagesvarianten?",
        "Etwas mehr für das Auffüllen des Kühlschranks, aber mit weniger Besuchen, als man denkt. Ich zeige Ihnen alle drei Varianten nebeneinander.",
        "Sehr gut. Unser Betriebsrat tagt am Montag, können Sie die Unterlagen vor dem Wochenende schicken?",
      ],
    },
    bethLinkedin: {
      messages: [
        "Guten Tag Frau Holz, Max Bergmann vom Bohnenhaus Büroservice. Wir betreuen Büros in und um Leipzig mit Kaffee und Teeküchenbedarf. Schön, dass wir jetzt vernetzt sind.",
        "Guten Tag Herr Bergmann, danke für Ihre Nachricht. Wir sind eine Hausverwaltung mit zwei Etagen und etwa 35 Leuten. Wäre ein Starterpaket möglich? Kaffee, Milch, Tee und etwas Obst.",
        "Ja, das ist für ein Team Ihrer Größe ein normaler Start. Haben Sie schon eine Maschine, oder sollen wir eine mitbringen?",
        "Wir haben eine alte Filtermaschine, die keiner mag. Eine neue wäre willkommen.",
        "Guten Tag Frau Holz, dann schlage ich eine Maschine und eine wöchentliche Lieferung mit Bohnen, Milch, Tee und einer Obstkiste vor. Ein Angebot auf einer Seite mit Preisen schicke ich Ihnen bis Donnerstag. Passt Ihnen für die Lieferung der Montagvormittag?",
      ],
    },
    gregUsage: {
      subject: "Verbrauchsübersicht je Standort",
      messages: [
        "Sehr geehrter Herr Lorenz,\n\nwie Frau Meißner gebeten hat, schicke ich Ihnen die Verbrauchsübersicht je Standort für die letzten zwölf Monate. Der Kaffee am Hauptsitz liegt stabil bei etwa 3.100 Tassen im Monat, Dresden ist erst diesen Monat gestartet.\n\nMit freundlichen Grüßen\nMax Bergmann",
        "Hallo Herr Bergmann,\n\nvielen Dank. Zwei Fragen vor Donnerstag: Beim Catering stehen am Hauptsitz 9 Termine im Monat, gebucht hatten wir 8. Und was würden Kaffeemaschine und Teeküchenbedarf für Dresden kosten?\n\nViele Grüße\nGerd Lorenz",
        "Sehr geehrter Herr Lorenz,\n\nder neunte Termin ist das kurzfristig gebuchte Mittagessen zur Betriebsversammlung, ich zeige es als eigene Zeile. Für Dresden liegt eine Maschine mit wöchentlichem Teeküchenbedarf bei etwa 800 € im Monat, die genauen Zahlen bringe ich am Donnerstag mit.\n\nMit freundlichen Grüßen\nMax Bergmann",
        "Danke, das klärt es. Unser Controlling möchte das Catering nach Abteilungen aufgeteilt sehen. Schaffen Sie das bis Donnerstag?\n\nViele Grüße\nGerd Lorenz",
      ],
    },
    samMenus: {
      subject: "Menüpreise für die Buchhaltung",
      messages: [
        "Hallo Herr Weidner,\n\nFrau Dorn hat mich gebeten, Ihnen die beiden Mittagsmenüs für die Buchhaltung zu schicken. Das leichte Menü kostet 14 € pro Person, das warme 19 €, die Lieferung zum Hauptsitz 25 € pro Bestellung.\n\nViele Grüße\nMax Bergmann",
        "Hallo Herr Bergmann,\n\nvielen Dank. Die Buchhaltung möchte eine monatliche Schätzung für etwa zwei Mittagessen pro Woche, möglichst mit Lieferung. Können Sie die schicken?\n\nViele Grüße\nSimon Weidner",
        "Hallo Herr Weidner,\n\ngern. Ich schicke Ihnen morgen ein Angebot auf einer Seite mit monatlicher Schätzung und Lieferung.\n\nViele Grüße\nMax Bergmann",
        "Danke. Bitte sagen Sie uns noch, an wen wir die monatliche Abrechnung richten sollen, an Frau Dorn oder an die Buchhaltung.\n\nViele Grüße\nSimon Weidner",
      ],
    },
    ellenDispenser: {
      subject: "Wasserspender in der Praxis Süd",
      messages: [
        "Hallo Herr Bergmann,\n\nder Wasserspender in der Praxis Süd tropft seit Montag am Hahn. Könnte sich vor Freitag jemand das ansehen? Unsere ersten Patienten kommen um 8 Uhr.\n\nDanke und viele Grüße\nElke Pohl",
        "Hallo Frau Pohl,\n\ndas tut mir leid. Frau Hartmann kommt am Donnerstag gegen 14 Uhr vorbei und tauscht die Hahndichtung aus. Dabei schaut sie sich auch den Spender in der Praxis Nord an und schreibt Ihnen kurz, wenn sie unterwegs ist.\n\nViele Grüße\nMax Bergmann",
      ],
    },
    zoeCheckIn: {
      subject: "Kurze Nachfrage zur Siebträgermaschine",
      messages: [
        "Hallo Frau Brückner,\n\nwir haben lange nicht gesprochen. Wie läuft die Maschine, und hat sich der Teamwechsel eingespielt?\n\nViele Grüße\nMax Bergmann",
        "Hallo Herr Bergmann,\n\ndie Maschine läuft gut. Nächsten Monat beginnt ein neuer Studioleiter, der beim Kaffee mitreden möchte, deshalb muss die Umstellung auf einen Siebträger auf ihn warten. Können wir dann sprechen?\n\nZoe Brückner",
        "Hallo Frau Brückner,\n\nselbstverständlich. Ich merke mir die zweite Woche des nächsten Monats vor und bringe einen kurzen Vergleich der Siebträger-Variante mit. Nennen Sie mir seinen Starttermin, dann schlage ich zwei Termine für eine kleine Verkostung vor.\n\nViele Grüße\nMax Bergmann",
      ],
    },
    priyaTasting: {
      messages: [
        "Guten Tag Herr Bergmann, können wir die Verkostung in Dresden auf 11 Uhr verschieben? Unsere Betriebsversammlung dauert bis 10:30 Uhr.",
        "Gern, Frau Naumann, 11 Uhr passt. Ich bringe beide Maschinen mit und baue auf, bevor Sie fertig sind.",
        "Danke! Könnten Sie auch entkoffeinierte Bohnen mitbringen? Die Hälfte des Teams verzichtet nach dem Mittag auf Kaffee.",
      ],
    },
    carlWalkthrough: {
      messages: [
        "Herr Bergmann, danke für die Begehung. Kurzer Hinweis: Die Staplerfahrer essen um 5:30 Uhr, nicht um 6, und der Pausenbereich Süd öffnet um 5.",
        "Danke, Herr Jahn, das nehme ich auf. Ich plane die erste Auffüllung für 4:30 Uhr, damit um 5 alles bereitsteht.",
        "Außerdem gibt es im Bereich Süd keinen Wasseranschluss in der Nähe der Tür. Ist das für einen Spender ein Problem?",
        "Nein, dort nehmen wir Flaschenspender. Ich zeichne die Stelle im Plan ein.",
      ],
    },
    owenMove: {
      messages: [
        "Hi Max, der Umzug ins neue Büro steht: erste Woche nächsten Monat.",
        "Das sind gute Nachrichten, Ole. Soll ich die Obst- und Kaffeelieferung starten, sobald ihr drin seid?",
        "Ja bitte, ab der zweiten Woche. Neue Adresse und Türcode schicke ich dir noch.",
        "Prima. Ich richte es ein und bitte Tobias, am ersten Morgen eine Maschine mitzubringen.",
      ],
    },
  } satisfies Record<InboxKey, InboxThreadText>,
  agents: {
    company: "Bohnenhaus Büroservice",
    records: "Kunden, Verträge und Verkaufschancen",
    mate: "Auf Bitte von Max liest Mate Kunden und Verträge, legt Aufgaben für die Kundenbetreuung an und speichert Antwortentwürfe, zum Beispiel wenn ein Kunde einen tropfenden Wasserspender meldet.",
    claude:
      "Max lässt sich damit Gespräche in die Notizen der Verkaufschance zusammenfassen, zum Beispiel für das Jahresgespräch bei Hollmann, und den Verbrauch je Standort aus den Verträgen aufbereiten.",
    chatgpt:
      "Es entwirft Angebotstexte aus Begehungsnotizen, etwa die Varianten für den Logistikpark, die Max danach selbst überarbeitet und verschickt.",
    codex:
      "Es bereinigt Exporte und Importe per Skript, zum Beispiel doppelte Kontakte wie Thomas Ostermann, und schreibt eine Notiz dazu, was geändert wurde.",
    followUp:
      "Jeden Werktag um 8 Uhr schaut die Routine „Jeden Morgen Nachfass-Entwürfe für fällige Verkaufschancen“ auf die Verkaufschancen, deren Datum des nächsten Schritts heute oder früher ist, und speichert pro Verkaufschance einen kurzen Nachfass-Entwurf im Posteingang. Max liest jeden Entwurf, überarbeitet ihn und schickt ihn selbst ab. Die Routine sendet nie eine Nachricht und löscht nichts.",
  } satisfies AgentsPageText,
  notes: {
    halversonRenewal:
      "Zusammenfassung von Claude nach dem Gespräch am Montag:\nFrau Meißner möchte, dass das Jahresgespräch alle drei Standorte auf einmal abdeckt, Herr Lorenz möchte die Zahlen je Standort sehen.\nZugesagt: die Verbrauchsübersicht vor Donnerstag und ein Vorschlag für Dresden.\nPreisrahmen Dresden: eine Maschine mit wöchentlichem Teeküchenbedarf liegt bei etwa 800 € im Monat.\nNächster Schritt: Übersicht schicken, dann am Donnerstag um 10 Uhr mit Frau Meißner und Herrn Lorenz durchgehen.",
    westmoorCanteen:
      "Entwurf von ChatGPT aus den Begehungsnotizen:\nZwei Tagesvarianten stehen im Raum: ein kaltes Frühstück mit Mittagsbuffet oder ein warmes Mittagessen aus dem Transporter.\nDie Fahrer essen um 5:30 Uhr, der Pausenbereich Süd öffnet um 5 Uhr und hat keinen Wasseranschluss an der Tür, dort kommen Flaschenspender hin.\nFrau Schulze hat eine Nachtschicht mit etwa 40 Personen von 22 bis 6 Uhr ergänzt: dritte Variante mit Maschine und bestücktem Kühlschrank.\nNächster Schritt: alle drei Varianten nebeneinander schicken, bevor der Betriebsrat am Montag tagt.",
    greystoneStart:
      "Zusammenfassung von Claude nach dem LinkedIn-Chat mit Frau Holz:\nZwei Etagen, etwa 35 Personen, eine alte Filtermaschine, die keiner mag.\nGewünscht ist ein Starterpaket: eine Maschine, wöchentlich Bohnen, Milch, Tee und eine Obstkiste.\nNächster Schritt: Angebot auf einer Seite bis Donnerstag, Lieferung montagvormittags.",
    tom: "Bereinigt von Codex (Skriptlauf auf dem CSV-Export):\nDer Dublettendatensatz „Thomas Ostermann (Duplikat)“ wurde in diesen Kontakt zusammengeführt.\nDie Mobilnummer für WhatsApp blieb erhalten, E-Mail-Adresse und Position sind unverändert.\nKein anderer Kontakt bei Hollmann wurde angefasst.",
  },
  mateChatDispenser: {
    title: "Tropfender Wasserspender bei Eichenhof",
    messages: [
      "Elke Pohl vom Zahnzentrum am Eichenhof schreibt, dass der Wasserspender in der Praxis Süd tropft. Lege eine Aufgabe für Lena an, beide Spender am Donnerstag um 14 Uhr zu prüfen, und entwirf eine Antwort.",
      "Erledigt. Das habe ich angelegt und geprüft:\n\n- **Aufgabe angelegt:** Beide Wasserspender im Zahnzentrum am Eichenhof prüfen (Praxis Süd tropft), zugewiesen an Lena Hartmann, Priorität Hoch, fällig am Donnerstag, Termin 14:00 bis 15:00 Uhr, verknüpft mit dem Zahnzentrum am Eichenhof und Elke Pohl.\n- **Verträge geprüft, nicht geändert:** Der Wasserspender in der Praxis Süd (140 € im Monat, vor 70 Tagen gestartet) ist Aktiv. Der Vertrag für die Praxis Nord steht weiter auf Prüfung fällig, den habe ich so gelassen. Der letzte Kontakt beim Kunden liegt 41 Tage zurück; trag ihn nach dem Besuch nach.\n- **Antwort entworfen:** In der E-Mail-Unterhaltung mit Frau Pohl steht ein Entwurf, dass Frau Hartmann am Donnerstag gegen 14 Uhr kommt, die Hahndichtung tauscht und sich auf derselben Fahrt den Spender in der Praxis Nord ansieht.\n\nEs wurde nichts gesendet. Der Entwurf wartet in deinem Posteingang auf deine Prüfung.",
    ],
  },
  files: {
    agreement: {
      title: "Servicevertrag",
      between: "Zwischen Bohnenhaus Büroservice und",
      scope: "Leistungsumfang",
      columns: ["Leistung", "Standortadresse", "Monatspauschale", "Jahreswert"],
      care: "Servicezusagen",
      clauses: {
        coffeeMachines:
          "Maschinen, Aufbau und Ersatzteile sind enthalten. Unser Techniker übernimmt die Entkalkung alle vier Wochen und tauscht den Wasserfilter zweimal im Jahr; auf eine Störung reagieren wir innerhalb eines Werktags.",
        breakroomSupplies:
          "Wöchentliche Lieferung von Kaffeebohnen, Milch, Tee, Obst und Küchenbedarf, gezählt und aufgefüllt von unserem Fahrer. Wasserkocher und Maschinen vor Ort gehören zur Entkalkungsrunde.",
        catering:
          "Mittagessen und Snacks für Besprechungen, bestellt bis 12 Uhr am Vortag. Kaffeemaschinen bei Veranstaltungen folgen demselben Entkalkungsplan wie die Büromaschinen.",
        waterDispensers:
          "Spender, Flaschen und Becher sind enthalten. Vierteljährlicher Hygieneservice mit Entkalkung und Desinfektion jedes Spenders.",
      },
      term: "Laufzeit",
      termText:
        "Der Vertrag läuft zwölf Monate ab Beginn und verlängert sich um ein weiteres Jahr, wenn keine Seite einen Monat vor dem Jahresgespräch schriftlich kündigt. Die Pauschalen rechnet unsere Buchhaltung monatlich ab.",
      signed: "Für den Kunden unterschrieben von",
    },
    workbook: {
      name: "Jahresgespräch – Verbrauch je Standort.xlsx",
      rows: [
        [
          "Standort",
          "Leistung",
          "Tassen Kaffee pro Monat",
          "Catering-Termine pro Monat",
          "Wasserflaschen pro Monat",
          "Monatspauschale (€)",
        ],
        ["Hauptsitz, Leipzig", "Kaffeemaschinen", 3100, "", "", 420],
        ["Hauptsitz, Leipzig", "Besprechungscatering", "", 9, "", 950],
        ["Werkstatt, Merseburg", "Teeküchenbedarf", 650, "", "", 310],
        ["Büro Dresden", "Wasserspender", "", "", 40, 120],
        ["Summe", "", 3750, 9, 40, 1800],
      ],
    },
  },
  trash: ["Thomas Ostermann (Duplikat)", "Wacholder Architekten – Verlängerung Teeküchenbedarf"],
  mateChat: {
    title: "Jahresgespräch mit Hollmann vorbereiten",
    messages: [
      "Bereite das Jahresgespräch mit Hollmann vor",
      "Hollmann Ingenieure hat 4 Verträge an 3 Standorten:\n\n| Vertrag | Standort | Monatspauschale |\n| --- | --- | --- |\n| Kaffeemaschinen | Hauptsitz, Leipzig | 420 € |\n| Besprechungscatering | Hauptsitz, Leipzig | 950 € |\n| Teeküchenbedarf | Werkstatt, Merseburg | 310 € |\n| Wasserspender | Büro Dresden | 120 € |\n\nZusammen sind das 1.800 € im Monat oder 21.600 € im Jahr. Die Verbrauchsübersicht an der Verkaufschance zeigt rund 3.100 Tassen im Monat am Hauptsitz und 9 Catering-Termine im Monat; Dresden ist erst diesen Monat gestartet. Der unterschriebene Vertrag für die Kaffeemaschinen sieht eine Entkalkung alle vier Wochen vor, und Herr Ostermann hat per WhatsApp wieder die Entkalkungsanzeige gemeldet. Ich würde den Entkalkungstermin vor dem Gespräch bestätigen. Die Verkaufschance zum Jahresgespräch steht mit 23.400 € für das nächste Jahr.\n\nVorschlag für die Tagesordnung mit Frau Meißner und Herrn Lorenz: Verbrauch je Standort, der Start in Dresden, Kaffee und Teeküche für Dresden (die offene Verkaufschance über 9.600 €) und die neuen Monatspauschalen.",
    ],
  },
};

type Manager = "maxBergmann" | "colleagueA" | "colleagueB";

type OrganizationFacts = {
  status: "newRelationship" | "activeDiscussion" | "customer" | "dormant";
  manager: Manager;
  lastContact: number;
  nextAction?: number;
  segment: string;
  sites: number;
  channel: string;
  domain: string;
  createdDaysAgo: number;
  since?: number;
  history?: Array<{ daysAgo: number; previous: Record<string, FieldInput> }>;
};

const ORGANIZATION_FACTS: Record<OrganizationKey, OrganizationFacts> = {
  halverson: {
    status: "customer",
    manager: "maxBergmann",
    lastContact: -2,
    nextAction: 3,
    segment: "midsize",
    sites: 3,
    channel: "email",
    domain: "halverson-engineering.example",
    createdDaysAgo: 1150,
    since: -1120,
    history: [{ daysAgo: 6, previous: { sites: 2 } }],
  },
  meridian: {
    status: "customer",
    manager: "maxBergmann",
    lastContact: -12,
    nextAction: 4,
    segment: "midsize",
    sites: 2,
    channel: "email",
    domain: "meridian-insurance.example",
    createdDaysAgo: 640,
    since: -610,
  },
  oakfield: {
    status: "customer",
    manager: "colleagueA",
    lastContact: -41,
    nextAction: -2,
    segment: "smallOffice",
    sites: 2,
    channel: "phone",
    domain: "oakfield-dental.example",
    createdDaysAgo: 230,
    since: -200,
  },
  brightside: {
    status: "customer",
    manager: "colleagueA",
    lastContact: -3,
    nextAction: 19,
    segment: "coworking",
    sites: 1,
    channel: "whatsapp",
    domain: "brightside-cowork.example",
    createdDaysAgo: 520,
    since: -480,
    history: [{ daysAgo: 90, previous: { preferredChannel: "email" } }],
  },
  larkspur: {
    status: "newRelationship",
    manager: "colleagueA",
    lastContact: -5,
    nextAction: 5,
    segment: "smallOffice",
    sites: 1,
    channel: "phone",
    domain: "larkspur-law.example",
    createdDaysAgo: 16,
  },
  riverbend: {
    status: "customer",
    manager: "colleagueB",
    lastContact: -8,
    nextAction: 2,
    segment: "midsize",
    sites: 5,
    channel: "email",
    domain: "riverbend-cu.example",
    createdDaysAgo: 450,
    since: -400,
  },
  tallis: {
    status: "customer",
    manager: "colleagueA",
    lastContact: -1,
    nextAction: 30,
    segment: "midsize",
    sites: 1,
    channel: "whatsapp",
    domain: "tallis-software.example",
    createdDaysAgo: 110,
    since: -75,
    history: [{ daysAgo: 75, previous: { relationshipStatus: "activeDiscussion" } }],
  },
  greystone: {
    status: "newRelationship",
    manager: "colleagueB",
    lastContact: -9,
    nextAction: 7,
    segment: "smallOffice",
    sites: 1,
    channel: "email",
    domain: "greystone-property.example",
    createdDaysAgo: 22,
  },
  juniper: {
    status: "dormant",
    manager: "colleagueB",
    lastContact: -64,
    segment: "smallOffice",
    sites: 1,
    channel: "email",
    domain: "juniper-studio.example",
    createdDaysAgo: 380,
    since: -350,
    history: [{ daysAgo: 60, previous: { relationshipStatus: "customer" } }],
  },
  westmoor: {
    status: "activeDiscussion",
    manager: "maxBergmann",
    lastContact: -4,
    nextAction: 6,
    segment: "largeSite",
    sites: 2,
    channel: "phone",
    domain: "westmoor-logistics.example",
    createdDaysAgo: 45,
    history: [{ daysAgo: 8, previous: { relationshipStatus: "newRelationship" } }],
  },
  ashcombe: {
    status: "customer",
    manager: "colleagueB",
    lastContact: -62,
    nextAction: -5,
    segment: "smallOffice",
    sites: 1,
    channel: "email",
    domain: "ashcombe-media.example",
    createdDaysAgo: 700,
    since: -680,
  },
  kingsley: {
    status: "newRelationship",
    manager: "maxBergmann",
    lastContact: -3,
    nextAction: 1,
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
    role: "officeManager" | "purchasing" | "management";
    createdDaysAgo: number;
    mobile?: string;
    whatsapp?: boolean;
    linkedin?: boolean;
  }
> = {
  diane: { organization: "halverson", role: "management", createdDaysAgo: 1140 },
  tom: {
    organization: "halverson",
    role: "officeManager",
    createdDaysAgo: 1140,
    mobile: "11",
    whatsapp: true,
  },
  priya: { organization: "halverson", role: "officeManager", createdDaysAgo: 30, mobile: "14", whatsapp: true },
  greg: { organization: "halverson", role: "management", createdDaysAgo: 900 },
  karen: { organization: "meridian", role: "officeManager", createdDaysAgo: 630 },
  sam: { organization: "meridian", role: "purchasing", createdDaysAgo: 400 },
  laura: { organization: "oakfield", role: "officeManager", createdDaysAgo: 228 },
  ellen: { organization: "oakfield", role: "officeManager", createdDaysAgo: 90 },
  marcus: {
    organization: "brightside",
    role: "officeManager",
    createdDaysAgo: 515,
    mobile: "12",
    whatsapp: true,
  },
  helen: { organization: "larkspur", role: "officeManager", createdDaysAgo: 15 },
  patrick: { organization: "riverbend", role: "purchasing", createdDaysAgo: 445 },
  nina: { organization: "riverbend", role: "officeManager", createdDaysAgo: 300 },
  josh: {
    organization: "tallis",
    role: "management",
    createdDaysAgo: 108,
    mobile: "13",
    whatsapp: true,
  },
  beth: { organization: "greystone", role: "management", createdDaysAgo: 21, linkedin: true },
  owen: { organization: "juniper", role: "officeManager", createdDaysAgo: 378, mobile: "16", whatsapp: true },
  carl: { organization: "westmoor", role: "officeManager", createdDaysAgo: 44, mobile: "15", whatsapp: true },
  anita: { organization: "westmoor", role: "management", createdDaysAgo: 40, linkedin: true },
  zoe: { organization: "ashcombe", role: "officeManager", createdDaysAgo: 120 },
  frank: { organization: "kingsley", role: "purchasing", createdDaysAgo: 5 },
  lisa: { organization: "kingsley", role: "purchasing", createdDaysAgo: 4, linkedin: true },
};

type SiteKey = keyof Strings["sites"];

const CONTRACT_FACTS: Record<
  ContractKey,
  {
    organization: OrganizationKey;
    service: ServiceKey;
    site: SiteKey;
    fee: number;
    start: number;
    review: number;
    status: "active" | "reviewDue" | "cancelled";
    history?: Array<{ daysAgo: number; status: string }>;
  }
> = {
  halversonCoffee: {
    organization: "halverson",
    service: "coffeeMachines",
    site: "head",
    fee: 420,
    start: -1120,
    review: 21,
    status: "reviewDue",
    history: [{ daysAgo: 5, status: "active" }],
  },
  halversonCatering: {
    organization: "halverson",
    service: "catering",
    site: "head",
    fee: 950,
    start: -700,
    review: 21,
    status: "reviewDue",
    history: [{ daysAgo: 5, status: "active" }],
  },
  halversonWorkshop: {
    organization: "halverson",
    service: "breakroomSupplies",
    site: "workshop",
    fee: 310,
    start: -560,
    review: 140,
    status: "active",
  },
  halversonWater: {
    organization: "halverson",
    service: "waterDispensers",
    site: "cincinnati",
    fee: 120,
    start: -6,
    review: 359,
    status: "active",
  },
  meridianCoffee: {
    organization: "meridian",
    service: "coffeeMachines",
    site: "head",
    fee: 900,
    start: -610,
    review: 17,
    status: "active",
  },
  meridianWater: {
    organization: "meridian",
    service: "waterDispensers",
    site: "downtown",
    fee: 190,
    start: -300,
    review: 160,
    status: "active",
  },
  oakfieldWaterNorth: {
    organization: "oakfield",
    service: "waterDispensers",
    site: "north",
    fee: 140,
    start: -200,
    review: -3,
    status: "reviewDue",
    history: [{ daysAgo: 30, status: "active" }],
  },
  oakfieldWaterSouth: {
    organization: "oakfield",
    service: "waterDispensers",
    site: "south",
    fee: 140,
    start: -70,
    review: 295,
    status: "active",
  },
  brightsideCoffee: {
    organization: "brightside",
    service: "coffeeMachines",
    site: "main",
    fee: 720,
    start: -480,
    review: 26,
    status: "reviewDue",
    history: [{ daysAgo: 12, status: "active" }],
  },
  brightsideSupplies: {
    organization: "brightside",
    service: "breakroomSupplies",
    site: "main",
    fee: 350,
    start: -480,
    review: 26,
    status: "reviewDue",
    history: [{ daysAgo: 12, status: "active" }],
  },
  brightsideEvents: {
    organization: "brightside",
    service: "catering",
    site: "main",
    fee: 400,
    start: -150,
    review: 215,
    status: "active",
  },
  riverbendCoffee: {
    organization: "riverbend",
    service: "coffeeMachines",
    site: "head",
    fee: 980,
    start: -400,
    review: 330,
    status: "active",
  },
  riverbendWater: {
    organization: "riverbend",
    service: "waterDispensers",
    site: "head",
    fee: 210,
    start: -400,
    review: 330,
    status: "active",
  },
  riverbendCatering: {
    organization: "riverbend",
    service: "catering",
    site: "head",
    fee: 560,
    start: -230,
    review: 135,
    status: "active",
  },
  tallisCoffee: {
    organization: "tallis",
    service: "coffeeMachines",
    site: "main",
    fee: 480,
    start: -75,
    review: 290,
    status: "active",
  },
  tallisSupplies: {
    organization: "tallis",
    service: "breakroomSupplies",
    site: "main",
    fee: 180,
    start: -75,
    review: 290,
    status: "active",
  },
  juniperSupplies: {
    organization: "juniper",
    service: "breakroomSupplies",
    site: "main",
    fee: 220,
    start: -350,
    review: -10,
    status: "cancelled",
    history: [{ daysAgo: 60, status: "active" }],
  },
  ashcombeCoffee: {
    organization: "ashcombe",
    service: "coffeeMachines",
    site: "main",
    fee: 450,
    start: -680,
    review: 12,
    status: "reviewDue",
    history: [{ daysAgo: 20, status: "active" }],
  },
};

type DealFacts = {
  organization: OrganizationKey;
  contacts: ContactKey[];
  stage: "identified" | "offerSent" | "trial" | "agreed" | "notNow";
  type: string;
  value: number;
  createdDaysAgo: number;
  decision: number;
  next?: number;
  /** Stage changes, oldest first: `[daysAgo, stage before that change]`. */
  history?: Array<[number, string]>;
};

const DEAL_FACTS: Record<DealKey, DealFacts> = {
  halversonRenewal: {
    organization: "halverson",
    contacts: ["diane", "greg"],
    stage: "offerSent",
    type: "renewal",
    value: 23400,
    createdDaysAgo: 40,
    decision: 21,
    next: 5,
    history: [[12, "identified"]],
  },
  halversonSecondSite: {
    organization: "halverson",
    contacts: ["priya", "tom"],
    stage: "trial",
    type: "expansion",
    value: 9600,
    createdDaysAgo: 28,
    decision: 35,
    next: 9,
    history: [
      [14, "identified"],
      [6, "offerSent"],
    ],
  },
  meridianCatering: {
    organization: "meridian",
    contacts: ["karen", "sam"],
    stage: "offerSent",
    type: "expansion",
    value: 6200,
    createdDaysAgo: 18,
    decision: 20,
    next: 0,
    history: [[7, "identified"]],
  },
  oakfieldWater: {
    organization: "oakfield",
    contacts: ["laura", "ellen"],
    stage: "agreed",
    type: "expansion",
    value: 1680,
    createdDaysAgo: 95,
    decision: -70,
    history: [
      [85, "identified"],
      [70, "offerSent"],
    ],
  },
  larkspurStart: {
    organization: "larkspur",
    contacts: ["helen"],
    stage: "identified",
    type: "newClient",
    value: 4800,
    createdDaysAgo: 15,
    decision: 40,
    next: -1,
  },
  riverbendBranches: {
    organization: "riverbend",
    contacts: ["patrick", "nina"],
    stage: "trial",
    type: "expansion",
    value: 18500,
    createdDaysAgo: 25,
    decision: 30,
    next: 2,
    history: [
      [18, "identified"],
      [10, "offerSent"],
    ],
  },
  riverbendRenewal: {
    organization: "riverbend",
    contacts: ["patrick"],
    stage: "agreed",
    type: "renewal",
    value: 14800,
    createdDaysAgo: 70,
    decision: -35,
    history: [
      [50, "identified"],
      [35, "offerSent"],
    ],
  },
  tallisOffice: {
    organization: "tallis",
    contacts: ["josh"],
    stage: "agreed",
    type: "newClient",
    value: 7900,
    createdDaysAgo: 105,
    decision: -75,
    history: [
      [95, "identified"],
      [85, "offerSent"],
      [75, "trial"],
    ],
  },
  greystoneStart: {
    organization: "greystone",
    contacts: ["beth"],
    stage: "identified",
    type: "newClient",
    value: 3200,
    createdDaysAgo: 20,
    decision: 45,
    next: 7,
  },
  juniperFruit: {
    organization: "juniper",
    contacts: ["owen"],
    stage: "notNow",
    type: "expansion",
    value: 3100,
    createdDaysAgo: 120,
    decision: -64,
    history: [
      [110, "identified"],
      [64, "offerSent"],
    ],
  },
  westmoorCanteen: {
    organization: "westmoor",
    contacts: ["carl", "anita"],
    stage: "offerSent",
    type: "newClient",
    value: 24000,
    createdDaysAgo: 42,
    decision: 50,
    next: 6,
    history: [[8, "identified"]],
  },
  ashcombeRenewal: {
    organization: "ashcombe",
    contacts: ["zoe"],
    stage: "notNow",
    type: "renewal",
    value: 2400,
    createdDaysAgo: 160,
    decision: -100,
    history: [
      [130, "identified"],
      [100, "offerSent"],
    ],
  },
  kingsleyPilot: {
    organization: "kingsley",
    contacts: ["frank", "lisa"],
    stage: "identified",
    type: "newClient",
    value: 15000,
    createdDaysAgo: 4,
    decision: 60,
    next: 0,
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
    /** A tasting or machine check: story day, local start time and length in minutes. */
    visit?: [number, string, number];
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
    visit: [9, "10:00", 120],
  },
  descaleMachines: {
    status: "open",
    priority: "medium",
    due: -3,
    organization: "halverson",
    contact: "tom",
    createdDaysAgo: 9,
    visit: [-3, "07:30", 90],
  },
  meridianMenu: {
    status: "open",
    priority: "medium",
    due: 4,
    deal: "meridianCatering",
    contact: "karen",
    createdDaysAgo: 6,
    visit: [4, "12:00", 90],
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
    visit: [-4, "10:00", 90],
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
    due: 0,
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
    due: 19,
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
  oakfieldDispensers: {
    status: "open",
    priority: "high",
    due: 2,
    organization: "oakfield",
    contact: "ellen",
    createdDaysAgo: 0,
    visit: [2, "14:00", 60],
  },
};

const INBOX: ReadonlyArray<InboxThreadPlan & { key: InboxKey }> = [
  {
    key: "lisaLinkedin",
    account: "linkedin",
    with: ["lisa"],
    state: "unread",
    latestMinutesAgo: 25,
    speakers: ["self", "lisa", "self", "lisa"],
    links: ["organization:kingsley", "deal:kingsleyPilot"],
  },
  {
    key: "anitaLinkedin",
    account: "linkedin",
    with: ["anita"],
    state: "open",
    latestMinutesAgo: 130,
    speakers: ["anita", "self", "anita", "self", "anita"],
    links: ["organization:westmoor", "deal:westmoorCanteen"],
  },
  {
    key: "bethLinkedin",
    account: "linkedin",
    with: ["beth"],
    state: "open",
    latestMinutesAgo: 2760,
    speakers: ["self", "beth", "self", "beth", "self"],
    draft: true,
    links: ["organization:greystone", "deal:greystoneStart"],
  },
  {
    key: "gregUsage",
    account: "google",
    with: ["greg"],
    state: "open",
    latestMinutesAgo: 1200,
    speakers: ["self", "greg", "self", "greg"],
    links: ["organization:halverson", "deal:halversonRenewal"],
  },
  {
    key: "samMenus",
    account: "google",
    with: ["sam"],
    state: "unread",
    latestMinutesAgo: 200,
    speakers: ["self", "sam", "self", "sam"],
    links: ["organization:meridian", "deal:meridianCatering"],
  },
  {
    key: "ellenDispenser",
    account: "google",
    with: ["ellen"],
    state: "open",
    latestMinutesAgo: 420,
    speakers: ["ellen", "self"],
    draft: true,
    links: ["organization:oakfield", "contract:oakfieldWaterSouth"],
  },
  {
    key: "zoeCheckIn",
    account: "google",
    with: ["zoe"],
    state: "open",
    latestMinutesAgo: 3000,
    speakers: ["self", "zoe", "self"],
    draft: true,
    links: ["organization:ashcombe", "deal:ashcombeRenewal"],
  },
  {
    key: "priyaTasting",
    account: "whatsapp",
    with: ["priya"],
    state: "open",
    latestMinutesAgo: 55,
    speakers: ["priya", "self", "priya"],
    links: ["organization:halverson", "deal:halversonSecondSite"],
  },
  {
    key: "carlWalkthrough",
    account: "whatsapp",
    with: ["carl"],
    state: "open",
    latestMinutesAgo: 4620,
    speakers: ["carl", "self", "carl", "self"],
    reactions: [[3, "carl", "👍"]],
    links: ["organization:westmoor", "deal:westmoorCanteen"],
  },
  {
    key: "owenMove",
    account: "whatsapp",
    with: ["owen"],
    state: "open",
    latestMinutesAgo: 8640,
    speakers: ["owen", "self", "owen", "self"],
    links: ["organization:juniper", "deal:juniperFruit"],
  },
];

function mailbox(name: string): string {
  return name
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/ł/g, "l")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z]/g, "");
}

function organizationOf(facts: { organization?: OrganizationKey; deal?: DealKey }): OrganizationKey {
  const key = facts.organization ?? (facts.deal ? DEAL_FACTS[facts.deal].organization : undefined);
  if (!key) throw new Error("Every client-management task belongs to a client");
  return key;
}

const AGENT_EDITS: Record<string, AgentKeyName> = {
  "deal:halversonRenewal": "Claude Desktop",
  "deal:greystoneStart": "Claude Desktop",
  "deal:westmoorCanteen": "ChatGPT",
  "contact:tom": "Codex CLI",
};

export default defineSolution<Strings>({
  id: "client-management",
  strings: { en, de, es, pt, pl, nl },
  story: {
    en: { currency: "USD", timeZone: "America/New_York" },
    de: { currency: "EUR", timeZone: "Europe/Berlin" },
    es: { currency: "EUR", timeZone: "Europe/Madrid" },
    pt: { currency: "BRL", timeZone: "America/Sao_Paulo" },
    pl: { currency: "PLN", timeZone: "Europe/Warsaw" },
    nl: { currency: "EUR", timeZone: "Europe/Amsterdam" },
  },
  build: (t, locale) => {
    const mobile = (suffix: string) => phoneNumber(t.phones.mobile, Number(suffix));
    const office = (index: number) => phoneNumber(t.phones.office, index);
    const open = ["identified", "offerSent", "trial"];
    const live = [{ field: "status", notIn: ["cancelled"] }];
    const manager = (key: OrganizationKey) => ORGANIZATION_FACTS[key].manager;
    const label = <K extends string>(
      options: Record<K, string>,
      colors: Record<K, "default" | "secondary" | "destructive" | "success" | "warning" | "info">,
    ) => (Object.keys(options) as K[]).map((key) => ({ key, label: options[key], color: colors[key] }));

    const siteAddress = (key: ContractKey): AddressInput => {
      const facts = CONTRACT_FACTS[key];
      return facts.site === "head" || facts.site === "main" || facts.site === "north"
        ? t.addresses[facts.organization]
        : t.extraSites[facts.site];
    };

    const organization: RecordSpec[] = ORGANIZATIONS.map((key) => {
      const facts = ORGANIZATION_FACTS[key];
      const [name] = t.organizations[key];
      return {
        key,
        values: {
          name,
          relationshipStatus: facts.status,
          segment: facts.segment,
          accountManager: facts.manager,
          lastContact: day(facts.lastContact),
          ...(facts.nextAction === undefined ? {} : { nextActionDate: day(facts.nextAction) }),
          preferredChannel: facts.channel,
          sites: facts.sites,
          headOffice: t.addresses[key],
          website: `https://${facts.domain}`,
          ...(facts.since === undefined ? {} : { clientSince: day(facts.since) }),
        },
        owner: facts.manager,
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
        values: { firstName, lastName, jobTitle, role: facts.role },
        links: { "contact.organizations": facts.organization },
        owner: manager(facts.organization),
        channels: {
          email: `${mailbox(firstName)}.${mailbox(lastName)}@${domain}`,
          phone,
          ...(facts.linkedin
            ? {
                linkedin: `${mailbox(firstName)}-${mailbox(lastName)}.linkedin.example`,
                linkedinUrl: `https://linkedin.example/in/${mailbox(firstName)}-${mailbox(lastName)}`,
              }
            : {}),
        },
        createdDaysAgo: facts.createdDaysAgo,
      };
    });
    const contract: RecordSpec[] = CONTRACTS.map((key) => {
      const facts = CONTRACT_FACTS[key];
      return {
        key,
        values: {
          name: t.contracts[key],
          service: facts.service,
          siteAddress: siteAddress(key),
          monthlyFee: facts.fee,
          startDate: day(facts.start),
          reviewDate: day(facts.review),
          status: facts.status,
        },
        links: { "contract.client": facts.organization },
        owner: manager(facts.organization),
        createdDaysAgo: Math.min(-facts.start, ORGANIZATION_FACTS[facts.organization].createdDaysAgo - 1),
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
        owner: manager(facts.organization),
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
        values: {
          name: t.tasks[key],
          status: facts.status,
          priority: facts.priority,
          dueDate: day(facts.due),
          ...(facts.visit ? { scheduled: rangeAt(...facts.visit) } : {}),
        },
        links: {
          ...(facts.deal ? { "task.deals": facts.deal } : {}),
          "task.organizations": organizationKey,
          ...(facts.contact ? { "task.contacts": facts.contact } : {}),
        },
        owner: manager(organizationKey),
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

    const withNotes = (records: RecordSpec[], notes: Record<string, string>): RecordSpec[] =>
      records.map((record) =>
        notes[record.key] ? { ...record, values: { ...record.values, notes: notes[record.key] } } : record,
      );

    const routine = (key: keyof Strings["routines"]) => t.routines[key];
    const failureNote = t.routines.noContact.note;

    return {
      workspaceName: t.workspaceName,
      companyName: t.company,
      lists: (["organization", "contact", "contract", "deal", "task"] as const).map((key) => ({
        key,
        label: t.lists[key][0],
        pluralLabel: t.lists[key][1],
        description: t.lists[key][2],
        icon: { organization: "building", contact: "contact", contract: "document", deal: "handshake", task: "check" }[
          key
        ],
      })),
      fields: [
        {
          key: "organization.relationshipStatus",
          label: t.fields.relationshipStatus,
          type: "select",
          options: label(t.options.relationshipStatus, {
            newRelationship: "info",
            activeDiscussion: "warning",
            customer: "success",
            dormant: "secondary",
          }),
        },
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
        { key: "organization.accountManager", label: t.fields.accountManager, type: "member" },
        { key: "organization.lastContact", label: t.fields.lastContact, type: "date" },
        { key: "organization.nextActionDate", label: t.fields.nextActionDate, type: "date" },
        {
          key: "organization.preferredChannel",
          label: t.fields.preferredChannel,
          type: "select",
          options: label(t.options.preferredChannel, { email: "info", phone: "secondary", whatsapp: "success" }),
        },
        { key: "organization.sites", label: t.fields.sites, type: "number" },
        {
          key: "organization.annualValue",
          label: t.fields.annualValue,
          type: "currency",
          formula: { kind: "rollupSum", relation: "contract.client", field: "contract.annualValue" },
        },
        { key: "organization.headOffice", label: t.fields.headOffice, type: "address" },
        { key: "organization.website", label: t.fields.website, type: "url" },
        { key: "organization.clientSince", label: t.fields.clientSince, type: "date" },
        { key: "contact.jobTitle", label: t.fields.jobTitle, type: "text" },
        {
          key: "contact.role",
          label: t.fields.role,
          type: "select",
          options: label(t.options.role, { officeManager: "info", purchasing: "warning", management: "success" }),
        },
        {
          key: "contract.service",
          label: t.fields.service,
          type: "select",
          options: label(t.options.service, {
            coffeeMachines: "warning",
            breakroomSupplies: "secondary",
            catering: "info",
            waterDispensers: "success",
          }),
        },
        { key: "contract.siteAddress", label: t.fields.siteAddress, type: "address" },
        { key: "contract.monthlyFee", label: t.fields.monthlyFee, type: "currency" },
        {
          key: "contract.annualValue",
          label: t.fields.annualValue,
          type: "currency",
          formula: { kind: "product", left: "contract.monthlyFee", right: 12 },
        },
        { key: "contract.startDate", label: t.fields.startDate, type: "date" },
        { key: "contract.reviewDate", label: t.fields.reviewDate, type: "date" },
        {
          key: "contract.status",
          label: t.fields.contractStatus,
          type: "select",
          options: label(t.options.contractStatus, { active: "success", reviewDue: "warning", cancelled: "secondary" }),
        },
        { key: "contract.signedContract", label: t.fields.signedContract, type: "file" },
        {
          key: "deal.opportunityType",
          label: t.fields.opportunityType,
          type: "select",
          options: label(t.options.opportunityType, { newClient: "success", expansion: "info", renewal: "secondary" }),
        },
        { key: "deal.decisionDate", label: t.fields.decisionDate, type: "date" },
        { key: "deal.nextStep", label: t.fields.nextStep, type: "text" },
        { key: "deal.nextStepDate", label: t.fields.nextStepDate, type: "date" },
        { key: "deal.documents", label: t.fields.documents, type: "file" },
        { key: "task.dueDate", label: t.fields.dueDate, type: "date" },
        { key: "task.scheduled", label: t.fields.scheduled, type: "dateTimeRange" },
        {
          key: "task.priority",
          label: t.fields.priority,
          type: "select",
          options: label(t.options.priority, { low: "secondary", medium: "info", high: "destructive" }),
        },
      ],
      stages: [
        { key: "identified", label: t.stages.identified, color: "info", probability: 20 },
        { key: "offerSent", label: t.stages.offerSent, color: "warning", probability: 50 },
        { key: "trial", label: t.stages.trial, color: "warning", probability: 70 },
        { key: "agreed", label: t.stages.agreed, color: "success", probability: 100 },
        { key: "notNow", label: t.stages.notNow, color: "secondary", probability: 0 },
      ],
      relationships: [
        {
          key: "contract.client",
          source: "contract",
          target: "organization",
          sourceCardinality: "one",
          targetCardinality: "many",
        },
      ],
      members: (["colleagueA", "colleagueB"] as const).map((key) => {
        const [firstName, lastName, email] = t.members[key];
        return { key, firstName, lastName, email };
      }),
      records: agentEdited(
        {
          organization,
          contact: withNotes(contact, { tom: t.notes.tom }),
          contract,
          deal: withNotes(deal, {
            halversonRenewal: t.notes.halversonRenewal,
            westmoorCanteen: t.notes.westmoorCanteen,
            greystoneStart: t.notes.greystoneStart,
          }),
          task,
        },
        AGENT_EDITS,
      ),
      views: [
        {
          key: "clientsByStatus",
          list: "organization",
          name: t.views.clientsByStatus,
          mode: "board",
          groupBy: "relationshipStatus",
          columns: ["annualValue", "accountManager", "lastContact", "headOffice"],
        },
        {
          key: "clientOverview",
          list: "organization",
          name: t.views.clientOverview,
          mode: "table",
          columns: ["relationshipStatus", "segment", "annualValue", "lastContact", "accountManager", "headOffice"],
          sort: { field: "annualValue", direction: "desc" },
        },
        {
          key: "upcomingReviews",
          list: "contract",
          name: t.views.upcomingReviews,
          mode: "table",
          columns: ["reviewDate", "status", "contract.client", "siteAddress", "service", "annualValue"],
          filters: live,
          sort: { field: "reviewDate", direction: "asc" },
        },
        {
          key: "noRecentContact",
          list: "organization",
          name: t.views.noRecentContact,
          mode: "table",
          columns: ["lastContact", "nextActionDate", "relationshipStatus", "accountManager", "preferredChannel"],
          filters: [{ field: "relationshipStatus", in: ["customer", "activeDiscussion"] }],
          sort: { field: "lastContact", direction: "asc" },
        },
        {
          key: "pipeline",
          list: "deal",
          name: t.views.pipeline,
          mode: "board",
          groupBy: "stage",
          columns: ["totalValue", "deal.organizations", "opportunityType", "nextStepDate"],
        },
        {
          key: "allContacts",
          list: "contact",
          name: t.views.allContacts,
          mode: "table",
          columns: ["jobTitle", "role", "contact.organizations", "capability.identity"],
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
        {
          key: "reviewCalendar",
          list: "contract",
          name: t.views.reviewCalendar,
          mode: "calendar",
          calendar: { date: "reviewDate", color: "service", mode: "month" },
          columns: ["status", "contract.client", "annualValue"],
          filters: live,
        },
      ],
      dashboard: {
        widgets: [
          {
            kind: "kpi",
            title: t.widgets.annualValue,
            list: "contract",
            aggregation: "sum",
            field: "annualValue",
            filters: live,
          },
          {
            kind: "kpi",
            title: t.widgets.reviewDue,
            list: "contract",
            aggregation: "count",
            filters: [{ field: "status", in: ["reviewDue"] }],
          },
          {
            kind: "kpi",
            title: t.widgets.noContact,
            list: "organization",
            aggregation: "count",
            filters: [
              { field: "relationshipStatus", in: ["customer"] },
              { field: "lastContact", olderThanDays: 30 },
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
            title: t.widgets.byStatus,
            display: DisplayType.doughnutChart,
            list: "organization",
            aggregation: "count",
            groupBy: { field: "relationshipStatus" },
          },
          {
            kind: "calendar",
            title: t.widgets.reviews,
            list: "contract",
            layout: "upcoming",
            date: "reviewDate",
            days: 30,
            amount: "annualValue",
            filters: live,
          },
          {
            kind: "chart",
            title: t.widgets.topClients,
            display: DisplayType.rankedTable,
            list: "contract",
            aggregation: "sum",
            field: "annualValue",
            groupBy: { relation: "contract.client" },
            filters: live,
          },
          {
            kind: "calendar",
            title: t.widgets.actionsMonth,
            list: "organization",
            layout: "month",
            date: "nextActionDate",
          },
          {
            kind: "map",
            title: t.widgets.sitesMap,
            list: "contract",
            address: "siteAddress",
            color: "service",
            size: "monthlyFee",
            detail: "status",
            filters: live,
          },
          { kind: "activity", title: t.widgets.latestActivity },
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
        {
          key: "yearlyReview",
          kind: "procedure",
          title: t.wiki.yearlyReview.title,
          whenToUse: t.wiki.yearlyReview.whenToUse,
          markdown: t.wiki.yearlyReview.markdown,
        },
        agentsPage(locale, t.agents),
      ],
      routines: [
        {
          key: "noContact",
          name: routine("noContact").name,
          task: routine("noContact").task,
          trigger: { kind: "schedule", cron: "0 8 * * 1" },
          runs: [
            {
              status: "succeeded",
              startedHoursAgo: 50,
              durationSeconds: 64,
              credits: 9,
              summary: routine("noContact").runs[0],
            },
            {
              status: "failed",
              startedHoursAgo: 218,
              durationSeconds: 11,
              credits: 2,
              error: "providerUnavailable",
              note: failureNote,
            },
            {
              status: "succeeded",
              startedHoursAgo: 386,
              durationSeconds: 57,
              credits: 8,
              summary: routine("noContact").runs[1],
            },
          ],
        },
        {
          key: "contractReviews",
          name: routine("contractReviews").name,
          task: routine("contractReviews").task,
          owner: "colleagueA",
          trigger: { kind: "schedule", cron: "0 8 1 * *" },
          runs: [
            {
              status: "succeeded",
              startedHoursAgo: 530,
              durationSeconds: 96,
              credits: 16,
              summary: routine("contractReviews").runs[0],
            },
            {
              status: "succeeded",
              startedHoursAgo: 1262,
              durationSeconds: 71,
              credits: 11,
              summary: routine("contractReviews").runs[1],
            },
          ],
        },
        {
          key: "followUp",
          name: routine("followUp").name,
          task: routine("followUp").task,
          trigger: { kind: "schedule", cron: "0 8 * * 1-5" },
          runs: [
            {
              status: "succeeded",
              startedHoursAgo: 6,
              durationSeconds: 71,
              credits: 11,
              summary: routine("followUp").runs[0],
            },
            {
              status: "succeeded",
              startedHoursAgo: 30,
              durationSeconds: 66,
              credits: 10,
              summary: routine("followUp").runs[1],
            },
            {
              status: "succeeded",
              startedHoursAgo: 102,
              durationSeconds: 48,
              credits: 6,
              summary: routine("followUp").runs[2],
            },
          ],
        },
        {
          key: "replyTasks",
          name: routine("replyTasks").name,
          task: routine("replyTasks").task,
          trigger: {
            kind: "event",
            events: ["messaging.email.received"],
            debounceSeconds: 300,
            sample: { thread: 12 },
          },
          runs: [
            {
              status: "succeeded",
              startedHoursAgo: 7,
              durationSeconds: 28,
              credits: 4,
              summary: routine("replyTasks").runs[0],
            },
            {
              status: "succeeded",
              startedHoursAgo: 79,
              durationSeconds: 19,
              credits: 3,
              summary: routine("replyTasks").runs[1],
            },
          ],
        },
      ],
      apiKeys: agentApiKeys([74, 41, 9]),
      files: [
        ...SIGNED_CONTRACTS.map((key): FileSpec => {
          const facts = CONTRACT_FACTS[key];
          const a = t.files.agreement;
          const client = t.organizations[facts.organization][0];
          const signer = CONTACTS.find(
            (contact) =>
              CONTACT_FACTS[contact].organization === facts.organization &&
              CONTACT_FACTS[contact].role === "management",
          );
          const place = siteAddress(key);
          return {
            key: `agreement-${key}`,
            record: `contract:${key}`,
            field: "contract.signedContract",
            name: `${a.title} – ${client} – ${t.sites[facts.site]}.pdf`,
            kind: "pdf",
            lines: [
              `# ${a.title}: ${t.contracts[key]}`,
              `${a.between} ${client}.`,
              `## ${a.scope}`,
              `| ${a.columns.join(" | ")} |`,
              `| ${t.options.service[facts.service]} | ${place.street}, ${place.postalCode} ${place.city} | ${t.money(facts.fee)} | ${t.money(facts.fee * 12)} |`,
              `## ${a.care}`,
              a.clauses[facts.service],
              `## ${a.term}`,
              a.termText,
              ...(signer
                ? [`${a.signed} ${t.contacts[signer][0]} ${t.contacts[signer][1]}, ${t.contacts[signer][2]}.`]
                : []),
            ],
            uploadedDaysAgo: contract.find((record) => record.key === key)?.createdDaysAgo ?? 1,
            by: manager(facts.organization),
          };
        }),
        {
          key: "halversonUsage",
          record: "deal:halversonRenewal",
          field: "deal.documents",
          name: t.files.workbook.name,
          kind: "xlsx",
          rows: t.files.workbook.rows,
          uploadedDaysAgo: 4,
          by: "maxBergmann",
        },
      ],
      planner: {
        sources: [
          { list: "contract", date: "reviewDate", filters: live, color: "warning" },
          { list: "task", date: "scheduled", color: "info" },
          { list: "deal", date: "decisionDate", filters: [{ field: "stage", in: open }], color: "success" },
        ],
        mode: "month",
      },
      trash: [
        { list: "contact", name: t.trash[0], daysAgo: 6 },
        { list: "deal", name: t.trash[1], daysAgo: 15 },
      ],
      mateChats: [
        {
          title: t.mateChat.title,
          endedHoursAgo: 5,
          messages: t.mateChat.messages.map((text, index) => ({
            role: index % 2 === 0 ? ("user" as const) : ("assistant" as const),
            text,
          })),
        },
        {
          title: t.mateChatDispenser.title,
          endedHoursAgo: 6,
          messages: t.mateChatDispenser.messages.map((text, index) => ({
            role: index % 2 === 0 ? ("user" as const) : ("assistant" as const),
            text,
          })),
        },
      ],
      messaging: {
        accounts: ["google", "linkedin", "whatsapp"],
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
          ...inboxThreads(INBOX, t.inbox),
        ],
      },
    };
  },
});
