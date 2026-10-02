import type { RecordRepo } from "./record.repo";
import type { RecordAccessPolicy } from "./record-access";
import type { RecordIdentityInput } from "./record-identity.schema";
import type { RecordIdentityReference } from "./record-identity-reference.schema";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { channelClass } from "@/ee/messaging/provider";
import { identityLookupValue } from "@/ee/messaging/identity-lookup";
import { recordKey } from "./record-calculation.service";
import type { RecordSearchRow } from "./record-search-query";
import type { RecordModel } from "./record-model.schema";

export type IdentityLookup = Pick<RecordIdentityInput, "provider" | "value">;
export type IdentityMatch = IdentityLookup & {
  records: RecordIdentityReference[];
};

export function identityReference(
  row: RecordSearchRow,
  model: RecordModel,
  canEdit = false,
  identityId?: string,
): RecordIdentityReference {
  const type = model.types.find((type) => type.id === row.typeId);
  return {
    ref: { typeId: row.typeId, recordId: row.recordId },
    ...(identityId ? { identityId } : {}),
    typeLabel: type?.label ?? "",
    typePluralLabel: type?.pluralLabel ?? "",
    title: row.state === "value" && row.title ? row.title : (type?.label ?? ""),
    avatarUrl: row.pictureUrl,
    canEdit: canEdit && !row.protectedKind,
  };
}

export class RecordIdentityReader {
  constructor(
    private records: RecordRepo,
    private policy: RecordAccessPolicy,
  ) {}

  async resolve(identifiers: IdentityLookup[], typeIds?: string[]): Promise<IdentityMatch[]> {
    if (!identifiers.length) return [];
    return runInTransaction(
      async () => {
        const [model, policy] = await Promise.all([this.records.getModel(), this.policy.load()]);
        if (!policy.actor) {
          return identifiers.map((identifier) => ({
            ...identifier,
            records: [],
          }));
        }
        const bound = new Set(
          model.capabilities
            .filter(
              (binding) =>
                binding.kind === "channels" &&
                binding.enabled !== false &&
                (!typeIds || typeIds.includes(binding.typeId)) &&
                model.types.some((type) => type.id === binding.typeId && !type.archived),
            )
            .map((binding) => binding.typeId),
        );
        const matches: IdentityMatch[] = [];
        for (let offset = 0; offset < identifiers.length; offset += 500) {
          const batch = identifiers.slice(offset, offset + 500);
          const keys = batch.map((input) => ({
            channelClass: channelClass(input.provider),
            value: identityLookupValue(input.provider, input.value) ?? "",
          }));
          const owners = (await this.records.getIdentityOwnersCompanyWide(keys)).filter((owner) =>
            bound.has(owner.ref.typeId),
          );
          const refs = [...new Map(owners.map((owner) => [recordKey(owner.ref), owner.ref])).values()];
          const readable = new Map<string, RecordSearchRow>();
          for (let index = 0; index < refs.length; index += 100) {
            const rows = await this.records.searchRecords(
              { refs: refs.slice(index, index + 100) },
              model,
              policy.access(model.types.filter((type) => !type.archived).map((type) => type.id)),
            );
            for (const row of rows) readable.set(recordKey(row), row);
          }
          const byKey = new Map<string, RecordIdentityReference[]>();
          for (const owner of owners) {
            const row = readable.get(recordKey(owner.ref));
            if (!row) continue;
            const key = JSON.stringify([owner.channelClass, owner.value]);
            const records = byKey.get(key) ?? [];
            if (!records.some((record) => recordKey(record.ref) === recordKey(owner.ref)))
              records.push(identityReference(row, model, policy.allowed(row.typeId, "update"), owner.identityId));
            byKey.set(key, records);
          }
          batch.forEach((identifier, index) => {
            const key = keys[index];
            const records = [...(byKey.get(JSON.stringify([key.channelClass, key.value])) ?? [])].sort((left, right) =>
              recordKey(left.ref) < recordKey(right.ref) ? -1 : recordKey(left.ref) > recordKey(right.ref) ? 1 : 0,
            );
            matches.push({ ...identifier, records });
          });
        }
        return matches;
      },
      { readOnly: true },
    );
  }
}
