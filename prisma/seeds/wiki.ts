import type { Prisma } from "@/generated/prisma";

import { wikiPagePath } from "@/features/wiki/wiki-links";

import type { SeedContext } from "./context";
import { fixtureId, upsertFixturesById } from "./helpers";
import { SYNTHETIC_SEED_TIMELINE } from "./timeline";

const WIKI_FIXTURE_GROUP = "36000000";

export const SYNTHETIC_WIKI_PAGE_IDS = {
  guide: fixtureId(WIKI_FIXTURE_GROUP, 1),
  company: fixtureId(WIKI_FIXTURE_GROUP, 2),
  services: fixtureId(WIKI_FIXTURE_GROUP, 3),
  customers: fixtureId(WIKI_FIXTURE_GROUP, 4),
  voice: fixtureId(WIKI_FIXTURE_GROUP, 5),
  sales: fixtureId(WIKI_FIXTURE_GROUP, 6),
  pricing: fixtureId(WIKI_FIXTURE_GROUP, 7),
  success: fixtureId(WIKI_FIXTURE_GROUP, 8),
  discovery: fixtureId(WIKI_FIXTURE_GROUP, 9),
  proposal: fixtureId(WIKI_FIXTURE_GROUP, 10),
  handover: fixtureId(WIKI_FIXTURE_GROUP, 11),
  support: fixtureId(WIKI_FIXTURE_GROUP, 12),
} as const;

function pageLink(page: keyof typeof SYNTHETIC_WIKI_PAGE_IDS, title: string): string {
  return "[" + title + "](" + wikiPagePath(SYNTHETIC_WIKI_PAGE_IDS[page]) + ")";
}

type WikiPageDefinition = Pick<
  Prisma.WikiPageCreateManyInput,
  "id" | "title" | "kind" | "whenToUse" | "sortOrder" | "markdown"
>;

export const SYNTHETIC_WIKI_PAGE_DEFINITIONS = [
  {
    id: SYNTHETIC_WIKI_PAGE_IDS.guide,
    title: "Operating Guide",
    kind: "guide",
    whenToUse: null,
    sortOrder: -1,
    markdown: [
      "Help this demo consulting team turn customer context into clear, useful next steps. Read the relevant page before making a recommendation.",
      "",
      "## Start with the customer",
      "Understand the business outcome, the people involved and the next decision. Use the current CRM records for names, dates, prices and deal status; these pages explain how the team works.",
      "",
      "## Our working standards",
      "- Write plainly, warmly and confidently. Separate confirmed facts from assumptions.",
      "- Recommend the smallest useful next step. Give each task an owner and a clear outcome.",
      "- Never invent discounts, delivery dates or customer approval. Prepare a draft when a decision needs a person.",
      "- These are fictional demo policies, not Customermates product terms or customer commitments.",
      "",
      "## Find the right context",
      "- " + pageLink("company", "Company Overview") + " and " + pageLink("customers", "Ideal Customers"),
      "- " + pageLink("services", "Services & Solutions") + " and " + pageLink("pricing", "Pricing & Scope"),
      "- " + pageLink("voice", "Voice & Tone") + " and " + pageLink("sales", "Sales Playbook"),
      "",
      "## Follow the matching procedure",
      "Use " +
        pageLink("discovery", "Discovery Call") +
        " to qualify a new opportunity, then " +
        pageLink("proposal", "Proposal Review") +
        " before preparing an offer.",
      "After a win, use " +
        pageLink("handover", "Client Handover") +
        ". For a delivery issue, use " +
        pageLink("support", "Support Escalation") +
        ".",
    ].join("\n"),
  },
  {
    id: SYNTHETIC_WIKI_PAGE_IDS.company,
    title: "Company Overview",
    kind: "knowledge",
    whenToUse: null,
    sortOrder: 0,
    markdown: [
      "We help growing and enterprise teams modernize the systems behind their customer relationships, operations and reporting.",
      "",
      "## What we do",
      "Our sample business combines technology consulting with hands-on delivery: CRM rollouts, process automation, data platforms, integrations, cloud infrastructure and workplace hardware.",
      "",
      "## How we work",
      "- **Discover:** agree on the business problem and what success looks like.",
      "- **Design:** make dependencies, scope and responsibilities visible.",
      "- **Deliver:** work in manageable milestones with regular customer reviews.",
      "- **Enable:** leave the customer with trained users, clear documentation and a support handover.",
      "",
      "## Meet the team",
      "**Max Bergmann** coordinates commercial decisions and the workspace. **Sofia Rossi** leads opportunity qualification and proposals. **Elena Hoffmann** coordinates customer success and delivery handovers.",
      "",
      "## Explore the workspace",
      "The CRM contains illustrative organizations, contacts, opportunities and service lines. These are demo scenarios; they do not establish real customer relationships or endorsements.",
      "",
      "Start with " +
        pageLink("services", "Services & Solutions") +
        " for the portfolio or " +
        pageLink("customers", "Ideal Customers") +
        " for the problems we solve.",
    ].join("\n"),
  },
  {
    id: SYNTHETIC_WIKI_PAGE_IDS.services,
    title: "Services & Solutions",
    kind: "knowledge",
    whenToUse: null,
    sortOrder: 1,
    markdown: [
      "Build the recommendation around the customer's outcome, then choose the service lines that make that outcome possible.",
      "",
      "## Customer systems",
      "CRM Setup & Configuration, Custom Integrations, System Integrations and User Training Session help teams replace fragmented handoffs with a shared customer workflow.",
      "",
      "## Data and automation",
      "Data Strategy Definition, Data Warehouse Implementation, Reporting & Dashboards and Automation Development turn scattered information into useful decisions and repeatable work.",
      "",
      "## Platforms and infrastructure",
      "Cloud Readiness Assessment, Infrastructure Migration, Network Architecture Design and Security Review & Hardening establish a reliable foundation for growth.",
      "",
      "## Adoption and continuity",
      "Change Management Support, Admin Training, Go-Live Support and Documentation & Knowledge Transfer help customers sustain the improvement after launch.",
      "",
      "## Example opportunities",
      "- [CRM Rollout & Sales Enablement](/deals/" +
        fixtureId("80000000", 3) +
        "): connect setup, integrations and training.",
      "- [Data & Analytics Transformation](/deals/" +
        fixtureId("80000000", 2) +
        "): connect strategy, warehouse delivery and reporting.",
      "- [Workplace Hardware Rollout](/deals/" +
        fixtureId("80000000", 5) +
        "): connect equipment, provisioning and installation.",
      "",
      "Use the live [service catalog](/services) for amounts and " +
        pageLink("pricing", "Pricing & Scope") +
        " for commercial guidance.",
    ].join("\n"),
  },
  {
    id: SYNTHETIC_WIKI_PAGE_IDS.customers,
    title: "Ideal Customers",
    kind: "knowledge",
    whenToUse: null,
    sortOrder: 2,
    markdown: [
      "Our strongest fit is a team with a concrete operational problem, a responsible sponsor and the capacity to adopt a better way of working.",
      "",
      "## Signals of a good fit",
      "- Customer information is spread across tools and important handoffs depend on individuals.",
      "- Reporting takes manual work and teams disagree about which numbers to trust.",
      "- Growth, a migration or a new platform has made existing processes difficult to maintain.",
      "- A sponsor can describe the outcome and involve the people who will use the solution.",
      "",
      "## The buying group",
      "Operations and business leaders define the outcome. IT validates integration, security and maintainability. Procurement and finance clarify the commercial process. End users show where the current workflow breaks down.",
      "",
      "## Questions that uncover the real problem",
      "What happens today? Where does the process slow down? What does that cost the team? What would a useful first improvement look like?",
      "",
      "## When to slow down",
      "A missing sponsor, unclear outcome or untested deadline is a gap to resolve. It is not a reason to manufacture urgency or promise a solution before discovery.",
      "",
      "Use " + pageLink("discovery", "Discovery Call") + " to turn these signals into an actionable opportunity.",
    ].join("\n"),
  },
  {
    id: SYNTHETIC_WIKI_PAGE_IDS.voice,
    title: "Voice & Tone",
    kind: "knowledge",
    whenToUse: null,
    sortOrder: 3,
    markdown: [
      "Sound like a thoughtful colleague: clear about the work, interested in the customer's situation and honest about what is still unknown.",
      "",
      "## Four principles",
      "- **Clear:** use everyday language, concrete examples and short paragraphs.",
      "- **Useful:** explain the outcome before the technology.",
      "- **Confident:** recommend a next step and explain why it helps.",
      "- **Honest:** label estimates, assumptions and questions that need confirmation.",
      "",
      "## Say it this way",
      "| Prefer | Avoid |",
      "| --- | --- |",
      "| A shared view of customers and next steps | A revolutionary end-to-end ecosystem |",
      "| We can confirm the timeline after discovery | We guarantee a rapid transformation |",
      "| Here is the decision we need from you | Just checking in |",
      "",
      "## Adapt to the moment",
      "First contact should be brief and specific. A proposal should be structured and precise. A support update should be calm, accountable and clear about the next update.",
      "",
      "Use the customer's language and terminology where they are known. Avoid exaggerated claims, unsupported numbers, unnecessary emojis and pressure tactics.",
      "",
      "For the structure of a follow-up, read " + pageLink("sales", "Sales Playbook") + ".",
    ].join("\n"),
  },
  {
    id: SYNTHETIC_WIKI_PAGE_IDS.sales,
    title: "Sales Playbook",
    kind: "knowledge",
    whenToUse: null,
    sortOrder: 4,
    markdown: [
      "Help the customer make the next useful decision. Keep the opportunity grounded in evidence, a named owner and an agreed next step.",
      "",
      "## Prepare before asking",
      "Read the linked organization, contacts, deal notes and relevant Knowledge Base pages. Ask about meaningful gaps; do not make the customer repeat information already available.",
      "",
      "## Move the opportunity forward",
      "- Agree on the problem and desired outcome.",
      "- Identify the sponsor, users and commercial decision process.",
      "- Confirm scope, dependencies and timing before proposing delivery.",
      "- Record the next action as a task with an owner and due date.",
      "",
      "## Write a useful follow-up",
      "Start with the customer's goal. Summarize the decision or open question. Offer one concrete next step. Close with the information needed to move forward.",
      "",
      "**Example:** Thank you for outlining the reporting bottleneck. The first useful step is to map the source systems and agree on the two reports your team needs most. Would a short working session with your operations and IT leads fit next week?",
      "",
      "## Keep the CRM honest",
      "Deal status, service amounts and linked records come from the CRM. Do not infer approval from a positive email or change a forecast to make the pipeline look healthier.",
      "",
      "Follow " +
        pageLink("discovery", "Discovery Call") +
        " for qualification and " +
        pageLink("proposal", "Proposal Review") +
        " before making a commercial commitment.",
    ].join("\n"),
  },
  {
    id: SYNTHETIC_WIKI_PAGE_IDS.pricing,
    title: "Pricing & Scope",
    kind: "knowledge",
    whenToUse: null,
    sortOrder: 5,
    markdown: [
      "A useful proposal makes the outcome, included work and assumptions easy to understand. These are illustrative consulting guidelines, not Customermates subscription prices.",
      "",
      "## Build from the catalog",
      "Use current [service records](/services) and the quantities on the specific deal. A catalog amount is not a customer-approved quote, and a service record does not hold that deal's quantity.",
      "",
      "| Work | What to confirm |",
      "| --- | --- |",
      "| Discovery and consulting | Questions, participants and the expected deliverable |",
      "| Implementation | Included systems, milestones, acceptance criteria and dependencies |",
      "| Hardware | Model, quantity, provisioning, installation and warranty scope |",
      "| Adoption and support | Audience, handover, training and the agreed support arrangement |",
      "",
      "## Make boundaries visible",
      "List what is included, what is excluded and what the customer must provide. Separate an estimate from a commitment. Confirm currency, taxes and payment terms instead of assuming them.",
      "",
      "## Changes and exceptions",
      "Document a scope change and its delivery impact before revising the proposal. Discounts, contract exceptions and delivery commitments need human commercial review; no percentage or default approval threshold is defined here.",
      "",
      "Use " +
        pageLink("proposal", "Proposal Review") +
        " to prepare the decision without promising terms that have not been agreed.",
    ].join("\n"),
  },
  {
    id: SYNTHETIC_WIKI_PAGE_IDS.success,
    title: "Client Success",
    kind: "knowledge",
    whenToUse: null,
    sortOrder: 6,
    markdown: [
      "A project succeeds when the customer can use the improvement confidently and the next owner knows what happens after delivery.",
      "",
      "## Define success together",
      "Capture the business outcome, baseline, acceptance criteria and the person who confirms completion. Use the customer's measures rather than inventing a target.",
      "",
      "## Keep momentum visible",
      "Track the next milestone, open decisions, dependencies and risks. A concise update should say what changed, what happens next and where the customer needs to act.",
      "",
      "## Prepare adoption",
      "Plan User Training Session, Admin Training and Documentation & Knowledge Transfer where relevant. Identify who owns the system and who supports users after launch.",
      "",
      "## Close the loop",
      "Confirm the acceptance decision, hand over the agreed documents and record outstanding work as owned tasks. Capture feedback and improvement opportunities without treating them as approved new scope.",
      "",
      "Use " +
        pageLink("handover", "Client Handover") +
        " after a win and " +
        pageLink("support", "Support Escalation") +
        " when delivery needs attention.",
    ].join("\n"),
  },
  {
    id: SYNTHETIC_WIKI_PAGE_IDS.discovery,
    title: "Discovery Call",
    kind: "procedure",
    whenToUse: "When preparing or summarizing a first discovery call for a new consulting opportunity.",
    sortOrder: 7,
    markdown: [
      "Turn an initial conversation into a clear problem statement and a useful next step, without repeating questions the CRM already answers.",
      "",
      "## Prepare",
      "Read the organization, linked contacts and deal notes. Review " +
        pageLink("customers", "Ideal Customers") +
        " and the relevant " +
        pageLink("services", "Services & Solutions") +
        ".",
      "",
      "## Run the conversation",
      "1. Confirm what prompted the conversation and the outcome the customer wants.",
      "2. Map the current process, involved systems and the people affected.",
      "3. Clarify the sponsor, decision process, timing and important constraints.",
      "4. Reflect the problem back in the customer's words and separate facts from assumptions.",
      "5. Agree on one next step, its owner and what each side needs to prepare.",
      "",
      "## Record the outcome",
      "Append a concise discovery summary to the deal and create the agreed follow-up task. Keep unknown budget, procurement or technical details as open questions.",
      "",
      "## Ready to move on",
      "The next owner can explain the problem, the customer outcome, the decision process and the next action. If one is missing, prepare a focused question instead of a premature proposal.",
    ].join("\n"),
  },
  {
    id: SYNTHETIC_WIKI_PAGE_IDS.proposal,
    title: "Proposal Review",
    kind: "procedure",
    whenToUse: "When preparing a proposal, checking its scope or requesting approval for commercial terms.",
    sortOrder: 8,
    markdown: [
      "Prepare an offer a customer can evaluate and a delivery team can stand behind. A draft is ready for review when its assumptions and open decisions are visible.",
      "",
      "## Review the offer",
      "1. Read the current deal, service lines, customer notes and " + pageLink("pricing", "Pricing & Scope") + ".",
      "2. State the business outcome, included deliverables and acceptance criteria.",
      "3. Check amounts and quantities against the actual deal. Explain the basis of any estimate.",
      "4. List exclusions, customer responsibilities, dependencies and unresolved terms.",
      "5. Ask the commercial owner to review discounts, contract exceptions and delivery commitments.",
      "6. Prepare a concise customer message using " +
        pageLink("voice", "Voice & Tone") +
        "; obtain the required sending approval before delivery.",
      "",
      "## Before handover",
      "Record the customer's decision and the agreed scope. A positive reply alone does not establish a signed agreement or authority to start work.",
      "",
      "After a confirmed win, continue with " + pageLink("handover", "Client Handover") + ".",
    ].join("\n"),
  },
  {
    id: SYNTHETIC_WIKI_PAGE_IDS.handover,
    title: "Client Handover",
    kind: "procedure",
    whenToUse: "When a consulting opportunity is won and its agreed scope must be handed from sales to delivery.",
    sortOrder: 9,
    markdown: [
      "Give delivery the context needed to start confidently. A good handover connects the customer's goal with the agreed work, owners and first milestone.",
      "",
      "## Handover checklist",
      "1. Read the won deal and confirm the agreement, scope and linked organization.",
      "2. Identify the customer sponsor, day-to-day contact, commercial owner and delivery owner.",
      "3. Summarize outcomes, service lines, assumptions, exclusions and acceptance criteria.",
      "4. Create owned tasks for the kickoff, access prerequisites and first customer review.",
      "5. Make dependencies, open decisions and risks visible; do not hide them in a general note.",
      "6. Ask delivery to acknowledge the handover and confirm the next customer communication.",
      "",
      "## Example in this workspace",
      "For [CRM Rollout & Sales Enablement](/deals/" +
        fixtureId("80000000", 3) +
        "), connect CRM configuration and integration work with the training and adoption plan. Verify its current status before treating it as a won project.",
      "",
      "## What good looks like",
      "Every first milestone has an owner. The customer knows who to contact. Delivery can explain what is included and where confirmation is still needed.",
      "",
      "See " + pageLink("success", "Client Success") + " for the ongoing review rhythm.",
    ].join("\n"),
  },
  {
    id: SYNTHETIC_WIKI_PAGE_IDS.support,
    title: "Support Escalation",
    kind: "procedure",
    whenToUse:
      "When a customer reports a delivery issue, blocked milestone or incident that needs coordinated follow-up.",
    sortOrder: 10,
    markdown: [
      "Make the issue understandable, assign its next action and keep the customer informed. Avoid promising a resolution time before the delivery owner has assessed the evidence.",
      "",
      "## Triage and follow through",
      "1. Read the customer message, linked organization, active project and recent notes.",
      "2. Record the observed problem, affected people or systems, business impact and when it began.",
      "3. Separate a reproducible symptom from an assumption; capture the steps or evidence needed to investigate.",
      "4. Assign an investigation task to the agreed delivery owner. Ask for an owner if none is recorded.",
      "5. Prepare an acknowledgment with the issue summary, next action and agreed update time.",
      "6. Obtain sending approval, then keep the task and customer update aligned as new evidence arrives.",
      "",
      "## Commercial or sensitive decisions",
      "Refunds, contract changes and security-sensitive disclosures need the appropriate human decision. Do not invent an approver, an SLA or a customer entitlement.",
      "",
      "Use " +
        pageLink("voice", "Voice & Tone") +
        " for a calm update and " +
        pageLink("success", "Client Success") +
        " to confirm the issue is resolved from the customer's perspective.",
    ].join("\n"),
  },
] satisfies readonly WikiPageDefinition[];

export async function seedWikiPages(context: SeedContext): Promise<void> {
  await context.prisma.$transaction(async (prisma) => {
    await prisma.wikiPage.deleteMany({
      where: {
        companyId: context.ids.company,
        id: { startsWith: WIKI_FIXTURE_GROUP + "-", notIn: SYNTHETIC_WIKI_PAGE_DEFINITIONS.map(({ id }) => id) },
      },
    });
    const existingGuide = await prisma.wikiPage.findFirst({
      where: { companyId: context.ids.company, kind: "guide", id: { not: SYNTHETIC_WIKI_PAGE_IDS.guide } },
      select: { id: true },
    });
    const definitions = SYNTHETIC_WIKI_PAGE_DEFINITIONS.filter(({ kind }) => !existingGuide || kind !== "guide");
    if (existingGuide) {
      await prisma.wikiPage.deleteMany({
        where: { id: SYNTHETIC_WIKI_PAGE_IDS.guide, companyId: context.ids.company },
      });
    }

    const pages = definitions.map((definition) => ({
      ...definition,
      companyId: context.ids.company,
      ...SYNTHETIC_SEED_TIMELINE.company,
    }));
    await upsertFixturesById(pages, async (page) => {
      const updated = await prisma.wikiPage.updateMany({
        where: { id: page.id, companyId: context.ids.company },
        data: page,
      });
      if (updated.count === 0) await prisma.wikiPage.create({ data: page });
    });
  });
}
