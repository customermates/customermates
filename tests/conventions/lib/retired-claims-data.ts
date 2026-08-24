// The retired-claim table, extracted so more than one guard can enforce it.
//
// retired-claims.test.ts scans content/**/*.mdx and the locale JSON. Scene copy lives in
// components/marketing/scenes/*.tsx and was invisible to every claim guard until
// scene-claims.test.ts started reading this same table. Keeping one table means a claim
// retired for marketing prose cannot quietly come back as a drawn product window.

export type UnitKind =
  | "frontmatter"
  | "prose"
  | "product-table-cell"
  | "product-source"
  | "json-value";

export type ClaimUnit = {
  file: string;
  locator: string;
  kind: UnitKind;
  text: string;
  productValue?: string;
};

export type RetiredClaim = {
  id: string;
  pattern: RegExp;
  permittedContext: readonly RegExp[];
  why: string;
  authority: string;
  appliesTo?: (unit: ClaimUnit) => boolean;
};

export const DENIED =
  /\b(?:no|not|without|does not|do not|has no|is not|isn['’]t|weder|kein\w*|keine\w*|nicht|ohne|gibt es (?:nicht|keine))\b/iu;
export const EXTERNAL =
  /\b(?:external|separate|customer[- ]run|customer[- ]operated|extern\w*|separat\w*|kundenseitig|selbst betrieben)\b/iu;
export const NO_OR_EXTERNAL = [DENIED, EXTERNAL];

export const RETIRED_CLAIMS: readonly RetiredClaim[] = [
  {
    id: "native-slack-integration",
    pattern:
      /\b(?:native|built[- ]?in|included|nativ\w*|eingebaut\w*|integriert\w*)[^.!?;|]{0,24}\bSlack(?: app| integration)?\b|\bSlack(?: app| integration)[^.!?;|]{0,24}\b(?:included|available|enthalten|verfügbar)\b/iu,
    permittedContext: NO_OR_EXTERNAL,
    why: "Slack is not a native MessagingProvider",
    authority: "prisma/schema.prisma enum MessagingProvider",
  },
  {
    id: "bundled-n8n-runtime",
    pattern:
      /\b(?:built[- ]?in|builtin|embedded|bundled|included|native|eingebaute\w*|integrierte\w*|enthaltene\w*|native\w*)[^.!?;|]{0,24}\bn8n\b|\bn8n[^.!?;|]{0,24}\b(?:included|bundled|embedded|enthalten|integriert)\b|\b(?:integrates?|includes?|ships? with|integriert|enthält|umfasst)\s+(?:(?:the|die)\s+)?n8n(?:[- ](?:platform|runtime|Plattform|Laufzeit))?\b|\bn8n[^.!?;|]{0,36}\b(?:runs? on (?:your|the customer['’]s|its own) infrastructure|läuft auf (?:Ihrer|deiner|der eigenen|kundeneigen\w*) Infrastruktur)\b/iu,
    permittedContext: NO_OR_EXTERNAL,
    why: "Customermates publishes integration surfaces; n8n is operated separately",
    authority: "docker-compose.yml",
  },
  {
    id: "csv-importer",
    pattern:
      /\b(?:CSV|Excel|XLSX)[ -]?(?:import(?:er|s)?|upload|mapping|Import\w*|Upload|Feldzuordnung)\b|\b(?:import|upload|map|importier\w*|hochlad\w*)[^.!?;|]{0,28}\b(?:CSV|Excel|XLSX)\b|\b(?:CSV|Excel|XLSX)[^.!?;|]{0,28}\b(?:import|upload|map|importier\w*|hochlad\w*)/iu,
    permittedContext: [
      ...NO_OR_EXTERNAL,
      /\b(?:prepare|map|clean|prepared|aufbereit\w*|zuord\w*)\b[^.!?;|]{0,80}\b(?:REST|MCP)\b/iu,
    ],
    why: "There is no CSV/Excel importer, uploader, or field-mapping screen",
    authority: "app/[locale]/(protected)/",
  },
  {
    id: "full-data-exporter",
    pattern:
      /\b(?:CSV[ -]?export|one[- ]click export|full data export|complete data export|Vollständexport|CSV[- ]Export)\b|\bexport(?: all| everything| the entire| complete)|\b(?:alle|sämtliche) Daten exportier/iu,
    permittedContext: [
      ...NO_OR_EXTERNAL,
      /\bread supported\b[^.!?;|]{0,50}\bREST\b|\bunterstützte\w* Datensätze\b[^.!?;|]{0,50}\bREST\b/iu,
    ],
    why: "Supported records are readable through APIs, but there is no built-in CSV/full-data exporter",
    authority: "app/[locale]/(protected)/, app/api/v1",
  },
  {
    id: "record-attachments",
    pattern:
      /\b(?:attach|upload|store|save|anhäng\w*|hochlad\w*|speicher\w*)[^.!?;|]{0,28}\b(?:files?|photos?|documents?|certificates?|Dateien?|Fotos?|Dokumente?|Zertifikate?)\b[^.!?;|]{0,28}\b(?:record|contact|deal|customer|Datensatz|Kontakt|Deal|Kunde\w*)\b|\b(?:record|contact|deal|customer|Datensatz|Kontakt|Deal|Kunde\w*)[^.!?;|]{0,28}\b(?:file attachments?|Dateianhänge|Dokumentanhänge)\b/iu,
    permittedContext: [
      ...NO_OR_EXTERNAL,
      /\b(?:message|inbox|thread|Nachricht|Postfach|Thread)\b[^.!?;|]{0,32}\b(?:attachment|Anhang|Anhänge)\b/iu,
      /\bnotes?\b[^.!?;|]{0,32}\b(?:images?|tables?)\b|\bNotizen?\b[^.!?;|]{0,32}\b(?:Bilder?|Tabellen?)\b/iu,
    ],
    why: "Attachments belong to inbox messages; CRM records have no general attachment model",
    authority: "prisma/schema.prisma",
  },
  {
    id: "record-tags",
    pattern:
      /\b(?:tag|label|categorize|verschlagwort\w*|tagg\w*|kategorisier\w*)[^.!?;|]{0,24}\b(?:contacts?|customers?|deals?|records?|Kontakte?|Kunden?|Deals?|Datensätze?)\b|\b(?:contact|record|Kontakt|Datensatz)[ -]?(?:tags?|labels?)\b/iu,
    permittedContext: [
      ...NO_OR_EXTERNAL,
      /\b(?:single[- ]select|custom field|eigene\w* Feld|benutzerdefinierte\w* Feld)\b/iu,
    ],
    why: "Use custom single-select fields; there is no record-tag model",
    authority: "prisma/schema.prisma, features/custom-columns",
  },
  {
    id: "native-task-scheduling",
    pattern:
      /\b(?:tasks?|Aufgaben?)[^.!?;|]{0,42}\b(?:due dates?|deadlines?|statuses?|priorities|overdue|recurr(?:ing|ence)|reminders?|Fälligkeit\w*|Fristen?|Status|Prioritäten?|überfällig\w*|wiederkehr\w*|Erinnerungen?)\b|\b(?:set|assign|filter by|sort by|send|receive|setz\w*|zuweis\w*|filter\w*|sortier\w*|send\w*|erhalt\w*)[^.!?;|]{0,28}\b(?:task )?(?:due date|reminder|Fälligkeit\w*|Erinnerung)\b/iu,
    permittedContext: [
      ...NO_OR_EXTERNAL,
      /\b(?:custom|user[- ]defined|your own|eigene\w*|benutzerdefinierte\w*)[^.!?;|]{0,20}\b(?:date|single[- ]select|status|Datums?|Status)\b/iu,
    ],
    why: "Tasks have relations, assignees, notes, and custom fields, but no native scheduling/status/reminder semantics",
    authority: "prisma/schema.prisma model Task",
  },
  {
    id: "outreach-sequences",
    pattern:
      /\b(?:built[- ]?in|native|included|automated?|run|send|schedule|eingebaut\w*|nativ\w*|enthalten|automatisiert\w*|ausführ\w*|send\w*|plan\w*)[^.!?;|]{0,30}\b(?:email|sales|follow[- ]?up|outreach|nurture|E-Mail|Vertriebs?|Nachfass)[ -]?(?:sequences?|cadences?|drip campaigns?|Sequenzen?|Kampagnen?)\b|\b(?:email|sales|follow[- ]?up|outreach|nurture|E-Mail|Vertriebs?|Nachfass)[ -]?(?:sequences?|cadences?|drip campaigns?|Sequenzen?|Kampagnen?)\b[^.!?;|]{0,20}\b(?:true|yes|included|available|ja|enthalten|verfügbar)\b|\b(?:bulk email|mass outreach|Massen[- ]?E-Mail|Massenansprache)\b[^.!?;|]{0,24}\b(?:included|available|send|enthalten|verfügbar|senden)\b/iu,
    permittedContext: NO_OR_EXTERNAL,
    why: "Messaging is individual and draft-first; campaigns and sequences belong to external providers",
    authority: "features/messaging, prisma/schema.prisma",
  },
  {
    id: "built-in-ai",
    pattern:
      /\b(?:built[- ]?in|builtin|bundled|native|included|eingebaut\w*|integriert\w*|nativ\w*|enthalten)[ -]?(?:AI|KI)(?:[ -](?:assistant|agent|chat|features?|Assistent|Agent))?\b/iu,
    permittedContext: NO_OR_EXTERNAL,
    why: "MCP connects supported external AI clients; Customermates supplies no chat or model",
    authority: "app/api/v1/mcp, package.json",
  },
  {
    id: "lead-scoring-or-enrichment",
    pattern:
      /\b(?:automatically|built[- ]?in|native|included|provides?|offers?|calculates?|scores?|enriches?|automatisch|eingebaut\w*|nativ\w*|enthalten|bietet|berechnet|bewertet|reichert)[^.!?;|]{0,34}\b(?:lead scoring|lead scores?|contact enrichment|company enrichment|data enrichment|Lead[- ]?Scoring|Lead[- ]?Scores?|Kontaktanreicherung|Datenanreicherung)\b|\b(?:lead scoring|contact enrichment|Lead[- ]?Scoring|Kontaktanreicherung)\b[^.!?;|]{0,20}\b(?:yes|true|included|available|ja|enthalten|verfügbar)\b|\b(?:AI|KI)[ -]?(?:agents?|Agent(?:en)?)[^.!?;|]{0,24}\b(?:scor|enrich|qualif|prioriti[sz]|bewert|anreicher|qualifizier|priorisier)\w*[^.!?;|]{0,20}\b(?:leads?|contacts?|companies?|Kontakte?|Unternehmen)\b/iu,
    permittedContext: [
      ...NO_OR_EXTERNAL,
      /\b(?:external (?:integration|provider|workflow)|separate (?:integration|provider|workflow)|externe\w* (?:Integration|Anbieter|Workflow)|separate\w* (?:Integration|Anbieter|Workflow))\b/iu,
    ],
    why: "Scoring and enrichment must be calculated by an external provider or workflow",
    authority: "prisma/schema.prisma, app/[locale]/(protected)/",
  },
  {
    id: "sales-forecasting",
    pattern:
      /\b(?:built[- ]?in|native|included|provides?|offers?|calculates?|predicts?|eingebaut\w*|nativ\w*|enthalten|bietet|berechnet|prognostiziert)[^.!?;|]{0,34}\b(?:sales|revenue|pipeline|deal|Umsatz|Vertrieb\w*|Pipeline)[ -]?(?:forecast(?:ing)?|projection|Prognose\w*)\b|\b(?:revenue forecasting|sales forecasting|Umsatzprognose\w*)\b[^.!?;|]{0,20}\b(?:yes|true|included|available|ja|enthalten|verfügbar)\b/iu,
    permittedContext: NO_OR_EXTERNAL,
    why: "Dashboards show stored values; Customermates does not calculate weighted or predictive forecasts",
    authority: "features/reporting",
  },
  {
    id: "calendar-write-or-booking",
    pattern:
      /\b(?:two[- ]way|bidirectional|write[- ]enabled|automatic|Zwei[- ]Wege|bidirektional|automatisch)[ -]?(?:calendar|Kalender)[ -]?(?:sync|integration|Synchronisierung|Integration)?\b|\b(?:creat|edit|updat|delet|writ|book|schedul|sync|erstell|änder|aktualisier|lösch|schreib|buch|plan|synchronisier)\w*[^.!?;,|]{0,24}\b(?:calendar events?|appointments?|Kalendertermine?|Termine?)\b|\b(?:calendar events?|appointments?|Kalendertermine?|Termine?)[^.!?;,|]{0,24}\b(?:are\s+|werden\s+)?(?:creat|edit|updat|delet|writ|book|schedul|erstell|änder|aktualisier|lösch|schreib|buch|plan)\w*\b/iu,
    permittedContext: [
      ...NO_OR_EXTERNAL,
      /\b(?:read[- ]only|nur lesend|schreibgeschützt\w*)\b/iu,
    ],
    why: "Connected calendar and event access is read-only",
    authority: "features/mcp-tools/tool-registry.ts",
    appliesTo: (unit) =>
      !(
        unit.kind === "json-value" &&
        /#\/Common\/events\/messaging\/calendar_event\//u.test(unit.locator)
      ),
  },
  {
    id: "native-mobile-or-offline",
    pattern:
      /\b(?:native mobile app|native iOS app|native Android app|iOS app|Android app|native Mobile[- ]App|native iOS[- ]App|native Android[- ]App|offline mode|offline access|works offline|Offline[- ]Modus|Offline[- ]Zugriff|funktioniert offline)\b/iu,
    permittedContext: [
      ...NO_OR_EXTERNAL,
      /\b(?:responsive|mobile[- ]optimized|mobile browser|responsiv|mobiloptimiert|Browser)\b/iu,
    ],
    why: "Customermates is responsive web software with no native app or offline record mode",
    authority: "package.json, app/",
  },
  {
    id: "mobile-push-notifications",
    pattern:
      /\b(?:mobile|native|iOS|Android|phone|handy)[^.!?;|]{0,32}\bpush[ -]?(?:notifications?|benachrichtigungen)\b|\bpush[ -]?(?:notifications?|benachrichtigungen)[^.!?;|]{0,32}\b(?:mobile|phone|iOS|Android|handy)\b/iu,
    permittedContext: [
      ...NO_OR_EXTERNAL,
      /\b(?:does not ship|does not provide|has no|bietet keine|liefert keine|hat keine)\b[^.!?;|]{0,50}\bpush/iu,
    ],
    why: "There is no native mobile push transport",
    authority: "package.json, app/",
  },
  {
    id: "shared-team-views",
    pattern:
      /\b(?:shared|team[- ]wide|workspace[- ]wide|collaborative|gemeinsame\w*|geteilte\w*|teamweite\w*)[^.!?;|]{0,20}\b(?:saved )?(?:views?|filters?|Ansichten?|Filter)\b/iu,
    permittedContext: [
      ...NO_OR_EXTERNAL,
      /\b(?:personal|private|per[- ]user|persönlich\w*|privat\w*|je Nutzer)\b/iu,
    ],
    why: "Saved view configurations are personal, not shared team objects",
    authority: "features/views",
  },
  {
    id: "field-level-permissions",
    pattern:
      /\b(?:field[- ]level|per[- ]field|column[- ]level|feldebene|feldbasiert\w*|spaltenbasiert\w*)[^.!?;|]{0,20}\b(?:permissions?|access|security|Berechtigungen?|Zugriff)\b/iu,
    permittedContext: NO_OR_EXTERNAL,
    why: "Permissions are resource/action based with own/all scope, not field-level",
    authority: "features/roles, prisma/schema.prisma",
  },
  {
    id: "or-filtering",
    pattern:
      /(?:\bOR\b|\bODER\b)[ -]?(?:filters?|operators?|logic|conditions?|Filter|Operator|Logik|Bedingungen?)/u,
    permittedContext: [...NO_OR_EXTERNAL, /\bAND[- ]only\b|\bnur UND\b/iu],
    why: "The user-facing filter builder combines conditions with AND",
    authority: "features/views",
  },
  {
    id: "shipped-white-label-or-sso",
    pattern:
      /\b(?:white[ -]?label|single sign[ -]on|SSO|SAML)[^.!?;|]{0,36}\b(?:available|included|supported|shipped|implemented|verfügbar|enthalten|unterstützt|implementiert)\b/iu,
    permittedContext: [
      ...NO_OR_EXTERNAL,
      /\b(?:contract|contracted|on request|Vertrag|vertraglich|auf Anfrage)\b/iu,
    ],
    why: "SSO and managed white-label are contract concepts, not implemented product features",
    authority: "ee/, features/",
  },
  {
    id: "unsupported-compliance-claim",
    pattern:
      /\b(?:GDPR[- ](?:compliant|certified|native)|DSGVO[- ](?:konform|zertifiziert|nativ)|fully GDPR compliant|vollständig DSGVO[- ]konform|full GDPR compliance|DSGVO[- ]Konformität|EU\s*\/\s*GDPR[- ]Hosting|DSGVO\s*\/\s*EU[- ]Hosting)\b/iu,
    permittedContext: [DENIED],
    why: "Deployment facts and controls are not a compliance certification",
    authority: "content/legal/en/subprocessors.mdx",
  },
  {
    id: "german-hosting-location",
    pattern:
      /\b(?:hosted|hosting|stored|gehostet|gespeichert)[^.!?;|]{0,30}\b(?:in Germany|in Deutschland|Frankfurt)\b|\b(?:German|deutsche\w*)[ -](?:data cent(?:er|re)|Rechenzentrum)\b/iu,
    permittedContext: NO_OR_EXTERNAL,
    why: "Only the managed database is stated to run in an EU region",
    authority: "content/legal/en/subprocessors.mdx",
  },
  {
    id: "no-us-subprocessors",
    pattern:
      /\b(?:no|zero|without any)[ -]?(?:US|U\.S\.)[ -]?(?:subprocessors?|vendors?|providers?)\b|\bkeine[ -]?US[- ]?(?:Subdienstleister|Anbieter)\b/iu,
    permittedContext: [],
    why: "The subprocessor list includes US providers",
    authority: "content/legal/en/subprocessors.mdx",
  },
  {
    id: "absolute-eu-data-residency",
    pattern:
      /\b(?:data|Daten)[^.!?;|]{0,28}\b(?:never leaves?|verlassen (?:nie|niemals))[^.!?;|]{0,24}\b(?:the EU|Europe|die EU|Europa)\b/iu,
    permittedContext: NO_OR_EXTERNAL,
    why: "Connected and application providers can process data outside the EU",
    authority: "content/legal/en/subprocessors.mdx",
  },
];
