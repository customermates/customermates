import { ChartColor, DisplayType } from "@/features/widget/widget-display.schema";

import { day, defineSolution, photo, type RecordSpec, type ThreadSpec, phoneNumber } from "../define-solution";

/**
 * WhatsApp CRM: a small workshop that builds and installs counters, seating, shelving and office furniture for cafés,
 * restaurants and offices. Most customers message the owner on WhatsApp. The chats come from Max's own WhatsApp
 * account connected through the inbox; a person links each chat to the opportunity or organization it is about, and
 * one new chat is not linked yet. Opportunities carry their value directly; tasks and next-step dates are ordinary
 * fields, so nobody is reminded automatically.
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
] as const;
type ContactKey = (typeof CONTACTS)[number];
const DEALS = [
  "copperCounter",
  "copperShelves",
  "marloweBenches",
  "ninebeanBar",
  "riverbendBooths",
  "riverbendKitchen",
  "lanternSeating",
  "greylineReception",
  "saltpineBar",
  "brightwellOffice",
  "fieldstoneLibrary",
  "lindenDisplay",
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
  "lindenTouchUp",
  "orderWalnut",
] as const;
type TaskKey = (typeof TASKS)[number];
type ThreadKey = "copper" | "marlowe" | "ninebean" | "riverbend" | "lantern" | "saltpine" | "brightwell" | "greyline";

const en = {
  company: "Birch & Bolt Workshop",
  website: "https://birchandbolt.example",
  phones: { mobile: { templates: ["+1 412 555 01##"], start: 10 } },
  selfTitle: "Owner",
  lists: {
    organization: ["Organization", "Organizations", "Cafés, restaurants and offices we build for or talk to."],
    contact: ["Contact", "Contacts", "Owners, managers and architects we work with."],
    deal: ["Opportunity", "Opportunities", "Jobs we are discussing, from the first message to the installation."],
    task: ["Task", "Tasks", "Next actions with a due date."],
  },
  fields: {
    venueType: "Venue type",
    customerStatus: "Customer status",
    city: "City",
    website: "Website",
    jobTitle: "Job title",
    phone: "Mobile",
    preferredChannel: "Preferred channel",
    projectType: "Project type",
    source: "Source",
    closeDate: "Expected decision",
    nextStep: "Next step",
    nextStepDate: "Next step date",
    openingDate: "Opening date",
    installationDate: "Installation date",
    lostReason: "Lost reason",
    dueDate: "Due date",
    priority: "Priority",
  },
  options: {
    venueType: { cafe: "Café", restaurant: "Restaurant", office: "Office", shop: "Shop or bakery" },
    customerStatus: { prospect: "Prospect", customer: "Customer", former: "Former customer" },
    preferredChannel: { whatsapp: "WhatsApp", email: "Email", call: "Phone call" },
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
  } satisfies Record<ContactKey, readonly [string, string, string]>,
  deals: {
    copperCounter: ["Copper Kettle – new counter and back bar", "Drop off the walnut sample and confirm the top"],
    copperShelves: ["Copper Kettle – retail shelving for coffee beans", "Installed"],
    marloweBenches: ["Marlowe's – terrace benches with planters", "Send the revised bench drawing with storage"],
    ninebeanBar: [
      "Nine Bean – brew bar and window seating",
      "Site visit with Jake and Priya, measure the brew bar wall",
    ],
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
    lindenDisplay: ["Linden Corner – bread display and counter", "Installed"],
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
    lindenTouchUp: "Touch up the varnish on the Linden bread display",
    orderWalnut: "Order walnut worktops for the Copper Kettle counter",
  } satisfies Record<TaskKey, string>,
  views: {
    pipeline: "Pipeline",
    nextSteps: "Next steps",
    installations: "Installations and openings",
    customers: "Customers",
    allContacts: "All contacts",
    dueSoon: "Due soon",
  },
  widgets: {
    openPipeline: "Open pipeline",
    weighted: "Weighted pipeline",
    won: "Won value",
    openTasks: "Open tasks",
    byStage: "Open opportunities by stage",
    bySource: "Opportunities by source",
    wonByMonth: "Won value by month",
    byProjectType: "Open value by project type",
    activity: "Recent activity",
  },
  wiki: {
    guide: {
      title: "Operating Guide",
      markdown: [
        "Birch & Bolt Workshop builds and installs counters, seating, shelving and office furniture for cafés, restaurants and offices around Pittsburgh. This workspace is demo data; every company and person in it is fictional.",
        "",
        "## How we use the CRM",
        "- **Organizations** are the cafés, restaurants and offices we build for or talk to. **Contacts** are the people there; most have a mobile number because they prefer WhatsApp.",
        "- **Opportunities** are jobs we are discussing. The stage shows where the job stands; the value is typed in from our offer. Opening and installation dates are fields on the opportunity.",
        "- **Tasks** are next actions with a due date. Tasks and next step dates are ordinary fields: nobody is reminded automatically, so check the Next steps and Due soon views every morning.",
        "",
        "## WhatsApp and email",
        "- The WhatsApp chats come from Max's own WhatsApp account, connected in the inbox. It is his normal account, not a business API connection.",
        "- Every message is written and sent by a person, one chat at a time.",
        "- A chat belongs to an opportunity or organization only when someone links it. Nothing is linked automatically: the new chat with Jordan from Salt & Pine is not linked yet.",
        "- Emails from Max's mailbox work the same way.",
        "",
        "## Working rules",
        "- Every open opportunity has a next step and a next step date.",
        "- What we agree in a chat (measurements, wood, dates) also goes into the opportunity notes.",
        "- Accounting, drawings and material orders stay in their own tools.",
      ],
    },
    process: {
      title: "Sales Process",
      markdown: [
        "Every job moves through the same stages, from the first WhatsApp message or email to the installation on site.",
        "",
        "## Stages",
        "1. **New inquiry:** someone messages or emails about a job. Add the organization, the person and the opportunity.",
        "2. **Site visit:** we measure on site and note what the customer wants.",
        "3. **Drawings shared:** we send a drawing and agree on materials and dimensions.",
        "4. **Offer sent:** the price is in the offer and typed into the opportunity value.",
        "5. **Won or Lost:** record the outcome, the installation date and, when lost, the reason.",
      ],
    },
    whatsappToOpportunity: {
      title: "From WhatsApp chat to opportunity",
      whenToUse: "When a customer or a new contact writes to Max on WhatsApp about a job.",
      markdown: [
        "New jobs usually start as a WhatsApp chat on Max's phone. This is how a chat becomes an opportunity the team can see.",
        "",
        "## Steps",
        "1. Open the chat in the inbox and check whether the person is already a contact. If not, add the contact with the mobile number and the organization.",
        "2. If the chat is about a new job, create the opportunity in New inquiry with a next step and a next step date.",
        "3. Link the chat to the opportunity, and to the organization when it concerns the customer in general.",
        "4. Copy agreed measurements, materials and dates from the chat into the opportunity.",
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
    lantern: {
      messages: [
        "Hi Sal, did you get a chance to look at the offer for the booth seating? It includes new foam and the darker vinyl you picked.",
        "Yes, looks good. Can you do it in two steps so we don't have to close the whole restaurant?",
        "We can: left side on a Monday, right side the Monday after. Each side takes one day.",
        "Ok, let me talk to my brother and I'll confirm this week.",
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
};

type Strings = typeof en;

const de: Strings = {
  company: "Tischlerei Birkenholz",
  website: "https://tischlerei-birkenholz.example",
  phones: { mobile: { templates: ["+49 30 23125 ###"], start: 110 } },
  selfTitle: "Inhaber und Tischlermeister",
  lists: {
    organization: [
      "Organisation",
      "Organisationen",
      "Cafés, Restaurants und Büros, für die wir bauen oder mit denen wir sprechen.",
    ],
    contact: ["Kontakt", "Kontakte", "Inhaber, Betriebsleitungen und Architekten, mit denen wir arbeiten."],
    deal: [
      "Auftrag in Aussicht",
      "Aufträge in Aussicht",
      "Aufträge, über die wir sprechen, von der ersten Nachricht bis zur Montage.",
    ],
    task: ["Aufgabe", "Aufgaben", "Nächste Schritte mit Fälligkeitsdatum."],
  },
  fields: {
    venueType: "Art des Betriebs",
    customerStatus: "Kundenstatus",
    city: "Ort",
    website: "Website",
    jobTitle: "Position",
    phone: "Mobilnummer",
    preferredChannel: "Bevorzugter Kanal",
    projectType: "Art des Auftrags",
    source: "Quelle",
    closeDate: "Erwartete Entscheidung",
    nextStep: "Nächster Schritt",
    nextStepDate: "Datum nächster Schritt",
    openingDate: "Eröffnungstermin",
    installationDate: "Montagetermin",
    lostReason: "Verlustgrund",
    dueDate: "Fällig am",
    priority: "Priorität",
  },
  options: {
    venueType: { cafe: "Café", restaurant: "Restaurant", office: "Büro", shop: "Laden oder Bäckerei" },
    customerStatus: { prospect: "Interessent", customer: "Kunde", former: "Ehemaliger Kunde" },
    preferredChannel: { whatsapp: "WhatsApp", email: "E-Mail", call: "Anruf" },
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
  },
  deals: {
    copperCounter: [
      "Café Kupferkessel – neue Theke und Rückbuffet",
      "Nussbaum-Muster vorbeibringen und Platte festlegen",
    ],
    copperShelves: ["Café Kupferkessel – Verkaufsregal für Kaffeebohnen", "Montiert"],
    marloweBenches: [
      "Bistro Marlene – Terrassenbänke mit Pflanzkästen",
      "Überarbeitete Bankzeichnung mit Stauraum schicken",
    ],
    ninebeanBar: [
      "Röstbar Neunbohne – Brühbar und Fensterplätze",
      "Aufmaß mit Jakob und Pia, Wand für die Brühbar ausmessen",
    ],
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
    lindenDisplay: ["Bäckerei Lindeneck – Brotregal und Verkaufstheke", "Montiert"],
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
    lindenTouchUp: "Lack am Brotregal der Bäckerei Lindeneck ausbessern",
    orderWalnut: "Nussbaum-Arbeitsplatten für die Theke im Café Kupferkessel bestellen",
  },
  views: {
    pipeline: "Pipeline",
    nextSteps: "Nächste Schritte",
    installations: "Montagen und Eröffnungen",
    customers: "Kunden",
    allContacts: "Alle Kontakte",
    dueSoon: "Bald fällig",
  },
  widgets: {
    openPipeline: "Offene Pipeline",
    weighted: "Gewichtete Pipeline",
    won: "Gewonnener Wert",
    openTasks: "Offene Aufgaben",
    byStage: "Offene Aufträge nach Phase",
    bySource: "Aufträge nach Quelle",
    wonByMonth: "Gewonnener Wert pro Monat",
    byProjectType: "Offener Wert nach Art des Auftrags",
    activity: "Letzte Aktivitäten",
  },
  wiki: {
    guide: {
      title: "Leitfaden",
      markdown: [
        "Die Tischlerei Birkenholz baut und montiert Theken, Sitzbänke, Regale und Büromöbel für Cafés, Restaurants und Büros in Berlin und Potsdam. Dieser Arbeitsbereich enthält Demodaten; alle Firmen und Personen sind erfunden.",
        "",
        "## So nutzen wir das CRM",
        "- **Organisationen** sind die Cafés, Restaurants und Büros, für die wir bauen oder mit denen wir sprechen. **Kontakte** sind die Menschen dort; die meisten haben eine Mobilnummer, weil sie lieber per WhatsApp schreiben.",
        "- **Aufträge in Aussicht** sind Aufträge, über die wir sprechen. Die Phase zeigt, wo der Auftrag steht; den Wert tragen wir aus unserem Angebot von Hand ein. Eröffnungs- und Montagetermin sind Felder am Auftrag.",
        "- **Aufgaben** sind nächste Schritte mit Fälligkeitsdatum. Aufgaben und das Datum des nächsten Schritts sind normale Felder: Niemand wird automatisch erinnert, deshalb jeden Morgen die Ansichten „Nächste Schritte“ und „Bald fällig“ prüfen.",
        "",
        "## WhatsApp und E-Mail",
        "- Die WhatsApp-Chats kommen aus Max' eigenem WhatsApp-Konto, das im Posteingang verbunden ist. Es ist sein normales Konto, keine Anbindung über eine Business-API.",
        "- Jede Nachricht schreibt und sendet ein Mensch, ein Chat nach dem anderen.",
        "- Ein Chat gehört nur dann zu einem Auftrag oder einer Organisation, wenn jemand ihn verknüpft. Nichts wird automatisch verknüpft: Der neue Chat mit Jonas von Salz & Kiefer ist noch nicht verknüpft.",
        "- E-Mails aus Max' Postfach funktionieren genauso.",
        "",
        "## Arbeitsregeln",
        "- Jeder offene Auftrag hat einen nächsten Schritt mit Datum.",
        "- Was wir im Chat vereinbaren (Maße, Holz, Termine), kommt auch in die Notizen des Auftrags.",
        "- Buchhaltung, Zeichnungen und Materialbestellungen bleiben in ihren eigenen Programmen.",
      ],
    },
    process: {
      title: "Vertriebsprozess",
      markdown: [
        "Jeder Auftrag durchläuft dieselben Phasen, von der ersten WhatsApp-Nachricht oder E-Mail bis zur Montage vor Ort.",
        "",
        "## Phasen",
        "1. **Neue Anfrage:** Jemand schreibt per WhatsApp oder E-Mail wegen eines Auftrags. Organisation, Person und Auftrag anlegen.",
        "2. **Aufmaß vor Ort:** Wir messen vor Ort und notieren, was sich der Kunde wünscht.",
        "3. **Entwurf geschickt:** Wir schicken eine Zeichnung und stimmen Material und Maße ab.",
        "4. **Angebot gesendet:** Der Preis steht im Angebot und wird als Wert im Auftrag eingetragen.",
        "5. **Gewonnen oder Verloren:** Ergebnis und Montagetermin festhalten, bei Verlust mit Grund.",
      ],
    },
    whatsappToOpportunity: {
      title: "Vom WhatsApp-Chat zum Auftrag",
      whenToUse: "Wenn ein Kunde oder ein neuer Kontakt Max per WhatsApp wegen eines Auftrags schreibt.",
      markdown: [
        "Neue Aufträge beginnen meist als WhatsApp-Chat auf Max' Handy. So wird aus einem Chat ein Auftrag, den das ganze Team sieht.",
        "",
        "## Schritte",
        "1. Den Chat im Posteingang öffnen und prüfen, ob die Person schon als Kontakt angelegt ist. Wenn nicht, Kontakt mit Mobilnummer und Organisation anlegen.",
        "2. Geht es um einen neuen Auftrag, ihn in der Phase „Neue Anfrage“ mit nächstem Schritt und Datum anlegen.",
        "3. Den Chat mit dem Auftrag verknüpfen, und mit der Organisation, wenn es um den Kunden allgemein geht.",
        "4. Vereinbarte Maße, Materialien und Termine aus dem Chat in den Auftrag übernehmen.",
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
    lantern: {
      messages: [
        "Hallo Salvatore, konntest du dir das Angebot für die Sitznischen schon ansehen? Neuer Schaumstoff und das dunklere Kunstleder, das du ausgesucht hast, sind drin.",
        "Ja, sieht gut aus. Geht das in zwei Schritten, damit wir nicht das ganze Restaurant schließen müssen?",
        "Geht: die linke Seite an einem Montag, die rechte am Montag darauf. Jede Seite dauert einen Tag.",
        "Ok, ich spreche mit meinem Bruder und sage dir diese Woche Bescheid.",
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
};

const CONTACT_FACTS: Record<
  ContactKey,
  {
    organization: OrganizationKey;
    channel: string;
    createdDaysAgo: number;
    mobile?: boolean;
    avatar?: Parameters<typeof photo>[0];
  }
> = {
  claire: { organization: "copper", channel: "whatsapp", createdDaysAgo: 238, mobile: true, avatar: "lea-bauer" },
  leo: { organization: "copper", channel: "whatsapp", createdDaysAgo: 60, mobile: true },
  tom: { organization: "marlowe", channel: "whatsapp", createdDaysAgo: 30, mobile: true, avatar: "felix-koch" },
  nina: { organization: "marlowe", channel: "whatsapp", createdDaysAgo: 12, mobile: true, avatar: "lina-alvarez" },
  jake: { organization: "ninebean", channel: "whatsapp", createdDaysAgo: 22, mobile: true, avatar: "leon-becker" },
  priya: { organization: "ninebean", channel: "whatsapp", createdDaysAgo: 20, mobile: true },
  rachel: { organization: "riverbend", channel: "whatsapp", createdDaysAgo: 408, mobile: true, avatar: "leila-chen" },
  victor: { organization: "riverbend", channel: "call", createdDaysAgo: 70, mobile: true },
  sal: { organization: "lantern", channel: "whatsapp", createdDaysAgo: 45, mobile: true, avatar: "amir-haddad" },
  maya: { organization: "greyline", channel: "email", createdDaysAgo: 16 },
  jordan: { organization: "saltpine", channel: "whatsapp", createdDaysAgo: 1, mobile: true, avatar: "tim-weber" },
  karen: { organization: "brightwell", channel: "email", createdDaysAgo: 38, mobile: true, avatar: "anna-mueller" },
  mike: { organization: "brightwell", channel: "email", createdDaysAgo: 35 },
  helen: { organization: "fieldstone", channel: "email", createdDaysAgo: 300 },
  tyler: { organization: "fieldstone", channel: "email", createdDaysAgo: 290 },
  rosa: { organization: "linden", channel: "whatsapp", createdDaysAgo: 95, mobile: true },
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
  lost?: string;
  history?: Array<{ daysAgo: number; stage: string }>;
};

const DEAL_FACTS: Record<DealKey, DealFacts> = {
  copperCounter: {
    organization: "copper",
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
  copperShelves: {
    organization: "copper",
    contacts: ["claire"],
    stage: "won",
    source: "whatsapp",
    projectType: "shelving",
    value: 3200,
    createdDaysAgo: 230,
    close: -200,
    installation: -185,
    history: [{ daysAgo: 215, stage: "offerSent" }],
  },
  marloweBenches: {
    organization: "marlowe",
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
    due: 6,
    organization: "riverbend",
    contact: "rachel",
    createdDaysAgo: 2,
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
    status: "onHold",
    priority: "medium",
    due: 3,
    deal: "greylineReception",
    contact: "maya",
    createdDaysAgo: 4,
  },
  lindenTouchUp: {
    status: "done",
    priority: "low",
    due: -14,
    deal: "lindenDisplay",
    contact: "rosa",
    createdDaysAgo: 25,
    done: 15,
  },
  orderWalnut: { status: "onHold", priority: "medium", due: 8, deal: "copperCounter", createdDaysAgo: 1 },
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
  build: (t) => {
    const phone = (index: number) => phoneNumber(t.phones.mobile, index);
    const open = ["inquiry", "siteVisit", "drawings", "offerSent"];
    const label = <K extends string>(
      options: Record<K, string>,
      colors: Record<K, "default" | "secondary" | "destructive" | "success" | "warning" | "info">,
    ) => (Object.keys(options) as K[]).map((key) => ({ key, label: options[key], color: colors[key] }));

    const organization: RecordSpec[] = ORGANIZATIONS.map((key) => {
      const facts = ORGANIZATION_FACTS[key];
      const [name, city, domain] = t.organizations[key];
      return {
        key,
        values: { name, venueType: facts.venueType, customerStatus: facts.status, city, website: `https://${domain}` },
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
          ...(mobile ? { phone: mobile } : {}),
        },
        links: { "contact.organizations": facts.organization },
        owner: "maxBergmann",
        channels: {
          email: `${mailbox(firstName)}.${mailbox(lastName)}@${domain}`,
          ...(mobile ? { phone: mobile } : {}),
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
    const threads: ThreadSpec[] = [
      {
        account: "whatsapp",
        with: ["claire"],
        state: "unread",
        latestMinutesAgo: 35,
        messages: messages("copper", ["claire", "self", "claire", "self", "claire"]),
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
        account: "whatsapp",
        with: ["sal"],
        state: "open",
        latestMinutesAgo: 3 * 24 * 60,
        messages: messages("lantern", ["self", "sal", "self", "sal"]),
        links: ["deal:lanternSeating", "organization:lantern"],
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
        { key: "organization.city", label: t.fields.city, type: "text" },
        { key: "organization.website", label: t.fields.website, type: "url" },
        { key: "contact.jobTitle", label: t.fields.jobTitle, type: "text" },
        { key: "contact.phone", label: t.fields.phone, type: "phone" },
        {
          key: "contact.preferredChannel",
          label: t.fields.preferredChannel,
          type: "select",
          options: label(t.options.preferredChannel, { whatsapp: "success", email: "info", call: "secondary" }),
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
          columns: ["totalValue", "deal.organizations", "nextStepDate", "projectType"],
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
          key: "installations",
          list: "deal",
          name: t.views.installations,
          mode: "table",
          columns: ["stage", "installationDate", "openingDate", "projectType", "deal.organizations", "totalValue"],
          filters: [{ field: "stage", in: ["drawings", "offerSent", "won"] }],
          sort: { field: "installationDate", direction: "asc" },
        },
        {
          key: "customers",
          list: "organization",
          name: t.views.customers,
          mode: "table",
          columns: ["customerStatus", "venueType", "city", "contact.organizations", "deal.organizations"],
          sort: { field: "customerStatus", direction: "asc" },
        },
        {
          key: "allContacts",
          list: "contact",
          name: t.views.allContacts,
          mode: "table",
          columns: ["jobTitle", "contact.organizations", "preferredChannel", "phone", "capability.identity"],
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
            title: t.widgets.openTasks,
            list: "task",
            aggregation: "count",
            filters: [{ field: "status", notIn: ["done", "archived"] }],
          },
          {
            kind: "chart",
            title: t.widgets.byStage,
            display: DisplayType.verticalBarChartWithLabels,
            list: "deal",
            aggregation: "sum",
            field: "totalValue",
            groupBy: { field: "stage" },
            filters: [{ field: "stage", in: open }],
            width: 6,
          },
          {
            kind: "chart",
            title: t.widgets.bySource,
            display: DisplayType.doughnutChart,
            list: "deal",
            aggregation: "count",
            groupBy: { field: "source" },
            width: 6,
          },
          {
            kind: "chart",
            title: t.widgets.wonByMonth,
            display: DisplayType.areaChart,
            list: "deal",
            aggregation: "sum",
            field: "totalValue",
            groupBy: { month: "closeDate" },
            filters: [{ field: "stage", in: ["won"] }],
            width: 6,
          },
          {
            kind: "chart",
            title: t.widgets.byProjectType,
            display: DisplayType.horizontalBarChartWithLabels,
            list: "deal",
            aggregation: "sum",
            field: "totalValue",
            groupBy: { field: "projectType" },
            filters: [{ field: "stage", in: open }],
            colors: [ChartColor.secondary1],
            width: 6,
          },
          { kind: "activity", title: t.widgets.activity },
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
      ],
      messaging: {
        accounts: ["whatsapp", "google"],
        selfTitle: t.selfTitle,
        website: t.website,
        threads,
      },
    };
  },
});
