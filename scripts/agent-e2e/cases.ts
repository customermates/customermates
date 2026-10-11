import type { PrismaClient } from "@/generated/prisma";
import type { AppLocale } from "@/i18n/locale-registry";
import type { Fixture } from "./fixture";

import { ROUTINE, SEEDED_ORGANIZATIONS, WIKI_FACT } from "./fixture";
import { e2eRecordSnapshot } from "./record-fixtures";

export type TurnObservation = {
  conversationId: string | null;
  reply: string;
  toolNames: readonly string[];
  approvalsRequested: number;
  terminalCode: string | null;
};

export type CaseVerdict = { pass: boolean; reason: string };

export type CaseContext = { prisma: PrismaClient; fixture: Fixture };

export type AgentE2eCase = {
  id: string;
  prompt: string;
  locale: AppLocale;
  pageRoute: string;
  approval: "approve" | "reject";
  acceptedTerminalCodes?: readonly string[];
  check: (observation: TurnObservation, context: CaseContext) => Promise<CaseVerdict>;
};

const ROUTINE_TERMINAL = new Set(["succeeded", "partial", "failed", "skipped", "blocked"]);
const ROUTINE_WAIT_MS = 240_000;
const GERMAN_WORDS = ["und", "der", "die", "das", "ist", "sind", "wir", "haben", "gibt", "es", "im", "mit", "nicht", "eine", "ein", "derzeit", "aktuell", "insgesamt", "organisationen"];
const ENGLISH_WORDS = ["the", "and", "is", "are", "we", "have", "there", "currently", "total", "organizations", "with"];

const pass = (reason: string): CaseVerdict => ({ pass: true, reason });
const fail = (reason: string): CaseVerdict => ({ pass: false, reason });

function words(text: string) {
  return text.toLocaleLowerCase().match(/\p{L}+/gu) ?? [];
}

export function mentionsNumber(text: string, value: number, spelled: readonly string[]) {
  const digits = new RegExp(`(^|[^\\d.,])${value}([^\\d.,]|$)`);
  return digits.test(text) || words(text).some((word) => spelled.includes(word));
}

export function looksGerman(text: string) {
  const tokens = words(text);
  const german = tokens.filter((word) => GERMAN_WORDS.includes(word)).length;
  const english = tokens.filter((word) => ENGLISH_WORDS.includes(word)).length;
  return german >= 2 && german > english;
}

export function containsPhoneNumber(text: string) {
  return /\+?\d[\d\s()./-]{6,}\d/.test(text);
}

export function linksWikiPage(text: string, pageId: string) {
  return new RegExp(`wiki\\?page=${pageId}`, "i").test(text);
}

export function linksDocsPage(text: string) {
  return /(https?:\/\/[^\s)]+)?\/(?:[a-z]{2}\/)?docs\/[a-z0-9-]+/i.test(text);
}

function records(context: CaseContext) {
  return e2eRecordSnapshot(context.prisma, context.fixture.companyId);
}

async function stageOf(context: CaseContext, dealId: string) {
  const snapshot = await records(context);
  const value = snapshot.customFieldValue.find(
    (row) => row.recordId === dealId && row.columnId === context.fixture.stageColumnId,
  );
  return value?.value ?? null;
}

async function waitForRoutineRun(context: CaseContext) {
  const deadline = Date.now() + ROUTINE_WAIT_MS;
  for (;;) {
    const run = await context.prisma.routineRun.findFirst({
      where: { companyId: context.fixture.companyId, routineId: context.fixture.routineId },
      orderBy: { createdAt: "desc" },
      include: { conversation: { select: { creditCeilingMicrocents: true } } },
    });
    if ((run && ROUTINE_TERMINAL.has(run.status)) || Date.now() > deadline) return run;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 2_000));
  }
}

export const AGENT_E2E_CASES: readonly AgentE2eCase[] = [
  {
    id: "create-contact",
    prompt: "Create a contact named Jonas Becker with the email jonas.becker@example.com.",
    locale: "en",
    pageRoute: "/en/contacts",
    approval: "approve",
    async check(_observation, context) {
      const snapshot = await records(context);
      const contacts = snapshot.contact.filter((row) => row.firstName === "Jonas" && row.lastName === "Becker");
      if (contacts.length !== 1) return fail(`expected one Jonas Becker, found ${contacts.length}`);
      const emails = snapshot.contactIdentifier.filter(
        (row) => row.contactId === contacts[0].id && row.channelClass === "email",
      );
      if (!emails.some((email) => email.value.toLowerCase() === "jonas.becker@example.com"))
        return fail(`email identifiers are ${JSON.stringify(emails.map((email) => email.value))}`);
      return pass("contact row and email stored");
    },
  },
  {
    id: "update-deal-stage",
    prompt: 'Move the deal "Brightwave platform rollout" to the Won stage.',
    locale: "en",
    pageRoute: "/en/deals",
    approval: "approve",
    async check(_observation, context) {
      const { dealIds, stageOptionIds } = context.fixture;
      const moved = await stageOf(context, dealIds["brightwave-rollout"]);
      if (moved !== stageOptionIds.Won) return fail("the deal is not in the Won stage");
      if ((await stageOf(context, dealIds["brightwave-training"])) !== stageOptionIds.Proposal)
        return fail("a neighbouring deal changed stage");
      return pass("stage set to Won, neighbour unchanged");
    },
  },
  {
    id: "count-filter",
    prompt: "How many deals are in the Negotiation stage right now? Reply with the number.",
    locale: "en",
    pageRoute: "/en/deals",
    approval: "reject",
    async check(observation) {
      return mentionsNumber(observation.reply, 4, ["four"])
        ? pass("reply states 4")
        : fail(`reply does not state 4: ${observation.reply.slice(0, 120)}`);
    },
  },
  {
    id: "knowledge-base",
    prompt: "Who has to approve a refund above EUR 2,500? Answer from our Knowledge Base and link the page you used.",
    locale: "en",
    pageRoute: "/en/wiki",
    approval: "reject",
    async check(observation, context) {
      if (!observation.reply.includes(WIKI_FACT.approver.split(" ")[1])) return fail("approver missing from reply");
      if (!linksWikiPage(observation.reply, context.fixture.wikiPageId)) return fail("no link to the Knowledge Base page");
      return pass("approver named with a page link");
    },
  },
  {
    id: "docs-link",
    prompt: "How do I create an API key for the Customermates REST API? Link the documentation page.",
    locale: "en",
    pageRoute: "/en/contacts",
    approval: "reject",
    async check(observation) {
      if (!linksDocsPage(observation.reply)) return fail("no documentation link in reply");
      if (!/api[ -]?key/i.test(observation.reply)) return fail("reply does not mention API keys");
      return pass("answer with a docs link");
    },
  },
  {
    id: "delete-declined",
    prompt: "Delete the contact Lukas Brandt.",
    locale: "en",
    pageRoute: "/en/contacts",
    approval: "reject",
    acceptedTerminalCodes: ["completed", "cancelled", "partial"],
    async check(observation, context) {
      const exists = (await records(context)).contact.some((row) => row.id === context.fixture.contactIds.lukas);
      if (!exists) return fail("the contact was deleted");
      if (observation.approvalsRequested < 1) return fail("no approval card was requested");
      return pass("stopped at the approval card; declined, nothing deleted");
    },
  },
  {
    id: "routine-run",
    prompt: `Run my routine "${ROUTINE.name}" now.`,
    locale: "en",
    pageRoute: "/en/routines",
    approval: "approve",
    async check(_observation, context) {
      const run = await waitForRoutineRun(context);
      if (!run) return fail("no routine run was started");
      if (run.status !== "succeeded") return fail(`routine run ended ${run.status}${run.error ? `: ${run.error}` : ""}`);
      const ceiling = run.conversation?.creditCeilingMicrocents ?? null;
      if (ceiling === null) return fail("the routine conversation has no credit ceiling");
      if (run.chargedMicrocents > ceiling) return fail(`charged ${run.chargedMicrocents} above ceiling ${ceiling}`);
      return pass(`succeeded, charged ${run.chargedMicrocents} of ${ceiling} microcents`);
    },
  },
  {
    id: "no-invented-data",
    prompt: "What is Maria Okafor's phone number?",
    locale: "en",
    pageRoute: "/en/contacts",
    approval: "reject",
    async check(observation, context) {
      if (observation.toolNames.some((name) => name.includes("web"))) return fail("searched the web");
      if (containsPhoneNumber(observation.reply)) return fail(`reply contains a phone number: ${observation.reply.slice(0, 120)}`);
      const contactId = context.fixture.contactIds.maria;
      const snapshot = await records(context);
      const phones = snapshot.customFieldValue.filter((row) => row.columnId === context.fixture.phoneColumnId).length;
      const identifiers = snapshot.contactIdentifier.filter((row) => row.contactId === contactId).length;
      if (phones || identifiers !== 1) return fail("a phone value or identifier was written");
      return pass("no phone number invented");
    },
  },
  {
    id: "german",
    prompt: "Wie viele Organisationen haben wir im CRM?",
    locale: "de",
    pageRoute: "/de/organizations",
    approval: "reject",
    async check(observation) {
      if (!looksGerman(observation.reply)) return fail(`reply is not German: ${observation.reply.slice(0, 120)}`);
      if (!mentionsNumber(observation.reply, SEEDED_ORGANIZATIONS.length, ["drei"])) return fail("reply does not state 3");
      return pass("German reply stating 3");
    },
  },
];
