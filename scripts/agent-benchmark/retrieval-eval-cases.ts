import type { DocsHeldoutItem } from "./heldout-data/docs";

import { DOCS_HELDOUT } from "./heldout-data/docs";
import { DOCS_EMBEDDING_HELDOUT } from "./heldout-data/docs-embedding";

export type DocsRetrievalEvalItem = Pick<DocsHeldoutItem, "id" | "docsLocale" | "query" | "slug" | "anchors" | "alternatives">;

export const DOCS_LIVE_CASE_LABELS: readonly DocsRetrievalEvalItem[] = [
  {
    id: "D1",
    docsLocale: "en",
    query: "Where in Customermates do I create an API key for the REST API? Just tell me where to click.",
    slug: "api-keys",
    anchors: ["api-keys#how-do-i-create-an-api-key"],
    alternatives: ["app-profile#api--connectors-tab", "connect-cli#create-an-api-key"],
  },
  {
    id: "D2",
    docsLocale: "en",
    query: "What is the address of the Customermates MCP server, and how does an MCP client send its API key?",
    slug: "mcp",
    anchors: ["mcp#the-endpoint"],
    alternatives: ["api-keys#how-do-i-use-a-key"],
  },
  {
    id: "D3",
    docsLocale: "en",
    query: "How can my receiving service check that a webhook request really came from Customermates?",
    slug: "webhooks",
    anchors: ["webhooks#how-do-i-verify-the-signature"],
    alternatives: [],
  },
  {
    id: "D4",
    docsLocale: "en",
    query: "How many hosted AI credits per active user and month come with the Business plan?",
    slug: "app-assistant",
    anchors: ["app-assistant#plans-and-credits"],
    alternatives: ["app-company#which-plans-are-there"],
  },
  {
    id: "D5",
    docsLocale: "en",
    query: "When the assistant asks me to approve something and I don't answer, how long does that request stay open?",
    slug: "app-assistant",
    anchors: ["app-assistant#what-runs-immediately-and-what-asks-first"],
    alternatives: [],
  },
  {
    id: "D6",
    docsLocale: "de",
    query: "Wo stelle ich die Währung für unseren Workspace ein?",
    slug: "app-company",
    anchors: ["app-company#settings-tab"],
    alternatives: ["app-company#who-can-change-the-currency-and-the-other-settings"],
  },
  {
    id: "D7",
    docsLocale: "de",
    query: "Kann ich das Ablaufdatum eines API-Keys verlängern, bevor er abläuft?",
    slug: "api-keys",
    anchors: ["api-keys#do-keys-expire"],
    alternatives: [],
  },
  {
    id: "D8",
    docsLocale: "de",
    query: "Kann ich einem MCP-Client nur einen Teil der Tools freigeben, zum Beispiel nur Datensätze und Nachrichten?",
    slug: "mcp",
    anchors: ["mcp#server-instructions-prompts-and-toolsets", "mcp#narrowing-with-toolsets"],
    alternatives: [],
  },
  {
    id: "D9",
    docsLocale: "de",
    query: "Wie werden Webhook-Zustellungen von Customermates signiert, und wie prüfe ich das auf meinem Server?",
    slug: "webhooks",
    anchors: ["webhooks#how-do-i-verify-the-signature"],
    alternatives: [],
  },
  {
    id: "D10",
    docsLocale: "de",
    query: "Wie viele KI-Credits pro aktivem Nutzer und Monat sind im Pro-Tarif enthalten?",
    slug: "app-assistant",
    anchors: ["app-assistant#plans-and-credits"],
    alternatives: ["app-company#which-plans-are-there"],
  },
];

export const DOCS_RETRIEVAL_EVAL: readonly DocsRetrievalEvalItem[] = [
  ...DOCS_LIVE_CASE_LABELS,
  ...DOCS_HELDOUT,
  ...DOCS_EMBEDDING_HELDOUT,
];

const GENERIC_SENTENCES = [
  "Keep this section current whenever the underlying process changes.",
  "Owners confirm the details during the monthly operations sync.",
  "Record exceptions in the shared tracker with a short rationale.",
  "Link related pages so colleagues can follow the context.",
  "Ask in the internal channel when something here is unclear.",
  "Examples in this section are illustrative and may be simplified.",
  "New colleagues read this during their first weeks.",
  "Older versions of this guidance are kept in the page history.",
  "Numbers and names are reviewed at least twice a year.",
];

function filler(topic: string, headings: string[]): string {
  return headings
    .map(
      (heading, index) =>
        `## ${topic} ${heading.toLocaleLowerCase()}\n\n${Array.from(
          { length: 6 },
          (_, sentence) => GENERIC_SENTENCES[(index * 4 + sentence) % GENERIC_SENTENCES.length],
        ).join(" ")}`,
    )
    .join("\n\n");
}

const FILLER_HEADINGS = [
  "Background",
  "Responsibilities",
  "Tools",
  "Examples",
  "History",
  "Related pages",
  "Open points",
  "Templates",
  "Metrics",
  "Owners",
  "Checklist",
  "Notes",
];

export const WIKI_RETRIEVAL_CORPUS: Array<{ title: string; markdown: string }> = [
  {
    title: "Refund policy",
    markdown: [
      "This page describes how we handle refund requests from customers.",
      "## Eligibility\n\nCustomers can request a refund within 30 days of purchase when the subscription was barely used.",
      "## Partial refunds\n\nPartial refunds are calculated pro rata for the unused months of an annual plan.",
      filler("Refund", FILLER_HEADINGS.slice(0, 6)),
      "## Refund timelines\n\nApproved refunds are paid back to the original payment method within 5 business days.",
      "## Chargebacks\n\nWhen a bank reports a chargeback, pause the account and notify finance immediately.",
      filler("Refund", FILLER_HEADINGS.slice(6)),
      "## Regional rules\n\nIn the European Union, consumers have a statutory right of withdrawal of 14 days after purchase.",
      "## Approval matrix\n\nRefunds above 500 EUR require approval from the finance lead before they are issued.",
    ].join("\n\n"),
  },
  {
    title: "Refund policy (legacy 2023)",
    markdown:
      "This archived page describes the refund rules that applied before January 2024. Refunds were only granted within 14 days and required a written request by letter.",
  },
  {
    title: "Rückerstattungen",
    markdown:
      "Kunden können eine Rückerstattung innerhalb von 30 Tagen beantragen. Rückerstattungen werden innerhalb von 10 Werktagen bearbeitet. Bei Teilzahlungen wird anteilig erstattet.",
  },
  {
    title: "Política de reembolsos",
    markdown:
      "Los reembolsos se procesan en un plazo de 7 días hábiles. El cliente debe enviar la solicitud por correo electrónico al equipo de facturación.",
  },
  {
    title: "Politique de remboursement",
    markdown:
      "Les remboursements sont traités sous 5 jours ouvrés. Toute demande de remboursement doit être envoyée par écrit au service de facturation.",
  },
  {
    title: "Politica di rimborso",
    markdown:
      "I rimborsi vengono elaborati entro 10 giorni lavorativi. La richiesta deve essere inviata al reparto amministrativo.",
  },
  {
    title: "Onboarding checklist",
    markdown: [
      "Use this checklist for every new customer after the contract is signed.",
      "## Before kickoff\n\nCreate the workspace, invite the champion, and prepare the welcome email.",
      "## Kickoff call\n\nSchedule the kickoff call within 3 business days of signature and share the agenda upfront.",
      filler("Onboarding", FILLER_HEADINGS.slice(0, 5)),
      "## Data import\n\nImport contacts from CSV using the import wizard; map custom fields before uploading.",
      "## Training sessions\n\nOffer two live training sessions: one for admins and one for sales reps.",
      filler("Onboarding", FILLER_HEADINGS.slice(5)),
      "## Go-live criteria\n\nGo-live requires at least three active users and one completed pipeline review.",
      "## Handover\n\nAfter go-live the account manager takes over the relationship.",
    ].join("\n\n"),
  },
  {
    title: "Customer onboarding playbook",
    markdown:
      "Our playbook for onboarding enterprise customers: assign a dedicated onboarding manager and run weekly check-ins for the first 60 days.",
  },
  {
    title: "Kundenonboarding",
    markdown:
      "Jeder neue Kunde erhält einen persönlichen Ansprechpartner. Das Einführungsgespräch findet innerhalb einer Woche statt.",
  },
  {
    title: "Guía de incorporación de clientes",
    markdown:
      "La incorporación de nuevos clientes comienza con una llamada de bienvenida y una sesión de formación para administradores.",
  },
  {
    title: "Guide d'intégration des clients",
    markdown:
      "L'intégration des nouveaux clients commence par un appel de lancement suivi d'une formation des administrateurs.",
  },
  {
    title: "Support escalation process",
    markdown: [
      "How support tickets move from the first line to engineering.",
      "## Severity levels\n\nSeverity 1 means the product is unavailable for all users. Severity 2 means a major feature is broken.",
      "## On-call rotation\n\nThe on-call engineer is paged through PagerDuty and rotates every Monday.",
      filler("Escalation", FILLER_HEADINGS.slice(0, 6)),
      "## Escalating to engineering\n\nCritical tickets outside business hours are escalated by calling the on-call engineer through the paging tool.",
      "## Customer communication\n\nPost a status update for affected customers every hour until the issue is resolved.",
      filler("Escalation", FILLER_HEADINGS.slice(6)),
      "## Post-incident review\n\nEvery severity 1 incident needs a written post-mortem within five working days.",
    ].join("\n\n"),
  },
  {
    title: "Service level agreement",
    markdown:
      "Priority 1 tickets receive a first response within 30 minutes. Priority 2 tickets receive a first response within 4 hours. The uptime commitment is 99.9 percent per month.",
  },
  {
    title: "Brand voice and tone",
    markdown:
      "We write in a friendly, direct voice. Avoid jargon and exclamation marks. Address customers by first name in chat.",
  },
  {
    title: "Tonalität und Markenstimme",
    markdown: "Wir duzen unsere Kunden im Chat und siezen sie in E-Mails. Wir vermeiden Fachjargon und Ausrufezeichen.",
  },
  {
    title: "Pricing and discounts",
    markdown:
      "Customers who prepay annually receive an annual prepayment discount of 15 percent. Registered nonprofits receive a 30 percent nonprofit discount on any plan. Discounts cannot be combined.",
  },
  {
    title: "Preise und Rabatte",
    markdown:
      "Bei jährlicher Vorauszahlung gewähren wir 15 Prozent Rabatt. Gemeinnützige Organisationen erhalten 30 Prozent Nachlass auf jeden Tarif.",
  },
  {
    title: "Security and data protection",
    markdown: [
      "Our security commitments for customer data.",
      "## Encryption\n\nAll customer data is encrypted with AES-256 at rest and TLS 1.3 in transit.",
      filler("Security", FILLER_HEADINGS.slice(0, 6)),
      "## Access reviews\n\nAdmin access is checked in a quarterly access review by the security lead.",
      "## Incident response\n\nSuspected breaches are reported to the security lead within one hour.",
      filler("Security", FILLER_HEADINGS.slice(6)),
      "## Data retention\n\nData of cancelled workspaces is permanently deleted after 90 days.",
      "## Subprocessors\n\nThe list of subprocessors is published on the trust page.",
    ].join("\n\n"),
  },
  {
    title: "Datenschutz und Sicherheit",
    markdown:
      "Mit jedem Geschäftskunden schließen wir einen Auftragsverarbeitungsvertrag (AVV) ab. Personenbezogene Daten werden ausschließlich in Rechenzentren in Frankfurt gespeichert.",
  },
  {
    title: "Sales playbook",
    markdown: [
      "How we run deals from first contact to signature.",
      "## Discovery questions\n\nAsk about the current tool, the team size, and the biggest pain in the weekly pipeline meeting.",
      "## Qualification\n\nWe qualify opportunities with the MEDDICC framework before the first demo.",
      filler("Sales", FILLER_HEADINGS.slice(0, 6)),
      "## Objection handling\n\nWhen a prospect says the product is too expensive, compare the cost with the hours saved per week.",
      "## Demo guidelines\n\nShow the prospect's own pipeline instead of sample data whenever possible.",
      filler("Sales", FILLER_HEADINGS.slice(6)),
      "## Closing\n\nSend the order form together with a mutual action plan.",
    ].join("\n\n"),
  },
  {
    title: "Partner program",
    markdown:
      "Referral partners receive a 20 percent revenue share for the first year of each referred customer. Partners must complete the certification course.",
  },
  {
    title: "Holiday calendar and office hours",
    markdown:
      "Our office hours are Monday to Friday, 9:00 to 17:00 CET. The office is closed on December 24 and December 31.",
  },
  {
    title: "Travel expense policy",
    markdown: [
      "Rules for booking and reimbursing business travel.",
      "## Booking travel\n\nBook trains and flights through the travel portal at least 14 days ahead.",
      filler("Travel", FILLER_HEADINGS.slice(0, 6)),
      "## Per diem rates\n\nThe per diem for Berlin is 28 EUR per day; other cities follow the statutory table.",
      "## Receipts\n\nSubmit receipts within 30 days of the trip in the expense tool.",
      filler("Travel", FILLER_HEADINGS.slice(6)),
      "## Mileage\n\nPrivate car use is reimbursed at 0.30 EUR per kilometre.",
    ].join("\n\n"),
  },
  {
    title: "Reisekostenrichtlinie",
    markdown:
      "Übernachtungskosten werden bis 120 Euro pro Nacht erstattet. Bahnfahrten erfolgen in der zweiten Klasse.",
  },
  {
    title: "Product roadmap Q3",
    markdown: "The Zephyr integration ships in August. Bulk editing for deals follows in September.",
  },
  {
    title: "Engineering on-call runbook",
    markdown: [
      "Operational steps for the engineer on call.",
      "## Alerts\n\nAcknowledge every alert within ten minutes and write the first note in the incident channel.",
      filler("Runbook", FILLER_HEADINGS.slice(0, 6)),
      "## Restarting consumers\n\nIf the event queue stalls, restart the Kafka consumer group with kcat on the quokka-7 cluster.",
      "## Database failover\n\nPromote the replica only after the primary has been unreachable for five minutes.",
      filler("Runbook", FILLER_HEADINGS.slice(6)),
      "## Rollbacks\n\nRoll back a failed deployment by promoting the previous release in the deploy dashboard.",
    ].join("\n\n"),
  },
  {
    title: "客户支持手册",
    markdown: "退款申请需要在30天内提交。客户支持团队会在一个工作日内回复。",
  },
  {
    title: "고객 지원 안내",
    markdown: [
      "## 소개\n\n이 페이지는 고객 지원 팀의 기본 안내입니다.",
      "## 환불 정책\n\n환불은 구매 후 30일 이내에 요청할 수 있습니다.",
      "## 배송\n\n배송은 영업일 기준 3일이 걸립니다.",
    ].join("\n\n"),
  },
  {
    title: "社内研修ガイド",
    markdown: [
      "## 概要\n\nこのページは新入社員向けの案内です。",
      "## がくしゅう\n\n新入社員はがくしゅう計画に沿って三か月学びます。",
      "## データベース\n\n本番のデータベースは毎晩バックアップされます。",
    ].join("\n\n"),
  },
  {
    title: "Glossary",
    markdown: [
      "Terms we use across sales, success, and finance.",
      ...[
        ["Churn", "The share of customers who cancel in a period."],
        ["Pipeline", "All open deals with their stage and expected value."],
        ["Lead scoring", "Points assigned to leads based on fit and engagement."],
        ["Champion", "The person inside the customer who drives adoption."],
        ["Seat", "One paid user license in a workspace."],
        ["Cohort", "A group of customers who signed up in the same month."],
        ["Upsell", "Selling a larger plan or add-on to an existing customer."],
        ["Win rate", "Closed won deals divided by all closed deals."],
      ].map(([term, definition]) => `### ${term}\n\n${definition} ${GENERIC_SENTENCES.slice(0, 5).join(" ")}`),
      "### NRR\n\nNet revenue retention: revenue kept from existing customers including expansion.",
      "### ARR\n\nAnnual recurring revenue: the yearly value of all active subscriptions.",
    ].join("\n\n"),
  },
  {
    title: "Hiring process",
    markdown:
      "Every engineering candidate completes a paid take-home exercise. The final interview is with two future teammates.",
  },
  {
    title: "Contract renewal process",
    markdown: "Contracts renew automatically. Send the renewal notice 60 days before the end of the term.",
  },
  {
    title: "Meeting notes template",
    markdown: "Use this template for customer meetings: attendees, agenda, decisions, next steps.",
  },
];

export type WikiEvalCategory =
  | "exact-title"
  | "inflection"
  | "typo"
  | "partial"
  | "natural-language"
  | "multi-term"
  | "phrase"
  | "cross-language"
  | "section"
  | "rare-term"
  | "cjk"
  | "no-match";

export type WikiEvalQuery = { category: WikiEvalCategory; query: string; expect: string[]; answer?: string };

export const WIKI_RETRIEVAL_QUERIES: WikiEvalQuery[] = [
  { category: "exact-title", query: "Refund policy", expect: ["Refund policy"] },
  { category: "exact-title", query: "Travel expense policy", expect: ["Travel expense policy"] },
  { category: "exact-title", query: "Partner program", expect: ["Partner program"] },
  { category: "exact-title", query: "Glossary", expect: ["Glossary"] },
  { category: "exact-title", query: "Kundenonboarding", expect: ["Kundenonboarding"] },
  { category: "exact-title", query: "Customer onboarding playbook", expect: ["Customer onboarding playbook"] },
  { category: "inflection", query: "refunded", expect: ["Refund policy"] },
  { category: "inflection", query: "escalations", expect: ["Support escalation process"] },
  { category: "inflection", query: "Rückerstattung", expect: ["Rückerstattungen"] },
  { category: "inflection", query: "Rückerstattungen bearbeiten", expect: ["Rückerstattungen"] },
  { category: "inflection", query: "discounted plans for nonprofit", expect: ["Pricing and discounts"] },
  { category: "inflection", query: "renewing contracts", expect: ["Contract renewal process"] },
  { category: "inflection", query: "Rabatte gemeinnützig", expect: ["Preise und Rabatte"] },
  {
    category: "inflection",
    query: "refunds eligibility",
    expect: ["Refund policy"],
    answer: "request a refund within 30 days",
  },
  { category: "inflection", query: "approving refunds", expect: ["Refund policy"] },
  { category: "typo", query: "refnud policy", expect: ["Refund policy"] },
  { category: "typo", query: "PagerDutty", expect: ["Support escalation process"] },
  { category: "typo", query: "Kundenonbording", expect: ["Kundenonboarding"] },
  { category: "typo", query: "onbaording checklist", expect: ["Onboarding checklist"] },
  { category: "typo", query: "escalaton process", expect: ["Support escalation process"] },
  { category: "typo", query: "Datenshutz", expect: ["Datenschutz und Sicherheit"] },
  { category: "typo", query: "glosary", expect: ["Glossary"] },
  {
    category: "typo",
    query: "milage reimbursment",
    expect: ["Travel expense policy"],
    answer: "0.30 EUR per kilometre",
  },
  { category: "partial", query: "onboard", expect: ["Onboarding checklist", "Customer onboarding playbook"] },
  { category: "partial", query: "escal", expect: ["Support escalation process"] },
  { category: "partial", query: "Reisekosten", expect: ["Reisekostenrichtlinie"] },
  { category: "partial", query: "glossa", expect: ["Glossary"] },
  { category: "partial", query: "Datenschu", expect: ["Datenschutz und Sicherheit"] },
  {
    category: "natural-language",
    query: "What happens when a customer in the EU wants to withdraw from the contract after purchase?",
    expect: ["Refund policy"],
    answer: "statutory right of withdrawal of 14 days",
  },
  {
    category: "natural-language",
    query: "How do I escalate a critical ticket to engineering at night?",
    expect: ["Support escalation process"],
    answer: "escalated by calling the on-call engineer",
  },
  {
    category: "natural-language",
    query: "Which discount do nonprofit organizations get on their plan?",
    expect: ["Pricing and discounts"],
    answer: "30 percent nonprofit discount",
  },
  {
    category: "natural-language",
    query: "how fast do we have to answer priority 1 tickets",
    expect: ["Service level agreement"],
    answer: "first response within 30 minutes",
  },
  {
    category: "natural-language",
    query: "Wie viel Rabatt bekommen Kunden bei jährlicher Vorauszahlung?",
    expect: ["Preise und Rabatte"],
  },
  {
    category: "natural-language",
    query: "what should I do when a prospect says we are too expensive",
    expect: ["Sales playbook"],
    answer: "too expensive, compare the cost",
  },
  {
    category: "natural-language",
    query: "Who approves large refunds?",
    expect: ["Refund policy"],
    answer: "approval from the finance lead",
  },
  { category: "natural-language", query: "What is our uptime commitment?", expect: ["Service level agreement"] },
  {
    category: "natural-language",
    query: "which cluster do the Kafka consumers run on",
    expect: ["Engineering on-call runbook"],
    answer: "quokka-7 cluster",
  },
  {
    category: "multi-term",
    query: "refund approval finance lead",
    expect: ["Refund policy"],
    answer: "require approval from the finance lead",
  },
  { category: "multi-term", query: "annual prepayment discount", expect: ["Pricing and discounts"] },
  {
    category: "multi-term",
    query: "quarterly access review",
    expect: ["Security and data protection"],
    answer: "quarterly access review",
  },
  {
    category: "multi-term",
    query: "kickoff call onboarding",
    expect: ["Onboarding checklist"],
    answer: "Schedule the kickoff call",
  },
  { category: "phrase", query: '"office hours"', expect: ["Holiday calendar and office hours"] },
  { category: "phrase", query: '"first response" priority', expect: ["Service level agreement"] },
  { category: "phrase", query: '"revenue share"', expect: ["Partner program"] },
  {
    category: "phrase",
    query: '"right of withdrawal"',
    expect: ["Refund policy"],
    answer: "right of withdrawal",
  },
  { category: "phrase", query: '"per diem"', expect: ["Travel expense policy"], answer: "per diem for Berlin" },
  { category: "cross-language", query: "reembolso", expect: ["Política de reembolsos"] },
  { category: "cross-language", query: "remboursements traités", expect: ["Politique de remboursement"] },
  { category: "cross-language", query: "incorporación clientes", expect: ["Guía de incorporación de clientes"] },
  { category: "cross-language", query: "intégration clients", expect: ["Guide d'intégration des clients"] },
  { category: "cross-language", query: "rimborsi elaborati", expect: ["Politica di rimborso"] },
  {
    category: "section",
    query: "per diem Berlin",
    expect: ["Travel expense policy"],
    answer: "per diem for Berlin is 28 EUR",
  },
  {
    category: "section",
    query: "how long is data of cancelled workspaces kept",
    expect: ["Security and data protection"],
    answer: "permanently deleted after 90 days",
  },
  {
    category: "section",
    query: "restart Kafka consumer",
    expect: ["Engineering on-call runbook"],
    answer: "restart the Kafka consumer group",
  },
  {
    category: "section",
    query: "go-live criteria",
    expect: ["Onboarding checklist"],
    answer: "Go-live requires at least three active users",
  },
  {
    category: "section",
    query: "post-mortem severity 1",
    expect: ["Support escalation process"],
    answer: "written post-mortem",
  },
  {
    category: "section",
    query: "roll back failed deployment",
    expect: ["Engineering on-call runbook"],
    answer: "Roll back a failed deployment",
  },
  {
    category: "section",
    query: "ARR definition",
    expect: ["Glossary"],
    answer: "Annual recurring revenue",
  },
  {
    category: "rare-term",
    query: "quokka-7",
    expect: ["Engineering on-call runbook"],
    answer: "quokka-7 cluster",
  },
  {
    category: "rare-term",
    query: "PagerDuty",
    expect: ["Support escalation process"],
    answer: "paged through PagerDuty",
  },
  {
    category: "rare-term",
    query: "MEDDICC",
    expect: ["Sales playbook"],
    answer: "MEDDICC framework",
  },
  {
    category: "rare-term",
    query: "AES-256",
    expect: ["Security and data protection"],
    answer: "AES-256 at rest",
  },
  { category: "rare-term", query: "Zephyr", expect: ["Product roadmap Q3"] },
  { category: "rare-term", query: "AVV", expect: ["Datenschutz und Sicherheit"] },
  { category: "cjk", query: "退款申请", expect: ["客户支持手册"] },
  { category: "cjk", query: "客户支持", expect: ["客户支持手册"] },
  { category: "cjk", query: "환불", expect: ["고객 지원 안내"], answer: "30일 이내에 요청" },
  { category: "cjk", query: "배송", expect: ["고객 지원 안내"], answer: "영업일 기준 3일" },
  { category: "cjk", query: "がくしゅう", expect: ["社内研修ガイド"], answer: "がくしゅう計画に沿って" },
  { category: "cjk", query: "データベース", expect: ["社内研修ガイド"], answer: "毎晩バックアップ" },
  { category: "no-match", query: "blockchain mining rig", expect: [] },
  { category: "no-match", query: "xylophone", expect: [] },
  { category: "no-match", query: "quantum teleportation experiment", expect: [] },
  { category: "no-match", query: "Weltraumtourismus", expect: [] },
  { category: "no-match", query: "zzqxv", expect: [] },
];


export type RetrievalNoMatchItem = { id: string; lang: "en" | "de" | "es" | "fr" | "it"; query: string };

export const DOCS_NO_MATCH_EVAL: readonly (RetrievalNoMatchItem & { docsLocale: "en" | "de" })[] = [
  { id: "DN1", lang: "en", docsLocale: "en", query: "how do I run payroll for my employees" },
  { id: "DN2", lang: "en", docsLocale: "en", query: "can I send bulk SMS campaigns to my contacts" },
  { id: "DN3", lang: "en", docsLocale: "en", query: "track employee working hours with a timesheet" },
  { id: "DN4", lang: "en", docsLocale: "en", query: "print shipping labels for customer orders" },
  { id: "DN5", lang: "de", docsLocale: "de", query: "Wie verwalte ich den Lagerbestand meiner Produkte?" },
  { id: "DN6", lang: "de", docsLocale: "de", query: "Lohnabrechnung für Mitarbeiter erstellen" },
  { id: "DN7", lang: "es", docsLocale: "en", query: "cómo hago llamadas telefónicas desde un marcador integrado" },
  { id: "DN8", lang: "es", docsLocale: "en", query: "¿puedo reservar vuelos para viajes de negocios?" },
  { id: "DN9", lang: "fr", docsLocale: "en", query: "comment créer une boutique en ligne avec paiement par carte" },
  { id: "DN10", lang: "it", docsLocale: "en", query: "come gestire le buste paga dei dipendenti" },
];

export const WIKI_NO_MATCH_TUNING: readonly RetrievalNoMatchItem[] = [
  { id: "WN1", lang: "en", query: "where can I park my car at the office" },
  { id: "WN2", lang: "en", query: "how do I order new business cards" },
  { id: "WN3", lang: "en", query: "what is the dress code for client visits" },
  { id: "WN4", lang: "de", query: "Wie beantrage ich Elternzeit?" },
  { id: "WN5", lang: "es", query: "¿dónde está la cafetería de la empresa?" },
  { id: "WN6", lang: "fr", query: "comment commander des fournitures de bureau" },
  { id: "WN7", lang: "it", query: "qual è la password del wifi degli ospiti" },
  { id: "WN8", lang: "en", query: "company softball team schedule" },
  { id: "WN9", lang: "de", query: "Gibt es einen Zuschuss für das Fitnessstudio?" },
  { id: "WN10", lang: "en", query: "how do I request a new laptop" },
];
