import { describe, expect, it } from "vitest";
import { createCrmPreset, presetId } from "../crm-preset";
import type { RecordField } from "../record-model.schema";
import { validateRecordModel } from "../record-model-validation";
import {
  recordChannelsEnabled,
  recordChannelsField,
  recordChannelsTypeIds,
  recordProviderAvatarEnabled,
} from "../record-channels";
import { recordColumns } from "../record-columns";
import { recordFilterOperators } from "../record-filter";
import { isRecordFieldWritable } from "../record-input-value";
import { recordInvariant } from "../record-invariant";
import { invalidRecordQueryPart } from "../record-query-validation";
import { RecordQuerySchema } from "../record-query.schema";
import { createRecordStagingRepo } from "../record-staging.repository";
import { identityKeys } from "../record-identity";
import type { RecordIdentity } from "../record-identity.schema";
import type { RecordRepo } from "../record.repo";

const companyId = "73000000-0000-4000-8000-000000000001";
const operationId = "73000000-0000-4000-8000-000000000002";

function channelsField(typeId: string, id = operationId): RecordField {
  return {
    id,
    typeId,
    label: "Channels",
    valueType: "channels",
    behavior: { kind: "input" },
    required: false,
    archived: false,
    publishedSummary: false,
    options: [],
    position: 99,
  };
}

describe("Channels field type", () => {
  it("starts Contacts with a Channels field that keeps the former capability id and appears as a column", () => {
    const model = createCrmPreset(companyId);
    const contactId = presetId(companyId, "contact");
    const field = recordChannelsField(model, contactId);
    expect(field).toMatchObject({
      id: presetId(companyId, "capability.identity"),
      valueType: "channels",
      format: { onClick: "open", providerAvatar: true },
    });
    expect(model.capabilities.map((binding) => binding.kind)).not.toContain("channels");
    expect(model.types.find((type) => type.id === contactId)?.defaults.columns).toContain(field?.id);
    expect(recordColumns(contactId, model).find((column) => column.id === field?.id)).toMatchObject({
      kind: "field",
      sortable: false,
    });
    expect(recordProviderAvatarEnabled(model, contactId)).toBe(true);
    expect(validateRecordModel(model).issues).toEqual([]);
  });

  it("enables any list, disables matching while deleted and allows one Channels field per list", () => {
    const model = createCrmPreset(companyId);
    const typeId = presetId(companyId, "organization");
    const field = channelsField(typeId);
    model.fields.push(field);
    expect(recordChannelsEnabled(model, typeId)).toBe(true);
    expect(recordChannelsTypeIds(model)).toContain(typeId);
    expect(validateRecordModel(model).issues).toEqual([]);
    field.archived = true;
    expect(recordChannelsEnabled(model, typeId)).toBe(false);
    expect(recordChannelsTypeIds(model)).not.toContain(typeId);
    expect(validateRecordModel(model).issues).toEqual([]);
    model.fields.push(channelsField(typeId, companyId));
    expect(validateRecordModel(model).issues).toContainEqual(
      expect.objectContaining({ code: "duplicate_channels_field", typeId }),
    );
  });

  it("keeps Channels an input field without values, calculations or other field options", () => {
    const typeId = presetId(companyId, "deal");
    for (const change of [
      { required: true },
      { multiple: true },
      { behavior: { kind: "input" as const, defaultValue: { kind: "text" as const, value: "a@b.c" } } },
      {
        options: [{ id: "a", label: "A", color: null, attributes: [] }],
      },
    ]) {
      const model = createCrmPreset(companyId);
      model.fields.push({ ...channelsField(typeId), ...change });
      expect(validateRecordModel(model).issues).toContainEqual({
        code: "invalid_channels_field",
        fieldId: operationId,
      });
    }
    const model = createCrmPreset(companyId);
    model.fields.push(channelsField(typeId));
    const formula = model.fields.find((field) => field.id === presetId(companyId, "deal.weightedValue"));
    if (!formula) throw new Error("Missing weighted value");
    formula.behavior = { kind: "formula", expression: { kind: "field", fieldId: operationId } };
    expect(validateRecordModel(model).issues).toContainEqual({ code: "channels_not_calculable", fieldId: formula.id });
    expect(recordFilterOperators({ valueType: "channels", multiple: false })).toEqual([]);
    const field = recordInvariant(model.fields.find((candidate) => candidate.id === operationId));
    expect(isRecordFieldWritable(field)).toBe(false);
    expect(
      invalidRecordQueryPart(
        RecordQuerySchema.parse({ typeId, sort: [{ fieldId: operationId, direction: "asc" }] }),
        model,
      ),
    ).toBe("sort");
  });

  it("confines the provider avatar option to Channels fields", () => {
    const model = createCrmPreset(companyId);
    const name = model.fields.find((field) => field.id === presetId(companyId, "deal.name"));
    if (!name) throw new Error("Missing deal name");
    name.format = { providerAvatar: true };
    expect(validateRecordModel(model).issues).toContainEqual({ code: "invalid_provider_avatar", fieldId: name.id });
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
