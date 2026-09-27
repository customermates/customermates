import type { TenantUser } from "@/features/user/user.schema";
import type { WikiSearchResult } from "../wiki.schema";

import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runWithTenant } from "@/core/decorators/tenant-context";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createMockUser } from "@/tests/helpers/mock-user";

import { PrismaWikiPageRepo } from "../prisma-wiki-page.repository";
import { SearchWikiPagesInteractor } from "../search-wiki-pages.interactor";
import { WikiMarkdownSchema } from "../wiki.schema";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

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

const WIKI_RETRIEVAL_CORPUS: Array<{ title: string; markdown: string }> = [
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

type EvalCategory =
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

type EvalQuery = { category: EvalCategory; query: string; expect: string[]; answer?: string };

const WIKI_RETRIEVAL_QUERIES: EvalQuery[] = [
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
  { category: "no-match", query: "blockchain mining rig", expect: [] },
  { category: "no-match", query: "xylophone", expect: [] },
  { category: "no-match", query: "quantum teleportation experiment", expect: [] },
  { category: "no-match", query: "Weltraumtourismus", expect: [] },
  { category: "no-match", query: "zzqxv", expect: [] },
];

const SECTION_WINDOW = 2_000;

const RETRIEVAL_TARGETS: Record<string, { recallAt1: number; recallAt5: number; mrr: number; sectionHitAt1?: number }> =
  {
    "exact-title": { recallAt1: 1, recallAt5: 1, mrr: 1 },
    inflection: { recallAt1: 1, recallAt5: 1, mrr: 1, sectionHitAt1: 1 },
    typo: { recallAt1: 0.875, recallAt5: 0.875, mrr: 0.875, sectionHitAt1: 1 },
    partial: { recallAt1: 1, recallAt5: 1, mrr: 1 },
    "natural-language": { recallAt1: 1, recallAt5: 1, mrr: 1, sectionHitAt1: 1 },
    "multi-term": { recallAt1: 1, recallAt5: 1, mrr: 1, sectionHitAt1: 1 },
    phrase: { recallAt1: 1, recallAt5: 1, mrr: 1, sectionHitAt1: 1 },
    "cross-language": { recallAt1: 1, recallAt5: 1, mrr: 1 },
    section: { recallAt1: 1, recallAt5: 1, mrr: 1, sectionHitAt1: 1 },
    "rare-term": { recallAt1: 1, recallAt5: 1, mrr: 1, sectionHitAt1: 1 },
    cjk: { recallAt1: 1, recallAt5: 1, mrr: 1 },
    "no-match": { recallAt1: 1, recallAt5: 1, mrr: 1 },
    overall: { recallAt1: 0.98, recallAt5: 0.98, mrr: 0.98, sectionHitAt1: 1 },
  };

type Metrics = { queries: number; recallAt1: number; recallAt5: number; mrr: number; sectionHitAt1: number | null };

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}

describeDatabase("Workspace Wiki retrieval quality", () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const companyId = randomUUID();
  const userId = randomUUID();
  const user: TenantUser = createMockUser({ id: userId, companyId });
  const markdownByTitle = new Map<string, string>();

  beforeAll(async () => {
    await client.connect();
    await client.query('INSERT INTO "Company" ("id", "updatedAt") VALUES ($1, CURRENT_TIMESTAMP)', [companyId]);
    await client.query(
      'INSERT INTO "User" ("id", "email", "firstName", "lastName", "companyId", "updatedAt") VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)',
      [userId, `wiki-eval-${userId}@example.invalid`, "Wiki", "Evaluator", companyId],
    );
    for (const [index, page] of WIKI_RETRIEVAL_CORPUS.entries()) {
      const markdown = WikiMarkdownSchema.parse(page.markdown);
      markdownByTitle.set(page.title, markdown);
      await client.query(
        'INSERT INTO "WikiPage" ("id", "companyId", "title", "markdown", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $5)',
        [randomUUID(), companyId, page.title, markdown, new Date(Date.UTC(2026, 0, 1, 0, 0, index))],
      );
    }
  });

  afterAll(async () => {
    await client.query('DELETE FROM "WikiPage" WHERE "companyId" = $1', [companyId]);
    await client.query('DELETE FROM "User" WHERE "companyId" = $1', [companyId]);
    await client.query('DELETE FROM "Company" WHERE "id" = $1', [companyId]);
    await client.end();
  });

  function sectionHit(item: WikiSearchResult & { offset?: number }, answer: string) {
    if (item.snippet.toLocaleLowerCase().includes(answer.toLocaleLowerCase())) return true;
    if (item.offset === undefined) return false;
    const position = (markdownByTitle.get(item.title) ?? "").toLocaleLowerCase().indexOf(answer.toLocaleLowerCase());
    return position >= item.offset && position < item.offset + SECTION_WINDOW;
  }

  it("meets the labelled retrieval targets per query category", async () => {
    expect(WIKI_RETRIEVAL_CORPUS.length).toBeGreaterThanOrEqual(25);
    expect(WIKI_RETRIEVAL_QUERIES.length).toBeGreaterThanOrEqual(40);

    const byCategory = new Map<EvalCategory, Array<{ rank: number; sectionHit: boolean | null; empty: boolean }>>();
    const misses: string[] = [];
    for (const labelled of WIKI_RETRIEVAL_QUERIES) {
      const result = await runWithTenant(user, () =>
        new SearchWikiPagesInteractor(new PrismaWikiPageRepo(), "stored").invoke({
          query: labelled.query,
          page: 1,
          pageSize: 5,
        }),
      );
      if (!result.ok) throw new Error(`Search failed for ${labelled.query}`);
      const titles = result.data.items.map((item) => item.title);
      const rank = titles.findIndex((title) => labelled.expect.includes(title)) + 1;
      const top = result.data.items[0] as (WikiSearchResult & { offset?: number }) | undefined;
      const hit =
        labelled.answer === undefined ? null : rank === 1 && top !== undefined && sectionHit(top, labelled.answer);
      const outcome = { rank, sectionHit: hit, empty: titles.length === 0 };
      byCategory.set(labelled.category, [...(byCategory.get(labelled.category) ?? []), outcome]);
      const passed = labelled.expect.length === 0 ? outcome.empty : rank === 1 && hit !== false;
      if (!passed) misses.push(`${labelled.category} | ${labelled.query} -> ${JSON.stringify(titles.slice(0, 3))}`);
    }

    const metrics = new Map<string, Metrics>();
    const summarize = (
      outcomes: Array<{ rank: number; sectionHit: boolean | null; empty: boolean }>,
      negative = false,
    ) => {
      const sections = outcomes.filter((outcome) => outcome.sectionHit !== null);
      const share = (predicate: (outcome: (typeof outcomes)[number]) => boolean) =>
        round(outcomes.filter(predicate).length / outcomes.length);
      return {
        queries: outcomes.length,
        recallAt1: negative ? share((outcome) => outcome.empty) : share((outcome) => outcome.rank === 1),
        recallAt5: negative ? share((outcome) => outcome.empty) : share((outcome) => outcome.rank >= 1),
        mrr: negative
          ? share((outcome) => outcome.empty)
          : round(
              outcomes.reduce((sum, outcome) => sum + (outcome.rank > 0 ? 1 / outcome.rank : 0), 0) / outcomes.length,
            ),
        sectionHitAt1:
          sections.length === 0
            ? null
            : round(sections.filter((outcome) => outcome.sectionHit).length / sections.length),
      };
    };
    for (const [category, outcomes] of byCategory) metrics.set(category, summarize(outcomes, category === "no-match"));
    const positives = [...byCategory.entries()]
      .filter(([category]) => category !== "no-match")
      .flatMap(([, value]) => value);
    metrics.set("overall", summarize(positives));

    const reportPath = process.env.WIKI_RETRIEVAL_EVAL_REPORT;
    if (reportPath)
      writeFileSync(reportPath, JSON.stringify({ metrics: Object.fromEntries(metrics), misses }, null, 2));

    for (const [category, target] of Object.entries(RETRIEVAL_TARGETS)) {
      const measured = metrics.get(category);
      expect(measured?.recallAt1, `${category} recall@1; misses: ${misses.join("; ")}`).toBeGreaterThanOrEqual(
        target.recallAt1,
      );
      expect(measured?.recallAt5, `${category} recall@5`).toBeGreaterThanOrEqual(target.recallAt5);
      expect(measured?.mrr, `${category} MRR`).toBeGreaterThanOrEqual(target.mrr);
      if (target.sectionHitAt1 !== undefined)
        expect(measured?.sectionHitAt1, `${category} section-hit@1`).toBeGreaterThanOrEqual(target.sectionHitAt1);
    }
  }, 60_000);
});
