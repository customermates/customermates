import { DisplayType } from "@/features/widget/widget-display.schema";

import { agentApiKeys, agentEdited, agentsPage, type AgentsPageText, type AgentKeyName } from "../agent-native";
import { address, day, defineSolution, rangeAt, type FileSpec, type RecordSpec } from "../define-solution";
import { inboxThreads, type InboxThreadPlan, type InboxThreadText } from "../inbox-threads";

/**
 * LinkedIn conversations in your CRM relationship context: a small company that sells security awareness training to
 * mid-sized firms and builds most of its relationships in LinkedIn conversations. Prospects lead the sidebar; their
 * conversations come from Max's own connected LinkedIn account, sit next to a few emails, and belong to an opportunity
 * or company only after a person linked them (one conversation is still unlinked). Opportunities carry their value
 * as an input; next-step dates and tasks are ordinary fields that remind nobody.
 */

const ORGANIZATIONS = [
  "hollis",
  "marlow",
  "cedarline",
  "brightford",
  "quayside",
  "ashcombe",
  "tidewell",
  "kingsgate",
  "fenwick",
  "larchmont",
  "northmere",
  "whitcombe",
] as const;
type OrganizationKey = (typeof ORGANIZATIONS)[number];
const CONTACTS = [
  "rachel",
  "simon",
  "claire",
  "joe",
  "martin",
  "priya",
  "tom",
  "helen",
  "george",
  "nina",
  "oliver",
  "amy",
  "fiona",
  "andrew",
  "kate",
  "paul",
  "lucy",
  "mark",
  "sarah",
  "dan",
  "ella",
  "maya",
  "ivy",
  "zoe",
] as const;
type ContactKey = (typeof CONTACTS)[number];
const DEALS = [
  "hollisProgram",
  "marlowBaseline",
  "cedarlineProgram",
  "brightfordPilot",
  "quaysideWorkshop",
  "ashcombeProgram",
  "tidewellBaseline",
  "kingsgateLeadership",
  "fenwickBaseline",
  "larchmontProgram",
  "cedarlineWorkshop",
  "hollisLeadership",
  "whitcombeProgram",
  "hollisPhishing",
  "hollisBaseline",
  "northmereRefresh",
] as const;
type DealKey = (typeof DEALS)[number];
type OpenDealKey =
  | "hollisProgram"
  | "marlowBaseline"
  | "cedarlineProgram"
  | "brightfordPilot"
  | "ashcombeProgram"
  | "tidewellBaseline"
  | "kingsgateLeadership"
  | "larchmontProgram";
const TASKS = [
  "replyRachel",
  "agendaClaire",
  "linkKateConversation",
  "answerAshcombe",
  "sampleModuleTidewell",
  "followUpTom",
  "leadershipOutline",
  "quaysideSlides",
  "briefingDatesSimon",
  "meetupNotes",
] as const;
type TaskKey = (typeof TASKS)[number];

const INBOX_PLAN = [
  {
    key: "paul",
    account: "google",
    with: ["paul"],
    state: "unread",
    latestMinutesAgo: 15,
    speakers: ["paul", "self", "paul"],
    links: ["deal:larchmontProgram", "organization:larchmont"],
  },
  {
    key: "priya",
    account: "google",
    with: ["priya"],
    state: "open",
    latestMinutesAgo: 7 * 60,
    speakers: ["self", "priya", "self"],
    draft: true,
    links: ["deal:cedarlineProgram", "organization:cedarline"],
  },
  {
    key: "andrew",
    account: "google",
    with: ["andrew"],
    state: "open",
    latestMinutesAgo: 12 * 60,
    speakers: ["andrew", "self", "andrew"],
    links: ["deal:fenwickBaseline", "organization:fenwick"],
  },
  {
    key: "lucy",
    account: "google",
    with: ["lucy"],
    state: "open",
    latestMinutesAgo: 30 * 60,
    speakers: ["lucy", "self", "lucy", "self"],
    draft: true,
    links: ["deal:northmereRefresh", "organization:northmere"],
  },
  {
    key: "zoe",
    account: "linkedin",
    with: ["zoe"],
    state: "open",
    latestMinutesAgo: 2 * 24 * 60 + 90,
    speakers: ["zoe", "self", "zoe", "self", "zoe"],
    links: ["organization:larchmont"],
  },
  {
    key: "ivy",
    account: "linkedin",
    with: ["ivy"],
    state: "open",
    latestMinutesAgo: 4 * 24 * 60 + 30,
    speakers: ["ivy", "self", "ivy", "self"],
    draft: true,
    links: ["organization:quayside"],
  },
  {
    key: "sarah",
    account: "linkedin",
    with: ["sarah"],
    state: "open",
    latestMinutesAgo: 6 * 24 * 60 + 60,
    speakers: ["sarah", "self", "sarah", "self", "sarah"],
    links: ["deal:hollisPhishing", "organization:hollis"],
  },
  {
    key: "oliver",
    account: "linkedin",
    with: ["oliver"],
    state: "open",
    latestMinutesAgo: 9 * 24 * 60,
    speakers: ["oliver", "self", "oliver", "self"],
    links: ["deal:tidewellBaseline", "organization:tidewell"],
  },
  {
    key: "tom",
    account: "linkedin",
    with: ["tom"],
    state: "open",
    latestMinutesAgo: 18 * 24 * 60,
    speakers: ["tom", "self", "tom", "self"],
    links: ["deal:brightfordPilot", "organization:brightford"],
  },
] as const satisfies readonly InboxThreadPlan[];
type InboxKey = (typeof INBOX_PLAN)[number]["key"];

const en = {
  company: "Clearwatch Awareness",
  workspaceName: "LinkedIn sales",
  website: "https://clearwatch-awareness.example",
  selfTitle: "Founder",
  lists: {
    contact: ["Prospect", "Prospects", "People we know from LinkedIn, events and introductions."],
    organization: ["Company", "Companies", "Companies our prospects work for, with the value of their opportunities."],
    deal: ["Opportunity", "Opportunities", "Trainings and programs we are discussing, with their value."],
    task: ["Task", "Tasks", "Next actions with a due date."],
  },
  fields: {
    jobTitle: "Job title",
    howWeMet: "How we met",
    lastLinkedinChat: "Last LinkedIn conversation",
    conversationStatus: "Connection status",
    industry: "Industry",
    address: "Address",
    website: "Website",
    employees: "Employees",
    opportunityValue: "Opportunity value",
    offering: "Offering",
    closeDate: "Expected close",
    nextStep: "Next step",
    nextStepDate: "Next step date",
    lostReason: "Lost reason",
    trainingSessions: "Training sessions",
    proposal: "Proposal",
    dueDate: "Due date",
    priority: "Priority",
  },
  options: {
    conversationStatus: {
      connected: "Connected",
      messaged: "Messaged",
      replied: "Replied",
      meetingBooked: "Meeting booked",
      client: "Client",
    },
    howWeMet: {
      event: "Event",
      introduction: "Introduction",
      linkedinConversation: "LinkedIn conversation",
      inbound: "Inbound",
    },
    industry: {
      logistics: "Logistics",
      insurance: "Insurance",
      healthcare: "Healthcare",
      manufacturing: "Manufacturing",
      legal: "Legal",
      engineering: "Engineering",
      retail: "Retail",
      housing: "Housing",
      accounting: "Accounting",
    },
    offering: {
      baselineTraining: "Baseline training",
      annualProgram: "Annual awareness program",
      phishingExercise: "Phishing exercises",
      leadershipWorkshop: "Leadership workshop",
    },
    lostReason: { price: "Price", timing: "Timing", inHouse: "Solved in-house" },
    priority: { low: "Low", medium: "Medium", high: "High" },
  },
  stages: {
    identified: "Identified",
    conversation: "Conversation",
    meetingBooked: "Meeting booked",
    proposal: "Proposal sent",
    won: "Won",
    lost: "Lost",
  },
  organizations: {
    hollis: ["Hollis Freight", "Leeds", "hollis-freight.example"],
    marlow: ["Marlow Insurance Brokers", "Bristol", "marlow-brokers.example"],
    cedarline: ["Cedarline Health Group", "Sheffield", "cedarline-health.example"],
    brightford: ["Brightford Manufacturing", "Coventry", "brightford-mfg.example"],
    quayside: ["Quayside Legal", "Liverpool", "quayside-legal.example"],
    ashcombe: ["Ashcombe Engineering", "Derby", "ashcombe-engineering.example"],
    tidewell: ["Tidewell Retail", "Southampton", "tidewell-retail.example"],
    kingsgate: ["Kingsgate Housing Association", "Nottingham", "kingsgate-housing.example"],
    fenwick: ["Fenwick Accountants", "York", "fenwick-accountants.example"],
    larchmont: ["Larchmont Logistics", "Manchester", "larchmont-logistics.example"],
    northmere: ["Northmere Insurance", "Newcastle", "northmere-insurance.example"],
    whitcombe: ["Whitcombe Care Homes", "Norwich", "whitcombe-care.example"],
  } satisfies Record<OrganizationKey, readonly [string, string, string]>,
  contacts: {
    rachel: ["Rachel", "Dawson", "IT manager"],
    simon: ["Simon", "Pryce", "Head of HR"],
    claire: ["Claire", "Whitaker", "Operations director"],
    joe: ["Joe", "Harper", "IT coordinator"],
    martin: ["Martin", "Ashby", "Information security officer"],
    priya: ["Priya", "Nair", "Head of people"],
    tom: ["Tom", "Kendrick", "Plant IT lead"],
    helen: ["Helen", "Garner", "Practice manager"],
    george: ["George", "Lamb", "Head of IT"],
    nina: ["Nina", "Ford", "Compliance manager"],
    oliver: ["Oliver", "Shaw", "IT director"],
    amy: ["Amy", "Lowe", "Training coordinator"],
    fiona: ["Fiona", "Blake", "Chief executive"],
    andrew: ["Andrew", "Cole", "Managing partner"],
    kate: ["Kate", "Morrison", "HR director"],
    paul: ["Paul", "Heston", "IT security lead"],
    lucy: ["Lucy", "Barnard", "Head of risk"],
    mark: ["Mark", "Ellison", "Operations director"],
    sarah: ["Sarah", "Quinn", "Compliance lead"],
    dan: ["Dan", "Mercer", "Quality manager"],
    ella: ["Ella", "Grant", "Head of customer services"],
    maya: ["Maya", "Patel", "Underwriting manager"],
    ivy: ["Ivy", "Chandler", "Office manager"],
    zoe: ["Zoe", "Hartley", "People partner"],
  } satisfies Record<ContactKey, readonly [string, string, string]>,
  deals: {
    hollisProgram: "Hollis Freight – annual awareness program",
    marlowBaseline: "Marlow Insurance – baseline training for all staff",
    cedarlineProgram: "Cedarline Health – awareness program for clinical staff",
    brightfordPilot: "Brightford Manufacturing – phishing exercises pilot",
    quaysideWorkshop: "Quayside Legal – partner workshop",
    ashcombeProgram: "Ashcombe Engineering – annual program for three sites",
    tidewellBaseline: "Tidewell Retail – baseline training for store managers",
    kingsgateLeadership: "Kingsgate Housing – leadership workshop",
    fenwickBaseline: "Fenwick Accountants – baseline training",
    larchmontProgram: "Larchmont Logistics – training for new starters",
    cedarlineWorkshop: "Cedarline Health – board workshop",
    hollisLeadership: "Hollis Freight – leadership workshop",
    whitcombeProgram: "Whitcombe Care Homes – annual awareness program",
    hollisPhishing: "Hollis Freight – phishing exercises",
    hollisBaseline: "Hollis Freight – baseline training for drivers' office",
    northmereRefresh: "Northmere Insurance – phishing exercise refresh",
  } satisfies Record<DealKey, string>,
  nextSteps: {
    hollisProgram: "Send Rachel the three-month rollout outline",
    marlowBaseline: "Meeting with Claire and Joe on Wednesday",
    cedarlineProgram: "Call with Martin and Priya",
    brightfordPilot: "Ask Tom how many plant workers use email",
    ashcombeProgram: "Confirm site reports and the Polish version",
    tidewellBaseline: "Hear back from Oliver about the sample module",
    kingsgateLeadership: "Send Fiona the workshop outline",
    larchmontProgram: "First call with Kate about onboarding",
  } satisfies Record<OpenDealKey, string>,
  tasks: {
    replyRachel: "Reply to Rachel with the rollout outline",
    agendaClaire: "Send Claire a short agenda for Wednesday",
    linkKateConversation: "Link Kate's LinkedIn conversation once the opportunity is clear",
    answerAshcombe: "Answer George's questions about site reports and languages",
    sampleModuleTidewell: "Share a sample module with Oliver",
    followUpTom: "Follow up with Tom at Brightford",
    leadershipOutline: "Write the leadership workshop outline for Kingsgate",
    quaysideSlides: "Send the workshop slides to Helen",
    briefingDatesSimon: "Add Hollis briefing dates to the rollout outline",
    meetupNotes: "Write up notes from the regional security meetup",
  } satisfies Record<TaskKey, string>,
  views: {
    byConnection: "Prospects by connection status",
    prospects: "Recent LinkedIn conversations",
    pipeline: "Pipeline",
    nextSteps: "Next steps",
    dueSoon: "Due soon",
    trainingCalendar: "Training calendar",
  },
  widgets: {
    openPipeline: "Open pipeline",
    won: "Won in the last 12 months",
    recentChats: "Chatted in the last 7 days",
    meetingsBooked: "Meetings booked",
    byStatus: "Prospects by connection status",
    byHowWeMet: "Prospects by how we met",
    byStage: "Pipeline by stage",
    wonByMonth: "Won value by month",
    latestChats: "Latest LinkedIn conversations",
    chatsMonth: "LinkedIn chats this month",
  },
  wiki: {
    guide: {
      title: "Operating Guide",
      markdown: [
        "Clearwatch Awareness runs security awareness training for mid-sized companies: baseline trainings, annual programs, phishing exercises and leadership workshops. Most of our relationships start or continue in LinkedIn conversations. This workspace is demo data; every company and person in it is fictional.",
        "",
        "## How we use the CRM",
        "- **Prospects** are the people we talk to. Each one shows how we met, the connection status and the date of the last LinkedIn conversation. The board Prospects by connection status shows who we are connected with, who we wrote to, who replied and who has a meeting.",
        "- **Companies** are the companies they work for; the opportunity value adds up the value of all their opportunities. **Opportunities** are trainings and programs we are discussing; the stage shows where the conversation is and the value is entered by hand.",
        "- **Tasks** and the next step date on an opportunity are ordinary fields. Nobody is reminded automatically, so check the Next steps and Due soon views every morning.",
        "- Training sessions show in the Training calendar, proposals sit as files on the opportunity, and calls booked from LinkedIn go into Max's Google calendar.",
        "",
        "## LinkedIn conversations",
        "- The conversations come from Max's own connected LinkedIn account: what Max sent and received there, next to his email.",
        "- A conversation belongs to an opportunity or company only when someone links it. Nothing is linked automatically; Kate Morrison's conversation is not linked yet.",
        "- Every message is written by a person, one conversation at a time. We do not import contact lists or send messages to many people at once.",
        "",
        "## Routines",
        "- **Research new LinkedIn connections:** when a connection request is accepted, Mate looks up the person, fills empty fields it can verify and creates a follow-up task if one is needed.",
        "- **Find similar prospects on LinkedIn:** every Monday, Mate searches Sales Navigator for companies like the ones we won and lists them in a review task.",
        "- Routines only write notes, tasks and drafts and never send; that stays with Max. More on the page How our agents work with this CRM.",
      ],
    },
    stages: {
      title: "Opportunity stages",
      markdown: [
        "An opportunity moves through these stages as the conversation with the prospect develops. The stage is set by hand.",
        "",
        "## Stages",
        "1. **Identified:** we know the person and the company, but have not talked about training yet.",
        "2. **Conversation:** a real exchange about their situation, usually on LinkedIn.",
        "3. **Meeting booked:** a call or meeting is booked or has taken place.",
        "4. **Proposal sent:** scope, dates and value are on the opportunity and the proposal is out.",
        "5. **Won or Lost:** record the outcome and, when lost, the reason.",
      ],
    },
    linking: {
      title: "Linking a LinkedIn conversation",
      whenToUse: "When a LinkedIn conversation turns into a concrete opportunity or concerns a company we work with.",
      markdown: [
        "Conversations from Max's LinkedIn account are not linked to any record until a person links them. Follow these steps for every conversation that matters.",
        "",
        "## Steps",
        "1. Open the conversation in the inbox and check that the person is a prospect in the CRM. If not, add them with job title and how we met.",
        "2. Link the conversation to the opportunity and, if useful, to the company.",
        "3. Update the prospect's connection status and last LinkedIn conversation date.",
        "4. Set the next step and its date on the opportunity, and create a task for every promise you made.",
      ],
    },
    firstMessages: {
      title: "Connection requests and first messages",
      markdown: [
        "Every connection request and first message on LinkedIn is written by Max, one person at a time. Mate may prepare a draft, but nothing goes out without Max reading and sending it.",
        "",
        "## Connection requests",
        "- Send a request only when there is a reason: a talk, an introduction, a shared event or a post the person wrote.",
        "- Add one sentence that names that reason. No pitch in the request.",
        "- Set the prospect's connection status to Connected once the request is accepted.",
        "",
        "## First messages",
        "- Wait until the person has accepted. Refer to what they posted or said, and ask one question about their situation.",
        "- Do not attach brochures or price lists to a first message.",
        "- Set the connection status to Messaged, and to Replied once they answer.",
        "",
        "## What we never do",
        "- No message sequences, no automated follow-ups and no messages to many people at once.",
        "- No contact lists from LinkedIn imported into the CRM in bulk.",
      ],
    },
  },
  routines: {
    research: {
      name: "Research new LinkedIn connections",
      task: "Inspect the accepted LinkedIn connection identified by the provider event with the available LinkedIn tools. Resolve an existing prospect through its identity channels before changing any CRM record. Research public company and role context, fill only unambiguous empty ordinary fields such as job title and how we met, set the connection status to Connected when it is empty, and append sources to notes. If follow-up is needed, create one ordinary task linked to that prospect and avoid duplicates. Never send a message or connection request, create an unverified identity or overwrite existing facts.",
      runs: [
        "Added the job title and how we met to Kate Morrison and created a task to ask about onboarding at Larchmont.",
        "I could not reach the model provider on this attempt, so I stopped before reading or changing anything. Nothing was modified.",
        "Zoe Hartley was already a prospect with complete fields; nothing needed to change.",
      ],
    },
    similar: {
      name: "Find similar prospects on LinkedIn",
      task: 'Every Monday, find companies that resemble the ones where we won opportunities. Resolve the configured Won stage, query matching opportunities and read their companies, industries and employee counts. Describe the pattern these records support. Use linkedin_get_sales_search_parameters before linkedin_search_sales_companies and linkedin_search_sales_leads; limit the search to ten companies in the United Kingdom. Remove companies already in the CRM by comparing name and website. For each remaining company, name at most two plausible buyers with their role. Create one ordinary task named "Review LinkedIn prospects <YYYY-MM-DD>" for Max with the companies, buyers and the reason for each in notes. Create no companies, prospects or opportunities, send no messages or connection requests, and save no LinkedIn lists. If no usable result exists, write nothing.',
      runs: [
        "Proposed 4 logistics and insurance companies with 7 possible buyers in a review task.",
        "I could not reach the model provider on this attempt, so I stopped before reading or changing anything. Nothing was modified. The next scheduled run will pick this up.",
        "Proposed 3 healthcare companies with 5 possible buyers; 2 matches were already in the CRM and were left out.",
      ],
    },
    followUp: {
      name: "Every morning, draft follow-ups for opportunities due today",
      task: "Every weekday morning, read the opportunities whose Stage is Identified, Conversation, Meeting booked or Proposal sent and whose Next step date is today or earlier. For each one, read the conversations linked to the opportunity with get_messaging_threads. If the last message is from the prospect and the conversation has no draft, save one short reply draft in that conversation with save_message_draft: answer the question in two or three sentences, in Max's voice, and suggest the next step. Preserve an existing draft. If the last message is ours, do nothing and name the conversation in the summary. If no conversation is linked, create one ordinary task 'Follow up with <prospect name>' due today, linked to the opportunity and the prospect, only when no open task for that prospect or opportunity exists. Never send a message, never link a conversation and do not change the opportunity.",
      runs: [
        "Three opportunities were due. Hollis Freight already had a reply draft for Rachel Dawson, so I left it as it is. At Brightford Manufacturing the last message is ours and waits for Tom Kendrick. Larchmont Logistics has no linked conversation, and the open task to link Kate Morrison's conversation already covers it, so I created nothing. Nothing was sent.",
        "Saved a reply draft for Martin Ashby at Cedarline Health about a call in two weeks and about bringing Priya Nair in. Nothing was sent.",
        "Saved a draft for Fiona Blake at Kingsgate Housing that offers a half-day leadership workshop at their office. Nothing was sent.",
      ],
    },
    questions: {
      name: "Turn LinkedIn questions into tasks",
      task: "Read the new LinkedIn message identified by routine_trigger. Resolve the sender through identity channels and continue only for an existing prospect. If the message asks Max for a document, a price, a date or a decision, create one ordinary task named 'Answer <prospect name>: <topic>' due in two days, linked to the prospect, the company and, when the sender has exactly one open opportunity, that opportunity, and put the question in the notes. Create no task for thanks, greetings or confirmations, and only one task for the same question. Never send a message, save no draft and change no other record.",
      runs: [
        "George Lamb asked whether reports can be split by site and whether the program exists in Polish. The open task Answer George's questions about site reports and languages already covers both, so I created nothing.",
        "Claire Whitaker confirmed Wednesday afternoon for the call. The message holds no question for Max, so no task was created.",
        "I could not reach the model provider on this attempt, so I stopped before reading anything. Nothing was changed.",
      ],
    },
  },
  threads: {
    rachel: [
      "Hi Max, thanks for sending the proposal. Simon and I went through it yesterday. One question: can the annual program start with the drivers and warehouse staff? Most of them only use shared tablets.",
      "Hi Rachel, yes. We would start with short modules that work on shared devices and add the office teams in the second quarter. I can show you a sample module on a call.",
      "That would help. Could you also send a rough plan for the first three months? Our board meets on the 14th.",
      "Hi Rachel, here is the outline: month one drivers and warehouse, month two the office teams, month three a first phishing exercise and a one-page summary for your board. Shall we go through it on Thursday?",
    ],
    martin: [
      "Max, your post about phishing exercises in hospitals stuck with me. Our clinical staff have very little time for training. How do you handle that?",
      "Hi Martin, five-minute modules planned around shift changes, and no exercises during peak hours. Happy to share how other healthcare teams set it up.",
      "Good. Priya from HR should join the next conversation. Could we do a call in two weeks?",
      "Of course. I will send you and Priya two time options.",
    ],
    claire: [
      "Hi Max, good to meet you at the risk breakfast in Bristol. As I said, fake payment requests are our biggest worry. Could we talk about a baseline training for all 60 staff?",
      "Hi Claire, likewise. A baseline training is a good start. Would a 45-minute meeting with you and Joe next week work?",
      "Yes. Tuesday or Wednesday afternoon works for both of us.",
      "Then let's say Wednesday at 2 pm. I will send a short agenda beforehand.",
    ],
    fiona: [
      "Max, thank you for your talk at the housing conference. Our leadership team would benefit from a session on how attackers target executives. Do you run those on site?",
      "Hi Fiona, thank you. Yes, a half-day workshop at your office for up to twelve people. I can send you an outline of the topics.",
      "Please do. I would like to put it on our leadership day in December.",
    ],
    kate: [
      "Hi Max, Paul from our IT team shared your article on security training for new starters. We take on around 40 warehouse staff a month. Is that something you cover?",
      "Hi Kate, thanks for reaching out. Yes, onboarding is a common place to start. How are new starters trained today?",
      "Mostly a printed handbook and a day of shadowing. Happy to talk next week.",
    ],
    george: [
      "Max, Nina and I reviewed the proposal. Two questions: can the reports be split by site, and is the program available in Polish for our plant?",
      "Hi George, reports can be split by site. For Polish I need to check with our content partner; I will come back to you by Friday.",
      "Thanks. If both work, we would like to sign before the end of the month.",
    ],
    simon: {
      subject: "Training dates for the warehouse teams",
      messages: [
        "Hi Max,\n\nRachel forwarded your proposal. From the HR side, the training would need to fit into our monthly team briefings, which take place in the first week of each month.\n\nCould the modules be completed within those sessions?\n\nKind regards,\nSimon Pryce",
        "Hi Simon,\n\nThank you. Yes, each module takes about ten minutes, so two of them fit into one briefing. I will add the briefing dates to the plan for Rachel.\n\nBest regards,\nMax",
      ],
    },
    helen: {
      subject: "Thank you for the workshop",
      messages: [
        "Hi Max,\n\nThank you for last week's workshop. The partners found the examples very practical. Could you send us the slides for the two colleagues who missed it?\n\nBest wishes,\nHelen Garner",
        "Hi Helen,\n\nThank you for the kind feedback. I will send the slides separately today. If your two colleagues have questions, they are welcome to get in touch.\n\nBest regards,\nMax",
      ],
    },
  },
  countryCode: "gb",
  addresses: {
    hollis: ["14 Pontefract Lane", "LS9 8AA", "West Yorkshire", 53.7961, -1.5163],
    marlow: ["22 Victoria Street", "BS1 6AA", "Bristol", 51.4527, -2.5867],
    cedarline: ["8 Norfolk Street", "S1 2HE", "South Yorkshire", 53.3803, -1.4672],
    brightford: ["Unit 3, Sandy Lane", "CV1 4DX", "West Midlands", 52.4192, -1.5123],
    quayside: ["5 Water Street", "L2 0RG", "Merseyside", 53.4056, -2.9935],
    ashcombe: ["31 Pride Park Way", "DE24 8AA", "Derbyshire", 52.9152, -1.4508],
    tidewell: ["40 Bargate Street", "SO14 1HF", "Hampshire", 50.9045, -1.4049],
    kingsgate: ["17 Castle Boulevard", "NG7 1FB", "Nottinghamshire", 52.9476, -1.1555],
    fenwick: ["9 Micklegate", "YO1 6JH", "North Yorkshire", 53.9568, -1.0866],
    larchmont: ["60 Trafford Wharf Road", "M17 1AA", "Greater Manchester", 53.4681, -2.2965],
    northmere: ["2 Grey Street", "NE1 6AE", "Tyne and Wear", 54.9714, -1.6114],
    whitcombe: ["12 Prince of Wales Road", "NR1 1LB", "Norfolk", 52.6289, 1.3002],
  } satisfies Record<OrganizationKey, readonly [string, string, string, number, number]>,
  files: {
    hollisProposal: {
      name: "Proposal – Hollis Freight annual program.pdf",
      lines: [
        "# Proposal: annual awareness program for Hollis Freight",
        "Prepared for Rachel Dawson and Simon Pryce. Twelve months of short modules for drivers, warehouse and office teams, with a quarterly phishing exercise.",
        "## Plan",
        "| Month | What happens |",
        "| 1 | Drivers and warehouse: modules on shared tablets |",
        "| 2 | Office teams join; first team briefing session |",
        "| 3 | First phishing exercise and a one-page board summary with the click rate |",
        "## Price",
        "| Item | Price |",
        "| Annual awareness program, up to 420 staff | £18,400 |",
        "We report the click rate and the reporting rate after every exercise.",
      ],
    },
    ashcombeProposal: {
      name: "Proposal – Ashcombe Engineering three sites.pdf",
      lines: [
        "# Proposal: annual program for Ashcombe Engineering",
        "Three sites, reports split by site, modules in English and Polish for the plant.",
        "## Scope",
        "| Site | Staff | Language |",
        "| Derby head office | 120 | English |",
        "| Derby plant | 110 | English and Polish |",
        "| Burton workshop | 50 | English |",
        "## Price",
        "| Item | Price |",
        "| Annual program, three sites | £24,500 |",
        "Each quarter, every site gets its own click rate and the trend since the baseline.",
      ],
    },
    quaysideProposal: {
      name: "Proposal – Quayside Legal partner workshop.pdf",
      lines: [
        "# Proposal: partner workshop for Quayside Legal",
        "A half-day workshop at your office for up to twelve partners: how attackers target law firms, fake payment requests and safe ways to confirm them.",
        "## Agenda",
        "| Time | Topic |",
        "| 14:00 | Real cases from law firms |",
        "| 15:00 | Live phishing example and what the click rate tells you |",
        "| 16:00 | Payment request checks for the whole firm |",
        "## Price",
        "| Item | Price |",
        "| Partner workshop, half day | £4,800 |",
      ],
    },
    northmereResults: {
      name: "Phishing exercise results – Q3.csv",
      rows: [
        ["Department", "Emails sent", "Clicked", "Click rate", "Reported"],
        ["Underwriting", 64, 5, "7.8%", 31],
        ["Claims", 82, 9, "11.0%", 28],
        ["Customer service", 58, 4, "6.9%", 33],
        ["Finance", 21, 1, "4.8%", 14],
        ["Total", 225, 19, "8.4%", 106],
      ],
    },
  },
  trash: { contact: "Kate Morrison (duplicate)", deal: "Fenwick Accountants – phishing exercises" },
  mateChat: {
    title: "LinkedIn replies without an opportunity",
    messages: [
      "Who replied on LinkedIn this week and has no opportunity yet?",
      "Nine prospects had a LinkedIn conversation in the last 7 days. Seven of them are already on an opportunity. Two are not:\n\n- **Zoe Hartley**, People partner at Larchmont Logistics: last LinkedIn conversation 2 days ago, connection status Messaged. Larchmont already has the opportunity \"Larchmont Logistics – training for new starters\" (£15,800) with Kate Morrison and Paul Heston, so Zoe could be added there.\n- **Ivy Chandler**, Office manager at Quayside Legal: last LinkedIn conversation 4 days ago, connection status Messaged. Quayside's only opportunity, the partner workshop (£4,800), is won; a baseline training for the office could be a next opportunity.\n\nAlso note: Kate Morrison's LinkedIn conversation is still not linked to the Larchmont opportunity. Shall I create a task for each?",
    ],
  },
  mateChatUpdate: {
    title: "Meeting with Claire Whitaker",
    messages: [
      "Claire and I agreed on Wednesday on LinkedIn. Move the Marlow opportunity to Meeting booked, set the next step and add a task for the agenda.",
      "Done. I updated **Marlow Insurance – baseline training for all staff** (£7,200):\n\n- Stage: Conversation to **Meeting booked**\n- Next step: Meeting with Claire and Joe on Wednesday\n- New task **Send Claire a short agenda for Wednesday**, due Wednesday, linked to the opportunity and to Claire Whitaker\n\nClaire's connection status was already Meeting booked, and the call with Claire Whitaker and Joe Harper is in your calendar. I did not send anything: the agenda is yours to write and send.",
    ],
  },
  inbox: {
    paul: {
      subject: "Onboarding modules and our warehouse handhelds",
      messages: [
        "Hi Max,\n\nKate asked me to check the technical side of the onboarding training. Our warehouse staff only have shared handheld scanners with a small browser. Can the modules run on those, or do they need a laptop?\n\nBest,\nPaul Heston",
        "Hi Paul,\n\nGood question. The modules run in any current browser, so a handheld works if its browser is current and the screen is at least 4 inches. I can test one with your device model if you send me the name.\n\nBest,\nMax",
        "Hi Max,\n\nThanks. They run Android 11 with a current browser and have 4.7-inch screens. How does sign-in work? We do not want 40 new accounts a month created by hand.\n\nPaul",
      ],
    },
    priya: {
      subject: "Call with Martin: two time options",
      messages: [
        "Hi Priya,\n\nas promised on LinkedIn, here are two options for our call with Martin: Thursday at 10:00 or Friday at 16:00 in two weeks. About 45 minutes should do.\n\nBest,\nMax",
        "Hi Max,\n\nFriday at 16:00 works for Martin and me. Could our lead nurse join as well? She plans the shifts and will have the clearest requirements.\n\nBest,\nPriya",
        "Hi Priya,\n\nFriday at 16:00 is set, and the lead nurse is very welcome. Once you send me her email address I will send a calendar invite to you, Martin and her. To prepare, it would help to know how many shifts a day she has to plan around.\n\nBest,\nMax",
      ],
    },
    andrew: {
      subject: "Training again this spring?",
      messages: [
        "Hi Max,\n\nA while ago we paused the baseline training because of the year-end accounts. Our cyber insurer now asks for proof of staff training with the renewal, so we are looking at it again. Are you still taking on firms our size?\n\nBest,\nAndrew Cole",
        "Hi Andrew,\n\nGood to hear from you, and yes. Your 38 people are a good size for the baseline training. Would you like the same scope as before, or something lighter?\n\nBest,\nMax",
        "Hi Max,\n\nLighter, please: two modules and one phishing test, done before the renewal in March. Could you send a quote?\n\nAndrew",
      ],
    },
    lucy: {
      subject: "Q3 phishing results for the risk committee",
      messages: [
        "Hi Max,\n\nour risk committee meets on Friday. Could you send me a one-page summary of the Q3 phishing exercise? The auditors will ask about it.\n\nBest,\nLucy Barnard",
        "Hi Lucy,\n\nYes, of course. I will attach the results by department and add a short note on what the click rate means for a team of your size.\n\nBest,\nMax",
        "Hi Max,\n\nThanks. One question for the committee: which department clicked most? And is the refresher session on Thursday still at 13:00?\n\nLucy",
        "Hi Lucy,\n\nClaims clicked most at 11.0 percent (9 of 82), Finance least at 4.8 percent (1 of 21). Overall 19 of 225 people clicked (8.4 percent) and 106 reported the email. The refresher session on Thursday is still at 13:00 and takes 90 minutes. The one-page summary follows this afternoon.\n\nBest,\nMax",
      ],
    },
    zoe: {
      messages: [
        "Hi Max, Kate said you are talking to us about onboarding training. I look after our agency staff. About 25 temps join each month through a staffing agency. Can they be part of it too?",
        "Hi Zoe, yes, temps get the same short modules for the length of their contract. How long do they usually stay?",
        "Most stay four to eight weeks. Mornings are busy, so ten minutes during a break is about all we can ask.",
        "Then ten-minute modules in the break fit well. I would put the three that matter on day one: fake delivery notices, shared logins and how to report something odd.",
        "Sounds good. Could you tell me what that would cost for 25 temps a month? I need a number for our meeting on Friday.",
      ],
    },
    ivy: {
      messages: [
        "Hi Max, the partners are still talking about your workshop. The rest of the office asked whether they can get something similar, just shorter. Is that possible?",
        "Hi Ivy, great to hear. A 45-minute session for the whole office works well. How many people would that be?",
        "About 30, spread over two floors. Lunchtime would be best, and no slides full of jargon please.",
        "Hi Ivy, that is easy to do. I would run one lunchtime session of 45 minutes in plain language, with two live examples of fake payment requests. I can send you a one-page outline today. Would a Tuesday or Wednesday next week suit you?",
      ],
    },
    sarah: {
      messages: [
        "Hi Max, Rachel mentioned the annual program. We have an ISO 27001 audit in January and the auditor will ask for proof of staff training. Does the program give us something to show?",
        "Hi Sarah, yes. You get a completion report per person and, after each phishing exercise, the click rate and the reporting rate per team.",
        "Good. Does it show who has not completed a module? That is the first thing they will ask.",
        "Yes, there is a list of open modules per person and team that you can export to a spreadsheet.",
        "Perfect. Please put that in writing for me, a short paragraph is enough, so I can add it to the audit folder.",
      ],
    },
    oliver: {
      messages: [
        "Hi Max, before we decide on the baseline training, could we see what a module looks like? I mainly want to know whether store managers would finish it.",
        "Hi Oliver, good idea. I will send you a ten-minute sample module for store managers this week, with the quiz at the end.",
        "Thanks. Amy Lowe runs our training and would like to try it too, could you include her?",
        "Of course, I will send it to both of you. Then we can talk about the rollout once you have had a look.",
      ],
    },
    tom: {
      messages: [
        "Hi Max, saw your post on phishing exercises. We would like to try one at the plant, 350 people. The problem: most of the shop floor never uses email.",
        "Hi Tom, thanks for writing. Good that you mention it, because it changes how the pilot should work. Let me think about a way to reach the shop floor too.",
        "OK, thank you. Some of them have a shared kiosk PC.",
        "That helps. Once I know roughly how many people at the plant use email, I can size the pilot. Can you find that out?",
      ],
    },
  } satisfies Record<InboxKey, InboxThreadText>,
  agentNotes: {
    deal: {
      hollisProgram:
        "Summary by Claude after the call with Rachel Dawson and Simon Pryce:\nStart with drivers and warehouse on shared tablets, office teams in the second quarter.\nThe modules must fit the monthly team briefings in the first week of the month.\nOpen: the three-month rollout outline for the board meeting on the 14th.",
      ashcombeProgram:
        "Draft by ChatGPT for the reply to George Lamb:\nReports can be split by site. The Polish version needs a check with our content partner by Friday.\nSuggested wording: confirm both points in one message and propose signing before the end of the month.",
    },
    organization: {
      northmere:
        "Checked by Codex (script run on the Q3 results file):\nDepartment totals match the company record: 225 emails, 19 clicks (8.4%), 106 reports.\nHighest click rate: Claims at 11.0%. Lowest: Finance at 4.8%.\nUsed for the refresher session on Thursday.",
    },
    task: {
      linkKateConversation:
        "Task created by Claude from Kate Morrison's LinkedIn message:\nAround 40 warehouse starters a month. Onboarding today is a printed handbook and a day of shadowing.\nLink the conversation once the scope is clear. It is not linked yet on purpose.",
    },
  },
  agents: {
    company: "Clearwatch Awareness",
    records: "prospects, companies, opportunities and tasks",
    mate: "It researches new LinkedIn connections, finds companies like the ones we won and turns a sentence in chat into a record update or a task.",
    claude:
      "Max has it summarize a call into the opportunity notes, find prospects who replied but have no opportunity yet and prepare the outline for a workshop.",
    chatgpt:
      "It drafts replies to prospects' questions from the proposal and the notes; Max reads and edits every draft in the Inbox.",
    codex:
      "It runs scripts on exports, for example checking the results file of a phishing exercise against the department totals on the company record.",
    followUp:
      'The routine "Every morning, draft follow-ups for opportunities due today" runs on weekday mornings. It reads the opportunities whose next step date is today or earlier, looks at the conversation linked to each and saves a short reply draft when the prospect wrote last. The drafts wait in the Inbox until Max has read and sent them. The routine never sends a message and never links a conversation.',
  } satisfies AgentsPageText,
  events: [
    "Call with Claire Whitaker and Joe Harper (Marlow Insurance)",
    "Call with Fiona Blake about the leadership workshop",
    "Call with Martin Ashby and Priya Nair (Cedarline Health)",
  ],
  calendarName: "Calls",
};

type Strings = typeof en;

const de: Strings = {
  company: "Wachblick Schulungen GmbH",
  workspaceName: "LinkedIn",
  website: "https://wachblick-schulungen.example",
  selfTitle: "Geschäftsführer",
  lists: {
    contact: [
      "Interessent",
      "Interessenten",
      "Menschen, die wir über LinkedIn, Veranstaltungen und Empfehlungen kennen.",
    ],
    organization: [
      "Firma",
      "Firmen",
      "Unternehmen, für die unsere Interessenten arbeiten, mit dem Wert ihrer Verkaufschancen.",
    ],
    deal: ["Verkaufschance", "Verkaufschancen", "Schulungen und Programme, über die wir sprechen, mit ihrem Wert."],
    task: ["Aufgabe", "Aufgaben", "Nächste Schritte mit Fälligkeitsdatum."],
  },
  fields: {
    jobTitle: "Position",
    howWeMet: "Kennengelernt über",
    lastLinkedinChat: "Letztes LinkedIn-Gespräch",
    conversationStatus: "Verbindungsstatus",
    industry: "Branche",
    address: "Adresse",
    website: "Website",
    employees: "Mitarbeitende",
    opportunityValue: "Wert der Verkaufschancen",
    offering: "Angebot",
    closeDate: "Erwarteter Abschluss",
    nextStep: "Nächster Schritt",
    nextStepDate: "Datum nächster Schritt",
    lostReason: "Verlustgrund",
    trainingSessions: "Schulungstermine",
    proposal: "Angebot und Ergebnisse",
    dueDate: "Fällig am",
    priority: "Priorität",
  },
  options: {
    conversationStatus: {
      connected: "Vernetzt",
      messaged: "Angeschrieben",
      replied: "Geantwortet",
      meetingBooked: "Termin vereinbart",
      client: "Kunde",
    },
    howWeMet: {
      event: "Veranstaltung",
      introduction: "Empfehlung",
      linkedinConversation: "LinkedIn-Gespräch",
      inbound: "Eigene Anfrage",
    },
    industry: {
      logistics: "Logistik",
      insurance: "Versicherung",
      healthcare: "Gesundheitswesen",
      manufacturing: "Produktion",
      legal: "Recht",
      engineering: "Ingenieurwesen",
      retail: "Handel",
      housing: "Wohnungswirtschaft",
      accounting: "Steuerberatung",
    },
    offering: {
      baselineTraining: "Grundschulung",
      annualProgram: "Awareness-Jahresprogramm",
      phishingExercise: "Phishing-Übungen",
      leadershipWorkshop: "Workshop für Führungskräfte",
    },
    lostReason: { price: "Preis", timing: "Zeitpunkt", inHouse: "Intern gelöst" },
    priority: { low: "Niedrig", medium: "Mittel", high: "Hoch" },
  },
  stages: {
    identified: "Identifiziert",
    conversation: "Im Gespräch",
    meetingBooked: "Termin vereinbart",
    proposal: "Angebot gesendet",
    won: "Gewonnen",
    lost: "Verloren",
  },
  organizations: {
    hollis: ["Hollmann Spedition GmbH", "Bremen", "hollmann-spedition.example"],
    marlow: ["Mahrenholz Versicherungsmakler", "Hamburg", "mahrenholz-makler.example"],
    cedarline: ["Klinikverbund Zedernhof", "Kassel", "zedernhof-kliniken.example"],
    brightford: ["Brückner Maschinenbau AG", "Bielefeld", "brueckner-maschinenbau.example"],
    quayside: ["Kanzlei am Kai", "Hamburg", "kanzlei-am-kai.example"],
    ashcombe: ["Aschenbach Ingenieure GmbH", "Stuttgart", "aschenbach-ingenieure.example"],
    tidewell: ["Tiedemann Handelshaus", "Lübeck", "tiedemann-handel.example"],
    kingsgate: ["Wohnungsbau Königstor eG", "Hannover", "koenigstor-wohnen.example"],
    fenwick: ["Fehrmann & Partner Steuerberater", "Münster", "fehrmann-partner.example"],
    larchmont: ["Lärchenfeld Logistik GmbH", "Erfurt", "laerchenfeld-logistik.example"],
    northmere: ["Nordmeer Versicherung AG", "Kiel", "nordmeer-versicherung.example"],
    whitcombe: ["Weißenfels Pflegeheime", "Leipzig", "weissenfels-pflege.example"],
  },
  contacts: {
    rachel: ["Rebecca", "Dreyer", "IT-Leiterin"],
    simon: ["Simon", "Pfeiffer", "Personalleiter"],
    claire: ["Claudia", "Wittmann", "Leiterin Betrieb"],
    joe: ["Jonas", "Harms", "IT-Koordinator"],
    martin: ["Martin", "Albers", "Informationssicherheitsbeauftragter"],
    priya: ["Petra", "Nolte", "Leiterin Personal"],
    tom: ["Thomas", "Kemper", "IT-Leiter Werk"],
    helen: ["Helene", "Gärtner", "Büroleiterin"],
    george: ["Georg", "Lammers", "Leiter IT"],
    nina: ["Nina", "Vogt", "Compliance-Managerin"],
    oliver: ["Oliver", "Schütte", "IT-Direktor"],
    amy: ["Anja", "Lohmann", "Schulungskoordinatorin"],
    fiona: ["Friederike", "Blank", "Vorständin"],
    andrew: ["Andreas", "Kolbe", "Geschäftsführender Partner"],
    kate: ["Katrin", "Morawe", "Personalleiterin"],
    paul: ["Paul", "Hesse", "Verantwortlicher IT-Sicherheit"],
    lucy: ["Lena", "Bernhardt", "Leiterin Risikomanagement"],
    mark: ["Markus", "Ehlers", "Leiter Betrieb"],
    sarah: ["Sabine", "Quast", "Leiterin Compliance"],
    dan: ["Daniel", "Merten", "Qualitätsmanager"],
    ella: ["Elena", "Graf", "Leiterin Kundenservice"],
    maya: ["Maja", "Peters", "Leiterin Underwriting"],
    ivy: ["Iris", "Claßen", "Büroleiterin"],
    zoe: ["Zoe", "Hartung", "Personalreferentin"],
  },
  deals: {
    hollisProgram: "Hollmann Spedition – Awareness-Jahresprogramm",
    marlowBaseline: "Mahrenholz – Grundschulung für alle Mitarbeitenden",
    cedarlineProgram: "Klinikverbund Zedernhof – Programm für das Pflege- und Ärzteteam",
    brightfordPilot: "Brückner Maschinenbau – Pilot Phishing-Übungen",
    quaysideWorkshop: "Kanzlei am Kai – Workshop für die Partner",
    ashcombeProgram: "Aschenbach Ingenieure – Jahresprogramm für drei Standorte",
    tidewellBaseline: "Tiedemann Handelshaus – Grundschulung für Filialleitungen",
    kingsgateLeadership: "Wohnungsbau Königstor – Workshop für Führungskräfte",
    fenwickBaseline: "Fehrmann & Partner – Grundschulung",
    larchmontProgram: "Lärchenfeld Logistik – Schulung für neue Mitarbeitende",
    cedarlineWorkshop: "Klinikverbund Zedernhof – Workshop für die Geschäftsführung",
    hollisLeadership: "Hollmann Spedition – Workshop für Führungskräfte",
    whitcombeProgram: "Weißenfels Pflegeheime – Awareness-Jahresprogramm",
    hollisPhishing: "Hollmann Spedition – Phishing-Übungen",
    hollisBaseline: "Hollmann Spedition – Grundschulung für die Disposition",
    northmereRefresh: "Nordmeer Versicherung – Auffrischung Phishing-Übungen",
  },
  nextSteps: {
    hollisProgram: "Frau Dreyer den Ablaufplan für drei Monate schicken",
    marlowBaseline: "Termin mit Frau Wittmann und Herrn Harms am Mittwoch",
    cedarlineProgram: "Telefonat mit Herrn Albers und Frau Nolte",
    brightfordPilot: "Herrn Kemper fragen, wie viele im Werk E-Mail nutzen",
    ashcombeProgram: "Berichte je Standort und polnische Fassung bestätigen",
    tidewellBaseline: "Rückmeldung von Herrn Schütte zum Beispielmodul",
    kingsgateLeadership: "Frau Blank die Gliederung des Workshops schicken",
    larchmontProgram: "Erstes Gespräch mit Frau Morawe zur Einarbeitung",
  },
  tasks: {
    replyRachel: "Frau Dreyer mit dem Ablaufplan antworten",
    agendaClaire: "Frau Wittmann eine kurze Agenda für Mittwoch schicken",
    linkKateConversation: "LinkedIn-Gespräch mit Frau Morawe verknüpfen, sobald die Verkaufschance klar ist",
    answerAshcombe: "Fragen von Herrn Lammers zu Standortberichten und Sprachen beantworten",
    sampleModuleTidewell: "Herrn Schütte ein Beispielmodul zeigen",
    followUpTom: "Bei Herrn Kemper von Brückner nachfassen",
    leadershipOutline: "Gliederung des Führungskräfte-Workshops für Königstor schreiben",
    quaysideSlides: "Folien des Workshops an Frau Gärtner schicken",
    briefingDatesSimon: "Termine der Teambesprechungen bei Hollmann in den Ablaufplan aufnehmen",
    meetupNotes: "Notizen vom regionalen Sicherheitsstammtisch aufschreiben",
  },
  views: {
    byConnection: "Interessenten nach Verbindungsstatus",
    prospects: "Letzte LinkedIn-Gespräche",
    pipeline: "Pipeline",
    nextSteps: "Nächste Schritte",
    dueSoon: "Bald fällig",
    trainingCalendar: "Schulungskalender",
  },
  widgets: {
    openPipeline: "Offene Pipeline",
    won: "Gewonnen in 12 Monaten",
    recentChats: "Gespräche der letzten 7 Tage",
    meetingsBooked: "Vereinbarte Termine",
    byStatus: "Interessenten nach Verbindungsstatus",
    byHowWeMet: "Interessenten nach Kennenlernweg",
    byStage: "Pipeline nach Phase",
    wonByMonth: "Gewonnener Wert pro Monat",
    latestChats: "Neueste LinkedIn-Gespräche",
    chatsMonth: "LinkedIn-Gespräche im Monat",
  },
  wiki: {
    guide: {
      title: "Leitfaden",
      markdown: [
        "Wachblick Schulungen bietet Sicherheitsschulungen für mittelständische Unternehmen an: Grundschulungen, Jahresprogramme, Phishing-Übungen und Workshops für Führungskräfte. Die meisten Beziehungen beginnen oder entwickeln sich in LinkedIn-Gesprächen. Dieser Arbeitsbereich enthält Demodaten; alle Firmen und Personen sind erfunden.",
        "",
        "## So nutzen wir das CRM",
        "- **Interessenten** sind die Menschen, mit denen wir sprechen. Bei jedem stehen der Kennenlernweg, der Verbindungsstatus und das Datum des letzten LinkedIn-Gesprächs. Das Board „Interessenten nach Verbindungsstatus“ zeigt, mit wem wir vernetzt sind, wen wir angeschrieben haben, wer geantwortet hat und mit wem ein Termin steht.",
        "- **Firmen** sind die Unternehmen, für die sie arbeiten; der Wert der Verkaufschancen summiert alle ihre Verkaufschancen. **Verkaufschancen** sind Schulungen und Programme, über die wir sprechen; die Phase zeigt den Stand des Gesprächs, den Wert tragen wir von Hand ein.",
        "- **Aufgaben** und das Datum des nächsten Schritts sind normale Felder. Niemand wird automatisch erinnert, deshalb jeden Morgen die Ansichten „Nächste Schritte“ und „Bald fällig“ prüfen.",
        "- Schulungstermine stehen im Schulungskalender, Angebote als Dateien an der Verkaufschance; Termine aus LinkedIn in Max' Google-Kalender.",
        "",
        "## LinkedIn-Gespräche",
        "- Die Gespräche stammen aus Max' eigenem verbundenen LinkedIn-Konto: was Max dort gesendet und empfangen hat, neben seinen E-Mails.",
        "- Ein Gespräch gehört nur dann zu einer Verkaufschance oder Firma, wenn jemand es verknüpft. Nichts wird automatisch verknüpft; das Gespräch mit Katrin Morawe ist noch nicht verknüpft.",
        "- Jede Nachricht schreibt ein Mensch, ein Gespräch nach dem anderen. Wir importieren keine Kontaktlisten und schreiben nicht viele Menschen auf einmal an.",
        "",
        "## Routinen",
        "- **Neue LinkedIn-Kontakte recherchieren:** Wenn eine Kontaktanfrage angenommen wird, schlägt Mate die Person nach, füllt leere Felder, die sich belegen lassen, und legt bei Bedarf eine Aufgabe an.",
        "- **Ähnliche Interessenten auf LinkedIn finden:** Jeden Montag sucht Mate im Sales Navigator nach Firmen wie denen, die wir gewonnen haben, und listet sie in einer Aufgabe zur Prüfung.",
        "- Routinen schreiben nur Notizen, Aufgaben und Entwürfe und senden nie; das bleibt bei Max. Mehr auf der Seite „So arbeiten unsere Agenten mit diesem CRM“.",
      ],
    },
    stages: {
      title: "Phasen einer Verkaufschance",
      markdown: [
        "Eine Verkaufschance durchläuft diese Phasen, während sich das Gespräch mit dem Interessenten entwickelt. Die Phase setzen wir von Hand.",
        "",
        "## Phasen",
        "1. **Identifiziert:** Wir kennen Person und Unternehmen, haben aber noch nicht über Schulungen gesprochen.",
        "2. **Im Gespräch:** ein echter Austausch über ihre Lage, meist auf LinkedIn.",
        "3. **Termin vereinbart:** Ein Telefonat oder Treffen ist vereinbart oder hat stattgefunden.",
        "4. **Angebot gesendet:** Umfang, Termine und Wert stehen in der Verkaufschance, das Angebot ist verschickt.",
        "5. **Gewonnen oder Verloren:** Ergebnis festhalten, bei Verlust mit Grund.",
      ],
    },
    linking: {
      title: "LinkedIn-Gespräch verknüpfen",
      whenToUse:
        "Wenn aus einem LinkedIn-Gespräch eine konkrete Verkaufschance wird oder es eine Firma betrifft, mit der wir arbeiten.",
      markdown: [
        "Gespräche aus Max' LinkedIn-Konto sind mit keinem Datensatz verknüpft, bis ein Mensch sie verknüpft. So gehen wir bei jedem wichtigen Gespräch vor.",
        "",
        "## Schritte",
        "1. Das Gespräch im Posteingang öffnen und prüfen, ob die Person als Interessent im CRM steht. Falls nicht, mit Position und Kennenlernweg anlegen.",
        "2. Das Gespräch mit der Verkaufschance und bei Bedarf mit der Firma verknüpfen.",
        "3. Verbindungsstatus und Datum des letzten LinkedIn-Gesprächs beim Interessenten aktualisieren.",
        "4. Nächsten Schritt und Datum in der Verkaufschance eintragen und für jede Zusage eine Aufgabe anlegen.",
      ],
    },
    firstMessages: {
      title: "Kontaktanfragen und erste Nachrichten",
      markdown: [
        "Jede Kontaktanfrage und jede erste Nachricht auf LinkedIn schreibt Max selbst, eine Person nach der anderen. Mate darf einen Entwurf vorbereiten, aber nichts geht raus, ohne dass Max es liest und abschickt.",
        "",
        "## Kontaktanfragen",
        "- Eine Anfrage nur mit Anlass senden: ein Vortrag, eine Empfehlung, eine gemeinsame Veranstaltung oder ein Beitrag der Person.",
        "- Einen Satz ergänzen, der diesen Anlass nennt. Kein Verkaufsgespräch in der Anfrage.",
        "- Den Verbindungsstatus auf Vernetzt setzen, sobald die Anfrage angenommen ist.",
        "",
        "## Erste Nachrichten",
        "- Warten, bis die Person angenommen hat. Auf ihren Beitrag oder ihre Aussage eingehen und eine Frage zu ihrer Lage stellen.",
        "- Keine Broschüren oder Preislisten an eine erste Nachricht hängen.",
        "- Den Verbindungsstatus auf Angeschrieben setzen und auf Geantwortet, sobald eine Antwort kommt.",
        "",
        "## Was wir nie tun",
        "- Keine Nachrichtenfolgen, keine automatischen Nachfassnachrichten und keine Nachrichten an viele Menschen auf einmal.",
        "- Keine Kontaktlisten aus LinkedIn gesammelt ins CRM importieren.",
      ],
    },
  },
  routines: {
    research: {
      name: "Neue LinkedIn-Kontakte recherchieren",
      task: "Prüfe die angenommene LinkedIn-Verbindung aus dem Provider-Ereignis mit den verfügbaren LinkedIn-Werkzeugen. Ermittle einen vorhandenen Interessenten über seine Identitätskanäle, bevor du einen CRM-Datensatz änderst. Recherchiere öffentliche Angaben zu Unternehmen und Rolle, fülle nur eindeutige leere normale Felder wie Position und Kennenlernweg, setze den Verbindungsstatus auf Vernetzt, wenn er leer ist, und hänge die Quellen an die Notizen an. Wenn ein nächster Schritt nötig ist, lege eine normale Aufgabe an, die mit dem Interessenten verknüpft ist, und vermeide Doppelungen. Sende nie eine Nachricht oder Kontaktanfrage, lege keine unbestätigte Identität an und überschreibe keine vorhandenen Angaben.",
      runs: [
        "Position und Kennenlernweg bei Katrin Morawe ergänzt und eine Aufgabe angelegt, nach der Einarbeitung bei Lärchenfeld zu fragen.",
        "Ich konnte den Modellanbieter bei diesem Versuch nicht erreichen und habe aufgehört, bevor ich etwas gelesen oder geändert habe. Nichts wurde verändert.",
        "Zoe Hartung war bereits mit vollständigen Feldern als Interessentin angelegt; es war nichts zu ändern.",
      ],
    },
    similar: {
      name: "Ähnliche Interessenten auf LinkedIn finden",
      task: "Finde jeden Montag Firmen, die denen ähneln, bei denen wir Verkaufschancen gewonnen haben. Ermittle die konfigurierte Phase Gewonnen, frage die passenden Verkaufschancen ab und lies ihre Firmen, Branchen und Mitarbeiterzahlen. Beschreibe das Muster, das diese Datensätze stützen. Nutze linkedin_get_sales_search_parameters vor linkedin_search_sales_companies und linkedin_search_sales_leads; begrenze die Suche auf zehn Firmen in Deutschland, Österreich und der Schweiz. Entferne Firmen, die schon im CRM stehen, anhand von Name und Website. Nenne für jede verbleibende Firma höchstens zwei mögliche Entscheider mit ihrer Rolle. Lege eine normale Aufgabe „LinkedIn-Interessenten prüfen <JJJJ-MM-TT>“ für Max an, mit den Firmen, Entscheidern und dem jeweiligen Grund in den Notizen. Lege keine Firmen, Interessenten oder Verkaufschancen an, sende keine Nachrichten oder Kontaktanfragen und speichere keine LinkedIn-Listen. Gibt es kein verwertbares Ergebnis, schreibe nichts.",
      runs: [
        "4 Firmen aus Logistik und Versicherung mit 7 möglichen Entscheidern in einer Aufgabe zur Prüfung vorgeschlagen.",
        "Ich konnte den Modellanbieter bei diesem Versuch nicht erreichen und habe aufgehört, bevor ich etwas gelesen oder geändert habe. Nichts wurde verändert. Der nächste geplante Lauf holt das nach.",
        "3 Firmen aus dem Gesundheitswesen mit 5 möglichen Entscheidern vorgeschlagen; 2 Treffer standen schon im CRM und wurden weggelassen.",
      ],
    },
    followUp: {
      name: "Jeden Morgen Nachfass-Entwürfe für fällige Verkaufschancen",
      task: "Lies an jedem Werktagmorgen die Verkaufschancen, deren Phase Identifiziert, Im Gespräch, Termin vereinbart oder Angebot gesendet ist und deren Datum nächster Schritt heute oder früher liegt. Lies für jede die mit ihr verknüpften Gespräche mit get_messaging_threads. Wenn die letzte Nachricht vom Interessenten stammt und das Gespräch keinen Entwurf hat, speichere mit save_message_draft einen kurzen Antwortentwurf in diesem Gespräch: die Frage in zwei oder drei Sätzen beantworten, in Max' Stimme, mit einem Vorschlag für den nächsten Schritt. Einen vorhandenen Entwurf lässt du unverändert. Stammt die letzte Nachricht von uns, tust du nichts und nennst das Gespräch in der Zusammenfassung. Ist kein Gespräch verknüpft, lege nur dann eine normale Aufgabe „Nachfassen bei <Name des Interessenten>“ mit Fälligkeit heute an, wenn es für diesen Interessenten oder diese Verkaufschance noch keine offene Aufgabe gibt. Sende nie eine Nachricht, verknüpfe nie ein Gespräch und ändere die Verkaufschance nicht.",
      runs: [
        "Drei Verkaufschancen waren fällig. Bei der Hollmann Spedition gab es für Frau Dreyer schon einen Antwortentwurf, ich habe ihn unverändert gelassen. Bei Brückner Maschinenbau stammt die letzte Nachricht von uns und wartet auf Herrn Kemper. Lärchenfeld Logistik hat kein verknüpftes Gespräch; die offene Aufgabe, das Gespräch mit Frau Morawe zu verknüpfen, deckt das ab, deshalb habe ich nichts angelegt. Es wurde nichts gesendet.",
        "Antwortentwurf für Herrn Albers vom Klinikverbund Zedernhof gespeichert, zu einem Telefonat in zwei Wochen und mit der Bitte, Frau Nolte einzubinden. Es wurde nichts gesendet.",
        "Entwurf für Frau Blank von Wohnungsbau Königstor gespeichert, der einen halbtägigen Workshop für Führungskräfte in ihren Räumen anbietet. Es wurde nichts gesendet.",
      ],
    },
    questions: {
      name: "LinkedIn-Fragen in Aufgaben verwandeln",
      task: "Lies die neue LinkedIn-Nachricht aus routine_trigger. Ermittle den Absender über seine Identitätskanäle und mache nur für einen vorhandenen Interessenten weiter. Wenn die Nachricht Max um ein Dokument, einen Preis, einen Termin oder eine Entscheidung bittet, lege eine normale Aufgabe „<Name des Interessenten> antworten: <Thema>“ mit Fälligkeit in zwei Tagen an, verknüpft mit dem Interessenten, der Firma und, wenn der Absender genau eine offene Verkaufschance hat, mit dieser; schreibe die Frage in die Notizen. Für Dank, Grüße und Bestätigungen legst du keine Aufgabe an, für dieselbe Frage nur eine. Sende nie eine Nachricht, speichere keinen Entwurf und ändere keinen anderen Datensatz.",
      runs: [
        "Georg Lammers hat gefragt, ob sich die Berichte nach Standort aufteilen lassen und ob es das Programm auf Polnisch gibt. Die offene Aufgabe, seine Fragen zu Standortberichten und Sprachen zu beantworten, deckt beides ab, deshalb habe ich nichts angelegt.",
        "Claudia Wittmann hat den Mittwochnachmittag für das Telefonat bestätigt. Die Nachricht enthält keine Frage an Max, deshalb wurde keine Aufgabe angelegt.",
        "Ich konnte den Modellanbieter bei diesem Versuch nicht erreichen und habe aufgehört, bevor ich etwas gelesen habe. Nichts wurde verändert.",
      ],
    },
  },
  threads: {
    rachel: [
      "Hallo Herr Bergmann, danke für das Angebot. Herr Pfeiffer und ich sind es gestern durchgegangen. Eine Frage: Kann das Jahresprogramm mit den Fahrern und dem Lager beginnen? Die meisten nutzen dort nur gemeinsame Tablets.",
      "Hallo Frau Dreyer, ja. Wir würden mit kurzen Modulen starten, die auf gemeinsam genutzten Geräten funktionieren, und die Büroteams im zweiten Quartal dazunehmen. Ein Beispielmodul zeige ich Ihnen gern in einem Telefonat.",
      "Das wäre hilfreich. Könnten Sie auch einen groben Plan für die ersten drei Monate schicken? Unser Vorstand tagt am 14.",
      "Hallo Frau Dreyer, hier der Ablauf: im ersten Monat Fahrer und Lager, im zweiten die Büroteams, im dritten eine erste Phishing-Übung und eine einseitige Zusammenfassung für Ihren Vorstand. Wollen wir das am Donnerstag kurz besprechen?",
    ],
    martin: [
      "Herr Bergmann, Ihr Beitrag über Phishing-Übungen in Kliniken ist mir hängen geblieben. Unser Pflege- und Ärzteteam hat kaum Zeit für Schulungen. Wie gehen Sie damit um?",
      "Hallo Herr Albers, mit Modulen von fünf Minuten, abgestimmt auf die Schichtwechsel, und ohne Übungen zu Stoßzeiten. Ich erzähle Ihnen gern, wie andere Kliniken das umgesetzt haben.",
      "Gut. Frau Nolte aus der Personalabteilung sollte beim nächsten Gespräch dabei sein. Passt ein Telefonat in zwei Wochen?",
      "Sehr gern. Ich schicke Ihnen und Frau Nolte zwei Terminvorschläge.",
    ],
    claire: [
      "Hallo Herr Bergmann, schön, Sie beim Risikofrühstück in Hamburg kennengelernt zu haben. Wie gesagt: Gefälschte Zahlungsaufforderungen sind unsere größte Sorge. Können wir über eine Grundschulung für alle 60 Mitarbeitenden sprechen?",
      "Hallo Frau Wittmann, ganz meinerseits. Eine Grundschulung ist ein guter Anfang. Passt Ihnen und Herrn Harms nächste Woche ein Termin von 45 Minuten?",
      "Ja. Dienstag- oder Mittwochnachmittag geht bei uns beiden.",
      "Dann Mittwoch um 14 Uhr. Ich schicke vorab eine kurze Agenda.",
    ],
    fiona: [
      "Herr Bergmann, danke für Ihren Vortrag auf dem Verbandstag der Wohnungswirtschaft. Unserem Vorstand würde eine Sitzung dazu guttun, wie Angreifer gezielt Führungskräfte ansprechen. Bieten Sie so etwas bei uns vor Ort an?",
      "Hallo Frau Blank, vielen Dank. Ja, als halbtägigen Workshop in Ihren Räumen für bis zu zwölf Personen. Gern schicke ich Ihnen eine Gliederung der Themen.",
      "Sehr gern. Ich würde den Workshop auf unseren Führungskräftetag im Dezember legen.",
    ],
    kate: [
      "Hallo Herr Bergmann, Herr Hesse aus unserer IT hat Ihren Artikel über Sicherheitsschulungen für neue Mitarbeitende geteilt. Wir stellen im Monat rund 40 Leute im Lager ein. Decken Sie so etwas ab?",
      "Hallo Frau Morawe, danke für Ihre Nachricht. Ja, die Einarbeitung ist ein häufiger Startpunkt. Wie werden neue Mitarbeitende heute geschult?",
      "Vor allem mit einem gedruckten Handbuch und einem Tag Mitlaufen. Gern sprechen wir nächste Woche.",
    ],
    george: [
      "Herr Bergmann, Frau Vogt und ich haben das Angebot durchgesehen. Zwei Fragen: Lassen sich die Berichte nach Standort aufteilen, und gibt es das Programm für unser Werk auch auf Polnisch?",
      "Hallo Herr Lammers, die Berichte lassen sich nach Standort aufteilen. Die polnische Fassung kläre ich mit unserem Inhaltspartner und melde mich bis Freitag.",
      "Danke. Wenn beides klappt, möchten wir noch vor Monatsende unterschreiben.",
    ],
    simon: {
      subject: "Schulungstermine für die Lagerteams",
      messages: [
        "Sehr geehrter Herr Bergmann,\n\nFrau Dreyer hat mir Ihr Angebot weitergeleitet. Aus Sicht der Personalabteilung müsste die Schulung in unsere monatlichen Teambesprechungen passen, die jeweils in der ersten Woche des Monats stattfinden.\n\nLassen sich die Module in diesen Terminen durcharbeiten?\n\nMit freundlichen Grüßen\nSimon Pfeiffer",
        "Sehr geehrter Herr Pfeiffer,\n\nvielen Dank. Ja, jedes Modul dauert etwa zehn Minuten, zwei davon passen also in eine Besprechung. Ich nehme die Termine in den Ablaufplan für Frau Dreyer auf.\n\nMit freundlichen Grüßen\nMax Bergmann",
      ],
    },
    helen: {
      subject: "Danke für den Workshop",
      messages: [
        "Sehr geehrter Herr Bergmann,\n\nvielen Dank für den Workshop letzte Woche. Die Partner fanden die Beispiele sehr praxisnah. Könnten Sie uns die Folien für die beiden Kollegen schicken, die nicht dabei sein konnten?\n\nViele Grüße\nHelene Gärtner",
        "Sehr geehrte Frau Gärtner,\n\nvielen Dank für die freundliche Rückmeldung. Die Folien schicke ich Ihnen heute separat. Wenn Ihre Kollegen Fragen haben, können sie sich gern bei mir melden.\n\nMit freundlichen Grüßen\nMax Bergmann",
      ],
    },
  },
  countryCode: "de",
  addresses: {
    hollis: ["Am Speicher XI 4", "28217", "Bremen", 53.0929, 8.7678],
    marlow: ["Ballindamm 17", "20095", "Hamburg", 53.5527, 9.9968],
    cedarline: ["Mönchebergstraße 41", "34125", "Hessen", 51.3233, 9.5052],
    brightford: ["Eckendorfer Straße 92", "33609", "Nordrhein-Westfalen", 52.0336, 8.5559],
    quayside: ["Am Sandtorkai 50", "20457", "Hamburg", 53.5432, 9.9887],
    ashcombe: ["Heilbronner Straße 86", "70191", "Baden-Württemberg", 48.7971, 9.1841],
    tidewell: ["Breite Straße 29", "23552", "Schleswig-Holstein", 53.8686, 10.6866],
    kingsgate: ["Königstraße 44", "30175", "Niedersachsen", 52.3755, 9.7477],
    fenwick: ["Ludgeristraße 56", "48143", "Nordrhein-Westfalen", 51.96, 7.6286],
    larchmont: ["Am Güterverkehrszentrum 6", "99092", "Thüringen", 50.9701, 10.9604],
    northmere: ["Holstenstraße 52", "24103", "Schleswig-Holstein", 54.3216, 10.1326],
    whitcombe: ["Prager Straße 120", "04317", "Sachsen", 51.3277, 12.4086],
  },
  files: {
    hollisProposal: {
      name: "Angebot – Jahresprogramm Hollmann Spedition.pdf",
      lines: [
        "# Angebot: Awareness-Jahresprogramm für die Hollmann Spedition",
        "Für Rebecca Dreyer und Simon Pfeiffer. Zwölf Monate kurze Module für Fahrer, Lager und Büro, mit einer Phishing-Übung pro Quartal.",
        "## Ablauf",
        "| Monat | Inhalt |",
        "| 1 | Fahrer und Lager: Module auf gemeinsam genutzten Tablets |",
        "| 2 | Die Büroteams kommen dazu; erste Teambesprechung |",
        "| 3 | Erste Phishing-Übung und eine Seite für die Geschäftsführung mit der Klickrate |",
        "## Preis",
        "| Position | Preis |",
        "| Awareness-Jahresprogramm, bis 420 Mitarbeitende | 18.400 € |",
        "Nach jeder Übung berichten wir die Klickrate (click rate) und die Melderate.",
      ],
    },
    ashcombeProposal: {
      name: "Angebot – Aschenbach Ingenieure drei Standorte.pdf",
      lines: [
        "# Angebot: Jahresprogramm für Aschenbach Ingenieure",
        "Drei Standorte, Berichte je Standort, Module auf Deutsch und Polnisch für das Werk.",
        "## Umfang",
        "| Standort | Mitarbeitende | Sprache |",
        "| Zentrale Stuttgart | 120 | Deutsch |",
        "| Werk Stuttgart | 110 | Deutsch und Polnisch |",
        "| Werkstatt Esslingen | 50 | Deutsch |",
        "## Preis",
        "| Position | Preis |",
        "| Jahresprogramm, drei Standorte | 24.500 € |",
        "Jedes Quartal bekommt jeder Standort seine eigene Klickrate (click rate) und den Verlauf seit der Grundschulung.",
      ],
    },
    quaysideProposal: {
      name: "Angebot – Workshop Kanzlei am Kai.pdf",
      lines: [
        "# Angebot: Workshop für die Partner der Kanzlei am Kai",
        "Ein halbtägiger Workshop in Ihren Räumen für bis zu zwölf Partner: wie Angreifer Kanzleien ins Visier nehmen, gefälschte Zahlungsaufforderungen und wie man sie sicher prüft.",
        "## Ablauf",
        "| Uhrzeit | Thema |",
        "| 14:00 | Echte Fälle aus Kanzleien |",
        "| 15:00 | Live-Beispiel und was die Klickrate (click rate) aussagt |",
        "| 16:00 | Prüfung von Zahlungsaufforderungen für die ganze Kanzlei |",
        "## Preis",
        "| Position | Preis |",
        "| Partner-Workshop, halber Tag | 4.800 € |",
      ],
    },
    northmereResults: {
      name: "Ergebnisse Phishing-Übung – Q3.csv",
      rows: [
        ["Abteilung", "Gesendete E-Mails", "Geklickt", "Klickrate (click rate)", "Gemeldet"],
        ["Underwriting", 64, 5, "7,8 %", 31],
        ["Schaden", 82, 9, "11,0 %", 28],
        ["Kundenservice", 58, 4, "6,9 %", 33],
        ["Finanzen", 21, 1, "4,8 %", 14],
        ["Gesamt", 225, 19, "8,4 %", 106],
      ],
    },
  },
  trash: { contact: "Katrin Morawe (Duplikat)", deal: "Fehrmann & Partner – Phishing-Übungen" },
  mateChat: {
    title: "LinkedIn-Antworten ohne Verkaufschance",
    messages: [
      "Wer hat diese Woche auf LinkedIn geantwortet und hat noch keine Verkaufschance?",
      "Neun Interessenten hatten in den letzten 7 Tagen ein LinkedIn-Gespräch. Sieben davon hängen schon an einer Verkaufschance. Zwei nicht:\n\n- **Zoe Hartung**, Personalreferentin bei Lärchenfeld Logistik: letztes LinkedIn-Gespräch vor 2 Tagen, Verbindungsstatus Angeschrieben. Lärchenfeld hat bereits die Verkaufschance „Lärchenfeld Logistik – Schulung für neue Mitarbeitende“ (15.800 €) mit Katrin Morawe und Paul Hesse; Frau Hartung ließe sich dort ergänzen.\n- **Iris Claßen**, Büroleiterin bei der Kanzlei am Kai: letztes LinkedIn-Gespräch vor 4 Tagen, Verbindungsstatus Angeschrieben. Die einzige Verkaufschance der Kanzlei, der Partner-Workshop (4.800 €), ist gewonnen; eine Grundschulung für das Büro wäre eine mögliche nächste.\n\nAußerdem: Das LinkedIn-Gespräch mit Katrin Morawe ist noch nicht mit der Verkaufschance von Lärchenfeld verknüpft. Soll ich für jeden Punkt eine Aufgabe anlegen?",
    ],
  },
  mateChatUpdate: {
    title: "Termin mit Claudia Wittmann",
    messages: [
      "Frau Wittmann und ich haben uns auf LinkedIn auf Mittwoch geeinigt. Setze die Verkaufschance Mahrenholz auf Termin vereinbart, trage den nächsten Schritt ein und lege eine Aufgabe für die Agenda an.",
      "Erledigt. Ich habe **Mahrenholz – Grundschulung für alle Mitarbeitenden** (7.200 €) aktualisiert:\n\n- Phase: Im Gespräch auf **Termin vereinbart**\n- Nächster Schritt: Termin mit Frau Wittmann und Herrn Harms am Mittwoch\n- Neue Aufgabe **Frau Wittmann eine kurze Agenda für Mittwoch schicken**, fällig am Mittwoch, verknüpft mit der Verkaufschance und mit Claudia Wittmann\n\nDer Verbindungsstatus von Frau Wittmann war schon Termin vereinbart, und das Telefonat mit Claudia Wittmann und Jonas Harms steht in deinem Kalender. Ich habe nichts gesendet: Die Agenda schreibst und schickst du selbst.",
    ],
  },
  inbox: {
    paul: {
      subject: "Einarbeitungsmodule und unsere Lager-Handscanner",
      messages: [
        "Guten Tag Herr Bergmann,\n\nFrau Morawe hat mich gebeten, die technische Seite der Einarbeitungsschulung zu prüfen. Unser Lagerteam hat nur gemeinsam genutzte Handscanner mit einem kleinen Browser. Laufen die Module darauf, oder braucht man einen Laptop?\n\nViele Grüße\nPaul Hesse",
        "Guten Tag Herr Hesse,\n\ngute Frage. Die Module laufen in jedem aktuellen Browser, ein Handscanner genügt also, wenn sein Browser aktuell und der Bildschirm mindestens 4 Zoll groß ist. Ich kann es gern mit Ihrem Gerätemodell testen, wenn Sie mir den Namen schicken.\n\nViele Grüße\nMax Bergmann",
        "Guten Tag Herr Bergmann,\n\ndanke. Die Geräte laufen mit Android 11 und einem aktuellen Browser, der Bildschirm hat 4,7 Zoll. Wie funktioniert die Anmeldung? Wir wollen nicht jeden Monat 40 neue Konten von Hand anlegen.\n\nPaul Hesse",
      ],
    },
    priya: {
      subject: "Telefonat mit Herrn Albers: zwei Terminvorschläge",
      messages: [
        "Guten Tag Frau Nolte,\n\nwie auf LinkedIn angekündigt zwei Vorschläge für unser Telefonat mit Herrn Albers: Donnerstag um 10:00 Uhr oder Freitag um 16:00 Uhr in zwei Wochen. 45 Minuten sollten genügen.\n\nMit freundlichen Grüßen\nMax Bergmann",
        "Guten Tag Herr Bergmann,\n\nFreitag um 16:00 Uhr passt Herrn Albers und mir. Könnte auch unsere Pflegedienstleiterin dazukommen? Sie plant die Schichten und wird die klarsten Anforderungen haben.\n\nViele Grüße\nPetra Nolte",
        "Guten Tag Frau Nolte,\n\nFreitag um 16:00 Uhr steht, und die Pflegedienstleiterin ist herzlich willkommen. Sobald Sie mir ihre E-Mail-Adresse nennen, schicke ich eine Kalendereinladung an Sie, Herrn Albers und sie. Zur Vorbereitung wäre hilfreich zu wissen, mit wie vielen Schichten pro Tag sie planen muss.\n\nMit freundlichen Grüßen\nMax Bergmann",
      ],
    },
    andrew: {
      subject: "Schulung im Frühjahr doch wieder?",
      messages: [
        "Sehr geehrter Herr Bergmann,\n\nvor einiger Zeit haben wir die Grundschulung wegen der Jahresabschlüsse pausiert. Unser Cyberversicherer verlangt zur Verlängerung jetzt einen Nachweis über die Schulung der Mitarbeitenden, deshalb schauen wir wieder darauf. Betreuen Sie noch Kanzleien unserer Größe?\n\nViele Grüße\nAndreas Kolbe",
        "Sehr geehrter Herr Kolbe,\n\nschön, von Ihnen zu hören, und ja. Ihre 38 Mitarbeitenden sind eine gute Größe für die Grundschulung. Möchten Sie denselben Umfang wie damals oder etwas Schlankeres?\n\nMit freundlichen Grüßen\nMax Bergmann",
        "Sehr geehrter Herr Bergmann,\n\nbitte etwas Schlankeres: zwei Module und ein Phishing-Test, fertig vor der Verlängerung im März. Können Sie uns ein Angebot schicken?\n\nViele Grüße\nAndreas Kolbe",
      ],
    },
    lucy: {
      subject: "Ergebnisse der Phishing-Übung Q3 für den Risikoausschuss",
      messages: [
        "Sehr geehrter Herr Bergmann,\n\nunser Risikoausschuss tagt am Freitag. Könnten Sie mir eine einseitige Zusammenfassung der Phishing-Übung aus dem dritten Quartal schicken? Die Prüfer werden danach fragen.\n\nViele Grüße\nLena Bernhardt",
        "Sehr geehrte Frau Bernhardt,\n\nselbstverständlich. Ich hänge die Ergebnisse nach Abteilung an und ergänze einen kurzen Hinweis, was die Klickrate für ein Team Ihrer Größe bedeutet.\n\nMit freundlichen Grüßen\nMax Bergmann",
        "Sehr geehrter Herr Bergmann,\n\ndanke. Eine Frage für den Ausschuss: Welche Abteilung hat am häufigsten geklickt? Und beginnt die Auffrischung am Donnerstag weiterhin um 13:00 Uhr?\n\nViele Grüße\nLena Bernhardt",
        "Sehr geehrte Frau Bernhardt,\n\nam häufigsten hat die Abteilung Schaden geklickt, mit 11,0 Prozent (9 von 82), am seltensten das Finanzwesen mit 4,8 Prozent (1 von 21). Insgesamt haben 19 von 225 Personen geklickt (8,4 Prozent), und 106 haben die E-Mail gemeldet. Die Auffrischung am Donnerstag beginnt weiterhin um 13:00 Uhr und dauert 90 Minuten. Die einseitige Zusammenfassung folgt heute Nachmittag.\n\nMit freundlichen Grüßen\nMax Bergmann",
      ],
    },
    zoe: {
      messages: [
        "Hallo Herr Bergmann, Frau Morawe hat mir erzählt, dass Sie mit uns über Schulungen zur Einarbeitung sprechen. Ich betreue bei uns die Zeitarbeitskräfte, im Monat kommen etwa 25 über eine Agentur dazu. Können die auch teilnehmen?",
        "Hallo Frau Hartung, ja, Zeitarbeitskräfte bekommen für die Dauer ihres Einsatzes dieselben kurzen Module. Wie lange bleiben sie meist?",
        "Die meisten vier bis acht Wochen. Morgens ist viel los, mehr als zehn Minuten in einer Pause können wir kaum verlangen.",
        "Dann passen Module von zehn Minuten in der Pause gut. Ich würde die drei wichtigsten gleich am ersten Tag einplanen: gefälschte Lieferbenachrichtigungen, geteilte Zugänge und wie man etwas Verdächtiges meldet.",
        "Klingt gut. Können Sie mir sagen, was das für 25 Leute im Monat kosten würde? Ich brauche eine Zahl für unsere Besprechung am Freitag.",
      ],
    },
    ivy: {
      messages: [
        "Hallo Herr Bergmann, die Partner sprechen immer noch über Ihren Workshop. Die übrigen Kolleginnen und Kollegen im Büro fragen, ob sie etwas Ähnliches bekommen können, nur kürzer. Ist das möglich?",
        "Hallo Frau Claßen, das freut mich. Ein Termin von 45 Minuten für das ganze Büro passt gut. Wie viele Personen wären das?",
        "Etwa 30, verteilt auf zwei Etagen. Am besten in der Mittagspause und bitte ohne Folien voller Fachbegriffe.",
        "Hallo Frau Claßen, das lässt sich gut machen. Ich würde eine Sitzung von 45 Minuten in der Mittagspause halten, in einfacher Sprache und mit zwei Live-Beispielen für gefälschte Zahlungsaufforderungen. Eine Seite mit dem Ablauf schicke ich Ihnen heute. Passt Ihnen ein Dienstag oder Mittwoch nächste Woche?",
      ],
    },
    sarah: {
      messages: [
        "Hallo Herr Bergmann, Frau Dreyer hat das Jahresprogramm erwähnt. Wir haben im Januar ein Audit nach ISO 27001, und der Auditor wird einen Nachweis über die Schulung der Mitarbeitenden verlangen. Bekommen wir mit dem Programm etwas, das wir vorzeigen können?",
        "Hallo Frau Quast, ja. Sie bekommen einen Abschlussbericht pro Person und nach jeder Phishing-Übung die Klickrate und die Melderate pro Team.",
        "Gut. Sieht man auch, wer ein Modul noch nicht abgeschlossen hat? Danach fragt man als Erstes.",
        "Ja, es gibt eine Liste offener Module pro Person und Team, die sich als Tabelle exportieren lässt.",
        "Sehr gut. Bitte halten Sie das schriftlich für mich fest, ein kurzer Absatz genügt, dann lege ich ihn in den Auditordner.",
      ],
    },
    oliver: {
      messages: [
        "Hallo Herr Bergmann, bevor wir uns zur Grundschulung entscheiden: Könnten wir einmal sehen, wie ein Modul aussieht? Mir geht es vor allem darum, ob die Filialleitungen es bis zum Ende durchhalten.",
        "Hallo Herr Schütte, gute Idee. Ich schicke Ihnen diese Woche ein Beispielmodul von zehn Minuten für Filialleitungen, mit dem Quiz am Ende.",
        "Danke. Anja Lohmann leitet bei uns die Schulungen und würde es auch gern ausprobieren. Können Sie sie mit aufnehmen?",
        "Selbstverständlich, ich schicke es Ihnen beiden. Dann sprechen wir über den Ablauf, sobald Sie es sich angesehen haben.",
      ],
    },
    tom: {
      messages: [
        "Hallo Herr Bergmann, ich habe Ihren Beitrag zu Phishing-Übungen gesehen. Wir würden gern eine im Werk ausprobieren, 350 Leute. Das Problem: Die meisten in der Fertigung nutzen nie E-Mail.",
        "Hallo Herr Kemper, danke für Ihre Nachricht. Gut, dass Sie das erwähnen, denn das verändert, wie der Pilot laufen sollte. Ich überlege mir einen Weg, auch die Fertigung zu erreichen.",
        "Alles klar, danke. Einige haben einen gemeinsamen Kiosk-PC.",
        "Das hilft. Sobald ich ungefähr weiß, wie viele im Werk E-Mail nutzen, kann ich den Pilot dimensionieren. Können Sie das herausfinden?",
      ],
    },
  } satisfies Record<InboxKey, InboxThreadText>,
  agentNotes: {
    deal: {
      hollisProgram:
        "Zusammenfassung von Claude nach dem Gespräch mit Rebecca Dreyer und Simon Pfeiffer:\nStart mit Fahrern und Lager auf gemeinsam genutzten Tablets, die Büroteams im zweiten Quartal.\nDie Module müssen in die monatlichen Teambesprechungen der ersten Woche passen.\nOffen: der Ablaufplan für drei Monate für die Vorstandssitzung am 14.",
      ashcombeProgram:
        "Entwurf von ChatGPT für die Antwort an Georg Lammers:\nDie Berichte lassen sich nach Standort aufteilen. Die polnische Fassung muss bis Freitag mit unserem Inhaltspartner geklärt werden.\nVorschlag: beide Punkte in einer Nachricht bestätigen und eine Unterschrift vor Monatsende vorschlagen.",
    },
    organization: {
      northmere:
        "Geprüft von Codex (Skriptlauf auf der Ergebnisdatei Q3):\nDie Abteilungssummen stimmen mit dem Firmendatensatz überein: 225 E-Mails, 19 Klicks (8,4 %), 106 Meldungen.\nHöchste Klickrate: Schaden mit 11,0 %. Niedrigste: Finanzen mit 4,8 %.\nVerwendet für die Auffrischung am Donnerstag.",
    },
    task: {
      linkKateConversation:
        "Aufgabe angelegt von Claude aus der LinkedIn-Nachricht von Katrin Morawe:\nRund 40 neue Mitarbeitende im Lager pro Monat. Die Einarbeitung ist heute ein gedrucktes Handbuch und ein Tag Mitlaufen.\nDas Gespräch verknüpfen, sobald der Umfang klar ist. Es ist absichtlich noch nicht verknüpft.",
    },
  },
  agents: {
    company: "Wachblick Schulungen GmbH",
    records: "Interessenten, Firmen, Verkaufschancen und Aufgaben",
    mate: "Dazu gehört, neue LinkedIn-Kontakte zu recherchieren, Firmen wie die gewonnenen zu finden und aus einem Satz im Chat eine Änderung an einem Datensatz oder eine Aufgabe zu machen.",
    claude:
      "Max lässt dort ein Telefonat in die Notizen der Verkaufschance zusammenfassen, Interessenten finden, die geantwortet haben, aber noch keine Verkaufschance haben, und die Gliederung für einen Workshop vorbereiten.",
    chatgpt:
      "Es entwirft Antworten auf Fragen von Interessenten aus Angebot und Notizen; Max liest und bearbeitet jeden Entwurf im Posteingang.",
    codex:
      "Es lässt Skripte auf Exporten laufen, zum Beispiel um die Ergebnisdatei einer Phishing-Übung mit den Abteilungssummen am Firmendatensatz abzugleichen.",
    followUp:
      "Die Routine „Jeden Morgen Nachfass-Entwürfe für fällige Verkaufschancen“ läuft an Werktagen am Morgen. Sie liest die Verkaufschancen, deren Datum nächster Schritt heute oder früher liegt, schaut sich das jeweils verknüpfte Gespräch an und speichert einen kurzen Antwortentwurf, wenn zuletzt der Interessent geschrieben hat. Die Entwürfe warten im Posteingang, bis Max sie gelesen und gesendet hat. Die Routine sendet nie eine Nachricht und verknüpft nie ein Gespräch.",
  },
  events: [
    "Telefonat mit Claudia Wittmann und Jonas Harms (Mahrenholz)",
    "Telefonat mit Friederike Blank zum Führungskräfte-Workshop",
    "Telefonat mit Martin Albers und Petra Nolte (Klinikverbund Zedernhof)",
  ],
  calendarName: "Termine",
};

const ORGANIZATION_FACTS: Record<OrganizationKey, { industry: string; employees: number; createdDaysAgo: number }> = {
  hollis: { industry: "logistics", employees: 420, createdDaysAgo: 300 },
  marlow: { industry: "insurance", employees: 60, createdDaysAgo: 40 },
  cedarline: { industry: "healthcare", employees: 900, createdDaysAgo: 150 },
  brightford: { industry: "manufacturing", employees: 350, createdDaysAgo: 25 },
  quayside: { industry: "legal", employees: 45, createdDaysAgo: 165 },
  ashcombe: { industry: "engineering", employees: 280, createdDaysAgo: 92 },
  tidewell: { industry: "retail", employees: 520, createdDaysAgo: 56 },
  kingsgate: { industry: "housing", employees: 190, createdDaysAgo: 31 },
  fenwick: { industry: "accounting", employees: 38, createdDaysAgo: 205 },
  larchmont: { industry: "logistics", employees: 610, createdDaysAgo: 7 },
  northmere: { industry: "insurance", employees: 240, createdDaysAgo: 400 },
  whitcombe: { industry: "healthcare", employees: 480, createdDaysAgo: 345 },
};

const CONTACT_FACTS: Record<
  ContactKey,
  {
    organization: OrganizationKey;
    howWeMet: string;
    status?: string;
    linkedin: boolean;
    lastChat?: number;
    createdDaysAgo: number;
  }
> = {
  rachel: {
    organization: "hollis",
    howWeMet: "linkedinConversation",
    status: "meetingBooked",
    linkedin: true,
    lastChat: 0,
    createdDaysAgo: 295,
  },
  simon: { organization: "hollis", howWeMet: "introduction", status: "replied", linkedin: false, createdDaysAgo: 292 },
  claire: {
    organization: "marlow",
    howWeMet: "event",
    status: "meetingBooked",
    linkedin: true,
    lastChat: -1,
    createdDaysAgo: 40,
  },
  joe: { organization: "marlow", howWeMet: "introduction", status: "connected", linkedin: false, createdDaysAgo: 35 },
  martin: {
    organization: "cedarline",
    howWeMet: "linkedinConversation",
    status: "replied",
    linkedin: true,
    lastChat: -2,
    createdDaysAgo: 145,
  },
  priya: {
    organization: "cedarline",
    howWeMet: "introduction",
    status: "replied",
    linkedin: true,
    createdDaysAgo: 100,
  },
  tom: {
    organization: "brightford",
    howWeMet: "linkedinConversation",
    status: "messaged",
    linkedin: true,
    lastChat: -18,
    createdDaysAgo: 24,
  },
  helen: {
    organization: "quayside",
    howWeMet: "inbound",
    status: "client",
    linkedin: true,
    createdDaysAgo: 160,
  },
  george: {
    organization: "ashcombe",
    howWeMet: "event",
    status: "meetingBooked",
    linkedin: true,
    lastChat: 0,
    createdDaysAgo: 90,
  },
  nina: { organization: "ashcombe", howWeMet: "introduction", status: "connected", linkedin: true, createdDaysAgo: 80 },
  oliver: {
    organization: "tidewell",
    howWeMet: "linkedinConversation",
    status: "replied",
    linkedin: true,
    lastChat: -9,
    createdDaysAgo: 55,
  },
  amy: { organization: "tidewell", howWeMet: "introduction", status: "connected", linkedin: false, createdDaysAgo: 50 },
  fiona: {
    organization: "kingsgate",
    howWeMet: "event",
    status: "meetingBooked",
    linkedin: true,
    lastChat: -3,
    createdDaysAgo: 30,
  },
  andrew: { organization: "fenwick", howWeMet: "inbound", status: "messaged", linkedin: false, createdDaysAgo: 200 },
  kate: {
    organization: "larchmont",
    howWeMet: "linkedinConversation",
    status: "messaged",
    linkedin: true,
    lastChat: -1,
    createdDaysAgo: 6,
  },
  paul: {
    organization: "larchmont",
    howWeMet: "linkedinConversation",
    status: "messaged",
    linkedin: true,
    createdDaysAgo: 5,
  },
  lucy: {
    organization: "northmere",
    howWeMet: "event",
    status: "client",
    linkedin: true,
    lastChat: -20,
    createdDaysAgo: 395,
  },
  mark: {
    organization: "whitcombe",
    howWeMet: "linkedinConversation",
    status: "client",
    linkedin: true,
    lastChat: -12,
    createdDaysAgo: 340,
  },
  sarah: {
    organization: "hollis",
    howWeMet: "introduction",
    status: "replied",
    linkedin: true,
    lastChat: -6,
    createdDaysAgo: 275,
  },
  dan: {
    organization: "brightford",
    howWeMet: "linkedinConversation",
    status: "connected",
    linkedin: true,
    createdDaysAgo: 14,
  },
  ella: { organization: "kingsgate", howWeMet: "event", status: "connected", linkedin: true, createdDaysAgo: 22 },
  maya: {
    organization: "marlow",
    howWeMet: "linkedinConversation",
    status: "connected",
    linkedin: true,
    createdDaysAgo: 18,
  },
  ivy: {
    organization: "quayside",
    howWeMet: "linkedinConversation",
    status: "messaged",
    linkedin: true,
    lastChat: -4,
    createdDaysAgo: 27,
  },
  zoe: {
    organization: "larchmont",
    howWeMet: "linkedinConversation",
    status: "messaged",
    linkedin: true,
    lastChat: -2,
    createdDaysAgo: 5,
  },
};

type DealFacts = {
  organization: OrganizationKey;
  contacts: ContactKey[];
  stage: string;
  offering: string;
  value: number;
  createdDaysAgo: number;
  close: number;
  next?: number;
  /** A training session: story day, local start time and length in minutes. */
  session?: readonly [number, string, number];
  lost?: string;
  /** Stage changes oldest first: `[days ago, stage before the change]`; the last change leads to the current stage. */
  moves?: Array<[number, string]>;
};

const DEAL_FACTS: Record<DealKey, DealFacts> = {
  hollisProgram: {
    organization: "hollis",
    session: [17, "09:00", 180],
    contacts: ["rachel", "simon"],
    stage: "proposal",
    offering: "annualProgram",
    value: 18400,
    createdDaysAgo: 70,
    close: 20,
    next: 0,
    moves: [
      [52, "identified"],
      [30, "conversation"],
      [9, "meetingBooked"],
    ],
  },
  marlowBaseline: {
    organization: "marlow",
    contacts: ["claire", "joe"],
    stage: "meetingBooked",
    offering: "baselineTraining",
    value: 7200,
    createdDaysAgo: 30,
    close: 45,
    next: 6,
    moves: [
      [24, "identified"],
      [1, "conversation"],
    ],
  },
  cedarlineProgram: {
    organization: "cedarline",
    contacts: ["martin", "priya"],
    stage: "conversation",
    offering: "annualProgram",
    value: 26000,
    createdDaysAgo: 110,
    close: 90,
    next: 12,
    moves: [[60, "identified"]],
  },
  brightfordPilot: {
    organization: "brightford",
    contacts: ["tom"],
    stage: "identified",
    offering: "phishingExercise",
    value: 6500,
    createdDaysAgo: 20,
    close: 120,
    next: -3,
  },
  quaysideWorkshop: {
    organization: "quayside",
    session: [-12, "14:00", 180],
    contacts: ["helen"],
    stage: "won",
    offering: "leadershipWorkshop",
    value: 4800,
    createdDaysAgo: 150,
    close: -30,
    moves: [
      [110, "identified"],
      [80, "conversation"],
      [55, "meetingBooked"],
      [30, "proposal"],
    ],
  },
  ashcombeProgram: {
    organization: "ashcombe",
    session: [12, "09:30", 240],
    contacts: ["george", "nina"],
    stage: "proposal",
    offering: "annualProgram",
    value: 24500,
    createdDaysAgo: 85,
    close: 10,
    next: 4,
    moves: [
      [70, "identified"],
      [40, "conversation"],
      [15, "meetingBooked"],
    ],
  },
  tidewellBaseline: {
    organization: "tidewell",
    contacts: ["oliver", "amy"],
    stage: "conversation",
    offering: "baselineTraining",
    value: 9600,
    createdDaysAgo: 50,
    close: 60,
    next: 7,
    moves: [[30, "identified"]],
  },
  kingsgateLeadership: {
    organization: "kingsgate",
    contacts: ["fiona"],
    stage: "meetingBooked",
    offering: "leadershipWorkshop",
    value: 5400,
    createdDaysAgo: 28,
    close: 40,
    next: 5,
    moves: [
      [20, "identified"],
      [3, "conversation"],
    ],
  },
  fenwickBaseline: {
    organization: "fenwick",
    contacts: ["andrew"],
    stage: "lost",
    offering: "baselineTraining",
    value: 3900,
    createdDaysAgo: 190,
    close: -100,
    lost: "timing",
    moves: [
      [150, "conversation"],
      [100, "proposal"],
    ],
  },
  larchmontProgram: {
    organization: "larchmont",
    contacts: ["kate", "paul"],
    stage: "identified",
    offering: "annualProgram",
    value: 15800,
    createdDaysAgo: 5,
    close: 150,
    next: 0,
  },
  cedarlineWorkshop: {
    organization: "cedarline",
    contacts: ["martin"],
    stage: "won",
    offering: "leadershipWorkshop",
    value: 6200,
    createdDaysAgo: 140,
    close: -75,
    moves: [
      [110, "meetingBooked"],
      [75, "proposal"],
    ],
  },
  hollisLeadership: {
    organization: "hollis",
    contacts: ["simon"],
    stage: "lost",
    offering: "leadershipWorkshop",
    value: 4200,
    createdDaysAgo: 130,
    close: -95,
    lost: "price",
    moves: [[95, "proposal"]],
  },
  whitcombeProgram: {
    organization: "whitcombe",
    session: [6, "10:00", 120],
    contacts: ["mark"],
    stage: "won",
    offering: "annualProgram",
    value: 14600,
    createdDaysAgo: 330,
    close: -276,
    moves: [
      [310, "conversation"],
      [290, "meetingBooked"],
      [276, "proposal"],
    ],
  },
  hollisPhishing: {
    organization: "hollis",
    contacts: ["sarah"],
    stage: "won",
    offering: "phishingExercise",
    value: 5200,
    createdDaysAgo: 260,
    close: -224,
    moves: [
      [240, "conversation"],
      [224, "proposal"],
    ],
  },
  hollisBaseline: {
    organization: "hollis",
    session: [-19, "08:30", 120],
    contacts: ["rachel"],
    stage: "won",
    offering: "baselineTraining",
    value: 6800,
    createdDaysAgo: 200,
    close: -172,
    moves: [
      [185, "conversation"],
      [172, "proposal"],
    ],
  },
  northmereRefresh: {
    organization: "northmere",
    session: [3, "13:00", 90],
    contacts: ["lucy"],
    stage: "won",
    offering: "phishingExercise",
    value: 3600,
    createdDaysAgo: 150,
    close: -120,
    moves: [[120, "proposal"]],
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
  replyRachel: {
    status: "open",
    priority: "high",
    due: 0,
    deal: "hollisProgram",
    contact: "rachel",
    createdDaysAgo: 1,
  },
  agendaClaire: {
    status: "inProgress",
    priority: "high",
    due: 2,
    deal: "marlowBaseline",
    contact: "claire",
    createdDaysAgo: 1,
  },
  linkKateConversation: {
    status: "open",
    priority: "medium",
    due: 1,
    organization: "larchmont",
    contact: "kate",
    createdDaysAgo: 1,
  },
  answerAshcombe: {
    status: "inProgress",
    priority: "high",
    due: 3,
    deal: "ashcombeProgram",
    contact: "george",
    createdDaysAgo: 1,
  },
  sampleModuleTidewell: {
    status: "done",
    priority: "medium",
    due: -4,
    deal: "tidewellBaseline",
    contact: "oliver",
    createdDaysAgo: 12,
    done: 5,
  },
  followUpTom: {
    status: "open",
    priority: "medium",
    due: -3,
    deal: "brightfordPilot",
    contact: "tom",
    createdDaysAgo: 9,
  },
  leadershipOutline: {
    status: "open",
    priority: "medium",
    due: 5,
    deal: "kingsgateLeadership",
    contact: "fiona",
    createdDaysAgo: 3,
  },
  quaysideSlides: {
    status: "done",
    priority: "low",
    due: -5,
    deal: "quaysideWorkshop",
    contact: "helen",
    createdDaysAgo: 7,
    done: 6,
  },
  briefingDatesSimon: {
    status: "open",
    priority: "medium",
    due: 1,
    deal: "hollisProgram",
    contact: "simon",
    createdDaysAgo: 1,
  },
  meetupNotes: { status: "blocked", priority: "low", due: -4, createdDaysAgo: 8 },
};

function noteOf(notes: Readonly<Record<string, string>>, key: string): Record<string, string> {
  const text = notes[key];
  return text === undefined ? {} : { notes: text };
}

function slug(name: string): string {
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

const AGENT_EDITS: Record<string, AgentKeyName> = {
  "deal:hollisProgram": "Claude Desktop",
  "task:linkKateConversation": "Claude Desktop",
  "deal:ashcombeProgram": "ChatGPT",
  "organization:northmere": "Codex CLI",
};

export default defineSolution<Strings>({
  id: "linkedin-crm",
  strings: { en, de },
  story: {
    en: { currency: "GBP", timeZone: "Europe/London" },
    de: { currency: "EUR", timeZone: "Europe/Berlin" },
  },
  build: (t, locale) => {
    const open = ["identified", "conversation", "meetingBooked", "proposal"];
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
      const [name, city, domain] = t.organizations[key];
      const [street, postalCode, region, lat, lon] = t.addresses[key];
      return {
        key,
        values: {
          name,
          industry: facts.industry,
          address: address({ street, postalCode, city, region, countryCode: t.countryCode, lat, lon }),
          website: `https://${domain}`,
          employees: facts.employees,
          ...noteOf(t.agentNotes.organization, key),
        },
        owner: "maxBergmann",
        channels: { email: `info@${domain}` },
        createdDaysAgo: facts.createdDaysAgo,
      };
    });
    const contact: RecordSpec[] = CONTACTS.map((key) => {
      const facts = CONTACT_FACTS[key];
      const [firstName, lastName, jobTitle] = t.contacts[key];
      const domain = t.organizations[facts.organization][2];
      const handle = `${slug(firstName)}-${slug(lastName)}`;
      return {
        key,
        values: {
          firstName,
          lastName,
          jobTitle,
          howWeMet: facts.howWeMet,
          ...(facts.status === undefined ? {} : { conversationStatus: facts.status }),
          ...(facts.lastChat === undefined ? {} : { lastLinkedinChat: day(facts.lastChat) }),
        },
        links: { "contact.organizations": facts.organization },
        owner: "maxBergmann",
        channels: {
          email: `${slug(firstName)}.${slug(lastName)}@${domain}`,
          ...(facts.linkedin
            ? { linkedin: `${handle}.linkedin.example`, linkedinUrl: `https://linkedin.example/in/${handle}` }
            : {}),
        },
        createdDaysAgo: facts.createdDaysAgo,
      };
    });
    const deal: RecordSpec[] = DEALS.map((key) => {
      const facts = DEAL_FACTS[key];
      const moves = facts.moves ?? [];
      return {
        key,
        values: {
          name: t.deals[key],
          stage: facts.stage,
          offering: facts.offering,
          totalValue: facts.value,
          closeDate: day(facts.close),
          ...(facts.next === undefined
            ? {}
            : { nextStep: t.nextSteps[key as OpenDealKey], nextStepDate: day(facts.next) }),
          ...(facts.session ? { trainingSessions: rangeAt(...facts.session) } : {}),
          ...(facts.lost ? { lostReason: facts.lost } : {}),
          ...noteOf(t.agentNotes.deal, key),
        },
        links: { "deal.organizations": facts.organization, "deal.contacts": facts.contacts },
        owner: "maxBergmann",
        createdDaysAgo: facts.createdDaysAgo,
        history: moves.map(([daysAgo, previous]) => ({ daysAgo, previous: { stage: previous } })),
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
          ...noteOf(t.agentNotes.task, key),
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

    const chat = (
      contactKey: ContactKey,
      texts: readonly string[],
      options: { draftLast?: boolean; reaction?: number } = {},
    ) =>
      texts.map((text, index) => ({
        from: index % 2 === 0 ? contactKey : "self",
        text,
        ...(options.draftLast && index === texts.length - 1 ? { draft: true } : {}),
        ...(options.reaction === index ? { reaction: { from: contactKey, value: "👍" } } : {}),
      }));

    const file = (key: keyof Strings["files"], dealKey: DealKey, kind: FileSpec["kind"], uploadedDaysAgo: number) => {
      const spec = t.files[key];
      return {
        key,
        record: `deal:${dealKey}`,
        field: "deal.proposal",
        name: spec.name,
        kind,
        ...("rows" in spec ? { rows: spec.rows } : { lines: spec.lines }),
        uploadedDaysAgo,
      } satisfies FileSpec;
    };

    return {
      workspaceName: t.workspaceName,
      companyName: t.company,
      lists: (["contact", "organization", "deal", "task"] as const).map((key) => ({
        key,
        label: t.lists[key][0],
        pluralLabel: t.lists[key][1],
        description: t.lists[key][2],
        icon: { organization: "building", contact: "contact", deal: "handshake", task: "check" }[key],
      })),
      fields: [
        { key: "contact.jobTitle", label: t.fields.jobTitle, type: "text" },
        {
          key: "contact.howWeMet",
          label: t.fields.howWeMet,
          type: "select",
          options: label(t.options.howWeMet, {
            event: "warning",
            introduction: "success",
            linkedinConversation: "info",
            inbound: "secondary",
          }),
        },
        {
          key: "contact.conversationStatus",
          label: t.fields.conversationStatus,
          type: "select",
          options: label(t.options.conversationStatus, {
            connected: "secondary",
            messaged: "default",
            replied: "info",
            meetingBooked: "warning",
            client: "success",
          }),
        },
        { key: "contact.lastLinkedinChat", label: t.fields.lastLinkedinChat, type: "date" },
        {
          key: "organization.industry",
          label: t.fields.industry,
          type: "select",
          options: label(t.options.industry, {
            logistics: "default",
            insurance: "info",
            healthcare: "success",
            manufacturing: "warning",
            legal: "info",
            engineering: "secondary",
            retail: "warning",
            housing: "success",
            accounting: "secondary",
          }),
        },
        { key: "organization.address", label: t.fields.address, type: "address" },
        { key: "organization.website", label: t.fields.website, type: "url" },
        { key: "organization.employees", label: t.fields.employees, type: "number" },
        {
          key: "organization.opportunityValue",
          label: t.fields.opportunityValue,
          type: "currency",
          formula: { kind: "rollupSum", relation: "deal.organizations", field: "deal.totalValue" },
        },
        {
          key: "deal.offering",
          label: t.fields.offering,
          type: "select",
          options: label(t.options.offering, {
            baselineTraining: "info",
            annualProgram: "success",
            phishingExercise: "warning",
            leadershipWorkshop: "secondary",
          }),
        },
        { key: "deal.closeDate", label: t.fields.closeDate, type: "date" },
        { key: "deal.nextStep", label: t.fields.nextStep, type: "text" },
        { key: "deal.nextStepDate", label: t.fields.nextStepDate, type: "date" },
        { key: "deal.trainingSessions", label: t.fields.trainingSessions, type: "dateTimeRange" },
        { key: "deal.proposal", label: t.fields.proposal, type: "file" },
        {
          key: "deal.lostReason",
          label: t.fields.lostReason,
          type: "select",
          options: label(t.options.lostReason, { price: "warning", timing: "info", inHouse: "secondary" }),
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
        { key: "identified", label: t.stages.identified, color: "secondary", probability: 10 },
        { key: "conversation", label: t.stages.conversation, color: "info", probability: 25 },
        { key: "meetingBooked", label: t.stages.meetingBooked, color: "info", probability: 45 },
        { key: "proposal", label: t.stages.proposal, color: "warning", probability: 60 },
        { key: "won", label: t.stages.won, color: "success", probability: 100 },
        { key: "lost", label: t.stages.lost, color: "destructive", probability: 0 },
      ],
      records: agentEdited({ contact, organization, deal, task }, AGENT_EDITS),
      views: [
        {
          key: "byConnection",
          list: "contact",
          name: t.views.byConnection,
          mode: "board",
          groupBy: "conversationStatus",
          columns: ["jobTitle", "contact.organizations", "lastLinkedinChat"],
        },
        {
          key: "prospects",
          list: "contact",
          name: t.views.prospects,
          mode: "table",
          columns: [
            "jobTitle",
            "contact.organizations",
            "conversationStatus",
            "howWeMet",
            "lastLinkedinChat",
            "capability.identity",
          ],
          sort: { field: "lastLinkedinChat", direction: "desc" },
        },
        {
          key: "pipeline",
          list: "deal",
          name: t.views.pipeline,
          mode: "board",
          groupBy: "stage",
          columns: ["totalValue", "deal.organizations", "nextStepDate", "offering"],
          filters: [{ field: "stage", notIn: ["lost"] }],
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
          key: "dueSoon",
          list: "task",
          name: t.views.dueSoon,
          mode: "table",
          columns: ["dueDate", "status", "priority", "task.deals", "task.contacts"],
          filters: [{ field: "status", notIn: ["done", "archived"] }],
          sort: { field: "dueDate", direction: "asc" },
        },
        {
          key: "trainingCalendar",
          list: "deal",
          name: t.views.trainingCalendar,
          mode: "calendar",
          calendar: { date: "trainingSessions", color: "offering", mode: "month" },
          columns: ["stage", "offering", "totalValue", "deal.organizations"],
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
            title: t.widgets.recentChats,
            list: "contact",
            aggregation: "count",
            filters: [{ field: "lastLinkedinChat", withinDays: 7 }],
          },
          {
            kind: "kpi",
            title: t.widgets.meetingsBooked,
            list: "contact",
            aggregation: "count",
            filters: [{ field: "conversationStatus", in: ["meetingBooked"] }],
          },
          {
            kind: "chart",
            title: t.widgets.byStatus,
            display: DisplayType.funnelChart,
            list: "contact",
            aggregation: "count",
            groupBy: { field: "conversationStatus" },
            filters: [
              { field: "conversationStatus", in: ["connected", "messaged", "replied", "meetingBooked", "client"] },
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
            title: t.widgets.byHowWeMet,
            display: DisplayType.doughnutChart,
            list: "contact",
            aggregation: "count",
            groupBy: { field: "howWeMet" },
          },
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
            title: t.widgets.chatsMonth,
            list: "contact",
            layout: "month",
            date: "lastLinkedinChat",
          },
          { kind: "activity", title: t.widgets.latestChats, providers: ["linkedin"] },
        ],
      },
      wiki: [
        { key: "guide", kind: "guide", title: t.wiki.guide.title, markdown: t.wiki.guide.markdown },
        { key: "stages", kind: "knowledge", title: t.wiki.stages.title, markdown: t.wiki.stages.markdown },
        {
          key: "linking",
          kind: "procedure",
          title: t.wiki.linking.title,
          whenToUse: t.wiki.linking.whenToUse,
          markdown: t.wiki.linking.markdown,
        },
        {
          key: "firstMessages",
          kind: "knowledge",
          title: t.wiki.firstMessages.title,
          markdown: t.wiki.firstMessages.markdown,
        },
        agentsPage(locale, t.agents),
      ],
      apiKeys: agentApiKeys([58, 33, 9]),
      files: [
        file("hollisProposal", "hollisProgram", "pdf", 10),
        file("ashcombeProposal", "ashcombeProgram", "pdf", 16),
        file("quaysideProposal", "quaysideWorkshop", "pdf", 34),
        file("northmereResults", "northmereRefresh", "csv", 8),
      ],
      planner: {
        sources: [
          { list: "deal", date: "trainingSessions", color: "success" },
          { list: "deal", date: "nextStepDate", filters: [{ field: "stage", in: open }], color: "info" },
        ],
        connectedCalendar: true,
        mode: "month",
      },
      trash: [
        { list: "contact", name: t.trash.contact, daysAgo: 5 },
        { list: "deal", name: t.trash.deal, daysAgo: 15 },
      ],
      mateChats: [
        {
          title: t.mateChat.title,
          endedHoursAgo: 6,
          messages: [
            { role: "user", text: t.mateChat.messages[0] },
            { role: "assistant", text: t.mateChat.messages[1] },
          ],
        },
        {
          title: t.mateChatUpdate.title,
          endedHoursAgo: 24,
          messages: [
            { role: "user", text: t.mateChatUpdate.messages[0] },
            { role: "assistant", text: t.mateChatUpdate.messages[1] },
          ],
        },
      ],
      routines: [
        {
          key: "research",
          name: t.routines.research.name,
          task: t.routines.research.task,
          trigger: {
            kind: "event",
            events: ["messaging.relation.created"],
            debounceSeconds: 900,
            sample: { thread: 2 },
          },
          runs: [
            {
              status: "succeeded",
              startedHoursAgo: 20,
              durationSeconds: 74,
              credits: 12,
              summary: t.routines.research.runs[0],
            },
            {
              status: "failed",
              startedHoursAgo: 45,
              durationSeconds: 11,
              credits: 2,
              error: "providerUnavailable",
              note: t.routines.research.runs[1],
            },
            {
              status: "succeeded",
              startedHoursAgo: 118,
              durationSeconds: 39,
              credits: 6,
              summary: t.routines.research.runs[2],
            },
          ],
        },
        {
          key: "similar",
          name: t.routines.similar.name,
          task: t.routines.similar.task,
          trigger: { kind: "schedule", cron: "0 8 * * 1" },
          runs: [
            {
              status: "succeeded",
              startedHoursAgo: 14,
              durationSeconds: 88,
              credits: 18,
              summary: t.routines.similar.runs[0],
            },
            {
              status: "failed",
              startedHoursAgo: 182,
              durationSeconds: 12,
              credits: 2,
              error: "providerUnavailable",
              note: t.routines.similar.runs[1],
            },
            {
              status: "succeeded",
              startedHoursAgo: 350,
              durationSeconds: 77,
              credits: 15,
              summary: t.routines.similar.runs[2],
            },
          ],
        },
        {
          key: "followUp",
          name: t.routines.followUp.name,
          task: t.routines.followUp.task,
          trigger: { kind: "schedule", cron: "0 8 * * 1-5" },
          runs: [
            {
              status: "succeeded",
              startedHoursAgo: 6,
              durationSeconds: 63,
              credits: 10,
              summary: t.routines.followUp.runs[0],
            },
            {
              status: "succeeded",
              startedHoursAgo: 54,
              durationSeconds: 48,
              credits: 7,
              summary: t.routines.followUp.runs[1],
            },
            {
              status: "succeeded",
              startedHoursAgo: 102,
              durationSeconds: 44,
              credits: 7,
              summary: t.routines.followUp.runs[2],
            },
          ],
        },
        {
          key: "questions",
          name: t.routines.questions.name,
          task: t.routines.questions.task,
          trigger: {
            kind: "event",
            events: ["messaging.message.received"],
            debounceSeconds: 300,
            sample: { thread: 1 },
          },
          runs: [
            {
              status: "succeeded",
              startedHoursAgo: 2,
              durationSeconds: 29,
              credits: 4,
              summary: t.routines.questions.runs[0],
            },
            {
              status: "succeeded",
              startedHoursAgo: 32,
              durationSeconds: 24,
              credits: 3,
              summary: t.routines.questions.runs[1],
            },
            {
              status: "failed",
              startedHoursAgo: 74,
              durationSeconds: 9,
              credits: 1,
              error: "providerUnavailable",
              note: t.routines.questions.runs[2],
            },
          ],
        },
      ],
      messaging: {
        accounts: ["linkedin", "google"],
        selfTitle: t.selfTitle,
        website: t.website,
        threads: [
          {
            account: "linkedin",
            with: ["rachel"],
            state: "unread",
            latestMinutesAgo: 40,
            messages: chat("rachel", t.threads.rachel, { draftLast: true }),
            links: ["deal:hollisProgram", "organization:hollis"],
          },
          {
            account: "linkedin",
            with: ["george"],
            state: "unread",
            latestMinutesAgo: 3 * 60,
            messages: chat("george", t.threads.george),
            links: ["deal:ashcombeProgram", "organization:ashcombe"],
          },
          {
            account: "linkedin",
            with: ["kate"],
            state: "unread",
            latestMinutesAgo: 22 * 60,
            messages: chat("kate", t.threads.kate),
          },
          {
            account: "linkedin",
            with: ["claire"],
            state: "open",
            latestMinutesAgo: 26 * 60,
            messages: chat("claire", t.threads.claire),
            links: ["deal:marlowBaseline", "organization:marlow"],
          },
          {
            account: "linkedin",
            with: ["martin"],
            state: "open",
            latestMinutesAgo: 2 * 24 * 60,
            messages: chat("martin", t.threads.martin, { reaction: 3 }),
            links: ["deal:cedarlineProgram"],
          },
          {
            account: "linkedin",
            with: ["fiona"],
            state: "open",
            latestMinutesAgo: 3 * 24 * 60,
            messages: chat("fiona", t.threads.fiona),
            links: ["deal:kingsgateLeadership", "organization:kingsgate"],
          },
          {
            account: "google",
            with: ["simon"],
            subject: t.threads.simon.subject,
            state: "open",
            latestMinutesAgo: 5 * 60,
            messages: chat("simon", t.threads.simon.messages),
            links: ["deal:hollisProgram"],
          },
          {
            account: "google",
            with: ["helen"],
            subject: t.threads.helen.subject,
            state: "open",
            latestMinutesAgo: 6 * 24 * 60,
            messages: chat("helen", t.threads.helen.messages),
            links: ["deal:quaysideWorkshop", "organization:quayside"],
          },
          ...inboxThreads(INBOX_PLAN, t.inbox),
        ],
        calendar: {
          name: t.calendarName,
          events: [
            { title: t.events[0], with: ["claire", "joe"], startsMinutesAgo: -(2 * 24 * 60 + 60), durationMinutes: 45 },
            { title: t.events[1], with: ["fiona"], startsMinutesAgo: -(4 * 24 * 60 + 3 * 60), durationMinutes: 30 },
            {
              title: t.events[2],
              with: ["martin", "priya"],
              startsMinutesAgo: -(11 * 24 * 60 + 2 * 60),
              durationMinutes: 45,
            },
          ],
        },
      },
    };
  },
});
