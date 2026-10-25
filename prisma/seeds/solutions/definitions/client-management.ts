import { DisplayType } from "@/features/widget/widget-display.schema";

import {
  groupDigits,
  address,
  day,
  defineSolution,
  photo,
  rangeAt,
  type AddressInput,
  type FieldInput,
  type FileSpec,
  type RecordSpec,
  phoneNumber,
} from "../define-solution";

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
] as const;
type TaskKey = (typeof TASKS)[number];
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

type Strings = typeof en;

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
    avatar?: Parameters<typeof photo>[0];
  }
> = {
  diane: { organization: "halverson", role: "management", createdDaysAgo: 1140, avatar: "anna-mueller" },
  tom: {
    organization: "halverson",
    role: "officeManager",
    createdDaysAgo: 1140,
    mobile: "11",
    whatsapp: true,
    avatar: "tim-wagner",
  },
  priya: { organization: "halverson", role: "officeManager", createdDaysAgo: 30, avatar: "leila-chen" },
  greg: { organization: "halverson", role: "management", createdDaysAgo: 900, avatar: "paul-koch" },
  karen: { organization: "meridian", role: "officeManager", createdDaysAgo: 630, avatar: "mia-schneider" },
  sam: { organization: "meridian", role: "purchasing", createdDaysAgo: 400 },
  laura: { organization: "oakfield", role: "officeManager", createdDaysAgo: 228 },
  ellen: { organization: "oakfield", role: "officeManager", createdDaysAgo: 90 },
  marcus: {
    organization: "brightside",
    role: "officeManager",
    createdDaysAgo: 515,
    mobile: "12",
    whatsapp: true,
    avatar: "lukas-fischer",
  },
  helen: { organization: "larkspur", role: "officeManager", createdDaysAgo: 15 },
  patrick: { organization: "riverbend", role: "purchasing", createdDaysAgo: 445, avatar: "felix-koch" },
  nina: { organization: "riverbend", role: "officeManager", createdDaysAgo: 300 },
  josh: {
    organization: "tallis",
    role: "management",
    createdDaysAgo: 108,
    mobile: "13",
    whatsapp: true,
    avatar: "leon-becker",
  },
  beth: { organization: "greystone", role: "management", createdDaysAgo: 21 },
  owen: { organization: "juniper", role: "officeManager", createdDaysAgo: 378 },
  carl: { organization: "westmoor", role: "officeManager", createdDaysAgo: 44 },
  anita: { organization: "westmoor", role: "management", createdDaysAgo: 40 },
  zoe: { organization: "ashcombe", role: "officeManager", createdDaysAgo: 120 },
  frank: { organization: "kingsley", role: "purchasing", createdDaysAgo: 5 },
  lisa: { organization: "kingsley", role: "purchasing", createdDaysAgo: 4 },
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
    next: 4,
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
    next: 5,
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

function organizationOf(facts: { organization?: OrganizationKey; deal?: DealKey }): OrganizationKey {
  const key = facts.organization ?? (facts.deal ? DEAL_FACTS[facts.deal].organization : undefined);
  if (!key) throw new Error("Every client-management task belongs to a client");
  return key;
}

export default defineSolution<Strings>({
  id: "client-management",
  strings: { en, de },
  story: {
    en: { currency: "USD", timeZone: "America/New_York" },
    de: { currency: "EUR", timeZone: "Europe/Berlin" },
  },
  build: (t) => {
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
        },
        ...(facts.avatar ? { avatar: photo(facts.avatar) } : {}),
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
      members: (["colleagueA", "colleagueB"] as const).map((key, index) => {
        const [firstName, lastName, email] = t.members[key];
        return { key, firstName, lastName, email, avatar: photo(index === 0 ? "mara-bauer" : "jonas-weber") };
      }),
      records: { organization, contact, contract, deal, task },
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
            overdue: true,
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
      ],
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
