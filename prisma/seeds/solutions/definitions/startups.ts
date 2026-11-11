import { DisplayType } from "@/features/widget/widget-display.schema";

import { agentApiKeys, agentEdited, agentsPage, type AgentsPageText, type AgentKeyName } from "../agent-native";
import { inboxThreads, type InboxThreadPlan, type InboxThreadText } from "../inbox-threads";
import {
  address,
  at,
  day,
  defineSolution,
  range,
  type FileSpec,
  type RecordSpec,
  phoneNumber,
} from "../define-solution";
import { es } from "./locales/startups.es";
import { pt } from "./locales/startups.pt";
import { pl } from "./locales/startups.pl";
import { nl } from "./locales/startups.nl";

/**
 * Startups: an early-stage B2B software company whose co-founder still sells. It offers quality inspection software
 * to mid-sized manufacturers. Sales opportunities carry their first-year contract value, a stage and a next step;
 * investor relationships are ordinary records linked to the investors' contacts. The founder's emails and LinkedIn
 * chats belong to an opportunity or investor only where someone linked them.
 */

const ORGANIZATIONS = [
  "precision",
  "castings",
  "plastics",
  "valves",
  "packaging",
  "springs",
  "pumps",
  "optics",
  "furniture",
  "coatings",
  "gears",
  "molds",
] as const;
type OrganizationKey = (typeof ORGANIZATIONS)[number];
const CONTACTS = [
  "precisionQm",
  "precisionCeo",
  "castingsQm",
  "castingsPlant",
  "plasticsOps",
  "plasticsCeo",
  "valvesQm",
  "packagingOps",
  "springsCeo",
  "pumpsQm",
  "pumpsIt",
  "opticsQm",
  "furnitureOps",
  "coatingsCeo",
  "seedPartner",
  "seedAssociate",
  "angel",
  "syndicateLead",
  "ventureVp",
  "corporatePrincipal",
] as const;
type ContactKey = (typeof CONTACTS)[number];
const DEALS = [
  "precisionRollout",
  "castingsPilot",
  "plasticsPlatform",
  "valvesInspection",
  "packagingLines",
  "springsStarter",
  "pumpsQuality",
  "opticsAudit",
  "furnitureRollout",
  "coatingsPilot",
  "castingsSecondPlant",
  "coatingsExpansion",
  "gearsInspection",
  "moldsPilot",
  "springsExpansion",
] as const;
type DealKey = (typeof DEALS)[number];
const INVESTORS = [
  "seedFund",
  "angel",
  "techAngel",
  "syndicate",
  "regionalFund",
  "ventureFund",
  "corporate",
  "secondSeed",
] as const;
type InvestorKey = (typeof INVESTORS)[number];
const TASKS = [
  "sendSecurityAnswers",
  "prepareDecisionCall",
  "pilotReview",
  "plasticsDemo",
  "packagingRecap",
  "valvesIntro",
  "opticsFollowUp",
  "investorUpdate",
  "metricsForSeedFund",
  "springsOnboarding",
] as const;
type TaskKey = (typeof TASKS)[number];
type InboxKey =
  | "plasticsDemo"
  | "springsLines"
  | "valvesPlan"
  | "seedMetrics"
  | "angelUpdate"
  | "coatingsUsage"
  | "castingsPlant"
  | "plasticsCeo"
  | "syndicatePitch"
  | "corporateCoffee"
  | "ventureCatchUp";
type AgentNoteKey =
  | "packagingDemo"
  | "precisionBrief"
  | "valvesImport"
  | "coatingsUsage"
  | "investorUpdateTask"
  | "seedFundPrep";

const en = {
  company: "Gaugewise",
  workspaceName: "Startups",
  website: "https://gaugewise.example",
  phones: {
    mobile: { templates: ["+1 216 555 01##", "+1 414 555 01##", "+1 614 555 01##", "+1 317 555 01##"], start: 10 },
  },
  selfTitle: "Co-founder and CEO",
  lists: {
    organization: ["Company", "Companies", "Manufacturers we sell to or talk to."],
    contact: ["Contact", "Contacts", "People at prospects and customers, and the investors we talk to."],
    deal: ["Opportunity", "Opportunities", "Sales opportunities with their annual recurring revenue (ARR)."],
    investor: ["Investor", "Investors", "Funds and angels we talk to about the seed round."],
    task: ["Task", "Tasks", "Next actions with a due date."],
  },
  fields: {
    dealValue: "ARR",
    weightedValue: "Weighted ARR",
    industry: "Industry",
    fit: "Fit",
    address: "Address",
    website: "Website",
    employees: "Employees",
    jobTitle: "Job title",
    buyingRole: "Buying role",
    source: "Source",
    closeDate: "Expected close",
    nextStep: "Next step",
    nextStepDate: "Next step date",
    lostReason: "Lost reason",
    productionLines: "Production lines",
    pricePerLine: "Price per line / year",
    firmType: "Firm type",
    roundStatus: "Round status",
    ticketSize: "Ticket size",
    leadInvestor: "Lead investor",
    introBy: "Intro by",
    lastConversation: "Last conversation",
    nextMeeting: "Next meeting",
    pilotPeriod: "Pilot period",
    documents: "Documents",
    focus: "Focus",
    dueDate: "Due date",
    priority: "Priority",
  },
  options: {
    industry: {
      metal: "Metalworking",
      plastics: "Plastics",
      machinery: "Machinery and pumps",
      packaging: "Packaging",
      optics: "Optics",
      furniture: "Furniture",
      surface: "Surface treatment",
    },
    fit: { strong: "Strong", medium: "Medium", weak: "Weak" },
    buyingRole: { champion: "Champion", decisionMaker: "Decision maker", evaluator: "Evaluator", user: "User" },
    source: {
      founderNetwork: "Founder network",
      inbound: "Inbound",
      linkedin: "LinkedIn",
      event: "Trade fair",
      investorIntro: "Investor intro",
    },
    lostReason: { timing: "Timing", budget: "No budget", inHouse: "Built in-house", competitor: "Chose another tool" },
    firmType: {
      angel: "Business angel",
      syndicate: "Angel network",
      seedFund: "Seed fund",
      ventureFund: "Venture fund",
      corporate: "Corporate venture",
    },
    roundStatus: {
      toContact: "To contact",
      introRequested: "Intro requested",
      firstMeeting: "First meeting",
      followUp: "Follow-up",
      committed: "Committed",
      passed: "Passed",
    },
    priority: { low: "Low", medium: "Medium", high: "High" },
  },
  stages: {
    identified: "Identified",
    conversation: "Conversation",
    demo: "Demo",
    pilot: "Pilot",
    decision: "Decision",
    won: "Won",
    lost: "Lost",
  },
  organizations: {
    precision: ["Harlow Precision Machining", "Cleveland", "harlow-precision.example"],
    castings: ["Brennan Castings", "Milwaukee", "brennan-castings.example"],
    plastics: ["Copperline Plastics", "Grand Rapids", "copperline-plastics.example"],
    valves: ["Westfield Valve Works", "Toledo", "westfield-valves.example"],
    packaging: ["Kiln Creek Packaging", "Columbus", "kilncreek-packaging.example"],
    springs: ["Redwater Springs & Wire", "Dayton", "redwater-springs.example"],
    pumps: ["Ashby Pump Systems", "Indianapolis", "ashby-pumps.example"],
    optics: ["Marlow Optics", "Rochester", "marlow-optics.example"],
    furniture: ["Fenwick Office Furniture", "Holland", "fenwick-furniture.example"],
    coatings: ["Tolland Coatings", "Akron", "tolland-coatings.example"],
    gears: ["Lakeview Gear Works", "Erie", "lakeview-gears.example"],
    molds: ["Pioneer Moldworks", "Kalamazoo", "pioneer-moldworks.example"],
  } satisfies Record<OrganizationKey, readonly [string, string, string]>,
  contacts: {
    precisionQm: ["Aaron", "Whitfield", "Head of quality"],
    precisionCeo: ["Diane", "Harlow", "CEO"],
    castingsQm: ["Marcus", "Doyle", "Quality manager"],
    castingsPlant: ["Kevin", "Shaw", "Plant manager"],
    plasticsOps: ["Rachel", "Kimball", "Operations director"],
    plasticsCeo: ["Tom", "Gallagher", "CEO"],
    valvesQm: ["Laura", "Jensen", "Quality lead"],
    packagingOps: ["Brian", "Foster", "VP operations"],
    springsCeo: ["Susan", "Reilly", "Owner"],
    pumpsQm: ["Natalie", "Ward", "Quality engineer"],
    pumpsIt: ["Greg", "Holloway", "IT manager"],
    opticsQm: ["Priya", "Nair", "Head of quality assurance"],
    furnitureOps: ["Mark", "Ellison", "Production manager"],
    coatingsCeo: ["Janet", "Cole", "General manager"],
    seedPartner: ["Elena", "Marsh", "Partner at Northbeam Ventures"],
    seedAssociate: ["Josh", "Patel", "Associate at Northbeam Ventures"],
    angel: ["Robert", "Kincaid", "Business angel"],
    syndicateLead: ["Caroline", "Webb", "Lead at Lakeshore Angels"],
    ventureVp: ["Daniel", "Okafor", "Principal at Ironbridge Capital"],
    corporatePrincipal: ["Hannah", "Lowe", "Investment manager at Meridian Industrial Ventures"],
  } satisfies Record<ContactKey, readonly [string, string, string]>,
  deals: {
    precisionRollout: ["Harlow Precision – rollout on three lines", "Decision call with Diane and Aaron"],
    castingsPilot: ["Brennan Castings – pilot on the finishing line", "Review the pilot results with Marcus"],
    plasticsPlatform: ["Copperline Plastics – both plants", "Second demo for the plant leads"],
    valvesInspection: ["Westfield Valve Works – incoming goods inspection", "Send Laura the sample inspection plan"],
    packagingLines: ["Kiln Creek Packaging – two production lines", "Agree on pilot scope with Brian"],
    springsStarter: ["Redwater Springs – starter plan", "Signed"],
    pumpsQuality: ["Ashby Pump Systems – final inspection", "Answer the IT security questions"],
    opticsAudit: ["Marlow Optics – audit preparation", "First call with Priya"],
    furnitureRollout: ["Fenwick Office Furniture – assembly checks", "Closed lost"],
    coatingsPilot: ["Tolland Coatings – first line", "Signed"],
    castingsSecondPlant: ["Brennan Castings – second plant", "Ask Kevin who runs the second plant"],
    coatingsExpansion: ["Tolland Coatings – all lines", "Usage review with Janet"],
    gearsInspection: ["Lakeview Gear Works – gear inspection", "Signed"],
    moldsPilot: ["Pioneer Moldworks – tool shop pilot", "Closed lost"],
    springsExpansion: ["Redwater Springs – all four lines", "Agree on the line count with Susan"],
  } satisfies Record<DealKey, readonly [string, string]>,
  investors: {
    seedFund: [
      "Northbeam Ventures",
      "Seed rounds in industrial software",
      "Liked the pilot numbers. Wants to see three paying customers and the next quarter's revenue before a follow-up.",
    ],
    angel: [
      "Robert Kincaid",
      "Former COO of a parts supplier",
      "Invested in the pre-seed round and committed again for the seed. Gets the monthly update and opens doors to manufacturers.",
    ],
    techAngel: [
      "Thomas Reyes",
      "Former VP engineering at a machine builder",
      "Committed after the Brennan pilot review. Wants to help with the first sales hire.",
    ],
    syndicate: [
      "Lakeshore Angels",
      "Midwest B2B startups",
      "Caroline invited us to the next pitch evening. Nothing prepared yet.",
    ],
    regionalFund: [
      "Great Lakes Growth Fund",
      "Regional seed fund for manufacturing technology",
      "Robert asked their partner for an intro. Waiting for a date.",
    ],
    ventureFund: [
      "Ironbridge Capital",
      "Series A, vertical software",
      "Too early for them. Daniel asked to stay in touch until we pass the next revenue milestone.",
    ],
    corporate: [
      "Meridian Industrial Ventures",
      "Manufacturing technology",
      "Hannah wants to understand how pilots run at small plants. Coffee scheduled.",
    ],
    secondSeed: [
      "Foxglove Seed",
      "Pre-seed and seed, generalist",
      "Passed after the first meeting: no hardware-adjacent software in the current fund.",
    ],
  } satisfies Record<InvestorKey, readonly [string, string, string]>,
  investorDomains: {
    seedFund: "northbeam-vc.example",
    angel: "kincaid-angel.example",
    techAngel: "reyes-angel.example",
    syndicate: "lakeshore-angels.example",
    regionalFund: "greatlakes-growth.example",
    ventureFund: "ironbridge-capital.example",
    corporate: "meridian-ventures.example",
    secondSeed: "foxglove-seed.example",
  } satisfies Record<InvestorKey, string>,
  tasks: {
    sendSecurityAnswers: "Answer Ashby's IT security questions",
    prepareDecisionCall: "Prepare pricing for three lines for Harlow Precision",
    pilotReview: "Pull the pilot numbers for Brennan Castings",
    plasticsDemo: "Set up the demo plant data for Copperline",
    packagingRecap: "Send the demo recap to Brian at Kiln Creek",
    valvesIntro: "Draft the sample inspection plan for Westfield",
    opticsFollowUp: "Follow up with Priya after the first call",
    investorUpdate: "Write the monthly investor update",
    metricsForSeedFund: "Send revenue and pilot metrics to Northbeam",
    springsOnboarding: "Onboarding session at Redwater Springs",
  } satisfies Record<TaskKey, string>,
  views: {
    pipeline: "Pipeline",
    seedRound: "Seed round",
    nextSteps: "Next steps",
    investors: "Investor touchpoints",
    dueSoon: "Due soon",
    pilots: "Pilots",
  },
  widgets: {
    openPipeline: "Open pipeline ARR",
    weighted: "Weighted pipeline ARR",
    won: "Won ARR",
    committed: "Committed to the seed round",
    byStage: "Opportunities by stage",
    meetings: "Investor meetings, next 14 days",
    seedRound: "Investors by round status",
    newByMonth: "New opportunities per month",
    byAccount: "Late-stage ARR by company",
    tasksMonth: "Open tasks this month",
  },
  wiki: {
    guide: {
      title: "Operating Guide",
      markdown: [
        "Gaugewise makes quality inspection software for mid-sized manufacturers. Max, one of the founders, still runs sales himself. This workspace is demo data; every company and person in it is fictional.",
        "",
        "## How we use the CRM",
        "- **Companies** are the manufacturers we sell to. **Contacts** are the people there, plus the people at our investors.",
        "- **Opportunities** carry the number of production lines and the price per line and year. Their value is calculated from both: our annual recurring revenue (ARR) if the deal closes. The weighted value is that value times the stage probability.",
        "- **Investors** are the funds and angels of our seed round. The Seed round board groups them by round status; ticket size, lead investor and the next meeting (date and time) are ordinary fields. The dashboard lists the investor meetings of the next 14 days.",
        "- **Pilots** carry a pilot period; the Pilots view shows them on a calendar.",
        "- **Tasks** and next step dates are ordinary fields. Nobody is reminded automatically, so check the Next steps and Due soon views every morning.",
        "- An email or LinkedIn chat belongs to an opportunity, company or investor only when someone links it there.",
        "- Max uses Claude Desktop through MCP to look up and update records; see the page about the AI client.",
        "",
        "## Working rules",
        "- Every open opportunity has a next step and a next step date.",
        "- Write down the lost reason when an opportunity is lost.",
        "- Sales and fundraising stay in separate lists, so investor talks never show up in the sales numbers.",
        "- Pilot agreements, pricing, security questionnaires and term sheets sit as files in the Documents field of the opportunity or investor, so search finds their text. Billing and the product backlog stay in their own tools.",
      ],
    },
    process: {
      title: "Founder Sales Process",
      markdown: [
        "Our stages follow how a manufacturer actually buys from a young software company: from first call to a pilot on one line.",
        "",
        "## Stages",
        "1. **Identified:** a manufacturer that fits, and a person we can talk to.",
        "2. **Conversation:** first call done; the quality problem and who decides are written in the notes.",
        "3. **Demo:** we showed the product with the prospect's own inspection steps.",
        "4. **Pilot:** the product runs on one line, and IT and security questions are answered.",
        "5. **Decision:** pricing sent, decision meeting scheduled.",
        "6. **Won or Lost:** record the outcome and, when lost, the reason.",
      ],
    },
    afterDemo: {
      title: "After a demo",
      whenToUse: "When a product demo with a prospect is over and the opportunity needs updating.",
      markdown: [
        "A demo creates open questions and promises. Write them down the same day, while everyone still remembers them.",
        "",
        "## Steps",
        "1. Write the open questions and the people present into the opportunity notes.",
        "2. Set the next step and its date; move the stage if it changed.",
        "3. Update the number of production lines or the price per line if the scope changed; the ARR follows.",
        "4. Link the email or LinkedIn chat with the prospect to the opportunity, so the history stays in one place.",
      ],
    },
  },
  mcp: {
    title: "Using the CRM from your AI client (MCP)",
    markdown: [
      "Customermates has an MCP endpoint, so an AI client we already use can read and update this workspace. Max works from Claude Desktop; everyone else can connect their own client the same way.",
      "",
      "## How Max connected Claude Desktop",
      "- Max created a personal API key named Claude Desktop under Settings, API keys & connectors, and put it into the client's configuration. Clients with a custom connector can sign in with OAuth instead, without a key.",
      "- The key acts as Max in this workspace only. It can see and change exactly what his role allows, nothing more.",
      "- The client uses our own AI provider, which bills the model use.",
      "",
      "## What we use it for",
      "- Before a call: ask which stage an opportunity is in, who the champion is and what the last email said.",
      "- After a call: ask the client to move the stage, set the next step and its date, and add a note.",
      "- Before an investor meeting: ask for the won ARR, the open pipeline by stage and the investors by round status.",
      "",
      "## Rules",
      "- Review what you ask the client to do. A confirmation before deleting or sending comes from the client, not from the CRM.",
      "- Deleted records stay in Trash for 30 days; other changes are not undone automatically.",
      "- Delete the key in Settings when a laptop is lost or someone leaves.",
    ],
  },
  webhooks: {
    onboarding: "Opportunity changes for the onboarding service, which starts onboarding when one is won",
    onboardingUrl: "https://hooks.gaugewise.example/crm/onboarding",
  },
  routines: {
    demoRecap: {
      name: "Demo recap draft",
      task: "An opportunity changed. Read the opportunity in routine_trigger with its configured Stage, company, contacts, notes and linked conversations. Continue only when the Stage is Demo and the trigger shows that the stage changed; otherwise report that there is nothing to draft. Write a short recap email to the main contact: what we showed, the open questions from the notes and the proposed next step with its date. Save it with save_message_draft in the conversation linked to the opportunity, or report that no conversation is linked. The draft waits for Max to review and send it himself. Do not change the opportunity or any other record.",
      runs: [
        "Drafted a recap for Brian Foster at Kiln Creek Packaging with the two-line pilot scope; it waits in the linked conversation for review.",
        "The opportunity moved to Pilot, not Demo, so there was nothing to draft.",
        "I could not reach the model provider, so I stopped before reading anything. Nothing was drafted or changed.",
      ],
    },
    dueFollowUps: {
      name: "Every morning, draft follow-ups for opportunities due today",
      task: 'Every weekday morning, find the open opportunities whose Next step date is today or earlier and whose Stage is Identified, Conversation, Demo, Pilot or Decision. For each one, read the opportunity with its company, contacts, notes and the last linked conversation. If a conversation is linked, save one short follow-up draft with save_message_draft that picks up where the last message stopped and proposes the next step with a date; keep an existing draft instead of writing a second one. If no conversation is linked, create one task "Follow up with <contact name>" due today, linked to the opportunity and the contact, unless an open task for it exists. Never send a message and never change the Stage or the Next step date.',
      runs: [
        "Drafted two follow-ups, for Kiln Creek Packaging and Redwater Springs; both wait in their linked conversations for review. Nothing else was due.",
        "Drafted one follow-up for Copperline Plastics and skipped Harlow Precision, whose reply is already a draft.",
        "Nothing was due, so there were no drafts and no tasks.",
      ],
    },
    newMailTask: {
      name: "Turn customer emails into tasks",
      task: "A new email arrived. Read the message identified by routine_trigger and match the sender to a contact through the contact's identity channels; stop when there is no match. Read the contact's opportunities and the open tasks linked to them. When the email asks a question, sets a deadline or promises something, create one task with mutate_crm_record, named after the request, due on the date the email names or in two days, linked to the opportunity, the company and the contact. Create no task when an open task for the same request exists. Do not draft or send a reply and do not change any other record.",
      runs: [
        'Created the task "Answer Ashby\'s IT security questions" due in two days, linked to Ashby Pump Systems and Greg Holloway.',
        "The email from Kiln Creek Packaging only confirmed a meeting time, so I created no task.",
        "The sender is not a contact in this workspace, so I stopped and created nothing.",
      ],
    },
    investorUpdate: {
      name: "Monthly investor update",
      task: 'On the first of each month, prepare the draft of the monthly investor update as a new Knowledge Base page titled "Investor update <month> <year>". Use query_crm_measure for the won ARR (the Value of Won opportunities), the open and weighted pipeline by stage and the opportunities created last month, and read the investors by Round status with their ticket sizes. Name at most three customer wins and three risks, each backed by a returned record. The page is a draft for the founders to edit and send themselves: do not message investors, send anything or change any record.',
      runs: [
        'Wrote the draft page "Investor update" with the won ARR, the open pipeline by stage and two committed angels; Northbeam is still in follow-up.',
        "Wrote last month's draft page with two customer wins, the pilot at Brennan Castings and one risk: the IT review at Ashby.",
      ],
    },
  },
  threads: {
    precisionDecision: {
      subject: "Pricing for three lines",
      messages: [
        "Hi Max,\n\nAaron is convinced after the pilot. Before our decision meeting on Thursday I need the pricing for all three lines and the start date you could commit to.\n\nBest,\nDiane",
        "Hi Diane,\n\nThank you. I will send the pricing for three lines by Wednesday noon. We could start on line one two weeks after signing.\n\nBest,\nMax",
        "Good. Please include training for the second shift.",
        "Hi Diane,\n\nhere is the pricing for three lines, including two training sessions for the second shift. The first-year total is in the summary at the top.\n\nBest,\nMax",
      ],
    },
    pumpsSecurity: {
      subject: "IT security questions before the pilot",
      messages: [
        "Hello Max,\n\nbefore Natalie can start the pilot I need answers to our standard IT questions: hosting location, single sign-on and who at your company can access our data.\n\nRegards,\nGreg Holloway",
        "Hi Greg,\n\nthanks for the list. I will answer each question in writing by Friday and can join a call with your team if that helps.\n\nBest,\nMax",
        "A call would help. Tuesday at 10?",
      ],
    },
    castingsPilot: {
      messages: [
        "Max, the first two weeks of the pilot look good. The finishing line logs every inspection now, no paper.",
        "Great to hear, Marcus. Can we go through the numbers together next week? I would like Kevin to join.",
        "Sure. Wednesday after the shift change.",
        "Wednesday at 3 works. I will bring the comparison with your paper checklists.",
      ],
    },
    opticsIntro: {
      messages: [
        "Hi Max, a colleague mentioned you help plants get ready for customer audits. We have two audits next spring. Is that something you do?",
        "Hi Priya, yes: inspections recorded on the line, ready to show an auditor. Would a 30-minute call next week work?",
      ],
    },
    seedFundCatchUp: {
      subject: "Catching up after the quarter",
      messages: [
        "Hi Max,\n\ngood to see the pilot at Brennan going well. How many paying customers do you have now, and what does the pipeline look like for the next quarter?\n\nBest,\nElena",
        "Hi Elena,\n\ntwo paying customers, a third expected this month, and three opportunities in pilot or decision. Happy to walk you through it over coffee.\n\nBest,\nMax",
        "Coffee sounds good. Josh will send a few times.",
      ],
    },
    packagingDemo: {
      messages: [
        "Thanks for the demo, Max. The team liked the photo checks. Could we start with two lines?",
        "Thanks, Brian. Two lines is a good start. I will send a short recap with a suggested pilot scope today.",
        "Received, looks fine. Let's talk scope on Monday.",
      ],
    },
  },
  calendar: {
    name: "Sales meetings",
    events: [
      "Decision call with Harlow Precision",
      "Pilot review with Brennan Castings",
      "Coffee with Northbeam Ventures",
    ],
  },
  countryCode: "us",
  addresses: {
    precision: ["2150 Superior Avenue", "44114", "OH", 41.5098, -81.6829],
    castings: ["1400 South 1st Street", "53204", "WI", 43.0186, -87.9265],
    plastics: ["620 Monroe Avenue NW", "49503", "MI", 42.9634, -85.6681],
    valves: ["455 Summit Street", "43604", "OH", 41.6528, -83.5379],
    packaging: ["880 Cleveland Avenue", "43215", "OH", 39.9667, -83.0042],
    springs: ["300 East Monument Avenue", "45402", "OH", 39.7621, -84.1878],
    pumps: ["1150 East Washington Street", "46204", "IN", 39.7713, -86.1572],
    optics: ["90 Mill Street", "14604", "NY", 43.1583, -77.6078],
    furniture: ["410 Columbia Avenue", "49423", "MI", 42.7764, -86.1037],
    coatings: ["725 East Exchange Street", "44308", "OH", 41.0814, -81.5126],
    gears: ["1520 East 12th Street", "16501", "PA", 42.1283, -80.0866],
    molds: ["2210 North Pitcher Street", "49007", "MI", 42.3015, -85.5853],
  } satisfies Record<OrganizationKey, readonly [string, string, string, number, number]>,
  files: {
    questionnaire: {
      name: "IT security questionnaire.xlsx",
      rows: [
        ["Question", "Answer", "Status"],
        ["Where is the data hosted?", "AWS us-east-2 (Ohio), encrypted at rest", "Answered"],
        ["Do you support single sign-on (SSO)?", "Yes: SSO with Microsoft Entra ID or Okta via SAML", "Answered"],
        ["Who at Gaugewise can access our data?", "The two founders and one support engineer, logged", "Answered"],
        ["Penetration test in the last 12 months?", "Planned for next quarter", "Open"],
        ["Can inspection photos be deleted on request?", "Yes, within 30 days", "Answered"],
      ],
    },
    pilotAgreement: {
      name: "Pilot agreement.pdf",
      lines: [
        "# Pilot agreement: Brennan Castings and Gaugewise",
        "Brennan Castings runs Gaugewise on the finishing line for four weeks. Gaugewise provides the software, setup and one training session per shift free of charge.",
        "## Scope",
        "| Item | Detail |",
        "| Line | Finishing line, plant 1 |",
        "| Duration | 4 weeks |",
        "| Users | Up to 12 inspectors, sign-in with SSO |",
        "| Success criteria | 95% of inspections logged on the line, no paper checklists |",
        "## After the pilot",
        "If the success criteria are met, both lines move to the annual plan at $6,000 per line and year.",
      ],
    },
    pricing: {
      name: "Pricing – three lines.pdf",
      lines: [
        "# Pricing for Harlow Precision Machining",
        "Annual plan for three production lines, prepared for the decision meeting with Diane Harlow and Aaron Whitfield.",
        "## First year",
        "| Item | Quantity | Price | Total |",
        "| Production line, annual plan | 3 | $6,000 | $18,000 |",
        "| Training for the second shift | 2 sessions | included | $0 |",
        "| SSO and audit log | 1 | included | $0 |",
        "| First-year total |  |  | $18,000 |",
        "## Start",
        "Line one goes live two weeks after signing; lines two and three follow one month apart.",
      ],
    },
    termSheet: {
      name: "Term sheet (draft).pdf",
      lines: [
        "# Term sheet (draft): Gaugewise seed round",
        "Draft for discussion with Northbeam Ventures. Not binding.",
        "## Key terms",
        "| Term | Draft |",
        "| Round size | $1,500,000 |",
        "| Lead investor | Northbeam Ventures, $750,000 |",
        "| Instrument | Preferred shares, 1x non-participating |",
        "| Board | Two founders, one investor seat |",
        "| Option pool | 10% after the round |",
        "## Open points",
        "Northbeam wants to see the next quarter's revenue before signing. Harlow Precision (three lines) is in decision.",
      ],
    },
    onePager: {
      name: "One-pager.pdf",
      lines: [
        "# Gaugewise in one page",
        "Quality inspection software for mid-sized manufacturers: every inspection recorded on the line, ready for the next customer audit.",
        "## Traction",
        "| Metric | Today |",
        "| Paying customers | 3 |",
        "| Won ARR | $29,200 |",
        "| Open pipeline ARR | $165,600 |",
        "| Pilots running or planned | 3 |",
        "## Why now",
        "Customer audits now ask for inspection records per part. Plants with 50 to 500 people still use paper. Gaugewise runs on a tablet at the line, with SSO for IT and no on-site server.",
        "## The round",
        "Raising $1,500,000 seed; $125,000 committed by two angels.",
      ],
    },
  },
  trash: { contact: "Aaron Whitfield (duplicate)", deal: "Halsted Tooling – pilot" },
  mateChat: {
    title: "Draft this month's investor update",
    messages: [
      "Draft this month's investor update and save it as a wiki page.",
      'I saved the draft as the wiki page "Investor update (draft)". The numbers come from the records:\n\n- **Won ARR:** $29,200 from three customers: Lakeview Gear Works ($16,000), Redwater Springs ($7,200) and Tolland Coatings ($6,000).\n- **Open pipeline:** $165,600 ARR in ten opportunities; the largest are Copperline Plastics and Redwater Springs (all four lines) at $24,000 each.\n- **Pilots:** Brennan Castings is in week three on the finishing line; Ashby Pump Systems starts once the IT security questionnaire is signed off (SSO is answered); Kiln Creek Packaging plans a two-line pilot.\n- **Seed round:** $125,000 committed by Robert Kincaid and Thomas Reyes. Northbeam Ventures ($750,000, lead) is in follow-up; your next meeting with them is in the Investor meetings widget.\n\nRisk to mention: Harlow Precision ($18,000) decides after the pricing for three lines. The page is a draft; nothing was sent.',
    ],
  },
  inbox: {
    plasticsDemo: {
      subject: "Second demo with both plant leads",
      messages: [
        "Hi Rachel,\n\nthanks again for the first demo. For the second one I would like both plant leads in the room, and I will run it with your own inspection steps. Would Thursday at 2 pm work?\n\nBest,\nMax",
        "Hi Max,\n\nThursday at 2 works for me, and both of Tom's plant leads can make it. One question: plant 2 numbers its parts differently from plant 1. Can the demo handle two numbering schemes?\n\nRachel",
        "Hi Rachel,\n\nyes, each line has its own part list, so both schemes can live side by side. I am setting up demo data for both plants today, so you can see it with your own part numbers.\n\nBest,\nMax",
        "Great. I will send you ten part numbers from each plant this afternoon.\n\nRachel",
      ],
    },
    springsLines: {
      subject: "All four lines at Redwater",
      messages: [
        "Hi Susan,\n\nthe two lines have been running for a few weeks now. Should we talk about putting Gaugewise on all four? I can bring the usage numbers from your first two lines.\n\nBest,\nMax",
        "Hi Max,\n\nyes, my foreman likes it. Before I decide I would like to know what four lines cost. Is it still $3,600 per line?\n\nSusan",
        "Hi Susan,\n\nthe starter plan was $3,600 per line. For all four lines the annual plan is $6,000 per line, which is $24,000 a year. As an existing customer you should get a better price per line, so let me work out a few options and send them tomorrow.\n\nBest,\nMax",
        "Thanks. Please keep it simple, one number for four lines. My foreman says three lines would be enough to start and the fourth after the summer. Is that possible?\n\nSusan",
      ],
    },
    valvesPlan: {
      subject: "Sample inspection plan for incoming goods",
      messages: [
        "Hi Max,\n\nthanks for the talk at the trade fair. We check every delivery of valve bodies by hand today. Could you show me what an inspection plan would look like for our three most common parts?\n\nLaura",
        "Hi Laura,\n\nhappy to. I will build a sample plan with the checks you described: dimensions, surface and the pressure test sign-off. Which three parts should I use?\n\nBest,\nMax",
        "The DN25 body, the DN40 flange and the seat ring. I have shared the drawings with you in a folder, you should have the invite.\n\nLaura",
        "Hi Laura,\n\nthanks, I have the folder. I am finishing the sample plan for the DN25 body, the DN40 flange and the seat ring: every part has its checks, tolerances and a photo step. One question before I send it: is the pressure test signed off per batch or per part?\n\nBest,\nMax",
      ],
    },
    seedMetrics: {
      subject: "Numbers before the coffee",
      messages: [
        "Hi Max,\n\nElena would like to look at a few numbers before your coffee: revenue by month, pilot to paid conversion and how many inspections each paying customer logs per week. Could you send them a day before?\n\nBest,\nJosh",
        "Hi Josh,\n\nyes. Revenue and the pilot conversion are quick. I pull the weekly inspections from the usage log and will send everything by Thursday.\n\nBest,\nMax",
        "Thursday is fine. Elena also asked how Brennan is doing against the 95% success criterion in the pilot agreement.\n\nJosh",
      ],
    },
    angelUpdate: {
      subject: "Monthly update",
      messages: [
        "Max,\n\nI have not seen the monthly update yet. No pressure, but I like to read it before I speak to the Great Lakes people.\n\nRobert",
        "Hi Robert,\n\nsorry, it is running late. It goes out by the end of the week with the pilot numbers from Brennan.\n\nBest,\nMax",
        "Fine. Their partner is back on the 18th. I will make the introduction as soon as I have your update.\n\nRobert",
        "Hi Robert,\n\nthe update is on its way: Brennan is in week three, Harlow decides on Thursday and Ashby's IT review is nearly done. I will send it tomorrow morning, so you have it before the 18th.\n\nThanks for the introduction.\n\nBest,\nMax",
      ],
    },
    coatingsUsage: {
      subject: "Usage numbers for the audit",
      messages: [
        "Hi Max,\n\nour customer audit is coming up and the auditor will ask how we record inspections on line 1. Could you send me a monthly export of what the tablets logged?\n\nJanet",
        "Hi Janet,\n\nof course. I will set up a monthly export of the inspection log, one CSV file per month, and send you the first one this week.\n\nBest,\nMax",
        "Perfect. How many inspections did we log last month?\n\nJanet",
        "Hi Janet,\n\n2,380 inspections on line 1, almost all of them on the tablet. The export lists every inspection with the inspector and the time and follows in a separate mail. I will walk you through it at the usage review.\n\nBest,\nMax",
      ],
    },
    castingsPlant: {
      subject: "Third shift training",
      messages: [
        "Hi Max,\n\nthe finishing line runs a third shift from next week. Could you give them the same 30-minute training as the others?\n\nKevin",
        "Hi Kevin,\n\nyes, happy to. I can do it Monday at 10 pm if you want it right at the start of their shift, or in the afternoon with the shift lead only.\n\nBest,\nMax",
        "Start of the shift is better. There are eleven inspectors on that shift, so bring the quick-start sheet.\n\nKevin",
        "Hi Kevin,\n\nMonday at 10 pm it is. I will bring the quick-start sheet and a few spare tablets.\n\nBest,\nMax",
      ],
    },
    plasticsCeo: {
      messages: [
        "Max, Rachel says yours was the first demo where her team understood the tablet in five minutes. What would a pilot at one plant look like for us?",
        "Thanks, Tom. Four weeks on one line, with training for every shift and no cost, and we agree on the success criteria upfront. If they are met, the annual plan is $6,000 per line.",
        "That works for us. We will pick the line after Thursday's demo. Can you send me the pilot agreement you used for Brennan?",
      ],
    },
    syndicatePitch: {
      messages: [
        "Hi Max, our next pitch evening is on the 28th in Chicago. We would love to have you: seven minutes plus questions. Interested?",
        "Hi Caroline, thanks, I would like that. Which evening exactly, and who is in the room?",
        "The 28th, six angels and two follow-on funds. Doors at 6 pm, you are second. Can you confirm by Friday?",
        "Yes, please count me in for the 28th. I will bring the one-pager and a live demo on a tablet. Thanks for the invitation, Caroline!",
      ],
    },
    corporateCoffee: {
      messages: [
        "Hi Max, looking forward to the coffee. Is the 8:30 slot still good for you?",
        "Hi Hannah, yes, 8:30 works. I will bring a tablet and show you how a pilot runs at a small plant.",
        "Perfect. I will bring our manufacturing lead, he wants to see the tablet too.",
        "Great, see you there.",
      ],
    },
    ventureCatchUp: {
      messages: [
        "Max, saw your post about the Brennan pilot. Nice work. Still too early for us, but keep me posted.",
        "Thanks, Daniel. The next milestone is the Harlow Precision rollout on three lines, which should be decided within two weeks. I will send you a line when it is signed.",
        "Please do. If the numbers hold, let's talk again in the spring.",
        "Will do. Thanks, Daniel.",
      ],
    },
  } satisfies Record<InboxKey, InboxThreadText>,
  agentNotes: {
    packagingDemo: [
      "Summary by Claude after the demo call:",
      "- Brian's team liked the photo checks and wants to start with two lines.",
      "- Open: how the tablets reach the plant Wi-Fi and who maintains the inspection plans.",
      "- Next: agree the pilot scope on Monday; the recap and the proposed scope are in the mail thread.",
    ],
    precisionBrief: [
      "Draft by ChatGPT from the pricing PDF and the pilot notes, for the decision call:",
      "- Three lines at $6,000 each: $18,000 ARR, training for the second shift and SSO included.",
      "- Aaron is convinced after the pilot; Diane decides in the meeting on Thursday.",
      "- Questions to expect: the start date (line one two weeks after signing) and who trains the second shift.",
    ],
    valvesImport: [
      "Imported by Codex (script run on the trade fair CSV):",
      "- 41 rows read, 3 duplicates merged, 6 rows without an email address skipped.",
      "- Westfield Valve Works was the only match with 150 to 250 employees in the region.",
      "- Source set to Trade fair; Laura Jensen is the contact from the badge scan.",
    ],
    coatingsUsage: [
      "Usage export by Codex (script run on the inspection log):",
      "- Line 1 at Tolland logged 2,380 inspections last month, almost all on the tablet.",
      "- Janet needs a monthly CSV for her customer audit; the script writes one file per month.",
      "- Next: walk through the export at the usage review and ask about lines 2 and 3.",
    ],
    investorUpdateTask: [
      "Created by Claude from Robert Kincaid's email:",
      "- He wants the monthly update before he talks to the Great Lakes partner, who is back on the 18th.",
      "- Include Brennan in week three, the Harlow decision and the IT review at Ashby.",
    ],
    seedFundPrep: [
      "Prep by ChatGPT for the coffee with Northbeam:",
      "- Elena asked for revenue by month, pilot to paid conversion and weekly inspections per customer.",
      "- Talking points: three paying customers, Brennan in week three, Harlow deciding on three lines.",
      "- Open point from the term sheet draft: Northbeam wants next quarter's revenue before signing.",
    ],
  } satisfies Record<AgentNoteKey, string[]>,
  agents: {
    company: "Gaugewise",
    records: "companies, opportunities and investors",
    mate: "Max asks it in the app to look up an opportunity, set the next step or write the recap after a demo; it saves the recap as a draft in the linked conversation.",
    claude:
      "Max uses Claude Desktop before and after calls: who the champion is and what the last email said, then the stage, the next step and a note after the call.",
    chatgpt:
      "ChatGPT prepares the investor conversations: before a meeting it turns an investor's record, notes and term sheet into talking points.",
    codex:
      "Codex handles the scripted jobs: importing trade fair lead lists, merging duplicates and exporting the monthly usage numbers for customers.",
    followUp:
      'Every weekday at 08:00 the routine "Every morning, draft follow-ups for opportunities due today" reads the opportunities whose next step date is today or earlier and saves one short follow-up draft per opportunity in its linked conversation; where no conversation is linked, it creates a task. The drafts wait in the Inbox, Max reads, edits and sends them himself, and the routine never sends anything.',
  } satisfies AgentsPageText,
  mateChatPlant: {
    title: "Create the second Brennan plant",
    messages: [
      "Kevin Shaw says Brennan's second plant wants to try Gaugewise too. Create an opportunity for it, linked to Brennan Castings and Kevin, and set the next step to ask him who runs that plant.",
      'Done. I created the opportunity **Brennan Castings – second plant** in the stage Identified:\n\n- **ARR:** $10,000 (2 production lines at $5,000 per line and year). This is an estimate; adjust it when Kevin gives the real number of lines.\n- **Linked to:** Brennan Castings and Kevin Shaw (Plant manager).\n- **Source:** Founder network. **Expected close:** in about four months.\n- **Next step:** "Ask Kevin who runs the second plant", in two weeks.\n\nI did not create a separate task, because the next step and its date already cover it. Nothing was sent to Kevin.',
    ],
  },
  extraEvents: ["Security call with Ashby Pump Systems", "Usage review with Redwater Springs"],
};

export type Strings = typeof en;

const de: Strings = {
  company: "Messwerk Software GmbH",
  workspaceName: "Start-ups",
  website: "https://messwerk-software.example",
  phones: { mobile: { templates: ["+49 30 23125 ###"], start: 300 } },
  selfTitle: "Mitgründer und Geschäftsführer",
  lists: {
    organization: ["Firma", "Firmen", "Industriebetriebe, an die wir verkaufen oder mit denen wir sprechen."],
    contact: ["Kontakt", "Kontakte", "Menschen bei Interessenten und Kunden sowie bei unseren Investoren."],
    deal: ["Verkaufschance", "Verkaufschancen", "Verkaufschancen mit ihrem wiederkehrenden Jahresumsatz (ARR)."],
    investor: ["Investor", "Investoren", "Fonds und Business Angels, mit denen wir über die Seed-Runde sprechen."],
    task: ["Aufgabe", "Aufgaben", "Nächste Schritte mit Fälligkeitsdatum."],
  },
  fields: {
    dealValue: "ARR",
    weightedValue: "Gewichteter ARR",
    industry: "Branche",
    fit: "Passung",
    address: "Adresse",
    website: "Website",
    employees: "Mitarbeitende",
    jobTitle: "Position",
    buyingRole: "Rolle im Kauf",
    source: "Quelle",
    closeDate: "Erwarteter Abschluss",
    nextStep: "Nächster Schritt",
    nextStepDate: "Datum nächster Schritt",
    lostReason: "Verlustgrund",
    productionLines: "Produktionslinien",
    pricePerLine: "Preis pro Linie und Jahr",
    firmType: "Art des Investors",
    roundStatus: "Rundenstatus",
    ticketSize: "Ticketgröße",
    leadInvestor: "Lead-Investor",
    introBy: "Vorgestellt durch",
    lastConversation: "Letztes Gespräch",
    nextMeeting: "Nächster Termin",
    pilotPeriod: "Pilotzeitraum",
    documents: "Dokumente",
    focus: "Schwerpunkt",
    dueDate: "Fällig am",
    priority: "Priorität",
  },
  options: {
    industry: {
      metal: "Metallverarbeitung",
      plastics: "Kunststoff",
      machinery: "Maschinen und Pumpen",
      packaging: "Verpackung",
      optics: "Optik",
      furniture: "Möbel",
      surface: "Oberflächentechnik",
    },
    fit: { strong: "Stark", medium: "Mittel", weak: "Gering" },
    buyingRole: { champion: "Fürsprecher", decisionMaker: "Entscheider", evaluator: "Prüfer", user: "Anwender" },
    source: {
      founderNetwork: "Gründernetzwerk",
      inbound: "Eingehende Anfrage",
      linkedin: "LinkedIn",
      event: "Messe",
      investorIntro: "Vorstellung durch Investor",
    },
    lostReason: {
      timing: "Zeitpunkt",
      budget: "Kein Budget",
      inHouse: "Eigenentwicklung",
      competitor: "Anderes Tool gewählt",
    },
    firmType: {
      angel: "Business Angel",
      syndicate: "Angel-Netzwerk",
      seedFund: "Seed-Fonds",
      ventureFund: "Venture-Fonds",
      corporate: "Corporate Venture",
    },
    roundStatus: {
      toContact: "Anzusprechen",
      introRequested: "Intro angefragt",
      firstMeeting: "Erstes Treffen",
      followUp: "Follow-up",
      committed: "Zugesagt",
      passed: "Abgesagt",
    },
    priority: { low: "Niedrig", medium: "Mittel", high: "Hoch" },
  },
  stages: {
    identified: "Identifiziert",
    conversation: "Im Gespräch",
    demo: "Demo",
    pilot: "Pilotphase",
    decision: "Entscheidung",
    won: "Gewonnen",
    lost: "Verloren",
  },
  organizations: {
    precision: ["Hartmann Präzisionstechnik GmbH", "Pforzheim", "hartmann-praezision.example"],
    castings: ["Gießerei Brenner GmbH", "Heilbronn", "giesserei-brenner.example"],
    plastics: ["Kunststofftechnik Wiesental GmbH", "Lörrach", "kunststoff-wiesental.example"],
    valves: ["Armaturenwerk Falkenberg GmbH", "Siegen", "armaturenwerk-falkenberg.example"],
    packaging: ["Verpackungen Lindau GmbH", "Kempten", "verpackungen-lindau.example"],
    springs: ["Federnfabrik Rauscher GmbH", "Iserlohn", "federn-rauscher.example"],
    pumps: ["Pumpenbau Hollerbach GmbH", "Würzburg", "pumpenbau-hollerbach.example"],
    optics: ["Feinoptik Seidel GmbH", "Jena", "feinoptik-seidel.example"],
    furniture: ["Büromöbel Kranich GmbH", "Bielefeld", "bueromoebel-kranich.example"],
    coatings: ["Oberflächentechnik Neuhaus GmbH", "Solingen", "neuhaus-oberflaeche.example"],
    gears: ["Getriebebau Seewald GmbH", "Friedrichshafen", "getriebebau-seewald.example"],
    molds: ["Formenbau Pionier GmbH", "Lüdenscheid", "formenbau-pionier.example"],
  },
  contacts: {
    precisionQm: ["Andreas", "Vogt", "Leiter Qualitätssicherung"],
    precisionCeo: ["Dorothea", "Hartmann", "Geschäftsführerin"],
    castingsQm: ["Markus", "Eberle", "Qualitätsmanager"],
    castingsPlant: ["Klaus", "Steiner", "Werksleiter"],
    plasticsOps: ["Renate", "Kaiser", "Leiterin Produktion"],
    plasticsCeo: ["Thomas", "Wiesner", "Geschäftsführer"],
    valvesQm: ["Laura", "Jansen", "Teamleiterin Qualität"],
    packagingOps: ["Bernd", "Fuchs", "Betriebsleiter"],
    springsCeo: ["Susanne", "Rauscher", "Inhaberin"],
    pumpsQm: ["Nadine", "Wolf", "Qualitätsingenieurin"],
    pumpsIt: ["Georg", "Huber", "IT-Leiter"],
    opticsQm: ["Petra", "Lindner", "Leiterin Qualitätssicherung"],
    furnitureOps: ["Martin", "Ellerbrock", "Fertigungsleiter"],
    coatingsCeo: ["Jana", "Kolb", "Geschäftsführerin"],
    seedPartner: ["Elena", "Marquardt", "Partnerin bei Nordlicht Seed"],
    seedAssociate: ["Jonas", "Petersen", "Investment Associate bei Nordlicht Seed"],
    angel: ["Rolf", "Kindermann", "Business Angel"],
    syndicateLead: ["Caroline", "Weber", "Sprecherin des Angelkreises Neckartal"],
    ventureVp: ["Daniel", "Ohlsen", "Principal bei Eisenbrück Capital"],
    corporatePrincipal: ["Hanna", "Lorenz", "Investment Managerin bei Mittelstand Industrie Ventures"],
  },
  deals: {
    precisionRollout: [
      "Hartmann Präzisionstechnik – Einführung auf drei Linien",
      "Entscheidungstermin mit Frau Hartmann und Herrn Vogt",
    ],
    castingsPilot: ["Gießerei Brenner – Pilot in der Putzerei", "Pilotergebnisse mit Herrn Eberle besprechen"],
    plasticsPlatform: ["Kunststofftechnik Wiesental – beide Werke", "Zweite Demo für die Werksleitungen"],
    valvesInspection: ["Armaturenwerk Falkenberg – Wareneingangsprüfung", "Beispiel-Prüfplan an Frau Jansen senden"],
    packagingLines: ["Verpackungen Lindau – zwei Produktionslinien", "Pilotumfang mit Herrn Fuchs abstimmen"],
    springsStarter: ["Federnfabrik Rauscher – Einstiegspaket", "Unterschrieben"],
    pumpsQuality: ["Pumpenbau Hollerbach – Endprüfung", "IT-Sicherheitsfragen beantworten"],
    opticsAudit: ["Feinoptik Seidel – Auditvorbereitung", "Erstes Gespräch mit Frau Lindner"],
    furnitureRollout: ["Büromöbel Kranich – Montageprüfung", "Verloren"],
    coatingsPilot: ["Oberflächentechnik Neuhaus – erste Linie", "Unterschrieben"],
    castingsSecondPlant: ["Gießerei Brenner – zweites Werk", "Herrn Steiner nach der Leitung des zweiten Werks fragen"],
    coatingsExpansion: ["Oberflächentechnik Neuhaus – alle Linien", "Nutzung mit Frau Kolb durchgehen"],
    gearsInspection: ["Getriebebau Seewald – Zahnradprüfung", "Unterschrieben"],
    moldsPilot: ["Formenbau Pionier – Pilot im Werkzeugbau", "Verloren"],
    springsExpansion: ["Federnfabrik Rauscher – alle vier Linien", "Linienzahl mit Frau Rauscher abstimmen"],
  },
  investors: {
    seedFund: [
      "Nordlicht Seed",
      "Seed-Runden in Industriesoftware",
      "Die Pilotzahlen haben gefallen. Vor dem nächsten Termin möchte Frau Marquardt drei zahlende Kunden und den Umsatz des nächsten Quartals sehen.",
    ],
    angel: [
      "Rolf Kindermann",
      "Ehemaliger Geschäftsführer eines Zulieferers",
      "Hat in der Pre-Seed-Runde investiert und für die Seed-Runde wieder zugesagt. Bekommt das monatliche Update und stellt Kontakte zu Herstellern her.",
    ],
    techAngel: [
      "Thomas Reinhardt",
      "Ehemaliger Technikvorstand eines Maschinenbauers",
      "Hat nach der Pilotbesprechung bei Brenner zugesagt. Möchte bei der ersten Vertriebsperson helfen.",
    ],
    syndicate: [
      "Angelkreis Neckartal",
      "B2B-Startups aus Baden-Württemberg",
      "Frau Weber hat uns zum nächsten Pitch-Abend eingeladen. Noch nichts vorbereitet.",
    ],
    regionalFund: [
      "Mittelstandsfonds Südwest",
      "Regionaler Seed-Fonds für Industrietechnik",
      "Herr Kindermann hat dort um eine Vorstellung gebeten. Wir warten auf einen Termin.",
    ],
    ventureFund: [
      "Eisenbrück Capital",
      "Series A, Branchensoftware",
      "Für sie noch zu früh. Herr Ohlsen möchte in Kontakt bleiben, bis wir die nächste Umsatzschwelle erreichen.",
    ],
    corporate: [
      "Mittelstand Industrie Ventures",
      "Fertigungstechnologie",
      "Frau Lorenz möchte verstehen, wie Piloten in kleinen Werken laufen. Kaffeetermin steht.",
    ],
    secondSeed: [
      "Fingerhut Seed",
      "Pre-Seed und Seed, branchenoffen",
      "Nach dem ersten Treffen abgesagt: im aktuellen Fonds keine hardwarenahe Software.",
    ],
  },
  investorDomains: {
    seedFund: "nordlicht-seed.example",
    angel: "kindermann-beteiligungen.example",
    techAngel: "reinhardt-beteiligungen.example",
    syndicate: "angelkreis-neckartal.example",
    regionalFund: "mittelstandsfonds-suedwest.example",
    ventureFund: "eisenbrueck-capital.example",
    corporate: "mi-ventures.example",
    secondSeed: "fingerhut-seed.example",
  },
  tasks: {
    sendSecurityAnswers: "IT-Sicherheitsfragen von Hollerbach beantworten",
    prepareDecisionCall: "Preise für drei Linien für Hartmann vorbereiten",
    pilotReview: "Pilotzahlen für die Gießerei Brenner auswerten",
    plasticsDemo: "Demodaten für Kunststofftechnik Wiesental einrichten",
    packagingRecap: "Zusammenfassung der Demo an Herrn Fuchs senden",
    valvesIntro: "Beispiel-Prüfplan für Falkenberg entwerfen",
    opticsFollowUp: "Nach dem ersten Gespräch bei Frau Lindner nachfassen",
    investorUpdate: "Monatliches Investoren-Update schreiben",
    metricsForSeedFund: "Umsatz- und Pilotkennzahlen an Nordlicht Seed senden",
    springsOnboarding: "Einführungsschulung bei der Federnfabrik Rauscher",
  },
  views: {
    pipeline: "Pipeline",
    seedRound: "Seed-Runde",
    nextSteps: "Nächste Schritte",
    investors: "Investorentermine",
    dueSoon: "Bald fällig",
    pilots: "Piloten",
  },
  widgets: {
    openPipeline: "Offene Pipeline (ARR)",
    weighted: "Gewichtete Pipeline (ARR)",
    won: "Gewonnener ARR",
    committed: "Zusagen für die Seed-Runde",
    byStage: "Verkaufschancen nach Phase",
    meetings: "Investorentermine, nächste 14 Tage",
    seedRound: "Investoren nach Rundenstatus",
    newByMonth: "Neue Verkaufschancen pro Monat",
    byAccount: "ARR ab Demo nach Firma",
    tasksMonth: "Offene Aufgaben im Monat",
  },
  wiki: {
    guide: {
      title: "Leitfaden",
      markdown: [
        "Messwerk entwickelt Software für die Qualitätsprüfung in mittelständischen Industriebetrieben. Max, einer der Gründer, verkauft noch selbst. Dieser Arbeitsbereich enthält Demodaten; alle Firmen und Personen sind erfunden.",
        "",
        "## So nutzen wir das CRM",
        "- **Firmen** sind die Betriebe, an die wir verkaufen. **Kontakte** sind die Menschen dort und die Ansprechpartner bei unseren Investoren.",
        "- **Verkaufschancen** haben die Zahl der Produktionslinien und den Preis pro Linie und Jahr. Ihr Wert wird aus beidem berechnet: unser wiederkehrender Jahresumsatz (ARR), wenn der Abschluss kommt. Der gewichtete Wert ist dieser Wert mal der Wahrscheinlichkeit der Phase.",
        "- **Investoren** sind die Fonds und Business Angels unserer Seed-Runde. Das Board „Seed-Runde“ ordnet sie nach Rundenstatus; Ticketgröße, Lead-Investor und der nächste Termin (Datum und Uhrzeit) sind normale Felder. Das Dashboard zeigt die Investorentermine der nächsten 14 Tage.",
        "- **Piloten** haben einen Pilotzeitraum; die Ansicht „Piloten“ zeigt sie im Kalender.",
        "- **Aufgaben** und Termine für nächste Schritte sind normale Felder. Niemand wird automatisch erinnert, deshalb jeden Morgen die Ansichten „Nächste Schritte“ und „Bald fällig“ prüfen.",
        "- Eine E-Mail oder ein LinkedIn-Chat gehört nur dann zu einer Verkaufschance, einer Firma oder einem Investor, wenn jemand ihn dort verknüpft.",
        "- Max nutzt Claude Desktop über MCP, um Datensätze nachzuschlagen und zu ändern; siehe die Seite zum KI-Client.",
        "",
        "## Arbeitsregeln",
        "- Jede offene Verkaufschance hat einen nächsten Schritt mit Datum.",
        "- Bei verlorenen Verkaufschancen den Verlustgrund eintragen.",
        "- Vertrieb und Finanzierungsrunde bleiben in getrennten Listen, damit Investorengespräche nie in den Vertriebszahlen landen.",
        "- Pilotvereinbarungen, Preisblätter, IT-Fragebögen und Term Sheets liegen als Dateien im Feld „Dokumente“ der Verkaufschance oder des Investors, damit die Suche ihren Text findet. Abrechnung und Produkt-Backlog bleiben in ihren eigenen Programmen.",
      ],
    },
    process: {
      title: "Gründervertrieb Schritt für Schritt",
      markdown: [
        "Unsere Phasen folgen dem Weg, auf dem ein Industriebetrieb bei einem jungen Softwareunternehmen kauft: vom Erstgespräch bis zum Pilot auf einer Linie.",
        "",
        "## Phasen",
        "1. **Identifiziert:** ein passender Betrieb und eine Person, mit der wir sprechen können.",
        "2. **Im Gespräch:** Erstgespräch geführt; Qualitätsproblem und Entscheider stehen in den Notizen.",
        "3. **Demo:** Produkt mit den eigenen Prüfschritten des Interessenten gezeigt.",
        "4. **Pilotphase:** das Produkt läuft auf einer Linie, Fragen von IT und Datenschutz sind beantwortet.",
        "5. **Entscheidung:** Preise verschickt, Entscheidungstermin vereinbart.",
        "6. **Gewonnen oder Verloren:** Ergebnis festhalten, bei Verlust mit Grund.",
      ],
    },
    afterDemo: {
      title: "Nach einer Demo",
      whenToUse:
        "Wenn eine Produktdemo bei einem Interessenten vorbei ist und die Verkaufschance aktualisiert werden muss.",
      markdown: [
        "Nach einer Demo gibt es offene Fragen und Zusagen. Sie werden noch am selben Tag festgehalten, solange sich alle daran erinnern.",
        "",
        "## Schritte",
        "1. Offene Fragen und Teilnehmende in den Notizen der Verkaufschance festhalten.",
        "2. Nächsten Schritt mit Datum setzen; Phase anpassen, wenn sie sich geändert hat.",
        "3. Zahl der Produktionslinien oder Preis pro Linie anpassen, wenn sich der Umfang geändert hat; der ARR folgt.",
        "4. E-Mail oder LinkedIn-Chat mit dem Interessenten mit der Verkaufschance verknüpfen, damit der Verlauf an einem Ort bleibt.",
      ],
    },
  },
  mcp: {
    title: "Das CRM aus dem eigenen KI-Client nutzen (MCP)",
    markdown: [
      "Customermates hat einen MCP-Endpunkt, damit ein KI-Client, den wir ohnehin nutzen, diesen Arbeitsbereich lesen und ändern kann. Max arbeitet mit Claude Desktop; alle anderen können ihren eigenen Client genauso verbinden.",
      "",
      "## So hat Max Claude Desktop verbunden",
      "- Max hat unter Einstellungen, API-Schlüssel einen persönlichen Schlüssel mit dem Namen Claude Desktop angelegt und ihn in die Konfiguration des Clients eingetragen. Clients mit eigenem Connector melden sich stattdessen per OAuth an, ganz ohne Schlüssel.",
      "- Der Schlüssel handelt als Max und nur in diesem Arbeitsbereich. Er sieht und ändert genau das, was Max' Rolle erlaubt, nicht mehr.",
      "- Der Client nutzt unseren eigenen KI-Anbieter, der die Modellnutzung abrechnet.",
      "",
      "## Wofür wir ihn nutzen",
      "- Vor einem Termin: fragen, in welcher Phase eine Verkaufschance steht, wer der Fürsprecher ist und was in der letzten E-Mail stand.",
      "- Nach einem Termin: den Client bitten, die Phase zu ändern, den nächsten Schritt mit Datum zu setzen und eine Notiz anzulegen.",
      "- Vor einem Investorentermin: gewonnenen ARR, offene Pipeline nach Phase und Investoren nach Rundenstatus abfragen.",
      "",
      "## Regeln",
      "- Prüfen, worum man den Client bittet. Eine Rückfrage vor dem Löschen oder Senden kommt vom Client, nicht vom CRM.",
      "- Gelöschte Datensätze liegen 30 Tage im Papierkorb; andere Änderungen werden nicht automatisch zurückgenommen.",
      "- Den Schlüssel in den Einstellungen löschen, wenn ein Laptop verloren geht oder jemand das Team verlässt.",
    ],
  },
  webhooks: {
    onboarding: "Änderungen an Verkaufschancen für den Onboarding-Dienst, der bei Gewonnen das Onboarding startet",
    onboardingUrl: "https://hooks.messwerk-software.example/crm/onboarding",
  },
  routines: {
    demoRecap: {
      name: "Demo-Zusammenfassung entwerfen",
      task: "Eine Verkaufschance hat sich geändert. Lies die Verkaufschance aus routine_trigger mit der konfigurierten Phase, der Firma, den Kontakten, den Notizen und den verknüpften Gesprächen. Mach nur weiter, wenn die Phase Demo ist und der Auslöser zeigt, dass sich die Phase geändert hat; sonst melde, dass nichts zu entwerfen ist. Schreib eine kurze Zusammenfassung als E-Mail an den Hauptkontakt: was wir gezeigt haben, die offenen Fragen aus den Notizen und den vorgeschlagenen nächsten Schritt mit Datum. Speichere sie mit save_message_draft in dem Gespräch, das mit der Verkaufschance verknüpft ist, oder melde, dass keines verknüpft ist. Der Entwurf wartet, bis Max ihn prüft und selbst sendet. Ändere weder die Verkaufschance noch einen anderen Datensatz.",
      runs: [
        "Zusammenfassung für Herrn Fuchs bei Verpackungen Lindau mit dem Pilotumfang für zwei Linien entworfen; sie liegt im verknüpften Gespräch zur Prüfung bereit.",
        "Die Verkaufschance ist in die Pilotphase gewechselt, nicht in Demo, deshalb gab es nichts zu entwerfen.",
        "Ich konnte den Modellanbieter nicht erreichen und habe aufgehört, bevor ich etwas gelesen habe. Nichts wurde entworfen oder geändert.",
      ],
    },
    dueFollowUps: {
      name: "Jeden Morgen Nachfass-Entwürfe für fällige Verkaufschancen",
      task: "Finde jeden Werktagmorgen die offenen Verkaufschancen, deren Datum nächster Schritt heute oder früher liegt und deren Phase Identifiziert, Im Gespräch, Demo, Pilotphase oder Entscheidung ist. Lies zu jeder die Verkaufschance mit Firma, Kontakten, Notizen und dem letzten verknüpften Gespräch. Ist ein Gespräch verknüpft, speichere mit save_message_draft einen kurzen Nachfass-Entwurf, der dort anknüpft, wo die letzte Nachricht aufgehört hat, und den nächsten Schritt mit Datum vorschlägt; lass einen vorhandenen Entwurf stehen, statt einen zweiten zu schreiben. Ist kein Gespräch verknüpft, lege eine Aufgabe „Nachfassen bei <Name des Kontakts>“ mit Fälligkeit heute an, verknüpft mit der Verkaufschance und dem Kontakt, es sei denn, es gibt dafür schon eine offene Aufgabe. Sende nie eine Nachricht und ändere nie die Phase oder das Datum nächster Schritt.",
      runs: [
        "Zwei Nachfass-Entwürfe geschrieben, für Verpackungen Lindau und die Federnfabrik Rauscher; beide liegen in den verknüpften Gesprächen zur Prüfung bereit. Sonst war nichts fällig.",
        "Einen Nachfass-Entwurf für Kunststofftechnik Wiesental geschrieben und Hartmann Präzisionstechnik übersprungen: Die Antwort dort ist schon ein Entwurf.",
        "Es war nichts fällig, deshalb gab es keine Entwürfe und keine Aufgaben.",
      ],
    },
    newMailTask: {
      name: "Kundenmails in Aufgaben verwandeln",
      task: "Eine neue E-Mail ist eingegangen. Lies die Nachricht aus routine_trigger und ordne den Absender über die Identitätskanäle einem Kontakt zu; brich ab, wenn es keinen Treffer gibt. Lies die Verkaufschancen des Kontakts und die offenen Aufgaben dazu. Stellt die E-Mail eine Frage, nennt eine Frist oder macht ein Versprechen, lege mit mutate_crm_record eine Aufgabe an, benannt nach der Bitte, fällig an dem Datum aus der E-Mail oder in zwei Tagen, verknüpft mit Verkaufschance, Firma und Kontakt. Lege keine Aufgabe an, wenn es für dieselbe Bitte schon eine offene gibt. Entwirf und sende keine Antwort und ändere keinen anderen Datensatz.",
      runs: [
        "Aufgabe „IT-Sicherheitsfragen von Hollerbach beantworten“ in zwei Tagen fällig angelegt, verknüpft mit Pumpenbau Hollerbach und Georg Huber.",
        "Die E-Mail von Verpackungen Lindau bestätigte nur einen Termin, deshalb habe ich keine Aufgabe angelegt.",
        "Der Absender ist kein Kontakt in diesem Arbeitsbereich, deshalb habe ich abgebrochen und nichts angelegt.",
      ],
    },
    investorUpdate: {
      name: "Monatliches Investoren-Update",
      task: "Bereite am Ersten jedes Monats den Entwurf des monatlichen Investoren-Updates als neue Seite der Wissensdatenbank mit dem Titel „Investoren-Update <Monat> <Jahr>“ vor. Nutze query_crm_measure für den gewonnenen ARR (den Wert gewonnener Verkaufschancen), die offene und gewichtete Pipeline nach Phase und die im letzten Monat angelegten Verkaufschancen, und lies die Investoren nach Rundenstatus mit ihren Ticketgrößen. Nenne höchstens drei Kundengewinne und drei Risiken, jeweils belegt durch einen gelesenen Datensatz. Die Seite ist ein Entwurf, den die Gründer selbst überarbeiten und versenden: schreib keinen Investoren an, sende nichts und ändere keinen Datensatz.",
      runs: [
        "Entwurfsseite „Investoren-Update“ mit gewonnenem ARR, offener Pipeline nach Phase und zwei zugesagten Business Angels geschrieben; Nordlicht Seed ist noch im Follow-up.",
        "Entwurfsseite für den Vormonat mit zwei Kundengewinnen, dem Pilot bei der Gießerei Brenner und einem Risiko geschrieben: der IT-Prüfung bei Hollerbach.",
      ],
    },
  },
  threads: {
    precisionDecision: {
      subject: "Preise für drei Linien",
      messages: [
        "Sehr geehrter Herr Bergmann,\n\nHerr Vogt ist nach dem Pilot überzeugt. Für unsere Entscheidungsrunde am Donnerstag brauche ich die Preise für alle drei Linien und den frühesten Starttermin, den Sie zusagen können.\n\nMit freundlichen Grüßen\nDorothea Hartmann",
        "Sehr geehrte Frau Hartmann,\n\nvielen Dank. Die Preise für drei Linien schicke ich Ihnen bis Mittwochmittag. Mit Linie eins könnten wir zwei Wochen nach Unterschrift starten.\n\nMit freundlichen Grüßen\nMax Bergmann",
        "Gut. Bitte nehmen Sie auch eine Schulung für die Spätschicht mit auf.",
        "Sehr geehrte Frau Hartmann,\n\nanbei die Preise für drei Linien, einschließlich zweier Schulungen für die Spätschicht. Die Summe für das erste Jahr steht oben in der Übersicht.\n\nMit freundlichen Grüßen\nMax Bergmann",
      ],
    },
    pumpsSecurity: {
      subject: "IT-Sicherheitsfragen vor dem Pilot",
      messages: [
        "Guten Tag Herr Bergmann,\n\nbevor Frau Wolf mit dem Pilot beginnen kann, brauche ich Antworten auf unseren IT-Fragenkatalog: Standort des Hostings, Single Sign-on und wer bei Ihnen auf unsere Daten zugreifen kann.\n\nViele Grüße\nGeorg Huber",
        "Guten Tag Herr Huber,\n\ndanke für die Liste. Ich beantworte jede Frage bis Freitag schriftlich und komme gern zu einem Termin mit Ihrem Team dazu.\n\nViele Grüße\nMax Bergmann",
        "Ein Termin wäre hilfreich. Dienstag um 10 Uhr?",
      ],
    },
    castingsPilot: {
      messages: [
        "Herr Bergmann, die ersten zwei Wochen Pilot sehen gut aus. In der Putzerei wird jede Prüfung erfasst, ohne Papier.",
        "Das freut mich, Herr Eberle. Wollen wir die Zahlen nächste Woche gemeinsam durchgehen? Herr Steiner sollte gern dabei sein.",
        "Gern. Mittwoch nach dem Schichtwechsel.",
        "Mittwoch um 15 Uhr passt. Ich bringe den Vergleich mit Ihren Papier-Checklisten mit.",
      ],
    },
    opticsIntro: {
      messages: [
        "Guten Tag Herr Bergmann, ein Kollege meinte, Sie helfen Werken bei der Vorbereitung auf Kundenaudits. Wir haben im Frühjahr zwei Audits. Ist das Ihr Thema?",
        "Guten Tag Frau Lindner, ja: Prüfungen direkt an der Linie erfasst und für Auditoren abrufbar. Passt Ihnen nächste Woche ein Gespräch von 30 Minuten?",
      ],
    },
    seedFundCatchUp: {
      subject: "Austausch nach dem Quartal",
      messages: [
        "Hallo Herr Bergmann,\n\nschön zu sehen, dass der Pilot bei Brenner gut läuft. Wie viele zahlende Kunden haben Sie inzwischen, und wie sieht die Pipeline für das nächste Quartal aus?\n\nViele Grüße\nElena Marquardt",
        "Hallo Frau Marquardt,\n\nzwei zahlende Kunden, ein dritter voraussichtlich diesen Monat, und drei Verkaufschancen in Pilotphase oder Entscheidung. Ich erzähle Ihnen gern bei einem Kaffee mehr.\n\nViele Grüße\nMax Bergmann",
        "Ein Kaffee klingt gut. Herr Petersen schickt Ihnen ein paar Termine.",
      ],
    },
    packagingDemo: {
      messages: [
        "Danke für die Demo, Herr Bergmann. Die Fotoprüfung kam im Team gut an. Könnten wir mit zwei Linien starten?",
        "Danke, Herr Fuchs. Zwei Linien sind ein guter Anfang. Ich schicke Ihnen heute eine kurze Zusammenfassung mit einem Vorschlag für den Pilotumfang.",
        "Erhalten, sieht gut aus. Den Umfang besprechen wir am Montag.",
      ],
    },
  },
  calendar: {
    name: "Vertriebstermine",
    events: [
      "Entscheidungstermin mit Hartmann Präzisionstechnik",
      "Pilotbesprechung mit der Gießerei Brenner",
      "Kaffee mit Nordlicht Seed",
    ],
  },
  countryCode: "de",
  addresses: {
    precision: ["Habermehlstraße 12", "75172", "Baden-Württemberg", 48.8916, 8.6986],
    castings: ["Salzstraße 88", "74072", "Baden-Württemberg", 49.1427, 9.2109],
    plastics: ["Wiesentalstraße 21", "79539", "Baden-Württemberg", 47.6141, 7.6637],
    valves: ["Sandstraße 140", "57072", "Nordrhein-Westfalen", 50.8748, 8.0243],
    packaging: ["Rottachstraße 9", "87435", "Bayern", 47.7286, 10.3158],
    springs: ["Baarstraße 54", "58636", "Nordrhein-Westfalen", 51.3747, 7.6964],
    pumps: ["Nürnberger Straße 77", "97070", "Bayern", 49.7913, 9.9373],
    optics: ["Göschwitzer Straße 30", "07743", "Thüringen", 50.9374, 11.5843],
    furniture: ["Eckendorfer Straße 18", "33602", "Nordrhein-Westfalen", 52.0254, 8.5371],
    coatings: ["Merscheider Straße 105", "42651", "Nordrhein-Westfalen", 51.1735, 7.0846],
    gears: ["Allmandstraße 6", "88045", "Baden-Württemberg", 47.6533, 9.4783],
    molds: ["Heedfelder Straße 41", "58507", "Nordrhein-Westfalen", 51.2193, 7.6311],
  },
  files: {
    questionnaire: {
      name: "IT-Sicherheitsfragebogen.xlsx",
      rows: [
        ["Frage", "Antwort", "Status"],
        [
          "Wo werden die Daten gehostet?",
          "Rechenzentrum in Frankfurt am Main, verschlüsselt gespeichert",
          "Beantwortet",
        ],
        ["Unterstützen Sie Single Sign-on (SSO)?", "Ja: SSO mit Microsoft Entra ID oder Okta über SAML", "Beantwortet"],
        [
          "Wer bei Messwerk kann auf unsere Daten zugreifen?",
          "Die zwei Gründer und ein Support-Ingenieur, protokolliert",
          "Beantwortet",
        ],
        ["Penetrationstest in den letzten 12 Monaten?", "Für das nächste Quartal geplant", "Offen"],
        ["Werden Prüffotos auf Wunsch gelöscht?", "Ja, innerhalb von 30 Tagen", "Beantwortet"],
      ],
    },
    pilotAgreement: {
      name: "Pilotvereinbarung.pdf",
      lines: [
        "# Pilotvereinbarung: Gießerei Brenner und Messwerk",
        "Die Gießerei Brenner nutzt Messwerk vier Wochen lang in der Putzerei. Messwerk stellt Software, Einrichtung und eine Schulung pro Schicht kostenlos bereit.",
        "## Umfang",
        "| Punkt | Inhalt |",
        "| Linie | Putzerei, Werk 1 |",
        "| Dauer | 4 Wochen |",
        "| Nutzer | Bis zu 12 Prüfer, Anmeldung per SSO |",
        "| Erfolgskriterium | 95 % der Prüfungen an der Linie erfasst, keine Papier-Checklisten |",
        "## Nach dem Pilot",
        "Sind die Kriterien erfüllt, gehen beide Linien in den Jahresplan zu 6.000 € pro Linie und Jahr.",
      ],
    },
    pricing: {
      name: "Preise – drei Linien.pdf",
      lines: [
        "# Preise für Hartmann Präzisionstechnik",
        "Jahresplan für drei Produktionslinien, vorbereitet für die Entscheidungsrunde mit Dorothea Hartmann und Andreas Vogt.",
        "## Erstes Jahr",
        "| Position | Menge | Preis | Summe |",
        "| Produktionslinie, Jahresplan | 3 | 6.000 € | 18.000 € |",
        "| Schulung für die Spätschicht | 2 Termine | inklusive | 0 € |",
        "| SSO und Prüfprotokoll | 1 | inklusive | 0 € |",
        "| Summe erstes Jahr |  |  | 18.000 € |",
        "## Start",
        "Linie eins startet zwei Wochen nach Unterschrift; Linie zwei und drei folgen im Abstand von je einem Monat.",
      ],
    },
    termSheet: {
      name: "Term Sheet (Entwurf).pdf",
      lines: [
        "# Term Sheet (Entwurf): Seed-Runde Messwerk",
        "Entwurf zur Diskussion mit Nordlicht Seed. Nicht bindend.",
        "## Eckpunkte",
        "| Punkt | Entwurf |",
        "| Rundengröße | 1.500.000 € |",
        "| Lead-Investor | Nordlicht Seed, 750.000 € |",
        "| Instrument | Vorzugsanteile, 1x Liquidationspräferenz ohne Teilnahme |",
        "| Beirat | Zwei Gründer, ein Investorensitz |",
        "| Mitarbeiterbeteiligung | 10 % nach der Runde |",
        "## Offene Punkte",
        "Nordlicht Seed möchte vor der Unterschrift den Umsatz des nächsten Quartals sehen. Hartmann Präzisionstechnik (drei Linien) ist in der Entscheidung.",
      ],
    },
    onePager: {
      name: "Onepager.pdf",
      lines: [
        "# Messwerk auf einer Seite",
        "Software für die Qualitätsprüfung im industriellen Mittelstand: jede Prüfung an der Linie erfasst und bereit für das nächste Kundenaudit.",
        "## Zugkraft",
        "| Kennzahl | Heute |",
        "| Zahlende Kunden | 3 |",
        "| Gewonnener ARR | 29.200 € |",
        "| Offene Pipeline (ARR) | 165.600 € |",
        "| Laufende oder geplante Piloten | 3 |",
        "## Warum jetzt",
        "Kundenaudits verlangen Prüfnachweise pro Teil. Betriebe mit 50 bis 500 Beschäftigten arbeiten noch mit Papier. Messwerk läuft auf einem Tablet an der Linie, mit SSO für die IT und ohne Server vor Ort.",
        "## Die Runde",
        "Seed-Runde über 1.500.000 €; 125.000 € von zwei Business Angels zugesagt.",
      ],
    },
  },
  trash: { contact: "Andreas Vogt (Duplikat)", deal: "Werkzeugbau Halstedt – Pilot" },
  mateChat: {
    title: "Investoren-Update für diesen Monat entwerfen",
    messages: [
      "Entwirf das Investoren-Update für diesen Monat und speichere es als Wiki-Seite.",
      "Ich habe den Entwurf als Wiki-Seite „Investoren-Update (Entwurf)“ gespeichert. Die Zahlen stammen aus den Datensätzen:\n\n- **Gewonnener ARR:** 29.200 € von drei Kunden: Getriebebau Seewald (16.000 €), Federnfabrik Rauscher (7.200 €) und Oberflächentechnik Neuhaus (6.000 €).\n- **Offene Pipeline:** 165.600 € ARR in zehn Verkaufschancen; am größten sind Kunststofftechnik Wiesental und Federnfabrik Rauscher (alle vier Linien) mit je 24.000 €.\n- **Piloten:** Die Gießerei Brenner ist in Woche drei in der Putzerei; Pumpenbau Hollerbach startet, sobald der IT-Sicherheitsfragebogen freigegeben ist (SSO ist beantwortet); Verpackungen Lindau plant einen Pilot auf zwei Linien.\n- **Seed-Runde:** 125.000 € zugesagt von zwei Business Angels. Nordlicht Seed (750.000 €, Lead) ist im Follow-up; der nächste Termin steht im Widget „Investorentermine“.\n\nRisiko für das Update: Hartmann Präzisionstechnik (18.000 €) entscheidet nach den Preisen für drei Linien. Die Seite ist ein Entwurf; es wurde nichts versendet.",
    ],
  },
  inbox: {
    plasticsDemo: {
      subject: "Zweite Demo mit beiden Werksleitern",
      messages: [
        "Guten Tag Frau Kaiser,\n\nnoch einmal vielen Dank für die erste Demo. Für die zweite würde ich gern beide Werksleiter dabeihaben und sie mit Ihren eigenen Prüfschritten durchführen. Würde Donnerstag um 14 Uhr passen?\n\nViele Grüße\nMax Bergmann",
        "Guten Tag Herr Bergmann,\n\nDonnerstag um 14 Uhr passt, und beide Werksleiter von Herrn Wiesner können kommen. Eine Frage: Werk 2 nummeriert seine Teile anders als Werk 1. Kommt die Demo mit zwei Nummernschemata zurecht?\n\nRenate Kaiser",
        "Guten Tag Frau Kaiser,\n\nja, jede Linie hat ihre eigene Teileliste, beide Schemata laufen also nebeneinander. Ich richte heute Demodaten für beide Werke ein, damit Sie es mit Ihren eigenen Teilenummern sehen.\n\nViele Grüße\nMax Bergmann",
        "Prima. Ich schicke Ihnen heute Nachmittag je zehn Teilenummern aus beiden Werken.\n\nRenate Kaiser",
      ],
    },
    springsLines: {
      subject: "Alle vier Linien bei Rauscher",
      messages: [
        "Sehr geehrte Frau Rauscher,\n\ndie zwei Linien laufen jetzt seit einigen Wochen. Sollen wir darüber sprechen, Messwerk auf alle vier auszuweiten? Ich bringe die Nutzungszahlen Ihrer ersten beiden Linien mit.\n\nMit freundlichen Grüßen\nMax Bergmann",
        "Guten Tag Herr Bergmann,\n\nja, mein Vorarbeiter ist angetan. Bevor ich entscheide, möchte ich wissen, was vier Linien kosten. Sind es weiterhin 3.600 € pro Linie?\n\nSusanne Rauscher",
        "Sehr geehrte Frau Rauscher,\n\ndas Einstiegspaket lag bei 3.600 € pro Linie. Für alle vier Linien kostet der Jahresplan 6.000 € pro Linie, also 24.000 € im Jahr. Als Bestandskundin sollten Sie einen besseren Preis pro Linie bekommen, ich rechne deshalb ein paar Varianten durch und schicke sie Ihnen morgen.\n\nMit freundlichen Grüßen\nMax Bergmann",
        "Danke. Bitte machen Sie es einfach, eine Zahl für vier Linien. Mein Vorarbeiter meint, drei Linien würden zum Start reichen und die vierte nach dem Sommer. Ist das möglich?\n\nSusanne Rauscher",
      ],
    },
    valvesPlan: {
      subject: "Beispiel-Prüfplan für den Wareneingang",
      messages: [
        "Guten Tag Herr Bergmann,\n\ndanke für das Gespräch auf der Messe. Wir prüfen jede Lieferung von Ventilgehäusen heute von Hand. Könnten Sie mir zeigen, wie ein Prüfplan für unsere drei häufigsten Teile aussehen würde?\n\nLaura Jansen",
        "Guten Tag Frau Jansen,\n\ngern. Ich baue einen Beispielplan mit den Prüfungen, die Sie beschrieben haben: Maße, Oberfläche und die Freigabe der Druckprüfung. Welche drei Teile soll ich nehmen?\n\nViele Grüße\nMax Bergmann",
        "Den Gehäusekörper DN25, den Flansch DN40 und den Dichtsitzring. Die Zeichnungen habe ich Ihnen in einem Ordner freigegeben, Sie müssten die Einladung haben.\n\nLaura Jansen",
        "Guten Tag Frau Jansen,\n\ndanke, ich habe den Ordner. Ich stelle den Beispielplan für den Gehäusekörper DN25, den Flansch DN40 und den Dichtsitzring gerade fertig: Jedes Teil hat seine Prüfungen, Toleranzen und einen Fotoschritt. Eine Frage, bevor ich ihn schicke: Wird die Druckprüfung pro Charge oder pro Teil freigegeben?\n\nViele Grüße\nMax Bergmann",
      ],
    },
    seedMetrics: {
      subject: "Zahlen vor dem Kaffee",
      messages: [
        "Hallo Herr Bergmann,\n\nFrau Marquardt möchte sich vor Ihrem Kaffee ein paar Zahlen ansehen: den Umsatz pro Monat, die Konversion vom Pilot zum zahlenden Kunden und wie viele Prüfungen jeder zahlende Kunde pro Woche erfasst. Könnten Sie sie einen Tag vorher schicken?\n\nViele Grüße\nJonas Petersen",
        "Hallo Herr Petersen,\n\nja. Umsatz und Pilotkonversion habe ich schnell zusammen. Die wöchentlichen Prüfungen ziehe ich aus dem Nutzungsprotokoll und schicke Ihnen alles bis Donnerstag.\n\nViele Grüße\nMax Bergmann",
        "Donnerstag passt. Frau Marquardt fragt außerdem, wie die Gießerei Brenner gegenüber dem Erfolgskriterium von 95 Prozent aus der Pilotvereinbarung liegt.\n\nJonas Petersen",
      ],
    },
    angelUpdate: {
      subject: "Monatliches Update",
      messages: [
        "Herr Bergmann,\n\nich habe das monatliche Update noch nicht gesehen. Kein Druck, aber ich lese es gern, bevor ich mit den Leuten vom Mittelstandsfonds spreche.\n\nRolf Kindermann",
        "Guten Tag Herr Kindermann,\n\nentschuldigen Sie, es verzögert sich. Es geht bis Ende der Woche raus, mit den Pilotzahlen aus der Gießerei Brenner.\n\nViele Grüße\nMax Bergmann",
        "Gut. Deren Partner ist am 18. zurück. Ich stelle Sie vor, sobald ich Ihr Update habe.\n\nRolf Kindermann",
        "Guten Tag Herr Kindermann,\n\ndas Update ist unterwegs: Brenner ist in Woche drei, Hartmann entscheidet am Donnerstag, und die IT-Prüfung bei Hollerbach ist fast abgeschlossen. Ich schicke es morgen früh, damit Sie es vor dem 18. haben.\n\nDanke für die Vorstellung.\n\nViele Grüße\nMax Bergmann",
      ],
    },
    coatingsUsage: {
      subject: "Nutzungszahlen für das Audit",
      messages: [
        "Guten Tag Herr Bergmann,\n\nunser Kundenaudit steht an, und der Auditor wird fragen, wie wir die Prüfungen an Linie 1 erfassen. Könnten Sie mir monatlich einen Export dessen schicken, was die Tablets erfasst haben?\n\nViele Grüße\nJana Kolb",
        "Guten Tag Frau Kolb,\n\nselbstverständlich. Ich richte einen monatlichen Export des Prüfprotokolls ein, eine CSV-Datei pro Monat, und schicke Ihnen die erste noch diese Woche.\n\nViele Grüße\nMax Bergmann",
        "Sehr gut. Wie viele Prüfungen haben wir im letzten Monat erfasst?\n\nJana Kolb",
        "Guten Tag Frau Kolb,\n\n2.380 Prüfungen an Linie 1, fast alle auf dem Tablet. Der Export listet jede Prüfung mit Prüfer und Uhrzeit auf und folgt in einer separaten Mail. Ich gehe ihn beim Nutzungsgespräch mit Ihnen durch.\n\nViele Grüße\nMax Bergmann",
      ],
    },
    castingsPlant: {
      subject: "Schulung der dritten Schicht",
      messages: [
        "Guten Tag Herr Bergmann,\n\nab nächster Woche läuft in der Putzerei eine dritte Schicht. Könnten Sie ihr dieselbe Schulung von 30 Minuten geben wie den anderen?\n\nKlaus Steiner",
        "Guten Tag Herr Steiner,\n\ngern. Ich kann sie Montag um 22 Uhr zu Schichtbeginn halten oder am Nachmittag nur mit dem Schichtführer.\n\nViele Grüße\nMax Bergmann",
        "Zu Schichtbeginn ist besser. In der Schicht sind elf Prüfer, bringen Sie das Kurzanleitungsblatt mit.\n\nKlaus Steiner",
        "Guten Tag Herr Steiner,\n\nMontag um 22 Uhr, abgemacht. Ich bringe das Kurzanleitungsblatt und ein paar Ersatztablets mit.\n\nViele Grüße\nMax Bergmann",
      ],
    },
    plasticsCeo: {
      messages: [
        "Herr Bergmann, Frau Kaiser sagt, es war die erste Demo, bei der ihr Team das Tablet in fünf Minuten verstanden hat. Wie würde ein Pilot in einem Werk bei uns aussehen?",
        "Danke, Herr Wiesner. Vier Wochen auf einer Linie, mit Schulung für jede Schicht und ohne Kosten, und wir legen die Erfolgskriterien vorher fest. Wenn sie erreicht werden, kostet der Jahresplan 6.000 € pro Linie.",
        "Das passt für uns. Die Linie suchen wir nach der Demo am Donnerstag aus. Können Sie mir die Pilotvereinbarung schicken, die Sie bei Brenner genutzt haben?",
      ],
    },
    syndicatePitch: {
      messages: [
        "Hallo Herr Bergmann, unser nächster Pitch-Abend ist am 28. in Stuttgart. Wir hätten Sie gern dabei: sieben Minuten plus Fragen. Haben Sie Interesse?",
        "Hallo Frau Weber, danke, sehr gern. Welcher Abend genau, und wer sitzt im Raum?",
        "Der 28., sechs Business Angels und zwei Folgeinvestoren. Einlass um 18 Uhr, Sie sind als Zweiter dran. Können Sie bis Freitag zusagen?",
        "Ja, bitte planen Sie mich für den 28. ein. Ich bringe den One-Pager und eine Live-Demo auf dem Tablet mit. Danke für die Einladung, Frau Weber!",
      ],
    },
    corporateCoffee: {
      messages: [
        "Hallo Herr Bergmann, ich freue mich auf den Kaffee. Passt der Termin um 8:30 Uhr weiterhin?",
        "Hallo Frau Lorenz, ja, 8:30 Uhr passt. Ich bringe ein Tablet mit und zeige Ihnen, wie ein Pilot in einem kleinen Werk abläuft.",
        "Sehr gut. Ich bringe unseren Leiter Fertigung mit, er möchte das Tablet auch sehen.",
        "Prima, bis dahin.",
      ],
    },
    ventureCatchUp: {
      messages: [
        "Herr Bergmann, ich habe Ihren Beitrag zum Pilot bei Brenner gesehen. Gute Arbeit. Für uns noch zu früh, aber halten Sie mich auf dem Laufenden.",
        "Danke, Herr Ohlsen. Der nächste Meilenstein ist die Einführung bei Hartmann Präzisionstechnik auf drei Linien, die innerhalb von zwei Wochen entschieden werden sollte. Ich melde mich mit einer Zeile, sobald unterschrieben ist.",
        "Bitte tun Sie das. Wenn die Zahlen halten, sprechen wir im Frühjahr noch einmal.",
        "Mache ich. Danke, Herr Ohlsen.",
      ],
    },
  },
  agentNotes: {
    packagingDemo: [
      "Zusammenfassung von Claude nach dem Demo-Gespräch:",
      "- Das Team von Herrn Fuchs fand die Fotoprüfung gut und möchte mit zwei Linien starten.",
      "- Offen: wie die Tablets ins Werks-WLAN kommen und wer die Prüfpläne pflegt.",
      "- Nächstes: Pilotumfang am Montag abstimmen; Zusammenfassung und Vorschlag stehen im E-Mail-Verlauf.",
    ],
    precisionBrief: [
      "Entwurf von ChatGPT aus dem Preisangebot und den Pilotnotizen für den Entscheidungstermin:",
      "- Drei Linien zu je 6.000 €: 18.000 € ARR, Schulung der Spätschicht und SSO inklusive.",
      "- Herr Vogt ist nach dem Pilot überzeugt; Frau Hartmann entscheidet im Termin am Donnerstag.",
      "- Zu erwartende Fragen: der Starttermin (Linie eins zwei Wochen nach Unterschrift) und wer die Spätschicht schult.",
    ],
    valvesImport: [
      "Importiert von Codex (Skriptlauf auf der Messe-CSV):",
      "- 41 Zeilen gelesen, 3 Dubletten zusammengeführt, 6 Zeilen ohne E-Mail-Adresse übersprungen.",
      "- Das Armaturenwerk Falkenberg war der einzige Treffer mit 150 bis 250 Mitarbeitenden in der Region.",
      "- Quelle auf Messe gesetzt; Frau Jansen ist der Kontakt vom Badge-Scan.",
    ],
    coatingsUsage: [
      "Nutzungsexport von Codex (Skriptlauf auf dem Prüfprotokoll):",
      "- Linie 1 bei Neuhaus hat im letzten Monat 2.380 Prüfungen erfasst, fast alle auf dem Tablet.",
      "- Frau Kolb braucht für ihr Kundenaudit eine monatliche CSV-Datei; das Skript schreibt eine Datei pro Monat.",
      "- Nächstes: den Export im Nutzungsgespräch durchgehen und nach den Linien 2 und 3 fragen.",
    ],
    investorUpdateTask: [
      "Angelegt von Claude aus der E-Mail von Rolf Kindermann:",
      "- Er möchte das monatliche Update, bevor er mit dem Partner des Mittelstandsfonds spricht, der am 18. zurück ist.",
      "- Aufnehmen: Brenner in Woche drei, die Entscheidung bei Hartmann und die IT-Prüfung bei Hollerbach.",
    ],
    seedFundPrep: [
      "Vorbereitung von ChatGPT für den Kaffee mit Nordlicht Seed:",
      "- Frau Marquardt hat nach Umsatz pro Monat, Konversion vom Pilot zum zahlenden Kunden und wöchentlichen Prüfungen pro Kunde gefragt.",
      "- Gesprächspunkte: drei zahlende Kunden, Brenner in Woche drei, Hartmann entscheidet über drei Linien.",
      "- Offener Punkt aus dem Term-Sheet-Entwurf: Nordlicht Seed möchte den Umsatz des nächsten Quartals sehen, bevor es unterschreibt.",
    ],
  },
  agents: {
    company: "Messwerk",
    records: "Firmen, Verkaufschancen und Investoren",
    mate: "Max bittet es in der App, eine Verkaufschance nachzuschlagen, den nächsten Schritt zu setzen oder nach einer Demo die Zusammenfassung zu schreiben; es speichert sie als Entwurf im verknüpften Gespräch.",
    claude:
      "Max nutzt Claude Desktop vor und nach Terminen: wer der Fürsprecher ist und was in der letzten E-Mail stand, danach Phase, nächster Schritt und eine Notiz nach dem Gespräch.",
    chatgpt:
      "ChatGPT bereitet die Investorengespräche vor: Vor einem Termin macht es aus dem Datensatz, den Notizen und dem Term Sheet eines Investors Gesprächspunkte.",
    codex:
      "Codex übernimmt die Skriptarbeit: Messe-Leadlisten importieren, Dubletten zusammenführen und die monatlichen Nutzungszahlen für Kunden exportieren.",
    followUp:
      "Jeden Werktag um 8 Uhr liest die Routine „Jeden Morgen Nachfass-Entwürfe für fällige Verkaufschancen“ die Verkaufschancen, deren Datum für den nächsten Schritt heute oder früher liegt, und speichert pro Verkaufschance einen kurzen Nachfass-Entwurf im verknüpften Gespräch; wo keines verknüpft ist, legt sie eine Aufgabe an. Die Entwürfe warten im Posteingang, Max liest, ändert und sendet sie selbst, und die Routine sendet nie etwas.",
  },
  mateChatPlant: {
    title: "Zweites Werk bei Brenner anlegen",
    messages: [
      "Herr Steiner sagt, dass das zweite Werk der Gießerei Brenner Messwerk auch ausprobieren möchte. Leg dafür eine Verkaufschance an, verknüpft mit der Gießerei Brenner und Herrn Steiner, und setz als nächsten Schritt, ihn zu fragen, wer das Werk leitet.",
      "Erledigt. Ich habe die Verkaufschance **Gießerei Brenner – zweites Werk** in der Phase Identifiziert angelegt:\n\n- **ARR:** 10.000 € (2 Produktionslinien zu 5.000 € pro Linie und Jahr). Das ist eine Schätzung; passe sie an, sobald Herr Steiner die tatsächliche Zahl der Linien nennt.\n- **Verknüpft mit:** Gießerei Brenner und Klaus Steiner (Werksleiter).\n- **Quelle:** Gründernetzwerk. **Erwarteter Abschluss:** in etwa vier Monaten.\n- **Nächster Schritt:** „Herrn Steiner nach der Leitung des zweiten Werks fragen“, in zwei Wochen.\n\nEine eigene Aufgabe habe ich nicht angelegt, weil der nächste Schritt mit seinem Datum das schon abdeckt. Es wurde nichts an Herrn Steiner gesendet.",
    ],
  },
  extraEvents: ["Sicherheitstermin mit Pumpenbau Hollerbach", "Nutzungsbesprechung mit der Federnfabrik Rauscher"],
};

const ORGANIZATION_FACTS: Record<
  OrganizationKey,
  { industry: string; fit: string; employees: number; createdDaysAgo: number }
> = {
  precision: { industry: "metal", fit: "strong", employees: 140, createdDaysAgo: 95 },
  castings: { industry: "metal", fit: "strong", employees: 320, createdDaysAgo: 70 },
  plastics: { industry: "plastics", fit: "strong", employees: 210, createdDaysAgo: 30 },
  valves: { industry: "machinery", fit: "medium", employees: 180, createdDaysAgo: 22 },
  packaging: { industry: "packaging", fit: "medium", employees: 260, createdDaysAgo: 26 },
  springs: { industry: "metal", fit: "strong", employees: 60, createdDaysAgo: 150 },
  pumps: { industry: "machinery", fit: "strong", employees: 400, createdDaysAgo: 55 },
  optics: { industry: "optics", fit: "medium", employees: 90, createdDaysAgo: 6 },
  furniture: { industry: "furniture", fit: "weak", employees: 150, createdDaysAgo: 120 },
  coatings: { industry: "surface", fit: "strong", employees: 75, createdDaysAgo: 180 },
  gears: { industry: "machinery", fit: "medium", employees: 230, createdDaysAgo: 165 },
  molds: { industry: "plastics", fit: "weak", employees: 45, createdDaysAgo: 130 },
};

const CONTACT_FACTS: Record<
  ContactKey,
  {
    organization?: OrganizationKey;
    investor?: InvestorKey;
    role?: string;
    createdDaysAgo: number;
    linkedin?: boolean;
  }
> = {
  precisionQm: { organization: "precision", role: "champion", createdDaysAgo: 94 },
  precisionCeo: { organization: "precision", role: "decisionMaker", createdDaysAgo: 60 },
  castingsQm: { organization: "castings", role: "champion", createdDaysAgo: 69, linkedin: true },
  castingsPlant: { organization: "castings", role: "decisionMaker", createdDaysAgo: 40 },
  plasticsOps: { organization: "plastics", role: "champion", createdDaysAgo: 29 },
  plasticsCeo: { organization: "plastics", role: "decisionMaker", createdDaysAgo: 12, linkedin: true },
  valvesQm: { organization: "valves", role: "evaluator", createdDaysAgo: 21 },
  packagingOps: {
    organization: "packaging",
    role: "decisionMaker",
    createdDaysAgo: 25,
    linkedin: true,
  },
  springsCeo: { organization: "springs", role: "decisionMaker", createdDaysAgo: 148 },
  pumpsQm: { organization: "pumps", role: "champion", createdDaysAgo: 54 },
  pumpsIt: { organization: "pumps", role: "evaluator", createdDaysAgo: 18 },
  opticsQm: { organization: "optics", role: "champion", createdDaysAgo: 5, linkedin: true },
  furnitureOps: { organization: "furniture", role: "decisionMaker", createdDaysAgo: 118 },
  coatingsCeo: { organization: "coatings", role: "decisionMaker", createdDaysAgo: 178 },
  seedPartner: { investor: "seedFund", createdDaysAgo: 200 },
  seedAssociate: { investor: "seedFund", createdDaysAgo: 120 },
  angel: { investor: "angel", createdDaysAgo: 340 },
  syndicateLead: { investor: "syndicate", createdDaysAgo: 15, linkedin: true },
  ventureVp: { investor: "ventureFund", createdDaysAgo: 90, linkedin: true },
  corporatePrincipal: { investor: "corporate", createdDaysAgo: 35, linkedin: true },
};

type DealFacts = {
  organization: OrganizationKey;
  contacts: ContactKey[];
  stage: string;
  source: string;
  lines: number;
  price: number;
  createdDaysAgo: number;
  close: number;
  next?: number;
  /** The pilot period as story days, start and end included. */
  pilot?: readonly [number, number];
  lost?: string;
  history?: Array<{ daysAgo: number; stage: string }>;
};

const DEAL_FACTS: Record<DealKey, DealFacts> = {
  precisionRollout: {
    organization: "precision",
    contacts: ["precisionQm", "precisionCeo"],
    stage: "decision",
    source: "founderNetwork",
    lines: 3,
    price: 6000,
    createdDaysAgo: 90,
    close: 14,
    next: 3,
    pilot: [-30, -5],
    history: [
      { daysAgo: 70, stage: "conversation" },
      { daysAgo: 50, stage: "demo" },
      { daysAgo: 30, stage: "pilot" },
      { daysAgo: 4, stage: "decision" },
    ],
  },
  castingsPilot: {
    organization: "castings",
    contacts: ["castingsQm", "castingsPlant"],
    stage: "pilot",
    source: "linkedin",
    lines: 2,
    price: 6000,
    createdDaysAgo: 68,
    close: 30,
    next: 5,
    pilot: [-16, 12],
    history: [
      { daysAgo: 55, stage: "conversation" },
      { daysAgo: 35, stage: "demo" },
      { daysAgo: 16, stage: "pilot" },
    ],
  },
  plasticsPlatform: {
    organization: "plastics",
    contacts: ["plasticsOps", "plasticsCeo"],
    stage: "demo",
    source: "inbound",
    lines: 4,
    price: 6000,
    createdDaysAgo: 28,
    close: 45,
    next: 2,
    history: [
      { daysAgo: 20, stage: "conversation" },
      { daysAgo: 9, stage: "demo" },
    ],
  },
  valvesInspection: {
    organization: "valves",
    contacts: ["valvesQm"],
    stage: "identified",
    source: "event",
    lines: 2,
    price: 4800,
    createdDaysAgo: 20,
    close: 60,
    next: 6,
  },
  packagingLines: {
    organization: "packaging",
    contacts: ["packagingOps"],
    stage: "demo",
    source: "linkedin",
    lines: 2,
    price: 7500,
    createdDaysAgo: 24,
    close: 50,
    next: 0,
    pilot: [10, 37],
    history: [
      { daysAgo: 15, stage: "conversation" },
      { daysAgo: 3, stage: "demo" },
    ],
  },
  springsStarter: {
    organization: "springs",
    contacts: ["springsCeo"],
    stage: "won",
    source: "investorIntro",
    lines: 2,
    price: 3600,
    createdDaysAgo: 140,
    close: -20,
    history: [
      { daysAgo: 110, stage: "conversation" },
      { daysAgo: 80, stage: "demo" },
      { daysAgo: 45, stage: "decision" },
    ],
  },
  pumpsQuality: {
    organization: "pumps",
    contacts: ["pumpsQm", "pumpsIt"],
    stage: "pilot",
    source: "inbound",
    lines: 3,
    price: 7000,
    createdDaysAgo: 52,
    close: 25,
    next: 4,
    pilot: [6, 34],
    history: [
      { daysAgo: 40, stage: "conversation" },
      { daysAgo: 28, stage: "demo" },
      { daysAgo: 12, stage: "pilot" },
    ],
  },
  opticsAudit: {
    organization: "optics",
    contacts: ["opticsQm"],
    stage: "identified",
    source: "linkedin",
    lines: 2,
    price: 7000,
    createdDaysAgo: 4,
    close: 90,
    next: 7,
  },
  furnitureRollout: {
    organization: "furniture",
    contacts: ["furnitureOps"],
    stage: "lost",
    source: "event",
    lines: 2,
    price: 4200,
    createdDaysAgo: 115,
    close: -35,
    lost: "timing",
    history: [
      { daysAgo: 95, stage: "conversation" },
      { daysAgo: 70, stage: "demo" },
      { daysAgo: 50, stage: "pilot" },
    ],
  },
  coatingsPilot: {
    organization: "coatings",
    contacts: ["coatingsCeo"],
    stage: "won",
    source: "founderNetwork",
    lines: 1,
    price: 6000,
    createdDaysAgo: 175,
    close: -55,
    pilot: [-110, -82],
    history: [
      { daysAgo: 150, stage: "conversation" },
      { daysAgo: 120, stage: "demo" },
      { daysAgo: 80, stage: "decision" },
    ],
  },
  castingsSecondPlant: {
    organization: "castings",
    contacts: ["castingsPlant"],
    stage: "identified",
    source: "founderNetwork",
    lines: 2,
    price: 5000,
    createdDaysAgo: 8,
    close: 120,
    next: 14,
  },
  coatingsExpansion: {
    organization: "coatings",
    contacts: ["coatingsCeo"],
    stage: "conversation",
    source: "founderNetwork",
    lines: 3,
    price: 6000,
    createdDaysAgo: 18,
    close: 40,
    next: 9,
    history: [{ daysAgo: 7, stage: "conversation" }],
  },
  gearsInspection: {
    organization: "gears",
    contacts: [],
    stage: "won",
    source: "event",
    lines: 2,
    price: 8000,
    createdDaysAgo: 155,
    close: -100,
    history: [
      { daysAgo: 140, stage: "conversation" },
      { daysAgo: 125, stage: "demo" },
      { daysAgo: 112, stage: "decision" },
    ],
  },
  moldsPilot: {
    organization: "molds",
    contacts: [],
    stage: "lost",
    source: "linkedin",
    lines: 1,
    price: 5000,
    createdDaysAgo: 125,
    close: -75,
    lost: "competitor",
    history: [
      { daysAgo: 110, stage: "conversation" },
      { daysAgo: 95, stage: "demo" },
      { daysAgo: 85, stage: "pilot" },
    ],
  },
  springsExpansion: {
    organization: "springs",
    contacts: ["springsCeo"],
    stage: "conversation",
    source: "founderNetwork",
    lines: 4,
    price: 6000,
    createdDaysAgo: 16,
    close: 35,
    next: -1,
    history: [{ daysAgo: 12, stage: "conversation" }],
  },
};

const INVESTOR_FACTS: Record<
  InvestorKey,
  {
    firmType: string;
    status: string;
    ticket: number;
    lead?: boolean;
    introBy?: InvestorKey | ContactKey;
    last?: number;
    /** The next meeting: story day and local time. */
    meeting?: readonly [number, string];
    contacts: ContactKey[];
    createdDaysAgo: number;
    history?: Array<{ daysAgo: number; status: string }>;
  }
> = {
  seedFund: {
    firmType: "seedFund",
    status: "followUp",
    ticket: 750000,
    lead: true,
    introBy: "angel",
    last: -6,
    meeting: [8, "09:30"],
    contacts: ["seedPartner", "seedAssociate"],
    createdDaysAgo: 200,
    history: [
      { daysAgo: 150, status: "introRequested" },
      { daysAgo: 60, status: "firstMeeting" },
    ],
  },
  angel: {
    firmType: "angel",
    status: "committed",
    ticket: 50000,
    last: -20,
    meeting: [11, "17:00"],
    contacts: ["angel"],
    createdDaysAgo: 340,
    history: [{ daysAgo: 40, status: "followUp" }],
  },
  techAngel: {
    firmType: "angel",
    status: "committed",
    ticket: 75000,
    introBy: "precisionCeo",
    last: -9,
    meeting: [13, "12:00"],
    contacts: [],
    createdDaysAgo: 70,
    history: [
      { daysAgo: 50, status: "firstMeeting" },
      { daysAgo: 25, status: "followUp" },
    ],
  },
  syndicate: {
    firmType: "syndicate",
    status: "toContact",
    ticket: 150000,
    meeting: [12, "18:30"],
    contacts: ["syndicateLead"],
    createdDaysAgo: 15,
  },
  regionalFund: {
    firmType: "seedFund",
    status: "introRequested",
    ticket: 250000,
    introBy: "angel",
    contacts: [],
    createdDaysAgo: 11,
    history: [{ daysAgo: 4, status: "toContact" }],
  },
  ventureFund: {
    firmType: "ventureFund",
    status: "followUp",
    ticket: 500000,
    introBy: "seedPartner",
    last: -45,
    contacts: ["ventureVp"],
    createdDaysAgo: 90,
    history: [{ daysAgo: 45, status: "firstMeeting" }],
  },
  corporate: {
    firmType: "corporate",
    status: "firstMeeting",
    ticket: 300000,
    last: -3,
    meeting: [9, "08:30"],
    contacts: ["corporatePrincipal"],
    createdDaysAgo: 35,
    history: [{ daysAgo: 3, status: "introRequested" }],
  },
  secondSeed: {
    firmType: "seedFund",
    status: "passed",
    ticket: 400000,
    last: -60,
    contacts: [],
    createdDaysAgo: 100,
    history: [{ daysAgo: 60, status: "firstMeeting" }],
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
  sendSecurityAnswers: {
    status: "inProgress",
    priority: "high",
    due: 2,
    deal: "pumpsQuality",
    contact: "pumpsIt",
    createdDaysAgo: 3,
  },
  prepareDecisionCall: {
    status: "open",
    priority: "high",
    due: 2,
    deal: "precisionRollout",
    contact: "precisionCeo",
    createdDaysAgo: 2,
  },
  pilotReview: {
    status: "open",
    priority: "medium",
    due: 4,
    deal: "castingsPilot",
    contact: "castingsQm",
    createdDaysAgo: 5,
  },
  plasticsDemo: {
    status: "inProgress",
    priority: "high",
    due: 0,
    deal: "plasticsPlatform",
    contact: "plasticsOps",
    createdDaysAgo: 6,
  },
  packagingRecap: {
    status: "done",
    priority: "medium",
    due: -2,
    deal: "packagingLines",
    contact: "packagingOps",
    createdDaysAgo: 4,
    done: 2,
  },
  valvesIntro: {
    status: "open",
    priority: "medium",
    due: 6,
    deal: "valvesInspection",
    contact: "valvesQm",
    createdDaysAgo: 9,
  },
  opticsFollowUp: {
    status: "open",
    priority: "low",
    due: 7,
    deal: "opticsAudit",
    contact: "opticsQm",
    createdDaysAgo: 1,
  },
  investorUpdate: { status: "open", priority: "medium", due: -3, contact: "angel", createdDaysAgo: 10 },
  metricsForSeedFund: { status: "open", priority: "high", due: -1, contact: "seedAssociate", createdDaysAgo: 5 },
  springsOnboarding: {
    status: "done",
    priority: "medium",
    due: -14,
    deal: "springsStarter",
    contact: "springsCeo",
    createdDaysAgo: 19,
    done: 15,
  },
};

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

const INBOX_PLANS: ReadonlyArray<InboxThreadPlan & { key: InboxKey }> = [
  {
    key: "plasticsDemo",
    account: "google",
    with: ["plasticsOps"],
    state: "unread",
    latestMinutesAgo: 25,
    speakers: ["self", "plasticsOps", "self", "plasticsOps"],
    links: ["deal:plasticsPlatform", "organization:plastics"],
  },
  {
    key: "syndicatePitch",
    account: "linkedin",
    with: ["syndicateLead"],
    state: "unread",
    latestMinutesAgo: 75,
    speakers: ["syndicateLead", "self", "syndicateLead", "self"],
    draft: true,
    links: ["investor:syndicate"],
  },
  {
    key: "springsLines",
    account: "google",
    with: ["springsCeo"],
    state: "open",
    latestMinutesAgo: 6 * 60,
    speakers: ["self", "springsCeo", "self", "springsCeo"],
    links: ["deal:springsExpansion", "organization:springs"],
  },
  {
    key: "angelUpdate",
    account: "google",
    with: ["angel"],
    state: "open",
    latestMinutesAgo: 9 * 60,
    speakers: ["angel", "self", "angel", "self"],
    draft: true,
    links: ["investor:angel"],
  },
  {
    key: "valvesPlan",
    account: "google",
    with: ["valvesQm"],
    state: "open",
    latestMinutesAgo: 20 * 60,
    speakers: ["valvesQm", "self", "valvesQm", "self"],
    draft: true,
    links: ["deal:valvesInspection", "organization:valves"],
  },
  {
    key: "seedMetrics",
    account: "google",
    with: ["seedAssociate"],
    state: "open",
    latestMinutesAgo: 30 * 60,
    speakers: ["seedAssociate", "self", "seedAssociate"],
    links: ["investor:seedFund"],
  },
  {
    key: "plasticsCeo",
    account: "linkedin",
    with: ["plasticsCeo"],
    state: "open",
    latestMinutesAgo: 50 * 60,
    speakers: ["plasticsCeo", "self", "plasticsCeo"],
    links: ["deal:plasticsPlatform"],
  },
  {
    key: "castingsPlant",
    account: "google",
    with: ["castingsPlant"],
    state: "open",
    latestMinutesAgo: 4 * 24 * 60,
    speakers: ["castingsPlant", "self", "castingsPlant", "self"],
    links: ["deal:castingsPilot", "organization:castings"],
  },
  {
    key: "coatingsUsage",
    account: "google",
    with: ["coatingsCeo"],
    state: "open",
    latestMinutesAgo: 5 * 24 * 60,
    speakers: ["coatingsCeo", "self", "coatingsCeo", "self"],
    links: ["deal:coatingsExpansion", "organization:coatings"],
  },
  {
    key: "corporateCoffee",
    account: "linkedin",
    with: ["corporatePrincipal"],
    state: "open",
    latestMinutesAgo: 6 * 24 * 60 + 12 * 60,
    speakers: ["corporatePrincipal", "self", "corporatePrincipal", "self"],
    links: ["investor:corporate"],
  },
  {
    key: "ventureCatchUp",
    account: "linkedin",
    with: ["ventureVp"],
    state: "open",
    latestMinutesAgo: 11 * 24 * 60,
    speakers: ["ventureVp", "self", "ventureVp", "self"],
    links: ["investor:ventureFund"],
  },
];

const DEAL_AGENT_NOTES: Partial<Record<DealKey, AgentNoteKey>> = {
  packagingLines: "packagingDemo",
  precisionRollout: "precisionBrief",
  valvesInspection: "valvesImport",
  coatingsExpansion: "coatingsUsage",
};
const TASK_AGENT_NOTES: Partial<Record<TaskKey, AgentNoteKey>> = { investorUpdate: "investorUpdateTask" };
const INVESTOR_AGENT_NOTES: Partial<Record<InvestorKey, AgentNoteKey>> = { seedFund: "seedFundPrep" };

const AGENT_EDITS: Record<string, AgentKeyName> = {
  "deal:packagingLines": "Claude Desktop",
  "task:investorUpdate": "Claude Desktop",
  "deal:precisionRollout": "ChatGPT",
  "investor:seedFund": "ChatGPT",
  "deal:valvesInspection": "Codex CLI",
  "deal:coatingsExpansion": "Codex CLI",
};

export default defineSolution<Strings>({
  id: "startups",
  strings: { en, de, es, pt, pl, nl },
  story: {
    en: { currency: "USD", timeZone: "America/Chicago" },
    de: { currency: "EUR", timeZone: "Europe/Berlin" },
    es: { currency: "EUR", timeZone: "Europe/Madrid" },
    pt: { currency: "BRL", timeZone: "America/Sao_Paulo" },
    pl: { currency: "PLN", timeZone: "Europe/Warsaw" },
    nl: { currency: "EUR", timeZone: "Europe/Amsterdam" },
  },
  build: (t, locale) => {
    const agentNote = (key?: AgentNoteKey): Record<string, string[]> => (key ? { notes: t.agentNotes[key] } : {});
    const phone = (index: number) => phoneNumber(t.phones.mobile, index);
    const open = ["identified", "conversation", "demo", "pilot", "decision"];
    const label = <K extends string>(
      options: Record<K, string>,
      colors: Record<K, "default" | "secondary" | "destructive" | "success" | "warning" | "info">,
    ) => (Object.keys(options) as K[]).map((key) => ({ key, label: options[key], color: colors[key] }));

    const organization: RecordSpec[] = ORGANIZATIONS.map((key) => {
      const facts = ORGANIZATION_FACTS[key];
      const [name, city, domain] = t.organizations[key];
      const [street, postalCode, region, lat, lon] = t.addresses[key];
      return {
        key,
        values: {
          name,
          industry: facts.industry,
          fit: facts.fit,
          address: address({ street, postalCode, city, region, countryCode: t.countryCode, lat, lon }),
          website: `https://${domain}`,
          employees: facts.employees,
        },
        owner: "maxBergmann",
        channels: { email: `info@${domain}` },
        createdDaysAgo: facts.createdDaysAgo,
      };
    });
    const contact: RecordSpec[] = CONTACTS.map((key, index) => {
      const facts = CONTACT_FACTS[key];
      const [firstName, lastName, jobTitle] = t.contacts[key];
      const domain = facts.organization
        ? t.organizations[facts.organization][2]
        : t.investorDomains[facts.investor ?? "seedFund"];
      const handle = `${mailbox(firstName)}-${mailbox(lastName)}`;
      return {
        key,
        values: {
          firstName,
          lastName,
          jobTitle,
          ...(facts.role ? { buyingRole: facts.role } : {}),
        },
        links: facts.organization ? { "contact.organizations": facts.organization } : undefined,
        owner: "maxBergmann",
        channels: {
          email: `${mailbox(firstName)}.${mailbox(lastName)}@${domain}`,
          phone: phone(index),
          ...(facts.linkedin
            ? { linkedin: `${handle}.linkedin.example`, linkedinUrl: `https://linkedin.example/in/${handle}` }
            : {}),
        },
        createdDaysAgo: facts.createdDaysAgo,
      };
    });
    const deal: RecordSpec[] = DEALS.map((key) => {
      const facts = DEAL_FACTS[key];
      const [name, nextStep] = t.deals[key];
      const closed = facts.stage === "won" || facts.stage === "lost";
      const moves = facts.history ?? [];
      return {
        key,
        values: {
          name,
          stage: facts.stage,
          source: facts.source,
          productionLines: facts.lines,
          pricePerLine: facts.price,
          closeDate: day(facts.close),
          nextStep,
          ...(facts.next === undefined ? {} : { nextStepDate: day(facts.next) }),
          ...(facts.pilot ? { pilotPeriod: range(facts.pilot[0], facts.pilot[1]) } : {}),
          ...(facts.lost ? { lostReason: facts.lost } : {}),
          ...agentNote(DEAL_AGENT_NOTES[key]),
        },
        links: { "deal.organizations": facts.organization, "deal.contacts": facts.contacts },
        owner: "maxBergmann",
        createdDaysAgo: facts.createdDaysAgo,
        history: [
          ...moves.map((change, index) => ({
            daysAgo: change.daysAgo,
            previous: { stage: index === 0 ? "identified" : moves[index - 1].stage },
          })),
          ...(closed ? [{ daysAgo: -facts.close, previous: { stage: moves.at(-1)?.stage ?? "decision" } }] : []),
        ],
      };
    });
    const investor: RecordSpec[] = INVESTORS.map((key) => {
      const facts = INVESTOR_FACTS[key];
      const [name, focus, notes] = t.investors[key];
      const intro = facts.introBy;
      const introBy =
        intro === undefined
          ? undefined
          : intro in t.investors
            ? t.investors[intro as InvestorKey][0]
            : `${t.contacts[intro as ContactKey][0]} ${t.contacts[intro as ContactKey][1]}`;
      return {
        key,
        values: {
          name,
          firmType: facts.firmType,
          roundStatus: facts.status,
          ticketSize: facts.ticket,
          leadInvestor: facts.lead === true,
          ...(introBy ? { introBy } : {}),
          focus,
          notes: INVESTOR_AGENT_NOTES[key] ? [notes, "", ...t.agentNotes[INVESTOR_AGENT_NOTES[key]]] : notes,
          ...(facts.last === undefined ? {} : { lastConversation: day(facts.last) }),
          ...(facts.meeting ? { nextMeeting: at(facts.meeting[0], facts.meeting[1]) } : {}),
        },
        links: facts.contacts.length ? { "investor.contact": facts.contacts } : undefined,
        owner: "maxBergmann",
        createdDaysAgo: facts.createdDaysAgo,
        history: (facts.history ?? []).map((change) => ({
          daysAgo: change.daysAgo,
          previous: { roundStatus: change.status },
        })),
      };
    });
    const task: RecordSpec[] = TASKS.map((key) => {
      const facts = TASK_FACTS[key];
      const organizationKey = facts.organization ?? (facts.deal ? DEAL_FACTS[facts.deal].organization : undefined);
      return {
        key,
        values: {
          name: t.tasks[key],
          status: facts.status,
          priority: facts.priority,
          dueDate: day(facts.due),
          ...agentNote(TASK_AGENT_NOTES[key]),
        },
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
      key: keyof Strings["files"],
      record: string,
      kind: FileSpec["kind"],
      uploadedDaysAgo: number,
    ): FileSpec => {
      const spec = t.files[key];
      return {
        key,
        record,
        field: `${record.split(":")[0]}.documents`,
        name: spec.name,
        kind,
        ...("rows" in spec ? { rows: spec.rows } : { lines: spec.lines }),
        uploadedDaysAgo,
      };
    };
    const files: FileSpec[] = [
      file("questionnaire", "deal:pumpsQuality", "xlsx", 2),
      file("pilotAgreement", "deal:castingsPilot", "pdf", 18),
      file("pricing", "deal:precisionRollout", "pdf", 3),
      file("termSheet", "investor:seedFund", "pdf", 6),
      file("onePager", "investor:seedFund", "pdf", 9),
    ];

    return {
      workspaceName: t.workspaceName,
      valueLabels: { value: t.fields.dealValue, weighted: t.fields.weightedValue },
      companyName: t.company,
      lists: (["organization", "contact", "deal", "investor", "task"] as const).map((key) => ({
        key,
        label: t.lists[key][0],
        pluralLabel: t.lists[key][1],
        description: t.lists[key][2],
        icon: { organization: "building", contact: "contact", deal: "handshake", investor: "coins", task: "check" }[
          key
        ],
      })),
      fields: [
        {
          key: "organization.industry",
          label: t.fields.industry,
          type: "select",
          options: label(t.options.industry, {
            metal: "default",
            plastics: "info",
            machinery: "secondary",
            packaging: "warning",
            optics: "info",
            furniture: "secondary",
            surface: "success",
          }),
        },
        {
          key: "organization.fit",
          label: t.fields.fit,
          type: "select",
          options: label(t.options.fit, { strong: "success", medium: "info", weak: "secondary" }),
        },
        { key: "organization.address", label: t.fields.address, type: "address" },
        { key: "organization.website", label: t.fields.website, type: "url" },
        { key: "organization.employees", label: t.fields.employees, type: "number" },
        { key: "contact.jobTitle", label: t.fields.jobTitle, type: "text" },
        {
          key: "contact.buyingRole",
          label: t.fields.buyingRole,
          type: "select",
          options: label(t.options.buyingRole, {
            champion: "success",
            decisionMaker: "warning",
            evaluator: "info",
            user: "secondary",
          }),
        },
        {
          key: "deal.source",
          label: t.fields.source,
          type: "select",
          options: label(t.options.source, {
            founderNetwork: "success",
            inbound: "info",
            linkedin: "info",
            event: "warning",
            investorIntro: "secondary",
          }),
        },
        { key: "deal.productionLines", label: t.fields.productionLines, type: "number" },
        { key: "deal.pricePerLine", label: t.fields.pricePerLine, type: "currency" },
        { key: "deal.closeDate", label: t.fields.closeDate, type: "date" },
        { key: "deal.nextStep", label: t.fields.nextStep, type: "text" },
        { key: "deal.nextStepDate", label: t.fields.nextStepDate, type: "date" },
        { key: "deal.pilotPeriod", label: t.fields.pilotPeriod, type: "dateRange" },
        { key: "deal.documents", label: t.fields.documents, type: "file" },
        {
          key: "deal.lostReason",
          label: t.fields.lostReason,
          type: "select",
          options: label(t.options.lostReason, {
            timing: "info",
            budget: "warning",
            inHouse: "secondary",
            competitor: "destructive",
          }),
        },
        {
          key: "investor.firmType",
          label: t.fields.firmType,
          type: "select",
          options: label(t.options.firmType, {
            angel: "success",
            syndicate: "info",
            seedFund: "warning",
            ventureFund: "secondary",
            corporate: "default",
          }),
        },
        {
          key: "investor.roundStatus",
          label: t.fields.roundStatus,
          type: "select",
          options: label(t.options.roundStatus, {
            toContact: "secondary",
            introRequested: "info",
            firstMeeting: "info",
            followUp: "warning",
            committed: "success",
            passed: "destructive",
          }),
        },
        { key: "investor.ticketSize", label: t.fields.ticketSize, type: "currency" },
        { key: "investor.leadInvestor", label: t.fields.leadInvestor, type: "boolean" },
        { key: "investor.introBy", label: t.fields.introBy, type: "text" },
        { key: "investor.lastConversation", label: t.fields.lastConversation, type: "date" },
        { key: "investor.nextMeeting", label: t.fields.nextMeeting, type: "dateTime" },
        { key: "investor.documents", label: t.fields.documents, type: "file" },
        { key: "investor.focus", label: t.fields.focus, type: "text" },
        { key: "task.dueDate", label: t.fields.dueDate, type: "date" },
        {
          key: "task.priority",
          label: t.fields.priority,
          type: "select",
          options: label(t.options.priority, { low: "secondary", medium: "info", high: "destructive" }),
        },
      ],
      stages: [
        { key: "identified", label: t.stages.identified, color: "secondary", probability: 5 },
        { key: "conversation", label: t.stages.conversation, color: "info", probability: 15 },
        { key: "demo", label: t.stages.demo, color: "info", probability: 30 },
        { key: "pilot", label: t.stages.pilot, color: "warning", probability: 50 },
        { key: "decision", label: t.stages.decision, color: "warning", probability: 70 },
        { key: "won", label: t.stages.won, color: "success", probability: 100 },
        { key: "lost", label: t.stages.lost, color: "destructive", probability: 0 },
      ],
      relationships: [
        {
          key: "investor.contact",
          source: "investor",
          target: "contact",
          sourceCardinality: "many",
          targetCardinality: "one",
        },
      ],
      records: agentEdited({ organization, contact, deal, investor, task }, AGENT_EDITS),
      views: [
        {
          key: "pipeline",
          list: "deal",
          name: t.views.pipeline,
          mode: "board",
          groupBy: "stage",
          columns: ["totalValue", "weightedValue", "deal.organizations", "nextStepDate"],
          filters: [{ field: "stage", notIn: ["lost"] }],
        },
        {
          key: "seedRound",
          list: "investor",
          name: t.views.seedRound,
          mode: "board",
          groupBy: "roundStatus",
          columns: ["ticketSize", "firmType", "leadInvestor", "nextMeeting"],
        },
        {
          key: "nextSteps",
          list: "deal",
          name: t.views.nextSteps,
          mode: "table",
          columns: [
            "stage",
            "nextStep",
            "nextStepDate",
            "productionLines",
            "totalValue",
            "deal.organizations",
            "deal.contacts",
          ],
          filters: [{ field: "stage", in: open }],
          sort: { field: "nextStepDate", direction: "asc" },
        },
        {
          key: "investors",
          list: "investor",
          name: t.views.investors,
          mode: "table",
          columns: ["roundStatus", "ticketSize", "firmType", "nextMeeting", "lastConversation", "investor.contact"],
          filters: [{ field: "roundStatus", notIn: ["passed"] }],
          sort: { field: "nextMeeting", direction: "asc" },
        },
        {
          key: "dueSoon",
          list: "task",
          name: t.views.dueSoon,
          mode: "table",
          columns: ["dueDate", "status", "priority", "task.deals", "task.contacts"],
          filters: [{ field: "status", notIn: ["done", "archived"] }],
          sort: { field: "dueDate", direction: "asc" },
        },
        {
          key: "pilots",
          list: "deal",
          name: t.views.pilots,
          mode: "calendar",
          calendar: { date: "pilotPeriod", color: "stage", mode: "month" },
          columns: ["stage", "totalValue", "deal.organizations"],
        },
      ],
      dashboard: {
        widgets: [
          {
            kind: "kpi",
            title: t.widgets.openPipeline,
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
            title: t.widgets.committed,
            list: "investor",
            aggregation: "sum",
            field: "ticketSize",
            filters: [{ field: "roundStatus", in: ["committed"] }],
          },
          {
            kind: "chart",
            title: t.widgets.byStage,
            display: DisplayType.funnelChart,
            list: "deal",
            aggregation: "count",
            groupBy: { field: "stage" },
            filters: [{ field: "stage", in: open }],
          },
          {
            kind: "calendar",
            title: t.widgets.meetings,
            list: "investor",
            layout: "upcoming",
            date: "nextMeeting",
            days: 14,
            amount: "ticketSize",
            filters: [{ field: "roundStatus", notIn: ["passed"] }],
          },
          {
            kind: "chart",
            title: t.widgets.seedRound,
            display: DisplayType.doughnutChart,
            list: "investor",
            aggregation: "count",
            groupBy: { field: "roundStatus" },
          },
          {
            kind: "chart",
            title: t.widgets.newByMonth,
            display: DisplayType.areaChart,
            list: "deal",
            aggregation: "count",
            groupBy: { month: "system:createdAt" },
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
            title: t.widgets.byAccount,
            display: DisplayType.rankedTable,
            list: "deal",
            aggregation: "sum",
            field: "totalValue",
            groupBy: { relation: "deal.organizations" },
            filters: [{ field: "stage", in: ["demo", "pilot", "decision"] }],
          },
        ],
      },
      wiki: [
        { key: "guide", kind: "guide", title: t.wiki.guide.title, markdown: t.wiki.guide.markdown },
        { key: "process", kind: "knowledge", title: t.wiki.process.title, markdown: t.wiki.process.markdown },
        {
          key: "afterDemo",
          kind: "procedure",
          title: t.wiki.afterDemo.title,
          whenToUse: t.wiki.afterDemo.whenToUse,
          markdown: t.wiki.afterDemo.markdown,
        },
        { key: "mcp", kind: "knowledge", title: t.mcp.title, markdown: t.mcp.markdown },
        agentsPage(locale, t.agents),
      ],
      dealValue: { kind: "product", left: "deal.productionLines", right: "deal.pricePerLine" },
      files,
      planner: {
        sources: [
          {
            list: "investor",
            date: "nextMeeting",
            filters: [{ field: "roundStatus", notIn: ["passed"] }],
            color: "info",
          },
          { list: "deal", date: "pilotPeriod", color: "warning" },
          { list: "deal", date: "closeDate", filters: [{ field: "stage", in: open }], color: "success" },
        ],
        connectedCalendar: true,
        mode: "month",
      },
      trash: [
        { list: "contact", name: t.trash.contact, daysAgo: 4 },
        { list: "deal", name: t.trash.deal, daysAgo: 12 },
      ],
      mateChats: [
        {
          title: t.mateChat.title,
          endedHoursAgo: 20,
          messages: [
            { role: "user", text: t.mateChat.messages[0] },
            { role: "assistant", text: t.mateChat.messages[1] },
          ],
        },
        {
          title: t.mateChatPlant.title,
          endedHoursAgo: 192,
          messages: [
            { role: "user", text: t.mateChatPlant.messages[0] },
            { role: "assistant", text: t.mateChatPlant.messages[1] },
          ],
        },
      ],
      webhooks: [
        {
          key: "onboarding",
          description: t.webhooks.onboarding,
          url: t.webhooks.onboardingUrl,
          enabled: true,
          lists: ["deal"],
          createdDaysAgo: 60,
          deliveries: 3,
        },
      ],
      apiKeys: agentApiKeys([40, 26, 11]),
      routines: [
        {
          key: "demoRecap",
          name: t.routines.demoRecap.name,
          task: t.routines.demoRecap.task,
          trigger: {
            kind: "event",
            events: ["record.updated"],
            lists: ["deal"],
            debounceSeconds: 600,
            sample: { record: "deal:packagingLines" },
          },
          runs: [
            {
              status: "succeeded",
              startedHoursAgo: 70,
              durationSeconds: 64,
              credits: 9,
              summary: t.routines.demoRecap.runs[0],
            },
            {
              status: "succeeded",
              startedHoursAgo: 190,
              durationSeconds: 21,
              credits: 3,
              summary: t.routines.demoRecap.runs[1],
            },
            {
              status: "failed",
              startedHoursAgo: 215,
              durationSeconds: 11,
              credits: 1,
              error: "providerUnavailable",
              note: t.routines.demoRecap.runs[2],
            },
          ],
        },
        {
          key: "investorUpdate",
          name: t.routines.investorUpdate.name,
          task: t.routines.investorUpdate.task,
          trigger: { kind: "schedule", cron: "0 9 1 * *" },
          runs: [
            {
              status: "succeeded",
              startedHoursAgo: 530,
              durationSeconds: 142,
              credits: 21,
              summary: t.routines.investorUpdate.runs[0],
            },
            {
              status: "succeeded",
              startedHoursAgo: 1262,
              durationSeconds: 128,
              credits: 19,
              summary: t.routines.investorUpdate.runs[1],
            },
          ],
        },
        {
          key: "dueFollowUps",
          name: t.routines.dueFollowUps.name,
          task: t.routines.dueFollowUps.task,
          trigger: { kind: "schedule", cron: "0 8 * * 1-5" },
          runs: [
            {
              status: "succeeded",
              startedHoursAgo: 30,
              durationSeconds: 96,
              credits: 14,
              summary: t.routines.dueFollowUps.runs[0],
            },
            {
              status: "succeeded",
              startedHoursAgo: 54,
              durationSeconds: 71,
              credits: 10,
              summary: t.routines.dueFollowUps.runs[1],
            },
            {
              status: "succeeded",
              startedHoursAgo: 78,
              durationSeconds: 18,
              credits: 3,
              summary: t.routines.dueFollowUps.runs[2],
            },
          ],
        },
        {
          key: "newMailTask",
          name: t.routines.newMailTask.name,
          task: t.routines.newMailTask.task,
          trigger: { kind: "event", events: ["messaging.email.received"], debounceSeconds: 300, sample: { thread: 1 } },
          runs: [
            {
              status: "succeeded",
              startedHoursAgo: 71,
              durationSeconds: 43,
              credits: 6,
              summary: t.routines.newMailTask.runs[0],
            },
            {
              status: "succeeded",
              startedHoursAgo: 150,
              durationSeconds: 22,
              credits: 3,
              summary: t.routines.newMailTask.runs[1],
            },
            {
              status: "succeeded",
              startedHoursAgo: 220,
              durationSeconds: 14,
              credits: 2,
              summary: t.routines.newMailTask.runs[2],
            },
          ],
        },
      ],
      messaging: {
        accounts: ["google", "linkedin"],
        selfTitle: t.selfTitle,
        website: t.website,
        threads: [
          {
            account: "google",
            with: ["precisionCeo"],
            subject: t.threads.precisionDecision.subject,
            state: "unread",
            latestMinutesAgo: 40,
            messages: [
              { from: "precisionCeo", text: t.threads.precisionDecision.messages[0] },
              { from: "self", text: t.threads.precisionDecision.messages[1] },
              { from: "precisionCeo", text: t.threads.precisionDecision.messages[2] },
              { from: "self", text: t.threads.precisionDecision.messages[3], draft: true },
            ],
            links: ["deal:precisionRollout", "organization:precision"],
          },
          {
            account: "google",
            with: ["pumpsIt"],
            subject: t.threads.pumpsSecurity.subject,
            state: "open",
            latestMinutesAgo: 5 * 60,
            messages: [
              { from: "pumpsIt", text: t.threads.pumpsSecurity.messages[0] },
              { from: "self", text: t.threads.pumpsSecurity.messages[1] },
              { from: "pumpsIt", text: t.threads.pumpsSecurity.messages[2] },
            ],
            links: ["deal:pumpsQuality"],
          },
          {
            account: "linkedin",
            with: ["castingsQm"],
            state: "open",
            latestMinutesAgo: 26 * 60,
            messages: [
              { from: "castingsQm", text: t.threads.castingsPilot.messages[0] },
              { from: "self", text: t.threads.castingsPilot.messages[1] },
              { from: "castingsQm", text: t.threads.castingsPilot.messages[2] },
              {
                from: "self",
                text: t.threads.castingsPilot.messages[3],
                reaction: { from: "castingsQm", value: "👍" },
              },
            ],
            links: ["deal:castingsPilot"],
          },
          {
            account: "linkedin",
            with: ["opticsQm"],
            state: "unread",
            latestMinutesAgo: 3 * 60,
            messages: [
              { from: "opticsQm", text: t.threads.opticsIntro.messages[0] },
              { from: "self", text: t.threads.opticsIntro.messages[1] },
            ],
            links: ["deal:opticsAudit"],
          },
          {
            account: "google",
            with: ["seedPartner"],
            subject: t.threads.seedFundCatchUp.subject,
            state: "open",
            latestMinutesAgo: 2 * 24 * 60,
            messages: [
              { from: "seedPartner", text: t.threads.seedFundCatchUp.messages[0] },
              { from: "self", text: t.threads.seedFundCatchUp.messages[1] },
              { from: "seedPartner", text: t.threads.seedFundCatchUp.messages[2] },
            ],
            links: ["investor:seedFund"],
          },
          {
            account: "linkedin",
            with: ["packagingOps"],
            state: "open",
            latestMinutesAgo: 3 * 24 * 60,
            messages: [
              { from: "packagingOps", text: t.threads.packagingDemo.messages[0] },
              { from: "self", text: t.threads.packagingDemo.messages[1] },
              { from: "packagingOps", text: t.threads.packagingDemo.messages[2] },
            ],
            links: ["deal:packagingLines"],
          },
          ...inboxThreads(INBOX_PLANS, t.inbox),
        ],
        calendar: {
          name: t.calendar.name,
          events: [
            {
              title: t.calendar.events[0],
              with: ["precisionCeo", "precisionQm"],
              startsMinutesAgo: -3 * 24 * 60,
              durationMinutes: 45,
            },
            {
              title: t.calendar.events[1],
              with: ["castingsQm", "castingsPlant"],
              startsMinutesAgo: -5 * 24 * 60,
              durationMinutes: 60,
            },
            { title: t.calendar.events[2], with: ["seedPartner"], startsMinutesAgo: -8 * 24 * 60, durationMinutes: 45 },
            {
              title: t.extraEvents[0],
              with: ["pumpsIt", "pumpsQm"],
              startsMinutesAgo: -(24 * 60 + 2 * 60),
              durationMinutes: 30,
            },
            { title: t.extraEvents[1], with: ["springsCeo"], startsMinutesAgo: -10 * 24 * 60, durationMinutes: 45 },
          ],
        },
      },
    };
  },
});
