import type { Strings } from "../freelancers";

export const pl: Strings = {
  countryCode: "pl",
  company: "Bukowa Projektowanie Produktu",
  workspaceName: "Freelancerzy",
  website: "https://bukowa-design.example",
  phones: { mobile: { templates: ["+48 500 000 ###"], start: 300 } },
  selfTitle: "Niezależny projektant UX i produktu",
  lists: {
    organization: ["Klient", "Klienci", "Firmy, dla których pracuję lub z którymi rozmawiam o pracy."],
    contact: ["Kontakt", "Kontakty", "Osoby, z którymi współpracuję u moich klientów."],
    deal: ["Zapytanie", "Zapytania", "Możliwe projekty, od pierwszej wiadomości do decyzji klienta."],
    project: ["Projekt", "Projekty", "Praca, którą przyjąłem, ze stawką dzienną, liczbą dni i wyliczonym honorarium."],
    task: ["Zadanie", "Zadania", "Rzeczy, które obiecałem zrobić, z terminem."],
  },
  fields: {
    dealValue: "Szacowana wartość",
    weightedValue: "Wartość ważona",
    relationship: "Współpraca",
    clientSince: "Klient od",
    nextAction: "Następny krok",
    nextActionDate: "Data następnego kroku",
    totalFees: "Suma honorariów",
    address: "Adres",
    brief: "Brief",
    files: "Pliki",
    website: "Strona WWW",
    jobTitle: "Stanowisko",
    workType: "Rodzaj pracy",
    source: "Źródło",
    decisionDate: "Data decyzji",
    projectStatus: "Status",
    dayRate: "Stawka dzienna",
    days: "Dni",
    fee: "Honorarium",
    start: "Start",
    deadline: "Termin",
    dueDate: "Termin wykonania",
  },
  options: {
    relationship: { ongoing: "Stała", occasional: "Okazjonalna", new: "Nowa" },
    workType: {
      research: "Badania użytkowników",
      productDesign: "Projektowanie produktu",
      designSystem: "System projektowy",
      review: "Przegląd UX",
    },
    source: { repeat: "Stały klient", referral: "Polecenie", website: "Strona WWW", network: "Sieć kontaktów" },
    projectStatus: {
      planned: "Zaplanowany",
      inProgress: "W toku",
      waiting: "Czeka na opinię",
      done: "Zakończony",
      billed: "Rozliczony",
    },
  },
  stages: {
    inquiry: "Zapytanie",
    firstCall: "Pierwsza rozmowa",
    proposal: "Oferta wysłana",
    won: "Wygrane",
    lost: "Przegrane",
  },
  organizations: {
    tidewater: ["Przypływ Analytics sp. z o.o.", "Gdańsk", "przyplyw-analytics.example", "Omówić ofertę z Agnieszką"],
    brightpath: ["Ścieżka Nauki sp. z o.o.", "Wrocław", "sciezka-nauki.example", "Warsztat startowy do onboardingu"],
    corvid: [
      "Kruk Oprogramowanie Flotowe sp. z o.o.",
      "Łódź",
      "kruk-flota.example",
      "Pokazać Krzysztofowi pierwsze ekrany dla dyspozytorów",
    ],
    meadow: [
      "Skowronek Ubezpieczenia S.A.",
      "Warszawa",
      "skowronek-ubezpieczenia.example",
      "Dopytać o ofertę na formularz zgłoszenia szkody",
    ],
    quill: ["Pióro i Konto sp. z o.o.", "Poznań", "pioro-konto.example", "Rozmowa o zakresie z Natalią"],
    fernhill: [
      "Słoneczne Wzgórze Energia S.A.",
      "Katowice",
      "sloneczne-wzgorze.example",
      "Odpisać na zapytanie Roberta",
    ],
    atlas: ["Zorza Mobility sp. z o.o.", "Szczecin", "zorza-mobility.example", ""],
    juniper: [
      "Jałowiec Podróże sp. z o.o.",
      "Kraków",
      "jalowiec-podroze.example",
      "Zapytać Wojciecha o aktualne dane użycia",
    ],
  },
  addresses: {
    tidewater: ["al. Grunwaldzka 472", "80-309", "", 54.40331, 18.57534],
    brightpath: ["ul. Powstańców Śląskich 95", "53-332", "", 51.09496, 17.01943],
    corvid: ["ul. Piotrkowska 72", "90-004", "", 51.76411, 19.4566],
    meadow: ["ul. Złota 59", "00-120", "", 52.23056, 21.00239],
    quill: ["ul. Święty Marcin 80/82", "61-809", "", 52.40571, 16.91754],
    fernhill: ["ul. Mickiewicza 29", "40-085", "", 50.25882, 19.01672],
    atlas: ["Wały Chrobrego 2", "70-502", "", 53.42883, 14.5637],
    juniper: ["ul. Floriańska 14", "31-021", "", 50.06465, 19.94021],
  },
  contacts: {
    priya: ["Agnieszka", "Malinowska", "Dyrektorka produktu"],
    marcus: ["Michał", "Sadowski", "Lider zespołu inżynierskiego"],
    rachel: ["Joanna", "Woźniak", "Dyrektorka designu"],
    tom: ["Łukasz", "Walczak", "Product manager"],
    dan: ["Krzysztof", "Pawlak", "CTO"],
    chris: ["Kamil", "Olszewski", "Product manager"],
    laura: ["Karolina", "Kozłowska", "Dyrektorka ds. cyfrowych"],
    kevin: ["Adam", "Dąbrowski", "Product owner"],
    nina: ["Natalia", "Sikora", "Współzałożycielka"],
    sam: ["Robert", "Krawczyk", "Kierownik marketingu"],
    jenna: ["Monika", "Wiśniewska", "Kierowniczka produktu"],
    alex: ["Wojciech", "Mazur", "Właściciel"],
  },
  deals: {
    tidewaterDashboard: ["Przypływ – redesign dashboardu analitycznego, etap 2", "Omówić ofertę z Agnieszką"],
    tidewaterDesignSystem: ["Przypływ – audyt systemu projektowego", "Projekt wystartował"],
    brightpathOnboarding: ["Ścieżka Nauki – onboarding dla nauczycieli", "Projekt wystartował"],
    brightpathMobile: [
      "Ścieżka Nauki – przegląd użyteczności aplikacji mobilnej",
      "Wysłać Łukaszowi dwie opcje zakresu",
    ],
    corvidDispatch: ["Kruk – dashboard dla dyspozytorów", "Projekt wystartował"],
    meadowClaims: ["Skowronek – redesign formularza zgłoszenia szkody", "Dopytać Karolinę o ofertę"],
    meadowPortal: ["Skowronek – redesign portalu brokerskiego", "Przegrane na rzecz wewnętrznego zespołu"],
    quillOnboarding: ["Pióro i Konto – prototyp onboardingu w aplikacji", "Rozmowa o zakresie z Natalią"],
    fernhillTariff: ["Słoneczne Wzgórze – porównywarka taryf", "Odpisać Robertowi z możliwymi terminami startu"],
    atlasRider: ["Zorza – redesign aplikacji dla pasażerów", "Przegrane przez budżet"],
    juniperRefresh: ["Jałowiec – odświeżenie planera podróży", "Zapytać Wojciecha o aktualne dane użycia"],
  },
  projects: {
    tidewaterAudit: "Przypływ – audyt systemu projektowego",
    brightpathOnboardingFlow: "Ścieżka Nauki – onboarding dla nauczycieli",
    corvidDispatchDesign: "Kruk – dashboard dla dyspozytorów",
    juniperCheckout: "Jałowiec – audyt UX procesu zakupu",
    meadowAccessibility: "Skowronek – przegląd dostępności strefy klienta",
    brightpathQuiz: "Ścieżka Nauki – kreator quizów dla nauczycieli",
  },
  tasks: {
    walkthroughPrep: "Przygotować omówienie oferty na etap 2 dla Agnieszki",
    scopeOptions: "Opracować dwie opcje zakresu dla przeglądu aplikacji mobilnej",
    kickoffAgenda: "Przygotować agendę warsztatu startowego",
    followUpLaura: "Dopytać Karolinę o ofertę na formularz zgłoszenia szkody",
    replySam: "Odpisać Robertowi na zapytanie z możliwymi terminami startu",
    reviewQuillScreens: "Przejrzeć obecne ekrany onboardingu Pióro i Konto",
    testimonial: "Poprosić Agnieszkę o krótką rekomendację",
    corvidCheckIn: "Kwartalna rozmowa z Krzysztofem",
  },
  views: {
    clients: "Lista klientów",
    inquiries: "Tablica zapytań",
    projects: "Projekty",
    nextActions: "Następne kroki",
    openTasks: "Otwarte zadania",
    calendar: "Kalendarz projektów",
  },
  widgets: {
    openQuotes: "Otwarte oferty",
    running: "Honoraria trwających projektów",
    fees: "Honoraria projektów z ostatnich 12 miesięcy",
    overdueTasks: "Zaległe zadania",
    byStage: "Wartość zapytań według etapu",
    byStatus: "Projekty według statusu",
    byClient: "Honoraria projektów według klienta",
    feesByMonth: "Honoraria projektów według miesiąca startu",
    nextActions: "Następne kroki w ciągu dwóch tygodni",
    tasksMonth: "Otwarte zadania w tym miesiącu",
  },
  files: {
    fernhillBrief: {
      name: "Brief Słoneczne Wzgórze.pdf",
      lines: [
        "# Słoneczne Wzgórze Energia – brief: porównywarka taryf",
        "Od Roberta Krawczyka, kierownika marketingu.",
        "## Problem",
        "Wielu odwiedzających porzuca naszą porównywarkę taryf w drugim kroku, w którym wpisuje roczne zużycie.",
        "| Krok | Odwiedzający | Przechodzi dalej |",
        "| 1. Kod pocztowy | 10 000 | 74% |",
        "| 2. Roczne zużycie | 7 400 | 38% |",
        "| 3. Wybór taryfy | 2 800 | 61% |",
        "## Czego oczekujemy",
        "Spojrzenia z zewnątrz, kilku wywiadów z użytkownikami, a potem redesignu porównywarki taryf, który nasi programiści będą mogli zbudować.",
        "## Termin i budżet",
        "Start w ciągu najbliższych dwóch miesięcy; budżet około 6 000 zł.",
      ],
    },
    juniperBrief: {
      name: "Brief planer podróży.docx",
      lines: [
        "# Jałowiec Podróże – odświeżenie planera podróży",
        "## Cel",
        "Mniej porzuconych planów podróży na telefonie; planer był ostatnio przeprojektowywany cztery lata temu.",
        "## Zadanie",
        "Krótki przegląd UX z konkretnymi poprawkami, podobny do audytu procesu zakupu, z tabelami przed i po w stylu porównywarki taryf.",
        "## Budżet",
        "Około 3 500 zł.",
      ],
    },
    tidewaterProposal: {
      name: "Oferta etap 2.pdf",
      lines: [
        "# Przypływ Analytics – redesign dashboardu, etap 2",
        "Przygotowano dla Agnieszki Malinowskiej i Michała Sadowskiego.",
        "## Zakres",
        "| Część | Dni | Honorarium |",
        "| Badania: pięć wywiadów z klientami | 5 | 4 500 zł |",
        "| Projekt nowego dashboardu | 10 | 9 500 zł |",
        "| Razem | 15 | 14 000 zł |",
        "Przy trzech wywiadach zamiast pięciu badania zajmą 3 dni (2 700 zł).",
      ],
    },
    tidewaterFindings: {
      name: "Wyniki testów użyteczności.md",
      lines: [
        "# Wyniki testów użyteczności – audyt systemu projektowego",
        "## Co działa",
        "Przyciski i pola formularzy są spójne w całym produkcie.",
        "## Co nie działa",
        "Trzy różne selektory dat; tabele używają czterech skal odstępów.",
        "## Dalej",
        "Najpierw scalić selektory dat; tabele raportów będą miały układ z przetestowanej porównywarki taryf.",
      ],
    },
    corvidFeedback: {
      name: "Pierwsze ekrany – opinie.md",
      lines: [
        "# Pierwsze ekrany dla dyspozytorów – opinie",
        "## Krzysztof Pawlak",
        "Widok mapy to właściwy punkt wyjścia; lista zleceń potrzebuje następnego przystanku kierowcy.",
        "## Kamil Olszewski",
        "Filtry powinny zostać po zmianie dnia. Opinia o widoku zmian będzie w czwartek.",
      ],
    },
    interviews: {
      name: "Harmonogram wywiadów.xlsx",
    },
  },
  interviewRows: [
    ["Nauczyciel", "Szkoła", "Dzień", "Godzina"],
    ["Wywiad 1", "Szkoła Podstawowa nr 34", "Poniedziałek", "15:30"],
    ["Wywiad 2", "Liceum Ogólnokształcące nr 7", "Wtorek", "16:00"],
    ["Wywiad 3", "Technikum nr 2", "Środa", "15:00"],
    ["Wywiad 4", "Szkoła Podstawowa nr 9", "Czwartek", "16:30"],
  ],
  calendar: {
    name: "Spotkania z klientami",
    events: [
      "Omówienie oferty na etap 2 z Przypływem",
      "Warsztat startowy w Ścieżce Nauki",
      "Rozmowa o zakresie z Pióro i Konto",
      "Opinie o ekranach dyspozytorskich z Krukiem",
    ],
  },
  trash: { contact: "Robert Krawczyk", deal: "Zorza – audyt aplikacji dla kierowców" },
  mate: {
    title: "Zapytanie z briefu Słoneczne Wzgórze",
    question: "Załączyłem Brief Słoneczne Wzgórze.pdf. Utwórz z niego zapytanie i zaproponuj dwa terminy startu.",
    answer:
      "Gotowe. Zapytanie **Słoneczne Wzgórze – porównywarka taryf** jest na etapie Zapytanie, powiązane z firmą Słoneczne Wzgórze Energia i Robertem Krawczykiem, z szacowaną wartością 6 000 zł i źródłem Polecenie (Robert trafił do ciebie przez firmę Skowronek). Brief Słoneczne Wzgórze.pdf jest dołączony do pola Brief zapytania.\n\nZ briefu: odwiedzający odpadają w kroku 2 porównywarki taryf (roczne zużycie), gdzie dalej przechodzi tylko 38%. Robert prosi o kilka wywiadów z użytkownikami i redesign, start w ciągu dwóch miesięcy, budżet około 6 000 zł. Przy 900 zł za dzień badań i 950 zł za projekt to około 6–7 dni.\n\n**Kalendarz projektów:**\n- Przypływ – audyt systemu projektowego trwa do terminu za około trzy i pół tygodnia.\n- Kruk – dashboard dla dyspozytorów czeka na opinię i kończy się za około dziesięć dni.\n- Ścieżka Nauki – onboarding dla nauczycieli potrwa jeszcze pięć do sześciu tygodni.\n\n**Dwa możliwe terminy startu:**\n1. W poniedziałek po terminie w Kruku, dwa dni w tygodniu obok Ścieżki Nauki i Przypływu.\n2. W poniedziałek po oddaniu audytu w Przypływie, trzy dni w tygodniu.\n\nJako następny krok ustawiono „Odpisać Robertowi z możliwymi terminami startu”. Twoja odpowiedź w wątku jest nadal szkicem, więc nic nie zostało wysłane.",
  },
  routines: {
    mondayPlan: {
      name: "Plan na poniedziałek",
      task: "W każdy poniedziałek rano napisz jedno podsumowanie mojego tygodnia, bez zmieniania czegokolwiek. Odczytaj klientów i zapytania, których skonfigurowana Data następnego kroku wypada w ciągu najbliższych siedmiu dni lub już minęła, projekty ze Statusem W toku lub Czeka na opinię wraz z Terminem oraz otwarte zadania według Terminu wykonania. Pogrupuj podsumowanie według dni, podaj klienta i następny krok, a zaległe pozycje umieść na początku. Maksymalnie 300 słów. Nie zmieniaj żadnego rekordu, szkicu ani ustawienia.",
      runs: [
        "Wypisano 6 następnych kroków i 2 terminy projektów na ten tydzień; 2 pozycje były zaległe.",
        "Wypisano 4 następne kroki i 1 termin projektu; nic nie było zaległe.",
      ],
      note: "Przy tej próbie nie udało się połączyć z dostawcą modelu, więc proces zatrzymano, zanim cokolwiek odczytano. Nic nie zostało zmienione; następne poniedziałkowe uruchomienie obejmie cały tydzień.",
    },
    draftInquiryReply: {
      name: "Szkice odpowiedzi na nowe zapytania",
      task: "Sprawdź nowego maila wskazanego w routine_trigger. Kontynuuj tylko wtedy, gdy nadawca nie pasuje do żadnego istniejącego kontaktu przez kanały tożsamości albo mail pyta o nową pracę. Odczytaj Kalendarz projektów: projekty ze Statusem Zaplanowany, W toku lub Czeka na opinię od Startu do Terminu, aby znaleźć pierwsze wolne tygodnie. Zapisz przez save_message_draft jeden krótki szkic odpowiedzi, który dziękuje nadawcy, pyta o cel, termin i widełki budżetu oraz proponuje dwa możliwe terminy startu. Istniejący szkic zachowaj. Szkic jest do mojego przeglądu; nigdy go nie wysyłaj i nie zmieniaj rekordów CRM.",
      runs: [
        "Przygotowano szkic odpowiedzi dla Roberta Krawczyka (Słoneczne Wzgórze Energia) z dwoma możliwymi terminami startu.",
        "Mail przyszedł od stałego klienta w sprawie trwającej pracy, więc szkic nie był potrzebny.",
      ],
    },
    quietClients: {
      name: "Odezwij się do cichych klientów",
      task: "Pierwszego dnia każdego miesiąca znajdź klientów, których Współpraca to Stała lub Okazjonalna i którzy nie mają projektu ze Statusem Zaplanowany, W toku lub Czeka na opinię. Dla każdego odczytaj ostatni projekt i ostatnią powiązaną rozmowę. Jeśli klient ma tożsamość e-mail, zapisz przez save_message_draft jeden krótki szkic z odwołaniem do ostatniego projektu; w przeciwnym razie utwórz jedno zadanie „Odezwać się do <nazwa klienta>” z terminem w tym tygodniu. Nie twórz drugiego zadania ani szkicu dla tego samego klienta. Nigdy nie wysyłaj wiadomości.",
      runs: [
        "Przygotowano 2 szkice wiadomości dla klientów Jałowiec Podróże i Skowronek Ubezpieczenia.",
        "Utworzono zadanie kontaktu dla klienta Zorza Mobility, u którego nie ma w systemie adresu e-mail.",
      ],
      note: "Przy tej próbie nie udało się połączyć z dostawcą modelu, więc proces zatrzymano, zanim cokolwiek odczytano. Nic nie zostało zmienione; następne uruchomienie pierwszego dnia miesiąca spróbuje ponownie.",
    },
    dailyFollowUps: {
      name: "Codzienne szkice do zapytań z terminem na dziś",
      task: "W każdy dzień roboczy rano znajdź zapytania, których Etap to Zapytanie, Pierwsza rozmowa lub Oferta wysłana i których Data następnego kroku to dziś lub wcześniej. Dla każdego odczytaj klienta, jego kontakty, tekst Briefu lub oferty i ostatnią powiązaną rozmowę. Jeśli kontakt ma tożsamość e-mail, a ostatnia powiązana wiadomość pochodzi ode mnie lub jest starsza niż trzy dni, zapisz przez save_message_draft jeden krótki szkic wiadomości: moim tonem, jedno zdanie o ostatniej wymianie, jeden konkretny następny krok. Jeśli kontakt nie ma tożsamości e-mail, utwórz jedno zadanie „Odezwać się do <imię i nazwisko kontaktu>” z terminem na dziś, powiązane z zapytaniem. Istniejące szkice zachowaj i nie twórz drugiego zadania ani szkicu dla tego samego zapytania w ten sam dzień. Nie zmieniaj żadnego etapu ani żadnej daty i nigdy nie wysyłaj wiadomości.",
      runs: [
        "Zapisano 2 szkice wiadomości: Karolina Kozłowska (Skowronek, oferta na formularz zgłoszenia szkody) i Agnieszka Malinowska (Przypływ, etap 2). Szkice czekają w Skrzynce odbiorczej.",
        "Termin miało jedno zapytanie: zapisano szkic wiadomości dla Natalii Sikory (Pióro i Konto). Istniejący szkic dla Roberta Krawczyka został zachowany.",
        "Na dziś żadne zapytanie nie miało terminu, więc nic nie przygotowano.",
      ],
    },
    requestsToTasks: {
      name: "Zamieniaj prośby z WhatsApp i LinkedIn na zadania",
      task: "W routine_trigger jest nowa wiadomość z WhatsApp lub LinkedIn. Kontynuuj tylko wtedy, gdy nadawca pasuje do kontaktu przez kanały tożsamości, a wiadomość prosi mnie o coś lub podaje datę. Odczytaj klienta kontaktu, jego otwarte zapytania i projekty oraz rozmowę. Utwórz jedno zadanie nazwane od prośby, na przykład „Wysłać Łukaszowi przewodnik do wywiadów”, z Terminem wykonania z wiadomości (za trzy dni, gdy żaden nie jest podany), powiązane z kontaktem, klientem i pasującym zapytaniem lub projektem. Nie twórz drugiego zadania dla tej samej prośby. Nie przygotowuj ani nie wysyłaj odpowiedzi i nie zmieniaj żadnego innego rekordu.",
      runs: [
        "Utworzono zadanie „Wysłać Łukaszowi opcje zakresu z cenami” z terminem na czwartek, powiązane z Łukaszem Walczakiem, firmą Ścieżka Nauki i przeglądem aplikacji mobilnej.",
        "Utworzono zadanie „Pokazać następny przystanek kierowcy na liście zleceń” z terminem na czwartek, powiązane z Krzysztofem Pawlakiem, firmą Kruk Oprogramowanie Flotowe i projektem dashboardu dla dyspozytorów.",
        "Wiadomość od Joanny Woźniak tylko potwierdzała godzinę warsztatu startowego, więc zadanie nie było potrzebne.",
      ],
    },
  },
  wiki: {
    guide: {
      title: "Przewodnik operacyjny",
      markdown: [
        "Max Bergmann pracuje samodzielnie jako Bukowa Projektowanie Produktu, projektant UX i produktu dla niewielkiej liczby klientów B2B, z których większość zna od lat. Ten obszar roboczy zawiera dane demonstracyjne; wszystkie firmy i osoby są zmyślone.",
        "",
        "## Co jest w tym obszarze roboczym",
        "- **Klienci** to firmy, dla których pracuję lub z którymi rozmawiam o pracy. Lista klientów pokazuje, od jak dawna współpracujemy, rodzaj współpracy, sumę moich honorariów i następny krok.",
        "- **Kontakty** to osoby w tych firmach.",
        "- **Zapytania** to możliwe projekty, od pierwszej wiadomości do decyzji klienta. Wartość to moje oszacowanie projektu; wartość ważona to to oszacowanie razy prawdopodobieństwo etapu.",
        "- **Projekty** to praca, którą przyjąłem. Honorarium jest wyliczane ze stawki dziennej i liczby dni. Status Rozliczony to tylko etykieta: fakturowanie zostaje w moim programie do faktur.",
        "- **Zadania** to rzeczy, które obiecałem zrobić, z terminem. Zadania, następne kroki i ich daty to zwykłe pola: nikt nie dostaje o nich automatycznych przypomnień, dlatego co rano zaglądam do widoku Następne kroki, a Mate pisze plan na poniedziałek.",
        "- Rozmowa e-mailowa, na WhatsApp lub LinkedIn należy do klienta albo zapytania dopiero wtedy, gdy ją tam powiążę.",
        "",
        "## Co zostaje gdzie indziej",
        "- Fakturowanie i księgowość zostają w narzędziach, których już używam. Tutaj są relacje z klientami, otwarte zapytania i trwająca praca.",
        "- Briefy od klientów leżą w polu Brief zapytania, oferty i dokumenty projektowe w Plikach projektu, dzięki czemu wyszukiwarka i Mate znajdują je po treści. Kalendarz projektów pokazuje każdy projekt od startu do terminu.",
      ],
    },
    stages: {
      title: "Etapy zapytania",
      markdown: [
        "Każde zapytanie przechodzi przez te same etapy, więc tablica od razu pokazuje, na czym stoi każdy możliwy projekt. Wygrana praca przechodzi dalej jako projekt.",
        "",
        "## Etapy",
        "1. **Zapytanie:** ktoś pyta o projekt. Dodaj klienta, osobę i orientacyjną wartość.",
        "2. **Pierwsza rozmowa:** rozmawialiśmy o celach, terminie i o tym, kto decyduje.",
        "3. **Oferta wysłana:** zakres i moje oszacowanie poszły mailem.",
        "4. **Wygrane:** klient się zgodził. Utwórz projekt ze stawką dzienną, liczbą dni, startem i terminem, powiązany z klientem i zapytaniem.",
        "5. **Przegrane:** klient zdecydował się na coś innego albo przestał się odzywać. Zapisz powód w notatkach.",
      ],
    },
    afterCall: {
      title: "Po pierwszej rozmowie",
      whenToUse: "Gdy odbyła się pierwsza rozmowa lub spotkanie o nowym projekcie.",
      markdown: [
        "Po pierwszej rozmowie zostają notatki, dokładniejsze oszacowanie i obietnica, że się odezwę. Te kroki trzymają to wszystko przy zapytaniu.",
        "",
        "## Kroki",
        "1. Zapisz cele, termin i otwarte pytania w notatkach zapytania.",
        "2. Przenieś zapytanie na etap Pierwsza rozmowa i zaktualizuj szacowaną wartość.",
        "3. Ustaw następny krok i jego datę w zapytaniu i u klienta.",
        "4. Powiąż rozmowę e-mailową, z WhatsApp lub LinkedIn z klientem z zapytaniem.",
      ],
    },
    rates: {
      title: "Moje stawki i warunki",
      markdown: [
        "To stawki i warunki, które podaję, dzięki czemu każda oferta i każdy projekt w tym obszarze roboczym liczy się według tych samych liczb.",
        "",
        "## Stawki dzienne",
        "- Projektowanie produktu i systemy projektowe: 950 zł za dzień.",
        "- Badania użytkowników i warsztaty: 900 zł za dzień.",
        "- Przeglądy UX i audyty: 850 zł za dzień.",
        "",
        "## Warunki",
        "- Wyceniam liczbę dni na projekt; honorarium to stawka dzienna razy liczba dni.",
        "- Stali klienci, którzy zamawiają więcej niż 20 dni w roku, dostają 5 procent rabatu od stawki dziennej.",
        "- Połowa honorarium jest płatna na starcie, reszta przy oddaniu. Fakturowanie odbywa się w moim programie do faktur, nie tutaj.",
      ],
    },
  },
  threads: {
    tidewaterProposal: {
      subject: "Redesign dashboardu – oferta na etap 2",
      messages: [
        "Cześć Max,\n\ndzięki za ofertę na etap 2. Michał i ja przeczytaliśmy ją wczoraj. Możemy przejść razem przez część badawczą? Nie jesteśmy pewni, czy znowu potrzebujemy pięciu wywiadów.\n\nPozdrawiam\nAgnieszka",
        "Cześć Agnieszko,\n\nchętnie. W czwartek o 10:00 mi pasuje. Pokażę, gdzie wystarczyłyby trzy wywiady i co byśmy wtedy stracili.\n\nPozdrawiam\nMax",
        "Czyli czwartek o 10:00. Przyjdę z Michałem.",
      ],
    },
    brightpathKickoff: {
      messages: [
        "Cześć Max! Tomek i ja zostawiamy sobie wtorek rano na warsztat startowy. Pasuje ci 9:30?",
        "Cześć Joanno, 9:30 pasuje. Agendę wyślę w piątek.",
        "Super. Możemy też spojrzeć na wyniki starej ankiety onboardingowej? Tomek je znalazł.",
      ],
    },
    fernhillInquiry: {
      subject: "Zapytanie: UX dla naszej porównywarki taryf",
      messages: [
        "Cześć Max,\n\ntrafiliśmy na Twoje portfolio przez koleżankę z firmy Skowronek Ubezpieczenia. Wielu odwiedzających porzuca naszą porównywarkę taryf w drugim kroku i chcielibyśmy spojrzeć na nią z zewnątrz oraz ją przeprojektować.\n\nCzy miałbyś wolne moce w ciągu najbliższych dwóch miesięcy?\n\nPozdrawiam\nRobert Krawczyk\nSłoneczne Wzgórze Energia",
        "Cześć Robercie,\n\ndzięki za wiadomość. Tak, mogę zacząć w drugiej połowie przyszłego miesiąca. Zanim zaproponuję zakres, czy możesz przesłać mi aktualną stronę i dane o porzuceniach w każdym kroku?\n\nPozdrawiam\nMax Bergmann",
      ],
    },
    meadowQuestions: {
      subject: "Oferta na formularz zgłoszenia szkody – pytania",
      messages: [
        "Cześć Max,\n\nnasz dział prawny chce przejrzeć nowy formularz zgłoszenia szkody, zanim zostanie uruchomiony. Czy możesz zaplanować z nimi rundę konsultacji w drugim tygodniu?\n\nDzięki\nKarolina",
        "Cześć Karolino,\n\noczywiście. Dodam rundę z działem prawnym w tygodniu drugim, a test użyteczności przesunę na tydzień trzeci. Zaktualizowaną ofertę wyślę jutro.\n\nPozdrawiam\nMax",
      ],
    },
    corvidCheckIn: {
      subject: "Dashboard dla dyspozytorów – pierwsze ekrany",
      messages: [
        "Cześć Krzysztofie,\n\npierwsze ekrany dla dyspozytorów są gotowe. Czy Ty i Kamil moglibyście je obejrzeć do czwartku? Chciałbym poznać Waszą opinię o widoku mapy, zanim pójdę dalej.\n\nPozdrawiam\nMax",
        "Cześć Max,\n\ndzięki, wyglądają obiecująco. Kamil jest w podróży do środy, więc nasza opinia przyjdzie w czwartek.\n\nKrzysztof",
      ],
    },
    quillScope: {
      subject: "Prototyp onboardingu – następny krok",
      messages: [
        "Cześć Max,\n\nmiło się rozmawiało w zeszłym tygodniu. Zanim się zdecydujemy, chcielibyśmy uzgodnić zakres: tylko rejestracja czy także pierwsze połączenie z bankiem?\n\nNatalia",
        "Cześć Natalio,\n\nzająłbym się rejestracją i pierwszym połączeniem z bankiem razem, bo większość osób odpada właśnie między jednym a drugim. Ustalimy to w krótkiej rozmowie w poniedziałek?\n\nPozdrawiam\nMax",
      ],
    },
  },
  inbox: {
    jennaReturn: {
      messages: [
        "Cześć Moniko, mam nadzieję, że runda budżetowa poszła dobrze. Jeśli aplikacja dla pasażerów wróci, chętnie pomogę, także w mniejszym zakresie.",
        "Cześć Max, zabawny zbieg okoliczności. Poszła, ale mniej więcej na połowę tego, o czym rozmawialiśmy w zeszłym miesiącu. Czy mniejszy zakres byłby dla ciebie możliwy?",
        "Tak. Zacząłbym od procesu rezerwacji, a resztę zostawił na drugą rundę. W jakich widełkach jesteście?",
        "Około 9 000 zł. Możemy porozmawiać w czwartek? Przyprowadzę naszą projektantkę produktu, żebyście się poznali.",
      ],
    },
    kevinAccessibility: {
      messages: [
        "Cześć Max, Karolina wspominała o twoim przeglądzie dostępności naszej strefy klienta. Możesz mi wysłać krótkie podsumowanie?",
        "Cześć Adamie, jasne. Jutro wyślę jednostronicowe podsumowanie: pięć poprawek wdrożonych, dwie wciąż otwarte.",
        "Świetnie, dzięki. Chciałbym pokazać je naszemu działowi prawnemu przed rundą konsultacji formularza. Możesz dołączyć do tej rundy w drugim tygodniu?",
      ],
    },
    ninaCall: {
      messages: [
        "Cześć Max, dzięki za czytelnego maila. W poniedziałek pasuje na rozmowę. Czy nasz CTO mógłby dołączyć na drugą połowę?",
        "Oczywiście, Natalio. Druga połowa dotyczy połączenia z bankiem, więc jego głos się przyda. Wyślę zaproszenie na 11:00.",
        "Super. Uprzedzam: jest sceptyczny wobec prototypów.",
        "Dobrze, sceptycy testują najlepiej. Przygotuję klikalną wersję części z rejestracją.",
      ],
    },
    tomScope: {
      messages: [
        "Cześć Max, jak idzie przegląd aplikacji mobilnej? Joanna pyta o termin.",
        "Cześć Tomku, w tym tygodniu piszę dwie opcje: 3 dni na główne ścieżki albo 5 dni z testami z użytkownikami.",
        "Super! Którą byś wybrał?",
        "Szczerze? Tę na 5 dni. Testy z prawdziwymi nauczycielami pokażą więcej niż sam przegląd.",
        "Ma sens. Ile mniej więcej kosztuje każda? Joanna chce poznać kwotę przed czwartkiem.",
      ],
    },
    alexNumbers: {
      messages: [
        "Cześć Wojciechu, do odświeżenia planera chciałbym najpierw zobaczyć aktualne wykorzystanie. Możesz mi wysłać dane o porzuceniach w każdym kroku?",
        "Jasne, już je wyciągam.",
        "62% zaczyna plan na telefonie, tylko 21% go kończy. Największy odpływ jest przy wyborze daty w kroku 2.",
        "Dzięki Wojciechu, to bardzo pomaga. Selektor daty, który traci ludzi, zwykle da się łatwo naprawić. Do piątku wyślę krótki plan poprawek z ceną.",
      ],
    },
    danJobList: {
      messages: [
        "Max, Kamil wraca w środę. Czwartek o 11:00 pasuje na rozmowę o opiniach?",
        "Czwartek o 11:00 pasuje. Pokażę widok mapy i nową listę zleceń.",
        "Świetnie. Jedna prośba: czy lista zleceń mogłaby pokazywać następny przystanek kierowcy?",
        "Tak, to już jest na mojej liście. Do zobaczenia w czwartek.",
      ],
    },
    lauraReferral: {
      messages: [
        "Cześć Max, podałam twoje dane Robertowi Krawczykowi z firmy Słoneczne Wzgórze Energia. Potrzebuje pomocy UX przy porównywarce taryf. Mam nadzieję, że to w porządku!",
        "Cześć Karolino, więcej niż w porządku, dziękuję! Będę wypatrywał jego maila.",
        "Jest miły, ale się spieszy :)",
        "Przyjęte :) A aktualizację w sprawie formularza zgłoszenia szkody wyślę ci jeszcze w tym tygodniu.",
      ],
    },
    chrisShiftView: {
      subject: "Widok zmian: opinia",
      messages: [
        "Cześć Kamilu,\n\ndodałem widok zmian do ekranów dla dyspozytorów. Gdy wrócisz, napisz proszę, czy tygodniowy przegląd sprawdzi się u Waszych dyspozytorów.\n\nPozdrawiam\nMax",
        "Cześć Max,\n\nwróciłem wcześniej, niż planowałem, więc przesyłam opinię już przed czwartkiem. Tygodniowy przegląd jest czytelny. Dwie rzeczy: podwójne rezerwacje powinny być na czerwono, a filtry powinny zostać po zmianie dnia. To najbardziej denerwuje dyspozytorów.\n\nCzy do piątku możesz mi powiedzieć, co zmieści się w obecnym zakresie?\n\nKamil",
        "Cześć Kamilu,\n\ndzięki, to bardzo pomocne. Obie rzeczy mieszczą się w obecnym zakresie: podwójne rezerwacje na czerwono to szybka sprawa, a filtry zostaną po zmianie dnia. Zaktualizowane ekrany wyślę w poniedziałek.\n\nPozdrawiam\nMax",
      ],
    },
    marcusDatePickers: {
      subject: "Audyt systemu projektowego: selektory dat",
      messages: [
        "Cześć Max,\n\nprzeczytałem Twoje wnioski. Który z trzech selektorów dat byś zostawił? Wolimy scalić je w jednym sprincie, niż rozciągać to na trzy.\n\nMarcin",
        "Cześć Michale,\n\nzostawiłbym ten z filtrów raportów. Ma najlepszą obsługę z klawiatury i najczytelniejszy wybór zakresu. Krótką rekomendację ze zrzutami ekranu dodam do wniosków do piątku.\n\nPozdrawiam\nMax",
        "Cześć Max,\n\nbrzmi dobrze. Czy możesz też wypisać, które ekrany używają którego selektora? Wtedy oszacuję nakład pracy.\n\nMarcin",
        "Cześć Michale,\n\njasne. Tabela z nazwami ekranów trafi do raportu.\n\nPozdrawiam\nMax",
      ],
    },
    rachelKickoff: {
      subject: "Warsztat startowy: agenda i terminy wywiadów",
      messages: [
        "Cześć Joanno,\n\nagenda wtorkowego warsztatu startowego: 9:30 cele i miary sukcesu, 10:30 stara ankieta onboardingowa, 11:30 plan czterech wywiadów z nauczycielami. Daj znać, jeśli ktoś jeszcze powinien dołączyć.\n\nPozdrawiam\nMax",
        "Cześć Max,\n\nwygląda dobrze. Możemy zacząć od wyników ankiety? Tomek znalazł więcej danych. I czy wywiady mogą zostać po 15:00? Wtedy nauczyciele mają czas.\n\nJoanna",
        "Cześć Joanno,\n\npewnie, najpierw ankieta. Wszystkie wywiady są między 15:00 a 16:30, od poniedziałku do czwartku, jak w planie.\n\nPozdrawiam\nMax",
        "Świetnie. Tomek przyniesie eksport ankiety we wtorek. Możesz nam wcześniej wysłać przewodnik do wywiadów, żebyśmy mogli go obejrzeć?\n\nJoanna",
      ],
    },
    priyaTestimonial: {
      subject: "Krótki cytat na moją stronę",
      messages: [
        "Cześć Agnieszko,\n\nczy zgodziłabyś się na krótką rekomendację na mojej stronie? Wystarczą dwa, trzy zdania.\n\nPozdrawiam\nMax",
        "Cześć Max,\n\noczywiście. Co powiesz na: „Max sprawił, że nasz dashboard stał się zrozumiały dla ludzi, którzy nigdy nie lubili analityki. Sam przeprowadził badania, a redesign o połowę zmniejszył liczbę pytań do supportu.” Śmiało skracaj.\n\nAgnieszka",
        "Cześć Agnieszko,\n\ndziękuję, jest świetna. Użyję jej bez zmian i wyślę Ci stronę, zanim pójdzie na żywo.\n\nPozdrawiam\nMax",
      ],
    },
  },
  notes: {
    deals: {
      tidewaterDashboard:
        "Podsumowanie od Claude po wtorkowej rozmowie:\n- Agnieszka i Michał przeczytali ofertę i akceptują cenę.\n- Chcieliby trzy wywiady zamiast pięciu: badania skracają się do 3 dni (2 700 zł), a suma do 13 dni (12 200 zł).\n- Michał potrzebuje wyceny pracy od swojego zespołu, zanim da zielone światło.\n- Następny krok: w czwartek o 10:00 wspólnie przejść przez badania i projekt.",
      fernhillTariff:
        "Szkic od ChatGPT na podstawie briefu klienta:\n- Problem: tylko 38% przechodzi dalej w kroku 2 (roczne zużycie), a dociera tam 7 400 odwiedzających.\n- Ogólny plan: 2 dni badań z czterema wywiadami (1 800 zł) i 4 dni projektu (3 800 zł), razem 5 600 zł, czyli w budżecie Roberta wynoszącym około 6 000 zł.\n- Otwarte pytania: dostęp do obecnej strony i jej analityki oraz to, kto zbuduje wynik.",
    } as Partial<Record<"tidewaterDashboard" | "fernhillTariff", string>>,
    organizations: {
      atlas:
        "Uporządkowane przez Codex (skrypt na eksporcie CSV mojej starej tabeli klientów):\n- Dodano stronę WWW i adres w Szczecinie z wiersza 14.\n- Powiązano Monikę Wiśniewską i usunięto zduplikowany wiersz kontaktu.\n- Żaden inny rekord nie został zmieniony.",
    } as Partial<Record<"atlas", string>>,
    tasks: {
      replySam:
        "Zadanie utworzone przez Claude na podstawie maila Roberta:\n- Robert Krawczyk pyta o wolne moce w ciągu najbliższych dwóch miesięcy na porównywarkę taryf.\n- Możliwe starty: poniedziałek po terminie w Kruku (dwa dni w tygodniu) albo poniedziałek po oddaniu audytu w Przypływie (trzy dni w tygodniu).\n- Odpowiedź w wątku jest szkicem; nic nie zostało wysłane.",
    } as Partial<Record<"replySam", string>>,
  },
  agents: {
    company: "Bukowa Projektowanie Produktu",
    records: "klientów, zapytania i projekty",
    mate: "Odpowiada na pytania o mój tydzień, zamienia brief w zapytanie, tworzy zadania z maili i na moją prośbę zapisuje szkice odpowiedzi.",
    claude:
      "Zapisuje podsumowanie rozmowy w notatkach zapytania i szkicuje pierwszą ofertę na podstawie moich stawek i warunków.",
    chatgpt: "Czyta brief klienta i szkicuje zakres z dniami i honorarium, które sprawdzam, zanim cokolwiek wyjdzie.",
    codex:
      "Uruchamia skrypty na moich danych: importuje moją starą tabelę klientów, scala zduplikowane kontakty i eksportuje honoraria projektów do mojej księgowości.",
    followUp:
      "Rutyna „Codzienne szkice do zapytań z terminem na dziś” działa w dni robocze o 8:00. Czyta zapytania, których data następnego kroku to dziś lub wcześniej, i zapisuje krótki szkic wiadomości, jeśli kontakt ma adres e-mail. Szkice czekają w Skrzynce odbiorczej na mój przegląd; rutyna niczego nie wysyła i nie zmienia ani etapu, ani daty.",
  },
  mateRecords: {
    title: "Projekt po zgodzie Ścieżki Nauki",
    question:
      "Joanna potwierdziła proces onboardingu. Przenieś zapytanie na Wygrane i utwórz projekt: 11 dni po 900 zł, start za dwa dni, termin za około siedem tygodni.",
    answer:
      "Gotowe.\n\n- **Zapytanie:** onboarding dla nauczycieli w Ścieżce Nauki przeszedł z etapu Oferta wysłana na **Wygrane**.\n- **Projekt:** utworzono projekt onboardingu dla nauczycieli dla klienta Ścieżka Nauki, powiązany z zapytaniem. 11 dni po 900 zł daje honorarium **9 900 zł**; start za dwa dni, termin za siedem tygodni.\n- **Klient:** Ścieżka Nauki pozostaje *Stała*, a następny krok ustawiono na „Warsztat startowy do onboardingu”.\n\nHonorarium jest wyliczane ze stawki dziennej i liczby dni, więc wpisano tylko te dwie wartości. Nic nie napisano do Joanny; jeśli chcesz wiadomość z podziękowaniem, powiedz, a zapiszę ją jako szkic.",
  },
};
