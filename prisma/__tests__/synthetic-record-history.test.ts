import { describe, expect, it } from "vitest";

import { SEED_IDS, type SeedContext } from "../seeds/context";
import { seedContacts } from "../seeds/contacts";
import { seedDeals } from "../seeds/deals";
import { seedOrganizations } from "../seeds/organizations";
import {
  buildSyntheticRecordHistory,
  SYNTHETIC_RECENT_TASK_HISTORY_OFFSETS_MINUTES,
  SYNTHETIC_RECORD_EVENT_ID_PREFIX,
  type SyntheticHistoryEntry,
} from "../seeds/record-history";
import { seedServices } from "../seeds/services";
import { seedTasks } from "../seeds/tasks";
import {
  SYNTHETIC_CONTACT_UPDATE_INDEXES,
  SYNTHETIC_DEAL_UPDATE_INDEXES,
  SYNTHETIC_ORGANIZATION_UPDATE_INDEXES,
  SYNTHETIC_TASK_UPDATE_INDEXES,
  SYNTHETIC_TIMELINE_SHIFT_MS,
} from "../seeds/timeline";

const messagingSyncAt = new Date(Date.parse("2026-08-06T00:00:00.000Z") + SYNTHETIC_TIMELINE_SHIFT_MS);
const taskActorIds = [SEED_IDS.user, SEED_IDS.sofiaRossiUser, SEED_IDS.elenaHoffmannUser];

async function history() {
  const context = { ids: SEED_IDS } as SeedContext;
  const organizations = await seedOrganizations(context);
  const contacts = await seedContacts(context, organizations.organizations);
  const services = await seedServices(context);
  const deals = await seedDeals(context, services);
  const tasks = await seedTasks(context);
  const entities = { ...organizations, ...contacts, ...services, ...deals, ...tasks };
  const entries = buildSyntheticRecordHistory({
    entities,
    primaryUserId: SEED_IDS.user,
    taskActorIds,
    messagingSyncAt,
  });
  return { entities, entries };
}

function entryFor(entries: SyntheticHistoryEntry[], kind: SyntheticHistoryEntry["kind"], recordId: string) {
  const entry = entries.find((candidate) => candidate.kind === kind && candidate.recordId === recordId);
  if (!entry) throw new Error(`Missing ${kind} history for ${recordId}`);
  return entry;
}

describe("synthetic record history", () => {
  it("creates every record once and updates the renamed ones afterwards", async () => {
    const { entities, entries } = await history();
    const records = [
      ...entities.organizations,
      ...entities.contacts,
      ...entities.services,
      ...entities.deals,
      ...entities.tasks,
    ];
    const updates =
      SYNTHETIC_ORGANIZATION_UPDATE_INDEXES.length +
      SYNTHETIC_CONTACT_UPDATE_INDEXES.length +
      SYNTHETIC_DEAL_UPDATE_INDEXES.length +
      SYNTHETIC_TASK_UPDATE_INDEXES.length;

    expect(entries.filter(({ kind }) => kind === "record.created")).toHaveLength(records.length);
    expect(entries.filter(({ kind }) => kind === "record.updated")).toHaveLength(updates);
    expect(new Set(entries.map(({ id }) => id))).toHaveLength(entries.length);
    expect(entries.every(({ id }) => id.startsWith(`${SYNTHETIC_RECORD_EVENT_ID_PREFIX}-`))).toBe(true);
    expect((await history()).entries).toEqual(entries);

    for (const update of entries.filter(({ kind }) => kind === "record.updated")) {
      const creation = entryFor(entries, "record.created", update.recordId);
      expect(update.at.getTime()).toBeGreaterThan(creation.at.getTime());
      expect(update.previous).toHaveLength(1);
      expect(creation.previous).toEqual(update.previous);
    }
  });

  it("spreads the history across nearly a full year before the messaging window", async () => {
    const { entries } = await history();
    const timestamps = entries.map(({ at }) => at.getTime());
    const reference = messagingSyncAt.getTime();
    const coveredMonths = new Set(entries.map(({ at }) => `${at.getUTCFullYear()}-${at.getUTCMonth()}`));

    expect(Math.min(...timestamps)).toBeGreaterThanOrEqual(reference - 365 * 24 * 60 * 60_000);
    expect(Math.max(...timestamps)).toBeLessThan(reference);
    expect(coveredMonths.size).toBeGreaterThanOrEqual(10);
  });

  it("rotates task actors across the team and keeps recent task changes beside the messaging window", async () => {
    const { entities, entries } = await history();

    for (const [index, task] of entities.tasks.entries())
      expect(entryFor(entries, "record.created", task.id).actorId).toBe(taskActorIds[index % taskActorIds.length]);
    for (const index of SYNTHETIC_TASK_UPDATE_INDEXES) {
      expect(entryFor(entries, "record.updated", entities.tasks[index].id).actorId).toBe(
        taskActorIds[index % taskActorIds.length],
      );
    }
    for (const [index, offset] of SYNTHETIC_RECENT_TASK_HISTORY_OFFSETS_MINUTES.created) {
      expect(entryFor(entries, "record.created", entities.tasks[index].id).at).toEqual(
        new Date(messagingSyncAt.getTime() - offset * 60_000),
      );
    }
    for (const [index, offset] of SYNTHETIC_RECENT_TASK_HISTORY_OFFSETS_MINUTES.updated) {
      expect(entryFor(entries, "record.updated", entities.tasks[index].id).at).toEqual(
        new Date(messagingSyncAt.getTime() - offset * 60_000),
      );
    }
    expect(entries.filter(({ type }) => type !== "task").every(({ actorId }) => actorId === SEED_IDS.user)).toBe(true);
  });
});
