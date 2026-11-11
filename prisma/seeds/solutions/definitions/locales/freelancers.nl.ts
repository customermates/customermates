import type { Strings } from "../freelancers";

export const nl: Strings = {
  countryCode: "nl",
  company: "Veldmark Productontwerp",
  workspaceName: "Freelancers",
  website: "https://veldmark-ontwerp.example",
  phones: { mobile: { templates: ["+31 6 0000 0###"], start: 300 } },
  selfTitle: "Freelance UX- en productontwerper",
  lists: {
    organization: ["Klant", "Klanten", "Bedrijven waarvoor ik werk of met wie ik over opdrachten praat."],
    contact: ["Contactpersoon", "Contactpersonen", "De mensen met wie ik bij mijn klanten samenwerk."],
    deal: ["Aanvraag", "Aanvragen", "Mogelijke projecten, van het eerste bericht tot de beslissing van de klant."],
    project: ["Project", "Projecten", "Werk dat ik heb toegezegd, met dagtarief, dagen en het berekende honorarium."],
    task: ["Taak", "Taken", "Dingen die ik heb beloofd te doen, met een vervaldatum."],
  },
  fields: {
    dealValue: "Geschatte waarde",
    weightedValue: "Gewogen waarde",
    relationship: "Samenwerking",
    clientSince: "Klant sinds",
    nextAction: "Volgende stap",
    nextActionDate: "Datum volgende stap",
    totalFees: "Totaal projecthonoraria",
    address: "Adres",
    brief: "Briefing",
    files: "Bestanden",
    website: "Website",
    jobTitle: "Functie",
    workType: "Soort werk",
    source: "Herkomst",
    decisionDate: "Beslisdatum",
    projectStatus: "Status",
    dayRate: "Dagtarief",
    days: "Dagen",
    fee: "Honorarium",
    start: "Start",
    deadline: "Deadline",
    dueDate: "Vervaldatum",
  },
  options: {
    relationship: {
      ongoing: "Doorlopend",
      occasional: "Incidenteel",
      new: "Nieuw",
    },
    workType: {
      research: "Gebruikersonderzoek",
      productDesign: "Productontwerp",
      designSystem: "Designsysteem",
      review: "UX-review",
    },
    source: {
      repeat: "Bestaande klant",
      referral: "Aanbeveling",
      website: "Website",
      network: "Netwerk",
    },
    projectStatus: {
      planned: "Gepland",
      inProgress: "In uitvoering",
      waiting: "Wacht op feedback",
      done: "Afgerond",
      billed: "Gefactureerd",
    },
  },
  stages: {
    inquiry: "Aanvraag",
    firstCall: "Eerste gesprek",
    proposal: "Offerte verstuurd",
    won: "Gewonnen",
    lost: "Verloren",
  },
  organizations: {
    tidewater: [
      "Getijde Analytics B.V.",
      "Rotterdam",
      "getijde-analytics.example",
      "Offerte doornemen met Marloes de Wit",
    ],
    brightpath: [
      "Leerpad Onderwijs B.V.",
      "Utrecht",
      "leerpad-onderwijs.example",
      "Kick-offworkshop voor de onboardingflow",
    ],
    corvid: [
      "Raaf Wagenparksoftware B.V.",
      "Eindhoven",
      "raaf-wagenpark.example",
      "Daan Visser de eerste planningsschermen laten zien",
    ],
    meadow: [
      "Weidevogel Verzekeringen N.V.",
      "Den Haag",
      "weidevogel-verzekeringen.example",
      "Offerte voor het schadeformulier opvolgen",
    ],
    quill: ["Veer & Grootboek B.V.", "Amsterdam", "veer-grootboek.example", "Scopegesprek met Nina Vermeulen"],
    fernhill: ["Zonnehoek Energie B.V.", "Arnhem", "zonnehoek-energie.example", "Aanvraag van Sander Bos beantwoorden"],
    atlas: ["Noorderlicht Mobility B.V.", "Groningen", "noorderlicht-mobility.example", ""],
    juniper: [
      "Jeneverbes Reizen B.V.",
      "Haarlem",
      "jeneverbes-reizen.example",
      "Arjan Willems om actuele gebruikscijfers vragen",
    ],
  },
  addresses: {
    tidewater: ["Wilhelminakade 91", "3072 AP", "", 51.90866, 4.49302],
    brightpath: ["Moreelsepark 48", "3511 EP", "", 52.08906, 5.11344],
    corvid: ["Torenallee 20", "5617 BC", "", 51.4453, 5.46007],
    meadow: ["Prinses Beatrixlaan 35", "2595 AK", "", 52.07758, 4.33685],
    quill: ["Keizersgracht 62", "1015 CS", "", 52.37821, 4.8881],
    fernhill: ["Utrechtseweg 310", "6812 AR", "", 51.98462, 5.86881],
    atlas: ["Oude Boteringestraat 44", "9712 GL", "", 53.22008, 6.56365],
    juniper: ["Gedempte Oude Gracht 29", "2011 GL", "", 52.38132, 4.6324],
  },
  contacts: {
    priya: ["Marloes", "de Wit", "Hoofd Product"],
    marcus: ["Joris", "van den Berg", "Engineering lead"],
    rachel: ["Sanne", "Bakker", "Hoofd Design"],
    tom: ["Thijs", "Mulder", "Productmanager"],
    dan: ["Daan", "Visser", "CTO"],
    chris: ["Chris", "Hoekstra", "Productmanager"],
    laura: ["Lotte", "van Leeuwen", "Hoofd Digital"],
    kevin: ["Niels", "Peters", "Product owner"],
    nina: ["Nina", "Vermeulen", "Medeoprichter"],
    sam: ["Sander", "Bos", "Marketingmanager"],
    jenna: ["Jolien", "Brouwer", "Product lead"],
    alex: ["Arjan", "Willems", "Eigenaar"],
  },
  deals: {
    tidewaterDashboard: ["Getijde – redesign analysedashboard, fase 2", "Offerte doornemen met Marloes de Wit"],
    tidewaterDesignSystem: ["Getijde – audit van het designsysteem", "Project gestart"],
    brightpathOnboarding: ["Leerpad – onboardingflow voor leraren", "Project gestart"],
    brightpathMobile: ["Leerpad – usability-review van de mobiele app", "Thijs Mulder twee scopevarianten sturen"],
    corvidDispatch: ["Raaf – dashboard voor planners", "Project gestart"],
    meadowClaims: ["Weidevogel – herontwerp schadeformulier", "Bij Lotte van Leeuwen de offerte opvolgen"],
    meadowPortal: ["Weidevogel – herontwerp intermediairportaal", "Verloren aan een intern team"],
    quillOnboarding: ["Veer & Grootboek – prototype voor app-onboarding", "Scopegesprek met Nina Vermeulen"],
    fernhillTariff: ["Zonnehoek – tariefvergelijker op de website", "Sander Bos antwoorden met mogelijke startdata"],
    atlasRider: ["Noorderlicht – herontwerp passagiersapp", "Afgevallen op budget"],
    juniperRefresh: ["Jeneverbes – opfrisbeurt van de reisplanner", "Arjan Willems om actuele gebruikscijfers vragen"],
  },
  projects: {
    tidewaterAudit: "Getijde – audit van het designsysteem",
    brightpathOnboardingFlow: "Leerpad – onboardingflow voor leraren",
    corvidDispatchDesign: "Raaf – dashboard voor planners",
    juniperCheckout: "Jeneverbes – UX-audit van het afrekenproces",
    meadowAccessibility: "Weidevogel – toegankelijkheidsreview van het klantenportaal",
    brightpathQuiz: "Leerpad – quizbouwer voor leraren",
  },
  tasks: {
    walkthroughPrep: "Het doornemen van de offerte voor fase 2 met Marloes de Wit voorbereiden",
    scopeOptions: "Twee scopevarianten voor de mobiele review uitwerken",
    kickoffAgenda: "Agenda voor de kick-offworkshop opstellen",
    followUpLaura: "Bij Lotte van Leeuwen de offerte voor het schadeformulier opvolgen",
    replySam: "Aanvraag van Sander Bos beantwoorden met mogelijke startdata",
    reviewQuillScreens: "Huidige onboardingschermen van Veer & Grootboek bekijken",
    testimonial: "Marloes de Wit om een korte referentie vragen",
    corvidCheckIn: "Kwartaalgesprek met Daan Visser voeren",
  },
  views: {
    clients: "Klantenlijst",
    inquiries: "Aanvragen per fase",
    projects: "Projecten",
    nextActions: "Volgende stappen",
    openTasks: "Openstaande taken",
    calendar: "Projectagenda",
  },
  widgets: {
    openQuotes: "Openstaande offertes",
    running: "Honoraria van lopende projecten",
    fees: "Projecthonoraria afgelopen 12 maanden",
    overdueTasks: "Achterstallige taken",
    byStage: "Waarde van aanvragen per fase",
    byStatus: "Projecten per status",
    byClient: "Projecthonoraria per klant",
    feesByMonth: "Projecthonoraria per startmaand",
    nextActions: "Volgende stappen, komende twee weken",
    tasksMonth: "Openstaande taken deze maand",
  },
  files: {
    fernhillBrief: {
      name: "Briefing Zonnehoek.pdf",
      lines: [
        "# Zonnehoek Energie – briefing: tariefvergelijker",
        "Van Sander Bos, marketingmanager.",
        "## Het probleem",
        "Veel bezoekers haken af in de tweede stap van onze tariefvergelijker, waar ze hun jaarverbruik invullen.",
        "| Stap | Bezoekers | Door |",
        "| 1. Postcode | 10.000 | 74% |",
        "| 2. Jaarverbruik | 7.400 | 38% |",
        "| 3. Tarief kiezen | 2.800 | 61% |",
        "## Wat we vragen",
        "Een blik van buiten met een paar gebruikersinterviews, daarna een herontwerp van de tariefvergelijker dat onze ontwikkelaars kunnen bouwen.",
        "## Timing en budget",
        "Starten binnen twee maanden; budget rond € 6.000.",
      ],
    },
    juniperBrief: {
      name: "Briefing reisplanner.docx",
      lines: [
        "# Jeneverbes Reizen – opfrisbeurt van de reisplanner",
        "## Doel",
        "Minder afgebroken reisplannen op mobiel; de planner is vier jaar geleden voor het laatst herontworpen.",
        "## Vraag",
        "Een korte UX-review met concrete verbeterpunten, zoals bij de audit van het afrekenproces, waarin dezelfde opzet als een tariefvergelijker werd gebruikt, met tabellen van voor en na.",
        "## Budget",
        "Ongeveer € 3.500.",
      ],
    },
    tidewaterProposal: {
      name: "Offerte fase 2.pdf",
      lines: [
        "# Getijde Analytics – redesign dashboard, fase 2",
        "Opgesteld voor Marloes de Wit en Joris van den Berg.",
        "## Scope",
        "| Onderdeel | Dagen | Honorarium |",
        "| Onderzoek: vijf klantinterviews | 5 | € 4.500 |",
        "| Ontwerp van het nieuwe dashboard | 10 | € 9.500 |",
        "| Totaal | 15 | € 14.000 |",
        "Met drie in plaats van vijf interviews duurt het onderzoek 3 dagen (€ 2.700).",
      ],
    },
    tidewaterFindings: {
      name: "Bevindingen usabilitytest.md",
      lines: [
        "# Bevindingen usabilitytest – audit van het designsysteem",
        "## Wat werkte",
        "Knoppen en formuliervelden zijn consistent in het hele product.",
        "## Wat niet",
        "Drie verschillende datumkiezers; tabellen gebruiken vier afstandsschalen.",
        "## Hierna",
        "Voeg eerst de datumkiezers samen; de rapporttabellen volgen de opzet van de tariefvergelijker die we hebben getest.",
      ],
    },
    corvidFeedback: {
      name: "Eerste schermen – feedback.md",
      lines: [
        "# Eerste planningsschermen – feedback",
        "## Daan",
        "De kaartweergave is de juiste standaard; de ritlijst moet de volgende stop van de chauffeur tonen.",
        "## Chris",
        "Filters moeten behouden blijven bij het wisselen van dag. Feedback op de roosterweergave volgt donderdag.",
      ],
    },
    interviews: {
      name: "Interviewplanning.xlsx",
    },
  },
  interviewRows: [
    ["Leraar", "School", "Dag", "Tijd"],
    ["Interview 1", "Basisschool De Kastanje", "Maandag", "15:30"],
    ["Interview 2", "Openbare Basisschool De Wilg", "Dinsdag", "16:00"],
    ["Interview 3", "Gymnasium Kanaalzone", "Woensdag", "15:00"],
    ["Interview 4", "Scholengemeenschap Rijnoever", "Donderdag", "16:30"],
  ],
  calendar: {
    name: "Klantafspraken",
    events: [
      "Offerte fase 2 doornemen met Getijde",
      "Kick-offworkshop Leerpad",
      "Scopegesprek met Veer & Grootboek",
      "Feedback op de planningsschermen met Raaf",
    ],
  },
  trash: {
    contact: "Sander Bos",
    deal: "Noorderlicht – audit van de chauffeursapp",
  },
  mate: {
    title: "Aanvraag uit de briefing van Zonnehoek",
    question:
      "Ik heb Briefing Zonnehoek.pdf bijgevoegd. Maak op basis van deze briefing een aanvraag aan en stel twee startdata voor.",
    answer:
      "Klaar. Ik heb de aanvraag **Zonnehoek – tariefvergelijker op de website** in de fase Aanvraag aangemaakt, gekoppeld aan Zonnehoek Energie en Sander Bos, met een geschatte waarde van € 6.000 en de herkomst Aanbeveling (Sander vond je via Weidevogel). Briefing Zonnehoek.pdf is toegevoegd aan het veld Briefing van de aanvraag.\n\nUit de briefing: bezoekers haken af bij stap 2 van de tariefvergelijker (jaarverbruik), waar slechts 38% doorgaat. Sander vraagt om een paar gebruikersinterviews en een herontwerp, te starten binnen twee maanden, met een budget van ongeveer € 6.000. Bij € 900 per dag voor onderzoek en € 950 voor ontwerp is dat ongeveer 6–7 dagen.\n\n**Projectagenda:**\n- Getijde – audit van het designsysteem loopt tot de deadline over ruim drie en een halve week.\n- Raaf – dashboard voor planners wacht op feedback en eindigt over ongeveer tien dagen.\n- Leerpad – onboardingflow voor leraren loopt nog vijf à zes weken.\n\n**Twee mogelijke starts:**\n1. De maandag na de deadline bij Raaf, twee dagen per week naast Leerpad en Getijde.\n2. De maandag nadat de audit van Getijde is opgeleverd, drie dagen per week.\n\nIk heb de volgende stap ingesteld op “Sander Bos antwoorden met mogelijke startdata”. Je antwoord in het gesprek is nog een concept, dus er is niets verstuurd.",
  },
  routines: {
    mondayPlan: {
      name: "Maandagplan",
      task: "Schrijf elke maandagochtend één samenvatting van mijn week, alleen-lezen. Lees klanten en aanvragen waarvan de ingestelde Datum volgende stap in de komende zeven dagen valt of al voorbij is, projecten met de status In uitvoering of Wacht op feedback samen met hun Deadline, en openstaande taken op Vervaldatum. Groepeer de samenvatting per dag, noem de klant en de volgende stap en zet achterstallige items bovenaan. Houd het onder de 300 woorden. Wijzig geen record, concept of instelling.",
      runs: [
        "6 volgende stappen en 2 projectdeadlines voor deze week opgesomd; 2 items waren achterstallig.",
        "4 volgende stappen en 1 projectdeadline opgesomd; niets was achterstallig.",
      ],
      note: "Ik kon de modelaanbieder bij deze poging niet bereiken en ben gestopt voordat ik iets las. Er is niets gewijzigd; de run van volgende maandag dekt de week.",
    },
    draftInquiryReply: {
      name: "Antwoordconcepten voor nieuwe aanvragen",
      task: "Bekijk de nieuwe e-mail uit routine_trigger. Ga alleen door als de afzender via identiteitskanalen met geen enkele bestaande contactpersoon overeenkomt, of als de e-mail naar nieuw werk vraagt. Lees de Projectagenda: projecten met de status Gepland, In uitvoering of Wacht op feedback van Start tot Deadline, om de eerste vrije weken te vinden. Sla met save_message_draft één kort antwoordconcept op dat de afzender bedankt, vraagt naar doel, timing en budgetrange en twee mogelijke startdata voorstelt. Behoud een bestaand concept. Het concept is voor mijn beoordeling; verstuur het nooit en wijzig geen CRM-records.",
      runs: [
        "Antwoordconcept voor Sander Bos van Zonnehoek Energie voorbereid met twee mogelijke startdata.",
        "De e-mail kwam van een bestaande klant over lopend werk, dus er was geen concept nodig.",
      ],
    },
    quietClients: {
      name: "Contact opnemen met stille klanten",
      task: 'Zoek op de eerste van elke maand klanten met Samenwerking Doorlopend of Incidenteel die geen project hebben met de status Gepland, In uitvoering of Wacht op feedback. Lees voor elk van hen het laatste project en het laatst gekoppelde gesprek. Heeft de klant een e-mailidentiteit, sla dan met save_message_draft één kort contactconcept op dat naar het laatste project verwijst; maak anders één taak "Contact opnemen met <klantnaam>" aan met vervaldatum in deze week. Maak geen tweede taak of concept voor dezelfde klant. Verstuur nooit een bericht.',
      runs: [
        "2 contactconcepten voorbereid voor Jeneverbes Reizen en Weidevogel Verzekeringen.",
        "Taak voor contact aangemaakt voor Noorderlicht Mobility, dat geen e-mailadres in het dossier heeft.",
      ],
      note: "Ik kon de modelaanbieder bij deze poging niet bereiken en ben gestopt voordat ik iets las. Er is niets gewijzigd; de volgende run op de eerste van de maand probeert het opnieuw.",
    },
    dailyFollowUps: {
      name: "Dagelijkse opvolgconcepten voor aanvragen van vandaag",
      task: 'Zoek elke werkdagochtend aanvragen waarvan de Fase Aanvraag, Eerste gesprek of Offerte verstuurd is en waarvan de Datum volgende stap vandaag of eerder is. Lees voor elke aanvraag de klant, de contactpersonen, de tekst van de briefing of offerte en het laatst gekoppelde gesprek. Heeft de contactpersoon een e-mailidentiteit en is het laatst gekoppelde bericht van mij of ouder dan drie dagen, sla dan met save_message_draft één kort opvolgconcept op: in mijn stem, één zin over de laatste uitwisseling, één concrete volgende stap. Heeft de contactpersoon geen e-mailidentiteit, maak dan één taak "Opvolgen bij <naam contactpersoon>" aan met vervaldatum vandaag en gekoppeld aan de aanvraag. Behoud bestaande concepten en maak per aanvraag per dag geen tweede taak of concept aan. Wijzig geen fase en geen datum en verstuur nooit een bericht.',
      runs: [
        "2 opvolgconcepten opgeslagen: Lotte van Leeuwen (Weidevogel, offerte schadeformulier) en Marloes de Wit (Getijde, fase 2). De concepten wachten in de Inbox.",
        "Eén aanvraag was aan de beurt: opvolgconcept opgeslagen voor Nina Vermeulen (Veer & Grootboek). Het bestaande concept voor Sander Bos is behouden.",
        "Vandaag was er geen aanvraag aan de beurt, dus er is niets opgesteld.",
      ],
    },
    requestsToTasks: {
      name: "WhatsApp- en LinkedIn-verzoeken omzetten in taken",
      task: 'Een nieuw WhatsApp- of LinkedIn-bericht staat in routine_trigger. Ga alleen door als de afzender via identiteitskanalen met een contactpersoon overeenkomt en het bericht me vraagt iets te doen of een datum noemt. Lees de klant, de openstaande aanvragen en projecten van de contactpersoon en het gesprek. Maak één taak aan die naar het verzoek is genoemd, bijvoorbeeld "Thijs de interviewgids sturen", met de Vervaldatum uit het bericht (drie dagen vanaf nu als er geen wordt genoemd), gekoppeld aan de contactpersoon, de klant en de bijpassende aanvraag of het bijpassende project. Maak geen tweede taak voor hetzelfde verzoek. Maak en verstuur geen antwoord en wijzig geen ander record.',
      runs: [
        'Taak "Thijs de scopevarianten met prijzen sturen" aangemaakt met vervaldatum donderdag, gekoppeld aan Thijs Mulder, Leerpad Onderwijs en de usability-review van de mobiele app.',
        'Taak "Volgende stop van de chauffeur tonen in de ritlijst" aangemaakt met vervaldatum donderdag, gekoppeld aan Daan Visser, Raaf Wagenparksoftware en het dashboard voor planners.',
        "Het bericht van Sanne Bakker bevestigde alleen de tijd van de kick-off, dus er was geen taak nodig.",
      ],
    },
  },
  wiki: {
    guide: {
      title: "Werkhandleiding",
      markdown: [
        "Max Bergmann werkt alleen als Veldmark Productontwerp, UX- en productontwerper voor een klein aantal B2B-klanten, de meeste al jarenlang. Deze werkruimte bevat demodata; alle bedrijven en personen erin zijn verzonnen.",
        "",
        "## Wat er in deze werkruimte staat",
        "- **Klanten** zijn de bedrijven waarvoor ik werk of met wie ik over werk praat. De klantenlijst laat zien hoe lang we samenwerken, wat voor soort relatie het is, het totaal van mijn projecthonoraria en de volgende stap.",
        "- **Contactpersonen** zijn de mensen bij die klanten.",
        "- **Aanvragen** zijn mogelijke projecten, van het eerste bericht tot de beslissing van de klant. De waarde is mijn schatting van het project; de gewogen waarde is die schatting maal de kans van de fase.",
        "- **Projecten** zijn werk dat ik heb toegezegd. Het honorarium wordt berekend uit het dagtarief en het aantal dagen. De status Gefactureerd is alleen een label: de facturering blijft in mijn factureerprogramma.",
        "- **Taken** zijn dingen die ik heb beloofd te doen, met een vervaldatum. Taken, volgende stappen en hun data zijn gewone velden: niemand wordt automatisch herinnerd, dus ik kijk elke ochtend in de weergave Volgende stappen en Mate schrijft een maandagplan.",
        "- Een e-mail-, WhatsApp- of LinkedIn-gesprek hoort pas bij een klant of aanvraag als ik het daaraan koppel.",
        "",
        "## Wat elders blijft",
        "- Facturering en boekhouding blijven in de programma's die ik al gebruik. Deze werkruimte bevat de klantrelaties, de openstaande aanvragen en het lopende werk.",
        "- Briefings van klanten staan in het veld Briefing van de aanvraag, offertes en projectdocumenten in de Bestanden van het project, zodat zoeken en Mate ze via hun tekst vinden. De Projectagenda toont elk project van start tot deadline.",
      ],
    },
    stages: {
      title: "Fases van een aanvraag",
      markdown: [
        "Elke aanvraag doorloopt dezelfde fases, zodat het bord in één oogopslag laat zien waar elk mogelijk project staat. Gewonnen werk gaat verder als project.",
        "",
        "## Fases",
        "1. **Aanvraag:** iemand vraagt naar een project. Voeg de klant, de contactpersoon en een grove waarde toe.",
        "2. **Eerste gesprek:** we hebben gesproken over doelen, timing en wie beslist.",
        "3. **Offerte verstuurd:** de scope en mijn schatting zijn per e-mail verstuurd.",
        "4. **Gewonnen:** de klant heeft ja gezegd. Maak het project aan met dagtarief, dagen, start en deadline, gekoppeld aan de klant en de aanvraag.",
        "5. **Verloren:** de klant heeft ervoor gekozen het niet te doen of laat niets meer van zich horen. Noteer in de notities waarom.",
      ],
    },
    afterCall: {
      title: "Na een eerste gesprek",
      whenToUse: "Wanneer het eerste gesprek of de eerste afspraak over een nieuw project heeft plaatsgevonden.",
      markdown: [
        "Een eerste gesprek levert aantekeningen op, een betere schatting en de belofte om terug te komen. Met deze stappen blijft dat allemaal bij de aanvraag.",
        "",
        "## Stappen",
        "1. Schrijf doelen, timing en open vragen in de notities van de aanvraag.",
        "2. Zet de aanvraag op Eerste gesprek en werk de geschatte waarde bij.",
        "3. Stel de volgende stap en de datum in bij de aanvraag en bij de klant.",
        "4. Koppel het e-mail-, WhatsApp- of LinkedIn-gesprek met de klant aan de aanvraag.",
      ],
    },
    rates: {
      title: "Mijn dagtarieven en voorwaarden",
      markdown: [
        "Dit zijn de tarieven en voorwaarden die ik hanteer, zodat elke offerte en elk project in deze werkruimte met dezelfde cijfers rekent.",
        "",
        "## Dagtarieven",
        "- Productontwerp en designsystemen: € 950 per dag.",
        "- Gebruikersonderzoek en workshops: € 900 per dag.",
        "- UX-reviews en audits: € 850 per dag.",
        "",
        "## Voorwaarden",
        "- Ik offreer een aantal dagen per project; het projecthonorarium is dagtarief maal dagen.",
        "- Bestaande klanten met meer dan 20 dagen per jaar krijgen 5 procent korting op het dagtarief.",
        "- De helft van het honorarium is bij de start verschuldigd, de rest bij oplevering. Facturering gebeurt in mijn factureerprogramma, niet hier.",
      ],
    },
  },
  threads: {
    tidewaterProposal: {
      subject: "Redesign dashboard – offerte fase 2",
      messages: [
        "Hoi Max,\n\nBedankt voor de offerte voor fase 2. Joris en ik hebben hem gisteren gelezen. Kunnen we het onderzoeksdeel samen doornemen? We weten niet zeker of we weer vijf interviews nodig hebben.\n\nGroet,\nMarloes",
        "Hoi Marloes,\n\nGraag. Donderdag om 10 uur past me goed. Ik laat zien waar drie interviews genoeg zouden zijn en wat we dan zouden missen.\n\nGroet,\nMax",
        "Donderdag om 10 uur dus. Ik neem Joris mee.",
      ],
    },
    brightpathKickoff: {
      messages: [
        "Hoi Max! Thijs en ik houden dinsdagochtend vrij voor de kick-off. Past 9:30 uur?",
        "Hoi Sanne, 9:30 uur past. De agenda stuur ik vrijdag.",
        "Top. Kunnen we ook naar de resultaten van de oude onboardingenquête kijken? Thijs heeft ze gevonden.",
      ],
    },
    fernhillInquiry: {
      subject: "Aanvraag: UX voor onze tariefvergelijker",
      messages: [
        "Hoi Max,\n\nWe kwamen je portfolio tegen via een collega bij Weidevogel Verzekeringen. Veel bezoekers haken af in de tweede stap van onze tariefvergelijker en we willen graag een blik van buiten en een herontwerp.\n\nHeb je de komende twee maanden capaciteit?\n\nMet vriendelijke groet,\nSander Bos\nZonnehoek Energie",
        "Hoi Sander,\n\nBedankt voor je bericht. Ja, ik kan in de tweede helft van volgende maand beginnen. Voordat ik een scope voorstel: kun je me de huidige pagina en de afhaakcijfers per stap sturen?\n\nMet vriendelijke groet,\nMax Bergmann",
      ],
    },
    meadowQuestions: {
      subject: "Offerte schadeformulier – vragen",
      messages: [
        "Hoi Max,\n\nOnze juridische afdeling wil het nieuwe schadeformulier beoordelen voordat het live gaat. Kun je in de tweede week een afstemronde met hen inplannen?\n\nBedankt,\nLotte",
        "Hoi Lotte,\n\nNatuurlijk. Ik plan in week twee een afstemronde met juridische zaken in en verschuif de usabilitytest naar week drie. De aangepaste offerte volgt morgen.\n\nGroet,\nMax",
      ],
    },
    corvidCheckIn: {
      subject: "Dashboard voor planners – eerste schermen",
      messages: [
        "Hoi Daan,\n\nDe eerste planningsschermen zijn klaar. Kunnen jij en Chris er voor donderdag naar kijken? Ik hoor graag jullie feedback op de kaartweergave voordat ik verderga.\n\nGroet,\nMax",
        "Hoi Max,\n\nBedankt, ze zien er veelbelovend uit. Chris is tot woensdag op reis, dus onze feedback komt donderdag.\n\nDaan",
      ],
    },
    quillScope: {
      subject: "Onboardingprototype – volgende stap",
      messages: [
        "Hoi Max,\n\nFijn dat we vorige week hebben gesproken. Voordat we beslissen willen we de scope afstemmen: alleen de aanmeldflow, of ook de eerste bankkoppeling?\n\nNina",
        "Hoi Nina,\n\nIk zou aanmelden en de eerste bankkoppeling samen oppakken, omdat de meeste mensen precies tussen die twee afhaken. Zullen we dat maandag in een kort telefoongesprek afronden?\n\nGroet,\nMax",
      ],
    },
  },
  inbox: {
    jennaReturn: {
      messages: [
        "Hoi Jolien, ik hoop dat de budgetronde goed is verlopen. Als de passagiersapp terugkomt, help ik graag, ook met een kleinere scope.",
        "Hoi Max, grappig getimed. Het budget staat, maar op ongeveer de helft van wat we vorige maand bespraken. Zou een kleinere scope voor jou werken?",
        "Ja. Ik zou beginnen met de boekingsflow en de rest in een tweede ronde doen. In welke range zit je?",
        "Rond € 9.000. Kunnen we donderdag praten? Ik neem onze productontwerper mee, dan leren jullie elkaar kennen.",
      ],
    },
    kevinAccessibility: {
      messages: [
        "Hoi Max, Lotte noemde je toegankelijkheidsreview van ons klantenportaal. Kun je me de korte samenvatting sturen?",
        "Hoi Niels, zeker. Ik stuur je morgen de samenvatting van één pagina: vijf doorgevoerde verbeteringen, twee nog open.",
        "Top, bedankt. Ik wil hem aan juridische zaken laten zien voor de afstemronde over het schadeformulier. Kun je in week twee bij die ronde aansluiten?",
      ],
    },
    ninaCall: {
      messages: [
        "Hoi Max, bedankt voor de duidelijke mail. Maandag past voor het gesprek. Kan onze CTO in de tweede helft aansluiten?",
        "Natuurlijk, Nina. De tweede helft gaat over de bankkoppeling, dus zijn inbreng helpt. Ik stuur een uitnodiging voor 11:00 uur.",
        "Top. Let op: hij is sceptisch over prototypes.",
        "Mooi, sceptici testen het best. Ik neem een klikbare versie van het aanmelddeel mee.",
      ],
    },
    tomScope: {
      messages: [
        "Hoi Max, hoe staat het met de review van de mobiele app? Sanne vraagt naar de planning.",
        "Hoi Thijs, ik schrijf deze week twee opties: 3 dagen voor de kernflows, of 5 dagen met gebruikerstests.",
        "Mooi! Welke zou je kiezen?",
        "Eerlijk gezegd die van 5 dagen. Tests met echte leraren laten meer zien dan een review alleen.",
        "Logisch. Wat kosten ze ongeveer? Sanne wil voor donderdag een bedrag.",
      ],
    },
    alexNumbers: {
      messages: [
        "Hoi Arjan, voor de opfrisbeurt van de planner wil ik eerst graag het huidige gebruik zien. Kun je me de afhaakcijfers per stap sturen?",
        "Tuurlijk, ik zoek ze er even bij.",
        "62% begint op mobiel een plan, maar slechts 21% rondt het af. De grootste uitval zit bij de datumkiezer in stap 2.",
        "Bedankt Arjan, dat helpt enorm. Een datumkiezer die mensen kwijtraakt is meestal goed op te lossen. Ik stuur je vrijdag een kort plan met verbeterpunten en een prijs.",
      ],
    },
    danJobList: {
      messages: [
        "Max, Chris is woensdag terug. Past donderdag om 11 uur voor het feedbackgesprek?",
        "Donderdag 11 uur past. Ik laat de kaartweergave en de nieuwe ritlijst zien.",
        "Top. Eén verzoek: kan de ritlijst de volgende stop van de chauffeur tonen?",
        "Ja, dat staat al op mijn lijst. Tot donderdag.",
      ],
    },
    lauraReferral: {
      messages: [
        "Hoi Max, ik heb je gegevens doorgegeven aan Sander Bos van Zonnehoek Energie. Hij heeft UX-hulp nodig voor hun tariefvergelijker. Ik hoop dat dat goed is!",
        "Hoi Lotte, meer dan goed, bedankt! Ik let op zijn mail.",
        "Hij is aardig, maar heeft haast :)",
        "Genoteerd :) En de update over het schadeformulier stuur ik je deze week.",
      ],
    },
    chrisShiftView: {
      subject: "Roosterweergave: feedback",
      messages: [
        "Hoi Chris,\n\nIk heb de roosterweergave aan de planningsschermen toegevoegd. Kun je me als je terug bent laten weten of het weekoverzicht werkt voor jullie planners?\n\nGroet,\nMax",
        "Hoi Max,\n\nIk ben eerder terug dan gepland, dus hier alvast mijn feedback voor donderdag. Het weekoverzicht is duidelijk. Twee dingen: dubbele boekingen moeten rood worden getoond en de filters moeten behouden blijven als we van dag wisselen. Dat ergert de planners het meest.\n\nKun je me voor vrijdag laten weten wat binnen de huidige scope past?\n\nChris",
        "Hoi Chris,\n\nBedankt, dit helpt enorm. Beide passen binnen de huidige scope: dubbele boekingen in rood zijn snel gedaan en de filters houd ik vast bij het wisselen van dag. Maandag stuur ik bijgewerkte schermen.\n\nGroet,\nMax",
      ],
    },
    marcusDatePickers: {
      subject: "Audit designsysteem: datumkiezers",
      messages: [
        "Hoi Max,\n\nIk heb je bevindingen gelezen. Welke van de drie datumkiezers zou je houden? We voegen ze liever in één sprint samen dan dat we het over drie sprints verspreiden.\n\nJoris",
        "Hoi Joris,\n\nIk zou die van de rapportfilters houden. Die heeft de beste toetsenbordbediening en de duidelijkste bereikselectie. Een korte aanbeveling met screenshots voeg ik voor vrijdag toe aan de bevindingen.\n\nGroet,\nMax",
        "Hoi Max,\n\nKlinkt goed. Kun je ook opsommen welke schermen welke kiezer gebruiken? Dan kan ik het werk inschatten.\n\nJoris",
        "Hoi Joris,\n\nDoe ik. De tabel met de schermnamen komt in het rapport.\n\nGroet,\nMax",
      ],
    },
    rachelKickoff: {
      subject: "Kick-offworkshop: agenda en interviewslots",
      messages: [
        "Hoi Sanne,\n\nHier de agenda voor de kick-off van dinsdag: 9:30 doelen en succesmaatstaven, 10:30 de oude onboardingenquête, 11:30 plan voor de vier interviews met leraren. Laat het weten als er nog iemand bij moet zijn.\n\nGroet,\nMax",
        "Hoi Max,\n\nZiet er goed uit. Kunnen we beginnen met de enquêteresultaten? Thijs heeft meer data gevonden. En kunnen de interviews na 15:00 uur blijven? Dan hebben de leraren tijd.\n\nSanne",
        "Hoi Sanne,\n\nPrima, eerst de enquête. De interviews liggen allemaal tussen 15:00 en 16:30 uur, van maandag tot en met donderdag, zoals in het plan.\n\nGroet,\nMax",
        "Perfect. Thijs neemt dinsdag de export van de enquête mee. Kun je ons vooraf de interviewgids sturen, zodat we die kunnen bekijken?\n\nSanne",
      ],
    },
    priyaTestimonial: {
      subject: "Een korte quote voor mijn site",
      messages: [
        "Hoi Marloes,\n\nZou je het goed vinden als ik een korte referentie van je op mijn site plaats? Twee of drie zinnen is ruim voldoende.\n\nGroet,\nMax",
        "Hoi Max,\n\nNatuurlijk. Wat dacht je van: “Max maakte ons dashboard begrijpelijk voor mensen die nooit van analytics hielden. Hij deed het onderzoek zelf en door het herontwerp kregen we de helft minder supportvragen.” Kort het gerust in.\n\nMarloes",
        "Hoi Marloes,\n\nBedankt, mooi! Ik gebruik hem zoals hij is en stuur je de pagina voordat die live gaat.\n\nGroet,\nMax",
      ],
    },
  },
  notes: {
    deals: {
      tidewaterDashboard:
        "Samenvatting door Claude na het gesprek van dinsdag:\n- Marloes en Joris hebben de offerte gelezen en kunnen zich vinden in de prijs.\n- Ze willen drie in plaats van vijf interviews: het onderzoek gaat naar 3 dagen (€ 2.700) en het totaal naar 13 dagen (€ 12.200).\n- Joris heeft een inschatting van zijn engineeringteam nodig voordat hij akkoord geeft.\n- Volgende stap: onderzoek en ontwerp donderdag om 10 uur samen doornemen.",
      fernhillTariff:
        "Concept van ChatGPT op basis van de briefing van de klant:\n- Probleem: slechts 38% gaat door bij stap 2 (jaarverbruik), en 7.400 bezoekers komen daar.\n- Grof plan: 2 dagen onderzoek met vier interviews (€ 1.800) en 4 dagen ontwerp (€ 3.800), samen € 5.600 en daarmee binnen het budget van Sander van ongeveer € 6.000.\n- Open vragen: toegang tot de huidige pagina en de analytics ervan, en wie het resultaat bouwt.",
    },
    organizations: {
      atlas:
        "Opgeschoond door Codex (script op de CSV-export van mijn oude klantenlijst):\n- Website en het adres in Groningen uit rij 14 toegevoegd.\n- Jolien Brouwer gekoppeld en een dubbele contactrij verwijderd.\n- Er is geen ander record gewijzigd.",
    },
    tasks: {
      replySam:
        "Taak aangemaakt door Claude op basis van de e-mail van Sander:\n- Sander Bos vraagt naar capaciteit in de komende twee maanden voor de tariefvergelijker.\n- Mogelijke starts: de maandag na de deadline bij Raaf (twee dagen per week) of de maandag nadat de audit van Getijde is opgeleverd (drie dagen per week).\n- Het antwoord in het gesprek is een concept; er is niets verstuurd.",
    },
  },
  agents: {
    company: "Veldmark Productontwerp",
    records: "klanten, aanvragen en projecten",
    mate: "Mate beantwoordt vragen over mijn week, maakt van een briefing een aanvraag, maakt taken aan op basis van e-mails en bewaart antwoordconcepten wanneer ik erom vraag.",
    claude:
      "Claude schrijft de samenvatting van een gesprek in de notities van de aanvraag en schetst op basis van mijn tarieven en voorwaarden een eerste offerte.",
    chatgpt:
      "ChatGPT leest een briefing van een klant en schetst de scope met dagen en honorarium, die ik controleer voordat er iets wordt verstuurd.",
    codex:
      "Codex voert scripts uit op mijn gegevens: het importeert mijn oude klantenlijst, voegt dubbele contactpersonen samen en exporteert de projecthonoraria voor mijn boekhouding.",
    followUp:
      "De routine “Dagelijkse opvolgconcepten voor aanvragen van vandaag” draait op werkdagochtenden om 8:00 uur. Ze leest de aanvragen waarvan de datum van de volgende stap vandaag of eerder is en bewaart een kort opvolgconcept wanneer de contactpersoon een e-mailadres heeft. De concepten wachten in de Inbox op mijn beoordeling; de routine verstuurt nooit iets en wijzigt geen fase of datum.",
  },
  mateRecords: {
    title: "Project voor het ja van Leerpad",
    question:
      "Sanne heeft de onboardingflow bevestigd. Zet de aanvraag op Gewonnen en maak het project aan: 11 dagen à € 900, start over twee dagen, deadline over ongeveer zeven weken.",
    answer:
      "Klaar.\n\n- **Aanvraag:** de onboardingflow voor leraren van Leerpad is van Offerte verstuurd naar **Gewonnen** gegaan.\n- **Project:** ik heb de onboardingflow voor leraren van Leerpad Onderwijs aangemaakt, gekoppeld aan de aanvraag. 11 dagen à € 900 geven een honorarium van **€ 9.900**; het start over twee dagen en de deadline ligt over zeven weken.\n- **Klant:** Leerpad Onderwijs blijft *Doorlopend* en ik heb de volgende stap ingesteld op “Kick-offworkshop voor de onboardingflow”.\n\nHet honorarium wordt berekend uit dagtarief en dagen, dus ik heb alleen die twee ingevuld. Ik heb Sanne niets geschreven; als je een bedankbericht wilt, zeg het maar en ik bewaar het als concept.",
  },
};
