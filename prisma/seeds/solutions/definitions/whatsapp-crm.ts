import { DisplayType } from "@/features/widget/widget-display.schema";

import {
  address,
  at,
  day,
  defineSolution,
  photo,
  type FileSpec,
  type RecordSpec,
  type RoutineSpec,
  type ThreadSpec,
  phoneNumber,
} from "../define-solution";

/**
 * WhatsApp customers: a small workshop that builds and installs counters, seating, shelving and office furniture for
 * cafés, restaurants and offices. Most customers message the owner on WhatsApp. The chats come from Max's own WhatsApp
 * account connected through the inbox; a person links each chat to the project or customer it is about, and one new
 * chat is not linked yet. A chat status on each contact shows who waits for an answer, projects carry their value
 * directly and calculate the lead time from the accepted offer to the installation, and two routines prepare drafts
 * and tasks without sending anything.
 */

const ORGANIZATIONS = [
  "copper",
  "marlowe",
  "ninebean",
  "riverbend",
  "lantern",
  "greyline",
  "saltpine",
  "brightwell",
  "fieldstone",
  "linden",
  "hearth",
  "oakleaf",
] as const;
type OrganizationKey = (typeof ORGANIZATIONS)[number];
const CONTACTS = [
  "claire",
  "leo",
  "tom",
  "nina",
  "jake",
  "priya",
  "rachel",
  "victor",
  "sal",
  "maya",
  "jordan",
  "karen",
  "mike",
  "helen",
  "tyler",
  "rosa",
  "ana",
  "ben",
] as const;
type ContactKey = (typeof CONTACTS)[number];
const DEALS = [
  "copperCounter",
  "marloweBenches",
  "ninebeanBar",
  "lindenCafe",
  "riverbendBooths",
  "riverbendKitchen",
  "lanternSeating",
  "greylineReception",
  "saltpineBar",
  "brightwellOffice",
  "fieldstoneLibrary",
  "hearthShelves",
  "lindenDisplay",
  "hearthCounter",
  "oakleafReception",
  "copperBench",
  "oakleafStorage",
] as const;
type DealKey = (typeof DEALS)[number];
const TASKS = [
  "walnutSample",
  "benchDrawing",
  "ninebeanVisit",
  "boothInstall",
  "wobblyTable",
  "lanternFollowUp",
  "linkSaltpine",
  "saltpineVisit",
  "brightwellLayout",
  "greylineFinish",
] as const;
type TaskKey = (typeof TASKS)[number];
type ThreadKey = "copper" | "marlowe" | "ninebean" | "riverbend" | "linden" | "saltpine" | "brightwell" | "greyline";
type RoutineKey = "unknownSenders" | "morningChats";

const en = {
  company: "Birch & Bolt Workshop",
  workspaceName: "WhatsApp CRM",
  website: "https://birchandbolt.example",
  phones: { mobile: { templates: ["+1 412 555 01##"], start: 10 } },
  selfTitle: "Owner",
  lists: {
    organization: ["Customer", "Customers", "Cafés, restaurants, shops and offices we build for or talk to."],
    contact: ["Contact", "Contacts", "Owners, managers and architects we work with, with the status of their chat."],
    deal: ["Project", "Projects", "Jobs from the first message through the offer to the installation."],
    task: ["Task", "Tasks", "Next actions with a due date."],
  },
  fields: {
    venueType: "Venue type",
    customerStatus: "Customer status",
    address: "Address",
    website: "Website",
    jobTitle: "Job title",
    preferredChannel: "Preferred channel",
    chatStatus: "Chat status",
    projectType: "Project type",
    source: "Source",
    closeDate: "Expected decision",
    nextStep: "Next step",
    nextStepDate: "Next step date",
    openingDate: "Opening date",
    installationDate: "Installation date",
    siteVisit: "Site visit",
    drawingsAndPhotos: "Drawings and photos",
    offerAccepted: "Offer accepted",
    leadTime: "Lead time (days)",
    lostReason: "Lost reason",
    dueDate: "Due date",
    priority: "Priority",
  },
  options: {
    venueType: { cafe: "Café", restaurant: "Restaurant", office: "Office", shop: "Shop or bakery" },
    customerStatus: { prospect: "Prospect", customer: "Customer", former: "Former customer" },
    preferredChannel: { whatsapp: "WhatsApp", email: "Email", call: "Phone call" },
    chatStatus: {
      new: "New message",
      waitingForUs: "Waiting for us",
      waitingForCustomer: "Waiting for customer",
      done: "Done",
    },
    projectType: {
      counter: "Counter and bar",
      seating: "Seating",
      shelving: "Shelving and display",
      office: "Office furniture",
    },
    source: { referral: "Referral", whatsapp: "WhatsApp message", website: "Website", existing: "Existing customer" },
    lostReason: { price: "Price", timing: "Timing", otherWorkshop: "Went with another workshop" },
    priority: { low: "Low", medium: "Medium", high: "High" },
  },
  stages: {
    inquiry: "New inquiry",
    siteVisit: "Site visit",
    drawings: "Drawings shared",
    offerSent: "Offer sent",
    won: "Won",
    lost: "Lost",
  },
  organizations: {
    copper: ["Copper Kettle Café", "Pittsburgh", "copperkettle-cafe.example"],
    marlowe: ["Marlowe's Bistro", "Pittsburgh", "marlowes-bistro.example"],
    ninebean: ["Nine Bean Roasters", "Sewickley", "ninebean.example"],
    riverbend: ["Riverbend Coworking", "Pittsburgh", "riverbend-cowork.example"],
    lantern: ["Lantern Street Pizzeria", "Mt. Lebanon", "lanternstreet-pizza.example"],
    greyline: ["Greyline Architects", "Pittsburgh", "greyline-architects.example"],
    saltpine: ["Salt & Pine Kitchen", "Pittsburgh", "saltandpine.example"],
    brightwell: ["Brightwell Insurance Agency", "Bethel Park", "brightwell-insurance.example"],
    fieldstone: ["Fieldstone Law", "Pittsburgh", "fieldstone-law.example"],
    linden: ["Linden Corner Bakery", "Sewickley", "lindencorner.example"],
    hearth: ["Hearth & Crumb Bakery", "Pittsburgh", "hearthandcrumb.example"],
    oakleaf: ["Oakleaf Dental Studio", "Wexford", "oakleaf-dental.example"],
  } satisfies Record<OrganizationKey, readonly [string, string, string]>,
  contacts: {
    claire: ["Claire", "Donovan", "Owner"],
    leo: ["Leo", "Martin", "Head barista"],
    tom: ["Tom", "Marlowe", "Chef and owner"],
    nina: ["Nina", "Alvarez", "Restaurant manager"],
    jake: ["Jake", "Harmon", "Co-founder"],
    priya: ["Priya", "Nair", "Head of coffee"],
    rachel: ["Rachel", "Kim", "Community manager"],
    victor: ["Victor", "Lane", "Facilities manager"],
    sal: ["Sal", "Russo", "Owner"],
    maya: ["Maya", "Patel", "Project architect"],
    jordan: ["Jordan", "Ellis", "Chef and owner"],
    karen: ["Karen", "Whitfield", "Office manager"],
    mike: ["Mike", "Brennan", "Agency principal"],
    helen: ["Helen", "Ashworth", "Managing partner"],
    tyler: ["Tyler", "Wade", "Office administrator"],
    rosa: ["Rosa", "Delgado", "Owner"],
    ana: ["Ana", "Costa", "Owner"],
    ben: ["Ben", "Archer", "Practice manager"],
  } satisfies Record<ContactKey, readonly [string, string, string]>,
  deals: {
    copperCounter: ["Copper Kettle – new counter and back bar", "Drop off the walnut sample and confirm the top"],
    marloweBenches: ["Marlowe's – terrace benches with planters", "Send the revised bench drawing with storage"],
    ninebeanBar: [
      "Nine Bean – brew bar and window seating",
      "Site visit with Jake and Priya, measure the brew bar wall",
    ],
    lindenCafe: ["Linden Corner – café corner with window seating", "Measure the window corner with Rosa"],
    riverbendBooths: ["Riverbend – phone booth desks for the second floor", "Installation day with Victor"],
    riverbendKitchen: ["Riverbend – community kitchen counter", "Measure the kitchen during the booth installation"],
    lanternSeating: ["Lantern Street – booth seating refurbishment", "Sal confirms the two-step installation"],
    greylineReception: ["Greyline – reception desk for a client office", "Get the laminate finish code from Maya"],
    saltpineBar: ["Salt & Pine – bar front and back shelving", "Book a site visit with Jordan"],
    brightwellOffice: [
      "Brightwell – desks and storage for 12 workstations",
      "Send the updated offer with four standing desks",
    ],
    fieldstoneLibrary: ["Fieldstone Law – library shelving and meeting table", "Closed lost"],
    hearthShelves: ["Hearth & Crumb – wall shelves for bread", "Closed lost"],
    lindenDisplay: ["Linden Corner – bread display and counter", "Installed"],
    hearthCounter: ["Hearth & Crumb – shop counter with pastry display", "Installed"],
    oakleafReception: ["Oakleaf Dental – reception desk and waiting area", "Installed"],
    copperBench: ["Copper Kettle – window bench with cushions", "Installed"],
    oakleafStorage: ["Oakleaf Dental – storage wall for the treatment rooms", "Installation booked"],
  } satisfies Record<DealKey, readonly [string, string]>,
  tasks: {
    walnutSample: "Drop off the walnut sample at Copper Kettle",
    benchDrawing: "Revise the terrace bench drawing for Marlowe's",
    ninebeanVisit: "Site visit at Nine Bean: measure the brew bar wall",
    boothInstall: "Plan the booth installation day with Victor",
    wobblyTable: "Fix the wobbly table leg at Riverbend",
    lanternFollowUp: "Follow up with Sal about the booth seating offer",
    linkSaltpine: "Link Jordan's WhatsApp chat to the Salt & Pine opportunity",
    saltpineVisit: "Book a site visit at Salt & Pine",
    brightwellLayout: "Check the 12-desk layout against Brightwell's floor plan",
    greylineFinish: "Ask Greyline for the laminate finish code",
  } satisfies Record<TaskKey, string>,
  views: {
    pipeline: "Pipeline",
    chats: "Chats to answer",
    installations: "Installations and openings",
    customers: "Customers",
    dueSoon: "Due soon",
    workshopCalendar: "Workshop calendar",
  },
  widgets: {
    openPipeline: "Open pipeline",
    won: "Won in the last 12 months",
    awaitingReply: "Chats awaiting our reply",
    leadTime: "Average lead time (days)",
    byStage: "Pipeline by stage",
    chatsByStatus: "Chats by status",
    leadTimeByType: "Lead time by project type (days)",
    wonByMonth: "Won value by month",
    siteVisits: "Site visits, next 14 days",
    nextStepsMonth: "Next steps this month",
  },
  wiki: {
    guide: {
      title: "Operating Guide",
      markdown: [
        "Birch & Bolt Workshop builds and installs counters, seating, shelving and office furniture for cafés, restaurants and offices around Pittsburgh. This workspace is demo data; every company and person in it is fictional.",
        "",
        "## How we use the CRM",
        "- **Customers** are the cafés, restaurants, shops and offices we build for or talk to. **Contacts** are the people there; most have a mobile number because they prefer WhatsApp.",
        "- Every contact has a **Chat status**: New message, Waiting for us, Waiting for customer or Done. We set it by hand, and the board Chats to answer shows who is waiting for us.",
        "- **Projects** are jobs from the first message to the installation. The stage shows where the job stands; the value is typed in from our offer. The lead time is calculated from the day the offer was accepted to the installation date.",
        "- **Tasks** are next actions with a due date. Tasks and next step dates are ordinary fields: nobody is reminded automatically, so check the Pipeline and Due soon views every morning.",
        "",
        "## WhatsApp and email",
        "- The WhatsApp chats come from Max's own WhatsApp account, connected in the inbox. It is his normal account, not a business API connection.",
        "- Every message is written and sent by a person, one chat at a time.",
        "- A chat belongs to a project or customer only when someone links it. Nothing is linked automatically: the new chat with Jordan from Salt & Pine is not linked yet.",
        "- Emails from Max's mailbox and the café messages on Instagram work the same way.",
        "",
        "## Routines",
        "- **Flag messages from unknown contacts** creates a task when a message comes from a number that matches no contact.",
        "- **Morning chat summary** lists the chats waiting for us and saves reply drafts. Max reads every draft and sends it himself; routines never send.",
        "",
        "## Working rules",
        "- Every open project has a next step and a next step date.",
        "- After answering a chat, update the contact's chat status.",
        "- What we agree in a chat (measurements, wood, dates) also goes into the project notes.",
        "- Photos, drawings and offers sit as files on the project; accounting stays in its own tool.",
      ],
    },
    process: {
      title: "Sales Process",
      markdown: [
        "Every job moves through the same stages, from the first WhatsApp message or email to the installation on site.",
        "",
        "## Stages",
        "1. **New inquiry:** someone messages or emails about a job. Add the customer, the person and the project.",
        "2. **Site visit:** we measure on site and note what the customer wants.",
        "3. **Drawings shared:** we send a drawing and agree on materials and dimensions.",
        "4. **Offer sent:** the price is in the offer and typed into the project value.",
        "5. **Won or Lost:** record the outcome. When won, enter the day the offer was accepted and the installation date; when lost, the reason.",
      ],
    },
    whatsappToOpportunity: {
      title: "From WhatsApp chat to project",
      whenToUse: "When a customer or a new contact writes to Max on WhatsApp about a job.",
      markdown: [
        "New jobs usually start as a WhatsApp chat on Max's phone. This is how a chat becomes a project the team can see.",
        "",
        "## Steps",
        "1. Open the chat in the inbox and check whether the person is already a contact. If not, add the contact with the mobile number and the customer.",
        "2. If the chat is about a new job, create the project in New inquiry with a next step and a next step date.",
        "3. Link the chat to the project, and to the customer when it concerns the customer in general.",
        "4. Copy agreed measurements, materials and dates from the chat into the project.",
        "5. Set the contact's chat status to Waiting for customer once you have answered.",
      ],
    },
    siteVisit: {
      title: "Site visit checklist",
      whenToUse: "When a project moves to Site visit and Max goes to measure at the customer's premises.",
      markdown: [
        "A site visit decides whether the drawing fits on the first try. Take this list to every visit and note the results in the project.",
        "",
        "## Before the visit",
        "1. Confirm the time in the chat and ask who decides on materials.",
        "2. Read the project notes and the chat for wishes and photos the customer already sent.",
        "",
        "## On site",
        "1. Measure walls, floor height differences, sockets, water and drains.",
        "2. Check access: doors, stairs and parking for delivery.",
        "3. Ask about the opening date and the days the venue can close for the installation.",
        "",
        "## Afterwards",
        "1. Enter the measurements and wishes in the project notes and move the project to Drawings shared once the drawing is out.",
        "2. Set the next step and its date, and create a task for every promise made on site.",
      ],
    },
  },
  threads: {
    copper: {
      messages: [
        "Hi Max! The inspection went fine, so the opening date we planned is confirmed. Does the counter installation still work for the week before?",
        "Great news, Claire! Yes, we can install on the Monday and Tuesday before. I just need your choice of top: oak or walnut.",
        "Walnut. Leo votes for oak, but I'm the one paying 😄",
        "Walnut it is. I'll drop off a sample tomorrow so you can see it next to the tiles.",
        "Perfect, I'm here from 7.",
      ],
    },
    marlowe: {
      name: "Marlowe's terrace benches",
      messages: [
        "Hi both, a quick summary of Friday's visit: two benches along the wall, 3.2 m each, with storage for cushions underneath. The drawing follows by Thursday.",
        "Thanks Max. Can the benches take planters at each end like we discussed?",
        "Yes, I'll draw planter boxes at both ends, lined for outdoor use.",
        "One thing from me: we stack the chairs in that corner at closing, so please leave about 60 cm free.",
        "Noted, Nina. I'll mark the gap on the drawing.",
      ],
    },
    ninebean: {
      messages: [
        "Max, the roaster arrives earlier than planned. Could the site visit move to this week?",
        "Sure. Thursday 8 am before you open? I'll bring the laser measure and we can mark the brew bar on the wall.",
        "Thursday works. Priya will be there too, she has opinions about the bar height 😅",
        "Good, that's exactly what we need to settle.",
      ],
    },
    riverbend: {
      messages: [
        "Hi Max, one of the long tables you built for us last year has a wobbly leg. Not urgent, but members noticed.",
        "Thanks for telling me, Rachel. I'm at Riverbend for the booth installation anyway, I'll fix it the same day.",
        "Amazing, thank you!",
      ],
    },
    linden: {
      messages: [
        "Hi Max, we love the bread display you built! We want to turn the window corner into a small café corner with seating. Could you have a look?",
        "Hi Rosa, thank you! Happy to. Would Wednesday morning work for measuring the corner?",
        "Wednesday at 9 is perfect, before the second bake.",
      ],
    },
    saltpine: {
      messages: [
        "Hi, I got your number from Claire at Copper Kettle. We're redoing the bar front and the shelving behind it at Salt & Pine. Do you do this kind of work?",
        "Hi Jordan, yes, that's exactly what we do. Could I come by for a quick look and measure? Early next week works for me.",
        "Tuesday afternoon after lunch service?",
      ],
    },
    brightwell: {
      subject: "Offer for 12 workstations",
      messages: [
        "Hello Max,\n\nThank you for the offer for the desks and storage. Mike would like to know whether four of the twelve desks can be height-adjustable.\n\nBest regards,\nKaren Whitfield",
        "Hello Karen,\n\nYes, we can fit four height-adjustable frames with the same oak tops, so the room still looks consistent. I will send an updated offer by Friday.\n\nBest regards,\nMax",
        "Thank you. Please also list delivery and assembly separately, our finance team asks for that.",
        "Hello Karen,\n\nThe updated offer now has four height-adjustable desks, and delivery and assembly are listed separately. Everything else is unchanged.\n\nBest regards,\nMax",
      ],
    },
    greyline: {
      subject: "Reception desk – finish and dimensions",
      messages: [
        "Hi Max,\n\nFor a client's new office we need a reception desk, about 2.4 m wide, with a lowered section for wheelchair users. Could you price it with the laminate from our finish schedule?\n\nThanks,\nMaya",
        "Hi Maya,\n\nHappy to. Could you send me the laminate finish code? Then I can check availability and come back with a drawing and a price.\n\nBest,\nMax",
      ],
    },
  } satisfies Record<ThreadKey, { name?: string; subject?: string; messages: string[] }>,
  routines: {
    unknownSenders: {
      name: "Flag messages from unknown contacts",
      task: "Review the inbound message identified by routine_trigger and match its sender through accessible CRM identity channels. If the sender has no matching contact, create one ordinary task asking Max to review the unknown sender, with only the necessary message context in its notes. Avoid a duplicate task for the same conversation. Do not create a contact from unverified message content, alter identities or send a message.",
      runs: [
        "The sender matched the contact Jordan Ellis at Salt & Pine Kitchen, so no task was needed.",
        "Created 1 task to review a WhatsApp message from a number that matches no contact.",
      ],
      failure:
        "I could not reach the model provider on this attempt, so I stopped before reading or changing anything. Nothing was modified.",
    },
    morningChats: {
      name: "Morning chat summary",
      task: "Every morning, list the contacts whose Chat status is Waiting for us or New message, newest message first. For each, read the latest conversation with the available messaging tools and the linked project, and save one short reply draft with save_message_draft when the request is clear. Keep existing drafts. Never send a message and change no CRM record: Max reviews and sends every draft himself. Report the chats, what each customer asked and whether a draft was saved.",
      runs: [
        "3 chats are waiting for us: Claire at Copper Kettle, Tom at Marlowe's and Jake at Nine Bean. Saved 2 reply drafts for review.",
        "2 chats were waiting for us. Saved 1 reply draft; Rachel's message needs a decision on the visit date first.",
      ],
      failure:
        "I could not reach the model provider on this attempt, so I stopped before reading anything. No draft was saved.",
    },
  } satisfies Record<RoutineKey, { name: string; task: string; runs: string[]; failure: string }>,
  countryCode: "us",
  addresses: {
    copper: ["3721 Butler Street", "15201", "PA", 40.4718, -79.9589],
    marlowe: ["1820 Penn Avenue", "15222", "PA", 40.4497, -79.9932],
    ninebean: ["412 Beaver Street", "15143", "PA", 40.5368, -80.1843],
    riverbend: ["2100 East Carson Street", "15203", "PA", 40.4284, -79.9762],
    lantern: ["650 Washington Road", "15228", "PA", 40.3739, -80.0452],
    greyline: ["301 Grant Street", "15219", "PA", 40.4406, -79.9959],
    saltpine: ["5900 Penn Avenue", "15206", "PA", 40.4669, -79.9221],
    brightwell: ["5280 Library Road", "15102", "PA", 40.3243, -80.0394],
    fieldstone: ["436 Seventh Avenue", "15219", "PA", 40.4417, -79.9981],
    linden: ["520 Broad Street", "15143", "PA", 40.5379, -80.182],
    hearth: ["4600 Liberty Avenue", "15224", "PA", 40.464, -79.9483],
    oakleaf: ["10500 Perry Highway", "15090", "PA", 40.6262, -80.0557],
  } satisfies Record<OrganizationKey, readonly [string, string, string, number, number]>,
  files: {
    copperDrawing: {
      name: "Counter drawing v2.pdf",
      lines: [
        "# Copper Kettle Café: counter and back bar, drawing v2",
        "Revised after the site visit with Claire and Leo. Counter front in oak veneer with a black steel kick plate; top in solid walnut, as Claire chose in the chat.",
        "## Dimensions",
        "| Part | Size | Material |",
        "| Counter | 4.20 m × 0.75 m, height 1.05 m | Oak veneer front, walnut top |",
        "| Pastry display niche | 1.20 m wide | Walnut, glass front |",
        "| Back bar | 3.60 m, two open shelves | Oak veneer, steel brackets |",
        "## Site notes",
        "Water and drain under the left end. Leave 90 cm between counter and back bar for two baristas.",
      ],
    },
    copperOffer: {
      name: "Offer – copper counter.pdf",
      lines: [
        "# Offer: new counter and back bar for Copper Kettle Café",
        "Built in our workshop and installed on the Monday and Tuesday before the opening.",
        "## Price",
        "| Item | Price |",
        "| Counter, oak veneer front with walnut top | $8,900 |",
        "| Back bar with shelves | $3,700 |",
        "| Pastry display niche | $1,200 |",
        "| Delivery and installation | $1,000 |",
        "| Total | $14,800 |",
        "Valid for 30 days. 40% deposit on order, the rest after installation.",
      ],
    },
    marloweDrawing: {
      name: "Terrace benches drawing.pdf",
      lines: [
        "# Marlowe's Bistro: terrace benches with planters",
        "Two benches along the terrace wall with cushion storage underneath and lined planter boxes at both ends.",
        "## Dimensions",
        "| Part | Size | Material |",
        "| Bench | 2 × 3.20 m, seat height 45 cm | Thermo-treated ash |",
        "| Planter box | 4 × 50 cm, lined | Ash with oak veneer trim inside the storage lids |",
        "| Free corner | 60 cm for stacked chairs | – |",
        "## Price",
        "Benches, planters, delivery and installation: $9,600.",
      ],
    },
    brightwellOffer: {
      name: "Offer – 12 workstations.pdf",
      lines: [
        "# Offer: desks and storage for Brightwell Insurance Agency",
        "Updated offer: four of the twelve desks are height-adjustable, all with the same oak veneer tops.",
        "## Price",
        "| Item | Quantity | Price |",
        "| Desk, fixed height, oak veneer top | 8 | $6,400 |",
        "| Desk, height-adjustable, oak veneer top | 4 | $5,200 |",
        "| Storage cabinets | 6 | $3,900 |",
        "| Delivery and assembly | 1 | $1,400 |",
        "| Total |  | $16,900 |",
      ],
    },
  },
  trash: { contact: "Claire Donovan (duplicate)", deal: "Hearth & Crumb – window bench" },
  mateChat: {
    title: "Café counter photo from Claire",
    messages: [
      "Here is the photo Claire sent of the café counter. Add it to the Copper counter project and draft a reply with two site-visit slots.",
      'I added the photo to Drawings and photos on "Copper Kettle – new counter and back bar" ($14,800, offer sent). The project already has the counter drawing v2 (oak veneer front, walnut top) and two more site photos.\n\nI saved this reply as a draft in your WhatsApp chat with Claire; it is not sent:\n\n"Hi Claire, thanks for the photo! I\'d like to check the wall behind the back bar before we build. Would Thursday at 7:30 or Friday at 7:30 work, before you open? It takes about 30 minutes."\n\nOnce Claire picks a slot, set the Site visit on the project so it shows on the dashboard.',
    ],
  },
};

type Strings = typeof en;

const de: Strings = {
  company: "Tischlerei Birkenholz",
  workspaceName: "WhatsApp-CRM",
  website: "https://tischlerei-birkenholz.example",
  phones: { mobile: { templates: ["+49 30 23125 ###"], start: 110 } },
  selfTitle: "Inhaber und Tischlermeister",
  lists: {
    organization: [
      "Kunde",
      "Kunden",
      "Cafés, Restaurants, Läden und Büros, für die wir bauen oder mit denen wir sprechen.",
    ],
    contact: [
      "Kontakt",
      "Kontakte",
      "Inhaber, Betriebsleitungen und Architekten, mit denen wir arbeiten, mit dem Status ihres Chats.",
    ],
    deal: ["Auftrag", "Aufträge", "Aufträge von der ersten Nachricht über das Angebot bis zur Montage."],
    task: ["Aufgabe", "Aufgaben", "Nächste Schritte mit Fälligkeitsdatum."],
  },
  fields: {
    venueType: "Art des Betriebs",
    customerStatus: "Kundenstatus",
    address: "Adresse",
    website: "Website",
    jobTitle: "Position",
    preferredChannel: "Bevorzugter Kanal",
    chatStatus: "Chat-Status",
    projectType: "Art des Auftrags",
    source: "Quelle",
    closeDate: "Erwartete Entscheidung",
    nextStep: "Nächster Schritt",
    nextStepDate: "Datum nächster Schritt",
    openingDate: "Eröffnungstermin",
    installationDate: "Montagetermin",
    siteVisit: "Aufmaßtermin",
    drawingsAndPhotos: "Zeichnungen und Fotos",
    offerAccepted: "Angebot angenommen",
    leadTime: "Vorlaufzeit (Tage)",
    lostReason: "Verlustgrund",
    dueDate: "Fällig am",
    priority: "Priorität",
  },
  options: {
    venueType: { cafe: "Café", restaurant: "Restaurant", office: "Büro", shop: "Laden oder Bäckerei" },
    customerStatus: { prospect: "Interessent", customer: "Kunde", former: "Ehemaliger Kunde" },
    preferredChannel: { whatsapp: "WhatsApp", email: "E-Mail", call: "Anruf" },
    chatStatus: {
      new: "Neue Nachricht",
      waitingForUs: "Wartet auf uns",
      waitingForCustomer: "Wartet auf Kunden",
      done: "Erledigt",
    },
    projectType: {
      counter: "Theke und Bar",
      seating: "Sitzbänke und Sitzplätze",
      shelving: "Regale und Auslagen",
      office: "Büromöbel",
    },
    source: { referral: "Empfehlung", whatsapp: "WhatsApp-Nachricht", website: "Website", existing: "Bestandskunde" },
    lostReason: { price: "Preis", timing: "Zeitpunkt", otherWorkshop: "Andere Werkstatt beauftragt" },
    priority: { low: "Niedrig", medium: "Mittel", high: "Hoch" },
  },
  stages: {
    inquiry: "Neue Anfrage",
    siteVisit: "Aufmaß vor Ort",
    drawings: "Entwurf geschickt",
    offerSent: "Angebot gesendet",
    won: "Gewonnen",
    lost: "Verloren",
  },
  organizations: {
    copper: ["Café Kupferkessel", "Berlin", "cafe-kupferkessel.example"],
    marlowe: ["Bistro Marlene", "Berlin", "bistro-marlene.example"],
    ninebean: ["Röstbar Neunbohne", "Potsdam", "neunbohne.example"],
    riverbend: ["Coworking Spreebogen", "Berlin", "spreebogen-coworking.example"],
    lantern: ["Pizzeria Laternenhof", "Berlin", "pizzeria-laternenhof.example"],
    greyline: ["Graulinie Architekten", "Berlin", "graulinie-architekten.example"],
    saltpine: ["Restaurant Salz & Kiefer", "Berlin", "salzundkiefer.example"],
    brightwell: ["Versicherungsbüro Hellbrunn", "Teltow", "hellbrunn-versicherungen.example"],
    fieldstone: ["Kanzlei Feldstein", "Berlin", "kanzlei-feldstein.example"],
    linden: ["Bäckerei Lindeneck", "Potsdam", "baeckerei-lindeneck.example"],
    hearth: ["Backstube Herdfeuer", "Berlin", "backstube-herdfeuer.example"],
    oakleaf: ["Zahnarztpraxis Eichblatt", "Kleinmachnow", "praxis-eichblatt.example"],
  },
  contacts: {
    claire: ["Clara", "Dorn", "Inhaberin"],
    leo: ["Leo", "Schulz", "Barista"],
    tom: ["Thomas", "Merz", "Koch und Inhaber"],
    nina: ["Nina", "Albrecht", "Restaurantleitung"],
    jake: ["Jakob", "Hartung", "Mitgründer"],
    priya: ["Pia", "Neumann", "Leitung Kaffee"],
    rachel: ["Rahel", "Kühn", "Community-Managerin"],
    victor: ["Viktor", "Lang", "Haustechnik"],
    sal: ["Salvatore", "Russo", "Inhaber"],
    maya: ["Maja", "Petersen", "Projektarchitektin"],
    jordan: ["Jonas", "Ehlers", "Koch und Inhaber"],
    karen: ["Karin", "Weber", "Büroleitung"],
    mike: ["Martin", "Bremer", "Agenturinhaber"],
    helen: ["Helene", "Feldstein", "Geschäftsführende Partnerin"],
    tyler: ["Tobias", "Wendt", "Büroorganisation"],
    rosa: ["Rosa", "Lindner", "Inhaberin"],
    ana: ["Anna", "Kaiser", "Inhaberin"],
    ben: ["Benedikt", "Arndt", "Praxismanager"],
  },
  deals: {
    copperCounter: [
      "Café Kupferkessel – neue Theke und Rückbuffet",
      "Nussbaum-Muster vorbeibringen und Platte festlegen",
    ],
    marloweBenches: [
      "Bistro Marlene – Terrassenbänke mit Pflanzkästen",
      "Überarbeitete Bankzeichnung mit Stauraum schicken",
    ],
    ninebeanBar: [
      "Röstbar Neunbohne – Brühbar und Fensterplätze",
      "Aufmaß mit Jakob und Pia, Wand für die Brühbar ausmessen",
    ],
    lindenCafe: ["Bäckerei Lindeneck – Café-Ecke mit Fensterplätzen", "Fensterecke mit Rosa ausmessen"],
    riverbendBooths: ["Coworking Spreebogen – Telefonkabinen-Tische im 2. OG", "Montagetag mit Viktor"],
    riverbendKitchen: [
      "Coworking Spreebogen – Theke für die Gemeinschaftsküche",
      "Küche bei der Kabinenmontage ausmessen",
    ],
    lanternSeating: [
      "Pizzeria Laternenhof – Sitznischen neu polstern",
      "Salvatore bestätigt die Montage in zwei Schritten",
    ],
    greylineReception: [
      "Graulinie Architekten – Empfangstresen für ein Kundenbüro",
      "Dekorcode des Laminats von Maja holen",
    ],
    saltpineBar: ["Salz & Kiefer – Barfront und Rückregal", "Aufmaßtermin mit Jonas vereinbaren"],
    brightwellOffice: [
      "Versicherungsbüro Hellbrunn – Tische und Schränke für 12 Arbeitsplätze",
      "Neues Angebot mit vier Steh-Sitz-Tischen senden",
    ],
    fieldstoneLibrary: ["Kanzlei Feldstein – Bibliotheksregal und Besprechungstisch", "Verloren"],
    hearthShelves: ["Backstube Herdfeuer – Wandregale für Brot", "Verloren"],
    lindenDisplay: ["Bäckerei Lindeneck – Brotregal und Verkaufstheke", "Montiert"],
    hearthCounter: ["Backstube Herdfeuer – Ladentheke mit Kuchenvitrine", "Montiert"],
    oakleafReception: ["Zahnarztpraxis Eichblatt – Empfang und Wartebereich", "Montiert"],
    copperBench: ["Café Kupferkessel – Fensterbank mit Polstern", "Montiert"],
    oakleafStorage: ["Zahnarztpraxis Eichblatt – Schrankwand für die Behandlungsräume", "Montage geplant"],
  },
  tasks: {
    walnutSample: "Nussbaum-Muster im Café Kupferkessel vorbeibringen",
    benchDrawing: "Bankzeichnung für das Bistro Marlene überarbeiten",
    ninebeanVisit: "Aufmaß in der Röstbar Neunbohne: Wand für die Brühbar",
    boothInstall: "Montagetag für die Kabinentische mit Viktor planen",
    wobblyTable: "Wackelndes Tischbein im Coworking Spreebogen reparieren",
    lanternFollowUp: "Bei Salvatore wegen des Angebots für die Sitznischen nachfragen",
    linkSaltpine: "WhatsApp-Chat mit Jonas mit dem Auftrag Salz & Kiefer verknüpfen",
    saltpineVisit: "Aufmaßtermin bei Salz & Kiefer vereinbaren",
    brightwellLayout: "Aufteilung der 12 Tische mit dem Grundriss von Hellbrunn abgleichen",
    greylineFinish: "Bei Graulinie den Dekorcode des Laminats erfragen",
  },
  views: {
    pipeline: "Pipeline",
    chats: "Chats zum Beantworten",
    installations: "Montagen und Eröffnungen",
    customers: "Kunden",
    dueSoon: "Bald fällig",
    workshopCalendar: "Werkstattkalender",
  },
  widgets: {
    openPipeline: "Offene Pipeline",
    won: "Gewonnen in 12 Monaten",
    awaitingReply: "Unbeantwortete Chats",
    leadTime: "Ø Vorlaufzeit (Tage)",
    byStage: "Pipeline nach Phase",
    chatsByStatus: "Chats nach Status",
    leadTimeByType: "Vorlaufzeit nach Auftragsart (Tage)",
    wonByMonth: "Gewonnener Wert pro Monat",
    siteVisits: "Aufmaßtermine, nächste 14 Tage",
    nextStepsMonth: "Nächste Schritte im Monat",
  },
  wiki: {
    guide: {
      title: "Leitfaden",
      markdown: [
        "Die Tischlerei Birkenholz baut und montiert Theken, Sitzbänke, Regale und Büromöbel für Cafés, Restaurants und Büros in Berlin und Potsdam. Dieser Arbeitsbereich enthält Demodaten; alle Firmen und Personen sind erfunden.",
        "",
        "## So nutzen wir das CRM",
        "- **Kunden** sind die Cafés, Restaurants, Läden und Büros, für die wir bauen oder mit denen wir sprechen. **Kontakte** sind die Menschen dort; die meisten haben eine Mobilnummer, weil sie lieber per WhatsApp schreiben.",
        "- Jeder Kontakt hat einen **Chat-Status**: Neue Nachricht, Wartet auf uns, Wartet auf Kunden oder Erledigt. Wir setzen ihn von Hand, und das Board „Chats zum Beantworten“ zeigt, wer auf uns wartet.",
        "- **Aufträge** reichen von der ersten Nachricht bis zur Montage. Die Phase zeigt, wo der Auftrag steht; den Wert tragen wir aus unserem Angebot von Hand ein. Die Vorlaufzeit wird vom Tag der Angebotsannahme bis zum Montagetermin berechnet.",
        "- **Aufgaben** sind nächste Schritte mit Fälligkeitsdatum. Aufgaben und das Datum des nächsten Schritts sind normale Felder: Niemand wird automatisch erinnert, deshalb jeden Morgen die Ansichten „Pipeline“ und „Bald fällig“ prüfen.",
        "",
        "## WhatsApp und E-Mail",
        "- Die WhatsApp-Chats kommen aus Max' eigenem WhatsApp-Konto, das im Posteingang verbunden ist. Es ist sein normales Konto, keine Anbindung über eine Business-API.",
        "- Jede Nachricht schreibt und sendet ein Mensch, ein Chat nach dem anderen.",
        "- Ein Chat gehört nur dann zu einem Auftrag oder Kunden, wenn jemand ihn verknüpft. Nichts wird automatisch verknüpft: Der neue Chat mit Jonas von Salz & Kiefer ist noch nicht verknüpft.",
        "- E-Mails aus Max' Postfach und die Café-Nachrichten auf Instagram funktionieren genauso.",
        "",
        "## Routinen",
        "- **Nachrichten unbekannter Absender markieren** legt eine Aufgabe an, wenn eine Nachricht von einer Nummer kommt, die zu keinem Kontakt passt.",
        "- **Chat-Übersicht am Morgen** listet die Chats, die auf uns warten, und speichert Antwortentwürfe. Max liest jeden Entwurf und sendet ihn selbst; Routinen senden nie.",
        "",
        "## Arbeitsregeln",
        "- Jeder offene Auftrag hat einen nächsten Schritt mit Datum.",
        "- Nach dem Antworten den Chat-Status des Kontakts aktualisieren.",
        "- Was wir im Chat vereinbaren (Maße, Holz, Termine), kommt auch in die Notizen des Auftrags.",
        "- Fotos, Zeichnungen und Angebote liegen als Dateien am Auftrag; Buchhaltung bleibt extern.",
      ],
    },
    process: {
      title: "Vertriebsprozess",
      markdown: [
        "Jeder Auftrag durchläuft dieselben Phasen, von der ersten WhatsApp-Nachricht oder E-Mail bis zur Montage vor Ort.",
        "",
        "## Phasen",
        "1. **Neue Anfrage:** Jemand schreibt per WhatsApp oder E-Mail wegen eines Auftrags. Kunde, Person und Auftrag anlegen.",
        "2. **Aufmaß vor Ort:** Wir messen vor Ort und notieren, was sich der Kunde wünscht.",
        "3. **Entwurf geschickt:** Wir schicken eine Zeichnung und stimmen Material und Maße ab.",
        "4. **Angebot gesendet:** Der Preis steht im Angebot und wird als Wert im Auftrag eingetragen.",
        "5. **Gewonnen oder Verloren:** Ergebnis festhalten. Bei Gewinn den Tag der Angebotsannahme und den Montagetermin eintragen, bei Verlust den Grund.",
      ],
    },
    whatsappToOpportunity: {
      title: "Vom WhatsApp-Chat zum Auftrag",
      whenToUse: "Wenn ein Kunde oder ein neuer Kontakt Max per WhatsApp wegen eines Auftrags schreibt.",
      markdown: [
        "Neue Aufträge beginnen meist als WhatsApp-Chat auf Max' Handy. So wird aus einem Chat ein Auftrag, den das ganze Team sieht.",
        "",
        "## Schritte",
        "1. Den Chat im Posteingang öffnen und prüfen, ob die Person schon als Kontakt angelegt ist. Wenn nicht, Kontakt mit Mobilnummer und Kunde anlegen.",
        "2. Geht es um einen neuen Auftrag, ihn in der Phase „Neue Anfrage“ mit nächstem Schritt und Datum anlegen.",
        "3. Den Chat mit dem Auftrag verknüpfen, und mit dem Kunden, wenn es um den Kunden allgemein geht.",
        "4. Vereinbarte Maße, Materialien und Termine aus dem Chat in den Auftrag übernehmen.",
        "5. Nach der Antwort den Chat-Status des Kontakts auf „Wartet auf Kunden“ setzen.",
      ],
    },
    siteVisit: {
      title: "Checkliste für das Aufmaß",
      whenToUse: "Wenn ein Auftrag in die Phase Aufmaß vor Ort wechselt und Max beim Kunden ausmessen fährt.",
      markdown: [
        "Das Aufmaß entscheidet, ob die Zeichnung beim ersten Mal passt. Diese Liste gehört zu jedem Termin, die Ergebnisse kommen in den Auftrag.",
        "",
        "## Vor dem Termin",
        "1. Uhrzeit im Chat bestätigen und fragen, wer über die Materialien entscheidet.",
        "2. Notizen des Auftrags und den Chat nach Wünschen und Fotos durchsehen, die der Kunde schon geschickt hat.",
        "",
        "## Vor Ort",
        "1. Wände, Höhenunterschiede im Boden, Steckdosen, Wasser und Abflüsse ausmessen.",
        "2. Zugang prüfen: Türen, Treppen und Parkplatz für die Anlieferung.",
        "3. Nach dem Eröffnungstermin fragen und nach den Tagen, an denen der Betrieb für die Montage schließen kann.",
        "",
        "## Danach",
        "1. Maße und Wünsche in die Notizen des Auftrags eintragen und ihn auf „Entwurf geschickt“ setzen, sobald die Zeichnung raus ist.",
        "2. Nächsten Schritt mit Datum setzen und für jedes Versprechen vor Ort eine Aufgabe anlegen.",
      ],
    },
  },
  threads: {
    copper: {
      messages: [
        "Hi Max! Die Abnahme ist durch, unser Eröffnungstermin steht also. Klappt die Montage der Theke noch in der Woche davor?",
        "Super Nachricht, Clara! Ja, wir können am Montag und Dienstag davor montieren. Ich brauche nur noch deine Entscheidung für die Platte: Eiche oder Nussbaum?",
        "Nussbaum. Leo ist für Eiche, aber ich zahle 😄",
        "Dann Nussbaum. Ich bringe dir morgen ein Muster vorbei, dann siehst du es neben den Fliesen.",
        "Perfekt, ich bin ab 7 da.",
      ],
    },
    marlowe: {
      name: "Terrassenbänke Bistro Marlene",
      messages: [
        "Hallo ihr zwei, kurz zusammengefasst vom Termin am Freitag: zwei Bänke an der Wand, je 3,20 m, mit Stauraum für die Kissen darunter. Die Zeichnung kommt bis Donnerstag.",
        "Danke, Max. Gehen an den Enden auch die Pflanzkästen, wie besprochen?",
        "Ja, ich zeichne an beiden Enden Pflanzkästen ein, mit Einsatz für draußen.",
        "Noch was von mir: Wir stapeln abends in der Ecke die Stühle, lass da bitte etwa 60 cm frei.",
        "Notiert, Nina. Ich trage die Lücke in die Zeichnung ein.",
      ],
    },
    ninebean: {
      messages: [
        "Max, der Röster kommt früher als geplant. Können wir das Aufmaß auf diese Woche vorziehen?",
        "Klar. Donnerstag um 8, bevor ihr aufmacht? Ich bringe den Laser mit, dann zeichnen wir die Brühbar direkt an der Wand an.",
        "Donnerstag passt. Pia ist auch da, sie hat klare Vorstellungen zur Höhe der Bar 😅",
        "Gut, genau das müssen wir klären.",
      ],
    },
    riverbend: {
      messages: [
        "Hi Max, einer der langen Tische, die du letztes Jahr für uns gebaut hast, wackelt. Nicht dringend, aber den Mitgliedern ist es aufgefallen.",
        "Danke für den Hinweis, Rahel. Ich bin für die Montage der Kabinentische sowieso bei euch und repariere ihn am selben Tag.",
        "Super, danke dir!",
      ],
    },
    linden: {
      messages: [
        "Hallo Max, wir lieben das Brotregal, das du gebaut hast! Jetzt wollen wir aus der Fensterecke eine kleine Café-Ecke mit Sitzplätzen machen. Schaust du dir das mal an?",
        "Hallo Rosa, danke dir! Sehr gern. Passt dir Mittwochvormittag zum Ausmessen?",
        "Mittwoch um 9 ist perfekt, vor dem zweiten Backen.",
      ],
    },
    saltpine: {
      messages: [
        "Hallo, ich hab deine Nummer von Clara vom Café Kupferkessel. Wir machen im Salz & Kiefer die Barfront und das Regal dahinter neu. Machst du so was?",
        "Hallo Jonas, ja, genau das machen wir. Kann ich kurz vorbeikommen und ausmessen? Anfang nächster Woche passt mir gut.",
        "Dienstagnachmittag nach dem Mittagsgeschäft?",
      ],
    },
    brightwell: {
      subject: "Angebot für 12 Arbeitsplätze",
      messages: [
        "Sehr geehrter Herr Bergmann,\n\nvielen Dank für Ihr Angebot für die Tische und Schränke. Herr Bremer möchte wissen, ob vier der zwölf Tische höhenverstellbar sein können.\n\nMit freundlichen Grüßen\nKarin Weber",
        "Sehr geehrte Frau Weber,\n\nja, wir können vier höhenverstellbare Gestelle mit denselben Eichenplatten einsetzen, dann bleibt der Raum einheitlich. Das angepasste Angebot schicke ich Ihnen bis Freitag.\n\nMit freundlichen Grüßen\nMax Bergmann",
        "Vielen Dank. Bitte führen Sie Lieferung und Montage getrennt auf, darum bittet unsere Buchhaltung.",
        "Sehr geehrte Frau Weber,\n\ndas angepasste Angebot enthält jetzt vier höhenverstellbare Tische, Lieferung und Montage sind getrennt aufgeführt. Alles andere bleibt unverändert.\n\nMit freundlichen Grüßen\nMax Bergmann",
      ],
    },
    greyline: {
      subject: "Empfangstresen – Oberfläche und Maße",
      messages: [
        "Sehr geehrter Herr Bergmann,\n\nfür das neue Büro eines Bauherrn brauchen wir einen Empfangstresen, etwa 2,40 m breit, mit einem abgesenkten Bereich für Rollstuhlnutzer. Können Sie ihn mit dem Laminat aus unserer Materialliste anbieten?\n\nViele Grüße\nMaja Petersen",
        "Sehr geehrte Frau Petersen,\n\ngern. Schicken Sie mir bitte den Dekorcode des Laminats? Dann prüfe ich die Verfügbarkeit und melde mich mit Zeichnung und Preis.\n\nViele Grüße\nMax Bergmann",
      ],
    },
  },
  routines: {
    unknownSenders: {
      name: "Nachrichten unbekannter Absender markieren",
      task: "Prüfe die eingegangene Nachricht aus routine_trigger und ordne den Absender über die zugänglichen Identitätskanäle im CRM zu. Gibt es keinen passenden Kontakt, lege eine normale Aufgabe an, in der Max gebeten wird, den unbekannten Absender zu prüfen, mit nur dem nötigen Kontext der Nachricht in den Notizen. Lege für dasselbe Gespräch keine zweite Aufgabe an. Lege keinen Kontakt aus ungeprüften Nachrichteninhalten an, ändere keine Identitäten und sende keine Nachricht.",
      runs: [
        "Der Absender passt zum Kontakt Jonas Ehlers vom Restaurant Salz & Kiefer, eine Aufgabe war nicht nötig.",
        "1 Aufgabe angelegt, um eine WhatsApp-Nachricht von einer Nummer ohne passenden Kontakt zu prüfen.",
      ],
      failure:
        "Ich konnte den Modellanbieter bei diesem Versuch nicht erreichen und habe angehalten, bevor ich etwas gelesen oder geändert habe. Nichts wurde verändert.",
    },
    morningChats: {
      name: "Chat-Übersicht am Morgen",
      task: "Liste jeden Morgen die Kontakte, deren Chat-Status „Wartet auf uns“ oder „Neue Nachricht“ ist, die neueste Nachricht zuerst. Lies für jeden das letzte Gespräch mit den verfügbaren Messaging-Werkzeugen und den verknüpften Auftrag, und speichere mit save_message_draft einen kurzen Antwortentwurf, wenn die Anfrage klar ist. Bestehende Entwürfe bleiben erhalten. Sende nie eine Nachricht und ändere keinen Datensatz im CRM: Max prüft und sendet jeden Entwurf selbst. Berichte die Chats, was jeder Kunde gefragt hat und ob ein Entwurf gespeichert wurde.",
      runs: [
        "3 Chats warten auf uns: Clara vom Café Kupferkessel, Thomas vom Bistro Marlene und Jakob von der Röstbar Neunbohne. 2 Antwortentwürfe zur Prüfung gespeichert.",
        "2 Chats warteten auf uns. 1 Antwortentwurf gespeichert; für Rahels Nachricht muss erst der Besuchstermin feststehen.",
      ],
      failure:
        "Ich konnte den Modellanbieter bei diesem Versuch nicht erreichen und habe angehalten, bevor ich etwas gelesen habe. Kein Entwurf wurde gespeichert.",
    },
  },
  countryCode: "de",
  addresses: {
    copper: ["Wrangelstraße 41", "10997", "Berlin", 52.5011, 13.4339],
    marlowe: ["Kastanienallee 12", "10435", "Berlin", 52.5378, 13.4086],
    ninebean: ["Lindenstraße 48", "14467", "Brandenburg", 52.3989, 13.0544],
    riverbend: ["Holzmarktstraße 25", "10243", "Berlin", 52.5118, 13.4232],
    lantern: ["Weserstraße 160", "12045", "Berlin", 52.483, 13.4369],
    greyline: ["Linienstraße 140", "10115", "Berlin", 52.5296, 13.3925],
    saltpine: ["Boxhagener Straße 76", "10245", "Berlin", 52.504, 13.4606],
    brightwell: ["Potsdamer Straße 30", "14513", "Brandenburg", 52.4011, 13.2701],
    fieldstone: ["Kurfürstendamm 52", "10707", "Berlin", 52.5, 13.3138],
    linden: ["Brandenburger Straße 19", "14467", "Brandenburg", 52.4006, 13.0558],
    hearth: ["Schönhauser Allee 98", "10439", "Berlin", 52.5485, 13.4126],
    oakleaf: ["Hohe Kiefer 14", "14532", "Brandenburg", 52.4013, 13.2268],
  },
  files: {
    copperDrawing: {
      name: "Thekenzeichnung v2.pdf",
      lines: [
        "# Café Kupferkessel: Theke und Rückbuffet, Zeichnung v2",
        "Überarbeitet nach dem Aufmaß mit Clara und Leo. Thekenfront in Eiche furniert (oak veneer) mit Sockelblende aus Schwarzstahl; Platte in massivem Nussbaum, wie Clara im Chat entschieden hat.",
        "## Maße",
        "| Teil | Maß | Material |",
        "| Theke | 4,20 m × 0,75 m, Höhe 1,05 m | Front Eiche furniert, Platte Nussbaum |",
        "| Kuchennische | 1,20 m breit | Nussbaum, Glasfront |",
        "| Rückbuffet | 3,60 m, zwei offene Böden | Eiche furniert, Stahlkonsolen |",
        "## Hinweise vom Aufmaß",
        "Wasser und Abfluss unter dem linken Ende. 90 cm Abstand zwischen Theke und Rückbuffet für zwei Baristas.",
      ],
    },
    copperOffer: {
      name: "Angebot – Kupfertheke.pdf",
      lines: [
        "# Angebot: neue Theke und Rückbuffet für das Café Kupferkessel",
        "Gefertigt in unserer Werkstatt, Montage am Montag und Dienstag vor der Eröffnung.",
        "## Preis",
        "| Position | Preis |",
        "| Theke, Front Eiche furniert, Platte Nussbaum | 8.900 € |",
        "| Rückbuffet mit Böden | 3.700 € |",
        "| Kuchennische | 1.200 € |",
        "| Lieferung und Montage | 1.000 € |",
        "| Summe | 14.800 € |",
        "Gültig 30 Tage. 40 % Anzahlung bei Auftrag, der Rest nach der Montage.",
      ],
    },
    marloweDrawing: {
      name: "Zeichnung Terrassenbänke.pdf",
      lines: [
        "# Bistro Marlene: Terrassenbänke mit Pflanzkästen",
        "Zwei Bänke an der Terrassenwand mit Stauraum für Polster und ausgekleideten Pflanzkästen an beiden Enden.",
        "## Maße",
        "| Teil | Maß | Material |",
        "| Bank | 2 × 3,20 m, Sitzhöhe 45 cm | Thermoesche |",
        "| Pflanzkasten | 4 × 50 cm, ausgekleidet | Esche, Deckel innen Eiche furniert (oak veneer) |",
        "| Freie Ecke | 60 cm für gestapelte Stühle | – |",
        "## Preis",
        "Bänke, Pflanzkästen, Lieferung und Montage: 9.600 €.",
      ],
    },
    brightwellOffer: {
      name: "Angebot – 12 Arbeitsplätze.pdf",
      lines: [
        "# Angebot: Tische und Schränke für das Versicherungsbüro Hellbrunn",
        "Aktualisiertes Angebot: vier der zwölf Tische sind höhenverstellbar, alle mit denselben Platten in Eiche furniert (oak veneer).",
        "## Preis",
        "| Position | Menge | Preis |",
        "| Tisch, feste Höhe, Platte Eiche furniert | 8 | 6.400 € |",
        "| Tisch, höhenverstellbar, Platte Eiche furniert | 4 | 5.200 € |",
        "| Schränke | 6 | 3.900 € |",
        "| Lieferung und Montage | 1 | 1.400 € |",
        "| Summe |  | 16.900 € |",
      ],
    },
  },
  trash: { contact: "Clara Dorn (Duplikat)", deal: "Backstube Herdfeuer – Fensterbank" },
  mateChat: {
    title: "Thekenfoto von Clara",
    messages: [
      "Hier ist das Foto, das Clara von der Café-Theke geschickt hat. Hänge es an den Auftrag Kupfertheke und entwirf eine Antwort mit zwei Aufmaßterminen.",
      "Ich habe das Foto unter „Zeichnungen und Fotos“ an „Café Kupferkessel – neue Theke und Rückbuffet“ (14.800 €, Angebot verschickt) gehängt. Am Auftrag liegen schon die Thekenzeichnung v2 (Front Eiche furniert, Platte Nussbaum) und zwei weitere Fotos vom Aufmaß.\n\nDiese Antwort liegt als Entwurf in deinem WhatsApp-Chat mit Clara; sie ist nicht gesendet:\n\n„Hallo Clara, danke für das Foto! Ich würde mir die Wand hinter dem Rückbuffet gern noch einmal ansehen, bevor wir bauen. Passt Donnerstag um 7:30 oder Freitag um 7:30, vor der Öffnung? Es dauert etwa 30 Minuten.“\n\nSobald Clara einen Termin wählt, trag den Aufmaßtermin am Auftrag ein, dann erscheint er auf dem Dashboard.",
    ],
  },
};

const ORGANIZATION_FACTS: Record<OrganizationKey, { venueType: string; status: string; createdDaysAgo: number }> = {
  copper: { venueType: "cafe", status: "customer", createdDaysAgo: 240 },
  marlowe: { venueType: "restaurant", status: "prospect", createdDaysAgo: 30 },
  ninebean: { venueType: "cafe", status: "prospect", createdDaysAgo: 22 },
  riverbend: { venueType: "office", status: "customer", createdDaysAgo: 410 },
  lantern: { venueType: "restaurant", status: "prospect", createdDaysAgo: 45 },
  greyline: { venueType: "office", status: "prospect", createdDaysAgo: 16 },
  saltpine: { venueType: "restaurant", status: "prospect", createdDaysAgo: 1 },
  brightwell: { venueType: "office", status: "prospect", createdDaysAgo: 38 },
  fieldstone: { venueType: "office", status: "former", createdDaysAgo: 300 },
  linden: { venueType: "shop", status: "customer", createdDaysAgo: 95 },
  hearth: { venueType: "shop", status: "customer", createdDaysAgo: 300 },
  oakleaf: { venueType: "office", status: "customer", createdDaysAgo: 275 },
};

const CONTACT_FACTS: Record<
  ContactKey,
  {
    organization: OrganizationKey;
    channel: string;
    chat?: string;
    createdDaysAgo: number;
    mobile?: boolean;
    instagram?: string;
    avatar?: Parameters<typeof photo>[0];
  }
> = {
  claire: {
    organization: "copper",
    channel: "whatsapp",
    chat: "waitingForUs",
    createdDaysAgo: 238,
    mobile: true,
    avatar: "lea-bauer",
  },
  leo: { organization: "copper", channel: "whatsapp", chat: "done", createdDaysAgo: 60, mobile: true },
  tom: {
    organization: "marlowe",
    channel: "whatsapp",
    chat: "waitingForUs",
    createdDaysAgo: 30,
    mobile: true,
    avatar: "felix-koch",
  },
  nina: {
    organization: "marlowe",
    channel: "whatsapp",
    chat: "waitingForCustomer",
    createdDaysAgo: 12,
    mobile: true,
    avatar: "lina-alvarez",
  },
  jake: {
    organization: "ninebean",
    channel: "whatsapp",
    chat: "waitingForUs",
    createdDaysAgo: 22,
    mobile: true,
    avatar: "leon-becker",
  },
  priya: {
    organization: "ninebean",
    channel: "whatsapp",
    chat: "waitingForCustomer",
    createdDaysAgo: 20,
    mobile: true,
  },
  rachel: {
    organization: "riverbend",
    channel: "whatsapp",
    chat: "new",
    createdDaysAgo: 408,
    mobile: true,
    avatar: "leila-chen",
  },
  victor: { organization: "riverbend", channel: "call", createdDaysAgo: 70, mobile: true },
  sal: {
    organization: "lantern",
    channel: "whatsapp",
    chat: "waitingForCustomer",
    createdDaysAgo: 45,
    mobile: true,
    avatar: "amir-haddad",
  },
  maya: { organization: "greyline", channel: "email", createdDaysAgo: 16 },
  jordan: {
    organization: "saltpine",
    channel: "whatsapp",
    chat: "new",
    createdDaysAgo: 1,
    mobile: true,
    avatar: "tim-weber",
  },
  karen: { organization: "brightwell", channel: "email", createdDaysAgo: 38, mobile: true, avatar: "anna-mueller" },
  mike: { organization: "brightwell", channel: "email", createdDaysAgo: 35 },
  helen: { organization: "fieldstone", channel: "email", createdDaysAgo: 300 },
  tyler: { organization: "fieldstone", channel: "email", createdDaysAgo: 290 },
  rosa: {
    organization: "linden",
    channel: "whatsapp",
    chat: "waitingForCustomer",
    createdDaysAgo: 95,
    mobile: true,
    instagram: "lindencorner.bakery",
  },
  ana: { organization: "hearth", channel: "whatsapp", chat: "done", createdDaysAgo: 298, mobile: true },
  ben: { organization: "oakleaf", channel: "whatsapp", chat: "waitingForCustomer", createdDaysAgo: 272, mobile: true },
};

type DealFacts = {
  organization: OrganizationKey;
  contacts: ContactKey[];
  stage: string;
  source: string;
  projectType: string;
  value: number;
  createdDaysAgo: number;
  close: number;
  next?: number;
  opening?: number;
  installation?: number;
  /** The site visit: story day and local time. */
  visit?: readonly [number, string];
  lost?: string;
  accepted?: number;
  history?: Array<{ daysAgo: number; stage: string }>;
};

const DEAL_FACTS: Record<DealKey, DealFacts> = {
  copperCounter: {
    organization: "copper",
    visit: [13, "07:30"],
    contacts: ["claire", "leo"],
    stage: "offerSent",
    source: "existing",
    projectType: "counter",
    value: 14800,
    createdDaysAgo: 40,
    close: 3,
    next: 1,
    opening: 24,
    installation: 17,
    history: [
      { daysAgo: 32, stage: "siteVisit" },
      { daysAgo: 20, stage: "drawings" },
      { daysAgo: 9, stage: "offerSent" },
    ],
  },
  marloweBenches: {
    organization: "marlowe",
    visit: [1, "10:30"],
    contacts: ["tom", "nina"],
    stage: "drawings",
    source: "referral",
    projectType: "seating",
    value: 9600,
    createdDaysAgo: 28,
    close: 14,
    next: 3,
    opening: 40,
    history: [
      { daysAgo: 20, stage: "siteVisit" },
      { daysAgo: 4, stage: "drawings" },
    ],
  },
  ninebeanBar: {
    organization: "ninebean",
    visit: [3, "08:00"],
    contacts: ["jake", "priya"],
    stage: "siteVisit",
    source: "whatsapp",
    projectType: "counter",
    value: 21500,
    createdDaysAgo: 21,
    close: 30,
    next: 2,
    opening: 55,
    history: [{ daysAgo: 6, stage: "siteVisit" }],
  },
  lindenCafe: {
    organization: "linden",
    visit: [2, "09:00"],
    contacts: ["rosa"],
    stage: "siteVisit",
    source: "existing",
    projectType: "seating",
    value: 6800,
    createdDaysAgo: 4,
    close: 25,
    next: 2,
    history: [{ daysAgo: 1, stage: "siteVisit" }],
  },
  riverbendBooths: {
    organization: "riverbend",
    contacts: ["victor", "rachel"],
    stage: "won",
    source: "existing",
    projectType: "office",
    value: 18400,
    createdDaysAgo: 75,
    close: -12,
    installation: 6,
    history: [
      { daysAgo: 60, stage: "siteVisit" },
      { daysAgo: 45, stage: "drawings" },
      { daysAgo: 30, stage: "offerSent" },
    ],
  },
  riverbendKitchen: {
    organization: "riverbend",
    visit: [6, "15:30"],
    contacts: ["rachel"],
    stage: "inquiry",
    source: "existing",
    projectType: "counter",
    value: 7200,
    createdDaysAgo: 5,
    close: 45,
    next: 6,
  },
  lanternSeating: {
    organization: "lantern",
    visit: [-1, "16:00"],
    contacts: ["sal"],
    stage: "offerSent",
    source: "whatsapp",
    projectType: "seating",
    value: 11200,
    createdDaysAgo: 44,
    close: 7,
    next: 4,
    history: [
      { daysAgo: 35, stage: "siteVisit" },
      { daysAgo: 12, stage: "offerSent" },
    ],
  },
  greylineReception: {
    organization: "greyline",
    visit: [0, "11:00"],
    contacts: ["maya"],
    stage: "drawings",
    source: "website",
    projectType: "office",
    value: 8900,
    createdDaysAgo: 15,
    close: 21,
    next: 3,
    history: [{ daysAgo: 4, stage: "drawings" }],
  },
  saltpineBar: {
    organization: "saltpine",
    visit: [6, "14:30"],
    contacts: ["jordan"],
    stage: "inquiry",
    source: "referral",
    projectType: "counter",
    value: 13500,
    createdDaysAgo: 1,
    close: 40,
    next: 1,
  },
  brightwellOffice: {
    organization: "brightwell",
    contacts: ["karen", "mike"],
    stage: "offerSent",
    source: "website",
    projectType: "office",
    value: 16900,
    createdDaysAgo: 36,
    close: 10,
    next: 2,
    installation: 35,
    history: [
      { daysAgo: 28, stage: "siteVisit" },
      { daysAgo: 8, stage: "offerSent" },
    ],
  },
  fieldstoneLibrary: {
    organization: "fieldstone",
    contacts: ["helen", "tyler"],
    stage: "lost",
    source: "referral",
    projectType: "shelving",
    value: 12400,
    createdDaysAgo: 160,
    close: -110,
    lost: "otherWorkshop",
    history: [
      { daysAgo: 140, stage: "siteVisit" },
      { daysAgo: 125, stage: "offerSent" },
    ],
  },
  lindenDisplay: {
    organization: "linden",
    contacts: ["rosa"],
    stage: "won",
    source: "whatsapp",
    projectType: "shelving",
    value: 9800,
    createdDaysAgo: 92,
    close: -55,
    installation: -30,
    history: [
      { daysAgo: 80, stage: "siteVisit" },
      { daysAgo: 66, stage: "offerSent" },
    ],
  },
  hearthCounter: {
    organization: "hearth",
    contacts: ["ana"],
    stage: "won",
    source: "whatsapp",
    projectType: "counter",
    value: 12400,
    createdDaysAgo: 290,
    close: -255,
    installation: -230,
    history: [
      { daysAgo: 280, stage: "siteVisit" },
      { daysAgo: 268, stage: "drawings" },
      { daysAgo: 262, stage: "offerSent" },
    ],
  },
  oakleafReception: {
    organization: "oakleaf",
    contacts: ["ben"],
    stage: "won",
    source: "referral",
    projectType: "office",
    value: 9200,
    createdDaysAgo: 265,
    close: -205,
    installation: -185,
    history: [
      { daysAgo: 255, stage: "siteVisit" },
      { daysAgo: 245, stage: "offerSent" },
    ],
  },
  copperBench: {
    organization: "copper",
    contacts: ["claire"],
    stage: "won",
    source: "whatsapp",
    projectType: "seating",
    value: 4600,
    createdDaysAgo: 175,
    close: -150,
    installation: -135,
    history: [{ daysAgo: 160, stage: "offerSent" }],
  },
  hearthShelves: {
    organization: "hearth",
    contacts: ["ana"],
    stage: "lost",
    source: "whatsapp",
    projectType: "shelving",
    value: 4600,
    createdDaysAgo: 120,
    close: -96,
    lost: "price",
    history: [{ daysAgo: 108, stage: "offerSent" }],
  },
  oakleafStorage: {
    organization: "oakleaf",
    contacts: ["ben"],
    stage: "won",
    source: "existing",
    projectType: "office",
    value: 5400,
    createdDaysAgo: 45,
    close: -30,
    installation: 12,
    history: [
      { daysAgo: 38, stage: "siteVisit" },
      { daysAgo: 30, stage: "offerSent" },
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
  walnutSample: {
    status: "open",
    priority: "high",
    due: 1,
    deal: "copperCounter",
    contact: "claire",
    createdDaysAgo: 1,
  },
  benchDrawing: {
    status: "inProgress",
    priority: "high",
    due: 3,
    deal: "marloweBenches",
    contact: "tom",
    createdDaysAgo: 3,
  },
  ninebeanVisit: {
    status: "open",
    priority: "medium",
    due: 2,
    deal: "ninebeanBar",
    contact: "jake",
    createdDaysAgo: 2,
  },
  boothInstall: {
    status: "inProgress",
    priority: "high",
    due: 4,
    deal: "riverbendBooths",
    contact: "victor",
    createdDaysAgo: 10,
  },
  wobblyTable: {
    status: "open",
    priority: "low",
    due: -3,
    organization: "riverbend",
    contact: "rachel",
    createdDaysAgo: 9,
  },
  lanternFollowUp: {
    status: "open",
    priority: "medium",
    due: 4,
    deal: "lanternSeating",
    contact: "sal",
    createdDaysAgo: 3,
  },
  linkSaltpine: { status: "open", priority: "high", due: 0, deal: "saltpineBar", contact: "jordan", createdDaysAgo: 1 },
  saltpineVisit: {
    status: "open",
    priority: "medium",
    due: 1,
    deal: "saltpineBar",
    contact: "jordan",
    createdDaysAgo: 1,
  },
  brightwellLayout: {
    status: "done",
    priority: "medium",
    due: -5,
    deal: "brightwellOffice",
    contact: "karen",
    createdDaysAgo: 12,
    done: 6,
  },
  greylineFinish: {
    status: "open",
    priority: "medium",
    due: -4,
    deal: "greylineReception",
    contact: "maya",
    createdDaysAgo: 10,
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
  id: "whatsapp-crm",
  strings: { en, de },
  story: {
    en: { currency: "USD", timeZone: "America/New_York" },
    de: { currency: "EUR", timeZone: "Europe/Berlin" },
  },
  build: (t) => {
    const phone = (index: number) => phoneNumber(t.phones.mobile, index);
    const open = ["inquiry", "siteVisit", "drawings", "offerSent"];
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
          venueType: facts.venueType,
          customerStatus: facts.status,
          address: address({ street, postalCode, city, region, countryCode: t.countryCode, lat, lon }),
          website: `https://${domain}`,
        },
        owner: "maxBergmann",
        channels: { email: `hello@${domain}` },
        createdDaysAgo: facts.createdDaysAgo,
      };
    });
    const contact: RecordSpec[] = CONTACTS.map((key, index) => {
      const facts = CONTACT_FACTS[key];
      const [firstName, lastName, jobTitle] = t.contacts[key];
      const domain = t.organizations[facts.organization][2];
      const mobile = facts.mobile ? phone(index) : undefined;
      return {
        key,
        values: {
          firstName,
          lastName,
          jobTitle,
          preferredChannel: facts.channel,
          ...(facts.chat ? { chatStatus: facts.chat } : {}),
        },
        links: { "contact.organizations": facts.organization },
        owner: "maxBergmann",
        channels: {
          email: `${mailbox(firstName)}.${mailbox(lastName)}@${domain}`,
          ...(mobile ? { phone: mobile } : {}),
          ...(facts.instagram ? { instagram: facts.instagram } : {}),
        },
        ...(facts.avatar ? { avatar: photo(facts.avatar) } : {}),
        createdDaysAgo: facts.createdDaysAgo,
      };
    });
    const deal: RecordSpec[] = DEALS.map((key) => {
      const facts = DEAL_FACTS[key];
      const [name, nextStep] = t.deals[key];
      const changes = facts.history ?? [];
      const closed = facts.stage === "won" || facts.stage === "lost";
      const steps = [...changes, ...(closed ? [{ daysAgo: Math.max(0, -facts.close), stage: facts.stage }] : [])];
      return {
        key,
        values: {
          name,
          stage: facts.stage,
          source: facts.source,
          projectType: facts.projectType,
          totalValue: facts.value,
          closeDate: day(facts.close),
          nextStep,
          ...(facts.next === undefined ? {} : { nextStepDate: day(facts.next) }),
          ...(facts.opening === undefined ? {} : { openingDate: day(facts.opening) }),
          ...(facts.installation === undefined ? {} : { installationDate: day(facts.installation) }),
          ...(facts.visit ? { siteVisit: at(facts.visit[0], facts.visit[1]) } : {}),
          ...(facts.stage === "won" ? { offerAccepted: day(facts.close) } : {}),
          ...(facts.lost ? { lostReason: facts.lost } : {}),
        },
        links: { "deal.organizations": facts.organization, "deal.contacts": facts.contacts },
        owner: "maxBergmann",
        createdDaysAgo: facts.createdDaysAgo,
        history: steps
          .map((change, index) => ({
            daysAgo: change.daysAgo,
            previous: { stage: index === 0 ? "inquiry" : steps[index - 1].stage },
          }))
          .filter(
            (change, index, all) =>
              change.daysAgo < facts.createdDaysAgo && (index === 0 || change.daysAgo < all[index - 1].daysAgo),
          ),
      };
    });
    const task: RecordSpec[] = TASKS.map((key) => {
      const facts = TASK_FACTS[key];
      return {
        key,
        values: { name: t.tasks[key], status: facts.status, priority: facts.priority, dueDate: day(facts.due) },
        links: {
          ...(facts.deal ? { "task.deals": facts.deal } : {}),
          ...(organizationOf(facts) ? { "task.organizations": organizationOf(facts) as string } : {}),
          ...(facts.contact ? { "task.contacts": facts.contact } : {}),
        },
        owner: "maxBergmann",
        createdDaysAgo: facts.createdDaysAgo,
        ...(facts.done === undefined ? {} : { history: [{ daysAgo: facts.done, previous: { status: "open" } }] }),
      };
    });

    const messages = (
      thread: ThreadKey,
      senders: readonly string[],
      extra: Record<number, { draft?: boolean; reaction?: { from: string; value: string } }> = {},
    ) => t.threads[thread].messages.map((text, index) => ({ from: senders[index], text, ...extra[index] }));
    const failed = (key: RoutineKey, startedHoursAgo: number) => ({
      status: "failed" as const,
      startedHoursAgo,
      durationSeconds: 12,
      credits: 2,
      error: "providerUnavailable" as const,
      note: t.routines[key].failure,
    });
    const routines: RoutineSpec[] = [
      {
        key: "unknownSenders",
        name: t.routines.unknownSenders.name,
        task: t.routines.unknownSenders.task,
        owner: "maxBergmann",
        trigger: {
          kind: "event",
          events: ["messaging.message.received"],
          debounceSeconds: 900,
          sample: { thread: 1 },
        },
        runs: [
          {
            status: "succeeded",
            startedHoursAgo: 2,
            durationSeconds: 38,
            credits: 6,
            summary: t.routines.unknownSenders.runs[0],
          },
          failed("unknownSenders", 30),
          {
            status: "succeeded",
            startedHoursAgo: 75,
            durationSeconds: 46,
            credits: 7,
            summary: t.routines.unknownSenders.runs[1],
          },
        ],
      },
      {
        key: "morningChats",
        name: t.routines.morningChats.name,
        task: t.routines.morningChats.task,
        owner: "maxBergmann",
        trigger: { kind: "schedule", cron: "30 7 * * *" },
        runs: [
          {
            status: "succeeded",
            startedHoursAgo: 4,
            durationSeconds: 71,
            credits: 11,
            summary: t.routines.morningChats.runs[0],
          },
          {
            status: "succeeded",
            startedHoursAgo: 28,
            durationSeconds: 64,
            credits: 10,
            summary: t.routines.morningChats.runs[1],
          },
          failed("morningChats", 52),
        ],
      },
    ];

    const threads: ThreadSpec[] = [
      {
        account: "whatsapp",
        with: ["claire"],
        state: "unread",
        latestMinutesAgo: 35,
        messages: messages("copper", ["claire", "self", "claire", "self", "claire"], {
          3: { reaction: { from: "claire", value: "❤️" } },
        }),
        links: ["deal:copperCounter", "organization:copper"],
      },
      {
        account: "whatsapp",
        with: ["jordan"],
        state: "unread",
        latestMinutesAgo: 90,
        messages: messages("saltpine", ["jordan", "self", "jordan"]),
      },
      {
        account: "whatsapp",
        with: ["tom", "nina"],
        name: t.threads.marlowe.name,
        state: "open",
        latestMinutesAgo: 3 * 60,
        messages: messages("marlowe", ["self", "tom", "self", "nina", "self"], {
          4: { reaction: { from: "nina", value: "👍" } },
        }),
        links: ["deal:marloweBenches", "organization:marlowe"],
      },
      {
        account: "google",
        with: ["karen"],
        subject: t.threads.brightwell.subject,
        state: "open",
        latestMinutesAgo: 5 * 60,
        messages: messages("brightwell", ["karen", "self", "karen", "self"], { 3: { draft: true } }),
        links: ["deal:brightwellOffice", "organization:brightwell"],
      },
      {
        account: "whatsapp",
        with: ["jake"],
        state: "open",
        latestMinutesAgo: 26 * 60,
        messages: messages("ninebean", ["jake", "self", "jake", "self"]),
        links: ["deal:ninebeanBar"],
      },
      {
        account: "whatsapp",
        with: ["rachel"],
        state: "open",
        latestMinutesAgo: 2 * 24 * 60,
        messages: messages("riverbend", ["rachel", "self", "rachel"]),
        links: ["organization:riverbend"],
      },
      {
        account: "instagram",
        with: ["rosa"],
        state: "open",
        latestMinutesAgo: 3 * 24 * 60,
        messages: messages("linden", ["rosa", "self", "rosa"]),
        links: ["deal:lindenCafe", "organization:linden"],
      },
      {
        account: "google",
        with: ["maya"],
        subject: t.threads.greyline.subject,
        state: "open",
        latestMinutesAgo: 4 * 24 * 60,
        messages: messages("greyline", ["maya", "self"]),
        links: ["deal:greylineReception"],
      },
    ];

    const photoFile = (key: string, dealKey: DealKey, photo: string, uploadedDaysAgo: number): FileSpec => ({
      key,
      record: `deal:${dealKey}`,
      field: "deal.drawingsAndPhotos",
      name: photo,
      kind: "jpg",
      photo,
      uploadedDaysAgo,
    });
    const docFile = (key: keyof Strings["files"], dealKey: DealKey, uploadedDaysAgo: number): FileSpec => ({
      key,
      record: `deal:${dealKey}`,
      field: "deal.drawingsAndPhotos",
      name: t.files[key].name,
      kind: "pdf",
      lines: t.files[key].lines,
      uploadedDaysAgo,
    });

    return {
      workspaceName: t.workspaceName,
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
          key: "organization.venueType",
          label: t.fields.venueType,
          type: "select",
          options: label(t.options.venueType, {
            cafe: "warning",
            restaurant: "destructive",
            office: "info",
            shop: "success",
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
        { key: "contact.jobTitle", label: t.fields.jobTitle, type: "text" },
        {
          key: "contact.preferredChannel",
          label: t.fields.preferredChannel,
          type: "select",
          options: label(t.options.preferredChannel, { whatsapp: "success", email: "info", call: "secondary" }),
        },
        {
          key: "contact.chatStatus",
          label: t.fields.chatStatus,
          type: "select",
          options: label(t.options.chatStatus, {
            new: "info",
            waitingForUs: "warning",
            waitingForCustomer: "secondary",
            done: "success",
          }),
        },
        {
          key: "deal.projectType",
          label: t.fields.projectType,
          type: "select",
          options: label(t.options.projectType, {
            counter: "warning",
            seating: "info",
            shelving: "success",
            office: "secondary",
          }),
        },
        {
          key: "deal.source",
          label: t.fields.source,
          type: "select",
          options: label(t.options.source, {
            referral: "success",
            whatsapp: "info",
            website: "warning",
            existing: "secondary",
          }),
        },
        { key: "deal.closeDate", label: t.fields.closeDate, type: "date" },
        { key: "deal.nextStep", label: t.fields.nextStep, type: "text" },
        { key: "deal.nextStepDate", label: t.fields.nextStepDate, type: "date" },
        { key: "deal.openingDate", label: t.fields.openingDate, type: "date" },
        { key: "deal.installationDate", label: t.fields.installationDate, type: "date" },
        { key: "deal.siteVisit", label: t.fields.siteVisit, type: "dateTime" },
        { key: "deal.drawingsAndPhotos", label: t.fields.drawingsAndPhotos, type: "file" },
        { key: "deal.offerAccepted", label: t.fields.offerAccepted, type: "date" },
        {
          key: "deal.leadTime",
          label: t.fields.leadTime,
          type: "number",
          formula: { kind: "daysBetween", from: "deal.offerAccepted", to: "deal.installationDate" },
        },
        {
          key: "deal.lostReason",
          label: t.fields.lostReason,
          type: "select",
          options: label(t.options.lostReason, { price: "warning", timing: "info", otherWorkshop: "secondary" }),
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
        { key: "inquiry", label: t.stages.inquiry, color: "secondary", probability: 10 },
        { key: "siteVisit", label: t.stages.siteVisit, color: "info", probability: 30 },
        { key: "drawings", label: t.stages.drawings, color: "info", probability: 50 },
        { key: "offerSent", label: t.stages.offerSent, color: "warning", probability: 70 },
        { key: "won", label: t.stages.won, color: "success", probability: 100 },
        { key: "lost", label: t.stages.lost, color: "destructive", probability: 0 },
      ],
      records: { organization, contact, deal, task },
      views: [
        {
          key: "pipeline",
          list: "deal",
          name: t.views.pipeline,
          mode: "board",
          groupBy: "stage",
          columns: ["totalValue", "deal.organizations", "nextStep", "nextStepDate"],
          filters: [{ field: "stage", notIn: ["lost"] }],
        },
        {
          key: "chats",
          list: "contact",
          name: t.views.chats,
          mode: "board",
          groupBy: "chatStatus",
          columns: ["contact.organizations", "preferredChannel", "capability.identity"],
          filters: [{ field: "chatStatus", in: ["new", "waitingForUs", "waitingForCustomer", "done"] }],
        },
        {
          key: "installations",
          list: "deal",
          name: t.views.installations,
          mode: "table",
          columns: [
            "stage",
            "installationDate",
            "openingDate",
            "offerAccepted",
            "leadTime",
            "projectType",
            "deal.organizations",
            "totalValue",
          ],
          filters: [{ field: "stage", in: ["drawings", "offerSent", "won"] }],
          sort: { field: "installationDate", direction: "asc" },
        },
        {
          key: "customers",
          list: "organization",
          name: t.views.customers,
          mode: "table",
          columns: ["customerStatus", "venueType", "address", "contact.organizations", "deal.organizations"],
          sort: { field: "customerStatus", direction: "asc" },
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
          key: "workshopCalendar",
          list: "deal",
          name: t.views.workshopCalendar,
          mode: "calendar",
          calendar: { date: "installationDate", color: "projectType", mode: "week" },
          columns: ["stage", "projectType", "totalValue", "deal.organizations"],
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
            title: t.widgets.awaitingReply,
            list: "contact",
            aggregation: "count",
            filters: [{ field: "chatStatus", in: ["new", "waitingForUs"] }],
          },
          {
            kind: "kpi",
            title: t.widgets.leadTime,
            list: "deal",
            aggregation: "average",
            field: "leadTime",
            filters: wonLastYear,
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
            title: t.widgets.siteVisits,
            list: "deal",
            layout: "upcoming",
            date: "siteVisit",
            days: 14,
            amount: "totalValue",
            filters: [{ field: "stage", in: open }],
          },
          {
            kind: "chart",
            title: t.widgets.chatsByStatus,
            display: DisplayType.doughnutChart,
            list: "contact",
            aggregation: "count",
            groupBy: { field: "chatStatus" },
            filters: [{ field: "chatStatus", in: ["new", "waitingForUs", "waitingForCustomer", "done"] }],
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
            title: t.widgets.nextStepsMonth,
            list: "deal",
            layout: "month",
            date: "nextStepDate",
            filters: [{ field: "stage", in: open }],
          },
          {
            kind: "chart",
            title: t.widgets.leadTimeByType,
            display: DisplayType.horizontalBarChartWithLabels,
            list: "deal",
            aggregation: "average",
            field: "leadTime",
            groupBy: { field: "projectType" },
            filters: wonLastYear,
          },
        ],
      },
      wiki: [
        { key: "guide", kind: "guide", title: t.wiki.guide.title, markdown: t.wiki.guide.markdown },
        { key: "process", kind: "knowledge", title: t.wiki.process.title, markdown: t.wiki.process.markdown },
        {
          key: "whatsappToOpportunity",
          kind: "procedure",
          title: t.wiki.whatsappToOpportunity.title,
          whenToUse: t.wiki.whatsappToOpportunity.whenToUse,
          markdown: t.wiki.whatsappToOpportunity.markdown,
        },
        {
          key: "siteVisit",
          kind: "procedure",
          title: t.wiki.siteVisit.title,
          whenToUse: t.wiki.siteVisit.whenToUse,
          markdown: t.wiki.siteVisit.markdown,
        },
      ],
      files: [
        photoFile("copperWall", "copperCounter", "cafe-brick-wall.jpg", 32),
        photoFile("copperEvening", "copperCounter", "cafe-counter-evening.jpg", 32),
        photoFile("copperPastries", "copperCounter", "cafe-counter-pastries.jpg", 1),
        docFile("copperDrawing", "copperCounter", 19),
        docFile("copperOffer", "copperCounter", 9),
        photoFile("marloweBench", "marloweBenches", "bench-in-park.jpg", 20),
        photoFile("marloweTable", "marloweBenches", "table-and-bench.jpg", 20),
        docFile("marloweDrawing", "marloweBenches", 4),
        docFile("brightwellOffer", "brightwellOffice", 2),
      ],
      planner: {
        sources: [
          { list: "deal", date: "siteVisit", filters: [{ field: "stage", in: open }], color: "info" },
          { list: "deal", date: "installationDate", color: "success" },
          { list: "deal", date: "openingDate", color: "warning" },
        ],
        mode: "week",
      },
      trash: [
        { list: "contact", name: t.trash.contact, daysAgo: 6 },
        { list: "deal", name: t.trash.deal, daysAgo: 17 },
      ],
      mateChats: [
        {
          title: t.mateChat.title,
          endedHoursAgo: 3,
          messages: [
            { role: "user", text: t.mateChat.messages[0] },
            { role: "assistant", text: t.mateChat.messages[1] },
          ],
        },
      ],
      messaging: {
        accounts: ["whatsapp", "google", "instagram"],
        selfTitle: t.selfTitle,
        website: t.website,
        threads,
      },
      routines,
    };
  },
});
