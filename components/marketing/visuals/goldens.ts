import {
  type BrandIllustrationBrief,
  type VisualLocale,
  type VisualPathway,
  VISUAL_LOCALES,
  VISUAL_REFERENCE_SYSTEM_VERSION,
  validateVisualBrief,
  visualSourceChecksum,
} from "./visual-contract";
import { assetLocaleFor, contentLocaleOrDefault } from "@/i18n/locale-registry";

export type GoldenVisualBrief = BrandIllustrationBrief & {
  id: `golden.${VisualPathway}`;
  pathway: VisualPathway;
};

type GoldenCopy = {
  body: string;
  focalLabel: string;
  headline: string;
  semanticLabels: string[];
  takeaway: string;
};

type GoldenDefinition = {
  accentTarget: string;
  copy: Record<VisualLocale, GoldenCopy>;
  depictionKind: "relationship" | "change" | "result";
  factReference:
    | "product:conversation-record-association"
    | "product:deal-status-field"
    | "product:human-send-boundary"
    | "product:record-activity-context";
  focalSubject: BrandIllustrationBrief["focalSubject"];
  id: `golden.${VisualPathway}`;
  pathway: VisualPathway;
  supportingSubjects: BrandIllustrationBrief["supportingSubjects"];
};

const GOLDEN_DEFINITIONS: Record<VisualPathway, GoldenDefinition> = {
  converge: {
    accentTarget: "customer-record",
    copy: {
      de: {
        body: "Eine Gmail-Unterhaltung von Nina Castillo wird mit ihrem Kundendatensatz verknüpft; LinkedIn und WhatsApp bleiben als weitere unterstützte Quellen ruhig.",
        focalLabel: "Datensatz",
        headline: "Unterhaltungen gehören zu Kundendatensätzen",
        semanticLabels: [],
        takeaway: "Jede Unterhaltung landet bei dem Datensatz, zu dem sie gehört.",
      },
      en: {
        body: "A Gmail conversation from Nina Castillo is associated with her customer record while LinkedIn and WhatsApp remain quiet supported sources.",
        focalLabel: "Record",
        headline: "Conversations belong to customer records",
        semanticLabels: [],
        takeaway: "Every conversation lands on the record it belongs to.",
      },
      es: {
        body: "Una conversación de Gmail de Nina Castillo se asocia a su registro de cliente, mientras LinkedIn y WhatsApp quedan como fuentes compatibles discretas.",
        focalLabel: "Registro",
        headline: "Las conversaciones pertenecen a los registros de cliente",
        semanticLabels: [],
        takeaway: "Cada conversación llega al registro al que pertenece.",
      },
      pt: {
        body: "Uma conversa do Gmail de Nina Castillo é associada ao registro de cliente dela, enquanto LinkedIn e WhatsApp permanecem como fontes compatíveis discretas.",
        focalLabel: "Registro",
        headline: "As conversas pertencem aos registros de clientes",
        semanticLabels: [],
        takeaway: "Cada conversa chega ao registro a que pertence.",
      },
      pl: {
        body: "Rozmowa z Gmaila z Niną Castillo zostaje powiązana z jej rekordem klienta, a LinkedIn i WhatsApp pozostają spokojnymi, obsługiwanymi źródłami.",
        focalLabel: "Rekord",
        headline: "Rozmowy należą do rekordów klientów",
        semanticLabels: [],
        takeaway: "Każda rozmowa trafia do rekordu, do którego należy.",
      },
      nl: {
        body: "Een Gmail-gesprek van Nina Castillo wordt gekoppeld aan haar klantrecord, terwijl LinkedIn en WhatsApp rustige ondersteunde bronnen blijven.",
        focalLabel: "Record",
        headline: "Gesprekken horen bij klantrecords",
        semanticLabels: [],
        takeaway: "Elk gesprek komt terecht bij het record waar het bij hoort.",
      },
    },
    depictionKind: "relationship",
    factReference: "product:conversation-record-association",
    focalSubject: {
      fixtures: { person: "nina-castillo" },
      form: "record",
      id: "customer-record",
    },
    id: "golden.converge",
    pathway: "converge",
    supportingSubjects: [
      {
        fixtures: { person: "nina-castillo", provider: "gmail" },
        form: "channel-mark",
        id: "mail-source",
      },
      {
        fixtures: { provider: "linkedin" },
        form: "channel-mark",
        id: "network-source",
      },
      {
        fixtures: { provider: "whatsapp" },
        form: "channel-mark",
        id: "chat-source",
      },
    ],
  },
  focus: {
    accentTarget: "quiet-signal",
    copy: {
      de: {
        body: "Max Bergmann prüft Moorfield Property Management - Jahresprüfungen, das auf Won steht; Oakridge Climate Systems - Wartungsplan Wärmepumpe bleibt auf Open und Riverton HVAC Service - Jahreswartung auf Lost im ruhigen Kontext.",
        focalLabel: "Signal",
        headline: "Ein relevantes Signal tritt hervor",
        semanticLabels: ["Prüfer"],
        takeaway: "Ein leises Signal wird klar genug, um zu handeln.",
      },
      en: {
        body: "Max Bergmann inspects Moorfield Property Management - yearly inspections, which is Won, while Oakridge Climate Systems - heat pump service plan stays Open and Riverton HVAC Service - yearly maintenance stays Lost in the quiet context.",
        focalLabel: "Signal",
        headline: "A relevant signal comes into focus",
        semanticLabels: ["Inspector"],
        takeaway: "One quiet signal becomes clear enough to act on.",
      },
      es: {
        body: "Max Bergmann revisa Moorfield Property Management - revisiones anuales, con estado Ganada, mientras Oakridge Climate Systems - plan de mantenimiento de bomba de calor sigue Abierta y Riverton HVAC Service - mantenimiento anual sigue Perdida en el contexto discreto.",
        focalLabel: "Señal",
        headline: "Una señal relevante cobra nitidez",
        semanticLabels: ["Revisor"],
        takeaway: "Una señal discreta se vuelve lo bastante clara para actuar.",
      },
      pt: {
        body: "Max Bergmann analisa Moorfield Property Management - revisões anuais, com status Ganho, enquanto Oakridge Climate Systems - plano de manutenção de bomba de calor continua Aberto e Riverton HVAC Service - manutenção anual continua Perdido no contexto discreto.",
        focalLabel: "Sinal",
        headline: "Um sinal relevante ganha foco",
        semanticLabels: ["Revisor"],
        takeaway: "Um sinal discreto fica claro o bastante para agir.",
      },
      pl: {
        body: "Max Bergmann sprawdza Moorfield Property Management - roczne przeglądy ze statusem Wygrana, podczas gdy Oakridge Climate Systems - plan serwisowy pompy ciepła pozostaje Otwarta, a Riverton HVAC Service - roczny serwis pozostaje Przegrana, w spokojnym kontekście.",
        focalLabel: "Sygnał",
        headline: "Istotny sygnał wychodzi na pierwszy plan",
        semanticLabels: ["Inspektor"],
        takeaway: "Jeden cichy sygnał staje się na tyle wyraźny, że można działać.",
      },
      nl: {
        body: "Max Bergmann controleert Moorfield Property Management - jaarlijkse controles, met status Gewonnen, terwijl Oakridge Climate Systems - onderhoudsplan warmtepomp Open blijft en Riverton HVAC Service - jaarlijks onderhoud Verloren blijft in de rustige context.",
        focalLabel: "Signaal",
        headline: "Een relevant signaal komt in beeld",
        semanticLabels: ["Inspecteur"],
        takeaway: "Eén rustig signaal wordt duidelijk genoeg om op te handelen.",
      },
    },
    depictionKind: "result",
    factReference: "product:deal-status-field",
    focalSubject: {
      fixtures: {
        person: "max-bergmann",
        record: "deal-moorfield-property-management",
        status: "deal-won",
      },
      form: "signal",
      id: "quiet-signal",
    },
    id: "golden.focus",
    pathway: "focus",
    supportingSubjects: [
      {
        fixtures: {
          record: "deal-oakridge-climate-systems",
          status: "deal-open",
        },
        form: "context-card",
        id: "quiet-context",
      },
      {
        fixtures: {
          record: "deal-riverton-hvac-service",
          status: "deal-lost",
        },
        form: "context-card",
        id: "lost-context",
      },
    ],
  },
  handoff: {
    accentTarget: "human-action",
    copy: {
      de: {
        body: "ChatGPT bereitet einen LinkedIn-Entwurf für Rachel Dawson vor; Max Bergmann prüft und sendet ihn.",
        focalLabel: "Entwurf",
        headline: "Der Mensch behält den letzten Schritt",
        semanticLabels: ["Senden"],
        takeaway: "ChatGPT entwirft; der Mensch sendet.",
      },
      en: {
        body: "ChatGPT prepares a LinkedIn draft for Rachel Dawson; Max Bergmann reviews and sends it.",
        focalLabel: "Draft",
        headline: "The human keeps the final step",
        semanticLabels: ["Send"],
        takeaway: "ChatGPT drafts; the human sends.",
      },
      es: {
        body: "ChatGPT prepara un borrador de LinkedIn para Rachel Dawson; Max Bergmann lo revisa y lo envía.",
        focalLabel: "Borrador",
        headline: "La persona se queda con el último paso",
        semanticLabels: ["Enviar"],
        takeaway: "ChatGPT redacta; la persona envía.",
      },
      pt: {
        body: "O ChatGPT prepara um rascunho do LinkedIn para Rachel Dawson; Max Bergmann o revisa e o envia.",
        focalLabel: "Rascunho",
        headline: "A pessoa fica com a última etapa",
        semanticLabels: ["Enviar"],
        takeaway: "O ChatGPT redige; a pessoa envia.",
      },
      pl: {
        body: "ChatGPT przygotowuje szkic na LinkedIn dla Rachel Dawson; Max Bergmann sprawdza go i wysyła.",
        focalLabel: "Szkic",
        headline: "Ostatni krok zostaje po stronie człowieka",
        semanticLabels: ["Wyślij"],
        takeaway: "ChatGPT przygotowuje szkic; człowiek wysyła.",
      },
      nl: {
        body: "ChatGPT maakt een LinkedIn-concept voor Rachel Dawson; Max Bergmann controleert en verstuurt het.",
        focalLabel: "Concept",
        headline: "De mens houdt de laatste stap",
        semanticLabels: ["Verzenden"],
        takeaway: "ChatGPT schrijft het concept; de mens verstuurt.",
      },
    },
    depictionKind: "change",
    factReference: "product:human-send-boundary",
    focalSubject: {
      fixtures: { person: "rachel-dawson", provider: "linkedin" },
      form: "draft",
      id: "message-draft",
    },
    id: "golden.handoff",
    pathway: "handoff",
    supportingSubjects: [
      { agentProvider: "chatgpt", form: "agent-cue", id: "agent-cue" },
      {
        fixtures: { person: "max-bergmann" },
        form: "human-action",
        id: "human-action",
      },
    ],
  },
};

function buildGolden(definition: GoldenDefinition, locale: VisualLocale): GoldenVisualBrief {
  const copy = definition.copy[locale];
  const brief = validateVisualBrief({
    accentTarget: definition.accentTarget,
    depiction: {
      kind: definition.depictionKind,
      productBehavior: true,
      statement: copy.takeaway,
    },
    factReferences: [definition.factReference],
    focalLabel: { locale, text: copy.focalLabel },
    focalSubject: definition.focalSubject,
    id: definition.id,
    kind: "brand-illustration",
    locale,
    pathway: definition.pathway,
    placements: ["wide", "split", "narrow"],
    referenceSystemVersion: VISUAL_REFERENCE_SYSTEM_VERSION,
    selection: "automatic",
    semanticLabels: copy.semanticLabels.map((text) => ({ locale, text })),
    source: {
      body: copy.body,
      checksum: visualSourceChecksum(copy.headline, copy.body),
      headline: copy.headline,
    },
    supportingSubjects: definition.supportingSubjects,
    takeaway: copy.takeaway,
  });
  if (brief.kind !== "brand-illustration") throw new Error(`${definition.id} did not produce a brand illustration`);
  if (brief.id !== definition.id || brief.pathway !== definition.pathway)
    throw new Error(`${definition.id} did not preserve its golden pathway identity`);

  return brief as GoldenVisualBrief;
}

export const GOLDEN_VISUAL_BRIEFS = Object.fromEntries(
  Object.entries(GOLDEN_DEFINITIONS).map(([pathway, definition]) => [
    pathway,
    Object.fromEntries(VISUAL_LOCALES.map((locale) => [locale, buildGolden(definition, locale)])),
  ]),
) as Record<VisualPathway, Record<VisualLocale, GoldenVisualBrief>>;

export function getGoldenVisualBrief(pathway: VisualPathway, locale: VisualLocale) {
  return GOLDEN_VISUAL_BRIEFS[pathway][locale];
}

export function validateGoldenVisualBrief(value: unknown): GoldenVisualBrief {
  const brief = validateVisualBrief(value);
  if (brief.kind !== "brand-illustration") throw new Error("Golden visuals must be brand illustrations");

  const golden = GOLDEN_VISUAL_BRIEFS[brief.pathway][assetLocaleFor(contentLocaleOrDefault(brief.locale))];
  if (JSON.stringify(brief) !== JSON.stringify(golden))
    throw new Error(`${brief.id} does not exactly match the registered golden benchmark`);

  return brief as GoldenVisualBrief;
}
