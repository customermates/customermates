import { presetId } from "@/features/records/crm-preset";
import type { RecordScalar } from "@/features/records/record-model.schema";

import { SEED_IDS } from "./context";
import { fixtureId } from "./helpers";
import { type MemberKey, NORTHWIND_STORY_END_MS, northwindAt, northwindDataset } from "./northwind-data";
import { NORTHWIND_MEMBER_IDS, type NorthwindTypeKey } from "./northwind-model";

export const SYNTHETIC_RECORD_EVENT_ID_PREFIX = "3a000000";

const DAY = 86_400_000;
const END = NORTHWIND_STORY_END_MS;

/** The Status fields of deals and tasks (custom-fields.ts ids, repeated here to avoid an import cycle). */
const LEGACY = {
  dealStatus: fixtureId("16000000", 6),
  dealOpen: fixtureId("17000000", 8),
  taskStatus: fixtureId("16000000", 7),
  taskOpen: fixtureId("17000000", 12),
} as const;

export type NorthwindHistoryEntry = {
  id: string;
  typeKey: Exclude<NorthwindTypeKey, "lineItem">;
  recordId: string;
  kind: "record.created" | "record.updated";
  atMs: number;
  actorId: string;
  /** Values before the change (updates) or values that differ at creation; field id to scalar. */
  previous: Array<[fieldId: string, value: RecordScalar]>;
};

/**
 * The record history of the demo: every record's creation at its creation time, and the changes that tell the
 * story (deal stage moves and outcomes, ticket resolutions, health changes, onboarding phases, candidate stages and
 * completed tasks). Actors are the members who own the work.
 */
export function buildNorthwindHistory(companyId: string): NorthwindHistoryEntry[] {
  const data = northwindDataset();
  const id = (key: string) => presetId(companyId, key);
  const select = (value: string): RecordScalar => ({ kind: "select", value });
  const member = (key: MemberKey | null) => NORTHWIND_MEMBER_IDS[key ?? "maxBergmann"];
  const entries: NorthwindHistoryEntry[] = [];
  const created = (
    typeKey: NorthwindHistoryEntry["typeKey"],
    recordId: string,
    atMs: number,
    actor: MemberKey | null,
  ) => entries.push({ id: "", typeKey, recordId, kind: "record.created", atMs, actorId: member(actor), previous: [] });
  const updated = (
    typeKey: NorthwindHistoryEntry["typeKey"],
    recordId: string,
    atMs: number,
    actor: MemberKey | null,
    previous: NorthwindHistoryEntry["previous"],
  ) => entries.push({ id: "", typeKey, recordId, kind: "record.updated", atMs, actorId: member(actor), previous });

  const ownerOf = new Map<number, MemberKey>();
  for (const deal of data.deals) ownerOf.set(deal.organizationIndex, deal.ownerKey);
  for (const organization of data.organizations)
    created("organization", organization.id, organization.createdAtMs, ownerOf.get(organization.index) ?? "sofiaRossi");
  for (const contact of data.contacts)
    created("contact", contact.id, contact.createdAtMs, ownerOf.get(contact.organizationIndex) ?? "sofiaRossi");
  for (const [index] of data.services.entries())
    created("service", fixtureId("90000000", index + 1), END - (540 - index) * DAY, "maxBergmann");
  for (const deal of data.deals) {
    created("deal", deal.id, deal.createdAtMs, deal.ownerKey);
    if (deal.status === "open" && deal.stage !== "new") {
      updated("deal", deal.id, deal.createdAtMs + Math.round((END - deal.createdAtMs) * 0.4), deal.ownerKey, [
        [id("deal.stage"), select(id("deal.stage.new"))],
      ]);
    }
    if (deal.status !== "open") {
      const previous: NorthwindHistoryEntry["previous"] = [[LEGACY.dealStatus, select(LEGACY.dealOpen)]];
      if (deal.previousStage && deal.previousStage !== deal.stage)
        previous.push([id("deal.stage"), select(id(`deal.stage.${deal.previousStage}`))]);
      updated("deal", deal.id, deal.closeAtMs, deal.ownerKey, previous);
    }
  }
  for (const task of data.tasks) {
    created("task", task.id, task.createdAtMs, task.assigneeKey);
    if (task.status === "done" && task.dueMs > task.createdAtMs)
      updated("task", task.id, task.dueMs, task.assigneeKey, [[LEGACY.taskStatus, select(LEGACY.taskOpen)]]);
  }
  for (const subscription of data.subscriptions) {
    created("subscription", subscription.id, subscription.createdAtMs, "elenaHoffmann");
    if (subscription.previousHealth) {
      updated(
        "subscription",
        subscription.id,
        Math.max(subscription.createdAtMs + DAY, END - ((subscription.index % 20) + 1) * DAY),
        "elenaHoffmann",
        [[id("subscription.health"), select(id(`subscription.health.${subscription.previousHealth}`))]],
      );
    }
  }
  for (const onboarding of data.onboardings) {
    created("onboarding", onboarding.id, onboarding.createdAtMs, onboarding.ownerKey);
    if (onboarding.phase !== "kickoff") {
      updated(
        "onboarding",
        onboarding.id,
        onboarding.startMs + Math.round(((onboarding.endMs - onboarding.startMs) * onboarding.progress) / 100),
        onboarding.ownerKey,
        [[id("onboarding.phase"), select(id("onboarding.phase.kickoff"))]],
      );
    }
  }
  for (const ticket of data.tickets) {
    created("ticket", ticket.id, ticket.openedMs, ticket.assigneeKey);
    if (ticket.resolvedMs !== null) {
      updated("ticket", ticket.id, ticket.resolvedMs, ticket.assigneeKey, [
        [id("ticket.status"), select(id("ticket.status.open"))],
      ]);
    }
  }
  for (const campaign of data.campaigns)
    created("campaign", campaign.id, campaign.startMs - 14 * DAY, campaign.ownerKey);
  for (const partner of data.partners) created("partner", partner.id, partner.createdAtMs, "sofiaRossi");
  for (const role of data.openRoles) created("openRole", role.id, role.createdAtMs, "lauraFischer");
  for (const candidate of data.candidates) {
    created("candidate", candidate.id, candidate.appliedMs, "lauraFischer");
    if (candidate.stage !== "applied") {
      updated("candidate", candidate.id, candidate.appliedMs + 2 * DAY, "lauraFischer", [
        [id("candidate.stage"), select(id("candidate.stage.applied"))],
      ]);
    }
  }
  entries.sort((a, b) => a.atMs - b.atMs || (a.kind === b.kind ? 0 : a.kind === "record.created" ? -1 : 1));
  return entries
    .map((entry) => ({ ...entry, atMs: Math.min(entry.atMs, END - 30 * 60_000) }))
    .map((entry, index) => ({ ...entry, id: fixtureId(SYNTHETIC_RECORD_EVENT_ID_PREFIX, index + 1) }));
}

let times: Map<string, number> | undefined;

/** Time of the last history entry of a record (its creation when it never changed). */
export function northwindUpdatedAt(typeKey: string, recordId: string, createdAtMs: number): Date {
  if (!times) {
    times = new Map();
    for (const entry of buildNorthwindHistory(SEED_IDS.company)) {
      times.set(
        `${entry.typeKey}:${entry.recordId}`,
        Math.max(times.get(`${entry.typeKey}:${entry.recordId}`) ?? 0, entry.atMs),
      );
    }
  }
  return northwindAt(Math.max(createdAtMs, times.get(`${typeKey}:${recordId}`) ?? createdAtMs));
}
