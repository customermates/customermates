import { DisplayType } from "@/features/widget/widget-display.schema";

import {
  groupDigits,
  address,
  day,
  defineSolution,
  phoneNumber,
  rangeAt,
  type AddressInput,
  type FileSpec,
  type MessagingProvider,
  type RecordSpec,
} from "../define-solution";
import { agentApiKeys, agentEdited, agentsPage, type AgentKeyName } from "../agent-native";
import { inboxThreads, type InboxThreadPlan } from "../inbox-threads";
import { es } from "./locales/smb.es";
import { pt } from "./locales/smb.pt";
import { pl } from "./locales/smb.pl";
import { nl } from "./locales/smb.nl";

/**
 * Small businesses: a small IT service company that sells support contracts and projects to local offices. The
 * dashboard shows open deals and next actions; a customer record links people, deals and the conversations someone
 * linked to it. Tasks carry a configured due date and status; nothing reminds anyone automatically.
 */

const ORGANIZATIONS = [
  "kessler",
  "brookfield",
  "maple",
  "northgate",
  "riverside",
  "alder",
  "harbourview",
  "summit",
  "willow",
  "cobalt",
  "pinecrest",
  "oakridge",
] as const;
type OrganizationKey = (typeof ORGANIZATIONS)[number];
const CONTACTS = [
  "hannah",
  "david",
  "olivia",
  "james",
  "grace",
  "ethan",
  "sophie",
  "daniel",
  "chloe",
  "ryan",
  "megan",
  "lucas",
  "emma",
  "noah",
  "isla",
  "owen",
  "amelia",
  "liam",
] as const;
type ContactKey = (typeof CONTACTS)[number];
const DEALS = [
  "kesslerSupport",
  "mapleNetwork",
  "northgateRollout",
  "harbourviewSupport",
  "riversideBackup",
  "willowSetup",
  "cobaltSecurity",
  "pinecrestMigration",
  "oakridgeSupport",
  "brookfieldRenewal",
  "alderMigration",
  "summitNetwork",
  "kesslerOnsite",
  "kesslerFirstYear",
  "riversideSupport",
  "alderSupport",
  "cobaltNetwork",
  "brookfieldMigration",
  "summitRenewal",
  "pinecrestSecurity",
] as const;
type DealKey = (typeof DEALS)[number];
const SERVICES = [
  "managedSupport",
  "networkSetup",
  "securityReview",
  "emailMigration",
  "onsiteDay",
  "backupSetup",
] as const;
type ServiceKey = (typeof SERVICES)[number];
const TASKS = [
  "sendRevisedProposal",
  "bookSiteVisit",
  "checkBackupLogs",
  "prepareRenewal",
  "callNorthgate",
  "migrationPlan",
  "securityFindings",
  "onboardingCall",
  "invoiceQuestion",
  "followUpWillow",
  "priceListReview",
  "hotelWalkthrough",
  "mapleInstall",
  "kesslerRoomSetup",
] as const;
type TaskKey = (typeof TASKS)[number];

const en = {
  company: "Harbor Lane IT",
  workspaceName: "Small business",
  website: "https://harborlane-it.example",
  phones: {
    mobile: { templates: ["+1 202 555 01##"], start: 0 },
    office: { templates: ["+1 503 555 01##", "+1 971 555 01##", "+1 541 555 01##"], start: 40 },
  },
  accounts: ["google", "linkedin", "whatsapp", "instagram", "telegram", "outlook"] as MessagingProvider[],
  threadAccounts: { harbourview: "outlook", willow: "instagram", cobalt: "telegram" } as Record<
    "harbourview" | "willow" | "cobalt",
    MessagingProvider
  >,
  archivedFields: [{ key: "organization.oldCustomerNumber", label: "Old customer number" }] as Array<{
    key: string;
    label: string;
  }>,
  selfTitle: "Managing director",
  money: (amount: number) => `$${groupDigits(amount, ",")}`,
  lists: {
    organization: ["Company", "Companies", "Offices and businesses we support or talk to."],
    contact: ["Contact", "Contacts", "People at our customers and prospects."],
    deal: ["Deal", "Deals", "Support contracts and projects we are discussing."],
    service: ["Service", "Services", "Our price list: support contracts, projects and days on site."],
    task: ["Task", "Tasks", "Next actions with an owner and a due date."],
  },
  fields: {
    industry: "Industry",
    customerStatus: "Customer status",
    address: "Address",
    website: "Website",
    employees: "Employees",
    jobTitle: "Job title",
    decisionRole: "Decision role",
    source: "Source",
    closeDate: "Expected close",
    nextStep: "Next step",
    nextStepDate: "Next step date",
    lostReason: "Lost reason",
    dueDate: "Due date",
    priority: "Priority",
    documents: "Documents",
    scheduled: "Scheduled",
  },
  options: {
    industry: {
      healthcare: "Healthcare",
      legal: "Legal",
      architecture: "Architecture",
      finance: "Accounting",
      hospitality: "Hospitality",
      logistics: "Logistics",
      retail: "Retail and food",
      marketing: "Marketing",
      engineering: "Engineering",
      property: "Property",
    },
    customerStatus: { prospect: "Prospect", customer: "Customer", former: "Former customer" },
    decisionRole: { decisionMaker: "Decision maker", influencer: "Influencer", user: "User" },
    source: {
      referral: "Referral",
      website: "Website inquiry",
      event: "Local business event",
      existing: "Existing customer",
    },
    lostReason: { price: "Price", timing: "Timing", inHouse: "Solved in-house" },
    priority: { low: "Low", medium: "Medium", high: "High" },
  },
  stages: {
    new: "New",
    qualified: "Qualified",
    conversation: "Conversation",
    proposal: "Proposal sent",
    won: "Won",
    lost: "Lost",
  },
  organizations: {
    kessler: ["Kessler Dental Practice", "Portland"],
    brookfield: ["Brookfield Architects", "Portland"],
    maple: ["Maple & Finch Law", "Salem"],
    northgate: ["Northgate Logistics", "Vancouver"],
    riverside: ["Riverside Physio", "Portland"],
    alder: ["Alder Accounting", "Beaverton"],
    harbourview: ["Harbourview Hotel", "Astoria"],
    summit: ["Summit Engineering", "Hillsboro"],
    willow: ["Willow Street Bakery", "Portland"],
    cobalt: ["Cobalt Marketing Studio", "Portland"],
    pinecrest: ["Pinecrest Veterinary Clinic", "Gresham"],
    oakridge: ["Oakridge Property Management", "Lake Oswego"],
  } satisfies Record<OrganizationKey, readonly [string, string]>,
  addresses: {
    kessler: address({
      street: "1215 SW Alder St",
      postalCode: "97205",
      city: "Portland",
      region: "OR",
      countryCode: "us",
      lat: 45.5206,
      lon: -122.688,
    }),
    brookfield: address({
      street: "1030 NW Johnson St",
      postalCode: "97209",
      city: "Portland",
      region: "OR",
      countryCode: "us",
      lat: 45.53,
      lon: -122.684,
    }),
    maple: address({
      street: "455 Court St NE",
      postalCode: "97301",
      city: "Salem",
      region: "OR",
      countryCode: "us",
      lat: 44.9429,
      lon: -123.0351,
    }),
    northgate: address({
      street: "5200 E Fourth Plain Blvd",
      postalCode: "98661",
      city: "Vancouver",
      region: "WA",
      countryCode: "us",
      lat: 45.639,
      lon: -122.625,
    }),
    riverside: address({
      street: "2330 SE Belmont St",
      postalCode: "97214",
      city: "Portland",
      region: "OR",
      countryCode: "us",
      lat: 45.514,
      lon: -122.642,
    }),
    alder: address({
      street: "4550 SW Hall Blvd",
      postalCode: "97005",
      city: "Beaverton",
      region: "OR",
      countryCode: "us",
      lat: 45.492,
      lon: -122.804,
    }),
    harbourview: address({
      street: "100 Marine Dr",
      postalCode: "97103",
      city: "Astoria",
      region: "OR",
      countryCode: "us",
      lat: 46.188,
      lon: -123.831,
    }),
    summit: address({
      street: "2200 NE Cornell Rd",
      postalCode: "97124",
      city: "Hillsboro",
      region: "OR",
      countryCode: "us",
      lat: 45.546,
      lon: -122.928,
    }),
    willow: address({
      street: "1530 NE Alberta St",
      postalCode: "97211",
      city: "Portland",
      region: "OR",
      countryCode: "us",
      lat: 45.566,
      lon: -122.643,
    }),
    cobalt: address({
      street: "1800 NE Broadway",
      postalCode: "97232",
      city: "Portland",
      region: "OR",
      countryCode: "us",
      lat: 45.529,
      lon: -122.644,
    }),
    pinecrest: address({
      street: "350 NE Burnside Rd",
      postalCode: "97030",
      city: "Gresham",
      region: "OR",
      countryCode: "us",
      lat: 45.505,
      lon: -122.43,
    }),
    oakridge: address({
      street: "300 B Ave",
      postalCode: "97034",
      city: "Lake Oswego",
      region: "OR",
      countryCode: "us",
      lat: 45.41,
      lon: -122.681,
    }),
  } satisfies Record<OrganizationKey, AddressInput>,
  contacts: {
    hannah: ["Hannah", "Kessler", "Practice owner"],
    david: ["David", "Moore", "Office manager"],
    olivia: ["Olivia", "Brooks", "Managing partner"],
    james: ["James", "Finch", "Partner"],
    grace: ["Grace", "Maple", "Office administrator"],
    ethan: ["Ethan", "Clarke", "Operations lead"],
    sophie: ["Sophie", "Turner", "Clinic owner"],
    daniel: ["Daniel", "Reed", "Senior accountant"],
    chloe: ["Chloe", "Bennett", "General manager"],
    ryan: ["Ryan", "Price", "Facilities manager"],
    megan: ["Megan", "Hughes", "Owner"],
    lucas: ["Lucas", "Grant", "Studio director"],
    emma: ["Emma", "Walsh", "Practice manager"],
    noah: ["Noah", "Hayes", "Head of operations"],
    isla: ["Isla", "Murphy", "Project architect"],
    owen: ["Owen", "Fletcher", "IT contact"],
    amelia: ["Amelia", "Ross", "Finance lead"],
    liam: ["Liam", "Carter", "Front desk lead"],
  } satisfies Record<ContactKey, readonly [string, string, string]>,
  services: {
    managedSupport: "Managed IT support (per workstation, yearly)",
    networkSetup: "Office network setup",
    securityReview: "Security review",
    emailMigration: "Cloud email migration",
    onsiteDay: "On-site support day",
    backupSetup: "Backup and recovery setup",
  } satisfies Record<ServiceKey, string>,
  deals: {
    kesslerSupport: ["Kessler Dental – managed support renewal", "Confirm workstation count for the renewal"],
    mapleNetwork: ["Maple & Finch – office network setup", "Send the revised proposal with the second access point"],
    northgateRollout: ["Northgate Logistics – warehouse network and support", "Walk the warehouse with Ethan"],
    harbourviewSupport: ["Harbourview Hotel – managed support", "Intro call with Chloe about front desk systems"],
    riversideBackup: ["Riverside Physio – backup and recovery", "Agree on the restore test date"],
    willowSetup: ["Willow Street Bakery – shop and office setup", "Reply to Megan with two setup options"],
    cobaltSecurity: ["Cobalt Studio – security review", "Share the findings report"],
    pinecrestMigration: ["Pinecrest Veterinary – email migration", "Check mailbox sizes before quoting"],
    oakridgeSupport: ["Oakridge Property – support for three offices", "Qualify budget and timing"],
    brookfieldRenewal: ["Brookfield Architects – support renewal", "Renewal signed"],
    alderMigration: ["Alder Accounting – email migration", "Project delivered"],
    summitNetwork: ["Summit Engineering – network refresh", "Closed lost"],
    kesslerOnsite: ["Kessler Dental – on-site days for the new room", "Book two days with David"],
    kesslerFirstYear: ["Kessler Dental – managed support, first year", "Contract signed"],
    riversideSupport: ["Riverside Physio – managed support", "Contract signed"],
    alderSupport: ["Alder Accounting – managed support and setup day", "Contract signed"],
    cobaltNetwork: ["Cobalt Studio – studio network", "Project delivered"],
    brookfieldMigration: ["Brookfield Architects – email migration", "Mailboxes moved"],
    summitRenewal: ["Summit Engineering – managed support renewal", "Closed lost"],
    pinecrestSecurity: ["Pinecrest Veterinary – security review", "Closed lost"],
  } satisfies Record<DealKey, readonly [string, string]>,
  tasks: {
    sendRevisedProposal: "Send the revised network proposal to Maple & Finch",
    bookSiteVisit: "Book the warehouse site visit at Northgate",
    checkBackupLogs: "Check last week's backup logs for Riverside",
    prepareRenewal: "Prepare the Kessler renewal summary",
    callNorthgate: "Second warehouse walk with Ethan to measure Wi-Fi coverage",
    migrationPlan: "Check mailbox sizes on site at Pinecrest for the migration plan",
    securityFindings: "Write up the Cobalt security findings",
    onboardingCall: "Onboarding call with Brookfield's new staff",
    invoiceQuestion: "Answer Alder's question about the project invoice",
    followUpWillow: "Visit Megan at the new Willow Street Bakery shop",
    priceListReview: "Review next year's price list",
    hotelWalkthrough: "Walk through the front desk setup at Harbourview",
    mapleInstall: "Install the second access point at Maple & Finch",
    kesslerRoomSetup: "Set up the two workstations in Kessler's fourth treatment room",
  } satisfies Record<TaskKey, string>,
  views: {
    pipeline: "Pipeline",
    nextSteps: "Next steps",
    customers: "Customers",
    allContacts: "All contacts",
    dueSoon: "Due soon",
    priceList: "Price list",
    siteVisits: "Site visits",
  },
  widgets: {
    openPipeline: "Open pipeline",
    won: "Won in the last 12 months",
    averageWon: "Average won deal",
    overdueTasks: "Overdue tasks",
    pipelineByStage: "Pipeline by stage",
    customersMap: "Customers on the map",
    nextSteps: "Next steps, next 14 days",
    wonByMonth: "Won value by month",
    latestActivity: "Latest activity",
    appointmentsMonth: "Appointments this month",
  },
  wiki: {
    guide: {
      title: "Operating Guide",
      markdown: [
        "Harbor Lane IT looks after the computers, networks and email of small offices: dental and physio practices, law and accounting firms, studios and shops. This workspace is demo data; every company and person in it is fictional.",
        "",
        "## How we use the CRM",
        "- **Companies** are the offices we support or talk to. **Contacts** are the people there.",
        "- **Deals** are support contracts and projects. The stage shows where the conversation is; the value comes from the services on the deal. Quotes, network inventories and site visit notes are attached to the deal in its Documents field.",
        "- **Tasks** are next actions with an owner, a status and a due date. They are records like any other: nobody gets an automatic reminder, so check the Due soon view every morning. On-site visits carry a Scheduled time and appear in the Site visits calendar.",
        "- A conversation from the inbox belongs to a deal only when someone links it to that deal.",
        "",
        "## Working rules",
        "- Every open deal has a next step and a next step date.",
        "- Prices come from the Services list. Ask Max before giving a discount; the page Price list and discounts has the rules.",
        "- Five routines help Mate prepare the day: a morning pipeline briefing, a check for stale deals, reply drafts for new emails, follow-up drafts for deals due today and a Friday wrap-up in the deal notes. They prepare drafts, tasks and notes and never send anything.",
        "- Accounting, booking and hardware ordering stay in their own tools.",
      ],
    },
    process: {
      title: "Sales Process",
      markdown: [
        "Every inquiry becomes a deal on the Pipeline board. The stage shows how far the conversation has come, and each stage has a clear entry point.",
        "",
        "## Stages",
        "1. **New:** an inquiry or referral. Add the company and the person who asked.",
        "2. **Qualified:** we know the number of workstations, the budget range and who decides.",
        "3. **Conversation:** site visit or call done, needs written down in the deal notes.",
        "4. **Proposal sent:** services added to the deal, proposal sent by email.",
        "5. **Won or Lost:** record the outcome and, when lost, the reason.",
      ],
    },
    followUp: {
      title: "Follow-up after a site visit",
      whenToUse: "When a site visit or a first call with a prospect has just taken place.",
      markdown: [
        "A good follow-up keeps the deal moving and lets the whole team see what was promised. Do it on the same day.",
        "",
        "## Steps",
        "1. Write what you saw into the deal notes (rooms, devices, network, open questions) or attach your site visit notes to the deal's Documents.",
        "2. Set the next step and its date on the deal.",
        "3. Create a task for every promise you made, with a due date.",
        "4. Link the email or chat with the prospect to the deal, so the team sees it.",
      ],
    },
    priceList: {
      title: "Price list and discounts",
      markdown: [
        "Our prices come from the Services list, so every deal is priced the same way. This page explains how the prices are meant and when a discount is possible.",
        "",
        "## How the prices work",
        "- **Managed IT support** is priced per workstation and year. The quantity on the deal is the number of workstations.",
        "- **Projects** (network setup, email migration, backup setup, security review) have a fixed price for a typical small office. Larger sites get one line per location.",
        "- **On-site days** cover a full day at the customer. Half days are not sold separately.",
        "",
        "## Discounts",
        "- Up to 5 % on projects when the customer signs a managed support contract at the same time.",
        "- Renewals keep last year's price per workstation when the number of workstations grows.",
        "- Every other discount needs Max's approval before the proposal goes out. Write the reason into the deal notes.",
      ],
    },
  },
  routines: {
    briefing: {
      name: "Morning pipeline briefing",
      task: "Produce a read-only morning briefing for the team. Count the open deals (every stage except Won and Lost) and measure their value and weighted value per stage with query_crm_measure. List the open deals whose Next step date is today or earlier, the tasks that are Blocked or due today, and today's accessible calendar meetings from get_calendars. Name the responsible members and cite only returned records and activities. Keep it under 300 words. Change no record, draft, setting or widget.",
      runs: [
        "Nothing had changed since the last run: 9 open deals, the same two next steps due today.",
        "Briefed 9 open deals worth $16,400 weighted, 1 blocked task and today's two customer meetings.",
      ],
    },
    staleDeals: {
      name: "Follow up on stale deals",
      task: 'Each morning, inspect open deals (every stage except Won and Lost) that had no update for more than 21 days, have no Next step date or an overdue one, or have no linked contact. Read the configured task Status and Priority options. For a deal without a contact, query at most five contacts linked to its company and link at most one existing contact. If a task named "Follow up: <deal name>" is already linked, skip further changes for that deal. Otherwise create one ordinary task with Open status, High priority when the deal is in Proposal sent and Medium otherwise, the exact failed checks in notes, and links to the deal and its company. Append one dated note to that deal. Preserve the deal value, stage, service lines and every existing relationship. Report the checks, links and tasks.',
      runs: [
        "No stale deals needed a new follow-up task.",
        "Created 2 follow-up tasks for Oakridge and Pinecrest and added a dated note to both deals.",
      ],
    },
    replyDrafts: {
      name: "Draft replies to new emails",
      task: "Review the new inbound email identified by routine_trigger using the available messaging tools. Match its participants through existing CRM identity channels and read the linked company, open deals and services for context. Save a concise reply draft with save_message_draft only when the request has enough context, using prices from the Services list and never promising a discount. Preserve an existing draft rather than overwrite it without a clear reason. The draft is for human review; never send it or change CRM data, roles or settings. Report the conversation and why a draft was or was not prepared.",
      runs: [
        "Prepared a reply draft for James about the second access point and left it for review.",
        "",
        "Drafted a reply to Chloe proposing Monday at 2 pm for the introductory call.",
      ],
      failure:
        "I could not reach the model provider on this attempt, so I stopped before reading or changing anything. Nothing was modified. The next email will start a new run.",
    },
    followUpDue: {
      name: "Every morning, draft follow-ups for deals due today",
      task: 'Every weekday morning, read the open deals (every stage except Won and Lost) whose Next step date is today or earlier. For each deal read the company, the linked contacts, the services on the deal and the last linked email conversation. When the customer wrote last in an email conversation and no reply draft exists yet, save one short reply draft with save_message_draft that answers the question, uses prices from the Services list and never promises a discount. Preserve an existing draft. When the deal has no email conversation, create one ordinary task named "Follow up: <deal name>" due today unless a task with that name is already linked. Never send a message and change no other field. Report the deals and what you prepared for each.',
      runs: [
        "3 deals were due: saved a reply draft for Kessler Dental and created follow-up tasks for Riverside Physio and Willow Street Bakery, whose conversations run on WhatsApp and Instagram.",
        "No deal was due today; nothing was drafted or created.",
        "Saved a reply draft for Maple & Finch about the second access point; the Kessler Dental deal already had a follow-up task.",
      ],
    },
    weeklyNotes: {
      name: "Friday wrap-up notes on open deals",
      task: "Every Friday afternoon, find the open deals (every stage except Won and Lost) that had a linked email or chat conversation this week. For each one, read the conversation and append one dated paragraph to the deal's Notes: what the customer asked, what we promised and the next step. Keep the existing notes and write in the first person plural. Skip deals without a new conversation and never add a second paragraph for the same week. Change no other field, create no task and send no message.",
      runs: [
        "Added a dated paragraph to 5 deals, among them Kessler Dental, Maple & Finch and Harbourview Hotel.",
        "Added paragraphs to 4 deals; Oakridge Property had no new conversation that week.",
      ],
    },
  },
  webhooks: {
    accounting: {
      description: "Send deal and organization changes to the accounting bridge",
      url: "https://accounting-bridge.harborlane-it.example/hooks/crm",
    },
    dispatch: {
      description: "Task changes for the dispatch board (paused while the receiver is down)",
      url: "https://dispatch.harborlane-it.example/hooks/tasks",
    },
  },
  threads: {
    mapleProposal: {
      subject: "Network proposal – second access point",
      messages: [
        "Hi Max,\n\nThanks for the walkthrough on Tuesday. Before we sign, could you add a second access point for the meeting room? The signal there was weak during your visit.\n\nBest,\nJames",
        "Hi James,\n\nGood catch. I will add the access point and the cabling to the meeting room and send the revised proposal by Thursday.\n\nBest,\nMax",
        "Great, thank you. Grace will coordinate the installation date with you once we have signed.",
        "Here is the revised proposal with the second access point. The installation takes one day; we can do it on a Friday so the office is not disturbed.",
      ],
    },
    kesslerRenewal: {
      inventory:
        '<!doctype html><html><head><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><style>:root{color-scheme:light dark}body{margin:0;background:#f4f7fb;color:#1c2733;font-family:-apple-system,\'Segoe UI\',Roboto,Helvetica,Arial,sans-serif}.digest{padding:20px}.title{font-size:18px;font-weight:600;margin:0 0 4px}.lead{color:#52606d;margin:0 0 16px;font-size:14px}.stats{width:100%;border-collapse:separate;border-spacing:8px 0}.stat{background:#ffffff;border:1px solid #dbe3ec;border-radius:10px;padding:12px}.value{font-size:22px;font-weight:600;color:#1f6feb}.label{font-size:12px;color:#52606d}.foot{font-size:12px;color:#7b8794;margin-top:16px}@media (prefers-color-scheme: dark){body{background:#10161d;color:#e6edf3}.lead,.label{color:#9aa7b4}.stat{background:#18212b;border-color:#2b3846}.value{color:#6cb6ff}.foot{color:#7d8a97}}[data-ogsc] .lead{color:#9aa7b4}</style></head><body><div class="digest"><p class="title">Workstation inventory</p><p class="lead">Hi Max, here is the current device list from our practice system, ahead of the renewal.</p><table class="stats" role="presentation"><tr><td class="stat"><div class="value">12</div><div class="label">Workstations today</div></td><td class="stat"><div class="value">2</div><div class="label">New in the fourth room</div></td><td class="stat"><div class="value">3</div><div class="label">Printers</div></td></tr></table><p class="foot">Sent from the practice system&#39;s weekly inventory report.</p></div></body></html>',
      subject: "Support renewal and the new treatment room",
      messages: [
        "Hello Max,\n\nOur support contract renews next month. We are also opening a fourth treatment room, so we will have two more workstations.\n\nCan you include them?\n\nDavid",
        "Hi David,\n\nOf course. I will update the renewal to 14 workstations and suggest two on-site days for setting up the new room.\n\nBest,\nMax",
        "Sounds good. Hannah would like to see the updated numbers before she signs.",
      ],
    },
    northgateIntro: {
      messages: [
        "Hi Max, Noah from Riverside mentioned you set up their network. We are struggling with Wi-Fi in our warehouse. Do you take on sites like ours?",
        "Hi Ethan, yes, we do. Warehouses usually need a few outdoor-rated access points. Could I walk the site with you next week?",
        "That works. Wednesday morning?",
        "Wednesday at 9 is booked. I will bring a measuring kit.",
      ],
    },
    riversideBackup: {
      messages: [
        "Hi Max, quick question: is our backup also covering the booking laptop at the front desk?",
        "Hi Sophie, not yet. It is on the list for the backup setup we discussed. I can add it this week.",
        "Perfect, thanks!",
      ],
    },
    harbourviewIntro: {
      letter:
        '<html><head><style>.wrap{font-family:Georgia,\'Times New Roman\',serif;color:#2b2b2b}.band{background:#0f4c5c;color:#ffffff;padding:14px 20px;font-size:13px;letter-spacing:0.08em;text-transform:uppercase}.card{border:1px solid #d9e2e5;padding:18px 20px}.meta td{padding:4px 12px 4px 0;font-size:13px;color:#5b6b70}.meta td.value{color:#1d2b30;font-weight:bold}.note{font-size:12px;color:#7a868a;padding-top:12px}</style></head><body><div class="wrap"><div class="band">Harbourview Hotel &middot; Guest services</div><div class="card"><p style="margin:0 0 12px;font-size:15px">Hi Max,</p><p style="margin:0 0 12px;font-size:15px">A colleague at Alder Accounting recommended you. We are a 40-room hotel with a small office and the front desk. Our current provider is retiring at the end of the year. Would you have time for an introductory call?</p><table class="meta" role="presentation"><tr><td>Rooms</td><td class="value">40</td></tr><tr><td>Front desk</td><td class="value">Open around the clock</td></tr><tr><td>Contact</td><td class="value">Chloe Bennett, General manager</td></tr></table><p class="note">Harbourview Hotel, Astoria. This message was sent from our guest services mailbox.</p></div></div></body></html>',
      subject: "Introduction – IT support for the hotel",
      messages: [
        "Hi Max,\n\nA colleague at Alder Accounting recommended you. We are a 40-room hotel with a small office and the front desk. Our current provider is retiring at the end of the year.\n\nWould you have time for an introductory call?\n\nKind regards,\nChloe Bennett",
        "Hi Chloe,\n\nThank you for reaching out. I would be glad to. How about Monday at 2 pm? I will call the front desk number.\n\nBest regards,\nMax",
      ],
    },
    willowInquiry: {
      messages: [
        "Hi! We are opening a second shop in spring. Can you set up the card terminals and the office laptop?",
        "Hi Megan, we can set up the network and the laptop. The card terminals come from your payment provider, but we make sure they are connected. Shall I send two options?",
        "Yes please! Opening is planned for the first week of April, so anything before then works.",
      ],
    },
    cobaltFindings: {
      messages: [
        "Max, did you finish the security review? We want to go through it in Friday's team meeting.",
        "Almost. The report will be with you on Thursday: three quick fixes and one bigger item about shared passwords.",
        "Perfect. Could you add a short summary for the whole team? Not everyone will read the full report.",
      ],
    },
    teamInstall: {
      name: "Maple & Finch install",
      messages: [
        "Install confirmed for next Friday from 8 am. We need the meeting room for about an hour around noon.",
        "Great, I will keep the meeting room free that day.",
        "Thanks. Please send the new Wi-Fi details to Grace once you are done.",
      ],
    },
  },
  calendar: {
    name: "Customer meetings",
    events: [
      "Site visit at Northgate Logistics",
      "Renewal review with Kessler Dental",
      "Intro call with Harbourview Hotel",
      "Site visit at Pinecrest Veterinary Clinic",
      "Security report walkthrough with Cobalt",
    ],
  },
  files: {
    quote: {
      title: "Quote",
      preparedFor: "Prepared by Harbor Lane IT for",
      lineItems: "Line items",
      columns: ["Service", "Qty", "Unit price", "Amount"],
      total: "Total",
      notes: "Notes",
      terms:
        "Managed support is priced per workstation and year, projects at a fixed price. This quote is valid for 30 days.",
    },
    quotes: {
      mapleNetwork: [
        "HL-2026-014",
        "Quote HL-2026-014 – Maple & Finch network.pdf",
        "Revised after the walkthrough: the network setup now includes a second access point for the meeting room and the cabling to it. Installation takes one day on site, on a Friday so the office is not disturbed.",
      ],
      kesslerSupport: [
        "HL-2026-011",
        "Quote HL-2026-011 – Kessler Dental renewal.pdf",
        "Renewal for 14 workstations, including the two new ones in the fourth treatment room. Last year's price per workstation stays.",
      ],
      cobaltSecurity: [
        "HL-2026-006",
        "Quote HL-2026-006 – Cobalt security review.pdf",
        "Review of accounts, shared passwords, backups and the studio network, with a written findings report and a summary for the whole team.",
      ],
      brookfieldMigration: [
        "HL-2026-009",
        "Quote HL-2026-009 – Brookfield email migration.pdf",
        "Move of all mailboxes to the cloud over one weekend, with a one-page guide for the team on Monday morning.",
      ],
      riversideSupport: [
        "HL-2025-031",
        "Quote HL-2025-031 – Riverside Physio support.pdf",
        "Managed support for 8 workstations, including the booking laptop at the front desk.",
      ],
    },
    inventory: {
      name: "Network inventory – Kessler Dental.xlsx",
      header: ["Device", "Room", "Type", "Year", "Note"],
      rows: [
        ["WS-01", "Reception", "Workstation", "2023", ""],
        ["WS-02", "Reception", "Workstation", "2023", ""],
        ["WS-03", "Treatment room 1", "Workstation", "2022", ""],
        ["WS-04", "Treatment room 2", "Workstation", "2022", ""],
        ["WS-05", "Treatment room 3", "Workstation", "2024", ""],
        ["WS-13", "Treatment room 4", "Workstation", "new", "Set up with the renewal"],
        ["WS-14", "Treatment room 4", "Workstation", "new", "Set up with the renewal"],
        ["AP-01", "Hallway", "Access point", "2021", "Coverage weak in room 4"],
        ["PR-01", "Reception", "Printer", "2020", ""],
      ],
    },
    siteNotes: {
      name: "Site visit notes – Northgate.md",
      lines: [
        "# Site visit notes – Northgate Logistics",
        "Warehouse walk with Ethan Clarke, measuring kit on site.",
        "",
        "## What we saw",
        "- Office: 12 workstations and one access point; the signal is fine.",
        "- Warehouse hall: no coverage behind racks 7 to 12, the hand scanners drop out.",
        "- Loading dock office: weak signal, needs a second access point.",
        "",
        "## Proposal",
        "- Two outdoor-rated access points in the hall and a second access point for the loading dock office.",
        "- Managed support for 20 workstations once the network is in.",
        "",
        "## Open questions",
        "- Power over Ethernet in the hall: Ethan checks with the landlord.",
      ],
    },
  },
  trash: ["James Finch (duplicate)", "Summit Engineering – printer network"],
  mateChat: {
    title: "What needs my attention this week?",
    messages: [
      "What needs my attention this week?",
      "Three things stand out.\n\n1. **Overdue next step:** the Kessler Dental renewal ($6,720, Proposal sent) still needs the confirmed workstation count from David.\n2. **Overdue tasks:** the backup log check for Riverside Physio, and Alder Accounting's question about the project invoice, which is blocked.\n3. **Site visits:** the new Willow Street Bakery shop, the front desk walkthrough at Harbourview Hotel and the second warehouse walk at Northgate are scheduled in the Site visits calendar.\n\nThe Maple & Finch network proposal ($3,950) has its next step in two days, so I would send the revised quote first.",
      "Draft the follow-up on the Maple & Finch quote",
      "I read Quote HL-2026-014 on the deal: office network setup $3,200, now with the second access point for the meeting room, plus one on-site day $750, total $3,950, valid for 30 days. Here is a draft for James:\n\nHi James,\n\nAs promised, the revised quote HL-2026-014 now includes the second access point and the cabling to the meeting room. The total is $3,950: the network setup at $3,200 and one installation day on site at $750. We can install on a Friday so the office is not disturbed. Shall I agree a date with Grace?\n\nBest,\nMax\n\nI have not sent anything; the draft is for you to review.",
    ],
  },
  inbox: {
    alderInvoice: {
      subject: "Question about the last invoice",
      messages: [
        "Hi Max,\n\nI am closing the month and have a question about the last invoice. It lists an on-site day on the 3rd that I cannot place. Could you check what it was for?\n\nThanks,\nDaniel",
        "Hi Daniel,\n\nThanks for flagging it. I am checking with Laura, who prepared the invoice, and will come back to you by Friday.\n\nBest,\nMax",
        "Thanks. I have to close the books on Monday, so the sooner the better.",
        "Hi Daniel,\n\nLaura found it: the day was the restore test of your backup after the email migration, which you asked for by phone. I will send you the report of that day in a separate mail. If anything still looks off, tell me and we will correct the invoice.\n\nBest,\nMax",
      ],
    },
    oakridgeInquiry: {
      subject: "IT support for our three offices",
      messages: [
        "Hi Max,\n\nI found you through your website. Oakridge Property Management has three small offices with 16 workstations in total, and our IT person leaves in March. Roughly what would managed support cost per year? We have a budget meeting next Wednesday.\n\nBest,\nAmelia",
        "Hi Amelia,\n\nThanks for getting in touch. Managed support is $480 per workstation and year, so $7,680 a year for 16 workstations. I would like to see the three offices before we fix anything, mainly the network and the backups. I can quote that visit separately.\n\nBest,\nMax",
        "That helps, thank you. Does managed support also cover the printers and the shared mailboxes, or only the workstations?",
        "Hi Amelia,\n\nIt covers the workstations, the office network, the printers and email, including shared mailboxes. Phones are not part of it. Shall we look at the three offices together first?\n\nBest,\nMax",
        "Yes, please. Thursday afternoon at our Lake Oswego office works best for me, and I can show you the other two the same day.",
      ],
    },
    pinecrestMailboxes: {
      subject: "Mailboxes for the migration",
      messages: [
        "Hi Emma,\n\nBefore I come by next week, could you count the mailboxes, including shared ones like reception? It helps me plan the migration weekend.\n\nBest,\nMax",
        "Hi Max,\n\nI counted 12: ten staff mailboxes plus reception and billing. The reception one is huge because it holds years of client emails. Does that change the quote?\n\nEmma",
        "Hi Emma,\n\nThanks, that helps. The migration is a fixed price per project, so 12 mailboxes is fine. A big reception mailbox only means the transfer takes longer, so I will plan it for a weekend and check the real sizes when I am on site.\n\nBest,\nMax",
        "Great. One more question: our practice software sends appointment emails from the old address. Will that keep working after the move?",
        "Hi Emma,\n\nYes. The practice software sends through the old mail server today, so I will point it to the new mailboxes during the migration weekend and send a test appointment email on Monday morning. You do not have to change anything in the software.\n\nBest,\nMax",
      ],
    },
    brookfieldWorkstations: {
      subject: "Two new workstations",
      messages: [
        "Hi Max,\n\nThe email migration went smoothly, thank you. Isla says nobody lost a message. Two new colleagues start on the 1st, so we need two more workstations on the support contract. What changes on the invoice?\n\nOlivia",
        "Hi Olivia,\n\nGreat to hear. The two new workstations come at the same $480 per workstation and year for the rest of the current term, so $960 for the two. I will add them to the contract today.\n\nBest,\nMax",
        "Thanks. Could Isla set up the laptops herself with your instructions, or would you come by?",
        "Hi Olivia,\n\nIsla can do it with a short checklist from me, but I would rather set both laptops up on site in one day so they match the others. That is one on-site day at $750. Shall I plan it for the 1st, before your colleagues arrive?\n\nBest,\nMax",
      ],
    },
    noahLinkedin: {
      messages: [
        "Max, Ethan told me you are walking his warehouse next week. Thanks for taking him on, the dead zone behind the racks is a real thing :)",
        "Thanks, Noah! And thanks again for the introduction. Ethan is easy to work with.",
        "He is. By the way, our guest Wi-Fi in the waiting room has been slow since Monday. Could you take a look when you are here for the restore test?",
        "Sure, I will add it to that visit. Which router do you have in the waiting room?",
        "Just the grey box from our old provider. I will send you a photo.",
        "Good idea, I will bring a spare access point just in case.",
      ],
    },
    owenLinkedin: {
      messages: [
        "Hi Max, we have run IT ourselves since the summer and it takes more of my time than I expected. Would you be open to a call about a smaller support package, mostly for the printers and backups?",
        "Hi Owen, good to hear from you. Happy to talk, and a smaller package is easy to price. Would a short call this week work?",
        "Thursday afternoon works for me. I will write down what we still run ourselves so you can price it.",
      ],
    },
    harbourviewInstagram: {
      messages: [
        "Hi Max! Loved your post about the Willow Street shop. Our guests complain about the Wi-Fi on the second floor. Is that something you can fix in a hotel too?",
        "Hi Chloe, thank you! Yes, it is mostly about coverage: usually one access point per floor and a separate guest network. I will look at the second floor during the walkthrough.",
        "Perfect. Ryan from facilities can show you the rooms with the worst signal.",
        "Great, I will get in touch with him. See you Wednesday!",
      ],
    },
    harbourviewTelegram: {
      messages: [
        "Hi Max, Ryan from Harbourview. Chloe asked me to line up the walkthrough with you. The patch cabinet is in the basement and I have the key.",
        "Hi Ryan, great, thanks. Wednesday at 2 pm works for me. I would like to see the cabinet, the front desk and the rooms with the worst Wi-Fi.",
        "Wednesday 2 pm is fine. The basement door is next to the loading ramp, I will wait for you there.",
        "Perfect, see you at the ramp. I will bring a laptop and a network tester.",
      ],
    },
  },
  notes: {
    kesslerSupport:
      "Summary by Claude after the renewal review:\nDavid confirmed 14 workstations: the 12 from the inventory plus the two for the fourth treatment room.\nHannah signs once she has the renewal summary with last year's price per workstation.\nOpen: change the next step of this deal from confirming the count to sending the summary.\nPromised: the summary goes to Hannah this week.",
    cobaltSecurity:
      "Draft by ChatGPT from the findings report, as a one-page summary for Cobalt's whole team:\nThree quick fixes: turn on two-factor sign-in, remove two old accounts, check the backup once a month.\nOne bigger item: stop sharing passwords in chat and move them into a password manager.\nLucas forwarded the summary to the team before the team meeting.",
    willowSetup:
      "Options drafted by ChatGPT from Megan's message:\nOption A: network setup plus two on-site days ($4,700), shop and office in one go before the opening.\nOption B: network setup plus one on-site day ($3,950), the office laptop follows after the opening.\nThe card terminals come from her payment provider, we only connect them.\nBoth options need the keys to the shop by the end of March.",
    james:
      "Merged by Codex (script run on the CSV export of the old address book):\nThe duplicate contact James Finch (duplicate) was moved to Trash.\nEmail and mobile number were identical, so nothing was overwritten.\nDeals and conversations stay linked to this record.",
    invoiceQuestion:
      "Created by Claude from Daniel's email about the last invoice:\nHe cannot place the on-site day on the 3rd.\nBlocked until Laura confirms in the invoicing tool what the day was for.\nA reply draft is waiting in the Inbox.",
  },
  agents: {
    company: "Harbor Lane IT",
    records: "companies, contacts, deals and tasks",
    mate: "It answers questions about the pipeline, drafts replies to customer emails and creates tasks when we ask.",
    claude:
      "Max uses it after a customer call to write a summary into the deal notes and to look across the whole pipeline.",
    chatgpt:
      "We use it to turn a technical findings report into a short summary that a customer's whole team can read.",
    codex:
      "It runs scripts on exports from our old systems, for example to merge duplicate contacts, and writes what it changed into the notes.",
    followUp:
      'The routine "Every morning, draft follow-ups for deals due today" runs every weekday at 8:00 and belongs to Max. For every open deal whose next step date is today or earlier it saves a reply draft for the last customer email or, when the conversation runs on WhatsApp, Instagram or Telegram, a follow-up task. The drafts wait in the Inbox until a person has read them; the routine never sends anything.',
  },
  mateChatWalkthrough: {
    title: "Walkthrough at Harbourview",
    messages: [
      "Chloe at Harbourview confirmed the front desk walkthrough for Wednesday at 2 pm. Create a task for it, linked to the deal and to her, and set the deal's next step date to the same day.",
      "Done. I created the task **Walk through the front desk setup at Harbourview** (Medium priority, owner Max, scheduled Wednesday from 2:00 to 3:30 pm) and linked it to **Harbourview Hotel – managed support** and Chloe Bennett. I also set the deal's next step date to Wednesday. I changed nothing else and sent no message.",
      "Which other deals have a next step today?",
      "Two: **Riverside Physio – backup and recovery** (agree on the restore test date) and **Willow Street Bakery – shop and office setup** (reply to Megan with two setup options). Megan's last message is still unanswered, and the options ChatGPT drafted are in the deal notes. I only read these records, nothing was changed.",
    ],
  },
};

export type Strings = typeof en;

const de: Strings = {
  company: "Lindenhof IT-Service",
  workspaceName: "Kleinbetrieb",
  website: "https://lindenhof-it.example",
  phones: {
    mobile: { templates: ["+49 30 23125 0##"], start: 0 },
    office: { templates: ["+49 30 23125 4##"], start: 0 },
  },
  accounts: ["google", "linkedin", "whatsapp", "instagram", "telegram", "outlook"],
  threadAccounts: { harbourview: "outlook", willow: "instagram", cobalt: "telegram" },
  archivedFields: [],
  selfTitle: "Geschäftsführer",
  money: (amount: number) => `${groupDigits(amount, ".", ",")} €`,
  lists: {
    organization: ["Firma", "Firmen", "Praxen, Büros und Betriebe, die wir betreuen oder ansprechen."],
    contact: ["Kontakt", "Kontakte", "Ansprechpartner bei Kunden und Interessenten."],
    deal: ["Deal", "Deals", "Betreuungsverträge und Projekte, über die wir sprechen."],
    service: ["Leistung", "Leistungen", "Unsere Preisliste: Betreuung, Projekte und Einsatztage vor Ort."],
    task: ["Aufgabe", "Aufgaben", "Nächste Schritte mit Verantwortlichen und Fälligkeitsdatum."],
  },
  fields: {
    industry: "Branche",
    customerStatus: "Kundenstatus",
    address: "Adresse",
    website: "Website",
    employees: "Mitarbeitende",
    jobTitle: "Position",
    decisionRole: "Rolle in der Entscheidung",
    source: "Quelle",
    closeDate: "Erwarteter Abschluss",
    nextStep: "Nächster Schritt",
    nextStepDate: "Datum nächster Schritt",
    lostReason: "Verlustgrund",
    dueDate: "Fällig am",
    priority: "Priorität",
    documents: "Dokumente",
    scheduled: "Termin vor Ort",
  },
  options: {
    industry: {
      healthcare: "Gesundheit",
      legal: "Recht",
      architecture: "Architektur",
      finance: "Steuerberatung",
      hospitality: "Hotellerie",
      logistics: "Logistik",
      retail: "Handel und Lebensmittel",
      marketing: "Marketing",
      engineering: "Ingenieurwesen",
      property: "Immobilien",
    },
    customerStatus: { prospect: "Interessent", customer: "Kunde", former: "Ehemaliger Kunde" },
    decisionRole: { decisionMaker: "Entscheider", influencer: "Beeinflusser", user: "Anwender" },
    source: {
      referral: "Empfehlung",
      website: "Anfrage über die Website",
      event: "Unternehmertreffen",
      existing: "Bestandskunde",
    },
    lostReason: { price: "Preis", timing: "Zeitpunkt", inHouse: "Intern gelöst" },
    priority: { low: "Niedrig", medium: "Mittel", high: "Hoch" },
  },
  stages: {
    new: "Neu",
    qualified: "Qualifiziert",
    conversation: "Im Gespräch",
    proposal: "Angebot gesendet",
    won: "Gewonnen",
    lost: "Verloren",
  },
  organizations: {
    kessler: ["Zahnarztpraxis Keller", "Hannover"],
    brookfield: ["Architekturbüro Brandt", "Hannover"],
    maple: ["Kanzlei Mahler & Fink", "Hildesheim"],
    northgate: ["Nordtor Logistik GmbH", "Langenhagen"],
    riverside: ["Physiotherapie am Fluss", "Hannover"],
    alder: ["Steuerbüro Erlenhof", "Laatzen"],
    harbourview: ["Hotel Seeblick", "Steinhude"],
    summit: ["Gipfel Ingenieure", "Garbsen"],
    willow: ["Bäckerei Weidengasse", "Hannover"],
    cobalt: ["Kobalt Werbeagentur", "Hannover"],
    pinecrest: ["Tierarztpraxis Kiefernweg", "Burgdorf"],
    oakridge: ["Eichenhain Hausverwaltung", "Isernhagen"],
  },
  addresses: {
    kessler: address({
      street: "Georgstraße 12",
      postalCode: "30159",
      city: "Hannover",
      countryCode: "de",
      lat: 52.374,
      lon: 9.738,
    }),
    brookfield: address({
      street: "Lister Meile 40",
      postalCode: "30161",
      city: "Hannover",
      countryCode: "de",
      lat: 52.384,
      lon: 9.75,
    }),
    maple: address({
      street: "Almsstraße 20",
      postalCode: "31134",
      city: "Hildesheim",
      countryCode: "de",
      lat: 52.152,
      lon: 9.951,
    }),
    northgate: address({
      street: "Walsroder Straße 120",
      postalCode: "30855",
      city: "Langenhagen",
      countryCode: "de",
      lat: 52.447,
      lon: 9.736,
    }),
    riverside: address({
      street: "Ihmeplatz 3",
      postalCode: "30449",
      city: "Hannover",
      countryCode: "de",
      lat: 52.365,
      lon: 9.713,
    }),
    alder: address({
      street: "Marktplatz 4",
      postalCode: "30880",
      city: "Laatzen",
      countryCode: "de",
      lat: 52.315,
      lon: 9.798,
    }),
    harbourview: address({
      street: "Meerstraße 10",
      postalCode: "31515",
      city: "Wunstorf",
      countryCode: "de",
      lat: 52.455,
      lon: 9.358,
    }),
    summit: address({
      street: "Planetenring 6",
      postalCode: "30823",
      city: "Garbsen",
      countryCode: "de",
      lat: 52.418,
      lon: 9.598,
    }),
    willow: address({
      street: "Engelbosteler Damm 30",
      postalCode: "30165",
      city: "Hannover",
      countryCode: "de",
      lat: 52.393,
      lon: 9.738,
    }),
    cobalt: address({
      street: "Königstraße 50",
      postalCode: "30175",
      city: "Hannover",
      countryCode: "de",
      lat: 52.372,
      lon: 9.757,
    }),
    pinecrest: address({
      street: "Marktstraße 18",
      postalCode: "31303",
      city: "Burgdorf",
      countryCode: "de",
      lat: 52.445,
      lon: 10.008,
    }),
    oakridge: address({
      street: "Hauptstraße 30",
      postalCode: "30916",
      city: "Isernhagen",
      countryCode: "de",
      lat: 52.435,
      lon: 9.86,
    }),
  },
  contacts: {
    hannah: ["Hanna", "Keller", "Praxisinhaberin"],
    david: ["David", "Möller", "Praxismanager"],
    olivia: ["Olivia", "Brandt", "Geschäftsführende Gesellschafterin"],
    james: ["Jakob", "Fink", "Partner"],
    grace: ["Greta", "Mahler", "Büroleitung"],
    ethan: ["Erik", "Claasen", "Leiter Betrieb"],
    sophie: ["Sophie", "Thiele", "Praxisinhaberin"],
    daniel: ["Daniel", "Richter", "Steuerfachangestellter"],
    chloe: ["Clara", "Becker", "Direktorin"],
    ryan: ["Ruben", "Peters", "Haustechnik"],
    megan: ["Melanie", "Hoffmann", "Inhaberin"],
    lucas: ["Lukas", "Graf", "Agenturleitung"],
    emma: ["Emma", "Wolf", "Praxismanagerin"],
    noah: ["Noah", "Hansen", "Leiter Organisation"],
    isla: ["Ina", "Martens", "Projektarchitektin"],
    owen: ["Ole", "Friedrich", "IT-Ansprechpartner"],
    amelia: ["Amelie", "Roth", "Leitung Finanzen"],
    liam: ["Leon", "Krause", "Leitung Rezeption"],
  },
  services: {
    managedSupport: "IT-Betreuung (pro Arbeitsplatz und Jahr)",
    networkSetup: "Einrichtung Büronetzwerk",
    securityReview: "Sicherheitsprüfung",
    emailMigration: "Umzug der E-Mail in die Cloud",
    onsiteDay: "Einsatztag vor Ort",
    backupSetup: "Einrichtung Datensicherung",
  },
  deals: {
    kesslerSupport: [
      "Zahnarztpraxis Keller – Verlängerung IT-Betreuung",
      "Anzahl der Arbeitsplätze für die Verlängerung bestätigen",
    ],
    mapleNetwork: ["Kanzlei Mahler & Fink – Büronetzwerk", "Überarbeitetes Angebot mit zweitem Access Point senden"],
    northgateRollout: ["Nordtor Logistik – Lagernetzwerk und Betreuung", "Begehung des Lagers mit Erik"],
    harbourviewSupport: ["Hotel Seeblick – IT-Betreuung", "Kennenlerngespräch mit Clara zur Rezeption"],
    riversideBackup: ["Physiotherapie am Fluss – Datensicherung", "Termin für den Wiederherstellungstest abstimmen"],
    willowSetup: ["Bäckerei Weidengasse – Filiale und Büro einrichten", "Melanie zwei Varianten schicken"],
    cobaltSecurity: ["Kobalt Werbeagentur – Sicherheitsprüfung", "Prüfbericht übergeben"],
    pinecrestMigration: ["Tierarztpraxis Kiefernweg – E-Mail-Umzug", "Postfachgrößen vor dem Angebot prüfen"],
    oakridgeSupport: ["Eichenhain Hausverwaltung – Betreuung für drei Büros", "Budget und Zeitplan klären"],
    brookfieldRenewal: ["Architekturbüro Brandt – Verlängerung Betreuung", "Verlängerung unterschrieben"],
    alderMigration: ["Steuerbüro Erlenhof – E-Mail-Umzug", "Projekt abgeschlossen"],
    summitNetwork: ["Gipfel Ingenieure – Netzwerk erneuern", "Verloren"],
    kesslerOnsite: ["Zahnarztpraxis Keller – Einsatztage für das neue Behandlungszimmer", "Zwei Tage mit David planen"],
    kesslerFirstYear: ["Zahnarztpraxis Keller – IT-Betreuung, erstes Jahr", "Vertrag unterschrieben"],
    riversideSupport: ["Physiotherapie am Fluss – IT-Betreuung", "Vertrag unterschrieben"],
    alderSupport: ["Steuerbüro Erlenhof – IT-Betreuung und Einrichtungstag", "Vertrag unterschrieben"],
    cobaltNetwork: ["Kobalt Werbeagentur – Studionetzwerk", "Projekt abgeschlossen"],
    brookfieldMigration: ["Architekturbüro Brandt – E-Mail-Umzug", "Postfächer umgezogen"],
    summitRenewal: ["Gipfel Ingenieure – Verlängerung IT-Betreuung", "Verloren"],
    pinecrestSecurity: ["Tierarztpraxis Kiefernweg – Sicherheitsprüfung", "Verloren"],
  },
  tasks: {
    sendRevisedProposal: "Überarbeitetes Netzwerkangebot an Kanzlei Mahler & Fink senden",
    bookSiteVisit: "Begehung des Lagers bei Nordtor vereinbaren",
    checkBackupLogs: "Sicherungsprotokolle der letzten Woche für Physiotherapie am Fluss prüfen",
    prepareRenewal: "Zusammenfassung für die Verlängerung bei Keller vorbereiten",
    callNorthgate: "Zweite Lagerbegehung mit Erik: WLAN-Abdeckung messen",
    migrationPlan: "Postfachgrößen vor Ort in der Tierarztpraxis für den Umzugsplan prüfen",
    securityFindings: "Ergebnisse der Sicherheitsprüfung für Kobalt aufschreiben",
    onboardingCall: "Einführung für neue Mitarbeitende im Architekturbüro Brandt",
    invoiceQuestion: "Rückfrage des Steuerbüros zur Projektrechnung beantworten",
    followUpWillow: "Melanie in der neuen Filiale der Bäckerei Weidengasse besuchen",
    priceListReview: "Preisliste für das nächste Jahr prüfen",
    hotelWalkthrough: "Rezeption im Hotel Seeblick gemeinsam durchgehen",
    mapleInstall: "Zweiten Access Point in der Kanzlei Mahler & Fink installieren",
    kesslerRoomSetup: "Zwei Arbeitsplätze im vierten Behandlungszimmer bei Keller einrichten",
  },
  views: {
    pipeline: "Pipeline",
    nextSteps: "Nächste Schritte",
    customers: "Kunden",
    allContacts: "Alle Kontakte",
    dueSoon: "Bald fällig",
    priceList: "Preisliste",
    siteVisits: "Einsätze vor Ort",
  },
  widgets: {
    openPipeline: "Offene Pipeline",
    won: "Gewonnen in den letzten 12 Monaten",
    averageWon: "Durchschnittlicher Auftrag",
    overdueTasks: "Überfällige Aufgaben",
    pipelineByStage: "Pipeline nach Phase",
    customersMap: "Kunden auf der Karte",
    nextSteps: "Nächste Schritte, 14 Tage",
    wonByMonth: "Gewonnener Wert pro Monat",
    latestActivity: "Letzte Aktivitäten",
    appointmentsMonth: "Termine im Monat",
  },
  wiki: {
    guide: {
      title: "Leitfaden",
      markdown: [
        "Lindenhof IT-Service betreut Computer, Netzwerke und E-Mail kleiner Büros: Zahnarzt- und Physiotherapiepraxen, Kanzleien und Steuerbüros, Agenturen und Läden. Dieser Arbeitsbereich enthält Demodaten; alle Firmen und Personen sind erfunden.",
        "",
        "## So nutzen wir das CRM",
        "- **Firmen** sind die Büros und Betriebe, die wir betreuen oder ansprechen. **Kontakte** sind die Menschen dort.",
        "- **Deals** sind Betreuungsverträge und Projekte. Die Phase zeigt, wo das Gespräch steht; der Wert ergibt sich aus den Leistungen im Deal. Angebote, Geräteinventare und Begehungsnotizen hängen im Feld „Dokumente“ am Deal.",
        "- **Aufgaben** sind nächste Schritte mit Verantwortlichen, Status und Fälligkeitsdatum. Es sind normale Datensätze: Niemand wird automatisch erinnert, deshalb jeden Morgen die Ansicht „Bald fällig“ prüfen. Einsätze vor Ort haben einen Termin und erscheinen im Kalender „Einsätze vor Ort“.",
        "- Ein Gespräch aus dem Posteingang gehört nur dann zu einem Deal, wenn jemand es mit dem Deal verknüpft.",
        "",
        "## Arbeitsregeln",
        "- Jeder offene Deal hat einen nächsten Schritt mit Datum.",
        "- Preise kommen aus der Liste der Leistungen. Rabatte vorher mit Max abstimmen; die Regeln stehen auf der Seite „Preisliste und Rabatte“.",
        "- Fünf Routinen helfen Mate beim Tagesstart: ein Pipeline-Briefing am Morgen, eine Prüfung liegengebliebener Deals, Antwortentwürfe für neue E-Mails, Nachfass-Entwürfe für heute fällige Deals und ein Wochenabschluss in den Notizen der Deals. Sie bereiten Entwürfe, Aufgaben und Notizen vor und senden nie etwas.",
        "- Buchhaltung, Terminbuchung und Hardwarebestellung bleiben in ihren eigenen Programmen.",
      ],
    },
    process: {
      title: "Vertriebsprozess",
      markdown: [
        "Jede Anfrage wird zu einem Deal auf der Pipeline. Die Phase zeigt, wie weit das Gespräch ist, und jede Phase hat einen klaren Einstieg.",
        "",
        "## Phasen",
        "1. **Neu:** eine Anfrage oder Empfehlung. Firma und anfragende Person anlegen.",
        "2. **Qualifiziert:** Anzahl der Arbeitsplätze, Budgetrahmen und Entscheider sind bekannt.",
        "3. **Im Gespräch:** Begehung oder Telefonat erledigt, Bedarf in den Notizen des Deals festgehalten.",
        "4. **Angebot gesendet:** Leistungen im Deal erfasst, Angebot per E-Mail verschickt.",
        "5. **Gewonnen oder Verloren:** Ergebnis festhalten, bei Verlust mit Grund.",
      ],
    },
    followUp: {
      title: "Nachbereitung einer Begehung",
      whenToUse: "Wenn gerade eine Begehung oder ein erstes Gespräch mit Interessenten stattgefunden hat.",
      markdown: [
        "Eine gute Nachbereitung hält den Deal in Bewegung und zeigt dem ganzen Team, was zugesagt wurde. Am besten noch am selben Tag.",
        "",
        "## Schritte",
        "1. Das Gesehene in die Notizen des Deals schreiben (Räume, Geräte, Netzwerk, offene Fragen) oder die Begehungsnotizen an die Dokumente des Deals hängen.",
        "2. Nächsten Schritt und Datum im Deal eintragen.",
        "3. Für jede Zusage eine Aufgabe mit Fälligkeitsdatum anlegen.",
        "4. Die E-Mail oder den Chat mit dem Interessenten mit dem Deal verknüpfen, damit das Team sie sieht.",
      ],
    },
    priceList: {
      title: "Preisliste und Rabatte",
      markdown: [
        "Unsere Preise kommen aus der Liste der Leistungen, damit jeder Deal gleich kalkuliert wird. Diese Seite erklärt, wie die Preise gemeint sind und wann ein Rabatt möglich ist.",
        "",
        "## So funktionieren die Preise",
        "- **IT-Betreuung** kostet pro Arbeitsplatz und Jahr. Die Menge im Deal ist die Zahl der Arbeitsplätze.",
        "- **Projekte** (Netzwerk, E-Mail-Umzug, Datensicherung, Sicherheitsprüfung) haben einen Festpreis für ein typisches kleines Büro. Größere Standorte bekommen je Standort eine Position.",
        "- **Einsatztage** umfassen einen ganzen Tag beim Kunden. Halbe Tage verkaufen wir nicht einzeln.",
        "",
        "## Rabatte",
        "- Bis zu 5 % auf Projekte, wenn der Kunde gleichzeitig einen Betreuungsvertrag abschließt.",
        "- Bei Verlängerungen bleibt der Vorjahrespreis pro Arbeitsplatz, wenn die Zahl der Arbeitsplätze wächst.",
        "- Jeder andere Rabatt braucht vor dem Angebot die Freigabe von Max. Den Grund in die Notizen des Deals schreiben.",
      ],
    },
  },
  routines: {
    briefing: {
      name: "Pipeline-Briefing am Morgen",
      task: "Erstelle ein reines Lese-Briefing für das Team am Morgen. Zähle die offenen Deals (alle Phasen außer Gewonnen und Verloren) und miss mit query_crm_measure ihren Wert und gewichteten Wert je Phase. Nenne die offenen Deals, deren Datum nächster Schritt heute oder früher ist, die Aufgaben mit Status Blockiert oder Fälligkeit heute und die heutigen Termine aus get_calendars. Nenne die verantwortlichen Mitglieder und zitiere nur zurückgegebene Datensätze und Aktivitäten. Höchstens 300 Wörter. Ändere keinen Datensatz, keinen Entwurf, keine Einstellung und kein Widget.",
      runs: [
        "Seit dem letzten Lauf unverändert: 9 offene Deals, dieselben zwei nächsten Schritte sind heute fällig.",
        "Briefing zu 9 offenen Deals mit 16.400 € gewichtet, 1 blockierten Aufgabe und den zwei Kundenterminen heute.",
      ],
    },
    staleDeals: {
      name: "Liegengebliebene Deals nachfassen",
      task: "Prüfe jeden Morgen offene Deals (alle Phasen außer Gewonnen und Verloren), die seit mehr als 21 Tagen nicht geändert wurden, kein oder ein überfälliges Datum nächster Schritt haben oder mit keinem Kontakt verknüpft sind. Lies die konfigurierten Optionen für Status und Priorität der Aufgaben. Für einen Deal ohne Kontakt frage höchstens fünf mit seiner Firma verknüpfte Kontakte ab und verknüpfe höchstens einen vorhandenen Kontakt. Ist bereits eine Aufgabe „Nachfassen: <Dealname>“ verknüpft, ändere für diesen Deal nichts weiter. Sonst lege eine normale Aufgabe mit Status Offen an, Priorität Hoch in der Phase Angebot gesendet und sonst Mittel, mit den nicht erfüllten Prüfungen in den Notizen und verknüpft mit Deal und Firma. Ergänze eine datierte Notiz am Deal. Wert, Phase, Leistungspositionen und alle bestehenden Verknüpfungen bleiben unverändert. Berichte Prüfungen, Verknüpfungen und Aufgaben.",
      runs: [
        "Kein liegengebliebener Deal brauchte eine neue Aufgabe.",
        "2 Aufgaben zum Nachfassen für Eichenhain und Kiefernweg angelegt und an beiden Deals eine datierte Notiz ergänzt.",
      ],
    },
    replyDrafts: {
      name: "Antworten auf neue E-Mails entwerfen",
      task: "Prüfe die neue eingehende E-Mail aus routine_trigger mit den verfügbaren Nachrichtenwerkzeugen. Ordne die Beteiligten über vorhandene Identitätskanäle im CRM zu und lies zur Einordnung die verknüpfte Firma, offene Deals und Leistungen. Speichere nur dann mit save_message_draft einen knappen Antwortentwurf, wenn die Anfrage genug Kontext hat; Preise kommen aus der Liste der Leistungen, Rabatte werden nie zugesagt. Einen vorhandenen Entwurf ohne klaren Grund nicht überschreiben. Der Entwurf ist zur Prüfung durch einen Menschen; sende ihn nie und ändere keine CRM-Daten, Rollen oder Einstellungen. Berichte die Unterhaltung und warum ein Entwurf vorbereitet wurde oder nicht.",
      runs: [
        "Antwortentwurf für Herrn Fink zum zweiten Access Point vorbereitet und zur Prüfung liegen gelassen.",
        "",
        "Antwort an Frau Becker mit Montag 14 Uhr für das Kennenlerngespräch entworfen.",
      ],
      failure:
        "Der Modellanbieter war bei diesem Versuch nicht erreichbar, deshalb habe ich vor dem Lesen und Ändern abgebrochen. Nichts wurde verändert. Die nächste E-Mail startet einen neuen Lauf.",
    },
    followUpDue: {
      name: "Jeden Morgen Nachfass-Entwürfe für fällige Deals",
      task: "Lies jeden Werktagmorgen die offenen Deals (alle Phasen außer Gewonnen und Verloren), deren Datum nächster Schritt heute oder früher ist. Lies zu jedem Deal die Firma, die verknüpften Kontakte, die Leistungen im Deal und das letzte verknüpfte E-Mail-Gespräch. Hat zuletzt der Kunde in einem E-Mail-Gespräch geschrieben und liegt noch kein Antwortentwurf vor, speichere mit save_message_draft einen kurzen Antwortentwurf, der die Frage beantwortet, Preise aus der Liste der Leistungen nutzt und nie einen Rabatt zusagt. Einen vorhandenen Entwurf nicht überschreiben. Hat der Deal kein E-Mail-Gespräch, lege eine normale Aufgabe „Nachfassen: <Dealname>“ mit Fälligkeit heute an, sofern nicht schon eine Aufgabe mit diesem Namen verknüpft ist. Sende nie eine Nachricht und ändere kein weiteres Feld. Nenne die Deals und was du für jeden vorbereitet hast.",
      runs: [
        "3 Deals waren fällig: Antwortentwurf für die Zahnarztpraxis Keller gespeichert und Aufgaben zum Nachfassen für Physiotherapie am Fluss und Bäckerei Weidengasse angelegt, deren Gespräche über WhatsApp und Instagram laufen.",
        "Heute war kein Deal fällig; nichts entworfen oder angelegt.",
        "Antwortentwurf für Kanzlei Mahler & Fink zum zweiten Access Point gespeichert; beim Deal der Zahnarztpraxis Keller gab es schon eine Aufgabe zum Nachfassen.",
      ],
    },
    weeklyNotes: {
      name: "Wochenabschluss: Notizen zu offenen Deals",
      task: "Finde jeden Freitagnachmittag die offenen Deals (alle Phasen außer Gewonnen und Verloren), zu denen es diese Woche ein verknüpftes E-Mail- oder Chat-Gespräch gab. Lies zu jedem das Gespräch und ergänze in den Notizen des Deals einen datierten Absatz: was der Kunde gefragt hat, was wir zugesagt haben und der nächste Schritt. Behalte die vorhandenen Notizen und schreibe in der Wir-Form. Überspringe Deals ohne neues Gespräch und ergänze nie einen zweiten Absatz für dieselbe Woche. Ändere kein weiteres Feld, lege keine Aufgabe an und sende keine Nachricht.",
      runs: [
        "An 5 Deals einen datierten Absatz ergänzt, darunter Zahnarztpraxis Keller, Kanzlei Mahler & Fink und Hotel Seeblick.",
        "An 4 Deals Absätze ergänzt; die Eichenhain Hausverwaltung hatte in der Woche kein neues Gespräch.",
      ],
    },
  },
  webhooks: {
    accounting: {
      description: "Änderungen an Deals und Firmen an die Buchhaltungsbrücke senden",
      url: "https://buchhaltung.lindenhof-it.example/hooks/crm",
    },
    dispatch: {
      description: "Aufgabenänderungen für die Einsatzplanung (pausiert, solange der Empfänger ausfällt)",
      url: "https://einsatzplanung.lindenhof-it.example/hooks/aufgaben",
    },
  },
  threads: {
    mapleProposal: {
      subject: "Netzwerkangebot – zweiter Access Point",
      messages: [
        "Hallo Max,\n\ndanke für die Begehung am Dienstag. Bevor wir unterschreiben: Können Sie noch einen zweiten Access Point für den Besprechungsraum aufnehmen? Dort war das Signal bei Ihrem Besuch schwach.\n\nViele Grüße\nJakob Fink",
        "Hallo Herr Fink,\n\nguter Hinweis. Ich nehme den Access Point samt Verkabelung zum Besprechungsraum auf und schicke das überarbeitete Angebot bis Donnerstag.\n\nViele Grüße\nMax Bergmann",
        "Prima, danke. Frau Mahler stimmt den Installationstermin mit Ihnen ab, sobald wir unterschrieben haben.",
        "Anbei das überarbeitete Angebot mit dem zweiten Access Point. Die Installation dauert einen Tag; wir können sie an einem Freitag machen, damit der Kanzleibetrieb nicht gestört wird.",
      ],
    },
    kesslerRenewal: {
      inventory:
        '<!doctype html><html><head><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><style>:root{color-scheme:light dark}body{margin:0;background:#f4f7fb;color:#1c2733;font-family:-apple-system,\'Segoe UI\',Roboto,Helvetica,Arial,sans-serif}.digest{padding:20px}.title{font-size:18px;font-weight:600;margin:0 0 4px}.lead{color:#52606d;margin:0 0 16px;font-size:14px}.stats{width:100%;border-collapse:separate;border-spacing:8px 0}.stat{background:#ffffff;border:1px solid #dbe3ec;border-radius:10px;padding:12px}.value{font-size:22px;font-weight:600;color:#1f6feb}.label{font-size:12px;color:#52606d}.foot{font-size:12px;color:#7b8794;margin-top:16px}@media (prefers-color-scheme: dark){body{background:#10161d;color:#e6edf3}.lead,.label{color:#9aa7b4}.stat{background:#18212b;border-color:#2b3846}.value{color:#6cb6ff}.foot{color:#7d8a97}}[data-ogsc] .lead{color:#9aa7b4}</style></head><body><div class="digest"><p class="title">Geräteübersicht</p><p class="lead">Hallo Herr Bergmann, hier die aktuelle Geräteliste aus unserem Praxissystem für die Verlängerung.</p><table class="stats" role="presentation"><tr><td class="stat"><div class="value">12</div><div class="label">Arbeitsplätze heute</div></td><td class="stat"><div class="value">2</div><div class="label">Neu im vierten Zimmer</div></td><td class="stat"><div class="value">3</div><div class="label">Drucker</div></td></tr></table><p class="foot">Versendet vom wöchentlichen Inventarbericht des Praxissystems.</p></div></body></html>',
      subject: "Verlängerung der Betreuung und neues Behandlungszimmer",
      messages: [
        "Hallo Herr Bergmann,\n\nunser Betreuungsvertrag verlängert sich nächsten Monat. Außerdem eröffnen wir ein viertes Behandlungszimmer, wir haben also zwei Arbeitsplätze mehr.\n\nKönnen Sie die mit aufnehmen?\n\nDavid Möller",
        "Hallo Herr Möller,\n\nselbstverständlich. Ich passe die Verlängerung auf 14 Arbeitsplätze an und schlage zwei Einsatztage für die Einrichtung des neuen Zimmers vor.\n\nViele Grüße\nMax Bergmann",
        "Klingt gut. Frau Keller möchte die neuen Zahlen sehen, bevor sie unterschreibt.",
      ],
    },
    northgateIntro: {
      messages: [
        "Hallo Herr Bergmann, Noah Hansen von der Physiotherapie am Fluss hat erzählt, dass Sie dort das Netzwerk eingerichtet haben. Bei uns im Lager ist das WLAN ein Problem. Übernehmen Sie auch solche Standorte?",
        "Hallo Herr Claasen, ja, gern. In Lagerhallen braucht es meist ein paar Access Points für den Außenbereich. Kann ich mir das nächste Woche mit Ihnen vor Ort ansehen?",
        "Passt. Mittwochvormittag?",
        "Mittwoch um 9 Uhr ist eingetragen. Ich bringe ein Messgerät mit.",
      ],
    },
    riversideBackup: {
      messages: [
        "Hallo Max, kurze Frage: Ist der Laptop an der Anmeldung auch in der Datensicherung?",
        "Hallo Sophie, noch nicht. Er steht auf der Liste für die Einrichtung der Datensicherung, über die wir gesprochen haben. Ich kann ihn diese Woche aufnehmen.",
        "Super, danke!",
      ],
    },
    harbourviewIntro: {
      letter:
        '<html><head><style>.wrap{font-family:Georgia,\'Times New Roman\',serif;color:#2b2b2b}.band{background:#0f4c5c;color:#ffffff;padding:14px 20px;font-size:13px;letter-spacing:0.08em;text-transform:uppercase}.card{border:1px solid #d9e2e5;padding:18px 20px}.meta td{padding:4px 12px 4px 0;font-size:13px;color:#5b6b70}.meta td.value{color:#1d2b30;font-weight:bold}.note{font-size:12px;color:#7a868a;padding-top:12px}</style></head><body><div class="wrap"><div class="band">Hotel Seeblick &middot; Gästeservice</div><div class="card"><p style="margin:0 0 12px;font-size:15px">Sehr geehrter Herr Bergmann,</p><p style="margin:0 0 12px;font-size:15px">Ihr Name wurde mir vom Steuerbüro Erlenhof empfohlen. Wir sind ein Hotel mit 40 Zimmern, einem kleinen Büro und der Rezeption. Unser bisheriger Dienstleister geht zum Jahresende in den Ruhestand. Hätten Sie Zeit für ein erstes Gespräch?</p><table class="meta" role="presentation"><tr><td>Zimmer</td><td class="value">40</td></tr><tr><td>Rezeption</td><td class="value">Rund um die Uhr besetzt</td></tr><tr><td>Ansprechpartnerin</td><td class="value">Clara Becker, Direktorin</td></tr></table><p class="note">Hotel Seeblick, Steinhude. Diese Nachricht wurde aus dem Postfach unseres Gästeservice gesendet.</p></div></div></body></html>',
      subject: "Anfrage – IT-Betreuung für unser Hotel",
      messages: [
        "Sehr geehrter Herr Bergmann,\n\nIhr Name wurde mir vom Steuerbüro Erlenhof empfohlen. Wir sind ein Hotel mit 40 Zimmern, einem kleinen Büro und der Rezeption. Unser bisheriger Dienstleister geht zum Jahresende in den Ruhestand.\n\nHätten Sie Zeit für ein erstes Gespräch?\n\nMit freundlichen Grüßen\nClara Becker",
        "Sehr geehrte Frau Becker,\n\nvielen Dank für Ihre Nachricht. Sehr gern. Passt Ihnen Montag um 14 Uhr? Ich rufe an der Rezeption an.\n\nMit freundlichen Grüßen\nMax Bergmann",
      ],
    },
    willowInquiry: {
      messages: [
        "Hallo! Wir eröffnen im Frühjahr eine zweite Filiale. Können Sie die Kartenterminals und den Büro-Laptop einrichten?",
        "Hallo Melanie, Netzwerk und Laptop richten wir gern ein. Die Kartenterminals kommen von Ihrem Zahlungsanbieter, wir sorgen aber dafür, dass sie verbunden sind. Soll ich Ihnen zwei Varianten schicken?",
        "Ja, gern! Eröffnung ist für die erste Aprilwoche geplant, alles davor passt.",
      ],
    },
    cobaltFindings: {
      messages: [
        "Max, ist die Sicherheitsprüfung fertig? Wir wollen sie am Freitag im Teammeeting besprechen.",
        "Fast. Der Bericht kommt am Donnerstag: drei schnelle Verbesserungen und ein größerer Punkt zu gemeinsam genutzten Passwörtern.",
        "Super. Können Sie noch eine kurze Zusammenfassung fürs ganze Team ergänzen? Den vollen Bericht lesen nicht alle.",
      ],
    },
    teamInstall: {
      name: "Installation Mahler & Fink",
      messages: [
        "Installation ist bestätigt: nächsten Freitag ab 8 Uhr. Den Besprechungsraum brauchen wir gegen Mittag für etwa eine Stunde.",
        "Prima, ich halte den Besprechungsraum an dem Tag frei.",
        "Danke. Bitte schicken Sie Frau Mahler danach die neuen WLAN-Zugangsdaten.",
      ],
    },
  },
  calendar: {
    name: "Kundentermine",
    events: [
      "Begehung bei Nordtor Logistik",
      "Verlängerung mit der Zahnarztpraxis Keller besprechen",
      "Kennenlernen Hotel Seeblick",
      "Begehung in der Tierarztpraxis Kiefernweg",
      "Prüfbericht mit Kobalt durchgehen",
    ],
  },
  files: {
    quote: {
      title: "Angebot",
      preparedFor: "Erstellt von Lindenhof IT-Service für",
      lineItems: "Positionen",
      columns: ["Leistung", "Menge", "Einzelpreis", "Betrag"],
      total: "Summe",
      notes: "Hinweise",
      terms:
        "IT-Betreuung kostet pro Arbeitsplatz und Jahr, Projekte zum Festpreis. Alle Preise zzgl. MwSt. Das Angebot gilt 30 Tage.",
    },
    quotes: {
      mapleNetwork: [
        "LH-2026-014",
        "Angebot LH-2026-014 – Netzwerk Mahler & Fink.pdf",
        "Überarbeitet nach der Begehung: Die Netzwerkeinrichtung enthält jetzt einen zweiten Access Point für den Besprechungsraum samt Verkabelung. Die Installation dauert einen Tag vor Ort, an einem Freitag, damit der Kanzleibetrieb nicht gestört wird.",
      ],
      kesslerSupport: [
        "LH-2026-011",
        "Angebot LH-2026-011 – Verlängerung Zahnarztpraxis Keller.pdf",
        "Verlängerung für 14 Arbeitsplätze, einschließlich der zwei neuen im vierten Behandlungszimmer. Der Vorjahrespreis pro Arbeitsplatz bleibt.",
      ],
      cobaltSecurity: [
        "LH-2026-006",
        "Angebot LH-2026-006 – Sicherheitsprüfung Kobalt.pdf",
        "Prüfung von Konten, gemeinsam genutzten Passwörtern, Datensicherung und Agenturnetzwerk mit schriftlichem Prüfbericht und einer Zusammenfassung fürs ganze Team.",
      ],
      brookfieldMigration: [
        "LH-2026-009",
        "Angebot LH-2026-009 – E-Mail-Umzug Architekturbüro Brandt.pdf",
        "Umzug aller Postfächer in die Cloud an einem Wochenende, mit einer einseitigen Anleitung fürs Team am Montagmorgen.",
      ],
      riversideSupport: [
        "LH-2025-031",
        "Angebot LH-2025-031 – Betreuung Physiotherapie am Fluss.pdf",
        "IT-Betreuung für 8 Arbeitsplätze, einschließlich des Laptops an der Anmeldung.",
      ],
    },
    inventory: {
      name: "Netzwerkinventar – Zahnarztpraxis Keller.xlsx",
      header: ["Gerät", "Raum", "Art", "Baujahr", "Hinweis"],
      rows: [
        ["AP-01", "Empfang", "Arbeitsplatz", "2023", ""],
        ["AP-02", "Empfang", "Arbeitsplatz", "2023", ""],
        ["AP-03", "Behandlungszimmer 1", "Arbeitsplatz", "2022", ""],
        ["AP-04", "Behandlungszimmer 2", "Arbeitsplatz", "2022", ""],
        ["AP-05", "Behandlungszimmer 3", "Arbeitsplatz", "2024", ""],
        ["AP-13", "Behandlungszimmer 4", "Arbeitsplatz", "neu", "Einrichtung mit der Verlängerung"],
        ["AP-14", "Behandlungszimmer 4", "Arbeitsplatz", "neu", "Einrichtung mit der Verlängerung"],
        ["WL-01", "Flur", "Access Point", "2021", "Schwaches Signal in Zimmer 4"],
        ["DR-01", "Empfang", "Drucker", "2020", ""],
      ],
    },
    siteNotes: {
      name: "Begehungsnotizen – Nordtor.md",
      lines: [
        "# Begehungsnotizen – Nordtor Logistik",
        "Begehung des Lagers mit Erik Claasen, Messgerät vor Ort.",
        "",
        "## Was wir gesehen haben",
        "- Büro: 12 Arbeitsplätze und ein Access Point; das Signal reicht.",
        "- Lagerhalle: keine Abdeckung hinter den Regalen 7 bis 12, die Handscanner brechen ab.",
        "- Büro an der Laderampe: schwaches Signal, braucht einen zweiten Access Point.",
        "",
        "## Vorschlag",
        "- Zwei Access Points für den Außenbereich in der Halle und ein zweiter Access Point für das Büro an der Laderampe.",
        "- IT-Betreuung für 20 Arbeitsplätze, sobald das Netzwerk steht.",
        "",
        "## Offene Fragen",
        "- Power over Ethernet in der Halle: Erik klärt das mit dem Vermieter.",
      ],
    },
  },
  trash: ["Jakob Fink (Duplikat)", "Gipfel Ingenieure – Druckernetzwerk"],
  mateChat: {
    title: "Was braucht diese Woche meine Aufmerksamkeit?",
    messages: [
      "Was braucht diese Woche meine Aufmerksamkeit?",
      "Drei Punkte fallen auf.\n\n1. **Überfälliger nächster Schritt:** Für die Verlängerung bei der Zahnarztpraxis Keller (6.720 €, Angebot gesendet) fehlt noch die bestätigte Zahl der Arbeitsplätze von Herrn Möller.\n2. **Überfällige Aufgaben:** die Prüfung der Sicherungsprotokolle für die Physiotherapie am Fluss und die Rückfrage des Steuerbüros Erlenhof zur Projektrechnung, die blockiert ist.\n3. **Einsätze vor Ort:** die neue Filiale der Bäckerei Weidengasse, die Rezeption im Hotel Seeblick und die zweite Lagerbegehung bei Nordtor stehen im Kalender „Einsätze vor Ort“.\n\nDas Netzwerkangebot für Mahler & Fink (3.950 €) hat seinen nächsten Schritt in zwei Tagen, deshalb würde ich zuerst das überarbeitete Angebot schicken.",
      "Entwirf das Nachfassen zum Angebot für Mahler & Fink",
      "Ich habe das Angebot LH-2026-014 am Deal gelesen: Einrichtung Büronetzwerk 3.200 €, jetzt mit dem zweiten Access Point für den Besprechungsraum, dazu ein Einsatztag vor Ort für 750 €, zusammen 3.950 €, gültig 30 Tage. Hier ein Entwurf für Herrn Fink:\n\nHallo Herr Fink,\n\nwie besprochen enthält das überarbeitete Angebot LH-2026-014 jetzt den zweiten Access Point samt Verkabelung zum Besprechungsraum. Die Summe beträgt 3.950 €: Netzwerkeinrichtung 3.200 € und ein Installationstag vor Ort 750 €. Die Installation können wir an einem Freitag machen, damit der Kanzleibetrieb nicht gestört wird. Soll ich mit Frau Mahler einen Termin abstimmen?\n\nViele Grüße\nMax Bergmann\n\nIch habe nichts gesendet; der Entwurf liegt zur Prüfung bereit.",
    ],
  },
  inbox: {
    alderInvoice: {
      subject: "Rückfrage zur letzten Rechnung",
      messages: [
        "Hallo Herr Bergmann,\n\nich schließe gerade den Monat ab und habe eine Frage zur letzten Rechnung. Dort steht ein Einsatztag am 3., den ich nicht zuordnen kann. Können Sie nachsehen, wofür der war?\n\nVielen Dank\nDaniel Richter",
        "Hallo Herr Richter,\n\ndanke für den Hinweis. Ich kläre das mit Laura, die die Rechnung vorbereitet hat, und melde mich bis Freitag.\n\nViele Grüße\nMax Bergmann",
        "Danke. Ich muss am Montag abschließen, früher ist also besser.",
        "Hallo Herr Richter,\n\nLaura hat es gefunden: Der Tag war der Wiederherstellungstest Ihrer Datensicherung nach dem E-Mail-Umzug, den Sie telefonisch beauftragt hatten. Den Bericht zu diesem Tag schicke ich Ihnen in einer eigenen E-Mail. Wenn trotzdem etwas nicht stimmt, sagen Sie es mir, dann korrigieren wir die Rechnung.\n\nViele Grüße\nMax Bergmann",
      ],
    },
    oakridgeInquiry: {
      subject: "IT-Betreuung für unsere drei Büros",
      messages: [
        "Hallo Herr Bergmann,\n\nich habe Sie über Ihre Website gefunden. Die Eichenhain Hausverwaltung hat drei kleine Büros mit zusammen 16 Arbeitsplätzen, und unser IT-Betreuer verlässt uns im März. Was würde die IT-Betreuung ungefähr pro Jahr kosten? Nächsten Mittwoch haben wir unsere Budgetrunde.\n\nViele Grüße\nAmelie Roth",
        "Hallo Frau Roth,\n\nvielen Dank für Ihre Nachricht. Die IT-Betreuung kostet 480 € pro Arbeitsplatz und Jahr, bei 16 Arbeitsplätzen also 7.680 € im Jahr, jeweils zuzüglich MwSt. Ich würde mir die drei Büros gern ansehen, bevor wir etwas festlegen, vor allem Netzwerk und Datensicherung. Diesen Termin kalkuliere ich Ihnen gesondert.\n\nViele Grüße\nMax Bergmann",
        "Das hilft, danke. Gehören auch die Drucker und die gemeinsamen Postfächer dazu oder nur die Arbeitsplätze?",
        "Hallo Frau Roth,\n\ndazu gehören die Arbeitsplätze, das Büronetzwerk, die Drucker und die E-Mail einschließlich gemeinsamer Postfächer. Handys gehören nicht dazu. Sollen wir uns zuerst die drei Büros gemeinsam ansehen?\n\nViele Grüße\nMax Bergmann",
        "Ja, gern. Donnerstagnachmittag in unserem Büro in Isernhagen passt mir am besten, die anderen beiden zeige ich Ihnen am selben Tag.",
      ],
    },
    pinecrestMailboxes: {
      subject: "Postfächer für den Umzug",
      messages: [
        "Hallo Frau Wolf,\n\nbevor ich nächste Woche vorbeikomme: Können Sie die Postfächer zählen, auch gemeinsame wie die Anmeldung? Das hilft mir, das Umzugswochenende zu planen.\n\nViele Grüße\nMax Bergmann",
        "Hallo Herr Bergmann,\n\nich habe 12 gezählt: zehn Postfächer der Mitarbeitenden plus Anmeldung und Abrechnung. Das der Anmeldung ist riesig, weil dort seit Jahren die Praxis-E-Mails liegen. Ändert das etwas am Angebot?\n\nEmma Wolf",
        "Hallo Frau Wolf,\n\nvielen Dank, das hilft. Der Umzug hat einen Festpreis pro Projekt, 12 Postfächer sind also in Ordnung. Ein großes Postfach an der Anmeldung heißt nur, dass die Übertragung länger dauert. Ich plane das deshalb für ein Wochenende und prüfe die echten Größen vor Ort.\n\nViele Grüße\nMax Bergmann",
        "Prima. Noch eine Frage: Unsere Praxissoftware verschickt Termin-E-Mails von der alten Adresse. Funktioniert das nach dem Umzug weiter?",
        "Hallo Frau Wolf,\n\nja. Die Praxissoftware versendet heute über den alten Mailserver. Ich stelle sie am Umzugswochenende auf die neuen Postfächer um und schicke am Montagmorgen eine Test-E-Mail zum Termin. In der Software müssen Sie nichts ändern.\n\nViele Grüße\nMax Bergmann",
      ],
    },
    brookfieldWorkstations: {
      subject: "Zwei neue Arbeitsplätze",
      messages: [
        "Hallo Herr Bergmann,\n\nder E-Mail-Umzug lief reibungslos, vielen Dank. Frau Martens sagt, es ist keine Nachricht verloren gegangen. Zum 1. fangen zwei neue Mitarbeitende an, wir brauchen also zwei Arbeitsplätze mehr im Betreuungsvertrag. Was ändert sich auf der Rechnung?\n\nOlivia Brandt",
        "Hallo Frau Brandt,\n\nschön zu hören. Die zwei neuen Arbeitsplätze kosten dasselbe wie bisher, 480 € pro Arbeitsplatz und Jahr, für den Rest der laufenden Laufzeit also 960 €. Ich nehme sie heute in den Vertrag auf.\n\nViele Grüße\nMax Bergmann",
        "Danke. Kann Frau Martens die Laptops mit Ihrer Anleitung selbst einrichten, oder kommen Sie vorbei?",
        "Hallo Frau Brandt,\n\nFrau Martens kann das mit einer kurzen Checkliste von mir übernehmen, ich würde beide Laptops aber lieber an einem Tag vor Ort einrichten, damit sie zu den anderen passen. Das ist ein Einsatztag für 750 €. Soll ich ihn für den 1. einplanen, bevor die neuen Mitarbeitenden anfangen?\n\nViele Grüße\nMax Bergmann",
      ],
    },
    noahLinkedin: {
      messages: [
        "Hallo Herr Bergmann, Erik Claasen sagt, Sie begehen nächste Woche sein Lager. Danke, dass Sie ihn übernehmen, der Funkschatten hinter den Regalen ist wirklich real :)",
        "Danke, Herr Hansen! Und nochmals danke für die Empfehlung. Mit Herrn Claasen arbeitet es sich gut.",
        "Das stimmt. Übrigens: Unser Gäste-WLAN im Wartebereich ist seit Montag langsam. Könnten Sie sich das ansehen, wenn Sie für den Wiederherstellungstest hier sind?",
        "Gern, ich nehme es in den Besuch mit auf. Welcher Router hängt im Wartebereich?",
        "Nur der graue Kasten von unserem alten Anbieter. Ich schicke Ihnen ein Foto.",
        "Gute Idee, ich bringe zur Sicherheit einen Ersatz-Access-Point mit.",
      ],
    },
    owenLinkedin: {
      messages: [
        "Hallo Herr Bergmann, wir betreuen die IT seit dem Sommer selbst, und das kostet mich mehr Zeit als gedacht. Wären Sie offen für ein Gespräch über ein kleineres Betreuungspaket, vor allem für Drucker und Datensicherung?",
        "Hallo Herr Friedrich, schön, von Ihnen zu hören. Gern, und ein kleineres Paket ist leicht zu kalkulieren. Würde Ihnen ein kurzes Telefonat diese Woche passen?",
        "Donnerstagnachmittag passt. Ich schreibe auf, was wir noch selbst betreiben, dann können Sie es kalkulieren.",
      ],
    },
    harbourviewInstagram: {
      messages: [
        "Hallo Max! Ihr Beitrag über die Bäckerei Weidengasse hat uns gefallen. Unsere Gäste beschweren sich über das WLAN im zweiten Stock. Lässt sich das in einem Hotel auch lösen?",
        "Hallo Frau Becker, danke! Ja, vor allem eine Frage der Abdeckung: meist ein Access Point pro Etage und ein eigenes Gästenetz. Den zweiten Stock sehe ich mir bei der Begehung an.",
        "Perfekt. Herr Peters von der Haustechnik zeigt Ihnen die Zimmer mit dem schlechtesten Empfang.",
        "Prima, ich melde mich bei ihm. Bis Mittwoch!",
      ],
    },
    harbourviewTelegram: {
      messages: [
        "Hallo Herr Bergmann, Ruben Peters vom Hotel Seeblick. Frau Becker hat mich gebeten, die Begehung mit Ihnen abzustimmen. Der Verteilerschrank steht im Keller, ich habe den Schlüssel.",
        "Hallo Herr Peters, prima, danke. Mittwoch um 14 Uhr passt mir. Ich möchte mir den Schrank, die Rezeption und die Zimmer mit dem schlechtesten WLAN ansehen.",
        "Mittwoch 14 Uhr ist in Ordnung. Die Kellertür ist neben der Laderampe, ich warte dort auf Sie.",
        "Perfekt, bis dann an der Rampe. Ich bringe einen Laptop und ein Netzwerk-Messgerät mit.",
      ],
    },
  },
  notes: {
    kesslerSupport:
      "Zusammenfassung von Claude nach dem Verlängerungsgespräch:\nDavid Möller hat 14 Arbeitsplätze bestätigt: die 12 aus dem Inventar plus zwei für das vierte Behandlungszimmer.\nHanna Keller unterschreibt, sobald sie die Zusammenfassung zur Verlängerung mit dem Vorjahrespreis pro Arbeitsplatz hat.\nOffen: den nächsten Schritt dieses Deals von der Bestätigung der Anzahl auf den Versand der Zusammenfassung ändern.\nZugesagt: Die Zusammenfassung geht noch diese Woche an Frau Keller.",
    cobaltSecurity:
      "Entwurf von ChatGPT aus dem Prüfbericht, als einseitige Zusammenfassung für das ganze Team der Kobalt Werbeagentur:\nDrei schnelle Verbesserungen: Zwei-Faktor-Anmeldung einschalten, zwei alte Konten entfernen, die Datensicherung einmal im Monat prüfen.\nEin größerer Punkt: Passwörter nicht mehr im Chat teilen, sondern in einem Passwortmanager ablegen.\nLukas Graf hat die Zusammenfassung vor dem Teammeeting an alle weitergeleitet.",
    willowSetup:
      "Varianten entworfen von ChatGPT nach der Nachricht von Melanie Hoffmann:\nVariante A: Netzwerkeinrichtung plus zwei Einsatztage (4.700 €), Filiale und Büro in einem Zug vor der Eröffnung.\nVariante B: Netzwerkeinrichtung plus ein Einsatztag (3.950 €), der Büro-Laptop folgt nach der Eröffnung.\nDie Kartenterminals kommen vom Zahlungsanbieter, wir verbinden sie nur.\nBeide Varianten brauchen die Schlüssel der Filiale bis Ende März.",
    james:
      "Zusammengeführt von Codex (Skriptlauf auf dem CSV-Export des alten Adressbuchs):\nDer doppelte Kontakt Jakob Fink (Duplikat) wurde in den Papierkorb verschoben.\nE-Mail und Handynummer waren identisch, es wurde nichts überschrieben.\nDeals und Gespräche bleiben mit diesem Datensatz verknüpft.",
    invoiceQuestion:
      "Angelegt von Claude aus der E-Mail von Daniel Richter zur letzten Rechnung:\nEr kann den Einsatztag am 3. nicht zuordnen.\nBlockiert, bis Laura im Rechnungsprogramm bestätigt, wofür der Tag war.\nEin Antwortentwurf liegt im Posteingang.",
  },
  agents: {
    company: "Lindenhof IT-Service",
    records: "Firmen, Kontakte, Deals und Aufgaben",
    mate: "Der Assistent beantwortet Fragen zur Pipeline, entwirft Antworten auf Kundenmails und legt Aufgaben an, wenn wir darum bitten.",
    claude:
      "Max setzt Claude nach einem Kundengespräch ein, um eine Zusammenfassung in die Notizen des Deals zu schreiben und die ganze Pipeline zu überblicken.",
    chatgpt:
      "Wir setzen ChatGPT ein, um aus einem technischen Prüfbericht eine kurze Zusammenfassung zu machen, die das ganze Team des Kunden lesen kann.",
    codex:
      "Codex lässt Skripte auf Exporten aus unseren alten Systemen laufen, zum Beispiel um doppelte Kontakte zusammenzuführen, und schreibt in die Notizen, was geändert wurde.",
    followUp:
      "Die Routine „Jeden Morgen Nachfass-Entwürfe für fällige Deals“ läuft werktags um 8:00 Uhr und gehört Max. Für jeden offenen Deal, dessen Datum nächster Schritt heute oder früher ist, speichert sie einen Antwortentwurf zur letzten Kundenmail oder, wenn das Gespräch über WhatsApp, Instagram oder Telegram läuft, eine Aufgabe zum Nachfassen. Die Entwürfe warten im Posteingang, bis eine Person sie gelesen hat; die Routine sendet nie etwas.",
  },
  mateChatWalkthrough: {
    title: "Begehung im Hotel Seeblick",
    messages: [
      "Clara Becker vom Hotel Seeblick hat die Begehung der Rezeption für Mittwoch um 14 Uhr bestätigt. Leg eine Aufgabe dafür an, verknüpft mit dem Deal und mit ihr, und setze das Datum des nächsten Schritts im Deal auf denselben Tag.",
      "Erledigt. Ich habe die Aufgabe **Rezeption im Hotel Seeblick gemeinsam durchgehen** angelegt (mittlere Priorität, Verantwortlicher Max, geplant Mittwoch von 14:00 bis 15:30 Uhr) und mit **Hotel Seeblick – IT-Betreuung** und Clara Becker verknüpft. Außerdem habe ich das Datum des nächsten Schritts im Deal auf Mittwoch gesetzt. Sonst habe ich nichts geändert und keine Nachricht gesendet.",
      "Welche anderen Deals haben heute einen nächsten Schritt?",
      "Zwei: **Physiotherapie am Fluss – Datensicherung** (Termin für den Wiederherstellungstest abstimmen) und **Bäckerei Weidengasse – Filiale und Büro einrichten** (Melanie zwei Varianten schicken). Die letzte Nachricht von Melanie Hoffmann ist noch unbeantwortet, und die Varianten, die ChatGPT entworfen hat, stehen in den Notizen des Deals. Ich habe diese Datensätze nur gelesen, nichts wurde geändert.",
    ],
  },
};

const ORGANIZATION_FACTS: Record<
  OrganizationKey,
  {
    industry: string;
    status: string;
    employees: number;
    domain: string;
    createdDaysAgo: number;
    owner: "sofiaRossi" | "claraNeumann" | "marcoSilva" | "maxBergmann";
  }
> = {
  kessler: {
    industry: "healthcare",
    status: "customer",
    employees: 14,
    domain: "kessler-dental.example",
    createdDaysAgo: 520,
    owner: "claraNeumann",
  },
  brookfield: {
    industry: "architecture",
    status: "customer",
    employees: 22,
    domain: "brookfield-architects.example",
    createdDaysAgo: 480,
    owner: "sofiaRossi",
  },
  maple: {
    industry: "legal",
    status: "prospect",
    employees: 11,
    domain: "maplefinch.example",
    createdDaysAgo: 120,
    owner: "marcoSilva",
  },
  northgate: {
    industry: "logistics",
    status: "prospect",
    employees: 35,
    domain: "northgate-logistics.example",
    createdDaysAgo: 40,
    owner: "sofiaRossi",
  },
  riverside: {
    industry: "healthcare",
    status: "customer",
    employees: 8,
    domain: "riverside-physio.example",
    createdDaysAgo: 400,
    owner: "claraNeumann",
  },
  alder: {
    industry: "finance",
    status: "customer",
    employees: 9,
    domain: "alder-accounting.example",
    createdDaysAgo: 300,
    owner: "marcoSilva",
  },
  harbourview: {
    industry: "hospitality",
    status: "prospect",
    employees: 26,
    domain: "harbourview-hotel.example",
    createdDaysAgo: 12,
    owner: "maxBergmann",
  },
  summit: {
    industry: "engineering",
    status: "former",
    employees: 18,
    domain: "summit-engineering.example",
    createdDaysAgo: 360,
    owner: "sofiaRossi",
  },
  willow: {
    industry: "retail",
    status: "prospect",
    employees: 12,
    domain: "willowstreet-bakery.example",
    createdDaysAgo: 20,
    owner: "marcoSilva",
  },
  cobalt: {
    industry: "marketing",
    status: "customer",
    employees: 15,
    domain: "cobalt-studio.example",
    createdDaysAgo: 260,
    owner: "claraNeumann",
  },
  pinecrest: {
    industry: "healthcare",
    status: "prospect",
    employees: 10,
    domain: "pinecrest-vet.example",
    createdDaysAgo: 75,
    owner: "marcoSilva",
  },
  oakridge: {
    industry: "property",
    status: "prospect",
    employees: 16,
    domain: "oakridge-property.example",
    createdDaysAgo: 30,
    owner: "sofiaRossi",
  },
};

const CONTACT_FACTS: Record<
  ContactKey,
  {
    organization: OrganizationKey;
    role: string;
    createdDaysAgo: number;
    phone?: string;
    linkedin?: boolean;
    whatsapp?: boolean;
    instagram?: string;
    telegram?: string;
  }
> = {
  hannah: { organization: "kessler", role: "decisionMaker", createdDaysAgo: 515 },
  david: { organization: "kessler", role: "influencer", createdDaysAgo: 515, phone: "01" },
  olivia: {
    organization: "brookfield",
    role: "decisionMaker",
    createdDaysAgo: 478,
    linkedin: true,
  },
  james: {
    organization: "maple",
    role: "decisionMaker",
    createdDaysAgo: 118,
    phone: "05",
    whatsapp: true,
  },
  grace: { organization: "maple", role: "user", createdDaysAgo: 118, phone: "04", whatsapp: true },
  ethan: {
    organization: "northgate",
    role: "decisionMaker",
    createdDaysAgo: 38,
    linkedin: true,
  },
  sophie: {
    organization: "riverside",
    role: "decisionMaker",
    createdDaysAgo: 398,
    phone: "02",
    whatsapp: true,
  },
  daniel: { organization: "alder", role: "influencer", createdDaysAgo: 296 },
  chloe: {
    organization: "harbourview",
    role: "decisionMaker",
    createdDaysAgo: 11,
    instagram: "harbourview.hotel",
  },
  ryan: { organization: "harbourview", role: "user", createdDaysAgo: 11, telegram: "ryan_harbourview" },
  megan: {
    organization: "willow",
    role: "decisionMaker",
    createdDaysAgo: 19,
    phone: "06",
    whatsapp: true,
    instagram: "willowstreet.bakery",
  },
  lucas: {
    organization: "cobalt",
    role: "decisionMaker",
    createdDaysAgo: 255,
    phone: "03",
    whatsapp: true,
    telegram: "lucas_cobalt",
  },
  emma: { organization: "pinecrest", role: "decisionMaker", createdDaysAgo: 74 },
  noah: { organization: "riverside", role: "user", createdDaysAgo: 390, linkedin: true },
  isla: { organization: "brookfield", role: "user", createdDaysAgo: 470 },
  owen: { organization: "summit", role: "influencer", createdDaysAgo: 355, linkedin: true },
  amelia: { organization: "oakridge", role: "decisionMaker", createdDaysAgo: 29 },
  liam: { organization: "kessler", role: "user", createdDaysAgo: 200 },
};

type DealFacts = {
  organization: OrganizationKey;
  contacts: ContactKey[];
  stage: string;
  source: string;
  lines: Array<[ServiceKey, number]>;
  createdDaysAgo: number;
  close: number;
  next?: number;
  lost?: string;
  owner: "sofiaRossi" | "claraNeumann" | "marcoSilva" | "maxBergmann";
  history?: Array<{ daysAgo: number; stage: string }>;
};

const DEAL_FACTS: Record<DealKey, DealFacts> = {
  kesslerSupport: {
    organization: "kessler",
    contacts: ["david", "hannah"],
    stage: "proposal",
    source: "existing",
    lines: [["managedSupport", 14]],
    createdDaysAgo: 35,
    close: 21,
    next: -2,
    owner: "claraNeumann",
    history: [
      { daysAgo: 20, stage: "qualified" },
      { daysAgo: 6, stage: "conversation" },
    ],
  },
  mapleNetwork: {
    organization: "maple",
    contacts: ["james", "grace"],
    stage: "proposal",
    source: "referral",
    lines: [
      ["networkSetup", 1],
      ["onsiteDay", 1],
    ],
    createdDaysAgo: 110,
    close: 10,
    next: 2,
    owner: "marcoSilva",
    history: [
      { daysAgo: 60, stage: "qualified" },
      { daysAgo: 14, stage: "conversation" },
    ],
  },
  northgateRollout: {
    organization: "northgate",
    contacts: ["ethan"],
    stage: "conversation",
    source: "referral",
    lines: [
      ["networkSetup", 2],
      ["managedSupport", 20],
    ],
    createdDaysAgo: 36,
    close: 45,
    next: 11,
    owner: "sofiaRossi",
    history: [{ daysAgo: 20, stage: "qualified" }],
  },
  harbourviewSupport: {
    organization: "harbourview",
    contacts: ["chloe"],
    stage: "new",
    source: "referral",
    lines: [["managedSupport", 12]],
    createdDaysAgo: 10,
    close: 60,
    next: 3,
    owner: "maxBergmann",
  },
  riversideBackup: {
    organization: "riverside",
    contacts: ["sophie"],
    stage: "qualified",
    source: "existing",
    lines: [["backupSetup", 1]],
    createdDaysAgo: 24,
    close: 20,
    next: 0,
    owner: "claraNeumann",
  },
  willowSetup: {
    organization: "willow",
    contacts: ["megan"],
    stage: "new",
    source: "website",
    lines: [
      ["networkSetup", 1],
      ["onsiteDay", 2],
    ],
    createdDaysAgo: 18,
    close: 75,
    next: 0,
    owner: "marcoSilva",
  },
  cobaltSecurity: {
    organization: "cobalt",
    contacts: ["lucas"],
    stage: "won",
    source: "existing",
    lines: [["securityReview", 1]],
    createdDaysAgo: 70,
    close: -25,
    owner: "claraNeumann",
    history: [{ daysAgo: 40, stage: "proposal" }],
  },
  pinecrestMigration: {
    organization: "pinecrest",
    contacts: ["emma"],
    stage: "qualified",
    source: "event",
    lines: [
      ["emailMigration", 1],
      ["onsiteDay", 1],
    ],
    createdDaysAgo: 70,
    close: 30,
    next: 13,
    owner: "marcoSilva",
  },
  oakridgeSupport: {
    organization: "oakridge",
    contacts: ["amelia"],
    stage: "new",
    source: "website",
    lines: [["managedSupport", 16]],
    createdDaysAgo: 28,
    close: 90,
    next: 16,
    owner: "sofiaRossi",
  },
  brookfieldRenewal: {
    organization: "brookfield",
    contacts: ["olivia"],
    stage: "won",
    source: "existing",
    lines: [["managedSupport", 22]],
    createdDaysAgo: 160,
    close: -120,
    owner: "sofiaRossi",
    history: [{ daysAgo: 125, stage: "proposal" }],
  },
  alderMigration: {
    organization: "alder",
    contacts: ["daniel"],
    stage: "won",
    source: "referral",
    lines: [
      ["emailMigration", 1],
      ["backupSetup", 1],
    ],
    createdDaysAgo: 220,
    close: -180,
    owner: "marcoSilva",
    history: [{ daysAgo: 190, stage: "proposal" }],
  },
  summitNetwork: {
    organization: "summit",
    contacts: ["owen"],
    stage: "lost",
    source: "event",
    lines: [["networkSetup", 1]],
    createdDaysAgo: 200,
    close: -150,
    lost: "inHouse",
    owner: "sofiaRossi",
    history: [{ daysAgo: 160, stage: "proposal" }],
  },
  kesslerOnsite: {
    organization: "kessler",
    contacts: ["david"],
    stage: "conversation",
    source: "existing",
    lines: [["onsiteDay", 2]],
    createdDaysAgo: 8,
    close: 25,
    next: 19,
    owner: "claraNeumann",
  },
  kesslerFirstYear: {
    organization: "kessler",
    contacts: ["hannah", "david"],
    stage: "won",
    source: "existing",
    lines: [["managedSupport", 14]],
    createdDaysAgo: 365,
    close: -335,
    owner: "claraNeumann",
    history: [{ daysAgo: 350, stage: "proposal" }],
  },
  riversideSupport: {
    organization: "riverside",
    contacts: ["sophie"],
    stage: "won",
    source: "referral",
    lines: [["managedSupport", 8]],
    createdDaysAgo: 315,
    close: -285,
    owner: "claraNeumann",
    history: [{ daysAgo: 300, stage: "proposal" }],
  },
  alderSupport: {
    organization: "alder",
    contacts: ["daniel"],
    stage: "won",
    source: "referral",
    lines: [
      ["managedSupport", 9],
      ["onsiteDay", 1],
    ],
    createdDaysAgo: 250,
    close: -215,
    owner: "marcoSilva",
    history: [{ daysAgo: 230, stage: "proposal" }],
  },
  cobaltNetwork: {
    organization: "cobalt",
    contacts: ["lucas"],
    stage: "won",
    source: "website",
    lines: [
      ["networkSetup", 1],
      ["onsiteDay", 1],
    ],
    createdDaysAgo: 190,
    close: -150,
    owner: "marcoSilva",
    history: [{ daysAgo: 165, stage: "proposal" }],
  },
  brookfieldMigration: {
    organization: "brookfield",
    contacts: ["isla"],
    stage: "won",
    source: "existing",
    lines: [["emailMigration", 1]],
    createdDaysAgo: 40,
    close: -8,
    owner: "sofiaRossi",
    history: [{ daysAgo: 20, stage: "proposal" }],
  },
  summitRenewal: {
    organization: "summit",
    contacts: ["owen"],
    stage: "lost",
    source: "existing",
    lines: [["managedSupport", 18]],
    createdDaysAgo: 100,
    close: -70,
    lost: "price",
    owner: "sofiaRossi",
    history: [{ daysAgo: 85, stage: "proposal" }],
  },
  pinecrestSecurity: {
    organization: "pinecrest",
    contacts: ["emma"],
    stage: "lost",
    source: "event",
    lines: [["securityReview", 1]],
    createdDaysAgo: 70,
    close: -35,
    lost: "timing",
    owner: "marcoSilva",
    history: [{ daysAgo: 50, stage: "conversation" }],
  },
};

const SERVICE_PRICES: Record<ServiceKey, number> = {
  managedSupport: 480,
  networkSetup: 3200,
  securityReview: 1800,
  emailMigration: 2400,
  onsiteDay: 750,
  backupSetup: 1500,
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
    owner:
      | "sofiaRossi"
      | "claraNeumann"
      | "marcoSilva"
      | "maxBergmann"
      | "kianRahimi"
      | "lauraFischer"
      | "elenaHoffmann";
    createdDaysAgo: number;
    done?: number;
    /** An on-site visit: story day, local start time and length in minutes. */
    visit?: [number, string, number];
  }
> = {
  sendRevisedProposal: {
    status: "inProgress",
    priority: "high",
    due: 2,
    deal: "mapleNetwork",
    contact: "james",
    owner: "marcoSilva",
    createdDaysAgo: 6,
  },
  bookSiteVisit: {
    status: "done",
    priority: "medium",
    due: -3,
    deal: "northgateRollout",
    contact: "ethan",
    owner: "sofiaRossi",
    createdDaysAgo: 12,
    done: 4,
    visit: [-4, "09:00", 120],
  },
  checkBackupLogs: {
    status: "open",
    priority: "medium",
    due: -3,
    organization: "riverside",
    owner: "kianRahimi",
    createdDaysAgo: 5,
    visit: [-3, "10:00", 60],
  },
  prepareRenewal: {
    status: "inProgress",
    priority: "high",
    due: 4,
    deal: "kesslerSupport",
    contact: "hannah",
    owner: "claraNeumann",
    createdDaysAgo: 9,
  },
  callNorthgate: {
    status: "open",
    priority: "medium",
    due: 6,
    deal: "northgateRollout",
    contact: "ethan",
    owner: "sofiaRossi",
    createdDaysAgo: 3,
    visit: [6, "09:00", 120],
  },
  migrationPlan: {
    status: "open",
    priority: "medium",
    due: 8,
    deal: "pinecrestMigration",
    contact: "emma",
    owner: "marcoSilva",
    createdDaysAgo: 10,
    visit: [8, "10:30", 90],
  },
  securityFindings: {
    status: "done",
    priority: "high",
    due: -20,
    deal: "cobaltSecurity",
    contact: "lucas",
    owner: "claraNeumann",
    createdDaysAgo: 30,
    done: 21,
  },
  onboardingCall: {
    status: "done",
    priority: "low",
    due: -45,
    organization: "brookfield",
    contact: "isla",
    owner: "elenaHoffmann",
    createdDaysAgo: 60,
    done: 46,
  },
  invoiceQuestion: {
    status: "blocked",
    priority: "medium",
    due: -4,
    organization: "alder",
    contact: "daniel",
    owner: "lauraFischer",
    createdDaysAgo: 7,
  },
  followUpWillow: {
    status: "open",
    priority: "high",
    due: 0,
    deal: "willowSetup",
    contact: "megan",
    owner: "marcoSilva",
    createdDaysAgo: 2,
    visit: [1, "15:00", 60],
  },
  priceListReview: { status: "open", priority: "low", due: 20, owner: "maxBergmann", createdDaysAgo: 15 },
  hotelWalkthrough: {
    status: "open",
    priority: "medium",
    due: 3,
    deal: "harbourviewSupport",
    contact: "chloe",
    owner: "maxBergmann",
    createdDaysAgo: 1,
    visit: [3, "14:00", 90],
  },
  mapleInstall: {
    status: "open",
    priority: "medium",
    due: 9,
    deal: "mapleNetwork",
    contact: "grace",
    owner: "kianRahimi",
    createdDaysAgo: 2,
    visit: [9, "08:00", 180],
  },
  kesslerRoomSetup: {
    status: "open",
    priority: "medium",
    due: 12,
    deal: "kesslerOnsite",
    contact: "david",
    owner: "kianRahimi",
    createdDaysAgo: 1,
    visit: [12, "09:00", 180],
  },
};

const INBOX_PLANS: InboxThreadPlan[] = [
  {
    key: "alderInvoice",
    account: "outlook",
    with: ["daniel"],
    state: "open",
    latestMinutesAgo: 480,
    speakers: ["daniel", "self", "daniel", "self"],
    draft: true,
    links: ["deal:alderSupport", "organization:alder"],
  },
  {
    key: "oakridgeInquiry",
    account: "outlook",
    with: ["amelia"],
    state: "open",
    latestMinutesAgo: 1320,
    speakers: ["amelia", "self", "amelia", "self", "amelia"],
    links: ["deal:oakridgeSupport", "organization:oakridge"],
  },
  {
    key: "pinecrestMailboxes",
    account: "google",
    with: ["emma"],
    state: "unread",
    latestMinutesAgo: 110,
    speakers: ["self", "emma", "self", "emma", "self"],
    draft: true,
    links: ["deal:pinecrestMigration", "organization:pinecrest"],
  },
  {
    key: "brookfieldWorkstations",
    account: "google",
    with: ["olivia"],
    state: "open",
    latestMinutesAgo: 1800,
    speakers: ["olivia", "self", "olivia", "self"],
    draft: true,
    links: ["deal:brookfieldRenewal", "organization:brookfield"],
  },
  {
    key: "harbourviewTelegram",
    account: "telegram",
    with: ["ryan"],
    state: "open",
    latestMinutesAgo: 2160,
    speakers: ["ryan", "self", "ryan", "self"],
    links: ["deal:harbourviewSupport"],
  },
  {
    key: "harbourviewInstagram",
    account: "instagram",
    with: ["chloe"],
    state: "open",
    latestMinutesAgo: 2640,
    speakers: ["chloe", "self", "chloe", "self"],
    links: ["deal:harbourviewSupport", "organization:harbourview"],
  },
  {
    key: "owenLinkedin",
    account: "linkedin",
    with: ["owen"],
    state: "open",
    latestMinutesAgo: 4300,
    speakers: ["owen", "self", "owen"],
    links: ["deal:summitRenewal", "organization:summit"],
  },
  {
    key: "noahLinkedin",
    account: "linkedin",
    with: ["noah"],
    state: "open",
    latestMinutesAgo: 11520,
    speakers: ["noah", "self", "noah", "self", "noah", "self"],
    links: ["deal:riversideBackup", "organization:riverside"],
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

function organizationOf(facts: { organization?: OrganizationKey; deal?: DealKey }): OrganizationKey | undefined {
  return facts.organization ?? (facts.deal ? DEAL_FACTS[facts.deal].organization : undefined);
}

const AGENT_EDITS: Record<string, AgentKeyName> = {
  "deal:kesslerSupport": "Claude Desktop",
  "task:invoiceQuestion": "Claude Desktop",
  "deal:cobaltSecurity": "ChatGPT",
  "deal:willowSetup": "ChatGPT",
  "contact:james": "Codex CLI",
};

export default defineSolution<Strings>({
  id: "smb",
  strings: { en, de, es, pt, pl, nl },
  story: {
    en: { currency: "USD", timeZone: "America/Los_Angeles" },
    de: { currency: "EUR", timeZone: "Europe/Berlin" },
    es: { currency: "EUR", timeZone: "Europe/Madrid" },
    pt: { currency: "BRL", timeZone: "America/Sao_Paulo" },
    pl: { currency: "PLN", timeZone: "Europe/Warsaw" },
    nl: { currency: "EUR", timeZone: "Europe/Amsterdam" },
  },
  build: (t, locale) => {
    const noted = (key: string): Record<string, string> =>
      key in t.notes ? { notes: t.notes[key as keyof typeof t.notes] } : {};
    const phone = (suffix: string) => phoneNumber(t.phones.mobile, Number(suffix));
    const office = (index: number) => phoneNumber(t.phones.office, index);
    const open = ["new", "qualified", "conversation", "proposal"];
    const wonLastYear = [
      { field: "stage", in: ["won"] },
      { field: "closeDate", withinDays: 365 },
    ];
    const label = <K extends string>(
      options: Record<K, string>,
      colors: Record<K, "default" | "secondary" | "destructive" | "success" | "warning" | "info">,
    ) => (Object.keys(options) as K[]).map((key) => ({ key, label: options[key], color: colors[key] }));

    const organization: RecordSpec[] = ORGANIZATIONS.map((key) => {
      const facts = ORGANIZATION_FACTS[key];
      const [name] = t.organizations[key];
      return {
        key,
        values: {
          name,
          industry: facts.industry,
          customerStatus: facts.status,
          address: t.addresses[key],
          website: `https://${facts.domain}`,
          employees: facts.employees,
        },
        owner: facts.owner,
        channels: { email: `office@${facts.domain}` },
        createdDaysAgo: facts.createdDaysAgo,
      };
    });
    const contact: RecordSpec[] = CONTACTS.map((key, index) => {
      const facts = CONTACT_FACTS[key];
      const [firstName, lastName, jobTitle] = t.contacts[key];
      const domain = ORGANIZATION_FACTS[facts.organization].domain;
      const mobile = facts.phone ? phone(facts.phone) : undefined;
      return {
        key,
        values: { firstName, lastName, jobTitle, decisionRole: facts.role, ...noted(key) },
        links: { "contact.organizations": facts.organization },
        owner: ORGANIZATION_FACTS[facts.organization].owner,
        channels: {
          email: `${mailbox(firstName)}.${mailbox(lastName)}@${domain}`,
          phone: mobile ?? office(index),
          ...(facts.linkedin
            ? {
                linkedin: `${key}-${facts.organization}.linkedin.example`,
                linkedinUrl: `https://linkedin.example/in/${key}-${facts.organization}`,
              }
            : {}),
          ...(facts.instagram ? { instagram: facts.instagram } : {}),
          ...(facts.telegram ? { telegram: facts.telegram } : {}),
        },
        createdDaysAgo: facts.createdDaysAgo,
      };
    });
    const service: RecordSpec[] = SERVICES.map((key, index) => ({
      key,
      values: { name: t.services[key], amount: SERVICE_PRICES[key] },
      createdDaysAgo: 540 - index,
    }));
    const deal: RecordSpec[] = DEALS.map((key) => {
      const facts = DEAL_FACTS[key];
      const [name, nextStep] = t.deals[key];
      const closed = facts.stage === "won" || facts.stage === "lost";
      return {
        key,
        values: {
          name,
          ...noted(key),
          stage: facts.stage,
          source: facts.source,
          closeDate: day(facts.close),
          nextStep,
          ...(facts.next === undefined ? {} : { nextStepDate: day(facts.next) }),
          ...(facts.lost ? { lostReason: facts.lost } : {}),
        },
        links: { "deal.organizations": facts.organization, "deal.contacts": facts.contacts },
        lines: facts.lines,
        owner: facts.owner,
        createdDaysAgo: facts.createdDaysAgo,
        history: [
          ...(facts.history ?? []).map((change, index, all) => ({
            daysAgo: change.daysAgo,
            previous: { stage: index === 0 ? "new" : all[index - 1].stage },
          })),
          ...(closed
            ? [{ daysAgo: Math.max(0, -facts.close), previous: { stage: facts.history?.at(-1)?.stage ?? "proposal" } }]
            : []),
        ].filter((change, index, all) => index === 0 || change.daysAgo < all[index - 1].daysAgo),
      };
    });
    const task: RecordSpec[] = TASKS.map((key) => {
      const facts = TASK_FACTS[key];
      return {
        key,
        values: {
          name: t.tasks[key],
          ...noted(key),
          status: facts.status,
          priority: facts.priority,
          dueDate: day(facts.due),
          ...(facts.visit ? { scheduled: rangeAt(...facts.visit) } : {}),
        },
        links: {
          ...(facts.deal ? { "task.deals": facts.deal } : {}),
          ...(organizationOf(facts) ? { "task.organizations": organizationOf(facts) as string } : {}),
          ...(facts.contact ? { "task.contacts": facts.contact } : {}),
        },
        owner: facts.owner,
        createdDaysAgo: facts.createdDaysAgo,
        ...(facts.done === undefined ? {} : { history: [{ daysAgo: facts.done, previous: { status: "open" } }] }),
      };
    });

    const quote = (key: keyof Strings["files"]["quotes"], uploadedDaysAgo: number): FileSpec => {
      const [number, name, note] = t.files.quotes[key];
      const facts = DEAL_FACTS[key];
      const q = t.files.quote;
      const amounts = facts.lines.map(([service, quantity]) => SERVICE_PRICES[service] * quantity);
      return {
        key: `quote-${key}`,
        record: `deal:${key}`,
        field: "deal.documents",
        name,
        kind: "pdf",
        lines: [
          `# ${q.title} ${number}`,
          `${q.preparedFor} ${t.organizations[facts.organization][0]}, ${t.addresses[facts.organization].city}`,
          `## ${q.lineItems}`,
          `| ${q.columns.join(" | ")} |`,
          ...facts.lines.map(
            ([service, quantity], index) =>
              `| ${t.services[service]} | ${quantity} | ${t.money(SERVICE_PRICES[service])} | ${t.money(amounts[index])} |`,
          ),
          `| ${q.total} | | | ${t.money(amounts.reduce((sum, amount) => sum + amount, 0))} |`,
          `## ${q.notes}`,
          note,
          q.terms,
        ],
        uploadedDaysAgo,
        by: facts.owner,
      };
    };
    const files: FileSpec[] = [
      quote("mapleNetwork", 3),
      quote("kesslerSupport", 7),
      quote("cobaltSecurity", 45),
      quote("brookfieldMigration", 22),
      quote("riversideSupport", 300),
      {
        key: "kesslerInventory",
        record: "deal:kesslerSupport",
        field: "deal.documents",
        name: t.files.inventory.name,
        kind: "xlsx",
        rows: [t.files.inventory.header, ...t.files.inventory.rows],
        uploadedDaysAgo: 8,
        by: "claraNeumann",
      },
      {
        key: "northgateNotes",
        record: "deal:northgateRollout",
        field: "deal.documents",
        name: t.files.siteNotes.name,
        kind: "md",
        lines: t.files.siteNotes.lines,
        uploadedDaysAgo: 4,
        by: "sofiaRossi",
      },
    ];

    return {
      workspaceName: t.workspaceName,
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
            healthcare: "success",
            legal: "info",
            architecture: "secondary",
            finance: "warning",
            hospitality: "info",
            logistics: "default",
            retail: "warning",
            marketing: "secondary",
            engineering: "default",
            property: "info",
          }),
        },
        {
          key: "organization.customerStatus",
          label: t.fields.customerStatus,
          type: "select",
          options: label(t.options.customerStatus, { prospect: "info", customer: "success", former: "secondary" }),
        },
        { key: "organization.address", label: t.fields.address, type: "address" },
        { key: "organization.website", label: t.fields.website, type: "url" },
        { key: "organization.employees", label: t.fields.employees, type: "number" },
        ...t.archivedFields.map((field) => ({ ...field, type: "text" as const, archived: true })),
        { key: "contact.jobTitle", label: t.fields.jobTitle, type: "text" },
        {
          key: "contact.decisionRole",
          label: t.fields.decisionRole,
          type: "select",
          options: label(t.options.decisionRole, { decisionMaker: "success", influencer: "info", user: "secondary" }),
        },
        {
          key: "deal.source",
          label: t.fields.source,
          type: "select",
          options: label(t.options.source, {
            referral: "success",
            website: "info",
            event: "warning",
            existing: "secondary",
          }),
        },
        { key: "deal.closeDate", label: t.fields.closeDate, type: "date" },
        { key: "deal.nextStep", label: t.fields.nextStep, type: "text" },
        { key: "deal.nextStepDate", label: t.fields.nextStepDate, type: "date" },
        { key: "deal.documents", label: t.fields.documents, type: "file" },
        {
          key: "deal.lostReason",
          label: t.fields.lostReason,
          type: "select",
          options: label(t.options.lostReason, { price: "warning", timing: "info", inHouse: "secondary" }),
        },
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
        { key: "new", label: t.stages.new, color: "secondary", probability: 10 },
        { key: "qualified", label: t.stages.qualified, color: "info", probability: 25 },
        { key: "conversation", label: t.stages.conversation, color: "info", probability: 40 },
        { key: "proposal", label: t.stages.proposal, color: "warning", probability: 60 },
        { key: "won", label: t.stages.won, color: "success", probability: 100 },
        { key: "lost", label: t.stages.lost, color: "destructive", probability: 0 },
      ],
      records: agentEdited({ organization, contact, service, deal, task }, AGENT_EDITS),
      views: [
        {
          key: "pipeline",
          list: "deal",
          name: t.views.pipeline,
          mode: "board",
          groupBy: "stage",
          columns: ["totalValue", "deal.organizations", "nextStepDate", "system:assignedTo"],
          filters: [{ field: "stage", notIn: ["lost"] }],
        },
        {
          key: "nextSteps",
          list: "deal",
          name: t.views.nextSteps,
          mode: "table",
          columns: ["stage", "nextStep", "nextStepDate", "totalValue", "deal.organizations", "system:assignedTo"],
          filters: [{ field: "stage", in: open }],
          sort: { field: "nextStepDate", direction: "asc" },
        },
        {
          key: "customers",
          list: "organization",
          name: t.views.customers,
          mode: "table",
          columns: ["industry", "address", "employees", "contact.organizations", "system:assignedTo"],
          filters: [{ field: "customerStatus", in: ["customer"] }],
          sort: { field: "employees", direction: "desc" },
        },
        {
          key: "allContacts",
          list: "contact",
          name: t.views.allContacts,
          mode: "table",
          columns: ["jobTitle", "contact.organizations", "decisionRole", "capability.identity"],
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
          key: "priceList",
          list: "service",
          name: t.views.priceList,
          mode: "table",
          columns: ["amount"],
          sort: { field: "amount", direction: "desc" },
        },
        {
          key: "siteVisits",
          list: "task",
          name: t.views.siteVisits,
          mode: "calendar",
          calendar: { date: "scheduled", color: "priority", mode: "week" },
          columns: ["status", "priority", "task.organizations", "system:assignedTo"],
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
            title: t.widgets.won,
            list: "deal",
            aggregation: "sum",
            field: "totalValue",
            filters: wonLastYear,
          },
          {
            kind: "kpi",
            title: t.widgets.averageWon,
            list: "deal",
            aggregation: "average",
            field: "totalValue",
            filters: wonLastYear,
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
            title: t.widgets.pipelineByStage,
            display: DisplayType.verticalBarChart,
            list: "deal",
            aggregation: "sum",
            field: "totalValue",
            groupBy: { field: "stage" },
            filters: [{ field: "stage", in: open }],
          },
          {
            kind: "calendar",
            title: t.widgets.nextSteps,
            list: "deal",
            layout: "upcoming",
            date: "nextStepDate",
            days: 14,
            amount: "totalValue",
            filters: [{ field: "stage", in: open }],
          },
          { kind: "activity", title: t.widgets.latestActivity },
          {
            kind: "chart",
            title: t.widgets.wonByMonth,
            display: DisplayType.areaChart,
            list: "deal",
            aggregation: "sum",
            field: "totalValue",
            groupBy: { month: "closeDate" },
            filters: wonLastYear,
          },
          {
            kind: "calendar",
            title: t.widgets.appointmentsMonth,
            list: "task",
            layout: "month",
            date: "scheduled",
          },
          {
            kind: "map",
            title: t.widgets.customersMap,
            list: "organization",
            address: "address",
            color: "customerStatus",
            size: "employees",
            detail: "industry",
          },
        ],
      },
      wiki: [
        { key: "guide", kind: "guide", title: t.wiki.guide.title, markdown: t.wiki.guide.markdown },
        { key: "process", kind: "knowledge", title: t.wiki.process.title, markdown: t.wiki.process.markdown },
        {
          key: "followUp",
          kind: "procedure",
          title: t.wiki.followUp.title,
          whenToUse: t.wiki.followUp.whenToUse,
          markdown: t.wiki.followUp.markdown,
        },
        { key: "priceList", kind: "knowledge", title: t.wiki.priceList.title, markdown: t.wiki.priceList.markdown },
        agentsPage(locale, t.agents),
      ],
      routines: [
        {
          key: "briefing",
          name: t.routines.briefing.name,
          task: t.routines.briefing.task,
          owner: "maxBergmann",
          trigger: { kind: "schedule", cron: "45 7 * * *" },
          runs: [
            {
              status: "succeeded",
              startedHoursAgo: 26,
              durationSeconds: 51,
              credits: 8,
              summary: t.routines.briefing.runs[0],
            },
            {
              status: "succeeded",
              startedHoursAgo: 50,
              durationSeconds: 63,
              credits: 9,
              summary: t.routines.briefing.runs[1],
            },
          ],
        },
        {
          key: "staleDeals",
          name: t.routines.staleDeals.name,
          task: t.routines.staleDeals.task,
          owner: "sofiaRossi",
          trigger: { kind: "schedule", cron: "0 8 * * *" },
          runs: [
            {
              status: "succeeded",
              startedHoursAgo: 25,
              durationSeconds: 51,
              credits: 8,
              summary: t.routines.staleDeals.runs[0],
            },
            {
              status: "succeeded",
              startedHoursAgo: 49,
              durationSeconds: 63,
              credits: 9,
              summary: t.routines.staleDeals.runs[1],
            },
          ],
        },
        {
          key: "replyDrafts",
          name: t.routines.replyDrafts.name,
          task: t.routines.replyDrafts.task,
          owner: "maxBergmann",
          trigger: {
            kind: "event",
            events: ["messaging.email.received"],
            debounceSeconds: 300,
            sample: { thread: 0 },
          },
          runs: [
            {
              status: "succeeded",
              startedHoursAgo: 14,
              durationSeconds: 88,
              credits: 18,
              summary: t.routines.replyDrafts.runs[0],
            },
            {
              status: "failed",
              startedHoursAgo: 38,
              durationSeconds: 12,
              credits: 2,
              error: "providerUnavailable",
              note: t.routines.replyDrafts.failure,
            },
            {
              status: "succeeded",
              startedHoursAgo: 62,
              durationSeconds: 77,
              credits: 15,
              summary: t.routines.replyDrafts.runs[2],
            },
          ],
        },
        {
          key: "followUpDue",
          name: t.routines.followUpDue.name,
          task: t.routines.followUpDue.task,
          owner: "maxBergmann",
          trigger: { kind: "schedule", cron: "0 8 * * 1-5" },
          runs: [
            {
              status: "succeeded",
              startedHoursAgo: 6,
              durationSeconds: 74,
              credits: 12,
              summary: t.routines.followUpDue.runs[0],
            },
            {
              status: "succeeded",
              startedHoursAgo: 78,
              durationSeconds: 19,
              credits: 3,
              summary: t.routines.followUpDue.runs[1],
            },
            {
              status: "succeeded",
              startedHoursAgo: 102,
              durationSeconds: 58,
              credits: 10,
              summary: t.routines.followUpDue.runs[2],
            },
          ],
        },
        {
          key: "weeklyNotes",
          name: t.routines.weeklyNotes.name,
          task: t.routines.weeklyNotes.task,
          owner: "claraNeumann",
          trigger: { kind: "schedule", cron: "0 16 * * 5" },
          runs: [
            {
              status: "succeeded",
              startedHoursAgo: 94,
              durationSeconds: 96,
              credits: 15,
              summary: t.routines.weeklyNotes.runs[0],
            },
            {
              status: "succeeded",
              startedHoursAgo: 262,
              durationSeconds: 83,
              credits: 13,
              summary: t.routines.weeklyNotes.runs[1],
            },
          ],
        },
      ],
      apiKeys: agentApiKeys([75, 38, 14]),
      webhooks: [
        {
          key: "accounting",
          description: t.webhooks.accounting.description,
          url: t.webhooks.accounting.url,
          enabled: true,
          lists: ["deal", "organization"],
          createdDaysAgo: 210,
          deliveries: 18,
        },
        {
          key: "dispatch",
          description: t.webhooks.dispatch.description,
          url: t.webhooks.dispatch.url,
          enabled: false,
          lists: ["task"],
          createdDaysAgo: 120,
          deliveries: 8,
        },
      ],
      files,
      planner: {
        sources: [
          { list: "task", date: "scheduled", color: "secondary" },
          { list: "deal", date: "closeDate", filters: [{ field: "stage", in: open }], color: "success" },
        ],
        connectedCalendar: true,
        mode: "week",
      },
      trash: [
        { list: "contact", name: t.trash[0], daysAgo: 4 },
        { list: "deal", name: t.trash[1], daysAgo: 11 },
      ],
      mateChats: [
        {
          title: t.mateChat.title,
          endedHoursAgo: 3,
          messages: t.mateChat.messages.map((text, index) => ({
            role: index % 2 === 0 ? ("user" as const) : ("assistant" as const),
            text,
          })),
        },
        {
          title: t.mateChatWalkthrough.title,
          endedHoursAgo: 30,
          messages: t.mateChatWalkthrough.messages.map((text, index) => ({
            role: index % 2 === 0 ? ("user" as const) : ("assistant" as const),
            text,
          })),
        },
      ],
      messaging: {
        accounts: t.accounts,
        selfTitle: t.selfTitle,
        website: t.website,
        threads: [
          {
            account: "google",
            with: ["james"],
            subject: t.threads.mapleProposal.subject,
            state: "unread",
            latestMinutesAgo: 25,
            messages: [
              { from: "james", text: t.threads.mapleProposal.messages[0] },
              { from: "self", text: t.threads.mapleProposal.messages[1] },
              { from: "james", text: t.threads.mapleProposal.messages[2] },
              { from: "self", text: t.threads.mapleProposal.messages[3], draft: true },
            ],
            links: ["deal:mapleNetwork"],
          },
          {
            account: "google",
            with: ["david"],
            subject: t.threads.kesslerRenewal.subject,
            state: "open",
            latestMinutesAgo: 3 * 60,
            messages: [
              { from: "david", text: t.threads.kesslerRenewal.messages[0] },
              { from: "self", text: t.threads.kesslerRenewal.messages[1] },
              { from: "david", text: t.threads.kesslerRenewal.messages[2], html: t.threads.kesslerRenewal.inventory },
            ],
            links: ["deal:kesslerSupport", "organization:kessler"],
          },
          {
            account: "linkedin",
            with: ["ethan"],
            state: "open",
            latestMinutesAgo: 26 * 60,
            messages: [
              { from: "ethan", text: t.threads.northgateIntro.messages[0] },
              { from: "self", text: t.threads.northgateIntro.messages[1] },
              { from: "ethan", text: t.threads.northgateIntro.messages[2] },
              { from: "self", text: t.threads.northgateIntro.messages[3], reaction: { from: "ethan", value: "👍" } },
            ],
            links: ["deal:northgateRollout"],
          },
          {
            account: "whatsapp",
            with: ["sophie"],
            state: "unread",
            latestMinutesAgo: 50,
            messages: [
              { from: "sophie", text: t.threads.riversideBackup.messages[0] },
              { from: "self", text: t.threads.riversideBackup.messages[1] },
              { from: "sophie", text: t.threads.riversideBackup.messages[2] },
            ],
            links: ["deal:riversideBackup"],
          },
          {
            account: t.threadAccounts.harbourview,
            with: ["chloe"],
            subject: t.threads.harbourviewIntro.subject,
            state: "open",
            latestMinutesAgo: 2 * 24 * 60,
            messages: [
              { from: "chloe", text: t.threads.harbourviewIntro.messages[0], html: t.threads.harbourviewIntro.letter },
              { from: "self", text: t.threads.harbourviewIntro.messages[1] },
            ],
            links: ["deal:harbourviewSupport"],
          },
          {
            account: t.threadAccounts.willow,
            with: ["megan"],
            state: "unread",
            latestMinutesAgo: 5 * 60,
            messages: [
              { from: "megan", text: t.threads.willowInquiry.messages[0] },
              { from: "self", text: t.threads.willowInquiry.messages[1] },
              { from: "megan", text: t.threads.willowInquiry.messages[2] },
            ],
            links: ["deal:willowSetup"],
          },
          {
            account: t.threadAccounts.cobalt,
            with: ["lucas"],
            state: "open",
            latestMinutesAgo: 4 * 24 * 60,
            messages: [
              { from: "lucas", text: t.threads.cobaltFindings.messages[0] },
              { from: "self", text: t.threads.cobaltFindings.messages[1] },
              { from: "lucas", text: t.threads.cobaltFindings.messages[2] },
            ],
            links: ["deal:cobaltSecurity"],
          },
          {
            account: "whatsapp",
            with: ["grace", "james"],
            name: t.threads.teamInstall.name,
            state: "open",
            latestMinutesAgo: 6 * 24 * 60,
            messages: [
              { from: "self", text: t.threads.teamInstall.messages[0] },
              { from: "grace", text: t.threads.teamInstall.messages[1] },
              { from: "james", text: t.threads.teamInstall.messages[2] },
            ],
            links: ["deal:mapleNetwork"],
          },
          ...inboxThreads(INBOX_PLANS, t.inbox),
        ],
        calendar: {
          name: t.calendar.name,
          events: [
            { title: t.calendar.events[0], with: ["ethan"], startsMinutesAgo: -2 * 24 * 60, durationMinutes: 60 },
            { title: t.calendar.events[1], with: ["david", "hannah"], startsMinutesAgo: 90, durationMinutes: 45 },
            { title: t.calendar.events[2], with: ["chloe"], startsMinutesAgo: -24 * 60, durationMinutes: 30 },
            { title: t.calendar.events[3], with: ["emma"], startsMinutesAgo: -5 * 24 * 60, durationMinutes: 90 },
            { title: t.calendar.events[4], with: ["lucas"], startsMinutesAgo: 3 * 24 * 60, durationMinutes: 45 },
          ],
        },
      },
    };
  },
});
