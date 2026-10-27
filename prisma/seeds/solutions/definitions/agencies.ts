import { DisplayType } from "@/features/widget/widget-display.schema";

import {
  address,
  at,
  day,
  defineSolution,
  photo,
  range,
  type FileSpec,
  type RecordSpec,
  phoneNumber,
} from "../define-solution";

/**
 * Agencies: a brand and content agency team wins pitches, turns them into projects and retainers, and sees the monthly
 * retainer revenue per client. Every pitch moves across the board from the first inquiry through briefing, pitch
 * preparation, proposal and negotiation to a decision; won work continues as a project (status, budget, hours) or a
 * retainer (monthly fee, term, renewal date; no billing). Emails around a pitch belong to the pitch or client only when
 * someone links them, and a follow-up after a presentation waits as a draft.
 */

const ORGANIZATIONS = [
  "harlow",
  "bramble",
  "meridian",
  "quarry",
  "tidewell",
  "orchard",
  "copperleaf",
  "lumen",
  "wexford",
  "northshore",
  "pinewood",
  "greenmile",
] as const;
type OrganizationKey = (typeof ORGANIZATIONS)[number];
const CONTACTS = [
  "rachel",
  "tom",
  "nina",
  "laura",
  "greg",
  "jake",
  "diane",
  "kevin",
  "samantha",
  "michael",
  "erin",
  "priya",
  "jordan",
  "paul",
  "claire",
  "melissa",
  "ben",
  "alex",
] as const;
type ContactKey = (typeof CONTACTS)[number];
const DEALS = [
  "meridianBrand",
  "tidewellIdentity",
  "copperleafContent",
  "lumenLaunch",
  "orchardWebsite",
  "pinewoodReport",
  "harlowSpring",
  "brambleShop",
  "quarryLabels",
  "greenmileBrand",
  "harlowContent",
  "brambleSocial",
  "northshoreExhibition",
  "harlowAutumn",
  "quarryWebsite",
  "greenmileOpening",
  "copperleafEvents",
  "meridianCampaign",
  "lumenDeck",
  "brambleCatering",
] as const;
type DealKey = (typeof DEALS)[number];
const PROJECTS = [
  "greenmileRollout",
  "brambleCateringPrint",
  "greenmileOpeningCampaign",
  "harlowAutumnContent",
  "quarryWebsiteBuild",
  "brambleShopPhotos",
] as const;
type ProjectKey = (typeof PROJECTS)[number];
const RETAINERS = [
  "harlowRetainer",
  "brambleRetainer",
  "greenmileRetainer",
  "quarryRetainer",
  "wexfordRetainer",
] as const;
type RetainerKey = (typeof RETAINERS)[number];
const TASKS = [
  "tidewellDeck",
  "tidewellRehearsal",
  "meridianFollowUp",
  "copperleafScope",
  "lumenQuestions",
  "orchardCall",
  "pinewoodReply",
  "harlowShoot",
  "brambleSamples",
  "quarryReview",
  "greenmileKickoff",
  "northshoreDebrief",
] as const;
type TaskKey = (typeof TASKS)[number];

const en = {
  countryCode: "us",
  company: "Fernhill Creative",
  workspaceName: "Agencies",
  website: "https://fernhill-creative.example",
  phones: { office: { templates: ["+1 312 555 01##", "+1 773 555 01##", "+1 847 555 01##"], start: 40 } },
  selfTitle: "Founder and managing director",
  lists: {
    organization: ["Client", "Clients", "Brands we work for or are pitching to, with their monthly retainer fees."],
    contact: ["Contact", "Contacts", "Marketing leads, founders and decision makers at clients and prospects."],
    deal: ["Pitch", "Pitches", "New business from the first conversation to the client's decision."],
    project: ["Project", "Projects", "Won work in delivery: status, budget, hours and deadline."],
    retainer: [
      "Retainer",
      "Retainers",
      "Ongoing monthly engagements with clients and their renewal dates, kept as records. Billing happens in the accounting tool.",
    ],
    task: ["Task", "Tasks", "Next actions with an owner and a due date."],
  },
  fields: {
    industry: "Industry",
    relationship: "Relationship",
    address: "Address",
    website: "Website",
    employees: "Employees",
    jobTitle: "Job title",
    decisionRole: "Decision role",
    source: "Source",
    services: "Services in scope",
    competitors: "Agencies in the pitch",
    pitchDate: "Pitch presentation",
    documents: "Documents",
    signedAgreement: "Signed agreement",
    productionWindow: "Production window",
    closeDate: "Decision expected",
    nextStep: "Next step",
    nextStepDate: "Next step date",
    lostReason: "Lost reason",
    retainerMrr: "Retainer MRR",
    monthlyFee: "Monthly fee",
    termMonths: "Term (months)",
    contractValue: "Contract value",
    startDate: "Start date",
    renewalDate: "Renewal date",
    scope: "Scope",
    retainerStatus: "Status",
    projectStatus: "Status",
    budget: "Budget",
    hoursBudget: "Hours budget",
    hoursUsed: "Hours used",
    hoursLeft: "Hours left",
    deadline: "Deadline",
    dueDate: "Due date",
    priority: "Priority",
  },
  options: {
    industry: {
      retail: "Retail and consumer goods",
      food: "Food and drink",
      health: "Healthcare",
      hospitality: "Hospitality",
      technology: "Technology",
      finance: "Insurance and finance",
      culture: "Culture",
      education: "Education",
      manufacturing: "Manufacturing",
    },
    relationship: { prospect: "Prospect", client: "Client", former: "Former client" },
    decisionRole: { decisionMaker: "Decision maker", influencer: "Marketing lead", buyer: "Procurement" },
    source: {
      referral: "Referral",
      existing: "Existing client",
      inbound: "Website inquiry",
      invitation: "Pitch invitation",
      event: "Industry event",
    },
    services: {
      strategy: "Brand strategy",
      identity: "Visual identity",
      website: "Website",
      content: "Content production",
      packaging: "Packaging",
      social: "Social media",
      print: "Print and reports",
    },
    lostReason: {
      budget: "Budget",
      otherAgency: "Chose another agency",
      postponed: "Project postponed",
      fit: "Not the right fit",
    },
    retainerStatus: { active: "Active", renewalDue: "Renewal due", paused: "Paused", ended: "Ended" },
    projectStatus: {
      kickoff: "Kickoff",
      inProduction: "In production",
      review: "Client review",
      delivered: "Delivered",
    },
    priority: { low: "Low", medium: "Medium", high: "High" },
  },
  stages: {
    inquiry: "Inquiry",
    briefing: "Briefing",
    pitchPreparation: "Pitch preparation",
    proposal: "Proposal sent",
    negotiation: "Negotiation",
    won: "Won",
    lost: "Lost",
  },
  organizations: {
    harlow: ["Harlow Outdoor Co.", "Chicago", "harlow-outdoor.example"],
    bramble: ["Bramble & Rye Bakery", "Evanston", "brambleandrye.example"],
    meridian: ["Meridian Health Clinics", "Chicago", "meridian-clinics.example"],
    quarry: ["Quarry Lane Brewing", "Milwaukee", "quarrylane-brewing.example"],
    tidewell: ["Tidewell Insurance", "Chicago", "tidewell-insurance.example"],
    orchard: ["Orchard Street Dental", "Oak Park", "orchardstreet-dental.example"],
    copperleaf: ["Copperleaf Hotels", "Chicago", "copperleaf-hotels.example"],
    lumen: ["Lumen Robotics", "Naperville", "lumen-robotics.example"],
    wexford: ["Wexford Furniture", "Grand Rapids", "wexford-furniture.example"],
    northshore: ["Northshore Art Museum", "Chicago", "northshore-museum.example"],
    pinewood: ["Pinewood Schools Foundation", "Evanston", "pinewood-foundation.example"],
    greenmile: ["Green Mile Cycles", "Chicago", "greenmile-cycles.example"],
  } satisfies Record<OrganizationKey, readonly [string, string, string]>,
  addresses: {
    harlow: ["1550 W Carroll Ave", "60607", "IL", 41.87561, -87.66417],
    bramble: ["912 Davis St", "60201", "IL", 42.05176, -87.69263],
    meridian: ["2240 N Clark St", "60614", "IL", 41.92228, -87.64897],
    quarry: ["2120 S 1st St", "53207", "WI", 42.97543, -87.89912],
    tidewell: ["200 W Monroe St", "60606", "IL", 41.88232, -87.63736],
    orchard: ["1018 Lake St", "60301", "IL", 41.88834, -87.79952],
    copperleaf: ["540 N Michigan Ave", "60611", "IL", 41.89451, -87.62218],
    lumen: ["1755 Park St", "60563", "IL", 41.79855, -88.16947],
    wexford: ["1001 Monroe Ave NW", "49503", "MI", 42.96513, -85.67306],
    northshore: ["3300 N Lake Shore Dr", "60657", "IL", 41.93977, -87.64425],
    pinewood: ["1800 Sherman Ave", "60201", "IL", 42.05176, -87.69263],
    greenmile: ["2453 N Milwaukee Ave", "60647", "IL", 41.92076, -87.70135],
  } satisfies Record<OrganizationKey, readonly [string, string, string, number, number]>,
  contacts: {
    rachel: ["Rachel", "Donovan", "Marketing director"],
    tom: ["Tom", "Whitaker", "Brand manager"],
    nina: ["Nina", "Patel", "Owner"],
    laura: ["Laura", "Kim", "Head of communications"],
    greg: ["Greg", "Holt", "Chief executive"],
    jake: ["Jake", "Morrison", "Co-founder"],
    diane: ["Diane", "Foster", "Marketing director"],
    kevin: ["Kevin", "Lowe", "Procurement manager"],
    samantha: ["Samantha", "Reyes", "Practice owner"],
    michael: ["Michael", "Sutton", "Commercial director"],
    erin: ["Erin", "Doyle", "Brand manager"],
    priya: ["Priya", "Raman", "Co-founder and CEO"],
    jordan: ["Jordan", "Pike", "Head of marketing"],
    paul: ["Paul", "Hendricks", "Managing director"],
    claire: ["Claire", "Benson", "Director of marketing"],
    melissa: ["Melissa", "Cho", "Executive director"],
    ben: ["Ben", "Carlisle", "Founder"],
    alex: ["Alex", "Romero", "Marketing lead"],
  } satisfies Record<ContactKey, readonly [string, string, string]>,
  deals: {
    meridianBrand: [
      "Meridian Health – brand refresh for six clinics",
      "Answer Laura's questions on the rollout phases",
    ],
    tidewellIdentity: ["Tidewell Insurance – brand identity and website", "Present the pitch to Diane and the board"],
    copperleafContent: [
      "Copperleaf Hotels – monthly content and social",
      "Agree on the notice period and the monthly fee",
    ],
    lumenLaunch: ["Lumen Robotics – launch positioning and website", "Send Priya the follow-up questions"],
    orchardWebsite: ["Orchard Street Dental – new website", "Intro call with Samantha"],
    pinewoodReport: ["Pinewood Foundation – annual report design", "Confirm the timeline with Melissa"],
    harlowSpring: ["Harlow Outdoor – spring collection launch content", "Send the follow-up after the presentation"],
    brambleShop: ["Bramble & Rye – packaging for the second shop", "Show Nina the packaging samples"],
    quarryLabels: ["Quarry Lane – seasonal beer labels", "Settle the number of label designs"],
    greenmileBrand: ["Green Mile Cycles – brand and social media", "Retainer started"],
    harlowContent: ["Harlow Outdoor – content retainer", "Retainer started"],
    brambleSocial: ["Bramble & Rye – social media retainer", "Retainer started"],
    northshoreExhibition: ["Northshore Art Museum – exhibition identity", "Feedback call done"],
    harlowAutumn: ["Harlow Outdoor – autumn campaign content", "Campaign delivered"],
    quarryWebsite: ["Quarry Lane – new website", "Website live"],
    greenmileOpening: ["Green Mile Cycles – shop opening campaign", "Campaign delivered"],
    copperleafEvents: ["Copperleaf Hotels – events brochure", "Call Erin about the print run"],
    meridianCampaign: ["Meridian Health – patient campaign", "Closed lost"],
    lumenDeck: ["Lumen Robotics – investor deck design", "Closed lost"],
    brambleCatering: ["Bramble & Rye – catering menu and flyers", "Delivered"],
  } satisfies Record<DealKey, readonly [string, string]>,
  retainers: {
    harlowRetainer: [
      "Harlow Outdoor – content retainer",
      "Product photography, two shoots per quarter, monthly social content for Instagram and the newsletter.",
    ],
    brambleRetainer: [
      "Bramble & Rye – social media",
      "Three posts a week, seasonal menu boards, one shop photo session per quarter.",
    ],
    greenmileRetainer: [
      "Green Mile Cycles – brand and social",
      "Brand guardian role, social content for the new shop, event graphics for group rides.",
    ],
    quarryRetainer: [
      "Quarry Lane – brand support",
      "Label updates and taproom graphics. Paused over winter at the client's request.",
    ],
    wexfordRetainer: [
      "Wexford Furniture – brand support",
      "Catalogue layout and showroom graphics. Ended after the client moved design in-house.",
    ],
  } satisfies Record<RetainerKey, readonly [string, string]>,
  projects: {
    greenmileRollout: "Green Mile Cycles – brand rollout",
    brambleCateringPrint: "Bramble & Rye – catering menu and flyers",
    greenmileOpeningCampaign: "Green Mile Cycles – shop opening campaign",
    harlowAutumnContent: "Harlow Outdoor – autumn campaign content",
    quarryWebsiteBuild: "Quarry Lane – website build",
    brambleShopPhotos: "Bramble & Rye – shop photo session",
  } satisfies Record<ProjectKey, string>,
  tasks: {
    tidewellDeck: "Finish the pitch deck for Tidewell",
    tidewellRehearsal: "Rehearse the Tidewell presentation with the team",
    meridianFollowUp: "Follow up with Laura on the Meridian proposal",
    copperleafScope: "Send Copperleaf the revised scope and monthly fee",
    lumenQuestions: "Send Priya the follow-up questions on positioning",
    orchardCall: "Intro call with Samantha at Orchard Street Dental",
    pinewoodReply: "Reply to Pinewood about the annual report timeline",
    harlowShoot: "Price the spring content shoot for Harlow",
    brambleSamples: "Order packaging samples for Bramble & Rye",
    quarryReview: "Prepare the Quarry Lane retainer review",
    greenmileKickoff: "Kick-off meeting with Green Mile Cycles",
    northshoreDebrief: "Ask Northshore for feedback on the lost pitch",
  } satisfies Record<TaskKey, string>,
  views: {
    pitchBoard: "Pitch board",
    projects: "Projects by status",
    retainers: "Retainers by renewal",
    nextSteps: "Next steps",
    clients: "Clients",
    allContacts: "All contacts",
    dueSoon: "Due soon",
    production: "Production calendar",
  },
  widgets: {
    retainerMrr: "Retainer MRR",
    openPitches: "Open pitch value",
    won: "Won in the last 12 months",
    hoursLeft: "Hours left on running projects",
    byStage: "Open pitch value by stage",
    projectsByStatus: "Projects by status",
    presentations: "Pitch presentations, next 14 days",
    wonByMonth: "Won value by month",
    mrrByClient: "Retainer MRR by client",
    nextStepsMonth: "Next steps this month",
  },
  members: {
    colleagueA: ["Hannah", "Price", "hannah.price@fernhill-creative.example"],
    colleagueB: ["Daniel", "Ortiz", "daniel.ortiz@fernhill-creative.example"],
  },
  routines: {
    renewal: {
      name: "Retainer renewal check",
      task: "Every Monday, read the Retainers list with its configured Status, Monthly fee, Term, Renewal date, Scope and client relationship. Find retainers whose Status is Active and whose Renewal date lies within the next 60 days. For each one, set Status to Renewal due and create one ordinary task \"Prepare the renewal: <retainer name>\" for the retainer's owner, due 30 days before the Renewal date or today if that date has passed, Medium priority, linked to the retainer's client, with the monthly fee, term and scope in notes. Skip a retainer that already has such an open task. Do not change fees, terms or any other record, and never message the client. Report the retainers and tasks.",
      runs: [
        "Set Bramble & Rye – social media to Renewal due and created 1 renewal task for Hannah Price.",
        "No active retainer renews within the next 60 days without a task.",
        "I could not reach the model provider on this attempt, so I stopped before reading or changing anything. The next scheduled run will pick this up.",
      ],
    },
    followUp: {
      name: "Pitch follow-up draft",
      task: "A pitch changed. Read the pitch in routine_trigger with its configured Stage, client, contacts, presentation date and notes. Continue only when the Stage is Proposal sent. Find the latest email thread with the pitch's contacts using the messaging tools. If that thread has no reply draft yet, save one concise follow-up draft with save_message_draft that thanks the contact for the presentation, sums up the proposal and names the next step. The draft is for human review; never send it. Do not change the pitch or create records. Report the thread and whether a draft was saved.",
      runs: [
        "The pitch moved to Negotiation, not Proposal sent; nothing to do.",
        "Saved a follow-up draft to Laura Kim on the Meridian proposal thread for review.",
      ],
    },
  },
  wiki: {
    guide: {
      title: "Operating Guide",
      markdown: [
        "Fernhill Creative is a brand and content agency of twelve people in Chicago. We work for consumer brands, hospitality and healthcare clients. This workspace is demo data; every company and person in it is fictional.",
        "",
        "## How we use the CRM",
        "- **Pitches** are our new business. The pitch board shows every pitch by stage, from the first inquiry to the decision. The value is our estimate of the first year's fees, entered by hand; the weighted value is that estimate times the stage probability.",
        "- **Clients** are the brands we work for or pitch to; Retainer MRR on a client adds up the monthly fees of its retainers. **Contacts** are the people there.",
        "- **Projects** are won work in delivery: status, budget, hours budget and hours used. Hours left is calculated from the two.",
        "- **Retainers** are ordinary records we keep for ongoing client work: monthly fee, term, start and renewal date, scope and status. Contract value is the monthly fee times the term. They do not create invoices or recurring billing; billing stays in our accounting tool.",
        "- **Tasks** and the next step date on a pitch are ordinary fields. Nobody gets an automatic reminder, so check the Next steps and Due soon views every morning.",
        "- An email belongs to a pitch or a client only when someone links it there. Link every thread about a pitch to that pitch.",
        "",
        "## Working rules",
        "- Every open pitch has a next step and a next step date.",
        "- When a pitch is won, set it to Won and create the project or the retainer, linked to the client and the pitch.",
        "- Every pitch, project and retainer has an owner: Max, Hannah (account director) or Daniel (creative director).",
        "- When a pitch is lost, record the reason and ask for feedback.",
        "- Time tracking and billing stay in their own tools; hours used on a project are updated by hand every Friday.",
        "- Briefs and proposals are files in the pitch's Documents field, signed agreements sit on the retainer; search and Mate find them by their text.",
      ],
    },
    process: {
      title: "Pitch process",
      markdown: [
        "Every pitch moves through the same stages on the pitch board. This page explains what each stage means for us.",
        "",
        "## Stages",
        "1. **Inquiry:** someone asks about working with us. Add the client and the person who asked.",
        "2. **Briefing:** we have the brief or a briefing call, know the budget range, the deadline and who decides.",
        "3. **Pitch preparation:** the team works on the idea and the deck. Enter the date and time of the presentation and the number of agencies in the pitch; attach the brief to Documents.",
        "4. **Proposal sent:** the presentation is done and the written proposal with scope and fees is with the client.",
        "5. **Negotiation:** scope, fee and terms are being agreed.",
        "6. **Won or Lost:** record the outcome. Won pitches become a project with a production window from kickoff to delivery (see the Production calendar); ongoing work also gets a retainer record.",
      ],
    },
    afterPitch: {
      title: "After a pitch presentation",
      whenToUse: "When we presented a pitch to a client or prospect and the follow-up email is due.",
      markdown: [
        "The day after a presentation decides how the client remembers it. Follow these steps for every pitch we present.",
        "",
        "## Steps",
        "1. Write a short thank-you email that sums up the two or three points the client reacted to most.",
        "2. Answer open questions from the meeting or name the date when you will.",
        "3. Link the email thread to the pitch and the client.",
        "4. Move the pitch to Proposal sent once the proposal is out, and set the next step and its date.",
        "5. Create a task for every promise you made in the room.",
      ],
    },
    renewal: {
      title: "Retainer renewal checklist",
      whenToUse: "When a retainer shows Renewal due or its renewal date is less than 60 days away.",
      markdown: [
        "A renewal is decided long before the renewal date. We start 60 days ahead, so the client hears from us before they start to wonder.",
        "",
        "## Steps",
        "1. Open the retainer from the view Retainers by renewal and check the scope against what we actually delivered in the last months.",
        "2. Look at the client's projects: hours used against hours budget show whether the scope still fits.",
        "3. Agree internally on the proposal: same scope, more or less work, and the monthly fee and term.",
        "4. Book a renewal call with the client's decision maker and link the email thread to the client.",
        "5. After the call, update the monthly fee, term and renewal date, and set the status back to Active, or to Ended with a note on why.",
      ],
    },
  },
  threads: {
    tidewellBrief: {
      subject: "Tidewell brand pitch – presentation date and questions",
      messages: [
        "Hi Max,\n\nThanks for confirming your participation. We have invited three agencies. The presentations take place next week; you have 60 minutes including questions.\n\nPlease send any questions about the brief by Friday.\n\nBest regards,\nDiane Foster",
        "Hi Diane,\n\nThank you, next week works for us. Two questions: is the website relaunch part of the same budget, and will your board members join the presentation?\n\nBest,\nMax",
        "Good questions. The website is part of the budget, the split is up to you. Our CEO and Kevin from procurement will join.",
      ],
    },
    meridianProposal: {
      subject: "Meridian brand refresh – proposal",
      messages: [
        "Hi Laura,\n\nAs promised, here is our proposal for the brand refresh of all six clinics, including the signage rollout in two phases.\n\nBest,\nMax",
        "Hi Max,\n\nThanks, the team liked it a lot. Greg asked whether we could start with the three downtown clinics and do the rest next year. Would that change the fee?\n\nLaura",
      ],
    },
    copperleafTerms: {
      name: "Copperleaf content retainer",
      subject: "Copperleaf content retainer – terms",
      messages: [
        "Hi Max, we are happy with the scope. Could we agree on a three-month notice period instead of six?",
        "Hi Michael, three months works if we fix the scope for the first two quarters. I will send the revised terms on Thursday.",
        "Sounds fair. I would like the first shoot before the holiday season, so the sooner we sign, the better.",
      ],
    },
    harlowFollowUp: {
      subject: "Spring collection presentation",
      messages: [
        "Hi Rachel,\n\nLooking forward to presenting our ideas for the spring collection on Tuesday at 10.\n\nBest,\nMax",
        "Great, see you then. Tom will join as well.",
        "Hi Rachel, hi Tom,\n\nThank you for your time yesterday. Three things we took away: you liked the trail portraits most, the launch should start with the newsletter, and the shoot needs to happen before the end of February.\n\nI will send the written proposal with the shoot days and fees by Friday.\n\nBest,\nMax",
      ],
    },
    orchardInquiry: {
      subject: "New website for our practice",
      messages: [
        "Hello,\n\nWe are a dental practice in Oak Park and our website is ten years old. A friend at Bramble & Rye recommended you. Do you take on smaller projects like ours?\n\nKind regards,\nSamantha Reyes",
        "Hi Samantha,\n\nThank you for thinking of us. Yes, we do. Would a 30-minute call next week work to talk about what the new site needs to do?\n\nBest,\nMax",
      ],
    },
    greenmileKickoff: {
      subject: "Kick-off and first month",
      messages: [
        "Hi Max, thanks for a great kick-off. Alex will be your contact for the day-to-day social posts.",
        "Thanks, Ben. We will send the first month's content plan to Alex on Monday.",
      ],
    },
  },
  files: {
    tidewellBrief: {
      name: "Tidewell – client brief.pdf",
      lines: [
        "# Tidewell Insurance – agency brief",
        "Brand identity and website. Issued by Diane Foster, Marketing director, to three invited agencies.",
        "## Background",
        "Tidewell sells home and small-business insurance in the Midwest. Customers trust us after a claim, but our brand looks like every other insurer before it.",
        "## What we ask for",
        "A new visual identity, a tone of voice that sounds calm and plain in every letter and claim email, and a new website.",
        "## Budget and timing",
        "| Item | Detail |",
        "| Budget range | $80,000–$90,000 in the first year, website included |",
        "| Presentation | 60 minutes including questions |",
        "| Launch | Before the spring renewal season |",
        "## Who decides",
        "The CEO decides with Diane Foster; Kevin Lowe from procurement checks the terms.",
      ],
    },
    tidewellProposal: {
      name: "Tidewell – pitch proposal.pdf",
      lines: [
        "# Fernhill Creative – proposal for Tidewell Insurance",
        "## Our idea",
        "Insurance that talks like a neighbor: a tone of voice built from real claim conversations, carried into the identity and the website.",
        "## Scope and fees",
        "| Phase | Work | Fee |",
        "| 1 | Brand strategy and tone of voice | $18,000 |",
        "| 2 | Visual identity and guidelines | $32,000 |",
        "| 3 | Website design and build | $35,000 |",
        "| Total | First year | $85,000 |",
        "## Timeline",
        "Twelve weeks from kickoff to the new website, with the tone of voice ready for the claim letters after four weeks.",
      ],
    },
    meridianProposal: {
      name: "Meridian – brand refresh proposal.pdf",
      lines: [
        "# Proposal – Meridian Health brand refresh",
        "Six clinics, one brand. Prepared for Laura Kim and Greg Holt.",
        "## Scope",
        "| Phase | Work | Fee |",
        "| 1 | Brand strategy, tone of voice and identity | $26,000 |",
        "| 2 | Signage for the three downtown clinics | $11,000 |",
        "| 3 | Signage for the other three clinics | $11,000 |",
        "| Total | | $48,000 |",
        "Phase 3 can move to next year without changing the fees of phases 1 and 2.",
      ],
    },
    harlowBrief: {
      name: "Spring collection brief.docx",
      lines: [
        "# Harlow Outdoor – spring collection brief",
        "## Goal",
        "Launch the spring trail collection with the newsletter first, then Instagram.",
        "## Content",
        "Trail portraits of real customers, product details, a short film for the shop page.",
        "## Tone of voice",
        "Warm and outdoorsy, never technical; the product speaks through the people wearing it.",
        "## Timing",
        "Shoot before the end of February; budget about $22,000.",
      ],
    },
    harlowAgreement: {
      name: "Retainer agreement – Harlow Outdoor.pdf",
      lines: [
        "# Retainer agreement – Harlow Outdoor Co.",
        "Between Harlow Outdoor Co. and Fernhill Creative.",
        "## Scope",
        "Product photography with two shoots per quarter, monthly social content for Instagram and the newsletter, in Harlow's tone of voice.",
        "## Fee and term",
        "| Monthly fee | Term | Notice |",
        "| $4,500 | 12 months | 60 days before renewal |",
        "Signed by Rachel Donovan and Max for Fernhill Creative.",
      ],
    },
    brambleAgreement: {
      name: "Retainer agreement – Bramble & Rye.pdf",
      lines: [
        "# Retainer agreement – Bramble & Rye Bakery",
        "## Scope",
        "Three posts a week, seasonal menu boards and one shop photo session per quarter, following the bakery's tone of voice guide.",
        "## Fee and term",
        "| Monthly fee | Term | Notice |",
        "| $1,500 | 12 months | 60 days before renewal |",
        "Signed by Nina Patel and Max for Fernhill Creative.",
      ],
    },
    greenmileAgreement: {
      name: "Retainer agreement – Green Mile Cycles.pdf",
      lines: [
        "# Retainer agreement – Green Mile Cycles",
        "## Scope",
        "Brand guardian role including the tone of voice, social content for the new shop and event graphics for group rides.",
        "## Fee and term",
        "| Monthly fee | Term | Notice |",
        "| $2,500 | 12 months | 60 days before renewal |",
        "Signed by Ben Carlisle and Max for Fernhill Creative.",
      ],
    },
  },
  trash: { contact: "Laura Kim", deal: "Lumen Robotics – trade show booth" },
  mate: {
    title: "Tidewell brief and open questions",
    question: "Summarize the Tidewell brief and list open questions for Thursday's presentation.",
    answer:
      '**Tidewell brief (Tidewell – client brief.pdf, on the pitch Tidewell Insurance – brand identity and website):**\n- Tidewell sells home and small-business insurance in the Midwest. Customers trust them after a claim, but the brand looks like every other insurer.\n- They ask for a new visual identity, a tone of voice that sounds calm and plain in letters and claim emails, and a new website.\n- Budget range: $80,000–$90,000 in the first year, website included. Our proposal is $85,000, the value on the pitch.\n- 60 minutes including questions; three agencies are invited. Launch before the spring renewal season.\n- Diane Foster\'s email adds that the CEO and Kevin Lowe from procurement join the presentation.\n\n**Open questions for Thursday:**\n1. Which claim letters and emails should the new tone of voice cover first?\n2. Does the website have to launch together with the identity, or can it follow after the twelve weeks?\n3. Which payment and contract terms will Kevin Lowe expect?\n4. Who signs off the tone of voice: Diane Foster or the CEO?\n\nThe tasks "Finish the pitch deck for Tidewell" and "Rehearse the Tidewell presentation with the team" are still open.',
  },
  calendar: {
    name: "Pitch dates",
    events: [
      "Tidewell pitch presentation",
      "Call with Meridian about the rollout",
      "Copperleaf terms call",
      "Quarry Lane retainer review",
    ],
  },
};

type Strings = typeof en;

const de: Strings = {
  countryCode: "de",
  company: "Kranich Kommunikation",
  workspaceName: "Agenturen",
  website: "https://kranich-kommunikation.example",
  phones: { office: { templates: ["+49 30 23125 4##"], start: 0 } },
  selfTitle: "Gründer und Geschäftsführer",
  lists: {
    organization: [
      "Kunde",
      "Kunden",
      "Marken, für die wir arbeiten oder pitchen, mit ihren monatlichen Retainer-Honoraren.",
    ],
    contact: ["Kontakt", "Kontakte", "Marketingverantwortliche, Gründer und Entscheider bei Kunden und Interessenten."],
    deal: ["Pitch", "Pitches", "Neugeschäft vom ersten Gespräch bis zur Entscheidung des Kunden."],
    project: ["Projekt", "Projekte", "Gewonnene Arbeit in der Umsetzung: Status, Budget, Stunden und Abgabetermin."],
    retainer: [
      "Retainer",
      "Retainer",
      "Laufende monatliche Betreuung von Kunden mit Verlängerungstermin, als Datensätze geführt. Abgerechnet wird in der Buchhaltung.",
    ],
    task: ["Aufgabe", "Aufgaben", "Nächste Schritte mit Verantwortlichen und Fälligkeitsdatum."],
  },
  fields: {
    industry: "Branche",
    relationship: "Beziehung",
    address: "Adresse",
    website: "Website",
    employees: "Mitarbeitende",
    jobTitle: "Position",
    decisionRole: "Rolle in der Entscheidung",
    source: "Quelle",
    services: "Leistungsumfang",
    competitors: "Agenturen im Pitch",
    pitchDate: "Präsentationstermin",
    documents: "Dokumente",
    signedAgreement: "Unterschriebener Vertrag",
    productionWindow: "Produktionszeitraum",
    closeDate: "Entscheidung erwartet",
    nextStep: "Nächster Schritt",
    nextStepDate: "Datum nächster Schritt",
    lostReason: "Verlustgrund",
    retainerMrr: "Retainer pro Monat",
    monthlyFee: "Monatliches Honorar",
    termMonths: "Laufzeit (Monate)",
    contractValue: "Vertragswert",
    startDate: "Beginn",
    renewalDate: "Verlängerung am",
    scope: "Umfang",
    retainerStatus: "Status",
    projectStatus: "Status",
    budget: "Budget",
    hoursBudget: "Stundenbudget",
    hoursUsed: "Stunden verbraucht",
    hoursLeft: "Reststunden",
    deadline: "Abgabetermin",
    dueDate: "Fällig am",
    priority: "Priorität",
  },
  options: {
    industry: {
      retail: "Handel und Konsumgüter",
      food: "Lebensmittel und Getränke",
      health: "Gesundheit",
      hospitality: "Hotellerie",
      technology: "Technologie",
      finance: "Versicherung und Finanzen",
      culture: "Kultur",
      education: "Bildung",
      manufacturing: "Produktion",
    },
    relationship: { prospect: "Interessent", client: "Kunde", former: "Ehemaliger Kunde" },
    decisionRole: { decisionMaker: "Entscheider", influencer: "Marketingleitung", buyer: "Einkauf" },
    source: {
      referral: "Empfehlung",
      existing: "Bestandskunde",
      inbound: "Anfrage über die Website",
      invitation: "Einladung zum Pitch",
      event: "Branchenveranstaltung",
    },
    services: {
      strategy: "Markenstrategie",
      identity: "Corporate Design",
      website: "Website",
      content: "Content-Produktion",
      packaging: "Verpackung",
      social: "Social Media",
      print: "Print und Berichte",
    },
    lostReason: {
      budget: "Budget",
      otherAgency: "Andere Agentur gewählt",
      postponed: "Projekt verschoben",
      fit: "Passt nicht zu uns",
    },
    retainerStatus: { active: "Aktiv", renewalDue: "Verlängerung fällig", paused: "Pausiert", ended: "Beendet" },
    projectStatus: {
      kickoff: "Kick-off",
      inProduction: "In Produktion",
      review: "Kundenabnahme",
      delivered: "Geliefert",
    },
    priority: { low: "Niedrig", medium: "Mittel", high: "Hoch" },
  },
  stages: {
    inquiry: "Anfrage",
    briefing: "Briefing",
    pitchPreparation: "Pitch-Vorbereitung",
    proposal: "Angebot gesendet",
    negotiation: "Verhandlung",
    won: "Gewonnen",
    lost: "Verloren",
  },
  organizations: {
    harlow: ["Hartmann Outdoor GmbH", "Leipzig", "hartmann-outdoor.example"],
    bramble: ["Backhaus Brombeere", "Leipzig", "backhaus-brombeere.example"],
    meridian: ["Meridian Gesundheitszentren", "Halle (Saale)", "meridian-gesundheit.example"],
    quarry: ["Brauerei Steinbruch", "Chemnitz", "brauerei-steinbruch.example"],
    tidewell: ["Gezeiten Versicherung AG", "Dresden", "gezeiten-versicherung.example"],
    orchard: ["Zahnzentrum am Obstmarkt", "Markkleeberg", "zahnzentrum-obstmarkt.example"],
    copperleaf: ["Kupferblatt Hotels", "Dresden", "kupferblatt-hotels.example"],
    lumen: ["Lumen Robotik GmbH", "Jena", "lumen-robotik.example"],
    wexford: ["Möbelwerk Weber", "Erfurt", "moebelwerk-weber.example"],
    northshore: ["Kunsthalle Nordufer", "Magdeburg", "kunsthalle-nordufer.example"],
    pinewood: ["Bildungsstiftung Waldblick", "Leipzig", "stiftung-waldblick.example"],
    greenmile: ["Grünweg Fahrräder", "Leipzig", "gruenweg-fahrraeder.example"],
  },
  addresses: {
    harlow: ["Karl-Heine-Straße 82", "04229", "", 51.32562, 12.32941],
    bramble: ["Karl-Liebknecht-Straße 47", "04275", "", 51.31911, 12.37503],
    meridian: ["Leipziger Straße 61", "06108", "", 51.48367, 11.97134],
    quarry: ["Zwickauer Straße 140", "09116", "", 50.81873, 12.88654],
    tidewell: ["Wiener Platz 4", "01069", "", 51.03991, 13.73452],
    orchard: ["Rathausstraße 12", "04416", "", 51.27843, 12.37712],
    copperleaf: ["Neumarkt 9", "01067", "", 51.05341, 13.73112],
    lumen: ["Carl-Zeiss-Promenade 10", "07745", "", 50.90786, 11.57233],
    wexford: ["Am Kalkreiß 2", "99085", "", 50.99283, 11.05514],
    northshore: ["Otto-von-Guericke-Straße 68", "39104", "", 52.12405, 11.63221],
    pinewood: ["Gohliser Straße 22", "04155", "", 51.36301, 12.36623],
    greenmile: ["Eisenbahnstraße 101", "04315", "", 51.34651, 12.41236],
  },
  contacts: {
    rachel: ["Katrin", "Vogt", "Marketingleiterin"],
    tom: ["Tobias", "Wendt", "Markenmanager"],
    nina: ["Nina", "Seidel", "Inhaberin"],
    laura: ["Laura", "Kühn", "Leiterin Unternehmenskommunikation"],
    greg: ["Gerd", "Holtmann", "Geschäftsführer"],
    jake: ["Jakob", "Morgenstern", "Mitgründer"],
    diane: ["Dagmar", "Fuchs", "Marketingleiterin"],
    kevin: ["Kevin", "Lorenz", "Leiter Einkauf"],
    samantha: ["Sabine", "Reuter", "Praxisinhaberin"],
    michael: ["Michael", "Sommer", "Kaufmännischer Leiter"],
    erin: ["Elif", "Demir", "Markenmanagerin"],
    priya: ["Paula", "Rademacher", "Mitgründerin und Geschäftsführerin"],
    jordan: ["Jonas", "Pietsch", "Leiter Marketing"],
    paul: ["Peter", "Weber", "Geschäftsführer"],
    claire: ["Charlotte", "Benz", "Leiterin Marketing"],
    melissa: ["Miriam", "Scholz", "Vorständin"],
    ben: ["Benedikt", "Kaiser", "Gründer"],
    alex: ["Alexandra", "Ritter", "Marketing"],
  },
  deals: {
    meridianBrand: [
      "Meridian Gesundheitszentren – Markenauffrischung für sechs Standorte",
      "Fragen von Frau Kühn zu den Ausbaustufen beantworten",
    ],
    tidewellIdentity: [
      "Gezeiten Versicherung – Corporate Design und Website",
      "Pitch vor Frau Fuchs und dem Vorstand präsentieren",
    ],
    copperleafContent: [
      "Kupferblatt Hotels – monatlicher Content und Social Media",
      "Kündigungsfrist und monatliches Honorar abstimmen",
    ],
    lumenLaunch: [
      "Lumen Robotik – Positionierung zum Marktstart und Website",
      "Rückfragen an Frau Rademacher schicken",
    ],
    orchardWebsite: ["Zahnzentrum am Obstmarkt – neue Website", "Kennenlerngespräch mit Frau Reuter"],
    pinewoodReport: ["Bildungsstiftung Waldblick – Gestaltung Jahresbericht", "Zeitplan mit Frau Scholz bestätigen"],
    harlowSpring: [
      "Hartmann Outdoor – Content zur Frühjahrskollektion",
      "Nachfass-E-Mail nach der Präsentation senden",
    ],
    brambleShop: ["Backhaus Brombeere – Verpackung für die zweite Filiale", "Frau Seidel die Verpackungsmuster zeigen"],
    quarryLabels: ["Brauerei Steinbruch – Etiketten für Saisonbiere", "Anzahl der Etikettenentwürfe festlegen"],
    greenmileBrand: ["Grünweg Fahrräder – Marke und Social Media", "Retainer gestartet"],
    harlowContent: ["Hartmann Outdoor – Content-Retainer", "Retainer gestartet"],
    brambleSocial: ["Backhaus Brombeere – Social-Media-Retainer", "Retainer gestartet"],
    northshoreExhibition: ["Kunsthalle Nordufer – Ausstellungsdesign", "Feedbackgespräch geführt"],
    harlowAutumn: ["Hartmann Outdoor – Content zur Herbstkampagne", "Kampagne geliefert"],
    quarryWebsite: ["Brauerei Steinbruch – neue Website", "Website online"],
    greenmileOpening: ["Grünweg Fahrräder – Kampagne zur Ladeneröffnung", "Kampagne geliefert"],
    copperleafEvents: ["Kupferblatt Hotels – Veranstaltungsbroschüre", "Mit Frau Demir die Auflage klären"],
    meridianCampaign: ["Meridian Gesundheitszentren – Patientenkampagne", "Verloren"],
    lumenDeck: ["Lumen Robotik – Gestaltung der Investorenpräsentation", "Verloren"],
    brambleCatering: ["Backhaus Brombeere – Cateringkarte und Flyer", "Geliefert"],
  },
  retainers: {
    harlowRetainer: [
      "Hartmann Outdoor – Content-Retainer",
      "Produktfotografie mit zwei Shootings pro Quartal, monatlicher Content für Instagram und den Newsletter.",
    ],
    brambleRetainer: [
      "Backhaus Brombeere – Social Media",
      "Drei Beiträge pro Woche, saisonale Tafeln für die Theke, ein Fotoshooting in der Filiale pro Quartal.",
    ],
    greenmileRetainer: [
      "Grünweg Fahrräder – Marke und Social Media",
      "Markenbetreuung, Social-Media-Content für den neuen Laden, Grafiken für die gemeinsamen Ausfahrten.",
    ],
    quarryRetainer: [
      "Brauerei Steinbruch – Markenbetreuung",
      "Anpassungen an Etiketten und Grafiken für den Ausschank. Auf Wunsch des Kunden über den Winter pausiert.",
    ],
    wexfordRetainer: [
      "Möbelwerk Weber – Markenbetreuung",
      "Katalogsatz und Grafiken für die Ausstellung. Beendet, seit der Kunde die Gestaltung selbst übernimmt.",
    ],
  },
  projects: {
    greenmileRollout: "Grünweg Fahrräder – Einführung der neuen Marke",
    brambleCateringPrint: "Backhaus Brombeere – Cateringkarte und Flyer",
    greenmileOpeningCampaign: "Grünweg Fahrräder – Kampagne zur Ladeneröffnung",
    harlowAutumnContent: "Hartmann Outdoor – Content zur Herbstkampagne",
    quarryWebsiteBuild: "Brauerei Steinbruch – Umsetzung der Website",
    brambleShopPhotos: "Backhaus Brombeere – Fotoshooting in der Filiale",
  },
  tasks: {
    tidewellDeck: "Pitch-Präsentation für die Gezeiten Versicherung fertigstellen",
    tidewellRehearsal: "Präsentation für die Gezeiten Versicherung mit dem Team proben",
    meridianFollowUp: "Bei Frau Kühn zum Angebot für Meridian nachfassen",
    copperleafScope: "Überarbeiteten Umfang und Honorar an Kupferblatt Hotels senden",
    lumenQuestions: "Rückfragen zur Positionierung an Frau Rademacher senden",
    orchardCall: "Kennenlerngespräch mit Frau Reuter vom Zahnzentrum",
    pinewoodReply: "Der Bildungsstiftung zum Zeitplan des Jahresberichts antworten",
    harlowShoot: "Shooting für den Frühjahrs-Content von Hartmann Outdoor kalkulieren",
    brambleSamples: "Verpackungsmuster für das Backhaus Brombeere bestellen",
    quarryReview: "Überprüfung des Retainers mit der Brauerei Steinbruch vorbereiten",
    greenmileKickoff: "Kick-off mit Grünweg Fahrräder",
    northshoreDebrief: "Bei der Kunsthalle Nordufer Feedback zum verlorenen Pitch einholen",
  },
  views: {
    pitchBoard: "Pitch-Board",
    projects: "Projekte nach Status",
    retainers: "Retainer nach Verlängerung",
    nextSteps: "Nächste Schritte",
    clients: "Kunden",
    allContacts: "Alle Kontakte",
    dueSoon: "Bald fällig",
    production: "Produktionskalender",
  },
  widgets: {
    retainerMrr: "Retainer pro Monat",
    openPitches: "Offenes Pitch-Volumen",
    won: "Gewonnen in 12 Monaten",
    hoursLeft: "Reststunden laufender Projekte",
    byStage: "Offenes Pitch-Volumen nach Phase",
    projectsByStatus: "Projekte nach Status",
    presentations: "Präsentationen, 14 Tage",
    wonByMonth: "Gewonnener Wert pro Monat",
    mrrByClient: "Retainer pro Monat nach Kunde",
    nextStepsMonth: "Nächste Schritte im Monat",
  },
  members: {
    colleagueA: ["Mia", "Schneider", "mia.schneider@kranich-kommunikation.example"],
    colleagueB: ["Felix", "Koch", "felix.koch@kranich-kommunikation.example"],
  },
  routines: {
    renewal: {
      name: "Retainer-Verlängerungen prüfen",
      task: "Lies jeden Montag die Liste Retainer mit den konfigurierten Feldern Status, Monatliches Honorar, Laufzeit, Verlängerung am, Umfang und der Beziehung zum Kunden. Suche Retainer mit Status Aktiv, deren Verlängerungstermin in den nächsten 60 Tagen liegt. Setze für jeden den Status auf „Verlängerung fällig“ und lege eine normale Aufgabe „Verlängerung vorbereiten: <Name des Retainers>“ für den Verantwortlichen des Retainers an, fällig 30 Tage vor dem Verlängerungstermin oder heute, falls dieser Tag vorbei ist, Priorität Mittel, verknüpft mit dem Kunden des Retainers, mit Honorar, Laufzeit und Umfang in den Notizen. Überspringe Retainer, die schon eine solche offene Aufgabe haben. Ändere keine Honorare, Laufzeiten oder anderen Datensätze und schreibe dem Kunden nie. Berichte die Retainer und Aufgaben.",
      runs: [
        "„Backhaus Brombeere – Social Media“ auf „Verlängerung fällig“ gesetzt und 1 Aufgabe zur Verlängerung für Mia Schneider angelegt.",
        "Kein aktiver Retainer wird in den nächsten 60 Tagen ohne Aufgabe verlängert.",
        "Der Modellanbieter war bei diesem Versuch nicht erreichbar, deshalb habe ich vor dem Lesen und Ändern abgebrochen. Der nächste geplante Lauf holt das nach.",
      ],
    },
    followUp: {
      name: "Nachfass-Entwurf zum Pitch",
      task: "Ein Pitch hat sich geändert. Lies den Pitch aus routine_trigger mit den konfigurierten Feldern Phase, Kunde, Kontakte, Präsentationstermin und Notizen. Mach nur weiter, wenn die Phase „Angebot gesendet“ ist. Suche mit den Messaging-Werkzeugen den neuesten E-Mail-Verlauf mit den Kontakten des Pitches. Hat dieser Verlauf noch keinen Antwortentwurf, speichere mit save_message_draft einen kurzen Nachfass-Entwurf, der sich für die Präsentation bedankt, das Angebot zusammenfasst und den nächsten Schritt nennt. Der Entwurf ist zur Prüfung durch einen Menschen; sende ihn nie. Ändere den Pitch nicht und lege keine Datensätze an. Berichte den Verlauf und ob ein Entwurf gespeichert wurde.",
      runs: [
        "Der Pitch ist in die Verhandlung gewechselt, nicht auf „Angebot gesendet“; nichts zu tun.",
        "Einen Nachfass-Entwurf an Laura Kühn im Verlauf zum Meridian-Angebot zur Prüfung gespeichert.",
      ],
    },
  },
  wiki: {
    guide: {
      title: "Leitfaden",
      markdown: [
        "Kranich Kommunikation ist eine Agentur für Marke und Content mit zwölf Leuten in Leipzig. Wir arbeiten für Konsumgütermarken, Hotellerie und Gesundheitsunternehmen. Dieser Arbeitsbereich enthält Demodaten; alle Firmen und Personen sind erfunden.",
        "",
        "## So nutzen wir das CRM",
        "- **Pitches** sind unser Neugeschäft. Das Pitch-Board zeigt jeden Pitch nach Phase, von der ersten Anfrage bis zur Entscheidung. Der Wert ist unsere Schätzung der Honorare im ersten Jahr und wird von Hand eingetragen; der gewichtete Wert ist diese Schätzung mal der Wahrscheinlichkeit der Phase.",
        "- **Kunden** sind die Marken, für die wir arbeiten oder pitchen; „Retainer pro Monat“ am Kunden addiert die Monatshonorare seiner Retainer. **Kontakte** sind die Menschen dort.",
        "- **Projekte** sind gewonnene Arbeit in der Umsetzung: Status, Budget, Stundenbudget und verbrauchte Stunden. Die Reststunden werden daraus berechnet.",
        "- **Retainer** sind normale Datensätze für laufende Kundenarbeit: Monatshonorar, Laufzeit, Beginn und Verlängerungstermin, Umfang und Status. Der Vertragswert ist Monatshonorar mal Laufzeit. Sie erzeugen keine Rechnungen und keine wiederkehrende Abrechnung; abgerechnet wird weiter in unserer Buchhaltung.",
        "- **Aufgaben** und das Datum des nächsten Schritts an einem Pitch sind normale Felder. Niemand wird automatisch erinnert, deshalb jeden Morgen die Ansichten „Nächste Schritte“ und „Bald fällig“ prüfen.",
        "- Eine E-Mail gehört nur dann zu einem Pitch oder Kunden, wenn jemand sie dort verknüpft. Jeden Verlauf zu einem Pitch mit diesem Pitch verknüpfen.",
        "",
        "## Arbeitsregeln",
        "- Jeder offene Pitch hat einen nächsten Schritt mit Datum.",
        "- Ist ein Pitch gewonnen, auf „Gewonnen“ setzen und das Projekt oder den Retainer anlegen, verknüpft mit Kunde und Pitch.",
        "- Jeder Pitch, jedes Projekt und jeder Retainer hat einen Verantwortlichen: Max, Mia (Beratung) oder Felix (Kreation).",
        "- Ist ein Pitch verloren, den Grund eintragen und um Feedback bitten.",
        "- Zeiterfassung und Abrechnung bleiben in ihren eigenen Programmen; die verbrauchten Stunden eines Projekts tragen wir jeden Freitag von Hand nach.",
        "- Briefings und Angebote liegen im Feld „Dokumente“ des Pitches, unterschriebene Verträge am Retainer; Suche und Mate finden sie über ihren Text.",
      ],
    },
    process: {
      title: "Ablauf eines Pitches",
      markdown: [
        "Jeder Pitch durchläuft auf dem Pitch-Board dieselben Phasen. Diese Seite erklärt, was jede Phase für uns bedeutet.",
        "",
        "## Phasen",
        "1. **Anfrage:** Jemand möchte mit uns arbeiten. Kunde und anfragende Person anlegen.",
        "2. **Briefing:** Das Briefing liegt vor oder das Briefinggespräch ist geführt; Budgetrahmen, Termin und Entscheider sind bekannt.",
        "3. **Pitch-Vorbereitung:** Das Team arbeitet an Idee und Präsentation. Datum und Uhrzeit der Präsentation und die Anzahl der Agenturen im Pitch eintragen; das Briefing unter „Dokumente“ anhängen.",
        "4. **Angebot gesendet:** Die Präsentation ist gehalten, das schriftliche Angebot mit Umfang und Honorar liegt beim Kunden.",
        "5. **Verhandlung:** Umfang, Honorar und Konditionen werden abgestimmt.",
        "6. **Gewonnen oder Verloren:** Ergebnis festhalten. Gewonnene Pitches werden zum Projekt mit einem Produktionszeitraum vom Kick-off bis zur Abgabe (siehe Produktionskalender); laufende Arbeit bekommt zusätzlich einen Retainer.",
      ],
    },
    afterPitch: {
      title: "Nach einer Pitch-Präsentation",
      whenToUse:
        "Wenn wir einen Pitch bei Kunden oder Interessenten präsentiert haben und die Nachfass-E-Mail ansteht.",
      markdown: [
        "Der Tag nach einer Präsentation entscheidet, wie der Kunde sie in Erinnerung behält. Diese Schritte gelten für jeden Pitch.",
        "",
        "## Schritte",
        "1. Eine kurze Dankes-E-Mail schreiben, die die zwei oder drei Punkte zusammenfasst, auf die der Kunde am stärksten reagiert hat.",
        "2. Offene Fragen aus dem Termin beantworten oder sagen, bis wann die Antwort kommt.",
        "3. Den E-Mail-Verlauf mit dem Pitch und dem Kunden verknüpfen.",
        "4. Den Pitch auf „Angebot gesendet“ setzen, sobald das Angebot raus ist, und den nächsten Schritt mit Datum eintragen.",
        "5. Für jede Zusage aus dem Termin eine Aufgabe anlegen.",
      ],
    },
    renewal: {
      title: "Checkliste Retainer-Verlängerung",
      whenToUse:
        "Wenn ein Retainer auf „Verlängerung fällig“ steht oder sein Verlängerungstermin weniger als 60 Tage entfernt ist.",
      markdown: [
        "Über eine Verlängerung wird lange vor dem Termin entschieden. Wir beginnen 60 Tage vorher, damit der Kunde von uns hört, bevor er ins Grübeln kommt.",
        "",
        "## Schritte",
        "1. Den Retainer in der Ansicht „Retainer nach Verlängerung“ öffnen und den Umfang mit dem vergleichen, was wir in den letzten Monaten tatsächlich geliefert haben.",
        "2. Die Projekte des Kunden ansehen: Verbrauchte Stunden gegen Stundenbudget zeigen, ob der Umfang noch passt.",
        "3. Intern den Vorschlag abstimmen: gleicher Umfang, mehr oder weniger Arbeit, dazu Monatshonorar und Laufzeit.",
        "4. Einen Termin zur Verlängerung mit dem Entscheider des Kunden vereinbaren und den E-Mail-Verlauf mit dem Kunden verknüpfen.",
        "5. Nach dem Termin Monatshonorar, Laufzeit und Verlängerungstermin aktualisieren und den Status wieder auf Aktiv setzen, oder auf Beendet mit einer Notiz zum Grund.",
      ],
    },
  },
  threads: {
    tidewellBrief: {
      subject: "Pitch Corporate Design – Präsentationstermin und Rückfragen",
      messages: [
        "Sehr geehrter Herr Bergmann,\n\nvielen Dank für Ihre Zusage. Wir haben drei Agenturen eingeladen. Die Präsentationen finden nächste Woche statt; Sie haben 60 Minuten einschließlich Fragen.\n\nRückfragen zum Briefing senden Sie bitte bis Freitag.\n\nMit freundlichen Grüßen\nDagmar Fuchs",
        "Sehr geehrte Frau Fuchs,\n\nvielen Dank, der Termin nächste Woche passt uns gut. Zwei Fragen: Gehört der Relaunch der Website zum selben Budget, und nimmt der Vorstand an der Präsentation teil?\n\nMit freundlichen Grüßen\nMax Bergmann",
        "Gute Fragen. Die Website gehört zum Budget, die Aufteilung überlassen wir Ihnen. Unser Vorstandsvorsitzender und Herr Lorenz aus dem Einkauf sind dabei.",
      ],
    },
    meridianProposal: {
      subject: "Markenauffrischung Meridian – Angebot",
      messages: [
        "Hallo Frau Kühn,\n\nwie besprochen erhalten Sie hier unser Angebot für die Markenauffrischung aller sechs Standorte, einschließlich der Beschilderung in zwei Ausbaustufen.\n\nViele Grüße\nMax Bergmann",
        "Hallo Herr Bergmann,\n\ndanke, das Team war sehr angetan. Herr Holtmann fragt, ob wir mit den drei Standorten in der Innenstadt beginnen und den Rest im nächsten Jahr machen können. Ändert das Ihr Honorar?\n\nLaura Kühn",
      ],
    },
    copperleafTerms: {
      name: "Content-Retainer Kupferblatt",
      subject: "Content-Retainer Kupferblatt – Konditionen",
      messages: [
        "Hallo Herr Bergmann, mit dem Umfang sind wir zufrieden. Können wir uns auf drei Monate Kündigungsfrist statt sechs einigen?",
        "Hallo Herr Sommer, drei Monate sind in Ordnung, wenn wir den Umfang für die ersten beiden Quartale festlegen. Die überarbeiteten Konditionen schicke ich Ihnen am Donnerstag.",
        "Klingt fair. Das erste Shooting hätte ich gern vor der Weihnachtssaison, je früher wir unterschreiben, desto besser.",
      ],
    },
    harlowFollowUp: {
      subject: "Präsentation Frühjahrskollektion",
      messages: [
        "Hallo Frau Vogt,\n\nich freue mich darauf, Ihnen am Dienstag um 10 Uhr unsere Ideen für die Frühjahrskollektion vorzustellen.\n\nViele Grüße\nMax Bergmann",
        "Prima, bis dann. Herr Wendt ist auch dabei.",
        "Hallo Frau Vogt, hallo Herr Wendt,\n\nvielen Dank für Ihre Zeit gestern. Drei Punkte haben wir mitgenommen: Die Porträts auf dem Wanderweg haben Ihnen am besten gefallen, der Auftakt soll über den Newsletter laufen, und das Shooting muss vor Ende Februar stattfinden.\n\nDas schriftliche Angebot mit Shootingtagen und Honorar schicke ich Ihnen bis Freitag.\n\nViele Grüße\nMax Bergmann",
      ],
    },
    orchardInquiry: {
      subject: "Neue Website für unsere Praxis",
      messages: [
        "Guten Tag,\n\nwir sind eine Zahnarztpraxis in Markkleeberg, und unsere Website ist zehn Jahre alt. Eine Bekannte vom Backhaus Brombeere hat Sie empfohlen. Übernehmen Sie auch kleinere Projekte wie unseres?\n\nMit freundlichen Grüßen\nSabine Reuter",
        "Sehr geehrte Frau Reuter,\n\nvielen Dank, dass Sie an uns gedacht haben. Ja, sehr gern. Passt Ihnen nächste Woche ein Gespräch von 30 Minuten, um zu besprechen, was die neue Website leisten soll?\n\nMit freundlichen Grüßen\nMax Bergmann",
      ],
    },
    greenmileKickoff: {
      subject: "Kick-off und erster Monat",
      messages: [
        "Hallo Herr Bergmann, danke für den gelungenen Kick-off. Für die laufenden Social-Media-Beiträge ist Frau Ritter Ihre Ansprechpartnerin.",
        "Danke, Herr Kaiser. Den Redaktionsplan für den ersten Monat schicken wir Frau Ritter am Montag.",
      ],
    },
  },
  files: {
    tidewellBrief: {
      name: "Gezeiten – Briefing.pdf",
      lines: [
        "# Gezeiten Versicherung AG – Agenturbriefing",
        "Markenauftritt und Website. Von Dagmar Fuchs, Marketingleiterin, an drei eingeladene Agenturen.",
        "## Ausgangslage",
        "Gezeiten versichert Haushalte und kleine Betriebe in Sachsen und Thüringen. Nach einem Schaden vertrauen uns die Kunden, aber unsere Marke sieht aus wie jede andere Versicherung.",
        "## Aufgabe",
        "Ein neues Erscheinungsbild, eine Tonalität, die in jedem Brief und jeder Schadenmail ruhig und klar klingt, und eine neue Website.",
        "## Budget und Zeitplan",
        "| Punkt | Angabe |",
        "| Budgetrahmen | 80.000–90.000 € im ersten Jahr, Website inklusive |",
        "| Präsentation | 60 Minuten einschließlich Fragen |",
        "| Start | Vor der Verlängerungssaison im Frühjahr |",
        "## Entscheidung",
        "Der Vorstandsvorsitzende entscheidet mit Dagmar Fuchs; Kevin Lorenz aus dem Einkauf prüft die Konditionen.",
      ],
    },
    tidewellProposal: {
      name: "Gezeiten – Pitch-Angebot.pdf",
      lines: [
        "# Kranich Kommunikation – Angebot für die Gezeiten Versicherung",
        "## Unsere Idee",
        "Eine Versicherung, die spricht wie ein guter Nachbar: eine Tonalität aus echten Schadengesprächen, getragen von Erscheinungsbild und Website.",
        "## Umfang und Honorar",
        "| Phase | Leistung | Honorar |",
        "| 1 | Markenstrategie und Tonalität | 18.000 € |",
        "| 2 | Erscheinungsbild und Gestaltungsrichtlinien | 32.000 € |",
        "| 3 | Gestaltung und Umsetzung der Website | 35.000 € |",
        "| Gesamt | Erstes Jahr | 85.000 € |",
        "## Zeitplan",
        "Zwölf Wochen vom Kick-off bis zur neuen Website; die Tonalität für die Schadenbriefe steht nach vier Wochen.",
      ],
    },
    meridianProposal: {
      name: "Meridian – Angebot Markenauffrischung.pdf",
      lines: [
        "# Angebot – Markenauffrischung Meridian Gesundheitszentren",
        "Sechs Standorte, eine Marke. Erstellt für Laura Kühn und Gerd Holtmann.",
        "## Umfang",
        "| Phase | Leistung | Honorar |",
        "| 1 | Markenstrategie, Tonalität und Erscheinungsbild | 26.000 € |",
        "| 2 | Beschilderung der drei Standorte in der Innenstadt | 11.000 € |",
        "| 3 | Beschilderung der übrigen drei Standorte | 11.000 € |",
        "| Gesamt | | 48.000 € |",
        "Phase 3 kann ins nächste Jahr wandern, ohne dass sich das Honorar der Phasen 1 und 2 ändert.",
      ],
    },
    harlowBrief: {
      name: "Briefing Frühjahrskollektion.docx",
      lines: [
        "# Hartmann Outdoor – Briefing Frühjahrskollektion",
        "## Ziel",
        "Die Trail-Kollektion für das Frühjahr zuerst im Newsletter, dann auf Instagram vorstellen.",
        "## Inhalte",
        "Trail-Porträts echter Kundinnen und Kunden, Produktdetails, ein kurzer Film für die Shopseite.",
        "## Tonalität",
        "Warm und draußen, nie technisch; das Produkt spricht durch die Menschen, die es tragen.",
        "## Zeitplan",
        "Shooting bis Ende Februar; Budget etwa 22.000 €.",
      ],
    },
    harlowAgreement: {
      name: "Retainervertrag – Hartmann Outdoor.pdf",
      lines: [
        "# Retainervertrag – Hartmann Outdoor GmbH",
        "Zwischen der Hartmann Outdoor GmbH und Kranich Kommunikation.",
        "## Umfang",
        "Produktfotografie mit zwei Shootings pro Quartal, monatlicher Social-Media-Content für Instagram und Newsletter in der Tonalität von Hartmann.",
        "## Honorar und Laufzeit",
        "| Monatshonorar | Laufzeit | Kündigung |",
        "| 4.500 € | 12 Monate | 60 Tage vor Verlängerung |",
        "Unterschrieben von Katrin Vogt und Max Bergmann für Kranich Kommunikation.",
      ],
    },
    brambleAgreement: {
      name: "Retainervertrag – Backhaus Brombeere.pdf",
      lines: [
        "# Retainervertrag – Backhaus Brombeere",
        "## Umfang",
        "Drei Beiträge pro Woche, saisonale Menütafeln und ein Fotoshooting im Laden pro Quartal, nach dem Tonalitäts-Leitfaden der Bäckerei.",
        "## Honorar und Laufzeit",
        "| Monatshonorar | Laufzeit | Kündigung |",
        "| 1.500 € | 12 Monate | 60 Tage vor Verlängerung |",
        "Unterschrieben von Nina Seidel und Max Bergmann für Kranich Kommunikation.",
      ],
    },
    greenmileAgreement: {
      name: "Retainervertrag – Grünweg Fahrräder.pdf",
      lines: [
        "# Retainervertrag – Grünweg Fahrräder",
        "## Umfang",
        "Markenbetreuung einschließlich Tonalität, Social-Media-Content für den neuen Laden und Grafiken für gemeinsame Ausfahrten.",
        "## Honorar und Laufzeit",
        "| Monatshonorar | Laufzeit | Kündigung |",
        "| 2.500 € | 12 Monate | 60 Tage vor Verlängerung |",
        "Unterschrieben von Benedikt Kaiser und Max Bergmann für Kranich Kommunikation.",
      ],
    },
  },
  trash: { contact: "Laura Kühn", deal: "Lumen Robotik – Messestand" },
  mate: {
    title: "Gezeiten-Briefing und offene Fragen",
    question: "Fasse das Gezeiten-Briefing zusammen und liste offene Fragen für die Präsentation am Donnerstag auf.",
    answer:
      "**Gezeiten-Briefing (Gezeiten – Briefing.pdf, am Pitch „Gezeiten Versicherung – Markenauftritt und Website“):**\n- Gezeiten versichert Haushalte und kleine Betriebe in Sachsen und Thüringen. Nach einem Schaden vertrauen die Kunden der Versicherung, aber die Marke sieht aus wie jede andere.\n- Gewünscht sind ein neues Erscheinungsbild, eine Tonalität, die in Briefen und Schadenmails ruhig und klar klingt, und eine neue Website.\n- Budgetrahmen: 80.000–90.000 € im ersten Jahr, Website inklusive. Unser Angebot liegt bei 85.000 €, dem Wert am Pitch.\n- 60 Minuten einschließlich Fragen; drei Agenturen sind eingeladen. Start vor der Verlängerungssaison im Frühjahr.\n- Laut der Mail von Dagmar Fuchs sind der Vorstandsvorsitzende und Kevin Lorenz aus dem Einkauf bei der Präsentation dabei.\n\n**Offene Fragen für Donnerstag:**\n1. Welche Schadenbriefe und Mails soll die neue Tonalität zuerst abdecken?\n2. Muss die Website zusammen mit dem Erscheinungsbild starten, oder darf sie nach den zwölf Wochen folgen?\n3. Welche Zahlungs- und Vertragskonditionen erwartet Herr Lorenz?\n4. Wer gibt die Tonalität frei: Frau Fuchs oder der Vorstandsvorsitzende?\n\nDie Aufgaben „Pitch-Präsentation für die Gezeiten Versicherung fertigstellen“ und „Präsentation für die Gezeiten Versicherung mit dem Team proben“ sind noch offen.",
  },
  calendar: {
    name: "Pitch-Termine",
    events: [
      "Pitch-Präsentation Gezeiten Versicherung",
      "Telefonat mit Meridian zu den Ausbaustufen",
      "Konditionen mit Kupferblatt besprechen",
      "Retainer-Überprüfung mit der Brauerei Steinbruch",
    ],
  },
};

type Member = "maxBergmann" | "colleagueA" | "colleagueB";

const ORGANIZATION_FACTS: Record<
  OrganizationKey,
  { industry: string; relationship: string; employees: number; createdDaysAgo: number }
> = {
  harlow: { industry: "retail", relationship: "client", employees: 140, createdDaysAgo: 420 },
  bramble: { industry: "food", relationship: "client", employees: 35, createdDaysAgo: 260 },
  meridian: { industry: "health", relationship: "prospect", employees: 210, createdDaysAgo: 75 },
  quarry: { industry: "food", relationship: "client", employees: 28, createdDaysAgo: 540 },
  tidewell: { industry: "finance", relationship: "prospect", employees: 380, createdDaysAgo: 30 },
  orchard: { industry: "health", relationship: "prospect", employees: 14, createdDaysAgo: 4 },
  copperleaf: { industry: "hospitality", relationship: "prospect", employees: 260, createdDaysAgo: 95 },
  lumen: { industry: "technology", relationship: "prospect", employees: 45, createdDaysAgo: 22 },
  wexford: { industry: "manufacturing", relationship: "former", employees: 120, createdDaysAgo: 700 },
  northshore: { industry: "culture", relationship: "prospect", employees: 60, createdDaysAgo: 110 },
  pinewood: { industry: "education", relationship: "prospect", employees: 25, createdDaysAgo: 9 },
  greenmile: { industry: "retail", relationship: "client", employees: 18, createdDaysAgo: 85 },
};

const CONTACT_FACTS: Record<
  ContactKey,
  { organization: OrganizationKey; role: string; createdDaysAgo: number; avatar?: Parameters<typeof photo>[0] }
> = {
  rachel: { organization: "harlow", role: "decisionMaker", createdDaysAgo: 418, avatar: "lea-bauer" },
  tom: { organization: "harlow", role: "influencer", createdDaysAgo: 400, avatar: "tim-weber" },
  nina: { organization: "bramble", role: "decisionMaker", createdDaysAgo: 258, avatar: "nia-johnson" },
  laura: { organization: "meridian", role: "influencer", createdDaysAgo: 74, avatar: "sophie-hoffmann" },
  greg: { organization: "meridian", role: "decisionMaker", createdDaysAgo: 60 },
  jake: { organization: "quarry", role: "decisionMaker", createdDaysAgo: 538 },
  diane: { organization: "tidewell", role: "decisionMaker", createdDaysAgo: 29, avatar: "anna-mueller" },
  kevin: { organization: "tidewell", role: "buyer", createdDaysAgo: 20 },
  samantha: { organization: "orchard", role: "decisionMaker", createdDaysAgo: 3 },
  michael: { organization: "copperleaf", role: "decisionMaker", createdDaysAgo: 93, avatar: "max-schmidt" },
  erin: { organization: "copperleaf", role: "influencer", createdDaysAgo: 90 },
  priya: { organization: "lumen", role: "decisionMaker", createdDaysAgo: 21, avatar: "leila-chen" },
  jordan: { organization: "lumen", role: "influencer", createdDaysAgo: 21 },
  paul: { organization: "wexford", role: "decisionMaker", createdDaysAgo: 690 },
  claire: { organization: "northshore", role: "decisionMaker", createdDaysAgo: 108 },
  melissa: { organization: "pinewood", role: "decisionMaker", createdDaysAgo: 8 },
  ben: { organization: "greenmile", role: "decisionMaker", createdDaysAgo: 84, avatar: "jonas-weber" },
  alex: { organization: "greenmile", role: "influencer", createdDaysAgo: 30 },
};

type DealFacts = {
  organization: OrganizationKey;
  contacts: ContactKey[];
  stage: string;
  source: string;
  services: string[];
  value: number;
  competitors?: number;
  pitch?: number;
  createdDaysAgo: number;
  close: number;
  next?: number;
  lost?: string;
  history?: Array<{ daysAgo: number; stage: string }>;
};

const DEAL_FACTS: Record<DealKey, DealFacts> = {
  meridianBrand: {
    organization: "meridian",
    contacts: ["laura", "greg"],
    stage: "proposal",
    source: "referral",
    services: ["strategy", "identity", "print"],
    value: 48000,
    competitors: 2,
    pitch: -9,
    createdDaysAgo: 72,
    close: 18,
    next: 1,
    history: [
      { daysAgo: 60, stage: "briefing" },
      { daysAgo: 35, stage: "pitchPreparation" },
      { daysAgo: 8, stage: "proposal" },
    ],
  },
  tidewellIdentity: {
    organization: "tidewell",
    contacts: ["diane", "kevin"],
    stage: "pitchPreparation",
    source: "invitation",
    services: ["strategy", "identity", "website"],
    value: 85000,
    competitors: 3,
    pitch: 9,
    createdDaysAgo: 28,
    close: 30,
    next: 6,
    history: [
      { daysAgo: 24, stage: "briefing" },
      { daysAgo: 12, stage: "pitchPreparation" },
    ],
  },
  copperleafContent: {
    organization: "copperleaf",
    contacts: ["michael", "erin"],
    stage: "negotiation",
    source: "event",
    services: ["content", "social"],
    value: 36000,
    competitors: 1,
    pitch: -30,
    createdDaysAgo: 92,
    close: 10,
    next: 2,
    history: [
      { daysAgo: 80, stage: "briefing" },
      { daysAgo: 50, stage: "pitchPreparation" },
      { daysAgo: 28, stage: "proposal" },
      { daysAgo: 7, stage: "negotiation" },
    ],
  },
  lumenLaunch: {
    organization: "lumen",
    contacts: ["priya", "jordan"],
    stage: "briefing",
    source: "inbound",
    services: ["strategy", "website"],
    value: 42000,
    pitch: 8,
    createdDaysAgo: 20,
    close: 45,
    next: 5,
    history: [{ daysAgo: 3, stage: "briefing" }],
  },
  orchardWebsite: {
    organization: "orchard",
    contacts: ["samantha"],
    stage: "inquiry",
    source: "referral",
    services: ["website"],
    value: 14000,
    pitch: 12,
    createdDaysAgo: 3,
    close: 60,
    next: 2,
  },
  pinewoodReport: {
    organization: "pinewood",
    contacts: ["melissa"],
    stage: "inquiry",
    source: "inbound",
    services: ["print"],
    value: 12000,
    pitch: 14,
    createdDaysAgo: 8,
    close: 40,
    next: 6,
  },
  harlowSpring: {
    organization: "harlow",
    contacts: ["rachel", "tom"],
    stage: "pitchPreparation",
    source: "existing",
    services: ["content"],
    value: 22000,
    competitors: 0,
    pitch: -1,
    createdDaysAgo: 26,
    close: 14,
    next: 0,
    history: [
      { daysAgo: 18, stage: "briefing" },
      { daysAgo: 10, stage: "pitchPreparation" },
    ],
  },
  brambleShop: {
    organization: "bramble",
    contacts: ["nina"],
    stage: "briefing",
    source: "existing",
    services: ["packaging"],
    value: 9500,
    pitch: 10,
    createdDaysAgo: 14,
    close: 35,
    next: 9,
    history: [{ daysAgo: 6, stage: "briefing" }],
  },
  quarryLabels: {
    organization: "quarry",
    contacts: ["jake"],
    stage: "negotiation",
    source: "existing",
    services: ["packaging", "identity"],
    value: 16000,
    competitors: 0,
    pitch: -16,
    createdDaysAgo: 40,
    close: 7,
    next: 3,
    history: [
      { daysAgo: 32, stage: "briefing" },
      { daysAgo: 20, stage: "proposal" },
      { daysAgo: 5, stage: "negotiation" },
    ],
  },
  greenmileBrand: {
    organization: "greenmile",
    contacts: ["ben", "alex"],
    stage: "won",
    source: "referral",
    services: ["identity", "social"],
    value: 30000,
    competitors: 2,
    pitch: -40,
    createdDaysAgo: 82,
    close: -20,
    history: [
      { daysAgo: 65, stage: "briefing" },
      { daysAgo: 45, stage: "pitchPreparation" },
      { daysAgo: 35, stage: "proposal" },
    ],
  },
  harlowContent: {
    organization: "harlow",
    contacts: ["rachel"],
    stage: "won",
    source: "event",
    services: ["content", "social"],
    value: 30000,
    competitors: 3,
    pitch: -330,
    createdDaysAgo: 410,
    close: -300,
    history: [
      { daysAgo: 360, stage: "pitchPreparation" },
      { daysAgo: 325, stage: "proposal" },
    ],
  },
  brambleSocial: {
    organization: "bramble",
    contacts: ["nina"],
    stage: "won",
    source: "referral",
    services: ["social"],
    value: 18000,
    createdDaysAgo: 255,
    close: -200,
    history: [{ daysAgo: 230, stage: "proposal" }],
  },
  northshoreExhibition: {
    organization: "northshore",
    contacts: ["claire"],
    stage: "lost",
    source: "invitation",
    services: ["identity", "print"],
    value: 26000,
    competitors: 4,
    pitch: -55,
    createdDaysAgo: 105,
    close: -40,
    lost: "otherAgency",
    history: [
      { daysAgo: 90, stage: "briefing" },
      { daysAgo: 70, stage: "pitchPreparation" },
      { daysAgo: 54, stage: "proposal" },
    ],
  },
  harlowAutumn: {
    organization: "harlow",
    contacts: ["rachel", "tom"],
    stage: "won",
    source: "existing",
    services: ["content"],
    value: 26000,
    createdDaysAgo: 150,
    close: -125,
    history: [
      { daysAgo: 140, stage: "briefing" },
      { daysAgo: 132, stage: "proposal" },
    ],
  },
  quarryWebsite: {
    organization: "quarry",
    contacts: ["jake"],
    stage: "won",
    source: "existing",
    services: ["website"],
    value: 19000,
    createdDaysAgo: 200,
    close: -175,
    history: [
      { daysAgo: 192, stage: "briefing" },
      { daysAgo: 185, stage: "proposal" },
    ],
  },

  greenmileOpening: {
    organization: "greenmile",
    contacts: ["ben", "alex"],
    stage: "won",
    source: "existing",
    services: ["print", "social"],
    value: 12000,
    createdDaysAgo: 70,
    close: -46,
    history: [{ daysAgo: 58, stage: "proposal" }],
  },

  copperleafEvents: {
    organization: "copperleaf",
    contacts: ["erin", "michael"],
    stage: "proposal",
    source: "existing",
    services: ["print"],
    value: 15000,
    competitors: 1,
    pitch: -12,
    createdDaysAgo: 38,
    close: 21,
    next: 4,
    history: [
      { daysAgo: 30, stage: "briefing" },
      { daysAgo: 11, stage: "proposal" },
    ],
  },
  meridianCampaign: {
    organization: "meridian",
    contacts: ["laura"],
    stage: "lost",
    source: "inbound",
    services: ["content"],
    value: 18000,
    createdDaysAgo: 70,
    close: -45,
    lost: "budget",
    history: [
      { daysAgo: 58, stage: "briefing" },
      { daysAgo: 52, stage: "proposal" },
    ],
  },
  lumenDeck: {
    organization: "lumen",
    contacts: ["priya"],
    stage: "lost",
    source: "inbound",
    services: ["print"],
    value: 6000,
    createdDaysAgo: 20,
    close: -8,
    lost: "fit",
    history: [{ daysAgo: 14, stage: "proposal" }],
  },
  brambleCatering: {
    organization: "bramble",
    contacts: ["nina"],
    stage: "won",
    source: "existing",
    services: ["print"],
    value: 9500,
    createdDaysAgo: 30,
    close: -5,
    history: [{ daysAgo: 15, stage: "proposal" }],
  },
};

const RETAINER_FACTS: Record<
  RetainerKey,
  {
    organization: OrganizationKey;
    pitch?: DealKey;
    status: string;
    fee: number;
    term: number;
    start: number;
    renewal: number;
    owner: Member;
    createdDaysAgo: number;
    history?: Array<{ daysAgo: number; status: string }>;
  }
> = {
  harlowRetainer: {
    organization: "harlow",
    pitch: "harlowContent",
    status: "active",
    fee: 4500,
    term: 12,
    start: -290,
    renewal: 75,
    owner: "colleagueB",
    createdDaysAgo: 298,
  },
  brambleRetainer: {
    organization: "bramble",
    pitch: "brambleSocial",
    status: "renewalDue",
    fee: 1500,
    term: 12,
    start: -190,
    renewal: 25,
    owner: "colleagueA",
    createdDaysAgo: 198,
    history: [{ daysAgo: 1, status: "active" }],
  },
  greenmileRetainer: {
    organization: "greenmile",
    pitch: "greenmileBrand",
    status: "active",
    fee: 2500,
    term: 12,
    start: -10,
    renewal: 350,
    owner: "colleagueA",
    createdDaysAgo: 19,
  },
  quarryRetainer: {
    organization: "quarry",
    status: "paused",
    fee: 1800,
    term: 24,
    start: -480,
    renewal: 12,
    owner: "maxBergmann",
    createdDaysAgo: 500,
    history: [{ daysAgo: 45, status: "active" }],
  },
  wexfordRetainer: {
    organization: "wexford",
    status: "ended",
    fee: 3000,
    term: 18,
    start: -650,
    renewal: -90,
    owner: "maxBergmann",
    createdDaysAgo: 660,
    history: [{ daysAgo: 85, status: "active" }],
  },
};

const PROJECT_FACTS: Record<
  ProjectKey,
  {
    organization: OrganizationKey;
    pitch?: DealKey;
    status: string;
    budget: number;
    hours: number;
    used: number;
    deadline: number;
    kickoff: number;
    owner: Member;
    createdDaysAgo: number;
    history?: Array<{ daysAgo: number; status: string }>;
  }
> = {
  greenmileRollout: {
    organization: "greenmile",
    pitch: "greenmileBrand",
    status: "inProduction",
    budget: 30000,
    hours: 240,
    used: 150,
    deadline: 25,
    kickoff: -12,
    owner: "colleagueA",
    createdDaysAgo: 19,
    history: [{ daysAgo: 12, status: "kickoff" }],
  },
  brambleCateringPrint: {
    organization: "bramble",
    pitch: "brambleCatering",
    status: "kickoff",
    budget: 9500,
    hours: 80,
    used: 6,
    deadline: 30,
    kickoff: -2,
    owner: "colleagueB",
    createdDaysAgo: 4,
  },
  greenmileOpeningCampaign: {
    organization: "greenmile",
    pitch: "greenmileOpening",
    status: "review",
    budget: 12000,
    hours: 100,
    used: 92,
    deadline: 4,
    kickoff: -40,
    owner: "colleagueA",
    createdDaysAgo: 45,
    history: [
      { daysAgo: 40, status: "kickoff" },
      { daysAgo: 6, status: "inProduction" },
    ],
  },
  harlowAutumnContent: {
    organization: "harlow",
    pitch: "harlowAutumn",
    status: "delivered",
    budget: 26000,
    hours: 210,
    used: 218,
    deadline: -95,
    kickoff: -118,
    owner: "colleagueB",
    createdDaysAgo: 124,
    history: [
      { daysAgo: 118, status: "kickoff" },
      { daysAgo: 96, status: "inProduction" },
    ],
  },
  quarryWebsiteBuild: {
    organization: "quarry",
    pitch: "quarryWebsite",
    status: "delivered",
    budget: 19000,
    hours: 160,
    used: 151,
    deadline: -140,
    kickoff: -170,
    owner: "colleagueB",
    createdDaysAgo: 174,
    history: [
      { daysAgo: 170, status: "kickoff" },
      { daysAgo: 142, status: "inProduction" },
    ],
  },
  brambleShopPhotos: {
    organization: "bramble",
    status: "inProduction",
    budget: 4500,
    hours: 40,
    used: 22,
    deadline: 12,
    kickoff: -9,
    owner: "maxBergmann",
    createdDaysAgo: 16,
    history: [{ daysAgo: 9, status: "kickoff" }],
  },
};

const ORGANIZATION_OWNERS: Partial<Record<OrganizationKey, Member>> = {
  harlow: "colleagueB",
  quarry: "colleagueB",
  bramble: "colleagueA",
  greenmile: "colleagueA",
  meridian: "colleagueA",
  tidewell: "colleagueA",
  copperleaf: "colleagueA",
};

const DEAL_OWNERS: Partial<Record<DealKey, Member>> = {
  tidewellIdentity: "colleagueA",
  meridianBrand: "colleagueA",
  copperleafContent: "colleagueA",
  copperleafEvents: "colleagueA",
  greenmileBrand: "colleagueA",
  greenmileOpening: "colleagueA",
  meridianCampaign: "colleagueA",
  harlowSpring: "colleagueB",
  quarryLabels: "colleagueB",
  brambleShop: "colleagueB",
  harlowAutumn: "colleagueB",
  quarryWebsite: "colleagueB",
  brambleCatering: "colleagueB",
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
  tidewellDeck: { status: "inProgress", priority: "high", due: 3, deal: "tidewellIdentity", createdDaysAgo: 11 },
  tidewellRehearsal: { status: "open", priority: "high", due: 5, deal: "tidewellIdentity", createdDaysAgo: 4 },
  meridianFollowUp: {
    status: "open",
    priority: "high",
    due: 1,
    deal: "meridianBrand",
    contact: "laura",
    createdDaysAgo: 2,
  },
  copperleafScope: {
    status: "inProgress",
    priority: "high",
    due: 2,
    deal: "copperleafContent",
    contact: "michael",
    createdDaysAgo: 3,
  },
  lumenQuestions: {
    status: "open",
    priority: "medium",
    due: 5,
    deal: "lumenLaunch",
    contact: "priya",
    createdDaysAgo: 2,
  },
  orchardCall: {
    status: "open",
    priority: "medium",
    due: 2,
    deal: "orchardWebsite",
    contact: "samantha",
    createdDaysAgo: 1,
  },
  pinewoodReply: {
    status: "open",
    priority: "low",
    due: -3,
    deal: "pinewoodReport",
    contact: "melissa",
    createdDaysAgo: 5,
  },
  harlowShoot: {
    status: "done",
    priority: "medium",
    due: -6,
    deal: "harlowSpring",
    contact: "tom",
    createdDaysAgo: 15,
    done: 7,
  },
  brambleSamples: { status: "onHold", priority: "low", due: 10, deal: "brambleShop", createdDaysAgo: 5 },
  quarryReview: {
    status: "open",
    priority: "medium",
    due: -4,
    organization: "quarry",
    contact: "jake",
    createdDaysAgo: 6,
  },
  greenmileKickoff: {
    status: "done",
    priority: "high",
    due: -8,
    deal: "greenmileBrand",
    contact: "ben",
    createdDaysAgo: 18,
    done: 8,
  },
  northshoreDebrief: {
    status: "done",
    priority: "low",
    due: -32,
    deal: "northshoreExhibition",
    contact: "claire",
    createdDaysAgo: 39,
    done: 33,
  },
};

const OWNER: Member = "maxBergmann";

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
  id: "agencies",
  strings: { en, de },
  story: {
    en: { currency: "USD", timeZone: "America/Chicago" },
    de: { currency: "EUR", timeZone: "Europe/Berlin" },
  },
  build: (t) => {
    const office = (index: number) => phoneNumber(t.phones.office, index);
    const open = ["inquiry", "briefing", "pitchPreparation", "proposal", "negotiation"];
    const label = <K extends string>(
      options: Record<K, string>,
      colors: Record<K, "default" | "secondary" | "destructive" | "success" | "warning" | "info">,
    ) => (Object.keys(options) as K[]).map((key) => ({ key, label: options[key], color: colors[key] }));
    const domainOf = (key: OrganizationKey) => t.organizations[key][2];

    const organization: RecordSpec[] = ORGANIZATIONS.map((key) => {
      const facts = ORGANIZATION_FACTS[key];
      const [name, city, domain] = t.organizations[key];
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
          website: `https://${domain}`,
          employees: facts.employees,
        },
        owner: ORGANIZATION_OWNERS[key] ?? OWNER,
        channels: { email: `hello@${domain}` },
        createdDaysAgo: facts.createdDaysAgo,
      };
    });
    const contact: RecordSpec[] = CONTACTS.map((key, index) => {
      const facts = CONTACT_FACTS[key];
      const [firstName, lastName, jobTitle] = t.contacts[key];
      return {
        key,
        values: { firstName, lastName, jobTitle, decisionRole: facts.role },
        links: { "contact.organizations": facts.organization },
        owner: ORGANIZATION_OWNERS[facts.organization] ?? OWNER,
        channels: {
          email: `${mailbox(firstName)}.${mailbox(lastName)}@${domainOf(facts.organization)}`,
          phone: office(index),
        },
        ...(facts.avatar ? { avatar: photo(facts.avatar) } : {}),
        createdDaysAgo: facts.createdDaysAgo,
      };
    });
    const deal: RecordSpec[] = DEALS.map((key) => {
      const facts = DEAL_FACTS[key];
      const [name, nextStep] = t.deals[key];
      const closed = facts.stage === "won" || facts.stage === "lost";
      return {
        key,
        values: {
          name,
          stage: facts.stage,
          source: facts.source,
          disciplines: facts.services,
          totalValue: facts.value,
          closeDate: day(facts.close),
          nextStep,
          ...(facts.competitors === undefined ? {} : { competitors: facts.competitors }),
          ...(facts.pitch === undefined
            ? {}
            : { pitchPresentation: at(facts.pitch, facts.pitch > 0 ? "10:00" : "14:00") }),
          ...(facts.next === undefined ? {} : { nextStepDate: day(facts.next) }),
          ...(facts.lost ? { lostReason: facts.lost } : {}),
        },
        links: { "deal.organizations": facts.organization, "deal.contacts": facts.contacts },
        owner: DEAL_OWNERS[key] ?? OWNER,
        createdDaysAgo: facts.createdDaysAgo,
        history: [
          ...(facts.history ?? []).map((change, index, all) => ({
            daysAgo: change.daysAgo,
            previous: { stage: index === 0 ? "inquiry" : all[index - 1].stage },
          })),
          ...(closed
            ? [{ daysAgo: Math.max(0, -facts.close), previous: { stage: facts.history?.at(-1)?.stage ?? "proposal" } }]
            : []),
        ].filter((change, index, all) => index === 0 || change.daysAgo < all[index - 1].daysAgo),
      };
    });
    const retainer: RecordSpec[] = RETAINERS.map((key) => {
      const facts = RETAINER_FACTS[key];
      const [name, scope] = t.retainers[key];
      return {
        key,
        values: {
          name,
          status: facts.status,
          monthlyFee: facts.fee,
          termMonths: facts.term,
          startDate: day(facts.start),
          renewalDate: day(facts.renewal),
          scope,
        },
        links: {
          "retainer.organization": facts.organization,
          ...(facts.pitch ? { "retainer.pitch": facts.pitch } : {}),
        },
        owner: facts.owner,
        createdDaysAgo: facts.createdDaysAgo,
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
    const project: RecordSpec[] = PROJECTS.map((key) => {
      const facts = PROJECT_FACTS[key];
      return {
        key,
        values: {
          name: t.projects[key],
          status: facts.status,
          budget: facts.budget,
          hoursBudget: facts.hours,
          hoursUsed: facts.used,
          deadline: day(facts.deadline),
          productionWindow: range(facts.kickoff, facts.deadline),
        },
        links: {
          "project.organization": facts.organization,
          ...(facts.pitch ? { "project.pitch": facts.pitch } : {}),
        },
        owner: facts.owner,
        createdDaysAgo: facts.createdDaysAgo,
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
        owner:
          (facts.deal ? DEAL_OWNERS[facts.deal] : undefined) ??
          (organizationKey ? ORGANIZATION_OWNERS[organizationKey] : undefined) ??
          OWNER,
        createdDaysAgo: facts.createdDaysAgo,
        ...(facts.done === undefined ? {} : { history: [{ daysAgo: facts.done, previous: { status: "open" } }] }),
      };
    });

    const file = (key: keyof Strings["files"], record: string, field: string, uploadedDaysAgo: number): FileSpec => ({
      key,
      record,
      field,
      name: t.files[key].name,
      kind: "pdf",
      lines: t.files[key].lines,
      uploadedDaysAgo,
    });
    const thread = (key: keyof Strings["threads"], from: readonly string[]) =>
      t.threads[key].messages.map((text, index) => ({ from: from[index], text }));

    return {
      workspaceName: t.workspaceName,
      companyName: t.company,
      lists: (["organization", "contact", "deal", "project", "retainer", "task"] as const).map((key) => ({
        key,
        label: t.lists[key][0],
        pluralLabel: t.lists[key][1],
        description: t.lists[key][2],
        icon: {
          organization: "building",
          contact: "contact",
          deal: "handshake",
          project: "kanban",
          retainer: "repeat",
          task: "check",
        }[key],
      })),
      fields: [
        {
          key: "organization.industry",
          label: t.fields.industry,
          type: "select",
          options: label(t.options.industry, {
            retail: "info",
            food: "warning",
            health: "success",
            hospitality: "info",
            technology: "secondary",
            finance: "default",
            culture: "secondary",
            education: "success",
            manufacturing: "default",
          }),
        },
        {
          key: "organization.relationship",
          label: t.fields.relationship,
          type: "select",
          options: label(t.options.relationship, { prospect: "info", client: "success", former: "secondary" }),
        },
        { key: "organization.address", label: t.fields.address, type: "address" },
        { key: "organization.website", label: t.fields.website, type: "url" },
        { key: "organization.employees", label: t.fields.employees, type: "number" },
        {
          key: "organization.retainerMrr",
          label: t.fields.retainerMrr,
          type: "currency",
          formula: { kind: "rollupSum", relation: "retainer.organization", field: "retainer.monthlyFee" },
        },
        { key: "contact.jobTitle", label: t.fields.jobTitle, type: "text" },
        {
          key: "contact.decisionRole",
          label: t.fields.decisionRole,
          type: "select",
          options: label(t.options.decisionRole, { decisionMaker: "success", influencer: "info", buyer: "warning" }),
        },
        {
          key: "deal.source",
          label: t.fields.source,
          type: "select",
          options: label(t.options.source, {
            referral: "success",
            existing: "secondary",
            inbound: "info",
            invitation: "warning",
            event: "default",
          }),
        },
        {
          key: "deal.disciplines",
          label: t.fields.services,
          type: "multiSelect",
          options: label(t.options.services, {
            strategy: "info",
            identity: "secondary",
            website: "info",
            content: "warning",
            packaging: "default",
            social: "success",
            print: "secondary",
          }),
        },
        { key: "deal.competitors", label: t.fields.competitors, type: "number" },
        { key: "deal.pitchPresentation", label: t.fields.pitchDate, type: "dateTime" },
        { key: "deal.closeDate", label: t.fields.closeDate, type: "date" },
        { key: "deal.nextStep", label: t.fields.nextStep, type: "text" },
        { key: "deal.nextStepDate", label: t.fields.nextStepDate, type: "date" },
        { key: "deal.documents", label: t.fields.documents, type: "file" },
        {
          key: "deal.lostReason",
          label: t.fields.lostReason,
          type: "select",
          options: label(t.options.lostReason, {
            budget: "warning",
            otherAgency: "destructive",
            postponed: "info",
            fit: "secondary",
          }),
        },
        {
          key: "project.status",
          label: t.fields.projectStatus,
          type: "select",
          options: label(t.options.projectStatus, {
            kickoff: "info",
            inProduction: "warning",
            review: "secondary",
            delivered: "success",
          }),
        },
        { key: "project.budget", label: t.fields.budget, type: "currency" },
        { key: "project.hoursBudget", label: t.fields.hoursBudget, type: "number" },
        { key: "project.hoursUsed", label: t.fields.hoursUsed, type: "number" },
        {
          key: "project.hoursLeft",
          label: t.fields.hoursLeft,
          type: "number",
          formula: { kind: "difference", left: "project.hoursBudget", right: "project.hoursUsed" },
        },
        { key: "project.deadline", label: t.fields.deadline, type: "date" },
        { key: "project.productionWindow", label: t.fields.productionWindow, type: "dateRange" },
        {
          key: "retainer.status",
          label: t.fields.retainerStatus,
          type: "select",
          options: label(t.options.retainerStatus, {
            active: "success",
            renewalDue: "warning",
            paused: "info",
            ended: "secondary",
          }),
        },
        { key: "retainer.monthlyFee", label: t.fields.monthlyFee, type: "currency" },
        { key: "retainer.termMonths", label: t.fields.termMonths, type: "number" },
        {
          key: "retainer.contractValue",
          label: t.fields.contractValue,
          type: "currency",
          formula: { kind: "product", left: "retainer.monthlyFee", right: "retainer.termMonths" },
        },
        { key: "retainer.startDate", label: t.fields.startDate, type: "date" },
        { key: "retainer.renewalDate", label: t.fields.renewalDate, type: "date" },
        { key: "retainer.scope", label: t.fields.scope, type: "text" },
        { key: "retainer.signedAgreement", label: t.fields.signedAgreement, type: "file" },
        { key: "task.dueDate", label: t.fields.dueDate, type: "date" },
        {
          key: "task.priority",
          label: t.fields.priority,
          type: "select",
          options: label(t.options.priority, { low: "secondary", medium: "info", high: "destructive" }),
        },
      ],
      stages: [
        { key: "inquiry", label: t.stages.inquiry, color: "secondary", probability: 10 },
        { key: "briefing", label: t.stages.briefing, color: "info", probability: 20 },
        { key: "pitchPreparation", label: t.stages.pitchPreparation, color: "info", probability: 35 },
        { key: "proposal", label: t.stages.proposal, color: "warning", probability: 55 },
        { key: "negotiation", label: t.stages.negotiation, color: "warning", probability: 75 },
        { key: "won", label: t.stages.won, color: "success", probability: 100 },
        { key: "lost", label: t.stages.lost, color: "destructive", probability: 0 },
      ],
      relationships: [
        {
          key: "project.organization",
          source: "project",
          target: "organization",
          sourceCardinality: "one",
          targetCardinality: "many",
        },
        {
          key: "project.pitch",
          source: "project",
          target: "deal",
          sourceCardinality: "one",
          targetCardinality: "many",
        },
        {
          key: "retainer.organization",
          source: "retainer",
          target: "organization",
          sourceCardinality: "one",
          targetCardinality: "many",
        },
        {
          key: "retainer.pitch",
          source: "retainer",
          target: "deal",
          sourceCardinality: "one",
          targetCardinality: "many",
        },
      ],
      records: { organization, contact, deal, project, retainer, task },
      views: [
        {
          key: "pitchBoard",
          list: "deal",
          name: t.views.pitchBoard,
          mode: "board",
          groupBy: "stage",
          columns: ["totalValue", "deal.organizations", "pitchPresentation", "nextStepDate", "system:assignedTo"],
          filters: [{ field: "stage", notIn: ["lost"] }],
        },
        {
          key: "projects",
          list: "project",
          name: t.views.projects,
          mode: "board",
          groupBy: "status",
          columns: ["budget", "project.organization", "hoursLeft", "deadline", "system:assignedTo"],
        },
        {
          key: "retainers",
          list: "retainer",
          name: t.views.retainers,
          mode: "table",
          columns: [
            "status",
            "renewalDate",
            "monthlyFee",
            "termMonths",
            "contractValue",
            "retainer.organization",
            "system:assignedTo",
          ],
          filters: [{ field: "status", notIn: ["ended"] }],
          sort: { field: "renewalDate", direction: "asc" },
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
          key: "clients",
          list: "organization",
          name: t.views.clients,
          mode: "table",
          columns: ["relationship", "retainerMrr", "industry", "address", "contact.organizations", "system:assignedTo"],
          sort: { field: "relationship", direction: "asc" },
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
          key: "production",
          list: "project",
          name: t.views.production,
          mode: "calendar",
          calendar: { date: "productionWindow", color: "status", mode: "month" },
          columns: ["status", "project.organization", "deadline", "system:assignedTo"],
        },
      ],
      dashboard: {
        widgets: [
          {
            kind: "kpi",
            title: t.widgets.retainerMrr,
            list: "retainer",
            aggregation: "sum",
            field: "monthlyFee",
            filters: [{ field: "status", in: ["active", "renewalDue"] }],
          },
          {
            kind: "kpi",
            title: t.widgets.openPitches,
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
            filters: [
              { field: "stage", in: ["won"] },
              { field: "closeDate", withinDays: 365 },
            ],
          },
          {
            kind: "kpi",
            title: t.widgets.hoursLeft,
            list: "project",
            aggregation: "sum",
            field: "hoursLeft",
            filters: [{ field: "status", notIn: ["delivered"] }],
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
            title: t.widgets.presentations,
            list: "deal",
            layout: "upcoming",
            date: "pitchPresentation",
            days: 14,
            amount: "totalValue",
            overdue: true,
            filters: [{ field: "stage", in: ["inquiry", "briefing", "pitchPreparation"] }],
          },
          {
            kind: "chart",
            title: t.widgets.projectsByStatus,
            display: DisplayType.doughnutChart,
            list: "project",
            aggregation: "count",
            groupBy: { field: "status" },
          },
          {
            kind: "chart",
            title: t.widgets.wonByMonth,
            display: DisplayType.areaChart,
            list: "deal",
            aggregation: "sum",
            field: "totalValue",
            groupBy: { month: "closeDate" },
            filters: [
              { field: "stage", in: ["won"] },
              { field: "closeDate", withinDays: 365 },
            ],
          },
          {
            kind: "calendar",
            title: t.widgets.nextStepsMonth,
            list: "deal",
            layout: "month",
            date: "nextStepDate",
            filters: [{ field: "stage", in: open }],
          },
          {
            kind: "chart",
            title: t.widgets.mrrByClient,
            display: DisplayType.rankedTable,
            list: "retainer",
            aggregation: "sum",
            field: "monthlyFee",
            groupBy: { relation: "retainer.organization" },
            filters: [{ field: "status", in: ["active", "renewalDue"] }],
          },
        ],
      },
      wiki: [
        { key: "guide", kind: "guide", title: t.wiki.guide.title, markdown: t.wiki.guide.markdown },
        { key: "process", kind: "knowledge", title: t.wiki.process.title, markdown: t.wiki.process.markdown },
        {
          key: "afterPitch",
          kind: "procedure",
          title: t.wiki.afterPitch.title,
          whenToUse: t.wiki.afterPitch.whenToUse,
          markdown: t.wiki.afterPitch.markdown,
        },
        {
          key: "renewal",
          kind: "procedure",
          title: t.wiki.renewal.title,
          whenToUse: t.wiki.renewal.whenToUse,
          markdown: t.wiki.renewal.markdown,
        },
      ],
      members: (["colleagueA", "colleagueB"] as const).map((key, index) => ({
        key,
        firstName: t.members[key][0],
        lastName: t.members[key][1],
        email: t.members[key][2],
        avatar: photo(index === 0 ? "mia-schneider" : "felix-koch"),
      })),
      routines: [
        {
          key: "renewal",
          name: t.routines.renewal.name,
          task: t.routines.renewal.task,
          trigger: { kind: "schedule", cron: "0 8 * * 1" },
          runs: [
            {
              status: "succeeded",
              startedHoursAgo: 26,
              durationSeconds: 64,
              credits: 9,
              summary: t.routines.renewal.runs[0],
            },
            {
              status: "succeeded",
              startedHoursAgo: 194,
              durationSeconds: 48,
              credits: 7,
              summary: t.routines.renewal.runs[1],
            },
            {
              status: "failed",
              startedHoursAgo: 362,
              durationSeconds: 11,
              credits: 2,
              error: "providerUnavailable",
              note: t.routines.renewal.runs[2],
            },
          ],
        },
        {
          key: "followUp",
          name: t.routines.followUp.name,
          task: t.routines.followUp.task,
          owner: "colleagueA",
          trigger: {
            kind: "event",
            events: ["record.updated"],
            lists: ["deal"],
            debounceSeconds: 600,
            sample: { record: "deal:meridianBrand" },
          },
          runs: [
            {
              status: "succeeded",
              startedHoursAgo: 170,
              durationSeconds: 22,
              credits: 3,
              summary: t.routines.followUp.runs[0],
            },
            {
              status: "succeeded",
              startedHoursAgo: 194,
              durationSeconds: 71,
              credits: 11,
              summary: t.routines.followUp.runs[1],
            },
          ],
        },
      ],
      messaging: {
        accounts: ["google"],
        selfTitle: t.selfTitle,
        website: t.website,
        threads: [
          {
            account: "google",
            with: ["diane"],
            subject: t.threads.tidewellBrief.subject,
            state: "unread",
            latestMinutesAgo: 40,
            messages: thread("tidewellBrief", ["diane", "self", "diane"]),
            links: ["deal:tidewellIdentity", "organization:tidewell"],
          },
          {
            account: "google",
            with: ["laura"],
            subject: t.threads.meridianProposal.subject,
            state: "unread",
            latestMinutesAgo: 3 * 60,
            messages: thread("meridianProposal", ["self", "laura"]),
            links: ["deal:meridianBrand"],
          },
          {
            account: "google",
            with: ["michael", "erin"],
            name: t.threads.copperleafTerms.name,
            subject: t.threads.copperleafTerms.subject,
            state: "open",
            latestMinutesAgo: 26 * 60,
            messages: thread("copperleafTerms", ["michael", "self", "michael"]),
            links: ["deal:copperleafContent", "organization:copperleaf"],
          },
          {
            account: "google",
            with: ["rachel", "tom"],
            name: t.threads.harlowFollowUp.subject,
            subject: t.threads.harlowFollowUp.subject,
            state: "open",
            latestMinutesAgo: 20,
            messages: [
              ...thread("harlowFollowUp", ["self", "rachel", "self"]).slice(0, 2),
              { from: "self", text: t.threads.harlowFollowUp.messages[2], draft: true },
            ],
            links: ["deal:harlowSpring", "organization:harlow"],
          },
          {
            account: "google",
            with: ["samantha"],
            subject: t.threads.orchardInquiry.subject,
            state: "open",
            latestMinutesAgo: 22 * 60,
            messages: thread("orchardInquiry", ["samantha", "self"]),
          },
          {
            account: "google",
            with: ["ben"],
            subject: t.threads.greenmileKickoff.subject,
            state: "open",
            latestMinutesAgo: 7 * 24 * 60,
            messages: thread("greenmileKickoff", ["ben", "self"]),
            links: ["organization:greenmile"],
          },
        ],
        calendar: {
          name: t.calendar.name,
          events: [
            {
              title: t.calendar.events[0],
              with: ["diane", "kevin"],
              startsMinutesAgo: -6 * 24 * 60,
              durationMinutes: 60,
            },
            { title: t.calendar.events[1], with: ["laura"], startsMinutesAgo: -24 * 60, durationMinutes: 30 },
            {
              title: t.calendar.events[2],
              with: ["michael", "erin"],
              startsMinutesAgo: -3 * 24 * 60,
              durationMinutes: 45,
            },
            { title: t.calendar.events[3], with: ["jake"], startsMinutesAgo: 2 * 24 * 60, durationMinutes: 60 },
          ],
        },
      },
      files: [
        file("tidewellBrief", "deal:tidewellIdentity", "deal.documents", 26),
        file("tidewellProposal", "deal:tidewellIdentity", "deal.documents", 2),
        file("meridianProposal", "deal:meridianBrand", "deal.documents", 8),
        { ...file("harlowBrief", "deal:harlowSpring", "deal.documents", 17), kind: "docx" },
        file("harlowAgreement", "retainer:harlowRetainer", "retainer.signedAgreement", 290),
        file("brambleAgreement", "retainer:brambleRetainer", "retainer.signedAgreement", 190),
        file("greenmileAgreement", "retainer:greenmileRetainer", "retainer.signedAgreement", 11),
      ],
      planner: {
        sources: [
          { list: "project", date: "productionWindow", color: "info" },
          {
            list: "deal",
            date: "pitchPresentation",
            filters: [{ field: "stage", notIn: ["lost"] }],
            color: "warning",
          },
          { list: "retainer", date: "renewalDate", filters: [{ field: "status", notIn: ["ended"] }], color: "success" },
        ],
        connectedCalendar: true,
        mode: "month",
      },
      trash: [
        { list: "contact", name: t.trash.contact, daysAgo: 4 },
        { list: "deal", name: t.trash.deal, daysAgo: 13 },
      ],
      mateChats: [
        {
          title: t.mate.title,
          endedHoursAgo: 3,
          messages: [
            { role: "user", text: t.mate.question },
            { role: "assistant", text: t.mate.answer },
          ],
        },
      ],
    };
  },
});
