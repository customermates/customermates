import { DisplayType } from "@/features/widget/widget-display.schema";

import {
  address,
  day,
  defineSolution,
  type FieldInput,
  type FileSpec,
  type RecordSpec,
  phoneNumber,
} from "../define-solution";
import { agentApiKeys, agentEdited, agentsPage, type AgentKeyName } from "../agent-native";
import { inboxThreads, type InboxThreadPlan, type InboxThreadText } from "../inbox-threads";

/**
 * Consultants: an independent, relationship-led consulting practice that advises mid-sized B2B companies on strategy
 * and operations. Engagements move from introduction through discovery and scoping to a proposal and a decision; the
 * fee is the estimated days times the day rate, and won engagements move on through delivery on a second board. The
 * story follows one engagement (Fairhaven / Falkenried) whose proposal is with the client: Max drafts the answer to the
 * sponsor's fee question. Contacts carry their role in the engagement, a relationship strength and the date of the last
 * meeting; next steps and task due dates are ordinary fields, and a conversation belongs to an engagement only when
 * someone links it.
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
  "calderPlanning",
  "oakhamStrategy",
  "wexfordPlant",
  "calderReview",
  "kestrelWorkshop",
  "kestrelOffsite",
  "stanmoreDay",
  "kestrelInterim",
  "brightwaterWorkshop",
] as const;
type DealKey = (typeof DEALS)[number];
const TASKS = [
  "briefHelen",
  "kickoffAgenda",
  "callTom",
  "brightwaterScope",
  "interimAvailability",
  "ellisonQuestions",
  "kestrelWalkthrough",
  "briefDiane",
  "rivertonNotes",
  "lunchGeorge",
  "mergerReferences",
  "ellisonMarginData",
] as const;
type TaskKey = (typeof TASKS)[number];
type InboxKey =
  | "brightwaterScope"
  | "brightwaterInterim"
  | "stanmoreRoundtable"
  | "marlowReferences"
  | "kestrelVenue"
  | "rivertonNotes"
  | "calderPlants"
  | "ellisonMargins"
  | "kestrelPlanning"
  | "greyfriarsCall";
type StoryStage = "introduction" | "discovery" | "scoping" | "proposal" | "decision";

const en = {
  countryCode: "gb",
  company: "Ashcombe Advisory",
  workspaceName: "Consultants",
  website: "https://ashcombe-advisory.example",
  phones: { mobile: { templates: ["+44 20 7946 0###"], start: 300 } },
  selfTitle: "Principal consultant",
  lists: {
    organization: ["Client", "Clients", "Companies we advise, talk to or work alongside."],
    contact: ["Contact", "Contacts", "The people behind every engagement and introduction."],
    deal: [
      "Engagement",
      "Engagements",
      "Engagements from the first introduction to the decision and through delivery.",
    ],
    task: ["Task", "Tasks", "Things we promised, with a due date."],
  },
  fields: {
    dealValue: "Fee",
    weightedValue: "Weighted fee",
    industry: "Industry",
    relationship: "Relationship",
    address: "Address",
    documents: "Documents",
    website: "Website",
    employees: "Employees",
    jobTitle: "Job title",
    role: "Role in engagement",
    strength: "Relationship strength",
    lastMeeting: "Last meeting",
    dayRate: "Day rate",
    days: "Days estimated",
    start: "Start",
    end: "End",
    duration: "Duration (days)",
    delivery: "Delivery",
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
    role: { sponsor: "Sponsor", dayToDay: "Day-to-day contact", signsOff: "Signs off" },
    strength: { strong: "Strong", warm: "Warm", early: "New" },
    delivery: {
      notStarted: "Not started",
      inDelivery: "In delivery",
      wrappingUp: "Wrapping up",
      completed: "Completed",
    },
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
  addresses: {
    fairhaven: ["Attercliffe Road 214", "S4 7WZ", "South Yorkshire", 53.39542, -1.44021],
    northwold: ["Pepper Road 9", "LS10 2RU", "West Yorkshire", 53.76398, -1.53125],
    brightwater: ["Hulme Street 41", "M15 6AZ", "Greater Manchester", 53.47104, -2.24987],
    calder: ["Bowling Back Lane 77", "BD4 8SX", "West Yorkshire", 53.78131, -1.73215],
    ellison: ["Lenton Lane 18", "NG7 2PS", "Nottinghamshire", 52.93655, -1.17643],
    greyfriars: ["Aston Hall Road 120", "B6 7FE", "West Midlands", 52.50751, -1.87298],
    kestrel: ["Coldharbour Lane 6", "BS16 1EJ", "Bristol", 51.50021, -2.54912],
    marlow: ["Troon Way 23", "LE4 9HA", "Leicestershire", 52.66274, -1.10311],
    oakham: ["Ascot Drive 55", "DE24 8GW", "Derbyshire", 52.89993, -1.46121],
    riverton: ["Hospital Fields Road 4", "YO10 4DZ", "North Yorkshire", 53.94471, -1.07335],
    stanmore: ["King Street 88", "M2 4WQ", "Greater Manchester", 53.48127, -2.24534],
    wexford: ["Leeds Road 310", "HD2 1YY", "West Yorkshire", 53.66512, -1.76303],
  } satisfies Record<OrganizationKey, readonly [string, string, string, number, number]>,
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
  deals: {
    fairhavenReview: [
      "Fairhaven Components – operating model review",
      "Walk Martin and Rachel through option B on Thursday",
    ],
    northwoldReview: ["Northwold Logistics – depot network review", "Answer Tom's two questions on the proposal"],
    brightwaterScaling: ["Brightwater Software – scaling customer operations", "Send Sarah two scope options"],
    brightwaterInterim: ["Brightwater Software – interim head of operations", "Sarah confirms the start date"],
    ellisonPricing: ["Ellison Fluid Systems – pricing and margin review", "Discovery call with Alan and Nina"],
    greyfriarsSuccession: ["Greyfriars Wholesale – leadership offsite on succession", "First call with Paul"],
    kestrelSales: ["Kestrel Medical – sales organisation review", "Laura confirms the split workshop days"],
    marlowIntegration: ["Marlow Facility Services – integration support after the merger", "First meeting with Diane"],
    rivertonExport: ["Riverton Food Ingredients – export market assessment", "Share the discovery summary with Emily"],
    calderPlanning: ["Calder Packaging – plant planning follow-up", "Agree the plants and interviews with George"],
    oakhamStrategy: ["Oakham Precision – strategy day with the owners", "Check in again in spring"],
    wexfordPlant: ["Wexford Coatings – plant operations review", "Closed"],
    calderReview: ["Calder Packaging – operating model review", "Engagement completed"],
    kestrelWorkshop: ["Kestrel Medical – annual strategy workshop", "Send the workshop summary to Laura"],
    kestrelOffsite: ["Kestrel Medical – leadership offsite on the sales plan", "Confirm the offsite venue with Simon"],
    stanmoreDay: ["Hale & Stanmore – partner strategy day", "Workshop delivered"],
    kestrelInterim: ["Kestrel Medical – interim support for the sales lead", "Monthly check-in with Simon"],
    brightwaterWorkshop: [
      "Brightwater Software – workshop days on the support model",
      "Prepare the second workshop day",
    ],
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
    "Proposal: option A is the review alone (10 days), option B adds two workshop days (16 days). Both at the standard day rate.",
    "Martin sponsors the engagement and is the day-to-day contact with Rachel; Helen signs off after the leadership meeting.",
  ],
  tasks: {
    briefHelen: "Prepare a relationship brief for the walkthrough with Martin and Rachel",
    kickoffAgenda: "Send Martin the one-page interview summary before Thursday",
    callTom: "Call Tom about his questions on the proposal",
    brightwaterScope: "Write two scope options for Brightwater",
    interimAvailability: "Confirm interim days for January with Sarah",
    ellisonQuestions: "Prepare discovery questions for Alan and Nina",
    kestrelWalkthrough: "Walk Laura through the split workshop days",
    briefDiane: "Prepare a relationship brief for the first meeting with Diane",
    rivertonNotes: "Write up the Riverton discovery call",
    lunchGeorge: "Suggest two lunch dates to George",
    mergerReferences: "Send Diane two merger references",
    ellisonMarginData: "Read Nina's margin data and prepare three questions",
  } satisfies Record<TaskKey, string>,
  views: {
    pipeline: "Engagement pipeline",
    active: "Active engagements",
    nextSteps: "Next steps",
    relationships: "Relationships by last meeting",
    openTasks: "Open tasks",
    delivery: "Delivery calendar",
  },
  widgets: {
    proposalsOut: "Proposals out",
    won: "Won in the last 12 months",
    daysInDelivery: "Days booked in delivery",
    quietContacts: "Not met in 60+ days",
    byStage: "Open pipeline by stage",
    byDelivery: "Won engagements by delivery",
    nextSteps: "Next steps, next 14 days",
    wonByMonth: "Won fees by month",
    topClients: "Top clients by won fees",
    meetingsMonth: "Client meetings this month",
  },
  wiki: {
    guide: {
      title: "Operating Guide",
      markdown: [
        "Ashcombe Advisory is an independent practice that advises mid-sized B2B companies on strategy and operations. Most work comes from relationships: clients, former colleagues and partners who introduce us. This workspace is demo data; every company and person in it is fictional.",
        "",
        "## How we use the CRM",
        "- **Clients** are the companies we advise or talk to, plus the partners who refer us. **Contacts** are the people there, with their role in the engagement, a relationship strength and the date of the last meeting.",
        "- **Engagements** move from Introduction through Discovery, Scoping, Proposal sent and Decision to Won or Lost. The proposal PDF sits in the engagement's Documents field; the stage records that it was sent and what was decided.",
        "- The value of an engagement is our fee: the estimated days times the day rate, calculated by the CRM. The weighted value applies the stage probability to it. Duration counts the days from start to end.",
        "- Won engagements move on through Delivery on the Active engagements board: Not started, In delivery, Wrapping up, Completed.",
        "- **Tasks** are things we promised, with a due date. Tasks, next steps and next step dates are ordinary fields: nobody is reminded automatically, so look at the Next steps and Open tasks views every morning.",
        "- A conversation from the inbox belongs to an engagement or client only when someone links it there.",
        "",
        "## Working rules",
        "- Every open engagement has a next step and a next step date.",
        "- After every meeting, update the contact's last meeting date and relationship strength.",
        "- Record a decision on the engagement as soon as the client tells us, with the lost reason when we did not get it.",
        "- Day rates and fee options are on the page of the same name.",
        "- Proposals, statements of work, interview notes and workshop agendas are files in the engagement's Documents field, so search and Mate find them by their text. Billing stays in its own tool.",
        "- The Calendar page shows engagement periods, next steps and client meetings together; the Delivery calendar view shows the booked work.",
      ],
    },
    process: {
      title: "How engagements move",
      markdown: [
        "Every engagement moves through the same stages. The stage records where the conversation stands, not a document.",
        "",
        "## Stages",
        "1. **Introduction:** someone introduced us or the client got in touch. Add the client, the person and who referred them.",
        "2. **Discovery:** first conversation done. Write down the problem in the client's words and who else is involved.",
        "3. **Scoping:** we agree what the engagement covers and who we interview. Enter the day rate and the estimated days, so the fee is calculated.",
        "4. **Proposal sent:** the proposal went out by email and its PDF is in the engagement's Documents; the fee on the engagement matches the option we recommend.",
        "5. **Decision:** the client is deciding. Keep the next step on the date they gave us.",
        "6. **Won or Lost:** record the decision manually and, when lost, the reason. Thank the person who referred us either way.",
        "",
        "## After the decision",
        "A won engagement starts in Delivery at Not started. Set the start and end dates, move it to In delivery at the kick-off and to Wrapping up when the final workshop is booked. Completed engagements stay for the next conversation with the client.",
      ],
    },
    brief: {
      title: "Prepare a relationship brief",
      whenToUse: "When a meeting with a client, prospect or referral partner is coming up.",
      markdown: [
        "A relationship brief takes ten minutes and makes sure we walk into every meeting knowing the person, not just the engagement.",
        "",
        "## Steps",
        "1. Open the contact and check the relationship strength, the last meeting and who introduced us.",
        "2. Open the client and its engagements: stage, next step and earlier work together.",
        "3. Read the conversations linked to the engagement and the client. Conversations nobody linked do not show up there, so check the inbox for the person's name as well.",
        "4. Write five lines into the notes of the engagement: what they care about, what changed since we last spoke, what we promised, one personal detail worth remembering, and the question we want answered.",
        "5. After the meeting, update the last meeting date, the relationship strength, the next step and its date, and add a task for every promise.",
      ],
    },
    rates: {
      title: "Day rates and fee options",
      markdown: [
        "We price every engagement as estimated days times a day rate. The CRM calculates the fee from these two fields, so change the inputs, not the fee.",
        "",
        "## Day rates",
        "- **Advisory and reviews:** £1,850 per day, including preparation and the written summary.",
        "- **Workshops and offsites:** £1,900 per day of facilitation; preparation is part of the estimate.",
        "- **Interim management:** £1,350 per day for blocks of at least 20 days.",
        "- Introductions through a referral partner get the standard rate; we never discount for the referral.",
        "",
        "## Fee options in a proposal",
        "- Offer two options: the core review alone, and the review plus workshop days with the leadership team.",
        "- Enter the option we recommend on the engagement. Mention the other one in the notes with its days.",
        "- When a client asks to split or move workshop days, the fee stays the same as long as the days do.",
        "- Travel is billed at cost and never part of the day rate.",
      ],
    },
  },
  threads: {
    fairhavenDecision: {
      subject: "Proposal: operating model review",
      messages: [
        "Hi Helen,\n\nThank you for the open conversation last week. As agreed, the proposal has two scope options: option A covers the operations review on its own, option B adds two workshop days with your leadership team.\n\nI am happy to walk Martin and Rachel through it before your leadership meeting.\n\nBest regards,\nMax",
        "Hi Max,\n\nThank you, we will decide in Monday's leadership meeting. Martin and Rachel would like to go through option B with you first. Could you also tell us how the fee changes if we start with two of the three plants?\n\nBest,\nHelen",
        "Hi Helen,\n\nThank you. Option B is 16 days at our day rate of £1,850. Starting with two plants takes it to 12 days; the two workshop days stay the same.\n\nThursday at 10 works for the walkthrough with Martin and Rachel, and I will bring the interview summary. And good luck to your son in the regional final on Saturday!\n\nWarm regards,\nMax",
      ],
    },
    martinLinkedin: {
      messages: [
        "Max, good to see the proposal arrive. Rachel asked for one page on how the two workshop days would run. Anything you could share before Thursday?",
        "Of course, Martin. I will send a one-pager tomorrow and bring printed copies on Thursday.",
        "Perfect, thank you.",
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
        "Hi Tom,\n\nAs promised, here is the proposal for the depot network review: a three-week discovery sprint followed by three workshop days with your depot managers.\n\nI am happy to discuss any part of it.\n\nBest regards,\nMax",
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
      "Proposal walkthrough with Fairhaven Components",
      "Discovery call with Ellison Fluid Systems",
      "Workshop planning with Kestrel Medical",
      "Proposal questions with Northwold Logistics",
      "First meeting with Marlow Facility Services",
      "Steering committee: Kestrel interim support",
    ],
  },
  files: {
    proposal: {
      name: "Proposal – Operating model review.pdf",
      lines: [
        "# Proposal – Operating model review",
        "Fairhaven Components, Sheffield. Prepared by Ashcombe Advisory for Helen Ashworth, Martin Pryce and Rachel Dunn.",
        "## The question",
        "Each of the three plants plans production, purchasing and stock on its own. Margins are under pressure, and the plants compete for the same finished-goods space. Martin wants one planning rhythm across the three plants.",
        "## Scope options",
        "| Option | Scope | Days | Fee |",
        "| A | Operations review: five interviews, one site visit per plant, written summary | 10 | £18,500 |",
        "| B | Option A plus two workshop days with the leadership team | 16 | £29,600 |",
        "All days at our day rate of £1,850. Travel is billed at cost.",
        "## Phasing",
        "Starting with two of the three plants takes option B to 12 days (£22,200); the two workshop days stay the same.",
        "## What you get",
        "A shared weekly planning rhythm, a depot consolidation assessment for the finished-goods stock of the Sheffield and Rotherham plants, and a decision paper for the leadership meeting.",
        "## Timeline",
        "Start about three weeks after the decision; seven weeks from the first interview to the second workshop day.",
      ],
    },
    discovery: {
      name: "Discovery interview notes.md",
      lines: [
        "# Discovery interview notes – Fairhaven Components",
        "## Plant managers",
        "All three plan on their own spreadsheets. Changeovers are agreed by phone the day before.",
        "## Purchasing",
        "Steel orders are placed per plant; nobody sees the combined volume.",
        "## Customer service",
        "Late orders are mostly caused by stock sitting in the wrong plant. A depot consolidation of the finished goods came up in every interview.",
        "## Rachel (finance)",
        "Wants the fee options side by side and a clear answer on starting with two plants.",
      ],
    },
    sow: {
      name: "Statement of work (draft).docx",
      lines: [
        "# Statement of work (draft)",
        "Fairhaven Components and Ashcombe Advisory, option B.",
        "## Work",
        "Five interviews, one site visit per plant, a depot consolidation assessment, two workshop days with the leadership team.",
        "## Fee",
        "16 days at £1,850 per day: £29,600, invoiced in two instalments. Travel at cost.",
        "## People",
        "Sponsor and day-to-day contact: Martin Pryce. Signs off: Helen Ashworth.",
      ],
    },
    summary: {
      name: "Interview summary (one page).pdf",
      lines: [
        "# Interview summary",
        "Five interviews, three plants, one pattern: every plant optimises its own week.",
        "## What we heard",
        "| Topic | Finding |",
        "| Planning | Three spreadsheets, no shared rhythm |",
        "| Stock | Finished goods often in the wrong plant |",
        "| Purchasing | Volumes never combined |",
        "## Proposed focus",
        "One weekly planning meeting and a depot consolidation of the finished goods.",
      ],
    },
    northwold: {
      name: "Proposal – Depot network review.pdf",
      lines: [
        "# Proposal – Depot network review",
        "Northwold Logistics, Leeds. Prepared for Tom Whitaker and Claire Hollis.",
        "## Approach",
        "A three-week discovery sprint with visits to all depots, followed by three workshop days with the depot managers.",
        "## Fee",
        "| Phase | Days | Fee |",
        "| Discovery sprint | 11 | £20,350 |",
        "| Workshops | 3 | £5,550 |",
        "| Total | 14 | £25,900 |",
        "## Outcome",
        "Three depot consolidation scenarios with their effect on delivery times and cost.",
      ],
    },
    agenda: {
      name: "Workshop agenda.docx",
      lines: [
        "# Workshop agenda – support model, day two",
        "Brightwater Software, with Sarah Kemp and Adam Lowe.",
        "## Morning",
        "Review of the ticket analysis; where the second line loses time.",
        "## Afternoon",
        "Design the new escalation path; agree owners and a first test week.",
        "Parking lot from day one: the depot consolidation of spare hardware stock.",
      ],
    },
    steering: {
      name: "Steering committee notes.md",
      lines: [
        "# Steering committee notes – Kestrel interim support",
        "## Progress",
        "The new sales lead runs the weekly pipeline review on her own since last month.",
        "## Decisions",
        "Keep two interim days a month until the end of the block. Simon chairs the next committee.",
        "## Open",
        "Laura asks whether the depot consolidation in the south-west changes the field sales territories.",
      ],
    },
  },
  trash: { contact: "Martin Pryce", deal: "Oakham Precision – board away day" },
  mate: {
    title: "Brief for the Fairhaven proposal walkthrough",
    question: "Brief me for tomorrow's Fairhaven proposal walkthrough.",
    answer:
      'Tomorrow you walk Martin Pryce and Rachel Dunn through the proposal (calendar: "Proposal walkthrough with Fairhaven Components", 60 minutes). Helen Ashworth decides in Monday\'s leadership meeting.\n\n**From the attached proposal (Proposal – Operating model review.pdf):**\n- Option A: operations review, 10 days, £18,500.\n- Option B: option A plus two workshop days, 16 days, £29,600. This is the fee on the engagement.\n- Starting with two of the three plants: 12 days, £22,200; the workshop days stay the same.\n- Outcome includes a depot consolidation assessment for the Sheffield and Rotherham plants.\n\n**From the conversations:**\n- Helen\'s email: Martin and Rachel want to go through option B first, and she asked about two plants. Your reply with the 12-day figure is still a draft.\n- Martin on LinkedIn: Rachel wants one page on how the two workshop days run. The task "Send Martin the one-page interview summary before Thursday" is still in progress.\n\n**Questions to settle:** which two plants come first, and whether Rachel needs the instalments from the statement of work draft.\n\nPersonal note: Helen\'s son plays in the regional final on Saturday.',
  },
  routines: {
    briefs: {
      name: "Prepare meeting briefs",
      task: "Every weekday morning, read today's accessible calendar events with get_calendars. Match the attendees to contacts through their identity channels, then read each contact's client and open engagements with stage, next step, last meeting, the conversations linked to the engagement and the text of the proposal in its Documents. For every event with a matching open engagement, append one dated brief of at most 120 words to that engagement's notes: what the people care about, what changed since the last meeting, what we promised, the fee options the attached proposal quotes and the question to settle. Skip events without a matching engagement and never add the same brief twice. Change no other field, create no calendar event and send no message.",
      runs: [
        "Added briefs to 2 engagements for today's meetings: Fairhaven Components (citing option B, 16 days, £29,600, from the attached proposal) and Kestrel Medical.",
        "Added a brief for the Ellison discovery call; the other meeting had no open engagement.",
      ],
      note: "I could not reach the model provider on this attempt, so I stopped before reading the calendar. Nothing was changed; tomorrow's run prepares the briefs again.",
    },
    revisit: {
      name: "Relationships to revisit",
      task: 'Every Monday, query contacts sorted by Last meeting, oldest first, and read their relationship strength, role and client. For at most three contacts whose last meeting is more than 60 days ago, whose relationship strength is Strong or Warm, and who have no open task linked to them, create one ordinary task named "Get back in touch with <contact name>" for the workspace owner, due this Friday, Low priority, linked to the contact and the client, with the last meeting date and the latest engagement in its notes. Do not change the contacts and do not message anyone.',
      runs: [
        "Created 2 tasks: George Barlow (last met 140 days ago) and Kevin Walsh (105 days).",
        "Created 1 task for Ian Pollard; the other quiet contacts already had an open task.",
      ],
    },
    followUps: {
      name: "Every morning, draft follow-ups for engagements due today",
      task: "Every weekday morning, find the engagements in Introduction, Discovery, Scoping, Proposal sent or Decision whose Next step date is today or earlier, and the email conversations linked to an engagement or client where the client wrote last and nobody has replied. For at most three of them, read the engagement's notes and the latest linked conversation and save one short reply draft with save_message_draft in that conversation that answers the open question and proposes the next step. Preserve an existing draft and skip conversations where the workspace owner wrote last. The drafts are for the owner's review; never send them and do not change any record.",
      runs: [
        "Prepared 1 reply draft for the engagement due today: Brightwater Software, the two scope options for Sarah Kemp. Skipped Fairhaven Components, whose reply already ends in a draft, and Northwold Logistics, where Tom's questions already have a call task.",
        "Prepared a reply draft to Richard Hale at Hale & Stanmore about the talk at the partner roundtable. No engagement was due that day; the conversation ended with Richard's question.",
        "Prepared a reply draft to George Barlow at Calder Packaging with a proposal for the plants and the interviews. Nothing was sent.",
      ],
    },
    taskFromEmail: {
      name: "New client email: create a task for the ask",
      task: "Review the new email identified by routine_trigger. Continue only when the sender matches a contact through its identity channels and the contact is linked to an open engagement. Read the email and the engagement's open tasks. If the email asks for something that no open task covers, create one task with mutate_crm_record: a short name that states the ask, a due date that matches any date the sender names (otherwise three days from today), Medium priority, linked to the engagement and the contact, with one sentence about the ask in its notes. Do not create a task when an open task already covers the ask. Do not reply, save drafts, send messages or change anything else.",
      runs: [
        'Created the task "Read Nina\'s margin data and prepare three questions" for the Ellison engagement, due before the discovery call.',
        'The email from Sarah Kemp asked for scope options; the open task "Write two scope options for Brightwater" already covered it, so no task was created.',
      ],
    },
  },
  agentNotes: {
    fairhaven: [
      "Summary by Claude after the call with Helen last week:",
      "Helen cares most about one planning rhythm across the three plants and about the answer on starting with two plants.",
      "She signs off only after the leadership meeting; Martin and Rachel want to go through option B first.",
      "Open: which two plants would come first.",
      "Next step: walk Martin and Rachel through option B on Thursday.",
    ],
    brightwater: [
      "Draft by ChatGPT from Sarah's email and the ticket analysis:",
      "Option 1: ticket analysis and a new escalation path, 8 days, £14,800.",
      "Option 2: option 1 plus the support model and two workshop days with the team leads, 12 days, £22,200. Recommended, and the fee on this engagement.",
      "Sarah wants the January interim days kept as a separate agreement.",
      "Adam needs the day count per option for the management meeting.",
    ],
    ellison: [
      "Cleaned up by Codex (script run on the margin export Nina sent):",
      "Removed 14 duplicate rows and merged three spellings of the product group names.",
      "Gross margin by product group over three years: pumps from 33% to 24%, seals from 29% to 26%, spare parts flat at 41%.",
      "Volumes grew 12% in the same period, so the drop comes from price and mix, not from demand.",
      "The cleaned table is ready for Thursday's discovery call.",
    ],
    kestrelInterim: [
      "Summary by Claude after the steering committee:",
      "The new sales lead runs the weekly pipeline review on her own since last month.",
      "Decision: keep two interim days a month until the end of the block; Simon chairs the next committee.",
      "Open: Laura asked whether the depot consolidation in the south-west changes the field sales territories.",
    ],
    riverton: [
      "Draft by ChatGPT from the call recording:",
      "Strong interest in the Netherlands and Poland; Emily wants Sweden checked as well.",
      "Nobody owns export sales today; the assessment should say whether to hire an export manager.",
      "Open: sales figures by country for the last three years, which Emily sends next week.",
    ],
  },
  agents: {
    company: "Ashcombe Advisory",
    records: "clients, engagements and tasks",
    mate: "It prepares the meeting briefs every morning, answers questions about clients and engagements and creates tasks when Max asks in the chat.",
    claude:
      "Max asks it to summarise a call and append the summary to the engagement's notes, or to compare the fee options of two proposals.",
    chatgpt:
      "It drafts scope options and proposal paragraphs from a client's email and saves them as a note or a message draft.",
    codex:
      "It cleans up exports and imports from the terminal, for example a margin spreadsheet a client sent, and writes the result as a note.",
    followUp:
      'The routine "Every morning, draft follow-ups for engagements due today" runs every weekday morning. It looks for engagements whose next step date is today or earlier and for email conversations where the client wrote last, and saves at most three reply drafts in those conversations. The drafts wait in the Inbox until Max has read, edited and sent them; the routine never sends anything and skips a conversation that already ends in a draft.',
  },
  mateReferences: {
    title: "Merger references for Marlow",
    question: "Diane Marsh at Marlow wants two merger references for her board. Create a task for me.",
    answer:
      "Done. I created the task **Send Diane two merger references**: High priority, due in three days, linked to Diane Marsh and the Marlow integration engagement.\n\nFrom your LinkedIn thread with Diane: she asked for two companies you supported through a merger, and your answer promising names by Friday is already sent.\n\nI cannot name merger references from the records: no earlier engagement is about a merger. The closest are Calder Packaging (operating model review, completed) and Hale & Stanmore (partner strategy day, completed), both with strong contacts. Please decide whom you can ask before you promise Diane any names.\n\nNothing was sent to anyone and I contacted nobody; I only created the task.",
  },
  inbox: {
    brightwaterScope: {
      subject: "Scope options for scaling customer operations",
      messages: [
        "Hi Max,\n\nAdam and I would like to see the two scope options before Friday's management meeting. Could you send them today? Adam mainly wants to know how many days each option needs.\n\nThanks,\nSarah",
        "Hi Sarah,\n\nYes, they are on my desk for this afternoon. In short: option 1 covers the ticket analysis and a new escalation path, option 2 adds the support model and two workshop days with your team leads. Does Adam need anything beyond the day count?\n\nBest,\nMax",
        "Hi Max,\n\nA rough fee per option would help him. And can we keep the interim days in January separate from this?\n\nSarah",
        "Hi Sarah,\n\nHere are the two options. Option 1: 8 days, £14,800, ticket analysis and escalation path. Option 2: 12 days, £22,200, adding the support model and two workshop days with your team leads. All at our day rate of £1,850.\n\nThe interim days in January stay a separate agreement, as we discussed. I recommend option 2, and I am happy to walk Adam through both on Thursday.\n\nBest,\nMax",
      ],
    },
    brightwaterInterim: {
      subject: "Interim head of operations: invoicing",
      messages: [
        "Hi Max,\n\nSarah says the interim role is 20 days at £1,350, starting in three weeks. For our budget planning: can we pay monthly in arrears rather than in two instalments? And does the day rate include your travel to Manchester?\n\nAdam",
        "Hi Adam,\n\nMonthly in arrears works for me. Travel to Manchester is billed at cost and is not part of the day rate, as with our other engagements. I will put both points into the statement of work.\n\nBest,\nMax",
        "Thanks, Max. Please send the statement of work to Sarah and me before Friday so we can sign it in the management meeting.",
      ],
    },
    stanmoreRoundtable: {
      subject: "Partner roundtable next month",
      messages: [
        "Hi Max,\n\nOur partners meet for the client roundtable next month. Several of them asked about the strategy day you ran for us, and I would like you to talk for 20 minutes about how we prepared it. Would you be free?\n\nRichard",
        "Hi Richard,\n\nThat is kind of you, and I would be glad to. Twenty minutes works; I would show how we turned the interviews into the agenda for the day. Which date do you have in mind?\n\nBest,\nMax",
        "The second Thursday of the month, 5 pm, at our office on King Street. Drinks afterwards, and our managing partner would like to meet you too.\n\nRichard",
        "Hi Richard,\n\nThe second Thursday at 5 pm suits me. I will send you the three slides I would use by the end of next week, so you can check that they fit the evening.\n\nThank you again for thinking of me.\n\nBest,\nMax",
      ],
    },
    marlowReferences: {
      messages: [
        "Max, thank you for the time last week. Our board would like to hear from two companies you supported through a merger. Could you put us in touch?",
        "Of course, Diane. I will ask two former clients today and send you their names and a time to talk by Friday.",
        "Great, thank you. Could one of them be a company of about our size, around 450 people? The board would like that.",
        "Good point, Diane, I will keep that in mind when I ask.",
      ],
    },
    kestrelVenue: {
      subject: "Venue for the leadership offsite",
      messages: [
        "Hi Max,\n\nI looked at two venues for the offsite: a hotel near Bath with a big workshop room, and the training centre at our Bristol site. The hotel costs more but gets everyone out of the office. Which would you pick?\n\nSimon",
        "Hi Simon,\n\nI would pick the hotel. Two days away from the daily pipeline calls are the point of the offsite, and the workshop room matters more than the price difference. I would also plan a working lunch with the regional sales managers on day one. Can you check availability for the dates we pencilled in, three weeks from now?\n\nBest,\nMax",
        "Laura agrees with the hotel but wants to confirm after Thursday's budget meeting. I will let you know on Friday.\n\nSimon",
        "Hi Simon,\n\nThat is fine. I have kept both days free and will hold the working lunch idea until the venue is confirmed.\n\nBest,\nMax",
      ],
    },
    rivertonNotes: {
      subject: "First notes and export markets",
      messages: [
        "Hi Emily,\n\nThank you for the open call last week. Here are my first notes: strong demand in the Netherlands and Poland, but no clear owner for export sales yet. The full discovery summary follows next week; please tell me if I misread anything.\n\nBest,\nMax",
        "Hi Max,\n\nThis is spot on, thank you. Two questions for the summary: could you also look at Sweden, and could the assessment include a view on whether we should hire an export manager?\n\nEmily",
      ],
    },
    calderPlants: {
      subject: "Plants and interviews for the planning follow-up",
      messages: [
        "Hi George,\n\nThank you for the lunch idea, and for thinking of me for the planning follow-up. To scope it properly I would like to know which plants you want to start with and who I should interview there.\n\nBest,\nMax",
        "Hi Max,\n\nLet us start with the Bradford plant and the one in Wakefield. I would suggest the two plant managers and the heads of planning and purchasing. We can add the others later.\n\nGeorge",
        "Hi George,\n\nThank you, that is clear. I propose six interviews of 45 minutes across the two plants in the second and third week, and a short walk through the production lines on the first day. I will send a one-page scope for the planning follow-up (8 days) before the end of the week.\n\nBest,\nMax",
      ],
    },
    ellisonMargins: {
      subject: "Margin data for Thursday",
      messages: [
        "Hi Max,\n\nAlan asked me to send you what we have on margins by product group, so you have it before Thursday's call. It is three years of data and not as tidy as it should be.\n\nNina",
        "Hi Nina,\n\nThank you, that helps a lot. Untidy is fine; I mostly want to see where the margin drops. I will read it tonight and bring two or three questions on Thursday.\n\nBest,\nMax",
        "Great. Alan and I will both be on the call; the Teams link is in the invite.",
        "Perfect, see you both on Thursday.",
      ],
    },
    kestrelPlanning: {
      messages: [
        "Max, thanks for the steering committee. Our new sales lead asked to join the offsite planning with Laura and me.",
        "Gladly, Simon. The more of the sales team shapes the agenda, the better the offsite works. I will add her to the invite once Laura has confirmed the venue.",
      ],
    },
    greyfriarsCall: {
      subject: "Introduction from Richard Hale",
      messages: [
        "Dear Max,\n\nRichard Hale gave me your email address. I am considering handing Greyfriars to the next generation and would like to talk to someone who listens first. Would you have time for a call in the next week or two?\n\nKind regards,\nPaul Gregson",
        "Dear Paul,\n\nThank you for writing, and thank you to Richard. I would be glad to talk. How about a first call of 30 minutes the week after next, say Tuesday at 11? It is only a conversation, with no obligations.\n\nKind regards,\nMax",
        "Tuesday at 11 suits me. I will tell my daughter; she may join for the second half.",
      ],
    },
  } satisfies Record<InboxKey, InboxThreadText>,
};

type Strings = typeof en;

const de: Strings = {
  countryCode: "de",
  company: "Kronfeld Beratung",
  workspaceName: "Beratung",
  website: "https://kronfeld-beratung.example",
  phones: { mobile: { templates: ["+49 30 23125 ###"], start: 300 } },
  selfTitle: "Inhaber und Berater",
  lists: {
    organization: ["Kunde", "Kunden", "Unternehmen, die wir beraten, ansprechen oder mit denen wir zusammenarbeiten."],
    contact: ["Kontakt", "Kontakte", "Die Menschen hinter jedem Mandat und jeder Empfehlung."],
    deal: ["Mandat", "Mandate", "Mandate vom ersten Kennenlernen bis zur Entscheidung und durch die Umsetzung."],
    task: ["Aufgabe", "Aufgaben", "Was wir zugesagt haben, mit Fälligkeitsdatum."],
  },
  fields: {
    dealValue: "Honorar",
    weightedValue: "Gewichtetes Honorar",
    industry: "Branche",
    relationship: "Beziehung",
    address: "Adresse",
    documents: "Dokumente",
    website: "Website",
    employees: "Mitarbeitende",
    jobTitle: "Position",
    role: "Rolle im Mandat",
    strength: "Beziehungsstärke",
    lastMeeting: "Letztes Treffen",
    dayRate: "Tagessatz",
    days: "Geschätzte Tage",
    start: "Beginn",
    end: "Ende",
    duration: "Dauer (Tage)",
    delivery: "Umsetzung",
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
    role: { sponsor: "Auftraggeber", dayToDay: "Ansprechpartner", signsOff: "Unterschreibt" },
    strength: { strong: "Eng", warm: "Gut", early: "Neu" },
    delivery: {
      notStarted: "Nicht begonnen",
      inDelivery: "In Umsetzung",
      wrappingUp: "Abschluss",
      completed: "Abgeschlossen",
    },
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
  addresses: {
    fairhaven: ["Gutenbergstraße 14", "72770", "", 48.47321, 9.16354],
    northwold: ["Wannenäckerstraße 41", "74078", "", 49.16523, 9.18412],
    brightwater: ["Haid-und-Neu-Straße 7", "76131", "", 49.01437, 8.43126],
    calder: ["Hohwiesenweg 9", "75175", "", 48.88234, 8.71655],
    ellison: ["Fabrikstraße 22", "73728", "", 48.74098, 9.30772],
    greyfriars: ["Daimlerstraße 30", "89079", "", 48.36412, 9.95321],
    kestrel: ["Paul-Ehrlich-Straße 11", "72076", "", 48.53451, 9.03873],
    marlow: ["Schwieberdinger Straße 60", "71636", "", 48.88792, 9.17204],
    oakham: ["Ulmer Straße 124", "73431", "", 48.82955, 10.10943],
    riverton: ["Max-Eyth-Straße 5", "74523", "", 49.12014, 9.75542],
    stanmore: ["Königstraße 26", "70173", "", 48.77781, 9.17953],
    wexford: ["Robert-Bosch-Straße 18", "73037", "", 48.69425, 9.66381],
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
  deals: {
    fairhavenReview: [
      "Falkenried Komponenten – Überprüfung des Betriebsmodells",
      "Variante B am Donnerstag mit Herrn Pfeiffer und Frau Decker durchgehen",
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
      "Frau Brandl bestätigt die geteilten Workshoptage",
    ],
    marlowIntegration: [
      "Marbach Gebäudeservice – Begleitung der Integration nach der Fusion",
      "Erstes Treffen mit Frau Merkle",
    ],
    rivertonExport: [
      "Uferhof Lebensmittelzutaten – Bewertung neuer Exportmärkte",
      "Zusammenfassung der Bedarfsklärung an Frau Rößler schicken",
    ],
    calderPlanning: [
      "Kalder Verpackungen – Folgeprojekt Werksplanung",
      "Werke und Interviews mit Herrn Brenner abstimmen",
    ],
    oakhamStrategy: ["Achtal Präzision – Strategietag mit den Gesellschaftern", "Im Frühjahr erneut nachfragen"],
    wexfordPlant: ["Weißach Industrielacke – Analyse der Werksabläufe", "Abgeschlossen"],
    calderReview: ["Kalder Verpackungen – Überprüfung des Betriebsmodells", "Mandat abgeschlossen"],
    kestrelWorkshop: [
      "Sperber Medizintechnik – jährlicher Strategieworkshop",
      "Workshop-Zusammenfassung an Frau Brandl",
    ],
    kestrelOffsite: ["Sperber Medizintechnik – Klausur zur Vertriebsplanung", "Tagungsort mit Herrn Hartl festlegen"],
    stanmoreDay: ["Haller & Stein – Strategietag der Partner", "Workshop durchgeführt"],
    kestrelInterim: [
      "Sperber Medizintechnik – Interimsunterstützung der Vertriebsleitung",
      "Monatliches Abstimmungsgespräch mit Herrn Hartl",
    ],
    brightwaterWorkshop: ["Klarwasser Software – Workshoptage zum Supportmodell", "Zweiten Workshoptag vorbereiten"],
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
    "Angebot: Variante A ist die Überprüfung allein (10 Tage), Variante B kommt mit zwei Workshoptagen auf 16 Tage. Beide zum üblichen Tagessatz.",
    "Herr Pfeiffer ist Auftraggeber und mit Frau Decker unser Ansprechpartner; Frau Albrecht unterschreibt nach der Sitzung der Geschäftsleitung.",
  ],
  tasks: {
    briefHelen: "Beziehungsbriefing für den Termin mit Herrn Pfeiffer und Frau Decker vorbereiten",
    kickoffAgenda: "Herrn Pfeiffer vor Donnerstag die Interview-Zusammenfassung schicken",
    callTom: "Herrn Wendt wegen seiner Fragen zum Angebot anrufen",
    brightwaterScope: "Zwei Varianten für den Umfang bei Klarwasser ausarbeiten",
    interimAvailability: "Interimstage im Januar mit Frau Kern abstimmen",
    ellisonQuestions: "Fragen für das Erstgespräch mit Ellwanger vorbereiten",
    kestrelWalkthrough: "Mit Frau Brandl die geteilten Workshoptage durchgehen",
    briefDiane: "Beziehungsbriefing für das erste Treffen mit Frau Merkle vorbereiten",
    rivertonNotes: "Gespräch zur Bedarfsklärung mit Uferhof zusammenfassen",
    lunchGeorge: "Georg zwei Termine für ein Mittagessen vorschlagen",
    mergerReferences: "Frau Merkle zwei Referenzen zu Fusionen schicken",
    ellisonMarginData: "Margendaten von Frau Engel lesen und drei Fragen vorbereiten",
  },
  views: {
    pipeline: "Mandatspipeline",
    active: "Laufende Mandate",
    nextSteps: "Nächste Schritte",
    relationships: "Beziehungen nach letztem Treffen",
    openTasks: "Offene Aufgaben",
    delivery: "Umsetzungskalender",
  },
  widgets: {
    proposalsOut: "Offene Angebote",
    won: "Gewonnen in 12 Monaten",
    daysInDelivery: "Gebuchte Tage in Umsetzung",
    quietContacts: "Seit 60+ Tagen nicht getroffen",
    byStage: "Offene Pipeline nach Phase",
    byDelivery: "Gewonnene Mandate nach Umsetzung",
    nextSteps: "Nächste Schritte, 14 Tage",
    wonByMonth: "Gewonnene Honorare pro Monat",
    topClients: "Top-Kunden nach gewonnenen Honoraren",
    meetingsMonth: "Kundentermine im Monat",
  },
  wiki: {
    guide: {
      title: "Leitfaden",
      markdown: [
        "Kronfeld Beratung ist eine unabhängige Beratung für mittelständische B2B-Unternehmen mit Schwerpunkt Strategie und Organisation. Die meisten Mandate entstehen aus Beziehungen: Kunden, frühere Kollegen und Partner, die uns weiterempfehlen. Dieser Arbeitsbereich enthält Demodaten; alle Firmen und Personen sind erfunden.",
        "",
        "## So nutzen wir das CRM",
        "- **Kunden** sind die Unternehmen, die wir beraten oder ansprechen, dazu die Partner, die uns empfehlen. **Kontakte** sind die Menschen dort, mit ihrer Rolle im Mandat, Beziehungsstärke und Datum des letzten Treffens.",
        "- **Mandate** durchlaufen Kennenlernen, Bedarfsklärung, Auftragsklärung, Angebot gesendet und Entscheidung bis Gewonnen oder Verloren. Das Angebot liegt als PDF im Feld „Dokumente“ des Mandats; die Phase hält fest, dass es verschickt wurde und wie entschieden wurde.",
        "- Der Wert eines Mandats ist unser Honorar: geschätzte Tage mal Tagessatz, vom CRM berechnet. Der gewichtete Wert wendet die Wahrscheinlichkeit der Phase darauf an. Die Dauer zählt die Tage von Beginn bis Ende.",
        "- Gewonnene Mandate durchlaufen danach die Umsetzung auf dem Board „Laufende Mandate“: Nicht begonnen, In Umsetzung, Abschluss, Abgeschlossen.",
        "- **Aufgaben** sind Zusagen mit Fälligkeitsdatum. Aufgaben, nächste Schritte und deren Datum sind normale Felder: Niemand wird automatisch erinnert, deshalb jeden Morgen die Ansichten „Nächste Schritte“ und „Offene Aufgaben“ prüfen.",
        "- Ein Gespräch aus dem Posteingang gehört nur dann zu einem Mandat oder Kunden, wenn jemand es dort verknüpft.",
        "",
        "## Arbeitsregeln",
        "- Jedes offene Mandat hat einen nächsten Schritt mit Datum.",
        "- Nach jedem Treffen beim Kontakt das Datum des letzten Treffens und die Beziehungsstärke aktualisieren.",
        "- Entscheidungen sofort im Mandat festhalten, bei einer Absage mit Grund.",
        "- Tagessätze und Honorarvarianten stehen auf der gleichnamigen Seite.",
        "- Angebote, Leistungsbeschreibungen, Interviewnotizen und Workshopagenden liegen als Dateien im Feld „Dokumente“ des Mandats, damit Suche und Mate sie über ihren Text finden. Die Abrechnung bleibt in ihrem eigenen Programm.",
        "- Die Kalenderseite zeigt Mandatszeiträume, nächste Schritte und Kundentermine zusammen; die Ansicht „Umsetzungskalender“ zeigt die gebuchte Arbeit.",
      ],
    },
    process: {
      title: "So entwickeln sich Mandate",
      markdown: [
        "Jedes Mandat durchläuft dieselben Phasen. Die Phase hält fest, wo das Gespräch steht, sie ist kein Dokument.",
        "",
        "## Phasen",
        "1. **Kennenlernen:** Jemand hat uns empfohlen oder das Unternehmen hat sich gemeldet. Kunde, Person und Empfehlungsquelle anlegen.",
        "2. **Bedarfsklärung:** Das erste Gespräch hat stattgefunden. Das Problem in den Worten des Kunden festhalten und notieren, wer noch beteiligt ist.",
        "3. **Auftragsklärung:** Wir stimmen ab, was das Mandat umfasst und wen wir interviewen. Tagessatz und geschätzte Tage eintragen, damit das Honorar berechnet wird.",
        "4. **Angebot gesendet:** Das Angebot ist per E-Mail verschickt und liegt als PDF in den Dokumenten des Mandats; das Honorar im Mandat entspricht der Variante, die wir empfehlen.",
        "5. **Entscheidung:** Der Kunde entscheidet. Den nächsten Schritt auf das Datum legen, das er uns genannt hat.",
        "6. **Gewonnen oder Verloren:** Die Entscheidung von Hand eintragen, bei einer Absage mit Grund. In beiden Fällen der Person danken, die uns empfohlen hat.",
        "",
        "## Nach der Entscheidung",
        "Ein gewonnenes Mandat beginnt in der Umsetzung bei Nicht begonnen. Beginn und Ende eintragen, zum Auftakt auf In Umsetzung und mit dem letzten gebuchten Workshop auf Abschluss setzen. Abgeschlossene Mandate bleiben für das nächste Gespräch mit dem Kunden erhalten.",
      ],
    },
    brief: {
      title: "Beziehungsbriefing vorbereiten",
      whenToUse: "Wenn ein Treffen mit Kunden, Interessenten oder Empfehlungspartnern ansteht.",
      markdown: [
        "Ein Beziehungsbriefing dauert zehn Minuten und sorgt dafür, dass wir in jedes Treffen gehen und den Menschen kennen, nicht nur das Mandat.",
        "",
        "## Schritte",
        "1. Den Kontakt öffnen und Beziehungsstärke, letztes Treffen und Empfehlungsquelle prüfen.",
        "2. Den Kunden und seine Mandate öffnen: Phase, nächster Schritt und frühere Zusammenarbeit.",
        "3. Die Gespräche lesen, die mit dem Mandat und dem Kunden verknüpft sind. Nicht verknüpfte Gespräche erscheinen dort nicht, deshalb auch im Posteingang nach dem Namen der Person suchen.",
        "4. Fünf Zeilen in die Notizen des Mandats schreiben: was der Person wichtig ist, was sich seit dem letzten Gespräch geändert hat, was wir zugesagt haben, ein persönliches Detail, das wir uns merken sollten, und die Frage, die wir beantwortet haben wollen.",
        "5. Nach dem Treffen letztes Treffen, Beziehungsstärke, nächsten Schritt und Datum aktualisieren und für jede Zusage eine Aufgabe anlegen.",
      ],
    },
    rates: {
      title: "Tagessätze und Honorarvarianten",
      markdown: [
        "Jedes Mandat kalkulieren wir als geschätzte Tage mal Tagessatz. Das CRM berechnet das Honorar aus diesen beiden Feldern, deshalb ändern wir die Eingaben, nicht das Honorar.",
        "",
        "## Tagessätze",
        "- **Beratung und Analysen:** 1.850 € pro Tag, inklusive Vorbereitung und schriftlicher Zusammenfassung.",
        "- **Workshops und Klausuren:** 1.900 € pro Moderationstag; die Vorbereitung ist in der Schätzung enthalten.",
        "- **Interim-Management:** 1.350 € pro Tag bei Blöcken ab 20 Tagen.",
        "- Empfehlungen über Partner erhalten den üblichen Satz; für Empfehlungen gibt es keinen Nachlass.",
        "",
        "## Honorarvarianten im Angebot",
        "- Zwei Varianten anbieten: die Analyse allein und die Analyse mit Workshoptagen für die Geschäftsleitung.",
        "- Die empfohlene Variante im Mandat eintragen, die andere mit ihren Tagen in den Notizen erwähnen.",
        "- Wenn ein Kunde Workshoptage teilen oder verschieben möchte, bleibt das Honorar gleich, solange die Zahl der Tage gleich bleibt.",
        "- Reisekosten rechnen wir nach Aufwand ab, sie sind nie Teil des Tagessatzes.",
      ],
    },
  },
  threads: {
    fairhavenDecision: {
      subject: "Angebot: Überprüfung des Betriebsmodells",
      messages: [
        "Sehr geehrte Frau Albrecht,\n\nvielen Dank für das offene Gespräch in der vergangenen Woche. Wie besprochen enthält das Angebot zwei Varianten: Variante A umfasst die Überprüfung der Abläufe, Variante B zusätzlich zwei Workshoptage mit Ihrer Geschäftsleitung.\n\nGern gehe ich das Angebot vor Ihrer Sitzung mit Herrn Pfeiffer und Frau Decker durch.\n\nMit freundlichen Grüßen\nMax Bergmann",
        "Sehr geehrter Herr Bergmann,\n\nvielen Dank, wir entscheiden am Montag in der Geschäftsleitung. Herr Pfeiffer und Frau Decker möchten Variante B vorher mit Ihnen durchgehen. Können Sie uns außerdem sagen, wie sich das Honorar ändert, wenn wir mit zwei der drei Werke beginnen?\n\nViele Grüße\nHeike Albrecht",
        "Sehr geehrte Frau Albrecht,\n\nvielen Dank. Variante B umfasst 16 Tage zu unserem Tagessatz von 1.850 €. Mit zwei Werken sind es 12 Tage; die zwei Workshoptage bleiben gleich.\n\nDonnerstag um 10 Uhr passt für das Gespräch mit Herrn Pfeiffer und Frau Decker, die Zusammenfassung der Interviews bringe ich mit. Und viel Erfolg für Ihren Sohn beim Landesfinale am Samstag!\n\nHerzliche Grüße\nMax Bergmann",
      ],
    },
    martinLinkedin: {
      messages: [
        "Herr Bergmann, das Angebot ist gut angekommen. Frau Decker hätte gern eine Seite dazu, wie die zwei Workshoptage ablaufen. Können Sie vor Donnerstag etwas schicken?",
        "Sehr gern, Herr Pfeiffer. Ich schicke Ihnen morgen eine Seite und bringe am Donnerstag Ausdrucke mit.",
        "Perfekt, danke.",
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
      "Angebotsbesprechung bei Falkenried Komponenten",
      "Erstgespräch mit Ellwanger Fluidtechnik",
      "Workshopplanung mit Sperber Medizintechnik",
      "Rückfragen zum Angebot mit Nordwald Logistik",
      "Erstes Treffen mit Marbach Gebäudeservice",
      "Lenkungskreis: Interim-Unterstützung Sperber",
    ],
  },
  files: {
    proposal: {
      name: "Angebot – Überprüfung des Betriebsmodells.pdf",
      lines: [
        "# Angebot – Überprüfung des Betriebsmodells",
        "Falkenried Komponenten GmbH, Reutlingen. Erstellt von Kronfeld Beratung für Heike Albrecht, Markus Pfeiffer und Ruth Decker.",
        "## Die Fragestellung",
        "Jedes der drei Werke plant Produktion, Einkauf und Bestand für sich. Die Margen stehen unter Druck, und die Werke konkurrieren um dieselben Lagerflächen für Fertigware. Herr Pfeiffer möchte einen gemeinsamen Planungsrhythmus für alle drei Werke.",
        "## Varianten",
        "| Variante | Umfang | Tage | Honorar |",
        "| A | Überprüfung der Abläufe: fünf Interviews, ein Besuch pro Werk, schriftliche Zusammenfassung | 10 | 18.500 € |",
        "| B | Variante A plus zwei Workshoptage mit der Geschäftsleitung | 16 | 29.600 € |",
        "Alle Tage zu unserem Tagessatz von 1.850 €. Reisekosten nach Aufwand.",
        "## Stufenweiser Start",
        "Mit zwei der drei Werke umfasst Variante B 12 Tage (22.200 €); die zwei Workshoptage bleiben gleich.",
        "## Ergebnis",
        "Ein gemeinsamer wöchentlicher Planungsrhythmus, eine Bewertung der Lagerkonsolidierung für die Fertigware der Werke Reutlingen und Metzingen und eine Entscheidungsvorlage für die Geschäftsleitung.",
        "## Zeitplan",
        "Beginn etwa drei Wochen nach der Entscheidung; sieben Wochen vom ersten Interview bis zum zweiten Workshoptag.",
      ],
    },
    discovery: {
      name: "Notizen aus den Interviews.md",
      lines: [
        "# Notizen aus den Interviews – Falkenried Komponenten",
        "## Werkleiter",
        "Alle drei planen in eigenen Tabellen. Umrüstungen werden am Vortag telefonisch abgestimmt.",
        "## Einkauf",
        "Stahl wird pro Werk bestellt; niemand sieht die Gesamtmenge.",
        "## Kundenservice",
        "Verspätete Aufträge entstehen meist durch Bestand im falschen Werk. Eine Lagerkonsolidierung der Fertigware kam in jedem Interview zur Sprache.",
        "## Frau Decker (Finanzen)",
        "Möchte die Honorarvarianten nebeneinander und eine klare Antwort zum Start mit zwei Werken.",
      ],
    },
    sow: {
      name: "Leistungsbeschreibung (Entwurf).docx",
      lines: [
        "# Leistungsbeschreibung (Entwurf)",
        "Falkenried Komponenten GmbH und Kronfeld Beratung, Variante B.",
        "## Leistungen",
        "Fünf Interviews, ein Besuch pro Werk, eine Bewertung der Lagerkonsolidierung, zwei Workshoptage mit der Geschäftsleitung.",
        "## Honorar",
        "16 Tage zu 1.850 € pro Tag: 29.600 €, abgerechnet in zwei Raten. Reisekosten nach Aufwand.",
        "## Beteiligte",
        "Auftraggeber und Ansprechpartner: Markus Pfeiffer. Zeichnet ab: Heike Albrecht.",
      ],
    },
    summary: {
      name: "Zusammenfassung der Interviews (eine Seite).pdf",
      lines: [
        "# Zusammenfassung der Interviews",
        "Fünf Interviews, drei Werke, ein Muster: Jedes Werk optimiert seine eigene Woche.",
        "## Was wir gehört haben",
        "| Thema | Befund |",
        "| Planung | Drei Tabellen, kein gemeinsamer Rhythmus |",
        "| Bestand | Fertigware oft im falschen Werk |",
        "| Einkauf | Mengen werden nie gebündelt |",
        "## Vorgeschlagener Schwerpunkt",
        "Eine wöchentliche Planungsrunde und eine Lagerkonsolidierung der Fertigware.",
      ],
    },
    northwold: {
      name: "Angebot – Analyse des Standortnetzes.pdf",
      lines: [
        "# Angebot – Analyse des Standortnetzes",
        "Nordwald Logistik GmbH, Heilbronn. Erstellt für Thomas Wendt und Claudia Hensel.",
        "## Vorgehen",
        "Ein dreiwöchiger Analysesprint mit Besuchen an allen Standorten, danach drei Workshoptage mit den Standortleitern.",
        "## Honorar",
        "| Phase | Tage | Honorar |",
        "| Analysesprint | 11 | 20.350 € |",
        "| Workshops | 3 | 5.550 € |",
        "| Gesamt | 14 | 25.900 € |",
        "## Ergebnis",
        "Drei Szenarien zur Lagerkonsolidierung mit ihrer Wirkung auf Lieferzeiten und Kosten.",
      ],
    },
    agenda: {
      name: "Workshopagenda.docx",
      lines: [
        "# Workshopagenda – Supportmodell, Tag zwei",
        "Klarwasser Software AG, mit Sabine Kern und Achim Lorenz.",
        "## Vormittag",
        "Auswertung der Ticketanalyse; wo der Second-Level-Support Zeit verliert.",
        "## Nachmittag",
        "Neuen Eskalationsweg entwerfen; Verantwortliche und eine erste Testwoche festlegen.",
        "Themenspeicher von Tag eins: Lagerkonsolidierung der Ersatzhardware.",
      ],
    },
    steering: {
      name: "Notizen Lenkungskreis.md",
      lines: [
        "# Notizen Lenkungskreis – Interim-Unterstützung Sperber",
        "## Fortschritt",
        "Die neue Vertriebsleiterin führt die wöchentliche Pipelinerunde seit letztem Monat selbst.",
        "## Entscheidungen",
        "Zwei Interimstage pro Monat bis zum Ende des Blocks. Herr Hartl leitet den nächsten Lenkungskreis.",
        "## Offen",
        "Frau Brandl fragt, ob die Lagerkonsolidierung im Süden die Vertriebsgebiete im Außendienst verändert.",
      ],
    },
  },
  trash: { contact: "Markus Pfeiffer", deal: "Achtal Präzision – Klausur der Geschäftsführung" },
  mate: {
    title: "Briefing für die Angebotsbesprechung bei Falkenried",
    question: "Bereite mich auf die Angebotsbesprechung mit Falkenried morgen vor.",
    answer:
      "Morgen gehen Sie das Angebot mit Markus Pfeiffer und Ruth Decker durch (Kalender: „Angebotsbesprechung bei Falkenried Komponenten“, 60 Minuten). Heike Albrecht entscheidet am Montag in der Geschäftsleitung.\n\n**Aus dem angehängten Angebot (Angebot – Überprüfung des Betriebsmodells.pdf):**\n- Variante A: Überprüfung der Abläufe, 10 Tage, 18.500 €.\n- Variante B: Variante A plus zwei Workshoptage, 16 Tage, 29.600 €. Das ist das Honorar im Mandat.\n- Start mit zwei der drei Werke: 12 Tage, 22.200 €; die Workshoptage bleiben gleich.\n- Zum Ergebnis gehört eine Bewertung der Lagerkonsolidierung für die Werke Reutlingen und Metzingen.\n\n**Aus den Gesprächen:**\n- Mail von Frau Albrecht: Herr Pfeiffer und Frau Decker möchten Variante B vorher durchgehen, und sie hat nach zwei Werken gefragt. Ihre Antwort mit den 12 Tagen ist noch ein Entwurf.\n- Herr Pfeiffer auf LinkedIn: Frau Decker möchte eine Seite zum Ablauf der zwei Workshoptage. Die Aufgabe „Herrn Pfeiffer vor Donnerstag die Interview-Zusammenfassung schicken“ ist noch in Arbeit.\n\n**Zu klären:** welche zwei Werke zuerst kommen und ob Frau Decker die Raten aus dem Entwurf der Leistungsbeschreibung braucht.\n\nPersönlich: Der Sohn von Frau Albrecht spielt am Samstag im Landesfinale.",
  },
  routines: {
    briefs: {
      name: "Briefings für Termine vorbereiten",
      task: "Lies an jedem Werktag morgens mit get_calendars die heutigen Termine. Ordne die Teilnehmenden über ihre Identitätskanäle Kontakten zu und lies zu jedem Kontakt den Kunden und die offenen Mandate mit Phase, nächstem Schritt, letztem Treffen, den mit dem Mandat verknüpften Gesprächen und dem Text des Angebots in seinen Dokumenten. Hänge für jeden Termin mit passendem offenem Mandat ein datiertes Briefing von höchstens 120 Wörtern an die Notizen dieses Mandats an: was den Personen wichtig ist, was sich seit dem letzten Treffen geändert hat, was wir zugesagt haben, welche Honorarvarianten das angehängte Angebot nennt und welche Frage zu klären ist. Überspringe Termine ohne passendes Mandat und schreibe kein Briefing doppelt. Ändere keine anderen Felder, lege keine Termine an und sende keine Nachrichten.",
      runs: [
        "Briefings für 2 Mandate zu den heutigen Terminen ergänzt: Falkenried Komponenten (mit Variante B aus dem angehängten Angebot: 16 Tage, 29.600 €) und Sperber Medizintechnik.",
        "Briefing für das Erstgespräch mit Ellwanger ergänzt; der andere Termin hatte kein offenes Mandat.",
      ],
      note: "Ich konnte den Modellanbieter bei diesem Versuch nicht erreichen und habe deshalb vor dem Lesen des Kalenders abgebrochen. Nichts wurde geändert; der Lauf morgen bereitet die Briefings erneut vor.",
    },
    revisit: {
      name: "Beziehungen wieder aufnehmen",
      task: 'Frage jeden Montag die Kontakte sortiert nach Letztes Treffen ab, die ältesten zuerst, und lies Beziehungsstärke, Rolle und Kunde. Lege für höchstens drei Kontakte, deren letztes Treffen mehr als 60 Tage zurückliegt, deren Beziehungsstärke Eng oder Gut ist und die keine offene verknüpfte Aufgabe haben, je eine normale Aufgabe "Wieder melden bei <Name des Kontakts>" für die Inhaberin oder den Inhaber des Arbeitsbereichs an, fällig diesen Freitag, Priorität Niedrig, verknüpft mit Kontakt und Kunde, mit dem Datum des letzten Treffens und dem jüngsten Mandat in den Notizen. Ändere die Kontakte nicht und schreibe niemandem.',
      runs: [
        "2 Aufgaben angelegt: Georg Brenner (zuletzt vor 140 Tagen getroffen) und Klaus Wieland (105 Tage).",
        "1 Aufgabe für Ingo Pohl angelegt; die anderen ruhigen Kontakte hatten bereits eine offene Aufgabe.",
      ],
    },
    followUps: {
      name: "Jeden Morgen Nachfass-Entwürfe für fällige Mandate",
      task: "Suche an jedem Werktag morgens die Mandate in den Phasen Kennenlernen, Bedarfsklärung, Auftragsklärung, Angebot gesendet oder Entscheidung, deren Datum für den nächsten Schritt heute oder früher liegt, und die mit einem Mandat oder Kunden verknüpften E-Mail-Gespräche, in denen zuletzt der Kunde geschrieben hat und noch niemand geantwortet hat. Lies für höchstens drei davon die Notizen des Mandats und das jüngste verknüpfte Gespräch und speichere mit save_message_draft in diesem Gespräch einen kurzen Antwortentwurf, der die offene Frage beantwortet und den nächsten Schritt vorschlägt. Behalte einen vorhandenen Entwurf und überspringe Gespräche, in denen zuletzt die Inhaberin oder der Inhaber des Arbeitsbereichs geschrieben hat. Die Entwürfe sind zur Prüfung für die Inhaberin oder den Inhaber gedacht; sende sie nie und ändere keine Datensätze.",
      runs: [
        "Einen Antwortentwurf für das heute fällige Mandat vorbereitet: Klarwasser Software, die zwei Varianten für Sabine Kern. Übersprungen: Falkenried Komponenten, dessen Antwort schon mit einem Entwurf endet, und Nordwald Logistik, wo die Fragen von Herrn Wendt bereits eine Anrufaufgabe haben.",
        "Antwortentwurf an Richard Haller bei Haller & Stein zum Vortrag in der Partnerrunde vorbereitet. An dem Tag war kein Mandat fällig; das Gespräch endete mit Richards Frage.",
        "Antwortentwurf an Georg Brenner bei Kalder Verpackungen mit einem Vorschlag zu Werken und Interviews vorbereitet. Nichts wurde gesendet.",
      ],
    },
    taskFromEmail: {
      name: "Neue Kundenmail: Aufgabe zur Bitte anlegen",
      task: "Prüfe die neue E-Mail, die routine_trigger nennt. Mache nur weiter, wenn der Absender über seine Identitätskanäle zu einem Kontakt passt und dieser Kontakt mit einem offenen Mandat verknüpft ist. Lies die E-Mail und die offenen Aufgaben des Mandats. Wenn die E-Mail etwas verlangt, das keine offene Aufgabe abdeckt, lege mit mutate_crm_record eine Aufgabe an: ein kurzer Name, der die Bitte nennt, ein Fälligkeitsdatum passend zu einem vom Absender genannten Datum (sonst in drei Tagen), Priorität Mittel, verknüpft mit Mandat und Kontakt, mit einem Satz zur Bitte in den Notizen. Lege keine Aufgabe an, wenn eine offene Aufgabe die Bitte schon abdeckt. Antworte nicht, speichere keine Entwürfe, sende keine Nachrichten und ändere nichts anderes.",
      runs: [
        "Aufgabe „Margendaten von Frau Engel lesen und drei Fragen vorbereiten“ für das Mandat bei Ellwanger angelegt, fällig vor dem Erstgespräch.",
        "Die E-Mail von Sabine Kern bat um Varianten für den Umfang; die offene Aufgabe „Zwei Varianten für den Umfang bei Klarwasser ausarbeiten“ deckte das schon ab, deshalb wurde keine Aufgabe angelegt.",
      ],
    },
  },
  agentNotes: {
    fairhaven: [
      "Zusammenfassung von Claude nach dem Gespräch mit Frau Albrecht in der vergangenen Woche:",
      "Frau Albrecht ist ein gemeinsamer Planungsrhythmus für die drei Werke am wichtigsten, dazu die Antwort zum Start mit zwei Werken.",
      "Sie unterschreibt erst nach der Sitzung der Geschäftsleitung; Herr Pfeiffer und Frau Decker möchten vorher Variante B durchgehen.",
      "Offen: Welche zwei Werke zuerst kommen.",
      "Nächster Schritt: Variante B am Donnerstag mit Herrn Pfeiffer und Frau Decker durchgehen.",
    ],
    brightwater: [
      "Entwurf von ChatGPT aus der Mail von Frau Kern und der Ticketanalyse:",
      "Variante 1: Ticketanalyse und neuer Eskalationsweg, 8 Tage, 14.800 €.",
      "Variante 2: Variante 1 plus Supportmodell und zwei Workshoptage mit den Teamleitern, 12 Tage, 22.200 €. Empfohlen und das Honorar dieses Mandats.",
      "Frau Kern möchte die Interimstage im Januar als eigene Vereinbarung behalten.",
      "Herr Lorenz braucht für die Sitzung der Geschäftsleitung die Tage je Variante.",
    ],
    ellison: [
      "Bereinigt von Codex (Skriptlauf auf dem Margenexport von Frau Engel):",
      "14 doppelte Zeilen entfernt und drei Schreibweisen der Produktgruppen zusammengeführt.",
      "Bruttomarge je Produktgruppe über drei Jahre: Pumpen von 33 % auf 24 %, Dichtungen von 29 % auf 26 %, Ersatzteile unverändert bei 41 %.",
      "Die Absatzmengen wuchsen im selben Zeitraum um 12 %, der Rückgang kommt also aus Preis und Mix, nicht aus der Nachfrage.",
      "Die bereinigte Tabelle liegt für das Erstgespräch am Donnerstag bereit.",
    ],
    kestrelInterim: [
      "Zusammenfassung von Claude nach dem Lenkungskreis:",
      "Die neue Vertriebsleiterin führt die wöchentliche Pipelinerunde seit letztem Monat selbst.",
      "Beschluss: zwei Interimstage pro Monat bis zum Ende des Blocks; Herr Hartl leitet den nächsten Lenkungskreis.",
      "Offen: Frau Brandl fragt, ob die Lagerkonsolidierung im Süden die Vertriebsgebiete im Außendienst verändert.",
    ],
    riverton: [
      "Entwurf von ChatGPT aus der Gesprächsaufzeichnung:",
      "Großes Interesse an den Niederlanden und Polen; Frau Rößler möchte auch Schweden prüfen lassen.",
      "Den Export verantwortet derzeit niemand; die Bewertung soll sagen, ob eine Exportleitung eingestellt werden sollte.",
      "Offen: Umsätze nach Ländern der letzten drei Jahre, die Frau Rößler nächste Woche schickt.",
    ],
  },
  agents: {
    company: "Kronfeld Beratung",
    records: "Kunden, Mandate und Aufgaben",
    mate: "Es bereitet jeden Morgen die Briefings für Termine vor, beantwortet Fragen zu Kunden und Mandaten und legt Aufgaben an, wenn Max im Chat darum bittet.",
    claude:
      "Max lässt es ein Gespräch zusammenfassen und die Zusammenfassung an die Notizen des Mandats anhängen oder die Honorarvarianten zweier Angebote vergleichen.",
    chatgpt:
      "Es entwirft Varianten für den Umfang und Absätze für Angebote aus der Mail eines Kunden und speichert sie als Notiz oder Nachrichtenentwurf.",
    codex:
      "Es bereinigt Exporte und Importe im Terminal, zum Beispiel eine Margentabelle, die ein Kunde geschickt hat, und schreibt das Ergebnis als Notiz.",
    followUp:
      "Die Routine „Jeden Morgen Nachfass-Entwürfe für fällige Mandate“ läuft an jedem Werktag am Morgen. Sie sucht Mandate, deren Datum für den nächsten Schritt heute oder früher liegt, und E-Mail-Gespräche, in denen zuletzt der Kunde geschrieben hat, und speichert höchstens drei Antwortentwürfe in diesen Gesprächen. Die Entwürfe warten im Posteingang, bis Max sie gelesen, angepasst und gesendet hat; die Routine sendet nie etwas und überspringt Gespräche, die schon mit einem Entwurf enden.",
  },
  mateReferences: {
    title: "Fusionsreferenzen für Marbach",
    question:
      "Doris Merkle von Marbach möchte zwei Referenzen zu Fusionen für ihren Aufsichtsrat. Leg eine Aufgabe für mich an.",
    answer:
      "Erledigt. Ich habe die Aufgabe **Frau Merkle zwei Referenzen zu Fusionen schicken** angelegt: Priorität Hoch, fällig in drei Tagen, verknüpft mit Doris Merkle und dem Mandat zur Begleitung der Integration bei Marbach Gebäudeservice.\n\nAus Ihrem LinkedIn-Gespräch mit Frau Merkle: Sie hat nach zwei Unternehmen gefragt, die Sie bei einer Fusion begleitet haben, und Ihre Antwort mit der Zusage von Namen bis Freitag ist schon gesendet.\n\nReferenzen zu Fusionen kann ich aus den Datensätzen nicht nennen: Kein früheres Mandat dreht sich um eine Fusion. Am nächsten kommen Kalder Verpackungen (Überprüfung des Betriebsmodells, abgeschlossen) und Haller & Stein (Strategietag der Partner, abgeschlossen), beide mit engen Kontakten. Bitte entscheiden Sie, wen Sie fragen können, bevor Sie Frau Merkle Namen zusagen.\n\nIch habe niemanden kontaktiert und nichts gesendet; ich habe nur die Aufgabe angelegt.",
  },
  inbox: {
    brightwaterScope: {
      subject: "Varianten für den Umfang: Kundenbetrieb skalieren",
      messages: [
        "Guten Tag Herr Bergmann,\n\nHerr Lorenz und ich würden die beiden Varianten gern vor der Sitzung der Geschäftsleitung am Freitag sehen. Können Sie sie uns heute schicken? Herr Lorenz interessiert vor allem, wie viele Tage jede Variante braucht.\n\nViele Grüße\nSabine Kern",
        "Guten Tag Frau Kern,\n\nja, sie liegen heute Nachmittag bei Ihnen. Kurz gesagt: Variante 1 umfasst die Ticketanalyse und einen neuen Eskalationsweg, Variante 2 zusätzlich das Supportmodell und zwei Workshoptage mit Ihren Teamleitern. Braucht Herr Lorenz außer den Tagen noch etwas?\n\nViele Grüße\nMax Bergmann",
        "Guten Tag Herr Bergmann,\n\nein grobes Honorar je Variante würde ihm helfen. Und können wir die Interimstage im Januar davon getrennt halten?\n\nSabine Kern",
        "Guten Tag Frau Kern,\n\nhier die beiden Varianten. Variante 1: 8 Tage, 14.800 €, Ticketanalyse und Eskalationsweg. Variante 2: 12 Tage, 22.200 €, zusätzlich das Supportmodell und zwei Workshoptage mit Ihren Teamleitern. Alles zu unserem Tagessatz von 1.850 €.\n\nDie Interimstage im Januar bleiben, wie besprochen, eine eigene Vereinbarung. Ich empfehle Variante 2 und gehe beide Varianten am Donnerstag gern mit Herrn Lorenz durch.\n\nViele Grüße\nMax Bergmann",
      ],
    },
    brightwaterInterim: {
      subject: "Interimsleitung Betrieb: Abrechnung",
      messages: [
        "Hallo Herr Bergmann,\n\nFrau Kern sagt, die Interimsleitung umfasst 20 Tage zu 1.350 € und beginnt in drei Wochen. Für unsere Budgetplanung: Können wir monatlich im Nachhinein zahlen statt in zwei Raten? Und sind die Reisen nach Karlsruhe im Tagessatz enthalten?\n\nViele Grüße\nAchim Lorenz",
        "Hallo Herr Lorenz,\n\nmonatlich im Nachhinein ist für mich in Ordnung. Reisekosten nach Karlsruhe rechne ich nach Aufwand ab, sie sind nicht Teil des Tagessatzes, wie bei unseren anderen Mandaten. Beides nehme ich in die Leistungsbeschreibung auf.\n\nViele Grüße\nMax Bergmann",
        "Danke, Herr Bergmann. Bitte schicken Sie die Leistungsbeschreibung vor Freitag an Frau Kern und mich, damit wir sie in der Sitzung der Geschäftsleitung unterzeichnen können.",
      ],
    },
    stanmoreRoundtable: {
      subject: "Partnerrunde im nächsten Monat",
      messages: [
        "Hallo Max,\n\nunsere Partner treffen sich im nächsten Monat zur Kundenrunde. Mehrere haben nach dem Strategietag gefragt, den du bei uns gemacht hast, und ich würde mich freuen, wenn du 20 Minuten erzählst, wie wir ihn vorbereitet haben. Hast du Zeit?\n\nRichard",
        "Hallo Richard,\n\nsehr gern, das ehrt mich. 20 Minuten passen; ich würde zeigen, wie wir aus den Interviews die Agenda des Tages gebaut haben. An welchen Termin denkst du?\n\nViele Grüße\nMax",
        "Am zweiten Donnerstag des Monats um 17 Uhr bei uns in der Königstraße. Danach gibt es etwas zu trinken, und unser geschäftsführender Partner möchte dich auch kennenlernen.\n\nRichard",
        "Hallo Richard,\n\nder zweite Donnerstag um 17 Uhr passt mir. Die drei Folien, die ich zeigen würde, schicke ich dir bis Ende nächster Woche, damit du prüfen kannst, ob sie zum Abend passen.\n\nNoch einmal danke, dass du an mich gedacht hast.\n\nViele Grüße\nMax",
      ],
    },
    marlowReferences: {
      messages: [
        "Herr Bergmann, danke für die Zeit in der vergangenen Woche. Unser Aufsichtsrat würde gern mit zwei Unternehmen sprechen, die Sie bei einer Fusion begleitet haben. Können Sie uns in Kontakt bringen?",
        "Sehr gern, Frau Merkle. Ich frage heute zwei frühere Kunden und schicke Ihnen bis Freitag Namen und einen Gesprächstermin.",
        "Wunderbar, danke. Könnte eines der Unternehmen in etwa unsere Größe haben, rund 450 Mitarbeitende? Das wäre dem Aufsichtsrat wichtig.",
        "Guter Hinweis, Frau Merkle, das behalte ich beim Fragen im Kopf.",
      ],
    },
    kestrelVenue: {
      subject: "Tagungsort für die Klausur",
      messages: [
        "Hallo Herr Bergmann,\n\nich habe zwei Tagungsorte für die Klausur angesehen: ein Hotel bei Reutlingen mit großem Workshopraum und das Schulungszentrum an unserem Standort in Tübingen. Das Hotel ist teurer, bringt aber alle aus dem Büro. Wofür würden Sie sich entscheiden?\n\nStefan Hartl",
        "Hallo Herr Hartl,\n\nich würde das Hotel nehmen. Zwei Tage abseits der täglichen Pipeline-Termine sind der Sinn der Klausur, und der Workshopraum zählt mehr als der Preisunterschied. Ich würde außerdem am ersten Tag ein Arbeitsmittagessen mit den Regionalleitern einplanen. Können Sie prüfen, ob an den vorgesehenen Tagen in drei Wochen etwas frei ist?\n\nViele Grüße\nMax Bergmann",
        "Frau Brandl ist mit dem Hotel einverstanden, möchte aber nach der Budgetrunde am Donnerstag bestätigen. Ich melde mich am Freitag.\n\nStefan Hartl",
        "Hallo Herr Hartl,\n\nkein Problem. Ich habe beide Tage freigehalten und hebe mir die Idee mit dem Arbeitsmittagessen auf, bis der Tagungsort feststeht.\n\nViele Grüße\nMax Bergmann",
      ],
    },
    rivertonNotes: {
      subject: "Erste Notizen und Exportmärkte",
      messages: [
        "Guten Tag Frau Rößler,\n\nvielen Dank für das offene Gespräch in der vergangenen Woche. Hier meine ersten Notizen: starke Nachfrage in den Niederlanden und in Polen, aber noch niemand, der den Export verantwortet. Die vollständige Zusammenfassung der Bedarfsklärung folgt nächste Woche; sagen Sie mir bitte, wenn ich etwas falsch verstanden habe.\n\nViele Grüße\nMax Bergmann",
        "Guten Tag Herr Bergmann,\n\ndas trifft es genau, danke. Zwei Fragen für die Zusammenfassung: Könnten Sie auch Schweden ansehen, und könnte die Bewertung eine Einschätzung enthalten, ob wir eine Exportleitung einstellen sollten?\n\nEva Rößler",
      ],
    },
    calderPlants: {
      subject: "Werke und Interviews für das Folgeprojekt",
      messages: [
        "Hallo Georg,\n\ndanke für den Vorschlag zum Mittagessen und dafür, dass du an mich für die Werksplanung gedacht hast. Damit ich den Umfang sauber abstecken kann: Mit welchen Werken möchtest du beginnen, und wen soll ich dort interviewen?\n\nViele Grüße\nMax",
        "Hallo Max,\n\nlass uns mit Pforzheim und dem Werk in Mühlacker anfangen. Ich würde die beiden Werkleiter und die Leiter von Planung und Einkauf vorschlagen. Die anderen können wir später dazunehmen.\n\nGeorg",
        "Hallo Georg,\n\ndanke, das ist klar. Ich schlage sechs Interviews à 45 Minuten in beiden Werken vor, in der zweiten und dritten Woche, und am ersten Tag einen kurzen Rundgang durch die Fertigung. Eine Seite zum Umfang des Folgeprojekts (8 Tage) schicke ich dir noch diese Woche.\n\nViele Grüße\nMax",
      ],
    },
    ellisonMargins: {
      subject: "Margendaten für Donnerstag",
      messages: [
        "Hallo Herr Bergmann,\n\nHerr Fenske hat mich gebeten, Ihnen vor dem Gespräch am Donnerstag zu schicken, was wir zu den Margen je Produktgruppe haben. Es sind drei Jahre Daten, und sie sind nicht so ordentlich, wie sie sein sollten.\n\nNina Engel",
        "Hallo Frau Engel,\n\nvielen Dank, das hilft sehr. Unordentlich ist kein Problem; ich möchte vor allem sehen, wo die Marge fällt. Ich lese die Daten heute Abend und bringe am Donnerstag zwei, drei Fragen mit.\n\nViele Grüße\nMax Bergmann",
        "Gut. Herr Fenske und ich sind beide im Gespräch dabei; den Teams-Link finden Sie in der Einladung.",
        "Perfekt, bis Donnerstag.",
      ],
    },
    kestrelPlanning: {
      messages: [
        "Herr Bergmann, danke für den Lenkungskreis. Unsere neue Vertriebsleiterin möchte bei der Planung der Klausur mit Frau Brandl und mir dabei sein.",
        "Sehr gern, Herr Hartl. Je mehr vom Vertriebsteam die Agenda mitprägt, desto besser wird die Klausur. Ich nehme sie in die Einladung auf, sobald Frau Brandl den Tagungsort bestätigt hat.",
      ],
    },
    greyfriarsCall: {
      subject: "Empfehlung von Richard Haller",
      messages: [
        "Sehr geehrter Herr Bergmann,\n\nRichard Haller hat mir Ihre Mailadresse gegeben. Ich überlege, Grauhof Großhandel an die nächste Generation zu übergeben, und möchte mit jemandem sprechen, der erst zuhört. Hätten Sie in den nächsten ein bis zwei Wochen Zeit für ein Telefonat?\n\nMit freundlichen Grüßen\nPeter Grauhof",
        "Sehr geehrter Herr Grauhof,\n\nvielen Dank für Ihre Nachricht, und danke an Richard. Sehr gern. Wie wäre es in der übernächsten Woche mit einem ersten Telefonat von 30 Minuten, etwa am Dienstag um 11 Uhr? Es bleibt ein Gespräch ohne Verpflichtungen.\n\nMit freundlichen Grüßen\nMax Bergmann",
        "Dienstag um 11 Uhr passt. Ich sage meiner Tochter Bescheid; sie kann in der zweiten Hälfte dazukommen.",
      ],
    },
  },
};

const ORGANIZATION_FACTS: Record<
  OrganizationKey,
  { industry: string; relationship: string; employees: number; createdDaysAgo: number }
> = {
  fairhaven: { industry: "manufacturing", relationship: "prospect", employees: 240, createdDaysAgo: 54 },
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
    role: string;
    strength: string;
    lastMeeting: number;
    createdDaysAgo: number;
    linkedin?: boolean;
  }
> = {
  helen: {
    organization: "fairhaven",
    role: "signsOff",
    strength: "strong",
    lastMeeting: -5,
    createdDaysAgo: 54,
  },
  martin: {
    organization: "fairhaven",
    role: "sponsor",
    strength: "warm",
    lastMeeting: -12,
    createdDaysAgo: 50,
    linkedin: true,
  },
  rachel: { organization: "fairhaven", role: "dayToDay", strength: "warm", lastMeeting: -12, createdDaysAgo: 40 },
  tom: {
    organization: "northwold",
    role: "sponsor",
    strength: "warm",
    lastMeeting: -9,
    createdDaysAgo: 36,
    linkedin: true,
  },
  claire: { organization: "northwold", role: "dayToDay", strength: "early", lastMeeting: -20, createdDaysAgo: 28 },
  sarah: {
    organization: "brightwater",
    role: "sponsor",
    strength: "strong",
    lastMeeting: -6,
    createdDaysAgo: 258,
    linkedin: true,
  },
  adam: { organization: "brightwater", role: "signsOff", strength: "warm", lastMeeting: -25, createdDaysAgo: 240 },
  george: {
    organization: "calder",
    role: "sponsor",
    strength: "strong",
    lastMeeting: -140,
    createdDaysAgo: 305,
    linkedin: true,
  },
  alan: {
    organization: "ellison",
    role: "sponsor",
    strength: "early",
    lastMeeting: -15,
    createdDaysAgo: 17,
    linkedin: true,
  },
  nina: { organization: "ellison", role: "dayToDay", strength: "early", lastMeeting: -15, createdDaysAgo: 15 },
  paul: { organization: "greyfriars", role: "signsOff", strength: "early", lastMeeting: -3, createdDaysAgo: 5 },
  laura: {
    organization: "kestrel",
    role: "sponsor",
    strength: "strong",
    lastMeeting: -10,
    createdDaysAgo: 198,
  },
  simon: {
    organization: "kestrel",
    role: "dayToDay",
    strength: "warm",
    lastMeeting: -10,
    createdDaysAgo: 120,
    linkedin: true,
  },
  diane: {
    organization: "marlow",
    role: "signsOff",
    strength: "early",
    lastMeeting: -7,
    createdDaysAgo: 8,
    linkedin: true,
  },
  ian: { organization: "oakham", role: "signsOff", strength: "warm", lastMeeting: -72, createdDaysAgo: 115 },
  emily: {
    organization: "riverton",
    role: "sponsor",
    strength: "early",
    lastMeeting: -4,
    createdDaysAgo: 13,
    linkedin: true,
  },
  richard: {
    organization: "stanmore",
    role: "sponsor",
    strength: "strong",
    lastMeeting: -14,
    createdDaysAgo: 420,
    linkedin: true,
  },
  kevin: { organization: "wexford", role: "signsOff", strength: "warm", lastMeeting: -105, createdDaysAgo: 165 },
};

type DealFacts = {
  organization: OrganizationKey;
  contacts: ContactKey[];
  stage: string;
  source: string;
  rate: number;
  days: number;
  createdDaysAgo: number;
  decision: number;
  /** Start and end of the work, relative to the story end; open engagements plan them after the decision. */
  start?: number;
  end?: number;
  delivery?: string;
  next?: number;
  lost?: string;
  /** Stage moves, oldest first: on `daysAgo` the engagement left the stage `from`. */
  moves?: Array<{ daysAgo: number; from: string }>;
};

const DEAL_FACTS: Record<DealKey, DealFacts> = {
  fairhavenReview: {
    organization: "fairhaven",
    contacts: ["helen", "martin", "rachel"],
    stage: "proposal",
    source: "peerReferral",
    rate: 1850,
    days: 16,
    createdDaysAgo: 52,
    decision: 6,
    start: 20,
    end: 68,
    next: 2,
    moves: [
      { daysAgo: 45, from: "introduction" },
      { daysAgo: 33, from: "discovery" },
      { daysAgo: 7, from: "scoping" },
    ],
  },
  northwoldReview: {
    organization: "northwold",
    contacts: ["tom", "claire"],
    stage: "proposal",
    source: "event",
    rate: 1850,
    days: 14,
    createdDaysAgo: 34,
    decision: 14,
    start: 28,
    end: 70,
    next: -2,
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
    rate: 1850,
    days: 12,
    createdDaysAgo: 21,
    decision: 30,
    next: 0,
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
    rate: 1350,
    days: 20,
    createdDaysAgo: 30,
    decision: 5,
    start: 21,
    end: 140,
    next: 9,
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
    rate: 1850,
    days: 10,
    createdDaysAgo: 16,
    decision: 40,
    next: 8,
    moves: [{ daysAgo: 4, from: "introduction" }],
  },
  greyfriarsSuccession: {
    organization: "greyfriars",
    contacts: ["paul"],
    stage: "introduction",
    source: "peerReferral",
    rate: 1900,
    days: 3,
    createdDaysAgo: 4,
    decision: 60,
    next: 10,
  },
  kestrelSales: {
    organization: "kestrel",
    contacts: ["laura", "simon"],
    stage: "decision",
    source: "existingClient",
    rate: 1850,
    days: 14,
    createdDaysAgo: 40,
    decision: 10,
    start: 35,
    end: 90,
    next: 8,
    moves: [
      { daysAgo: 33, from: "introduction" },
      { daysAgo: 22, from: "discovery" },
      { daysAgo: 9, from: "scoping" },
      { daysAgo: 3, from: "proposal" },
    ],
  },
  marlowIntegration: {
    organization: "marlow",
    contacts: ["diane"],
    stage: "introduction",
    source: "event",
    rate: 1350,
    days: 20,
    createdDaysAgo: 7,
    decision: 45,
    next: 11,
  },
  rivertonExport: {
    organization: "riverton",
    contacts: ["emily"],
    stage: "discovery",
    source: "content",
    rate: 1850,
    days: 9,
    createdDaysAgo: 12,
    decision: 35,
    next: 12,
    moves: [{ daysAgo: 4, from: "introduction" }],
  },
  calderPlanning: {
    organization: "calder",
    contacts: ["george"],
    stage: "scoping",
    source: "existingClient",
    rate: 1850,
    days: 8,
    createdDaysAgo: 14,
    decision: 35,
    next: 14,
    moves: [
      { daysAgo: 10, from: "introduction" },
      { daysAgo: 5, from: "discovery" },
    ],
  },
  oakhamStrategy: {
    organization: "oakham",
    contacts: ["ian"],
    stage: "lost",
    source: "clientReferral",
    rate: 1900,
    days: 2,
    createdDaysAgo: 110,
    decision: -70,
    lost: "timing",
    moves: [
      { daysAgo: 95, from: "introduction" },
      { daysAgo: 84, from: "discovery" },
      { daysAgo: 70, from: "proposal" },
    ],
  },
  wexfordPlant: {
    organization: "wexford",
    contacts: ["kevin"],
    stage: "lost",
    source: "event",
    rate: 1850,
    days: 15,
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
  calderReview: {
    organization: "calder",
    contacts: ["george"],
    stage: "won",
    source: "clientReferral",
    rate: 1850,
    days: 14,
    createdDaysAgo: 300,
    decision: -220,
    start: -205,
    end: -120,
    delivery: "completed",
    moves: [
      { daysAgo: 280, from: "introduction" },
      { daysAgo: 262, from: "discovery" },
      { daysAgo: 245, from: "scoping" },
      { daysAgo: 232, from: "proposal" },
      { daysAgo: 220, from: "decision" },
    ],
  },
  kestrelWorkshop: {
    organization: "kestrel",
    contacts: ["laura"],
    stage: "won",
    source: "existingClient",
    rate: 1900,
    days: 3,
    createdDaysAgo: 190,
    decision: -150,
    start: -40,
    end: 6,
    delivery: "wrappingUp",
    next: 0,
    moves: [
      { daysAgo: 175, from: "proposal" },
      { daysAgo: 150, from: "decision" },
    ],
  },
  kestrelOffsite: {
    organization: "kestrel",
    contacts: ["laura", "simon"],
    stage: "won",
    source: "existingClient",
    rate: 1900,
    days: 4,
    createdDaysAgo: 55,
    decision: -30,
    start: 18,
    end: 19,
    delivery: "notStarted",
    next: 5,
    moves: [
      { daysAgo: 40, from: "proposal" },
      { daysAgo: 30, from: "decision" },
    ],
  },
  stanmoreDay: {
    organization: "stanmore",
    contacts: ["richard"],
    stage: "won",
    source: "event",
    rate: 1900,
    days: 3,
    createdDaysAgo: 330,
    decision: -300,
    start: -290,
    end: -284,
    delivery: "completed",
    moves: [
      { daysAgo: 310, from: "proposal" },
      { daysAgo: 300, from: "decision" },
    ],
  },
  kestrelInterim: {
    organization: "kestrel",
    contacts: ["simon"],
    stage: "won",
    source: "existingClient",
    rate: 1350,
    days: 18,
    createdDaysAgo: 110,
    decision: -100,
    start: -90,
    end: 30,
    delivery: "inDelivery",
    next: 9,
    moves: [
      { daysAgo: 104, from: "proposal" },
      { daysAgo: 100, from: "decision" },
    ],
  },
  brightwaterWorkshop: {
    organization: "brightwater",
    contacts: ["sarah", "adam"],
    stage: "won",
    source: "existingClient",
    rate: 1900,
    days: 3,
    createdDaysAgo: 62,
    decision: -50,
    start: -35,
    end: 20,
    delivery: "inDelivery",
    next: 8,
    moves: [
      { daysAgo: 55, from: "proposal" },
      { daysAgo: 50, from: "decision" },
    ],
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
  briefHelen: {
    status: "open",
    priority: "high",
    due: 2,
    deal: "fairhavenReview",
    contact: "helen",
    createdDaysAgo: 2,
  },
  kickoffAgenda: {
    status: "inProgress",
    priority: "high",
    due: 0,
    deal: "fairhavenReview",
    contact: "martin",
    createdDaysAgo: 2,
  },
  callTom: { status: "open", priority: "high", due: -1, deal: "northwoldReview", contact: "tom", createdDaysAgo: 3 },
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
    due: -3,
    organization: "calder",
    contact: "george",
    createdDaysAgo: 6,
  },
  mergerReferences: {
    status: "open",
    priority: "high",
    due: 3,
    deal: "marlowIntegration",
    contact: "diane",
    createdDaysAgo: 4,
  },
  ellisonMarginData: {
    status: "open",
    priority: "medium",
    due: 2,
    deal: "ellisonPricing",
    contact: "nina",
    createdDaysAgo: 1,
  },
};

const INBOX_PLANS: ReadonlyArray<InboxThreadPlan & { key: InboxKey }> = [
  {
    key: "brightwaterScope",
    account: "google",
    with: ["sarah"],
    state: "unread",
    latestMinutesAgo: 70,
    speakers: ["sarah", "self", "sarah", "self"],
    draft: true,
    links: ["deal:brightwaterScaling", "organization:brightwater"],
  },
  {
    key: "brightwaterInterim",
    account: "outlook",
    with: ["adam"],
    state: "open",
    latestMinutesAgo: 22 * 60,
    speakers: ["adam", "self", "adam"],
    links: ["deal:brightwaterInterim", "organization:brightwater"],
  },
  {
    key: "stanmoreRoundtable",
    account: "outlook",
    with: ["richard"],
    state: "open",
    latestMinutesAgo: 5 * 24 * 60 + 300,
    speakers: ["richard", "self", "richard", "self"],
    draft: true,
    links: ["organization:stanmore"],
  },
  {
    key: "marlowReferences",
    account: "linkedin",
    with: ["diane"],
    state: "open",
    latestMinutesAgo: 4 * 24 * 60 + 190,
    speakers: ["diane", "self", "diane", "self"],
    links: ["deal:marlowIntegration", "organization:marlow"],
  },
  {
    key: "kestrelVenue",
    account: "google",
    with: ["simon"],
    state: "open",
    latestMinutesAgo: 3500,
    speakers: ["simon", "self", "simon", "self"],
    links: ["deal:kestrelOffsite"],
  },
  {
    key: "rivertonNotes",
    account: "google",
    with: ["emily"],
    state: "unread",
    latestMinutesAgo: 200,
    speakers: ["self", "emily"],
    links: ["deal:rivertonExport", "organization:riverton"],
  },
  {
    key: "calderPlants",
    account: "google",
    with: ["george"],
    state: "open",
    latestMinutesAgo: 7 * 24 * 60 + 600,
    speakers: ["self", "george", "self"],
    draft: true,
    links: ["deal:calderPlanning", "organization:calder"],
  },
  {
    key: "ellisonMargins",
    account: "outlook",
    with: ["nina"],
    state: "open",
    latestMinutesAgo: 30 * 60,
    speakers: ["nina", "self", "nina", "self"],
    links: ["deal:ellisonPricing"],
  },
  {
    key: "kestrelPlanning",
    account: "linkedin",
    with: ["simon"],
    state: "open",
    latestMinutesAgo: 3000,
    speakers: ["simon", "self"],
    links: ["deal:kestrelOffsite", "organization:kestrel"],
  },
  {
    key: "greyfriarsCall",
    account: "google",
    with: ["paul"],
    state: "open",
    latestMinutesAgo: 4620,
    speakers: ["paul", "self", "paul"],
    links: ["deal:greyfriarsSuccession", "organization:greyfriars"],
  },
];

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

const AGENT_EDITS: Record<string, AgentKeyName> = {
  "deal:fairhavenReview": "Claude Desktop",
  "deal:kestrelInterim": "Claude Desktop",
  "deal:brightwaterScaling": "ChatGPT",
  "deal:rivertonExport": "ChatGPT",
  "deal:ellisonPricing": "Codex CLI",
};

export default defineSolution<Strings>({
  id: "consultants",
  strings: { en, de },
  story: {
    en: { currency: "GBP", timeZone: "Europe/London" },
    de: { currency: "EUR", timeZone: "Europe/Berlin" },
  },
  build: (t, locale) => {
    const phone = (index: number) => phoneNumber(t.phones.mobile, index);
    const open = ["introduction", "discovery", "scoping", "proposal", "decision"];
    const wonLastYear = [
      { field: "stage", in: ["won"] },
      { field: "decisionDate", withinDays: 365 },
    ];
    const label = <K extends string>(
      options: Record<K, string>,
      colors: Record<K, "default" | "secondary" | "destructive" | "success" | "warning" | "info">,
    ) => (Object.keys(options) as K[]).map((key) => ({ key, label: options[key], color: colors[key] }));
    const domain = (key: OrganizationKey) => t.organizations[key][2];

    const organization: RecordSpec[] = ORGANIZATIONS.map((key) => {
      const facts = ORGANIZATION_FACTS[key];
      const [name, city] = t.organizations[key];
      const [street, postalCode, region, lat, lon] = t.addresses[key];
      return {
        key,
        values: {
          name,
          industry: facts.industry,
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
          website: `https://${domain(key)}`,
          employees: facts.employees,
        },
        channels: { email: `office@${domain(key)}` },
        createdDaysAgo: facts.createdDaysAgo,
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
          role: facts.role,
          strength: facts.strength,
          lastMeeting: day(facts.lastMeeting),
        },
        links: { "contact.organizations": facts.organization },
        channels: {
          email: `${mailbox(firstName)}.${mailbox(lastName)}@${domain(facts.organization)}`,
          phone: phone(index),
          ...(facts.linkedin
            ? { linkedin: `${handle}.linkedin.example`, linkedinUrl: `https://linkedin.example/in/${handle}` }
            : {}),
        },
        createdDaysAgo: facts.createdDaysAgo,
      };
    });
    const agentNotes: Partial<Record<DealKey, readonly string[]>> = {
      brightwaterScaling: t.agentNotes.brightwater,
      ellisonPricing: t.agentNotes.ellison,
      kestrelInterim: t.agentNotes.kestrelInterim,
      rivertonExport: t.agentNotes.riverton,
    };
    const deal: RecordSpec[] = DEALS.map((key) => {
      const facts = DEAL_FACTS[key];
      const [name, nextStep] = t.deals[key];
      const story = key === "fairhavenReview";
      const notes = story ? [...t.fairhavenNotes, "", ...t.agentNotes.fairhaven] : agentNotes[key];
      return {
        key,
        values: {
          name,
          stage: facts.stage,
          referralSource: facts.source,
          dayRate: facts.rate,
          daysEstimated: facts.days,
          decisionDate: day(facts.decision),
          ...(facts.start === undefined ? {} : { start: day(facts.start) }),
          ...(facts.end === undefined ? {} : { end: day(facts.end) }),
          ...(facts.delivery ? { delivery: facts.delivery } : {}),
          nextStep,
          ...(facts.next === undefined ? {} : { nextStepDate: day(facts.next) }),
          ...(facts.lost ? { lostReason: facts.lost } : {}),
          ...(notes ? { notes } : {}),
        },
        links: { "deal.organizations": facts.organization, "deal.contacts": facts.contacts },
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

    const file = (
      key: keyof Strings["files"],
      record: DealKey,
      kind: FileSpec["kind"],
      uploadedDaysAgo: number,
    ): FileSpec => ({
      key,
      record: `deal:${record}`,
      field: "deal.documents",
      name: t.files[key].name,
      kind,
      lines: t.files[key].lines,
      uploadedDaysAgo,
    });

    const thread = (key: keyof Strings["threads"], senders: readonly string[], draftLast = false) =>
      senders.map((from, index) => ({
        from,
        text: t.threads[key].messages[index],
        ...(draftLast && index === senders.length - 1 ? { draft: true } : {}),
      }));

    return {
      workspaceName: t.workspaceName,
      valueLabels: { value: t.fields.dealValue, weighted: t.fields.weightedValue },
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
        { key: "organization.address", label: t.fields.address, type: "address" },
        { key: "organization.website", label: t.fields.website, type: "url" },
        { key: "organization.employees", label: t.fields.employees, type: "number" },
        { key: "contact.jobTitle", label: t.fields.jobTitle, type: "text" },
        {
          key: "contact.role",
          label: t.fields.role,
          type: "select",
          options: label(t.options.role, { sponsor: "success", dayToDay: "info", signsOff: "warning" }),
        },
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
        { key: "deal.dayRate", label: t.fields.dayRate, type: "currency" },
        { key: "deal.daysEstimated", label: t.fields.days, type: "number" },
        { key: "deal.decisionDate", label: t.fields.decisionDate, type: "date" },
        { key: "deal.start", label: t.fields.start, type: "date" },
        { key: "deal.end", label: t.fields.end, type: "date" },
        {
          key: "deal.duration",
          label: t.fields.duration,
          type: "number",
          formula: { kind: "daysBetween", from: "deal.start", to: "deal.end" },
        },
        {
          key: "deal.delivery",
          label: t.fields.delivery,
          type: "select",
          options: label(t.options.delivery, {
            notStarted: "secondary",
            inDelivery: "info",
            wrappingUp: "warning",
            completed: "success",
          }),
        },
        { key: "deal.nextStep", label: t.fields.nextStep, type: "text" },
        { key: "deal.nextStepDate", label: t.fields.nextStepDate, type: "date" },
        { key: "deal.documents", label: t.fields.documents, type: "file" },
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
      dealValue: { kind: "product", left: "deal.dayRate", right: "deal.daysEstimated" },
      records: agentEdited({ organization, contact, deal, task }, AGENT_EDITS),
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
          key: "active",
          list: "deal",
          name: t.views.active,
          mode: "board",
          groupBy: "delivery",
          columns: ["totalValue", "deal.organizations", "start", "end"],
          filters: [{ field: "stage", in: ["won"] }],
          sort: { field: "end", direction: "asc" },
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
          key: "relationships",
          list: "contact",
          name: t.views.relationships,
          mode: "table",
          columns: ["jobTitle", "contact.organizations", "role", "strength", "lastMeeting", "capability.identity"],
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
          key: "delivery",
          list: "deal",
          name: t.views.delivery,
          mode: "calendar",
          calendar: { date: "start", end: "end", color: "delivery", mode: "month" },
          columns: ["totalValue", "deal.organizations", "delivery"],
          filters: [{ field: "stage", notIn: ["lost"] }],
        },
      ],
      dashboard: {
        widgets: [
          {
            kind: "kpi",
            title: t.widgets.proposalsOut,
            list: "deal",
            aggregation: "sum",
            field: "totalValue",
            filters: [{ field: "stage", in: ["proposal", "decision"] }],
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
            title: t.widgets.daysInDelivery,
            list: "deal",
            aggregation: "sum",
            field: "daysEstimated",
            filters: [
              { field: "stage", in: ["won"] },
              { field: "delivery", in: ["notStarted", "inDelivery", "wrappingUp"] },
            ],
          },
          {
            kind: "kpi",
            title: t.widgets.quietContacts,
            list: "contact",
            aggregation: "count",
            filters: [{ field: "lastMeeting", olderThanDays: 60 }],
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
            title: t.widgets.nextSteps,
            list: "deal",
            layout: "upcoming",
            date: "nextStepDate",
            days: 14,
            amount: "totalValue",
            filters: [{ field: "stage", in: open }],
          },
          {
            kind: "chart",
            title: t.widgets.byDelivery,
            display: DisplayType.doughnutChart,
            list: "deal",
            aggregation: "count",
            groupBy: { field: "delivery" },
            filters: [{ field: "stage", in: ["won"] }],
          },
          {
            kind: "chart",
            title: t.widgets.wonByMonth,
            display: DisplayType.areaChart,
            list: "deal",
            aggregation: "sum",
            field: "totalValue",
            groupBy: { month: "decisionDate" },
            filters: wonLastYear,
          },
          {
            kind: "calendar",
            title: t.widgets.meetingsMonth,
            list: "contact",
            layout: "month",
            date: "lastMeeting",
          },
          {
            kind: "chart",
            title: t.widgets.topClients,
            display: DisplayType.rankedTable,
            list: "deal",
            aggregation: "sum",
            field: "totalValue",
            groupBy: { relation: "deal.organizations" },
            filters: [{ field: "stage", in: ["won"] }],
          },
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
        { key: "rates", kind: "knowledge", title: t.wiki.rates.title, markdown: t.wiki.rates.markdown },
        agentsPage(locale, t.agents),
      ],
      apiKeys: agentApiKeys([74, 36, 11]),
      messaging: {
        accounts: ["google", "outlook", "linkedin"],
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
            account: "linkedin",
            with: ["martin"],
            state: "open",
            latestMinutesAgo: 5 * 60,
            messages: thread("martinLinkedin", ["martin", "self", "martin"]),
            links: ["deal:fairhavenReview"],
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
          ...inboxThreads(INBOX_PLANS, t.inbox),
        ],
        calendar: {
          name: t.calendar.name,
          events: [
            {
              title: t.calendar.events[0],
              with: ["martin", "rachel"],
              startsMinutesAgo: -22 * 60,
              durationMinutes: 60,
            },
            {
              title: t.calendar.events[1],
              with: ["alan", "nina"],
              startsMinutesAgo: -3 * 24 * 60,
              durationMinutes: 60,
            },
            { title: t.calendar.events[2], with: ["laura"], startsMinutesAgo: -26 * 60, durationMinutes: 30 },
            {
              title: t.calendar.events[3],
              with: ["tom", "claire"],
              startsMinutesAgo: -5 * 24 * 60,
              durationMinutes: 45,
            },
            { title: t.calendar.events[4], with: ["diane"], startsMinutesAgo: -8 * 24 * 60, durationMinutes: 60 },
            { title: t.calendar.events[5], with: ["simon"], startsMinutesAgo: 2 * 24 * 60, durationMinutes: 90 },
          ],
        },
      },
      routines: [
        {
          key: "briefs",
          name: t.routines.briefs.name,
          task: t.routines.briefs.task,
          trigger: { kind: "schedule", cron: "30 7 * * 1-5" },
          runs: [
            {
              status: "succeeded",
              startedHoursAgo: 3,
              durationSeconds: 84,
              credits: 14,
              summary: t.routines.briefs.runs[0],
            },
            {
              status: "failed",
              startedHoursAgo: 27,
              durationSeconds: 9,
              credits: 1,
              error: "providerUnavailable",
              note: t.routines.briefs.note,
            },
            {
              status: "succeeded",
              startedHoursAgo: 51,
              durationSeconds: 66,
              credits: 11,
              summary: t.routines.briefs.runs[1],
            },
          ],
        },
        {
          key: "revisit",
          name: t.routines.revisit.name,
          task: t.routines.revisit.task,
          trigger: { kind: "schedule", cron: "0 8 * * 1" },
          runs: [
            {
              status: "succeeded",
              startedHoursAgo: 75,
              durationSeconds: 58,
              credits: 9,
              summary: t.routines.revisit.runs[0],
            },
            {
              status: "succeeded",
              startedHoursAgo: 243,
              durationSeconds: 47,
              credits: 8,
              summary: t.routines.revisit.runs[1],
            },
          ],
        },
        {
          key: "followUps",
          name: t.routines.followUps.name,
          task: t.routines.followUps.task,
          trigger: { kind: "schedule", cron: "0 8 * * 1-5" },
          runs: [
            {
              status: "succeeded",
              startedHoursAgo: 1,
              durationSeconds: 77,
              credits: 12,
              summary: t.routines.followUps.runs[0],
            },
            {
              status: "succeeded",
              startedHoursAgo: 125,
              durationSeconds: 64,
              credits: 10,
              summary: t.routines.followUps.runs[1],
            },
            {
              status: "succeeded",
              startedHoursAgo: 173,
              durationSeconds: 69,
              credits: 11,
              summary: t.routines.followUps.runs[2],
            },
          ],
        },
        {
          key: "taskFromEmail",
          name: t.routines.taskFromEmail.name,
          task: t.routines.taskFromEmail.task,
          trigger: {
            kind: "event",
            events: ["messaging.email.received"],
            debounceSeconds: 300,
            sample: { thread: 15 },
          },
          runs: [
            {
              status: "succeeded",
              startedHoursAgo: 29,
              durationSeconds: 38,
              credits: 6,
              summary: t.routines.taskFromEmail.runs[0],
            },
            {
              status: "succeeded",
              startedHoursAgo: 76,
              durationSeconds: 31,
              credits: 5,
              summary: t.routines.taskFromEmail.runs[1],
            },
          ],
        },
      ],
      files: [
        file("proposal", "fairhavenReview", "pdf", 7),
        file("discovery", "fairhavenReview", "md", 30),
        file("summary", "fairhavenReview", "pdf", 2),
        file("sow", "fairhavenReview", "docx", 1),
        file("northwold", "northwoldReview", "pdf", 6),
        file("agenda", "brightwaterWorkshop", "docx", 4),
        file("steering", "kestrelInterim", "md", 12),
      ],
      planner: {
        sources: [
          { list: "deal", date: "start", end: "end", filters: [{ field: "stage", notIn: ["lost"] }], color: "info" },
          { list: "deal", date: "nextStepDate", filters: [{ field: "stage", in: open }], color: "warning" },
        ],
        connectedCalendar: true,
        mode: "timeline",
        feed: "iPhone",
      },
      trash: [
        { list: "contact", name: t.trash.contact, daysAgo: 5 },
        { list: "deal", name: t.trash.deal, daysAgo: 16 },
      ],
      mateChats: [
        {
          title: t.mate.title,
          endedHoursAgo: 1,
          messages: [
            { role: "user", text: t.mate.question },
            { role: "assistant", text: t.mate.answer },
          ],
        },
        {
          title: t.mateReferences.title,
          endedHoursAgo: 100,
          messages: [
            { role: "user", text: t.mateReferences.question },
            { role: "assistant", text: t.mateReferences.answer },
          ],
        },
      ],
    };
  },
});
