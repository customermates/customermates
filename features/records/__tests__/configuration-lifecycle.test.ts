import type { ConfigurationTarget } from "../configuration.schema";
import type { RecordModel } from "../record-model.schema";

import { describe, expect, it } from "vitest";

import { applyConfigurationLifecycle, targetKey, type ConfigurationDeletionRecord } from "../configuration-lifecycle";
import { createCrmPreset, presetId } from "../crm-preset";

const COMPANY_ID = "configuration-lifecycle";
const id = (key: string) => presetId(COMPANY_ID, key);

const PREVIOUS_RELEASE_DELETION_KEYS = ["target", "cascade", "nameField", "bindings", "droppedViewReferences"];

function archivedPaths(model: RecordModel): Record<string, boolean> {
  return Object.fromEntries(
    model.types.flatMap((type) => (type.relationshipPaths ?? []).map((path) => [path.id, path.archived])),
  );
}

function deleteTarget(model: RecordModel, target: ConfigurationTarget) {
  const { deletions } = applyConfigurationLifecycle(model, [{ operation: "delete", target }], new Map());
  return deletions;
}

function restoreTarget(model: RecordModel, target: ConfigurationTarget, deletions: ReturnType<typeof deleteTarget>) {
  const records = new Map<string, ConfigurationDeletionRecord>(
    deletions.map((deletion) => [targetKey(deletion.target), { ...deletion, actorId: "user", deletedAt: new Date() }]),
  );
  return applyConfigurationLifecycle(model, [{ operation: "restore", target }], records);
}

describe("relationship paths of configuration in Trash", () => {
  it("keeps the paths a deleted relationship breaks archived on their lists, so the previous release reads the deletion", () => {
    const model = createCrmPreset(COMPANY_ID);
    const relationship: ConfigurationTarget = { kind: "relationship", id: id("lineItem.service") };

    const deletions = deleteTarget(model, relationship);

    expect(
      deletions
        .flatMap((deletion) => Object.keys(deletion))
        .filter((key) => !PREVIOUS_RELEASE_DELETION_KEYS.includes(key)),
    ).toEqual([]);
    expect(archivedPaths(model)).toEqual({ [id("deal.services.path")]: true, [id("service.deals.path")]: true });

    restoreTarget(model, relationship, deletions);

    expect(archivedPaths(model)).toEqual({ [id("deal.services.path")]: false, [id("service.deals.path")]: false });
  });

  it("brings an archived path back only once every relationship it crosses is back", () => {
    const model = createCrmPreset(COMPANY_ID);
    const services: ConfigurationTarget = { kind: "relationship", id: id("lineItem.service") };
    const deals: ConfigurationTarget = { kind: "relationship", id: id("lineItem.deal") };
    const servicesDeletion = deleteTarget(model, services);
    const dealsDeletion = deleteTarget(model, deals);

    restoreTarget(model, services, servicesDeletion);
    expect(archivedPaths(model)).toEqual({ [id("deal.services.path")]: true, [id("service.deals.path")]: true });

    restoreTarget(model, deals, dealsDeletion);
    expect(archivedPaths(model)).toEqual({ [id("deal.services.path")]: false, [id("service.deals.path")]: false });
  });
});
