import { describe, expect, it } from "vitest";
import { createCrmPreset, presetId } from "../crm-preset";
import { RecordCapabilitySchema } from "../record-model.schema";
import { readRecordModelSnapshot } from "../record-model-snapshot";
import { validateRecordModel } from "../record-model-validation";
import { recordChannelsEnabled } from "../record-channels";
import { createRecordStagingRepo } from "../record-staging.repository";
import { identityKeys } from "../record-identity";
import type { RecordIdentity } from "../record-identity.schema";
import type { RecordRepo } from "../record.repo";

const companyId = "73000000-0000-4000-8000-000000000001";
const operationId = "73000000-0000-4000-8000-000000000002";

describe("configurable Channels capability", () => {
  it("decodes historical person bindings without accepting the retired kind as a configuration input", () => {
    const model = createCrmPreset(companyId);
    const current = model.capabilities.find((binding) => binding.kind === "channels");
    if (!current) throw new Error("Missing Channels preset");
    const legacy = { ...current, kind: "personIdentity" };
    delete legacy.enabled;
    delete legacy.providerAvatar;
    const snapshot = {
      ...model,
      capabilities: [legacy, ...model.capabilities.filter((binding) => binding.id !== current.id)],
    };
    const restored = readRecordModelSnapshot(snapshot);
    expect(restored.capabilities.find((binding) => binding.id === current.id)).toEqual({ ...current, enabled: true });
    expect(snapshot.capabilities[0].kind).toBe("personIdentity");
    expect(RecordCapabilitySchema.safeParse(legacy).success).toBe(false);
  });

  it("enables arbitrary types, retains disabled definitions, and prevents duplicate bindings", () => {
    const model = createCrmPreset(companyId);
    const typeId = presetId(companyId, "organization");
    const binding = { id: operationId, kind: "channels" as const, typeId, fields: [], enabled: true };
    model.capabilities.push(binding);
    expect(recordChannelsEnabled(model, typeId)).toBe(true);
    expect(validateRecordModel(model).issues).toEqual([]);
    binding.enabled = false;
    expect(recordChannelsEnabled(model, typeId)).toBe(false);
    expect(validateRecordModel(model).issues).toEqual([]);
    const type = model.types.find((type) => type.id === typeId);
    if (!type) throw new Error("Missing channel type");
    type.archived = true;
    expect(validateRecordModel(model).issues).not.toContainEqual({ code: "capability_requires_type", typeId });
    binding.enabled = true;
    expect(validateRecordModel(model).issues).not.toContainEqual({ code: "capability_requires_type", typeId });
    binding.enabled = false;
    type.archived = false;
    model.capabilities.push({ ...binding, id: companyId });
    expect(validateRecordModel(model).issues).toContainEqual({ code: "duplicate_channels_capability", typeId });
  });

  it("allows explicit conversation paths on ordinary types and confines channel options to Channels", () => {
    const model = createCrmPreset(companyId);
    const typeId = presetId(companyId, "deal");
    model.activityPaths.push({
      id: operationId,
      typeId,
      label: "Deal conversations",
      path: [],
      includeMessages: true,
      includeAudit: true,
      archived: false,
    });
    expect(recordChannelsEnabled(model, typeId)).toBe(false);
    expect(validateRecordModel(model).issues).toEqual([]);
    const avatar = model.capabilities.find((binding) => binding.kind === "avatar");
    if (!avatar) throw new Error("Missing avatar preset");
    avatar.providerAvatar = true;
    expect(validateRecordModel(model).issues).toContainEqual({
      code: "invalid_capability_options",
      typeId: avatar.typeId,
    });
  });
});

describe("indexed staging of shared channel identities", () => {
  it("reuses aliases through indexed lookups while staged links remain separate from live associations", async () => {
    const keys = new Map<string, RecordIdentity>();
    const associations = new Map<string, unknown>();
    let lookups = 0;
    const base = {
      getIdentityChannelsCompanyWide: () => Promise.resolve([]),
      getStagedIdentityChannelsCompanyWide: (
        _operationId: string,
        requested: Array<{ channelClass: string; value: string }>,
      ) => {
        lookups++;
        return Promise.resolve([
          ...new Map(
            requested.flatMap((key) => {
              const identity = keys.get(`${key.channelClass}:${key.value}`);
              return identity ? [[identity.id, identity] as const] : [];
            }),
          ).values(),
        ]);
      },
      stageIdentityChannelsCompanyWide: (_operationId: string, identities: RecordIdentity[]) => {
        for (const identity of identities)
          for (const value of identityKeys(identity)) keys.set(`${identity.channelClass}:${value}`, identity);
        return Promise.resolve();
      },
      stageRow: (_operationId: string, kind: string, key: string, payload: unknown) => {
        associations.set(`${kind}:${key}`, payload);
        return Promise.resolve();
      },
      getStageRow: (_operationId: string, kind: string, key: string) =>
        Promise.resolve(associations.get(`${kind}:${key}`)),
      getIdentitiesCompanyWide: () => Promise.resolve([]),
    } as unknown as RecordRepo;
    const staged = createRecordStagingRepo(base, operationId, companyId);
    const first = { typeId: companyId, recordId: operationId };
    const second = { typeId: operationId, recordId: companyId };
    await staged.setIdentities(first, [
      { provider: "linkedin", value: "alice", messagingId: "urn:alice", displayName: "Alice" },
    ]);
    await staged.setIdentities(second, [{ provider: "linkedin", value: "urn:alice", displayName: "Overwrite" }]);
    const identity = (await staged.getIdentitiesCompanyWide(first))[0];
    expect((await staged.getIdentitiesCompanyWide(second))[0]).toEqual(identity);
    expect(identity.displayName).toBe("Alice");
    expect(keys.size).toBe(2);
    expect(lookups).toBe(2);
    expect(await base.getIdentitiesCompanyWide(first)).toEqual([]);
    await staged.setIdentities(first, []);
    expect(await staged.getIdentitiesCompanyWide(first)).toEqual([]);
    expect((await staged.getIdentitiesCompanyWide(second))[0]).toEqual(identity);
  });
});
