import { readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT, walkFiles } from "./walk";

type UnitKind =
  | "frontmatter"
  | "prose"
  | "product-table-cell"
  | "product-source"
  | "json-value";

type ClaimUnit = {
  file: string;
  locator: string;
  kind: UnitKind;
  text: string;
  productValue?: string;
};

type RetiredClaim = {
  id: string;
  pattern: RegExp;
  permittedContext: readonly RegExp[];
  why: string;
  authority: string;
  appliesTo?: (unit: ClaimUnit) => boolean;
};

const DENIED =
  /\b(?:no|not|without|does not|do not|has no|is not|isn['’]t|weder|kein\w*|keine\w*|nicht|ohne|gibt es (?:nicht|keine))\b/iu;
const EXTERNAL =
  /\b(?:external|separate|customer[- ]run|customer[- ]operated|extern\w*|separat\w*|kundenseitig|selbst betrieben)\b/iu;
const CONTRASTED =
  /\b(?:rather than|instead of|as opposed to|not just|statt|anstelle|anstatt|sondern)\b/iu;
const NO_OR_EXTERNAL = [DENIED, EXTERNAL];

const ESM_STATEMENT =
  /^\s*(?:import\s+(?:[\w*{]|["'])|export\s+(?:const|default|function|class|let|var|type|interface|async|\{|\*))/u;

const RETIRED_CLAIMS: readonly RetiredClaim[] = [
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
    id: "non-xlsx-data-transfer",
    pattern:
      /\b(?:CSV|TSV|ODS|JSON|XML|Google[ -]?(?:Sheets?|Tabellen))[ -]?(?:import(?:er|s)?|export(?:er|s)?|upload|download|Import\w*|Export\w*|Upload|Download|Feldzuordnung)\b|\b(?:import|export|upload|download|importier\w*|exportier\w*|hochlad\w*|herunterlad\w*)[^.!?;|]{0,28}\b(?:CSV|TSV|ODS|Google[ -]?(?:Sheets?|Tabellen))\b|\b(?:CSV|TSV|ODS|Google[ -]?(?:Sheets?|Tabellen))[^.!?;|]{0,28}\b(?:import|export|upload|download|importier\w*|exportier\w*|hochlad\w*|herunterlad\w*)/iu,
    permittedContext: [...NO_OR_EXTERNAL, CONTRASTED],
    why: "Records transfer as XLSX workbooks only; no other spreadsheet or data format is read or written",
    authority: "features/data-transfer/import/read-workbook-file.ts, app/api/export/[entityType]/route.ts",
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
    id: "unqualified-built-in-ai-availability",
    pattern:
      /\b(?:built[- ]?in|builtin|bundled|native|included|eingebaut\w*|integriert\w*|nativ\w*|enthalten)[ -]?(?:AI|KI)(?:[ -](?:assistant|agent|chat|features?|Assistent|Agent))?\b/iu,
    permittedContext: NO_OR_EXTERNAL,
    why: "Mate exists as a cloud-only capability, but public availability remains production-configuration and legal-release gated; MCP remains the separate surface for external AI clients",
    authority: "app/api/agent, app/components/agent-chat, core/commercial/plan-catalog.ts",
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
    id: "predictive-sales-forecasting",
    pattern:
      /\bCustomermates\b[^.!?;|]{0,48}\b(?:predicts?|forecasts?|prognostiziert|prognostizieren)\b[^.!?;|]{0,48}\b(?:future[ -]?revenue|revenue|sales|pipeline|deal outcomes?|close (?:likelihood|probability|timing|date)|when (?:a )?(?:deal|opportunity)s? (?:will )?close|künftige\w* Umsätze?|Umsätze?|Vertrieb|Pipeline|Deal[- ]?Ergebnisse?|Abschluss(?:wahrscheinlichkeit|zeitpunkt))\b|\bCustomermates\b[^.!?;|]{0,48}\b(?:revenue|sales|pipeline|deal outcomes?|close (?:likelihood|probability|timing|date)|Umsätze?|Vertrieb|Pipeline|Deal[- ]?Ergebnisse?|Abschluss(?:wahrscheinlichkeit|zeitpunkt))\b[^.!?;|]{0,30}\b(?:predict(?:s|ed)?|forecast(?:s|ed)?|prognostiziert)\b|\bnative\b[^.!?;|]{0,24}\b(?:sales|revenue|pipeline|deal)[ -]?(?:forecast(?:ing)?|projection)\b[^.!?;|]{0,24}\b(?:predicts?|forecasts?)\b|\b(?:AI|KI)(?:[- ]+(?:sales|revenue|pipeline|Umsatz|Vertrieb\w*|Pipeline))?[- ]*(?:forecast(?:s|ing)?|Prognose\w*)\b|\b(?:built[- ]?in|native|included|provides?|offers?|calculates?|predicts?|eingebaut\w*|nativ\w*|enthalten|bietet|berechnet|prognostiziert)[^.!?;|]{0,34}\b(?:predictive|AI[- ]?(?:powered|driven)|prädiktiv\w*|KI[- ]?(?:gestützt|basiert)\w*)[^.!?;|]{0,24}\b(?:(?:sales|revenue|pipeline|deal|Umsatz|Vertrieb\w*|Pipeline)[ -]?)?(?:forecast(?:ing)?|projection|Prognose\w*)\b|\b(?:predictive|AI[- ]?(?:powered|driven)|prädiktiv\w*|KI[- ]?(?:gestützt|basiert)\w*)[^.!?;|]{0,24}\b(?:(?:sales|revenue|pipeline|deal|Umsatz|Vertrieb\w*|Pipeline)[ -]?)?(?:forecast(?:ing)?|projection|Prognose\w*)\b[^.!?;|]{0,24}\b(?:included|available|native|provided|offered|enthalten|verfügbar|nativ|angeboten)\b/iu,
    permittedContext: NO_OR_EXTERNAL,
    why: "Customermates calculates deterministic stage-weighted deal and pipeline values but does not predict close likelihood, timing, or revenue",
    authority: "features/deals/deal-weighting.ts, app/[locale]/(protected)/company/components/company-settings/company-forecasting-section.tsx",
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

const MIXED_SECTIONS = new Set(["blog-posts", "compare-pages", "for-pages"]);
// These are the canonical first-party surfaces owned by this recurrence guard.
// Long-form blog, comparison, and vertical landing pages are handled by their
// dedicated SEO review; this guard avoids reinterpreting competitor/editorial copy.
const CANONICAL_SECTIONS = new Set([
  "affiliate",
  "api-overview",
  "auth",
  "automation",
  "blog",
  "compare",
  "feature-pages",
  "features",
  "features-all",
  "for",
  "help-and-feedback",
  "homepage",
  "pricing",
]);
const PRODUCT = /\bCustomermates\b/iu;
const COMPETITOR =
  /^\s*(?:HubSpot|Salesforce|Pipedrive|Zoho|Folk|Freshsales|Salesflare|monday|Cobra|GoHighLevel|Close|Attio|Twenty|Odoo)\b/iu;
const UNAVAILABLE_VALUE =
  /^(?:false|none|no|not available|not included|unavailable|nein|nicht verfügbar|nicht enthalten)(?:\b|\s*[-—:])/iu;

function normalized(file: string): string {
  return file.split(sep).join("/");
}

function mixedSurface(file: string): boolean {
  const [, section] = normalized(file).split("/");
  return MIXED_SECTIONS.has(section);
}

function stripMarkup(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/gu, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/gu, "$1")
    .replace(
      /<Status(Available|Partial|Unavailable)\b[^>]*\/>/gu,
      (_match, status: string) => status.toLowerCase(),
    )
    .replace(/<[^>]+>/gu, " ")
    .replace(/[`*_~]/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

function tableCells(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let escaped = false;
  for (const char of line.replace(/^\s*\|/u, "").replace(/\|\s*$/u, "")) {
    if (escaped) {
      cell += char;
      escaped = false;
    } else if (char === "\\") {
      escaped = true;
      cell += char;
    } else if (char === "|") {
      cells.push(stripMarkup(cell));
      cell = "";
    } else {
      cell += char;
    }
  }
  cells.push(stripMarkup(cell));
  return cells;
}

function scalarValue(line: string): string | undefined {
  const match = line.match(/^\s*(?:-\s*)?[A-Za-z][\w-]*:\s*(.+?)\s*$/u);
  if (!match) return undefined;
  return stripMarkup(match[1].replace(/^(["'])(.*)\1$/u, "$2"));
}

function splitAssertions(line: string): string[] {
  return stripMarkup(line)
    .split(
      /(?<=[.!?;])\s+|\s+(?:but|however|whereas|aber|allerdings|hingegen)\s+/iu,
    )
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && !part.endsWith("?"));
}

function extractMdxUnits(file: string, source: string): ClaimUnit[] {
  const units: ClaimUnit[] = [];
  const lines = source.split("\n");
  const isMixed = mixedSurface(file);
  let inFence = false;
  let inFrontmatter = lines[0]?.trim() === "---";
  let pendingName: { text: string; line: number } | undefined;
  let productHeadingDepth: number | undefined;

  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index];
    const trimmed = raw.trim();
    const line = index + 1;

    if (/^```|^~~~/u.test(trimmed)) {
      inFence = !inFence;
      continue;
    }
    if (inFence || ESM_STATEMENT.test(raw)) continue;

    if (index === 0 && inFrontmatter) continue;
    if (inFrontmatter && trimmed === "---") {
      inFrontmatter = false;
      continue;
    }

    if (inFrontmatter) {
      const name = raw.match(/^\s*-?\s*name:\s*(.+?)\s*$/u);
      if (name) pendingName = { text: stripMarkup(name[1]), line };
      const sourceValue = raw.match(/^\s*source:\s*(.+?)\s*$/u);
      if (isMixed && sourceValue && pendingName) {
        const value = stripMarkup(sourceValue[1]);
        units.push({
          file,
          locator: String(pendingName.line),
          kind: "product-source",
          text: `${pendingName.text} — Customermates: ${value}`,
          productValue: value,
        });
        pendingName = undefined;
        continue;
      }
      if (!isMixed) {
        const value = scalarValue(raw);
        if (value)
          units.push({
            file,
            locator: String(line),
            kind: "frontmatter",
            text: value,
          });
      }
      continue;
    }

    if (
      /^\s*\|/u.test(raw) &&
      /^\s*\|?\s*:?-{3,}/u.test(lines[index + 1] ?? "")
    ) {
      const headers = tableCells(raw);
      const productIndex = headers.findIndex((header) => PRODUCT.test(header));
      index += 1;
      while (index + 1 < lines.length && /^\s*\|/u.test(lines[index + 1])) {
        index += 1;
        const cells = tableCells(lines[index]);
        if (productIndex >= 0 && cells[productIndex] !== undefined) {
          const value = cells[productIndex];
          units.push({
            file,
            locator: String(index + 1),
            kind: "product-table-cell",
            text: `${cells[0] ?? "Feature"} — Customermates: ${value}`,
            productValue: value,
          });
        } else if (!isMixed) {
          units.push({
            file,
            locator: String(index + 1),
            kind: "prose",
            text: stripMarkup(lines[index]),
          });
        }
      }
      continue;
    }

    const heading = raw.match(/^(#{1,6})\s+(.+)$/u);
    if (heading) {
      const depth = heading[1].length;
      if (productHeadingDepth !== undefined && depth <= productHeadingDepth)
        productHeadingDepth = undefined;
      if (
        /^(?:Customermates\b|What is Customermates\b|Was ist Customermates\b)/iu.test(
          stripMarkup(heading[2]),
        )
      ) {
        productHeadingDepth = depth;
      }
    }

    if (!trimmed || /^\s*\|/u.test(raw)) continue;
    const assertions = splitAssertions(
      raw.replace(/^\s*(?:[-*+] |\d+\. )/u, ""),
    );
    const lineMentionsProduct = assertions.some((assertion) =>
      PRODUCT.test(assertion),
    );
    for (const assertion of assertions) {
      if (
        !assertion ||
        (COMPETITOR.test(assertion) && !PRODUCT.test(assertion))
      )
        continue;
      if (
        !isMixed ||
        lineMentionsProduct ||
        productHeadingDepth !== undefined
      ) {
        units.push({
          file,
          locator: String(line),
          kind: "prose",
          text: assertion,
        });
      }
    }
  }
  return units;
}

function extractJsonValueUnits(file: string, source: string): ClaimUnit[] {
  const units: ClaimUnit[] = [];
  const visit = (value: unknown, pointer: string): void => {
    if (typeof value === "string") {
      units.push({
        file,
        locator: pointer || "#",
        kind: "json-value",
        text: value,
      });
    } else if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${pointer}/${index}`));
    } else if (value && typeof value === "object") {
      Object.entries(value).forEach(([key, item]) =>
        visit(
          item,
          `${pointer}/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`,
        ),
      );
    }
  };
  visit(JSON.parse(source), "#");
  return units;
}

function extractClaimUnits(file: string, source: string): ClaimUnit[] {
  return file.endsWith(".json")
    ? extractJsonValueUnits(file, source)
    : extractMdxUnits(file, source);
}

function isPermitted(claim: RetiredClaim, unit: ClaimUnit): boolean {
  if (unit.productValue && UNAVAILABLE_VALUE.test(unit.productValue))
    return true;
  const match = unit.text.match(claim.pattern);
  const matchIndex = match?.index ?? 0;
  const matchedText = match?.[0] ?? "";
  const localContext = unit.text.slice(
    Math.max(0, matchIndex - 72),
    matchIndex + matchedText.length + 32,
  );
  return claim.permittedContext.some((pattern) => {
    if (pattern === DENIED || pattern === EXTERNAL)
      return pattern.test(localContext);
    return pattern.test(unit.text);
  });
}

function findViolationsInSource(file: string, source: string): string[] {
  const violations: string[] = [];
  for (const unit of extractClaimUnits(file, source)) {
    for (const claim of RETIRED_CLAIMS) {
      if (claim.appliesTo && !claim.appliesTo(unit)) continue;
      const match = unit.text.match(claim.pattern);
      if (!match || isPermitted(claim, unit)) continue;
      violations.push(
        `${unit.file}:${unit.locator} [${claim.id}] "${match[0].trim()}" — ${claim.why} (${claim.authority})`,
      );
    }
  }
  return violations;
}

function scannedFiles(): string[] {
  const legalRoot = normalized(join(REPO_ROOT, "content", "legal"));
  return [
    ...walkFiles(join(REPO_ROOT, "content"), (path) => {
      if (!path.endsWith(".mdx") || normalized(path).startsWith(legalRoot))
        return false;
      const [, section] = normalized(relative(REPO_ROOT, path)).split("/");
      return CANONICAL_SECTIONS.has(section);
    }),
    ...walkFiles(join(REPO_ROOT, "i18n", "locales"), (path) =>
      path.endsWith(".json"),
    ),
  ].sort();
}

describe("retired claims stay retired", () => {
  it("keeps auditable, non-stateful rules", () => {
    expect(new Set(RETIRED_CLAIMS.map((claim) => claim.id)).size).toBe(
      RETIRED_CLAIMS.length,
    );
    expect(RETIRED_CLAIMS.every((claim) => claim.why && claim.authority)).toBe(
      true,
    );
    expect(
      RETIRED_CLAIMS.every(
        (claim) => !claim.pattern.global && !claim.pattern.sticky,
      ),
    ).toBe(true);
  });

  it("scans first-party content units independent of their collection", () => {
    expect(
      findViolationsInSource(
        "content/features/en/example.mdx",
        "A record with file attachments is included.",
      ),
    ).toHaveLength(1);
    expect(
      findViolationsInSource(
        "content/feature-pages/en/example.mdx",
        "Built-in AI assistant for every user.",
      ),
    ).toHaveLength(1);
  });

  it("catches a data transfer claim for a format other than xlsx", () => {
    for (const claim of [
      "Import your contacts from a CSV file.",
      "One click CSV export for every list.",
      "Export to Google Sheets whenever you like.",
      "Kontakte per CSV-Import anlegen.",
      "Laden Sie eine CSV hoch, um Datensätze zu importieren.",
    ]) {
      expect(findViolationsInSource("content/features/en/example.mdx", claim), claim).toHaveLength(1);
    }
  });

  it("scans prose that opens with import or export, while still ignoring module statements", () => {
    expect(
      findViolationsInSource("content/features/en/example.mdx", "Import your contacts from a CSV file."),
    ).toHaveLength(1);
    expect(
      findViolationsInSource("content/features/en/example.mdx", "Export every list to CSV in one click."),
    ).toHaveLength(1);
    expect(
      findViolationsInSource(
        "content/features/en/example.mdx",
        'import Chart from "@/components/chart";\nexport const meta = { csvImport: true };',
      ),
    ).toHaveLength(0);
  });

  it("leaves the xlsx transfer that actually ships alone", () => {
    for (const claim of [
      "Import your contacts from an Excel workbook.",
      "Export every list as an XLSX file.",
      "Records export to XLSX rather than CSV.",
      "There is no CSV import; use an Excel workbook.",
      "Datensätze werden als XLSX-Datei exportiert.",
    ]) {
      expect(findViolationsInSource("content/features/en/example.mdx", claim), claim).toHaveLength(0);
    }
  });

  it("binds a denial to the capability instead of a nearby unrelated sentence", () => {
    expect(
      findViolationsInSource(
        "content/features/en/example.mdx",
        "No Slack app. Every record keeps file attachments.",
      ),
    ).toHaveLength(1);
    expect(
      findViolationsInSource(
        "content/features/en/example.mdx",
        "Customermates has no record file attachments; link them from storage.",
      ),
    ).toEqual([]);
  });

  it("attributes mixed prose and tables only to Customermates", () => {
    const prose =
      "HubSpot includes native AI. Customermates has no built-in AI and connects external clients through MCP.";
    expect(
      findViolationsInSource("content/blog-posts/en/example.mdx", prose),
    ).toEqual([]);

    const table = [
      "| Feature | Customermates | Rival |",
      "| --- | --- | --- |",
      "| Mobile app | Responsive web only | Native iOS app |",
      "| Record file attachments | Included | Included |",
    ].join("\n");
    const violations = findViolationsInSource(
      "content/compare-pages/en/example.mdx",
      table,
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("record-attachments");
  });

  it("carries same-line Customermates attribution across split assertions", () => {
    const firstParty = "Customermates stores contacts; a record with file attachments is included.";
    const violations = findViolationsInSource(
      "content/blog-posts/en/example.mdx",
      firstParty,
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("record-attachments");

    const competitor =
      "Customermates has no built-in AI; HubSpot includes native AI.";
    expect(
      findViolationsInSource("content/blog-posts/en/example.mdx", competitor),
    ).toEqual([]);
  });

  it("preserves status components when evaluating product tables", () => {
    const available = [
      "| Feature | Customermates |",
      "| --- | --- |",
      "| Built-in AI | <StatusAvailable /> |",
    ].join("\n");
    expect(
      findViolationsInSource("content/features/en/example.mdx", available),
    ).toHaveLength(1);

    const unavailable = [
      "| Feature | Customermates |",
      "| --- | --- |",
      "| Built-in AI | <StatusUnavailable /> |",
    ].join("\n");
    expect(
      findViolationsInSource("content/features/en/example.mdx", unavailable),
    ).toEqual([]);
  });

  it("recognizes active bundled-runtime, scoring, calendar-write, and compliance grammar", () => {
    expect(
      findViolationsInSource(
        "content/features/en/example.mdx",
        "Customermates integrates n8n directly.",
      )[0],
    ).toContain("bundled-n8n-runtime");
    expect(
      findViolationsInSource(
        "content/features/en/example.mdx",
        "n8n runs on your infrastructure.",
      )[0],
    ).toContain("bundled-n8n-runtime");
    expect(
      findViolationsInSource(
        "content/features/en/example.mdx",
        "AI agents score leads.",
      )[0],
    ).toContain("lead-scoring-or-enrichment");
    expect(
      findViolationsInSource(
        "content/features/en/example.mdx",
        "Calendar events are created from contact records.",
      )[0],
    ).toContain("calendar-write-or-booking");
    expect(
      findViolationsInSource(
        "content/features/de/example.mdx",
        "Kalendertermine erscheinen in einer schreibgeschützten CRM-Ansicht.",
      ),
    ).toEqual([]);
    expect(
      findViolationsInSource(
        "content/features/en/example.mdx",
        "Full GDPR compliance.",
      )[0],
    ).toContain("unsupported-compliance-claim");
    expect(
      findViolationsInSource(
        "content/features/de/example.mdx",
        "DSGVO-Konformität.",
      )[0],
    ).toContain("unsupported-compliance-claim");
    expect(
      findViolationsInSource(
        "content/features/en/example.mdx",
        "EU/GDPR hosting.",
      )[0],
    ).toContain("unsupported-compliance-claim");
  });

  it("separates deterministic pipeline weighting from predictive forecasting", () => {
    const unsupported = [
      "Customermates predicts revenue.",
      "Customermates forecasts future revenue with AI.",
      "Native sales forecasting predicts when deals close.",
      "AI sales forecasts are included.",
      "Customermates prognostiziert Umsätze.",
      "Eine KI-Umsatzprognose ist enthalten.",
    ];

    for (const source of unsupported) {
      expect(
        findViolationsInSource("content/features/en/example.mdx", source)[0],
      ).toContain("predictive-sales-forecasting");
    }

    expect(
      findViolationsInSource(
        "content/features/en/example.mdx",
        "Customermates calculates deterministic stage-weighted deal values and weighted pipeline totals from configured probabilities.",
      ),
    ).toEqual([]);
    expect(
      findViolationsInSource(
        "content/features/de/example.mdx",
        "Customermates berechnet deterministische phasengewichtete Deal-Werte und Pipeline-Summen aus konfigurierten Wahrscheinlichkeiten.",
      ),
    ).toEqual([]);
  });

  it("combines compare frontmatter names with source values", () => {
    const source = [
      "---",
      "features:",
      "  - name: Email sequences",
      "    source: true",
      "    competitor: false",
      "---",
    ].join("\n");
    expect(
      findViolationsInSource("content/compare-pages/en/example.mdx", source),
    ).toHaveLength(1);
  });

  it("scans JSON values rather than key names", () => {
    const source = JSON.stringify({
      offlineAccess: "Use it from a browser",
      banner: "Native iOS app included",
    });
    const violations = findViolationsInSource("i18n/locales/en.json", source);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("#/banner");
  });

  it("finds no retired claim in public marketing copy", () => {
    const violations = scannedFiles().flatMap((path) => {
      const file = normalized(relative(REPO_ROOT, path));
      return findViolationsInSource(file, readFileSync(path, "utf8"));
    });
    expect(violations, violations.join("\n")).toEqual([]);
  });
});
